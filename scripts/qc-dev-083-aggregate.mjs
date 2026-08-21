#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runId = `DEV083-aggregate-${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}-${crypto.randomUUID().slice(0, 8)}`;
const outputDir = path.resolve(root, "output", "qa", "dev-083-aggregate", runId);
const manifestPath = path.join(outputDir, "manifest.json");

const commands = [
  { name: "DEV-083 contract", command: "npm.cmd", args: ["run", "qc:dev-083:contract"], scope: "focused" },
  { name: "DEV-083 API", command: "npm.cmd", args: ["run", "qc:dev-083:api"], scope: "focused" },
  { name: "DEV-083 authenticated browser", command: "npm.cmd", args: ["run", "qc:dev-083:browser"], scope: "focused" },
  { name: "DEV-083 disposable mutation", command: "npm.cmd", args: ["run", "qc:dev-083:mutation"], scope: "focused" },
  { name: "DEV-062 core", command: "npm.cmd", args: ["run", "qc:dev-062:core"], scope: "parent" },
  { name: "DEV-062 Part", command: "npm.cmd", args: ["run", "qc:dev-062:part"], scope: "parent" },
  { name: "DEV-062 Relation", command: "npm.cmd", args: ["run", "qc:dev-062:relation"], scope: "parent" },
  { name: "DEV-062 compatibility", command: "npm.cmd", args: ["run", "qc:dev-062:compat"], scope: "parent" },
  { name: "DEV-067 contract", command: "npm.cmd", args: ["run", "qc:dev-067:contract"], scope: "parent" },
  { name: "DEV-067 UI", command: "npm.cmd", args: ["run", "qc:dev-067:ui"], scope: "parent" },
  { name: "DEV-067 review scope", command: "npm.cmd", args: ["run", "qc:dev-067:review"], scope: "parent" },
  { name: "DEV-067 navigation", command: "npm.cmd", args: ["run", "qc:dev-067:navigation"], scope: "parent" },
  { name: "DEV-067 browser", command: "npm.cmd", args: ["run", "qc:dev-067:browser"], scope: "parent" },
  { name: "DEV-070 contract", command: "npm.cmd", args: ["run", "qc:dev-070:contract"], scope: "parent" },
  { name: "DEV-070 legacy owner", command: "npm.cmd", args: ["run", "qc:dev-070:legacy-owner"], scope: "parent" },
  { name: "DEV-070 browser", command: "npm.cmd", args: ["run", "qc:dev-070:browser"], scope: "parent" },
  { name: "DEV-072 contract", command: "npm.cmd", args: ["run", "qc:dev-072:contract"], scope: "parent" },
  { name: "DEV-072 API", command: "npm.cmd", args: ["run", "qc:dev-072:api"], scope: "parent" },
  { name: "DEV-072 browser", command: "npm.cmd", args: ["run", "qc:dev-072:browser"], scope: "parent" },
  { name: "DEV-079 contract", command: "npm.cmd", args: ["run", "qc:dev-079:contract"], scope: "parent" },
  { name: "DEV-081 contract", command: "npm.cmd", args: ["run", "qc:dev-081:contract"], scope: "parent" },
  { name: "PDM entity-detail drawer", command: "npm.cmd", args: ["run", "qc:pdm-entity-detail-drawer"], scope: "parent" },
  { name: "number-state Phase 1B", command: "npm.cmd", args: ["run", "qc:pdm-number-state-flow-phase1b"], scope: "parent" },
  { name: "numbering approval review UI", command: "npm.cmd", args: ["run", "qc:pdm-numbering-approval-review-ui"], scope: "parent" },
  { name: "approval platform", command: "npm.cmd", args: ["run", "qc:pdm-approval-platform"], scope: "parent" },
  { name: "master attachments", command: "npm.cmd", args: ["run", "qc:master-attachments"], scope: "parent" },
  { name: "drawing-part relation view isolated", command: "npm.cmd", args: ["run", "qc:pdm-drawing-part-relation-view:isolated"], scope: "parent" },
  { name: "typecheck:app", command: "npm.cmd", args: ["run", "typecheck:app"], scope: "gate" },
  { name: "affected lint", command: "npm.cmd", args: ["run", "lint"], scope: "gate" },
  { name: "build:isolated", command: "npm.cmd", args: ["run", "build:isolated"], scope: "gate" }
];

const baselineDisposition = {
  "DEV-067 browser": {
    status: "resolved",
    owner: "DEV-067 parent",
    evidence: "output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json",
    note: "Current runner accepts either unified or candidate readonly drawer markers, keeps one body scroll owner, and uses the canonical reviewer route; 18/18 cases passed with browserErrors=0 and failedResponses=0."
  },
  "DEV-072 browser": {
    status: "accepted-superseded",
    owner: "DEV-072 parent / DEV-079 replacement",
    evidence: "output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json; .ai-doc/qa/qa-dev-079-drawing-readonly-drawer-fullpage-workspace-validation-plan-2026-08-19.md",
    qcDisposition: ".ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md#2026-08-20-parent-baseline-disposition-for-dev-083",
    note: "The disposable fixture FK defect was corrected and the runner now reaches the legacy cases with a bounded 5s obsolete-marker wait; the legacy action-drawer assertion still fails because DEV-079 intentionally replaced that command-placement contract with a readonly drawer and canonical full-page owner. The historical failure remains retained and is not reported as PASS. Independent evidence-level QC accepted this as an accepted-superseded parent baseline disposition; the old assertion and failure remain preserved."
  }
};

const knownBaselineFindings = new Set(
  Object.entries(baselineDisposition)
    .filter(([, disposition]) => disposition.status !== "resolved")
    .map(([name]) => name)
);

const results = [];
let failed = false;
function writeManifest() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    runId,
    generatedAt: new Date().toISOString(),
    tool: "qc-dev-083 aggregate",
    contract: "focused gates + parent regressions + typecheck + affected lint + isolated build",
    results,
    knownBaselineFindings: [...knownBaselineFindings],
    baselineDisposition
  }, null, 2)}\n`, "utf8");
}

for (const entry of commands) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(entry.command, entry.args, { cwd: root, stdio: "inherit", shell: true });
  const status = result.status === 0 ? "PASS" : result.status === null ? "BLOCKED" : "FAIL";
  if (status !== "PASS") failed = true;
  const record = { ...entry, status, startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal ?? null, baseline: knownBaselineFindings.has(entry.name) };
  results.push(record);
  writeManifest();
  console.log(`DEV-083 ${entry.name}: ${status}${record.baseline ? " (recorded baseline finding)" : ""}`);
}

writeManifest();
console.log(`DEV-083 aggregate evidence: ${path.relative(root, manifestPath)}`);
if (failed) process.exitCode = 1;
