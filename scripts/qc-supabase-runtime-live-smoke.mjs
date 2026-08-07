#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const root = process.cwd();
const host = "127.0.0.1";
const port = Number(process.env.PDM_LIVE_SMOKE_PORT ?? 3317);
const baseUrl = `http://${host}:${port}`;
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const smokePrefix = `AI_PDM_GB_SMOKE_${timestamp()}_CODEX`;
const results = [];
let server = null;
let createdRootCode = "";
let createdPartNumber = "";
let cookie = "";

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function truthy(value) {
  return ["1", "true", "yes", "approved"].includes(String(value ?? "").trim().toLowerCase());
}

function requireEnv() {
  const blockers = [];
  if (!truthy(process.env.PDM_RUNTIME_SMOKE_APPROVED)) blockers.push("PDM_RUNTIME_SMOKE_APPROVED must be true for this command.");
  if (process.env.PDM_SUPABASE_TARGET_NAME !== "AI_PDM_STAGING") blockers.push("PDM_SUPABASE_TARGET_NAME must be AI_PDM_STAGING.");
  if (process.env.PDM_DB_PROVIDER !== "postgres") blockers.push("PDM_DB_PROVIDER must be postgres for this command.");
  if (!process.env.PDM_POSTGRES_URL?.trim()) blockers.push("PDM_POSTGRES_URL is required.");
  if (!process.env.PDM_POSTGRES_SHADOW_URL?.trim()) blockers.push("PDM_POSTGRES_SHADOW_URL is required.");
  validateConnectionString("PDM_POSTGRES_URL", blockers);
  validateConnectionString("PDM_POSTGRES_SHADOW_URL", blockers);
  if (blockers.length > 0) {
    console.log(JSON.stringify({ status: "blocked", blockers }, null, 2));
    process.exit(2);
  }
}

function validateConnectionString(name, blockers) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) return;
  if (/\[(?:YOUR-)?PASSWORD\]|<password>/iu.test(value)) {
    blockers.push(`${name} still contains a password placeholder. Replace it with the real database password and URL-encode special characters.`);
    return;
  }
  try {
    const parsed = new URL(value);
    if (!/^postgres(?:ql)?:$/iu.test(parsed.protocol)) blockers.push(`${name} must use postgres:// or postgresql://.`);
    if (!parsed.hostname) blockers.push(`${name} must include a hostname.`);
    if (!parsed.username) blockers.push(`${name} must include a username.`);
    if (!parsed.pathname || parsed.pathname === "/") blockers.push(`${name} should include the database path, usually /postgres.`);
  } catch {
    blockers.push(`${name} is not a valid connection URI. Copy it from Supabase Connect and URL-encode the database password if it contains special characters.`);
  }
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function nextBinPath() {
  const candidate = resolve(root, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(candidate)) throw new Error("NEXT_BIN_NOT_FOUND: install dependencies before running live smoke.");
  return candidate;
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForServer() {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < 90_000) {
    try {
      const response = await fetch(`${baseUrl}/api/settings`, { method: "GET" });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await wait(1000);
  }
  throw new Error(`SERVER_START_TIMEOUT: ${lastError}`);
}

async function startServer() {
  const args = [nextBinPath(), "dev", "--hostname", host, "--port", String(port)];
  server = spawn(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      PDM_DB_PROVIDER: "postgres",
      PDM_BASE_URL: baseUrl
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  let outputTail = "";
  const appendOutput = (chunk) => {
    outputTail = `${outputTail}${chunk.toString()}`.slice(-4000);
  };
  server.stdout.on("data", appendOutput);
  server.stderr.on("data", appendOutput);

  server.on("exit", (code, signal) => {
    if (code !== null && code !== 0) outputTail = `${outputTail}\n[server exited ${code} ${signal ?? ""}]`.slice(-4000);
  });

  await waitForServer();
  record("server_started_postgres_mode", true, `url=${baseUrl}; pid=${server.pid ?? "<unknown>"}`);
  return outputTail;
}

async function stopServer() {
  if (!server || server.killed) return;
  const current = server;
  await new Promise((resolveStop) => {
    const timer = setTimeout(() => {
      try {
        current.kill("SIGKILL");
      } catch {
        // ignore shutdown race
      }
      resolveStop();
    }, 8000);
    current.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
    try {
      current.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolveStop();
    }
  });
  record("server_stopped", true, `pid=${current.pid ?? "<unknown>"}`);
}

async function request(method, path, body, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const responseBody = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    throw new Error(`${method} ${path} expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(responseBody)}`);
  }
  return { response, body: responseBody };
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password })
  });
  const body = await response.json().catch(() => ({}));
  cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  record("auth_login", response.status === 200 && Boolean(cookie), `HTTP ${response.status}; cookie=${cookie ? "pdm_session" : "<missing>"}`);
  if (response.status !== 200 || !cookie) throw new Error(`LOGIN_FAILED: ${JSON.stringify(body)}`);
}

async function runApiSmoke() {
  await login();
  const me = await request("GET", "/api/auth/me");
  record("auth_me_confirm", me.body.user?.role === "Admin", `role=${me.body.user?.role ?? "<missing>"}`);

  const matrix = await request("GET", "/api/numbering/admin/matrix");
  record(
    "read_path_admin_matrix",
    Array.isArray(matrix.body.roles) && Array.isArray(matrix.body.rolePermissions),
    `roles=${matrix.body.roles?.length ?? 0}; rolePermissions=${matrix.body.rolePermissions?.length ?? 0}`
  );

  const simulator = await request("POST", "/api/numbering/rule-simulator", {
    actionCode: "numbering.create",
    recordStatus: "Draft",
    itemKind: "manufactured",
    riskFlags: []
  });
  record("read_path_rule_simulator", typeof simulator.body.requiresApproval === "boolean", "approval rule evaluated");

  const duplicate = await request("POST", "/api/numbering/duplicate-check", {
    coreName: smokePrefix,
    partName: `${smokePrefix} part`
  });
  const duplicateCount = Number(duplicate.body.matches?.length ?? duplicate.body.duplicates?.length ?? 0);
  record("pre_write_duplicate_guard", duplicateCount === 0, `matches=${duplicateCount}`);

  const create = await request(
    "POST",
    "/api/numbering/records",
    {
      coreName: smokePrefix,
      partName: `${smokePrefix} part`,
      itemKind: "manufactured",
      drawingRequested: false
    },
    201
  );
  createdRootCode = create.body.root?.rootCode ?? "";
  createdPartNumber = create.body.partNumber?.partNumber ?? "";
  record("write_path_numbering_smoke_record", Boolean(createdRootCode && createdPartNumber), `root=${createdRootCode}; part=${createdPartNumber}`);

  const readback = await request("GET", `/api/numbering/roots/${encodeURIComponent(createdRootCode)}`);
  const hasCreatedPart = Array.isArray(readback.body.partNumbers) && readback.body.partNumbers.some((part) => part.partNumber === createdPartNumber);
  record("readback_created_record", hasCreatedPart, `partNumbers=${readback.body.partNumbers?.length ?? 0}`);

  const obsolete = await request("POST", `/api/numbering/records/${encodeURIComponent(createdRootCode)}/obsolete`, {
    reason: `QC staging smoke cleanup ${smokePrefix}`
  });
  record("cleanup_smoke_record", obsolete.body.result?.root?.recordStatus === "Obsolete", `root=${createdRootCode}; status=${obsolete.body.result?.root?.recordStatus ?? "<missing>"}`);

  await request("POST", "/api/auth/logout", {});
  record("auth_logout", true, "HTTP 200");
}

async function cleanupIfNeeded() {
  if (!createdRootCode || !cookie) return;
  try {
    await request("POST", `/api/numbering/records/${encodeURIComponent(createdRootCode)}/obsolete`, {
      reason: `QC staging smoke cleanup retry ${smokePrefix}`
    });
  } catch {
    // Cleanup proof below will mark residue if this failed.
  }
}

async function directCleanupProof() {
  const client = new Client({ connectionString: process.env.PDM_POSTGRES_URL });
  await client.connect();
  try {
    const activeRoots = await client.query(
      "SELECT count(*)::int AS count FROM part_roots WHERE core_name LIKE $1 AND record_status <> 'Obsolete'",
      ["AI_PDM_GB_SMOKE_%"]
    );
    const smokeRoot = createdRootCode
      ? await client.query("SELECT root_code, record_status FROM part_roots WHERE root_code = $1", [createdRootCode])
      : { rows: [] };
    const smokePart = createdPartNumber
      ? await client.query("SELECT part_number, record_status FROM part_numbers WHERE part_number = $1", [createdPartNumber])
      : { rows: [] };
    const activeRootCount = Number(activeRoots.rows[0]?.count ?? 0);
    const rootStatus = smokeRoot.rows[0]?.record_status ?? "<missing>";
    const partStatus = smokePart.rows[0]?.record_status ?? "<missing>";
    record("cleanup_proof_no_active_smoke_roots", activeRootCount === 0, `activeSmokeRoots=${activeRootCount}`);
    record("cleanup_proof_created_root_obsolete", !createdRootCode || rootStatus === "Obsolete", `root=${createdRootCode || "<none>"}; status=${rootStatus}`);
    record("cleanup_proof_created_part_obsolete", !createdPartNumber || partStatus === "Obsolete", `part=${createdPartNumber || "<none>"}; status=${partStatus}`);
  } finally {
    await client.end();
  }
}

async function main() {
  requireEnv();
  let status = "pass";
  let failure = "";
  try {
    await startServer();
    await runApiSmoke();
  } catch (error) {
    status = "fail";
    failure = error instanceof Error ? error.message : String(error);
    await cleanupIfNeeded();
  } finally {
    try {
      await directCleanupProof();
    } catch (error) {
      status = "fail";
      failure = failure || (error instanceof Error ? error.message : String(error));
      results.push({ name: "direct_cleanup_proof", passed: false, detail: error instanceof Error ? error.message : String(error) });
    }
    await stopServer();
  }

  const failed = results.filter((result) => !result.passed);
  const report = {
    checkedAt: new Date().toISOString(),
    status: failed.length === 0 && status === "pass" ? "pass" : "fail",
    target: process.env.PDM_SUPABASE_TARGET_NAME,
    runtime: {
      provider: process.env.PDM_DB_PROVIDER,
      postgresUrl: process.env.PDM_POSTGRES_URL ? "<configured>" : "<missing>",
      shadowUrl: process.env.PDM_POSTGRES_SHADOW_URL ? "<configured>" : "<missing>",
      poolerMode: process.env.PDM_POSTGRES_POOLER_MODE || "<unset>"
    },
    smokePrefix,
    created: {
      rootCode: createdRootCode || null,
      partNumber: createdPartNumber || null
    },
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failure: failure || null,
    results
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "pass" ? 0 : 1;
}

await main();
