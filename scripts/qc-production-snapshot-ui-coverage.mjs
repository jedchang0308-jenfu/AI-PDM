import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";

function option(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
function requireInput(value, code) {
  if (!value) throw new Error(code);
  return value;
}
function assertLocalBaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("LOCAL_BASE_URL_REQUIRED");
  return url.origin;
}
function flattenRows(body) {
  return body?.data?.groups?.flatMap((group) => group.rows) ?? [];
}
function countBy(rows, keyFor) {
  const result = {};
  for (const row of rows) {
    const key = keyFor(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}
function sameJson(left, right) {
  const entries = (value) => Object.entries(value).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

const sourcePath = path.resolve(requireInput(option("--source") || process.env.PDM_PRODUCTION_SNAPSHOT, "PRODUCTION_SNAPSHOT_SOURCE_REQUIRED"));
const coveragePath = path.resolve(requireInput(option("--coverage-report") || process.env.PDM_COVERAGE_REPORT, "COVERAGE_REPORT_REQUIRED"));
const baseUrl = assertLocalBaseUrl(option("--base-url") || process.env.PDM_LOCAL_BASE_URL || "http://localhost:3000");
const outputDir = path.resolve(option("--output-dir") || process.env.PDM_QC_OUTPUT_DIR || ".artifacts/AI_PDM/production-snapshot-local-simulation/ui");
const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
if (coverage.status !== "PASS") throw new Error("COVERAGE_REPORT_MUST_PASS_BEFORE_UI_QC");
const expectedPartCount = Number(coverage.expected?.partWorkbenchRows);
const expectedDrawingCount = Number(coverage.expected?.drawingWorkbenchRows);
if (!Number.isSafeInteger(expectedPartCount) || expectedPartCount < 0 || !Number.isSafeInteger(expectedDrawingCount) || expectedDrawingCount < 0) {
  throw new Error("COVERAGE_REPORT_COUNTS_INVALID");
}

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const partOnlyCandidate = source.prepare(`SELECT root_reservation.candidate_code AS root_code,
    part_reservation.candidate_code AS part_number
  FROM numbering_draft_workspaces workspace
  JOIN numbering_draft_parts part ON part.workspace_id = workspace.id AND part.company_id = workspace.company_id
  JOIN numbering_draft_roots root ON root.id = part.root_draft_id AND root.company_id = workspace.company_id
  JOIN number_candidate_reservations part_reservation ON part_reservation.id = part.candidate_reservation_id
  JOIN number_candidate_reservations root_reservation ON root_reservation.id = root.candidate_reservation_id
  LEFT JOIN numbering_draft_relations relation ON relation.part_draft_id = part.id AND relation.company_id = workspace.company_id
  WHERE workspace.lifecycle_status = 'active' AND relation.id IS NULL
  ORDER BY root_reservation.candidate_code, part_reservation.candidate_code LIMIT 1`).get() ?? null;
const bundleCandidate = source.prepare(`SELECT root_reservation.candidate_code AS root_code,
    part_reservation.candidate_code AS part_number,
    drawing_reservation.candidate_code AS drawing_number,
    relation.link_type
  FROM numbering_draft_workspaces workspace
  JOIN numbering_draft_relations relation ON relation.workspace_id = workspace.id AND relation.company_id = workspace.company_id
  JOIN numbering_draft_parts part ON part.id = relation.part_draft_id AND part.company_id = workspace.company_id
  JOIN numbering_draft_drawings drawing ON drawing.id = relation.drawing_draft_id AND drawing.company_id = workspace.company_id
  JOIN numbering_draft_roots root ON root.id = part.root_draft_id AND root.id = drawing.root_draft_id AND root.company_id = workspace.company_id
  JOIN number_candidate_reservations part_reservation ON part_reservation.id = part.candidate_reservation_id
  JOIN number_candidate_reservations drawing_reservation ON drawing_reservation.id = drawing.candidate_reservation_id
  JOIN number_candidate_reservations root_reservation ON root_reservation.id = root.candidate_reservation_id
  WHERE workspace.lifecycle_status = 'active'
  ORDER BY root_reservation.candidate_code, drawing_reservation.candidate_code, part_reservation.candidate_code LIMIT 1`).get() ?? null;
source.close();
fs.mkdirSync(outputDir, { recursive: true });
const configuredBrowserExecutable = option("--browser-executable") || process.env.PDM_PLAYWRIGHT_EXECUTABLE;
const browserExecutableCandidates = [
  configuredBrowserExecutable ? path.resolve(configuredBrowserExecutable) : null,
  chromium.executablePath(),
  process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : null,
  process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe") : null
].filter(Boolean);
const resolvedBrowserExecutable = browserExecutableCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;
const browserLaunchOptions = resolvedBrowserExecutable
  ? { headless: true, executablePath: resolvedBrowserExecutable }
  : { headless: true };

const results = [];
function check(id, pass, detail = null) {
  results.push({ id, status: pass ? "PASS" : "FAIL", detail });
}
async function fetchAllWorkbench(request, endpoint, limit = 50) {
  const pages = [];
  let cursor = null;
  for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const url = `${baseUrl}${endpoint}${separator}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await request.get(url);
    const body = await response.json().catch(() => null);
    pages.push({ status: response.status(), body });
    if (response.status() !== 200 || !body?.data?.nextCursor) break;
    cursor = body.data.nextCursor;
  }
  return { pages, rows: pages.flatMap((page) => flattenRows(page.body)), first: pages[0] };
}

const consoleErrors = [];
const failedRequests = [];
const ignoredNavigationAborts = [];
const failedResponses = [];
const browser = await chromium.launch(browserLaunchOptions);
let context;
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Admin" } });
  check("local-admin-login", login.status() === 200, { status: login.status() });

  const partsResult = await fetchAllWorkbench(context.request, "/api/parts/workbench");
  check("parts-api-first-page-http", partsResult.first?.status === 200, { status: partsResult.first?.status, body: partsResult.first?.status === 200 ? null : partsResult.first?.body });
  check("parts-api-total", partsResult.first?.body?.data?.totalGroups === expectedPartCount && partsResult.first?.body?.data?.totalRows === expectedPartCount, { expected: expectedPartCount, totalGroups: partsResult.first?.body?.data?.totalGroups, totalRows: partsResult.first?.body?.data?.totalRows });
  const expectedFirstPartPage = Math.min(50, expectedPartCount);
  check("parts-api-first-page-size", flattenRows(partsResult.first?.body).length === expectedFirstPartPage && Boolean(partsResult.first?.body?.data?.nextCursor) === (expectedPartCount > 50), { expectedRows: expectedFirstPartPage, rows: flattenRows(partsResult.first?.body).length, hasNextCursor: Boolean(partsResult.first?.body?.data?.nextCursor) });
  check("parts-api-full-pagination", partsResult.rows.length === expectedPartCount && new Set(partsResult.rows.map((row) => row.code)).size === expectedPartCount, { expected: expectedPartCount, rows: partsResult.rows.length, uniqueCodes: new Set(partsResult.rows.map((row) => row.code)).size, pages: partsResult.pages.length });
  const expectedPartLayers = coverage.expected?.partLayerBreakdown ?? {};
  const actualPartLayers = countBy(partsResult.rows, (row) => row.layer);
  check("parts-api-layer-counts", sameJson(actualPartLayers, expectedPartLayers), { expected: expectedPartLayers, actual: actualPartLayers });

  const partOnly = partOnlyCandidate ? partsResult.rows.find((row) => row.code === partOnlyCandidate.part_number) : null;
  check("part-only-candidate-visible", !partOnlyCandidate || (partOnly?.layer === "work" && partOnly?.handling === "owner"), { applicable: Boolean(partOnlyCandidate), candidate: partOnlyCandidate, row: partOnly ?? null });
  const bundle = bundleCandidate ? partsResult.rows.find((row) => row.code === bundleCandidate.part_number) : null;
  const bundleDetailResponse = bundle
    ? await context.request.get(`${baseUrl}/api/parts/workbench/${encodeURIComponent(bundle.rowKey)}`)
    : null;
  const bundleDetail = bundleDetailResponse ? await bundleDetailResponse.json() : null;
  const relationMatrix = bundleDetail?.data?.presentation?.relationMatrix;
  const expectedRelationType = bundleCandidate?.link_type === "primary_manufacturing" ? "manufacturing_basis" : bundleCandidate?.link_type;
  const matchingCell = bundleCandidate && relationMatrix?.cells?.some((cell) => cell.drawingNumber === bundleCandidate.drawing_number
    && cell.partNumber === bundleCandidate.part_number && cell.relationType === expectedRelationType);
  check("bundle-detail-relation", !bundleCandidate || (bundleDetailResponse?.status() === 200 && relationMatrix?.rootCode === bundleCandidate.root_code && matchingCell), { applicable: Boolean(bundleCandidate), candidate: bundleCandidate, expectedRelationType, status: bundleDetailResponse?.status(), relationMatrix });

  const drawingsResult = await fetchAllWorkbench(context.request, "/api/numbering/drawings/workbench");
  check("drawings-api-total", drawingsResult.first?.status === 200 && drawingsResult.first?.body?.data?.totalGroups === expectedDrawingCount && drawingsResult.first?.body?.data?.totalRows === expectedDrawingCount && drawingsResult.rows.length === expectedDrawingCount, { expected: expectedDrawingCount, status: drawingsResult.first?.status, totalGroups: drawingsResult.first?.body?.data?.totalGroups, totalRows: drawingsResult.first?.body?.data?.totalRows, rows: drawingsResult.rows.length, pages: drawingsResult.pages.length });
  const expectedDrawingLayers = Object.fromEntries((coverage.expected?.drawingLayerBreakdown ?? []).map((row) => [`${row.layer}|${row.revision}|${row.label}|${row.handling}`, row.count]));
  const actualDrawingLayers = countBy(drawingsResult.rows, (row) => `${row.layer}|${row.revision}|${row.layerLabel}|${row.handling}`);
  check("drawings-api-layer-revision-counts", sameJson(actualDrawingLayers, expectedDrawingLayers), { expected: expectedDrawingLayers, actual: actualDrawingLayers });

  if (partOnlyCandidate) {
    const response = await context.request.get(`${baseUrl}/api/numbering/search?query=${encodeURIComponent(partOnlyCandidate.root_code)}&limit=50`);
    const body = await response.json();
    const types = [...new Set((body.results ?? []).map((row) => row.entityType))].sort();
    check("numbering-search-part-only", response.status() === 200 && types.includes("part_number") && types.includes("part_root"), { candidate: partOnlyCandidate, status: response.status(), types });
  } else check("numbering-search-part-only", true, { applicable: false });
  if (bundleCandidate) {
    const response = await context.request.get(`${baseUrl}/api/numbering/search?query=${encodeURIComponent(bundleCandidate.root_code)}&limit=50`);
    const body = await response.json();
    const types = [...new Set((body.results ?? []).map((row) => row.entityType))].sort();
    check("numbering-search-drawing-bundle", response.status() === 200 && ["drawing_number", "part_number", "part_root"].every((type) => types.includes(type)), { candidate: bundleCandidate, status: response.status(), types });
  } else check("numbering-search-drawing-bundle", true, { applicable: false });

  const page = await context.newPage();
  let deliberateNavigation = false;
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => {
    const failure = { url: request.url(), method: request.method(), error: request.failure()?.errorText ?? "failed" };
    if (deliberateNavigation && failure.error.includes("ERR_ABORTED")) ignoredNavigationAborts.push(failure);
    else failedRequests.push(failure);
  });
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status(), method: response.request().method() }); });

  await page.goto(`${baseUrl}/parts`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator(".canonical-workbench-result-count").filter({ hasText: `${expectedPartCount} / ${expectedPartCount} 筆` }).waitFor({ state: "visible", timeout: 30_000 });
  const initialPartUiRows = await page.locator("[data-canonical-workbench-row='true']").count();
  check("parts-ui-first-page", initialPartUiRows >= 0 && initialPartUiRows <= expectedPartCount, { rowCount: initialPartUiRows, expected: expectedPartCount, countText: await page.locator(".canonical-workbench-result-count").innerText() });
  while (await page.locator("[data-canonical-workbench-row='true']").count() < expectedPartCount && await page.getByRole("button", { name: "載入更多", exact: true }).count() > 0) {
    const before = await page.locator("[data-canonical-workbench-row='true']").count();
    await page.getByRole("button", { name: "載入更多", exact: true }).click();
    await page.waitForFunction((previous) => document.querySelectorAll("[data-canonical-workbench-row='true']").length > previous, before, { timeout: 30_000 });
  }
  check("parts-ui-full-pagination", await page.locator("[data-canonical-workbench-row='true']").count() === expectedPartCount, { expected: expectedPartCount, rowCount: await page.locator("[data-canonical-workbench-row='true']").count() });
  if (partOnlyCandidate) {
    const row = page.locator("tr[data-canonical-workbench-row='true']", { has: page.getByRole("button", { name: partOnlyCandidate.part_number, exact: true }) });
    const rowText = await row.innerText().catch(() => "");
    check("parts-ui-part-only-semantics", await row.count() === 1 && rowText.includes("修改中") && rowText.includes("負責人處理"), { candidate: partOnlyCandidate, rowText });
  } else check("parts-ui-part-only-semantics", true, { applicable: false });
  if (bundleCandidate) {
    await page.getByRole("button", { name: bundleCandidate.part_number, exact: true }).click();
    await page.getByText(bundleCandidate.drawing_number, { exact: true }).last().waitFor({ state: "visible", timeout: 30_000 });
    check("parts-ui-bundle-relation-visible", await page.getByText(bundleCandidate.drawing_number, { exact: true }).last().isVisible(), { candidate: bundleCandidate });
  } else check("parts-ui-bundle-relation-visible", true, { applicable: false });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.screenshot({ path: path.join(outputDir, "parts-workbench.png"), fullPage: true });
  const partsBody = await page.locator("body").innerText();
  const partsAlerts = (await page.locator("[role='alert']:visible").allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  check("parts-ui-no-visible-error", !(partsBody.includes("清單載入失敗") || partsBody.includes("系統切換中")) && partsAlerts.length === 0, { alerts: partsAlerts });

  deliberateNavigation = true;
  await page.goto(`${baseUrl}/numbering/drawings`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  deliberateNavigation = false;
  await page.locator(".canonical-workbench-result-count").filter({ hasText: `${expectedDrawingCount} / ${expectedDrawingCount} 筆` }).waitFor({ state: "visible", timeout: 30_000 });
  const drawingUiRows = page.locator("[data-canonical-workbench-row='true']");
  check("drawings-ui-total", await drawingUiRows.count() === expectedDrawingCount, { expected: expectedDrawingCount, rowCount: await drawingUiRows.count() });
  const drawingLayerLabels = await drawingUiRows.locator(".canonical-layer").allInnerTexts();
  const expectedDrawingLabels = Object.fromEntries((coverage.expected?.drawingLayerBreakdown ?? []).map((row) => [row.label, row.count]));
  const actualDrawingLabels = countBy(drawingLayerLabels.map((label) => label.trim()), (label) => label);
  check("drawings-ui-layer-revision-counts", sameJson(actualDrawingLabels, expectedDrawingLabels), { expected: expectedDrawingLabels, actual: actualDrawingLabels });
  await page.screenshot({ path: path.join(outputDir, "drawings-workbench.png"), fullPage: true });
  const drawingsBody = await page.locator("body").innerText();
  const drawingAlerts = (await page.locator("[role='alert']:visible").allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  check("drawings-ui-no-visible-error", !(drawingsBody.includes("清單載入失敗") || drawingsBody.includes("系統切換中")) && drawingAlerts.length === 0, { alerts: drawingAlerts });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  check("browser-console-quiet", consoleErrors.length === 0, { consoleErrors });
  check("browser-request-failures-zero", failedRequests.length === 0, { failedRequests });
  check("browser-http-errors-zero", failedResponses.length === 0, { failedResponses });
} catch (error) {
  check("browser-runner-completed", false, { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null });
} finally {
  await context?.close().catch(() => {});
  await browser.close();
}

const report = {
  status: results.every((result) => result.status === "PASS") ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  baseUrl,
  sourcePath,
  coveragePath,
  expected: { parts: expectedPartCount, drawings: expectedDrawingCount, partOnlyCandidate, bundleCandidate },
  browserExecutable: resolvedBrowserExecutable,
  runtime: { project: "AI_PDM", port: Number(new URL(baseUrl).port || 80), ownership: "pre-existing local runtime; not started or stopped by this QC" },
  mutationLedger: ["POST /api/auth/local-quick-login → local session/user/audit only", "All business-data APIs read-only"],
  results,
  consoleErrors,
  failedRequests,
  ignoredNavigationAborts,
  failedResponses
};
const reportPath = path.join(outputDir, "report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: report.status, passed: results.filter((result) => result.status === "PASS").length, failed: results.filter((result) => result.status === "FAIL").map((result) => result.id), reportPath }, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
