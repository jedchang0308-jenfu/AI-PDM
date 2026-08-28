#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium, request as playwrightRequest } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV092-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-092-browser", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev092-browser-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.resolve(process.env.PDM_PRIMARY_REPOSITORY_DIR || path.join(root, "data", "repository"));
const fixtureRepository = path.join(fixtureDataDir, "repository");
let targetCode = null;
const checks = [];
const failures = [];
const fixtureMutationLedger = [];
let app = null;
let browser = null;
let port = null;
let baseUrl = "";
let runtimeProjectRoot = null;
let primaryBefore = null;
let primaryAfter = null;
let tempCleanupReceipt = { removed: false, path: tempRoot, error: "not-attempted" };

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function readInvariantSnapshot(databasePath = sourceDb) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${databasePath}`], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
}

function invariantSafe(snapshot) {
  return snapshot
    && Object.values(snapshot.counts ?? {}).every((count) => Number(count) > 0)
    && Number(snapshot.migrationResidue?.unresolved ?? -1) === 0
    && Object.values(snapshot.rootReferenceViolations ?? {}).every((count) => Number(count) === 0)
    && Number(snapshot.foreignKeyViolations ?? -1) === 0;
}

function prepareTaskOwnedRuntimeProject(targetRoot) {
  const workspaceTemp = path.resolve(root, ".tmp");
  const target = path.resolve(targetRoot);
  if (!target.startsWith(`${workspaceTemp}${path.sep}`) || !path.basename(target).startsWith("qc-dev092-browser-runtime-project-")) {
    throw new Error(`UNSAFE_RUNTIME_PROJECT_PATH:${target}`);
  }
  fs.mkdirSync(target, { recursive: true });
  for (const file of ["package.json", "next.config.mjs", "tsconfig.json", "tsconfig.app.json", "tsconfig.next.json", "next-env.d.ts"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(target, file));
  }
  for (const file of [".env", ".env.local", ".env.development.local"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(target, file));
  }
  for (const directory of ["src", "public", "db", "config"]) {
    const source = path.join(root, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(target, directory), { recursive: true, force: true });
  }
  const nextConfigPath = path.join(target, "next.config.mjs");
  const nextConfig = fs.readFileSync(nextConfigPath, "utf8");
  const isolatedNextConfig = nextConfig.replace("const nextConfig = {", "const nextConfig = {\n  agentRules: false,");
  if (isolatedNextConfig === nextConfig) throw new Error("RUNTIME_NEXT_CONFIG_PATCH_POINT_MISSING");
  fs.writeFileSync(nextConfigPath, isolatedNextConfig, "utf8");
  fs.mkdirSync(path.join(target, "scripts"), { recursive: true });
  for (const file of ["qc-process-warning-guard.mjs", "qc-node-listener-budget.cjs"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(target, "scripts", file));
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(target, "node_modules"), "junction");
  return target;
}

function monitor(page) {
  page.on("console", (message) => {
    if (message.type() === "error") failures.push({ kind: "console", message: message.text() });
  });
  page.on("pageerror", (error) => failures.push({ kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText;
    if (errorText && errorText !== "net::ERR_ABORTED") failures.push({ kind: "requestfailed", url: request.url(), message: errorText });
  });
}

async function login(context) {
  const page = await context.newPage(); monitor(page);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  check("fresh browser authenticated via rendered UI", !page.url().endsWith("/login"), page.url());
  await page.close();
}

async function stopTaskOwnedApp() {
  const child = app?.child;
  if (!child) return;
  if (process.platform === "win32" && child.pid) {
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  }
  try { await stopNextApp(child); } catch {}
  app = null;
}

async function startTaskOwnedAppWithRetry() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    app = startNextApp(runtimeProjectRoot, "dev", port);
    try {
      await waitForNextAppReady(baseUrl, app.getOutput, 15_000);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const startupOutput = app.getOutput();
      if (/next-env\.d\.ts/iu.test(startupOutput) && /UNKNOWN|EBUSY|EPERM|EACCES/iu.test(startupOutput)) throw new Error("transient next-env.d.ts lock after ready");
      return;
    } catch (error) {
      const output = app?.getOutput?.() ?? "";
      await stopTaskOwnedApp();
      if (attempt === 3) throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
}

try {
  primaryBefore = readInvariantSnapshot();
  check("primary source invariant safe before fixture", invariantSafe(primaryBefore), JSON.stringify(primaryBefore));
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  const sourceSnapshot = new Database(sourceDb, { readonly: true, fileMustExist: true });
  try { await sourceSnapshot.backup(fixtureDb); } finally { sourceSnapshot.close(); }
  const fixtureSourceSnapshot = readInvariantSnapshot(fixtureDb);
  check("unmodified fixture snapshot matches primary invariant", invariantSafe(fixtureSourceSnapshot) && JSON.stringify(fixtureSourceSnapshot) === JSON.stringify(primaryBefore), JSON.stringify({ primaryBefore, fixtureSourceSnapshot }));
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });

  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1").run();
  const work = fixture.prepare(`
    SELECT work.id, work.drawing_id, state.revision_id, drawing.drawing_number
    FROM drawing_revision_works work
    JOIN drawings drawing ON drawing.id = work.drawing_id
    JOIN canonical_workbench_states state ON state.work_id = work.id AND state.entity_type = 'drawing'
    WHERE (SELECT COUNT(*) FROM drawing_revision_work_files workFile WHERE workFile.work_id = work.id) = 3
    ORDER BY drawing.drawing_number, work.created_at DESC, work.id
    LIMIT 1
  `).get();
  check("browser fixture canonical three-file work exists", Boolean(work?.id && work?.revision_id && work?.drawing_number), JSON.stringify(work));
  targetCode = work.drawing_number;
  // The disposable browser case exercises the owner-side recognition command,
  // so make that handling explicit in the fixture only.
  fixture.prepare("UPDATE canonical_workbench_states SET handling='owner', row_version=row_version+1 WHERE work_id = ?").run(work.id);
  fixtureMutationLedger.push({ action: "set-owner-handling-for-recognition", workId: work.id, drawingNumber: targetCode, scope: "disposable fixture only" });
  const sourceCount = fixture.prepare("SELECT COUNT(*) AS count FROM drawing_revision_work_files WHERE work_id = ?").get(work.id).count;
  check("browser fixture has exact three work-file snapshots", sourceCount === 3, String(sourceCount));
  const expectedBrowserFiles = fixture.prepare(`
    SELECT workFile.file_binding_id, file.source_file_asset_id AS file_asset_id, file.display_name, file.role
    FROM drawing_revision_work_files workFile
    JOIN drawing_revision_files file ON file.id = workFile.file_binding_id
    WHERE workFile.work_id = ?
    ORDER BY workFile.ordinal, workFile.file_binding_id
  `).all(work.id);
  const expectedBrowserAssets = expectedBrowserFiles.map((row) => row.file_asset_id).sort();
  const pdfFile = expectedBrowserFiles.find((row) => row.role === "pdf") ?? expectedBrowserFiles[0];

  // Keep historical evidence immutable but move it to a non-current context so
  // the fresh browser must exercise the current drawing_revision POST path.
  fixture.prepare("UPDATE drawing_recognition_sessions SET source_context_type='candidate_revision', source_context_id='historical-candidate-' || id, source_lineage_key='candidate_revision:historical-' || id, deduplication_key='historical-dedup-' || id WHERE drawing_revision_id = ?").run(work.revision_id);
  fixtureMutationLedger.push({ action: "retire-reusable-current-context-sessions", revisionId: work.revision_id, scope: "disposable fixture only" });
  check("browser fixture has no reusable current-context session", fixture.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_sessions WHERE drawing_revision_id = ? AND source_context_type = 'drawing_revision'").get(work.revision_id).count === 0);
  fixture.close();

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  runtimeProjectRoot = path.join(root, ".tmp", `qc-dev092-browser-runtime-project-${port}`);
  prepareTaskOwnedRuntimeProject(runtimeProjectRoot);
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: ".next", PDM_PUBLIC_BASE_URL: baseUrl,
    QC_NEXT_USE_WEBPACK: "1",
    PDM_DRAWING_RECOGNITION_V1: "true", PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true", PDM_NUMBER_LIFECYCLE_V2: "true"
  });
  console.log(`QC DEV-092 browser runtime: project=${root}; runtimeProject=${runtimeProjectRoot}; purpose=${targetCode} exact work-file and recognition request; port=${port}; processTree=task-owned Next dev + Playwright; cleanup=after evidence write; PDM_DATA_DIR=${fixtureDataDir}; PDM_REPOSITORY_DIR=${fixtureRepository}; mutationScope=isolated fixture/runtime project only; primaryData=read-only invariant gate`);
  await startTaskOwnedAppWithRetry();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context);
  const page = await context.newPage(); monitor(page);
  let recognitionPostBody = null;
  let latestResponseStatus = null;
  let resolveCreateResponse;
  const createResponsePromise = new Promise((resolve) => { resolveCreateResponse = resolve; });
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/numbering/recognition-sessions")) recognitionPostBody = request.postDataJSON();
  });
  page.on("response", (response) => {
    if (response.url().includes(`/api/numbering/drawings/${targetCode}/recognition-session`)) latestResponseStatus = response.status();
    if (response.request().method() === "POST" && response.url().endsWith("/api/numbering/recognition-sessions")) {
      resolveCreateResponse({ status: response.status(), body: response.json() });
    }
  });
  const workUrl = `/numbering/drawings/${encodeURIComponent(work.drawing_id)}/workspace?workId=${encodeURIComponent(work.id)}`;
  await page.goto(`${baseUrl}${workUrl}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: targetCode, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-file-list li").nth(2).waitFor({ state: "visible", timeout: 30_000 });
  check("browser UI lists three controlled files", await page.locator(".canonical-file-list li").count() === 3, String(await page.locator(".canonical-file-list li").count()));
  check("browser UI lists exact canonical files", JSON.stringify((await page.locator(".canonical-file-list li strong").allTextContents()).sort()) === JSON.stringify(expectedBrowserFiles.map((row) => row.display_name).sort()));
  const api = await playwrightRequest.newContext({ baseURL: baseUrl, storageState: await context.storageState() });
  const previewResponse = await api.get(`/api/pdm/file-assets/${encodeURIComponent(pdfFile.file_asset_id)}?context=drawing_revision_work&contextId=${encodeURIComponent(work.id)}&bindingId=${encodeURIComponent(pdfFile.file_binding_id)}&preview=1`);
  check("canonical PDF preview returns 200", previewResponse.status() === 200, String(previewResponse.status()));
  check("canonical PDF preview content type is PDF", (previewResponse.headers()["content-type"] ?? "").includes("application/pdf"), previewResponse.headers()["content-type"] ?? "");
  await api.dispose();

  // The current workspace auto-opens the recognition panel for an owner work;
  // the rendered page load is the user-visible trigger in this fixture.
  await new Promise((resolve) => setTimeout(resolve, 250));
  check("recognition latest-session request emitted", latestResponseStatus === 200, String(latestResponseStatus));
  const createResponse = await Promise.race([
    createResponsePromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("recognition create response timeout")), 30_000))
  ]);
  check("recognition create request emitted", [200, 201].includes(createResponse.status), String(createResponse.status));
  const createdBody = await createResponse.body;
  check("recognition request uses drawing_revision context", createdBody?.session?.sourceContextType === "drawing_revision" && createdBody?.session?.sourceContextId === work.revision_id, JSON.stringify({ sourceContextType: createdBody?.session?.sourceContextType, sourceContextId: createdBody?.session?.sourceContextId }));
  check("recognition request carries exact three assets", JSON.stringify([...(recognitionPostBody?.sourceAssetIds ?? [])].sort()) === JSON.stringify(expectedBrowserAssets), JSON.stringify({ actual: recognitionPostBody?.sourceAssetIds, expected: expectedBrowserAssets }));
  await page.getByText("智慧辨識處理中", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
  check("recognition panel does not show false empty-source state", await page.getByText("尚無可辨識的檔案", { exact: true }).count() === 0);

  const after = new Database(fixtureDb, { readonly: true });
  const session = after.prepare("SELECT id, source_context_type, source_context_id FROM drawing_recognition_sessions WHERE drawing_revision_id = ? ORDER BY created_at DESC LIMIT 1").get(work.revision_id);
  const sessionSources = after.prepare("SELECT file_asset_id FROM drawing_recognition_sources WHERE session_id = ? ORDER BY sort_order, id").all(session.id).map((row) => row.file_asset_id).sort();
  const expectedAssets = after.prepare(`
    SELECT file.source_file_asset_id AS file_asset_id
    FROM drawing_revision_work_files workFile
    JOIN drawing_revision_files file ON file.id = workFile.file_binding_id
    WHERE workFile.work_id = ?
    ORDER BY workFile.ordinal, workFile.file_binding_id
  `).all(work.id).map((row) => row.file_asset_id).sort();
  check("recognition DB session has exact current context", session.source_context_type === "drawing_revision" && session.source_context_id === work.revision_id, JSON.stringify(session));
  check("recognition DB session has exact three source assets", JSON.stringify(sessionSources) === JSON.stringify(expectedAssets), JSON.stringify({ sessionSources, expectedAssets }));
  after.close();
  await context.close();
} catch (error) {
  checks.push({ name: "browser execution", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  await stopTaskOwnedApp();
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: released, detail: `port=${port}` });
  }
  const runtimeCleanup = runtimeProjectRoot
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeProjectRoot)
    : { removed: false, path: null, error: "runtime-not-started" };
  checks.push({ name: "temporary runtime project removed", pass: runtimeCleanup.removed, detail: JSON.stringify(runtimeCleanup) });
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    tempCleanupReceipt = { removed: !fs.existsSync(tempRoot), path: tempRoot, error: null };
  } catch (error) {
    tempCleanupReceipt = { removed: false, path: tempRoot, error: error instanceof Error ? error.message : String(error) };
  }
  checks.push({ name: "temporary data and repository removed", pass: tempCleanupReceipt.removed, detail: JSON.stringify(tempCleanupReceipt) });
  try {
    primaryAfter = readInvariantSnapshot();
    checks.push({ name: "primary source invariant unchanged after runtime", pass: invariantSafe(primaryAfter) && JSON.stringify(primaryAfter) === JSON.stringify(primaryBefore), detail: JSON.stringify({ before: primaryBefore, after: primaryAfter }) });
  } catch (error) {
    checks.push({ name: "primary source invariant unchanged after runtime", pass: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

const failed = checks.filter((item) => !item.pass);
const manifest = { devId: "DEV-092", runId, status: failed.length || failures.length ? "FAIL" : "PASS", port, targetCode, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, failures, fixtureMutationLedger, primaryInvariant: { before: primaryBefore, after: primaryAfter, unchanged: JSON.stringify(primaryBefore) === JSON.stringify(primaryAfter) }, cleanupReceipt: { temp: tempCleanupReceipt, runtimeProjectRemoved: checks.find((item) => item.name === "temporary runtime project removed")?.pass === true, portReleased: checks.find((item) => item.name === "temporary runtime port released")?.pass === true } };
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
