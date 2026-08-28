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
import { createDrawingRecognitionSession } from "../src/lib/drawing-recognition.ts";
import { uploadDrawingRevisionWorkFile } from "../src/lib/drawing-revision-work-file.ts";
import { issueCanonicalWorkbenchContract } from "../src/lib/pdm-workbench-authority-control.ts";
import { DrawingRevisionWorkAsyncRepository } from "../src/lib/repositories/drawing-revision-work-async-repository.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV098-postgres-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV098_POSTGRES_EVIDENCE_DIR?.trim() || path.join(root, "output", "qa", "dev-098", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev098-postgres-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const sourcePath = path.join(dataDir, "ai-pdm.sqlite");
const clusterDir = path.join(taskRoot, "cluster");
const postgresLog = path.join(taskRoot, "postgres.log");
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const dbName = `dev098_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
const primaryPath = path.join(root, "data", "ai-pdm.sqlite");
const migrations = [
  "001_initial_schema.sql",
  "039_allow_recycled_candidate_drawing_codes.sql",
  "042_status_data_rebuild.sql",
  "043_inline_relation_matrix.sql",
  "048_shared_assembly_bom.sql",
  "049_solidworks_credential_ui_activation.sql",
  "050_retire_standalone_manufacturing_impact.sql",
  "051_drawing_recognition_part_owner_invariant.sql"
];

const checks = [];
const timingLedger = [];
let firstFailure = null;
let sourceDb = null;
let control = null;
let client = null;
let port = null;
let started = false;

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function primaryFingerprint() {
  const database = new Database(primaryPath, { readonly: true, fileMustExist: true });
  try {
    const payload = {
      schema: database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),
      roots: database.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY company_id,id").all(),
      parts: database.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY company_id,id").all(),
      drawings: database.prepare("SELECT id,company_id,drawing_number,formal_drawing_number_id FROM drawings ORDER BY company_id,id").all(),
      residue: database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { hash: stableHash(payload), counts: { roots: payload.roots.length, parts: payload.parts.length, drawings: payload.drawings.length }, foreignKeys: payload.foreignKeys, residue: payload.residue };
  } finally {
    database.close();
  }
}

const primaryBefore = primaryFingerprint();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}

function quote(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizeForPostgres(value, column) {
  if (value === undefined || value === null) return null;
  if (column.data_type === "boolean") return Boolean(Number(value));
  if (column.data_type === "json" || column.data_type === "jsonb") {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
  }
  if (column.data_type === "ARRAY" && typeof value === "string" && value.startsWith("[")) return JSON.parse(value);
  return value;
}

async function columnsFor(table) {
  const result = await control.query("SELECT column_name,data_type,is_generated,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table]);
  return new Map(result.rows.filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO").map((row) => [row.column_name, row]));
}

async function restoreSqliteSnapshot() {
  const pgTables = (await control.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename);
  const sourceTables = new Set(sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
  await control.query("SET session_replication_role=replica");
  let copiedRows = 0;
  for (const table of pgTables) {
    if (!sourceTables.has(table)) continue;
    const pgColumns = await columnsFor(table);
    const sqliteColumns = sourceDb.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => row.name);
    const columns = sqliteColumns.filter((column) => pgColumns.has(column));
    if (!columns.length) continue;
    for (const row of sourceDb.prepare(`SELECT ${columns.map(quote).join(",")} FROM ${quote(table)}`).all()) {
      const values = columns.map((column) => normalizeForPostgres(row[column], pgColumns.get(column)));
      await control.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`, values);
      copiedRows += 1;
    }
  }
  await control.query("SET session_replication_role=origin");
  return copiedRows;
}

async function foreignKeyViolations() {
  const constraints = await control.query(`SELECT con.conname,child.relname AS child_table,parent.relname AS parent_table,
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
    const result = await control.query(`SELECT COUNT(*)::integer count FROM ${quote(constraint.child_table)} child WHERE ${nonNull} AND NOT EXISTS (SELECT 1 FROM ${quote(constraint.parent_table)} parent WHERE ${join})`);
    if (Number(result.rows[0].count) > 0) violations.push({ ...constraint, count: Number(result.rows[0].count) });
  }
  return violations;
}

function portAccepting(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
    const done = (accepting) => { socket.destroy(); resolve(accepting); };
    socket.setTimeout(1_000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function check(label, execute) {
  const startedAt = Date.now();
  try {
    const detail = await execute();
    checks.push({ id: "QA-098-031", label, status: "PASS", detail: detail ?? null });
    timingLedger.push({ label, elapsedMs: Date.now() - startedAt, status: "PASS" });
    console.log(`PASS QA-098-031 ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push({ id: "QA-098-031", label, status: "FAIL", message });
    timingLedger.push({ label, elapsedMs: Date.now() - startedAt, status: "FAIL" });
    throw error;
  }
}

function seedProductionOnly(database) {
  database.prepare("INSERT INTO pdm_workbench_aggregates(id,company_id,entity_type,canonical_entity_id,open_branch_count) VALUES(?,?,'drawing',?,0)").run(ids.aggregateDrawing, ids.company, ids.drawing);
  database.prepare("INSERT INTO canonical_workbench_states(id,company_id,entity_type,canonical_entity_id,data_layer,revision_id) VALUES(?,?,'drawing',?,'drawing_production',?)").run(ids.stateProduction, ids.company, ids.drawing, ids.productionRevision);
  database.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only',expected_commit='local-dev',schema_hash='dev090-v1',row_version=row_version+1").run();
  assert.equal(database.pragma("foreign_key_check").length, 0);
}

async function createWork(repository, databaseClient, sourceRowId, target, ownerUserId = ids.owner, selectionMode = "recommended") {
  const source = await repository.readSourceState(databaseClient, ids.company, sourceRowId);
  assert.ok(source, `source ${sourceRowId}`);
  return databaseClient.transaction((tx) => repository.create(tx, {
    companyId: ids.company,
    sourceRowId,
    ownerUserId,
    expectedRowVersion: Number(source.row_version),
    target,
    selectionMode,
    requestedMinor: selectionMode === "manual_minor" ? target.minor : null
  }));
}

async function completeImpact(databaseClient, repository, created) {
  const work = await repository.readWork(databaseClient, ids.company, created.workId);
  assert.ok(work);
  const payload = typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload;
  payload.changeImpact = { ...payload.changeImpact, formState: "no_impact", fitState: "no_impact", functionState: "no_impact" };
  await databaseClient.execute("UPDATE drawing_revision_works SET proposed_payload=:payload WHERE id=:workId", { workId: created.workId, payload: JSON.stringify(payload) });
  return repository.readWork(databaseClient, ids.company, created.workId);
}

async function cancelWork(databaseClient, repository, workId) {
  const work = await repository.readWork(databaseClient, ids.company, workId);
  if (!work) return;
  await databaseClient.transaction((tx) => repository.cancel(tx, { companyId: ids.company, workId, expectedRowVersion: Number(work.row_version) }));
}

async function promoteWhileBlocked(repository, majorWorkId, blockedOperation, label) {
  const locked = deferred();
  const release = deferred();
  const start = Date.now();
  const promotion = client.transaction(async (tx) => {
    const initial = await repository.readWork(tx, ids.company, majorWorkId);
    assert.ok(initial);
    await repository.lockDrawingBasis(tx, { companyId: ids.company, drawingId: initial.drawing_id, branchId: initial.branch_id });
    locked.resolve();
    await release.promise;
    const current = await repository.readWork(tx, ids.company, majorWorkId, true);
    assert.ok(current);
    return repository.formalize(tx, { companyId: ids.company, work: current });
  });
  await locked.promise;
  const operationStarted = Date.now();
  const operation = Promise.resolve().then(blockedOperation);
  // Attach rejection handling immediately. The contender is expected to fail
  // after the promotion commits; delaying Promise.allSettled until after the
  // lock barrier makes Node treat that expected failure as unhandled.
  const operationSettled = Promise.allSettled([operation]);
  await new Promise((resolve) => setTimeout(resolve, 250));
  release.resolve();
  const promoted = await promotion;
  const settled = await operationSettled;
  timingLedger.push({ label, aggregateLockedAtMs: 0, contenderStartedAtMs: operationStarted - start, releasedAtMs: Date.now() - start, totalMs: Date.now() - start });
  return { promoted, contender: settled[0] };
}

async function sqliteParity() {
  const database = createFixtureDatabase({ canonical: false, rdLifecycle: "preparing" });
  seedProductionOnly(database);
  const sqliteClient = createAsyncDatabaseClient({ kind: "sqlite", database });
  const repository = new DrawingRevisionWorkAsyncRepository(sqliteClient);
  try {
    const source = await repository.readSourceState(sqliteClient, ids.company, ids.stateProduction);
    const invoke = (actorId) => sqliteClient.transaction((tx) => repository.create(tx, {
      companyId: ids.company,
      sourceRowId: ids.stateProduction,
      ownerUserId: actorId,
      expectedRowVersion: Number(source.row_version),
      target: { major: 1, minor: 7, label: "1.7" },
      selectionMode: "manual_minor",
      requestedMinor: 7
    }));
    const settled = await Promise.allSettled([invoke(ids.owner), invoke(ids.reviewer)]);
    assert.equal(settled.filter((entry) => entry.status === "fulfilled").length, 1);
    assert.equal(database.prepare("SELECT COUNT(*) n FROM drawing_revision_claims WHERE target_label='1.7'").get().n, 1);
    assert.equal(database.pragma("foreign_key_check").length, 0);
    return settled.map((entry) => entry.status === "fulfilled" ? { status: "winner", workId: entry.value.workId } : { status: "loser", code: entry.reason?.code });
  } finally {
    await sqliteClient.close();
    database.close();
  }
}

async function main() {
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_BUILD_COMMIT = "local-dev";
  process.env.PDM_RELEASE_MODE = "local_stub";
  process.env.PDM_DRAWING_RECOGNITION_V1 = "true";
  process.env.PDM_UNIFIED_DRAWING_WORKBENCH_V1 = "true";
  process.env.PDM_NUMBER_LIFECYCLE_V2 = "true";

  const fixture = createFixtureDatabase({ filename: sourcePath, canonical: false, rdLifecycle: "preparing" });
  seedProductionOnly(fixture);
  fixture.close();
  sourceDb = new Database(sourcePath, { readonly: true, fileMustExist: true });

  port = await getFreePort();
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-098 QA-098-031 disposable PostgreSQL concurrency and stale-basis verification",
    port,
    owningProcessTree: "qc-dev-098-postgres -> task-owned PostgreSQL 18 cluster",
    cleanupCondition: "clients closed, cluster stopped, port released and task root removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: taskRoot
  } }));

  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", postgresLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", dbName]);
  const dsn = `postgresql://postgres@127.0.0.1:${port}/${dbName}`;
  control = new pg.Client({ connectionString: dsn, application_name: "ai-pdm-dev098-postgres-control" });
  await control.connect();
  for (const migration of migrations) await control.query(fs.readFileSync(path.join(root, "db", "postgres", migration), "utf8"));
  const copiedRows = await restoreSqliteSnapshot();
  await control.query("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only',expected_commit='local-dev',schema_hash='dev090-v1' WHERE id=1");

  process.env.PDM_DB_PROVIDER = "postgres";
  process.env.PDM_POSTGRES_URL = dsn;
  process.env.DATABASE_URL = dsn;
  client = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsn, maxConnections: 10 });
  const repository = new DrawingRevisionWorkAsyncRepository(client);

  await check("schema, lock source, SQLite mirror and production-source setup", async () => {
    const source = fs.readFileSync(path.join(root, "src", "lib", "repositories", "drawing-revision-work-async-repository.ts"), "utf8");
    const aggregate = source.indexOf("SELECT id FROM pdm_workbench_aggregates");
    const production = source.indexOf("SELECT id FROM canonical_workbench_states WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :drawingId AND data_layer = 'drawing_production'");
    const sourceRow = source.indexOf("SELECT id FROM canonical_workbench_states WHERE id = :sourceRowId");
    const branch = source.indexOf("SELECT id FROM drawing_rd_branches WHERE id = :branchId");
    assert.ok(aggregate >= 0 && aggregate < production && production < sourceRow && sourceRow < branch);
    assert.equal(source.includes("FOR UPDATE OF aggregate"), false);
    const violations = await foreignKeyViolations();
    assert.equal(violations.length, 0, JSON.stringify(violations));
    const sqlite = await sqliteParity();
    const productionSource = await createWork(repository, client, ids.stateProduction, { major: 1, minor: 1, label: "1.1" }, ids.owner, "manual_minor");
    assert.equal(productionSource.revision, "1.1");
    await cancelWork(client, repository, productionSource.workId);
    return { copiedRows, migrationHash: stableHash(migrations.map((file) => ({ file, hash: stableHash(fs.readFileSync(path.join(root, "db", "postgres", file), "utf8")) }))), lockOrder: ["aggregate", "production", "source", "branch"], sqlite };
  });

  await check("same-target two-actor race has exactly one winner", async () => {
    const source = await repository.readSourceState(client, ids.company, ids.stateProduction);
    const invoke = (actorId) => client.transaction((tx) => repository.create(tx, {
      companyId: ids.company,
      sourceRowId: ids.stateProduction,
      ownerUserId: actorId,
      expectedRowVersion: Number(source.row_version),
      target: { major: 1, minor: 7, label: "1.7" },
      selectionMode: "manual_minor",
      requestedMinor: 7
    }));
    const settled = await Promise.allSettled([invoke(ids.owner), invoke(ids.reviewer)]);
    const winners = settled.filter((entry) => entry.status === "fulfilled");
    const losers = settled.filter((entry) => entry.status === "rejected");
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.ok(["WORKBENCH_ROW_VERSION_CONFLICT", "DRAWING_TARGET_REVISION_CLAIMED"].includes(losers[0].reason?.code));
    const claimCount = Number((await control.query("SELECT COUNT(*)::integer count FROM drawing_revision_claims WHERE target_major=1 AND target_minor=7")).rows[0].count);
    assert.equal(claimCount, 1);
    await cancelWork(client, repository, winners[0].value.workId);
    return { receipts: settled.map((entry, index) => entry.status === "fulfilled" ? { actor: index, status: "winner", workId: entry.value.workId } : { actor: index, status: "loser", code: entry.reason?.code }), claimCount };
  });

  await check("minor versus major approval is serialized and stale loser writes nothing", async () => {
    const minor = await createWork(repository, client, ids.stateProduction, { major: 1, minor: 2, label: "1.2" }, ids.owner, "manual_minor");
    const major = await createWork(repository, client, ids.stateProduction, { major: 2, minor: 0, label: "2" });
    await completeImpact(client, repository, minor);
    await completeImpact(client, repository, major);
    const race = await promoteWhileBlocked(repository, major.workId, async () => {
      const current = await repository.readWork(client, ids.company, minor.workId);
      return client.transaction((tx) => repository.formalize(tx, { companyId: ids.company, work: current }));
    }, "minor-major");
    assert.equal(race.promoted.revision, "2");
    assert.equal(race.contender.status, "rejected");
    assert.equal(race.contender.reason?.code, "DRAWING_PRODUCTION_BASE_STALE");
    const production = (await control.query("SELECT revision.revision,state.revision_id FROM canonical_workbench_states state JOIN drawing_revisions revision ON revision.id=state.revision_id WHERE state.id=$1", [ids.stateProduction])).rows[0];
    assert.equal(production.revision, "2");
    assert.equal(Number((await control.query("SELECT COUNT(*)::integer count FROM drawing_revision_claims WHERE target_label='1.2' AND claim_state='approved'")).rows[0].count), 0);
    await cancelWork(client, repository, minor.workId);
    return { winner: race.promoted, loser: { code: race.contender.reason?.code }, production };
  });

  await check("file upload observes the new production basis before storage or DB mutation", async () => {
    const rd = await createWork(repository, client, ids.stateProduction, { major: 2, minor: 1, label: "2.1" }, ids.owner, "manual_minor");
    const major = await createWork(repository, client, ids.stateProduction, { major: 3, minor: 0, label: "3" });
    await completeImpact(client, repository, major);
    const token = await issueCanonicalWorkbenchContract(client, { companyId: ids.company, actorId: ids.owner });
    const before = {
      files: Number((await control.query("SELECT COUNT(*)::integer count FROM drawing_revision_files WHERE drawing_revision_id=$1", [rd.revisionId])).rows[0].count),
      assets: Number((await control.query("SELECT COUNT(*)::integer count FROM file_assets WHERE linked_entity_id=$1", [rd.revisionId])).rows[0].count),
      storage: fs.existsSync(repositoryDir) ? fs.readdirSync(repositoryDir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length : 0
    };
    const race = await promoteWhileBlocked(repository, major.workId, () => uploadDrawingRevisionWorkFile({
      client,
      workId: rd.workId,
      file: new File(["DEV098-FILE-RACE"], "A.SLDDRW", { type: "application/octet-stream" }),
      actor: { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: true, obsolete: true } },
      context: { idempotencyKey: "dev098-pg-file-race", contractToken: token, expectedRowVersion: 1 }
    }), "file-major");
    assert.equal(race.contender.status, "rejected");
    assert.equal(race.contender.reason?.code, "DRAWING_PRODUCTION_BASE_STALE");
    const after = {
      files: Number((await control.query("SELECT COUNT(*)::integer count FROM drawing_revision_files WHERE drawing_revision_id=$1", [rd.revisionId])).rows[0].count),
      assets: Number((await control.query("SELECT COUNT(*)::integer count FROM file_assets WHERE linked_entity_id=$1", [rd.revisionId])).rows[0].count),
      storage: fs.existsSync(repositoryDir) ? fs.readdirSync(repositoryDir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length : 0
    };
    assert.deepEqual(after, before);
    await cancelWork(client, repository, rd.workId);
    return { winner: race.promoted, loser: { code: race.contender.reason?.code }, before, after };
  });

  await check("recognition session observes the new production basis before session mutation", async () => {
    const rd = await createWork(repository, client, ids.stateProduction, { major: 3, minor: 1, label: "3.1" }, ids.owner, "manual_minor");
    const token = await issueCanonicalWorkbenchContract(client, { companyId: ids.company, actorId: ids.owner });
    await uploadDrawingRevisionWorkFile({
      client,
      workId: rd.workId,
      file: new File(["%PDF-1.4 DEV098"], "recognition.pdf", { type: "application/pdf" }),
      actor: { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: true, obsolete: true } },
      context: { idempotencyKey: "dev098-pg-recognition-source", contractToken: token, expectedRowVersion: 1 }
    });
    const major = await createWork(repository, client, ids.stateProduction, { major: 4, minor: 0, label: "4" });
    await completeImpact(client, repository, major);
    const before = Number((await control.query("SELECT COUNT(*)::integer count FROM drawing_recognition_sessions WHERE drawing_revision_id=$1", [rd.revisionId])).rows[0].count);
    const race = await promoteWhileBlocked(repository, major.workId, () => createDrawingRecognitionSession({
      companyId: ids.company,
      actorId: ids.owner,
      sourceContextType: "drawing_revision",
      sourceContextId: rd.revisionId,
      drawingId: ids.drawing,
      drawingRevisionId: rd.revisionId,
      client
    }), "recognition-major");
    assert.equal(race.contender.status, "rejected");
    assert.equal(race.contender.reason?.code, "DRAWING_PRODUCTION_BASE_STALE");
    const after = Number((await control.query("SELECT COUNT(*)::integer count FROM drawing_recognition_sessions WHERE drawing_revision_id=$1", [rd.revisionId])).rows[0].count);
    assert.equal(after, before);
    await cancelWork(client, repository, rd.workId);
    return { winner: race.promoted, loser: { code: race.contender.reason?.code }, sessionCounts: { before, after } };
  });

  await check("final PostgreSQL integrity and authoritative production state", async () => {
    const violations = await foreignKeyViolations();
    assert.equal(violations.length, 0, JSON.stringify(violations));
    const productionRows = (await control.query("SELECT revision.revision,state.handling,state.work_id FROM canonical_workbench_states state JOIN drawing_revisions revision ON revision.id=state.revision_id WHERE state.company_id=$1 AND state.canonical_entity_id=$2 AND state.data_layer='drawing_production'", [ids.company, ids.drawing])).rows;
    assert.deepEqual(productionRows, [{ revision: "4", handling: "none", work_id: null }]);
    return { foreignKeys: 0, productionRows, provider: "postgres" };
  });
}

try {
  await main();
} catch (error) {
  firstFailure = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  if (sourceDb) { try { sourceDb.close(); } catch { /* cleanup continues */ } }
  if (client) await client.close().catch(() => undefined);
  if (control) await control.end().catch(() => undefined);
  if (started) spawnSync(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "fast", "-w", "stop"], { cwd: root, encoding: "utf8", windowsHide: true, stdio: "ignore" });
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch { /* result records cleanup */ }
}

const primaryAfter = primaryFingerprint();
const cleanup = { taskRootRemoved: !fs.existsSync(taskRoot), portReleased: port ? !(await portAccepting(port)) : true, port };
const passed = !firstFailure && checks.every((entry) => entry.status === "PASS") && cleanup.taskRootRemoved && cleanup.portReleased && primaryBefore.hash === primaryAfter.hash;
const result = {
  schemaVersion: 1,
  devId: "DEV-098",
  suite: "postgres",
  runner: "postgres",
  provider: "postgres",
  runId,
  generatedAt: new Date().toISOString(),
  status: passed ? "PASS" : "FAIL",
  fixedCaseIds: ["QA-098-031"],
  expected: 1,
  executed: passed ? 1 : 0,
  passed: passed ? 1 : 0,
  productionWrites: false,
  dataBoundary: { PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot, primaryBefore, primaryAfter, primaryUnchanged: primaryBefore.hash === primaryAfter.hash },
  schema: { migrations, hash: stableHash(migrations.map((file) => fs.readFileSync(path.join(root, "db", "postgres", file), "utf8"))) },
  checks,
  timingLedger,
  firstFailure,
  cleanup
};
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: result.passed, expected: result.expected, firstFailure, cleanup, primaryUnchanged: result.dataBoundary.primaryUnchanged }, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
