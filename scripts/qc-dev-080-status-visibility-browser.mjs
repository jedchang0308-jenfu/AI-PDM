#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { startDev079IsolatedRuntime } from "./qc-dev-079-isolated-runtime.mjs";

const root = process.cwd();
const runId = `DEV080-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-080-status-visibility", runId);
const currentRoutes = ["/approvals", "/settings/accounts", "/settings/account-invitations", "/settings"];
const retiredRoutes = ["/bom/create", "/bom/workbench", "/numbering/tasks", "/api/bom/create-candidates"];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 }
];
const results = [];
const screenshots = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
fs.mkdirSync(outputDir, { recursive: true });

function businessHash(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  const hash = crypto.createHash("sha256");
  try {
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    for (const { name } of tables) {
      const quoted = `"${String(name).replaceAll('"', '""')}"`;
      let rows;
      try { rows = database.prepare(`SELECT * FROM ${quoted} ORDER BY rowid`).all(); }
      catch { rows = database.prepare(`SELECT * FROM ${quoted}`).all(); }
      hash.update(name).update("\0").update(JSON.stringify(rows)).update("\0");
    }
    return hash.digest("hex");
  } finally { database.close(); }
}

async function login(context, baseUrl) {
  const response = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Admin" } });
  record("LOGIN-admin", response.ok(), `HTTP ${response.status()}`);
}

async function verifyCurrentRoute(browser, baseUrl, route, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  await login(context, baseUrl);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "failed";
    if (!(failure === "net::ERR_ABORTED" && request.method() === "GET")) failedRequests.push(`${request.url()} ${failure}`);
  });
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(600);
  record(`${route}:${viewport.name}:http`, Boolean(response && response.status() < 400), `HTTP ${response?.status() ?? "none"}`);
  const bodyText = await page.locator("body").innerText();
  for (const forbidden of ["待你處理", "等他人處理", "待他人處理"]) record(`${route}:${viewport.name}:no-${forbidden}`, !bodyText.includes(forbidden));
  const helpButton = page.locator(".status-scope-help-button").first();
  let helpPresent = false;
  try { await helpButton.waitFor({ state: "visible", timeout: 15_000 }); helpPresent = true; } catch {}
  record(`${route}:${viewport.name}:help-present`, helpPresent);
  if (helpPresent) {
    await helpButton.click();
    const popover = page.locator('[data-status-scope-help="true"]').last();
    await popover.waitFor({ state: "visible", timeout: 5_000 });
    record(`${route}:${viewport.name}:help-open`, await popover.isVisible());
    await page.keyboard.press("Escape");
    record(`${route}:${viewport.name}:help-escape`, await helpButton.getAttribute("aria-expanded") === "false");
    record(`${route}:${viewport.name}:focus-return`, await page.evaluate(() => document.activeElement?.classList.contains("status-scope-help-button")));
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record(`${route}:${viewport.name}:no-overflow`, overflow <= 2, `${overflow}px`);
  record(`${route}:${viewport.name}:console-clean`, consoleErrors.length === 0, consoleErrors.join(" | "));
  record(`${route}:${viewport.name}:network-clean`, failedRequests.length === 0, failedRequests.join(" | "));
  const screenshot = path.join(outputDir, `${route.replaceAll("/", "_").replace(/^_/, "")}-${viewport.name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  screenshots.push(path.relative(root, screenshot));
  await context.close();
}

let runtime;
let browser;
let fatalError = null;
try {
  runtime = await startDev079IsolatedRuntime();
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) for (const route of currentRoutes) await verifyCurrentRoute(browser, runtime.baseUrl, route, viewport);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context, runtime.baseUrl);
  for (const route of retiredRoutes) {
    const before = businessHash(runtime.databasePath);
    const response = await context.request.get(`${runtime.baseUrl}${route}`, { failOnStatusCode: false });
    const body = await response.text();
    const after = businessHash(runtime.databasePath);
    record(`${route}:retired-http`, [404, 410].includes(response.status()), `HTTP ${response.status()}`);
    record(`${route}:retired-zero-write`, before === after, `${before}:${after}`);
    record(`${route}:retired-no-content`, !/建立 BOM|BOM 工作台|候選料號/u.test(body), body.slice(0, 160));
  }
  await context.close();
} catch (error) {
  fatalError = error instanceof Error ? error.stack ?? error.message : String(error);
  record("DEV080-browser-fatal", false, fatalError);
} finally {
  if (browser) await browser.close();
  if (runtime) await runtime.stop();
}

const report = {
  suite: "DEV-080 current residual browser gate",
  runId,
  status: !fatalError && results.every((item) => item.passed) ? "PASS" : "FAIL",
  currentRoutes,
  retiredRoutes,
  viewports,
  runtimeReceipt: runtime?.runtimeReceipt ?? null,
  screenshots,
  total: results.length,
  passed: results.filter((item) => item.passed).length,
  failed: results.filter((item) => !item.passed).length,
  results,
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report, reportDir: outputDir }, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
