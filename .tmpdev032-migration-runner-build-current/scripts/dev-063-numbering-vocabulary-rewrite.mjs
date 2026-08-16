#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { rewriteNumberingHumanText, rewriteNumberingJsonText } from "../src/lib/numbering-vocabulary.ts";
import { getDataDir } from "./pdm-paths.mjs";

export const DEV063_NUMBERING_VOCABULARY_REWRITE_VERSION = "dev-063-numbering-vocabulary-rewrite/v1";
export const DEV063_LOCAL_APPLY_CONFIRMATION = "DEV-063-LOCAL-APPLY-CONFIRMED";

const root = process.cwd();
const defaultDbPath = path.join(getDataDir(root), "ai-pdm.sqlite");
const defaultCompanyId = process.env.PDM_DEV063_COMPANY_ID?.trim() || "company-jenfu";

// These are the only human-readable fields this runner may touch. Internal
// status codes, ids, hashes, timestamps, and payload keys are never rewritten.
const MUTABLE_FIELDS = [
  { table: "approval_requests", column: "reason", kind: "text" },
  { table: "numbering_draft_workspaces", column: "append_reason", kind: "text" },
  { table: "numbering_draft_workspaces", column: "cancel_reason", kind: "text" },
  { table: "number_candidate_reservations", column: "recycle_reason", kind: "text" },
  { table: "numbering_task_items", column: "title", kind: "text" },
  { table: "numbering_task_items", column: "message", kind: "text" },
  { table: "numbering_task_items", column: "detail_json", kind: "json" },
  { table: "numbering_notifications", column: "title", kind: "text" },
  { table: "numbering_notifications", column: "message", kind: "text" },
  { table: "numbering_notifications", column: "detail_json", kind: "json" },
  { table: "numbering_candidate_revision_drafts", column: "override_reason", kind: "text" },
  { table: "numbering_candidate_revision_drafts", column: "policy_snapshot_json", kind: "json" },
  { table: "numbering_candidate_revision_files", column: "description", kind: "text" }
];

// Append-only logs and hash-bound snapshots are represented in a derived
// projection. The raw value and its hash remain unchanged.
const IMMUTABLE_PROJECTION_FIELDS = [
  { table: "audit_logs", column: "detail_json", kind: "json" },
  { table: "submission_snapshots", column: "snapshot_json", kind: "json" },
  { table: "approval_platform_impact_snapshots", column: "snapshot_json", kind: "json" }
];

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((row) => row.name));
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/iu.test(value)) throw new Error(`DEV063_IDENTIFIER_NOT_ALLOWED:${value}`);
  return `"${value}"`;
}

function resolveDatabasePath(value) {
  const resolved = path.resolve(root, value);
  if (!fs.existsSync(resolved)) throw new Error(`DEV063_DATABASE_NOT_FOUND:${resolved}`);
  return resolved;
}

function assertLocalApplyAllowed(dbPath) {
  if (process.env.NODE_ENV === "production") throw new Error("DEV063_PRODUCTION_APPLY_FORBIDDEN");
  if (process.env.PDM_DB_PROVIDER && process.env.PDM_DB_PROVIDER !== "sqlite") throw new Error("DEV063_SQLITE_ONLY");
  if (!hasFlag("--confirm-local-dev-063") || process.env.PDM_DEV063_CONFIRMATION !== DEV063_LOCAL_APPLY_CONFIRMATION) {
    throw new Error("DEV063_LOCAL_APPLY_CONFIRMATION_MISSING");
  }
  const dataRoot = path.resolve(getDataDir(root));
  const relative = path.relative(dataRoot, dbPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("DEV063_DATABASE_OUTSIDE_LOCAL_DATA_DIR");
}

function ensureProjectionTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dev063_numbering_vocabulary_projection (
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_column TEXT NOT NULL,
      source_value TEXT NOT NULL,
      rewritten_value TEXT NOT NULL,
      source_sha256 TEXT NOT NULL,
      rewritten_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_table, source_id, source_column)
    );
  `);
}

function rewriteValue(value, kind) {
  return kind === "json" ? rewriteNumberingJsonText(value) : rewriteNumberingHumanText(value);
}

function collectFieldPlan(db, field, companyId) {
  const columns = tableColumns(db, field.table);
  if (!columns.has("id") || !columns.has(field.column)) {
    return { ...field, status: "skipped", reason: "table_or_column_missing", rows: [], changed: 0 };
  }
  if (!columns.has("company_id")) {
    return { ...field, status: "skipped", reason: "company_scope_missing", rows: [], changed: 0 };
  }
  const table = quoteIdentifier(field.table);
  const column = quoteIdentifier(field.column);
  const rows = db.prepare(`SELECT id, ${column} AS value FROM ${table} WHERE company_id = ? AND typeof(${column}) = 'text'`).all(companyId);
  const changedRows = rows
    .map((row) => ({ id: row.id, before: row.value, after: rewriteValue(row.value, field.kind) }))
    .filter((row) => row.before !== row.after);
  return { ...field, status: "ready", rows: changedRows, scanned: rows.length, changed: changedRows.length };
}

function collectProjectionPlan(db, field, companyId) {
  const columns = tableColumns(db, field.table);
  if (!columns.has("id") || !columns.has(field.column)) {
    return { ...field, status: "skipped", reason: "table_or_column_missing", rows: [], changed: 0 };
  }
  const table = quoteIdentifier(field.table);
  const column = quoteIdentifier(field.column);
  let rows;
  let scope = "company";
  if (columns.has("company_id")) {
    rows = db.prepare(`SELECT id, ${column} AS value FROM ${table} WHERE company_id = ? AND typeof(${column}) = 'text'`).all(companyId);
  } else if (field.table === "audit_logs") {
    scope = "local_database";
    rows = db.prepare(`SELECT id, ${column} AS value FROM ${table} WHERE typeof(${column}) = 'text'`).all();
  } else if (field.table === "approval_platform_impact_snapshots") {
    scope = "company_join";
    rows = db.prepare(`
      SELECT aps.id, aps.${column} AS value
      FROM ${table} aps
      LEFT JOIN approval_platform_requests apr ON apr.id = aps.request_id
      LEFT JOIN approval_platform_packages app ON app.id = aps.package_id
      WHERE (apr.company_id = ? OR app.company_id = ?) AND typeof(aps.${column}) = 'text'
    `).all(companyId, companyId);
  } else {
    return { ...field, status: "skipped", reason: "company_scope_missing", rows: [], changed: 0 };
  }
  const projectionTableExists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dev063_numbering_vocabulary_projection'").get());
  const projectionRows = projectionTableExists
    ? db.prepare(`SELECT source_id, source_value, rewritten_value, source_sha256 FROM dev063_numbering_vocabulary_projection WHERE source_table = ? AND source_column = ?`).all(field.table, field.column)
    : [];
  const projectionBySourceId = new Map(projectionRows.map((row) => [row.source_id, row]));
  const changedRows = rows
    .map((row) => ({ id: row.id, before: row.value, after: rewriteValue(row.value, field.kind) }))
    .filter((row) => {
      if (row.before === row.after) return false;
      const projection = projectionBySourceId.get(row.id);
      return !projection || projection.source_value !== row.before || projection.rewritten_value !== row.after || projection.source_sha256 !== sha256(row.before);
    });
  return { ...field, status: "ready", scope, rows: changedRows, scanned: rows.length, changed: changedRows.length };
}

export function buildDev063RewritePlan(db, companyId = defaultCompanyId) {
  return {
    runnerVersion: DEV063_NUMBERING_VOCABULARY_REWRITE_VERSION,
    companyId,
    mutable: MUTABLE_FIELDS.map((field) => collectFieldPlan(db, field, companyId)),
    immutableProjection: IMMUTABLE_PROJECTION_FIELDS.map((field) => collectProjectionPlan(db, field, companyId))
  };
}

function summarize(plan, mode, dbPath) {
  const all = [...plan.mutable, ...plan.immutableProjection];
  return {
    runnerVersion: plan.runnerVersion,
    mode,
    companyId: plan.companyId,
    dbPath,
    fieldCount: all.length,
    readyFieldCount: all.filter((field) => field.status === "ready").length,
    skippedFields: all.filter((field) => field.status === "skipped").map(({ table, column, reason }) => ({ table, column, reason })),
    scannedRows: all.reduce((sum, field) => sum + (field.scanned ?? 0), 0),
    changedRows: all.reduce((sum, field) => sum + field.changed, 0),
    mutableChangedRows: plan.mutable.reduce((sum, field) => sum + field.changed, 0),
    immutableProjectionChangedRows: plan.immutableProjection.reduce((sum, field) => sum + field.changed, 0)
  };
}

export function applyDev063RewritePlan(db, plan) {
  ensureProjectionTable(db);
  const updateStatements = new Map();
  const projectionStatement = db.prepare(`
    INSERT INTO dev063_numbering_vocabulary_projection
      (source_table, source_id, source_column, source_value, rewritten_value, source_sha256, rewritten_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(source_table, source_id, source_column) DO UPDATE SET
      source_value = excluded.source_value,
      rewritten_value = excluded.rewritten_value,
      source_sha256 = excluded.source_sha256,
      rewritten_at = excluded.rewritten_at
  `);
  const run = db.transaction(() => {
    for (const field of plan.mutable) {
      if (field.status !== "ready" || field.changed === 0) continue;
      const statementKey = `${field.table}.${field.column}`;
      const statement = updateStatements.get(statementKey) ?? db.prepare(`UPDATE ${quoteIdentifier(field.table)} SET ${quoteIdentifier(field.column)} = ? WHERE id = ? AND ${quoteIdentifier(field.column)} = ?`);
      updateStatements.set(statementKey, statement);
      for (const row of field.rows) statement.run(row.after, row.id, row.before);
    }
    for (const field of plan.immutableProjection) {
      if (field.status !== "ready" || field.changed === 0) continue;
      for (const row of field.rows) projectionStatement.run(field.table, row.id, field.column, row.before, row.after, sha256(row.before));
    }
    const postPlan = buildDev063RewritePlan(db, plan.companyId);
    const remaining = [...postPlan.mutable, ...postPlan.immutableProjection].reduce((sum, field) => sum + field.changed, 0);
    if (remaining !== 0) throw new Error(`DEV063_POST_APPLY_MISMATCH:${remaining}`);
  });
  run();
}

function assertLocalDatabaseIsSingleTenant(db) {
  const companiesTableExists = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'companies'").get());
  if (!companiesTableExists) return;
  const count = db.prepare("SELECT COUNT(*) AS count FROM companies").get().count;
  if (count > 1) throw new Error("DEV063_UNSCOPED_IMMUTABLE_PROJECTION_MULTIPLE_COMPANIES");
}

export function runDev063RewriteCli() {
  const dbPath = resolveDatabasePath(argValue("--db", defaultDbPath));
  const apply = hasFlag("--apply-local");
  try {
    if (apply) assertLocalApplyAllowed(dbPath);
    const db = new Database(dbPath, { readonly: !apply, fileMustExist: true });
    try {
      const plan = buildDev063RewritePlan(db, argValue("--company", defaultCompanyId));
      if (apply && plan.immutableProjection.some((field) => field.scope === "local_database" && field.changed > 0)) {
        assertLocalDatabaseIsSingleTenant(db);
      }
      if (apply) applyDev063RewritePlan(db, plan);
      console.log(JSON.stringify(summarize(plan, apply ? "apply_local" : "dry_run"), null, 2));
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  runDev063RewriteCli();
}
