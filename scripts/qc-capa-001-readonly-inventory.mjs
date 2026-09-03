import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const databasePath = path.resolve(arg("--db") ?? path.join(root, "data", "ai-pdm.sqlite"));
const outputRoot = path.resolve(arg("--output") ?? path.join(root, "output", "qa", "capa-001-approval-outcome", "inventory", new Date().toISOString().replace(/[:.]/g, "-")));

if (!fs.existsSync(databasePath)) throw new Error(`CAPA001_DATABASE_NOT_FOUND:${databasePath}`);
const databaseHash = crypto.createHash("sha256").update(fs.readFileSync(databasePath)).digest("hex");
const db = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  const tableNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  const hasTable = (name) => tableNames.has(name);
  const count = (table) => hasTable(table) ? Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count) : null;
  const scalar = (sql, params = {}) => db.prepare(sql).get(params);
  const partColumns = hasTable("part_numbers") ? new Set(db.prepare("PRAGMA table_info(part_numbers)").all().map((row) => row.name)) : new Set();
  const partCodeColumn = partColumns.has("part_number") ? "part_number" : partColumns.has("number") ? "number" : null;
  const a0001Rows = partCodeColumn
    ? db.prepare(`SELECT id, ${partCodeColumn} AS code, record_status FROM part_numbers WHERE ${partCodeColumn} = 'A0001-P01' ORDER BY id`).all()
    : [];
  const approvalRows = hasTable("approval_platform_requests") && a0001Rows.length
    ? db.prepare(`SELECT request.id, request.company_id, request.request_status, request.apply_status, request.apply_attempts,
                         (SELECT COUNT(*) FROM approval_platform_decisions decision WHERE decision.request_id = request.id) AS decision_count,
                         (SELECT COUNT(*) FROM approval_platform_events event WHERE event.request_id = request.id) AS event_count
                    FROM approval_platform_requests request
                   WHERE EXISTS (SELECT 1 FROM approval_platform_targets target
                                   WHERE target.request_id = request.id AND target.target_id IN (${a0001Rows.map(() => "?").join(",")}))
                   ORDER BY request.id`).all(...a0001Rows.map((row) => row.id))
    : [];
  const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
  const report = {
    capaId: "CAPA-001",
    dev: "DEV-114",
    scanner: "qc-capa-001-readonly-inventory.mjs",
    generatedAt: new Date().toISOString(),
    databasePath,
    databaseHash,
    databaseMode: "readonly",
    productionWrites: false,
    tables: Object.fromEntries([
      "part_roots", "part_numbers", "drawing_numbers", "drawing_revisions", "approval_platform_requests",
      "approval_platform_decisions", "approval_platform_events", "canonical_workbench_states"
    ].map((table) => [table, count(table)])),
    schema: {
      userVersion: db.pragma("user_version", { simple: true }),
      schemaVersion: db.pragma("schema_version", { simple: true }),
      foreignKeyViolations: foreignKeyViolations.length
    },
    a0001: {
      partCodeColumn,
      rows: a0001Rows,
      approvalRows,
      disposition: a0001Rows.some((row) => row.record_status === "Draft")
        ? "blocked_pending_release_authority"
        : "inventory_only"
    }
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputPath = path.join(outputRoot, "manifest.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, evidence: path.relative(root, outputPath) }, null, 2));
} finally {
  db.close();
}
