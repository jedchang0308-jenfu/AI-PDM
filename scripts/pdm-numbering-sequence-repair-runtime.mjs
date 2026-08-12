#!/usr/bin/env node

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveNumberingQcDbPath, resolveProtectedNumberingRuntimeDbPath } from "./numbering-qc-runtime-guard.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = args.has("--dry-run") || !apply;
const confirmed = args.has("--i-understand-local-runtime-data-repair");
const companyId = "company-jenfu";
const reportDir = path.join(root, "output", "pdm-numbering-sequence-repair-runtime");

if (apply && !confirmed) {
  console.error("Refusing apply without --i-understand-local-runtime-data-repair.");
  process.exit(1);
}

const dbPath = resolveNumberingQcDbPath(root, process.env);
const protectedDbPath = resolveProtectedNumberingRuntimeDbPath(root);
if (path.resolve(dbPath) !== path.resolve(protectedDbPath)) {
  console.error(`Refusing repair against non-runtime DB: ${dbPath}`);
  process.exit(1);
}

function nowCompact() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function readJson(text) {
  try {
    return JSON.parse(text ?? "{}");
  } catch {
    return {};
  }
}

function getVisibleDrawingModuleRoots(db) {
  return db
    .prepare(
      `
      SELECT DISTINCT pr.root_code
      FROM drawing_numbers d
      JOIN part_roots pr ON pr.id = d.part_root_id
      WHERE d.company_id = ?
        AND pr.company_id = ?
        AND pr.rule_version_id = 'numbering-rule-v2'
      ORDER BY pr.root_code ASC
    `
    )
    .all(companyId, companyId)
    .map((row) => row.root_code)
    .filter((code) => /^\d{5}$/u.test(code));
}

function getTableCount(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

function getCounts(db) {
  const tables = [
    "numbering_sequences",
    "part_roots",
    "part_numbers",
    "drawing_numbers",
    "drawing_part_links",
    "audit_logs",
    "duplicate_check_events",
    "warning_events",
    "numbering_task_items",
    "numbering_notifications",
    "approval_requests",
    "approval_decisions",
    "approval_batches",
    "approval_batch_items",
    "numbering_export_jobs",
    "monthly_audit_reports"
  ];
  return Object.fromEntries(tables.map((table) => [table, getTableCount(db, table)]));
}

function getCreateAuditRoots(db) {
  const rows = db.prepare("SELECT id, detail_json FROM audit_logs WHERE action = 'numbering.create' ORDER BY created_at ASC").all();
  return rows
    .map((row) => ({ id: row.id, rootCode: readJson(row.detail_json).rootCode }))
    .filter((row) => typeof row.rootCode === "string" && /^\d{5}$/u.test(row.rootCode));
}

function buildPlan(db) {
  const keepRootCodes = getVisibleDrawingModuleRoots(db);
  const keepRootSet = new Set(keepRootCodes);
  const createAuditRoots = getCreateAuditRoots(db);
  const purgedRootCodes = [...new Set(createAuditRoots.map((row) => row.rootCode).filter((code) => !keepRootSet.has(code)))].sort();
  const purgedRootSet = new Set(purgedRootCodes);
  const deleteCreateAuditIds = createAuditRoots.filter((row) => purgedRootSet.has(row.rootCode)).map((row) => row.id);
  const keepSequenceKeys = new Set([`${companyId}:part_root:v2`]);
  for (const code of keepRootCodes) {
    keepSequenceKeys.add(`${companyId}:part:${code}`);
    keepSequenceKeys.add(`${companyId}:drawing:${code}:M`);
    keepSequenceKeys.add(`${companyId}:drawing:${code}:R`);
  }
  const sequenceKeysToDelete = db
    .prepare("SELECT sequence_key FROM numbering_sequences WHERE company_id = ? ORDER BY sequence_key ASC")
    .all(companyId)
    .map((row) => row.sequence_key)
    .filter((key) => !keepSequenceKeys.has(key));
  const maxRetainedRoot = keepRootCodes.length > 0 ? Math.max(...keepRootCodes.map((code) => Number(code))) : 0;
  return {
    keepRootCodes,
    purgedRootCodes,
    deleteCreateAuditIds,
    sequenceKeysToDelete,
    nextRootValue: maxRetainedRoot + 1
  };
}

function writeReport(payload) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "report.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(reportDir, "report.md"),
    [
      "# PDM Numbering Sequence Runtime Repair Report",
      "",
      `- Checked at: ${payload.checkedAt}`,
      `- Mode: ${payload.mode}`,
      `- DB path: ${payload.dbPath}`,
      `- Backup path: ${payload.backupPath ?? "not created"}`,
      `- Formal kept roots: ${payload.plan.keepRootCodes.join(", ")}`,
      `- Purged test roots: ${payload.plan.purgedRootCodes.length}`,
      `- Deleted numbering.create audit rows: ${payload.plan.deleteCreateAuditIds.length}`,
      `- Deleted sequence keys: ${payload.plan.sequenceKeysToDelete.length}`,
      `- Root sequence next value: ${payload.plan.nextRootValue}`,
      "",
      "## Counts Before",
      "",
      "```json",
      JSON.stringify(payload.beforeCounts, null, 2),
      "```",
      "",
      "## Counts After",
      "",
      "```json",
      JSON.stringify(payload.afterCounts, null, 2),
      "```",
      ""
    ].join("\n"),
    "utf8"
  );
}

function backupRuntimeDb() {
  const backupDir = path.join(root, "data", "backups", `pdm-numbering-sequence-repair-${nowCompact()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "ai-pdm.sqlite");
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function deleteByIds(db, tableName, idColumn, ids) {
  if (ids.length === 0) return 0;
  const statement = db.prepare(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`);
  let deleted = 0;
  for (const id of ids) deleted += statement.run(id).changes;
  return deleted;
}

function applyRepair(db, plan, backupPath) {
  const now = new Date().toISOString();
  const deleteSequence = db.prepare("DELETE FROM numbering_sequences WHERE sequence_key = ?");
  db.exec("PRAGMA foreign_keys = ON");
  const run = db.transaction(() => {
    db.exec("DROP TRIGGER IF EXISTS trg_audit_logs_no_delete");
    deleteByIds(db, "audit_logs", "id", plan.deleteCreateAuditIds);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
      BEFORE DELETE ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, 'AUDIT_LOG_APPEND_ONLY');
      END;
    `);

    for (const key of plan.sequenceKeysToDelete) deleteSequence.run(key);
    db.prepare(
      `
      INSERT INTO numbering_sequences (sequence_key, company_id, next_value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(sequence_key) DO UPDATE SET
        next_value = excluded.next_value,
        updated_at = excluded.updated_at
    `
    ).run(`${companyId}:part_root:v2`, companyId, plan.nextRootValue, now);

    db.prepare("DELETE FROM approval_batch_items").run();
    db.prepare("DELETE FROM approval_decisions").run();
    db.prepare("DELETE FROM approval_batches").run();
    db.prepare("DELETE FROM approval_requests").run();
    db.prepare("DELETE FROM duplicate_check_events").run();
    db.prepare("DELETE FROM warning_events").run();
    db.prepare("DELETE FROM numbering_task_items").run();
    db.prepare("DELETE FROM numbering_notifications").run();
    db.prepare("DELETE FROM numbering_export_jobs").run();
    db.prepare("DELETE FROM monthly_audit_reports").run();

    db.prepare(
      `
      INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
      VALUES (?, NULL, ?, 'numbering.sequence_repair', ?, ?)
    `
    ).run(
      randomUUID(),
      "user-admin-demo",
      JSON.stringify({
        policy: "local_test_data_purge_keep_visible_drawing_module_records",
        formalRootCodes: plan.keepRootCodes,
        purgedRootCodes: plan.purgedRootCodes,
        deletedNumberingCreateAuditRows: plan.deleteCreateAuditIds.length,
        deletedSequenceKeys: plan.sequenceKeysToDelete.length,
        nextRootValue: plan.nextRootValue,
        backupPath,
        beforeRepairDbPath: dbPath
      }),
      now
    );
  });
  run();
}

const db = new Database(dbPath);
try {
  const beforeCounts = getCounts(db);
  const plan = buildPlan(db);
  let backupPath = null;
  if (apply) {
    backupPath = backupRuntimeDb();
    applyRepair(db, plan, backupPath);
  }
  const afterCounts = getCounts(db);
  const payload = {
    checkedAt: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "apply",
    dbPath,
    backupPath,
    plan,
    beforeCounts,
    afterCounts
  };
  writeReport(payload);
  console.log(JSON.stringify(payload, null, 2));
} finally {
  db.close();
}
