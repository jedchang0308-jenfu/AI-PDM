#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { chromium } from "playwright";

import {
  getFreePort,
  removeTaskOwnedWorkspaceTempDir,
  startNextApp,
  stopNextApp,
  waitForNextAppReady
} from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `CANONICAL-DRAWING-UPLOAD-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "canonical-drawing-upload", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-canonical-drawing-upload-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const fixtureRepository = path.join(tempRoot, "repository");
const sourceDb = path.resolve(process.env.PDM_QC_SOURCE_DB?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
const sourceRepository = path.resolve(process.env.PDM_QC_SOURCE_REPOSITORY?.trim() || path.join(root, "data", "repository"));
const installedChrome = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].find((candidate) => fs.existsSync(candidate));
const checks = [];
const consoleErrors = [];
const failures = [];
let browser = null;
let app = null;
let port = null;
let runtimeDistDir = null;
let expectedUploadError = false;
let sourceBefore = null;

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function sourceInvariant() {
  const database = new Database(sourceDb, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    const payload = {
      masters: {
        roots: database.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count,
        parts: database.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count,
        drawings: database.prepare("SELECT COUNT(*) AS count FROM drawings").get().count
      },
      activeWork: database.prepare(`SELECT state.work_id, state.revision_id, drawing.id AS drawing_id, drawing.drawing_number
        FROM canonical_workbench_states state
        JOIN drawings drawing ON drawing.id = state.canonical_entity_id AND drawing.company_id = state.company_id
        WHERE state.entity_type = 'drawing' AND state.handling = 'owner' AND state.work_id IS NOT NULL
        ORDER BY CASE WHEN drawing.drawing_number = 'A0002-M01' THEN 0 ELSE 1 END, state.created_at, state.id
        LIMIT 1`).get() ?? null,
      residue: database.prepare(`SELECT name FROM sqlite_master WHERE type='table'
        AND name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration') ORDER BY name`).all(),
      foreignKeys: database.pragma("foreign_key_check"),
      schema: database.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
        WHERE type IN ('table','index','trigger') AND tbl_name IN (
          'part_roots','part_numbers','drawing_numbers','drawings','drawing_revisions',
          'drawing_revision_files','drawing_revision_works','drawing_revision_work_files','canonical_workbench_states'
        ) ORDER BY type, name`).all()
    };
    return { payload, hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  } finally {
    database.close();
  }
}

function monitor(page) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (expectedUploadError && message.text().includes("Failed to load resource")) return;
    consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => failures.push({ kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (expectedUploadError && response.status() === 422 && response.url().includes("/drawing-revision-works/") && response.url().endsWith("/files")) return;
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

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(fixtureRepository, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });

  sourceBefore = sourceInvariant();
  check("primary source snapshot has an active canonical drawing work", Boolean(sourceBefore.payload.activeWork), JSON.stringify(sourceBefore.payload.activeWork));
  check("primary source snapshot foreign keys are clean", sourceBefore.payload.foreignKeys.length === 0, JSON.stringify(sourceBefore.payload.foreignKeys));
  check("primary source snapshot has no company-scope migration residue", sourceBefore.payload.residue.length === 0, JSON.stringify(sourceBefore.payload.residue));

  const source = new Database(sourceDb, { readonly: true, fileMustExist: true });
  await source.backup(fixtureDb);
  source.close();
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });

  const fixture = new Database(fixtureDb);
  fixture.pragma("foreign_keys = ON");
  const work = fixture.prepare(`SELECT state.work_id, state.revision_id, drawing.id AS drawing_id, drawing.drawing_number
    FROM canonical_workbench_states state
    JOIN drawings drawing ON drawing.id = state.canonical_entity_id AND drawing.company_id = state.company_id
    WHERE state.entity_type = 'drawing' AND state.handling = 'owner' AND state.work_id IS NOT NULL
    ORDER BY CASE WHEN drawing.drawing_number = 'A0002-M01' THEN 0 ELSE 1 END, state.created_at, state.id
    LIMIT 1`).get();
  check("isolated fixture resolves the target drawing work", Boolean(work), JSON.stringify(work));
  fixture.close();

  port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  runtimeDistDir = path.join(root, ".tmp", `qc-canonical-drawing-upload-${port}`);
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository,
    PDM_BUILD_COMMIT: "local-dev",
    PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: path.relative(root, runtimeDistDir),
    PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`Canonical drawing upload runtime: project=${root}; purpose=canonical work upload UI QC; port=${port}; owner=current QC process tree; dataDir=${fixtureDataDir}; repositoryDir=${fixtureRepository}; mutationScope=isolated fixture only; cleanup=after browser assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput, 90_000);

  browser = await chromium.launch({ headless: true, ...(installedChrome ? { executablePath: installedChrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1740, height: 965 }, reducedMotion: "reduce" });
  await login(context, baseUrl);
  const page = await context.newPage();
  monitor(page);
  const workspaceUrl = `${baseUrl}/numbering/drawings/${encodeURIComponent(work.drawing_id)}/workspace?workId=${encodeURIComponent(work.work_id)}&returnTo=${encodeURIComponent("/numbering/drawings")}`;
  await page.goto(workspaceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator('[data-workspace-kind="drawing-revision-work"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("heading", { name: work.drawing_number, exact: true }).waitFor({ state: "visible", timeout: 30_000 });

  const fileInput = page.locator('.dev079-workspace-file-upload input[type="file"]');
  const uploadButton = page.getByRole("button", { name: "上傳所選檔案", exact: true });
  const submitButton = page.getByRole("button", { name: "送出審核", exact: true });
  check("canonical workspace exposes a labelled file input", await fileInput.count() === 1 && await fileInput.evaluate((element) => Boolean(element.labels?.[0]?.textContent?.includes("拖放圖面檔案"))));
  check("submit is blocked before current revision primaries are complete", await submitButton.isDisabled());
  await page.screenshot({ path: path.join(screenshotDir, "01-upload-empty-desktop.png"), fullPage: false });

  const token = crypto.randomUUID().slice(0, 8);
  const drawing2d = `${work.drawing_number}-${token}.SLDDRW`;
  const drawing3d = `${work.drawing_number}-${token}.SLDPRT`;
  await fileInput.setInputFiles({ name: drawing2d, mimeType: "application/octet-stream", buffer: Buffer.from(`QC-SLDDRW-${token}`) });
  check("upload action enables after keyboard-addressable selection", await uploadButton.isEnabled());
  const firstResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/files"), { timeout: 30_000 });
  await uploadButton.click();
  check("2D upload returns success", (await firstResponse).ok());
  await page.locator(".dev079-workspace-file-list").getByTitle(drawing2d).waitFor({ state: "visible", timeout: 30_000 });
  check("submit remains blocked when only current 2D exists", await submitButton.isDisabled());
  await page.screenshot({ path: path.join(screenshotDir, "02-upload-partial-desktop.png"), fullPage: false });

  await fileInput.setInputFiles({ name: drawing3d, mimeType: "application/octet-stream", buffer: Buffer.from(`QC-SLDPRT-${token}`) });
  const secondResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/files"), { timeout: 30_000 });
  await uploadButton.click();
  check("3D upload returns success", (await secondResponse).ok());
  await page.locator(".dev079-workspace-file-list").getByTitle(drawing3d).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("本版次 2D 與 3D 主檔已齊備。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  check("both uploaded files are visibly marked as current revision", await page.locator(".dev079-workspace-file-list li").filter({ hasText: "本版次" }).count() === 2, await page.locator(".dev079-workspace-file-editor").innerText());
  check("submit enables after server-backed current revision readiness", await submitButton.isEnabled());
  check("desktop workspace has no horizontal viewport overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.screenshot({ path: path.join(screenshotDir, "03-upload-ready-desktop.png"), fullPage: false });

  const invalidName = `${work.drawing_number}-${token}.txt`;
  await fileInput.setInputFiles({ name: invalidName, mimeType: "text/plain", buffer: Buffer.from("INVALID-DRAWING-FILE") });
  expectedUploadError = true;
  const invalidResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/files"), { timeout: 30_000 });
  await uploadButton.click();
  check("invalid extension is rejected by the real HTTP route", (await invalidResponse).status() === 422);
  await page.getByRole("alert").getByText(/接受 \.SLDDRW/u).waitFor({ state: "visible", timeout: 30_000 });
  check("invalid upload keeps the selected file available for recovery", await page.getByText(invalidName, { exact: true }).count() === 1);
  await page.screenshot({ path: path.join(screenshotDir, "04-upload-error-desktop.png"), fullPage: false });
  await page.waitForTimeout(250);
  expectedUploadError = false;

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("本版次 2D 與 3D 主檔已齊備。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const visibleAlertsAfterReload = (await page.locator('[role="alert"]:visible').allTextContents()).map((value) => value.trim()).filter(Boolean);
  const submitEnabledAfterReload = await page.getByRole("button", { name: "送出審核", exact: true }).isEnabled();
  check("reload clears the transient error and preserves uploaded readiness", visibleAlertsAfterReload.length === 0 && submitEnabledAfterReload, JSON.stringify({ visibleAlertsAfterReload, submitEnabledAfterReload }));
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileUploadButton = page.getByRole("button", { name: "上傳所選檔案", exact: true });
  await mobileUploadButton.scrollIntoViewIfNeeded();
  const mobileUploadBox = await mobileUploadButton.boundingBox();
  const mobileFooterBox = await page.locator(".dev079-workspace-footer").boundingBox();
  check("mobile workspace keeps upload action reachable above the fixed footer", Boolean(mobileUploadBox && mobileFooterBox
    && mobileUploadBox.y >= 0 && mobileUploadBox.y + mobileUploadBox.height <= mobileFooterBox.y + 1), JSON.stringify({ mobileUploadBox, mobileFooterBox }));
  check("mobile workspace has no horizontal viewport overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.screenshot({ path: path.join(screenshotDir, "05-upload-ready-mobile.png"), fullPage: false });

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "取消本次工作", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/numbering/drawings", { timeout: 30_000 });
  const cleanup = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  check("cancel removes the isolated target work", cleanup.prepare("SELECT COUNT(*) AS count FROM drawing_revision_works WHERE id = ?").get(work.work_id).count === 0);
  check("cancel retires both isolated upload receipts", cleanup.prepare(`SELECT COUNT(*) AS count FROM file_assets WHERE file_name IN (?, ?) AND deleted_at IS NOT NULL AND deleted_reason = 'drawing_revision_work_cancelled'`).get(drawing2d, drawing3d).count === 2);
  check("isolated fixture remains foreign-key clean", cleanup.pragma("foreign_key_check").length === 0, JSON.stringify(cleanup.pragma("foreign_key_check")));
  cleanup.close();
  check("browser has no unexpected console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("browser has no unexpected page or network failures", failures.length === 0, JSON.stringify(failures));
  await context.close();
} catch (error) {
  checks.push({ name: "browser execution", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: released, detail: `port=${port}` });
  }
  const runtimeCleanup = runtimeDistDir
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeDistDir)
    : { removed: true, path: null, error: null };
  checks.push({ name: "temporary runtime dist removed", pass: runtimeCleanup.removed, detail: JSON.stringify(runtimeCleanup) });
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
  checks.push({ name: "temporary fixture removed", pass: !fs.existsSync(tempRoot), detail: tempRoot });
  if (sourceBefore) {
    try {
      const sourceAfter = sourceInvariant();
      checks.push({ name: "primary SQLite invariant unchanged", pass: sourceAfter.hash === sourceBefore.hash, detail: `${sourceBefore.hash} -> ${sourceAfter.hash}` });
    } catch (error) {
      checks.push({ name: "primary SQLite invariant unchanged", pass: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
}

const failed = checks.filter((item) => !item.pass);
const manifest = {
  runId,
  status: failed.length > 0 ? "FAIL" : "PASS",
  port,
  sourceInvariantHash: sourceBefore?.hash ?? null,
  outputDir,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  consoleErrors,
  failures
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length > 0) process.exitCode = 1;
