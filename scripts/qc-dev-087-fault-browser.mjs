#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const profile = String(process.env.QC_DEV087_FAULT_PROFILE ?? "system_admin").trim().toLowerCase();
const expectedProfiles = new Set(["system_admin", "blocked"]);
if (!expectedProfiles.has(profile)) {
  console.error(`QC DEV-087 fault profile must be system_admin or blocked; received ${profile}`);
  process.exit(2);
}

const runId = `DEV087-fault-${profile}-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-087", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-fault-"));
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

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function monitor(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") failures.push({ label, kind: "console", message: message.text() });
  });
  page.on("pageerror", (error) => failures.push({ label, kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ label, kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push({ label, kind: "http", status: response.status(), url: response.url() });
  });
}

async function login(context, roleLabel) {
  const page = await context.newPage();
  monitor(page, `login-${roleLabel}`);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: `以${roleLabel}角色快速登入`, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  check(`${roleLabel} login via rendered UI`, !page.url().endsWith("/login"), page.url());
  await page.close();
}

async function openDrawing(context, label) {
  const page = await context.newPage();
  monitor(page, label);
  await page.goto(`${baseUrl}/numbering/drawings?query=A0002-M01`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-list-meta").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
  return page;
}

async function readWorkbench(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/numbering/drawings/workbench?query=A0002-M01", { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  });
}

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const migration = spawnSync(process.execPath, [
    path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"),
    `--db=${fixtureDb}`, "--apply", "--confirm-disposable-dev-087", "--discard-unapproved-part-only-drafts", `--output-dir=${path.join(tempRoot, "migration")}`
  ], { cwd: root, encoding: "utf8" });
  check("isolated migration applied or safely quarantined", migration.status === 0 || migration.status === 2, `${migration.stdout}\n${migration.stderr}`);
  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev087-v1', row_version=row_version+1").run();
  const baseline = fixture.prepare("SELECT revision_id AS production_revision_id FROM canonical_workbench_states WHERE canonical_entity_id = 'drawing-draft-drawing-cc7187b8-1ec4-4936-91da-4771f1b8a877' AND data_layer = 'drawing_production'").get();
  check("isolated fixture has A0002 production and RD rows", fixture.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states state JOIN drawings drawing ON drawing.id = state.canonical_entity_id WHERE drawing.drawing_number='A0002-M01' AND state.data_layer IN ('drawing_production', 'drawing_rd')").get().count >= 2);
  fixture.close();

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: `.tmp/qc-dev087-fault-${port}`, PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_DEV087_FAULT_PROFILE: profile
  });
  console.log(`QC DEV-087 fault runtime: profile=${profile}; project=${root}; purpose=rendered UI review fault path; port=${port}; cleanup=after browser assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });

  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(ownerContext, "系統管理員");
  const owner = await openDrawing(ownerContext, "owner drawing workbench");
  const productionRow = owner.locator(".canonical-table-wrap tbody tr").filter({ hasText: "量產版 1" }).first();
  check("production row visible for UI fault journey", await productionRow.count() === 1);
  await productionRow.locator(".drawing-workbench-row-action, .canonical-row-open").first().click().catch(async () => { await productionRow.click(); });
  await owner.getByRole("dialog", { name: /A0002-M01/u }).waitFor({ state: "visible", timeout: 30_000 });
  await owner.getByRole("button", { name: "進版", exact: true }).click();
  await owner.getByRole("dialog", { name: "選擇進版方式" }).waitFor({ state: "visible" });
  await owner.getByRole("button", { name: /^研發版 1\.2/u }).click();
  await owner.getByText("圖號編輯", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const submitButton = owner.locator(".dev079-workspace-footer").getByRole("button", { name: "送出審核" });
  check("owner editor is rendered before review", await submitButton.count() === 1 && await submitButton.isEnabled());
  await submitButton.focus();
  await submitButton.press("Enter");
  await owner.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await owner.close();

  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(reviewerContext, "研發主管");
  const reviewer = await openDrawing(reviewerContext, "reviewer drawing workbench");
  const listRead = await readWorkbench(reviewer);
  check("review request appears in read-only workbench readback", listRead.status === 200 && Array.isArray(listRead.body?.data?.groups), JSON.stringify(listRead.body));
  const rows = (listRead.body?.data?.groups ?? []).flatMap((group) => group.rows ?? []);
  const reviewRow = rows.find((row) => row.layerLabel === "研發版 1.2");
  check("review row has a UI review action", Boolean(reviewRow?.actions?.some((action) => action.key === "review" && typeof action.href === "string")), JSON.stringify(reviewRow));
  const reviewHref = reviewRow.actions.find((action) => action.key === "review")?.href;
  await reviewer.goto(`${baseUrl}${reviewHref}?returnTo=${encodeURIComponent("/numbering/drawings?query=A0002-M01")}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await reviewer.getByText("唯讀審核", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  check("reviewer sees the same drawing editor in read-only mode", await reviewer.getByRole("tab", { name: "版次與檔案" }).count() === 1 && await reviewer.locator("input[disabled]").count() >= 1);
  const approveButton = reviewer.locator(".dev079-workspace-footer").getByRole("button", { name: "核准" });
  check("reviewer approve action is rendered and enabled", await approveButton.count() === 1 && await approveButton.isEnabled());
  const decisionResponsePromise = reviewer.waitForResponse((response) => response.url().includes("/api/pdm/review-requests/") && response.url().endsWith("/decisions") && response.request().method() === "POST", { timeout: 30_000 });
  await approveButton.focus();
  await approveButton.press("Enter");
  const decisionResponse = await decisionResponsePromise;
  const decisionBody = await decisionResponse.json().catch(() => null);
  check("review decision request accepted", decisionResponse.ok(), JSON.stringify(decisionBody));
  await reviewer.waitForURL((url) => url.pathname === "/approvals", { timeout: 30_000 });
  await reviewer.close();
  const finalPage = await openDrawing(reviewerContext, "final drawing workbench");
  const finalRead = await readWorkbench(finalPage);
  const finalRows = (finalRead.body?.data?.groups ?? []).flatMap((group) => group.rows ?? []);
  const faultRow = finalRows.find((row) => row.layerLabel === "研發版 1.2");
  check("canonical UI row exposes selected fault handling", faultRow?.handling === profile && faultRow?.handlingLabel === (profile === "system_admin" ? "系統管理員處理" : "受阻"), JSON.stringify(faultRow));
  check("fault review request is no longer actionable", !faultRow?.actions?.length, JSON.stringify(faultRow?.actions));
  if (profile === "blocked") {
    await finalPage.locator(".canonical-row-open").filter({ hasText: "A0002-M01" }).last().click();
    await finalPage.getByRole("dialog", { name: /A0002-M01/u }).waitFor({ state: "visible", timeout: 30_000 });
    check("blocked drawer shows human-readable blocker", await finalPage.getByText("自動化正式化缺少安全修復路徑。", { exact: true }).count() === 1);
  }
  await finalPage.screenshot({ path: path.join(screenshotDir, `${profile}-after-review.png`), fullPage: true });
  await finalPage.close();
  await reviewerContext.close();
  await ownerContext.close();

  const evidence = new Database(fixtureDb, { readonly: true });
  const dbState = evidence.prepare("SELECT work_id, handling, blocker_reason FROM canonical_workbench_states WHERE work_id IS NOT NULL AND canonical_entity_id = 'drawing-draft-drawing-cc7187b8-1ec4-4936-91da-4771f1b8a877' ORDER BY updated_at DESC LIMIT 1").get();
  const dbReview = evidence.prepare("SELECT COUNT(*) AS count FROM pdm_work_review_requests WHERE work_id = ? AND request_status IN ('pending', 'applying')").get(dbState?.work_id ?? "");
  const after = evidence.prepare("SELECT revision_id AS production_revision_id FROM canonical_workbench_states WHERE canonical_entity_id = 'drawing-draft-drawing-cc7187b8-1ec4-4936-91da-4771f1b8a877' AND data_layer = 'drawing_production'").get();
  check("database canonical state matches UI fault handling", dbState?.handling === profile && (profile === "blocked" ? dbState?.blocker_reason === "自動化正式化缺少安全修復路徑。" : dbState?.blocker_reason === null), JSON.stringify(dbState));
  check("database has no actionable review request after terminal fault", Number(dbReview?.count ?? 0) === 0, JSON.stringify(dbReview));
  check("formal drawing data was not changed by fault path", after?.production_revision_id === baseline?.production_revision_id, JSON.stringify({ baseline, after }));
  evidence.close();
} catch (error) {
  checks.push({ name: "fault browser execution", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const probe = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: probe, detail: `port=${port}` });
  }
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((item) => !item.pass);
const manifest = { devId: "DEV-087", runId, profile, status: failed.length || failures.length ? "FAIL" : "PASS", port, outputDir, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, failures };
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length || failures.length) process.exitCode = 1;
