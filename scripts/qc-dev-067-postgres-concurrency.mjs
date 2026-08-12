#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import pg from "pg";

const { Pool } = pg;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const container = `ai-pdm-dev067-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
const port = await freePort();
const password = "dev067_qc_password";
const connectionString = `postgres://postgres:${password}@127.0.0.1:${port}/dev067`;
let pool;
let client;

try {
  const started = spawnSync("docker", ["run", "-d", "--rm", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=dev067", "-p", `${port}:5432`, "postgres:17-alpine"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (started.status !== 0) throw new Error(`POSTGRES_QC_DOCKER_START_FAILED: ${started.stderr}`);

  pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 2_000, statement_timeout: 10_000 });
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    try { await pool.query("SELECT 1"); ready = true; } catch { await sleep(500); }
  }
  assert.equal(ready, true, "disposable PostgreSQL must become ready");
  await pool.query(`
    CREATE TABLE numbering_draft_workspaces (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE numbering_draft_roots (id text PRIMARY KEY, company_id text NOT NULL, workspace_id text NOT NULL);
    CREATE TABLE numbering_draft_drawings (id text PRIMARY KEY, company_id text NOT NULL, workspace_id text NOT NULL);
    CREATE TABLE numbering_draft_parts (id text PRIMARY KEY, company_id text NOT NULL, workspace_id text NOT NULL);
    CREATE TABLE numbering_candidate_revision_drafts (id text PRIMARY KEY, company_id text NOT NULL, workspace_id text NOT NULL);
    CREATE TABLE number_candidate_reservations (id text PRIMARY KEY, company_id text NOT NULL, workspace_id text NOT NULL, reservation_state text NOT NULL);
    CREATE TABLE numbering_draft_relations (id text PRIMARY KEY, company_id text NOT NULL, workspace_id text NOT NULL);
    CREATE TABLE part_roots (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE drawing_numbers (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE part_numbers (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE drawing_revision_packages (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE file_assets (id text PRIMARY KEY);
    CREATE TABLE numbering_candidate_revision_files (id text PRIMARY KEY, company_id text NOT NULL);
    CREATE TABLE drawing_revision_package_files (id text PRIMARY KEY, package_id text NOT NULL);
    CREATE TABLE approval_platform_requests (id text PRIMARY KEY, company_id text NOT NULL, request_status text NOT NULL);
    CREATE TABLE approval_platform_targets (id text PRIMARY KEY, request_id text NOT NULL, target_type text NOT NULL, target_id text NOT NULL);
    INSERT INTO numbering_draft_workspaces VALUES ('ws-1', 'company-1');
    INSERT INTO numbering_draft_roots VALUES ('root-1', 'company-1', 'ws-1');
    INSERT INTO numbering_draft_drawings VALUES ('drawing-1', 'company-1', 'ws-1');
    INSERT INTO numbering_draft_parts VALUES ('part-1', 'company-1', 'ws-1');
    INSERT INTO numbering_candidate_revision_drafts VALUES ('revision-1', 'company-1', 'ws-1');
    INSERT INTO number_candidate_reservations VALUES ('reservation-1', 'company-1', 'ws-1', 'active');
    INSERT INTO numbering_draft_relations VALUES ('relation-1', 'company-1', 'ws-1');
    INSERT INTO part_roots VALUES ('formal-root-1', 'company-1');
    INSERT INTO drawing_numbers VALUES ('formal-drawing-1', 'company-1');
    INSERT INTO part_numbers VALUES ('formal-part-1', 'company-1');
    INSERT INTO drawing_revision_packages VALUES ('package-1', 'company-1');
    INSERT INTO file_assets VALUES ('asset-1');
  `);

  const { createAsyncDatabaseClient } = await import("../src/lib/db-async-provider.ts");
  const { lockPdmEntityScopeAsync, assertPdmEntityWriteAllowedAsync, PdmReviewLockError } = await import("../src/lib/pdm-review-lock.ts");
  client = createAsyncDatabaseClient({ kind: "postgres", connectionString, maxConnections: 8, connectionTimeoutMillis: 2_000, statementTimeoutMillis: 10_000 });
  const refs = [
    { type: "workspace", id: "ws-1", companyId: "company-1" },
    { type: "part_root", id: "formal-root-1", companyId: "company-1" },
    { type: "drawing_number", id: "formal-drawing-1", companyId: "company-1" },
    { type: "part_number", id: "formal-part-1", companyId: "company-1" },
    { type: "drawing_revision_package", id: "package-1", companyId: "company-1" },
    { type: "attachment", id: "asset-1", companyId: "company-1" },
    { type: "relation", id: "relation-1", companyId: "company-1" }
  ];

  let releaseFirst;
  let firstLocked;
  const firstLockedPromise = new Promise((resolve) => { firstLocked = resolve; });
  const first = client.transaction(async (tx) => {
    await lockPdmEntityScopeAsync(tx, refs);
    firstLocked();
    await new Promise((resolve) => { releaseFirst = resolve; });
  });
  await firstLockedPromise;
  let secondFinished = false;
  const second = client.transaction(async (tx) => {
    await lockPdmEntityScopeAsync(tx, refs.slice().reverse());
    secondFinished = true;
  });
  await sleep(250);
  assert.equal(secondFinished, false, "second PostgreSQL transaction must wait on the first row lock");
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(secondFinished, true, "second transaction must proceed after first commit");

  await pool.query("INSERT INTO approval_platform_requests VALUES ('request-1', 'company-1', 'pending')");
  await pool.query("INSERT INTO approval_platform_targets VALUES ('target-1', 'request-1', 'workspace', 'ws-1')");
  await assert.rejects(
    () => client.transaction((tx) => assertPdmEntityWriteAllowedAsync(tx, { companyId: "company-1", targetIds: ["ws-1"], targetRefs: [{ type: "workspace", id: "ws-1" }] })),
    (error) => error instanceof PdmReviewLockError && error.status === 409,
    "active approval target must reject writes inside the locking transaction"
  );

  const parallelA = client.transaction(async (tx) => { await lockPdmEntityScopeAsync(tx, refs.slice(0, 4)); await sleep(100); });
  const parallelB = client.transaction(async (tx) => { await lockPdmEntityScopeAsync(tx, refs.slice(0, 4).reverse()); await sleep(100); });
  await Promise.all([parallelA, parallelB]);
  console.log("QC DEV-067 PostgreSQL concurrency: PASS (row-lock blocking, canonical-order no-deadlock, active-review write rejection)");
} finally {
  try { await client?.close?.(); } catch {}
  try { await pool?.end?.(); } catch {}
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}
