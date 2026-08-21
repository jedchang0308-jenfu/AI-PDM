#!/usr/bin/env node

import Database from "better-sqlite3";
import { chromium } from "playwright";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-task-center-ui" });
const unique = Date.now().toString();
const taskId = `qc-task-center-${unique}`;
const infoNotificationId = `qc-notice-info-${unique}`;
const lockedNotificationId = `qc-notice-locked-${unique}`;
const now = new Date().toISOString();
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
  await context.addCookies([{ name, value: valueParts.join("="), domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
}

function seedTaskCenterData() {
  const db = new Database(dbPath);
  try {
    const markerDetail = JSON.stringify({
      actionCode: "release_missing_ma_confirm",
      payload: {
        proxySubmitted: true,
        proxyReason: "QC 管理員代 RD 送審",
        impactedPartNumbers: [`P-QCTASK-${unique}-001`],
        requiredDocuments: ["Released PDF package"],
        overrideTypes: ["無 MA 圖發行"]
      }
    });
    db.prepare(
      `
      INSERT INTO numbering_task_items (
        id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
        assigned_role, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, 'qc_task_center', 'part_number', ?, ?, ?, 'critical', 'open', 'pdm_admin', '/numbering/approvals', ?, 'user-admin-demo', ?, ?)
    `
    ).run(taskId, taskId, "QC Task Center 待辦", "QC seeded task center item", markerDetail, now, now);
    db.prepare(
      `
      INSERT INTO numbering_notifications (
        id, notification_type, entity_type, entity_id, title, message, severity,
        recipient_role, dismissible, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, 'qc_task_center', 'part_number', ?, ?, ?, 'info', 'pdm_admin', 1, '/settings', '{}', 'user-admin-demo', ?, ?)
    `
    ).run(infoNotificationId, infoNotificationId, "QC 可處理通知", "QC seeded dismissible notice", now, now);
    db.prepare(
      `
      INSERT INTO numbering_notifications (
        id, notification_type, entity_type, entity_id, title, message, severity,
        recipient_role, dismissible, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, 'qc_task_center', 'part_number', ?, ?, ?, 'warning', 'pdm_admin', 0, '/numbering/approvals', ?, 'user-admin-demo', ?, ?)
    `
    ).run(lockedNotificationId, lockedNotificationId, "QC 不可關閉通知", "QC seeded non-dismissible notice", markerDetail, now, now);
  } finally {
    db.close();
  }
}

function cleanupTaskCenterData() {
  const db = new Database(dbPath);
  try {
    db.prepare("DELETE FROM numbering_task_items WHERE id = ?").run(taskId);
    db.prepare("DELETE FROM numbering_notifications WHERE id IN (?, ?)").run(infoNotificationId, lockedNotificationId);
  } finally {
    db.close();
  }
}

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await loginAsAdmin(context);
  await page.goto(`${apiBaseUrl}/numbering/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "待辦中心", exact: true }).waitFor({ timeout: 10_000 });
  await page.getByText("通知中心").waitFor({ timeout: 10_000 });
  record(`Task center page renders at ${viewport.width}px`, await page.getByText("QC Task Center 待辦").isVisible());
  record(`Notification center renders at ${viewport.width}px`, await page.getByText("QC 可處理通知").isVisible());
  record(`Proxy submission marker renders at ${viewport.width}px`, (await page.getByText("代送審").count()) >= 1);
  record(`Override marker renders at ${viewport.width}px`, (await page.getByText("! Override").count()) >= 1);
  record(`Impact marker renders at ${viewport.width}px`, (await page.getByText("! 影響範圍").count()) >= 1);
  const lockedButton = page.locator("tr", { hasText: "QC 不可關閉通知" }).getByRole("button", { name: "處理", exact: true });
  record(`Non-dismissible notification action is disabled at ${viewport.width}px`, await lockedButton.isDisabled());

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`Task center avoids page-level horizontal overflow at ${viewport.width}px`, bodyOverflow <= 2, `${bodyOverflow}px`);
  record(`No browser console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  const bootstrapContext = await browser.newContext();
  await loginAsAdmin(bootstrapContext);
  await bootstrapContext.close();
  seedTaskCenterData();
  await verifyViewport(browser, { width: 1440, height: 1100 });
  await verifyViewport(browser, { width: 390, height: 920 });
} finally {
  await browser.close();
  cleanupTaskCenterData();
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
