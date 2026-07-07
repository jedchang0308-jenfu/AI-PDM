#!/usr/bin/env node

import Database from "better-sqlite3";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function extractSqlConstant(source, name) {
  const templateMatch = source.match(new RegExp(`export const ${name} = ` + "`" + `([\\s\\S]*?)` + "`", "u"));
  return templateMatch?.[1] ?? "";
}

try {
  const packageJson = readProjectJson(root, "package.json");
  const schema = readProjectFile(root, "db/schema.sql");
  const postgresSchema = readProjectFile(root, "db/postgres/001_initial_schema.sql");
  const rlsPlan = readProjectFile(root, "db/postgres/002_supabase_rls_plan.sql");
  const dbRuntime = readProjectFile(root, "src/lib/db.ts");
  const repository = readProjectFile(root, "src/lib/repositories/settings-secret-async-repository.ts");
  const lifecycle = readProjectFile(root, "src/lib/settings-secret-lifecycle.ts");
  const settingsRoute = readProjectFile(root, "src/app/api/settings/route.ts");
  const listRoute = readProjectFile(root, "src/app/api/settings/secrets/route.ts");
  const draftRoute = readProjectFile(root, "src/app/api/settings/secrets/[kind]/draft/route.ts");
  const testRoute = readProjectFile(root, "src/app/api/settings/secrets/[kind]/test/route.ts");
  const activateRoute = readProjectFile(root, "src/app/api/settings/secrets/[kind]/activate/route.ts");
  const revokeRoute = readProjectFile(root, "src/app/api/settings/secrets/[kind]/revoke/route.ts");
  const settingsPage = readProjectFile(root, "src/app/settings/page.tsx");
  const integrationsPage = readProjectFile(root, "src/app/settings/integrations/page.tsx");
  const securityPage = readProjectFile(root, "src/app/settings/security/page.tsx");
  const workflowPage = readProjectFile(root, "src/app/settings/workflow/page.tsx");
  const systemPage = readProjectFile(root, "src/app/settings/system/page.tsx");

  record(
    "SETTINGS-SECRET-001 package script is registered",
    packageJson.scripts?.["qc:pdm-settings-center-secret-lifecycle"] === "node scripts/qc-pdm-settings-center-secret-lifecycle.mjs"
  );
  record(
    "SETTINGS-SECRET-002 sqlite schema has metadata tables",
    includesAll(schema, ["CREATE TABLE IF NOT EXISTS secret_references", "CREATE TABLE IF NOT EXISTS setting_test_runs", "CREATE TABLE IF NOT EXISTS setting_activation_events"])
  );
  record(
    "SETTINGS-SECRET-003 postgres schema has metadata tables",
    includesAll(postgresSchema, ["CREATE TABLE IF NOT EXISTS secret_references", "CREATE TABLE IF NOT EXISTS setting_test_runs", "CREATE TABLE IF NOT EXISTS setting_activation_events"])
  );
  record("SETTINGS-SECRET-004 active secret uniqueness is enforced", schema.includes("idx_secret_references_kind_active_unique") && postgresSchema.includes("idx_secret_references_kind_active_unique"));
  record("SETTINGS-SECRET-005 Supabase RLS plan includes secret metadata tables", includesAll(rlsPlan, ["secret_references", "setting_test_runs", "setting_activation_events"]));
  record("SETTINGS-SECRET-006 runtime sqlite initializer ensures secret schema", includesAll(dbRuntime, ["ensureSettingsSecretLifecycleSchema", "secret_references", "idx_secret_references_kind_active_unique"]));

  record("SETTINGS-SECRET-007 repository uses async provider only", repository.includes("AsyncDatabaseClient") && !repository.includes("getDb(") && !repository.includes("better-sqlite3"));
  record(
    "SETTINGS-SECRET-008 lifecycle has local test double and live Vault gate",
    includesAll(lifecycle, ["LocalTestDoubleSecretProvider", "SupabaseVaultSecretProvider", "SUPABASE_VAULT_LIVE_GATE_REQUIRED", "vault.create_secret"])
  );
  record("SETTINGS-SECRET-009 lifecycle stores fingerprint/masked hint, not legacy system_settings", !lifecycle.includes("setSystemSetting") && includesAll(lifecycle, ["maskedHint", "fingerprint"]));
  record("SETTINGS-SECRET-010 legacy settings route has no secret material fields", !/solidworks.*(?:api[_-]?key|secret)|secretValue|vault_secret_id/iu.test(settingsRoute));

  for (const [name, source] of [
    ["list", listRoute],
    ["draft", draftRoute],
    ["test", testRoute],
    ["activate", activateRoute],
    ["revoke", revokeRoute]
  ]) {
    record(`SETTINGS-SECRET-011 ${name} route requires Admin`, source.includes("requireRoleAsync") && source.includes('["Admin"]'));
  }

  record("SETTINGS-SECRET-012 UI uses password field and never displays secret value", settingsPage.includes('type="password"') && settingsPage.includes('autoComplete="new-password"') && !settingsPage.includes("solidworks_api_key"));
  record("SETTINGS-SECRET-013 UI exposes settings center areas", includesAll(settingsPage, ["settings-overview", "settings-integrations", "settings-security", "settings-workflow", "settings-system"]));
  record(
    "SETTINGS-SECRET-014 settings subpage routes exist",
    [integrationsPage, securityPage, workflowPage, systemPage].every((source) => source.includes("SettingsPage"))
  );
  record("SETTINGS-SECRET-015 UI calls server APIs only", includesAll(settingsPage, ["/api/settings/secrets", "/api/settings/secrets/solidworks_document_manager/draft"]) && !settingsPage.includes("vault.decrypted_secrets"));

  const insertReferenceSql = extractSqlConstant(repository, "INSERT_SECRET_REFERENCE_SQL");
  const insertTestRunSql = extractSqlConstant(repository, "INSERT_SECRET_TEST_RUN_SQL");
  const markTestedSql = extractSqlConstant(repository, "UPDATE_SECRET_REFERENCE_TESTED_SQL");
  const retireActiveSql = extractSqlConstant(repository, "RETIRE_ACTIVE_SECRET_REFERENCES_SQL");
  const activateSql = extractSqlConstant(repository, "ACTIVATE_SECRET_REFERENCE_SQL");
  const maxVersionSql = extractSqlConstant(repository, "SELECT_SECRET_REFERENCE_MAX_VERSION_SQL");

  record("SETTINGS-SECRET-016 repository SQL constants are extractable", [insertReferenceSql, insertTestRunSql, markTestedSql, retireActiveSql, activateSql, maxVersionSql].every(Boolean));

  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users (id) VALUES ('user-admin-demo');
    CREATE TABLE secret_references (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      vault_provider TEXT NOT NULL DEFAULT 'local_test_double' CHECK (vault_provider IN ('local_test_double', 'supabase_vault')),
      vault_secret_id TEXT NOT NULL,
      masked_hint TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('draft', 'tested', 'active', 'retired', 'revoked')),
      version INTEGER NOT NULL CHECK (version > 0),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      tested_at TEXT,
      activated_by TEXT,
      activated_at TEXT,
      retired_by TEXT,
      retired_at TEXT,
      revoked_by TEXT,
      revoked_at TEXT,
      revoke_reason TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE (kind, version)
    );
    CREATE UNIQUE INDEX idx_secret_references_kind_active_unique
      ON secret_references(kind)
      WHERE lifecycle_status = 'active';
    CREATE TABLE setting_test_runs (
      id TEXT PRIMARY KEY,
      secret_reference_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      result_status TEXT NOT NULL CHECK (result_status IN ('passed', 'failed', 'blocked')),
      summary TEXT NOT NULL,
      redacted_error TEXT,
      artifact_path TEXT,
      tested_by TEXT NOT NULL,
      tested_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
  `);

  database.prepare(insertReferenceSql).run({
    id: "secret-ref-1",
    kind: "solidworks_document_manager",
    provider: "solidworks_document_manager",
    displayName: "SolidWorks Document Manager API key",
    vaultProvider: "local_test_double",
    vaultSecretId: "local-test-double:solidworks_document_manager:1",
    maskedHint: "len:16;ending:1234",
    fingerprint: "fingerprint-a",
    lifecycleStatus: "draft",
    version: 1,
    createdBy: "user-admin-demo",
    createdAt: "2026-07-06T00:00:00.000Z",
    metadataJson: JSON.stringify({ plaintextPersisted: false })
  });
  database.prepare(insertTestRunSql).run({
    id: "setting-test-1",
    secretReferenceId: "secret-ref-1",
    kind: "solidworks_document_manager",
    provider: "solidworks_document_manager",
    resultStatus: "passed",
    summary: "metadata lifecycle only",
    redactedError: null,
    artifactPath: null,
    testedBy: "user-admin-demo",
    testedAt: "2026-07-06T00:01:00.000Z",
    metadataJson: "{}"
  });
  database.prepare(markTestedSql).run({ id: "secret-ref-1", lifecycleStatus: "tested", testedAt: "2026-07-06T00:01:00.000Z" });
  database.prepare(activateSql).run({ id: "secret-ref-1", activatedBy: "user-admin-demo", activatedAt: "2026-07-06T00:02:00.000Z" });
  database.prepare(insertReferenceSql).run({
    id: "secret-ref-2",
    kind: "solidworks_document_manager",
    provider: "solidworks_document_manager",
    displayName: "SolidWorks Document Manager API key",
    vaultProvider: "local_test_double",
    vaultSecretId: "local-test-double:solidworks_document_manager:2",
    maskedHint: "len:16;ending:5678",
    fingerprint: "fingerprint-b",
    lifecycleStatus: "tested",
    version: 2,
    createdBy: "user-admin-demo",
    createdAt: "2026-07-06T00:03:00.000Z",
    metadataJson: "{}"
  });
  database.prepare(retireActiveSql).run({
    kind: "solidworks_document_manager",
    exceptId: "secret-ref-2",
    retiredBy: "user-admin-demo",
    retiredAt: "2026-07-06T00:04:00.000Z"
  });
  database.prepare(activateSql).run({ id: "secret-ref-2", activatedBy: "user-admin-demo", activatedAt: "2026-07-06T00:05:00.000Z" });

  const rows = database.prepare("SELECT id, lifecycle_status FROM secret_references ORDER BY version").all();
  const nextVersion = database.prepare(maxVersionSql).get({ kind: "solidworks_document_manager" });
  record(
    "SETTINGS-SECRET-017 SQLite semantics retire previous active and activate latest",
    rows[0]?.lifecycle_status === "retired" && rows[1]?.lifecycle_status === "active",
    JSON.stringify(rows)
  );
  record("SETTINGS-SECRET-018 SQLite semantics next version is based on max", Number(nextVersion?.version) === 2, JSON.stringify(nextVersion));
  database.close();

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
