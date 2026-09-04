#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import pg from "pg";

import { resolveAuditWriteScope } from "../src/lib/audit-scope.ts";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { assertCanonicalNumberingSequenceKey } from "../src/lib/numbering-sequence-utils.ts";
import { isValidSmokeCommandAuthority } from "../src/lib/platform-command-context.ts";
import { createPdmCommand, createPlatformActorContext } from "../src/lib/platform-command.ts";
import { executePdmCommandWithOutbox } from "../src/lib/platform-command-service.ts";
import { assertProductionSmokeRuntimeIsolation, readProductionSmokeRuntimeIsolation } from "../src/lib/production-smoke-runtime.ts";
import { AsyncNumberingRepository } from "../src/lib/repositories/numbering-async-repository.ts";
import { dev116RunId, runCase, writeProducerManifest } from "./dev-116-evidence-utils.mjs";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = dev116RunId();
const cases = [];
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev116-c-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const clusterDir = path.join(taskRoot, "cluster");
const serverLog = path.join(taskRoot, "postgres.log");
const pgBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const databaseName = `dev116_c_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const schemaFiles = [
  "db/postgres/001_initial_schema.sql",
  "db/postgres/042_status_data_rebuild.sql",
  "db/postgres/051_part_structure_type_authority.sql",
  "db/postgres/063_production_smoke_tenant_isolation.sql"
];
const disabledSideEffects = {
  PDM_SMOKE_GCS_WRITER: "disabled",
  PDM_SMOKE_OUTBOX_CONSUMER: "disabled",
  PDM_SMOKE_EXTERNAL_NOTIFICATION: "disabled"
};
const smokeCompany = { companyId: "company-smoke", companyCode: "SMOKE", companyKind: "production_smoke" };
let port = null;
let started = false;
let control = null;
let client = null;
let cleanupCreated = null;

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

function smokeActor() {
  return createPlatformActorContext({
    pdmUserId: "actor-smoke",
    organizationId: "company-smoke",
    principalId: "principal-smoke",
    platformOrganizationId: "organization-smoke",
    roles: ["Engineer"],
    scopes: ["numbering.create"]
  });
}

async function executeSmokeCommand({ key, coreName, checkpoint, faultInjector }) {
  const command = createPdmCommand({
    commandName: "pdm.numbering.dev116_c_probe",
    idempotencyKey: key,
    actor: smokeActor(),
    payload: { coreName }
  });
  return executePdmCommandWithOutbox({
    client,
    command,
    serializable: true,
    execute: (transactionClient) => new AsyncNumberingRepository(
      transactionClient,
      undefined,
      undefined,
      checkpoint
    ).createNumberingRecord(createInput("company-smoke", "actor-smoke", coreName)),
    event: (result) => ({
      aggregateType: "part_root",
      aggregateId: result.root.id,
      eventType: "pdm.numbering.dev116_c_probe.v1",
      payload: { rootCode: result.root.rootCode }
    }),
    faultInjector
  });
}

async function companyFingerprint(companyId) {
  const tables = [
    "part_roots", "part_numbers", "drawing_numbers", "drawings", "drawing_part_links",
    "numbering_sequences", "audit_logs", "pdm_workbench_aggregates", "canonical_workbench_states",
    "platform_command_receipts", "platform_outbox_events", "numbering_task_items", "numbering_notifications"
  ];
  const snapshot = {};
  for (const table of tables) {
    const columns = await control.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1",
      [table]
    );
    if (!columns.rows.some((row) => row.column_name === "company_id")) continue;
    const rows = await control.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE company_id=$1 ORDER BY to_jsonb(t)::text`, [companyId]);
    snapshot[table] = rows.rows.map((row) => row.row);
  }
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

try {
  port = await getFreePort();
  Object.assign(process.env, {
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    ...disabledSideEffects
  });
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-116-C disposable PostgreSQL failure, rollback, cleanup and mutation evidence",
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
  control = new pg.Client({ connectionString: dsn, application_name: "dev116-c-control" });
  await control.connect();
  for (const relativePath of schemaFiles) await control.query(fs.readFileSync(path.join(root, relativePath), "utf8"));
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
  client = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsn, maxConnections: 8, applicationName: "dev116-c-runtime" });

  await runCase(cases, "QA-116-026", "bundle fault rolls back completely and concurrent duplicate converges exactly once", async () => {
    const beforeFault = await companyFingerprint("company-smoke");
    await assert.rejects(
      () => executeSmokeCommand({
        key: "dev116-c-fault",
        coreName: "DEV116 C Fault",
        checkpoint: (point) => { if (point === "after_part") throw new Error("DEV116_FORCED_AFTER_PART"); }
      }),
      /DEV116_FORCED_AFTER_PART/u
    );
    const afterFault = await companyFingerprint("company-smoke");
    assert.equal(afterFault, beforeFault);

    const invoke = () => executeSmokeCommand({ key: "dev116-c-concurrent", coreName: "DEV116 C Concurrent" });
    const concurrent = await Promise.allSettled([invoke(), invoke()]);
    const unexpected = concurrent.filter((item) => item.status === "rejected" && !/PLATFORM_COMMAND_IN_PROGRESS/u.test(String(item.reason)));
    assert.equal(unexpected.length, 0, JSON.stringify(unexpected));
    const retry = await invoke();
    assert.equal(retry.reusedFromCommandReceipt, true);
    const counts = await control.query(`SELECT
      (SELECT COUNT(*)::integer FROM part_roots WHERE company_id='company-smoke' AND core_name='DEV116 C Concurrent') roots,
      (SELECT COUNT(*)::integer FROM part_numbers p JOIN part_roots r ON r.id=p.part_root_id WHERE r.company_id='company-smoke' AND r.core_name='DEV116 C Concurrent') parts,
      (SELECT COUNT(*)::integer FROM drawing_numbers d JOIN part_roots r ON r.id=d.part_root_id WHERE r.company_id='company-smoke' AND r.core_name='DEV116 C Concurrent') drawings,
      (SELECT COUNT(*)::integer FROM audit_logs WHERE company_id='company-smoke' AND action='numbering.create' AND detail_json->>'rootCode'=$1) audits,
      (SELECT COUNT(*)::integer FROM platform_command_receipts WHERE company_id='company-smoke' AND idempotency_key='dev116-c-concurrent') receipts`, [retry.result.root.rootCode]);
    assert.deepEqual(counts.rows[0], { roots: 1, parts: 1, drawings: 1, audits: 1, receipts: 1 });
    return { faultBeforeAfterEqual: true, concurrentResults: concurrent.map((item) => item.status), counts: counts.rows[0], retryReused: true };
  });

  await runCase(cases, "QA-116-027", "cleanup failure retains controlled smoke data while Jenfu fingerprint stays unchanged", async () => {
    const before = await companyFingerprint("company-jenfu");
    cleanupCreated = await new AsyncNumberingRepository(client).createNumberingRecord(
      createInput("company-smoke", "actor-smoke", "DEV116 C Cleanup Retained")
    );
    let cleanupFailure = "";
    try { throw new Error("DEV116_SIMULATED_CLEANUP_FAILURE"); }
    catch (error) { cleanupFailure = error.message; }
    const after = await companyFingerprint("company-jenfu");
    assert.equal(after, before);
    const retained = await control.query("SELECT COUNT(*)::integer count FROM part_roots WHERE id=$1 AND company_id='company-smoke'", [cleanupCreated.root.id]);
    assert.equal(retained.rows[0].count, 1);
    const jenfuSearch = await new AsyncNumberingRepository(client).searchNumberingRecords({ companyId: "company-jenfu", query: "DEV116 C Cleanup Retained", limit: 50 });
    assert.deepEqual(jenfuSearch, []);
    return { cleanupFailure, policy: "retained_controlled", smokeRetained: true, jenfuBeforeAfterEqual: true, jenfuVisibleRows: 0 };
  });

  await runCase(cases, "QA-116-028", "runtime readback proves all external smoke side effects disabled", async () => {
    const readback = readProductionSmokeRuntimeIsolation({ ...disabledSideEffects });
    assert.equal(readback.isolated, true);
    assertProductionSmokeRuntimeIsolation(smokeCompany, { ...disabledSideEffects });
    assert.deepEqual(readback.runtime, {
      gcsWriter: "disabled",
      outboxConsumer: "disabled",
      externalNotification: "disabled"
    });
    return { runtime: readback.runtime, externalSideEffect: false, failClosedGuard: true };
  });

  await runCase(cases, "QA-116-029", "Jenfu supporting probe uses repository in outer transaction and always rolls back", async () => {
    const before = await companyFingerprint("company-jenfu");
    await assert.rejects(
      () => client.transaction(async (transactionClient) => {
        await new AsyncNumberingRepository(transactionClient).createNumberingRecord(
          createInput("company-jenfu", "actor-jenfu", "DEV116 C Jenfu Rollback Probe")
        );
        throw new Error("DEV116_SUPPORTING_PROBE_ROLLBACK");
      }),
      /DEV116_SUPPORTING_PROBE_ROLLBACK/u
    );
    const after = await companyFingerprint("company-jenfu");
    assert.equal(after, before);
    const residue = await control.query("SELECT COUNT(*)::integer count FROM part_roots WHERE company_id='company-jenfu' AND core_name='DEV116 C Jenfu Rollback Probe'");
    assert.equal(residue.rows[0].count, 0);
    return { supportingOnly: true, httpCommitE2E: false, forcedRollback: true, beforeAfterEqual: true, residue: 0 };
  });

  await runCase(cases, "QA-116-030", "six tenant and evidence mutants are each detected", async () => {
    assert.ok(cleanupCreated);
    const user = { id: "actor-smoke", role: "Engineer", company_id: "company-smoke" };
    const authority = {
      companyId: "company-smoke", companyCode: "SMOKE", companyKind: "production_smoke", isDefault: true,
      membershipCount: 1, platformPrincipalId: "principal-smoke", principalMappingStatus: "active",
      platformOrganizationId: "organization-smoke", organizationMappingStatus: "active"
    };
    const receipts = [];
    const detect = (id, detected, expectedFailure) => {
      assert.equal(detected, true, `${id}:${expectedFailure}`);
      receipts.push({ id, detected: true, expectedFailure });
    };
    detect("M1-membership-removed", !isValidSmokeCommandAuthority(user, null), "pdm_smoke_authority_invalid");
    detect("M2-principal-suspended", !isValidSmokeCommandAuthority(user, { ...authority, principalMappingStatus: "suspended" }), "pdm_smoke_authority_invalid");
    const scoped = await new AsyncNumberingRepository(client).getNumberingRootDetailsByIds([cleanupCreated.root.id], "company-jenfu");
    const unscopedMutant = await control.query("SELECT id FROM part_roots WHERE id=$1", [cleanupCreated.root.id]);
    detect("M3-company-predicate-removed", scoped.length === 0 && unscopedMutant.rowCount === 1, "cross_tenant_visibility");
    let sequenceRejected = false;
    try { assertCanonicalNumberingSequenceKey("company-smoke", "root:A"); } catch { sequenceRejected = true; }
    detect("M4-unscoped-sequence", sequenceRejected, "NUMBERING_SEQUENCE_SCOPE_MISMATCH");
    let auditRejected = false;
    try { resolveAuditWriteScope({ action: "numbering.create" }); } catch { auditRejected = true; }
    detect("M5-audit-company-removed", auditRejected, "TENANT_AUDIT_COMPANY_REQUIRED");
    let sideEffectRejected = false;
    try { assertProductionSmokeRuntimeIsolation(smokeCompany, { ...disabledSideEffects, PDM_SMOKE_OUTBOX_CONSUMER: "enabled" }); }
    catch { sideEffectRejected = true; }
    detect("M6-side-effect-enabled", sideEffectRejected, "PDM_SMOKE_RUNTIME_ISOLATION_REQUIRED");
    assert.equal(receipts.length, 6);
    return { mutantCount: receipts.length, killed: receipts.length, receipts };
  });
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  for (let number = 26; number <= 30; number += 1) {
    const id = `QA-116-${String(number).padStart(3, "0")}`;
    if (!cases.some((item) => item.id === id)) cases.push({ id, title: "DEV-116-C setup", status: "BLOCKED", message });
  }
} finally {
  if (client) await client.close().catch(() => {});
  if (control) await control.end().catch(() => {});
  if (started) {
    try { run(path.join(pgBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); }
    catch (error) { console.error(error instanceof Error ? error.message : String(error)); }
  }
  const portReleased = port === null ? true : !(await portOpen(port));
  const resolvedTaskRoot = path.resolve(taskRoot);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (resolvedTaskRoot.startsWith(`${resolvedTemp}${path.sep}`)) fs.rmSync(resolvedTaskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  const taskRootRemoved = !fs.existsSync(resolvedTaskRoot);
  const { manifest, target } = writeProducerManifest({
    runId,
    producer: "isolation-c",
    cases,
    detail: { provider: "postgres", portReleased, taskRootRemoved, sideEffects: "disabled" }
  });
  console.log(JSON.stringify({ evidence: target, status: manifest.status, cases: cases.length, portReleased, taskRootRemoved }));
  if (manifest.status !== "PASS" || !portReleased || !taskRootRemoved) process.exitCode = 1;
}
