import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const databasePath = path.resolve(process.env.PDM_DEV_061_SQLITE_PATH?.trim() || "data/ai-pdm.sqlite");
const applyRequested = process.argv.includes("--apply");
if (applyRequested) {
  throw new Error("DEV061_CLEANUP_APPLY_FORBIDDEN: this development task only permits a dry-run; use a separately approved migration package for production cleanup.");
}

if (!fs.existsSync(databasePath)) {
  console.log(JSON.stringify({ script: "qc-dev-061-cleanup-dry-run", mode: "dry-run", database: databasePath, status: "skipped", reason: "database_not_found" }, null, 2));
  process.exit(0);
}

const db = new Database(databasePath, { readonly: true });
try {
  const hasTable = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  const rows = hasTable("file_assets")
    ? db.prepare(`
        SELECT linked_entity_type AS entityType, COUNT(*) AS count
        FROM file_assets
        WHERE deleted_at IS NULL
          AND linked_entity_type = 'drawing_number'
          AND NOT EXISTS (SELECT 1 FROM drawing_revision_package_files pf WHERE pf.source_file_asset_id = file_assets.id)
          AND NOT EXISTS (SELECT 1 FROM numbering_candidate_revision_files cf WHERE cf.source_file_asset_id = file_assets.id AND cf.removed_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM drawing_revision_package_supplement_files sf WHERE sf.source_file_asset_id = file_assets.id)
          AND NOT EXISTS (SELECT 1 FROM shared_cad_model_versions sm WHERE sm.source_file_asset_id = file_assets.id AND sm.status <> 'Obsolete')
        GROUP BY linked_entity_type
      `).all()
    : [];
  console.log(JSON.stringify({
    script: "qc-dev-061-cleanup-dry-run",
    mode: "dry-run",
    database: databasePath,
    status: "ready_for_review",
    protectedReferences: ["drawing_revision_package_files", "numbering_candidate_revision_files", "drawing_revision_package_supplement_files", "shared_cad_model_versions"],
    candidates: rows,
    apply: "not_performed"
  }, null, 2));
} finally {
  db.close();
}
