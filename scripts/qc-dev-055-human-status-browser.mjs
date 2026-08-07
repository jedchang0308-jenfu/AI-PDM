#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import Database from "better-sqlite3";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev055-browser-"));
const distDirRelative = `.tmp/next-qc-dev055-${crypto.randomUUID()}`;
const runId = crypto.randomUUID();
const outputDir = path.join(root, "output", "playwright", "dev-055-human-status", runId);
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let browser;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status < 500) return;
    } catch {}
    await delay(400);
  }
  throw new Error("DEV-055 browser server did not start");
}

function startServer() {
  const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
  const targetDb = path.join(tempDir, "ai-pdm.sqlite");
  if (fs.existsSync(sourceDb)) {
    fs.copyFileSync(sourceDb, targetDb);
    const fixtureDb = new Database(targetDb);
    fixtureDb.prepare("UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1 WHERE email = 'admin@example.com'").run();
    fixtureDb.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = 'admin@example.com'").run();
    fixtureDb.close();
  }
  child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "demo",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_RELEASE_MODE: "local_stub",
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: "ignore"
  });
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(4000).then(() => child.kill("SIGTERM"))
  ]);
}

async function removeTempDir() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 });
      return;
    } catch {
      await delay(300);
    }
  }
}

try {
  startServer();
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const appBaseUrl = new URL(page.url()).origin;
  const loginResult = await page.evaluate(async (target) => {
    const response = await fetch(`${target}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, appBaseUrl);
  assert.equal(loginResult.status, 200, `demo password login failed: ${JSON.stringify(loginResult.body)}`);

  const apiChecks = [
    ["parts", "/api/parts?limit=5"],
    ["relations", "/api/numbering/relations?limit=5"],
    ["drawings", "/api/numbering/drawings/workbench?view=all&limit=5"]
  ];
  const apiBodies = {};
  for (const [name, route] of apiChecks) {
    const result = await page.evaluate(async (target) => {
      const response = await fetch(target, { cache: "no-store" });
      return { status: response.status, cacheControl: response.headers.get("cache-control"), body: await response.json().catch(() => ({})) };
    }, `${appBaseUrl}${route}`);
    if (result.status !== 200) throw new Error(`${name} API must return 200: ${result.status} ${JSON.stringify(result.body)}`);
    assert.match(result.cacheControl ?? "", /private.*no-store/u, `${name} viewer-specific API must not use shared caching`);
    apiBodies[name] = result.body;
  }
  assert.ok((apiBodies.parts.parts ?? []).every((part) => part.humanStatus?.label), "part API rows need humanStatus");
  assert.ok((apiBodies.parts.parts ?? []).every((part) => part.viewerStatus?.label), "part API rows need viewerStatus");
  assert.ok((apiBodies.parts.parts ?? []).every((part) => part.availabilityScope?.scope), "part API rows need availabilityScope");
  assert.ok((apiBodies.relations.roots ?? []).every((root) => root.humanStatus?.label), "relation API roots need humanStatus");
  assert.ok((apiBodies.relations.roots ?? []).every((root) => root.viewerStatus?.label), "relation API roots need viewerStatus");
  assert.ok((apiBodies.relations.roots ?? []).every((root) => root.availabilityScope?.scope), "relation API roots need availabilityScope");
  assert.ok((apiBodies.relations.roots ?? []).flatMap((root) => [...(root.drawings ?? []), ...(root.parts ?? [])]).every((entity) => entity.availabilityScope?.scope), "relation child rows need availabilityScope");
  assert.ok((apiBodies.drawings.rows ?? []).every((row) => row.humanStatus?.label), "drawing API rows need humanStatus");
  assert.ok((apiBodies.drawings.rows ?? []).every((row) => row.viewerStatus?.label), "drawing API rows need viewerStatus");
  assert.ok((apiBodies.drawings.rows ?? []).every((row) => row.availabilityScope?.scope), "drawing API rows need availabilityScope");
  const allowedViewerLabels = new Set(["待你處理", "等他人處理", "系統處理中", "可使用", "已結束", "待確認", "研發可用", "生產可用", "可用範圍待確認"]);
  for (const rows of [apiBodies.parts.parts ?? [], apiBodies.relations.roots ?? [], apiBodies.drawings.rows ?? []]) {
    assert.ok(rows.every((row) => allowedViewerLabels.has(row.viewerStatus?.label)), "first-level status must use the compact viewer vocabulary");
  }

  const routes = ["/parts", "/numbering/search", "/numbering/drawings"];
  for (const route of routes) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${appBaseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(5000);
      const body = await page.locator("body").innerText();
      assert.equal(body.includes("草稿確認"), false, `${route} must not show ambiguous 草稿確認`);
      const statusFilterOptions = await page.locator("select option").evaluateAll((options) => options.map((option) => option.textContent?.trim()).filter(Boolean));
      assert.ok(statusFilterOptions.includes("待我處理"), `${route} must expose viewer-aware status filter; body=${body.slice(-500)}`);
      if (route === "/numbering/drawings") {
        const headers = await page.locator(".drawing-workbench-table thead th").allTextContents();
        assert.deepEqual(headers.map((value) => value.trim()), ["圖號", "品名", "工作狀態"], "drawing list must expose only three scan columns");
        assert.equal(await page.locator('.drawing-workbench-table td[data-label="下一步"]').count(), 0, "drawing list must not repeat next-step actions");
      }
      fs.mkdirSync(outputDir, { recursive: true });
      const routeSlug = route.replace(/^\//u, "").replaceAll("/", "-");
      await page.screenshot({ path: path.join(outputDir, `${routeSlug}-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${appBaseUrl}/parts`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const partRows = page.locator("[data-part-row='true']");
  if (await partRows.count()) {
    await partRows.first().click();
    try {
      await page.locator(".pdm-detail-drawer").waitFor({ state: "visible", timeout: 10000 });
    } catch {
      throw new Error(`part drawer did not open; body=${(await page.locator("body").innerText()).slice(-1000)}`);
    }
    assert.equal(await page.locator(".pdm-detail-drawer-floating-actions").count(), 0, "part drawer must not have floating navigation controls");
    assert.ok(await page.locator(".pdm-detail-drawer button[aria-label*='關閉']").count(), "part drawer must have one inline close button");
    await page.locator(".pdm-detail-drawer .human-status-badge").waitFor({ state: "visible", timeout: 10000 });
    const statusAnchor = page.locator(".pdm-detail-drawer .human-status-badge-anchor").first();
    await statusAnchor.hover();
    const statusPopover = page.locator(".pdm-detail-drawer .human-status-detail-popover");
    await statusPopover.waitFor({ state: "visible", timeout: 5000 });
    const statusPopoverText = await statusPopover.innerText();
    assert.match(statusPopoverText, /目前|需要|等待|可用範圍|完成後會自動更新/u, "status detail must use human language");
    await statusAnchor.focus();
    assert.equal(await statusAnchor.getAttribute("aria-expanded"), "true", "status detail must open on focus");
    await page.keyboard.press("Escape");
    assert.equal(await statusAnchor.getAttribute("aria-expanded"), "false", "status detail must close on Escape");
  }

  await page.goto(`${appBaseUrl}/numbering/search`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const relationRows = page.locator("[data-search-row='true']");
  if (await relationRows.count()) {
    assert.ok(await page.locator(".human-status-badge").count(), "relation list must show primary human status");
    await relationRows.first().locator("button.pdm-identity-code").first().click();
    await page.locator(".pdm-detail-drawer").waitFor({ state: "visible" });
    assert.ok(await page.locator(".pdm-detail-drawer button[aria-label*='關閉']").count(), "relation drawer must have inline close button");
  }

  await page.goto(`${appBaseUrl}/numbering/drawings`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const drawingRows = page.locator("tbody tr");
  if (await drawingRows.count()) {
    await drawingRows.first().locator("button.link-button").first().click();
    await page.locator(".pdm-detail-drawer").waitFor({ state: "visible" });
    assert.equal(await page.locator(".pdm-detail-drawer .human-status-badge").count(), 1, "drawing drawer must show one primary human status");
    assert.ok(await page.locator(".pdm-detail-drawer button[aria-label*='關閉']").count(), "drawing drawer must have inline close button");
  }

  console.log(JSON.stringify({ suite: "DEV-055 human status browser", passed: true, port, dataCounts: {
    parts: apiBodies.parts.parts?.length ?? 0,
    relations: apiBodies.relations.roots?.length ?? 0,
    drawings: apiBodies.drawings.rows?.length ?? 0
  } }, null, 2));
} finally {
  await browser?.close();
  await stopServer();
  await removeTempDir();
}
