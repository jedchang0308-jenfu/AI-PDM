#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, "data", "qc-fixtures", "dev-task-evidence-sync");
const fixtureTaskPath = path.join(fixtureRoot, "PDM_dev_task.fixture.md");
const outputTaskPath = path.join(fixtureRoot, "PDM_dev_task.synced.md");
const evidenceBlockedPath = path.join(fixtureRoot, "evidence-blocked.json");
const evidenceReadyPath = path.join(fixtureRoot, "evidence-ready.json");
const syncScript = path.join(root, "scripts", "qa-sync-dev-task-evidence.mjs");

const fixtureMarkdown = [
  "# Fixture",
  "",
  "- [/] `P0` SolidWorks Add-in 實機驗證：fixture",
  "- [/] `P0` 離線單向備份與還原：fixture",
  "- [ ] `P0` SolidWorks Document Manager API 或等效授權元件：fixture",
  "- [ ] `P1` 正式現場測試：fixture",
  "- [ ] `P0` 整合 SolidWorks Document Manager API 或等效讀取元件。",
  "- [ ] `P0` 確認 SolidWorks Document Manager 授權與可部署方式。",
  ""
].join("\n");

function runSync(args) {
  const result = spawnSync(process.execPath, [syncScript, ...args], {
    cwd: root,
    encoding: "utf8"
  });

  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    parsed
  };
}

function record(results, name, passed, detail = "") {
  results.push({ name, passed, detail });
}

fs.mkdirSync(fixtureRoot, { recursive: true });
fs.writeFileSync(fixtureTaskPath, fixtureMarkdown, "utf8");
fs.writeFileSync(evidenceBlockedPath, `${JSON.stringify({
  solidWorksReady: false,
  restoreReady: false,
  documentManagerReady: false
}, null, 2)}\n`, "utf8");
fs.writeFileSync(evidenceReadyPath, `${JSON.stringify({
  solidWorksReady: true,
  restoreReady: true,
  documentManagerReady: true
}, null, 2)}\n`, "utf8");
if (fs.existsSync(outputTaskPath)) fs.rmSync(outputTaskPath);

const results = [];

const dryRunBlocked = runSync(["--task-file", fixtureTaskPath, "--evidence-fixture", evidenceBlockedPath]);
record(results, "QASYNC-001 blocked fixture exits 0", dryRunBlocked.status === 0, dryRunBlocked.stderr);
record(results, "QASYNC-002 blocked fixture has no eligible changes", dryRunBlocked.parsed?.changes?.length === 0, JSON.stringify(dryRunBlocked.parsed?.changes ?? null));
record(results, "QASYNC-003 blocked fixture reports six blocked target tasks", dryRunBlocked.parsed?.blocked?.length === 6, JSON.stringify(dryRunBlocked.parsed?.blocked ?? null));
record(results, "QASYNC-004 dry-run does not write output file", !fs.existsSync(outputTaskPath), outputTaskPath);

const applyReady = runSync([
  "--task-file",
  fixtureTaskPath,
  "--evidence-fixture",
  evidenceReadyPath,
  "--output",
  outputTaskPath,
  "--apply"
]);
record(results, "QASYNC-005 ready fixture exits 0", applyReady.status === 0, applyReady.stderr);
record(results, "QASYNC-006 ready fixture applies six changes", applyReady.parsed?.changes?.length === 6 && applyReady.parsed?.applied === true, JSON.stringify(applyReady.parsed ?? null));

const syncedMarkdown = fs.existsSync(outputTaskPath) ? fs.readFileSync(outputTaskPath, "utf8") : "";
const checkedTargetCount = (syncedMarkdown.match(/^- \[x\]/gmu) ?? []).length;
record(results, "QASYNC-007 output has all six target lines checked", checkedTargetCount === 6, syncedMarkdown);
const sourceFixtureUnchanged = fs.readFileSync(fixtureTaskPath, "utf8") === fixtureMarkdown;
record(results, "QASYNC-008 source fixture remains unchanged", sourceFixtureUnchanged, sourceFixtureUnchanged ? "" : "source fixture mutated");

const actualDryRun = runSync([]);
record(results, "QASYNC-009 actual dev_task dry-run exits 0", actualDryRun.status === 0, actualDryRun.stderr);
record(results, "QASYNC-010 actual dev_task reports no eligible changes while evidence is open", actualDryRun.parsed?.changes?.length === 0, JSON.stringify(actualDryRun.parsed?.changes ?? null));
record(results, "QASYNC-011 actual dev_task keeps external target tasks blocked", actualDryRun.parsed?.blocked?.length >= 6, JSON.stringify(actualDryRun.parsed?.blocked ?? null));

const failed = results.filter((result) => !result.passed);
const report = {
  passed: results.length - failed.length,
  failed: failed.length,
  results
};

console.log(JSON.stringify(report, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
