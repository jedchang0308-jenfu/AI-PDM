#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
const runId = `DEV100-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV100_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-100", runId));
const screenshotDir = path.join(evidenceDir, "screenshots");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev100-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const runtimeProjectRoot = path.join(root, ".tmp", `qc-dev100-browser-runtime-project-${crypto.randomUUID()}`);
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");
const primaryRepositoryDir = path.join(root, "data", "repository");
const originalEnv = new Map();
const envNames = ["NODE_ENV", "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_BUILD_COMMIT", "PDM_RELEASE_MODE", "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_ENABLE_LOCAL_QUICK_LOGIN", "PDM_PRODUCTION_SLICE_MODE", "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_NEXT_TSCONFIG_PATH", "PDM_PUBLIC_BASE_URL"];
for (const name of envNames) originalEnv.set(name, process.env[name]);

const installedChrome = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].find((candidate) => fs.existsSync(candidate));
const checks = [];
const failures = [];
const consoleErrors = [];
const uploadResponses = [];
let expectedSnapshot409 = false;
let app = null;
let browser = null;
let port = null;
let runtimeDistDir = null;
let nextTsconfig = null;
let primaryBefore = null;
const startupAttempts = [];

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });

function prepareRuntimeProject() {
  const workspaceTempRoot = path.resolve(root, ".tmp");
  const resolvedRuntimeRoot = path.resolve(runtimeProjectRoot);
  if (!resolvedRuntimeRoot.startsWith(`${workspaceTempRoot}${path.sep}`)
    || !path.basename(resolvedRuntimeRoot).startsWith("qc-dev100-browser-runtime-project-")) {
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

function check(name, condition, detail = null) {
  const status = condition ? "PASS" : "FAIL";
  checks.push({ name, status, detail });
  if (!condition) throw new Error(`${name}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
}
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function primaryInvariant() {
  const db = new Database(primaryDbPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  try {
    const payload = {
      schema: db.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND tbl_name IN ('part_roots','part_numbers','drawing_numbers','drawings','drawing_revisions','drawing_revision_files','drawing_revision_works','drawing_revision_work_files','canonical_workbench_states') ORDER BY type,name`).all(),
      masters: {
        roots: db.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY id").all(),
        parts: db.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY id").all(),
        drawings: db.prepare("SELECT id,company_id,part_root_id,drawing_number FROM drawings ORDER BY id").all()
      },
      rootReferenceOrphans: {
        parts: db.prepare("SELECT COUNT(*) count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id WHERE part.part_root_id IS NOT NULL AND root.id IS NULL").get().count,
        drawings: db.prepare("SELECT COUNT(*) count FROM drawings drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL").get().count
      },
      residue: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%migration%' ORDER BY name").all(),
      foreignKeys: db.pragma("foreign_key_check")
    };
    return { payload, hash: sha256(JSON.stringify(payload)) };
  } finally { db.close(); }
}
function monitor(page) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (expectedSnapshot409 && message.text().includes("Failed to load resource")) return;
    consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => failures.push({ kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.request().method() === "POST" && response.url().endsWith("/files")) uploadResponses.push({ status: response.status(), url: response.url() });
    if (expectedSnapshot409 && response.status() === 409 && response.url().includes("/drawing-revision-works/")) return;
    if (response.status() >= 400) failures.push({ kind: "http", status: response.status(), url: response.url() });
  });
}
async function login(context, baseUrl) {
  const page = await context.newPage();
  monitor(page);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  await page.close();
}
function inspectFixture(workId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const active = db.prepare(`SELECT binding.ordinal,file.id,asset.id asset_id,asset.file_name,file.role,asset.storage_key,asset.content_hash
      FROM drawing_revision_work_files binding JOIN drawing_revision_files file ON file.id=binding.file_binding_id JOIN file_assets asset ON asset.id=file.source_file_asset_id
      WHERE binding.work_id=? AND file.removed_at IS NULL AND asset.deleted_at IS NULL ORDER BY binding.ordinal,file.id`).all(workId);
    const tombstones = db.prepare(`SELECT file.id,asset.id asset_id,asset.file_name,file.role,file.removed_by,asset.deleted_by,asset.deleted_reason,asset.storage_key,asset.content_hash
      FROM drawing_revision_files file JOIN file_assets asset ON asset.id=file.source_file_asset_id JOIN canonical_workbench_states state ON state.revision_id=file.drawing_revision_id
      WHERE state.work_id=? AND file.removed_at IS NOT NULL ORDER BY file.created_at,file.id`).all(workId);
    return { active, tombstones, foreignKeys: db.pragma("foreign_key_check") };
  } finally { db.close(); }
}
function assertPhysical(rows) {
  for (const row of rows) {
    const filePath = path.join(repositoryDir, ...String(row.storage_key).split("/"));
    assert.equal(fs.existsSync(filePath), true, `${row.file_name} bytes exist`);
    assert.equal(sha256(fs.readFileSync(filePath)), row.content_hash, `${row.file_name} bytes hash`);
  }
}

try {
  primaryBefore = primaryInvariant();
  check("primary foreign keys are clean before browser runtime", primaryBefore.payload.foreignKeys.length === 0, primaryBefore.payload.foreignKeys);
  check("primary root references are clean before browser runtime", Object.values(primaryBefore.payload.rootReferenceOrphans).every((value) => value === 0), primaryBefore.payload.rootReferenceOrphans);

  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_DB_PROVIDER = "sqlite";
  const source = new Database(primaryDbPath, { readonly: true, fileMustExist: true });
  await source.backup(dbPath);
  source.close();
  if (fs.existsSync(primaryRepositoryDir)) fs.cpSync(primaryRepositoryDir, repositoryDir, { recursive: true, force: true });
  const fixture = new Database(dbPath);
  let work;
  try {
    fixture.pragma("foreign_keys = ON");
    work = fixture.prepare(`SELECT work.id work_id,work.drawing_id,work.owner_user_id,state.revision_id
      FROM drawing_revision_works work
      JOIN canonical_workbench_states state ON state.work_id=work.id AND state.company_id=work.company_id
      JOIN drawings drawing ON drawing.id=work.drawing_id AND drawing.company_id=work.company_id
      WHERE drawing.drawing_number='A0044-M01' AND state.handling='owner'
      ORDER BY work.created_at DESC LIMIT 1`).get();
    check("isolated primary backup resolves the affected A0044-M01 work", Boolean(work), work);
    const active = fixture.prepare(`SELECT file.id,asset.id asset_id FROM drawing_revision_work_files binding
      JOIN drawing_revision_files file ON file.id=binding.file_binding_id
      JOIN file_assets asset ON asset.id=file.source_file_asset_id
      WHERE binding.work_id=? AND file.drawing_revision_id=? AND file.removed_at IS NULL AND asset.deleted_at IS NULL`).all(work.work_id, work.revision_id);
    const prepare = fixture.transaction(() => {
      fixture.prepare("DELETE FROM drawing_revision_work_files WHERE work_id=?").run(work.work_id);
      for (const row of active) {
        fixture.prepare("UPDATE drawing_revision_files SET removed_at=CURRENT_TIMESTAMP,removed_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND removed_at IS NULL").run(work.owner_user_id, row.id);
        fixture.prepare("UPDATE file_assets SET deleted_at=CURRENT_TIMESTAMP,deleted_by=?,deleted_reason='drawing_revision_work_file_replaced',updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL").run(work.owner_user_id, row.asset_id);
      }
    });
    prepare();
    check("isolated A0044 precondition is a legal zero-active migrated work", fixture.prepare("SELECT COUNT(*) count FROM drawing_revision_work_files WHERE work_id=?").get(work.work_id).count === 0);
  } finally { fixture.close(); }

  port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  prepareRuntimeProject();
  runtimeDistDir = path.join(runtimeProjectRoot, ".tmp", `qc-dev100-browser-${port}`);
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
    PDM_PUBLIC_BASE_URL: baseUrl
  });
  nextTsconfig = createTaskOwnedNextTsconfig(runtimeProjectRoot, `dev100-${port}`, process.env.PDM_NEXT_DIST_DIR);
  process.env.PDM_NEXT_TSCONFIG_PATH = nextTsconfig.relativePath;
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    runtimeProject: runtimeProjectRoot,
    purpose: "DEV-100 authenticated rendered exact A0044 upload and snapshot-409 UI evidence",
    port,
    owningProcessTree: "this runner -> task-owned Next dev process and browser",
    cleanupCondition: "browser closed, Next process tree stopped, port released, runtime project and fixture removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: [taskRoot, runtimeProjectRoot]
  } }));
  app = startNextApp(runtimeProjectRoot, "dev", port);
  try {
    await waitForNextAppReady(baseUrl, app.getOutput, 120_000);
    startupAttempts.push({ attempt: 1, result: "PASS", error: null });
  } catch (error) {
    startupAttempts.push({ attempt: 1, result: "FAIL", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  check("task-owned runtime project starts exactly once", startupAttempts.length === 1 && startupAttempts[0].result === "PASS", startupAttempts);

  browser = await chromium.launch({ headless: process.env.DEV100_HEADLESS === "1", ...(installedChrome ? { executablePath: installedChrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1740, height: 965 }, reducedMotion: "reduce" });
  await login(context, baseUrl);
  const page = await context.newPage();
  monitor(page);
  const workspaceUrl = `${baseUrl}/numbering/drawings/${encodeURIComponent(work.drawing_id)}/workspace?workId=${encodeURIComponent(work.work_id)}&returnTo=${encodeURIComponent("/numbering/drawings")}`;
  await page.goto(workspaceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator('[data-workspace-kind="drawing-revision-work"]').waitFor({ state: "visible", timeout: 45_000 });
  await page.getByRole("heading", { name: "A0044-M01", exact: true }).waitFor({ state: "visible" });

  const fileInput = page.locator('.dev079-workspace-file-upload input[type="file"]');
  await fileInput.setInputFiles([
    { name: "A0044.SLDASM", mimeType: "application/octet-stream", buffer: Buffer.from("DEV100-A0044-ASSEMBLY") },
    { name: "A0044-M01.pdf", mimeType: "application/pdf", buffer: Buffer.from("DEV100-A0044-PDF") },
    { name: "A0043.SLDASM", mimeType: "application/octet-stream", buffer: Buffer.from("DEV100-A0043-ASSEMBLY") }
  ]);
  const expectedWarning = "3D 主檔會依上傳順序替換：A0044.SLDASM → A0043.SLDASM；最後保留 A0043.SLDASM。";
  await page.getByText(expectedWarning, { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  check("exact filename replacement warning is visible before upload", await page.locator("[data-dev100-replacement-warning]").innerText() === expectedWarning);
  await page.screenshot({ path: path.join(screenshotDir, "01-exact-replacement-warning-desktop.png"), fullPage: false });

  await page.getByRole("button", { name: "上傳所選檔案", exact: true }).click();
  await page.locator(".dev079-workspace-file-list").getByTitle("A0043.SLDASM").waitFor({ state: "visible", timeout: 60_000 });
  await page.locator(".dev079-workspace-file-list").getByTitle("A0044-M01.pdf").waitFor({ state: "visible", timeout: 30_000 });
  check("all three file POSTs return success", uploadResponses.length === 3 && uploadResponses.every((entry) => entry.status >= 200 && entry.status < 300), uploadResponses);
  check("active UI list contains only last 3D primary plus PDF", await page.locator(".dev079-workspace-file-list li").count() === 2
    && await page.locator(".dev079-workspace-file-list").getByTitle("A0044.SLDASM").count() === 0,
  await page.locator(".dev079-workspace-file-list").innerText());
  const visibleAlertsAfterUpload = (await page.locator('[role="alert"]:visible').allTextContents()).map((value) => value.trim()).filter(Boolean);
  check("successful sequence has no visible error", visibleAlertsAfterUpload.length === 0, visibleAlertsAfterUpload);
  check("desktop workspace has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.screenshot({ path: path.join(screenshotDir, "02-active-a0043-plus-pdf-desktop.png"), fullPage: false });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

  const postUpload = inspectFixture(work.work_id);
  check("DB active set is exactly A0043 plus PDF", JSON.stringify(postUpload.active.map((row) => row.file_name)) === JSON.stringify(["A0043.SLDASM", "A0044-M01.pdf"]), postUpload.active);
  check("A0044 is an auditable replacement tombstone", postUpload.tombstones.some((row) => row.file_name === "A0044.SLDASM" && row.deleted_reason === "drawing_revision_work_file_replaced" && row.removed_by && row.deleted_by), postUpload.tombstones);
  check("isolated upload DB foreign keys remain clean", postUpload.foreignKeys.length === 0, postUpload.foreignKeys);
  assertPhysical([...postUpload.active, ...postUpload.tombstones]);
  checks.push({ name: "all three physical byte hashes match DB", status: "PASS", detail: postUpload.active.concat(postUpload.tombstones).map((row) => row.file_name) });

  const pdf = postUpload.active.find((row) => row.file_name === "A0044-M01.pdf");
  assert.ok(pdf);
  const corruptDb = new Database(dbPath);
  corruptDb.prepare("UPDATE file_assets SET deleted_at=CURRENT_TIMESTAMP,deleted_by=?,deleted_reason='dev100_active_deleted_injection' WHERE id=?").run(work.owner_user_id, pdf.asset_id);
  corruptDb.close();
  expectedSnapshot409 = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-dev100-load-failed="DRAWING_WORK_FILE_SNAPSHOT_INVALID"]').waitFor({ state: "visible", timeout: 45_000 });
  const snapshotAlerts = (await page.locator('[role="alert"]:visible').allTextContents()).map((value) => value.trim()).filter(Boolean);
  check("snapshot 409 renders exactly one actionable repair alert", snapshotAlerts.length === 1
    && snapshotAlerts[0].includes("已暫停所有操作"), snapshotAlerts);
  check("snapshot 409 does not render stale workspace, files, readiness or mutation controls", await page.locator('[data-workspace-kind="drawing-revision-work"], .dev079-workspace-file-list, .dev079-workspace-file-requirement').count() === 0
    && await page.getByRole("button", { name: "上傳所選檔案", exact: true }).count() === 0
    && await page.getByRole("button", { name: "送出審核", exact: true }).count() === 0);
  check("snapshot 409 exposes only bounded recovery navigation", await page.getByRole("button", { name: "返回圖號清單", exact: true }).count() === 1
    && await page.getByRole("button", { name: "重新載入資料", exact: true }).count() === 1);
  await page.getByRole("button", { name: "返回圖號清單", exact: true }).focus();
  check("recovery action receives keyboard focus", await page.getByRole("button", { name: "返回圖號清單", exact: true }).evaluate((element) => document.activeElement === element));
  await page.screenshot({ path: path.join(screenshotDir, "03-snapshot-409-desktop.png"), fullPage: false });

  for (const [label, width, height] of [["tablet", 768, 900], ["mobile-320", 320, 780]]) {
    await page.setViewportSize({ width, height });
    check(`${label} error state has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), { width, scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) });
    await page.screenshot({ path: path.join(screenshotDir, `04-snapshot-409-${label}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => { document.body.style.zoom = "2"; });
  check("200 percent visual zoom preserves bounded recovery without horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.screenshot({ path: path.join(screenshotDir, "05-snapshot-409-200-percent.png"), fullPage: false });
  await page.evaluate(() => { document.body.style.zoom = ""; });

  const restoreDb = new Database(dbPath);
  restoreDb.prepare("UPDATE file_assets SET deleted_at=NULL,deleted_by=NULL,deleted_reason=NULL WHERE id=?").run(pdf.asset_id);
  restoreDb.close();
  expectedSnapshot409 = false;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".dev079-workspace-file-list").getByTitle("A0043.SLDASM").waitFor({ state: "visible", timeout: 45_000 });
  check("restoring the injected fixture corruption recovers normal workspace", await page.locator('[data-workspace-kind="drawing-revision-work"]').count() === 1);
  check("browser has no unexpected console errors", consoleErrors.length === 0, consoleErrors);
  check("browser has no unexpected page or network failures", failures.length === 0, failures);
  await context.close();
} catch (error) {
  checks.push({ name: "browser execution", status: "FAIL", detail: error instanceof Error ? error.stack ?? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch { /* cleanup continues */ }
  try { if (app?.child) await stopNextApp(app.child); } catch { /* cleanup evidence below */ }
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "task-owned browser runtime port released", status: released ? "PASS" : "FAIL", detail: { port } });
  }
  const runtimeProjectCleanup = removeTaskOwnedWorkspaceTempDir(root, runtimeProjectRoot);
  checks.push({ name: "task-owned Next runtime project removed", status: runtimeProjectCleanup.removed ? "PASS" : "FAIL", detail: runtimeProjectCleanup });
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch { /* cleanup check below */ }
  checks.push({ name: "task-owned browser fixture removed", status: fs.existsSync(taskRoot) ? "FAIL" : "PASS", detail: taskRoot });
  try {
    const primaryAfter = primaryInvariant();
    checks.push({ name: "primary schema, identities, root refs, residue and FK unchanged", status: primaryBefore?.hash === primaryAfter.hash ? "PASS" : "FAIL", detail: { before: primaryBefore?.hash, after: primaryAfter.hash } });
  } catch (error) {
    checks.push({ name: "primary schema, identities, root refs, residue and FK unchanged", status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

const failed = checks.filter((entry) => entry.status !== "PASS");
const manifest = { runner: "browser", runId, status: failed.length ? "FAIL" : "PASS", headed: process.env.DEV100_HEADLESS !== "1", port, productionWrites: false, startupAttempts, checks, failures, consoleErrors, screenshots: fs.existsSync(screenshotDir) ? fs.readdirSync(screenshotDir).sort() : [] };
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "browser.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: manifest.runner, status: manifest.status, passed: checks.length - failed.length, total: checks.length, screenshots: manifest.screenshots.length }));
if (manifest.status !== "PASS") process.exitCode = 1;
