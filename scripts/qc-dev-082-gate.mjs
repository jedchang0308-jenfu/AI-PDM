import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceRoot = path.join(root, "output", "qa", "dev-082-browser-pdf-ocr");
const recognitionLayoutRoot = path.join(root, "output", "qa", "dev-079-recognition-layout");
const stamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const runDir = path.join(evidenceRoot, `gate-${stamp}-local-isolated`);
const requiredFields = ["drawing_number", "revision", "part_number", "title", "material", "scale", "drawn_by"];

function latestReport(prefix) {
  const directory = fs.readdirSync(evidenceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix) && fs.existsSync(path.join(evidenceRoot, entry.name, "report.json")))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  assert.ok(directory, `missing ${prefix} evidence`);
  const reportPath = path.join(evidenceRoot, directory, "report.json");
  assert.ok(fs.existsSync(reportPath), `missing ${prefix} report.json`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.result, "PASS", `${directory} is not PASS`);
  const completedAt = Date.parse(report.completedAt ?? "");
  assert.ok(Number.isFinite(completedAt) && Date.now() - completedAt <= 6 * 60 * 60 * 1_000, `${directory} is stale completion evidence`);
  return { directory, report, reportPath };
}

function latestRecognitionLayoutReport() {
  const directory = fs.readdirSync(recognitionLayoutRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith("-browser") && fs.existsSync(path.join(recognitionLayoutRoot, entry.name, "browser-verification.json")))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  assert.ok(directory, "missing DEV-079 recognition layout evidence");
  const reportPath = path.join(recognitionLayoutRoot, directory, "browser-verification.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.status, "PASS", `${directory} is not PASS`);
  assert.ok(Array.isArray(report.results) && report.results.length === 3, "DEV-079 recognition layout needs three viewport results");
  assert.ok(report.results.every((item) => item.passed), `${directory} contains a failing viewport`);
  return { directory, report, reportPath };
}

const evidence = {
  contract: latestReport("contract-"),
  repository: latestReport("repository-"),
  browser: latestReport("browser-"),
  regression: latestReport("regression-"),
  recognitionLayout: latestRecognitionLayoutReport()
};
const browser = evidence.browser.report;
assert.deepEqual(browser.network.thirdPartyOrigins, []);
assert.deepEqual(browser.network.consoleErrors, []);
assert.deepEqual(browser.network.unexpectedResponses, []);
assert.equal(browser.instrumentation.liveCanvasPixels, 0);
assert.equal(browser.instrumentation.activeWorkers, 0);
assert.ok(browser.instrumentation.maxCanvasPixels <= 12_000_000);
assert.equal(browser.contentGetEvidence.status, 200);
assert.equal(browser.contentGetEvidence.rangeStatus, 416);
assert.ok([401, 403].includes(browser.contentGetEvidence.unauthorizedStatus));
const textPdf = browser.sources.find((source) => source.fixture === "text");
const scanPdf = browser.sources.find((source) => source.fixture === "scan");
const mixedPdf = browser.sources.find((source) => source.fixture === "mixed");
const pageLimitPdf = browser.sources.find((source) => source.fixture === "page_limit");
const corruptPdf = browser.sources.find((source) => source.fixture === "corrupt");
const encryptedPdf = browser.sources.find((source) => source.fixture === "encrypted");
assert.ok(textPdf && scanPdf && mixedPdf && pageLimitPdf && corruptPdf && encryptedPdf);
assert.deepEqual(Object.keys(textPdf.requiredOutcomes), requiredFields);
assert.ok(Object.values(textPdf.requiredOutcomes).every((value) => value === "found"));
assert.equal(textPdf.contentGetCount, 1);
assert.equal(textPdf.completionPostCount, 1);
assert.equal(textPdf.ocrCanvasCountExpected, 0);
assert.equal(scanPdf.ocrCanvasCountExpected, 1);
assert.equal(mixedPdf.ocrCanvasCountExpected, 1);
assert.equal(pageLimitPdf.ocrCanvasCountExpected, 20);
assert.ok(pageLimitPdf.diagnostics.includes("pdf_ocr_page_limit_reached"));
assert.ok(corruptPdf.diagnostics.includes("pdf_source_invalid"));
assert.ok(encryptedPdf.diagnostics.includes("pdf_encrypted_or_password_required"));
assert.deepEqual(browser.viewports.map((item) => item.width), [1440, 1024, 390]);
for (const viewport of browser.viewports) {
  assert.equal(viewport.horizontalOverflow, 0);
  assert.equal(viewport.requiredOutcomeTiles, browser.sources.length * 7);
  assert.equal(viewport.visibleHttpErrors, false);
  assert.deepEqual(viewport.visibleTechnicalLeaks, []);
  assert.equal(viewport.pdfRecoveryActions.length, 1);
  assert.equal(viewport.footerCount, 1);
  assert.equal(viewport.footerRerunActions, 0);
  assert.equal(viewport.formalizeDisabled, true);
  assert.ok(viewport.finalContentClearance >= 0);
  assert.ok(fs.existsSync(path.join(path.dirname(evidence.browser.reportPath), viewport.screenshot)), `missing ${viewport.name} screenshot`);
}

for (const viewport of evidence.recognitionLayout.report.results) {
  const pdfEvidence = viewport.evidencePreview?.pdfEvidence;
  assert.ok(pdfEvidence?.magnifierResolutionMode === "pdf_high_res_crop");
  assert.ok(pdfEvidence?.magnifierCoverageRatio >= 1);
  assert.ok(pdfEvidence?.magnifierBackingScale >= 2.5 && pdfEvidence?.magnifierBackingScale <= 3);
  assert.ok(pdfEvidence?.magnifierRenderElapsedMs <= 150);
  assert.equal(pdfEvidence?.magnifierPseudoHandleDisplay, "none");
  assert.ok(pdfEvidence?.materialEvidenceText?.includes("不鏽鋼SUS304"));
  assert.ok(fs.existsSync(path.resolve(root, viewport.evidenceScreenshot)), `missing ${viewport.viewport.name} recognition screenshot`);
}

const matrix = {};
for (const [evidenceKind, item] of Object.entries(evidence)) {
  for (const [id, result] of Object.entries(item.report.cases ?? {})) {
    if (result?.result !== "PASS") continue;
    const entries = matrix[id] ?? [];
    entries.push({ evidenceKind, directory: item.directory, evidence: result.evidence });
    matrix[id] = entries;
  }
}
for (let index = 1; index <= 44; index += 1) {
  const id = `OCR-082-${String(index).padStart(3, "0")}`;
  assert.ok(matrix[id]?.length > 0, `missing executable PASS evidence for ${id}`);
}

const qaPath = path.join(root, ".ai-doc", "qa", "qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md");
const qa = fs.readFileSync(qaPath, "utf8");
for (let index = 1; index <= 44; index += 1) {
  const id = `OCR-082-${String(index).padStart(3, "0")}`;
  assert.ok(qa.includes(id), `QA matrix is missing ${id}`);
}
const qcPath = path.join(root, ".ai-doc", "qc", "qc-dev-082-browser-pdf-ocr-2026-08-20.md");
assert.ok(fs.existsSync(qcPath), "missing DEV-082 QC report");

const report = {
  dev: "DEV-082",
  result: "PASS",
  matrixCases: 44,
  evidence: Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, value.directory])),
  matrix,
  requiredFields,
  browserSummary: {
    browserVersion: browser.browserVersion,
    fixtureCount: browser.sources.length,
    maxCanvasPixels: browser.instrumentation.maxCanvasPixels,
    canvasCount: browser.instrumentation.canvasCount,
    textPdfRequests: { get: textPdf.contentGetCount, post: textPdf.completionPostCount },
    scanPdfRequests: { get: scanPdf.contentGetCount, post: scanPdf.completionPostCount },
    thirdPartyOrigins: browser.network.thirdPartyOrigins,
    consoleErrors: browser.network.consoleErrors,
    unexpectedResponses: browser.network.unexpectedResponses,
    viewports: browser.viewports.map(({ name, width, height, horizontalOverflow, requiredOutcomeTiles }) => ({ name, width, height, horizontalOverflow, requiredOutcomeTiles }))
  },
  completedAt: new Date().toISOString()
};
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(runDir, "report.md"), `# DEV-082 completion gate\n\n- Result: PASS\n- Executable matrix: OCR-082-001..044\n- Contract/repository/browser/regression reports: fresh and PASS\n- Synthetic browser fixtures: ${browser.sources.length}\n- Third-party OCR document origins: 0\n- Browser console errors: 0\n`, "utf8");
console.log(JSON.stringify({ ...report, reportDir: runDir }, null, 2));
