#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepositoryDir = path.join(root, "data", "repository");
const runId = `dev-086-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-086", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const accessibilityDir = path.join(outputDir, "accessibility");
const networkDir = path.join(outputDir, "network");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev086-browser-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureRepositoryDir = path.join(fixtureDataDir, "repository");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844, hasTouch: true }
];
const routes = [
  { name: "drawing", path: "/numbering/drawings?query=A0002-M01&view=all" },
  { name: "part", path: "/parts?query=A0002&view=all" },
  { name: "relation", path: "/numbering/search?query=A0002&view=all" }
].filter((route) => !process.env.DEV086_ROUTE || process.env.DEV086_ROUTE === route.name);
const envKeys = [
  "NODE_ENV", "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR",
  "PDM_RELEASE_MODE", "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_NUMBER_STATE_FLOW_V1",
  "PDM_NUMBER_LIFECYCLE_V2", "PDM_UNIFIED_ENTITY_DETAIL_V1", "PDM_UNIFIED_DRAWING_WORKBENCH_V1",
  "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1", "PDM_WORKBENCH_PRODUCTION_RD_LANES_V1",
  "PDM_PRODUCTION_SLICE_MODE", "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR",
  "PDM_PUBLIC_BASE_URL", "PDM_ENABLE_LOCAL_QUICK_LOGIN"
];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const checks = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const abortedRequests = [];
const responseLedger = [];
let app = null;
let browser = null;
let port = null;
let baseUrl = "";

function check(name, passed, detail = "") {
  const record = { name, passed: Boolean(passed), detail };
  checks.push(record);
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function restoreEnvironment() {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function monitor(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ label, message: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    const item = { label, url: request.url(), error };
    // Playwright reports in-flight prefetch/drawer requests as ERR_ABORTED when
    // a responsive context is closed after the assertions have completed. This
    // is an expected teardown cancellation, not an application/network error.
    if (error === "net::ERR_ABORTED") abortedRequests.push(item);
    else failedRequests.push(item);
  });
  page.on("response", (response) => {
    const item = { label, status: response.status(), url: response.url() };
    responseLedger.push(item);
    if (response.status() >= 400) failedRequests.push(item);
  });
}

async function login(context) {
  const response = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Admin" } });
  const body = await response.json().catch(() => ({}));
  check("Admin quick login succeeds", response.status() === 200, JSON.stringify(body));
}

async function waitForWorkbench(page) {
  await page.locator(".pdm-workbench-multi-select-filter").first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll(".pdm-workbench-lane-badge").length >= 2 || document.querySelector('[role="alert"]') || document.body.innerText.includes("目前沒有符合條件"), null, { timeout: 30000 }).catch(() => undefined);
}

async function verifyLaneRows(page, label) {
  const result = await page.evaluate(() => {
    const badges = [...document.querySelectorAll(".pdm-workbench-lane-badge")].map((node) => node.textContent?.trim() ?? "");
    const groups = [...document.querySelectorAll('[role="rowgroup"]')].map((group) => ({ text: group.textContent?.trim() ?? "", rows: group.querySelectorAll("tr, .pdm-relation-root").length }));
    return { badges, groups };
  });
  check(`${label} renders production latest lane`, result.badges.includes("量產最新版"), JSON.stringify(result.badges));
  check(`${label} renders R&D latest lane`, result.badges.includes("研發最新版"), JSON.stringify(result.badges));
  check(`${label} groups both latest lanes together`, result.groups.some((group) => group.rows >= 2 && group.text.includes("量產最新版") && group.text.includes("研發最新版")), JSON.stringify(result.groups));
  const alerts = (await page.locator('[role="alert"]:visible').allTextContents()).map((value) => value.trim()).filter(Boolean);
  check(`${label} has no visible error alert`, alerts.length === 0, JSON.stringify(alerts));
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  check(`${label} has no horizontal overflow`, overflow.scrollWidth <= overflow.clientWidth + 1, JSON.stringify(overflow));
}

async function verifyLaneFilter(page, routeName, viewportName) {
  const backdrop = page.locator(".pdm-detail-drawer-backdrop:visible");
  if (await backdrop.count()) {
    await page.locator('[data-pdm-drawer-close="true"]:visible').evaluateAll((buttons) => buttons.forEach((button) => (button instanceof HTMLElement) && button.click()));
    await page.waitForTimeout(400);
    const close = backdrop.getByRole("button", { name: /^關閉/ }).first();
    if (await close.count()) {
      await close.click({ force: true });
      await page.locator(".pdm-detail-drawer-backdrop").waitFor({ state: "hidden", timeout: 3000 }).catch(() => undefined);
    }
    if (await page.locator(".pdm-detail-drawer-backdrop:visible").count()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  }
  const trigger = page.locator(".pdm-workbench-multi-select-filter").filter({ hasText: "版本列" }).getByRole("button").first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "版本列篩選", exact: true });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  check(`${routeName}/${viewportName} exposes production filter option`, await dialog.getByText("量產最新版", { exact: true }).count() === 1);
  check(`${routeName}/${viewportName} exposes R&D filter option`, await dialog.getByText("研發最新版", { exact: true }).count() === 1);
  const rd = dialog.locator("label").filter({ hasText: "研發最新版" }).locator("input");
  await rd.uncheck();
  await dialog.getByRole("button", { name: "確定", exact: true }).click();
  await page.waitForTimeout(350);
  check(`${routeName}/${viewportName} writes production lane filter to URL`, new URL(page.url()).searchParams.get("lane") === "production", page.url());
  const productionOnly = await page.locator(".pdm-workbench-lane-badge").allTextContents();
  check(`${routeName}/${viewportName} filters to production only`, productionOnly.length > 0 && productionOnly.every((value) => value.trim() === "量產最新版"), JSON.stringify(productionOnly));
  await trigger.click();
  const reopened = page.getByRole("dialog", { name: "版本列篩選", exact: true });
  const all = reopened.locator("label").filter({ hasText: "（全選）" }).locator("input");
  await all.check();
  await reopened.getByRole("button", { name: "確定", exact: true }).click();
  await page.waitForTimeout(350);
  check(`${routeName}/${viewportName} restores all lane rows`, new URL(page.url()).searchParams.get("lane") === null, page.url());
  const restored = await page.locator(".pdm-workbench-lane-badge").allTextContents();
  check(`${routeName}/${viewportName} restores both visible lanes`, restored.includes("量產最新版") && restored.includes("研發最新版"), JSON.stringify(restored));
}

async function verifyRoute(route, viewport) {
  const label = `${route.name}/${viewport.name}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch ?? false });
  const page = await context.newPage();
  monitor(page, label);
  try {
    await login(context);
    await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForWorkbench(page);
    await verifyLaneRows(page, label);
    if (viewport.name === "desktop") await verifyLaneFilter(page, route.name, viewport.name);
    await page.screenshot({ path: path.join(screenshotDir, `${route.name}-${viewport.name}.png`), fullPage: true });
    const snapshot = typeof page.locator("body").ariaSnapshot === "function" ? await page.locator("body").ariaSnapshot() : "ariaSnapshot unavailable";
    fs.writeFileSync(path.join(accessibilityDir, `${route.name}-${viewport.name}.yml`), snapshot ?? "", "utf8");
  } finally {
    await context.close();
  }
}

try {
  assert(fs.existsSync(sourceDb), `Fixture database not found: ${sourceDb}`);
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(accessibilityDir, { recursive: true });
  fs.mkdirSync(networkDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, fixtureRepositoryDir, { recursive: true, force: true });
  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepositoryDir, PDM_RELEASE_MODE: "local_stub", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_NUMBER_STATE_FLOW_V1: "true", PDM_NUMBER_LIFECYCLE_V2: "true", PDM_UNIFIED_ENTITY_DETAIL_V1: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true", PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
    PDM_WORKBENCH_PRODUCTION_RD_LANES_V1: "true", PDM_PRODUCTION_SLICE_MODE: "", PDM_POSTGRES_URL: "", DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: `.tmp/qc-dev086-browser-${port}`, PDM_PUBLIC_BASE_URL: baseUrl, PDM_ENABLE_LOCAL_QUICK_LOGIN: "true"
  });
  app = startNextApp(root, "dev", port);
  console.log(`QC DEV-086 browser runtime: project=${root}; purpose=dual latest production/R&D lanes; port=${port}; cleanup=after run`);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  const statusContext = await browser.newContext();
  const statusResponse = await statusContext.request.get(`${baseUrl}/api/numbering/state-flow/status`);
  const statusBody = await statusResponse.json().catch(() => ({}));
  check("DEV-086 umbrella feature flag is enabled in runtime", statusResponse.status() === 200 && statusBody.productionRdLanes?.enabled === true, JSON.stringify(statusBody));
  await statusContext.close();
  for (const route of routes) for (const viewport of viewports) await verifyRoute(route, viewport);
  check("browser gate has no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("browser gate has no page errors", pageErrors.length === 0, JSON.stringify(pageErrors));
  check("browser gate has no failed requests or HTTP errors", failedRequests.length === 0, JSON.stringify(failedRequests));
} catch (error) {
  if (!checks.some((item) => !item.passed)) checks.push({ name: "DEV-086 browser QC execution", passed: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  fs.writeFileSync(path.join(networkDir, "ledger.json"), JSON.stringify({ responses: responseLedger, failedRequests, abortedRequests, consoleErrors, pageErrors }, null, 2), "utf8");
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  restoreEnvironment();
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((item) => !item.passed);
const manifest = { runId, checkedAt: new Date().toISOString(), project: root, purpose: "DEV-086 dual latest production/R&D lanes", port, screenshots: screenshotDir, accessibility: accessibilityDir, network: networkDir, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks };
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length > 0) process.exit(1);
