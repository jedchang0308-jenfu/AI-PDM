import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-managed-auth-"));
const bootstrapPassword = "Managed-QC-Password-2026";
const expectedPersistentMaxAgeSeconds = 60 * 60 * 24 * 400;
const bootstrapUsers = [
  {
    id: "user-qc-engineer",
    displayName: "QC Engineer",
    email: "qc.engineer@example.com",
    password: bootstrapPassword,
    role: "Engineer"
  },
  {
    id: "user-qc-manager",
    displayName: "QC Manager",
    email: "qc.manager@example.com",
    password: bootstrapPassword,
    role: "R&D Manager"
  },
  {
    id: "user-qc-admin",
    displayName: "QC Admin",
    email: "qc.admin@example.com",
    password: bootstrapPassword,
    role: "Admin"
  }
];

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
  const distDirRelative = ".tmp/next-qc-managed-auth";
  const distDir = path.join(root, ...distDirRelative.split("/"));
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "managed",
      PDM_BOOTSTRAP_USERS: JSON.stringify(bootstrapUsers),
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_RELEASE_MODE: "local_stub",
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  return { child, distDir, getOutput: () => output };
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
    } catch (error) {
      if (attempt === 5) {
        console.warn(`Managed auth QC temp cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      await delay(500);
    }
  }
}

async function waitForApp(baseUrl, getOutput) {
  const deadline = Date.now() + 30000;
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

async function login(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json().catch(() => ({}));
  const setCookie = response.headers.get("set-cookie") ?? "";
  return {
    status: response.status,
    body,
    setCookie,
    cookie: setCookie.split(";")[0] ?? ""
  };
}

async function requestToken(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    body
  };
}

function expect(name, actual, expected) {
  const passed = actual === expected;
  return { name, passed, actual, expected };
}

let app;
const results = [];

try {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  app = startApp(port);
  await waitForApp(baseUrl, app.getOutput);

  const demoEngineerLogin = await login(baseUrl, "engineer@example.com", "pdm-demo");
  const managedEngineerLogin = await login(baseUrl, "qc.engineer@example.com", bootstrapPassword);
  const managedManagerLogin = await login(baseUrl, "qc.manager@example.com", bootstrapPassword);
  const managedAdminLogin = await login(baseUrl, "qc.admin@example.com", bootstrapPassword);
  const autoDemoAdminLogin = await login(baseUrl, "admin@example.com", "pdm-demo");
  const managedAdminToken = await requestToken(baseUrl, "qc.admin@example.com", bootstrapPassword);

  const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
    headers: { cookie: managedAdminLogin.cookie }
  });
  const settingsBody = await settingsResponse.json().catch(() => ({}));
  const tokenSettingsResponse = await fetch(`${baseUrl}/api/settings`, {
    headers: { authorization: `Bearer ${managedAdminToken.body?.token ?? ""}` }
  });
  const cookieMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: managedAdminLogin.cookie }
  });
  const cookieMeSetCookie = cookieMeResponse.headers.get("set-cookie") ?? "";
  const cookieMeBody = await cookieMeResponse.json().catch(() => ({}));
  const tokenMeResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${managedAdminToken.body?.token ?? ""}` }
  });
  const tokenMeSetCookie = tokenMeResponse.headers.get("set-cookie") ?? "";
  const tokenMeBody = await tokenMeResponse.json().catch(() => ({}));
  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: managedAdminLogin.cookie }
  });
  const logoutCookie = logoutResponse.headers.get("set-cookie") ?? "";
  const qcDatabase = new Database(path.join(tempDir, "ai-pdm.sqlite"), { readonly: true });
  const adminLoginAudit = qcDatabase
    .prepare("SELECT COUNT(*) count FROM audit_logs WHERE actor_id = ? AND action = 'Login'")
    .get("user-qc-admin");
  const adminTokenAudit = qcDatabase
    .prepare("SELECT COUNT(*) count FROM audit_logs WHERE actor_id = ? AND action = 'Login' AND detail_json LIKE ?")
    .get("user-qc-admin", "%SolidWorks Add-in%");
  const adminLogoutAudit = qcDatabase
    .prepare("SELECT COUNT(*) count FROM audit_logs WHERE actor_id = ? AND action = 'Logout'")
    .get("user-qc-admin");
  qcDatabase.close();

  results.push(expect("AUTHMODE-001 demo engineer is blocked in managed mode", demoEngineerLogin.status, 401));
  results.push(expect("AUTHMODE-002 managed engineer can login", managedEngineerLogin.status, 200));
  results.push(expect("AUTHMODE-003 managed manager can login", managedManagerLogin.status, 200));
  results.push(expect("AUTHMODE-004 managed admin can login", managedAdminLogin.status, 200));
  results.push(expect("AUTHMODE-005 demo admin is not auto-created in managed mode", autoDemoAdminLogin.status, 401));
  results.push(expect("AUTHMODE-006 managed admin can read settings", settingsResponse.status, 200));
  results.push(expect("AUTHMODE-007 settings reports managed auth mode", settingsBody.settings?.authMode, "managed"));
  results.push(expect("AUTHMODE-008 managed admin can request bearer token", managedAdminToken.status, 200));
  results.push(expect("AUTHMODE-009 bearer token can read settings", tokenSettingsResponse.status, 200));
  results.push(expect("AUTHMODE-010 cookie session can read auth/me", cookieMeResponse.status, 200));
  results.push(expect("AUTHMODE-011 auth/me returns managed admin user", cookieMeBody.user?.id, "user-qc-admin"));
  results.push(expect("AUTHMODE-012 bearer token can read auth/me", tokenMeResponse.status, 200));
  results.push(expect("AUTHMODE-013 bearer auth/me returns managed admin user", tokenMeBody.user?.id, "user-qc-admin"));
  results.push(expect("AUTHMODE-014 logout returns 200", logoutResponse.status, 200));
  results.push(expect("AUTHMODE-015 logout clears session cookie", logoutCookie.includes("Max-Age=0"), true));
  results.push(expect("AUTHMODE-016 login and token write audit logs", Number(adminLoginAudit?.count ?? 0) >= 2, true));
  results.push(expect("AUTHMODE-017 token audit records client marker", Number(adminTokenAudit?.count ?? 0) >= 1, true));
  results.push(expect("AUTHMODE-018 logout writes audit log", Number(adminLogoutAudit?.count ?? 0) >= 1, true));
  results.push(
    expect(
      "AUTHMODE-019 login issues persistent session cookie",
      managedAdminLogin.setCookie.includes(`Max-Age=${expectedPersistentMaxAgeSeconds}`),
      true
    )
  );
  results.push(
    expect(
      "AUTHMODE-020 cookie auth/me refreshes persistent session cookie",
      cookieMeSetCookie.includes("pdm_session=") && cookieMeSetCookie.includes(`Max-Age=${expectedPersistentMaxAgeSeconds}`),
      true
    )
  );
  results.push(expect("AUTHMODE-021 bearer auth/me does not create browser session cookie", tokenMeSetCookie, ""));

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        passed: 0,
        failed: 1,
        results,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  if (app) await stopApp(app.child);
  if (app?.distDir) await removeTempDir(app.distDir);
  await removeTempDir(tempDir);
}
