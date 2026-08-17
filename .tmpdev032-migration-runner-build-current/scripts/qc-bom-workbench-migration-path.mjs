#!/usr/bin/env node

import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function tableBlock(sql, tableName) {
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\([\\s\\S]*?\\n\\);`, "u"));
  return match?.[0] ?? "";
}

function hasAll(source, texts) {
  return texts.every((text) => source.includes(text));
}

const sqlite = readProjectFile(root, "db/schema.sql");
const postgres = readProjectFile(root, "db/postgres/001_initial_schema.sql");
const contracts = readProjectFile(root, "src/lib/repositories/contracts.ts");
const repository = readProjectFile(root, "src/lib/repositories/bom-repository.ts");
const packageJson = readProjectJson(root, "package.json");

for (const table of ["bom_drafts", "bom_lines_tree", "bom_import_profiles", "bom_import_jobs", "file_assets"]) {
  record(`BOM-MIG-001 SQLite has ${table}`, tableBlock(sqlite, table).length > 0, `db/schema.sql:${table}`);
  record(`BOM-MIG-002 Postgres has ${table}`, tableBlock(postgres, table).length > 0, `db/postgres/001_initial_schema.sql:${table}`);
}

const sqliteDrafts = tableBlock(sqlite, "bom_drafts");
const postgresDrafts = tableBlock(postgres, "bom_drafts");
record(
  "BOM-MIG-003 draft source enum is portable",
  hasAll(sqliteDrafts, ["'cad_reference'", "'solidworks_xls'", "'manual'"]) && hasAll(postgresDrafts, ["'cad_reference'", "'solidworks_xls'", "'manual'"]),
  "bom_drafts.source"
);

const sqliteLines = tableBlock(sqlite, "bom_lines_tree");
const postgresLines = tableBlock(postgres, "bom_lines_tree");
record(
  "BOM-MIG-004 line source metadata is portable",
  hasAll(sqliteLines, ["source_priority", "source_ref_id", "source_filename"]) && hasAll(postgresLines, ["source_priority", "source_ref_id", "source_filename"]),
  "bom_lines_tree source metadata"
);

const sqliteImportProfiles = tableBlock(sqlite, "bom_import_profiles");
const postgresImportProfiles = tableBlock(postgres, "bom_import_profiles");
record(
  "BOM-MIG-005 import profile versioning is portable",
  hasAll(sqliteImportProfiles, ["profile_name", "version", "UNIQUE (profile_name, version)"]) &&
    hasAll(postgresImportProfiles, ["profile_name", "version", "UNIQUE (profile_name, version)"]),
  "bom_import_profiles"
);
record(
  "BOM-MIG-006 profile mapping payload column is portable",
  sqliteImportProfiles.includes("mapping_json TEXT NOT NULL") && postgresImportProfiles.includes("mapping_json TEXT NOT NULL"),
  "mapping_json TEXT"
);

const sqliteImportJobs = tableBlock(sqlite, "bom_import_jobs");
const postgresImportJobs = tableBlock(postgres, "bom_import_jobs");
record(
  "BOM-MIG-007 import job original file linkage is portable",
  hasAll(sqliteImportJobs, ["source_asset_id", "original_filename", "created_by", "created_at"]) &&
    hasAll(postgresImportJobs, ["source_asset_id", "original_filename", "created_by", "created_at"]),
  "bom_import_jobs"
);
record(
  "BOM-MIG-008 import job metadata payload column is portable",
  sqliteImportJobs.includes("error_json TEXT") && postgresImportJobs.includes("error_json TEXT"),
  "error_json TEXT"
);

const sqliteAssets = tableBlock(sqlite, "file_assets");
const postgresAssets = tableBlock(postgres, "file_assets");
record(
  "BOM-MIG-009 file asset storage fields are Supabase-ready",
  hasAll(sqliteAssets, ["'supabase_storage'", "storage_key", "content_hash", "sync_status"]) &&
    hasAll(postgresAssets, ["'supabase_storage'", "storage_key", "content_hash", "sync_status"]),
  "file_assets storage metadata"
);

record(
  "BOM-MIG-010 repository writes import assets through file_assets",
  repository.includes("INSERT INTO file_assets") && repository.includes("storageKey") && repository.includes("content_hash"),
  "src/lib/repositories/bom-repository.ts"
);
record(
  "BOM-MIG-011 repository contract includes SolidWorks import boundary",
  contracts.includes("createWorkbenchDraftFromSolidWorksXls") && contracts.includes("getImportJobById") && contracts.includes("BomImportJob"),
  "src/lib/repositories/contracts.ts"
);
record(
  "BOM-MIG-012 first version remains SQLite provider only",
  readProjectFile(root, "src/lib/db-provider.ts").includes("Only sqlite is available in this build.") && !packageJson.dependencies?.["@supabase/supabase-js"],
  "src/lib/db-provider.ts/package.json"
);
record(
  "BOM-MIG-013 package exposes migration path QC",
  packageJson.scripts?.["qc:bom-workbench-migration-path"] === "node scripts/qc-bom-workbench-migration-path.mjs",
  "package.json"
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

if (failed.length > 0) process.exitCode = 1;
