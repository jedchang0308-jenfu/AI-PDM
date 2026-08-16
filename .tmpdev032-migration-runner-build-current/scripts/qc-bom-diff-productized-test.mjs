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
  record(`login ${email}`, response.ok, `HTTP ${response.status}`);
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
  form.set("material", "BOMDIFF-QC-Material");
  form.set("surface_finish", "BOMDIFF-QC-Finish");
  form.set("document_type", input.documentType ?? "Assembly");
  form.set("change_description", "QC seed for BOM diff productized");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("bom diff placeholder")], input.fileName, { type: "application/octet-stream" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record(`${input.drawingNumber} rev ${input.revision} created`, response.status === 201, `HTTP ${response.status}`);
  return { submissionId: body.submissionId, ...input };
}

function reference(sourceFilename, child, revision, quantity) {
  return {
    sourceFilename,
    sourceFileRole: "sldasm",
    referencedFilename: `${child}.sldprt`,
    referencedPartNumber: child,
    referencedDrawingNumber: `D-${child}`,
    referencedRevision: revision,
    referenceType: "assembly_component",
    quantity,
    extractionMethod: "qc_bom_diff_productized",
    confidence: "high"
  };
}

async function getJson(cookie, url) {
  const response = await fetch(`${apiBaseUrl}${url}`, { headers: { cookie: cookie.header } });
  const body = await response.json().catch(() => ({}));
  return { response, body };
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
  const drawingNumber = `BOMDIFF-PROD-${unique}`;
  const partNumber = `P-BOMDIFF-PROD-${unique}`;
  const baseFileName = `${drawingNumber}-A.sldasm`;
  const targetFileName = `${drawingNumber}-B.sldasm`;
  const childAdded = `P-BOMDIFF-ADD-${unique}`;
  const childRemoved = `P-BOMDIFF-REM-${unique}`;
  const childChanged = `P-BOMDIFF-CHG-${unique}`;
  const childUnchanged = `P-BOMDIFF-SAME-${unique}`;

  await createSubmission(engineerCookie, {
    drawingNumber,
    partNumber,
    partName: "BOM diff parent",
    revision: "A",
    fileName: baseFileName,
    references: [
      reference(baseFileName, childRemoved, "A", 2),
      reference(baseFileName, childChanged, "A", 4),
      reference(baseFileName, childUnchanged, "A", 1)
    ]
  });
  const target = await createSubmission(engineerCookie, {
    drawingNumber,
    partNumber,
    partName: "BOM diff parent",
    revision: "B",
    fileName: targetFileName,
    references: [
      reference(targetFileName, childAdded, "A", 5),
      reference(targetFileName, childChanged, "B", 6),
      reference(targetFileName, childUnchanged, "A", 1)
    ]
  });

  const diffResult = await getJson(managerCookie, `/api/submissions/${target.submissionId}/bom/diff`);
  record("BDIFF-001 diff API returns 200", diffResult.response.status === 200, `HTTP ${diffResult.response.status}`);
  const diff = diffResult.body.diff;
  record("BDIFF-002 diff counts added/removed/changed/unchanged", diff?.added_count === 1 && diff?.removed_count === 1 && diff?.changed_count === 1 && diff?.unchanged_count === 1);
  const changed = diff?.lines?.find((line) => line.child_part_number === childChanged);
  record("BDIFF-003 changed line exposes revision and quantity deltas", changed?.from_revision === "A" && changed?.to_revision === "B" && changed?.from_quantity === 4 && changed?.to_quantity === 6);

  const csvResponse = await fetch(`${apiBaseUrl}/api/submissions/${target.submissionId}/bom/diff?format=csv`, { headers: { cookie: managerCookie.header } });
  const csv = await csvResponse.text();
  record("BDIFF-004 CSV export returns Excel-readable CSV", csvResponse.ok && csvResponse.headers.get("content-type")?.includes("text/csv"), `HTTP ${csvResponse.status}`);
  record("BDIFF-005 CSV export contains diff fields", csv.includes("change_type") && csv.includes("quantity_changed") && csv.includes(childAdded) && csv.includes(childRemoved));

  const xlsResponse = await fetch(`${apiBaseUrl}/api/submissions/${target.submissionId}/bom/diff?format=xls`, { headers: { cookie: managerCookie.header } });
  const xls = await xlsResponse.text();
  record("BDIFF-006 Excel export returns SpreadsheetML", xlsResponse.ok && xlsResponse.headers.get("content-type")?.includes("application/vnd.ms-excel"), `HTTP ${xlsResponse.status}`);
  record("BDIFF-007 Excel export contains workbook and changed child", xls.includes("<Workbook") && xls.includes(childChanged));

  const noBom = await createSubmission(engineerCookie, {
    drawingNumber: `BOMDIFF-NONE-${unique}`,
    partNumber: `P-BOMDIFF-NONE-${unique}`,
    partName: "No BOM seed",
    revision: "A",
    documentType: "Drawing",
    fileName: `BOMDIFF-NONE-${unique}.pdf`,
    references: []
  });
  const noBomResult = await getJson(managerCookie, `/api/submissions/${noBom.submissionId}/bom/diff`);
  record("BDIFF-008 missing BOM returns explicit error", noBomResult.response.status === 409 && typeof noBomResult.body.error === "string", `HTTP ${noBomResult.response.status}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page } = await authenticatedPage(browser, managerCookie);
    await page.locator(".primary-search input").fill(drawingNumber);
    const targetRow = page.locator("tbody tr", { hasText: drawingNumber }).filter({ hasText: "B" }).first();
    await targetRow.waitFor({ timeout: 15000 });
    await targetRow.click();
    await page.getByText(childChanged).first().waitFor({ timeout: 15000 });
    await page.getByText("版次與數量變更").first().waitFor({ timeout: 15000 });
    record("BDIFF-009 Dashboard shows explicit diff detail", await page.getByText("版次與數量變更").count().then((count) => count > 0));
    record("BDIFF-010 Dashboard shows diff export links", await page.getByRole("link", { name: /Diff CSV/ }).count().then((count) => count === 1));
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
