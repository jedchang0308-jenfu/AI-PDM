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
import { issueCanonicalWorkbenchContract } from "../src/lib/pdm-workbench-authority-control.ts";
import { PartChangeWorkService } from "../src/lib/part-change-work.ts";
import { AsyncApprovalPlatformRepository } from "../src/lib/repositories/approval-platform-async-repository.ts";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = process.env.DEV101_SUPPORT_RUN_ID?.trim() || `DEV101-PG-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.resolve(process.env.DEV101_SUPPORT_EVIDENCE_DIR?.trim() || path.join(root, "output", "qa", "dev-101", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev101-postgres-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const clusterDir = path.join(taskRoot, "cluster");
const postgresLog = path.join(taskRoot, "postgres.log");
const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepositoryDir = path.join(root, "data", "repository");
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const dbName = `dev101_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
const checks = [];
let port = null;
let started = false;
let control = null;
let client = null;
let runError = null;
let decisionFixture = null;

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function primaryFingerprint() {
  const database = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    const payload = {
      schema: database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all(),
      roots: database.prepare("SELECT id, company_id, root_code FROM part_roots ORDER BY company_id, id").all(),
      parts: database.prepare("SELECT id, company_id, part_root_id, part_number FROM part_numbers ORDER BY company_id, id").all(),
      drawings: database.prepare("SELECT id, company_id, drawing_number, formal_drawing_number_id FROM drawings ORDER BY company_id, id").all(),
      residue: database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { hash: stableHash(payload), foreignKeys: payload.foreignKeys, counts: { roots: payload.roots.length, parts: payload.parts.length, drawings: payload.drawings.length } };
  } finally { database.close(); }
}

function quote(value) { return `"${String(value).replaceAll('"', '""')}"`; }

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

async function postgresColumns(database, table) {
  const result = await database.query(`SELECT column_name,data_type,is_generated,is_identity
    FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return new Map(result.rows.filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO").map((row) => [row.column_name, row]));
}

async function restoreSqliteSnapshot(database, source) {
  const pgTables = (await database.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename);
  const sourceTables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
  await database.query("SET session_replication_role=replica");
  let copiedRows = 0;
  for (const table of pgTables) {
    if (!sourceTables.has(table)) continue;
    const columnsMap = await postgresColumns(database, table);
    const sqliteColumns = source.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => row.name);
    const columns = sqliteColumns.filter((column) => columnsMap.has(column));
    if (!columns.length) continue;
    for (const row of source.prepare(`SELECT ${columns.map(quote).join(",")} FROM ${quote(table)}`).all()) {
      const values = columns.map((column) => normalizeForPostgres(row[column], columnsMap.get(column)));
      await database.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`, values);
      copiedRows += 1;
    }
  }
  await database.query("SET session_replication_role=origin");
  return copiedRows;
}

async function foreignKeyViolations(database) {
  const constraints = await database.query(`SELECT con.conname,child.relname AS child_table,parent.relname AS parent_table,
      json_agg(child_att.attname ORDER BY keys.ordinality) AS child_columns,
      json_agg(parent_att.attname ORDER BY keys.ordinality) AS parent_columns
    FROM pg_constraint con
    JOIN pg_class child ON child.oid=con.conrelid
    JOIN pg_class parent ON parent.oid=con.confrelid
    JOIN unnest(con.conkey,con.confkey) WITH ORDINALITY AS keys(child_num,parent_num,ordinality) ON true
    JOIN pg_attribute child_att ON child_att.attrelid=child.oid AND child_att.attnum=keys.child_num
    JOIN pg_attribute parent_att ON parent_att.attrelid=parent.oid AND parent_att.attnum=keys.parent_num
    WHERE con.contype='f' AND child.relnamespace='public'::regnamespace
    GROUP BY con.conname,child.relname,parent.relname ORDER BY child.relname,con.conname`);
  const violations = [];
  for (const constraint of constraints.rows) {
    const nonNull = constraint.child_columns.map((column) => `child.${quote(column)} IS NOT NULL`).join(" AND ");
    const join = constraint.child_columns.map((column, index) => `parent.${quote(constraint.parent_columns[index])}=child.${quote(column)}`).join(" AND ");
    const result = await database.query(`SELECT COUNT(*)::integer AS count FROM ${quote(constraint.child_table)} child WHERE ${nonNull} AND NOT EXISTS (SELECT 1 FROM ${quote(constraint.parent_table)} parent WHERE ${join})`);
    if (Number(result.rows[0].count) > 0) violations.push({ ...constraint, count: Number(result.rows[0].count) });
  }
  return violations;
}

const primaryBefore = primaryFingerprint();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}

async function check(id, description, fn) {
  try {
    const detail = await fn();
    checks.push({ id, description, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${description}`);
  } catch (error) {
    checks.push({ id, description, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
    throw error;
  }
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

try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  port = await getFreePort();
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-101 canonical inbox PostgreSQL provider parity",
    port,
    owningProcessTree: "qc-dev-101-postgres -> task-owned PostgreSQL 18 cluster",
    cleanupCondition: "clients closed, cluster stopped, port released, taskRoot removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: taskRoot
  } }));
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", postgresLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", dbName]);
  const dsn = `postgresql://postgres@127.0.0.1:${port}/${dbName}`;
  control = new pg.Client({ connectionString: dsn, application_name: "ai-pdm-dev101-postgres-control" });
  await control.connect();
  for (const migration of ["001_initial_schema.sql", "039_allow_recycled_candidate_drawing_codes.sql", "042_status_data_rebuild.sql", "043_inline_relation_matrix.sql", "047_remove_bom_module.sql", "048_solidworks_credential_ui_activation.sql", "049_retire_standalone_manufacturing_impact.sql", "050_drawing_recognition_part_owner_invariant.sql", "051_part_structure_type_authority.sql"]) {
    await control.query(fs.readFileSync(path.join(root, "db", "postgres", migration), "utf8"));
  }
  await control.query("UPDATE pdm_workbench_state_authority_control SET expected_commit='local-dev', schema_hash='dev090-v1' WHERE id=1");
  const source = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  const copiedRows = await restoreSqliteSnapshot(control, source);
  source.close();
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
  let sourceRequest = (await control.query(`SELECT request.id,request.canonical_entity_id,drawing.drawing_number,revision.revision
      FROM pdm_work_review_requests request
      JOIN drawings drawing ON drawing.id=request.canonical_entity_id AND drawing.company_id=request.company_id
      LEFT JOIN canonical_workbench_states state ON state.work_id=request.work_id AND state.company_id=request.company_id
      LEFT JOIN drawing_revisions revision ON revision.id=state.revision_id AND revision.company_id=state.company_id
      WHERE request.company_id='company-jenfu' AND request.reviewer_user_id='user-manager-demo'
        AND request.request_kind='drawing_revision' AND request.request_status='pending' AND drawing.drawing_number='A0002-M01'
      ORDER BY request.created_at LIMIT 1`)).rows[0];
  if (!sourceRequest) {
    const target = (await control.query(`SELECT drawing.id AS drawing_id,drawing.company_id,branch.id AS branch_id,
        revision.id AS revision_id,revision.policy_snapshot_json,claim.id AS claim_id
      FROM drawings drawing
      JOIN drawing_rd_branches branch ON branch.drawing_id=drawing.id AND branch.company_id=drawing.company_id AND branch.status='open'
      JOIN drawing_revisions revision ON revision.id=branch.latest_approved_revision_id AND revision.company_id=drawing.company_id
      JOIN drawing_revision_claims claim ON claim.branch_id=branch.id AND claim.company_id=drawing.company_id AND claim.predecessor_revision_id IS NULL
      WHERE drawing.drawing_number='A0002-M01' AND drawing.lifecycle_state='drawing_preparation'
      ORDER BY claim.created_at DESC,branch.id DESC LIMIT 1`)).rows[0];
    assert.ok(target, "canonical A0002-M01 drawing work fixture is unavailable");
    const workId = `dev101-pg-source-work-${crypto.randomUUID()}`;
    const requestId = `dev101-pg-source-request-${crypto.randomUUID()}`;
    const snapshot = { payload: target.policy_snapshot_json ?? {}, revisionId: target.revision_id, claimId: target.claim_id };
    const snapshotHash = stableHash(snapshot);
    await control.query("BEGIN");
    try {
      await control.query(`INSERT INTO drawing_revision_works
        (id,company_id,drawing_id,branch_id,target_claim_id,owner_user_id,proposed_payload,base_hash,row_version)
        VALUES($1,$2,$3,$4,$5,'user-manager-demo',$6::jsonb,$7,1)`,
      [workId, target.company_id, target.drawing_id, target.branch_id, target.claim_id, JSON.stringify(snapshot.payload), snapshotHash]);
      await control.query(`INSERT INTO drawing_revision_work_files(work_id,file_binding_id,ordinal,content_hash)
        SELECT $1,file.id,file.sort_order,asset.content_hash FROM drawing_revision_files file
        JOIN file_assets asset ON asset.id=file.source_file_asset_id
        WHERE file.drawing_revision_id=$2 AND file.removed_at IS NULL ORDER BY file.sort_order,file.id`, [workId, target.revision_id]);
      const state = await control.query(`UPDATE canonical_workbench_states SET work_id=$1,handling='review_owner',row_version=row_version+1,updated_at=CURRENT_TIMESTAMP
        WHERE company_id=$2 AND entity_type='drawing' AND canonical_entity_id=$3 AND branch_id=$4 AND revision_id=$5`,
      [workId, target.company_id, target.drawing_id, target.branch_id, target.revision_id]);
      assert.equal(state.rowCount, 1, "canonical A0002-M01 state cardinality");
      await control.query(`INSERT INTO pdm_work_review_requests
        (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version)
        VALUES($1,$2,'drawing_revision','drawing',$3,$4,$5,'user-manager-demo',$6,$7::jsonb,$8,'pending',1)`,
      [requestId, target.company_id, target.drawing_id, workId, target.branch_id, `dev101-pg-source-cycle-${crypto.randomUUID()}`, JSON.stringify(snapshot), snapshotHash]);
      await control.query("COMMIT");
    } catch (error) {
      await control.query("ROLLBACK");
      throw error;
    }
    sourceRequest = (await control.query(`SELECT request.id,request.canonical_entity_id,drawing.drawing_number,revision.revision
      FROM pdm_work_review_requests request
      JOIN drawings drawing ON drawing.id=request.canonical_entity_id AND drawing.company_id=request.company_id
      JOIN canonical_workbench_states state ON state.work_id=request.work_id AND state.company_id=request.company_id
      JOIN drawing_revisions revision ON revision.id=state.revision_id AND revision.company_id=state.company_id
      WHERE request.id=$1`, [requestId])).rows[0];
  }
  assert.ok(sourceRequest, "task-owned provider fixture must contain the A0002-M01 assigned review request");
  const drawingId = sourceRequest.canonical_entity_id;
  for (const [id, reviewer, status, createdAt] of [
    ["request-other", "user-admin-local-quick", "pending", "2026-08-27T11:59:59Z"],
    ["request-applying", "user-manager-demo", "applying", "2026-08-27T11:59:58Z"],
    ["request-apply-failed", "user-manager-demo", "apply_failed", "2026-08-27T11:59:57Z"]
  ]) {
    const branchId = `branch-${id}`;
    await control.query("INSERT INTO drawing_rd_branches(id,company_id,drawing_id,status,row_version) VALUES($1,'company-jenfu',$2,'open',1)", [branchId, drawingId]);
    await control.query(`INSERT INTO pdm_work_review_requests
      (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version,created_at,updated_at)
      VALUES($1,'company-jenfu','drawing_rd_void','drawing',$2,NULL,$3,$4,$5,'{}'::jsonb,$6,$7,1,$8,$8)`,
    [id, drawingId, branchId, reviewer, `cycle-${id}`, "1".repeat(64), status, createdAt]);
  }
  for (let index = 0; index < 125; index += 1) {
    const id = index === 124 ? "request-query-needle-oldest" : `request-page-${String(index).padStart(3, "0")}`;
    const createdAt = new Date(Date.UTC(2026, 7, 27, 10, 0, 0) - index * 1_000).toISOString();
    const branchId = `branch-${id}`;
    await control.query("INSERT INTO drawing_rd_branches(id,company_id,drawing_id,status,row_version) VALUES($1,'company-jenfu',$2,'open',1)", [branchId, drawingId]);
    await control.query(`INSERT INTO pdm_work_review_requests
      (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version,created_at,updated_at)
      VALUES($1,'company-jenfu','drawing_rd_void','drawing',$2,NULL,$3,'user-manager-demo',$4,'{}'::jsonb,$5,'pending',1,$6,$6)`,
    [id, drawingId, branchId, `cycle-${id}`, "2".repeat(64), createdAt]);
  }
  const expectedVoidRows = Number((await control.query("SELECT COUNT(*)::integer AS count FROM pdm_work_review_requests WHERE company_id='company-jenfu' AND reviewer_user_id='user-manager-demo' AND request_kind='drawing_rd_void' AND request_status='pending'")).rows[0].count);

  process.env.PDM_DB_PROVIDER = "postgres";
  process.env.PDM_POSTGRES_URL = dsn;
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_REVIEW_PACKAGE_V2_WRITE = "true";
  client = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsn, maxConnections: 8 });
  const repository = new AsyncApprovalPlatformRepository(client);
  const listPdm = (input) => repository.listPdmWorkReviewInbox(input);

  await check("DEV101-PG-000", "full PostgreSQL schema restores the unmodified source snapshot without foreign-key residue", async () => {
    const violations = await foreignKeyViolations(control);
    assert.equal(violations.length, 0, JSON.stringify(violations));
    assert.ok(copiedRows > 0);
    assert.equal(primaryBefore.foreignKeys.length, 0);
    return { copiedRows, primaryCounts: primaryBefore.counts };
  });

  await check("DEV101-PG-001", "PostgreSQL exact reviewer projection includes A0002-M01 and revision", async () => {
    const items = await listPdm({ companyId: "company-jenfu", actorId: "user-manager-demo", status: "active", actionCode: "numbering.pdm_drawing_revision_review", query: "A0002-M01", limit: 10 });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, sourceRequest.id);
    assert.match(items[0].targetSummary, /A0002-M01 \/ 研發版 0\.1/u);
    assert.equal(typeof items[0].requestedAt, "string");
  });

  await check("DEV101-PG-002", "PostgreSQL actor and actionable status remain fail-closed", async () => {
    const exact = await listPdm({ companyId: "company-jenfu", actorId: "user-manager-demo", status: "all", actionCode: "numbering.pdm_drawing_rd_void_review", limit: 500 });
    assert.ok(!exact.some((item) => ["request-other", "request-applying", "request-apply-failed"].includes(item.id)));
    const other = await listPdm({ companyId: "company-jenfu", actorId: "user-admin-local-quick", status: "active", actionCode: "numbering.pdm_drawing_rd_void_review", limit: 500 });
    assert.ok(other.some((item) => item.id === "request-other"));
  });

  await check("DEV101-PG-003", "PostgreSQL query is applied before source limit", async () => {
    const items = await listPdm({ companyId: "company-jenfu", actorId: "user-manager-demo", status: "active", actionCode: "numbering.pdm_drawing_rd_void_review", query: "query-needle-oldest", limit: 1 });
    assert.deepEqual(items.map((item) => item.id), ["request-query-needle-oldest"]);
  });

  await check("DEV101-PG-004", "PostgreSQL cursor sequence is complete and duplicate-free beyond 100 rows", async () => {
    const seen = new Set();
    let cursor = null;
    let pages = 0;
    do {
      const items = await listPdm({ companyId: "company-jenfu", actorId: "user-manager-demo", status: "active", actionCode: "numbering.pdm_drawing_rd_void_review", cursor, limit: 10 });
      for (const item of items) {
        assert.ok(!seen.has(item.id));
        seen.add(item.id);
      }
      const last = items.at(-1);
      cursor = items.length === 10 && last ? { sortValue: last.requestedAt, rowKey: last.rowKey, direction: "after" } : null;
      pages += 1;
      assert.ok(pages < 30);
    } while (cursor);
    assert.equal(seen.size, expectedVoidRows);
    assert.ok(seen.has("request-query-needle-oldest"));
    return { pages, rows: seen.size };
  });

  await check("DEV101-PG-005", "PostgreSQL v2 submit locks a full package and attachment drift does not rewrite it", async () => {
    const candidate = (await control.query(`SELECT state.canonical_entity_id AS part_id,state.row_version,part.part_number,part.part_root_id
      FROM canonical_workbench_states state
      JOIN part_numbers part ON part.id=state.canonical_entity_id AND part.company_id=state.company_id
      WHERE state.company_id='company-jenfu' AND state.entity_type='part' AND state.data_layer='part_formal'
        AND state.handling='none' AND state.work_id IS NULL
        AND EXISTS (SELECT 1 FROM drawing_numbers drawing WHERE drawing.company_id=part.company_id AND drawing.part_root_id=part.part_root_id)
        AND NOT EXISTS (SELECT 1 FROM part_change_works work WHERE work.company_id=part.company_id AND work.part_id=part.id)
        AND NOT EXISTS (SELECT 1 FROM pdm_work_review_requests request WHERE request.company_id=part.company_id AND request.canonical_entity_id=part.id)
      ORDER BY part.part_number LIMIT 1`)).rows[0];
    assert.ok(candidate, "eligible PostgreSQL Part candidate missing");
    const attachmentId = `dev101-pg-attachment-${crypto.randomUUID()}`;
    const attachmentHash = stableHash({ attachmentId });
    await control.query(`INSERT INTO file_assets
      (id,storage_provider,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id,document_category,display_name,description,uploaded_by)
      VALUES($1,'local_repository','dev101-pg-evidence.txt','.txt','text/plain',17,$2,'part_number',$3,'other','DEV101 PostgreSQL evidence','provider drift fixture','user-engineer-demo')`, [attachmentId, attachmentHash, candidate.part_id]);
    const recognitionTarget = (await control.query(`SELECT drawing.id AS drawing_id,revision.id AS revision_id,
        COALESCE(asset.id,$2) AS file_asset_id,COALESCE(asset.content_hash,$3) AS content_hash,
        COALESCE(asset.file_name,'dev101-pg-evidence.txt') AS file_name,COALESCE(asset.file_ext,'.txt') AS file_ext,
        COALESCE(asset.mime_type,'text/plain') AS mime_type,COALESCE(asset.file_size,17) AS file_size,
        COALESCE(file.role,'fixture_evidence') AS source_role
      FROM drawings drawing
      JOIN drawing_revisions revision ON revision.drawing_id=drawing.id AND revision.company_id=drawing.company_id
      LEFT JOIN drawing_revision_files file ON file.drawing_revision_id=revision.id AND file.company_id=revision.company_id AND file.removed_at IS NULL
      LEFT JOIN file_assets asset ON asset.id=file.source_file_asset_id AND asset.deleted_at IS NULL
      WHERE drawing.company_id='company-jenfu' AND drawing.part_root_id=$1
      ORDER BY revision.updated_at DESC,revision.id DESC,file.is_primary DESC,file.sort_order,file.id LIMIT 1`, [candidate.part_root_id, attachmentId, attachmentHash])).rows[0];
    assert.ok(recognitionTarget?.drawing_id && recognitionTarget?.revision_id);
    const recognitionIds = {
      session: `dev101-pg-recognition-${crypto.randomUUID()}`,
      source: `dev101-pg-recognition-source-${crypto.randomUUID()}`,
      adapter: `dev101-pg-recognition-adapter-${crypto.randomUUID()}`,
      observation: `dev101-pg-recognition-observation-${crypto.randomUUID()}`,
      candidate: `dev101-pg-recognition-candidate-${crypto.randomUUID()}`
    };
    const recognitionCreatedAt = "2098-01-01T00:00:00.000Z";
    await control.query("BEGIN");
    try {
      await control.query(`INSERT INTO drawing_recognition_sessions
        (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,
         source_set_fingerprint,deduplication_key,status,row_version,created_by,created_at,updated_at)
        VALUES($1,'company-jenfu','drawing_revision',$2,$3,$4,$2,$5,$1,'review_ready',1,'user-engineer-demo',$6,$6)`,
      [recognitionIds.session, recognitionTarget.revision_id, `drawing_revision:${recognitionTarget.revision_id}`, recognitionTarget.drawing_id, `fixture:${recognitionTarget.content_hash}`, recognitionCreatedAt]);
      await control.query(`INSERT INTO drawing_recognition_sources
        (id,session_id,company_id,file_asset_id,content_hash,file_name,file_ext,mime_type,file_size,source_role,sort_order,adapter_plan_json,created_at)
        VALUES($1,$2,'company-jenfu',$3,$4,$5,$6,$7,$8,$9,0,'["dev101.fixture.v1"]'::jsonb,$10)`,
      [recognitionIds.source, recognitionIds.session, recognitionTarget.file_asset_id, recognitionTarget.content_hash, recognitionTarget.file_name, recognitionTarget.file_ext, recognitionTarget.mime_type, Number(recognitionTarget.file_size), recognitionTarget.source_role, recognitionCreatedAt]);
      await control.query(`INSERT INTO drawing_recognition_adapter_results
        (id,session_id,source_id,company_id,adapter_code,adapter_version,status,observation_count,diagnostics_json,started_at,completed_at)
        VALUES($1,$2,$3,'company-jenfu','dev101.fixture.v1','1','succeeded',1,'[]'::jsonb,$4,$4)`, [recognitionIds.adapter, recognitionIds.session, recognitionIds.source, recognitionCreatedAt]);
      await control.query(`INSERT INTO drawing_recognition_observations
        (id,session_id,source_id,adapter_result_id,company_id,raw_text,raw_value,normalized_value,location_kind,page_number,
         geometry_json,confidence_band,extractor_code,extractor_version,captured_at)
        VALUES($1,$2,$3,$4,'company-jenfu','製圖者：DEV101 RD','DEV101 RD','DEV101 RD','page_region',1,
         '{"coordinateSpace":"normalized_page","origin":"top_left","x":0.1,"y":0.1,"width":0.2,"height":0.08}'::jsonb,
         'high','dev101.fixture.v1','1',$5)`, [recognitionIds.observation, recognitionIds.session, recognitionIds.source, recognitionIds.adapter, recognitionCreatedAt]);
      await control.query(`INSERT INTO drawing_recognition_candidates
        (id,session_id,company_id,category,field_key,field_label,raw_value,proposed_value,normalized_value,
         applicability_scope,variant_status,confidence_band,review_state,group_key,sort_order,row_version,created_at,updated_at)
        VALUES($1,$2,'company-jenfu','drawing_revision','drawn_by_name','製圖者','DEV101 RD','DEV101 RD','DEV101 RD',
         'overall','added','high','accepted','dev101:drawn_by_name',0,1,$3,$3)`, [recognitionIds.candidate, recognitionIds.session, recognitionCreatedAt]);
      await control.query("INSERT INTO drawing_recognition_candidate_observations(candidate_id,observation_id,company_id,created_at) VALUES($1,$2,'company-jenfu',$3)", [recognitionIds.candidate, recognitionIds.observation, recognitionCreatedAt]);
      await control.query("COMMIT");
    } catch (error) {
      await control.query("ROLLBACK");
      throw error;
    }
    const engineer = { id: "user-engineer-demo", companyId: "company-jenfu", canEditNonOwned: true, permissions: { create: true, update: true, submit: true, cancel: true, decide: false } };
    const service = new PartChangeWorkService(client);
    const createToken = await issueCanonicalWorkbenchContract(client, { companyId: engineer.companyId, actorId: engineer.id });
    const created = await service.create(candidate.part_id, engineer, { idempotencyKey: crypto.randomUUID(), contractToken: createToken, expectedRowVersion: Number(candidate.row_version) });
    const submitToken = await issueCanonicalWorkbenchContract(client, { companyId: engineer.companyId, actorId: engineer.id });
    const submitted = await service.submit(created.workId, engineer, { idempotencyKey: crypto.randomUUID(), contractToken: submitToken, expectedRowVersion: created.rowVersion });
    const before = (await control.query("SELECT snapshot_payload,snapshot_hash,reviewer_user_id,row_version FROM pdm_work_review_requests WHERE id=$1", [submitted.requestId])).rows[0];
    assert.equal(before.snapshot_payload.schemaVersion, "pdm-review-package-v2");
    assert.equal(before.snapshot_payload.packageHash, before.snapshot_hash);
    assert.ok(before.snapshot_payload.targets.some((target) => target.targetKey === `part:${candidate.part_id}` && target.workspace.attachments.some((file) => file.sourceFileAssetId === attachmentId)));
    const recognitionSnapshot = before.snapshot_payload.targets.find((target) => target.workspace.entityId === recognitionTarget.drawing_id)?.workspace.recognition;
    assert.equal(recognitionSnapshot?.schemaVersion, "pdm-recognition-review-projection-v1");
    assert.equal(recognitionSnapshot?.session?.id, recognitionIds.session);
    assert.equal(recognitionSnapshot?.session?.drawingRevisionId, recognitionTarget.revision_id);
    assert.ok(recognitionSnapshot?.projectionHash);
    await control.query("UPDATE file_assets SET deleted_at=now(),deleted_by='user-engineer-demo',deleted_reason='DEV101 post-submit drift' WHERE id=$1", [attachmentId]);
    const after = (await control.query("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=$1", [submitted.requestId])).rows[0];
    assert.deepEqual(after, { snapshot_payload: before.snapshot_payload, snapshot_hash: before.snapshot_hash });
    decisionFixture = { candidate, created, submitted, before };
    return { requestId: submitted.requestId, packageHash: before.snapshot_hash, attachmentId, recognitionProjection: recognitionSnapshot };
  });

  await check("DEV101-PG-006", "PostgreSQL concurrent approve and response retry produce exactly one formal effect", async () => {
    const fixture = decisionFixture;
    assert.ok(fixture);
    const reviewer = { id: "user-manager-demo", companyId: "company-jenfu", canEditNonOwned: true, permissions: { create: false, update: false, submit: false, cancel: false, decide: true } };
    assert.equal(fixture.before.reviewer_user_id, reviewer.id);
    const service = new PartChangeWorkService(client);
    const contexts = await Promise.all([0, 1].map(async (index) => ({
      idempotencyKey: `dev101-pg-concurrent-${index}-${crypto.randomUUID()}`,
      contractToken: await issueCanonicalWorkbenchContract(client, { companyId: reviewer.companyId, actorId: reviewer.id }),
      expectedRowVersion: Number(fixture.before.row_version)
    })));
    const outcomes = await Promise.allSettled(contexts.map((context) => service.decide(fixture.submitted.requestId, "approve", reviewer, context)));
    const fulfilled = outcomes.map((outcome, index) => ({ outcome, index })).filter((entry) => entry.outcome.status === "fulfilled");
    assert.equal(fulfilled.length, 1, JSON.stringify(outcomes.map((outcome) => outcome.status === "fulfilled" ? "fulfilled" : String(outcome.reason?.code ?? outcome.reason))));
    const winningContext = contexts[fulfilled[0].index];
    const retry = await service.decide(fixture.submitted.requestId, "approve", reviewer, winningContext);
    assert.equal(retry.acknowledged, true);
    const counts = (await control.query(`SELECT
      (SELECT COUNT(*)::integer FROM pdm_work_review_requests WHERE id=$1) AS active_request,
      (SELECT COUNT(*)::integer FROM pdm_work_review_terminal_receipts WHERE request_id=$1) AS terminal_receipt,
      (SELECT COUNT(*)::integer FROM pdm_review_traces WHERE review_cycle_id=$2) AS trace,
      (SELECT COUNT(*)::integer FROM part_approved_change_snapshots WHERE part_id=$3) AS approved_snapshot,
      (SELECT COUNT(*)::integer FROM part_change_works WHERE id=$4) AS work`, [fixture.submitted.requestId, fixture.submitted.reviewCycleId, fixture.candidate.part_id, fixture.created.workId])).rows[0];
    assert.deepEqual(counts, { active_request: 0, terminal_receipt: 1, trace: 1, approved_snapshot: 1, work: 0 });
    return { outcomes: outcomes.map((outcome) => outcome.status), counts };
  });

  await check("DEV101-PG-007", "PostgreSQL product journey leaves no provider foreign-key violations", async () => {
    const violations = await foreignKeyViolations(control);
    assert.equal(violations.length, 0, JSON.stringify(violations));
  });
} catch (error) {
  runError = error;
  console.error(error instanceof Error ? error.stack : String(error));
} finally {
  if (client) await client.close().catch(() => {});
  if (control) await control.end().catch(() => {});
  if (started) {
    spawnSync(path.join(postgresBin, "pg_ctl.exe"), ["stop", "-w", "-t", "20", "-D", clusterDir, "-m", "fast"], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 25_000 });
  }
  const released = port ? !(await portAccepting(port)) : true;
  checks.push({ id: "DEV101-PG-008", description: "task-owned PostgreSQL port is released", status: released ? "PASS" : "FAIL", detail: String(port) });
  const primaryAfter = primaryFingerprint();
  const primaryUnchanged = primaryAfter.hash === primaryBefore.hash && primaryAfter.foreignKeys.length === 0;
  checks.push({ id: "DEV101-PG-009", description: "primary SQLite schema, canonical identities, migration residue and foreign keys remain unchanged", status: primaryUnchanged ? "PASS" : "FAIL", detail: { before: primaryBefore.hash, after: primaryAfter.hash } });
  if (!primaryUnchanged && !runError) runError = new Error("Primary SQLite invariant changed during PostgreSQL evidence run");
  if (!released && !runError) runError = new Error(`PostgreSQL port ${port} remains open`);
  const report = { dev: "DEV-101", runId, evidenceClass: "RD_SUPPORTING_ONLY_NOT_INDEPENDENT_QC", result: !runError && checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL", checks, primaryInvariant: { before: primaryBefore, after: primaryAfter }, runtime: { port, taskRoot, dataDir, repositoryDir, cleanupCondition: "clients closed, cluster stopped, port released, taskRoot removed" }, completedAt: new Date().toISOString() };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "receipt.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 });
  for (const item of checks) console.log(`${item.status} ${item.id} ${item.description}`);
  console.log(`DEV-101 PostgreSQL summary: ${checks.filter((item) => item.status === "PASS").length}/${checks.length} PASS`);
  if (report.result !== "PASS") process.exitCode = 1;
}
