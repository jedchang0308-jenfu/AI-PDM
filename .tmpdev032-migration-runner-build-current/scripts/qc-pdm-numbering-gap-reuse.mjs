#!/usr/bin/env node

import Database from "better-sqlite3";
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

function lowestAvailableRoot(usedRootCodes) {
  const used = [...new Set(usedRootCodes.map((code) => Number(code)).filter((value) => Number.isInteger(value) && value > 0 && value <= 99999))].sort(
    (a, b) => a - b
  );
  let candidate = 1;
  for (const value of used) {
    if (value < candidate) continue;
    if (value > candidate) break;
    candidate += 1;
  }
  return String(candidate).padStart(5, "0");
}

const asyncRepositorySource = read("src/lib/repositories/numbering-async-repository.ts");
const syncRepositorySource = read("src/lib/repositories/numbering-repository.ts");
const packageJson = JSON.parse(read("package.json"));

const asyncInsertStart = asyncRepositorySource.indexOf("private async insertPartRoot(");
const asyncInsertEnd = asyncRepositorySource.indexOf("private async insertPartNumber(", asyncInsertStart);
const asyncInsertBlock = asyncInsertStart >= 0 && asyncInsertEnd > asyncInsertStart ? asyncRepositorySource.slice(asyncInsertStart, asyncInsertEnd) : "";

const syncInsertStart = syncRepositorySource.indexOf("function insertPartRoot(");
const syncInsertEnd = syncRepositorySource.indexOf("function insertPartNumber(", syncInsertStart);
const syncInsertBlock = syncInsertStart >= 0 && syncInsertEnd > syncInsertStart ? syncRepositorySource.slice(syncInsertStart, syncInsertEnd) : "";

record("async repository selects existing V2 root codes", asyncRepositorySource.includes("SELECT_ASYNC_V2_ROOT_CODES_BY_COMPANY_SQL"), "numbering-async-repository.ts");
record("async repository has lowest-available helper", asyncRepositorySource.includes("function lowestAvailableSequence"), "numbering-async-repository.ts");
record("async repository has root-specific allocator", asyncRepositorySource.includes("private async allocateRootSequence"), "numbering-async-repository.ts");
record(
  "async insertPartRoot uses gap-aware root allocator",
  asyncInsertBlock.includes("allocateRootSequence") && !asyncInsertBlock.includes("allocateSequence(client"),
  "insertPartRoot"
);
record("sync repository has root-specific allocator", syncRepositorySource.includes("function allocateRootSequence"), "numbering-repository.ts");
record(
  "sync insertPartRoot uses gap-aware root allocator",
  syncInsertBlock.includes("allocateRootSequence") && !syncInsertBlock.includes("allocateSequence(database"),
  "insertPartRoot"
);
record(
  "package exposes gap reuse QC",
  packageJson.scripts?.["qc:pdm-numbering-gap-reuse"] === "node scripts/qc-pdm-numbering-gap-reuse.mjs",
  "package.json"
);

const runtimeDbPath = path.join(root, "data", "ai-pdm.sqlite");
if (fs.existsSync(runtimeDbPath)) {
  const db = new Database(runtimeDbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare("SELECT root_code FROM part_roots WHERE company_id = ? AND rule_version_id = ? ORDER BY root_code ASC")
      .all("company-jenfu", "numbering-rule-v2");
    const sequence = db.prepare("SELECT next_value FROM numbering_sequences WHERE sequence_key = ?").get("company-jenfu:part_root:v2") ?? null;
    const usedRootCodes = rows.map((row) => row.root_code);
    const lowestAvailable = lowestAvailableRoot(usedRootCodes);
    const maxUsed = usedRootCodes.length > 0 ? Math.max(...usedRootCodes.map((code) => Number(code))) : 0;
    record(
      "runtime lowest available root is computed from controlled master rows",
      true,
      JSON.stringify({
        usedRootCodes,
        lowestAvailable,
        rootSequenceNextValue: sequence?.next_value ?? null,
        hasReusableGapBeforeMax: Number(lowestAvailable) < maxUsed
      })
    );
  } finally {
    db.close();
  }
}

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
