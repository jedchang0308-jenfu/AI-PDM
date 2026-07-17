#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const repositorySource = read("src/lib/repositories/numbering-async-repository.ts");
const workspaceSource = read("src/components/number-state-workspace.tsx");
const packageJson = JSON.parse(read("package.json"));

const createStart = repositorySource.indexOf("async createNumberingRecord(input: CreateNumberingRecordInput)");
const createEnd = repositorySource.indexOf("async updateDraftNumberingRecord", createStart);
const createBlock = createStart >= 0 && createEnd > createStart ? repositorySource.slice(createStart, createEnd) : "";

record("repository has recent duplicate create SQL", repositorySource.includes("SELECT_ASYNC_RECENT_DUPLICATE_CREATE_SQL"), "numbering-async-repository.ts");
record("repository has duplicate helper", repositorySource.includes("findRecentDuplicateCreateInClient"), "numbering-async-repository.ts");
record(
  "createNumberingRecord checks duplicate before insertPartRoot",
  createBlock.indexOf("findRecentDuplicateCreateInClient") >= 0 &&
    createBlock.indexOf("insertPartRoot") >= 0 &&
    createBlock.indexOf("findRecentDuplicateCreateInClient") < createBlock.indexOf("insertPartRoot"),
  "createNumberingRecord"
);
record(
  "duplicate helper uses 60 second replay window",
  repositorySource.includes("60_000"),
  "findRecentDuplicateCreateInClient"
);
record(
  "duplicate helper returns existing root/part/drawing bundle",
  repositorySource.includes("mapPartRoot(rootRow)") &&
    repositorySource.includes("mapPartNumber(partRow)") &&
    repositorySource.includes("drawingRow ? mapDrawingNumber(drawingRow) : null"),
  "findRecentDuplicateCreateInClient"
);
record("owner workspace keeps one create idempotency key", workspaceSource.includes('useRef(newIdempotencyKey("create"))'), "number-state-workspace.tsx");
record(
  "owner workspace disables duplicate submit while request is busy",
  workspaceSource.includes("disabled={busy || duplicateCheckState === \"checking\" || appendPolicyState === \"loading\"") &&
    workspaceSource.includes('headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey.current }'),
  "CreateWorkspaceDialog submit"
);
record(
  "owner workspace rotates the key after non-retryable failure",
  workspaceSource.includes('if (response.status !== 503) idempotencyKey.current = newIdempotencyKey("create")') &&
    workspaceSource.includes("表單內容已保留"),
  "CreateWorkspaceDialog failure recovery"
);
record(
  "owner workspace uses explicit outcome-based submit copy",
  workspaceSource.includes("建立並保留號碼") &&
    workspaceSource.includes('{busy ? "建立中..."') &&
    workspaceSource.includes("正式發布前不可正式使用"),
  "submit button"
);
record(
  "package exposes duplicate submit guard QC",
  packageJson.scripts?.["qc:pdm-numbering-duplicate-submit-guard"] === "node scripts/qc-pdm-numbering-duplicate-submit-guard.mjs",
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
      results
    },
    null,
    2
  )
);

if (failed.length > 0) process.exit(1);
