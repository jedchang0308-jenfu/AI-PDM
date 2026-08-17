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
  return url.toString().replace(/\/$/, "");
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
  record(`API login ${email}`, response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  return { header: cookie, name, value: valueParts.join("=") };
}

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", input.revision);
  form.set("material", "ASM-QC-Material");
  form.set("surface_finish", "ASM-QC-Finish");
  form.set("document_type", input.documentType ?? "Drawing");
  form.set("change_description", "QC seed for assembly hierarchy");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from(input.fileBody ?? "assembly hierarchy placeholder")], input.fileName, { type: "application/octet-stream" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record(`${input.drawingNumber} submission created`, response.status === 201, `HTTP ${response.status}`);
  return { submissionId: body.submissionId, ...input };
}

function markReleased(submissionId, offsetMs = 0) {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  const db = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  const releasedAt = new Date(Date.now() + offsetMs).toISOString();
  db.prepare("UPDATE submissions SET status = 'Released', released_at = ?, release_error = NULL, updated_at = ? WHERE id = ?").run(
    releasedAt,
    releasedAt,
    submissionId
  );
  db.close();
}

async function getDetail(cookie, submissionId) {
  const response = await fetch(`${apiBaseUrl}/api/submissions/${submissionId}`, {
    headers: { cookie: cookie.header }
  });
  const body = await response.json().catch(() => ({}));
  record(`detail ${submissionId}`, response.ok, `HTTP ${response.status}`);
  return body.submission;
}

async function authenticatedPage(browser, cookie) {
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
  await page.goto(`${browserBaseUrl}/`);
  await page.locator(".primary-search input").waitFor({ timeout: 15000 });
  return { context, page };
}

async function run() {
  const engineerCookie = await apiLogin("engineer@example.com");
  const managerCookie = await apiLogin("manager@example.com");
  const oldPartNumber = `P-ASM-OLD-${unique}`;
  const pendingPartNumber = `P-ASM-PENDING-${unique}`;
  const missingPartNumber = `P-ASM-MISSING-${unique}`;

  const oldChildA = await createSubmission(engineerCookie, {
    drawingNumber: `ASM-OLD-${unique}`,
    partNumber: oldPartNumber,
    partName: "Assembly old child",
    revision: "A",
    fileName: `ASM-OLD-${unique}-A.sldprt`
  });
  markReleased(oldChildA.submissionId, 1);

  const oldChildB = await createSubmission(engineerCookie, {
    drawingNumber: `ASM-OLD-${unique}`,
    partNumber: oldPartNumber,
    partName: "Assembly old child",
    revision: "B",
    fileName: `ASM-OLD-${unique}-B.sldprt`
  });
  markReleased(oldChildB.submissionId, 2);

  const pendingChild = await createSubmission(engineerCookie, {
    drawingNumber: `ASM-PENDING-${unique}`,
    partNumber: pendingPartNumber,
    partName: "Assembly pending child",
    revision: "A",
    fileName: `ASM-PENDING-${unique}.sldprt`
  });

  const parentFileName = `ASM-PARENT-${unique}.sldasm`;
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `ASM-PARENT-${unique}`,
    partNumber: `P-ASM-PARENT-${unique}`,
    partName: "Assembly parent",
    revision: "A",
    documentType: "Assembly",
    fileName: parentFileName,
    references: [
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${oldPartNumber}.sldprt`,
        referencedPartNumber: oldPartNumber,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 2,
        extractionMethod: "qc_assembly_hierarchy",
        confidence: "high"
      },
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${pendingPartNumber}.sldprt`,
        referencedPartNumber: pendingPartNumber,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 1,
        extractionMethod: "qc_assembly_hierarchy",
        confidence: "high"
      },
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${missingPartNumber}.sldprt`,
        referencedPartNumber: missingPartNumber,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 3,
        extractionMethod: "qc_assembly_hierarchy",
        confidence: "high"
      }
    ]
  });

  const detail = await getDetail(managerCookie, parent.submissionId);
  const lines = detail?.bom?.lines ?? [];
  record("ASM-001 parent detail exposes three BOM children", lines.length === 3, `count ${lines.length}`);
  const oldLine = lines.find((line) => line.child_part_number === oldPartNumber);
  const pendingLine = lines.find((line) => line.child_part_number === pendingPartNumber);
  const missingLine = lines.find((line) => line.child_part_number === missingPartNumber);
  record("ASM-002 old child links to referenced revision submission", oldLine?.child_submission_id === oldChildA.submissionId);
  record("ASM-003 old child exposes latest released revision", oldLine?.child_latest_released_revision === "B");
  record("ASM-004 pending child exposes non-Released status", pendingLine?.child_status === "Pending");
  record("ASM-005 missing child is explicitly unresolved", Boolean(missingLine && !missingLine.child_submission_id));

  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedPage(browser, managerCookie);
    await page.locator(".primary-search input").fill(parent.drawingNumber);
    await page.locator("tr", { hasText: parent.drawingNumber }).first().waitFor({ timeout: 15000 });
    await page.locator("tr", { hasText: parent.drawingNumber }).first().click();
    await page.locator(".engineering-context > summary").click();
    await page.locator(".engineering-context .bom-list").waitFor({ timeout: 15000 });
    await page.getByText(oldPartNumber).first().waitFor({ timeout: 15000 });
    record("ASM-006 Dashboard shows old child part", await page.getByText(oldPartNumber).count().then((count) => count > 0));
    record("ASM-007 Dashboard marks missing child", await page.getByText("缺件").count().then((count) => count > 0));
    record("ASM-008 Dashboard marks outdated child", await page.getByText("舊版；最新版 B").count().then((count) => count > 0));
    await page.locator(".bom-child-link", { hasText: oldPartNumber }).click();
    const childDetailTitle = page.locator(".detail-title-stack", { hasText: oldChildA.drawingNumber });
    await childDetailTitle.waitFor({ timeout: 15000 });
    const childTitleText = (await childDetailTitle.textContent()) ?? "";
    record("ASM-009 clicking child opens child detail by business identity", childTitleText.includes("A"), childTitleText);
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
