#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
}

function extractTableNames(sql) {
  return [...sql.matchAll(/^CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gimu)].map((match) => match[1]);
}

function extractIndexNames(sql) {
  return [...sql.matchAll(/^CREATE INDEX IF NOT EXISTS\s+([a-z0-9_]+)/gimu)].map((match) => match[1]);
}

const generate = runNode("scripts/generate-postgres-migration.mjs");
record("PG-001 migration generator exits successfully", generate.status === 0, generate.stderr || generate.stdout);

const compare = runNode("scripts/compare-sqlite-postgres-shadow.mjs", ["--no-write"]);
record("PG-002 shadow compare exits successfully", compare.status === 0, compare.stderr || compare.stdout);

const targetGuard = runNode("scripts/qc-postgres-shadow-target-guard.mjs");
record("PG-002A target guard exits successfully", targetGuard.status === 0, targetGuard.stderr || targetGuard.stdout);

const sqliteSchema = read("db/schema.sql");
const postgresSchema = read("db/postgres/001_initial_schema.sql");
const rlsPlan = read("db/postgres/002_supabase_rls_plan.sql");
const readme = read("db/postgres/README.md");
const packageJson = JSON.parse(read("package.json"));
const planDoc = read("docs/industrialization/postgres-shadow-migration-plan-2026-05-28.md");

const sqliteTables = extractTableNames(sqliteSchema);
const postgresTables = extractTableNames(postgresSchema);
const sqliteIndexes = extractIndexNames(sqliteSchema);
const postgresIndexes = extractIndexNames(postgresSchema);

const missingTables = sqliteTables.filter((tableName) => !postgresTables.includes(tableName));
const missingIndexes = sqliteIndexes.filter((indexName) => !postgresIndexes.includes(indexName));
const missingRlsTables = sqliteTables.filter((tableName) => !rlsPlan.includes(`'${tableName}'`));

record("PG-003 Postgres migration covers all SQLite tables", missingTables.length === 0, missingTables.join(", "));
record("PG-004 Postgres migration covers all SQLite indexes", missingIndexes.length === 0, missingIndexes.join(", "));
record("PG-005 Postgres migration uses timestamptz", postgresSchema.includes("TIMESTAMPTZ"), "db/postgres/001_initial_schema.sql");
record("PG-006 Postgres migration uses JSONB for JSON payload columns", postgresSchema.includes("JSONB"), "db/postgres/001_initial_schema.sql");
record("PG-007 RLS plan covers all public tables", missingRlsTables.length === 0, missingRlsTables.join(", "));
record("PG-008 RLS plan enables and forces RLS", /ENABLE ROW LEVEL SECURITY/u.test(rlsPlan) && /FORCE ROW LEVEL SECURITY/u.test(rlsPlan), "db/postgres/002_supabase_rls_plan.sql");
record("PG-009 RLS plan denies anon/authenticated table access by default", /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated/u.test(rlsPlan), "db/postgres/002_supabase_rls_plan.sql");
record("PG-010 no user-editable auth metadata in Postgres SQL", !/user_metadata|raw_user_meta_data/iu.test(`${postgresSchema}\n${rlsPlan}`), "db/postgres/*.sql");
record("PG-011 README documents shadow workflow", readme.includes("db:postgres:compare") && readme.includes("qc:postgres-shadow"), "db/postgres/README.md");
record("PG-012 plan document records Supabase advisor gate", planDoc.includes("Supabase advisor") && planDoc.includes("RLS"), "docs/industrialization/postgres-shadow-migration-plan-2026-05-28.md");
record("PG-013 package exposes generation command", packageJson.scripts?.["db:postgres:migration"] === "node scripts/generate-postgres-migration.mjs", "package.json");
record("PG-014 package exposes compare command", packageJson.scripts?.["db:postgres:compare"] === "node scripts/compare-sqlite-postgres-shadow.mjs", "package.json");
record("PG-015 package exposes QC command", packageJson.scripts?.["qc:postgres-shadow"] === "node scripts/qc-postgres-shadow-test.mjs", "package.json");
record("PG-015A package exposes target guard command", packageJson.scripts?.["db:postgres:guard"] === "node scripts/guard-postgres-shadow-target.mjs", "package.json");
record("PG-015B package exposes target guard QC command", packageJson.scripts?.["qc:postgres-shadow-target-guard"] === "node scripts/qc-postgres-shadow-target-guard.mjs", "package.json");

let compareReport = null;
try {
  compareReport = JSON.parse(compare.stdout);
} catch {
  compareReport = null;
}
record("PG-016 compare report has row counts and key hashes", Array.isArray(compareReport?.sqliteStats) && compareReport.sqliteStats.every((item) => typeof item.count === "number" && typeof item.keyHash === "string"), "scripts/compare-sqlite-postgres-shadow.mjs");
record("PG-017 compare report includes target guard field", Object.hasOwn(compareReport ?? {}, "postgresTargetGuard"), "scripts/compare-sqlite-postgres-shadow.mjs");
record(
  "PG-018 compare report is traceable to migration files",
  compareReport?.migrationTrace?.sqliteSchema?.path === "db/schema.sql" &&
    typeof compareReport?.migrationTrace?.sqliteSchema?.sha256 === "string" &&
    compareReport.migrationTrace.sqliteSchema.sha256.length === 64 &&
    compareReport?.migrationTrace?.postgresSchema?.path === "db/postgres/001_initial_schema.sql" &&
    typeof compareReport?.migrationTrace?.postgresSchema?.sha256 === "string" &&
    compareReport.migrationTrace.postgresSchema.sha256.length === 64 &&
    compareReport?.migrationTrace?.postgresRlsPlan?.path === "db/postgres/002_supabase_rls_plan.sql" &&
    typeof compareReport?.migrationTrace?.postgresRlsPlan?.sha256 === "string" &&
    compareReport.migrationTrace.postgresRlsPlan.sha256.length === 64,
  JSON.stringify(compareReport?.migrationTrace ?? null)
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

process.exitCode = failed.length === 0 ? 0 : 1;
