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

const requiredMigrationFiles = [
  "supabase/migrations/20260608000100_initial_ai_pdm_schema.sql",
  "supabase/migrations/20260608000200_force_rls_deny_direct_access.sql",
  "supabase/migrations/20260615040619_harden_set_updated_at_search_path.sql",
  "supabase/migrations/20260707000000_numbering_v2_compact_identity.sql",
  "supabase/migrations/20260707010000_access_control_launch_governance.sql",
  "supabase/migrations/20260710020000_account_invitations.sql",
  "supabase/migrations/20260710030000_auth_identities_google_oauth.sql",
  "supabase/migrations/20260712034956_erp_module_foundation.sql",
  "supabase/migrations/20260713010000_account_lifecycle.sql"
];
const requiredFiles = [
  "supabase/README.md",
  "supabase/migrations/manifest.json",
  ...requiredMigrationFiles
];
for (const file of requiredFiles) {
  record(`SUPA-MIG-002 required file exists: ${file}`, projectFileExists(root, file), file);
}

const sqliteSchema = readProjectFile(root, "db/schema.sql");
const postgresSchema = readProjectFile(root, "db/postgres/001_initial_schema.sql");
const rlsPlan = readProjectFile(root, "db/postgres/002_supabase_rls_plan.sql");
const searchPathHardening = readProjectFile(root, "db/postgres/003_harden_set_updated_at_search_path.sql");
const compactNumbering = readProjectFile(root, "db/postgres/004_numbering_v2_compact_identity.sql");
const accessControlLaunch = readProjectFile(root, "db/postgres/005_access_control_launch_governance.sql");
const accountInvitations = readProjectFile(root, "db/postgres/006_account_invitations.sql");
const authIdentities = readProjectFile(root, "db/postgres/007_auth_identities_google_oauth.sql");
const erpModuleFoundation = readProjectFile(root, "db/postgres/008_erp_module_foundation.sql");
const accountLifecycle = readProjectFile(root, "db/postgres/009_account_lifecycle.sql");
const migrationSchema = readProjectFile(root, "supabase/migrations/20260608000100_initial_ai_pdm_schema.sql");
const migrationRls = readProjectFile(root, "supabase/migrations/20260608000200_force_rls_deny_direct_access.sql");
const migrationSearchPathHardening = readProjectFile(root, "supabase/migrations/20260615040619_harden_set_updated_at_search_path.sql");
const migrationCompactNumbering = readProjectFile(root, "supabase/migrations/20260707000000_numbering_v2_compact_identity.sql");
const migrationAccessControlLaunch = readProjectFile(root, "supabase/migrations/20260707010000_access_control_launch_governance.sql");
const migrationAccountInvitations = readProjectFile(root, "supabase/migrations/20260710020000_account_invitations.sql");
const migrationAuthIdentities = readProjectFile(root, "supabase/migrations/20260710030000_auth_identities_google_oauth.sql");
const migrationErpModuleFoundation = readProjectFile(root, "supabase/migrations/20260712034956_erp_module_foundation.sql");
const migrationAccountLifecycle = readProjectFile(root, "supabase/migrations/20260713010000_account_lifecycle.sql");
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
record("SUPA-MIG-007C compact numbering migration embeds source hash", migrationCompactNumbering.includes(`Source SHA-256: ${sha256(compactNumbering)}`), "compact numbering migration source hash");
record("SUPA-MIG-007D compact numbering migration preserves v1/v2 drawing purpose compatibility", /PDM-NUMBERING-V2/u.test(migrationCompactNumbering) && /purpose_code IN \('MA', 'OT', 'M', 'R'\)/u.test(migrationCompactNumbering), "compact numbering migration");
record("SUPA-MIG-007E access-control launch migration embeds source hash", migrationAccessControlLaunch.includes(`Source SHA-256: ${sha256(accessControlLaunch)}`), "access-control launch source hash");
record("SUPA-MIG-007F invitation migration embeds source hash", migrationAccountInvitations.includes(`Source SHA-256: ${sha256(accountInvitations)}`), "account invitation source hash");
record(
  "SUPA-MIG-007G invitation migration stores only token hashes and denies direct access",
  migrationAccountInvitations.includes("token_hash") &&
    !/\btoken\s+TEXT/iu.test(migrationAccountInvitations) &&
    /ENABLE ROW LEVEL SECURITY/u.test(migrationAccountInvitations) &&
    /REVOKE ALL ON TABLE public\.account_invitations FROM anon, authenticated/u.test(migrationAccountInvitations),
  "account invitation security boundary"
);
record("SUPA-MIG-007H auth identity migration embeds source hash", migrationAuthIdentities.includes(`Source SHA-256: ${sha256(authIdentities)}`), "auth identity source hash");
record(
  "SUPA-MIG-007I auth identity migration uses stable provider subjects and denies direct access",
  migrationAuthIdentities.includes("UNIQUE (provider, provider_subject)") &&
    migrationAuthIdentities.includes("account_status") &&
    !/access_token|refresh_token|id_token/iu.test(migrationAuthIdentities) &&
    /ENABLE ROW LEVEL SECURITY/u.test(migrationAuthIdentities) &&
    /REVOKE ALL ON TABLE public\.auth_identities FROM anon, authenticated/u.test(migrationAuthIdentities),
  "auth identity security boundary"
);
record("SUPA-MIG-007J ERP module foundation migration embeds source hash", migrationErpModuleFoundation.includes(`Source SHA-256: ${sha256(erpModuleFoundation)}`), "ERP module foundation source hash");
record(
  "SUPA-MIG-007K ERP module foundation migration enforces RLS and denies direct access",
  [
    "platform_principal_mappings",
    "platform_organization_mappings",
    "platform_command_receipts",
    "platform_outbox_events"
  ].every(
    (tableName) =>
      new RegExp(`ALTER TABLE public\\.${tableName} ENABLE ROW LEVEL SECURITY`, "u").test(migrationErpModuleFoundation) &&
      new RegExp(`ALTER TABLE public\\.${tableName} FORCE ROW LEVEL SECURITY`, "u").test(migrationErpModuleFoundation) &&
      new RegExp(`REVOKE ALL ON TABLE public\\.${tableName} FROM anon, authenticated`, "u").test(migrationErpModuleFoundation)
  ),
  "ERP module foundation security boundary"
);
record("SUPA-MIG-007L account lifecycle migration embeds source hash", migrationAccountLifecycle.includes(`Source SHA-256: ${sha256(accountLifecycle)}`), "account lifecycle source hash");
record(
  "SUPA-MIG-007M account lifecycle migration stores only recovery token hashes and denies direct access",
  migrationAccountLifecycle.includes("session_invalid_before") &&
    migrationAccountLifecycle.includes("identity_lifecycle_version") &&
    migrationAccountLifecycle.includes("account_recovery_requests") &&
    migrationAccountLifecycle.includes("token_hash") &&
    !/\btoken\s+TEXT/iu.test(migrationAccountLifecycle) &&
    /ENABLE ROW LEVEL SECURITY/u.test(migrationAccountLifecycle) &&
    /REVOKE ALL ON TABLE public\.account_recovery_requests FROM anon, authenticated/u.test(migrationAccountLifecycle),
  "account lifecycle security boundary"
);
const manifestTargets = Array.isArray(manifest.migrations)
  ? manifest.migrations.map((migration) => migration.target)
  : [];
record(
  "SUPA-MIG-008 manifest records all migrations",
  JSON.stringify(manifestTargets) === JSON.stringify(requiredMigrationFiles),
  JSON.stringify(manifestTargets)
);
record(
  "SUPA-MIG-009 manifest source hashes match db/postgres",
  manifest.migrations?.[0]?.sourceSha256 === sha256(postgresSchema) &&
    manifest.migrations?.[1]?.sourceSha256 === sha256(rlsPlan) &&
    manifest.migrations?.[2]?.sourceSha256 === sha256(searchPathHardening) &&
    manifest.migrations?.[3]?.sourceSha256 === sha256(compactNumbering) &&
    manifest.migrations?.[4]?.sourceSha256 === sha256(accessControlLaunch) &&
    manifest.migrations?.[5]?.sourceSha256 === sha256(accountInvitations) &&
    manifest.migrations?.[6]?.sourceSha256 === sha256(authIdentities) &&
    manifest.migrations?.[7]?.sourceSha256 === sha256(erpModuleFoundation) &&
    manifest.migrations?.[8]?.sourceSha256 === sha256(accountLifecycle),
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
