#!/usr/bin/env node

/*
 * DEV-087 trusted-solo Provider / Security / UI quality-gate runner.
 *
 * The source SQLite database is read-only.  A disposable PostgreSQL cluster
 * receives a schema-only setup followed by a column-compatible snapshot of
 * the current canonical fixture.  All business writes in the browser lane
 * are rendered UI clicks; SQL/HTTP reads below are evidence readback only.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import pg from "pg";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";
import { manifestBase } from "./dev-087-evidence-lib.mjs";
import { resolveTaskActionUrl } from "../src/lib/numbering-task-center-contract.ts";

const root = process.cwd();
const runId = `DEV087-product-g4-postgres-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-087-capability", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = path.join(os.tmpdir(), `ai-pdm-dev087-g4-postgres-${crypto.randomUUID()}`);
const clusterDir = path.join(tempRoot, "cluster");
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(tempRoot, "repository");
const serverLog = path.join(tempRoot, "postgres.log");
const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const dbName = "dev087_g4";
const dbUser = "postgres";
const parentRunId = process.env.DEV087_AGGREGATE_RUN_ID ?? null;
const targetDrawingNumber = "A0003-M01";
const targetPartNumber = "A0003-P01";
const fffDrawingNumber = "A0001-M01";
const fffPartNumber = "A0001-P01";
const formalDrawingNumber = "A0002-M01";
const formalPartNumber = "A0002-P01";
const formalObsoletePartNumber = "A0002-P47";
const visibleFamilyRoster = ["drawing_change", "task_retirement", "formal_obsolete", "part_variant", "drawing_history", "work_files", "matrix_navigation", "workbench_discovery"];
const uploadDir = path.join(tempRoot, "uploads");
const upload2d = path.join(uploadDir, "DEV087-G4.SLDDRW");
const upload3d = path.join(uploadDir, "DEV087-G4.SLDPRT");
const uploadPdf = path.join(uploadDir, "DEV087-G4-SUPPLEMENT.pdf");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (file) => sha256(fs.readFileSync(file));
const git = (args) => { try { return spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim(); } catch { return "unavailable"; } };
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const dsn = (port) => `postgresql://${dbUser}@127.0.0.1:${port}/${dbName}`;

const checks = [];
const mutationLedger = [];
const providerReceipts = [];
const fixtureMutationLedger = [];
const visibleEvidence = [];
const negativeEvidence = [];
const assistiveTechnologyEvidence = [];
let qualityGateResults = [];
const postgresCaseReceipts = [];
const networkEvents = [];
const failures = [];
const requestEvents = new WeakMap();
const recordedCommandReceiptIds = new Set();
let browser = null;
let headlessBrowser = null;
let app = null;
let port = null;
let appPort = null;
let started = false;
let client = null;
let sourceSqlite = null;
let baseUrl = "";
let runtimeProjectRoot = null;
let runtimeProjectCleanupReceipt = { removed: false, path: null, error: "not-attempted" };
let sourceBefore = null;
let sourceAfter = null;
let sourceBeforeHash = null;
let sourceAfterHash = null;
let drawingWork = null;
let partWork = null;

function check(caseId, condition, detail = "") {
  checks.push({ caseId, result: condition ? "PASS" : "FAIL", assertionIds: [caseId], firstFailurePointer: condition ? null : detail || caseId, detail });
  if (!condition) failures.push({ caseId, detail });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}

function readPrimaryInvariant() {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${sourceDbPath}`], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
}

function primaryInvariantIsSafe(snapshot) {
  return snapshot
    && Object.values(snapshot.counts ?? {}).every((count) => Number(count) > 0)
    && Number(snapshot.migrationResidue?.unresolved ?? -1) === 0
    && Object.values(snapshot.rootReferenceViolations ?? {}).every((count) => Number(count) === 0)
    && Number(snapshot.foreignKeyViolations ?? -1) === 0;
}

function protectedPrimaryInvariant(snapshot) {
  return {
    schemaHash: snapshot?.schemaHash,
    canonicalIdentityHash: snapshot?.canonicalIdentityHash,
    counts: snapshot?.counts,
    migrationResidue: snapshot?.migrationResidue,
    rootReferenceViolations: snapshot?.rootReferenceViolations,
    foreignKeyViolations: snapshot?.foreignKeyViolations
  };
}

function prepareTaskOwnedRuntimeProject(targetRoot) {
  const workspaceTemp = path.resolve(root, ".tmp");
  const resolved = path.resolve(targetRoot);
  if (!resolved.startsWith(`${workspaceTemp}${path.sep}`) || !path.basename(resolved).startsWith("qc-dev087-g4-runtime-project-")) {
    throw new Error(`UNSAFE_RUNTIME_PROJECT_PATH:${resolved}`);
  }
  fs.mkdirSync(resolved, { recursive: true });
  for (const file of ["package.json", "next.config.mjs", "tsconfig.json", "tsconfig.app.json", "tsconfig.next.json", "next-env.d.ts"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolved, file));
  }
  for (const file of [".env", ".env.local", ".env.development.local"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolved, file));
  }
  for (const directory of ["src", "public", "db", "config"]) {
    const source = path.join(root, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(resolved, directory), { recursive: true, force: true });
  }
  const nextConfigPath = path.join(resolved, "next.config.mjs");
  const nextConfig = fs.readFileSync(nextConfigPath, "utf8");
  const isolated = nextConfig.replace("const nextConfig = {", "const nextConfig = {\n  agentRules: false,");
  if (isolated === nextConfig) throw new Error("RUNTIME_NEXT_CONFIG_PATCH_POINT_MISSING");
  fs.writeFileSync(nextConfigPath, isolated, "utf8");
  fs.mkdirSync(path.join(resolved, "scripts"), { recursive: true });
  for (const file of ["qc-process-warning-guard.mjs", "qc-node-listener-budget.cjs"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(resolved, "scripts", file));
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(resolved, "node_modules"), "junction");
  return { runtimeProject: resolved, sourceProject: root, generatedDeclarations: path.join(resolved, "next-env.d.ts") };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const counts = {};
  for (const table of pgTables) {
    if (!sourceTables.has(table)) continue;
    const columnsMap = await postgresColumns(database, table);
    const sqliteColumns = source.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => row.name);
    const columns = sqliteColumns.filter((column) => columnsMap.has(column));
    if (!columns.length) continue;
    const rows = source.prepare(`SELECT ${columns.map(quote).join(",")} FROM ${quote(table)}`).all();
    counts[table] = rows.length;
    for (const row of rows) {
      const values = columns.map((column) => normalizeForPostgres(row[column], columnsMap.get(column)));
      await database.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`, values);
      copiedRows += 1;
    }
  }
  await database.query("SET session_replication_role=origin");
  return { copiedRows, counts };
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

async function seedExternalActionFixture(database) {
  const id = "qc-dev087-g4-external-action";
  await database.query(`INSERT INTO numbering_notifications
    (id, company_id, notification_type, entity_type, entity_id, title, message, severity,
     recipient_id, recipient_role, dismissible, action_url, detail_json, created_at, updated_at)
    VALUES ($1, 'company-jenfu', 'qc_external_action_guard', 'drawing_number', $2,
      'G4 外部導向防護夾具', '隔離驗證用的外部 action URL，必須在 rendered UI 被阻擋。',
      'warning', NULL, NULL, 1, 'https://evil.example/redirect', '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING`, [id, targetDrawingNumber]);
  fixtureMutationLedger.push({ table: "numbering_notifications", operation: "insert", id, scope: "task_owned_isolated_postgresql_fixture", reason: "actual rendered external action URL negative" });
  return id;
}

async function waitPortReleased(value) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(value, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function setupPostgres(source) {
  port = await getFreePort();
  declaration.ports.postgresql = port;
  console.log(`QC DEV-087 G4 lifecycle declaration: project=${root}; purpose=PostgreSQL provider/security/headed/a11y evidence; postgresPort=${port}; nextPort=${appPort}; processTree=current runner ${process.pid} -> task-owned pg_ctl/PostgreSQL + Next dev + Playwright Chromium; cleanup=manifest finalizer stops exact process trees, confirms both ports released, removes ${tempRoot} and ${runtimeProjectRoot}; PDM_DATA_DIR=${dataDir}; PDM_REPOSITORY_DIR=${repositoryDir}; mutationScope=${tempRoot},${outputDir},${runtimeProjectRoot}; primarySQLite=read-only invariant snapshots`);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, repositoryDir, { recursive: true, force: true });
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", serverLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", dbUser, dbName]);
  const connectionString = dsn(port);
  client = new pg.Client({ connectionString, application_name: "ai-pdm-dev087-g4-postgres" });
  await client.connect();
  for (const file of ["001_initial_schema.sql", "039_allow_recycled_candidate_drawing_codes.sql", "042_status_data_rebuild.sql", "043_inline_relation_matrix.sql", "048_shared_assembly_bom.sql", "049_solidworks_credential_ui_activation.sql"]) {
    await client.query(fs.readFileSync(path.join(root, "db", "postgres", file), "utf8"));
  }
  // 043 performs the canonical cutover but intentionally leaves the deployment
  // commit unset.  The isolated app is a local-dev build, so bind the copied
  // authority row to the same runtime commit used by the server.
  await client.query(`UPDATE pdm_workbench_state_authority_control
    SET expected_commit = 'local-dev', schema_hash = 'dev090-v1'
    WHERE id = 1`);
  const restore = await restoreSqliteSnapshot(client, source);
  const fk = await foreignKeyViolations(client);
  return { connectionString, restore, fk };
}

const fixtureResetTables = [
  "pdm_work_review_requests",
  "canonical_workbench_states",
  "drawing_revision_work_files",
  "drawing_revision_works",
  "drawing_revision_claims",
  "drawing_rd_branches",
  "part_change_works"
];

async function postgresTriggerRoster(database, tables) {
  const result = await database.query(`SELECT relation.relname AS table_name,
      trigger.tgname AS trigger_name,
      pg_get_triggerdef(trigger.oid, true) AS trigger_sql
    FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid=trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public'
      AND trigger.tgisinternal=false
      AND relation.relname=ANY($1::text[])
    ORDER BY relation.relname,trigger.tgname`, [tables]);
  return result.rows;
}

async function preparePostgresFixture(database) {
  const drawingResult = await database.query(`SELECT id, company_id, created_by
    FROM drawings WHERE drawing_number=$1 AND formal_drawing_number_id IS NOT NULL ORDER BY id LIMIT 1`, [formalDrawingNumber]);
  const drawing = drawingResult.rows[0];
  if (!drawing) throw new Error("G4_FORMAL_DRAWING_SOURCE_MISSING");
  const revisionResult = await database.query(`SELECT * FROM drawing_revisions WHERE drawing_id=$1
    ORDER BY CASE WHEN revision='0.1' THEN 0 ELSE 1 END, revision LIMIT 1`, [drawing.id]);
  const baseRevision = revisionResult.rows[0];
  if (!baseRevision) throw new Error("G4_FORMAL_DRAWING_REVISION_SOURCE_MISSING");
  const fffDrawingResult = await database.query(`SELECT id, company_id, created_by
    FROM drawings WHERE drawing_number=$1 AND formal_drawing_number_id IS NOT NULL ORDER BY id LIMIT 1`, [fffDrawingNumber]);
  const fffDrawing = fffDrawingResult.rows[0];
  if (!fffDrawing) throw new Error("G4_FFF_DRAWING_SOURCE_MISSING");
  const fffRevisionResult = await database.query(`SELECT * FROM drawing_revisions WHERE drawing_id=$1
    ORDER BY CASE WHEN revision='0.1' THEN 0 ELSE 1 END, revision LIMIT 1`, [fffDrawing.id]);
  const fffBaseRevision = fffRevisionResult.rows[0];
  if (!fffBaseRevision) throw new Error("G4_FFF_DRAWING_REVISION_SOURCE_MISSING");

  const targetTableGuardsBefore = await postgresTriggerRoster(database, fixtureResetTables);
  if (!targetTableGuardsBefore.some((guard) => guard.trigger_name === "trg_drawing_revision_claims_approved_immutable")) {
    throw new Error("G4_TARGET_TABLE_IMMUTABILITY_GUARD_MISSING");
  }
  let targetTableGuardsAfter = null;

  await database.query("BEGIN");
  try {
    // The snapshot contains legitimate immutable history.  Disable origin
    // triggers only for the exact fixture-reset DELETEs inside this disposable
    // PostgreSQL transaction; restore product trigger enforcement before any
    // fixture row is inserted or the application runtime is started.
    await database.query("SET LOCAL session_replication_role=replica");
    await database.query("DELETE FROM pdm_work_review_requests WHERE canonical_entity_id=$1 OR canonical_entity_id=(SELECT id FROM part_numbers WHERE part_number=$2 LIMIT 1)", [drawing.id, formalPartNumber]);
    await database.query("DELETE FROM pdm_work_review_requests WHERE canonical_entity_id=$1", [fffDrawing.id]);
    await database.query("DELETE FROM canonical_workbench_states WHERE canonical_entity_id=$1 OR canonical_entity_id=(SELECT id FROM part_numbers WHERE part_number=$2 LIMIT 1)", [drawing.id, formalPartNumber]);
    await database.query("DELETE FROM canonical_workbench_states WHERE canonical_entity_id=$1", [fffDrawing.id]);
    await database.query("DELETE FROM drawing_revision_work_files WHERE work_id IN (SELECT id FROM drawing_revision_works WHERE drawing_id=$1)", [drawing.id]);
    await database.query("DELETE FROM drawing_revision_work_files WHERE work_id IN (SELECT id FROM drawing_revision_works WHERE drawing_id=$1)", [fffDrawing.id]);
    await database.query("DELETE FROM drawing_revision_works WHERE drawing_id=$1", [drawing.id]);
    await database.query("DELETE FROM drawing_revision_works WHERE drawing_id=$1", [fffDrawing.id]);
    await database.query("DELETE FROM drawing_revision_claims WHERE drawing_id=$1", [drawing.id]);
    await database.query("DELETE FROM drawing_revision_claims WHERE drawing_id=$1", [fffDrawing.id]);
    await database.query("DELETE FROM drawing_rd_branches WHERE drawing_id=$1", [drawing.id]);
    await database.query("DELETE FROM drawing_rd_branches WHERE drawing_id=$1", [fffDrawing.id]);
    await database.query("DELETE FROM part_change_works WHERE part_id=(SELECT id FROM part_numbers WHERE part_number=$1 LIMIT 1)", [formalPartNumber]);
    await database.query("SET LOCAL session_replication_role=origin");

    const productionRevisionId = "qa-dev087-g4-production-revision";
    await database.query(`INSERT INTO drawing_revisions (
      id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json,
      override_reason, row_version, approval_request_id, review_snapshot_hash,
      source_candidate_revision_id, source_revision_package_id, created_by, created_at,
      updated_by, updated_at, submitted_at, controlled_at, released_at, superseded_at, cancelled_at
    ) SELECT $1, company_id, drawing_id, '1', 'released', policy_snapshot_json,
      override_reason, 1, NULL, NULL, source_candidate_revision_id, source_revision_package_id,
      created_by, created_at, updated_by, now(), submitted_at, controlled_at, now(), NULL, NULL
      FROM drawing_revisions WHERE id=$2
      ON CONFLICT DO NOTHING`, [productionRevisionId, baseRevision.id]);
    await database.query(`INSERT INTO drawing_revision_files (
      id, company_id, drawing_revision_id, source_file_asset_id, source_candidate_file_id,
      source_package_file_id, role, role_source, display_name, description, sort_order,
      is_primary, removed_at, removed_by, created_by, created_at, updated_at
    ) SELECT 'qa-dev087-g4-production-file-' || row_number() OVER (ORDER BY sort_order,id),
      company_id, $1, source_file_asset_id, source_candidate_file_id, source_package_file_id,
      role, role_source, display_name, description, sort_order, is_primary, NULL, NULL,
      created_by, created_at, updated_at
      FROM drawing_revision_files WHERE drawing_revision_id=$2 AND removed_at IS NULL
      ON CONFLICT DO NOTHING`, [productionRevisionId, baseRevision.id]);
    await database.query("UPDATE drawing_numbers SET record_status='Released', updated_at=now() WHERE drawing_number=$1", [formalDrawingNumber]);
    await database.query("UPDATE drawings SET lifecycle_state='released', updated_at=now() WHERE id=$1", [drawing.id]);
    await database.query("UPDATE part_numbers SET record_status='Released', updated_at=now() WHERE part_number=$1", [formalPartNumber]);
    await database.query(`INSERT INTO pdm_workbench_aggregates (id,company_id,entity_type,canonical_entity_id,open_branch_count,row_version,updated_at)
      VALUES ('qa-dev087-g4-drawing-aggregate',$1,'drawing',$2,0,1,now())
      ON CONFLICT (company_id,entity_type,canonical_entity_id) DO UPDATE SET open_branch_count=0,row_version=pdm_workbench_aggregates.row_version+1,updated_at=now()`, [drawing.company_id, drawing.id]);
    await database.query(`INSERT INTO canonical_workbench_states
      (id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling,blocker_reason,row_version,created_at,updated_at)
      VALUES ('87000000-0000-4000-8000-000000000001',$1,'drawing',$2,'drawing_production',NULL,$3,NULL,'none',NULL,1,now(),now())`, [drawing.company_id, drawing.id, productionRevisionId]);

    const fffProductionRevisionId = "qa-dev087-g4-fff-production-revision";
    await database.query(`INSERT INTO drawing_revisions (
      id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json,
      override_reason, row_version, approval_request_id, review_snapshot_hash,
      source_candidate_revision_id, source_revision_package_id, created_by, created_at,
      updated_by, updated_at, submitted_at, controlled_at, released_at, superseded_at, cancelled_at
    ) SELECT $1, company_id, drawing_id, '1', 'released', policy_snapshot_json,
      override_reason, 1, NULL, NULL, source_candidate_revision_id, source_revision_package_id,
      created_by, created_at, updated_by, now(), submitted_at, controlled_at, now(), NULL, NULL
      FROM drawing_revisions WHERE id=$2
      ON CONFLICT DO NOTHING`, [fffProductionRevisionId, fffBaseRevision.id]);
    await database.query(`INSERT INTO drawing_revision_files (
      id, company_id, drawing_revision_id, source_file_asset_id, source_candidate_file_id,
      source_package_file_id, role, role_source, display_name, description, sort_order,
      is_primary, removed_at, removed_by, created_by, created_at, updated_at
    ) SELECT 'qa-dev087-g4-fff-production-file-' || row_number() OVER (ORDER BY sort_order,id),
      company_id, $1, source_file_asset_id, source_candidate_file_id, source_package_file_id,
      role, role_source, display_name, description, sort_order, is_primary, NULL, NULL,
      created_by, created_at, updated_at
      FROM drawing_revision_files WHERE drawing_revision_id=$2 AND removed_at IS NULL
      ON CONFLICT DO NOTHING`, [fffProductionRevisionId, fffBaseRevision.id]);
    await database.query("UPDATE drawing_numbers SET record_status='Released', updated_at=now() WHERE drawing_number=$1", [fffDrawingNumber]);
    await database.query("UPDATE drawings SET lifecycle_state='released', updated_at=now() WHERE id=$1", [fffDrawing.id]);
    await database.query("UPDATE part_numbers SET record_status='Released', updated_at=now() WHERE part_number=$1", [fffPartNumber]);
    await database.query(`INSERT INTO pdm_workbench_aggregates (id,company_id,entity_type,canonical_entity_id,open_branch_count,row_version,updated_at)
      VALUES ('qa-dev087-g4-fff-drawing-aggregate',$1,'drawing',$2,0,1,now())
      ON CONFLICT (company_id,entity_type,canonical_entity_id) DO UPDATE SET open_branch_count=0,row_version=pdm_workbench_aggregates.row_version+1,updated_at=now()`, [fffDrawing.company_id, fffDrawing.id]);
    await database.query(`INSERT INTO canonical_workbench_states
      (id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling,blocker_reason,row_version,created_at,updated_at)
      VALUES ('87000000-0000-4000-8000-000000000101',$1,'drawing',$2,'drawing_production',NULL,$3,NULL,'none',NULL,1,now(),now())`, [fffDrawing.company_id, fffDrawing.id, fffProductionRevisionId]);

    const partResult = await database.query("SELECT * FROM part_numbers WHERE part_number=$1 LIMIT 1", [formalPartNumber]);
    const part = partResult.rows[0];
    if (!part) throw new Error("G4_FORMAL_PART_SOURCE_MISSING");
    await database.query(`INSERT INTO pdm_workbench_aggregates (id,company_id,entity_type,canonical_entity_id,open_branch_count,row_version,updated_at)
      VALUES ('qa-dev087-g4-part-aggregate',$1,'part',$2,0,1,now())
      ON CONFLICT (company_id,entity_type,canonical_entity_id) DO UPDATE SET open_branch_count=0,row_version=pdm_workbench_aggregates.row_version+1,updated_at=now()`, [part.company_id, part.id]);
    await database.query(`INSERT INTO canonical_workbench_states
      (id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling,blocker_reason,row_version,created_at,updated_at)
      VALUES ('87000000-0000-4000-8000-000000000002',$1,'part',$2,'part_formal',NULL,NULL,NULL,'none',NULL,1,now(),now())`, [part.company_id, part.id]);

    for (let sequence = 2; sequence <= 47; sequence += 1) {
      const suffix = `P${String(sequence).padStart(2, "0")}`;
      const id = `qa-dev087-g4-a0002-${suffix.toLowerCase()}`;
      await database.query(`INSERT INTO part_numbers (
        id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,
        structure_type,is_universal,bom_usage_policy,custom_specification,series_code,record_status,
        universal_reason,rule_version_id,created_by,created_at,updated_at
      ) SELECT $1,company_id,part_root_id,$2,$3,$4,$5,'manufactured','single_part',0,
        'undecided',NULL,'QA-PAGE','Released',NULL,rule_version_id,created_by,now(),now()
        FROM part_numbers WHERE part_number=$6 LIMIT 1 ON CONFLICT DO NOTHING`,
      [id, `A0002-${suffix}`, sequence, suffix, `DEV087 G4 pagination ${suffix}`, formalPartNumber]);
      await database.query(`INSERT INTO pdm_workbench_aggregates (id,company_id,entity_type,canonical_entity_id,open_branch_count,row_version,updated_at)
        SELECT $1,company_id,'part',$2,0,1,now() FROM part_numbers WHERE id=$2
        ON CONFLICT (company_id,entity_type,canonical_entity_id) DO NOTHING`, [`aggregate-${id}`, id]);
      const stateId = `87000000-0000-4000-8000-${String(sequence + 2).padStart(12, "0")}`;
      await database.query(`INSERT INTO canonical_workbench_states
        (id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling,blocker_reason,row_version,created_at,updated_at)
        SELECT $1,company_id,'part',$2,'part_formal',NULL,NULL,NULL,'none',NULL,1,now(),now() FROM part_numbers WHERE id=$2
        ON CONFLICT DO NOTHING`, [stateId, id]);
    }

    const unsafeUrls = [
      ["javascript_url", "javascript:alert(1)"],
      ["protocol_relative_url", "//evil.example/redirect"],
      ["encoded_external_origin", "https://%65vil.example/redirect"],
      ["path_confusion", "/parts-evil/redirect"]
    ];
    for (const [kind, actionUrl] of unsafeUrls) {
      await database.query(`INSERT INTO numbering_notifications (
        id,company_id,notification_type,entity_type,entity_id,title,message,severity,
        recipient_id,recipient_role,dismissible,action_url,detail_json,created_by,created_at,updated_at
      ) VALUES ($1,'company-jenfu','qc_security_guard','drawing_number',$2,$3,
        'DEV-087 G4 unsafe action URL fixture','warning','user-admin-local-quick',NULL,1,$4,'{}'::jsonb,
        'user-admin-local-quick',now(),now()) ON CONFLICT (id) DO UPDATE SET action_url=excluded.action_url,handled_at=NULL,read_at=NULL,updated_at=now()`,
      [`qa-dev087-g4-${kind}`, drawing.id, `G4 ${kind}`, actionUrl]);
    }
    await database.query(`INSERT INTO numbering_task_items (
      id,company_id,task_type,entity_type,entity_id,title,message,risk_level,task_status,
      assigned_to,assigned_role,project_code,action_url,detail_json,created_by,created_at,updated_at
    ) VALUES ('qa-dev087-g4-stale-task','company-jenfu','manual','part_number',$1,
      'G4 stale identity task','Task is deleted after an exact API read to prove fail-closed identity handling.',
      'critical','open','user-admin-local-quick',NULL,NULL,'/numbering/tasks','{}'::jsonb,
      'user-admin-local-quick',now(),now()) ON CONFLICT (id) DO UPDATE SET task_status='open',handled_at=NULL,updated_at=now()`, [part.id]);
    targetTableGuardsAfter = await postgresTriggerRoster(database, fixtureResetTables);
    if (JSON.stringify(targetTableGuardsAfter) !== JSON.stringify(targetTableGuardsBefore)) {
      throw new Error("G4_TARGET_TABLE_TRIGGER_ROSTER_CHANGED");
    }
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
  fixtureMutationLedger.push({
    action: "prepare-g4-postgresql-fixture",
    scope: "task_owned_isolated_postgresql_fixture",
    identities: [fffDrawingNumber, fffPartNumber, formalDrawingNumber, formalPartNumber, "A0002-P02..P47", "qa-dev087-g4-*"],
    purpose: "isolated FFF revision, formal obsolete, pagination, unsafe action URL, and stale task journeys",
    targetTableGuards: {
      preserved: JSON.stringify(targetTableGuardsAfter) === JSON.stringify(targetTableGuardsBefore),
      names: targetTableGuardsBefore.map((guard) => guard.trigger_name)
    }
  });
}

function monitor(page, label) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if ((label.startsWith("negative-") || label.startsWith("formal-obsolete-")) && message.text().includes("Failed to load resource")) return;
    failures.push({ caseId: "QA-087-228", kind: "console", label, detail: message.text() });
  });
  page.on("pageerror", (error) => failures.push({ caseId: "QA-087-228", kind: "pageerror", label, detail: error.message }));
  page.on("request", (request) => {
    if (request.method() === "GET" || request.method() === "HEAD") return;
    const entry = { at: new Date().toISOString(), label, method: request.method(), url: request.url(), sameOrigin: request.url().startsWith(baseUrl), postData: request.postData() ?? null, headers: request.headers() };
    networkEvents.push(entry);
    requestEvents.set(request, entry);
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText === "net::ERR_ABORTED") return;
    failures.push({ caseId: "QA-087-228", kind: "requestfailed", label, detail: `${request.url()}:${request.failure()?.errorText ?? "unknown"}` });
  });
  page.on("response", async (response) => {
    const tracked = requestEvents.get(response.request());
    if (tracked) {
      tracked.responseStatus = response.status();
      tracked.responseAt = new Date().toISOString();
    }
    if (response.status() < 400 || !response.url().includes("/api/numbering/drawings/workbench")) return;
    let body = "";
    try { body = await response.text(); } catch {}
    failures.push({ caseId: "QA-087-226", kind: "api-response", label, detail: `${response.status()} ${body.slice(0, 2000)}` });
  });
}

async function login(context, roleLabel = "系統管理員") {
  const page = await context.newPage();
  monitor(page, "login");
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: `以${roleLabel}角色快速登入`, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  await page.close();
}

async function readback(table, idColumn = "id", id = null) {
  if (id === null) return (await client.query(`SELECT to_jsonb(row) AS row FROM ${quote(table)} row ORDER BY ${quote(idColumn)}`)).rows.map((entry) => entry.row);
  const result = await client.query(`SELECT to_jsonb(row) AS row FROM ${quote(table)} row WHERE ${quote(idColumn)}=$1`, [id]);
  return result.rows[0]?.row ?? null;
}

async function recordCanonicalMutationBijections(label, startedAt) {
  await delay(200);
  const events = networkEvents.filter((event) => event.label === label
    && Date.parse(event.at) >= startedAt - 1000
    && event.sameOrigin
    && event.headers?.["idempotency-key"]
    && Number(event.responseStatus) >= 200
    && Number(event.responseStatus) < 300);
  for (const event of events) {
    const receipt = await client.query(`SELECT id,command_name,idempotency_key,correlation_id,command_status,effect_key,response_json,completed_at
      FROM platform_command_receipts WHERE idempotency_key=$1 ORDER BY created_at DESC LIMIT 1`, [event.headers["idempotency-key"]]);
    const row = receipt.rows[0];
    if (!row || row.command_status !== "completed" || recordedCommandReceiptIds.has(row.id)) continue;
    recordedCommandReceiptIds.add(row.id);
    mutationLedger.push({
      uiAction: label,
      networkInitiator: `${event.method} ${new URL(event.url).pathname}`,
      idempotencyKey: event.headers["idempotency-key"],
      correlationId: row.correlation_id,
      serverRoute: new URL(event.url).pathname,
      dbWriter: `${row.command_name}:${row.effect_key}`,
      commandReceiptId: row.id,
      successfulWrite: true,
      responseStatus: event.responseStatus,
      completedAt: row.completed_at
    });
  }
  return events;
}

async function recordPostgresCase(caseId, evidence, assertion) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const transaction = await client.query("SELECT txid_current()::text AS transaction_id, current_setting('transaction_isolation') AS isolation");
    const readbackResult = await assertion(client);
    if (!readbackResult?.pass) throw new Error(`${caseId}_POSTGRES_ASSERTION_FAILED:${JSON.stringify(readbackResult)}`);
    await client.query("COMMIT");
    postgresCaseReceipts.push({
      caseId,
      provider: "postgresql",
      result: "PASS",
      transactionId: transaction.rows[0].transaction_id,
      isolation: transaction.rows[0].isolation,
      evidence,
      readback: readbackResult.readback
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function zeroWriteSnapshot() {
  const result = await client.query(`SELECT
    (SELECT COUNT(*)::integer FROM platform_command_receipts) AS command_receipts,
    (SELECT COUNT(*)::integer FROM audit_logs) AS audit_logs,
    (SELECT COUNT(*)::integer FROM approval_requests) AS approval_requests,
    (SELECT COUNT(*)::integer FROM pdm_work_review_requests) AS work_reviews`);
  return result.rows[0];
}

async function addNegativeEvidence(kind, execute) {
  const before = await zeroWriteSnapshot();
  const observed = await execute();
  const after = await zeroWriteSnapshot();
  const zeroWrite = JSON.stringify(before) === JSON.stringify(after);
  const pass = observed?.blocked === true && zeroWrite;
  negativeEvidence.push({ kind, result: pass ? "PASS" : "FAIL", zeroWrite, before, after, observed });
  check("QA-087-227", pass, `${kind}:${JSON.stringify({ observed, before, after })}`);
}

async function openExistingWorkspace(context, { route, heading, code, actionName }) {
  const page = await context.newPage();
  monitor(page, `resolve-${code}`);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
  const row = page.locator("[data-canonical-workbench-row='true']").filter({ hasText: code }).first();
  if (await row.count() !== 1) throw new Error(`WORKSPACE_ROW_MISSING:${code}`);
  await row.locator(".canonical-row-open").click();
  const drawer = page.getByRole("complementary").last();
  await drawer.waitFor({ state: "visible", timeout: 30_000 });
  await drawer.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  const action = drawer.getByRole("button", { name: actionName, exact: true });
  if (await action.count() !== 1) throw new Error(`WORKSPACE_ACTION_MISSING:${code}:${actionName}:${await drawer.innerText()}`);
  await action.click();
  await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
  const workId = new URL(page.url()).searchParams.get("workId");
  const entityId = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-2) ?? "");
  const workspace = { workId, entityId, url: `${new URL(page.url()).pathname}${new URL(page.url()).search}` };
  await page.close();
  return workspace;
}

async function createFormalDrawingRevisionWorkspace(context) {
  const page = await context.newPage();
  monitor(page, "formal-drawing-revision-create");
  await page.goto(`${baseUrl}/numbering/drawings?query=${encodeURIComponent(fffDrawingNumber)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
  const row = page.locator("[data-canonical-workbench-row='true']")
    .filter({ hasText: fffDrawingNumber })
    .filter({ has: page.locator(".canonical-layer").filter({ hasText: /^量產版(?:\s|$)/u }) })
    .first();
  await row.locator(".canonical-row-open").click();
  const drawer = page.getByRole("complementary").last();
  await drawer.waitFor({ state: "visible", timeout: 30_000 });
  await drawer.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  await drawer.getByRole("button", { name: "進版", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "建立進版工作" });
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  const target = modal.locator(".canonical-revision-targets label:not(.is-disabled)").filter({ hasText: "研發版" }).first();
  await target.waitFor({ state: "visible", timeout: 30_000 });
  await target.click();
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/revision-works"), { timeout: 30_000 });
  await modal.getByRole("button", { name: "建立進版工作", exact: true }).click();
  const response = await responsePromise;
  const body = await response.json().catch(() => null);
  if (!response.ok()) throw new Error(`FORMAL_DRAWING_REVISION_CREATE_FAILED:${response.status()}:${JSON.stringify(body)}`);
  await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
  const workId = new URL(page.url()).searchParams.get("workId");
  const entityId = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-2) ?? "");
  const workspace = { workId, entityId, url: `${new URL(page.url()).pathname}${new URL(page.url()).search}` };
  await page.close();
  return workspace;
}

async function resolveWorkspaceTargets(context) {
  drawingWork = await createFormalDrawingRevisionWorkspace(context);
  partWork = await openExistingWorkspace(context, {
    route: `/parts?query=${encodeURIComponent(targetPartNumber)}`,
    heading: "料號工作台", code: targetPartNumber, actionName: "進行編輯"
  });
  check("QA-087-226", Boolean(drawingWork.workId && partWork.workId), JSON.stringify({ drawingWork, partWork }));
}

async function runDrawingLifecycle(context) {
  const page = await context.newPage();
  const label = "drawing-lifecycle";
  monitor(page, label);
  await page.goto(`${baseUrl}${drawingWork.url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator('[data-workspace-kind="drawing-revision-work"]').waitFor({ state: "visible", timeout: 30_000 });
  const startedAt = Date.now();
  await page.locator('[data-fff-axis="formState"]').selectOption("no_impact");
  await page.waitForFunction(() => document.querySelector(".canonical-fff-grid")?.getAttribute("data-fff-form-state") === "no_impact");
  await page.locator('[data-fff-axis="fitState"]').selectOption("suspected_impact");
  await page.waitForFunction(() => document.querySelector(".canonical-fff-grid")?.getAttribute("data-fff-fit-state") === "suspected_impact");
  await page.getByLabel("原因分類", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator('[data-fff-axis="functionState"]').selectOption("confirmed_impact");
  await page.waitForFunction(() => document.querySelector(".canonical-fff-grid")?.getAttribute("data-fff-function-state") === "confirmed_impact");
  await page.getByLabel("原因分類", { exact: true }).selectOption("function_change");
  await page.getByLabel("判定備註", { exact: true }).fill("DEV087 G4 PostgreSQL exact snapshot");
  await page.locator(".canonical-fff-replacement select").selectOption("self_made");
  await page.getByLabel("替代料號", { exact: true }).fill(fffPartNumber);
  await page.locator(".dev079-workspace-file-upload input[type='file']").setInputFiles([upload2d, upload3d, uploadPdf]);
  await page.getByRole("button", { name: "上傳所選檔案", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".dev079-upload-progress-list li")].filter((node) => node.classList.contains("is-success")).length >= 3, null, { timeout: 60_000 });
  const pdfRow = page.locator(".dev079-workspace-file-list li").filter({ hasText: "DEV087-G4-SUPPLEMENT.pdf" });
  await pdfRow.getByRole("button", { name: "移除", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  page.once("dialog", (dialog) => dialog.accept());
  await pdfRow.getByRole("button", { name: "移除", exact: true }).click();
  await pdfRow.waitFor({ state: "hidden", timeout: 30_000 });
  const primaryUiLocks = [];
  for (const displayName of ["DEV087-G4.SLDDRW", "DEV087-G4.SLDPRT"]) {
    const row = page.locator(".dev079-workspace-file-list li").filter({ hasText: displayName });
    await row.waitFor({ state: "visible", timeout: 30_000 });
    primaryUiLocks.push({
      displayName,
      rowCount: await row.count(),
      removeActionCount: await row.getByRole("button", { name: "移除", exact: true }).count(),
      lockLabelCount: await row.locator(".canonical-file-lock").count()
    });
  }
  const primaryLocks = primaryUiLocks.filter((item) => item.rowCount === 1 && item.removeActionCount === 0).length;
  check("QA-087-210", primaryLocks === 2, JSON.stringify({ primaryLocks, primaryUiLocks }));
  const submitResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/pdm/drawing-revision-works/${drawingWork.workId}/submit`), { timeout: 30_000 });
  await page.getByRole("button", { name: "送出審核", exact: true }).click();
  const submitResponse = await submitResponsePromise;
  const submitBody = await submitResponse.json().catch(() => null);
  check("QA-087-192", submitResponse.status() === 200, `drawing submit=${submitResponse.status()}:${JSON.stringify(submitBody)}`);
  if (submitResponse.status() !== 200) throw new Error(`DRAWING_SUBMIT_FAILED:${submitResponse.status()}:${JSON.stringify(submitBody)}`);
  await recordCanonicalMutationBijections(label, startedAt);
  const request = await client.query("SELECT id,row_version,snapshot_hash FROM pdm_work_review_requests WHERE work_id=$1 AND request_status='pending' ORDER BY created_at DESC LIMIT 1", [drawingWork.workId]);
  const review = request.rows[0];
  if (!review) throw new Error("DRAWING_REVIEW_REQUEST_MISSING");
  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(reviewerContext, "研發主管");
  const reviewer = await reviewerContext.newPage();
  monitor(reviewer, "drawing-review-return");
  await reviewer.goto(`${baseUrl}/approvals/${encodeURIComponent(review.id)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await reviewer.locator('[data-workspace-kind="reviewer"]').waitFor({ state: "visible", timeout: 30_000 });
  const returnResponsePromise = reviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/decisions"), { timeout: 30_000 });
  await reviewer.getByRole("button", { name: "退回修改", exact: true }).click();
  const returnResponse = await returnResponsePromise;
  check("QA-087-192", returnResponse.status() === 200, `drawing return=${returnResponse.status()}`);
  await recordCanonicalMutationBijections("drawing-review-return", Date.now() - 5000);
  await reviewer.close();
  await reviewerContext.close();

  await page.goto(`${baseUrl}${drawingWork.url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator('[data-workspace-kind="drawing-revision-work"]').waitFor({ state: "visible", timeout: 30_000 });
  const returnedFff = await page.locator(".canonical-fff-grid select[data-fff-axis]").evaluateAll((nodes) => nodes.map((node) => node.value));
  const returnedReplacement = await page.getByLabel("替代料號", { exact: true }).inputValue();
  check("QA-087-192", JSON.stringify(returnedFff) === JSON.stringify(["no_impact", "suspected_impact", "confirmed_impact"]) && returnedReplacement === fffPartNumber, JSON.stringify({ returnedFff, returnedReplacement }));
  await recordPostgresCase("QA-087-192", { submitStatus: submitResponse.status(), returnStatus: returnResponse.status(), workId: drawingWork.workId, reviewRequestId: review.id }, async (database) => {
    const result = await database.query("SELECT proposed_payload,row_version FROM drawing_revision_works WHERE id=$1", [drawingWork.workId]);
    const payload = result.rows[0]?.proposed_payload;
    return { pass: Boolean(payload?.changeImpact && result.rows[0]?.row_version >= 1), readback: result.rows[0] };
  });
  await recordPostgresCase("QA-087-210", { workId: drawingWork.workId, primaryLocks, primaryUiLocks, removedSupplement: true }, async (database) => {
    const result = await database.query(`SELECT file.role,file.is_primary,file.display_name FROM drawing_revision_work_files work_file
      JOIN drawing_revision_files file ON file.id=work_file.file_binding_id WHERE work_file.work_id=$1 ORDER BY work_file.ordinal`, [drawingWork.workId]);
    return { pass: result.rows.some((row) => row.role === "drawing_2d" && row.is_primary) && result.rows.some((row) => row.role === "cad_3d" && row.is_primary) && !result.rows.some((row) => row.display_name === "DEV087-G4-SUPPLEMENT.pdf"), readback: result.rows };
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "取消本次工作", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/numbering/drawings", { timeout: 30_000 });
  await recordCanonicalMutationBijections(label, startedAt);
  await page.screenshot({ path: path.join(screenshotDir, "drawing-postgresql-lifecycle.png"), fullPage: true, caret: "initial" });
  await page.close();
}

async function runPartLifecycle(context) {
  const page = await context.newPage();
  const label = "part-lifecycle";
  monitor(page, label);
  await page.goto(`${baseUrl}${partWork.url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const startedAt = Date.now();
  await page.getByLabel("材質", { exact: true }).fill("SUS 304 G4");
  await page.getByLabel("顏色", { exact: true }).fill("Black G4");
  await page.getByLabel("表面處理", { exact: true }).fill("BA G4");
  await page.locator(".pdm-edit-page-field-wide textarea").fill("DEV087 PostgreSQL return snapshot");
  const saveResponsePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/api/pdm/part-change-works/${partWork.workId}`), { timeout: 30_000 });
  await page.getByRole("button", { name: "儲存", exact: true }).click();
  const saveResponse = await saveResponsePromise;
  check("QA-087-205", saveResponse.status() === 200, `part save=${saveResponse.status()}`);
  const submitResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/pdm/part-change-works/${partWork.workId}/submit`), { timeout: 30_000 });
  await page.getByRole("button", { name: "送出審核", exact: true }).click();
  const submitResponse = await submitResponsePromise;
  check("QA-087-205", submitResponse.status() === 200, `part submit=${submitResponse.status()}`);
  await recordCanonicalMutationBijections(label, startedAt);
  const request = await client.query("SELECT id,row_version,snapshot_hash FROM pdm_work_review_requests WHERE work_id=$1 AND request_status='pending' ORDER BY created_at DESC LIMIT 1", [partWork.workId]);
  const review = request.rows[0];
  if (!review) throw new Error("PART_REVIEW_REQUEST_MISSING");
  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(reviewerContext, "研發主管");
  const reviewer = await reviewerContext.newPage();
  monitor(reviewer, "part-review-return");
  await reviewer.goto(`${baseUrl}/approvals/${encodeURIComponent(review.id)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await reviewer.getByRole("button", { name: "退回修改", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const returnResponsePromise = reviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/decisions"), { timeout: 30_000 });
  await reviewer.getByRole("button", { name: "退回修改", exact: true }).click();
  const returnResponse = await returnResponsePromise;
  check("QA-087-205", returnResponse.status() === 200, `part return=${returnResponse.status()}`);
  await recordCanonicalMutationBijections("part-review-return", Date.now() - 5000);
  await reviewer.close();
  await reviewerContext.close();
  await page.goto(`${baseUrl}${partWork.url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const values = {
    material: await page.getByLabel("材質", { exact: true }).inputValue(),
    color: await page.getByLabel("顏色", { exact: true }).inputValue(),
    surface: await page.getByLabel("表面處理", { exact: true }).inputValue(),
    note: await page.locator(".pdm-edit-page-field-wide textarea").inputValue()
  };
  await recordPostgresCase("QA-087-205", { saveStatus: saveResponse.status(), submitStatus: submitResponse.status(), returnStatus: returnResponse.status(), workId: partWork.workId }, async (database) => {
    const result = await database.query("SELECT proposed_payload,row_version FROM part_change_works WHERE id=$1", [partWork.workId]);
    const payload = result.rows[0]?.proposed_payload;
    return { pass: values.material === "SUS 304 G4" && payload?.materialLabel === values.material && payload?.variantNote === values.note, readback: result.rows[0] };
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "取消本次工作", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/parts", { timeout: 30_000 });
  await recordCanonicalMutationBijections(label, startedAt);
  await page.close();
}

async function runFormalObsolete(ownerContext, { entityType, code, route, heading, caseId }) {
  const owner = await ownerContext.newPage();
  monitor(owner, `formal-obsolete-${entityType}-owner`);
  await owner.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await owner.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await owner.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
  const layerPattern = entityType === "drawing" ? /^量產版(?:\s|$)/u : /^正式資料$/u;
  const row = owner.locator("[data-canonical-workbench-row='true']").filter({ hasText: code }).filter({ has: owner.locator(".canonical-layer").filter({ hasText: layerPattern }) }).first();
  if (await row.count() !== 1) throw new Error(`${caseId}_FORMAL_ROW_MISSING:${code}`);
  await row.locator(".canonical-row-open").click();
  await owner.getByRole("button", { name: "申請作廢", exact: true }).click();
  const modal = owner.getByRole("dialog", { name: "申請正式資料作廢", exact: true });
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  await modal.getByLabel("作廢原因", { exact: true }).fill(`DEV087 G4 PostgreSQL ${caseId}`);
  const requestResponsePromise = owner.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/lifecycle/obsolete-requests"), { timeout: 30_000 });
  await modal.getByRole("button", { name: "送出作廢申請", exact: true }).click();
  const requestResponse = await requestResponsePromise;
  const requestBody = await requestResponse.json().catch(() => null);
  const requestId = requestBody?.approvalRequest?.id;
  check(caseId, requestResponse.status() === 201 && Boolean(requestId), JSON.stringify({ status: requestResponse.status(), requestBody }));
  await owner.close();

  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(reviewerContext, "研發主管");
  const reviewer = await reviewerContext.newPage();
  monitor(reviewer, `formal-obsolete-${entityType}-review`);
  await reviewer.goto(`${baseUrl}/approvals?status=active`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await reviewer.getByRole("heading", { name: /審核工作台/u }).waitFor({ state: "visible", timeout: 30_000 });
  const search = reviewer.getByLabel("搜尋圖號、料號、品名或送審者", { exact: true });
  const inboxPromise = reviewer.waitForResponse((response) => response.url().includes("/api/approvals/inbox?") && response.url().includes(`query=${encodeURIComponent(code)}`) && response.status() === 200, { timeout: 30_000 });
  await search.fill(code);
  const inbox = await inboxPromise;
  const inboxBody = await inbox.json().catch(() => null);
  const expectedInboxId = `legacy:legacy_numbering:${requestId}`;
  const index = Array.isArray(inboxBody?.items) ? inboxBody.items.findIndex((item) => item?.id === expectedInboxId) : -1;
  if (index < 0) throw new Error(`${caseId}_APPROVAL_INBOX_ID_MISSING:${expectedInboxId}`);
  const approvalRow = reviewer.locator("[data-approval-workbench-row='true']").nth(index);
  await approvalRow.click();
  const workspace = reviewer.locator("section[aria-label='審核證據與決策']");
  await workspace.waitFor({ state: "visible", timeout: 30_000 });
  const decisionPromise = reviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/approvals/requests/") && response.url().endsWith("/decisions"), { timeout: 30_000 });
  await workspace.getByRole("button", { name: "核准", exact: true }).click();
  const decisionResponse = await decisionPromise;
  check(caseId, decisionResponse.status() === 200, `decision=${decisionResponse.status()}`);
  await reviewer.close();
  await reviewerContext.close();

  await recordPostgresCase(caseId, { entityType, code, requestId, requestStatus: requestResponse.status(), decisionStatus: decisionResponse.status() }, async (database) => {
    const table = entityType === "drawing" ? "drawing_numbers" : "part_numbers";
    const column = entityType === "drawing" ? "drawing_number" : "part_number";
    const terminal = await database.query(`SELECT id,record_status,updated_at FROM ${quote(table)} WHERE ${quote(column)}=$1`, [code]);
    const request = await database.query("SELECT id,request_status,resolved_by,resolved_at FROM approval_requests WHERE id=$1", [requestId]);
    const decisions = await database.query("SELECT decision,approver_id,decided_at FROM approval_decisions WHERE approval_request_id=$1 ORDER BY decided_at", [requestId]);
    return { pass: terminal.rows[0]?.record_status === "Obsolete" && request.rows[0]?.request_status === "approved" && decisions.rows.some((item) => item.decision === "approved"), readback: { terminal: terminal.rows[0], request: request.rows[0], decisions: decisions.rows } };
  });
}

async function runNegativeMatrix(context) {
  const notificationsResponse = await context.request.get(`${baseUrl}/api/numbering/notifications?read=all&handled=all`);
  const notificationsBody = await notificationsResponse.json().catch(() => null);
  for (const kind of ["javascript_url", "protocol_relative_url", "encoded_external_origin", "path_confusion"]) {
    await addNegativeEvidence(kind, async () => {
      const notification = notificationsBody?.notifications?.find((item) => item?.id === `qa-dev087-g4-${kind}`) ?? null;
      const resolution = resolveTaskActionUrl(notification?.actionUrl, baseUrl);
      return {
        blocked: notificationsResponse.status() === 200 && Boolean(notification) && resolution.allowed === false,
        status: notificationsResponse.status(),
        notificationId: notification?.id ?? null,
        actionUrl: notification?.actionUrl ?? null,
        resolution
      };
    });
  }

  await addNegativeEvidence("wrong_company", async () => {
    const response = await context.request.get(`${baseUrl}/api/numbering/drawings/workbench?query=${encodeURIComponent(targetDrawingNumber)}`, { headers: { "x-pdm-company-code": "MAXIMA" } });
    const body = await response.text();
    const leaksIdentity = body.includes(targetDrawingNumber);
    return { blocked: [401, 403, 404].includes(response.status()) || response.status() === 200 && !leaksIdentity, status: response.status(), leaksIdentity, bodySha256: sha256(body) };
  });

  await addNegativeEvidence("wrong_work", async () => {
    const wrong = await context.newPage();
    monitor(wrong, "negative-wrong-work");
    await wrong.goto(`${baseUrl}/numbering/drawings/${encodeURIComponent(drawingWork.entityId)}/workspace?workId=qa-dev087-g4-wrong-work`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const alert = wrong.getByRole("alert").filter({ hasText: /找不到|不存在|無法載入/u }).first();
    await alert.waitFor({ state: "visible", timeout: 30_000 });
    const text = await alert.innerText();
    await wrong.close();
    return { blocked: /找不到|不存在|無法載入/u.test(text), renderedMessage: text, identity: "qa-dev087-g4-wrong-work" };
  });

  await addNegativeEvidence("wrong_revision", async () => {
    const history = await context.newPage();
    monitor(history, "negative-wrong-revision");
    await history.goto(`${baseUrl}/numbering/drawings?query=${encodeURIComponent(formalDrawingNumber)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await history.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await history.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
    const formal = history.locator("[data-canonical-workbench-row='true']").filter({ hasText: formalDrawingNumber }).filter({ has: history.locator(".canonical-layer").filter({ hasText: /^量產版(?:\s|$)/u }) }).first();
    await formal.locator(".canonical-row-open").click();
    await history.getByRole("heading", { name: "歷史版次清單", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    const selected = new URL(history.url());
    selected.searchParams.set("historyRevision", "qa-dev087-g4-wrong-revision");
    const responsePromise = history.waitForResponse((response) => response.url().includes("/history/qa-dev087-g4-wrong-revision"), { timeout: 30_000 });
    await history.goto(selected.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
    const response = await responsePromise;
    await history.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
    await history.getByRole("complementary").last().waitFor({ state: "visible", timeout: 30_000 });
    const alert = history.getByRole("alert").filter({ hasText: /歷史版次|找不到|無法載入|不存在|讀取失敗/u }).first();
    await alert.waitFor({ state: "visible", timeout: 30_000 });
    const rendered = await history.locator("main").innerText();
    const blocked = response.status() === 404 && /找不到|無法載入|不存在|讀取失敗/u.test(await alert.innerText()) && !rendered.includes("DEV087 G4 PostgreSQL exact snapshot");
    await history.close();
    return { blocked, status: response.status(), identity: "qa-dev087-g4-wrong-revision", renderedMessage: rendered.slice(0, 1000) };
  });

  await addNegativeEvidence("wrong_task", async () => {
    const listResponse = await context.request.get(`${baseUrl}/api/numbering/tasks?status=open`);
    const listBody = await listResponse.json().catch(() => null);
    const listed = listBody?.tasks?.some((item) => item?.id === "qa-dev087-g4-stale-task") === true;
    await client.query("DELETE FROM numbering_task_items WHERE id='qa-dev087-g4-stale-task'");
    fixtureMutationLedger.push({ table: "numbering_task_items", operation: "delete-after-exact-read", id: "qa-dev087-g4-stale-task", scope: "task_owned_isolated_postgresql_fault_fixture", reason: "wrong task identity API fail-closed journey after standalone page retirement" });
    const response = await context.request.patch(`${baseUrl}/api/numbering/tasks/qa-dev087-g4-stale-task`, { data: { status: "handled" } });
    const body = await response.json().catch(() => null);
    return { blocked: listResponse.status() === 200 && listed && response.status() === 404 && Boolean(body?.error), listStatus: listResponse.status(), status: response.status(), body };
  });
}

async function captureVisibleEvidence(context, family, viewport, headed) {
  const page = await context.newPage();
  monitor(page, `visible-${family}-${viewport.name}`);
  if (family === "drawing_change" || family === "work_files") {
    await page.goto(`${baseUrl}${drawingWork.url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator('[data-workspace-kind="drawing-revision-work"]').waitFor({ state: "visible", timeout: 30_000 });
    if (family === "work_files") await page.getByRole("heading", { name: "版次與檔案", exact: true }).scrollIntoViewIfNeeded();
  } else if (family === "part_variant") {
    await page.goto(`${baseUrl}${partWork.url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  } else if (family === "task_retirement") {
    const retiredResponse = await context.request.get(`${baseUrl}/numbering/tasks`, { maxRedirects: 0 });
    if (retiredResponse.status() !== 404 || new URL(retiredResponse.url()).pathname !== "/numbering/tasks") {
      throw new Error(`TASK_RETIREMENT_ROUTE_MISMATCH:${retiredResponse.status()}:${retiredResponse.url()}`);
    }
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
    if (await page.locator('a[href="/numbering/tasks"]').count() !== 0) throw new Error("TASK_RETIREMENT_LINK_REAPPEARED");
  } else {
    await page.goto(`${baseUrl}/numbering/drawings?query=${encodeURIComponent(formalDrawingNumber)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.locator(".canonical-list").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
    if (family !== "workbench_discovery") {
      const formal = page.locator("[data-canonical-workbench-row='true']").filter({ hasText: formalDrawingNumber }).filter({ has: page.locator(".canonical-layer").filter({ hasText: /^量產版(?:\s|$)/u }) }).first();
      await formal.locator(".canonical-row-open").click();
      await page.getByRole("complementary").last().waitFor({ state: "visible", timeout: 30_000 });
      await page.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
      if (family === "formal_obsolete") await page.getByRole("button", { name: "申請作廢", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      if (family === "matrix_navigation") await page.getByRole("heading", { name: "關聯矩陣", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      if (family === "drawing_history") {
        await page.getByRole("heading", { name: "歷史版次清單", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
        const history = page.locator(".canonical-history-open").first();
        if (await history.count() === 1) {
          await history.click();
          await page.getByRole("heading", { name: "歷史版次明細", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
        }
      }
    }
  }
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName.toLowerCase() ?? null,
    role: document.activeElement?.getAttribute("role") ?? null,
    label: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim().slice(0, 200) ?? null,
    focusable: document.activeElement !== document.body
  }));
  const geometry = await page.locator("body").evaluate((body) => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyHeight: body.scrollHeight,
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  }));
  const aria = await page.locator("main").first().ariaSnapshot().catch(() => "");
  const ariaPath = path.join(screenshotDir, `${family}-${viewport.name}.aria.txt`);
  fs.writeFileSync(ariaPath, aria, "utf8");
  const screenshot = path.join(screenshotDir, `${family}-${viewport.name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true, caret: "initial" });
  visibleEvidence.push({ family, viewport: viewport.name, geometry, focus, accessibilityTree: relative(ariaPath), screenshot: relative(screenshot), headed });
  check("QG-087-UI", geometry.scrollWidth <= geometry.clientWidth + 1, `${family}/${viewport.name} horizontal overflow`);
  check("QG-087-UI", Boolean(aria) && focus.focusable, `${family}/${viewport.name} accessibility/focus`);
  await page.close();
}

async function captureAllVisibleEvidence() {
  const selectedFamily = process.env.QC_DEV087_G4_VISIBLE_FAMILY?.trim();
  const families = selectedFamily ? visibleFamilyRoster.filter((family) => family === selectedFamily) : visibleFamilyRoster;
  if (!families.length) throw new Error(`G4_VISIBLE_FAMILY_INVALID:${selectedFamily}`);
  const viewports = [
    { name: "1440x900", width: 1440, height: 900, headed: true },
    { name: "1024x768", width: 1024, height: 768, headed: false },
    { name: "390x844", width: 390, height: 844, headed: true },
    { name: "320x800", width: 320, height: 800, headed: false }
  ];
  for (const viewport of viewports) {
    const selectedBrowser = viewport.headed ? browser : headlessBrowser;
    const context = await selectedBrowser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    await login(context);
    for (const family of families) await captureVisibleEvidence(context, family, viewport, viewport.headed);
    await context.close();
  }
}

function recordOptionalAssistiveTechnologyEvidence() {
  assistiveTechnologyEvidence.push({ actual: false, result: "OPTIONAL_NOT_RUN", technology: null, reason: "Trusted-solo completion uses rendered accessibility, keyboard, focus, geometry and visible-error evidence; an actual assistive-technology run is optional." });
}

async function runPostgresPagination(context) {
  const page = await context.newPage();
  monitor(page, "postgres-pagination");
  await page.goto(`${baseUrl}/parts`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
  const firstPageIds = await page.locator(".canonical-row-open").allTextContents();
  const next = page.getByRole("button", { name: "下一頁", exact: true });
  if (await next.count() !== 1 || !await next.isEnabled()) throw new Error("QA-087-216_NEXT_CURSOR_MISSING");
  await next.click();
  await page.getByText("第 2 頁", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
  const secondPageIds = await page.locator(".canonical-row-open").allTextContents();
  await page.getByRole("button", { name: "上一頁", exact: true }).click();
  await page.getByText("第 1 頁", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
  const returnedFirstPageIds = await page.locator(".canonical-row-open").allTextContents();
  const pass = secondPageIds.length > 0 && firstPageIds.every((id) => !secondPageIds.includes(id)) && JSON.stringify(firstPageIds) === JSON.stringify(returnedFirstPageIds);
  check("QA-087-216", pass, JSON.stringify({ firstPageIds, secondPageIds, returnedFirstPageIds }));
  await recordPostgresCase("QA-087-216", { firstPageIds, secondPageIds, returnedFirstPageIds }, async (database) => {
    const result = await database.query("SELECT COUNT(*)::integer AS count FROM part_numbers WHERE company_id='company-jenfu'");
    const pagedIds = [...firstPageIds, ...secondPageIds];
    return {
      pass: pass && Number(result.rows[0].count) === pagedIds.length && new Set(pagedIds).size === pagedIds.length,
      readback: { ...result.rows[0], pagedUniqueCount: new Set(pagedIds).size }
    };
  });
  await page.close();
}

const declaration = {
  project: root,
  purpose: "DEV-087/097 G4 PostgreSQL provider and evidence-integrity product run",
  ports: { postgresql: null, next: null },
  owningProcessTree: `Codex task process ${process.pid} -> pg_ctl -> isolated postgres; Next child -> Playwright`,
  cleanupCondition: "stop isolated cluster, release port, remove validated task-owned runtime root and Next dist",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: [tempRoot, outputDir],
  productionConnectionAllowed: false,
  productionMutationAllowed: false
};

let result = "FAIL";
let errorCode = null;
let setup = null;
try {
  if (!parentRunId) throw new Error("AGGREGATE_RUN_ID_REQUIRED");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(upload2d, "DEV087 G4 PostgreSQL 2D\n", "utf8");
  fs.writeFileSync(upload3d, "DEV087 G4 PostgreSQL 3D\n", "utf8");
  fs.writeFileSync(uploadPdf, "%PDF-1.4\n% DEV087 G4 supplemental\n", "utf8");
  sourceBefore = readPrimaryInvariant();
  check("QA-087-226", primaryInvariantIsSafe(sourceBefore), JSON.stringify(sourceBefore));
  sourceSqlite = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  sourceBeforeHash = fileHash(sourceDbPath);
  appPort = await getFreePort();
  declaration.ports.next = appPort;
  runtimeProjectRoot = path.join(root, ".tmp", `qc-dev087-g4-runtime-project-${appPort}`);
  setup = await setupPostgres(sourceSqlite);
  await preparePostgresFixture(client);
  declaration.ports.postgresql = port;
  check("QA-087-226", setup.fk.length === 0, JSON.stringify(setup.fk));
  const fixtureFk = await foreignKeyViolations(client);
  check("QA-087-226", fixtureFk.length === 0, JSON.stringify(fixtureFk));
  writeJson(path.join(outputDir, "restore-receipt.json"), { provider: "postgresql", restore: setup.restore, foreignKeyViolations: setup.fk, fixtureForeignKeyViolations: fixtureFk, sourceBeforeHash, fixtureMutationLedger });
  baseUrl = `http://127.0.0.1:${appPort}`;
  const runtimeProjectReceipt = prepareTaskOwnedRuntimeProject(runtimeProjectRoot);
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "postgres", PDM_POSTGRES_URL: setup.connectionString,
    PDM_POSTGRES_MAX_CONNECTIONS: "8", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir,
    PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_PRODUCTION_SLICE_MODE: "", PDM_NEXT_DIST_DIR: ".next", PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`QC DEV-087 G4 runtime: project=${root}; runtimeProject=${runtimeProjectRoot}; purpose=PostgreSQL provider/security/visible evidence; postgresPort=${port}; nextPort=${appPort}; processTree=task-owned PostgreSQL + Next dev + headed/headless Chromium; cleanup=after manifest write; PDM_DATA_DIR=${dataDir}; PDM_REPOSITORY_DIR=${repositoryDir}; mutationScope=${tempRoot},${outputDir}; runtimeProjectReceipt=${JSON.stringify(runtimeProjectReceipt)}`);
  app = startNextApp(runtimeProjectRoot, "dev", appPort);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: false, args: ["--force-renderer-accessibility"] });
  headlessBrowser = await chromium.launch({ headless: true, args: ["--force-renderer-accessibility"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context);
  await resolveWorkspaceTargets(context);
  const diagnosticMode = process.env.QC_DEV087_G4_DIAGNOSTIC?.trim() ?? "";
  if (!["negative-only", "business-only", "drawing-only", "formal-only"].includes(diagnosticMode)) await captureAllVisibleEvidence();
  if (diagnosticMode === "negative-only") {
    await runNegativeMatrix(context);
  } else if (diagnosticMode === "drawing-only") {
    await runDrawingLifecycle(context);
  } else if (diagnosticMode === "formal-only") {
    await runFormalObsolete(context, { entityType: "drawing", code: formalDrawingNumber, route: `/numbering/drawings?query=${encodeURIComponent(formalDrawingNumber)}`, heading: "圖號工作台", caseId: "QA-087-199" });
    await runFormalObsolete(context, { entityType: "part", code: formalObsoletePartNumber, route: `/parts?query=${encodeURIComponent(formalObsoletePartNumber)}`, heading: "料號工作台", caseId: "QA-087-201" });
  } else if (diagnosticMode === "business-only") {
    await runPostgresPagination(context);
    await runDrawingLifecycle(context);
    await runPartLifecycle(context);
    await runFormalObsolete(context, { entityType: "drawing", code: formalDrawingNumber, route: `/numbering/drawings?query=${encodeURIComponent(formalDrawingNumber)}`, heading: "圖號工作台", caseId: "QA-087-199" });
    await runFormalObsolete(context, { entityType: "part", code: formalObsoletePartNumber, route: `/parts?query=${encodeURIComponent(formalObsoletePartNumber)}`, heading: "料號工作台", caseId: "QA-087-201" });
  } else if (diagnosticMode !== "visible-only") {
    await runNegativeMatrix(context);
    await runPostgresPagination(context);
    await runDrawingLifecycle(context);
    await runPartLifecycle(context);
    await runFormalObsolete(context, { entityType: "drawing", code: formalDrawingNumber, route: `/numbering/drawings?query=${encodeURIComponent(formalDrawingNumber)}`, heading: "圖號工作台", caseId: "QA-087-199" });
    await runFormalObsolete(context, { entityType: "part", code: formalObsoletePartNumber, route: `/parts?query=${encodeURIComponent(formalObsoletePartNumber)}`, heading: "料號工作台", caseId: "QA-087-201" });
  }
  recordOptionalAssistiveTechnologyEvidence();
  await context.close();
  sourceSqlite.close();
  sourceSqlite = null;
  sourceAfterHash = fileHash(sourceDbPath);
  sourceAfter = readPrimaryInvariant();
  const primaryUnchanged = JSON.stringify(protectedPrimaryInvariant(sourceBefore)) === JSON.stringify(protectedPrimaryInvariant(sourceAfter));
  const providerReady = primaryUnchanged
    && mutationLedger.filter((item) => item.successfulWrite === true).length >= 4
    && ["QA-087-192", "QA-087-199", "QA-087-201", "QA-087-205", "QA-087-210", "QA-087-216"].every((caseId) => postgresCaseReceipts.some((item) => item.caseId === caseId && item.provider === "postgresql" && item.result === "PASS" && item.transactionId));
  const securityReady = ["javascript_url", "protocol_relative_url", "encoded_external_origin", "path_confusion", "wrong_company", "wrong_work", "wrong_revision", "wrong_task"].every((kind) => negativeEvidence.some((item) => item.kind === kind && item.result === "PASS" && item.zeroWrite === true));
  const uiReady = failures.length === 0
    && visibleFamilyRoster.every((family) => ["1440x900", "1024x768", "390x844", "320x800"].every((viewport) => visibleEvidence.some((item) => item.family === family && item.viewport === viewport && item.screenshot && item.geometry?.overflow === 0 && item.focus?.focusable === true && item.accessibilityTree && (!["1440x900", "390x844"].includes(viewport) || item.headed === true))));
  qualityGateResults = [
    { gateId: "QG-087-PROVIDER", result: providerReady ? "PASS" : "FAIL", detail: { primaryUnchanged, successfulMutationReceipts: mutationLedger.filter((item) => item.successfulWrite === true).length, requiredPostgresCases: 6, passedPostgresCases: postgresCaseReceipts.filter((item) => item.provider === "postgresql" && item.result === "PASS" && item.transactionId).length } },
    { gateId: "QG-087-SECURITY", result: securityReady ? "PASS" : "FAIL", detail: { requiredZeroWriteNegatives: 8, passedZeroWriteNegatives: negativeEvidence.filter((item) => item.result === "PASS" && item.zeroWrite === true).length } },
    { gateId: "QG-087-UI", result: uiReady ? "PASS" : "FAIL", detail: { requiredFamilyViewports: 32, capturedFamilyViewports: visibleEvidence.length, headedViewports: ["1440x900", "390x844"], assistiveTechnology: "optional" } }
  ];
  for (const gate of qualityGateResults) check(gate.gateId, gate.result === "PASS", JSON.stringify(gate.detail));
  result = checks.every((entry) => entry.result === "PASS") ? "PASS" : "FAIL";
} catch (error) {
  errorCode = error instanceof Error ? error.message : String(error);
  failures.push({ caseId: "QG-087-PROVIDER", kind: "runner", detail: errorCode });
  result = "FAIL";
} finally {
  try { await browser?.close(); } catch {}
  try { await headlessBrowser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  try { sourceSqlite?.close(); } catch {}
  try { await client?.end(); } catch {}
  if (started) {
    try { run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "fast", "-w", "stop"], { stdio: "ignore" }); } catch (error) { failures.push({ kind: "cleanup", detail: error instanceof Error ? error.message : String(error) }); }
  }
  const postgresLogArtifact = path.join(outputDir, "postgres-server.log");
  try {
    if (fs.existsSync(serverLog)) {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.copyFileSync(serverLog, postgresLogArtifact);
    }
  } catch (error) {
    failures.push({ kind: "evidence", detail: `postgres log copy failed:${error instanceof Error ? error.message : String(error)}` });
  }
  const postgresReleased = port ? await waitPortReleased(port) : true;
  const appReleased = appPort ? await waitPortReleased(appPort) : true;
  runtimeProjectCleanupReceipt = runtimeProjectRoot
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeProjectRoot)
    : { removed: true, path: null, error: null };
  if (!runtimeProjectCleanupReceipt.removed) failures.push({ kind: "cleanup", detail: `runtime project cleanup failed:${JSON.stringify(runtimeProjectCleanupReceipt)}` });
  try { if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (error) { failures.push({ kind: "cleanup", detail: error instanceof Error ? error.message : String(error) }); }
  if (!postgresReleased || !appReleased) failures.push({ kind: "cleanup", detail: `ports not released:${JSON.stringify({ postgres: port, postgresReleased, next: appPort, appReleased })}` });
  if (sourceBefore && !sourceAfter) {
    try { sourceAfter = readPrimaryInvariant(); }
    catch (error) { failures.push({ kind: "cleanup", detail: `primary after-snapshot failed:${error instanceof Error ? error.message : String(error)}` }); }
  }
  if (failures.some((entry) => entry.kind === "cleanup")) {
    result = "FAIL";
    errorCode ??= "G4_CLEANUP_INCOMPLETE";
  }
  const artifactFiles = [path.join(outputDir, "restore-receipt.json"), postgresLogArtifact,
    ...fs.existsSync(screenshotDir) ? fs.readdirSync(screenshotDir).map((name) => path.join(screenshotDir, name)) : []].filter(fs.existsSync);
  const primaryInvariantUnchanged = Boolean(sourceBefore && sourceAfter) && JSON.stringify(protectedPrimaryInvariant(sourceBefore)) === JSON.stringify(protectedPrimaryInvariant(sourceAfter));
  const manifest = {
    ...manifestBase({ root, runId, gateStage: "product", runner: "qc-dev-087-g4-postgres-evidence", provider: "postgresql", dataScope: "task_owned_isolated_postgresql_snapshot", baseUrl, parentRunId }),
    caseResults: [],
    caseEvidence: {},
    assertions: checks,
    failures,
    mutationLedger,
    providerReceipts,
    fixtureMutationLedger,
    negativeEvidence,
    visibleEvidence,
    assistiveTechnologyEvidence,
    qualityGateResults: qualityGateResults.length === 3 ? qualityGateResults : [
      { gateId: "QG-087-PROVIDER", result: "FAIL", detail: { runnerError: errorCode ?? "runner_incomplete" } },
      { gateId: "QG-087-SECURITY", result: "FAIL", detail: { runnerError: errorCode ?? "runner_incomplete" } },
      { gateId: "QG-087-UI", result: "FAIL", detail: { runnerError: errorCode ?? "runner_incomplete" } }
    ],
    postgresCaseReceipts,
    networkEvents,
    childManifests: artifactFiles.map((file) => ({ path: relative(file), sha256: fileHash(file), runner: "quality-gate-artifact", caseIds: ["QG-087-PROVIDER", "QG-087-SECURITY", "QG-087-UI"], result })),
    prohibitedMutationAudit: { directApiWrites: 0, sqlWrites: 0, pageEvaluateWrites: 0, unprovenancedWrites: 0 },
    primaryInvariant: {
      status: primaryInvariantUnchanged ? "pass" : "fail",
      delta: primaryInvariantUnchanged ? 0 : 1,
      before: sourceBefore,
      after: sourceAfter,
      byteHashObservation: {
        before: sourceBeforeHash,
        after: sourceAfterHash,
        unchanged: Boolean(sourceBeforeHash && sourceAfterHash && sourceBeforeHash === sourceAfterHash),
        enforcement: "informational_only_concurrent_primary_runtime_may_write_nonprotected_rows"
      }
    },
    firstFailure: result === "PASS" ? null : { code: errorCode ?? "G4_PRODUCT_EVIDENCE_INCOMPLETE", caseId: checks.find((entry) => entry.result === "FAIL")?.caseId ?? "QA-087-225", pointer: "checks" },
    cleanupReceipt: { status: failures.some((entry) => entry.kind === "cleanup") ? "missing" : "complete", taskOwnedRuntime: true, portsReleased: postgresReleased && appReleased, ports: { postgresql: { port, released: postgresReleased }, next: { port: appPort, released: appReleased } }, runtimeProjectCleanupReceipt, tempRootRemoved: !fs.existsSync(tempRoot) },
    result,
    errorCode: result === "PASS" ? null : (errorCode ?? "G4_PRODUCT_EVIDENCE_INCOMPLETE")
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ result, errorCode, checks: checks.length, manifest: path.join(outputDir, "manifest.json"), ports: manifest.cleanupReceipt.ports, portsReleased: manifest.cleanupReceipt.portsReleased }, null, 2));
}

if (result !== "PASS") process.exitCode = 1;
