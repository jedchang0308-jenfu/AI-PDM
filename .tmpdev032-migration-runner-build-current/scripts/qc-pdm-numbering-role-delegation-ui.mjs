#!/usr/bin/env node

import { chromium } from "playwright";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const runId = Date.now().toString(36);
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function loginAsAdmin(context) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password })
  });
  record("Admin login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("Admin login returns session cookie", Boolean(name && valueParts.length > 0), cookie);
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
  return cookie;
}

async function fetchMatrix(cookie) {
  const response = await fetch(`${apiBaseUrl}/api/numbering/admin/matrix`, {
    headers: { cookie }
  });
  record("Admin matrix API can be read", response.ok, `HTTP ${response.status}`);
  return response.json();
}

async function waitForMatrix(cookie, predicate, detail) {
  let latest = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = await fetchMatrix(cookie);
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for matrix state: ${detail}`);
}

async function verifyDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const cookie = await loginAsAdmin(context);
  await page.goto(`${apiBaseUrl}/settings`, { waitUntil: "networkidle" });
  await page.getByText("角色權限矩陣").waitFor({ timeout: 10_000 });
  await page.getByText("最高權限排序").waitFor({ timeout: 10_000 });
  await page.getByText("主管範圍設定").waitFor({ timeout: 10_000 });
  await page.getByText("代理人設定").waitFor({ timeout: 10_000 });
  record("Role and delegation settings sections render", true);

  const roleCode = `qc_role_${runId}`;
  const roleTitle = `QC 自訂角色 ${runId}`;
  await page.getByLabel("自訂角色代碼").fill(roleCode);
  await page.getByLabel("自訂角色名稱").fill(roleTitle);
  await page.getByRole("button", { name: "新增角色" }).click();
  let matrix = await waitForMatrix(cookie, (body) => body.roles.some((role) => role.roleCode === roleCode), roleCode);
  const customRole = matrix.roles.find((role) => role.roleCode === roleCode);
  record("Custom role is persisted", Boolean(customRole), roleCode);
  await page.locator("td", { hasText: roleTitle }).first().waitFor({ timeout: 10_000 });

  await page.getByRole("checkbox", { name: `${roleTitle} numbering.request`, exact: true }).click();
  matrix = await waitForMatrix(
    cookie,
    (body) =>
      body.rolePermissions.some(
        (permission) => permission.roleId === customRole.id && permission.permissionKind === "page" && permission.permissionCode === "numbering.request" && permission.allowed
      ),
    "numbering.request"
  );
  record(
    "Role page permission is persisted",
    matrix.rolePermissions.some((permission) => permission.roleId === customRole.id && permission.permissionKind === "page" && permission.permissionCode === "numbering.request" && permission.allowed),
    "numbering.request"
  );

  await page.getByRole("checkbox", { name: `${roleTitle} release`, exact: true }).click();
  matrix = await waitForMatrix(
    cookie,
    (body) =>
      body.rolePermissions.some(
        (permission) => permission.roleId === customRole.id && permission.permissionKind === "action" && permission.permissionCode === "release" && permission.allowed
      ),
    "release"
  );
  record(
    "Role action permission is persisted",
    matrix.rolePermissions.some((permission) => permission.roleId === customRole.id && permission.permissionKind === "action" && permission.permissionCode === "release" && permission.allowed),
    "release"
  );

  await page.getByLabel("排序（逗號分隔）").fill(`system_admin, pdm_admin, rd_manager, qa, document_admin, ${roleCode}, rd`);
  await page.getByLabel("調整原因").fill(`QC role priority ${runId}`);
  await page.getByRole("button", { name: "儲存排序" }).click();
  matrix = await waitForMatrix(cookie, (body) => body.activeRolePriority.includes(roleCode), `role priority ${roleCode}`);
  record("Role priority version is active", matrix.activeRolePriority.includes(roleCode), matrix.activeRolePriority.join(","));

  const projectCode = `QC-PROJ-${runId}`;
  await page.getByTestId("role-scope-kind").selectOption("project");
  await page.getByTestId("role-scope-code").fill(projectCode);
  await page.getByRole("button", { name: "新增範圍" }).click();
  const managerRole = matrix.roles.find((role) => role.roleCode === "rd_manager");
  matrix = await waitForMatrix(
    cookie,
    (body) => body.roleScopes.some((scope) => scope.roleId === managerRole.id && scope.scopeKind === "project" && scope.scopeCode === projectCode && scope.allowed),
    projectCode
  );
  record(
    "Manager project scope is persisted",
    matrix.roleScopes.some((scope) => scope.roleId === managerRole.id && scope.scopeKind === "project" && scope.scopeCode === projectCode && scope.allowed),
    projectCode
  );

  await page.getByTestId("delegation-action").fill("release");
  await page.getByTestId("delegation-project").fill(projectCode);
  await page.getByTestId("delegation-reason").fill(`QC delegation ${runId}`);
  await page.getByRole("button", { name: "儲存代理" }).click();
  matrix = await waitForMatrix(cookie, (body) => body.approvalDelegations.some((item) => item.reason === `QC delegation ${runId}` && !item.revokedAt), `QC delegation ${runId}`);
  const delegation = matrix.approvalDelegations.find((item) => item.reason === `QC delegation ${runId}` && !item.revokedAt);
  record("Delegation is persisted", Boolean(delegation), `QC delegation ${runId}`);

  await page.getByRole("button", { name: "撤銷" }).first().click();
  matrix = await waitForMatrix(cookie, (body) => body.approvalDelegations.some((item) => item.id === delegation.id && item.revokedAt), delegation.id);
  const revoked = matrix.approvalDelegations.find((item) => item.id === delegation.id);
  record("Delegation can be revoked", Boolean(revoked?.revokedAt), revoked?.revokedAt ?? "");

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("Role delegation settings avoid page-level horizontal overflow on desktop", bodyOverflow <= 2, `${bodyOverflow}px`);
  record("No browser console errors on desktop", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

async function verifyMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 920 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await loginAsAdmin(context);
  await page.goto(`${apiBaseUrl}/settings`, { waitUntil: "networkidle" });
  await page.getByText("角色權限矩陣").waitFor({ timeout: 10_000 });
  await page.getByText("代理人設定").waitFor({ timeout: 10_000 });
  record("Role and delegation settings render on mobile", true);
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("Role delegation settings avoid page-level horizontal overflow on mobile", bodyOverflow <= 2, `${bodyOverflow}px`);
  record("No browser console errors on mobile", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyDesktop(browser);
  await verifyMobile(browser);
} finally {
  await browser.close();
}

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
