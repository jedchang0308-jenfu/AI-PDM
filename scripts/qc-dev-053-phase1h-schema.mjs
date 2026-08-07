#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));
const hash = (source) => crypto.createHash("sha256").update(source).digest("hex");

const sqlite = read("db/schema.sql");
const postgres = read("db/postgres/026_drawing_revision_lifecycle_authority.sql");
const mirror = read("supabase/migrations/20260806020000_drawing_revision_lifecycle_authority.sql");
const manifest = JSON.parse(read("supabase/migrations/manifest.json"));
const sync = read("scripts/sync-supabase-runtime-migrations.mjs");
const feature = read("src/lib/number-state-flow-feature.ts");
const envExample = read(".env.example");
const dbSource = read("src/lib/db.ts");

const tables = [
  "drawing_revision_package_part_scopes",
  "drawing_revision_lifecycle_workflows",
  "drawing_revision_lifecycle_reviewers",
  "drawing_revision_lifecycle_command_tokens"
];
record("DEV053-1H-SCHEMA-001 SQLite defines additive durable/transient tables",
  tables.every((table) => sqlite.includes(`CREATE TABLE IF NOT EXISTS ${table}`)), tables.join(","));
record("DEV053-1H-SCHEMA-002 PostgreSQL defines provider-parity tables",
  tables.every((table) => postgres.includes(`CREATE TABLE IF NOT EXISTS public.${table}`)), tables.join(","));
record("DEV053-1H-SCHEMA-003 package lifecycle state remains additive and legacy-null compatible",
  has(sqlite, ["lifecycle_state TEXT", "active_correction_reason TEXT", "correction_required", "rd_controlled"]) &&
  has(postgres, ["ADD COLUMN IF NOT EXISTS lifecycle_state", "ADD COLUMN IF NOT EXISTS active_correction_reason", "lifecycle_state IS NULL OR lifecycle_state IN"]));
record("DEV053-1H-SCHEMA-004 cleanup-order pointers use exact names and nullable SET NULL",
  has(sqlite, ["approval_package_id TEXT", "approval_request_id TEXT UNIQUE", "legacy_submission_id TEXT UNIQUE", "legacy_fff_assessment_id TEXT UNIQUE", "submitted_by TEXT NOT NULL", "cleanup_authorized_at TEXT"]) &&
  has(postgres, ["approval_package_id TEXT REFERENCES", "approval_request_id TEXT UNIQUE REFERENCES", "legacy_submission_id TEXT UNIQUE REFERENCES", "legacy_fff_assessment_id TEXT UNIQUE REFERENCES", "ON DELETE SET NULL"]));
record("DEV053-1H-SCHEMA-005 token table carries no business or actor payload",
  has(sqlite, ["key_hash TEXT PRIMARY KEY", "scope_hash TEXT NOT NULL", "result_fingerprint TEXT", "expires_at TEXT NOT NULL"]) &&
  !/drawing_revision_lifecycle_command_tokens\s*\([^;]*(actor|company_id|drawing|revision|request_id|reason|payload|file_name)/isu.test(sqlite));
record("DEV053-1H-SCHEMA-006 all new Postgres tables force RLS and revoke direct roles",
  tables.every((table) => postgres.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`) &&
    postgres.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`) &&
    postgres.includes(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`)));
record("DEV053-1H-SCHEMA-007 cleanup delete exception is exact and other-domain fail-closed",
  has(sqlite, ["workflow.approval_request_id = OLD.request_id", "workflow.cleanup_authorized_at IS NOT NULL", "workflow.origin = 'adopted_active'", "AUDIT_LOG_APPEND_ONLY"]) &&
  has(postgres, ["phase1h_cleanup_authorized", "guard_approval_platform_phase1h_cleanup_delete", "guard_audit_log_phase1h_cleanup_delete", "cleanup_authorized_at IS NOT NULL"]));
record("DEV053-1H-SCHEMA-008 immutable candidate companion remains unchanged",
  has(sqlite, ["trg_drawing_revision_package_review_approvals_no_delete", "DRAWING_REVISION_PACKAGE_REVIEW_APPROVAL_IMMUTABLE"]) &&
  !postgres.includes("DROP TRIGGER IF EXISTS trg_drawing_revision_package_review_approvals_no_delete"));
record("DEV053-1H-SCHEMA-009 migration is schema-only except new action seed",
  !/^\s*(UPDATE|DELETE|MERGE|TRUNCATE)\s+/imu.test(postgres) &&
  (postgres.match(/^\s*INSERT\s+INTO\s+/gimu)?.length ?? 0) === 1 &&
  postgres.includes("numbering.drawing_revision_lifecycle_review") &&
  postgres.includes("ON CONFLICT (action_code) DO NOTHING"));
record("DEV053-1H-SCHEMA-010 mode is default-off with only off/shadow/enforced",
  has(feature, [
    'DRAWING_REVISION_LIFECYCLE_MODE_FLAG = "PDM_DRAWING_REVISION_LIFECYCLE_MODE"',
    'DrawingRevisionLifecycleMode = "off" | "shadow" | "enforced"',
    'return "off"'
  ]) && envExample.includes("PDM_DRAWING_REVISION_LIFECYCLE_MODE=off"));
record("DEV053-1H-SCHEMA-011 existing SQLite package receives columns before full schema executes",
  dbSource.indexOf("ensureDrawingRevisionLifecycleAuthorityPreSchema(database)") < dbSource.indexOf("database.exec(schema)") &&
  has(dbSource, ["function ensureDrawingRevisionLifecycleAuthorityPreSchema", '"lifecycle_state"', '"active_correction_reason"']));

const sourceHash = hash(postgres);
const targetHash = hash(mirror);
const manifestEntry = manifest.migrations.find((entry) => entry.source === "db/postgres/026_drawing_revision_lifecycle_authority.sql");
record("DEV053-1H-SCHEMA-012 Supabase mirror and manifest match source",
  mirror.includes(`-- Source SHA-256: ${sourceHash}`) && mirror.trim().endsWith(postgres.trim()) &&
  manifestEntry?.target === "supabase/migrations/20260806020000_drawing_revision_lifecycle_authority.sql" &&
  manifestEntry?.sourceSha256 === sourceHash && manifestEntry?.targetSha256 === targetHash &&
  sync.includes('source: "db/postgres/026_drawing_revision_lifecycle_authority.sql"'),
  JSON.stringify({ sourceHash, targetHash }));

let database;
try {
  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(sqlite);
  const actualTables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  const packageColumns = new Set(database.prepare("PRAGMA table_info(drawing_revision_packages)").all().map((row) => row.name));
  record("DEV053-1H-SCHEMA-013 clean SQLite schema executes",
    tables.every((table) => actualTables.has(table)) && packageColumns.has("lifecycle_state") && packageColumns.has("active_correction_reason"));

  database.pragma("foreign_keys = OFF");
  database.exec(`
    INSERT INTO approval_platform_requests (
      id, company_id, action_code, domain_code, request_status, title, reason, requested_by
    ) VALUES ('request-protected', 'company-jenfu', 'numbering.drawing_revision_lifecycle_review', 'drawing_revision', 'pending', 'QC', 'QC', 'user-qc');
    INSERT INTO approval_platform_targets (id, request_id, target_type, target_id)
    VALUES ('target-protected', 'request-protected', 'drawing_revision_package', 'package-qc');
  `);
  let unrelatedDeleteBlocked = false;
  try {
    database.prepare("DELETE FROM approval_platform_targets WHERE id = 'target-protected'").run();
  } catch (error) {
    unrelatedDeleteBlocked = String(error).includes("APPROVAL_PLATFORM_TARGET_IMMUTABLE");
  }
  database.exec(`
    INSERT INTO drawing_revision_lifecycle_workflows (
      id, package_id, company_id, approval_request_id, origin, state, submitted_by, snapshot_hash, cleanup_authorized_at
    ) VALUES ('workflow-qc', 'package-qc', 'company-jenfu', 'request-protected', 'new', 'cleanup_pending', 'user-qc', 'snapshot-qc', datetime('now'));
  `);
  const authorizedDelete = database.prepare("DELETE FROM approval_platform_targets WHERE id = 'target-protected'").run().changes === 1;
  record("DEV053-1H-SCHEMA-014 exact cleanup authorization opens only matching delete",
    unrelatedDeleteBlocked && authorizedDelete, JSON.stringify({ unrelatedDeleteBlocked, authorizedDelete }));

  database.exec(`
    INSERT INTO drawing_revision_package_review_approvals (
      package_id, company_id, candidate_revision_id, approval_request_id, snapshot_hash, approved_by, approved_at
    ) VALUES ('immutable-package', 'company-jenfu', 'candidate-qc', 'approval-qc', 'hash-qc', 'user-qc', datetime('now'));
  `);
  let companionDeleteBlocked = false;
  try {
    database.prepare("DELETE FROM drawing_revision_package_review_approvals WHERE package_id = 'immutable-package'").run();
  } catch (error) {
    companionDeleteBlocked = String(error).includes("DRAWING_REVISION_PACKAGE_REVIEW_APPROVAL_IMMUTABLE");
  }
  record("DEV053-1H-SCHEMA-015 non-Phase1H immutable companion still rejects delete", companionDeleteBlocked);
} catch (error) {
  record("DEV053-1H-SCHEMA-RUNTIME", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  database?.close();
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
