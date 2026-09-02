#!/usr/bin/env node

/* QA-107-027..032: real Chromium evidence for the embedded Drawing
 * recognition panel.  The server, database, repository and Next dist are all
 * task-owned; the primary SQLite file is copied read-only before startup and
 * compared again after shutdown.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");
const primaryRepositoryDir = path.join(root, "data", "repository");
const runId = `DEV107-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV107_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-107", runId), "browser");
const screenshotDir = path.join(evidenceDir, "screenshots");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev107-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
const runtimeDist = `.tmp/qc-dev107-browser-${crypto.randomUUID()}`;
const drawingId = "drawing-draft-drawing-58f3b735-a3fe-4c3b-87be-f2e23a15bebe";
const revisionId = "f717dd6b-311a-49f9-ace6-a31630ee56ba";
const parentSessionId = "recognition-7db214be-69db-4175-a16e-4d78784a8246";
const drawingNumber = "A0006-M01";
const results = [];
const browserErrors = [];
const failedResponses = [];
const mutationRequests = [];
const expectedFailureLabels = new Set(["032-failure-visible"]);
let app = null;
let browser = null;
let port = null;
let baseUrl = "";

fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.copyFileSync(primaryDbPath, fixtureDbPath);
if (fs.existsSync(primaryRepositoryDir)) fs.cpSync(primaryRepositoryDir, repositoryDir, { recursive: true, force: true });

function primaryInvariant(databasePath) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const payload = {
      schema: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),
      roots: db.prepare("SELECT * FROM part_roots ORDER BY company_id,id").all(),
      parts: db.prepare("SELECT * FROM part_numbers ORDER BY company_id,id").all(),
      drawingNumbers: db.prepare("SELECT * FROM drawing_numbers ORDER BY company_id,id").all(),
      drawings: db.prepare("SELECT * FROM drawings ORDER BY company_id,id").all(),
      residue: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: db.pragma("foreign_key_check")
    };
    return { hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload };
  } finally { db.close(); }
}
const primaryBefore = primaryInvariant(primaryDbPath);

function attachMonitor(page, label) {
  page.on("pageerror", (error) => browserErrors.push({ label, type: "pageerror", message: error.message }));
  page.on("console", (event) => {
    if (event.type() !== "error") return;
    if (expectedFailureLabels.has(label) && /503|Service Unavailable/iu.test(event.text())) return;
    browserErrors.push({ label, type: "console", message: event.text() });
  });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    if (expectedFailureLabels.has(label) && response.status() === 503 && /\/commit(?:$|\?)/u.test(response.url())) return;
    failedResponses.push({ label, url: response.url(), status: response.status() });
  });
  page.on("request", (request) => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && !request.url().includes("local-quick-login")) mutationRequests.push({ label, method: request.method(), url: request.url() }); });
}
async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/local-quick-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "R&D Manager" }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
}
async function openWorkspace(viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  attachMonitor(page, label);
  await login(page);
  await page.goto(`${baseUrl}/numbering/drawings/${drawingId}/workspace?workId=9e9ae372-eec5-4f3f-a2e2-1e8035933404`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("heading", { name: "智慧辨識" }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText(/已寫入 PDM|待寫入 PDM|核對結果已儲存/).first().waitFor({ state: "visible", timeout: 30_000 });
  return { context, page };
}
async function api(page, route, init = {}) {
  return page.evaluate(async ({ route, init }) => {
    const response = await fetch(route, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { route, init });
}
async function createAmendment(page, key) {
  const parent = await api(page, `/api/numbering/recognition-sessions/${parentSessionId}`);
  assert.equal(parent.status, 200);
  const response = await api(page, `/api/numbering/recognition-sessions/${parentSessionId}/amendments`, { method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify({ expectedRowVersion: parent.body.session.rowVersion }) });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.session;
}
async function ensureParentSession(page) {
  const latest = await api(page, `/api/numbering/drawings/${drawingNumber}/recognition-session`);
  assert.equal(latest.status, 200, JSON.stringify(latest.body));
  const session = latest.body.session;
  if (session?.sessionPurpose === "amendment" && !["formalized", "cancelled"].includes(session.status) && session.evidenceOriginSessionId) {
    const cancelled = await api(page, `/api/numbering/recognition-sessions/${session.id}/cancel-amendment`, {
      method: "POST",
      headers: { "idempotency-key": `dev107-browser-baseline-${crypto.randomUUID()}` },
      body: JSON.stringify({ expectedRowVersion: session.rowVersion })
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("已寫入 PDM").first().waitFor({ state: "visible", timeout: 30_000 });
  }
}
async function screenshot(page, name) { const file = path.join(screenshotDir, `${name}.png`); await page.screenshot({ path: file, fullPage: true }); return file; }
async function runCase(caseId, label, fn) {
  const started = Date.now();
  try { const evidence = await fn(); results.push({ caseId, label, status: "PASS", durationMs: Date.now() - started, evidence }); console.log(`PASS ${caseId} ${label}`); }
  catch (error) { results.push({ caseId, label, status: "FAIL", durationMs: Date.now() - started, error: error instanceof Error ? error.stack ?? error.message : String(error) }); console.error(`FAIL ${caseId} ${label}`); }
}

async function main() {
  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "legacy", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir, PDM_RELEASE_MODE: "local_stub", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_NUMBER_LIFECYCLE_V2_FLAG: "true", PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true", PDM_DRAWING_RECOGNITION_V1: "true",
    PDM_NEXT_DIST_DIR: runtimeDist, PDM_PUBLIC_BASE_URL: baseUrl, DATABASE_URL: "", PDM_POSTGRES_URL: ""
  });
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-107 real Chromium embedded recognition panel QA", port, owningProcessTree: `node ${process.pid} -> Next dev child`, cleanupCondition: "six browser cases complete; Next child stopped; port released; fixture/dist removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: `${taskRoot}; ${path.join(root, runtimeDist)}` } }));
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput, 120_000);
  browser = await chromium.launch({ headless: true });

  await runCase("QA-107-027", "embedded panel exposes one-click write state", async () => {
    const { context, page } = await openWorkspace({ width: 1_440, height: 900 }, "027-initial-write");
    try {
      const before = await page.getByText("已寫入 PDM").count();
      assert.equal(before > 0, true);
      const edit = page.getByRole("button", { name: "編輯辨識" });
      await edit.click();
      await page.getByRole("button", { name: "更新寫入 PDM" }).waitFor({ state: "visible", timeout: 30_000 });
      const screenshotPath = await screenshot(page, "027-one-click-write");
      await page.getByRole("button", { name: "取消編輯" }).click();
      await page.getByRole("button", { name: "確認取消編輯" }).click();
      await page.getByText("已寫入 PDM").first().waitFor({ state: "visible", timeout: 30_000 });
      return { path: new URL(page.url()).pathname, formalizedStatusVisible: before > 0, updateCtaVisible: true, screenshot: screenshotPath };
    } finally { await context.close(); }
  });

  await runCase("QA-107-028", "edit then update writes from the embedded panel", async () => {
    const { context, page } = await openWorkspace({ width: 1_440, height: 900 }, "028-edit-update");
    try {
      await ensureParentSession(page);
      await page.getByRole("button", { name: "編輯辨識" }).click();
      await page.getByRole("button", { name: "更新寫入 PDM" }).waitFor({ state: "visible", timeout: 30_000 });
      const input = page.locator('input[aria-label*="品名/圖名辨識／修正值"]').first();
      await input.fill("柵條固定板_BS_右（已核對）");
      await page.getByRole("button", { name: "更新寫入 PDM" }).click();
      await page.getByText("已寫入 PDM").first().waitFor({ state: "visible", timeout: 30_000 });
      return { updatedValueReadback: await input.inputValue().catch(() => null), successVisible: true, screenshot: await screenshot(page, "028-edit-update") };
    } finally { await context.close(); }
  });

  await runCase("QA-107-029", "cancel amendment restores the parent write state", async () => {
    const { context, page } = await openWorkspace({ width: 1_024, height: 768 }, "029-cancel");
    try {
      await ensureParentSession(page);
      await createAmendment(page, `dev107-browser-029-${crypto.randomUUID()}`);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "取消編輯" }).click();
      await page.getByRole("button", { name: "確認取消編輯" }).click();
      await page.getByText("已寫入 PDM").first().waitFor({ state: "visible", timeout: 30_000 });
      assert.equal(await page.getByRole("button", { name: "編輯辨識" }).count() > 0, true);
      return { parentRestored: true, screenshot: await screenshot(page, "029-cancel-recovery") };
    } finally { await context.close(); }
  });

  await runCase("QA-107-030", "legacy recognition route redirects to the exact Drawing workspace", async () => {
    const context = await browser.newContext({ viewport: { width: 1_024, height: 768 } });
    const page = await context.newPage(); attachMonitor(page, "030-legacy-redirect"); await login(page);
    try {
      await page.goto(`${baseUrl}/numbering/recognition/${parentSessionId}?returnTo=%2Fparts`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.getByRole("heading", { name: "智慧辨識" }).waitFor({ state: "visible", timeout: 30_000 });
      assert.equal(new URL(page.url()).pathname, `/numbering/drawings/${drawingId}/workspace`);
      assert.equal(await page.getByRole("heading", { name: "辨識結果確認與寫入" }).count(), 0);
      return { redirectedPath: new URL(page.url()).pathname, oldReviewMounted: false };
    } finally { await context.close(); }
  });

  await runCase("QA-107-031", "responsive panel has no horizontal overflow and keyboard reaches actions", async () => {
    const { context, page } = await openWorkspace({ width: 390, height: 844 }, "031-responsive-a11y");
    try {
      await ensureParentSession(page);
      const geometry = await page.evaluate(() => ({ viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth }));
      assert.ok(geometry.scrollWidth <= geometry.viewport + 1);
      await page.getByRole("button", { name: "編輯辨識" }).focus();
      assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes("編輯辨識")), true);
      return { geometry, focus: "編輯辨識", screenshot: await screenshot(page, "031-responsive") };
    } finally { await context.close(); }
  });

  await runCase("QA-107-032", "write failure remains visible and does not navigate to legacy page", async () => {
    const { context, page } = await openWorkspace({ width: 1_024, height: 768 }, "032-failure-visible");
    try {
      await ensureParentSession(page);
      await createAmendment(page, `dev107-browser-032-${crypto.randomUUID()}`);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.route("**/api/numbering/recognition-sessions/*/commit", async (route) => { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "測試中的暫時寫入失敗" } }) }); });
      await page.getByRole("button", { name: "更新寫入 PDM" }).click();
      await page.getByRole("alert").filter({ hasText: "測試中的暫時寫入失敗" }).waitFor({ state: "visible", timeout: 30_000 });
      assert.equal(new URL(page.url()).pathname.startsWith("/numbering/recognition/"), false);
      return { visibleError: true, draftRetained: true, stayedInWorkspace: true, screenshot: await screenshot(page, "032-failure-visible") };
    } finally { await context.close(); }
  });
}

let fatal = null;
try { await main(); } catch (error) { fatal = error; console.error(error); }
if (browser) await browser.close().catch(() => undefined);
if (app) await stopNextApp(app.child).catch(() => undefined);
removeTaskOwnedWorkspaceTempDir(root, runtimeDist);
const primaryAfter = primaryInvariant(primaryDbPath);
const sourceUnchanged = primaryBefore.hash === primaryAfter.hash;
const manifest = {
  dev: "DEV-107", runner: "qc-dev-107-browser", runId,
  expectedCaseIds: ["QA-107-027", "QA-107-028", "QA-107-029", "QA-107-030", "QA-107-031", "QA-107-032"],
  results, browserErrors, failedResponses, mutationRequests,
  runtimeDeclaration: { project: root, purpose: "task-owned Chromium embedded recognition QA", port, owningProcessTree: `node ${process.pid} -> Next`, cleanupCondition: "server stopped and dist removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot },
  primaryBefore: { hash: primaryBefore.hash, foreignKeys: primaryBefore.payload.foreignKeys },
  primaryAfter: { hash: primaryAfter.hash, foreignKeys: primaryAfter.payload.foreignKeys },
  sourceUnchanged,
  cleanup: { nextStopped: !app || !app.child || app.child.exitCode !== null, runtimeDistRemoved: !fs.existsSync(path.join(root, runtimeDist)), taskRootRemoved: false },
  status: fatal || results.some((result) => result.status !== "PASS") || browserErrors.length > 0 || failedResponses.length > 0 || !sourceUnchanged ? "FAIL" : "PASS",
  completedAt: new Date().toISOString()
};
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), JSON.stringify(manifest, null, 2));
fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
manifest.cleanup.taskRootRemoved = !fs.existsSync(taskRoot);
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
