#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV075-${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}-${crypto.randomUUID().slice(0, 8)}`;
const outputDir = path.resolve(root, "output", "qa", "dev-075-current-work-item", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev075-browser-"));
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepositoryDir = path.join(root, "data", "repository");
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const envKeys = [
  "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_RELEASE_MODE",
  "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_NUMBER_STATE_FLOW_V1", "PDM_NUMBER_LIFECYCLE_V2",
  "PDM_UNIFIED_ENTITY_DETAIL_V1", "PDM_UNIFIED_DRAWING_WORKBENCH_V1", "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1",
  "PDM_PRODUCTION_SLICE_MODE", "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_PUBLIC_BASE_URL"
];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844, hasTouch: true }
];
const cases = [];
const browserEvidence = [];
const networkErrors = [];
const pageErrors = [];
const startedDistDirs = [];
let app = null;
let browser = null;
let baseUrl = "";
let fixture = null;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function recordCase(id, passed, detail = {}) {
  cases.push({ id, passed: Boolean(passed), detail });
  if (!passed) console.error(`FAIL ${id}: ${detail.error ?? JSON.stringify(detail)}`);
}

async function runCase(id, fn) {
  try {
    recordCase(id, true, await fn());
  } catch (error) {
    recordCase(id, false, { error: errorMessage(error) });
  }
}

function configureDatabase() {
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(dataDir, "repository");
  const databasePath = path.join(dataDir, "ai-pdm.sqlite");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(sourceDb, databasePath);
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
  return { dataDir, repositoryDir, databasePath };
}

async function startServer() {
  const port = await getFreePort();
  const distDirRelative = `.tmp/qc-dev075-browser-${crypto.randomUUID()}`;
  startedDistDirs.push(path.resolve(root, ...distDirRelative.split("/")));
  baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "demo",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: fixture.dataDir,
    PDM_REPOSITORY_DIR: fixture.repositoryDir,
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
    PDM_NEXT_DIST_DIR: distDirRelative,
    PDM_PUBLIC_BASE_URL: baseUrl
  });
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  console.log(`QC DEV-075 browser runtime: project=${root}; purpose=PA UI verification; port=${port}; cleanup=after run`);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  assert.equal(result.status, 200, `demo login failed: ${JSON.stringify(result.body)}`);
}

function monitor(page, label) {
  page.on("console", (entry) => {
    if (entry.type() === "error") pageErrors.push({ label, type: "console", message: entry.text() });
  });
  page.on("pageerror", (error) => pageErrors.push({ label, type: "pageerror", message: errorMessage(error) }));
  page.on("response", (response) => {
    if (response.status() >= 500) networkErrors.push({ label, status: response.status(), url: response.url() });
  });
}

async function visibleErrorSweep(page, label) {
  const errors = await page.locator(".inline-error, .approval-error, [role='alert']").evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }).map((node) => (node.textContent ?? "").trim()).filter(Boolean));
  assert.deepEqual(errors, [], `${label}: visible error surface must be empty`);
  return errors;
}

async function verifyViewport(viewport) {
  const label = `PA-${viewport.name}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch ?? false });
  const page = await context.newPage();
  monitor(page, label);
  try {
    await login(page);
    await page.goto(`${baseUrl}/approvals`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const search = page.getByLabel("搜尋圖號、料號、品名或送審者");
    await search.fill("A0005-M01");
    await page.waitForTimeout(900);
    const rows = page.locator("[data-approval-workbench-row='true']");
    const activeA0005 = rows.filter({ hasText: "A0005-M01" });
    assert.equal(await activeA0005.count(), 0, `${label}: historical A0005 needs_info must not appear in active work queue`);

    await page.locator("select").first().selectOption("all");
    await page.waitForTimeout(900);
    const allA0005 = rows.filter({ hasText: "A0005-M01" });
    assert.ok(await allA0005.count() >= 2, `${label}: all-history filter must expose A0005 records`);
    const historyRow = allA0005.filter({ hasText: "待補資料" }).first();
    assert.equal(await historyRow.count(), 1, `${label}: old needs_info record must be visible in history`);
    const historyRowText = await historyRow.innerText();
    assert.match(historyRowText, /歷史/u, `${label}: historical row must be visibly labelled`);
    await historyRow.click();

    const drawer = page.locator('[aria-label="審核明細"]');
    await drawer.waitFor({ state: "visible", timeout: 30000 });
    const drawerText = await drawer.innerText();
    assert.match(drawerText, /這筆不是目前待辦/u, `${label}: historical drawer must explain it is not the current task`);
    assert.match(drawerText, /目前不提供核准或駁回操作/u, `${label}: historical drawer must explain why no decision buttons exist`);
    assert.equal(await drawer.getByRole("link", { name: "查看目前案件", exact: true }).count(), 1, `${label}: historical drawer must link to the superseding request`);
    const decisionButtons = await drawer.locator("button").allTextContents({ timeoutMs: 5000 });
    assert.ok(!decisionButtons.some((text) => /核准|駁回|退回修改|補資料/u.test(text)), `${label}: historical drawer must not expose decision buttons`);
    const currentLink = drawer.getByRole("link", { name: "查看目前案件", exact: true });
    assert.match(await currentLink.getAttribute("href"), /status=all.*requestId=/u, `${label}: current request link must preserve exact requestId and history access`);
    await visibleErrorSweep(page, label);
    const geometry = await page.evaluate(() => ({
      viewportWidth: innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      drawer: (() => {
        const node = document.querySelector('[aria-label="審核明細"]');
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      })()
    }));
    assert.equal(geometry.documentScrollWidth > geometry.viewportWidth + 1, false, `${label}: horizontal overflow`);
    assert.ok(geometry.drawer && geometry.drawer.left >= -1 && geometry.drawer.right <= geometry.viewportWidth + 1, `${label}: drawer must stay in viewport`);
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `${viewport.name}-history-drawer.png`), fullPage: true });
    browserEvidence.push({ label, viewport, historyRowText, drawerText, decisionButtons, geometry });
    return { row: historyRowText, geometry };
  } finally {
    await context.close();
  }
}

async function cleanup() {
  if (app) await stopNextApp(app.child).catch(() => undefined);
  if (browser) await browser.close().catch(() => undefined);
  for (const [file, contents] of trackedFiles) fs.writeFileSync(path.join(root, file), contents);
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const allowedTmpRoot = path.resolve(root, ".tmp") + path.sep;
  for (const distDir of startedDistDirs) {
    const resolved = path.resolve(distDir);
    if (resolved.startsWith(allowedTmpRoot) && fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  }
  const resolvedTemp = path.resolve(tempRoot);
  if (resolvedTemp.startsWith(path.resolve(os.tmpdir()) + path.sep) && fs.existsSync(resolvedTemp)) fs.rmSync(resolvedTemp, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}

try {
  fixture = configureDatabase();
  await startServer();
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    await runCase(`PA-UI-${viewport.name}`, () => verifyViewport(viewport));
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const manifest = {
    runId,
    generatedAt: new Date().toISOString(),
    scope: "PA: current work item projection, historical needs_info visibility, exact request navigation, UI actionability",
    runtime: { project: root, baseUrl, temporary: true, cleanup: "completed in finally" },
    cases,
    browserEvidence,
    networkErrors,
    pageErrors
  };
  fs.writeFileSync(path.join(outputDir, "run-manifest.json"), JSON.stringify(manifest, null, 2));
  if (cases.some((item) => !item.passed)) throw new Error(`failed cases: ${JSON.stringify(cases.filter((item) => !item.passed))}`);
  assert.deepEqual(networkErrors, [], "UI run must not produce HTTP 5xx responses");
  assert.deepEqual(pageErrors, [], "UI run must not produce browser console/page errors");
  console.log(`QC DEV-075 browser: PASS (${viewports.length} viewports; screenshots=${screenshotDir})`);
} finally {
  await cleanup();
}
