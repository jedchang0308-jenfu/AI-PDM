#!/usr/bin/env node

import Database from "better-sqlite3";
import { chromium } from "playwright";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-import-center-ui" });
const unique = Date.now().toString().slice(-8);
const rootCode = `QCIMP${unique}`;
const duplicateRootCode = `QCIMPDUP${unique}`;
const sourceFilename = `qc-import-${unique}.csv`;
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

function seedDuplicateRoot() {
  const db = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO part_roots (
        id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, 'QC duplicate root', 'manufactured', 'EVT', 'Active', 'numbering-rule-v1', 'user-admin-demo', ?, ?)
    `
    ).run(`qc-import-root-${unique}`, duplicateRootCode, now, now);
  } finally {
    db.close();
  }
}

function cleanupImportData() {
  const db = new Database(dbPath);
  try {
    const rootIds = db
      .prepare("SELECT id FROM part_roots WHERE root_code IN (?, ?)")
      .all(rootCode, duplicateRootCode)
      .map((row) => row.id);
    for (const rootId of rootIds) {
      const drawingIds = db.prepare("SELECT id FROM drawing_numbers WHERE part_root_id = ?").all(rootId).map((row) => row.id);
      const partIds = db.prepare("SELECT id FROM part_numbers WHERE part_root_id = ?").all(rootId).map((row) => row.id);
      for (const drawingId of drawingIds) db.prepare("DELETE FROM drawing_part_links WHERE drawing_number_id = ?").run(drawingId);
      for (const partId of partIds) db.prepare("DELETE FROM drawing_part_links WHERE part_number_id = ?").run(partId);
      db.prepare("DELETE FROM drawing_numbers WHERE part_root_id = ?").run(rootId);
      db.prepare("DELETE FROM part_numbers WHERE part_root_id = ?").run(rootId);
      db.prepare("DELETE FROM part_roots WHERE id = ?").run(rootId);
    }
    const batchRows = db.prepare("SELECT id FROM import_batches WHERE source_filename = ?").all(sourceFilename);
    for (const row of batchRows) {
      db.prepare("DELETE FROM import_staging_rows WHERE import_batch_id = ?").run(row.id);
      db.prepare("DELETE FROM import_batches WHERE id = ?").run(row.id);
    }
  } finally {
    db.close();
  }
}

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const consoleErrors = [];
  const failedRequests = [];
  const failedResponses = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await loginAsAdmin(context);
  await page.goto(`${apiBaseUrl}/numbering/imports`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "總表匯入" }).waitFor({ timeout: 10_000 });
  await page.getByRole("heading", { name: "建立 Staging" }).waitFor({ timeout: 10_000 });
  record(`Import center page renders at ${viewport.width}px`, await page.getByText("近期匯入批次").isVisible());

  const csv = [
    "主根號,品名,料號,圖號,料件類型,圖別",
    `${rootCode},QC 匯入測試,${rootCode}-001,${rootCode}-MA1,manufactured,MA`,
    `${duplicateRootCode},QC 衝突測試,${duplicateRootCode}-001,${duplicateRootCode}-MA1,manufactured,MA`,
    `,QC 待補測試,,${rootCode}-OT1,manufactured,OT`
  ].join("\n");

  await page.getByLabel("來源檔名").fill(sourceFilename);
  await page.getByLabel("匯入內容").fill(csv);
  const stageResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/numbering/import-batches") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "產生檢查報告" }).click();
  const stageResponse = await stageResponsePromise;
  record(`Staging batch creation succeeds at ${viewport.width}px`, stageResponse.ok(), `HTTP ${stageResponse.status()}`);
  await page.locator(".pdm-detail-drawer").waitFor({ timeout: 10_000 });
  const backdropColor = await page.locator(".pdm-detail-drawer-backdrop").evaluate((element) => getComputedStyle(element).backgroundColor);
  record(`Import detail opens as non-dark drawer at ${viewport.width}px`, backdropColor === "rgba(0, 0, 0, 0)" || backdropColor === "transparent", backdropColor);
  await page.getByText("可匯入").first().waitFor({ timeout: 10_000 });
  record(`Conflict row renders at ${viewport.width}px`, (await page.getByText("衝突").count()) >= 1);
  record(`Need-info row renders at ${viewport.width}px`, (await page.getByText("待補").count()) >= 1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下載檢查報告" }).click();
  const download = await downloadPromise;
  record(`Import report JSON download is created at ${viewport.width}px`, download.suggestedFilename().endsWith(".json"), download.suggestedFilename());

  const confirmResponsePromise = page.waitForResponse((response) => response.url().includes("/confirm") && response.request().method() === "POST");
  await page.getByRole("button", { name: "管理員確認" }).click();
  const confirmResponse = await confirmResponsePromise;
  record(`Admin confirm applies valid rows at ${viewport.width}px`, confirmResponse.ok(), `HTTP ${confirmResponse.status()}`);
  const confirmedBatchRow = page.locator('[data-import-batch-row="true"]').filter({ hasText: sourceFilename });
  await confirmedBatchRow.getByText("正式", { exact: true }).waitFor({ timeout: 10_000 });
  record(
    `Confirmed batch renders with lifecycle stage label at ${viewport.width}px`,
    (await confirmedBatchRow.getByText("正式", { exact: true }).count()) >= 1
  );

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`Import center avoids page-level horizontal overflow at ${viewport.width}px`, bodyOverflow <= 2, `${bodyOverflow}px`);
  record(`No failed import-center API responses at ${viewport.width}px`, failedResponses.length === 0, failedResponses.join("\n"));
  record(`No failed import-center requests at ${viewport.width}px`, failedRequests.length === 0, failedRequests.join("\n"));
  record(`No browser console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

async function launchBrowser() {
  const channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ?? "chrome";
  try {
    return await chromium.launch({ channel, headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

const browser = await launchBrowser();
try {
  cleanupImportData();
  seedDuplicateRoot();
  await verifyViewport(browser, { width: 1440, height: 1100 });
  cleanupImportData();
  seedDuplicateRoot();
  await verifyViewport(browser, { width: 390, height: 920 });
} finally {
  await browser.close();
  cleanupImportData();
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
