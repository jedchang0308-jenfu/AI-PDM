import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DRAWING_RECOGNITION_CATEGORIES,
  isExplicitNotApplicable,
  normalizeRecognitionKey,
  normalizeRecognitionValue
} from "../src/lib/drawing-recognition-contract.ts";
import {
  buildA0005FixtureResult,
  validateExternalAdapterResult
} from "../src/lib/drawing-recognition-adapters.ts";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const runDir = path.join(root, "output", "qa", "dev-068-drawing-recognition", `contract-${stamp}-local-isolated`);
fs.mkdirSync(runDir, { recursive: true });

assert.deepEqual(DRAWING_RECOGNITION_CATEGORIES, [
  "identity_relation",
  "part_attribute",
  "drawing_revision",
  "controlled_note",
  "engineering_evidence",
  "unclassified"
]);
assert.equal(normalizeRecognitionKey(" 表面處理 / Plating "), "表面處理_plating");
assert.equal(normalizeRecognitionValue("  SUS304\n 2B  "), "SUS304 2B");
for (const value of ["無", "N/A", "不適用", "not applicable"]) assert.equal(isExplicitNotApplicable(value), true);
for (const value of ["", "-", "未辨識", null]) assert.equal(isExplicitNotApplicable(value), false);

assert.throws(() => validateExternalAdapterResult("source-1", "external.v1", null), /OUTPUT_INVALID/u);
const external = validateExternalAdapterResult("source-1", "external.v1", {
  schemaVersion: "drawing-recognition-extractor.v1",
  adapter: "external.v1",
  status: "succeeded",
  observations: [
    {
      rawText: "未知欄位: X",
      rawValue: "X",
      category: "not-a-category",
      confidenceBand: "not-a-confidence",
      pageNumber: 1.25,
      geometry: [1, 2, 3],
      fieldKey: "custom coating spec",
      fieldLabel: "自訂鍍層規格"
    },
    { rawText: "" }
  ]
});
assert.equal(external.status, "succeeded");
assert.equal(external.observations?.length, 1);
assert.equal(external.observations?.[0].category, "unclassified");
assert.equal(external.observations?.[0].confidenceBand, "unknown");
assert.equal(external.observations?.[0].pageNumber, null);
assert.equal(external.observations?.[0].geometry, null);
assert.throws(() => validateExternalAdapterResult("source-1", "external.v1", { status: "succeeded", observations: [] }), /SCHEMA_VERSION_INVALID/u);

const fixtureJob = {
  sessionId: "session-qc",
  companyId: "company-jenfu",
  sourceSetFingerprint: "fingerprint",
  attemptCount: 1,
  targetContext: {
    drawingId: "drawing-a0005",
    drawingNumber: "A0005-M01",
    drawingRevisionId: "revision-a0005",
    revision: "A",
    parts: [{ id: "part-p01", partNumber: "A0005-P01", partName: "P01", recordStatus: "Draft" }]
  },
  sources: []
};
const wrongHashSource = {
  id: "source-wrong",
  fileAssetId: "asset-wrong",
  contentHash: "0".repeat(64),
  fileName: "A0005.SLDPRT",
  fileExt: ".SLDPRT",
  mimeType: "application/octet-stream",
  sourceRole: "three_d_cad"
};
assert.equal(buildA0005FixtureResult(fixtureJob, wrongHashSource), null, "fixture data must never match by filename alone");

const repositorySource = fs.readFileSync(path.join(root, "src", "lib", "repositories", "drawing-recognition-async-repository.ts"), "utf8");
assert.match(repositorySource, /missing_value_no_change/u);
assert.match(repositorySource, /variant_status === "explicit_not_applicable" && \(!fieldKey \|\| !ownerType \|\| !ownerId\)[\s\S]*explicit_not_applicable_no_target/u, "explicit N/A without a formal target must be excluded instead of blocking impact preview");
assert.doesNotMatch(repositorySource, /ALTER\s+TABLE[^;]*fieldKey/iu, "open candidate fields must use governed rows, not dynamic columns");
const workerSource = fs.readFileSync(path.join(root, "scripts", "run-drawing-recognition-worker.mjs"), "utf8");
assert.match(workerSource, /shell:\s*false/u, "external adapters must not invoke a shell");
assert.match(workerSource, /NODE_ENV\s*!==\s*["']production["']/u, "fixture mode must be blocked in production");
assert.match(workerSource, /PDM_DRAWING_RECOGNITION_ADAPTER_ATTEMPTS/u, "external adapter retries must be bounded and configurable");
assert.match(workerSource, /schemaVersion:\s*["']drawing-recognition-extractor\.v1["']/u, "external adapter stdin must be versioned");
assert.match(workerSource, /while \(true\)[\s\S]*catch \(error\)[\s\S]*retrying in/u, "continuous worker must retry after transient request failures");
assert.match(workerSource, /if \(once\) throw error/u, "one-shot worker must fail fast instead of hiding request failures");
const reviewSource = fs.readFileSync(path.join(root, "src", "components", "drawing-recognition-review.tsx"), "utf8");
assert.match(reviewSource, /impact\.blockers\.map/u, "impact preview must identify every blocking candidate");
assert.match(reviewSource, /target_mapping_required[\s\S]*缺少正式寫入目標/u, "target mapping blockers must have actionable human wording");
assert.match(reviewSource, /可先選「延後」或填理由後選「忽略」/u, "pre-submit sessions without a revision target must expose a recovery path");
assert.match(reviewSource, /explicit_not_applicable[\s\S]*return "不適用"/u, "explicit N/A decisions must remain visibly distinct from corrected values");

const report = {
  dev: "DEV-068",
  result: "PASS",
  categoryCount: DRAWING_RECOGNITION_CATEGORIES.length,
  explicitNotApplicableRequiresExplicitVocabulary: true,
  missingValueCannotBecomeRemoval: true,
  externalAdapterBoundaryValidated: true,
  filenameOnlyFixtureMatchBlocked: true,
  governedOpenFieldStorage: true,
  shellExecutionDisabled: true,
  blockerRecoveryVisible: true,
  explicitNotApplicableDecisionVisible: true,
  explicitNotApplicableWithoutTargetNonBlocking: true,
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(runDir, "report.md"), `# DEV-068 contract QC\n\n- Result: PASS\n- Categories: ${report.categoryCount}\n- Missing value cannot remove formal data: PASS\n- Explicit N/A vocabulary boundary: PASS\n- External adapter validation: PASS\n- Governed open field storage: PASS\n`, "utf8");
console.log(JSON.stringify({ ...report, reportDir: runDir }, null, 2));
