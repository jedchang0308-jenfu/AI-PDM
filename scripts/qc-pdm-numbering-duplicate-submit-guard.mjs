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
const requestPageSource = read("src/app/numbering/request/page.tsx");
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
record("request page has in-flight submit ref", requestPageSource.includes("submitInFlightRef"), "numbering/request/page.tsx");
record(
  "request page blocks submit while in flight or after created record",
  requestPageSource.includes('const currentCreated = requestMode === "new_root" ? createdRecord : appendCreatedRecord;') &&
    requestPageSource.includes("if (submitInFlightRef.current || currentCreated) return;") &&
    requestPageSource.includes('const hasCurrentCreated = requestMode === "new_root" ? Boolean(createdRecord) : Boolean(appendCreatedRecord);') &&
    requestPageSource.includes('disabled={busy === "submit" || validation.length > 0 || hasCurrentCreated}'),
  "submitRequest"
);
record(
  "request page resets submit lock through new request",
  requestPageSource.includes("function resetRequest()") &&
    requestPageSource.includes("submitInFlightRef.current = false") &&
    requestPageSource.includes("setCreatedRecord(null)"),
  "resetRequest"
);
record(
  "request page marks created state on button",
  requestPageSource.includes('const submitLabel = requestMode === "new_root" ? (createdRecord ? "已建立" : "建立號碼") : appendCreatedRecord ? "已追加" : "建立追加";') &&
    requestPageSource.includes("{submitLabel}"),
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
