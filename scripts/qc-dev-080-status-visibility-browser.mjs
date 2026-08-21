#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev080-browser-"));
const runId = new Date().toISOString().replaceAll(/[-:.TZ]/gu, "").slice(0, 14) + `-${crypto.randomUUID().slice(0, 8)}`;
const outputDir = path.join(root, "output", "qa", "dev-080-status-visibility", runId);
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const distDirRelative = `.tmp/next-qc-dev080-${crypto.randomUUID()}`;
const defaultRoutes = [
  "/numbering/drawings",
  "/numbering/search",
  "/approvals",
  "/bom/new",
  "/numbering/tasks",
  "/settings/accounts",
  "/settings/account-invitations"
];
const routes = process.env.DEV080_ROUTES
  ? process.env.DEV080_ROUTES.split(",").map((route) => route.trim()).filter(Boolean)
  : defaultRoutes;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 }
];
const results = [];
const screenshots = [];
let child;
let browser;
let baseUrl;

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  assert.ok(passed, `${name}${detail ? `: ${detail}` : ""}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("DEV080_PORT_NOT_ALLOCATED"))));
    });
  });
}

function startServer(port) {
  const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
  if (fs.existsSync(sourceDb)) fs.copyFileSync(sourceDb, path.join(tempDir, "ai-pdm.sqlite"));
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "demo",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_RELEASE_MODE: "local_stub",
      PDM_NUMBER_STATE_FLOW_V1: "true",
      PDM_NUMBER_LIFECYCLE_V2: "true",
      PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
      PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: "ignore",
    windowsHide: true
  });
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status < 500) return;
    } catch {}
    await delay(400);
  }
  throw new Error("DEV080_BROWSER_SERVER_NOT_READY");
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(4_000).then(() => child.kill("SIGTERM"))
  ]);
}

function seedTaskSignalFixture() {
  const dbPath = path.join(tempDir, "ai-pdm.sqlite");
  const db = new Database(dbPath);
  const id = `qc-dev080-${Date.now()}`;
  const now = new Date().toISOString();
  const detail = JSON.stringify({
    actionCode: "release_missing_ma_confirm",
    payload: {
      proxySubmitted: true,
      proxyReason: "DEV-080 瀏覽器驗證代送審",
      impactedPartNumbers: [`P-${id}`],
      requiredDocuments: ["Released PDF package"],
      overrideTypes: ["無 MA 圖發行"]
    }
  });
  try {
    db.prepare(
      `INSERT INTO numbering_task_items (
        id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
        assigned_role, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, 'qc_dev080', 'part_number', ?, 'DEV-080 狀態例外 fixture', '驗證例外訊號可展開', 'critical', 'open', 'pdm_admin', '/numbering/approvals', ?, 'user-admin-local-quick', ?, ?)`
    ).run(id, id, detail, now, now);
  } finally {
    db.close();
  }
}

async function login(context) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async (target) => {
    const response = await fetch(`${target}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, baseUrl);
  record("Admin login succeeds", result.status === 200, JSON.stringify(result.body));
  await page.close();
}

async function verifyStatusHelp(page, route, viewportName, consoleErrors = []) {
  const scopeButton = page.locator(".status-scope-help-button").first();
  const button = (await scopeButton.count()) > 0 ? scopeButton : page.locator(".status-help-button").first();
  try {
    await button.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    const bodyText = (await page.locator("body").innerText()).slice(0, 240).replaceAll(/\s+/gu, " ");
    record(`${route} ${viewportName} has status help`, false, `status help button not found; url=${page.url()}; title=${await page.title()}; body=${bodyText}; console=${consoleErrors.join(" | ")}`);
    return;
  }
  await button.click();
  const helpPopover = (await scopeButton.count()) > 0
    ? page.locator('[data-status-scope-help="true"]').last()
    : page.locator(".status-help-popover").last();
  await helpPopover.waitFor({ state: "visible", timeout: 5_000 });
  record(`${route} ${viewportName} opens status help`, await helpPopover.isVisible());
  await page.keyboard.press("Escape");
  record(`${route} ${viewportName} closes status help on Escape`, (await button.getAttribute("aria-expanded")) === "false");
  record(`${route} ${viewportName} returns focus after Escape`, await page.evaluate(() => document.activeElement?.classList.contains("status-scope-help-button") || document.activeElement?.classList.contains("status-help-button")));
}

async function verifyExceptionSignal(page, route, viewportName) {
  const button = page.locator(".status-signal-exception").first();
  if ((await button.count()) === 0) return;
  await button.click();
  const exceptionPopover = page.locator(".status-signal-popover");
  await exceptionPopover.waitFor({ state: "visible", timeout: 5_000 });
  record(`${route} ${viewportName} opens exception detail`, await exceptionPopover.isVisible());
  await page.keyboard.press("Escape");
  record(`${route} ${viewportName} closes exception detail on Escape`, (await button.getAttribute("aria-expanded")) === "false");
  record(`${route} ${viewportName} returns focus from exception detail`, await page.evaluate(() => document.activeElement?.classList.contains("status-signal-exception")));
}

async function verifyRoute(route, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  await login(context);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? "failed"}`));
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  record(`${route} ${viewport.name} responds`, Boolean(response && response.status() < 400), `HTTP ${response?.status() ?? "none"}`);
  const bodyText = await page.locator("body").innerText();
  for (const forbidden of ["待你處理", "等他人處理", "待他人處理"]) {
    record(`${route} ${viewport.name} hides legacy viewer-relative label ${forbidden}`, !bodyText.includes(forbidden));
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record(`${route} ${viewport.name} has no horizontal overflow`, overflow <= 2, `${overflow}px`);
  await verifyStatusHelp(page, route, viewport.name, consoleErrors);
  await verifyExceptionSignal(page, route, viewport.name);
  record(`${route} ${viewport.name} has no console errors`, consoleErrors.length === 0, consoleErrors.join("\n"));
  record(`${route} ${viewport.name} has no failed requests`, failedRequests.length === 0, failedRequests.join("\n"));
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, `${route.replaceAll("/", "_").replace(/^_/, "")}-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  screenshots.push(screenshotPath);
  await context.close();
}

let exitCode = 0;
try {
  const port = await getFreePort();
  startServer(port);
  await waitForServer();
  seedTaskSignalFixture();
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    for (const route of routes) await verifyRoute(route, viewport);
  }
} catch (error) {
  exitCode = 1;
  results.push({ name: "DEV-080 browser gate", passed: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  if (browser) await browser.close();
  await stopServer();
  fs.mkdirSync(outputDir, { recursive: true });
  const report = {
    suite: "DEV-080 rendered browser gate",
    result: exitCode === 0 ? "PASS" : "FAIL",
    baseUrl,
    routes,
    viewports,
    screenshots,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    results,
    completedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, reportDir: outputDir }, null, 2));
  try {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    console.warn(`DEV080_BROWSER_TEMP_CLEANUP_WARNING: ${error instanceof Error ? error.message : String(error)}`);
  }
}

process.exitCode = exitCode;
