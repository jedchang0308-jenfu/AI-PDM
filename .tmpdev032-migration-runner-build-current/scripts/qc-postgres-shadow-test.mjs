#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

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

function extractStatements(schema, startPattern) {
  const statements = [];
  const regex = new RegExp(`${startPattern}[\\s\\S]*?;`, "giu");
  for (const match of schema.matchAll(regex)) {
    statements.push(match[0].trim());
  }
  return statements;
}

function extractReferencedTableNames(statement) {
  return [...statement.matchAll(/\bREFERENCES\s+([a-z0-9_]+)/giu)].map((match) => match[1]);
}

const normalizeLf = (value) => value.replace(/\r\n?/gu, "\n");
const initialSchemaBeforeGeneration = readProjectFile(root, "db/postgres/001_initial_schema.sql");
const rlsPlanBeforeGeneration = readProjectFile(root, "db/postgres/002_supabase_rls_plan.sql");
const generate = runNode("scripts/generate-postgres-migration.mjs");
record("PG-001 migration generator exits successfully", generate.status === 0, generate.stderr || generate.stdout);
record(
  "PG-001A committed PostgreSQL mirror is generator-clean",
  normalizeLf(initialSchemaBeforeGeneration) === normalizeLf(readProjectFile(root, "db/postgres/001_initial_schema.sql")) &&
    normalizeLf(rlsPlanBeforeGeneration) === normalizeLf(readProjectFile(root, "db/postgres/002_supabase_rls_plan.sql")),
  "db/postgres/001_initial_schema.sql + db/postgres/002_supabase_rls_plan.sql"
);

const compare = runNode("scripts/compare-sqlite-postgres-shadow.mjs", ["--no-write"]);
record("PG-002 shadow compare exits successfully", compare.status === 0, compare.stderr || compare.stdout);

const schemaRlsOnlyCompare = runNode("scripts/compare-sqlite-postgres-shadow.mjs", ["--schema-rls-only", "--no-write"]);
record("PG-002B schema/RLS-only shadow compare exits successfully", schemaRlsOnlyCompare.status === 0, schemaRlsOnlyCompare.stderr || schemaRlsOnlyCompare.stdout);

const targetGuard = runNode("scripts/qc-postgres-shadow-target-guard.mjs");
record("PG-002A target guard exits successfully", targetGuard.status === 0, targetGuard.stderr || targetGuard.stdout);

const sqliteSchema = readProjectFile(root, "db/schema.sql");
const postgresSchema = readProjectFile(root, "db/postgres/001_initial_schema.sql");
const rlsPlan = readProjectFile(root, "db/postgres/002_supabase_rls_plan.sql");
const readme = readProjectFile(root, "db/postgres/README.md");
const packageJson = readProjectJson(root, "package.json");
const planDoc = readProjectFile(root, ".ai-doc/reports/industrialization/postgres-shadow-migration-plan-2026-05-28.md");

const sqliteTables = extractTableNames(sqliteSchema);
const postgresTables = extractTableNames(postgresSchema);
const postgresTableOrder = new Map(postgresTables.map((tableName, index) => [tableName, index]));
const postgresTableStatements = extractStatements(postgresSchema, "CREATE TABLE IF NOT EXISTS");
const sqliteIndexes = extractIndexNames(sqliteSchema);
const postgresIndexes = extractIndexNames(postgresSchema);

const missingTables = sqliteTables.filter((tableName) => !postgresTables.includes(tableName));
const missingIndexes = sqliteIndexes.filter((indexName) => !postgresIndexes.includes(indexName));
const missingRlsTables = sqliteTables.filter((tableName) => !rlsPlan.includes(`'${tableName}'`));
const outOfOrderReferences = postgresTableStatements.flatMap((statement) => {
  const tableName = extractTableNames(statement)[0];
  const tableIndex = postgresTableOrder.get(tableName);
  return extractReferencedTableNames(statement)
    .filter((referencedTableName) => referencedTableName !== tableName && postgresTableOrder.has(referencedTableName))
    .filter((referencedTableName) => postgresTableOrder.get(referencedTableName) > tableIndex)
    .map((referencedTableName) => `${tableName}->${referencedTableName}`);
});

record("PG-003 Postgres migration covers all SQLite tables", missingTables.length === 0, missingTables.join(", "));
record("PG-004 Postgres migration covers all SQLite indexes", missingIndexes.length === 0, missingIndexes.join(", "));
record("PG-005 Postgres migration uses timestamptz", postgresSchema.includes("TIMESTAMPTZ"), "db/postgres/001_initial_schema.sql");
record("PG-006 Postgres migration uses JSONB for JSON payload columns", postgresSchema.includes("JSONB"), "db/postgres/001_initial_schema.sql");
record("PG-007 RLS plan covers all public tables", missingRlsTables.length === 0, missingRlsTables.join(", "));
record("PG-008 RLS plan enables and forces RLS", /ENABLE ROW LEVEL SECURITY/u.test(rlsPlan) && /FORCE ROW LEVEL SECURITY/u.test(rlsPlan), "db/postgres/002_supabase_rls_plan.sql");
record("PG-009 RLS plan denies anon/authenticated table access by default", /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated/u.test(rlsPlan), "db/postgres/002_supabase_rls_plan.sql");
record("PG-010 no user-editable auth metadata in Postgres SQL", !/user_metadata|raw_user_meta_data/iu.test(`${postgresSchema}\n${rlsPlan}`), "db/postgres/*.sql");
record("PG-010A referenced tables are created before dependent tables", outOfOrderReferences.length === 0, outOfOrderReferences.join(", "));
record("PG-011 README documents shadow workflow", readme.includes("db:postgres:compare") && readme.includes("qc:postgres-shadow"), "db/postgres/README.md");
record("PG-012 plan document records Supabase advisor gate", planDoc.includes("Supabase advisor") && planDoc.includes("RLS"), ".ai-doc/reports/industrialization/postgres-shadow-migration-plan-2026-05-28.md");
record("PG-013 package exposes generation command", packageJson.scripts?.["db:postgres:migration"] === "node scripts/generate-postgres-migration.mjs", "package.json");
record("PG-014 package exposes compare command", packageJson.scripts?.["db:postgres:compare"] === "node scripts/compare-sqlite-postgres-shadow.mjs", "package.json");
record("PG-014A package exposes schema/RLS-only compare command", packageJson.scripts?.["db:postgres:compare:schema-rls"] === "node scripts/compare-sqlite-postgres-shadow.mjs --schema-rls-only", "package.json");
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
record("PG-017A compare report includes target identity guard field", Object.hasOwn(compareReport ?? {}, "postgresTargetIdentity"), "scripts/compare-sqlite-postgres-shadow.mjs");
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

let schemaRlsOnlyReport = null;
try {
  schemaRlsOnlyReport = JSON.parse(schemaRlsOnlyCompare.stdout);
} catch {
  schemaRlsOnlyReport = null;
}
record(
  "PG-019 schema/RLS-only compare records policy and skips data mismatch gate",
  schemaRlsOnlyReport?.comparePolicy === "schema_rls_only" &&
    schemaRlsOnlyReport?.dataCompareSkipped === true &&
    schemaRlsOnlyReport?.mismatches?.length === 0,
  JSON.stringify({
    comparePolicy: schemaRlsOnlyReport?.comparePolicy,
    dataCompareSkipped: schemaRlsOnlyReport?.dataCompareSkipped,
    mismatches: schemaRlsOnlyReport?.mismatches?.length
  })
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
