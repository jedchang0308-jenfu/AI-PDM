#!/usr/bin/env node

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { applyDev063RewritePlan, buildDev063RewritePlan } from "./dev-063-numbering-vocabulary-rewrite.mjs";
import { rewriteNumberingHumanText } from "../src/lib/numbering-vocabulary.ts";

const root = process.cwd();
const checks = [];

function record(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(condition, name, detail = "") {
  record(name, condition, detail);
  if (!condition) throw new Error(`DEV063_QC_FAILED:${name}`);
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(?:ts|tsx|mjs)$/u.test(entry.name) ? [full] : [];
  });
}

function buildFixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE approval_requests (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, reason TEXT NOT NULL);
    CREATE TABLE numbering_draft_workspaces (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, lifecycle_status TEXT NOT NULL, append_reason TEXT, cancel_reason TEXT);
    CREATE TABLE number_candidate_reservations (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, reservation_state TEXT NOT NULL, recycle_reason TEXT);
    CREATE TABLE numbering_task_items (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, task_status TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, detail_json TEXT NOT NULL);
    CREATE TABLE numbering_notifications (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, detail_json TEXT NOT NULL);
    CREATE TABLE numbering_candidate_revision_drafts (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, lifecycle_status TEXT NOT NULL, override_reason TEXT, policy_snapshot_json TEXT NOT NULL);
    CREATE TABLE numbering_candidate_revision_files (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, description TEXT NOT NULL);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, action TEXT NOT NULL, detail_json TEXT NOT NULL);
    CREATE TABLE submission_snapshots (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, snapshot_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL);
    CREATE TABLE approval_platform_impact_snapshots (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, snapshot_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL);
    CREATE TRIGGER audit_append_only BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_APPEND_ONLY'); END;
  `);
  db.prepare("INSERT INTO approval_requests VALUES (?, ?, ?)").run("request-1", "company-jenfu", "候選圖料號已保留，送交正式發布審核");
  db.prepare("INSERT INTO numbering_draft_workspaces VALUES (?, ?, ?, ?, ?)").run("workspace-1", "company-jenfu", "active", "正式主根追加", null);
  db.prepare("INSERT INTO number_candidate_reservations VALUES (?, ?, ?, ?)").run("reservation-1", "company-jenfu", "active", "候選號取消後已釋出");
  db.prepare("INSERT INTO numbering_task_items VALUES (?, ?, ?, ?, ?, ?)").run("task-1", "company-jenfu", "open", "候選圖料號發布審核", "請確認保留號內容", JSON.stringify({ label: "正式圖號" }));
  db.prepare("INSERT INTO numbering_notifications VALUES (?, ?, ?, ?, ?)").run("notification-1", "company-jenfu", "候選首版完成", "候選圖號已建立", JSON.stringify({ label: "正式料號" }));
  db.prepare("INSERT INTO numbering_candidate_revision_drafts VALUES (?, ?, ?, ?, ?)").run("revision-1", "company-jenfu", "draft", "候選首版", JSON.stringify({ label: "正式發布" }));
  db.prepare("INSERT INTO numbering_candidate_revision_files VALUES (?, ?, ?)").run("file-1", "company-jenfu", "候選圖面附件");
  db.prepare("INSERT INTO audit_logs VALUES (?, ?, ?, ?)").run("audit-1", "company-jenfu", "numbering", JSON.stringify({ label: "候選圖號" }));
  db.prepare("INSERT INTO submission_snapshots VALUES (?, ?, ?, ?)").run("snapshot-1", "company-jenfu", "immutable-hash", JSON.stringify({ label: "保留號碼" }));
  db.prepare("INSERT INTO approval_platform_impact_snapshots VALUES (?, ?, ?, ?)").run("impact-1", "company-jenfu", "impact-hash", JSON.stringify({ label: "正式發布" }));
  return db;
}

try {
  const helperFixture = "候選圖料號已保留，正式圖號與正式料號尚未正式發布";
  const helperResult = rewriteNumberingHumanText(helperFixture);
  assert(!/[候選]|保留號|正式圖號|正式料號|正式發布/u.test(helperResult), "VOCAB-001 helper removes deprecated terms", helperResult);

  const files = sourceFiles(path.join(root, "src")).filter((file) => !file.endsWith("numbering-vocabulary.ts"));
  const forbidden = /保留號|候選|號碼效力|正式圖號|正式料號|已釋出/u;
  const hits = files.flatMap((file) => {
    const content = fs.readFileSync(file, "utf8");
    return forbidden.test(content) ? [path.relative(root, file)] : [];
  });
  assert(hits.length === 0, "VOCAB-002 source has no deprecated Chinese numbering terms", hits.join(", "));

  const db = buildFixture();
  const rawAudit = db.prepare("SELECT detail_json FROM audit_logs WHERE id = 'audit-1'").get().detail_json;
  const rawSnapshot = db.prepare("SELECT snapshot_hash, snapshot_json FROM submission_snapshots WHERE id = 'snapshot-1'").get();
  const machineState = db.prepare("SELECT lifecycle_status FROM numbering_draft_workspaces WHERE id = 'workspace-1'").get().lifecycle_status;
  const plan = buildDev063RewritePlan(db, "company-jenfu");
  assert(plan.mutable.some((field) => field.changed > 0), "DATA-001 dry-run finds mutable human-readable rows");
  assert(plan.immutableProjection.some((field) => field.changed > 0), "DATA-002 dry-run finds immutable rows for projection");
  applyDev063RewritePlan(db, plan);
  const afterPlan = buildDev063RewritePlan(db, "company-jenfu");
  assert(afterPlan.mutable.every((field) => field.changed === 0), "DATA-003 apply is idempotent for mutable fields");
  assert(afterPlan.immutableProjection.every((field) => field.changed === 0), "DATA-004 apply is idempotent for projection rows");
  assert(db.prepare("SELECT lifecycle_status FROM numbering_draft_workspaces WHERE id = 'workspace-1'").get().lifecycle_status === machineState, "DATA-005 machine lifecycle state unchanged");
  assert(db.prepare("SELECT detail_json FROM audit_logs WHERE id = 'audit-1'").get().detail_json === rawAudit, "DATA-006 raw audit remains unchanged");
  const afterSnapshot = db.prepare("SELECT snapshot_hash, snapshot_json FROM submission_snapshots WHERE id = 'snapshot-1'").get();
  assert(afterSnapshot.snapshot_hash === rawSnapshot.snapshot_hash && afterSnapshot.snapshot_json === rawSnapshot.snapshot_json, "DATA-007 snapshot hash and raw JSON remain unchanged");
  const projection = db.prepare("SELECT rewritten_value, source_sha256 FROM dev063_numbering_vocabulary_projection WHERE source_table = 'audit_logs' AND source_id = 'audit-1'").get();
  assert(Boolean(projection) && projection.rewritten_value.includes("圖號") && projection.source_sha256.length === 64, "DATA-008 immutable display projection preserves source hash");
  db.close();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

if (checks.length > 0 && checks.every((check) => check.pass)) {
  console.log(`DEV063_QC_PASS checks=${checks.length}`);
}
