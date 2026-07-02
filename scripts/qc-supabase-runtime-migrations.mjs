#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { sha256Bytes as sha256 } from "./qc-file-hash-utils.mjs";
import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: {
      ...process.env,
      PDM_SUPABASE_SKIP_MIGRATION_LIST: "true"
    },
    encoding: "utf8",
    windowsHide: true
  });
}

function extractTableNames(sql) {
  return [...sql.matchAll(/^CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gimu)].map((match) => match[1]);
}

const sync = runNode("scripts/sync-supabase-runtime-migrations.mjs");
record("SUPA-MIG-001 sync script exits successfully", sync.status === 0, sync.stderr || sync.stdout);

const requiredFiles = [
  "supabase/README.md",
  "supabase/migrations/manifest.json",
  "supabase/migrations/20260608000100_initial_ai_pdm_schema.sql",
  "supabase/migrations/20260608000200_force_rls_deny_direct_access.sql",
  "supabase/migrations/20260615040619_harden_set_updated_at_search_path.sql"
];
for (const file of requiredFiles) {
  record(`SUPA-MIG-002 required file exists: ${file}`, projectFileExists(root, file), file);
}

const sqliteSchema = readProjectFile(root, "db/schema.sql");
const postgresSchema = readProjectFile(root, "db/postgres/001_initial_schema.sql");
const rlsPlan = readProjectFile(root, "db/postgres/002_supabase_rls_plan.sql");
const searchPathHardening = readProjectFile(root, "db/postgres/003_harden_set_updated_at_search_path.sql");
const migrationSchema = readProjectFile(root, "supabase/migrations/20260608000100_initial_ai_pdm_schema.sql");
const migrationRls = readProjectFile(root, "supabase/migrations/20260608000200_force_rls_deny_direct_access.sql");
const migrationSearchPathHardening = readProjectFile(root, "supabase/migrations/20260615040619_harden_set_updated_at_search_path.sql");
const manifest = readProjectJson(root, "supabase/migrations/manifest.json");
const readme = readProjectFile(root, "supabase/README.md");
const envExample = readProjectFile(root, ".env.example");
const packageJson = readProjectJson(root, "package.json");
const devTask = readProjectFile(root, ".ai-doc/dev_task.md");
const migrationHistoryPolicy = readProjectFile(root, ".ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md");

const sqliteTables = extractTableNames(sqliteSchema);
const migrationTables = extractTableNames(migrationSchema);
const missingMigrationTables = sqliteTables.filter((tableName) => !migrationTables.includes(tableName));

record("SUPA-MIG-003 migration mirror covers all SQLite tables", missingMigrationTables.length === 0, missingMigrationTables.join(", "));
record("SUPA-MIG-004 schema migration embeds source hash", migrationSchema.includes(`Source SHA-256: ${sha256(postgresSchema)}`), "initial migration source hash");
record("SUPA-MIG-005 RLS migration embeds source hash", migrationRls.includes(`Source SHA-256: ${sha256(rlsPlan)}`), "RLS migration source hash");
record("SUPA-MIG-006 RLS migration enables and forces RLS", /ENABLE ROW LEVEL SECURITY/u.test(migrationRls) && /FORCE ROW LEVEL SECURITY/u.test(migrationRls), "supabase RLS migration");
record("SUPA-MIG-007 RLS migration denies anon/authenticated direct access", /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated/u.test(migrationRls), "supabase RLS migration");
record("SUPA-MIG-007A function hardening migration embeds source hash", migrationSearchPathHardening.includes(`Source SHA-256: ${sha256(searchPathHardening)}`), "set_updated_at hardening source hash");
record("SUPA-MIG-007B function hardening migration fixes search_path", /ALTER FUNCTION public\.set_updated_at\(\)/u.test(migrationSearchPathHardening) && /SET search_path = public, pg_temp/u.test(migrationSearchPathHardening), "set_updated_at hardening migration");
record("SUPA-MIG-008 manifest records all migrations", Array.isArray(manifest.migrations) && manifest.migrations.length === 3, JSON.stringify(manifest.migrations ?? []));
record(
  "SUPA-MIG-009 manifest source hashes match db/postgres",
  manifest.migrations?.[0]?.sourceSha256 === sha256(postgresSchema) &&
    manifest.migrations?.[1]?.sourceSha256 === sha256(rlsPlan) &&
    manifest.migrations?.[2]?.sourceSha256 === sha256(searchPathHardening),
  JSON.stringify(manifest.migrations ?? [])
);
record(
  "SUPA-MIG-009A manifest records CLI migration list readiness",
  manifest.localMigrationList?.command === "supabase migration list" &&
    typeof manifest.localMigrationList.attempted === "boolean" &&
    typeof manifest.localMigrationList.passed === "boolean" &&
    !/postgres(?:ql)?:\/\//iu.test(`${manifest.localMigrationList.stdout ?? ""}\n${manifest.localMigrationList.stderr ?? ""}`),
  JSON.stringify(manifest.localMigrationList ?? null)
);
record(
  "SUPA-MIG-009B absent Supabase CLI is explicit and non-blocking for mirror sync",
  manifest.supabaseCli?.available === true
    ? manifest.localMigrationList?.attempted === true
    : manifest.localMigrationList?.attempted === false &&
        [
          "supabase CLI not found",
          "supabase migration list skipped by PDM_SUPABASE_SKIP_MIGRATION_LIST"
        ].includes(manifest.localMigrationList?.reason),
  JSON.stringify({ supabaseCli: manifest.supabaseCli, localMigrationList: manifest.localMigrationList })
);
record("SUPA-MIG-010 README documents CLI absence fallback", readme.includes("Supabase CLI") && readme.includes("supabase:migrations:sync"), "supabase/README.md");
record("SUPA-MIG-011 README forbids ProJED targets", readme.includes("ProJED") && readme.includes("ProJED_TEST"), "supabase/README.md");
record("SUPA-MIG-012 env example documents Postgres runtime variables", envExample.includes("PDM_POSTGRES_URL=") && envExample.includes("PDM_POSTGRES_ADMIN_URL=") && envExample.includes("PDM_POSTGRES_POOLER_MODE="), ".env.example");
record("SUPA-MIG-013 package exposes sync and QC scripts", packageJson.scripts?.["supabase:migrations:sync"] === "node scripts/sync-supabase-runtime-migrations.mjs" && packageJson.scripts?.["qc:supabase-runtime-migrations"] === "node scripts/qc-supabase-runtime-migrations.mjs", "package.json");
record(
  "SUPA-MIG-014 traceability records migration structure slice",
  devTask.includes("DEV-SUPABASE-DB-001-MIGRATION-HISTORY") &&
    devTask.includes("Supabase CLI") &&
    devTask.includes("Migration history policy") &&
    readme.includes("supabase:migrations:sync") &&
    migrationHistoryPolicy.includes("qc:supabase-runtime-migrations") &&
    migrationHistoryPolicy.includes("supabase migration list"),
  ".ai-doc/dev_task.md + migration policy"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
