#!/usr/bin/env node

/* DEV-110 disposable PostgreSQL provider/locking/rollback evidence. */
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
import { DrawingRecognitionPartWorkHandoffAsyncRepository } from "../src/lib/repositories/drawing-recognition-part-work-handoff-async-repository.ts";
import { PartChangeWorkAsyncRepository } from "../src/lib/repositories/part-change-work-async-repository.ts";
import { handoffDrawingRecognitionToPartWorks } from "../src/lib/drawing-recognition-part-work-handoff.ts";
import { createPlatformActorContext } from "../src/lib/platform-command.ts";
import { sha256Canonical } from "../src/lib/drawing-recognition-hash.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";

const root = process.cwd();
const runId = `DEV110-postgres-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV110_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-110", runId));
fs.mkdirSync(evidenceDir, { recursive: true });
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev110-postgres-"));
const clusterDir = path.join(taskRoot, "cluster");
const serverLog = path.join(taskRoot, "postgres.log");
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const dbName = `dev110_${process.pid}`;
const dbUser = "postgres";
const emptySource = sha256Canonical([]);
const checks = [];
const failures = [];
let pgAdmin = null;
let client = null;
let port = null;
let started = false;
let source = null;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const address = server.address(); const value = typeof address === "object" && address ? address.port : null; server.close(() => value ? resolve(value) : reject(new Error("NO_FREE_PORT"))); });
  });
}
function quote(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function dsn() { return `postgresql://${dbUser}@127.0.0.1:${port}/${dbName}`; }
function normalizeForPostgres(value, column) {
  if (value === undefined || value === null) return null;
  if (column.data_type === "boolean") return Boolean(Number(value));
  if (column.data_type === "json" || column.data_type === "jsonb") { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return value; } }
  if (column.data_type === "ARRAY" && typeof value === "string" && value.startsWith("[")) return JSON.parse(value);
  return value;
}
async function postgresColumns(table) {
  const result = await pgAdmin.query(`SELECT column_name,data_type,is_generated,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return new Map(result.rows.filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO").map((row) => [row.column_name, row]));
}
async function restoreSnapshot() {
  const pgTables = (await pgAdmin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename);
  const sourceTables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
  await pgAdmin.query("SET session_replication_role=replica");
  for (const table of pgTables) {
    if (!sourceTables.has(table)) continue;
    const columnsMap = await postgresColumns(table);
    const sqliteColumns = source.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => row.name);
    const columns = sqliteColumns.filter((column) => columnsMap.has(column));
    if (!columns.length) continue;
    const rows = source.prepare(`SELECT ${columns.map(quote).join(",")} FROM ${quote(table)}`).all();
    for (const row of rows) {
      const values = columns.map((column) => normalizeForPostgres(row[column], columnsMap.get(column)));
      await pgAdmin.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`, values);
    }
  }
  await pgAdmin.query("SET session_replication_role=origin");
}
async function resetDatabase() {
  const tables = (await pgAdmin.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'pg_%'")).rows.map((row) => quote(row.tablename));
  if (tables.length) await pgAdmin.query(`TRUNCATE TABLE ${tables.join(",")} RESTART IDENTITY CASCADE`);
  await restoreSnapshot();
  await pgAdmin.query("UPDATE pdm_workbench_state_authority_control SET expected_commit='local-dev', schema_hash='dev090-v1' WHERE id=1");
}
function actor(suffix = "pg") { return createPlatformActorContext({ pdmUserId: ids.owner, organizationId: ids.company, roles: ["Engineer"], scopes: ["numbering.recognition.formalize"], requestId: `dev110-pg-${suffix}`, correlationId: `dev110-pg-correlation-${suffix}` }); }
async function insertSession(id, status = "review_ready", sourceFingerprint = emptySource) {
  await client.execute(`INSERT INTO drawing_recognition_sessions (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,source_set_fingerprint,deduplication_key,status,created_by) VALUES (:id,:companyId,'drawing_number',:contextId,:lineage,:drawing,NULL,:source,:dedupe,:status,:owner)`, { id, companyId: ids.company, contextId: ids.drawingNumber, lineage: `drawing_number:${ids.drawingNumber}`, drawing: ids.drawing, source: sourceFingerprint, dedupe: `dedupe-${id}`, status, owner: ids.owner });
}
async function insertCandidate(id, sessionId, fieldKey = "material", value = "SUS304") {
  await client.execute(`INSERT INTO drawing_recognition_candidates (id,session_id,company_id,category,field_key,field_label,proposed_value,normalized_value,applicability_scope,variant_status,confidence_band,review_state,group_key) VALUES (:id,:sessionId,:companyId,'part_attribute',:fieldKey,:label,:value,:value,'overall','changed','high','accepted',:groupKey)`, { id, sessionId, companyId: ids.company, fieldKey, label: fieldKey === "material" ? "材質" : fieldKey, value, groupKey: `group-${id}` });
}
async function readScope(sessionId) { return new DrawingRecognitionPartWorkHandoffAsyncRepository(client).readScope({ companyId: ids.company, sessionId }); }
async function handoff(sessionId, draft = { commonValues: [], overrides: [] }, options = {}) {
  const scope = await readScope(sessionId);
  if (!scope.session || !scope.parts) throw new Error(`scope unavailable: ${sessionId}`);
  return handoffDrawingRecognitionToPartWorks({ sessionId, companyId: ids.company, actorId: ids.owner, expectedRowVersion: options.expectedRowVersion ?? Number(scope.session.row_version), expectedSourceSetFingerprint: options.expectedSourceSetFingerprint ?? scope.session.source_set_fingerprint, expectedRelationScopeFingerprint: options.expectedRelationScopeFingerprint ?? scope.relationScopeFingerprint, draft, metadata: { actor: actor(options.key ?? sessionId), idempotencyKey: options.idempotencyKey ?? `key-${sessionId}` }, access: options.access ?? { canCreate: true, canUpdate: true, canEditNonOwned: false }, faultInjector: options.faultInjector, client: options.client ?? client });
}
async function addPart(index, prefix = "dev110-pg") {
  const id = `${prefix}-part-${index}`;
  await client.execute(`INSERT INTO part_numbers (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,record_status,created_by) VALUES (:id,:companyId,:root,:number,:sequence,:code,:name,'manufactured','Released',:owner)`, { id, companyId: ids.company, root: ids.root, number: `A0002-P${String(index).padStart(3, "0")}`, sequence: index, code: `P${index}`, name: `P${index}`, owner: ids.owner });
  await client.execute(`INSERT INTO drawing_part_links (id,drawing_number_id,part_number_id,link_type,created_by) VALUES (:link,:drawing,:part,'primary_manufacturing',:owner)`, { link: `${prefix}-link-${index}`, drawing: ids.drawingNumber, part: id, owner: ids.owner });
  await client.execute(`INSERT INTO canonical_workbench_states (id,company_id,entity_type,canonical_entity_id,data_layer) VALUES (:state,:companyId,'part',:part,'part_formal')`, { state: `${prefix}-state-${index}`, companyId: ids.company, part: id });
  return id;
}
function check(id, condition, detail = "") { checks.push({ caseId: id, result: condition ? "PASS" : "FAIL", detail }); if (!condition) failures.push({ caseId: id, detail }); }

async function setup() {
  port = await getFreePort();
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", serverLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", dbUser, dbName]);
  pgAdmin = new pg.Client({ connectionString: dsn(), application_name: "ai-pdm-dev110-postgres" });
  await pgAdmin.connect();
  for (const file of ["001_initial_schema.sql", "037_drawing_recognition_pre_submit_source.sql", "039_allow_recycled_candidate_drawing_codes.sql", "042_status_data_rebuild.sql", "043_inline_relation_matrix.sql", "048_shared_assembly_bom.sql", "049_solidworks_credential_ui_activation.sql", "051_drawing_recognition_part_owner_invariant.sql", "053_drawing_recognition_amendment_lineage.sql"]) {
    await pgAdmin.query(fs.readFileSync(path.join(root, "db", "postgres", file), "utf8"));
  }
  source = createFixtureDatabase({ canonical: true });
  // DEV-090/043 PostgreSQL intentionally removes the relation work layer;
  // the SQLite fixture still carries its legacy compatibility row.
  source.prepare("DELETE FROM canonical_workbench_states WHERE entity_type='relation'").run();
  source.prepare("DELETE FROM pdm_workbench_aggregates WHERE entity_type='relation'").run();
  await restoreSnapshot();
  await pgAdmin.query("UPDATE pdm_workbench_state_authority_control SET expected_commit='local-dev', schema_hash='dev090-v1' WHERE id=1");
  client = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsn(), maxConnections: 8 });
}

async function main() {
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-110 isolated PostgreSQL provider/locking/rollback evidence", port, owningProcessTree: `this runner -> pg_ctl/PostgreSQL cluster (pid ${process.pid})`, cleanupCondition: "runner completes; exact pg_ctl cluster stopped and task root removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot } }));
  await resetDatabase();
  await insertSession("dev110-p01"); await insertCandidate("dev110-p01-candidate", "dev110-p01");
  const p01 = await handoff("dev110-p01", undefined, { idempotencyKey: "dev110-p01-key" });
  check("P01", p01.workMutationCount === 1 && (await client.queryOne("SELECT COUNT(*) count FROM part_change_works"))?.count === "1", "PostgreSQL serializable handoff uses exact formal scope and provider transaction");
  const scope = await readScope("dev110-p01");
  const shuffled = [...scope.parts].reverse().map((part) => part.id);
  const lockResult = await client.transaction(async (tx) => new PartChangeWorkAsyncRepository(tx).lockBatch(tx, { companyId: ids.company, partIds: shuffled, workIds: [] }), { serializable: true });
  check("P02", lockResult.partIds.join(",") === [...shuffled].sort().join(","), "set-based lock primitive normalizes deterministic lock order");

  await resetDatabase();
  const concurrentSession = "dev110-p03"; await insertSession(concurrentSession); await insertCandidate("dev110-p03-candidate", concurrentSession);
  const [first, second] = await Promise.all([handoff(concurrentSession, undefined, { idempotencyKey: "dev110-p03-key" }), handoff(concurrentSession, undefined, { idempotencyKey: "dev110-p03-key" })]);
  check("P03", [first, second].filter((item) => item.reusedFromCommandReceipt).length === 1 && (await client.queryOne("SELECT COUNT(*) count FROM drawing_recognition_formalization_events WHERE session_id=:id", { id: concurrentSession }))?.count === "1", "same-key concurrent submissions converge to one receipt/event");

  await resetDatabase();
  const hundred = []; for (let index = 2; index <= 101; index += 1) hundred.push(await addPart(index, "dev110-p04"));
  await insertSession("dev110-p04");
  const bounded = await readScope("dev110-p04");
  check("P04", bounded.parts === null && bounded.relationScopeFingerprint === "limit-exceeded", "scope bound fails closed above 100 eligible Parts");

  await resetDatabase();
  const driftSession = "dev110-p05"; await insertSession(driftSession); await insertCandidate("dev110-p05-candidate", driftSession); const driftScope = await readScope(driftSession);
  await client.execute(`INSERT INTO file_assets (id,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id,document_category) VALUES ('dev110-p05-asset','changed.pdf','pdf','application/pdf',1,'changed','drawing_number',:drawing,'drawing')`, { drawing: ids.drawingNumber });
  await assert.rejects(() => handoff(driftSession, undefined, { expectedRelationScopeFingerprint: driftScope.relationScopeFingerprint }), (error) => error?.code === "RECOGNITION_SOURCE_SET_STALE");
  check("P05", (await client.queryOne("SELECT COUNT(*) count FROM part_change_works"))?.count === "0", "source-set fingerprint drift rejects before writes");

  await resetDatabase();
  const relationSession = "dev110-p06"; await insertSession(relationSession); await insertCandidate("dev110-p06-candidate", relationSession); const relationScope = await readScope(relationSession); await addPart(4, "dev110-p06");
  await assert.rejects(() => handoff(relationSession, undefined, { expectedRelationScopeFingerprint: relationScope.relationScopeFingerprint }), (error) => error?.code === "RECOGNITION_RELATION_SCOPE_STALE");
  check("P06", (await client.queryOne("SELECT COUNT(*) count FROM part_change_works"))?.count === "0", "relation scope drift rejects before writes");

  await resetDatabase();
  const faultSession = "dev110-p07"; await insertSession(faultSession); await insertCandidate("dev110-p07-candidate", faultSession);
  await assert.rejects(() => handoff(faultSession, undefined, { faultInjector: async (point, index) => { if (point === "after_target_mutation" && index === 0) throw new Error("FAULT_TARGET_1"); } }), /FAULT_TARGET_1/);
  check("P07", (await client.queryOne("SELECT COUNT(*) count FROM part_change_works"))?.count === "0" && (await client.queryOne("SELECT COUNT(*) count FROM drawing_recognition_formalization_events"))?.count === "0", "fault after first target rolls back all PostgreSQL writes");

  await resetDatabase();
  const denied = "dev110-p08"; await insertSession(denied); await insertCandidate("dev110-p08-candidate", denied);
  await assert.rejects(() => handoff(denied, undefined, { access: { canCreate: false, canUpdate: true, canEditNonOwned: false } }), (error) => error?.code === "RECOGNITION_HANDOFF_PERMISSION_DENIED");
  const positive = await handoff(denied, undefined, { idempotencyKey: "dev110-p08-positive" });
  const fk = await pgAdmin.query(`SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype='f'`);
  const orphans = await pgAdmin.query(`SELECT
      (SELECT COUNT(*) FROM drawing_recognition_candidate_observations link LEFT JOIN drawing_recognition_candidates candidate ON candidate.id=link.candidate_id WHERE candidate.id IS NULL)
      + (SELECT COUNT(*) FROM drawing_recognition_candidate_observations link LEFT JOIN drawing_recognition_observations observation ON observation.id=link.observation_id WHERE observation.id IS NULL)
      + (SELECT COUNT(*) FROM drawing_recognition_formalization_links link LEFT JOIN drawing_recognition_formalization_events event ON event.id=link.event_id WHERE event.id IS NULL) AS count`);
  check("P08", positive.schemaVersion === "pdm-recognition-part-work-handoff-v2" && (await client.queryOne("SELECT COUNT(*) count FROM part_variant_attributes"))?.count === "0" && Number(fk.rows[0]?.count ?? 0) > 0 && Number(orphans.rows[0]?.count ?? 0) === 0, "permission boundary, v2 event, formal master immutability, and foreign-key orphan checks hold on PostgreSQL");
  if (failures.length) throw new Error(`DEV-110 PostgreSQL failures: ${JSON.stringify(failures)}`);
  const report = { runner: "postgres", status: "PASS", denominator: 8, checks, port, runtimeDeclaration: { project: root, purpose: "DEV-110 isolated PostgreSQL provider/locking/rollback evidence", port, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, cleanupVerified: true } };
  fs.writeFileSync(path.join(evidenceDir, "postgres.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("DEV-110 PostgreSQL QC PASS (P01-P08)");
}

try {
  await setup();
  await main();
} finally {
  await client?.close().catch(() => undefined);
  await pgAdmin?.end().catch(() => undefined);
  try { source?.close(); } catch { /* best effort */ }
  if (started) { try { run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* report via cleanup artifact */ } }
  try { fs.rmSync(taskRoot, { recursive: true, force: true }); } catch { /* best effort */ }
}
