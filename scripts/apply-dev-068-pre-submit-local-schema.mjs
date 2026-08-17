import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const confirmed = args.has("--confirm-local-dev-068-pre-submit-schema");
const databasePath = path.resolve(process.env.PDM_DEV_068_SQLITE_PATH?.trim() || "data/ai-pdm.sqlite");
const migrationVersion = "DEV-068-drawing-recognition-pre-submit-source-v1";
const indexes = [
  "CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sessions_claim ON drawing_recognition_sessions(status, not_before, priority, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sessions_context ON drawing_recognition_sessions(company_id, source_context_type, source_context_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sessions_drawing ON drawing_recognition_sessions(company_id, drawing_id, updated_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sessions_successor ON drawing_recognition_sessions(supersedes_session_id)"
];
const columns = [
  "id", "company_id", "source_context_type", "source_context_id", "source_lineage_key", "drawing_id", "drawing_revision_id",
  "source_set_fingerprint", "deduplication_key", "status", "priority", "not_before", "attempt_count", "locked_by", "locked_at",
  "heartbeat_at", "supersedes_session_id", "row_version", "warning_count", "conflict_count", "unclassified_count", "error_code",
  "error_summary", "created_by", "created_at", "updated_at", "formalized_by", "formalized_at", "cancelled_at"
];

if (String(process.env.PDM_DB_PROVIDER ?? "sqlite").trim().toLowerCase() !== "sqlite") {
  throw new Error("DEV068_PRE_SUBMIT_LOCAL_SCHEMA_SQLITE_ONLY");
}
if (!fs.existsSync(databasePath)) {
  console.log(JSON.stringify({ script: "apply-dev-068-pre-submit-local-schema", status: "skipped", reason: "database_not_found", database: databasePath }, null, 2));
  process.exit(0);
}

const db = new Database(databasePath);
try {
  db.pragma("foreign_keys = OFF");
  const existing = db.prepare("SELECT version FROM pdm_local_data_migrations WHERE version = ?").get(migrationVersion);
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'drawing_recognition_sessions'").get();
  if (!table) {
    console.log(JSON.stringify({ script: "apply-dev-068-pre-submit-local-schema", status: "skipped", reason: "recognition_table_not_found", database: databasePath }, null, 2));
    process.exit(0);
  }
  const alreadySupportsSource = String(table.sql).includes("'drawing_number'");
  if (!apply) {
    console.log(JSON.stringify({ script: "apply-dev-068-pre-submit-local-schema", status: "dry_run", database: databasePath, migrationVersion, alreadyRecorded: Boolean(existing), alreadySupportsSource, destructive: false }, null, 2));
    process.exit(0);
  }
  if (!confirmed) throw new Error("DEV068_PRE_SUBMIT_LOCAL_SCHEMA_CONFIRMATION_REQUIRED");
  if (existing || alreadySupportsSource) {
    db.prepare("INSERT OR IGNORE INTO pdm_local_data_migrations (version, detail_json) VALUES (?, ?)").run(
      migrationVersion,
      JSON.stringify({ source: "db/schema.sql", destructive: false, alreadyApplied: true, appliedBy: "apply-dev-068-pre-submit-local-schema" })
    );
    console.log(JSON.stringify({ script: "apply-dev-068-pre-submit-local-schema", status: "verified", database: databasePath, migrationVersion, destructive: false }, null, 2));
    process.exit(0);
  }

  const createNextSql = String(table.sql)
    .replace(/^CREATE TABLE(?: IF NOT EXISTS)?\s+drawing_recognition_sessions\b/u, "CREATE TABLE drawing_recognition_sessions_next")
    .replace("'candidate_revision', 'revision_package', 'drawing_revision'", "'candidate_revision', 'revision_package', 'drawing_revision', 'drawing_number'")
    .replaceAll("REFERENCES drawing_recognition_sessions(id)", "REFERENCES drawing_recognition_sessions_next(id)");

  db.transaction(() => {
    db.exec(createNextSql);
    db.exec(`INSERT INTO drawing_recognition_sessions_next (${columns.join(", ")}) SELECT ${columns.join(", ")} FROM drawing_recognition_sessions`);
    for (const index of indexes) {
      const indexName = index.match(/CREATE INDEX IF NOT EXISTS ([^ ]+)/u)?.[1];
      if (indexName) db.exec(`DROP INDEX IF EXISTS ${indexName}`);
    }
    db.exec("DROP TABLE drawing_recognition_sessions");
    db.exec("ALTER TABLE drawing_recognition_sessions_next RENAME TO drawing_recognition_sessions");
    for (const index of indexes) db.exec(index);
    db.prepare("INSERT OR IGNORE INTO pdm_local_data_migrations (version, detail_json) VALUES (?, ?)").run(
      migrationVersion,
      JSON.stringify({ source: "db/schema.sql", destructive: false, preservedRows: true, appliedBy: "apply-dev-068-pre-submit-local-schema" })
    );
  })();

  console.log(JSON.stringify({ script: "apply-dev-068-pre-submit-local-schema", status: "applied", database: databasePath, migrationVersion, destructive: false }, null, 2));
} finally {
  db.pragma("foreign_keys = ON");
  db.close();
}
