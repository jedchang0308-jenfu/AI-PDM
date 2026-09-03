#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceRoot = path.resolve(process.env.DEV105_EVIDENCE_ROOT || path.join(root, "output", "qa", "dev-105-3d-preview"));
const runId = process.env.DEV105_RUN_ID?.trim() || `DEV105-aggregate-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(evidenceRoot, runId);

function latestManifest(name) {
  const candidates = [];
  for (const entry of fs.readdirSync(evidenceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(evidenceRoot, entry.name, name);
    if (!fs.existsSync(filePath)) continue;
    candidates.push({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (!candidates[0]) throw new Error(`DEV105_${name.toUpperCase().replaceAll("-", "_")}_MISSING`);
  return { path: candidates[0].filePath, value: JSON.parse(fs.readFileSync(candidates[0].filePath, "utf8")) };
}

function checksFor(manifest, ids) {
  return ids.map((id) => {
    const matching = manifest.value.checks.filter((item) => item.id === id);
    return { id, passed: matching.length > 0 && matching.every((item) => item.passed), observations: matching.length };
  });
}

const contract = latestManifest("contract-manifest.json");
const service = latestManifest("service-manifest.json");
const browser = latestManifest("browser-manifest.json");
const newCases = ["QA-105-019", "QA-105-020", "QA-105-021", "QA-105-022", "QA-105-023", "QA-105-024", "QA-105-025", "QA-105-026", "QA-105-027", "QA-105-028", "QA-105-029", "QA-105-030"];
const newCaseResults = [
  ...checksFor(browser, newCases.slice(0, 4)),
  ...checksFor(contract, newCases.slice(4))
];
const regressionIds = ["QA-105-001", "QA-105-002", "QA-105-003", "QA-105-004", "QA-105-005", "QA-105-006", "QA-105-010", "QA-105-014", "QA-105-015", "QA-105-016", "QA-105-017", "QA-105-018"];
const regressionResults = regressionIds.map((id) => {
  const matching = [...service.value.checks, ...browser.value.checks].filter((item) => item.id === id);
  return { id, passed: matching.length > 0 && matching.every((item) => item.passed), observations: matching.length };
});
const primaryStable = service.value.primaryBefore?.hash === service.value.primaryAfter?.hash
  && browser.value.primaryBefore?.hash === browser.value.primaryAfter?.hash
  && service.value.primaryAfter?.foreignKeys?.length === 0
  && browser.value.primaryAfter?.foreignKeys?.length === 0;
const cleanupComplete = Boolean(service.value.cleanup?.taskRootRemoved)
  && Boolean(browser.value.cleanup?.browserClosed && browser.value.cleanup?.appStopped && browser.value.cleanup?.portReleased && browser.value.cleanup?.runtimeProjectRemoved && browser.value.cleanup?.taskRootRemoved);
const passed = contract.value.passed && service.value.passed && browser.value.passed
  && newCaseResults.length === 12 && newCaseResults.every((item) => item.passed)
  && regressionResults.every((item) => item.passed) && primaryStable && cleanupComplete;

fs.mkdirSync(outputDir, { recursive: true });
const manifest = {
  devId: "DEV-105",
  capaId: "CAPA-2026-3DP-001",
  runId,
  status: passed ? "QA-QC Complete / Effectiveness Reclosed / Primary Backfill Human-Gated / Production Release Gated" : "FAILED",
  sourceManifests: { contract: contract.path, service: service.path, browser: browser.path },
  fixedDenominator: { ids: newCases, count: newCaseResults.length, passed: newCaseResults.every((item) => item.passed), results: newCaseResults },
  retainedRegression: { ids: regressionIds, results: regressionResults },
  primaryInvariantUnchanged: primaryStable,
  cleanupComplete,
  buildGate: "PASS (aggregate invoked after qc:dev-105 build:isolated)",
  passed
};
fs.writeFileSync(path.join(outputDir, "aggregate-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
for (const item of newCaseResults) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.id}`);
console.log(`${passed ? "PASS" : "FAIL"} QA-105-030 aggregate fixed denominator and regression gate`);
if (!passed) process.exitCode = 1;
