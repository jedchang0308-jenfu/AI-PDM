#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const results = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    results.push({ name: `READ ${relativePath}`, passed: false, detail: "missing" });
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

const schema = read("db/schema.sql");
const postgresMigration = read("db/postgres/010_transfer_package_phase3a0.sql");
const repository = read("src/lib/repositories/transfer-package-async-repository.ts");
const domain = read("src/lib/transfer-packages.ts");
const createRoute = read("src/app/api/transfer-packages/route.ts");
const contextRoute = read("src/app/api/transfer-packages/workbench-context/route.ts");
const detailRoute = read("src/app/api/transfer-packages/[id]/route.ts");
const itemRoute = read("src/app/api/transfer-packages/[id]/items/route.ts");
const removeRoute = read("src/app/api/transfer-packages/[id]/items/[itemId]/route.ts");
const cancelRoute = read("src/app/api/transfer-packages/[id]/cancel/route.ts");
const readinessRoute = read("src/app/api/transfer-packages/[id]/readiness-summary/route.ts");
const newPage = read("src/app/transfer-packages/new/page.tsx");
const detailPage = read("src/app/transfer-packages/[id]/page.tsx");
const workbench = read("src/components/transfer-package-workbench.tsx");
const css = read("src/app/globals.css");

record("TP0-001 SQLite schema has Phase 3A-0 aggregate tables", includesAll(schema, [
  "CREATE TABLE IF NOT EXISTS transfer_package_counters",
  "CREATE TABLE IF NOT EXISTS transfer_packages",
  "CREATE TABLE IF NOT EXISTS transfer_package_items",
  "CREATE TABLE IF NOT EXISTS transfer_package_events"
]));
record("TP0-002 schema enforces company, package code and create idempotency uniqueness", includesAll(schema, [
  "UNIQUE (company_id, package_code)",
  "UNIQUE (company_id, created_by, create_idempotency_key)",
  "UNIQUE (package_id, entity_type, entity_id)"
]));
record("TP0-003 event evidence is append-only in SQLite", includesAll(schema, [
  "trg_transfer_package_events_no_update",
  "trg_transfer_package_events_no_delete",
  "TRANSFER_PACKAGE_EVENT_APPEND_ONLY"
]));
record("TP0-004 offline Postgres artifact enables and forces RLS", includesAll(postgresMigration, [
  "ALTER TABLE transfer_packages ENABLE ROW LEVEL SECURITY",
  "ALTER TABLE transfer_packages FORCE ROW LEVEL SECURITY",
  "REVOKE ALL ON transfer_package_counters, transfer_packages, transfer_package_items, transfer_package_events"
]));
record("TP0-005 repository uses company-scoped reads and optimistic locking", includesAll(repository, [
  "WHERE id = :id AND company_id = :companyId",
  "row_version = :expectedRowVersion",
  "TRANSFER_PACKAGE_STALE"
]));
record("TP0-006 create is transactional, numbered and idempotent", includesAll(repository, [
  "this.client.transaction",
  "transfer_package_counters",
  "findByIdempotency",
  "create_idempotency_key",
  "DraftCreated"
]));
record("TP0-007 source aliases normalize to canonical entities", includesAll(domain, [
  '"drawing_number"',
  '"part_number"',
  '"drawing"',
  '"part"',
  "resolveScopeEntity"
]));
record("TP0-008 create API requires Idempotency-Key", createRoute.includes('request.headers.get("Idempotency-Key")'));
record("TP0-009 workbench context GET cannot call create", contextRoute.includes("getTransferPackageWorkbenchContext") && !contextRoute.includes("createTransferPackageDraft"));
record("TP0-010 Header, item, remove, cancel and readiness routes exist", includesAll(detailRoute, ["export async function GET", "export async function PATCH"]) && itemRoute.includes("export async function POST") && removeRoute.includes("export async function DELETE") && cancelRoute.includes("cancelTransferPackage") && readinessRoute.includes("buildTransferPackageReadinessSummary"));
record("TP0-011 new and detail routes share one workbench shell", newPage.includes("TransferPackageWorkbenchShell") && detailPage.includes("TransferPackageWorkbenchShell"));
record("TP0-012 UI exposes explicit create, scope, adapters, blockers and history", includesAll(workbench, [
  "建立技轉包",
  "案件範圍",
  "模組狀態",
  "阻擋與下一步",
  "異動紀錄",
  "data-transfer-package-mode"
]));
record("TP0-013 parser and formal submit remain honest unavailable capabilities", includesAll(domain, [
  "packAndGoIntake: false",
  "formalSubmit: false",
  'status: "unavailable"'
]));
record("TP0-014 cancellation uses reason, confirmation and terminal evidence", includesAll(workbench, [
  "取消技轉包",
  "cancelReason",
  "cancelConfirmed",
  "後續若需繼續，必須建立新的技轉包"
]) && includesAll(repository, ["PackageCancelled", 'package_status = \'Cancelled\'']));
record("TP0-015 responsive workbench styles cover tablet and phone", css.includes(".transfer-workbench") && css.includes("@media (max-width: 780px)") && css.includes("@media (max-width: 520px)"));

try {
  const db = new Database(":memory:");
  db.exec(schema);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'transfer_package%' ORDER BY name").all();
  record("TP0-016 SQLite schema initializes with all transfer tables", tables.length === 4, JSON.stringify(tables));

  db.prepare("INSERT OR IGNORE INTO companies (id, company_code, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run("qc-company", "QC041", "QC", new Date().toISOString(), new Date().toISOString());
  db.prepare("INSERT INTO users (id, display_name, role, company_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("qc-user", "QC User", "Engineer", "qc-company", new Date().toISOString(), new Date().toISOString());
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO transfer_packages (
    id, company_id, package_code, title, case_type, case_reason,
    source_reference_status, source_reference_reason, package_status,
    owner_id, created_by, create_idempotency_key, row_version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, 1, ?, ?)`)
    .run("qc-package", "qc-company", "TP-2026-0001", "QC package", "design_change_case", "QC reason", "not_available", "QC no source", "qc-user", "qc-user", "qc-key", now, now);
  db.prepare("INSERT INTO transfer_package_events (id, company_id, package_id, event_type, actor_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("qc-event", "qc-company", "qc-package", "DraftCreated", "qc-user", "{}", now);

  let duplicateBlocked = false;
  try {
    db.prepare(`INSERT INTO transfer_packages (
      id, company_id, package_code, title, case_type, case_reason,
      source_reference_status, source_reference_reason, package_status,
      owner_id, created_by, create_idempotency_key, row_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, 1, ?, ?)`)
      .run("qc-package-2", "qc-company", "TP-2026-0002", "QC duplicate", "design_change_case", "QC reason", "not_available", "QC no source", "qc-user", "qc-user", "qc-key", now, now);
  } catch {
    duplicateBlocked = true;
  }
  record("TP0-017 duplicate create idempotency is rejected by final DB guard", duplicateBlocked);

  let appendOnly = false;
  try {
    db.prepare("UPDATE transfer_package_events SET detail_json = '{}' WHERE id = 'qc-event'").run();
  } catch (error) {
    appendOnly = String(error).includes("TRANSFER_PACKAGE_EVENT_APPEND_ONLY");
  }
  record("TP0-018 event update is rejected", appendOnly);
  db.close();
} catch (error) {
  record("TP0-RUNTIME schema behavior", false, String(error));
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
