#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION,
  buildStorageSchemaMigrationPackage,
  writeStorageSchemaMigrationPackage
} from "./generate-file-storage-schema-migration-package.mjs";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

try {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-schema-package-qc-"));
  const packageJson = await fsp.readFile(path.resolve("package.json"), "utf8");
  const generatorSource = await fsp.readFile(path.resolve("scripts/generate-file-storage-schema-migration-package.mjs"), "utf8");
  const externalLargeFileRepositorySource = await fsp.readFile(
    path.resolve("src/lib/repositories/external-large-file-intake-async-repository.ts"),
    "utf8"
  );
  const planSource = await fsp.readFile(
    path.resolve(".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md"),
    "utf8"
  );
  const devTaskSource = await fsp.readFile(path.resolve(".ai-doc/dev_task.md"), "utf8");

  const report = buildStorageSchemaMigrationPackage();
  const outputs = await writeStorageSchemaMigrationPackage(report, tempRoot);
  const sql = report.sql;

  record("STORAGE-SCHEMA-MIGRATION-001 package version is stable", report.packageVersion === STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION);
  record("STORAGE-SCHEMA-MIGRATION-002 package is proposal-only", report.status === "proposal_only_not_applied" && report.assumptions.noMigrationApplied === true);
  record(
    "STORAGE-SCHEMA-MIGRATION-003 proposal defines provider registry",
    /CREATE TABLE IF NOT EXISTS storage_providers/i.test(sql) &&
      /provider_id TEXT PRIMARY KEY/i.test(sql) &&
      /capabilities_json JSONB NOT NULL/i.test(sql)
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-004 proposal defines storage object contract used by repository",
    /CREATE TABLE IF NOT EXISTS storage_objects/i.test(sql) &&
      ["object_id", "provider_id", "bucket", "object_key", "content_hash", "hash_algorithm", "byte_size", "lifecycle_tier", "object_status"].every(
        (column) => sql.includes(column)
      ) &&
      externalLargeFileRepositorySource.includes("INSERT INTO storage_objects")
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-005 proposal defines storage reference contract used by repository",
    /CREATE TABLE IF NOT EXISTS storage_object_references/i.test(sql) &&
      ["reference_id", "object_id", "linked_entity_type", "linked_entity_id", "file_role", "filename", "reference_status"].every((column) =>
        sql.includes(column)
      ) &&
      externalLargeFileRepositorySource.includes("INSERT INTO storage_object_references")
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-006 proposal preserves provider-neutral uniqueness",
    sql.includes("UNIQUE (provider_id, bucket, object_key)") &&
      sql.includes("UNIQUE (object_id, linked_entity_type, linked_entity_id, file_role, filename)")
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-007 proposal indexes lookup and dedup paths",
    sql.includes("idx_storage_objects_provider_key") &&
      sql.includes("idx_storage_objects_hash") &&
      sql.includes("idx_storage_object_references_entity")
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-008 proposal seeds disabled non-local providers",
    sql.includes("'local_repository'") &&
      sql.includes("'supabase_storage'") &&
      sql.includes("'s3_compatible'") &&
      sql.includes("'nas_gateway'") &&
      sql.includes("'supabase_storage', 'supabase_storage'") &&
      sql.includes("FALSE)")
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-009 RLS is enabled for public schema storage tables",
    ["storage_providers", "storage_objects", "storage_object_references"].every((table) =>
      sql.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    )
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-010 RLS is forced for public schema storage tables",
    ["storage_providers", "storage_objects", "storage_object_references"].every((table) =>
      sql.includes(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
    ) &&
      report.assumptions.rlsForcedForPublicSchemaTables === true
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-011 Data API grants are fail-closed by default",
    sql.includes("REVOKE ALL ON TABLE storage_providers, storage_objects, storage_object_references FROM anon, authenticated") &&
      sql.includes("REVOKE ALL ON TABLE storage_providers, storage_objects, storage_object_references FROM PUBLIC") &&
      !/GRANT\s+(SELECT|INSERT|UPDATE|DELETE)/i.test(sql)
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-012 proposal avoids provider enum CHECK",
    !/CHECK\s*\(\s*provider_id\s+IN/i.test(sql) && !/CHECK\s*\(\s*provider_kind\s+IN/i.test(sql)
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-013 proposal includes rollback and advisor review gates",
    report.reviewChecklist.some((item) => item.check === "supabase_advisors") &&
      report.reviewChecklist.some((item) => item.check === "rollback") &&
      report.reviewChecklist.some((item) => item.check === "db_runtime_gate")
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-014 output files are written",
    (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)) && (await exists(outputs.sqlPath))
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-015 package scripts are registered",
    packageJson.includes('"storage:schema-migration-package"') && packageJson.includes('"qc:file-storage-schema-migration-package"')
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-016 PM evidence references Phase 5J",
    planSource.includes("Phase 5J") && devTaskSource.includes("Phase 5J")
  );
  record(
    "STORAGE-SCHEMA-MIGRATION-017 generator does not write official migration directories",
    !generatorSource.includes("db/postgres") && !generatorSource.includes("supabase/migrations")
  );

  const serialized = JSON.stringify(report);
  record(
    "STORAGE-SCHEMA-MIGRATION-018 package output does not expose common cloud secret markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(serialized)
  );

  await fsp.rm(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
