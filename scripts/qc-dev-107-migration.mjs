import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV107_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-107", "migration"));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev107-migration-"));
try {
  const databasePath = path.join(tempRoot, "ai-pdm.sqlite");
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  const columns = database.prepare("PRAGMA table_info(drawing_recognition_sessions)").all().map((row) => row.name);
  assert.ok(columns.includes("session_purpose"), "SQLite session purpose column");
  assert.ok(columns.includes("evidence_origin_session_id"), "SQLite evidence origin column");
  assert.equal(database.pragma("foreign_key_check").length, 0, "fresh schema foreign keys");
  database.close();
  const dbRuntime = fs.readFileSync(path.join(root, "src/lib/db.ts"), "utf8");
  assert.match(dbRuntime, /idx_drawing_recognition_open_amendment/u, "SQLite initializer creates one-open amendment index");
  const migration = fs.readFileSync(path.join(root, "db/postgres/053_drawing_recognition_amendment_lineage.sql"), "utf8");
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/u);
  assert.doesNotMatch(migration, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/iu, "migration is additive");
  const report = { dev: "DEV-107", result: "PASS", provider: "sqlite", foreignKeyViolations: 0, additivePostgresMigration: true, completedAt: new Date().toISOString() };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify({ dev: "DEV-107", runner: "qc-dev-107-migration", expectedCaseIds: ["QA-107-036"], results: [{ caseId: "QA-107-036", status: "PASS", evidence: report }], status: "PASS", cleanup: { taskRootRemoved: true }, completedAt: report.completedAt }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
