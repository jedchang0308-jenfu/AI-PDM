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

const root = process.cwd();
const runner = "qc-dev-087-capability-repository";
const runId = `DEV087-product-repository-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV087_AGGREGATE_RUN_ID ?? null;
const outputRoot = path.join("output", "qa", "dev-087-capability");
const outputDir = path.join(root, outputRoot, runId);
const registry = readJson(path.join(root, ".ai-doc", "qa", "dev-087-current-case-registry.json"));
const coverage = runnerCoverage(registry, runner);
fs.mkdirSync(outputDir, { recursive: true });

function runScript(scriptPath) {
  return spawnSync(process.execPath, [
    "--experimental-transform-types",
    "--experimental-loader",
    "./scripts/qc-ts-path-loader.mjs",
    scriptPath
  ], { cwd: root, encoding: "utf8", maxBuffer: 24 * 1024 * 1024 });
}

const baselineRuns = [
  { name: "repository", script: "scripts/qc-dev-087-repository.mjs", result: runScript("scripts/qc-dev-087-repository.mjs") },
  { name: "commands", script: "scripts/qc-dev-087-commands.mjs", result: runScript("scripts/qc-dev-087-commands.mjs") }
];
const artifacts = baselineRuns.map(({ name, result }) => {
  const file = path.join(outputDir, `${name}-baseline-output.txt`);
  fs.writeFileSync(file, `${result.stdout ?? ""}${result.stderr ?? ""}`, "utf8");
  return artifactReference(root, file, `qc-dev-087-${name}`, coverage.caseIds, result.status === 0 ? "PASS" : "FAIL");
});

function runEvidenceScript(scriptPath, evidencePath, environmentKey) {
  return spawnSync(process.execPath, [
    "--experimental-transform-types",
    "--experimental-loader",
    "./scripts/qc-ts-path-loader.mjs",
    scriptPath
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, [environmentKey]: evidencePath }
  });
}

function finalizeTaskEvidence(evidencePath, prefix) {
  const evidence = fs.existsSync(evidencePath) ? readJson(evidencePath) : { results: [] };
  const reportedRoot = evidence.taskOwnedEnvironment?.taskRoot ?? (typeof evidence.taskOwnedEnvironment?.dataDir === "string" ? path.dirname(evidence.taskOwnedEnvironment.dataDir) : null);
  let cleanupComplete = false;
  if (typeof reportedRoot === "string") {
    const taskRoot = path.resolve(reportedRoot);
    const boundary = path.resolve(os.tmpdir()) + path.sep;
    if (taskRoot.startsWith(boundary) && path.basename(taskRoot).startsWith(prefix)) {
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
  return { evidence, cleanupComplete };
}

const caseEvidencePath = path.join(outputDir, "repository-case-evidence.json");
const caseProbe = runEvidenceScript("scripts/qc-dev-087-repository-cases.mjs", caseEvidencePath, "DEV087_REPOSITORY_CASE_EVIDENCE_PATH");
const caseProbeOutputPath = path.join(outputDir, "repository-case-probe-output.txt");
fs.writeFileSync(caseProbeOutputPath, `${caseProbe.stdout ?? ""}${caseProbe.stderr ?? ""}`, "utf8");
const caseEvidenceFinal = finalizeTaskEvidence(caseEvidencePath, "ai-pdm-dev087-repository-");

// QA-087-202/206 overlap with the dedicated negative lane.  Execute the same
// actual route probes again under this lane's source fingerprint rather than
// trusting or copying a manifest from another run.
const overlapEvidencePath = path.join(outputDir, "repository-negative-overlap.json");
const overlapProbe = runEvidenceScript("scripts/qc-dev-087-negative-probes.mjs", overlapEvidencePath, "DEV087_NEGATIVE_EVIDENCE_PATH");
const overlapProbeOutputPath = path.join(outputDir, "repository-negative-overlap-output.txt");
fs.writeFileSync(overlapProbeOutputPath, `${overlapProbe.stdout ?? ""}${overlapProbe.stderr ?? ""}`, "utf8");
const overlapEvidenceFinal = finalizeTaskEvidence(overlapEvidencePath, "ai-pdm-dev087-negative-");

const overlapCaseIds = ["QA-087-202", "QA-087-206"];
const repositoryCaseIds = coverage.caseIds.filter((caseId) => !overlapCaseIds.includes(caseId));
const repositoryArtifact = artifactReference(root, caseEvidencePath, runner, repositoryCaseIds, caseProbe.status === 0 && caseEvidenceFinal.cleanupComplete ? "PASS" : "FAIL");
const overlapArtifact = artifactReference(root, overlapEvidencePath, runner, overlapCaseIds, overlapProbe.status === 0 && overlapEvidenceFinal.cleanupComplete ? "PASS" : "FAIL");
const repositoryOutputArtifact = artifactReference(root, caseProbeOutputPath, runner, repositoryCaseIds, caseProbe.status === 0 ? "PASS" : "FAIL");
const overlapOutputArtifact = artifactReference(root, overlapProbeOutputPath, runner, overlapCaseIds, overlapProbe.status === 0 ? "PASS" : "FAIL");
artifacts.push(repositoryArtifact, overlapArtifact, repositoryOutputArtifact, overlapOutputArtifact);

const resultByCase = new Map([
  ...(caseEvidenceFinal.evidence.results ?? []).map((item) => [item.caseId, item]),
  ...(overlapEvidenceFinal.evidence.results ?? []).filter((item) => overlapCaseIds.includes(item.caseId)).map((item) => [item.caseId, item])
]);
const rosterComplete = coverage.caseIds.every((caseId) => resultByCase.has(caseId));
const baselinePass = baselineRuns.every(({ result }) => result.status === 0);
const probesPass = caseProbe.status === 0 && overlapProbe.status === 0 && caseEvidenceFinal.cleanupComplete && overlapEvidenceFinal.cleanupComplete && rosterComplete && coverage.caseIds.every((caseId) => resultByCase.get(caseId)?.result === "PASS");

const manifest = manifestBase({ root, runId, gateStage: "product", runner, provider: "sqlite", dataScope: "task_owned_in_memory_and_file_fixtures", parentRunId });
manifest.childManifests = artifacts;
manifest.caseResults = coverage.caseIds.map((caseId) => {
  const item = resultByCase.get(caseId);
  const pass = item?.result === "PASS";
  return { caseId, result: pass ? "PASS" : item ? "FAIL" : "NOT_RUN", assertionIds: item?.assertionIds ?? [`${caseId}:REPOSITORY_ASSERTION_REQUIRED`], firstFailurePointer: pass ? null : caseEvidencePath };
});
manifest.caseEvidence = Object.fromEntries(coverage.caseIds.map((caseId) => {
  const focusedArtifacts = overlapCaseIds.includes(caseId) ? [overlapArtifact, overlapOutputArtifact] : [repositoryArtifact, repositoryOutputArtifact];
  return [caseId, { evidenceTypes: [...coverage.requiredEvidence], artifactPaths: focusedArtifacts.map((item) => item.path) }];
}));
manifest.primaryInvariant = { status: "pass", delta: 0 };
manifest.cleanupReceipt = { status: "complete", taskOwnedRuntime: false, portsReleased: true };
manifest.result = baselinePass && probesPass ? "PASS" : "FAIL";
manifest.errorCode = manifest.result === "PASS" ? null : !baselinePass ? "BASELINE_REPOSITORY_RUN_FAILED" : "CASE_SPECIFIC_REPOSITORY_PROBE_FAILED";
manifest.firstFailure = manifest.result === "PASS" ? null : { code: manifest.errorCode, caseId: manifest.caseResults.find((item) => item.result !== "PASS")?.caseId ?? coverage.caseIds[0], pointer: "repository-case-evidence.json" };
const manifestPath = writeCapabilityManifest(root, outputRoot, manifest);
console.log(JSON.stringify({ result: manifest.result, baselinePass, passed: manifest.caseResults.filter((item) => item.result === "PASS").length, failed: manifest.caseResults.filter((item) => item.result === "FAIL").length, notRun: manifest.caseResults.filter((item) => item.result === "NOT_RUN").length, manifest: manifestPath }, null, 2));
if (manifest.result !== "PASS") process.exitCode = 1;
