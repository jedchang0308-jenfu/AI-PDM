import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const args = new Map(process.argv.slice(2).map((arg) => { const [k, ...v] = arg.split("="); return [k, v.length ? v.join("=") : true]; }));
const provider = String(args.get("--provider") ?? "sqlite");
const mode = String(args.get("--mode") ?? "dry-run");
if (!["dry-run", "apply", "rehearsal"].includes(mode)) throw new Error("DEV109_MODE_INVALID");
if (provider === "postgres") {
  const sqlPath = path.join(root, "db/postgres/054_unified_bom_domain_and_uom.sql");
  if (mode !== "rehearsal") throw new Error("DEV109_POSTGRES_REHEARSAL_ONLY");
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(JSON.stringify({ provider, mode, sqlPath, sqlSha256: sha(sql), productionWrites: false }, null, 2));
  process.exit(0);
}
if (!["sqlite"].includes(provider)) throw new Error("DEV109_PROVIDER_INVALID");
const dataDir = requiredTaskPath("PDM_DATA_DIR");
const repositoryDir = requiredTaskPath("PDM_REPOSITORY_DIR");
if (same(dataDir, path.join(root, "data")) || same(repositoryDir, path.join(root, "repository"))) throw new Error("DEV109_PRIMARY_DATA_FORBIDDEN");
const databasePath = path.resolve(String(args.get("--database") ?? path.join(dataDir, "ai-pdm.sqlite")));
within(databasePath, dataDir, "DEV109_DATABASE_OUTSIDE_TASK_DATA");
if (!fs.existsSync(databasePath)) throw new Error("DEV109_DATABASE_NOT_FOUND");
const evidenceDir = path.resolve(String(args.get("--evidence-dir") ?? path.join(dataDir, "dev-109-migration-evidence")));
within(evidenceDir, dataDir, "DEV109_EVIDENCE_OUTSIDE_TASK_DATA");
fs.mkdirSync(evidenceDir, { recursive: true });

const db = new Database(databasePath, { readonly: mode === "dry-run", fileMustExist: true });
db.pragma("foreign_keys = ON");
const before = inspect(db);
const plan = planMigration(before);
if (mode === "dry-run") {
  const result = { provider, mode, databasePath, dataDir, repositoryDir, productionWrites: false, before, plan, writes: 0 };
  writeEvidence(result); db.close(); console.log(JSON.stringify(result, null, 2)); process.exit(0);
}
if (mode !== "apply") throw new Error("DEV109_SQLITE_MODE_INVALID");
const backupPath = `${databasePath}.dev109-backup-${Date.now()}`;
fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
let writes = 0;
try {
  db.pragma("foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  applyMigration(db, before, () => { writes += 1; });
  db.exec("COMMIT");
  db.pragma("foreign_keys = ON");
} catch (error) {
  try { db.exec("ROLLBACK"); } catch {}
  db.close(); throw error;
}
const after = inspect(db);
const fk = db.pragma("foreign_key_check");
const rerun = planMigration(after);
const result = { provider, mode, databasePath, dataDir, repositoryDir, backupPath, productionWrites: false, before, after, rerun, foreignKeyViolations: fk, writes };
writeEvidence(result); db.close();
if (fk.length) throw new Error(`DEV109_FOREIGN_KEY_CHECK_FAILED:${JSON.stringify(fk)}`);
console.log(JSON.stringify(result, null, 2));

function planMigration(state) {
  return {
    state: state.hasLegacyPurpose && !state.hasPurpose ? "S2" : state.hasPurpose ? "S1" : "S0",
    addLegacyPurpose: !state.columns.includes("legacy_purpose"),
    retirePurpose: state.hasPurpose,
    addUomColumns: state.missingUomColumns,
    issueCodesReady: state.issueCodesReady
  };
}
function applyMigration(db, state, tick) {
  if (!state.columns.includes("legacy_purpose")) { db.exec("ALTER TABLE bom_definitions ADD COLUMN legacy_purpose TEXT CHECK (legacy_purpose IS NULL OR legacy_purpose IN ('manufacturing','sales_kit'))"); tick(); }
  if (state.hasPurpose) {
    db.exec("UPDATE bom_definitions SET legacy_purpose = purpose WHERE legacy_purpose IS NULL AND purpose IS NOT NULL"); tick();
    db.exec("DROP INDEX IF EXISTS idx_bom_definitions_company_purpose");
    db.exec("DROP TRIGGER IF EXISTS trg_bom_definition_purpose_immutable");
    db.exec("DROP TRIGGER IF EXISTS trg_bom_definition_purpose_valid_insert");
    db.exec("DROP TRIGGER IF EXISTS trg_bom_definition_purpose_valid_update");
    db.exec("ALTER TABLE bom_definitions DROP COLUMN purpose"); tick();
  }
  const adds = [
    ["part_numbers", "base_uom_code TEXT CHECK (base_uom_code IS NULL OR base_uom_code IN ('EA','SET','M','MM','L','ML','KG','G'))"],
    ["bom_lines_tree", "quantity_uom_code TEXT CHECK (quantity_uom_code IS NULL OR quantity_uom_code IN ('EA','SET','M','MM','L','ML','KG','G'))"],
    ["bom_lines_tree", "quantity_scaled_6 INTEGER CHECK (quantity_scaled_6 IS NULL OR quantity_scaled_6 BETWEEN 1 AND 999999999999999)"],
    ["bom_draft_floating_topics", "quantity_uom_code TEXT CHECK (quantity_uom_code IS NULL OR quantity_uom_code IN ('EA','SET','M','MM','L','ML','KG','G'))"],
    ["bom_draft_floating_topics", "quantity_scaled_6 INTEGER CHECK (quantity_scaled_6 IS NULL OR quantity_scaled_6 BETWEEN 1 AND 999999999999999)"],
    ["bom_release_resolved_lines", "quantity_uom_code TEXT CHECK (quantity_uom_code IS NULL OR quantity_uom_code IN ('EA','SET','M','MM','L','ML','KG','G'))"],
    ["bom_release_resolved_lines", "quantity_scaled_6 INTEGER CHECK (quantity_scaled_6 IS NULL OR quantity_scaled_6 BETWEEN 1 AND 999999999999999)"]
  ];
  for (const [table, definition] of adds) {
    const column = definition.split(" ", 1)[0];
    if (!state.tableColumns[table]?.includes(column)) { db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`); tick(); }
  }
  const codes = ["definition_backfill_ambiguous","owner_missing","cross_company","revision_lineage_conflict","component_identity_ambiguous","logical_line_identity_conflict","review_snapshot_unavailable","release_projection_unavailable","duplicate_current_binding","open_revision_conflict","legacy_purpose_invalid","duplicate_current_parent_definition","pending_legacy_review","part_base_uom_missing","draft_line_uom_unresolved","draft_quantity_exactness_unresolved","sldasm_target_missing","sldasm_target_ambiguous"];
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bom_shared_structure_migration_issues'").pluck().get() || "";
  if (!codes.every((code) => tableSql.includes(`'${code}'`))) {
    // SQLite cannot alter a CHECK constraint in place. Existing rows/IDs are
    // preserved while rebuilding only this issue table inside the transaction.
    db.exec("ALTER TABLE bom_shared_structure_migration_issues RENAME TO bom_shared_structure_migration_issues_dev109_old");
    db.exec(`CREATE TABLE bom_shared_structure_migration_issues (id TEXT PRIMARY KEY, company_id TEXT, bom_draft_id TEXT, part_number_id TEXT, issue_code TEXT NOT NULL CHECK (issue_code IN (${codes.map((c) => `'${c}'`).join(",")})), detail_json TEXT NOT NULL, issue_status TEXT NOT NULL DEFAULT 'open' CHECK (issue_status IN ('open','resolved')), resolved_by TEXT, resolved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL, FOREIGN KEY (bom_draft_id) REFERENCES bom_drafts(id) ON DELETE SET NULL, FOREIGN KEY (part_number_id) REFERENCES part_numbers(id) ON DELETE SET NULL, FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL)`);
    db.exec("INSERT INTO bom_shared_structure_migration_issues SELECT * FROM bom_shared_structure_migration_issues_dev109_old");
    db.exec("DROP TABLE bom_shared_structure_migration_issues_dev109_old");
    db.exec("CREATE INDEX IF NOT EXISTS idx_bom_shared_migration_issues ON bom_shared_structure_migration_issues(issue_status, issue_code, company_id)"); tick();
  }
}
function inspect(db) {
  const tableColumns = {};
  for (const table of ["bom_definitions","part_numbers","bom_lines_tree","bom_draft_floating_topics","bom_release_resolved_lines"]) tableColumns[table] = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
  const issueSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bom_shared_structure_migration_issues'").pluck().get() || "";
  return {
    columns: tableColumns.bom_definitions,
    tableColumns,
    hasPurpose: tableColumns.bom_definitions.includes("purpose"),
    hasLegacyPurpose: tableColumns.bom_definitions.includes("legacy_purpose"),
    missingUomColumns: [
      ["part_numbers", "base_uom_code"],
      ["bom_lines_tree", "quantity_uom_code"], ["bom_lines_tree", "quantity_scaled_6"],
      ["bom_draft_floating_topics", "quantity_uom_code"], ["bom_draft_floating_topics", "quantity_scaled_6"],
      ["bom_release_resolved_lines", "quantity_uom_code"], ["bom_release_resolved_lines", "quantity_scaled_6"]
    ].filter(([table, column]) => !tableColumns[table]?.includes(column)).map(([table, column]) => `${table}.${column}`),
    issueCodesReady: issueSql.includes("legacy_purpose_invalid") && issueSql.includes("sldasm_target_ambiguous"),
    definitionCount: Number(db.prepare("SELECT COUNT(*) FROM bom_definitions").pluck().get()),
    bindingCount: Number(db.prepare("SELECT COUNT(*) FROM bom_definition_parent_bindings").pluck().get()),
    foreignKeyViolations: db.pragma("foreign_key_check")
  };
}
function requiredTaskPath(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`DEV109_${name}_REQUIRED`); fs.mkdirSync(value, { recursive: true }); return path.resolve(value); }
function within(target, base, code) { const rel = path.relative(path.resolve(base), path.resolve(target)); if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(code); }
function same(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
function sha(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function writeEvidence(value) { fs.writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(value, null, 2)}\n`); }
