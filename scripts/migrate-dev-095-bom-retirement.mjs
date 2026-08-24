import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const approvalToken = "DEV-095-BOM-HARD-DELETE-APPROVED";
const retiredTables = [
  "bom_reconfirmation_flags",
  "bom_identity_migration_issues",
  "bom_create_effects",
  "bom_release_snapshots",
  "bom_review_requests",
  "bom_edit_events",
  "bom_import_jobs",
  "bom_draft_floating_topics",
  "bom_lines_tree",
  "bom_lines",
  "bom_headers",
  "bom_drafts",
  "bom_import_profiles"
];

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function columnExists(db, table, column) {
  if (!tableExists(db, table)) return false;
  return db.prepare(`PRAGMA table_info(${table})`).all().some((entry) => entry.name === column);
}

function countRows(db, table) {
  if (!tableExists(db, table)) return 0;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0);
}

function canonicalIdentityDigest(db) {
  const tables = ["companies", "items", "part_roots", "part_numbers", "drawing_numbers", "submissions"];
  const hash = createHash("sha256");
  const counts = {};
  for (const table of tables) {
    if (!tableExists(db, table)) continue;
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((entry) => entry.name);
    const identityColumns = ["id", "company_id", "part_root_id", "part_number", "drawing_number", "root_code", "revision", "record_status", "status"]
      .filter((column) => columns.includes(column));
    const rows = identityColumns.length
      ? db.prepare(`SELECT ${identityColumns.join(", ")} FROM ${table} ORDER BY id`).all()
      : [];
    counts[table] = rows.length;
    hash.update(`${table}:${JSON.stringify(rows)}\n`);
  }
  return { sha256: hash.digest("hex"), counts };
}

function inventory(db) {
  return {
    retiredTables: Object.fromEntries(retiredTables.map((table) => [table, countRows(db, table)])),
    partUsagePolicyColumn: columnExists(db, "part_numbers", "bom_usage_policy"),
    legacyConfirmationRows: tableExists(db, "review_confirmation_events")
      ? Number(db.prepare("SELECT COUNT(*) AS count FROM review_confirmation_events WHERE action = ?").get("confirm_bom_no_revision")?.count ?? 0)
      : 0,
    foreignKeyViolations: db.prepare("PRAGMA foreign_key_check").all(),
    canonicalIdentity: canonicalIdentityDigest(db)
  };
}

function deletePlatformCompatibilityData(db) {
  if (tableExists(db, "approval_platform_targets") && tableExists(db, "approval_platform_requests")) {
    db.exec(`DELETE FROM approval_platform_targets WHERE request_id IN (
      SELECT id FROM approval_platform_requests WHERE action_code IN ('bom.release_review', 'bom.obsolete_review') OR domain_code = 'bom'
    )`);
  }
  if (tableExists(db, "approval_platform_decisions") && tableExists(db, "approval_platform_requests")) {
    db.exec(`DELETE FROM approval_platform_decisions WHERE request_id IN (
      SELECT id FROM approval_platform_requests WHERE action_code IN ('bom.release_review', 'bom.obsolete_review') OR domain_code = 'bom'
    )`);
  }
  if (tableExists(db, "approval_platform_impact_snapshots") && tableExists(db, "approval_platform_requests")) {
    db.exec(`DELETE FROM approval_platform_impact_snapshots WHERE request_id IN (
      SELECT id FROM approval_platform_requests WHERE action_code IN ('bom.release_review', 'bom.obsolete_review') OR domain_code = 'bom'
    )`);
  }
  if (tableExists(db, "approval_platform_events") && tableExists(db, "approval_platform_requests")) {
    db.exec(`DELETE FROM approval_platform_events WHERE request_id IN (
      SELECT id FROM approval_platform_requests WHERE action_code IN ('bom.release_review', 'bom.obsolete_review') OR domain_code = 'bom'
    )`);
  }
  if (tableExists(db, "approval_platform_package_items") && tableExists(db, "approval_platform_requests")) {
    db.exec(`DELETE FROM approval_platform_package_items WHERE request_id IN (
      SELECT id FROM approval_platform_requests WHERE action_code IN ('bom.release_review', 'bom.obsolete_review') OR domain_code = 'bom'
    )`);
  }
  if (tableExists(db, "approval_platform_legacy_links")) {
    db.prepare("DELETE FROM approval_platform_legacy_links WHERE legacy_table = ?").run("bom_review_requests");
  }
  if (tableExists(db, "approval_platform_requests")) {
    db.exec("DELETE FROM approval_platform_requests WHERE action_code IN ('bom.release_review', 'bom.obsolete_review') OR domain_code = 'bom'");
  }
  if (tableExists(db, "approval_platform_packages")) {
    const ids = db.prepare("SELECT id FROM approval_platform_packages WHERE action_code IN ('bom.release_review', 'bom.obsolete_review')").all();
    for (const { id } of ids) {
      if (tableExists(db, "approval_platform_package_items")) db.prepare("DELETE FROM approval_platform_package_items WHERE package_id = ?").run(id);
      if (tableExists(db, "approval_platform_impact_snapshots")) db.prepare("DELETE FROM approval_platform_impact_snapshots WHERE package_id = ?").run(id);
      if (tableExists(db, "approval_platform_events")) db.prepare("DELETE FROM approval_platform_events WHERE package_id = ?").run(id);
    }
    db.exec("DELETE FROM approval_platform_packages WHERE action_code IN ('bom.release_review', 'bom.obsolete_review')");
  }
  if (tableExists(db, "approval_delegations")) {
    db.exec("DELETE FROM approval_delegations WHERE action_code IN ('bom.release_review', 'bom.obsolete_review')");
  }
  if (tableExists(db, "approval_matrix_rules")) {
    db.exec("DELETE FROM approval_matrix_rules WHERE action_code IN ('bom.release_review', 'bom.obsolete_review')");
  }
  if (tableExists(db, "approval_platform_actions")) {
    db.exec("DELETE FROM approval_platform_actions WHERE action_code IN ('bom.release_review', 'bom.obsolete_review') OR domain_code = 'bom'");
  }
}

function rebuildConfirmationEvents(db) {
  if (!tableExists(db, "review_confirmation_events")) return;
  db.exec(`
    DELETE FROM review_confirmation_events WHERE action = 'confirm_bom_no_revision';
    DROP TABLE IF EXISTS review_confirmation_events_dev095;
    CREATE TABLE review_confirmation_events_dev095 (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      review_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (
        action IN (
          'confirm_original_part_reuse',
          'return_for_replacement_part',
          'request_more_information',
          'approve_replacement_part_and_drawing_release'
        )
      ),
      reviewer_user_id TEXT NOT NULL,
      result TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
    );
    INSERT INTO review_confirmation_events_dev095 (
      id, company_id, review_id, action, reviewer_user_id, result, occurred_at, metadata_json
    )
    SELECT id, company_id, review_id, action, reviewer_user_id, result, occurred_at, metadata_json
    FROM review_confirmation_events;
    DROP TABLE review_confirmation_events;
    ALTER TABLE review_confirmation_events_dev095 RENAME TO review_confirmation_events;
    CREATE INDEX IF NOT EXISTS idx_review_confirmation_events_review
      ON review_confirmation_events(company_id, review_id, occurred_at DESC);
  `);
}

async function main() {
  const databaseArg = argument("database");
  if (!databaseArg) throw new Error("DATABASE_PATH_REQUIRED: pass --database=<absolute-or-project-relative-sqlite-path>");
  const databasePath = await fsp.realpath(path.resolve(databaseArg));
  const stat = await fsp.stat(databasePath);
  if (!stat.isFile() || !/\.(?:sqlite|sqlite3|db)$/iu.test(databasePath)) throw new Error(`UNSAFE_DATABASE_TARGET:${databasePath}`);

  const execute = process.argv.includes("--execute");
  if (execute && argument("approval") !== approvalToken) throw new Error("DEV095_DESTRUCTIVE_APPROVAL_REQUIRED");

  const db = new Database(databasePath, { readonly: !execute, fileMustExist: true });
  try {
    db.pragma("foreign_keys = ON");
    const before = inventory(db);
    if (!execute) {
      console.log(JSON.stringify({ mode: "dry-run", databasePath, before, approvalRequired: approvalToken }, null, 2));
      return;
    }

    const backupArg = argument("backup");
    const backupPath = path.resolve(
      backupArg ?? `${databasePath}.dev-095-backup-${new Date().toISOString().replaceAll(":", "-")}`
    );
    if (fs.existsSync(backupPath)) throw new Error(`BACKUP_TARGET_ALREADY_EXISTS:${backupPath}`);
    await db.backup(backupPath);
    const backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });
    const backupIntegrity = backupDb.pragma("integrity_check", { simple: true });
    backupDb.close();
    if (backupIntegrity !== "ok") throw new Error(`BACKUP_INTEGRITY_FAILED:${backupIntegrity}`);

    db.pragma("foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
      deletePlatformCompatibilityData(db);
      if (tableExists(db, "audit_logs")) db.exec("DELETE FROM audit_logs WHERE lower(action) LIKE '%bom%'");
      rebuildConfirmationEvents(db);
      for (const table of retiredTables) db.exec(`DROP TABLE IF EXISTS ${table}`);
      if (columnExists(db, "part_numbers", "bom_usage_policy")) db.exec("ALTER TABLE part_numbers DROP COLUMN bom_usage_policy");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.pragma("foreign_keys = ON");
    }

    const after = inventory(db);
    if (Object.values(after.retiredTables).some((count) => count !== 0)) throw new Error("RETIRED_TABLES_REMAIN");
    if (retiredTables.some((table) => tableExists(db, table))) throw new Error("RETIRED_SCHEMA_OBJECTS_REMAIN");
    if (after.partUsagePolicyColumn || after.legacyConfirmationRows !== 0) throw new Error("RETIRED_COMPATIBILITY_SCHEMA_REMAINS");
    if (after.foreignKeyViolations.length !== 0) throw new Error("FOREIGN_KEY_CHECK_FAILED");
    if (after.canonicalIdentity.sha256 !== before.canonicalIdentity.sha256) throw new Error("CANONICAL_IDENTITY_CHANGED");

    console.log(JSON.stringify({ mode: "execute", databasePath, backupPath, backupIntegrity, before, after }, null, 2));
  } finally {
    db.close();
  }
}

await main();
