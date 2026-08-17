import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
if (String(process.env.PDM_DB_PROVIDER ?? "sqlite").trim().toLowerCase() !== "sqlite") {
  throw new Error("DEV061_LOCAL_SCHEMA_SQLITE_ONLY");
}
const databasePath = path.resolve(process.env.PDM_DEV_061_SQLITE_PATH?.trim() || "data/ai-pdm.sqlite");
if (!fs.existsSync(databasePath)) {
  console.log(JSON.stringify({ script: "apply-dev-061-local-schema", status: "skipped", reason: "database_not_found", database: databasePath }, null, 2));
  process.exit(0);
}

const db = new Database(databasePath);
try {
  db.pragma("foreign_keys = ON");
  const columnNames = new Set(db.prepare("PRAGMA table_info(submission_files)").all().map((column) => column.name));
  const applied = [];
  db.transaction(() => {
    if (!columnNames.has("source_file_asset_id")) {
      db.exec("ALTER TABLE submission_files ADD COLUMN source_file_asset_id TEXT");
      applied.push("submission_files.source_file_asset_id");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_submission_files_source_asset ON submission_files(source_file_asset_id)");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_drawing_revision_package_files_primary_role ON drawing_revision_package_files(package_id, role) WHERE is_primary = 1");
    db.exec("CREATE INDEX IF NOT EXISTS idx_file_assets_active_content_hash ON file_assets(content_hash, file_size, linked_entity_type, linked_entity_id) WHERE deleted_at IS NULL AND content_hash IS NOT NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_shared_cad_model_versions_active_hash ON shared_cad_model_versions(company_id, owner_scope, owner_id, content_hash, status)");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_cad_model_versions_active_owner_hash_unique ON shared_cad_model_versions(company_id, owner_scope, owner_id, content_hash) WHERE status <> 'Obsolete'");
  })();
  console.log(JSON.stringify({ script: "apply-dev-061-local-schema", status: "applied", database: databasePath, applied, destructive: false }, null, 2));
} finally {
  db.close();
}
