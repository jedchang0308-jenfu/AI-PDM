#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import Database from "better-sqlite3";
import pg from "pg";

import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRevisionWorkService } from "../src/lib/drawing-revision-work.ts";
import { uploadDrawingRevisionWorkFile } from "../src/lib/drawing-revision-work-file.ts";
import { DrawingRevisionWorkAsyncRepository } from "../src/lib/repositories/drawing-revision-work-async-repository.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV100-postgres-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV100_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-100", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev100-postgres-"));
const sourceDataDir = path.join(taskRoot, "source-data");
const sourceRepositoryDir = path.join(taskRoot, "source-repository");
const sourcePath = path.join(sourceDataDir, "ai-pdm.sqlite");
const clusterDir = path.join(taskRoot, "cluster");
const postgresLog = path.join(taskRoot, "postgres.log");
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const dbName = `dev100_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
const checks = [];
let sourceDb = null;
let controlClient = null;
let dbClient = null;
let pgPort = null;
let started = false;
let firstFailure = null;

fs.mkdirSync(sourceDataDir, { recursive: true });
fs.mkdirSync(sourceRepositoryDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

function dsnFor(port) { return `postgresql://postgres@127.0.0.1:${port}/${dbName}`; }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}
function quote(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function normalizeForPostgres(value, column) {
  if (value === undefined || value === null) return null;
  if (column.data_type === "boolean") return Boolean(Number(value));
  if (column.data_type === "json" || column.data_type === "jsonb") {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}
function repositoryFiles() {
  if (!fs.existsSync(sourceRepositoryDir)) return [];
  return fs.readdirSync(sourceRepositoryDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(entry.parentPath, entry.name);
      return { path: path.relative(sourceRepositoryDir, fullPath).replaceAll("\\", "/"), hash: crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex") };
    }).sort((a, b) => a.path.localeCompare(b.path));
}
async function check(id, label, fn) {
  try {
    const detail = await fn();
    checks.push({ id, label, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push({ id, label, status: "FAIL", message });
    throw error;
  }
}
async function columnsFor(table) {
  const result = await controlClient.query(`SELECT column_name,data_type,is_generated,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return new Map(result.rows.filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO").map((row) => [row.column_name, row]));
}
async function restoreSqliteSnapshot() {
  const pgTables = (await controlClient.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename);
  const sourceTables = new Set(sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
  await controlClient.query("SET session_replication_role=replica");
  let copiedRows = 0;
  for (const table of pgTables) {
    if (!sourceTables.has(table)) continue;
    const pgColumns = await columnsFor(table);
    const sqliteColumns = sourceDb.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => row.name);
    const columns = sqliteColumns.filter((column) => pgColumns.has(column));
    if (!columns.length) continue;
    const rows = sourceDb.prepare(`SELECT ${columns.map(quote).join(",")} FROM ${quote(table)}`).all();
    for (const row of rows) {
      const values = columns.map((column) => normalizeForPostgres(row[column], pgColumns.get(column)));
      await controlClient.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`, values);
      copiedRows += 1;
    }
  }
  await controlClient.query("SET session_replication_role=origin");
  return copiedRows;
}
async function fkViolations() {
  const constraints = await controlClient.query(`SELECT con.conname,child.relname AS child_table,parent.relname AS parent_table,
      json_agg(child_att.attname ORDER BY keys.ordinality) AS child_columns,json_agg(parent_att.attname ORDER BY keys.ordinality) AS parent_columns
    FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid JOIN pg_class parent ON parent.oid=con.confrelid
    JOIN unnest(con.conkey,con.confkey) WITH ORDINALITY AS keys(child_num,parent_num,ordinality) ON true
    JOIN pg_attribute child_att ON child_att.attrelid=child.oid AND child_att.attnum=keys.child_num
    JOIN pg_attribute parent_att ON parent_att.attrelid=parent.oid AND parent_att.attnum=keys.parent_num
    WHERE con.contype='f' AND child.relnamespace='public'::regnamespace
    GROUP BY con.conname,child.relname,parent.relname ORDER BY child.relname,con.conname`);
  const violations = [];
  for (const constraint of constraints.rows) {
    const nonNull = constraint.child_columns.map((column) => `child.${quote(column)} IS NOT NULL`).join(" AND ");
    const join = constraint.child_columns.map((column, index) => `parent.${quote(constraint.parent_columns[index])}=child.${quote(column)}`).join(" AND ");
    const result = await controlClient.query(`SELECT COUNT(*)::integer count FROM ${quote(constraint.child_table)} child WHERE ${nonNull} AND NOT EXISTS (SELECT 1 FROM ${quote(constraint.parent_table)} parent WHERE ${join})`);
    if (Number(result.rows[0].count) > 0) violations.push({ ...constraint, count: Number(result.rows[0].count) });
  }
  return violations;
}
async function activeRows(workId) {
  return (await controlClient.query(`SELECT binding.ordinal,file.id,asset.id asset_id,asset.file_name,file.role,asset.storage_key,asset.content_hash
    FROM drawing_revision_work_files binding JOIN drawing_revision_files file ON file.id=binding.file_binding_id JOIN file_assets asset ON asset.id=file.source_file_asset_id
    WHERE binding.work_id=$1 AND file.removed_at IS NULL AND asset.deleted_at IS NULL ORDER BY binding.ordinal,file.id`, [workId])).rows;
}
async function tombstones(workId) {
  return (await controlClient.query(`SELECT file.id,asset.id asset_id,asset.file_name,file.role,file.removed_by,asset.deleted_by,asset.deleted_reason,asset.storage_key,asset.content_hash
    FROM drawing_revision_files file JOIN file_assets asset ON asset.id=file.source_file_asset_id JOIN canonical_workbench_states state ON state.revision_id=file.drawing_revision_id
    WHERE state.work_id=$1 AND file.removed_at IS NOT NULL ORDER BY file.created_at,file.id`, [workId])).rows;
}
async function stateSnapshot(workId) {
  // pg.Client serializes commands on one connection; keep these reads explicit so
  // the evidence runner does not rely on the driver's deprecated query queueing.
  const work = await controlClient.query("SELECT id,row_version FROM drawing_revision_works WHERE id=$1", [workId]);
  const bindings = await controlClient.query("SELECT work_id,file_binding_id,ordinal,content_hash FROM drawing_revision_work_files WHERE work_id=$1 ORDER BY ordinal,file_binding_id", [workId]);
  const files = await controlClient.query("SELECT file.* FROM drawing_revision_files file JOIN canonical_workbench_states state ON state.revision_id=file.drawing_revision_id WHERE state.work_id=$1 ORDER BY file.created_at,file.id", [workId]);
  const assets = await controlClient.query("SELECT asset.* FROM file_assets asset JOIN drawing_revision_files file ON file.source_file_asset_id=asset.id JOIN canonical_workbench_states state ON state.revision_id=file.drawing_revision_id WHERE state.work_id=$1 ORDER BY asset.created_at,asset.id", [workId]);
  const receipts = await controlClient.query("SELECT command_name,idempotency_key,command_status,response_json FROM platform_command_receipts WHERE effect_key LIKE $1 ORDER BY idempotency_key", [`drawing-work:${workId}:%`]);
  return JSON.parse(JSON.stringify({ work: work.rows, bindings: bindings.rows, files: files.rows, assets: assets.rows, receipts: receipts.rows, repositoryFiles: repositoryFiles() }));
}
function portAccepting(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

async function main() {
  process.env.PDM_DATA_DIR = sourceDataDir;
  process.env.PDM_REPOSITORY_DIR = sourceRepositoryDir;
  process.env.PDM_DB_PROVIDER = "sqlite";
  const fixture = createFixtureDatabase({ filename: sourcePath, canonical: false, rdLifecycle: "preparing" });
  fixture.close();
  run(process.execPath, ["scripts/migrate-dev-087-canonical-workbench.mjs", `--db=${sourcePath}`, `--output-dir=${path.join(evidenceDir, "migration")}`, "--apply", "--confirm-disposable-dev-087", "--switch-canonical-only", "--expected-commit=local-dev"]);
  sourceDb = new Database(sourcePath, { readonly: true });

  pgPort = await getFreePort();
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-100 disposable PostgreSQL provider parity, transition, fault and retry evidence",
    port: pgPort,
    owningProcessTree: "this runner -> task-owned PostgreSQL 18 cluster",
    cleanupCondition: "clients closed, cluster stopped, port released and task root removed",
    PDM_DATA_DIR: sourceDataDir,
    PDM_REPOSITORY_DIR: sourceRepositoryDir,
    mutationScope: taskRoot
  } }));
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", postgresLog, "-o", `-p ${pgPort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "postgres", dbName]);
  controlClient = new pg.Client({ connectionString: dsnFor(pgPort), application_name: "ai-pdm-dev100-postgres-control" });
  await controlClient.connect();
  for (const file of ["001_initial_schema.sql", "039_allow_recycled_candidate_drawing_codes.sql", "042_status_data_rebuild.sql", "043_inline_relation_matrix.sql", "048_shared_assembly_bom.sql", "049_solidworks_credential_ui_activation.sql"]) {
    await controlClient.query(fs.readFileSync(path.join(root, "db", "postgres", file), "utf8"));
  }
  await controlClient.query("UPDATE pdm_workbench_state_authority_control SET expected_commit='local-dev',schema_hash='dev100-v1' WHERE id=1");
  const copiedRows = await restoreSqliteSnapshot();
  await controlClient.query("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only',expected_commit='local-dev',schema_hash='dev090-v1' WHERE id=1");
  await check("QA-100-013-A", "restored PostgreSQL fixture is foreign-key clean", async () => {
    const violations = await fkViolations();
    assert.equal(violations.length, 0);
    return { copiedRows, violations: 0 };
  });

  process.env.PDM_DB_PROVIDER = "postgres";
  process.env.PDM_POSTGRES_URL = dsnFor(pgPort);
  process.env.DATABASE_URL = dsnFor(pgPort);
  process.env.PDM_BUILD_COMMIT = "local-dev";
  process.env.PDM_RELEASE_MODE = "local_stub";
  dbClient = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsnFor(pgPort), maxConnections: 4 });
  const service = new DrawingRevisionWorkService(dbClient);
  const repository = new DrawingRevisionWorkAsyncRepository(dbClient);
  const owner = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: false, obsolete: true } };
  const work = (await controlClient.query("SELECT id FROM drawing_revision_works WHERE drawing_id=$1 ORDER BY id LIMIT 1", [ids.drawing])).rows[0];
  assert.ok(work);
  const initial = await service.read(work.id, owner);
  const token = initial.meta.contractToken;
  let version = initial.data.rowVersion;
  const upload = async (name, body, key, expected = version) => {
    const result = await service.uploadFile(work.id, { file: new File([body], name, { type: "application/octet-stream" }) }, owner, { idempotencyKey: key, contractToken: token, expectedRowVersion: expected });
    version = result.rowVersion;
    return result;
  };

  await check("QA-100-013-B", "PostgreSQL same-role and different-role transition matrix is immediately readable", async () => {
    await upload("A.SLDPRT", "PG-PART-A", "pg-a-part");
    await upload("A.SLDASM", "PG-ASSEMBLY-A", "pg-a-assembly");
    await upload("B.SLDASM", "PG-ASSEMBLY-B", "pg-b-assembly");
    await upload("A.SLDDRW", "PG-DRAWING-A", "pg-a-drawing");
    await upload("B.SLDDRW", "PG-DRAWING-B", "pg-b-drawing");
    await upload("A.pdf", "PG-PDF", "pg-pdf");
    const readback = await service.read(work.id, owner);
    assert.deepEqual(readback.data.files.map((file) => file.file_name).sort(), ["A.pdf", "B.SLDASM", "B.SLDDRW"].sort());
    const retired = await tombstones(work.id);
    assert.equal(retired.filter((row) => row.deleted_reason === "drawing_revision_work_file_replaced").length, 3);
    return { active: readback.data.files.map((file) => file.file_name), tombstones: retired.map((row) => row.file_name), rowVersion: version };
  });

  await check("QA-100-013-C", "PostgreSQL named checkpoint fault matrix fully rolls back", async () => {
    const points = ["before_tombstone", "after_binding_switch", "before_row_version", "before_readback"];
    for (const point of points) {
      const before = await stateSnapshot(work.id);
      await assert.rejects(() => uploadDrawingRevisionWorkFile({
        client: dbClient,
        workId: work.id,
        file: new File([`PG-${point}`], "C.SLDASM", { type: "application/octet-stream" }),
        actor: owner,
        context: { idempotencyKey: `pg-fault-${point}`, contractToken: token, expectedRowVersion: version },
        checkpoint: (current) => { if (current === point) throw new Error(`DEV100_PG_FAILPOINT_${point}`); }
      }), new RegExp(`DEV100_PG_FAILPOINT_${point}`));
      assert.deepEqual(await stateSnapshot(work.id), before, `${point} PostgreSQL rollback`);
      assert.deepEqual((await service.read(work.id, owner)).data.files.map((file) => file.file_name).sort(), ["A.pdf", "B.SLDASM", "B.SLDDRW"].sort());
    }
    return { points, result: "full rollback" };
  });

  await check("QA-100-013-D", "PostgreSQL response-loss replay and stale controls are exactly-once", async () => {
    const expectedVersion = version;
    const context = { idempotencyKey: "pg-response-loss", contractToken: token, expectedRowVersion: expectedVersion };
    const first = await service.uploadFile(work.id, { file: new File(["PG-ASSEMBLY-C"], "C.SLDASM") }, owner, context);
    version = first.rowVersion;
    const replay = await service.uploadFile(work.id, { file: new File(["PG-ASSEMBLY-C"], "C.SLDASM") }, owner, context);
    assert.deepEqual(replay, first);
    await assert.rejects(() => service.uploadFile(work.id, { file: new File(["PG-ASSEMBLY-D"], "D.SLDASM") }, owner, { idempotencyKey: "pg-stale", contractToken: token, expectedRowVersion: expectedVersion }), (error) => error?.code === "WORKBENCH_ROW_VERSION_CONFLICT" && error?.status === 409);
    assert.deepEqual((await activeRows(work.id)).filter((row) => row.role === "cad_3d").map((row) => row.file_name), ["C.SLDASM"]);
    return { replayRowVersion: replay.rowVersion, duplicateReplacement: 0, staleStatus: 409 };
  });

  await check("QA-100-013-E", "PostgreSQL active-deleted, missing-binding, hash and ordinal corruption stay fail-closed", async () => {
    const active = await activeRows(work.id);
    const target = active.find((row) => row.role === "cad_3d");
    assert.ok(target);
    await controlClient.query("UPDATE file_assets SET deleted_at=CURRENT_TIMESTAMP,deleted_by=$1,deleted_reason='dev100_pg_injected' WHERE id=$2", [ids.owner, target.asset_id]);
    await assert.rejects(() => repository.readWork(dbClient, ids.company, work.id), (error) => error?.code === "DRAWING_WORK_FILE_SNAPSHOT_INVALID" && error?.status === 409);
    await controlClient.query("UPDATE file_assets SET deleted_at=NULL,deleted_by=NULL,deleted_reason=NULL WHERE id=$1", [target.asset_id]);
    const binding = (await controlClient.query("SELECT * FROM drawing_revision_work_files WHERE work_id=$1 AND file_binding_id=$2", [work.id, target.id])).rows[0];
    await controlClient.query("DELETE FROM drawing_revision_work_files WHERE work_id=$1 AND file_binding_id=$2", [work.id, target.id]);
    await assert.rejects(() => repository.readWork(dbClient, ids.company, work.id), (error) => error?.code === "DRAWING_WORK_FILE_SNAPSHOT_INVALID");
    await controlClient.query("INSERT INTO drawing_revision_work_files(work_id,file_binding_id,ordinal,content_hash) VALUES($1,$2,$3,$4)", [binding.work_id, binding.file_binding_id, binding.ordinal, binding.content_hash]);
    await controlClient.query("UPDATE drawing_revision_work_files SET content_hash='drift' WHERE work_id=$1 AND file_binding_id=$2", [work.id, target.id]);
    await assert.rejects(() => repository.readWork(dbClient, ids.company, work.id), (error) => error?.code === "DRAWING_WORK_FILE_SNAPSHOT_INVALID");
    await controlClient.query("UPDATE drawing_revision_work_files SET content_hash=$3,ordinal=99 WHERE work_id=$1 AND file_binding_id=$2", [work.id, target.id, binding.content_hash]);
    await assert.rejects(() => repository.readWork(dbClient, ids.company, work.id), (error) => error?.code === "DRAWING_WORK_FILE_SNAPSHOT_INVALID");
    await controlClient.query("UPDATE drawing_revision_work_files SET ordinal=$3 WHERE work_id=$1 AND file_binding_id=$2", [work.id, target.id, binding.ordinal]);
    await service.read(work.id, owner);
    return { negatives: ["active_deleted", "missing_binding", "hash", "ordinal"], status: 409, restored: true };
  });

  await check("QA-100-013-F", "PostgreSQL final DB and physical hashes reconcile", async () => {
    const rows = [...await activeRows(work.id), ...await tombstones(work.id)];
    for (const row of rows) {
      const filePath = path.join(sourceRepositoryDir, ...String(row.storage_key).split("/"));
      assert.equal(fs.existsSync(filePath), true, `${row.file_name} exists`);
      assert.equal(crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"), row.content_hash, `${row.file_name} hash`);
    }
    const violations = await fkViolations();
    assert.equal(violations.length, 0);
    return { files: rows.length, foreignKeys: 0, provider: "postgres" };
  });
}

try { await main(); } catch (error) { firstFailure = error instanceof Error ? error.stack ?? error.message : String(error); }
finally {
  if (sourceDb) { try { sourceDb.close(); } catch { /* cleanup continues */ } }
  if (dbClient) await dbClient.close().catch(() => undefined);
  if (controlClient) await controlClient.end().catch(() => undefined);
  if (started) spawnSync(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "fast", "-w", "stop"], { cwd: root, encoding: "utf8", windowsHide: true, stdio: "ignore" });
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch { /* result records cleanup */ }
}

const cleanup = { taskRootRemoved: !fs.existsSync(taskRoot), portReleased: pgPort ? !(await portAccepting(pgPort)) : true, port: pgPort };
const result = { runner: "postgres", provider: "postgres", runId, status: !firstFailure && checks.every((entry) => entry.status === "PASS") && cleanup.taskRootRemoved && cleanup.portReleased ? "PASS" : "FAIL", productionWrites: false, checks, firstFailure, cleanup };
fs.writeFileSync(path.join(evidenceDir, "postgres.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((entry) => entry.status === "PASS").length, total: checks.length, cleanup }));
if (result.status !== "PASS") process.exitCode = 1;
