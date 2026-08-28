#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV094-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-094-browser", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev094-browser-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const nextEnvPath = path.join(root, "next-env.d.ts");
const nextEnvOriginal = fs.existsSync(nextEnvPath) ? fs.readFileSync(nextEnvPath, "utf8") : null;
const checks = [];
const failures = [];
const consoleErrors = [];
let app = null;
let browser = null;
let port = null;
let cleanupStatus = "pending";
let runtimeDistDir = null;

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `:${detail}` : ""}`);
}

function monitor(page) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => failures.push({ kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => { if (response.status() >= 400) failures.push({ kind: "http", status: response.status(), url: response.url() }); });
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

async function openDrawingList(context, baseUrl, code) {
  const page = await context.newPage();
  monitor(page);
  await page.goto(`${baseUrl}/numbering/drawings?query=${encodeURIComponent(code)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
  return page;
}

async function verifyHealthyRows(context, baseUrl, code, expectedRows) {
  const page = await openDrawingList(context, baseUrl, code);
  const rows = page.locator("[data-canonical-workbench-row='true']");
  check(`${code} expected row count`, await rows.count() === expectedRows, String(await rows.count()));
  for (let index = 0; index < expectedRows; index += 1) {
    const row = rows.nth(index);
    const layer = (await row.locator(".canonical-layer").innerText()).trim();
    await row.locator(".canonical-row-open").click();
    const drawer = page.locator(".pdm-entity-detail-drawer");
    await drawer.waitFor({ state: "visible", timeout: 30_000 });
    await drawer.locator(".canonical-drawer-body").waitFor({ state: "visible", timeout: 30_000 });
    check(`${code}/${layer} basic detail remains readable`, await drawer.getByRole("heading", { name: "目前資料", exact: true }).count() === 1);
    check(`${code}/${layer} relation matrix healthy`, await drawer.locator('[data-anomaly-code="WORKBENCH_RELATION_SCOPE_INVALID"]').count() === 0);
    check(`${code}/${layer} no fatal detail error`, await drawer.locator(".canonical-error[role='alert']").count() === 0);
    await drawer.getByRole("button", { name: "關閉明細" }).click();
    await drawer.waitFor({ state: "hidden", timeout: 30_000 });
  }
  await page.screenshot({ path: path.join(screenshotDir, `${code}-healthy.png`), fullPage: true });
  await page.close();
}

function expectedDrawingRows(databasePath, code) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return Number(database.prepare(`SELECT COUNT(*) AS count
      FROM canonical_workbench_states state
      JOIN drawings drawing ON drawing.id = state.canonical_entity_id
      WHERE state.entity_type = 'drawing' AND drawing.drawing_number = ?`).get(code).count);
  } finally {
    database.close();
  }
}

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });
try {
  const source = new Database(path.join(root, "data", "ai-pdm.sqlite"), { readonly: true, fileMustExist: true });
  const expectedSourceCounts = {
    roots: source.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count,
    parts: source.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count
  };
  await source.backup(databasePath);
  source.close();
  const sourceRepository = path.join(root, "data", "repository");
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, repositoryDir, { recursive: true, force: true });

  const baseline = new Database(databasePath, { readonly: true, fileMustExist: true });
  check("browser fixture preserves source root and part counts", baseline.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count === Number(expectedSourceCounts.roots) && baseline.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count === Number(expectedSourceCounts.parts), JSON.stringify({ expectedSourceCounts }));
  check("browser fixture starts FK-clean", baseline.pragma("foreign_key_check").length === 0);
  baseline.close();

  port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  runtimeDistDir = path.join(root, ".tmp", `qc-dev094-browser-${port}`);
  fs.mkdirSync(path.join(runtimeDistDir, "dev", "types"), { recursive: true });
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: path.relative(root, runtimeDistDir), PDM_PUBLIC_BASE_URL: baseUrl
  });
  fs.writeFileSync(nextEnvPath, "/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n\n// DEV-094 disposable browser runtime\n", "utf8");
  console.log(`QC DEV-094 runtime: project=${root}; purpose=repaired-root and orphan-detail browser QC; port=${port}; owner=current QC process tree; dataDir=${dataDir}; repositoryDir=${repositoryDir}; cleanup=after assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context, baseUrl);

  await verifyHealthyRows(context, baseUrl, "A0002-M01", expectedDrawingRows(databasePath, "A0002-M01"));
  await verifyHealthyRows(context, baseUrl, "A0003-M01", expectedDrawingRows(databasePath, "A0003-M01"));
  await verifyHealthyRows(context, baseUrl, "A0005-M01", expectedDrawingRows(databasePath, "A0005-M01"));
  await verifyHealthyRows(context, baseUrl, "A0006-M01", expectedDrawingRows(databasePath, "A0006-M01"));

  const corrupt = new Database(databasePath);
  corrupt.pragma("foreign_keys = OFF");
  const deleted = corrupt.prepare("DELETE FROM part_roots WHERE root_code='A0002'").run();
  corrupt.close();
  check("negative fixture removes exactly one root after runtime initialization", deleted.changes === 1, String(deleted.changes));

  const orphanPage = await openDrawingList(context, baseUrl, "A0002-M01");
  await orphanPage.locator("[data-canonical-workbench-row='true'] .canonical-row-open").first().click();
  const orphanDrawer = orphanPage.locator(".pdm-entity-detail-drawer");
  await orphanDrawer.locator(".canonical-drawer-body").waitFor({ state: "visible", timeout: 30_000 });
  check("orphan detail keeps basic fields visible", await orphanDrawer.getByRole("heading", { name: "目前資料", exact: true }).count() === 1);
  const anomaly = orphanDrawer.locator('[data-anomaly-code="WORKBENCH_RELATION_SCOPE_INVALID"]');
  check("orphan detail shows stable local anomaly", await anomaly.count() === 1 && (await anomaly.innerText()).includes("圖料關聯資料不完整"));
  check("orphan detail does not mislabel corruption as normal unscoped empty", !(await orphanDrawer.innerText()).includes("目前尚未建立圖料根號"));
  check("orphan detail disables root-dependent matrix actions", await orphanDrawer.locator(".canonical-drawer-matrix button").count() === 0);
  const rowKey = new URL(orphanPage.url()).searchParams.get("detail");
  const api = await orphanPage.evaluate(async (key) => {
    const response = await fetch(`/api/numbering/drawings/workbench/${encodeURIComponent(key ?? "")}`, { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  }, rowKey);
  check("orphan detail API remains 200 with stable anomaly", api.status === 200 && api.body?.data?.presentation?.relationMatrix?.issue?.code === "WORKBENCH_RELATION_SCOPE_INVALID", JSON.stringify(api));
  await orphanPage.screenshot({ path: path.join(screenshotDir, "A0002-orphan-local-degradation.png"), fullPage: true });
  await orphanPage.close();
  await context.close();
  check("browser console errors absent", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("browser page/network failures absent", failures.length === 0, JSON.stringify(failures));
} catch (error) {
  failures.push({ kind: "execution", message: error instanceof Error ? error.message : String(error), runtime: app?.getOutput?.() ?? "" });
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
  try { if (nextEnvOriginal === null) fs.rmSync(nextEnvPath, { force: true }); else fs.writeFileSync(nextEnvPath, nextEnvOriginal, "utf8"); } catch (error) { failures.push({ kind: "cleanup", message: error instanceof Error ? error.message : String(error) }); }
  const resolvedTempRoot = path.resolve(tempRoot);
  const resolvedSystemTemp = path.resolve(os.tmpdir());
  if (resolvedTempRoot.startsWith(`${resolvedSystemTemp}${path.sep}`)) {
    fs.rmSync(resolvedTempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    cleanupStatus = fs.existsSync(resolvedTempRoot) || !runtimeCleanup.removed ? "failed" : "removed";
  } else {
    cleanupStatus = "unsafe-path";
  }
}

const failedChecks = checks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-094", capaId: "CAPA-PDM-2026-08-24-001", runId, generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 && failures.length === 0 && cleanupStatus === "removed" ? "PASS" : "FAIL",
  port, total: checks.length, passed: checks.length - failedChecks.length, failed: failedChecks.length,
  checks, consoleErrors, failures, cleanupStatus, productionConnected: false, productionMutation: false
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
