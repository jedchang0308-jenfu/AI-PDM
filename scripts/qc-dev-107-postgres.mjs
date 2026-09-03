#!/usr/bin/env node

/* QA-107-020: disposable PostgreSQL parity/concurrency for the same
 * recognition repository contract.  The primary SQLite database is opened
 * read-only and copied into a task-owned cluster; no production connection is
 * ever used.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import pg from "pg";

import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRecognitionAsyncRepository } from "../src/lib/repositories/drawing-recognition-async-repository.ts";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const primaryPath = path.join(root, "data", "ai-pdm.sqlite");
const runId = `DEV107-postgres-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV107_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-107", runId), "postgres");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev107-postgres-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const clusterDir = path.join(taskRoot, "cluster");
const sourceDbPath = path.join(dataDir, "ai-pdm.sqlite");
const logPath = path.join(taskRoot, "postgres.log");
const pgBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const dbName = `dev107_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
const COMPANY = "company-jenfu";
const PARENT = "recognition-7db214be-69db-4175-a16e-4d78784a8246";
const DRAWING = "drawing-draft-drawing-58f3b735-a3fe-4c3b-87be-f2e23a15bebe";
const REVISION = "f717dd6b-311a-49f9-ace6-a31630ee56ba";
const ACTOR = "user-manager-demo";
const checks = [];
let port = null;
let started = false;
let control = null;
let client = null;
let sourceDb = null;

fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.copyFileSync(primaryPath, sourceDbPath);
if (fs.existsSync(path.join(root, "data", "repository"))) fs.cpSync(path.join(root, "data", "repository"), repositoryDir, { recursive: true, force: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}
function quote(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function dsn() { return `postgresql://postgres@127.0.0.1:${port}/${dbName}`; }
function normalizeForPostgres(value, column) {
  if (value === undefined || value === null) return null;
  if (column.data_type === "boolean") return Boolean(Number(value));
  if (["json", "jsonb"].includes(column.data_type) && typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}
function sqlFiles() { return ["001_initial_schema.sql", "033_drawing_recognition.sql", "042_status_data_rebuild.sql", "043_inline_relation_matrix.sql", "048_shared_assembly_bom.sql", "049_solidworks_credential_ui_activation.sql", "051_drawing_recognition_part_owner_invariant.sql", "053_drawing_recognition_amendment_lineage.sql"]; }

async function copySnapshot() {
  const tables = (await control.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename);
  const sourceTables = new Set(sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
  await control.query("SET session_replication_role=replica");
  let copiedRows = 0;
  for (const table of tables) {
    if (!sourceTables.has(table)) continue;
    const pgColumns = new Map((await control.query("SELECT column_name,data_type,is_generated,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO").map((row) => [row.column_name, row]));
    const sqliteColumns = sourceDb.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => row.name);
    const columns = sqliteColumns.filter((column) => pgColumns.has(column));
    if (!columns.length) continue;
    const rows = sourceDb.prepare(`SELECT ${columns.map(quote).join(",")} FROM ${quote(table)}`).all();
    for (const row of rows) {
      const values = columns.map((column) => normalizeForPostgres(row[column], pgColumns.get(column)));
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
      await control.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
      copiedRows += 1;
    }
  }
  // SQLite keeps a few legacy duplicate drawing numbers while the current
  // PostgreSQL authority enforces company+number uniqueness.  Preserve every
  // referenced source identity in the disposable cluster by disambiguating
  // only the conflicting legacy row; this is task-owned fixture preparation,
  // never a production repair.
  const sourceDrawings = sourceDb.prepare("SELECT * FROM drawings ORDER BY id").all();
  const pgDrawingColumns = new Map((await control.query("SELECT column_name,data_type,is_generated,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name='drawings' ORDER BY ordinal_position")).rows.filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO").map((row) => [row.column_name, row]));
  const drawingColumns = Object.keys(sourceDrawings[0] ?? {}).filter((column) => pgDrawingColumns.has(column));
  for (const sourceDrawing of sourceDrawings) {
    const present = await control.query("SELECT 1 FROM drawings WHERE id=$1", [sourceDrawing.id]);
    if (present.rowCount) continue;
    const conflict = (await control.query("SELECT id FROM drawings WHERE company_id=$1 AND drawing_number=$2 LIMIT 1", [sourceDrawing.company_id, sourceDrawing.drawing_number])).rows[0];
    if (conflict) await control.query("UPDATE drawings SET drawing_number=$1 WHERE id=$2", [`__dev107-legacy-${conflict.id}`, conflict.id]);
    const values = drawingColumns.map((column) => normalizeForPostgres(sourceDrawing[column], pgDrawingColumns.get(column)));
    await control.query(`INSERT INTO drawings (${drawingColumns.map(quote).join(",")}) VALUES (${drawingColumns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`, values);
  }
  await control.query("SET session_replication_role=origin");
  return copiedRows;
}
async function foreignKeyViolations() {
  const constraints = (await control.query(`SELECT con.conname,child.relname child_table,parent.relname parent_table,
    json_agg(child_att.attname ORDER BY keys.ordinality) child_columns,json_agg(parent_att.attname ORDER BY keys.ordinality) parent_columns
    FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid JOIN pg_class parent ON parent.oid=con.confrelid
    JOIN unnest(con.conkey,con.confkey) WITH ORDINALITY keys(child_num,parent_num,ordinality) ON true
    JOIN pg_attribute child_att ON child_att.attrelid=child.oid AND child_att.attnum=keys.child_num
    JOIN pg_attribute parent_att ON parent_att.attrelid=parent.oid AND parent_att.attnum=keys.parent_num
    WHERE con.contype='f' AND child.relnamespace='public'::regnamespace
    GROUP BY con.conname,child.relname,parent.relname ORDER BY child.relname,con.conname`)).rows;
  const violations = [];
  for (const constraint of constraints) {
    const nonNull = constraint.child_columns.map((column) => `child.${quote(column)} IS NOT NULL`).join(" AND ");
    const join = constraint.child_columns.map((column, index) => `parent.${quote(constraint.parent_columns[index])}=child.${quote(column)}`).join(" AND ");
    const result = await control.query(`SELECT COUNT(*)::integer count FROM ${quote(constraint.child_table)} child WHERE ${nonNull} AND NOT EXISTS (SELECT 1 FROM ${quote(constraint.parent_table)} parent WHERE ${join})`);
    if (Number(result.rows[0].count) > 0) violations.push({ ...constraint, count: Number(result.rows[0].count) });
  }
  return violations;
}
async function check(id, label, fn) {
  try { const detail = await fn(); checks.push({ id, label, status: "PASS", detail: detail ?? null }); console.log(`PASS ${id} ${label}`); }
  catch (error) { checks.push({ id, label, status: "FAIL", error: error instanceof Error ? error.stack ?? error.message : String(error) }); console.error(`FAIL ${id} ${label}`); }
}

async function main() {
  sourceDb = new Database(sourceDbPath, { readonly: true });
  port = await getFreePort();
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-107 disposable PostgreSQL provider parity and concurrency", port, owningProcessTree: `node ${process.pid} -> task-owned PostgreSQL 18`, cleanupCondition: "client closed, cluster stopped, port released and taskRoot removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot } }));
  run(path.join(pgBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(pgBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", logPath, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(pgBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", dbName]);
  control = new pg.Client({ connectionString: dsn(), application_name: "ai-pdm-dev107-postgres" });
  await control.connect();
  for (const file of sqlFiles()) await control.query(fs.readFileSync(path.join(root, "db", "postgres", file), "utf8"));
  const copiedRows = await copySnapshot();
  const violations = await foreignKeyViolations();
  if (violations.length > 0) {
    const missingDrawingIds = (await control.query(`SELECT DISTINCT child.drawing_id FROM drawing_recognition_sessions child WHERE NOT EXISTS (SELECT 1 FROM drawings parent WHERE parent.id=child.drawing_id)`)).rows;
    console.error(JSON.stringify({ foreignKeyViolations: violations, missingDrawingIds, pgDrawings: (await control.query("SELECT id FROM drawings ORDER BY id LIMIT 5")).rows, sourceDrawings: sourceDb.prepare("SELECT id FROM drawings ORDER BY id LIMIT 5").all() }));
    throw new Error(`POSTGRES_SNAPSHOT_FK_VIOLATION:${violations.length}`);
  }

  process.env.PDM_DB_PROVIDER = "postgres";
  process.env.PDM_POSTGRES_URL = dsn();
  process.env.DATABASE_URL = dsn();
  process.env.PDM_RELEASE_MODE = "local_stub";
  client = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsn(), maxConnections: 8 });

  await check("QA-107-020", "PostgreSQL repository matches SQLite amendment lineage and one-open concurrency", async () => {
    const repository = new DrawingRecognitionAsyncRepository(client);
    const parent = await client.queryOne("SELECT id,row_version FROM drawing_recognition_sessions WHERE id=:id AND company_id=:companyId", { id: PARENT, companyId: COMPANY });
    assert.ok(parent);
    const sourceIds = (await client.query("SELECT file_asset_id FROM drawing_recognition_sources WHERE session_id=:id AND company_id=:companyId ORDER BY sort_order,id", { id: PARENT, companyId: COMPANY })).map((row) => row.file_asset_id);
    const create = (suffix) => repository.createSession({ companyId: COMPANY, actorId: ACTOR, sourceContextType: "drawing_revision", sourceContextId: REVISION, sourceAssetIds: sourceIds, drawingId: DRAWING, drawingRevisionId: REVISION, supersedesSessionId: PARENT, sessionPurpose: "amendment", evidenceOriginSessionId: PARENT });
    const outcomes = await Promise.allSettled(["a", "b", "c", "d"].map(create));
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled").map((outcome) => outcome.value);
    assert.ok(fulfilled.length >= 1);
    const ids = new Set(fulfilled.map((value) => value.id));
    assert.equal(ids.size, 1);
    const openCount = Number((await client.queryOne("SELECT COUNT(*) count FROM drawing_recognition_sessions WHERE company_id=:companyId AND session_purpose='amendment' AND evidence_origin_session_id=:origin AND status IN ('queued','extracting','review_ready','extraction_partial','ready_to_formalize')", { companyId: COMPANY, origin: PARENT })).count);
    assert.equal(openCount, 1);
    return { copiedRows, foreignKeyViolations: 0, concurrentRequests: outcomes.length, fulfilled: fulfilled.length, successorId: fulfilled[0].id, openCount };
  });
}

let fatal = null;
try { await main(); } catch (error) { fatal = error; console.error(error); }
try { if (client) await client.close(); } catch { /* best effort cleanup */ }
try { if (control) await control.end(); } catch { /* best effort cleanup */ }
try { if (sourceDb) sourceDb.close(); } catch { /* best effort cleanup */ }
if (started) { try { run(path.join(pgBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* evidence records cleanup below */ } }
const manifest = { dev: "DEV-107", runner: "qc-dev-107-postgres", runId, expectedCaseIds: ["QA-107-020"], checks, runtimeDeclaration: { project: root, purpose: "task-owned PostgreSQL parity", port, owningProcessTree: `node ${process.pid} -> PostgreSQL`, cleanupCondition: "cluster stopped", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot }, cleanup: { clusterStopped: !started || !fs.existsSync(path.join(clusterDir, "postmaster.pid")), taskRootRemoved: false }, status: fatal || checks.some((check) => check.status !== "PASS") ? "FAIL" : "PASS", completedAt: new Date().toISOString() };
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), JSON.stringify(manifest, null, 2));
fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
manifest.cleanup.taskRootRemoved = !fs.existsSync(taskRoot);
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
