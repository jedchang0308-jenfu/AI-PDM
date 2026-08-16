import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const browserBaseUrl = toBrowserBaseUrl(apiBaseUrl);
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-6);
const results = [];

function toBrowserBaseUrl(value) {
  const url = new URL(value);
  if (url.hostname === "127.0.0.1") url.hostname = "localhost";
  return url.toString().replace(/\/$/u, "");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function apiLogin(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`login ${email}`, response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  return { header: cookie, name, value: valueParts.join("=") };
}

function ocrMarkerPayload(partName, confidence = "low") {
  return [
    "%PDF-1.4",
    `AI_PDM_OCR: ${JSON.stringify({
      candidates: [
        {
          field: "part_name",
          value: partName,
          confidence,
          source: "ocr-zone-title-block",
          snippet: `Title block PART NAME ${partName}`
        },
        {
          field: "material",
          value: "SUS304",
          confidence: "medium",
          source: "ocr-zone-material",
          snippet: "MATERIAL: SUS304"
        }
      ]
    })}`,
    "%%EOF"
  ].join("\n");
}

async function detect(cookie, filename, body) {
  const form = new FormData();
  form.append("files", new File([Buffer.from(body)], filename, { type: "application/pdf" }));
  const response = await fetch(`${apiBaseUrl}/api/file-metadata/detect`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  return { response, body: await response.json().catch(() => ({})) };
}

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", "A");
  form.set("material", "QC-AIOCR-Material");
  form.set("surface_finish", "QC-AIOCR-Finish");
  form.set("document_type", "PDF");
  form.set("change_description", "QC seed for AI OCR read-only check");
  form.append("files", new File([Buffer.from("released baseline")], `${input.drawingNumber}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record(`${input.drawingNumber} submission created`, response.status === 201, `HTTP ${response.status}`);
  return body.submissionId;
}

function markReleased(submissionId) {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  const db = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  const releasedAt = new Date().toISOString();
  db.prepare("UPDATE submissions SET status = 'Released', released_at = ?, release_error = NULL, updated_at = ? WHERE id = ?").run(
    releasedAt,
    releasedAt,
    submissionId
  );
  db.close();
}

async function getSubmission(cookie, submissionId) {
  const response = await fetch(`${apiBaseUrl}/api/submissions/${submissionId}`, {
    headers: { cookie: cookie.header }
  });
  const body = await response.json().catch(() => ({}));
  record(`detail ${submissionId}`, response.ok, `HTTP ${response.status}`);
  return body.submission;
}

async function authenticatedUploadPage(browser, cookie) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  const page = await context.newPage();
  await page.goto(`${browserBaseUrl}/upload`);
  await page.locator('input[type="file"]').waitFor({ timeout: 15000 });
  return { context, page };
}

async function run() {
  const engineerCookie = await apiLogin("engineer@example.com");
  const candidatePartName = `OCR Candidate ${unique}`;

  const detection = await detect(engineerCookie, `AIOCR-${unique}.pdf`, ocrMarkerPayload(candidatePartName, "low"));
  record("AIOCR-001 detect route returns 200", detection.response.status === 200, `HTTP ${detection.response.status}`);
  const candidates = detection.body.candidates ?? [];
  const partNameCandidate = candidates.find((candidate) => candidate.field === "part_name" && candidate.value === candidatePartName);
  record("AIOCR-002 returns AI/OCR candidate without sidecar", Boolean(partNameCandidate), JSON.stringify(candidates));
  record("AIOCR-003 candidate includes confidence/source/snippet", Boolean(partNameCandidate?.confidence && partNameCandidate?.source && partNameCandidate?.snippet));
  record("AIOCR-004 candidate method is traceable", partNameCandidate?.method === "ai_ocr", partNameCandidate?.method ?? "");
  record("AIOCR-005 low confidence candidate is not auto metadata", detection.body.metadata?.part_name !== candidatePartName);

  const releasedId = await createSubmission(engineerCookie, {
    drawingNumber: `AIOCR-REL-${unique}`,
    partNumber: `P-AIOCR-REL-${unique}`,
    partName: "Released baseline"
  });
  markReleased(releasedId);
  const before = await getSubmission(engineerCookie, releasedId);
  await detect(engineerCookie, `AIOCR-REL-${unique}.pdf`, ocrMarkerPayload("Should Not Mutate Released", "high"));
  const after = await getSubmission(engineerCookie, releasedId);
  record("AIOCR-006 detect does not mutate Released status", before.status === "Released" && after.status === "Released");
  record("AIOCR-007 detect does not mutate approved metadata", after.part_name === before.part_name && after.part_number === before.part_number);

  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedUploadPage(browser, engineerCookie);
    await page.locator('input[type="file"]').setInputFiles({
      name: `AIOCR-UI-${unique}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from(ocrMarkerPayload(candidatePartName, "low"))
    });
    const metadataInputs = page.locator(".upload-fields input");
    await page.locator(".ocr-candidate", { hasText: candidatePartName }).waitFor({ timeout: 15000 });
    record("AIOCR-008 UI shows candidate list", (await page.locator(".ocr-candidate").count()) > 0);
    record("AIOCR-009 UI does not auto-fill low confidence part name", (await metadataInputs.nth(2).inputValue()) !== candidatePartName);
    await page.locator(".ocr-candidate", { hasText: candidatePartName }).click();
    record("AIOCR-010 UI applies candidate only after manual click", (await metadataInputs.nth(2).inputValue()) === candidatePartName);
    await context.close();
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

run().catch((error) => {
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ passed: results.length - failed, failed, results, error: error.message }, null, 2));
  process.exit(1);
});
