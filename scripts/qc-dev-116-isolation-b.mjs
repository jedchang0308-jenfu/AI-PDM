#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import pg from "pg";

import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { createPdmCommand, createPlatformActorContext } from "../src/lib/platform-command.ts";
import { executePdmCommandWithOutbox } from "../src/lib/platform-command-service.ts";
import {
  AsyncNumberingRepository,
  SELECT_ASYNC_ADMIN_ACCESS_AUDIT_EVENTS_SQL
} from "../src/lib/repositories/numbering-async-repository.ts";
import { dev116RunId, runCase, writeProducerManifest } from "./dev-116-evidence-utils.mjs";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = dev116RunId();
const cases = [];
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev116-b-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const clusterDir = path.join(taskRoot, "cluster");
const serverLog = path.join(taskRoot, "postgres.log");
const pgBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const initialSql = fs.readFileSync(path.join(root, "db", "postgres", "001_initial_schema.sql"), "utf8");
const canonicalWorkbenchSql = fs.readFileSync(path.join(root, "db", "postgres", "042_status_data_rebuild.sql"), "utf8");
const structureAuthoritySql = fs.readFileSync(path.join(root, "db", "postgres", "051_part_structure_type_authority.sql"), "utf8");
const migrationSql = fs.readFileSync(path.join(root, "db", "postgres", "063_production_smoke_tenant_isolation.sql"), "utf8");
const repositorySource = fs.readFileSync(path.join(root, "src", "lib", "repositories", "numbering-async-repository.ts"), "utf8");
const databaseName = `dev116_b_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
let port = null;
let started = false;
let control = null;
let client = null;
let smokeCreated = null;
let jenfuCreated = null;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}

async function portOpen(value) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: value });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

function createInput(companyId, createdBy, coreName) {
  return {
    companyId,
    coreName,
    itemKind: "manufactured",
    structureType: "single_part",
    drawingPurposeCode: "M",
    createdBy
  };
}

function mutationFingerprint(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

try {
  port = await getFreePort();
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-116-B disposable PostgreSQL normal create/read cross-tenant isolation",
    port,
    owningProcessTree: `runner ${process.pid} -> task-owned pg_ctl/PostgreSQL`,
    cleanupCondition: "clients close, exact cluster stops, port closes, task root removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: taskRoot
  } }));
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  run(path.join(pgBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale", "--no-sync"]);
  run(path.join(pgBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", serverLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(pgBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", databaseName]);
  const dsn = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`;
  control = new pg.Client({ connectionString: dsn, application_name: "dev116-b-control" });
  await control.connect();
  await control.query(initialSql);
  await control.query(canonicalWorkbenchSql);
  await control.query(structureAuthoritySql);
  await control.query(migrationSql);
  await control.query(`
    INSERT INTO companies (id, company_code, company_kind, display_name) VALUES
      ('company-jenfu', 'JENFU', 'business', '鉦富'),
      ('company-smoke', 'SMOKE', 'production_smoke', 'Production 驗證租戶');
    INSERT INTO users (id, display_name, email, role, company_id) VALUES
      ('actor-jenfu', 'Jenfu Engineer', 'jenfu@example.invalid', 'Engineer', 'company-jenfu'),
      ('actor-smoke', 'Smoke Engineer', 'smoke@example.invalid', 'Engineer', 'company-smoke');
    INSERT INTO user_company_memberships (user_id, company_id, is_default) VALUES
      ('actor-jenfu', 'company-jenfu', 1),
      ('actor-smoke', 'company-smoke', 1);
    INSERT INTO platform_principal_mappings (platform_principal_id, pdm_user_id, mapping_status) VALUES
      ('principal-jenfu', 'actor-jenfu', 'active'),
      ('principal-smoke', 'actor-smoke', 'active');
    INSERT INTO platform_organization_mappings (platform_organization_id, pdm_company_id, mapping_status) VALUES
      ('organization-jenfu', 'company-jenfu', 'active'),
      ('organization-smoke', 'company-smoke', 'active');
  `);
  client = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsn, maxConnections: 8, applicationName: "dev116-b-runtime" });

  await runCase(cases, "QA-116-014", "smoke create commits one company-consistent root part drawing bundle", async () => {
    const smokeRepository = new AsyncNumberingRepository(client);
    const jenfuRepository = new AsyncNumberingRepository(client);
    [smokeCreated, jenfuCreated] = await Promise.all([
      smokeRepository.createNumberingRecord(createInput("company-smoke", "actor-smoke", "DEV116 Smoke Assembly")),
      jenfuRepository.createNumberingRecord(createInput("company-jenfu", "actor-jenfu", "DEV116 Jenfu Assembly"))
    ]);
    const rows = await control.query(
      `SELECT 'root' kind,id,company_id FROM part_roots WHERE id=$1
       UNION ALL SELECT 'part',id,company_id FROM part_numbers WHERE id=$2
       UNION ALL SELECT 'drawing',id,company_id FROM drawing_numbers WHERE id=$3
       ORDER BY kind`,
      [smokeCreated.root.id, smokeCreated.partNumber.id, smokeCreated.drawingNumber.id]
    );
    assert.equal(rows.rowCount, 3);
    assert.ok(rows.rows.every((row) => row.company_id === "company-smoke"));
    const audit = await control.query("SELECT company_id,scope_kind FROM audit_logs WHERE action='numbering.create' AND company_id='company-smoke' AND detail_json->>'rootCode'=$1", [smokeCreated.root.rootCode]);
    assert.deepEqual(audit.rows, [{ company_id: "company-smoke", scope_kind: "tenant" }]);
    return { objectIds: rows.rows.map((row) => row.id), companyId: "company-smoke", committed: true };
  });

  await runCase(cases, "QA-116-015", "same initial sequence allocates independently under concurrent PostgreSQL transactions", async () => {
    assert.equal(smokeCreated.root.rootCode, jenfuCreated.root.rootCode);
    const sequences = await control.query(
      "SELECT company_id,sequence_key,next_value FROM numbering_sequences WHERE company_id IN ('company-jenfu','company-smoke') ORDER BY company_id,sequence_key"
    );
    assert.ok(sequences.rows.some((row) => row.company_id === "company-smoke" && row.sequence_key.startsWith("company-smoke:")));
    assert.ok(sequences.rows.some((row) => row.company_id === "company-jenfu" && row.sequence_key.startsWith("company-jenfu:")));
    assert.ok(sequences.rows.every((row) => row.sequence_key.startsWith(`${row.company_id}:`)));
    return { visibleCode: smokeCreated.root.rootCode, scopedSequenceRows: sequences.rowCount, provider: "postgres" };
  });

  await runCase(cases, "QA-116-016", "committed official numbers remain retained and non-reused", async () => {
    const second = await new AsyncNumberingRepository(client).createNumberingRecord(createInput("company-smoke", "actor-smoke", "DEV116 Smoke Retained"));
    assert.notEqual(second.root.rootCode, smokeCreated.root.rootCode);
    const retained = await control.query("SELECT id,record_status FROM part_roots WHERE id IN ($1,$2) ORDER BY id", [smokeCreated.root.id, second.root.id]);
    assert.equal(retained.rowCount, 2);
    return { retainedIds: retained.rows.map((row) => row.id), reuse: false, cleanupPolicy: "retained_controlled" };
  });

  await runCase(cases, "QA-116-017", "Jenfu normal search and detail omit smoke records", async () => {
    const repository = new AsyncNumberingRepository(client);
    const search = await repository.searchNumberingRecords({ companyId: "company-jenfu", query: "DEV116", limit: 100 });
    assert.ok(search.length > 0);
    assert.ok(search.every((row) => !JSON.stringify(row).includes("Smoke")));
    const jenfuDetail = await repository.getNumberingRootDetail(jenfuCreated.root.rootCode, "company-jenfu");
    assert.ok(jenfuDetail);
    const wrongCompany = await repository.getNumberingRootDetailsByIds([smokeCreated.root.id], "company-jenfu");
    assert.deepEqual(wrongCompany, []);
    return { jenfuRows: search.length, smokeRows: 0, crossCompanyDetail: 0 };
  });

  await runCase(cases, "QA-116-018", "tenant audit and exact global admin audit views do not mix scopes", async () => {
    await control.query(
      `INSERT INTO audit_logs (id,actor_id,action,detail_json,company_id,scope_kind) VALUES
       ('audit-global','actor-jenfu','numbering.role.upsert','{}',NULL,'global'),
       ('audit-legacy','actor-jenfu','numbering.user_role_assignment.upsert','{}',NULL,'legacy_unscoped'),
       ('audit-smoke-extra','actor-smoke','numbering.create','{"rootCode":"ZZ9999"}','company-smoke','tenant')`
    );
    const jenfuTenant = await control.query("SELECT id FROM audit_logs WHERE company_id='company-jenfu' AND scope_kind='tenant' ORDER BY id");
    assert.ok(jenfuTenant.rowCount > 0);
    const globalRows = await client.query(SELECT_ASYNC_ADMIN_ACCESS_AUDIT_EVENTS_SQL);
    assert.deepEqual(globalRows.map((row) => row.id), ["audit-global"]);
    const detail = await new AsyncNumberingRepository(client).getNumberingRootDetail(jenfuCreated.root.rootCode, "company-jenfu");
    assert.ok(detail.auditTrail.every((event) => event.id !== "audit-smoke-extra" && event.id !== "audit-legacy"));
    assert.match(repositorySource, /findRecentAppendAudit[\s\S]*scope_kind = 'tenant'[\s\S]*company_id = :companyId/u);
    return { jenfuTenantEvents: jenfuTenant.rowCount, globalIds: ["audit-global"], excludedScopes: ["legacy_unscoped", "company-smoke"] };
  });

  await runCase(cases, "QA-116-019", "Jenfu export payload and audit summary exclude smoke", async () => {
    const job = await new AsyncNumberingRepository(client).createNumberingExportJob({
      companyId: "company-jenfu",
      exportMode: "full_change_summary",
      generatedBy: "actor-jenfu"
    });
    const payload = JSON.stringify(job.result);
    assert.doesNotMatch(payload, /company-smoke|DEV116 Smoke|ZZ9999/u);
    assert.match(payload, /company-jenfu/u);
    return { exportJobId: job.id, smokeLeak: false };
  });

  await runCase(cases, "QA-116-020", "Jenfu counts and current task notification query contracts remain company scoped", async () => {
    const before = await control.query("SELECT COUNT(*)::integer count FROM part_roots WHERE company_id='company-jenfu'");
    await new AsyncNumberingRepository(client).createNumberingRecord(createInput("company-smoke", "actor-smoke", "DEV116 Smoke Count Probe"));
    const after = await control.query("SELECT COUNT(*)::integer count FROM part_roots WHERE company_id='company-jenfu'");
    assert.equal(after.rows[0].count, before.rows[0].count);
    assert.match(repositorySource, /FROM numbering_task_items[\s\S]{0,240}company_id = :companyId/u);
    assert.match(repositorySource, /FROM numbering_notifications[\s\S]{0,300}company_id = :companyId/u);
    return { jenfuRootCountBefore: before.rows[0].count, jenfuRootCountAfter: after.rows[0].count, queryPredicates: true };
  });

  await runCase(cases, "QA-116-021", "same idempotency key is exactly once within each company", async () => {
    const key = "dev116-same-key";
    const execute = async (companyId, userId, label) => {
      const actor = createPlatformActorContext({
        pdmUserId: userId,
        organizationId: companyId,
        principalId: `principal-${label}`,
        platformOrganizationId: `organization-${label}`,
        roles: ["Engineer"],
        scopes: ["numbering.create"]
      });
      const command = createPdmCommand({ commandName: "pdm.numbering.dev116_probe", idempotencyKey: key, actor, payload: { label } });
      return executePdmCommandWithOutbox({
        client,
        command,
        execute: (transactionClient) => new AsyncNumberingRepository(transactionClient).createNumberingRecord(createInput(companyId, userId, `DEV116 Receipt ${label}`)),
        event: (result) => ({ aggregateType: "part_root", aggregateId: result.root.id, eventType: "pdm.numbering.dev116_probe.v1", payload: { rootCode: result.root.rootCode } })
      });
    };
    const [jenfuFirst, smokeFirst] = await Promise.all([
      execute("company-jenfu", "actor-jenfu", "jenfu"),
      execute("company-smoke", "actor-smoke", "smoke")
    ]);
    const [jenfuRetry, smokeRetry] = await Promise.all([
      execute("company-jenfu", "actor-jenfu", "jenfu"),
      execute("company-smoke", "actor-smoke", "smoke")
    ]);
    assert.equal(jenfuFirst.reusedFromCommandReceipt, false);
    assert.equal(smokeFirst.reusedFromCommandReceipt, false);
    assert.equal(jenfuRetry.reusedFromCommandReceipt, true);
    assert.equal(smokeRetry.reusedFromCommandReceipt, true);
    const receipts = await control.query("SELECT company_id,COUNT(*)::integer count FROM platform_command_receipts WHERE idempotency_key=$1 GROUP BY company_id ORDER BY company_id", [key]);
    assert.deepEqual(receipts.rows, [{ company_id: "company-jenfu", count: 1 }, { company_id: "company-smoke", count: 1 }]);
    return { receipts: receipts.rows, exactlyOncePerCompany: true };
  });

  await runCase(cases, "QA-116-022", "cross-company UUID read is empty and causes zero writes", async () => {
    const beforeRows = await control.query("SELECT id,company_id,root_code,updated_at FROM part_roots ORDER BY id");
    const before = mutationFingerprint(beforeRows.rows);
    const result = await new AsyncNumberingRepository(client).getNumberingRootDetailsByIds([smokeCreated.root.id], "company-jenfu");
    assert.deepEqual(result, []);
    const afterRows = await control.query("SELECT id,company_id,root_code,updated_at FROM part_roots ORDER BY id");
    assert.equal(mutationFingerprint(afterRows.rows), before);
    return { result: "not_found", zeroWrite: true, existenceLeak: false };
  });
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  for (let number = 14; number <= 22; number += 1) {
    const id = `QA-116-${String(number).padStart(3, "0")}`;
    if (!cases.some((item) => item.id === id)) cases.push({ id, title: "DEV-116-B setup", status: "BLOCKED", message });
  }
} finally {
  if (client) await client.close().catch(() => {});
  if (control) await control.end().catch(() => {});
  if (started) {
    try { run(path.join(pgBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* reported below */ }
  }
  const portReleased = port === null ? true : !(await portOpen(port));
  const resolvedTaskRoot = path.resolve(taskRoot);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (resolvedTaskRoot.startsWith(`${resolvedTemp}${path.sep}`)) fs.rmSync(resolvedTaskRoot, { recursive: true, force: true });
  const { manifest, target } = writeProducerManifest({
    runId,
    producer: "isolation-b",
    cases,
    detail: { portReleased, taskRootRemoved: !fs.existsSync(resolvedTaskRoot), postgresPort: port }
  });
  console.log(JSON.stringify({ evidence: target, status: manifest.status, cases: cases.length, portReleased }));
  if (manifest.status !== "PASS" || !portReleased) process.exitCode = 1;
}
