#!/usr/bin/env node

import Database from "better-sqlite3";
import { chromium } from "playwright";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-cross-role-permission" });
const unique = Date.now().toString().slice(-8);
const testRoleCode = `qc_cross_${unique}`;
const testRoleId = `role-qc-cross-${unique}`;
const results = [];
const created = {
  rootCodes: [],
  assignmentIds: []
};

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function openDb() {
  return new Database(dbPath);
}

function cleanupDb() {
  const db = openDb();
  try {
    const rootCodes = created.rootCodes.filter(Boolean);
    if (rootCodes.length > 0) {
      const placeholders = rootCodes.map(() => "?").join(",");
      const roots = db.prepare(`SELECT id FROM part_roots WHERE root_code IN (${placeholders})`).all(...rootCodes);
      const rootIds = roots.map((row) => row.id);
      if (rootIds.length > 0) {
        const rootPlaceholders = rootIds.map(() => "?").join(",");
        const partIds = db.prepare(`SELECT id FROM part_numbers WHERE part_root_id IN (${rootPlaceholders})`).all(...rootIds).map((row) => row.id);
        const drawingIds = db.prepare(`SELECT id FROM drawing_numbers WHERE part_root_id IN (${rootPlaceholders})`).all(...rootIds).map((row) => row.id);
        const entityIds = [...rootIds, ...partIds, ...drawingIds];
        if (entityIds.length > 0) {
          const entityPlaceholders = entityIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM warning_events WHERE entity_id IN (${entityPlaceholders})`).run(...entityIds);
          db.prepare(`DELETE FROM numbering_task_items WHERE entity_id IN (${entityPlaceholders})`).run(...entityIds);
          db.prepare(`DELETE FROM numbering_notifications WHERE entity_id IN (${entityPlaceholders})`).run(...entityIds);
        }
        if (drawingIds.length > 0) {
          const drawingPlaceholders = drawingIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM same_drawing_variants WHERE drawing_number_id IN (${drawingPlaceholders})`).run(...drawingIds);
          db.prepare(`DELETE FROM drawing_part_links WHERE drawing_number_id IN (${drawingPlaceholders})`).run(...drawingIds);
        }
        if (partIds.length > 0) {
          const partPlaceholders = partIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM same_drawing_variants WHERE part_number_id IN (${partPlaceholders})`).run(...partIds);
          db.prepare(`DELETE FROM drawing_part_links WHERE part_number_id IN (${partPlaceholders})`).run(...partIds);
        }
        db.prepare(`DELETE FROM drawing_numbers WHERE part_root_id IN (${rootPlaceholders})`).run(...rootIds);
        db.prepare(`DELETE FROM part_numbers WHERE part_root_id IN (${rootPlaceholders})`).run(...rootIds);
        db.prepare(`DELETE FROM part_roots WHERE id IN (${rootPlaceholders})`).run(...rootIds);
      }
    }

    db.prepare("DELETE FROM user_role_assignments WHERE role_id = ? OR id LIKE ?").run(testRoleId, `user-role-qc-cross-${unique}%`);
    db.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(testRoleId);
    db.prepare("DELETE FROM role_scope_rules WHERE role_id = ?").run(testRoleId);
    db.prepare("DELETE FROM roles WHERE id = ?").run(testRoleId);
  } finally {
    db.close();
  }
}

async function login(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`${email} login succeeds`, response.status === 200, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  record(`${email} login returns session cookie`, Boolean(cookie), cookie ? "cookie received" : "missing cookie");
  return cookie;
}

async function request(method, urlPath, cookie, body, expectedStatus = 200) {
  const response = await fetch(`${apiBaseUrl}${urlPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  record(`${method} ${urlPath} returns ${expected.join("/")}`, expected.includes(response.status), `HTTP ${response.status}`);
  return data;
}

async function patchMatrix(cookie, body) {
  return request("PATCH", "/api/numbering/admin/matrix", cookie, body, 200);
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

function rolePermissionEnabled(matrix, roleId, permissionKind, permissionCode) {
  return matrix.rolePermissions.some(
    (permission) => permission.roleId === roleId && permission.permissionKind === permissionKind && permission.permissionCode === permissionCode && permission.allowed
  );
}

async function waitForPermission(cookie, userCookie, permissionKind, permissionCode, expected) {
  let latest = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = await request("GET", "/api/numbering/permissions", userCookie);
    const bucket = permissionKind === "page" ? latest.pages : latest.actions;
    if (bucket?.[permissionCode] === expected) return latest;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${permissionKind}:${permissionCode}=${expected}`);
}

function latestAssignmentAudit(roleCode) {
  const db = openDb();
  try {
    const rows = db
      .prepare("SELECT detail_json FROM audit_logs WHERE action = 'numbering.user_role_assignment.upsert' ORDER BY created_at DESC LIMIT 20")
      .all();
    for (const row of rows) {
      const detail = JSON.parse(row.detail_json);
      if (detail.after?.roleCode === roleCode || detail.roleCode === roleCode) return detail;
    }
    return null;
  } finally {
    db.close();
  }
}

async function verifySettingsUi(cookie, expectedRoleLabel) {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [viewportName, viewport] of [
      ["desktop", { width: 1440, height: 1100 }],
      ["mobile", { width: 390, height: 920 }]
    ]) {
      const context = await browser.newContext({ viewport });
      const consoleErrors = [];
      const page = await context.newPage();
      await page.route("**/api/settings/gdrive/folders**", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ folders: [] })
      }));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      await addCookie(context, cookie);
      await page.goto(`${apiBaseUrl}/settings/workflow`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="access-tab-user_access"]').click();
      await page.locator('[data-testid="role-assignment-user"]').waitFor({ timeout: 10_000 });
      await page.locator('[data-testid="role-assignment-role"]').waitFor({ timeout: 10_000 });
      await page.locator('[data-testid="role-assignment-reason"]').waitFor({ timeout: 10_000 });
      const roleVisible = await page.getByText(expectedRoleLabel).count();
      record(`${viewportName} settings renders role assignment panel`, roleVisible > 0, `${expectedRoleLabel} count=${roleVisible}`);
      record(`${viewportName} settings role assignment panel has no console errors`, consoleErrors.length === 0, consoleErrors.join("\n"));
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

let adminCookie = "";
let engineerCookie = "";
let originalRdPageAllowed = null;
let originalRdActionAllowed = null;
let originalPriority = null;
let rdRole = null;
let testRole = null;

try {
  adminCookie = await login("admin@example.com");
  engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");

  let matrix = await request("GET", "/api/numbering/admin/matrix", adminCookie);
  rdRole = matrix.roles.find((role) => role.roleCode === "rd");
  const managerRole = matrix.roles.find((role) => role.roleCode === "rd_manager");
  const pdmAdminRole = matrix.roles.find((role) => role.roleCode === "pdm_admin");
  const systemAdminRole = matrix.roles.find((role) => role.roleCode === "system_admin");
  record("Matrix includes RD, manager, PDM admin, and system admin roles", Boolean(rdRole && managerRole && pdmAdminRole && systemAdminRole), JSON.stringify(matrix.roles.map((role) => role.roleCode)));

  originalPriority = matrix.activeRolePriority;
  originalRdPageAllowed = rolePermissionEnabled(matrix, rdRole.id, "page", "numbering.request");
  originalRdActionAllowed = rolePermissionEnabled(matrix, rdRole.id, "action", "numbering.create");

  const adminPermissions = await request("GET", "/api/numbering/permissions", adminCookie);
  record("Admin has settings matrix action through system/PDM admin roles", adminPermissions.actions?.["settings.admin_matrix"] === true, JSON.stringify(adminPermissions.actions));
  const managerPermissions = await request("GET", "/api/numbering/permissions", managerCookie);
  record("R&D manager has batch decision action through manager role", managerPermissions.actions?.["numbering.approval.batch.decide"] === true, JSON.stringify(managerPermissions.actions));

  await patchMatrix(adminCookie, { operation: "role", id: testRoleId, roleCode: testRoleCode, title: `QC Cross Role ${unique}` });
  matrix = await request("GET", "/api/numbering/admin/matrix", adminCookie);
  testRole = matrix.roles.find((role) => role.roleCode === testRoleCode);
  record("Custom role can be created in admin matrix", Boolean(testRole), testRoleCode);

  await patchMatrix(adminCookie, { operation: "role_permission", roleId: testRole.id, permissionKind: "page", permissionCode: "numbering.request", allowed: true });
  await patchMatrix(adminCookie, { operation: "role_permission", roleId: testRole.id, permissionKind: "action", permissionCode: "numbering.create", allowed: true });
  await patchMatrix(adminCookie, { operation: "role_permission", roleId: rdRole.id, permissionKind: "page", permissionCode: "numbering.request", allowed: false });
  await patchMatrix(adminCookie, { operation: "role_permission", roleId: rdRole.id, permissionKind: "action", permissionCode: "numbering.create", allowed: false });
  await patchMatrix(adminCookie, {
    operation: "role_priority",
    priority: [testRoleCode, ...originalPriority.filter((roleCode) => roleCode !== testRoleCode)],
    reason: `QC custom role priority ${unique}`
  });

  await waitForPermission(adminCookie, engineerCookie, "page", "numbering.request", false);
  await waitForPermission(adminCookie, engineerCookie, "action", "numbering.create", false);
  await request(
    "POST",
    "/api/numbering/records",
    engineerCookie,
    {
      coreName: `QC cross-role denied ${unique}`,
      partName: `QC cross-role denied ${unique}`,
      itemKind: "manufactured",
      drawingRequested: false
    },
    403
  );

  const assignmentResult = await patchMatrix(adminCookie, {
    operation: "role_assignment",
    userId: "user-engineer-demo",
    roleId: testRole.id,
    reason: `QC custom role assignment ${unique}`
  });
  const assignment = assignmentResult.assignment;
  created.assignmentIds.push(assignment.id);
  record("Role assignment API returns active custom assignment", assignment.userId === "user-engineer-demo" && assignment.roleCode === testRoleCode && !assignment.revokedAt, JSON.stringify(assignment));

  const grantedPages = await waitForPermission(adminCookie, engineerCookie, "page", "numbering.request", true);
  const grantedActions = await waitForPermission(adminCookie, engineerCookie, "action", "numbering.create", true);
  record("Engineer gains request page through assigned custom role", grantedPages.pages?.["numbering.request"] === true, JSON.stringify(grantedPages.pages));
  record("Engineer gains create action through assigned custom role", grantedActions.actions?.["numbering.create"] === true, JSON.stringify(grantedActions.actions));

  const numbering = await request(
    "POST",
    "/api/numbering/records",
    engineerCookie,
    {
      coreName: `QC cross-role grant ${unique}`,
      partName: `QC cross-role grant ${unique}`,
      itemKind: "manufactured",
      drawingRequested: false
    },
    201
  );
  created.rootCodes.push(numbering.root?.rootCode);
  record("Engineer can allocate numbering after custom role assignment", Boolean(numbering.root?.rootCode && numbering.partNumber?.partNumber), JSON.stringify(numbering.root));

  matrix = await request("GET", "/api/numbering/admin/matrix", adminCookie);
  record(
    "Admin matrix exposes active custom role assignment",
    matrix.roleAssignments?.some((item) => item.id === assignment.id && item.roleCode === testRoleCode && !item.revokedAt),
    JSON.stringify(matrix.roleAssignments?.filter((item) => item.roleCode === testRoleCode))
  );

  const audit = latestAssignmentAudit(testRoleCode);
  record(
    "Role assignment audit exposes before/after/diff/marker envelope",
    Boolean(audit?.before === null && audit?.after?.roleCode === testRoleCode && audit?.diff && audit?.markers?.includes("role_assignment_override")),
    JSON.stringify(audit)
  );

  await verifySettingsUi(adminCookie, `QC Cross Role ${unique}`);

  const revoked = await patchMatrix(adminCookie, { operation: "revoke_role_assignment", id: assignment.id, reason: `QC revoke ${unique}` });
  record("Role assignment can be revoked", Boolean(revoked.assignment?.revokedAt), JSON.stringify(revoked.assignment));
  await waitForPermission(adminCookie, engineerCookie, "action", "numbering.create", false);
} finally {
  if (adminCookie && rdRole) {
    try {
      if (originalRdPageAllowed !== null) {
        await patchMatrix(adminCookie, { operation: "role_permission", roleId: rdRole.id, permissionKind: "page", permissionCode: "numbering.request", allowed: originalRdPageAllowed });
      }
      if (originalRdActionAllowed !== null) {
        await patchMatrix(adminCookie, { operation: "role_permission", roleId: rdRole.id, permissionKind: "action", permissionCode: "numbering.create", allowed: originalRdActionAllowed });
      }
      if (originalPriority?.length) {
        await patchMatrix(adminCookie, { operation: "role_priority", priority: originalPriority, reason: `QC restore priority ${unique}` });
      }
      for (const id of created.assignmentIds) {
        await patchMatrix(adminCookie, { operation: "revoke_role_assignment", id, reason: `QC cleanup ${unique}` }).catch(() => {});
      }
    } finally {
      cleanupDb();
    }
  } else {
    cleanupDb();
  }
}

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      apiBaseUrl,
      testRoleCode,
      results
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exit(1);
}
