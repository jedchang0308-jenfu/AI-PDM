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

import { ensureProductionSmokeTenantIsolationSchema } from "../src/lib/db.ts";
import { dev116RunId, runCase, writeProducerManifest } from "./dev-116-evidence-utils.mjs";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = dev116RunId();
const cases = [];
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev116-migration-"));
const pgBin = path.resolve(
  process.env.PDM_POSTGRES_BIN?.trim()
    || process.env.PGBIN?.trim()
    || "C:\\Program Files\\PostgreSQL\\18\\bin"
);
const clusterDir = path.join(taskRoot, "cluster");
const serverLog = path.join(taskRoot, "postgres.log");
const migrationSql = fs.readFileSync(path.join(root, "db", "postgres", "063_production_smoke_tenant_isolation.sql"), "utf8");
const initialSql = fs.readFileSync(path.join(root, "db", "postgres", "001_initial_schema.sql"), "utf8");
let pgPort = null;
let pgStarted = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}

function immutableAuditHash(database) {
  const rows = database.prepare("SELECT id, submission_id, actor_id, action, detail_json, created_at FROM audit_logs ORDER BY id").all();
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function legacySqlite() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE companies (id TEXT PRIMARY KEY, company_code TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id));
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, submission_id TEXT, actor_id TEXT, action TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL
    );
    CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_APPEND_ONLY'); END;
    CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_APPEND_ONLY'); END;
    CREATE TABLE numbering_sequences (sequence_key TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), next_value INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE pdm_local_data_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')), detail_json TEXT NOT NULL DEFAULT '{}');
    INSERT INTO companies VALUES ('company-jenfu', 'JENFU', '鉦富');
    INSERT INTO companies VALUES ('company-maxima', 'MAXIMA', '久方');
  `);
  return database;
}

function sqliteColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function minimalPostgres(schema) {
  const q = `"${schema.replaceAll('"', '""')}"`;
  return `
    CREATE SCHEMA IF NOT EXISTS ${q};
    CREATE TABLE ${q}.companies (id text PRIMARY KEY, company_code text NOT NULL UNIQUE, display_name text NOT NULL);
    CREATE TABLE ${q}.submissions (id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q}.companies(id));
    CREATE TABLE ${q}.audit_logs (id text PRIMARY KEY, submission_id text, actor_id text, action text NOT NULL, detail_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY (submission_id) REFERENCES ${q}.submissions(id) ON DELETE SET NULL);
    CREATE TABLE ${q}.numbering_sequences (sequence_key text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q}.companies(id), next_value integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
  `;
}

async function withDatabase(name, callback) {
  const admin = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${pgPort}/postgres` });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  const client = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${pgPort}/${name}` });
  await client.connect();
  try { return await callback(client); } finally { await client.end(); }
}

async function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

try {
  pgPort = await getFreePort();
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-116 SQLite and disposable PostgreSQL migration parity/fault evidence",
    port: pgPort,
    owningProcessTree: `runner ${process.pid} -> task-owned pg_ctl/PostgreSQL`,
    cleanupCondition: "clients close, exact cluster stops, port closes, task root removed",
    PDM_DATA_DIR: path.join(taskRoot, "data"),
    PDM_REPOSITORY_DIR: path.join(taskRoot, "repository"),
    mutationScope: taskRoot
  } }));
  for (const executable of ["initdb.exe", "pg_ctl.exe"]) {
    assert.ok(fs.existsSync(path.join(pgBin, executable)), `PostgreSQL binary required: ${executable}`);
  }
  run(path.join(pgBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale", "--no-sync"]);
  run(path.join(pgBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", serverLog, "-o", `-p ${pgPort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  pgStarted = true;

  await runCase(cases, "QA-116-004", "fresh SQLite and both PostgreSQL placement lanes agree", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
    ensureProductionSmokeTenantIsolationSchema(sqlite);
    assert.ok(sqliteColumns(sqlite, "companies").includes("company_kind"));
    assert.ok(sqliteColumns(sqlite, "audit_logs").includes("scope_kind"));
    assert.equal(sqlite.prepare("PRAGMA foreign_key_check").all().length, 0);
    sqlite.close();

    const publicResult = await withDatabase(`dev116_fresh_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`, async (client) => {
      await client.query(initialSql);
      await client.query(migrationSql);
      return client.query("SELECT company_kind FROM public.companies LIMIT 1");
    });
    assert.ok(publicResult.fields.some((field) => field.name === "company_kind"));
    await withDatabase(`dev116_core_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`, async (client) => {
      await client.query(minimalPostgres("ai_pdm_core"));
      await client.query(migrationSql);
      const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='ai_pdm_core' AND table_name='audit_logs'");
      assert.ok(columns.rows.some((row) => row.column_name === "scope_kind"));
    });
    return { sqlite: "fresh-pass", postgresLanes: ["public", "ai_pdm_core"] };
  });

  await runCase(cases, "QA-116-005", "existing audit backfill is deterministic and immutable", () => {
    const database = legacySqlite();
    database.exec(`
      INSERT INTO submissions VALUES ('submission-j', 'company-jenfu');
      INSERT INTO audit_logs VALUES ('audit-submission', 'submission-j', 'actor', 'submission.created', '{"x":1}', '2026-01-01T00:00:00.000Z');
      INSERT INTO audit_logs VALUES ('audit-detail', NULL, 'actor', 'numbering.create', '{"companyId":"company-maxima","rootCode":"A0001"}', '2026-01-02T00:00:00.000Z');
      INSERT INTO audit_logs VALUES ('audit-unknown', NULL, 'actor', 'numbering.legacy', '{"rootCode":"A0002"}', '2026-01-03T00:00:00.000Z');
    `);
    const before = immutableAuditHash(database);
    ensureProductionSmokeTenantIsolationSchema(database);
    const after = immutableAuditHash(database);
    assert.equal(after, before);
    assert.deepEqual(database.prepare("SELECT id, company_id, scope_kind FROM audit_logs ORDER BY id").all(), [
      { id: "audit-detail", company_id: "company-maxima", scope_kind: "tenant" },
      { id: "audit-submission", company_id: "company-jenfu", scope_kind: "tenant" },
      { id: "audit-unknown", company_id: null, scope_kind: "legacy_unscoped" }
    ]);
    assert.throws(() => database.prepare("UPDATE audit_logs SET action='changed' WHERE id='audit-detail'").run(), /AUDIT_LOG_APPEND_ONLY/u);
    database.close();
    return { immutableHash: before, unknownPolicy: "legacy_unscoped" };
  });

  await runCase(cases, "QA-116-006", "legacy sequence mismatch fails without repair", async () => {
    const database = legacySqlite();
    database.prepare("INSERT INTO numbering_sequences VALUES (?, ?, 1, ?)").run("legacy-root", "company-jenfu", new Date().toISOString());
    assert.throws(() => ensureProductionSmokeTenantIsolationSchema(database), /DEV116_SEQUENCE_SCOPE_MISMATCH/u);
    assert.equal(sqliteColumns(database, "companies").includes("company_kind"), false);
    database.close();
    await withDatabase(`dev116_badseq_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`, async (client) => {
      await client.query(minimalPostgres("public"));
      await client.query("INSERT INTO public.companies VALUES ('company-jenfu','JENFU','鉦富')");
      await client.query("INSERT INTO public.numbering_sequences VALUES ('legacy-root','company-jenfu',1,now())");
      await assert.rejects(client.query(migrationSql), /DEV116_SEQUENCE_SCOPE_MISMATCH/u);
      await client.query("ROLLBACK");
      const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='companies' AND column_name='company_kind'");
      assert.equal(columns.rowCount, 0);
    });
    return { sqliteRollback: true, postgresRollback: true, repairAttempted: false };
  });

  await runCase(cases, "QA-116-007", "injected migration failures roll back and rerun cleanly", async () => {
    const database = legacySqlite();
    database.prepare("INSERT INTO audit_logs VALUES (?,NULL,NULL,?,?,?)").run(
      "audit-conflict",
      "numbering.create",
      JSON.stringify({ companyId: "company-jenfu", company_id: "company-maxima" }),
      new Date().toISOString()
    );
    assert.throws(() => ensureProductionSmokeTenantIsolationSchema(database), /DEV116_AUDIT_COMPANY_CONFLICT/u);
    assert.equal(sqliteColumns(database, "audit_logs").includes("scope_kind"), false);
    database.exec("DROP TRIGGER trg_audit_logs_no_update");
    database.prepare("UPDATE audit_logs SET detail_json=? WHERE id='audit-conflict'").run(JSON.stringify({ companyId: "company-jenfu" }));
    database.exec("CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_APPEND_ONLY'); END;");
    ensureProductionSmokeTenantIsolationSchema(database);
    ensureProductionSmokeTenantIsolationSchema(database);
    database.close();

    await withDatabase(`dev116_fault_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`, async (client) => {
      await client.query(minimalPostgres("public"));
      const injected = migrationSql.replace(/\nCOMMIT;\s*$/u, "\nSELECT 1 / 0;\nCOMMIT;\n");
      await assert.rejects(client.query(injected), /division by zero/u);
      await client.query("ROLLBACK");
      const before = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='scope_kind'");
      assert.equal(before.rowCount, 0);
      await client.query(migrationSql);
      await client.query(migrationSql);
      const after = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='scope_kind'");
      assert.equal(after.rowCount, 1);
    });
    return { sqliteRerun: "no-op", postgresRerun: "no-op", partialState: 0 };
  });
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  for (const id of ["QA-116-004", "QA-116-005", "QA-116-006", "QA-116-007"]) {
    if (!cases.some((item) => item.id === id)) cases.push({ id, title: "migration runner setup", status: "BLOCKED", message });
  }
} finally {
  if (pgStarted) {
    try { run(path.join(pgBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* manifest reports port state */ }
  }
  const portReleased = pgPort === null ? true : !(await portOpen(pgPort));
  const resolvedTaskRoot = path.resolve(taskRoot);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (resolvedTaskRoot.startsWith(`${resolvedTemp}${path.sep}`)) fs.rmSync(resolvedTaskRoot, { recursive: true, force: true });
  const { manifest, target } = writeProducerManifest({
    runId,
    producer: "migration",
    cases,
    detail: { portReleased, taskRootRemoved: !fs.existsSync(resolvedTaskRoot), postgresPort: pgPort }
  });
  console.log(JSON.stringify({ evidence: target, status: manifest.status, cases: cases.length, portReleased }));
  if (manifest.status !== "PASS" || !portReleased) process.exitCode = 1;
}
