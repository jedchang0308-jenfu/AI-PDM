#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import Database from "better-sqlite3";
import { chromium } from "playwright";

import {
  createTaskOwnedNextTsconfig,
  getFreePort,
  removeTaskOwnedWorkspaceTempDir,
  startNextApp,
  stopNextApp,
  waitForNextAppReady
} from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = process.env.DEV105_RUN_ID?.trim() || `DEV105-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV105_EVIDENCE_DIR || path.join(root, "output", "qa", "dev-105-3d-preview", runId));
const screenshotDir = path.join(evidenceDir, "screenshots");
const workerLogDir = path.join(evidenceDir, "worker");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev105-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");
const primaryRepositoryDir = path.join(root, "data", "repository");
const runtimeProjectRoot = path.join(root, ".tmp", `qc-dev105-browser-runtime-project-${crypto.randomUUID()}`);
const token = crypto.randomBytes(32).toString("hex");
const checks = [];
const browserEvents = [];
const fixtureMutationLedger = [];
const originalEnv = new Map();
const envNames = [
  "NODE_ENV", "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_BUILD_COMMIT",
  "PDM_RELEASE_MODE", "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_ENABLE_LOCAL_QUICK_LOGIN", "PDM_PRODUCTION_SLICE_MODE",
  "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_NEXT_TSCONFIG_PATH", "PDM_PUBLIC_BASE_URL",
  "PDM_NUMBER_STATE_FLOW_V1", "PDM_NUMBER_LIFECYCLE_V2", "PDM_UNIFIED_DRAWING_WORKBENCH_V1",
  "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1", "PDM_WORKBENCH_PREVIEW_GALLERY_V1", "PDM_PART_PREVIEW_V1",
  "PDM_WORKBENCH_PRODUCTION_RD_LANES_V1", "PDM_LOCAL_FAKE_PREVIEW_WORKER", "PDM_PREVIEW_WORKER_TOKEN"
];
for (const name of envNames) originalEnv.set(name, process.env[name]);

let app = null;
let browser = null;
let port = null;
let runtimeDistDir = null;
let primaryBefore = null;
let primaryAfter = null;
let fatalError = null;
let cleanup = { browserClosed: false, appStopped: false, portReleased: false, runtimeProjectRemoved: false, taskRootRemoved: false };

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(workerLogDir, { recursive: true });

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function invariant(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  try {
    const payload = {
      schema: database.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master
        WHERE type IN ('table','index','trigger')
          AND tbl_name IN ('part_roots','part_numbers','drawing_numbers','drawings','drawing_revisions','drawing_revision_files','drawing_revision_works','drawing_revision_work_files','canonical_workbench_states')
        ORDER BY type,name`).all(),
      roots: database.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY id").all(),
      parts: database.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY id").all(),
      drawings: database.prepare("SELECT id,company_id,part_root_id,drawing_number FROM drawings ORDER BY id").all(),
      rootReferenceOrphans: {
        parts: database.prepare("SELECT COUNT(*) count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id WHERE part.part_root_id IS NOT NULL AND root.id IS NULL").get().count,
        drawings: database.prepare("SELECT COUNT(*) count FROM drawings drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL").get().count
      },
      migrationResidue: database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%migration%' ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return {
      hash: sha256(JSON.stringify(payload)),
      counts: { roots: payload.roots.length, parts: payload.parts.length, drawings: payload.drawings.length },
      rootReferenceOrphans: payload.rootReferenceOrphans,
      migrationResidue: payload.migrationResidue,
      foreignKeys: payload.foreignKeys
    };
  } finally {
    database.close();
  }
}

function record(id, name, condition, detail = null) {
  const passed = Boolean(condition);
  checks.push({ id, name, passed, detail });
  if (!passed) throw new Error(`${id} ${name}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
}

function prepareRuntimeProject() {
  const workspaceTempRoot = path.resolve(root, ".tmp");
  const resolvedRuntimeRoot = path.resolve(runtimeProjectRoot);
  if (!resolvedRuntimeRoot.startsWith(`${workspaceTempRoot}${path.sep}`)
    || !path.basename(resolvedRuntimeRoot).startsWith("qc-dev105-browser-runtime-project-")) {
    throw new Error(`UNSAFE_RUNTIME_PROJECT_PATH:${resolvedRuntimeRoot}`);
  }
  fs.mkdirSync(resolvedRuntimeRoot, { recursive: true });
  for (const file of ["package.json", "next.config.mjs", "tsconfig.json", "tsconfig.app.json", "tsconfig.next.json", "next-env.d.ts"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolvedRuntimeRoot, file));
  }
  for (const file of [".env", ".env.local", ".env.development.local"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolvedRuntimeRoot, file));
  }
  for (const directory of ["src", "public", "db", "config"]) {
    const source = path.join(root, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(resolvedRuntimeRoot, directory), { recursive: true, force: true });
  }
  const nextConfigPath = path.join(resolvedRuntimeRoot, "next.config.mjs");
  const nextConfig = fs.readFileSync(nextConfigPath, "utf8");
  const isolatedNextConfig = nextConfig.replace("const nextConfig = {", "const nextConfig = {\n  agentRules: false,");
  if (isolatedNextConfig === nextConfig) throw new Error("RUNTIME_NEXT_CONFIG_PATCH_POINT_MISSING");
  fs.writeFileSync(nextConfigPath, isolatedNextConfig, "utf8");
  fs.mkdirSync(path.join(resolvedRuntimeRoot, "scripts"), { recursive: true });
  for (const file of ["qc-process-warning-guard.mjs", "qc-node-listener-budget.cjs"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(resolvedRuntimeRoot, "scripts", file));
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(resolvedRuntimeRoot, "node_modules"), "junction");
}

function fixtureRead(query, params = []) {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  try {
    return database.prepare(query).all(...params);
  } finally {
    database.close();
  }
}

function fixtureWrite(query, params = []) {
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  try {
    return database.prepare(query).run(...params);
  } finally {
    database.close();
  }
}

function sourceFor(drawingNumber) {
  return fixtureRead(`SELECT drawing.id drawing_id,drawing.drawing_number,revision.revision,asset.id source_file_asset_id,
      asset.file_name,asset.file_ext,asset.original_path,asset.storage_key,asset.content_hash
    FROM drawing_revision_files binding
    JOIN drawing_revisions revision ON revision.id=binding.drawing_revision_id
    JOIN drawings drawing ON drawing.id=revision.drawing_id
    JOIN file_assets asset ON asset.id=binding.source_file_asset_id
    WHERE drawing.drawing_number=? AND binding.removed_at IS NULL AND asset.deleted_at IS NULL
      AND lower(asset.file_ext) IN ('sldprt','sldasm')
    ORDER BY revision.created_at DESC,binding.created_at DESC LIMIT 1`, [drawingNumber])[0];
}

function jobsFor(sourceFileAssetId) {
  return fixtureRead("SELECT * FROM preview_jobs WHERE source_file_asset_id=? ORDER BY created_at,id", [sourceFileAssetId]);
}

function derivativesFor(sourceFileAssetId) {
  return fixtureRead("SELECT * FROM file_derivatives WHERE source_file_asset_id=? ORDER BY created_at,id", [sourceFileAssetId]);
}

async function waitForDatabase(name, predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let detail = null;
  while (Date.now() < deadline) {
    detail = predicate();
    if (detail) return detail;
    await delay(250);
  }
  throw new Error(`${name} timed out: ${JSON.stringify(detail)}`);
}

async function canConnect(portNumber) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: portNumber });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

function monitor(page, label) {
  page.on("pageerror", (error) => browserEvents.push({ label, kind: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") browserEvents.push({ label, kind: "console", message: message.text() });
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") browserEvents.push({ label, kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) browserEvents.push({ label, kind: "http", status: response.status(), url: response.url() });
  });
}

async function login(page, baseUrl, label) {
  monitor(page, label);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
}

async function waitForList(page) {
  await page.locator(".canonical-list").waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", undefined, { timeout: 45_000 });
}

async function openDrawingDetail(page, baseUrl, drawingNumber) {
  await page.goto(`${baseUrl}/numbering/drawings?query=${encodeURIComponent(drawingNumber.replace(/-M\d+$/u, ""))}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForList(page);
  const row = page.locator("[data-canonical-workbench-row='true']").filter({ hasText: drawingNumber }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.click();
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "visible", timeout: 30_000 });
  return page.locator(".pdm-entity-detail-drawer");
}

async function openPartDetail(page, baseUrl, partNumber) {
  await page.goto(`${baseUrl}/parts?query=${encodeURIComponent(partNumber.replace(/-P\d+$/u, ""))}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForList(page);
  const row = page.locator("[data-canonical-workbench-row='true']").filter({ hasText: partNumber }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.click();
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "visible", timeout: 30_000 });
  return page.locator(".pdm-entity-detail-drawer");
}

async function uploadWorkspaceFile(page, filePath, fileName) {
  const input = page.locator(".dev079-workspace-file-upload input[type='file']");
  await input.setInputFiles([]);
  await input.setInputFiles({ name: fileName, mimeType: "application/octet-stream", buffer: fs.readFileSync(filePath) });
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && /\/files(?:\?|$)/u.test(response.url()), { timeout: 45_000 });
  await page.getByRole("button", { name: "上傳所選檔案", exact: true }).click();
  return await responsePromise;
}

async function postCapability(baseUrl, status, issueCode) {
  const response = await fetchWithRetry(`${baseUrl}/api/preview-workers/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pdm-preview-worker-token": token },
    body: JSON.stringify({
      workerId: "dev105-capability-qc",
      capability: "solidworks_3d_preview_png",
      status,
      readerVersion: "windows-shell-ishellitemimagefactory-v2",
      issueCode
    })
  });
  if (!response.ok) throw new Error(`Capability POST failed: ${response.status} ${await response.text()}`);
}

async function getCapability(baseUrl) {
  const response = await fetchWithRetry(`${baseUrl}/api/preview-workers/heartbeat?capability=solidworks_3d_preview_png`, {
    headers: { "x-pdm-preview-worker-token": token }
  });
  if (!response.ok) throw new Error(`Capability GET failed: ${response.status} ${await response.text()}`);
  return await response.json();
}

async function fetchWithRetry(url, options) {
  let lastError = null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      await delay(attempt * 100);
    }
  }
  throw lastError;
}

function runWorker(baseUrl, canarySource, index, expectFailure = false) {
  const result = spawnSync(process.execPath, [
    "scripts/run-windows-shell-preview-worker.mjs",
    "--base-url", baseUrl,
    "--token", token,
    "--worker-id", `dev105-worker-${index}`,
    "--models-only",
    "--canary-source", canarySource,
    "--size", "512"
  ], {
    cwd: root,
    env: { ...process.env, PDM_PREVIEW_WORKER_TOKEN: token, PDM_PREVIEW_WORKER_BASE_URL: baseUrl },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const sanitized = `${result.stdout || ""}\n${result.stderr || ""}`
    .replaceAll(os.tmpdir().replaceAll("\\", "\\\\"), "[task-owned-temp]")
    .replaceAll(new URL(`file:///${os.tmpdir().replaceAll("\\", "/")}/`).href.replace(/\/$/u, ""), "[task-owned-temp-url]")
    .replaceAll(taskRoot.replaceAll("\\", "\\\\"), "[task-owned-root]")
    .replaceAll(root.replaceAll("\\", "\\\\"), "[project-root]")
    .replaceAll(os.tmpdir(), "[task-owned-temp]")
    .replaceAll(taskRoot, "[task-owned-root]")
    .replaceAll(root, "[project-root]")
    .replaceAll(token, "[redacted-token]");
  fs.writeFileSync(path.join(workerLogDir, `worker-${index}.log`), sanitized, "utf8");
  if (result.error || (expectFailure ? result.status === 0 : result.status !== 0)) {
    throw new Error(`worker-${index} unexpected result status=${result.status}: ${result.error?.message || sanitized}`);
  }
  return { status: result.status, sanitized };
}

function runWorkerAsync(baseUrl, canarySource, index, expectFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/run-windows-shell-preview-worker.mjs",
      "--base-url", baseUrl,
      "--token", token,
      "--worker-id", `dev105-worker-${index}`,
      "--models-only",
      "--canary-source", canarySource,
      "--size", "512"
    ], {
      cwd: root,
      env: { ...process.env, PDM_PREVIEW_WORKER_TOKEN: token, PDM_PREVIEW_WORKER_BASE_URL: baseUrl },
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => reject(error));
    child.once("close", (status) => {
      const sanitized = `${stdout}\n${stderr}`
        .replaceAll(os.tmpdir().replaceAll("\\", "\\\\"), "[task-owned-temp]")
        .replaceAll(taskRoot.replaceAll("\\", "\\\\"), "[task-owned-root]")
        .replaceAll(root.replaceAll("\\", "\\\\"), "[project-root]")
        .replaceAll(os.tmpdir(), "[task-owned-temp]")
        .replaceAll(taskRoot, "[task-owned-root]")
        .replaceAll(root, "[project-root]")
        .replaceAll(token, "[redacted-token]");
      fs.writeFileSync(path.join(workerLogDir, `worker-${index}-async.log`), sanitized, "utf8");
      const unexpected = expectFailure ? status === 0 : status !== 0;
      if (unexpected) {
        reject(new Error(`worker-${index} unexpected result status=${status}: ${sanitized}`));
        return;
      }
      resolve({ status, sanitized });
    });
  });
}

async function verifyReadyWorkbenchViewport(baseUrl, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await login(page, baseUrl, viewport.name);
  const mediaRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("previewDerivative=")) mediaRequests.push(request.url());
  });
  const drawingDrawer = await openDrawingDetail(page, baseUrl, "A0002-M01");
  const drawingImage = drawingDrawer.locator("[data-component='canonical-preview-panel'] [data-preview-media='image']").first();
  await drawingImage.waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForFunction((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0, await drawingImage.elementHandle(), { timeout: 45_000 });
  const drawingImageState = await drawingImage.evaluate((element) => ({ naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight }));
  record("QA-105-015", `${viewport.name} Drawing workbench renders a real 3D image`, drawingImageState.naturalWidth > 0 && drawingImageState.naturalHeight > 0, drawingImageState);
  record("QA-105-015", `${viewport.name} Drawing workbench does not use missing/pending copy after completion`,
    !/無可用預覽|3D 預覽尚未建立|等待預覽服務/u.test(await drawingDrawer.innerText()));
  const drawingRequest = mediaRequests.find((url) => url.includes("previewDerivative="));
  await page.screenshot({ path: path.join(screenshotDir, `${viewport.name}-drawing-A0002.png`), fullPage: false });
  await page.getByRole("button", { name: "關閉明細" }).click();

  mediaRequests.length = 0;
  const partDrawer = await openPartDetail(page, baseUrl, "A0002-P01");
  const partPanel = partDrawer.locator("[data-canonical-preview-section='canonical-part-preview']");
  await partPanel.waitFor({ state: "visible", timeout: 45_000 });
  const partImage = partPanel.locator("[data-preview-media='image']").first();
  await partImage.waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForFunction((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0, await partImage.elementHandle(), { timeout: 45_000 });
  const partImageState = await partImage.evaluate((element) => ({ naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight }));
  const partRequest = mediaRequests.find((url) => url.includes("previewDerivative="));
  const drawingDerivativeId = drawingRequest ? new URL(drawingRequest).searchParams.get("previewDerivative") : null;
  const partDerivativeId = partRequest ? new URL(partRequest).searchParams.get("previewDerivative") : null;
  record("QA-105-016", `${viewport.name} Part workbench renders through the shared preview panel`, partImageState.naturalWidth > 0 && await partPanel.locator(".drawing-preview-card").count() === 1, partImageState);
  record("QA-105-016", `${viewport.name} Drawing and Part consume the same ready derivative`, Boolean(drawingDerivativeId && drawingDerivativeId === partDerivativeId), { drawingDerivativeId, partDerivativeId });
  record(viewport.name === "desktop" ? "QA-105-015" : "QA-105-016", `${viewport.name} page has no horizontal overflow`,
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })));
  await page.screenshot({ path: path.join(screenshotDir, `${viewport.name}-part-A0002.png`), fullPage: false });
  await context.close();
}

try {
  primaryBefore = invariant(primaryDbPath);
  record("QA-105-018", "primary preflight has clean roots and foreign keys",
    primaryBefore.foreignKeys.length === 0 && Object.values(primaryBefore.rootReferenceOrphans).every((value) => value === 0), primaryBefore);

  const source = new Database(primaryDbPath, { readonly: true, fileMustExist: true });
  await source.backup(dbPath);
  source.close();
  record("QA-105-018", "browser fixture starts from an unmodified authoritative snapshot", invariant(dbPath).hash === primaryBefore.hash);
  if (fs.existsSync(primaryRepositoryDir)) fs.cpSync(primaryRepositoryDir, repositoryDir, { recursive: true, force: true });
  const fixture = new Database(dbPath);
  fixture.pragma("foreign_keys = ON");
  const localAssets = fixture.prepare("SELECT id,storage_key,original_path FROM file_assets WHERE storage_provider='local_repository' AND deleted_at IS NULL AND storage_key IS NOT NULL").all();
  const remap = fixture.prepare("UPDATE file_assets SET original_path=? WHERE id=?");
  let remapped = 0;
  const remapAll = fixture.transaction(() => {
    for (const asset of localAssets) {
      const candidate = path.join(repositoryDir, ...String(asset.storage_key).split("/"));
      if (!fs.existsSync(candidate)) continue;
      remap.run(candidate, asset.id);
      remapped += 1;
    }
  });
  remapAll();
  fixtureMutationLedger.push({ mutation: "remap local_repository original_path to task-owned repository copy", affectedRows: remapped });
  const fixturePreviewAssets = fixture.prepare(`SELECT DISTINCT asset.id, drawing.drawing_number
    FROM drawing_revision_files binding
    JOIN drawing_revisions revision ON revision.id=binding.drawing_revision_id
    JOIN drawings drawing ON drawing.id=revision.drawing_id
    JOIN file_assets asset ON asset.id=binding.source_file_asset_id
    WHERE binding.removed_at IS NULL AND asset.deleted_at IS NULL
      AND lower(asset.file_ext) IN ('sldprt','sldasm')
      AND drawing.drawing_number IN ('A0002-M01','A0006-M01')`).all();
  const clearPreviewArtifacts = fixture.transaction(() => {
    for (const asset of fixturePreviewAssets) {
      fixture.prepare("DELETE FROM file_derivatives WHERE source_file_asset_id=?").run(asset.id);
      fixture.prepare("DELETE FROM preview_jobs WHERE source_file_asset_id=?").run(asset.id);
    }
  });
  clearPreviewArtifacts();
  fixtureMutationLedger.push({ mutation: "clear A0002/A0006 preview artifacts in isolated browser fixture to exercise first-load pending recovery", affectedRows: fixturePreviewAssets.length });
  record("QA-105-018", "fixture path remap preserves foreign-key integrity", fixture.pragma("foreign_key_check").length === 0, { remapped });
  const work = fixture.prepare(`SELECT work.id work_id,work.drawing_id,work.owner_user_id,state.revision_id,drawing.drawing_number
    FROM drawing_revision_works work
    JOIN canonical_workbench_states state ON state.work_id=work.id AND state.company_id=work.company_id
    JOIN drawings drawing ON drawing.id=work.drawing_id AND drawing.company_id=work.company_id
    WHERE drawing.drawing_number='A0006-M01' AND state.handling='owner'
    ORDER BY work.created_at DESC LIMIT 1`).get();
  fixture.close();
  record("QA-105-001", "isolated A0006 current revision work is available for real upload", Boolean(work), work ? { drawingNumber: work.drawing_number } : null);

  port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  prepareRuntimeProject();
  runtimeDistDir = path.join(runtimeProjectRoot, ".tmp", `qc-dev105-browser-${port}`);
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_BUILD_COMMIT: "local-dev",
    PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: path.relative(runtimeProjectRoot, runtimeDistDir),
    PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
    PDM_WORKBENCH_PREVIEW_GALLERY_V1: "true",
    PDM_PART_PREVIEW_V1: "true",
    PDM_WORKBENCH_PRODUCTION_RD_LANES_V1: "true",
    PDM_LOCAL_FAKE_PREVIEW_WORKER: "",
    PDM_PREVIEW_WORKER_TOKEN: token
  });
  const nextTsconfig = createTaskOwnedNextTsconfig(runtimeProjectRoot, `dev105-${port}`, process.env.PDM_NEXT_DIST_DIR);
  process.env.PDM_NEXT_TSCONFIG_PATH = nextTsconfig.relativePath;
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    runtimeProject: runtimeProjectRoot,
    purpose: "DEV-105 isolated native upload, worker/API capability, Drawing+Part rendered 3D preview QC",
    port,
    owningProcessTree: "this runner -> task-owned Next dev process, one-shot preview workers and browser",
    cleanupCondition: "browser closed, Next process tree stopped, port released, runtime project and fixture removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: [taskRoot, runtimeProjectRoot, evidenceDir]
  } }));
  app = startNextApp(runtimeProjectRoot, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput, 120_000);

  browser = await chromium.launch({ headless: process.env.DEV105_HEADFUL !== "1" });
  const setupContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const setupPage = await setupContext.newPage();
  await login(setupPage, baseUrl, "setup");

  const a0006Before = sourceFor("A0006-M01");
  record("QA-105-001", "A0006 begins without a preview job", jobsFor(a0006Before.source_file_asset_id).length === 0);
  const workspaceUrl = `${baseUrl}/numbering/drawings/${encodeURIComponent(work.drawing_id)}/workspace?workId=${encodeURIComponent(work.work_id)}&returnTo=${encodeURIComponent("/numbering/drawings")}`;
  await setupPage.goto(workspaceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await setupPage.locator("[data-workspace-kind='drawing-revision-work']").waitFor({ state: "visible", timeout: 45_000 });
  const firstUpload = await uploadWorkspaceFile(setupPage, a0006Before.original_path, a0006Before.file_name);
  record("QA-105-001", "native upload request succeeds", firstUpload.ok(), { status: firstUpload.status() });
  const a0006After = sourceFor("A0006-M01");
  const queuedA0006 = await waitForDatabase("A0006 upload queue", () => {
    const rows = jobsFor(a0006After.source_file_asset_id);
    return rows.length === 1 && rows[0].status === "queued" && rows[0].source_content_hash === a0006After.content_hash ? rows : null;
  });
  record("QA-105-001", "native upload completion has exactly one current-hash queued job", queuedA0006.length === 1, { jobId: queuedA0006[0].id });
  const secondUpload = await uploadWorkspaceFile(setupPage, a0006After.original_path, a0006After.file_name);
  record("QA-105-002", "same native upload retry succeeds", secondUpload.ok(), { status: secondUpload.status() });
  const retryJobs = jobsFor(sourceFor("A0006-M01").source_file_asset_id);
  record("QA-105-002", "same upload retry preserves job id and count", retryJobs.length === 1 && retryJobs[0].id === queuedA0006[0].id);

  await setupPage.goto(`${baseUrl}/numbering/drawings?layout=preview&query=A0006-M01`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForList(setupPage);
  const firstLoadCard = setupPage.locator("[data-canonical-preview-card='true']").filter({ hasText: "A0006-M01" }).first();
  await firstLoadCard.waitFor({ state: "visible", timeout: 30_000 });
  const firstLoadRowKey = await firstLoadCard.getAttribute("data-row-key");
  record("QA-105-021", "cold first load exposes a compact pending loader and exact copy",
    await firstLoadCard.getAttribute("data-preview-state") === "pending"
      && await firstLoadCard.getByText("預覽建立中", { exact: true }).count() === 1
      && await firstLoadCard.locator(".canonical-preview-progress").count() === 1,
    { rowKey: firstLoadRowKey });
  const reducedMotionState = await firstLoadCard.locator(".canonical-preview-progress").evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.width, height: style.height, animationName: style.animationName };
  });
  record("QA-105-022", "reduced-motion keeps the pending indicator static and accessible",
    reducedMotionState.width === "14px" && reducedMotionState.height === "14px" && reducedMotionState.animationName === "none"
      && await firstLoadCard.getAttribute("aria-busy") === "true"
      && (await firstLoadCard.getAttribute("aria-label"))?.includes("預覽建立中"),
    reducedMotionState);
  await firstLoadCard.click();
  const firstLoadDrawer = setupPage.locator(".pdm-entity-detail-drawer");
  await firstLoadDrawer.waitFor({ state: "visible", timeout: 30_000 });
  await setupPage.locator('.pdm-entity-detail-drawer[data-detail-code="A0006-M01"]').waitFor({ state: "visible", timeout: 45_000 });
  await setupPage.evaluate(() => window.scrollTo(0, Math.min(160, document.documentElement.scrollHeight)));
  const firstLoadBefore = await setupPage.evaluate((rowKey) => ({
    url: window.location.href,
    scrollY: window.scrollY,
    activeRowKey: document.activeElement?.getAttribute("data-row-key"),
    drawerCode: document.querySelector(".pdm-entity-detail-drawer")?.dataset.detailCode,
    selected: document.querySelector(`[data-row-key="${rowKey}"]`)?.getAttribute("aria-pressed")
  }), firstLoadRowKey);
  const workerPromise = runWorkerAsync(baseUrl, a0006After.original_path, 105);
  await firstLoadCard.locator("img").waitFor({ state: "visible", timeout: 90_000 });
  await setupPage.waitForFunction((rowKey) => {
    const card = document.querySelector(`[data-row-key="${rowKey}"]`);
    const image = card?.querySelector("img");
    return card?.getAttribute("data-preview-state") === "ready" && Boolean(image?.complete && image.naturalWidth > 0);
  }, firstLoadRowKey, { timeout: 90_000 });
  await workerPromise;
  const firstLoadAfter = await setupPage.evaluate((rowKey) => ({
    url: window.location.href,
    scrollY: window.scrollY,
    activeRowKey: document.activeElement?.getAttribute("data-row-key"),
    drawerCode: document.querySelector(".pdm-entity-detail-drawer")?.dataset.detailCode,
    selected: document.querySelector(`[data-row-key="${rowKey}"]`)?.getAttribute("aria-pressed"),
    state: document.querySelector(`[data-row-key="${rowKey}"]`)?.getAttribute("data-preview-state")
  }), firstLoadRowKey);
  record("QA-105-019", "same gallery card converges from pending to real image without reload",
    firstLoadAfter.state === "ready"
      && await firstLoadCard.locator("img").evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)
      && firstLoadBefore.url === firstLoadAfter.url,
    { before: firstLoadBefore, after: firstLoadAfter });
  record("QA-105-020", "pending completion preserves selection focus scroll and drawer identity",
    firstLoadBefore.activeRowKey === firstLoadRowKey
      && firstLoadAfter.activeRowKey === firstLoadRowKey
      && firstLoadBefore.selected === "true"
      && firstLoadAfter.selected === "true"
      && firstLoadBefore.drawerCode === "A0006-M01"
      && firstLoadAfter.drawerCode === "A0006-M01"
      && firstLoadBefore.scrollY === firstLoadAfter.scrollY,
    { before: firstLoadBefore, after: firstLoadAfter });
  await setupPage.getByRole("button", { name: "關閉明細" }).click();

  const a0002 = sourceFor("A0002-M01");
  record("QA-105-003", "A0002 begins as a silent gap in browser fixture", jobsFor(a0002.source_file_asset_id).length === 0);
  let drawer = await openDrawingDetail(setupPage, baseUrl, "A0002-M01");
  await drawer.getByText("等待預覽服務", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const queuedA0002 = await waitForDatabase("A0002 detail recovery", () => {
    const rows = jobsFor(a0002.source_file_asset_id);
    return rows.length === 1 && rows[0].status === "queued" ? rows : null;
  });
  record("QA-105-003", "Drawing detail recovery queues the existing source", queuedA0002.length === 1, { jobId: queuedA0002[0].id });
  const a0002JobId = queuedA0002[0].id;
  for (let index = 0; index < 3; index += 1) {
    await setupPage.getByRole("button", { name: "關閉明細" }).click();
    drawer = await openDrawingDetail(setupPage, baseUrl, "A0002-M01");
  }
  record("QA-105-002", "three authenticated detail reads preserve the same job", jobsFor(a0002.source_file_asset_id).length === 1 && jobsFor(a0002.source_file_asset_id)[0].id === a0002JobId);

  fixtureWrite("UPDATE preview_jobs SET status='succeeded',completed_at=CURRENT_TIMESTAMP WHERE id=?", [a0002JobId]);
  fixtureWrite("DELETE FROM file_derivatives WHERE source_file_asset_id=?", [a0002.source_file_asset_id]);
  await setupPage.getByRole("button", { name: "關閉明細" }).click();
  await openDrawingDetail(setupPage, baseUrl, "A0002-M01");
  await waitForDatabase("succeeded missing recovery", () => jobsFor(a0002.source_file_asset_id)[0]?.status === "queued");
  record("QA-105-005", "authenticated detail read requeues succeeded-without-derivative on the same job", jobsFor(a0002.source_file_asset_id).length === 1 && jobsFor(a0002.source_file_asset_id)[0].id === a0002JobId);
  for (const terminalStatus of ["failed", "skipped"]) {
    fixtureWrite("UPDATE preview_jobs SET status=?,error_code='dev105_test',error_summary='sensitive path C:\\secret\\model.SLDPRT',completed_at=CURRENT_TIMESTAMP WHERE id=?", [terminalStatus, a0002JobId]);
    await setupPage.getByRole("button", { name: "關閉明細" }).click();
    await openDrawingDetail(setupPage, baseUrl, "A0002-M01");
    await waitForDatabase(`${terminalStatus} recovery`, () => jobsFor(a0002.source_file_asset_id)[0]?.status === "queued");
    const recovered = jobsFor(a0002.source_file_asset_id)[0];
    record("QA-105-006", `${terminalStatus} detail recovery clears error and reuses the job`, recovered.id === a0002JobId && recovered.error_code === null && recovered.error_summary === null);
  }

  await postCapability(baseUrl, "degraded", "preview_canary_pending");
  const degradedCapability = await getCapability(baseUrl);
  record("QA-105-010", "capability is fresh but degraded before a representative canary", degradedCapability.fresh && degradedCapability.status === "degraded" && degradedCapability.issueCode === "preview_canary_pending", degradedCapability);

  runWorker(baseUrl, a0002.original_path, 1);
  runWorker(baseUrl, a0002.original_path, 2);
  await waitForDatabase("A0002/A0006 worker completion", () => {
    const sources = [sourceFor("A0002-M01"), sourceFor("A0006-M01")];
    return sources.every((item) => jobsFor(item.source_file_asset_id)[0]?.status === "succeeded"
      && derivativesFor(item.source_file_asset_id).some((row) => row.status === "ready" && row.source_content_hash === item.content_hash
        && row.generator_profile === "windows_solidworks_preview_worker" && row.generator_version === "windows-shell-ishellitemimagefactory-v2"));
  }, 60_000);
  const readyCapability = await getCapability(baseUrl);
  record("QA-105-010", "real worker canary reports a fresh ready renderer capability", readyCapability.fresh && readyCapability.status === "ready" && readyCapability.readerVersion === "windows-shell-ishellitemimagefactory-v2", readyCapability);

  const readyCount = jobsFor(a0002.source_file_asset_id).length;
  await setupPage.getByRole("button", { name: "關閉明細" }).click();
  drawer = await openDrawingDetail(setupPage, baseUrl, "A0002-M01");
  const setupImage = drawer.locator("[data-component='canonical-preview-panel'] [data-preview-media='image']").first();
  await setupImage.waitFor({ state: "visible", timeout: 45_000 });
  record("QA-105-004", "ready derivative is displayed without creating a new job", jobsFor(a0002.source_file_asset_id).length === readyCount);
  await setupContext.close();

  for (const viewport of [
    { name: "desktop-1440x900", width: 1440, height: 900 },
    { name: "narrow-390x844", width: 390, height: 844 }
  ]) {
    await verifyReadyWorkbenchViewport(baseUrl, viewport);
  }

  const a0006FailureSource = sourceFor("A0006-M01");
  const a0006Job = jobsFor(a0006FailureSource.source_file_asset_id)[0];
  fixtureWrite("UPDATE file_derivatives SET status='retired' WHERE source_file_asset_id=? AND status='ready'", [a0006FailureSource.source_file_asset_id]);
  fixtureWrite("UPDATE preview_jobs SET status='queued',locked_by=NULL,locked_at=NULL,error_code=NULL,error_summary=NULL,completed_at=NULL WHERE id=?", [a0006Job.id]);
  const missingTaskPath = path.join(repositoryDir, "dev105-missing-source.SLDPRT");
  fixtureWrite("UPDATE file_assets SET original_path=? WHERE id=?", [missingTaskPath, a0006FailureSource.source_file_asset_id]);
  fixtureMutationLedger.push({ mutation: "temporarily point A0006 fixture source to a missing task-owned path for worker failure-path QC", affectedRows: 1 });
  runWorker(baseUrl, a0002.original_path, 3, true);
  const failedA0006 = jobsFor(a0006FailureSource.source_file_asset_id)[0];
  record("QA-105-017", "worker failure is redacted and does not leak a local path or token",
    failedA0006.status === "failed" && failedA0006.error_summary
      && !failedA0006.error_summary.includes(taskRoot) && !failedA0006.error_summary.includes("SLDPRT") && !failedA0006.error_summary.includes(token),
    { status: failedA0006.status, errorCode: failedA0006.error_code, errorSummary: failedA0006.error_summary });
  fixtureWrite("UPDATE file_assets SET original_path=? WHERE id=?", [a0006FailureSource.original_path, a0006FailureSource.source_file_asset_id]);

  await postCapability(baseUrl, "blocked", "preview_renderer_failed");
  const blockedCapability = await getCapability(baseUrl);
  record("QA-105-010", "converter failure is exposed as a fresh blocked capability", blockedCapability.fresh && blockedCapability.status === "blocked" && blockedCapability.issueCode === "preview_renderer_failed", blockedCapability);
  await postCapability(baseUrl, "ready", null);

  const failureContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const failurePage = await failureContext.newPage();
  await login(failurePage, baseUrl, "failure-path");
  const failureDrawer = await openDrawingDetail(failurePage, baseUrl, "A0006-M01");
  await failureDrawer.getByText("等待預覽服務", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const sourceLink = failureDrawer.getByRole("link").filter({ hasText: /下載/u }).first();
  const sourceHref = await sourceLink.getAttribute("href");
  const sourceResponse = sourceHref ? await failurePage.request.get(new URL(sourceHref, baseUrl).href) : null;
  record("QA-105-017", "failure path remains actionable and the controlled original is readable", Boolean(sourceResponse?.ok()), { sourceStatus: sourceResponse?.status() ?? null, hasAuthorizedLink: Boolean(sourceHref) });
  await failurePage.screenshot({ path: path.join(screenshotDir, "failure-path-A0006.png"), fullPage: false });
  await failureContext.close();

  const finalFixture = new Database(dbPath, { readonly: true, fileMustExist: true });
  record("QA-105-018", "browser fixture foreign keys remain clean", finalFixture.pragma("foreign_key_check").length === 0);
  finalFixture.close();
  record("QA-105-017", "browser run has no unexpected console, page, request or HTTP errors", browserEvents.length === 0, browserEvents);
} catch (error) {
  fatalError = error instanceof Error ? error.stack || error.message : String(error);
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close().catch(() => undefined);
    browser = null;
  }
  cleanup.browserClosed = true;
  if (app?.child) {
    await stopNextApp(app.child).catch(() => undefined);
    cleanup.appStopped = app.child.exitCode !== null;
  } else {
    cleanup.appStopped = true;
  }
  if (port !== null) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (!(await canConnect(port))) { cleanup.portReleased = true; break; }
      await delay(250);
    }
  } else {
    cleanup.portReleased = true;
  }
  const runtimeRemoval = removeTaskOwnedWorkspaceTempDir(root, runtimeProjectRoot);
  cleanup.runtimeProjectRemoved = runtimeRemoval.removed;
  cleanup.runtimeProjectRemovalError = runtimeRemoval.error;
  try {
    fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    cleanup.taskRootRemoved = !fs.existsSync(taskRoot);
  } catch (error) {
    cleanup.taskRootRemovalError = error instanceof Error ? error.message : String(error);
  }
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  primaryAfter = invariant(primaryDbPath);
  const primaryStable = primaryBefore?.hash === primaryAfter.hash
    && primaryAfter.foreignKeys.length === 0
    && Object.values(primaryAfter.rootReferenceOrphans).every((value) => value === 0);
  checks.push({ id: "QA-105-018", name: "primary schema and canonical identities are unchanged after browser QC", passed: primaryStable, detail: { before: primaryBefore?.hash, after: primaryAfter.hash } });
  const cleanupPass = cleanup.browserClosed && cleanup.appStopped && cleanup.portReleased && cleanup.runtimeProjectRemoved && cleanup.taskRootRemoved;
  checks.push({ id: "QA-105-018", name: "task-owned browser, process, port and fixture cleanup is complete", passed: cleanupPass, detail: cleanup });
  const manifest = {
    devId: "DEV-105",
    capaId: "CAPA-2026-3DP-001",
    runId,
    runtime: { project: "AI_PDM", port, purpose: "isolated native upload + worker + Drawing/Part rendered preview", primaryWrites: false },
    fixtureMutationLedger,
    checks,
    browserEvents,
    primaryBefore,
    primaryAfter,
    cleanup,
    fatalError,
    passed: !fatalError && checks.every((item) => item.passed)
  };
  fs.writeFileSync(path.join(evidenceDir, "browser-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.id} ${item.name}`);
  if (fatalError) console.error(fatalError);
  if (!manifest.passed) process.exitCode = 1;
  else console.log(`DEV-105 browser QC passed ${checks.length}/${checks.length} checks; evidence=${evidenceDir}`);
}
