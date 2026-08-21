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
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev077-browser-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureRepositoryDir = path.join(fixtureDataDir, "repository");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const outputDir = path.join(root, "output", "qa", "dev-077-browser");
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844, hasTouch: true }
];
const envKeys = [
  "NODE_ENV", "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR",
  "PDM_RELEASE_MODE", "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_NUMBER_STATE_FLOW_V1",
  "PDM_NUMBER_LIFECYCLE_V2", "PDM_UNIFIED_ENTITY_DETAIL_V1", "PDM_UNIFIED_DRAWING_WORKBENCH_V1",
  "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1", "PDM_PRODUCTION_SLICE_MODE", "PDM_POSTGRES_URL",
  "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_PUBLIC_BASE_URL", "PDM_ENABLE_LOCAL_QUICK_LOGIN"
];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const checks = [];
const consoleErrors = [];
const pageErrors = [];
const failedResponses = [];
let app = null;
let browser = null;
let baseUrl = "";
let port = null;

function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function restoreEnvironment() {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/local-quick-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Engineer" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  check("browser engineer quick login succeeds", result.status === 200, JSON.stringify(result.body));
}

function monitor(page, viewportName) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ viewport: viewportName, message: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push({ viewport: viewportName, message: error.message }));
  page.on("response", (response) => {
    if (response.status() >= 500) failedResponses.push({ viewport: viewportName, status: response.status(), url: response.url() });
  });
}

async function verifyViewport(viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch ?? false });
  const page = await context.newPage();
  monitor(page, viewport.name);
  try {
    await login(page);
    const rootCode = "A0001";
    const fixture = await page.evaluate(async (code) => {
      const response = await fetch(`/api/numbering/roots/${encodeURIComponent(code)}`);
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }, rootCode);
    check(`${viewport.name} loads the fixed Draft A0001 fixture`, fixture.status === 200 && fixture.body.root?.recordStatus === "Draft", JSON.stringify(fixture));
    await page.goto(`${baseUrl}/numbering/search?view=all&detail=${encodeURIComponent(rootCode)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const obsoleteButton = page.getByRole("button", { name: "作廢草稿編號", exact: true }).first();
    await obsoleteButton.waitFor({ state: "visible", timeout: 30000 });
    check(`${viewport.name} exposes draft obsolete entrypoint`, await obsoleteButton.count() === 1);
    const bodyText = await page.locator("body").innerText();
    check(`${viewport.name} removes destructive draft-delete wording`, !bodyText.includes("刪除草稿") && !bodyText.includes("刪除正式編號"));
    const beforeDialog = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    check(`${viewport.name} search drawer has no horizontal overflow`, beforeDialog.scrollWidth <= beforeDialog.clientWidth + 1, JSON.stringify(beforeDialog));

    await obsoleteButton.click();
    const dialog = page.getByRole("dialog", { name: "作廢草稿編號", exact: true });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    const dialogText = await dialog.innerText();
    check(`${viewport.name} obsolete dialog explains retention and no reuse`, dialogText.includes("不會刪除資料") && dialogText.includes("不會回收編號"));
    check(`${viewport.name} obsolete dialog requires reason and acknowledgement`, await dialog.locator("textarea").count() === 1 && await dialog.locator("input[type='checkbox']").count() === 1);
    const geometry = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, viewportWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    check(`${viewport.name} obsolete dialog stays within viewport`, geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1 && geometry.scrollWidth <= geometry.viewportWidth + 1, JSON.stringify(geometry));
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({ path: path.join(outputDir, `dev-077-${viewport.name}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, fixtureRepositoryDir, { recursive: true, force: true });
  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const distDir = `.tmp/qc-dev077-browser-${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepositoryDir,
    PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_ENTITY_DETAIL_V1: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: distDir,
    PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true"
  });
  app = startNextApp(root, "dev", port);
  console.log(`QC DEV-077 browser runtime: project=${root}; purpose=numbering lifecycle UI; port=${port}; cleanup=after run`);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) await verifyViewport(viewport);
  check("browser gate has no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("browser gate has no page errors", pageErrors.length === 0, JSON.stringify(pageErrors));
  check("browser gate has no HTTP 5xx responses", failedResponses.length === 0, JSON.stringify(failedResponses));
} catch (error) {
  if (!checks.some((item) => !item.passed)) checks.push({ name: "DEV-077 browser QC execution", passed: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  restoreEnvironment();
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((item) => !item.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: checks.length, passed: checks.length - failed.length, failed: failed.length, port, screenshots: outputDir, checks }, null, 2));
if (failed.length > 0) process.exit(1);
