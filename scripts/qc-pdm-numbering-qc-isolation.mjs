#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const root = process.cwd();
const results = [];

const guardedScripts = [
  "scripts/qc-pdm-numbering-api-regression.mjs",
  "scripts/qc-pdm-numbering-concurrency-reuse.mjs",
  "scripts/qc-pdm-numbering-cross-role-audit-e2e.mjs",
  "scripts/qc-pdm-numbering-cross-role-permission.mjs",
  "scripts/qc-pdm-numbering-data-consistency.mjs",
  "scripts/qc-pdm-numbering-draft-lifecycle.mjs",
  "scripts/qc-pdm-numbering-import-center-ui.mjs",
  "scripts/qc-pdm-numbering-permission-guard-ui.mjs",
  "scripts/qc-pdm-numbering-request-ui.mjs",
  "scripts/qc-pdm-numbering-search-ui.mjs",
  "scripts/qc-pdm-numbering-task-center-ui.mjs"
];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expectThrow(name, fn, expectedText) {
  try {
    fn();
    record(name, false, "expected guard to throw");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(name, message.includes(expectedText), message);
  }
}

expectThrow(
  "QC isolation guard blocks default protected runtime DB",
  () => assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-isolation-self-test", root, env: { ...process.env, PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: "" } }),
  "protected runtime DB"
);

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-numbering-qc-isolated-"));
try {
  const isolated = assertNumberingQcRuntimeIsIsolated({
    scriptName: "qc-isolation-self-test",
    root,
    env: { ...process.env, PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: tempDataDir }
  });
  record("QC isolation guard allows disposable PDM_DATA_DIR", isolated.dbPath === path.join(tempDataDir, "ai-pdm.sqlite"), isolated.dbPath);
} finally {
  fs.rmSync(tempDataDir, { recursive: true, force: true });
}

for (const relativePath of guardedScripts) {
  const source = read(relativePath);
  record(`${relativePath} imports isolation guard`, source.includes("./numbering-qc-runtime-guard.mjs"), relativePath);
  record(`${relativePath} calls isolation guard`, source.includes("assertNumberingQcRuntimeIsIsolated"), relativePath);
  record(
    `${relativePath} does not hard-code protected DB path`,
    !source.includes('path.join(process.cwd(), "data", "ai-pdm.sqlite")'),
    relativePath
  );
}

const packageJson = JSON.parse(read("package.json"));
record(
  "package exposes qc:pdm-numbering-qc-isolation",
  packageJson.scripts?.["qc:pdm-numbering-qc-isolation"] === "node scripts/qc-pdm-numbering-qc-isolation.mjs",
  "package.json"
);
record(
  "package exposes qc:pdm-numbering-sequence-integrity",
  packageJson.scripts?.["qc:pdm-numbering-sequence-integrity"] === "node scripts/qc-pdm-numbering-sequence-integrity.mjs --self-test --runtime-report-only",
  "package.json"
);

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      guardedScripts,
      results
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exit(1);
}
