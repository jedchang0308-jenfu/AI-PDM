#!/usr/bin/env node

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
const runId = new Date().toISOString().replaceAll(/[-:.TZ]/gu, "").slice(0, 14);
const outputDir = path.join(root, "output", "qa", "dev-071-flag-off-browser", runId);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev071-flag-off-"));
const repositoryDir = path.join(tempDir, "repository");
const distDirRelative = `.tmp/next-qc-dev071-flag-off-${crypto.randomUUID()}`;
const distDir = path.resolve(root, distDirRelative);
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const results = [];
const screenshots = [];
const backups = new Map(["tsconfig.json", "next-env.d.ts"].map((file) => [file, fs.readFileSync(path.join(root, file))]));
let serverProcess;
let serverLog = "";
let baseUrl;
let browser;
let cookie;
const token = Date.now().toString().slice(-8);
const fixture = {
  parentPartId: `dev071-flag-parent-part-${token}`,
  parentItemId: `dev071-flag-parent-item-${token}`,
  parentPartNumber: `P-DEV071-FLAG-PARENT-${token}`
};

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function prepareFixture() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(path.join(root, "data", "ai-pdm.sqlite"), path.join(tempDir, "ai-pdm.sqlite"));
  const db = new Database(path.join(tempDir, "ai-pdm.sqlite"));
  try {
    db.prepare("UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1, session_invalid_before = NULL, account_lifecycle_version = 1 WHERE email IN ('engineer@example.com', 'manager@example.com')").run();
    const partRoot = db.prepare("SELECT id FROM part_roots WHERE record_status <> 'Obsolete' ORDER BY id LIMIT 1").get();
    const maxSequence = Number(db.prepare("SELECT COALESCE(MAX(sequence_no), 0) AS value FROM part_numbers WHERE part_root_id = ?").get(partRoot.id).value);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 'A', ?, ?)").run(fixture.parentItemId, fixture.parentPartNumber, "DEV-071 flag parent", now, now);
    db.prepare("INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, created_by, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, 'manufactured', 'Released', 'user-engineer-demo', ?, ?)").run(fixture.parentPartId, partRoot.id, fixture.parentPartNumber, maxSequence + 1, `F${token}`, "DEV-071 flag parent", now, now);
  } finally {
    db.close();
  }
}

function startServer(flag) {
  return freePort().then((port) => {
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        PDM_AUTH_MODE: "demo",
        PDM_DB_PROVIDER: "sqlite",
        PDM_DATA_DIR: tempDir,
        PDM_REPOSITORY_DIR: repositoryDir,
        PDM_RELEASE_MODE: "local_stub",
        PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
        PDM_PUBLIC_BASE_URL: baseUrl,
        PDM_NEXT_DIST_DIR: distDirRelative,
        PDM_BOM_XMIND_EDITOR_V2_ENABLED: flag ? "true" : "false"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const capture = (chunk) => { serverLog = `${serverLog}${chunk.toString()}`.slice(-200_000); };
    serverProcess.stdout?.on("data", capture);
    serverProcess.stderr?.on("data", capture);
  });
}

async function waitForServer() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch {}
    await delay(400);
  }
  throw new Error(`server timeout\n${serverLog.slice(-4_000)}`);
}

async function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    const exited = new Promise((resolve) => serverProcess.once("exit", resolve));
    serverProcess.kill();
    await Promise.race([exited, delay(5_000)]);
  }
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login?account=Engineer`, { redirect: "manual" });
  const header = response.headers.get("set-cookie") ?? "";
  cookie = header.split(";", 1)[0];
  record("flag-off engineer login", response.status === 303 && cookie.includes("="), `HTTP ${response.status}`);
}

async function api(pathname, init = {}) {
  const headers = { ...(init.headers ?? {}), cookie, "content-type": "application/json" };
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function createDraft(revision, name) {
  return api("/api/bom/drafts", {
    method: "POST",
    headers: { "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ ownerPartNumberId: fixture.parentPartId, bomRevision: revision, source: "manual", draftName: name })
  });
}

async function run() {
  prepareFixture();
  await startServer(true);
  await waitForServer();
  await login();
  const floatingDraft = await createDraft("1", "DEV-071 floating flag draft");
  record("flag=true draft created", floatingDraft.status === 201 && Boolean(floatingDraft.body.draft?.id));
  const draftId = floatingDraft.body.draft.id;
  const saved = await api(`/api/bom/drafts/${draftId}`, {
    method: "PATCH",
    body: JSON.stringify({
      expectedEditorVersion: 0,
      reason: "QC flag-off fixture",
      lines: [],
      floatingTopics: [{ id: "flag-off-floating", nodeType: "group", groupName: "Flag-off Floating", sequenceNo: 1, rootPositionX: 420, rootPositionY: 220 }]
    })
  });
  record("flag=true floating fixture saved", saved.status === 200 && saved.body.draft?.floating_topics?.length === 1);
  await stopServer();

  await startServer(false);
  await waitForServer();
  const blockedRead = await api(`/api/bom/drafts/${draftId}`);
  record("FF-003 flag=false reports disabled capability", blockedRead.status === 200 && blockedRead.body.editorCapability?.enabled === false);
  const stale = await api(`/api/bom/drafts/${draftId}`, { method: "PATCH", body: JSON.stringify({ lines: [], floatingTopics: [] }) });
  record("FF-004 legacy PATCH fails closed", stale.status === 409 && stale.body.error === "BOM_EDITOR_V2_REQUIRED");
  const unchanged = await api(`/api/bom/drafts/${draftId}`);
  record("FF-004 floating graph remains unchanged", unchanged.body.draft?.floating_topics?.length === 1 && unchanged.body.draft?.editor_version === 1);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: cookie.split("=", 1)[0], value: cookie.split("=", 2)[1], url: baseUrl }]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/bom/workbench/${encodeURIComponent(draftId)}`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Floating Topic；目前版本已鎖定保存/u).waitFor({ timeout: 15_000 });
  record("FF-003 hard reload shows blocked handoff", await page.getByText(/Floating Topic；目前版本已鎖定保存/u).isVisible() && await page.locator("[data-testid='xmind-bom-editor']").count() === 0);
  const blockedScreenshot = path.join(outputDir, "FF-003-blocked-handoff.png");
  await page.screenshot({ path: blockedScreenshot });
  screenshots.push(blockedScreenshot);

  const legacyDraft = await createDraft("2", "DEV-071 legacy flag draft");
  record("FF-002 flag=false zero-floating draft created", legacyDraft.status === 201 && Boolean(legacyDraft.body.draft?.id));
  const legacyId = legacyDraft.body.draft.id;
  await page.goto(`${baseUrl}/bom/workbench/${encodeURIComponent(legacyId)}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-testid='bom-flow-canvas']").waitFor({ timeout: 15_000 });
  record("FF-002 legacy surface has no v2 leakage", await page.locator("[data-testid='xmind-bom-editor']").count() === 0 && await page.locator(".xmind-bom-toolbar").count() === 0);
  await page.getByRole("button", { name: "新增群組" }).click();
  const saveResponse = page.waitForResponse((response) => response.url().includes(`/api/bom/drafts/${legacyId}`) && response.request().method() === "PATCH" && response.status() === 200);
  await page.getByRole("button", { name: "儲存", exact: true }).click();
  await saveResponse;
  record("FF-002 legacy surface can still save", true);
  const legacyScreenshot = path.join(outputDir, "FF-002-legacy-surface.png");
  await page.screenshot({ path: legacyScreenshot });
  screenshots.push(legacyScreenshot);
  await context.close();
  const manifest = { runId, checkedAt: new Date().toISOString(), outputDir, results, screenshots, productionConnected: false, productionWrites: false, cleanupStatus: "pending" };
  fs.writeFileSync(path.join(outputDir, "server.log"), serverLog);
  fs.writeFileSync(path.join(outputDir, "run-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ...manifest, total: results.length, passed: results.filter((item) => item.passed).length, failed: 0 }, null, 2));
}

run().catch(async (error) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const report = { runId, checkedAt: new Date().toISOString(), outputDir, results, screenshots, error: error.message, serverLog };
  fs.writeFileSync(path.join(outputDir, "failed-run.json"), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => {});
  await stopServer().catch(() => {});
  for (const [file, content] of backups) fs.writeFileSync(path.join(root, file), content);
  if (distDir.startsWith(path.join(root, ".tmp") + path.sep)) fs.rmSync(distDir, { recursive: true, force: true });
  if (tempDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(tempDir, { recursive: true, force: true });
});
