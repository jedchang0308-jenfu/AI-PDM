#!/usr/bin/env node

import { chromium } from "playwright";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`${email} login succeeds`, response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  record(`${email} login returns session cookie`, Boolean(cookie), cookie);
  return cookie;
}

async function addCookie(context, cookie) {
  const [name, ...valueParts] = cookie.split("=");
  const url = new URL(apiBaseUrl);
  await context.addCookies([
    {
      name,
      value: valueParts.join("="),
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
}

async function apiGet(path, cookie) {
  return fetch(`${apiBaseUrl}${path}`, { headers: { cookie } });
}

async function apiPatchMatrix(cookie, body) {
  const response = await fetch(`${apiBaseUrl}/api/numbering/admin/matrix`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body)
  });
  record(`Matrix PATCH ${body.permissionCode ?? body.permission_code ?? body.operation} succeeds`, response.ok, `HTTP ${response.status}`);
  return response.json();
}

async function fetchMatrix(cookie) {
  const response = await apiGet("/api/numbering/admin/matrix", cookie);
  record("Admin matrix API can be read", response.ok, `HTTP ${response.status}`);
  return response.json();
}

async function fetchPermissions(cookie) {
  const response = await apiGet("/api/numbering/permissions", cookie);
  record("Permission API can be read", response.ok, `HTTP ${response.status}`);
  return response.json();
}

function rolePermissionEnabled(matrix, roleId, permissionKind, permissionCode) {
  return matrix.rolePermissions.some(
    (permission) => permission.roleId === roleId && permission.permissionKind === permissionKind && permission.permissionCode === permissionCode && permission.allowed
  );
}

async function setRolePermission(cookie, role, permissionKind, permissionCode, allowed) {
  await apiPatchMatrix(cookie, {
    operation: "role_permission",
    roleId: role.id,
    permissionKind,
    permissionCode,
    allowed
  });
}

async function waitForPermission(cookie, role, permissionKind, permissionCode, allowed) {
  let latest = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = await fetchMatrix(cookie);
    if (rolePermissionEnabled(latest, role.id, permissionKind, permissionCode) === allowed) return latest;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${role.roleCode} ${permissionKind} ${permissionCode}=${allowed}`);
}

async function assertEngineerRecordCreate(cookie, expectedStatus) {
  const response = await fetch(`${apiBaseUrl}/api/numbering/records`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      coreName: "QC permission denied probe",
      partName: "QC permission denied probe",
      itemKind: "manufactured",
      developmentPhase: "EVT",
      drawingRequested: false
    })
  });
  record(`Engineer record create returns ${expectedStatus}`, response.status === expectedStatus, `HTTP ${response.status}`);
}

async function verifySidebar(browser, cookie, shouldShowRequestLink, viewportName, viewport) {
  const context = await browser.newContext({ viewport });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await addCookie(context, cookie);
  await page.goto(`${apiBaseUrl}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    (expected) => Boolean(document.querySelector('.sidebar a[href="/numbering/request"]')) === expected,
    shouldShowRequestLink,
    { timeout: 10_000 }
  );
  const requestLinkCount = await page.locator('.sidebar a[href="/numbering/request"]').count();
  record(
    `${viewportName} sidebar request link ${shouldShowRequestLink ? "visible" : "hidden"}`,
    shouldShowRequestLink ? requestLinkCount > 0 : requestLinkCount === 0,
    String(requestLinkCount)
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${viewportName} sidebar has no page-level horizontal overflow`, overflow <= 2, `${overflow}px`);
  record(`${viewportName} sidebar has no console errors`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

const adminCookie = await login("admin@example.com");
const engineerCookie = await login("engineer@example.com");
let matrix = await fetchMatrix(adminCookie);
const rdRole = matrix.roles.find((role) => role.roleCode === "rd");
record("RD role exists in admin matrix", Boolean(rdRole), "rd");

const originalPageAllowed = rolePermissionEnabled(matrix, rdRole.id, "page", "numbering.request");
const originalActionAllowed = rolePermissionEnabled(matrix, rdRole.id, "action", "numbering.create");

const browser = await chromium.launch({ headless: true });
try {
  await setRolePermission(adminCookie, rdRole, "page", "numbering.request", true);
  await setRolePermission(adminCookie, rdRole, "action", "numbering.create", true);
  await waitForPermission(adminCookie, rdRole, "page", "numbering.request", true);
  await waitForPermission(adminCookie, rdRole, "action", "numbering.create", true);
  let permissions = await fetchPermissions(engineerCookie);
  record("Engineer request page permission can be enabled", permissions.pages["numbering.request"] === true, JSON.stringify(permissions.pages));
  record("Engineer create action permission can be enabled", permissions.actions["numbering.create"] === true, JSON.stringify(permissions.actions));
  await verifySidebar(browser, engineerCookie, true, "desktop enabled", { width: 1440, height: 1100 });

  await setRolePermission(adminCookie, rdRole, "page", "numbering.request", false);
  await setRolePermission(adminCookie, rdRole, "action", "numbering.create", false);
  await waitForPermission(adminCookie, rdRole, "page", "numbering.request", false);
  await waitForPermission(adminCookie, rdRole, "action", "numbering.create", false);
  permissions = await fetchPermissions(engineerCookie);
  record("Engineer request page permission can be disabled", permissions.pages["numbering.request"] === false, JSON.stringify(permissions.pages));
  record("Engineer create action permission can be disabled", permissions.actions["numbering.create"] === false, JSON.stringify(permissions.actions));
  await assertEngineerRecordCreate(engineerCookie, 403);
  await verifySidebar(browser, engineerCookie, false, "desktop disabled", { width: 1440, height: 1100 });
  await verifySidebar(browser, engineerCookie, false, "mobile disabled", { width: 390, height: 920 });
} finally {
  await setRolePermission(adminCookie, rdRole, "page", "numbering.request", originalPageAllowed);
  await setRolePermission(adminCookie, rdRole, "action", "numbering.create", originalActionAllowed);
  await browser.close();
}

const restoredPermissions = await fetchPermissions(engineerCookie);
record("Engineer request page permission restored", restoredPermissions.pages["numbering.request"] === originalPageAllowed, JSON.stringify(restoredPermissions.pages));
record("Engineer create action permission restored", restoredPermissions.actions["numbering.create"] === originalActionAllowed, JSON.stringify(restoredPermissions.actions));

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
