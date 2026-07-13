#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-account-lifecycle-"));
const password = "Lifecycle-QC-Password-2026";
const newPassword = "Lifecycle-QC-New-2026";
const resetPassword = "Lifecycle-QC-Reset-2026";
const unique = Date.now().toString().slice(-8);
const bootstrapUsers = [
  { id: "user-lifecycle-qc-admin", displayName: "Lifecycle QC Admin", email: "lifecycle.qc.admin@example.com", password, role: "Admin" },
  { id: "user-lifecycle-qc-admin2", displayName: "Lifecycle QC Admin 2", email: "lifecycle.qc.admin2@example.com", password, role: "Admin" },
  { id: "user-lifecycle-qc-engineer", displayName: "Lifecycle QC Engineer", email: "lifecycle.qc.engineer@example.com", password, role: "Engineer" },
  { id: "user-lifecycle-qc-reset", displayName: "Lifecycle QC Reset", email: "lifecycle.qc.reset@example.com", password, role: "Engineer" }
];

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
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
        if (!port) reject(new Error("Unable to allocate a local port"));
        else resolve(port);
      });
    });
  });
}

function startApp(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const distDirRelative = ".tmp/next-qc-account-lifecycle";
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "managed",
      PDM_AUTH_SECRET: "account-lifecycle-qc-secret",
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
  const deadline = Date.now() + 45000;
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

async function login(baseUrl, email, loginPassword = password) {
  const result = await requestJson(baseUrl, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: loginPassword })
  });
  const cookie = (result.response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return { ...result, cookie };
}

function openDb() {
  return new Database(path.join(tempDir, "ai-pdm.sqlite"));
}

function findIdentity(userId, provider) {
  const db = openDb();
  try {
    return db.prepare("SELECT * FROM auth_identities WHERE user_id = ? AND provider = ?").get(userId, provider);
  } finally {
    db.close();
  }
}

function addGoogleIdentity(userId) {
  const db = openDb();
  try {
    db.prepare(
      `INSERT OR IGNORE INTO auth_identities (
        id, user_id, provider, provider_subject, login_identifier, email_normalized,
        verified_at, last_login_at, status, created_at, updated_at
      ) VALUES (?, ?, 'google_oauth', ?, ?, ?, datetime('now'), NULL, 'active', datetime('now'), datetime('now'))`
    ).run(`identity-google-${userId}`, userId, `google-${userId}`, `${userId}@google.example.com`, `${userId}@google.example.com`);
  } finally {
    db.close();
  }
}

let app;

try {
  const port = await getFreePort();
  app = startApp(port);
  await waitForApp(app.baseUrl, app.getOutput);

  const admin = await login(app.baseUrl, "lifecycle.qc.admin@example.com");
  const engineer = await login(app.baseUrl, "lifecycle.qc.engineer@example.com");
  record("ACCT-001 admin login succeeds", admin.response.status === 200, `HTTP ${admin.response.status}`);
  record("ACCT-002 engineer login succeeds", engineer.response.status === 200, `HTTP ${engineer.response.status}`);

  const adminPage = await fetch(`${app.baseUrl}/settings/accounts`, { headers: { cookie: admin.cookie } });
  const blockedList = await requestJson(app.baseUrl, "/api/admin/accounts", { headers: { cookie: engineer.cookie } });
  record("ACCT-003 account console page renders for admin", adminPage.status === 200, `HTTP ${adminPage.status}`);
  record("ACCT-004 non-admin cannot list accounts", blockedList.response.status === 403, `HTTP ${blockedList.response.status}`);

  const list = await requestJson(app.baseUrl, "/api/admin/accounts", { headers: { cookie: admin.cookie } });
  const listText = JSON.stringify(list.body);
  record("ACCT-005 admin can list accounts", list.response.status === 200, `HTTP ${list.response.status}`);
  record("ACCT-006 account list exposes no token/hash/secret fields", !/token_hash|password_hash|secret|Lifecycle-QC-Password/u.test(listText), listText);

  const engineerId = "user-lifecycle-qc-engineer";
  const revoke = await requestJson(app.baseUrl, `/api/admin/accounts/${engineerId}/sessions/revoke`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ reason: "QC session revoke" })
  });
  const oldSessionMe = await requestJson(app.baseUrl, "/api/auth/me", { headers: { cookie: engineer.cookie } });
  record("ACCT-007 admin can revoke all sessions", revoke.response.status === 200, `HTTP ${revoke.response.status}`);
  record("ACCT-008 revoked cookie is rejected", oldSessionMe.response.status === 401, `HTTP ${oldSessionMe.response.status}`);

  const engineerAfterRevoke = await login(app.baseUrl, "lifecycle.qc.engineer@example.com");
  const suspend = await requestJson(app.baseUrl, `/api/admin/accounts/${engineerId}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ action: "suspend", reason: "QC suspend" })
  });
  const suspendedLogin = await login(app.baseUrl, "lifecycle.qc.engineer@example.com");
  const suspendedOldSession = await requestJson(app.baseUrl, "/api/auth/me", { headers: { cookie: engineerAfterRevoke.cookie } });
  record("ACCT-009 admin can suspend account", suspend.response.status === 200, `HTTP ${suspend.response.status}`);
  record("ACCT-010 suspended account cannot login", suspendedLogin.response.status === 401, `HTTP ${suspendedLogin.response.status}`);
  record("ACCT-011 suspended account old session is rejected", suspendedOldSession.response.status === 401, `HTTP ${suspendedOldSession.response.status}`);

  const reactivate = await requestJson(app.baseUrl, `/api/admin/accounts/${engineerId}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ action: "reactivate", reason: "QC reactivate" })
  });
  const reactivatedLogin = await login(app.baseUrl, "lifecycle.qc.engineer@example.com");
  record("ACCT-012 admin can reactivate account", reactivate.response.status === 200, `HTTP ${reactivate.response.status}`);
  record("ACCT-013 reactivated account can login", reactivatedLogin.response.status === 200, `HTTP ${reactivatedLogin.response.status}`);

  const resetUserId = "user-lifecycle-qc-reset";
  addGoogleIdentity(resetUserId);
  const localIdentity = findIdentity(resetUserId, "local_password");
  const disableLocal = await requestJson(app.baseUrl, `/api/admin/accounts/${resetUserId}/identities/${localIdentity.id}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ status: "disabled", reason: "QC disable local identity" })
  });
  record("ACCT-014 admin can disable non-last identity", disableLocal.response.status === 200, `HTTP ${disableLocal.response.status}`);

  const reset = await requestJson(app.baseUrl, `/api/admin/accounts/${resetUserId}/password-reset`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ expiresInMinutes: 60 })
  });
  const resetUrl = String(reset.body.resetUrl ?? "");
  const resetToken = resetUrl ? new URL(resetUrl).hash.replace(/^#token=/, "") : "";
  record("ACCT-015 admin can create one-time password reset URL", reset.response.status === 201 && resetToken.length >= 40, resetUrl);

  const dbBeforeReset = openDb();
  const storedReset = dbBeforeReset.prepare("SELECT token_hash FROM account_recovery_requests WHERE id = ?").get(reset.body.request?.id);
  dbBeforeReset.close();
  record("ACCT-016 password reset stores only token hash", String(storedReset?.token_hash ?? "").length === 64 && !String(storedReset?.token_hash ?? "").includes(resetToken), JSON.stringify(storedReset));

  const lookup = await requestJson(app.baseUrl, "/api/account-recovery/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: decodeURIComponent(resetToken) })
  });
  const complete = await requestJson(app.baseUrl, "/api/account-recovery/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: decodeURIComponent(resetToken), password: resetPassword })
  });
  const reuse = await requestJson(app.baseUrl, "/api/account-recovery/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: decodeURIComponent(resetToken), password: resetPassword })
  });
  const disabledLocalLogin = await login(app.baseUrl, "lifecycle.qc.reset@example.com", resetPassword);
  const localAfterReset = findIdentity(resetUserId, "local_password");
  record("ACCT-017 public reset lookup works", lookup.response.status === 200, `HTTP ${lookup.response.status}`);
  record("ACCT-018 public reset completion works once", complete.response.status === 200, `HTTP ${complete.response.status}`);
  record("ACCT-019 password reset link cannot be reused", reuse.response.status === 410, `HTTP ${reuse.response.status}`);
  record("ACCT-020 reset does not enable disabled local identity", localAfterReset.status === "disabled" && disabledLocalLogin.response.status === 401, JSON.stringify(localAfterReset));

  const roleCode = `qc_lifecycle_${unique}`;
  const roleId = `role-qc-lifecycle-${unique}`;
  const createRole = await requestJson(app.baseUrl, "/api/numbering/admin/matrix", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ operation: "role", id: roleId, roleCode, title: `QC lifecycle ${unique}` })
  });
  const matrixBeforeTimeWindow = await requestJson(app.baseUrl, "/api/numbering/admin/matrix", { headers: { cookie: admin.cookie } });
  const rdRole = matrixBeforeTimeWindow.body.roles?.find((role) => role.roleCode === "rd");
  if (rdRole?.id) {
    await requestJson(app.baseUrl, "/api/numbering/admin/matrix", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: admin.cookie },
      body: JSON.stringify({ operation: "role_permission", roleId: rdRole.id, permissionKind: "action", permissionCode: "numbering.audit_report.generate", allowed: false })
    });
  }
  await requestJson(app.baseUrl, "/api/numbering/admin/matrix", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({ operation: "role_permission", roleId, permissionKind: "action", permissionCode: "numbering.audit_report.generate", allowed: true })
  });
  await requestJson(app.baseUrl, "/api/numbering/admin/matrix", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({
      operation: "role_priority",
      priority: [roleCode, "system_admin", "pdm_admin", "rd_manager", "qa", "rd", "manufacturing", "procurement", "external_specialist"],
      reason: "QC time-window role priority"
    })
  });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const futureAssignment = await requestJson(app.baseUrl, "/api/numbering/admin/matrix", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({
      operation: "role_assignment",
      userId: engineerId,
      roleId,
      startsAt: tomorrow,
      reason: "QC future role assignment"
    })
  });
  const futurePermission = await requestJson(app.baseUrl, "/api/numbering/permissions", { headers: { cookie: reactivatedLogin.cookie } });
  await requestJson(app.baseUrl, "/api/numbering/admin/matrix", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({
      operation: "role_assignment",
      id: futureAssignment.body.assignment?.id,
      userId: engineerId,
      roleId,
      startsAt: yesterday,
      hardEndsAt: tomorrow,
      reason: "QC active role assignment"
    })
  });
  const activePermission = await requestJson(app.baseUrl, "/api/numbering/permissions", { headers: { cookie: reactivatedLogin.cookie } });
  await requestJson(app.baseUrl, "/api/numbering/admin/matrix", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: admin.cookie },
    body: JSON.stringify({
      operation: "role_assignment",
      id: futureAssignment.body.assignment?.id,
      userId: engineerId,
      roleId,
      startsAt: yesterday,
      hardEndsAt: yesterday,
      reason: "QC expired role assignment"
    })
  });
  const expiredPermission = await requestJson(app.baseUrl, "/api/numbering/permissions", { headers: { cookie: reactivatedLogin.cookie } });
  record("ACCT-021 custom role was created for time-window verification", createRole.response.status === 200, `HTTP ${createRole.response.status}`);
  record("ACCT-022 future role assignment does not grant permission", futurePermission.body.actions?.["numbering.audit_report.generate"] === false, JSON.stringify(futurePermission.body.actions));
  record("ACCT-023 active role assignment grants permission", activePermission.body.actions?.["numbering.audit_report.generate"] === true, JSON.stringify(activePermission.body.actions));
  record("ACCT-024 expired role assignment no longer grants permission", expiredPermission.body.actions?.["numbering.audit_report.generate"] === false, JSON.stringify(expiredPermission.body.actions));

  const db = openDb();
  const auditRows = db.prepare("SELECT action, detail_json FROM audit_logs WHERE action LIKE 'Account%' ORDER BY created_at DESC").all();
  const recoveryBody = JSON.stringify(db.prepare("SELECT * FROM account_recovery_requests").all());
  db.close();
  record("ACCT-025 lifecycle actions write audit evidence without reset token", auditRows.length >= 5 && !JSON.stringify(auditRows).includes(resetToken), JSON.stringify(auditRows));
  record("ACCT-026 recovery table does not persist raw reset URL/token", !recoveryBody.includes(resetUrl) && !recoveryBody.includes(resetToken), recoveryBody);

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
