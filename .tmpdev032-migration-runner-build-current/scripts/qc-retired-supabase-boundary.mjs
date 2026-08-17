#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

try {
  const packageJson = readJson("package.json");
  const authority = readJson("config/platform/formal-authority-policy.json");
  const envExample = read(".env.example");
  const storage = read("src/lib/file-storage.ts");
  const secretLifecycle = read("src/lib/settings-secret-lifecycle.ts");
  const databaseProvider = read("src/lib/db-async-provider.ts");
  const targetGuard = read("scripts/postgres-shadow-target-guard-utils.mjs");
  const archiveReadme = read(".ai-doc/archived/legacy-supabase-migration-mirror/README.md");
  const archiveManifest = readJson(".ai-doc/archived/legacy-supabase-migration-mirror/migrations/manifest.json");
  const scripts = fs.readdirSync(path.join(root, "scripts"));

  record("RETIRED-SUPABASE-001 Cloud SQL is the database authority", authority.database?.productionAuthority === "cloud_sql_postgres");
  record("RETIRED-SUPABASE-002 GCS is the file authority", authority.files?.productionAuthority === "google_cloud_storage");
  record("RETIRED-SUPABASE-003 top-level Supabase workspace is absent", !exists("supabase"));
  record("RETIRED-SUPABASE-004 migration mirror is archived", archiveReadme.includes("Immutable audit archive") && archiveManifest.supabaseCli?.available === false);

  const allowedSupabaseScriptNames = new Set(["qc:retired-supabase-boundary"]);
  const unsafePackageScripts = Object.entries(packageJson.scripts ?? {}).filter(([name, command]) => {
    if (allowedSupabaseScriptNames.has(name)) return false;
    return /supabase/iu.test(name) || /(?:qc-supabase-|sync-supabase|supabase\s+migration|run-with-local-env)/iu.test(String(command));
  });
  record("RETIRED-SUPABASE-005 package exposes no Supabase command", unsafePackageScripts.length === 0, JSON.stringify(unsafePackageScripts));
  const retiredStorageSchemaCommands = [
    "storage:schema-migration-package",
    "storage:schema-apply-gate",
    "storage:schema-verify-gate",
    "storage:schema-target-readiness",
    "storage:schema-target-readiness-package",
    "storage:schema-target-cost-confirmation-package",
    "storage:schema-advisor-evidence",
    "storage:schema-promotion-gate",
    "storage:schema-formal-review-package",
    "storage:schema-user-cost-confirmation-evidence",
    "storage:schema-target-create-request",
    "storage:schema-target-connector-receipt-evidence",
    "storage:schema-target-create-result-evidence",
    "storage:schema-target-provisioning-execution-package"
  ];
  record(
    "RETIRED-SUPABASE-005A package hides the retired storage-schema provisioning lane",
    retiredStorageSchemaCommands.every((name) => !(name in (packageJson.scripts ?? {})))
  );
  const retiredStorageSchemaGenerators = retiredStorageSchemaCommands.map((name) => `scripts/generate-file-${name.replace("storage:", "storage-").replaceAll(":", "-")}.mjs`);
  record(
    "RETIRED-SUPABASE-005B retained historical generators are hard-blocked",
    retiredStorageSchemaGenerators.every((relativePath) => exists(relativePath) && read(relativePath).includes('import "./retired-supabase-tooling-block.mjs"')) &&
      read("scripts/retired-supabase-tooling-block.mjs").includes("SUPABASE_TOOLING_RETIRED_USE_GCP")
  );
  record(
    "RETIRED-SUPABASE-005C retired Supabase shadow handoff is hidden and blocked",
    !("postgres-shadow:handoff" in (packageJson.scripts ?? {})) &&
      !("qc:postgres-shadow-handoff-package" in (packageJson.scripts ?? {})) &&
      read("scripts/prepare-postgres-shadow-handoff.mjs").includes('import "./retired-supabase-tooling-block.mjs"')
  );
  record(
    "RETIRED-SUPABASE-006 retired boundary is in the DEV-052 gate",
    String(packageJson.scripts?.["qc:dev-052-phase1d"] ?? "").includes("qc:retired-supabase-boundary")
  );

  const unsafeScriptFiles = scripts.filter((name) => /^qc-supabase-.*\.mjs$/iu.test(name) || ["sync-supabase-runtime-migrations.mjs", "run-with-local-env.mjs"].includes(name));
  record("RETIRED-SUPABASE-007 live/staging helper scripts are absent", unsafeScriptFiles.length === 0, unsafeScriptFiles.join(", "));
  record("RETIRED-SUPABASE-008 environment template has no Supabase credentials or gates", !/PDM_(?:ENABLE_)?SUPABASE|SUPABASE_(?:URL|SERVICE_ROLE)/u.test(envExample));

  record(
    "RETIRED-SUPABASE-009 Storage keeps historical pointer identity but no live adapter",
    storage.includes('"supabase_storage"') &&
      storage.includes("RetiredSupabaseStorageAdapter") &&
      storage.includes("SUPABASE_STORAGE_RETIRED_USE_GCS") &&
      !storage.includes("/storage/v1/") &&
      !storage.includes("PDM_SUPABASE") &&
      !storage.includes("serviceRoleKey")
  );
  const storageMigrationDryRun = read("scripts/generate-file-storage-migration-dry-run.mjs");
  record(
    "RETIRED-SUPABASE-009A storage migration planning defaults to GCS and rejects Supabase",
    storageMigrationDryRun.includes('DEFAULT_TARGET_PROVIDER = "google_cloud_storage"') &&
      storageMigrationDryRun.includes("SUPABASE_STORAGE_RETIRED_USE_GCS:migration_dry_run")
  );
  record(
    "RETIRED-SUPABASE-010 Vault keeps historical metadata but no read/write SQL",
    secretLifecycle.includes('provider === "supabase_vault"') &&
      secretLifecycle.includes("SUPABASE_VAULT_PROVIDER_SUPERSEDED") &&
      !secretLifecycle.includes("SupabaseVaultSecretProvider") &&
      !secretLifecycle.includes("vault.create_secret") &&
      !secretLifecycle.includes("vault.decrypted_secrets") &&
      !secretLifecycle.includes("PDM_ENABLE_SUPABASE")
  );
  record("RETIRED-SUPABASE-011 database runtime has no Supabase provider", !/kind:\s*"supabase/iu.test(databaseProvider));
  record(
    "RETIRED-SUPABASE-012 forbidden legacy projects remain fail-closed",
    targetGuard.includes("knodlkxqpcqyrtgwpdst") && targetGuard.includes("fhisnnufoeulxqrchldf") && targetGuard.includes("forbidden_supabase_project")
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
