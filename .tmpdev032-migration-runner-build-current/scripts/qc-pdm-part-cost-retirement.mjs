#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function walk(directory) {
  const resolved = path.join(root, directory);
  if (!fs.existsSync(resolved)) return [];
  const files = [];
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(relative));
    else if (/\.(?:ts|tsx|mjs)$/u.test(entry.name)) files.push(relative);
  }
  return files;
}

const retiredContractPatterns = [
  /part-cost-visibility/iu,
  /numbering-part-cost/iu,
  /standard_cost/iu,
  /standardCost/iu,
  /pendingCostRequestCount/iu,
  /costProfiles/iu,
  /costChangeRequests/iu,
  /cost-change-requests/iu,
  /cost-profiles/iu,
  /cost-resolution/iu,
  /canViewCostAmounts/iu,
  /part[_-]cost/iu,
  /成本狀態/u,
  /補成本/u,
  /focus=cost/iu
];

const sourceFiles = [
  ...walk("src"),
  "db/schema.sql",
  "db/postgres/001_initial_schema.sql",
  "db/postgres/002_supabase_rls_plan.sql",
  "scripts/qc-pdm-entity-detail-drawer.mjs",
  "scripts/qc-dev-062-part-workbench.mjs",
  "scripts/qc-dev-062-real-operation.mjs"
].filter((relativePath) => fs.existsSync(path.join(root, relativePath)));

const sourceHits = [];
for (const relativePath of sourceFiles) {
  const source = read(relativePath);
  if (retiredContractPatterns.some((pattern) => pattern.test(source))) sourceHits.push(relativePath);
}
record(
  "current source and baseline schemas do not reference retired part-cost contracts",
  sourceHits.length === 0,
  sourceHits.join(", ") || "no retired product-cost symbols"
);

const migration = read("db/postgres/032_remove_part_cost.sql");
const expectedDrops = [
  "DROP TABLE IF EXISTS public.part_cost_change_requests;",
  "DROP TABLE IF EXISTS public.part_standard_costs;",
  "DROP TABLE IF EXISTS public.part_cost_tiers;",
  "DROP TABLE IF EXISTS public.part_cost_profiles;"
];
record(
  "Cloud SQL retirement migration drops all product-cost tables child-first",
  expectedDrops.every((statement) => migration.includes(statement)) && !/^\s*(?:BEGIN|COMMIT)\s*;/imu.test(migration),
  "db/postgres/032_remove_part_cost.sql"
);

const databasePath = path.join(root, "data", "ai-pdm.sqlite");
if (fs.existsSync(databasePath)) {
  const database = new Database(databasePath, { readonly: true });
  try {
    const objects = database
      .prepare("SELECT type, name FROM sqlite_master WHERE lower(name) LIKE '%cost%' ORDER BY type, name")
      .all();
    record("active local SQLite has no cost-named objects", objects.length === 0, JSON.stringify(objects));
  } finally {
    database.close();
  }
} else {
  record("active local SQLite has no cost-named objects", false, "data/ai-pdm.sqlite is missing");
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
