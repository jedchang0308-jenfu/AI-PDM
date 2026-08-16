import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const confirmed = args.has("--confirm-local-dev-068-schema");
const databasePath = path.resolve(process.env.PDM_DEV_068_SQLITE_PATH?.trim() || "data/ai-pdm.sqlite");
const schemaPath = path.join(root, "db", "schema.sql");
const migrationVersion = "DEV-068-drawing-recognition-v1";

if (String(process.env.PDM_DB_PROVIDER ?? "sqlite").trim().toLowerCase() !== "sqlite") {
  throw new Error("DEV068_LOCAL_SCHEMA_SQLITE_ONLY");
}
if (!fs.existsSync(databasePath)) {
  console.log(JSON.stringify({ script: "apply-dev-068-local-schema", status: "skipped", reason: "database_not_found", database: databasePath }, null, 2));
  process.exit(0);
}

const schema = fs.readFileSync(schemaPath, "utf8");
const startMarker = "-- DEV-068 drawing/CAD recognition candidate review and atomic formalization.";
const endMarker = "-- END DEV-068 drawing recognition schema.";
const start = schema.indexOf(startMarker);
const end = schema.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("DEV068_SCHEMA_MARKERS_NOT_FOUND");
const ddl = schema.slice(start, end + endMarker.length);

const db = new Database(databasePath);
try {
  db.pragma("foreign_keys = ON");
  const existing = db.prepare("SELECT version FROM pdm_local_data_migrations WHERE version = ?").get(migrationVersion);
  const tableCount = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND (name LIKE 'drawing_recognition_%' OR name IN ('pdm_attribute_definitions','pdm_part_attribute_values','pdm_drawing_revision_metadata_values','pdm_controlled_notes','pdm_engineering_evidence'))").get().count;
  if (!apply) {
    console.log(JSON.stringify({ script: "apply-dev-068-local-schema", status: "dry_run", database: databasePath, migrationVersion, alreadyRecorded: Boolean(existing), existingTableCount: Number(tableCount), destructive: false }, null, 2));
    process.exit(0);
  }
  if (!confirmed) throw new Error("DEV068_LOCAL_SCHEMA_CONFIRMATION_REQUIRED");
  db.transaction(() => {
    db.exec(ddl);
    db.prepare("INSERT OR IGNORE INTO pdm_local_data_migrations (version, detail_json) VALUES (?, ?)").run(
      migrationVersion,
      JSON.stringify({ source: "db/schema.sql", destructive: false, appliedBy: "apply-dev-068-local-schema" })
    );
  })();
  const appliedTableCount = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND (name LIKE 'drawing_recognition_%' OR name IN ('pdm_attribute_definitions','pdm_part_attribute_values','pdm_drawing_revision_metadata_values','pdm_controlled_notes','pdm_engineering_evidence'))").get().count;
  console.log(JSON.stringify({ script: "apply-dev-068-local-schema", status: existing ? "verified" : "applied", database: databasePath, migrationVersion, tableCount: Number(appliedTableCount), destructive: false }, null, 2));
} finally {
  db.close();
}
