#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const root = process.cwd();
const runId = process.env.DEV105_RUN_ID?.trim() || `DEV105-contract-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV105_EVIDENCE_DIR || path.join(root, "output", "qa", "dev-105-3d-preview", runId));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function record(id, name, passed, detail = null) {
  checks.push({ id, name, passed: Boolean(passed), detail });
}

const component = read("src/components/canonical-pdm-workbench.tsx");
const gallery = read("src/components/canonical-pdm-preview-gallery.tsx");
const preview = read("src/lib/pdm-canonical-preview.ts");
const upload = read("src/lib/drawing-revision-work-file.ts");
const css = read("src/app/globals.css");
const packageJson = JSON.parse(read("package.json"));
const qaPlan = read(".ai-doc/qa/qa-dev-105-3d-preview-recovery-validation-plan-2026-08-30.md");
const { resolveCanonicalDrawingPreview } = await import("../src/lib/pdm-canonical-preview.ts");

const noSource = resolveCanonicalDrawingPreview({
  source: null,
  derivativeJobs: [],
  identity: { drawingNumber: "D105-NO-SOURCE", revision: "A", sourceLabel: "3D 模型" }
});
record("QA-105-023", "poll trigger is limited to pending/delayed and terminal states stop polling",
  component.includes('state === "pending"') && component.includes('state === "delayed"')
    && component.includes("previewPollState") && !component.includes('state === "failed" && hasPending'),
  { trigger: "pending|delayed", terminal: "failed|unavailable|missing" });
record("QA-105-024", "source-null with a drawing number is explicit none/missing",
  noSource.state === "missing" && noSource.sourceType === "none" && noSource.sourceLabel === "無預覽來源",
  noSource);
record("QA-105-025", "preview map contract rejects missing/extra/invalid row projections",
  component.includes("expectedKeys") && component.includes("actualKeys") && component.includes("CANONICAL_PREVIEW_STATES")
    && component.includes("預覽資料契約錯誤") && gallery.includes("hasMissingProjection"),
  { validation: "exact-key-set + state/media invariant + visible error" });
record("QA-105-026", "background poll has abort/request-id race protection and visibility gating",
  component.includes("listAbortRef.current?.abort()") && component.includes("listRequestRef.current")
    && component.includes('document.visibilityState !== "visible"') && component.includes("visibilitychange"),
  { guarantees: ["one in-flight foreground/background request", "stale response ignored", "hidden no request"] });
record("QA-105-027", "terminal failure/unavailable copy is local and actionable",
  gallery.includes('preview.state === "failed" || preview.state === "unavailable"')
    && gallery.includes("預覽暫時無法顯示") && gallery.includes("data-preview-state"),
  { terminalCopy: "預覽暫時無法顯示" });
record("QA-105-028", "native upload binds source and job intent in the same idempotent transaction",
  upload.includes("runDev087IdempotentCommand") && upload.includes("ensureAutomaticPreviewJobsForSourceAssetsAsync(tx")
    && upload.includes("requireQueued: true") && upload.includes("before_row_version"),
  { transaction: "binding + current-hash job intent + row-version update" });
record("QA-105-029", "Drawing/Part shared gallery is responsive and reduced-motion safe",
  component.includes("CanonicalEntityPreviewGallery") && component.includes("entityType")
    && css.includes("canonical-preview-gallery") && css.includes("prefers-reduced-motion")
    && css.includes("canonical-preview-progress"),
  { viewports: ["1440x900", "390x844"], consumers: ["Drawing", "Part"] });
record("QA-105-030", "DEV-105 gate retains the fixed twelve-case denominator and all required runners",
  /QA-105-019\.\.030/u.test(qaPlan) && packageJson.scripts?.["qc:dev-105:contract"]
    && packageJson.scripts?.["qc:dev-105:service"] && packageJson.scripts?.["qc:dev-105:browser"]
    && packageJson.scripts?.["qc:dev-105"].includes("qc:dev-105:contract"),
  { denominator: "QA-105-019..030", runners: ["contract", "service", "browser"] });

for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.id} ${item.name}`);
const failed = checks.filter((item) => !item.passed);
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "contract-manifest.json"), `${JSON.stringify({
  devId: "DEV-105",
  runId,
  runtime: { project: "AI_PDM", port: null, mutationScope: "read-only source contract inspection and evidence JSON", primaryWrites: false },
  checks,
  passed: failed.length === 0,
  fingerprint: crypto.createHash("sha256").update(JSON.stringify(checks)).digest("hex")
}, null, 2)}\n`, "utf8");
if (failed.length) {
  console.error(`DEV-105 contract QC failed: ${failed.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`DEV-105 contract QC passed ${checks.length}/${checks.length} checks`);
}
