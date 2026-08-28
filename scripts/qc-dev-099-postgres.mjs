#!/usr/bin/env node

/* DEV-099 disposable PostgreSQL provider-parity evidence.
 * The source fixture and PostgreSQL cluster are task-owned and removed in the
 * finally block. No primary data or long-lived service is touched.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import pg from "pg";
import { getFreePort } from "./qc-next-app-runner.mjs";
import { seedDev099Fixture, fixture } from "./dev099-qc-fixture.mjs";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { createPlatformActorContext } from "../src/lib/platform-command.ts";
import { getPartStructureClassificationAsync, classifyPartStructureAsync } from "../src/lib/part-structure-classification.ts";

const root = process.cwd();
const runId = `DEV099-postgres-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV099_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-099", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev099-postgres-"));
const sourceDataDir = path.join(taskRoot, "source-data");
const sourceRepositoryDir = path.join(taskRoot, "source-repository");
const clusterDir = path.join(taskRoot, "cluster");
const postgresLog = path.join(taskRoot, "postgres.log");
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const dbName = `dev099_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
const dsnFor = (port) => `postgresql://postgres@127.0.0.1:${port}/${dbName}`;
const checks = [];
let sourceDb;
let client;
let poolClient;
let dbClient;
let pgPort = null;
let started = false;
let firstFailure = null;

function check(id, label, fn) {
  try {
    const detail = fn();
    checks.push({ id, label, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ id, label, status: "FAIL", message });
    console.error(`FAIL ${id} ${message}`);
    throw error;
  }
}

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

async function columnsFor(table) {
  const result = await poolClient.query(`SELECT column_name,data_type,is_generated,is_identity
    FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return new Map(result.rows.filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO").map((row) => [row.column_name, row]));
}

async function restoreSqliteSnapshot() {
  const pgTables = (await poolClient.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename);
  const sourceTables = new Set(sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
  await poolClient.query("SET session_replication_role=replica");
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
      await poolClient.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`, values);
      copiedRows += 1;
    }
  }
  await poolClient.query("SET session_replication_role=origin");
  return copiedRows;
}

async function fkViolations() {
  const constraints = await poolClient.query(`SELECT con.conname,child.relname AS child_table,parent.relname AS parent_table,
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
    const result = await poolClient.query(`SELECT COUNT(*)::integer AS count FROM ${quote(constraint.child_table)} child WHERE ${nonNull} AND NOT EXISTS (SELECT 1 FROM ${quote(constraint.parent_table)} parent WHERE ${join})`);
    if (Number(result.rows[0].count) > 0) violations.push({ ...constraint, count: Number(result.rows[0].count) });
  }
  return violations;
}

async function main() {
  fs.mkdirSync(sourceDataDir, { recursive: true });
  fs.mkdirSync(sourceRepositoryDir, { recursive: true });
  process.env.PDM_DATA_DIR = sourceDataDir;
  process.env.PDM_REPOSITORY_DIR = sourceRepositoryDir;
  process.env.PDM_DB_PROVIDER = "sqlite";
  const sourcePath = path.join(sourceDataDir, "ai-pdm.sqlite");
  sourceDb = new Database(sourcePath);
  sourceDb.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  sourceDb.close();
  seedDev099Fixture();
  sourceDb = new Database(sourcePath, { readonly: true });

  pgPort = await getFreePort();
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-099 provider parity classification and conflict evidence", port: pgPort, owningProcessTree: "this runner -> task-owned PostgreSQL cluster", cleanupCondition: "cluster stopped, connection closed, task temp removed", PDM_DATA_DIR: sourceDataDir, PDM_REPOSITORY_DIR: sourceRepositoryDir, mutationScope: taskRoot } }));
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", postgresLog, "-o", `-p ${pgPort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "postgres", dbName]);
  client = new pg.Client({ connectionString: dsnFor(pgPort), application_name: "ai-pdm-dev099-postgres" });
  await client.connect();
  poolClient = client;
  for (const file of ["001_initial_schema.sql", "039_allow_recycled_candidate_drawing_codes.sql", "042_status_data_rebuild.sql", "043_inline_relation_matrix.sql", "048_shared_assembly_bom.sql", "049_solidworks_credential_ui_activation.sql"]) {
    await client.query(fs.readFileSync(path.join(root, "db", "postgres", file), "utf8"));
  }
  await client.query("UPDATE pdm_workbench_state_authority_control SET expected_commit='local-dev', schema_hash='dev090-v1' WHERE id=1");
  const copiedRows = await restoreSqliteSnapshot();
  const initialFk = await fkViolations();
  check("QA-099-043", "PostgreSQL restored fixture has no foreign-key violations", () => { assert.equal(initialFk.length, 0); return { copiedRows }; });

  dbClient = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsnFor(pgPort), maxConnections: 4 });
  const actor = createPlatformActorContext({ pdmUserId: fixture.users.engineer, organizationId: fixture.companyId, roles: ["Engineer"], scopes: ["numbering.workspace.update"], requestId: "dev099-postgres-request", correlationId: "dev099-postgres-correlation" });
  const metadata = (idempotencyKey) => ({ actor, idempotencyKey });
  const view = await getPartStructureClassificationAsync({ client: dbClient, companyId: fixture.companyId, partNumberId: fixture.classificationParts[0], canMutate: true });
  check("QA-099-017", "PostgreSQL GET returns bounded candidates and strong ETag", () => { assert.ok(view); assert.equal(view.candidates.length, 4); assert.match(view.etag, /^"[a-f0-9]{64}"$/u); return { candidates: view.candidates.length, etag: view.etag }; });
  const changed = await classifyPartStructureAsync({ client: dbClient, companyId: fixture.companyId, actorId: fixture.users.engineer, metadata: metadata("dev099-pg-classify-001"), partNumberId: fixture.classificationParts[0], targetPartNumberIds: fixture.classificationParts.slice(0, 3), structureType: "assembly", reason: "DEV-099 PostgreSQL provider parity", ifMatch: view.etag });
  check("QA-099-020", "PostgreSQL classification commits exact batch with receipt", () => { assert.deepEqual(changed.result.updatedPartIds, fixture.classificationParts.slice(0, 3)); return changed.result; });
  const replay = await classifyPartStructureAsync({ client: dbClient, companyId: fixture.companyId, actorId: fixture.users.engineer, metadata: metadata("dev099-pg-classify-001"), partNumberId: fixture.classificationParts[0], targetPartNumberIds: fixture.classificationParts.slice(0, 3), structureType: "assembly", reason: "DEV-099 PostgreSQL provider parity", ifMatch: view.etag });
  check("QA-099-021", "PostgreSQL idempotency replay does not enqueue an external event", async () => { assert.equal(replay.reusedFromCommandReceipt, true); const outbox = await client.query("SELECT COUNT(*)::integer AS count FROM platform_outbox_events WHERE idempotency_key LIKE 'dev099-pg-%'"); assert.equal(Number(outbox.rows[0].count), 0); return { reused: true, outbox: Number(outbox.rows[0].count) }; });

  const staleView = await getPartStructureClassificationAsync({ client: dbClient, companyId: fixture.companyId, partNumberId: fixture.classificationParts[0], canMutate: true });
  await client.query("UPDATE part_numbers SET updated_at=TIMESTAMPTZ '2099-01-01 00:00:00+00' WHERE id=$1", [fixture.classificationParts[0]]);
  const changedView = await getPartStructureClassificationAsync({ client: dbClient, companyId: fixture.companyId, partNumberId: fixture.classificationParts[0], canMutate: true });
  let staleCode = "";
  try {
    await classifyPartStructureAsync({ client: dbClient, companyId: fixture.companyId, actorId: fixture.users.engineer, metadata: metadata("dev099-pg-stale-001"), partNumberId: fixture.classificationParts[0], targetPartNumberIds: [fixture.classificationParts[0]], structureType: "single_part", reason: "stale", ifMatch: staleView.etag });
  } catch (error) { staleCode = error instanceof Error ? error.message : String(error); }
  check("QA-099-026", "PostgreSQL stale ETag rejects before mutation", () => { assert.notEqual(changedView?.etag, staleView?.etag); assert.match(staleCode, /PART_STRUCTURE_STALE_ETAG/); return { staleCode, old: staleView?.etag, fresh: changedView?.etag }; });

  const bomView = await getPartStructureClassificationAsync({ client: dbClient, companyId: fixture.companyId, partNumberId: fixture.conflictBindingPartId, canMutate: true });
  let bomCode = "";
  try {
    await classifyPartStructureAsync({ client: dbClient, companyId: fixture.companyId, actorId: fixture.users.engineer, metadata: metadata("dev099-pg-bom-001"), partNumberId: fixture.conflictBindingPartId, targetPartNumberIds: [fixture.conflictBindingPartId], structureType: "single_part", reason: "BOM conflict", ifMatch: bomView.etag });
  } catch (error) { bomCode = error instanceof Error ? error.message : String(error); }
  check("QA-099-028", "PostgreSQL BOM binding blocks single-part downgrade", () => { assert.match(bomCode, /PART_STRUCTURE_BOM_CONFLICT/); return bomCode; });
  await dbClient.close();
  dbClient = null;
  const finalFk = await fkViolations();
  check("QA-099-047", "PostgreSQL final foreign-key check remains clean", () => { assert.equal(finalFk.length, 0); return { violations: finalFk.length }; });
  await client.end();
  client = null;
}

try { await main(); } catch (error) { firstFailure = error instanceof Error ? error.stack ?? error.message : String(error); }
finally {
  if (sourceDb) sourceDb.close();
  if (dbClient) await dbClient.close().catch(() => undefined);
  if (client) await client.end().catch(() => undefined);
  if (started) spawnSync(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "fast", "-w", "stop"], { cwd: root, encoding: "utf8", windowsHide: true, stdio: "ignore" });
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); } catch { /* evidence records cleanup scope */ }
}

const result = { runner: "postgres", provider: "postgres", status: !firstFailure && checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL", runId, productionWrites: false, runtime: { project: root, port: pgPort, taskRoot, cleanupCondition: "task-owned PostgreSQL cluster stopped and temp removed" }, checks, firstFailure };
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "postgres.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((item) => item.status === "PASS").length, total: checks.length }));
if (result.status !== "PASS") process.exitCode = 1;
