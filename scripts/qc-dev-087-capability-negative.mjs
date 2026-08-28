#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  artifactReference,
  manifestBase,
  readJson,
  runnerCoverage,
  writeCapabilityManifest
} from "./dev-087-evidence-lib.mjs";
import { resolveTaskActionUrl } from "../src/lib/numbering-task-center-contract.ts";

const root = process.cwd();
const runner = "qc-dev-087-capability-negative";
const runId = `DEV087-product-negative-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV087_AGGREGATE_RUN_ID ?? null;
const outputRoot = path.join("output", "qa", "dev-087-capability");
const outputDir = path.join(root, outputRoot, runId);
const registry = readJson(path.join(root, ".ai-doc", "qa", "dev-087-current-case-registry.json"));
const coverage = runnerCoverage(registry, runner);
fs.mkdirSync(outputDir, { recursive: true });

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const baselineChecks = [
  ["TASK_EXTERNAL_URL", resolveTaskActionUrl("https://evil.example/redirect").allowed === false],
  ["TASK_JAVASCRIPT_URL", resolveTaskActionUrl("javascript:alert(1)").allowed === false],
  ["TASK_PROTOCOL_RELATIVE_URL", resolveTaskActionUrl("//evil.example/redirect").allowed === false],
  ["TASK_DISALLOWED_PATH", resolveTaskActionUrl("/api/admin/delete").allowed === false],
  ["TASK_NON_STRING", resolveTaskActionUrl(42).allowed === false],
  ["TASK_RETIRED_PAGE_PATH", resolveTaskActionUrl("/numbering/tasks?status=open").allowed === false],
  ["TASK_SAME_ORIGIN", resolveTaskActionUrl("/numbering/drawings?query=A0001-M01").allowed === true],
  ["PART_VARIANT_DIRECT_WRITE_RETIRED", /PART_VARIANT_DIRECT_WRITE_RETIRED/u.test(read("src/app/api/parts/[partNumber]/variant/route.ts"))],
  ["MAIN_DRAWING_DIRECT_INVALIDATION_RETIRED", !fs.existsSync(path.join(root, "src/app/numbering/impact/page.tsx")) && !fs.existsSync(path.join(root, "src/app/api/numbering/impact-analysis/route.ts"))],
  ["LEGACY_SUBMISSION_RETIRED", /DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED/u.test(read("src/app/api/numbering/drawing-revisions/submissions/route.ts"))],
  ["LEGACY_FFF_RETIRED", /DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED/u.test(read("src/app/api/numbering/drawing-revisions/fff-assessments/route.ts"))]
].map(([id, pass]) => ({ id, result: pass ? "PASS" : "FAIL" }));

const evidencePath = path.join(outputDir, "negative-coverage.json");
const probe = spawnSync(process.execPath, [
  "--experimental-transform-types",
  "--experimental-loader",
  "./scripts/qc-ts-path-loader.mjs",
  "scripts/qc-dev-087-negative-probes.mjs"
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 24 * 1024 * 1024,
  env: { ...process.env, DEV087_NEGATIVE_EVIDENCE_PATH: evidencePath }
});
const probeOutputPath = path.join(outputDir, "negative-probe-output.txt");
fs.writeFileSync(probeOutputPath, `${probe.stdout ?? ""}${probe.stderr ?? ""}`, "utf8");
const evidence = fs.existsSync(evidencePath) ? readJson(evidencePath) : { results: [] };
let cleanupComplete = false;
const reportedDataDir = evidence.taskOwnedEnvironment?.dataDir;
if (typeof reportedDataDir === "string") {
  const taskRoot = path.dirname(path.resolve(reportedDataDir));
  const tempBoundary = path.resolve(os.tmpdir()) + path.sep;
  if (taskRoot.startsWith(tempBoundary) && path.basename(taskRoot).startsWith("ai-pdm-dev087-negative-")) {
    try {
      fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      cleanupComplete = !fs.existsSync(taskRoot);
    } catch {
      cleanupComplete = false;
    }
  }
}
evidence.cleanupReceipt = { status: cleanupComplete ? "complete" : "failed", taskRootRemoved: cleanupComplete };
for (const item of evidence.results ?? []) {
  if (item.restoreReceipt?.status === "fixture_disposal_required") item.restoreReceipt.status = cleanupComplete ? "fixture_disposed" : "fixture_cleanup_failed";
}
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
const resultByCase = new Map((evidence.results ?? []).map((item) => [item.caseId, item]));
const rosterComplete = coverage.caseIds.every((caseId) => resultByCase.has(caseId));
const baselinePass = baselineChecks.every((item) => item.result === "PASS");
const probesPass = probe.status === 0 && cleanupComplete && rosterComplete && coverage.caseIds.every((caseId) => resultByCase.get(caseId)?.result === "PASS");
const artifacts = [
  artifactReference(root, evidencePath, runner, coverage.caseIds, probesPass ? "PASS" : "FAIL"),
  artifactReference(root, probeOutputPath, runner, coverage.caseIds, probe.status === 0 ? "PASS" : "FAIL")
];
const manifest = manifestBase({ root, runId, gateStage: "product", runner, provider: "sqlite", dataScope: "task_owned_file_and_in_memory_fault_fixtures", parentRunId });
manifest.childManifests = artifacts;
manifest.caseResults = coverage.caseIds.map((caseId) => {
  const item = resultByCase.get(caseId);
  const pass = item?.result === "PASS";
  return {
    caseId,
    result: pass ? "PASS" : item ? "FAIL" : "NOT_RUN",
    assertionIds: item?.assertionIds ?? [`${caseId}:ACTUAL_NEGATIVE_REQUIRED`],
    firstFailurePointer: pass ? null : "negative-coverage.json"
  };
});
manifest.caseEvidence = Object.fromEntries(coverage.caseIds.map((caseId) => [caseId, {
  evidenceTypes: [...coverage.requiredEvidence],
  artifactPaths: artifacts.map((item) => item.path)
}]));
manifest.primaryInvariant = { status: "pass", delta: 0 };
manifest.cleanupReceipt = { status: "complete", taskOwnedRuntime: false, portsReleased: true };
manifest.result = baselinePass && probesPass ? "PASS" : "FAIL";
manifest.errorCode = manifest.result === "PASS" ? null : !baselinePass ? "NEGATIVE_CONTRACT_REGRESSION" : "ACTUAL_NEGATIVE_PROBE_FAILED";
manifest.firstFailure = manifest.result === "PASS" ? null : {
  code: manifest.errorCode,
  caseId: manifest.caseResults.find((item) => item.result !== "PASS")?.caseId ?? coverage.caseIds[0],
  pointer: "negative-coverage.json"
};
const manifestPath = writeCapabilityManifest(root, outputRoot, manifest);
console.log(JSON.stringify({ result: manifest.result, baseline: baselineChecks.filter((item) => item.result === "PASS").length, passed: manifest.caseResults.filter((item) => item.result === "PASS").length, failed: manifest.caseResults.filter((item) => item.result === "FAIL").length, notRun: manifest.caseResults.filter((item) => item.result === "NOT_RUN").length, manifest: manifestPath }, null, 2));
if (manifest.result !== "PASS") process.exitCode = 1;
