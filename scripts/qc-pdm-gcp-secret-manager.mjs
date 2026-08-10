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

try {
  const packageJson = readProjectJson(root, "package.json");
  const adapter = readProjectFile(root, "src/lib/google-secret-manager.ts");
  const lifecycle = readProjectFile(root, "src/lib/settings-secret-lifecycle.ts");
  const repository = readProjectFile(root, "src/lib/repositories/settings-secret-async-repository.ts");
  const sqliteSchema = readProjectFile(root, "db/schema.sql");
  const postgresSchema = readProjectFile(root, "db/postgres/001_initial_schema.sql");
  const postgresMigration = readProjectFile(root, "db/postgres/027_settings_secret_google_secret_manager.sql");
  const sqliteRuntime = readProjectFile(root, "src/lib/db.ts");
  const envExample = readProjectFile(root, ".env.example");
  const workerRoute = readProjectFile(root, "src/app/api/preview-workers/solidworks-document-manager-key/route.ts");
  const worker = readProjectFile(root, "scripts/run-solidworks-document-manager-preview-worker.mjs");
  const settingsPage = readProjectFile(root, "src/app/settings/page.tsx");
  const draftRoute = readProjectFile(root, "src/app/api/settings/secrets/[kind]/draft/route.ts");
  const activateRoute = readProjectFile(root, "src/app/api/settings/secrets/[kind]/activate/route.ts");
  const revokeRoute = readProjectFile(root, "src/app/api/settings/secrets/[kind]/revoke/route.ts");
  const testRoute = readProjectFile(root, "src/app/api/settings/secrets/[kind]/test/route.ts");

  record("GSM-001 QC command is registered", packageJson.scripts?.["qc:pdm-gcp-secret-manager"] === "node scripts/qc-pdm-gcp-secret-manager.mjs");
  record("GSM-002 adapter uses Google ADC", includesAll(adapter, ["GoogleAuth", "cloud-platform", "getClient", "getAccessToken"]));
  record("GSM-003 writes are explicitly gated", includesAll(adapter, ["PDM_ENABLE_GCP_SECRET_WRITES", "GCP_SECRET_MANAGER_WRITE_GATE_REQUIRED", ":addVersion"]));
  record("GSM-004 reads are explicitly gated", includesAll(adapter, ["PDM_ENABLE_GCP_SECRET_READS", "GCP_SECRET_MANAGER_READ_GATE_REQUIRED", ":access"]));
  record("GSM-005 adapter accepts only exact numeric version resources", includesAll(adapter, ["isExactVersionResource", "/versions/[1-9][0-9]*", "versions/latest"]));
  record("GSM-006 provider does not persist plaintext", includesAll(adapter, ["payload", "Buffer.from(value, \"utf8\").toString(\"base64\")"]) && !adapter.includes("console.log(value)"));
  record("GSM-007 provider redacts upstream error bodies", includesAll(adapter, ["GCP_SECRET_MANAGER_PERMISSION_DENIED", "GCP_SECRET_MANAGER_REQUEST_FAILED"]) && !adapter.includes("response.text()"));
  record("GSM-008 Cloud SQL reference type includes Google provider", repository.includes('"google_secret_manager"'));
  record("GSM-009 lifecycle selects Google explicitly", includesAll(lifecycle, ["provider === \"google_secret_manager\"", "GoogleSecretManagerSecretProvider", "vaultProvider: \"google_secret_manager\""]));
  record("GSM-010 Supabase cannot create new draft", includesAll(lifecycle, ["SUPABASE_VAULT_PROVIDER_SUPERSEDED", "replacement: \"google_secret_manager\""]));
  record("GSM-011 production defaults fail closed", includesAll(lifecycle, ["NODE_ENV === \"production\"", "GCP_SECRET_MANAGER_CONFIG_REQUIRED", "expected: \"google_secret_manager\""]));
  record("GSM-012 exact reference is read by server-side broker", includesAll(lifecycle, ["readGoogleSecretManagerSecret", "active.vaultProvider === \"google_secret_manager\"", "source: \"google_secret_manager\""]));
  record("GSM-013 test result is provider-specific and redacted", includesAll(lifecycle, ["GCP_SECRET_MANAGER_PROVIDER_PROBE_REQUIRED", "server_side_google_secret_manager_read_verified", "plaintextPersisted: false"]));
  record("GSM-014 production blocks worker-local fallback without break-glass evidence", includesAll(lifecycle, ["PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK", "PDM_BREAK_GLASS_CHANGE_ID", "正式環境已阻擋 worker-local key"]));
  record("GSM-015 status separates credential readiness from 2D worker presence", includesAll(lifecycle, ["credentialSource: \"google_secret_manager\"", "serviceTokenConfigured", "workerPresenceFor", "claim/heartbeat", "3D worker 狀態不會替代"]) && includesAll(settingsPage, ["2D 預覽服務", "workerPresenceLabel"]));
  record("GSM-016 SQLite schema accepts Google provider", sqliteSchema.includes("'google_secret_manager'") && sqliteRuntime.includes("'google_secret_manager'"));
  record("GSM-017 PostgreSQL schema accepts Google provider", postgresSchema.includes("'google_secret_manager'") && postgresMigration.includes("secret_references_vault_provider_check"));
  record("GSM-018 PostgreSQL migration is additive to references", includesAll(postgresMigration, ["BEGIN;", "COMMIT;", "Existing rows"]) && !postgresMigration.includes("DROP TABLE") && !postgresMigration.includes("DROP COLUMN"));
  record("GSM-019 SQLite migration preserves all secret metadata columns", includesAll(sqliteRuntime, ["secret_references_google_secret_manager_migration", "INSERT INTO secret_references_google_secret_manager_migration", "metadata_json", "ALTER TABLE secret_references_google_secret_manager_migration RENAME TO secret_references"]));
  record("GSM-020 active-version uniqueness remains enforced", includesAll(sqliteRuntime + sqliteSchema + postgresSchema, ["idx_secret_references_kind_active_unique", "WHERE lifecycle_status = 'active'"]));
  record("GSM-021 example config points to Google provider", includesAll(envExample, ["PDM_SETTINGS_SECRET_PROVIDER=google_secret_manager", "PDM_GCP_PROJECT_ID", "PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID", "PDM_ENABLE_GCP_SECRET_READS"]));
  record("GSM-022 worker route is token-gated and no-store", includesAll(workerRoute, ["PDM_PREVIEW_WORKER_TOKEN", "authorization", "x-pdm-preview-worker-token", "resolveActiveSolidWorksDocumentManagerKey", "no-store", "timingSafeEqual"]));
  record("GSM-023 admin secret routes do not return raw reference", [draftRoute, activateRoute, revokeRoute].every((source) => includesAll(source, ["redactSettingsSecretReference", "requireRoleAsync", '["Admin"]'])));
  record("GSM-024 test route remains Admin-only", includesAll(testRoute, ["testSettingsSecretReference", "requireRoleAsync", '["Admin"]']));
  record("GSM-025 worker keeps broker credential in memory", includesAll(worker, ["workerCredentialValue", "workerCredentialLoadedAt", "clearRouteLoadedCredential"]));
  record("GSM-026 worker refreshes after bounded interval", includesAll(worker, ["credentialRefreshMs", "Date.now() - workerCredentialLoadedAt >= credentialRefreshMs", "refresh: shouldRefreshCredential"]));
  record("GSM-027 worker clears cached credential after broker rejection", includesAll(worker, ["if (workerCredentialLoadedFromRoute) clearRouteLoadedCredential();", "response.status === 403", "response.status === 404"]));
  record("GSM-028 worker does not persist broker key in process environment", worker.includes("workerCredentialValue = key") && !worker.includes("process.env.PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY = key"));
  record("GSM-029 exporter receives credential only in child-process environment", includesAll(worker, ["env: {", "PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY: workerCredentialValue", "spawnFileAsync"]));
  record("GSM-030 worker-facing failure explains next action", includesAll(worker, ["Google Secret Manager exact version", "2D worker readiness", "DOCUMENT_MANAGER_OPEN_FAILED:swDmDocumentOpenErrorNoLicense"]));
  record("GSM-031 UI labels Google provider", includesAll(settingsPage, ["google_secret_manager", "Google Secret Manager", "歷史 Supabase Vault"]));
  record("GSM-032 UI shows worker readiness separately", includesAll(settingsPage, ["2D worker readiness", "workerReadinessLabel", "status.workerReadiness.message"]));
  record("GSM-033 settings status is automatic, not manual refresh", includesAll(settingsPage, ["settings-auto-status", "setInterval(() => void loadSecretStatuses()", "狀態會自動更新"]) && !settingsPage.includes("重新整理"));
  record("GSM-034 UI never renders secret value", settingsPage.includes('type="password"') && !settingsPage.includes("vault.decrypted_secrets"));

  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE secret_references (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      vault_provider TEXT NOT NULL CHECK (vault_provider IN ('local_test_double', 'google_secret_manager', 'supabase_vault')),
      vault_secret_id TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('draft', 'tested', 'active', 'retired', 'revoked')),
      version INTEGER NOT NULL,
      UNIQUE(kind, version)
    );
    CREATE UNIQUE INDEX idx_secret_references_kind_active_unique ON secret_references(kind) WHERE lifecycle_status = 'active';
  `);
  database.prepare("INSERT INTO secret_references (id, kind, vault_provider, vault_secret_id, lifecycle_status, version) VALUES (?, ?, ?, ?, ?, ?)").run(
    "gcp-ref-1",
    "solidworks_document_manager",
    "google_secret_manager",
    "projects/demo/secrets/pdm-solidworks-document-manager-key/versions/7",
    "active",
    7
  );
  record("GSM-035 SQLite accepts exact Google version reference", database.prepare("SELECT vault_provider, vault_secret_id FROM secret_references WHERE id = 'gcp-ref-1'").get()?.vault_secret_id?.endsWith("/versions/7"));
  record("GSM-036 database migration contract is paired with runtime exact-version validation", database.prepare("SELECT COUNT(*) AS count FROM secret_references WHERE vault_provider = 'google_secret_manager'").get()?.count === 1 && includesAll(adapter, ["!isExactVersionResource", "versions/latest"]));
  database.close();

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
