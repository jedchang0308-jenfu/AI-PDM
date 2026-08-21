#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev078-browser-"));
const runId = new Date().toISOString().replaceAll(/[-:.TZ]/gu, "").slice(0, 14) + `-${crypto.randomUUID().slice(0, 8)}`;
const outputDir = path.join(root, "output", "qa", "dev-078-responsibility-status", runId);
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const distDirRelative = `.tmp/next-qc-dev078-${crypto.randomUUID()}`;
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let browser;
const consoleEvents = [];
const networkEvents = [];
const screenshots = [];
const actorMatrix = {};

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

function startServer() {
  const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
  const targetDb = path.join(tempDir, "ai-pdm.sqlite");
  if (fs.existsSync(sourceDb)) fs.copyFileSync(sourceDb, targetDb);
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
    stdio: "ignore"
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
  throw new Error("DEV-078 browser server did not start");
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

function assertStableShape(rows, name) {
  for (const row of rows) {
    assert.ok(row.humanStatus?.key, `${name} row must expose humanStatus`);
    assert.ok(row.responsibilityStatus?.category, `${name} row must expose responsibilityStatus`);
    assert.ok(row.viewerActionability && typeof row.viewerActionability.isMine === "boolean", `${name} row must expose viewerActionability`);
    assert.ok(row.viewerStatus?.category, `${name} row must retain viewerStatus compatibility`);
    assert.ok(row.availabilityScope?.scope, `${name} row must expose availabilityScope`);
    assert.notEqual(row.responsibilityStatus.label, "待你處理", `${name} must not use viewer-relative responsibility label`);
    assert.notEqual(row.responsibilityStatus.label, "等他人處理", `${name} must not use viewer-relative responsibility label`);
  }
}

async function loginAs(page, email) {
  const login = await page.evaluate(async ({ target, email: actorEmail }) => {
    const response = await fetch(`${target}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: actorEmail, password: "pdm-demo" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { target: baseUrl, email });
  assert.equal(login.status, 200, `${email} login failed: ${JSON.stringify(login.body)}`);
}

try {
  startServer();
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleEvents.push({ type: message.type(), text: message.text() });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "failed";
    if (failure !== "net::ERR_ABORTED") networkEvents.push({ url: request.url(), failure });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) networkEvents.push({ url: response.url(), status: response.status() });
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await loginAs(page, "admin@example.com");

  const apiChecks = [
    ["parts", "/api/parts?limit=20", "parts"],
    ["relations", "/api/numbering/relations?limit=20", "roots"],
    ["drawings", "/api/numbering/drawings/workbench?view=all&limit=20", "rows"]
  ];
  const apiSummary = {};
  for (const [name, route, key] of apiChecks) {
    const response = await page.evaluate(async (target) => {
      const result = await fetch(target, { cache: "no-store" });
      return { status: result.status, cacheControl: result.headers.get("cache-control"), body: await result.json().catch(() => ({})) };
    }, `${baseUrl}${route}`);
    assert.equal(response.status, 200, `${name} API must return 200`);
    assert.match(response.cacheControl ?? "", /private.*no-store/u, `${name} API must remain private/no-store`);
    const rows = response.body[key] ?? [];
    assertStableShape(rows, name);
    if (name === "relations") assertStableShape(rows.flatMap((row) => [...(row.drawings ?? []), ...(row.parts ?? [])]), "relation child");
    apiSummary[name] = { count: rows.length, cacheControl: response.cacheControl };
  }

  const actorEmails = ["engineer@example.com", "manager@example.com", "admin@example.com", "manufacturing@example.com"];
  for (const email of actorEmails) {
    const actorContext = await browser.newContext();
    const actorPage = await actorContext.newPage();
    await actorPage.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await loginAs(actorPage, email);
    const response = await actorPage.evaluate(async (target) => {
      const result = await fetch(`${target}/api/parts?limit=100`, { cache: "no-store" });
      return { status: result.status, body: await result.json().catch(() => ({})) };
    }, baseUrl);
    assert.equal(response.status, 200, `${email} parts API must return 200`);
    assertStableShape(response.body.parts ?? [], `${email} parts`);
    actorMatrix[email] = (response.body.parts ?? []).map((row) => ({
      key: row.partNumber ?? row.id,
      responsibilityStatus: row.responsibilityStatus,
      viewerActionability: row.viewerActionability
    }));
    await actorContext.close();
  }
  const actorLists = Object.values(actorMatrix);
  const baselineByKey = new Map(actorLists[0].map((row) => [row.key, row.responsibilityStatus]));
  for (const rows of actorLists.slice(1)) {
    for (const row of rows) {
      const baseline = baselineByKey.get(row.key);
      if (baseline) assert.deepEqual(row.responsibilityStatus, baseline, `cross-actor responsibility must be stable for ${row.key}`);
    }
  }

  const routes = ["/parts", "/numbering/search", "/numbering/drawings"];
  for (const route of routes) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1600);
      const body = await page.locator("body").innerText();
      for (const forbidden of ["待你處理", "等他人處理", "待他人處理"]) assert.equal(body.includes(forbidden), false, `${route} primary UI must not show ${forbidden}`);
      const badges = page.locator(".human-status-badge");
      const anchors = page.locator(".human-status-badge-anchor");
      assert.equal(await badges.count(), await anchors.count(), `${route} must have one badge per status anchor`);
      if (await anchors.count()) {
        const anchor = anchors.first();
        await anchor.focus();
        assert.equal(await anchor.getAttribute("aria-expanded"), "true", `${route} status opens on focus`);
        await page.keyboard.press("Escape");
        assert.equal(await anchor.getAttribute("aria-expanded"), "false", `${route} status closes on Escape`);
      }
      const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, `${route} ${viewport.width}px has horizontal overflow`);
      const stableOptions = await page.locator("select option").allTextContents();
      if (stableOptions.some((option) => option.includes("工作狀態"))) {
        assert.ok(stableOptions.includes("編輯中"), `${route} must expose canonical work-status vocabulary`);
        assert.deepEqual(stableOptions.filter((option) => ["全部", "編輯中", "審核中", "待確認", "研發版可使用", "量產版可使用"].includes(option)), ["全部", "編輯中", "審核中", "待確認", "研發版可使用", "量產版可使用"], `${route} must expose the canonical six work-status values`);
        assert.equal(stableOptions.some((option) => option.includes("待你處理") || option.includes("待負責人處理")), false, `${route} must hide legacy viewer and responsibility filter vocabulary`);
      }
      fs.mkdirSync(outputDir, { recursive: true });
      const screenshotPath = path.join(outputDir, `${route.replaceAll("/", "_").replace(/^_/, "")}-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshots.push(screenshotPath);
    }
  }

  await browser.close();
  browser = null;
  assert.equal(consoleEvents.length, 0, `browser console errors: ${JSON.stringify(consoleEvents)}`);
  assert.equal(networkEvents.length, 0, `browser network errors: ${JSON.stringify(networkEvents)}`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({ runId, port, routes, screenshots, apiSummary, actorMatrix, consoleEvents, networkEvents, cleanupStatus: "pending" }, null, 2));
  console.log(JSON.stringify({ suite: "DEV-078 responsibility status browser", passed: true, runId, port, outputDir, apiSummary, actors: actorEmails.length }, null, 2));
} finally {
  await browser?.close();
  await stopServer();
  await removeTempDir();
  if (fs.existsSync(outputDir)) {
    const manifestPath = path.join(outputDir, "manifest.json");
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
    manifest.cleanupStatus = "removed";
    manifest.temporaryPort = port;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}
