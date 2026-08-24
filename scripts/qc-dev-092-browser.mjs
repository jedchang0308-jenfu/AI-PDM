#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
const sourceRepository = path.join(root, "data", "repository");
const fixtureRepository = path.join(fixtureDataDir, "repository");
const checks = [];
const failures = [];
let app = null;
let browser = null;
let port = null;
let baseUrl = "";
let runtimeDistDir = null;

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
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

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });

  const migration = spawnSync(process.execPath, [
    path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"),
    `--db=${fixtureDb}`, "--apply", "--repair-work-files", "--confirm-disposable-dev-087",
    `--output-dir=${path.join(tempRoot, "migration")}`
  ], { cwd: root, encoding: "utf8" });
  check("browser fixture migration completed", migration.status === 0, `${migration.stdout}\n${migration.stderr}`);

  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1").run();
  const work = fixture.prepare(`
    SELECT work.id, state.revision_id, drawing.drawing_number
    FROM drawing_revision_works work
    JOIN drawings drawing ON drawing.id = work.drawing_id
    JOIN canonical_workbench_states state ON state.work_id = work.id AND state.entity_type = 'drawing'
    WHERE drawing.drawing_number = 'A0006-M01'
    ORDER BY work.created_at DESC
    LIMIT 1
  `).get();
  check("A0006 browser fixture work exists", Boolean(work?.id && work?.revision_id), JSON.stringify(work));
  const sourceCount = fixture.prepare("SELECT COUNT(*) AS count FROM drawing_revision_work_files WHERE work_id = ?").get(work.id).count;
  check("A0006 browser fixture has exact three work-file snapshots", sourceCount === 3, String(sourceCount));
  const expectedBrowserAssets = fixture.prepare(`
    SELECT file.source_file_asset_id AS file_asset_id
    FROM drawing_revision_work_files workFile
    JOIN drawing_revision_files file ON file.id = workFile.file_binding_id
    WHERE workFile.work_id = ?
    ORDER BY workFile.ordinal, workFile.file_binding_id
  `).all(work.id).map((row) => row.file_asset_id).sort();

  // Keep historical evidence immutable but move it to a non-current context so
  // the fresh browser must exercise the current drawing_revision POST path.
  fixture.prepare("UPDATE drawing_recognition_sessions SET source_context_type='candidate_revision', source_context_id='historical-candidate-' || id, source_lineage_key='candidate_revision:historical-' || id, deduplication_key='historical-dedup-' || id WHERE drawing_revision_id = ?").run(work.revision_id);
  check("A0006 browser fixture has no reusable current-context session", fixture.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_sessions WHERE drawing_revision_id = ? AND source_context_type = 'drawing_revision'").get(work.revision_id).count === 0);
  fixture.close();

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  runtimeDistDir = path.join(root, ".tmp", `qc-dev092-browser-${port}`);
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: path.relative(root, runtimeDistDir), PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_DRAWING_RECOGNITION_V1: "true", PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true", PDM_NUMBER_LIFECYCLE_V2: "true"
  });
  console.log(`QC DEV-092 browser runtime: project=${root}; purpose=A0006 exact work-file and recognition request; port=${port}; owner=current QC process tree; cleanup=after assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context);
  const page = await context.newPage(); monitor(page);
  const workUrl = `/numbering/drawings/drawing-draft-drawing-58f3b735-a3fe-4c3b-87be-f2e23a15bebe/workspace?workId=${encodeURIComponent(work.id)}`;
  await page.goto(`${baseUrl}${workUrl}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "A0006-M01", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-file-list li").nth(2).waitFor({ state: "visible", timeout: 30_000 });
  check("A0006 browser UI lists three controlled files", await page.locator(".canonical-file-list li").count() === 3, String(await page.locator(".canonical-file-list li").count()));
  check("A0006 browser UI lists PDF/SLDDRW/SLDPRT", JSON.stringify((await page.locator(".canonical-file-list li strong").allTextContents()).sort()) === JSON.stringify(["A0006-M01.SLDDRW", "A0006-M01.pdf", "A0006.SLDPRT"]));
  const api = await playwrightRequest.newContext({ baseURL: baseUrl, storageState: await context.storageState() });
  const previewResponse = await api.get(`/api/pdm/file-assets/FA-db4f78fb-3c81-4ce8-9b5d-3c5a0968b8fc?context=drawing_revision_work&contextId=${work.id}&bindingId=drawing-revision-file-NCRF-31d1d535-91a7-49ff-ac80-f19f5790fc23&preview=1`);
  check("A0006 PDF preview returns 200", previewResponse.status() === 200, String(previewResponse.status()));
  check("A0006 PDF preview content type is PDF", (previewResponse.headers()["content-type"] ?? "").includes("application/pdf"), previewResponse.headers()["content-type"] ?? "");
  await api.dispose();

  let recognitionPostBody = null;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/numbering/recognition-sessions")) recognitionPostBody = request.postDataJSON();
  });
  const latestResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/drawings/A0006-M01/recognition-session"), { timeout: 30_000 });
  await page.getByRole("tab", { name: "智慧辨識", exact: true }).click();
  const latestResponse = await latestResponsePromise;
  check("A0006 recognition latest-session request emitted", latestResponse.status() === 200, String(latestResponse.status()));
  const createResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/numbering/recognition-sessions"), { timeout: 30_000 });
  const createResponse = await createResponsePromise;
  check("A0006 recognition create request emitted", [200, 201].includes(createResponse.status()), String(createResponse.status()));
  const createdBody = await createResponse.json();
  check("A0006 recognition request uses drawing_revision context", createdBody?.session?.sourceContextType === "drawing_revision" && createdBody?.session?.sourceContextId === work.revision_id, JSON.stringify({ sourceContextType: createdBody?.session?.sourceContextType, sourceContextId: createdBody?.session?.sourceContextId }));
  check("A0006 recognition request carries exact three assets", JSON.stringify([...(recognitionPostBody?.sourceAssetIds ?? [])].sort()) === JSON.stringify(expectedBrowserAssets), JSON.stringify({ actual: recognitionPostBody?.sourceAssetIds, expected: expectedBrowserAssets }));
  await page.getByText("智慧辨識處理中", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
  check("A0006 recognition panel does not show false empty-source state", await page.getByText("尚無可辨識的檔案", { exact: true }).count() === 0);

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
  check("A0006 recognition DB session has exact current context", session.source_context_type === "drawing_revision" && session.source_context_id === work.revision_id, JSON.stringify(session));
  check("A0006 recognition DB session has exact three source assets", JSON.stringify(sessionSources) === JSON.stringify(expectedAssets), JSON.stringify({ sessionSources, expectedAssets }));
  after.close();
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
    : { removed: false, path: null, error: "runtime-not-started" };
  checks.push({ name: "temporary runtime dist removed", pass: runtimeCleanup.removed, detail: JSON.stringify(runtimeCleanup) });
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((item) => !item.pass);
const manifest = { devId: "DEV-092", runId, status: failed.length ? "FAIL" : "PASS", port, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, failures };
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
