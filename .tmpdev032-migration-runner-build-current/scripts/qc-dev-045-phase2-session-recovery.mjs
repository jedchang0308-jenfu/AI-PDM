#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { FirebaseManagedActionEmail } from "../src/lib/firebase-managed-action-email.ts";
import { requestProviderRecoveryHandoffByEmailAsync } from "../src/lib/account-recovery-handoff.ts";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev045-phase2-"));
const password = "Dev045-Phase2-QC-Password";
const bootstrapUsers = [
  { id: "user-dev045-qc-admin", displayName: "DEV045 QC Admin", email: "dev045.qc.admin@example.com", password, role: "Admin" },
  { id: "user-dev045-qc-engineer", displayName: "DEV045 QC Engineer", email: "dev045.qc.engineer@example.com", password, role: "Engineer" }
];
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error("Unable to allocate local port"));
        else resolve(port);
      });
    });
  });
}

function startApp(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const distDirRelative = ".tmp/next-qc-dev-045-phase2";
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "managed",
      PDM_AUTH_SECRET: "dev-045-phase2-qc-secret",
      PDM_BOOTSTRAP_USERS: JSON.stringify(bootstrapUsers),
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_RELEASE_MODE: "local_stub",
      PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft",
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  return { child, baseUrl, distDir: path.join(root, ...distDirRelative.split("/")), getOutput: () => output };
}

async function stopApp(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000).then(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    })
  ]);
}

async function removeTempDir(dir) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch {
      await delay(300);
    }
  }
}

async function waitForApp(baseUrl, getOutput) {
  const deadline = Date.now() + 45_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`App did not become ready: ${lastError}\n${getOutput()}`);
}

async function requestJson(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(baseUrl, userAgent) {
  const result = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": userAgent },
    body: JSON.stringify({ email: "dev045.qc.engineer@example.com", password })
  });
  const cookie = (result.response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return { ...result, cookie };
}

function openDb() {
  return new Database(path.join(tempDir, "ai-pdm.sqlite"));
}

async function verifyProviderHandoffUnit() {
  const originalEnv = {
    apiKey: process.env.PDM_FIREBASE_API_KEY,
    authDomain: process.env.PDM_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.PDM_FIREBASE_PROJECT_ID,
    appId: process.env.PDM_FIREBASE_APP_ID
  };
  process.env.PDM_FIREBASE_API_KEY = "firebase-api-key";
  process.env.PDM_FIREBASE_AUTH_DOMAIN = "pdm-dev045.firebaseapp.com";
  process.env.PDM_FIREBASE_PROJECT_ID = "pdm-dev045";
  process.env.PDM_FIREBASE_APP_ID = "firebase-app-id";
  try {
    const sent = [];
    const actionEmail = new FirebaseManagedActionEmail(async (_url, init) => {
      sent.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response("{}", { status: 200 });
    });
    await actionEmail.sendPasswordResetEmail({ email: "USER@EXAMPLE.COM", continueUrl: "https://pdm.example.test/login" });
    record(
      "DEV045-P2-001 Firebase managed action email uses PASSWORD_RESET",
      sent[0]?.requestType === "PASSWORD_RESET" && sent[0]?.email === "user@example.com" && sent[0]?.canHandleCodeInApp === false,
      JSON.stringify(sent[0] ?? {})
    );

    const handoffSent = [];
    const fakeClient = {
      kind: "sqlite",
      async query() { return []; },
      async queryOne() {
        return { id: "user-dev045-qc-engineer", email: "dev045.qc.engineer@example.com", account_status: "active", system_role_enabled: 1 };
      },
      async execute(sql, params = {}) {
        if (sql.includes("audit_logs")) handoffSent.push(`audit:${params.action}`);
      },
      async transaction(fn) { return fn(this); },
      async close() {}
    };
    const fakeEmail = {
      async sendPasswordResetEmail(input) {
        handoffSent.push(`email:${input.email}:${input.continueUrl}`);
      }
    };
    await requestProviderRecoveryHandoffByEmailAsync({
      request: new Request("https://pdm.example.test/api/account-recovery/handoff", { headers: { "x-forwarded-for": "203.0.113.10" } }),
      email: "DEV045.QC.ENGINEER@EXAMPLE.COM",
      actionEmail: fakeEmail,
      client: fakeClient
    });
    record(
      "DEV045-P2-002 public handoff sends provider email without exposing token",
      handoffSent.some((item) => item.startsWith("email:dev045.qc.engineer@example.com:")) &&
        handoffSent.includes("audit:AccountProviderRecoveryHandoffRequested") &&
        !JSON.stringify(handoffSent).includes("token"),
      JSON.stringify(handoffSent)
    );
  } finally {
    if (originalEnv.apiKey === undefined) delete process.env.PDM_FIREBASE_API_KEY;
    else process.env.PDM_FIREBASE_API_KEY = originalEnv.apiKey;
    if (originalEnv.authDomain === undefined) delete process.env.PDM_FIREBASE_AUTH_DOMAIN;
    else process.env.PDM_FIREBASE_AUTH_DOMAIN = originalEnv.authDomain;
    if (originalEnv.projectId === undefined) delete process.env.PDM_FIREBASE_PROJECT_ID;
    else process.env.PDM_FIREBASE_PROJECT_ID = originalEnv.projectId;
    if (originalEnv.appId === undefined) delete process.env.PDM_FIREBASE_APP_ID;
    else process.env.PDM_FIREBASE_APP_ID = originalEnv.appId;
  }
}

let app;

try {
  await verifyProviderHandoffUnit();

  const port = await getFreePort();
  app = startApp(port);
  await waitForApp(app.baseUrl, app.getOutput);

  const first = await login(app.baseUrl, "DEV045-QC-Browser-A/1.0");
  const second = await login(app.baseUrl, "DEV045-QC-Browser-B/1.0");
  record("DEV045-P2-003 first login succeeds", first.response.status === 200 && first.cookie.includes("pdm_session="), `HTTP ${first.response.status}`);
  record("DEV045-P2-004 second login succeeds", second.response.status === 200 && second.cookie.includes("pdm_session="), `HTTP ${second.response.status}`);

  const sessionList = await requestJson(app.baseUrl, "/api/account/sessions", { headers: { cookie: second.cookie } });
  const sessions = Array.isArray(sessionList.body.sessions) ? sessionList.body.sessions : [];
  const current = sessions.find((session) => session.current && !session.revokedAt);
  const old = sessions.find((session) => !session.current && !session.revokedAt);
  record("DEV045-P2-005 self-service session list exposes current and other sessions", sessionList.response.status === 200 && current && old, JSON.stringify(sessions));
  record("DEV045-P2-006 session payload omits raw token and full user-agent", !JSON.stringify(sessions).includes(first.cookie.split("=")[1]) && !JSON.stringify(sessions).includes("DEV045-QC-Browser-A"), JSON.stringify(sessions));

  const currentRevoke = await requestJson(app.baseUrl, `/api/account/sessions/${encodeURIComponent(current.id)}/revoke`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: app.baseUrl, cookie: second.cookie },
    body: JSON.stringify({ reason: "QC current revoke must fail" })
  });
  record("DEV045-P2-007 current session cannot be revoked from session list", currentRevoke.response.status === 409, `HTTP ${currentRevoke.response.status} ${JSON.stringify(currentRevoke.body)}`);

  const revokeOld = await requestJson(app.baseUrl, `/api/account/sessions/${encodeURIComponent(old.id)}/revoke`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: app.baseUrl, cookie: second.cookie },
    body: JSON.stringify({ reason: "QC revoke old session" })
  });
  const oldMe = await requestJson(app.baseUrl, "/api/auth/me", { headers: { cookie: first.cookie } });
  const currentMe = await requestJson(app.baseUrl, "/api/auth/me", { headers: { cookie: second.cookie } });
  record("DEV045-P2-008 other session revoke succeeds", revokeOld.response.status === 200, `HTTP ${revokeOld.response.status}`);
  record("DEV045-P2-009 revoked old cookie is rejected", oldMe.response.status === 401, `HTTP ${oldMe.response.status}`);
  record("DEV045-P2-010 current cookie remains valid", currentMe.response.status === 200, `HTTP ${currentMe.response.status}`);

  const logout = await requestJson(app.baseUrl, "/api/auth/logout", {
    method: "POST",
    headers: { Origin: app.baseUrl, cookie: second.cookie }
  });
  const afterLogout = await requestJson(app.baseUrl, "/api/auth/me", { headers: { cookie: second.cookie } });
  record("DEV045-P2-011 logout succeeds", logout.response.status === 200, `HTTP ${logout.response.status}`);
  record("DEV045-P2-012 logged-out cookie is rejected by registry", afterLogout.response.status === 401, `HTTP ${afterLogout.response.status}`);

  const db = openDb();
  const rows = db.prepare("SELECT session_id_hash, user_agent_hash, ip_summary, revoked_at FROM account_session_records").all();
  db.close();
  record("DEV045-P2-013 registry persists only hashed session identifiers", rows.length >= 2 && rows.every((row) => String(row.session_id_hash).length === 64), JSON.stringify(rows));
  record("DEV045-P2-014 registry records revocation metadata", rows.some((row) => row.revoked_at), JSON.stringify(rows));

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({ passed: 0, failed: 1, results, error: error instanceof Error ? error.message : String(error), appOutput: app?.getOutput() ?? "" }, null, 2));
  process.exitCode = 1;
} finally {
  if (app) await stopApp(app.child);
  if (app?.distDir) await removeTempDir(app.distDir);
  await removeTempDir(tempDir);
}
