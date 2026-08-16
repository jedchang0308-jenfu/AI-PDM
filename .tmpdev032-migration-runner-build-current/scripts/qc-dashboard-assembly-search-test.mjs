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
  form.set("material", "ASM2-QC-Material");
  form.set("surface_finish", "ASM2-QC-Finish");
  form.set("document_type", input.documentType ?? "Drawing");
  form.set("change_description", "QC seed for assembly search");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("assembly search placeholder")], input.fileName, { type: "application/octet-stream" }));

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

async function search(cookie, query) {
  const response = await fetch(`${apiBaseUrl}/api/search?${query}`, { headers: { cookie: cookie.header } });
  const body = await response.json().catch(() => ({}));
  record(`search ${query}`, response.ok, `HTTP ${response.status}`);
  return body.submissions ?? [];
}

async function whereUsed(cookie, partNumber) {
  const response = await fetch(`${apiBaseUrl}/api/items/${encodeURIComponent(partNumber)}/where-used`, { headers: { cookie: cookie.header } });
  const body = await response.json().catch(() => ({}));
  record(`where-used ${partNumber}`, response.ok, `HTTP ${response.status}`);
  return body.whereUsed ?? [];
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
  const oldPartNumber = `P-ASM2-OLD-${unique}`;
  const pendingPartNumber = `P-ASM2-PENDING-${unique}`;
  const missingPartNumber = `P-ASM2-MISSING-${unique}`;
  const oldDrawing = `ASM2-OLD-${unique}`;
  const pendingDrawing = `ASM2-PENDING-${unique}`;

  const oldChildA = await createSubmission(engineerCookie, {
    drawingNumber: oldDrawing,
    partNumber: oldPartNumber,
    partName: "Assembly search old child",
    revision: "A",
    fileName: `${oldDrawing}-A.sldprt`
  });
  markReleased(oldChildA.submissionId, 1);

  const oldChildB = await createSubmission(engineerCookie, {
    drawingNumber: oldDrawing,
    partNumber: oldPartNumber,
    partName: "Assembly search old child",
    revision: "B",
    fileName: `${oldDrawing}-B.sldprt`
  });
  markReleased(oldChildB.submissionId, 2);

  await createSubmission(engineerCookie, {
    drawingNumber: pendingDrawing,
    partNumber: pendingPartNumber,
    partName: "Assembly search pending child",
    revision: "A",
    fileName: `${pendingDrawing}.sldprt`
  });

  const parentFileName = `ASM2-PARENT-${unique}.sldasm`;
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `ASM2-PARENT-${unique}`,
    partNumber: `P-ASM2-PARENT-${unique}`,
    partName: "Assembly search parent",
    revision: "A",
    documentType: "Assembly",
    fileName: parentFileName,
    references: [
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${oldPartNumber}.sldprt`,
        referencedPartNumber: oldPartNumber,
        referencedDrawingNumber: oldDrawing,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 2,
        extractionMethod: "qc_assembly_search",
        confidence: "high"
      },
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${pendingPartNumber}.sldprt`,
        referencedPartNumber: pendingPartNumber,
        referencedDrawingNumber: pendingDrawing,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 1,
        extractionMethod: "qc_assembly_search",
        confidence: "high"
      },
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${missingPartNumber}.sldprt`,
        referencedPartNumber: missingPartNumber,
        referencedDrawingNumber: `ASM2-MISSING-${unique}`,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 3,
        extractionMethod: "qc_assembly_search",
        confidence: "high"
      }
    ]
  });

  const childDrawingSearch = await search(managerCookie, `childDrawingNumber=${encodeURIComponent(oldDrawing)}`);
  record("ASM2-001 child drawing search finds parent", childDrawingSearch.some((row) => row.id === parent.submissionId));

  const childPartSearch = await search(managerCookie, `childPartNumber=${encodeURIComponent(oldPartNumber)}`);
  record("ASM2-002 child part search still finds parent", childPartSearch.some((row) => row.id === parent.submissionId));

  const unreleasedSearch = await search(managerCookie, "bomIssue=unreleased");
  record("ASM2-003 unreleased or missing child filter finds parent", unreleasedSearch.some((row) => row.id === parent.submissionId));

  const outdatedSearch = await search(managerCookie, "bomIssue=outdated");
  record("ASM2-004 outdated child filter finds parent", outdatedSearch.some((row) => row.id === parent.submissionId));

  const whereUsedRows = await whereUsed(managerCookie, oldPartNumber);
  const affected = whereUsedRows.find((row) => row.parent_submission_id === parent.submissionId);
  record("ASM2-005 where-used lists affected parent", Boolean(affected));
  record("ASM2-006 where-used marks latest released child revision", affected?.child_latest_released_revision === "B");
  record("ASM2-007 where-used marks parent as affected by old child revision", Number(affected?.child_is_outdated) === 1);

  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedPage(browser, managerCookie);
    await page.locator(".finder-filter-menu summary").click();
    await page.locator(".finder-filter-grid input").nth(8).fill(oldDrawing);
    await page.locator("tbody tr", { hasText: parent.drawingNumber }).first().waitFor({ timeout: 15000 });
    record("ASM2-008 Dashboard child drawing filter shows parent", await page.locator("tbody tr", { hasText: parent.drawingNumber }).count().then((count) => count > 0));

    await page.locator(".finder-filter-grid input").nth(8).fill("");
    await page.locator(".finder-filter-grid select").selectOption("outdated");
    await page.locator("tbody tr", { hasText: parent.drawingNumber }).first().waitFor({ timeout: 15000 });
    record("ASM2-009 Dashboard outdated filter shows parent", await page.locator("tbody tr", { hasText: parent.drawingNumber }).count().then((count) => count > 0));

    await page.locator("tbody tr", { hasText: parent.drawingNumber }).first().click();
    await page.getByText(oldPartNumber).first().waitFor({ timeout: 15000 });
    await page.locator(".bom-child-link", { hasText: oldPartNumber }).click();
    await page.locator(".where-used-item", { hasText: parent.drawingNumber }).first().waitFor({ timeout: 15000 });
    await page.getByText("受影響").first().waitFor({ timeout: 15000 });
    record("ASM2-010 Dashboard where-used shows affected label", await page.getByText("受影響").count().then((count) => count > 0));
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
