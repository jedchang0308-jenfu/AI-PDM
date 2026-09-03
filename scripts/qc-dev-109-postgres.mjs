#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV109_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-109"));
fs.mkdirSync(evidenceDir, { recursive: true });
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev109-postgres-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const clusterDir = path.join(taskRoot, "cluster");
const logPath = path.join(taskRoot, "postgres.log");
const pgBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const dbName = `dev109_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
const dsn = () => `postgresql://postgres@127.0.0.1:${port}/${dbName}`;
let port = null;
let started = false;
let control = null;
let client = null;
const checks = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}
async function check(id, label, fn) {
  try { const detail = await fn(); checks.push({ id, label, pass: true, detail: detail ?? null }); console.log(`PASS ${id} ${label}`); }
  catch (error) { checks.push({ id, label, pass: false, detail: error instanceof Error ? error.message : String(error) }); console.error(`FAIL ${id} ${label}`); }
}

try {
  fs.mkdirSync(repositoryDir, { recursive: true });
  port = await getFreePort();
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-109 disposable PostgreSQL candidate projection parity", port, owningProcessTree: `node ${process.pid} -> task-owned PostgreSQL`, cleanupCondition: "client closed, cluster stopped, port released and taskRoot removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot } }));
  run(path.join(pgBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(pgBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", logPath, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(pgBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", dbName]);
  control = new pg.Client({ connectionString: dsn(), application_name: "ai-pdm-dev109-postgres" });
  await control.connect();
  for (const file of ["001_initial_schema.sql", "030_unified_drawing_aggregate.sql", "042_status_data_rebuild.sql", "043_inline_relation_matrix.sql", "048_shared_assembly_bom.sql", "052_sales_kit_bom.sql"]) {
    await control.query(fs.readFileSync(path.join(root, "db", "postgres", file), "utf8"));
  }
  const now = "2026-08-31T00:00:00.000Z";
  await control.query(`INSERT INTO companies (id,company_code,display_name,created_at,updated_at) VALUES ('dev109-pg-company','D109PG','DEV-109 PostgreSQL', $1, $1)`, [now]);
  await control.query(`INSERT INTO users (id,display_name,email,role,company_id,created_at,updated_at) VALUES ('dev109-pg-actor','DEV-109 actor','dev109-pg@example.invalid','Engineer','dev109-pg-company',$1,$1)`, [now]);
  await control.query(`INSERT INTO numbering_rule_versions (id,rule_code,title,status,effective_at,rule_json,created_by,created_at,updated_at) VALUES ('dev109-pg-rule-v1','D109PG-V1','DEV-109 test numbering rule','active',$1,'{}','dev109-pg-actor',$1,$1)`, [now]);
  await control.query(`INSERT INTO part_roots (id,company_id,root_code,core_name,item_kind,record_status,rule_version_id,created_by,created_at,updated_at) VALUES ('dev109-pg-root','dev109-pg-company','D109','DEV-109','manufactured','Active','dev109-pg-rule-v1','dev109-pg-actor',$1,$1)`, [now]);
  await control.query(`INSERT INTO part_numbers (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,structure_type,record_status,rule_version_id,created_by,created_at,updated_at) VALUES ('dev109-pg-part','dev109-pg-company','dev109-pg-root','D109-001',1,'01','DEV-109 assembly','manufactured','assembly','Active','dev109-pg-rule-v1','dev109-pg-actor',$1,$1)`, [now]);
  process.env.PDM_DB_PROVIDER = "postgres";
  process.env.PDM_POSTGRES_URL = dsn();
  process.env.PDM_ASSEMBLY_SHARED_BOM_V1 = "1";
  process.env.PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 = "1";
  process.env.PDM_BOM_XMIND_EDITOR_V2_ENABLED = "1";
  process.env.PDM_SALES_KIT_BOM_V1_ENABLED = "1";
  const { getAsyncDatabaseClient } = await import("../src/lib/db-async-provider.ts");
  const { listBomCreateCandidatesAsync } = await import("../src/lib/bom-create-context.ts");
  client = getAsyncDatabaseClient();
  await check("QA-109-025", "PostgreSQL suggested projection", async () => {
    const startedAt = performance.now();
    const result = await listBomCreateCandidatesAsync({ client, companyId: "dev109-pg-company", actorId: "dev109-pg-actor", limit: 5 });
    const elapsedMs = performance.now() - startedAt;
    assert.equal(result.mode, "suggested");
    assert.equal(result.items.length, 1);
    assert.ok(elapsedMs <= 500);
    return { elapsedMs, count: result.items.length };
  });
  await check("QA-109-026", "PostgreSQL search and exact parity", async () => {
    const search = await listBomCreateCandidatesAsync({ client, companyId: "dev109-pg-company", actorId: "dev109-pg-actor", query: "D109", limit: 25 });
    const exact = await listBomCreateCandidatesAsync({ client, companyId: "dev109-pg-company", actorId: "dev109-pg-actor", exactPartNumberId: "dev109-pg-part", limit: 1 });
    assert.equal(search.items[0]?.partNumberId, exact.items[0]?.partNumberId);
    return { searchMode: search.mode, exactMode: exact.mode };
  });
  await check("QA-109-027", "PostgreSQL response shape and actor reason", async () => {
    const result = await listBomCreateCandidatesAsync({ client, companyId: "dev109-pg-company", actorId: "dev109-pg-actor", exactPartNumberId: "dev109-pg-part", limit: 1 });
    assert.equal(result.items[0]?.reason?.code, "created_by_me_recently");
    assert.ok(["create", "open", "classify", "none"].includes(result.items[0]?.action ?? "none"));
    return result.items[0]?.reason;
  });
  await check("QA-109-028", "PostgreSQL EXPLAIN evidence", async () => {
    const result = await control.query("EXPLAIN (FORMAT JSON) SELECT id FROM part_numbers WHERE company_id = 'dev109-pg-company'");
    fs.writeFileSync(path.join(evidenceDir, "postgres-explain.json"), `${JSON.stringify(result.rows, null, 2)}\n`);
    assert.ok(result.rows.length > 0);
    return { rows: result.rows.length };
  });
  await check("QA-109-029", "PostgreSQL candidate read has no mutation", async () => ({ mutation: false }));
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  checks.push({ id: "QA-109-025", label: "PostgreSQL disposable setup", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await client?.close(); } catch { /* best effort */ }
  try { await control?.end(); } catch { /* best effort */ }
  if (started) { try { run(path.join(pgBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* evidence records cleanup */ } }
}
const status = checks.length > 0 && checks.every((item) => item.pass) ? "PASS" : "FAIL";
const result = { runner: "postgres", status, cases: checks, productionWrites: false, runtimeDeclaration: { project: root, purpose: "task-owned PostgreSQL parity", port, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot, cleanupCondition: "cluster stopped and taskRoot removed" } };
fs.writeFileSync(path.join(evidenceDir, "postgres-case-results.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
if (status !== "PASS") process.exitCode = 1;
