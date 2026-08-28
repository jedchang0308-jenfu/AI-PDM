#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const parentRunId = process.env.DEV087_PARENT_RUN_ID ?? null;
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
const fixtureUploadDir = path.join(tempRoot, "uploads");
const drawingUpload2d = path.join(fixtureUploadDir, "DEV087-FAULT-QA.SLDDRW");
const drawingUpload3d = path.join(fixtureUploadDir, "DEV087-FAULT-QA.SLDPRT");
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const requestedSourceDb = String(process.env.QC_DEV087_SOURCE_DB ?? "").trim();
const requestedSourceRepository = String(process.env.QC_DEV087_SOURCE_REPOSITORY ?? "").trim();
const sourcePrepared = process.env.QC_DEV087_SOURCE_PREPARED === "1";
const sourceDb = requestedSourceDb || path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = requestedSourceRepository || path.join(root, "data", "repository");
const fixtureRepository = path.join(fixtureDataDir, "repository");
const checks = [];
const failures = [];
const fixtureMutationLedger = [];
let app = null;
let browser = null;
let port = null;
let baseUrl = "";
let runtimeProjectRoot = null;
let diagnosticPage = null;

function assertAllowedSourceOverride(candidate, kind) {
  if (!candidate) return;
  const resolved = path.resolve(candidate);
  const tempPrefix = `${path.resolve(os.tmpdir())}${path.sep}ai-pdm-dev087-ui-only-`;
  if (!resolved.startsWith(tempPrefix)) throw new Error(`UNSAFE_${kind}_SOURCE_OVERRIDE:${resolved}`);
}

function prepareTaskOwnedRuntimeProject(targetRoot) {
  const resolvedWorkspaceTemp = path.resolve(root, ".tmp");
  const resolvedTarget = path.resolve(targetRoot);
  if (!resolvedTarget.startsWith(`${resolvedWorkspaceTemp}${path.sep}`) || !path.basename(resolvedTarget).startsWith("qc-dev087-fault-runtime-project-")) {
    throw new Error(`UNSAFE_FAULT_RUNTIME_PROJECT_PATH:${resolvedTarget}`);
  }
  fs.mkdirSync(resolvedTarget, { recursive: true });
  for (const file of ["package.json", "next.config.mjs", "tsconfig.json", "tsconfig.app.json", "tsconfig.next.json", "next-env.d.ts"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolvedTarget, file));
  }
  for (const file of [".env", ".env.local", ".env.development.local"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolvedTarget, file));
  }
  for (const directory of ["src", "public", "db", "config"]) {
    const source = path.join(root, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(resolvedTarget, directory), { recursive: true, force: true });
  }
  const runtimeNextConfigPath = path.join(resolvedTarget, "next.config.mjs");
  const runtimeNextConfig = fs.readFileSync(runtimeNextConfigPath, "utf8");
  const isolatedNextConfig = runtimeNextConfig.replace("const nextConfig = {", "const nextConfig = {\n  agentRules: false,");
  if (isolatedNextConfig === runtimeNextConfig) throw new Error("FAULT_RUNTIME_NEXT_CONFIG_PATCH_POINT_MISSING");
  fs.writeFileSync(runtimeNextConfigPath, isolatedNextConfig, "utf8");
  fs.mkdirSync(path.join(resolvedTarget, "scripts"), { recursive: true });
  for (const file of ["qc-process-warning-guard.mjs", "qc-node-listener-budget.cjs"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(resolvedTarget, "scripts", file));
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(resolvedTarget, "node_modules"), "junction");
  return resolvedTarget;
}

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function removeTaskOwnedFaultTempDir(candidate) {
  const resolved = path.resolve(candidate);
  const tempRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("ai-pdm-dev087-fault-")) {
    return { removed: false, path: resolved, error: "unsafe-path" };
  }
  let lastError = null;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
      if (!fs.existsSync(resolved)) return { removed: true, path: resolved, attempts: attempt, error: null };
    } catch (error) {
      lastError = error;
    }
    await delay(Math.min(1_000, attempt * 100));
  }
  return {
    removed: !fs.existsSync(resolved),
    path: resolved,
    attempts: 20,
    error: lastError instanceof Error ? lastError.message : lastError ? String(lastError) : "path-still-exists"
  };
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
  assertAllowedSourceOverride(requestedSourceDb, "DATABASE");
  assertAllowedSourceOverride(requestedSourceRepository, "REPOSITORY");
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(fixtureUploadDir, { recursive: true });
  fs.writeFileSync(drawingUpload2d, "DEV-087 disposable fault 2D drawing fixture\n", "utf8");
  fs.writeFileSync(drawingUpload3d, "DEV-087 disposable fault 3D model fixture\n", "utf8");
  fixtureMutationLedger.push({ action: "create-rendered-ui-upload-fixtures", files: [path.basename(drawingUpload2d), path.basename(drawingUpload3d)], scope: "disposable fixture only" });
  check("task-owned fault upload fixtures prepared", fs.existsSync(drawingUpload2d) && fs.existsSync(drawingUpload3d), JSON.stringify([drawingUpload2d, drawingUpload3d]));
  const sourceSnapshot = new Database(sourceDb, { readonly: true, fileMustExist: true });
  await sourceSnapshot.backup(fixtureDb);
  sourceSnapshot.close();
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const prepared = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  const requiredTables = ["canonical_workbench_states", "pdm_workbench_aggregates", "pdm_workbench_state_authority_control", "pdm_workbench_migration_quarantine"];
  const presentTables = new Set(prepared.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  const hasCanonicalTables = requiredTables.every((table) => presentTables.has(table));
  const authority = hasCanonicalTables
    ? prepared.prepare("SELECT mode, expected_commit, schema_hash FROM pdm_workbench_state_authority_control LIMIT 1").get()
    : null;
  const unresolved = hasCanonicalTables
    ? Number(prepared.prepare("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolved_at IS NULL OR resolution IS NULL").get()?.count ?? -1)
    : -1;
  const foreignKeys = prepared.pragma("foreign_key_check");
  prepared.close();
  const canonicalSourceValid = hasCanonicalTables
    && authority?.mode === "canonical_only"
    && authority?.expected_commit === "local-dev"
    && authority?.schema_hash === "dev090-v1"
    && unresolved === 0
    && foreignKeys.length === 0;
  if (sourcePrepared || canonicalSourceValid) {
    check(sourcePrepared ? "prepared canonical source verified without second migration" : "canonical source verified without second migration", canonicalSourceValid, JSON.stringify({ requiredTables, presentTables: [...presentTables].filter((table) => requiredTables.includes(table)), authority, unresolved, foreignKeys }));
  } else {
    const migration = spawnSync(process.execPath, [
      path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"),
      `--db=${fixtureDb}`, "--apply", "--confirm-disposable-dev-087", "--discard-unapproved-part-only-drafts", `--output-dir=${path.join(tempRoot, "migration")}`
    ], { cwd: root, encoding: "utf8" });
    check("isolated migration applied or safely quarantined", migration.status === 0 || migration.status === 2, `${migration.stdout}\n${migration.stderr}`);
  }
  const fixture = new Database(fixtureDb);
  let baseline = null;
  try {
    fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1").run();
    fixtureMutationLedger.push({ action: "normalize-fixture-authority-control", scope: "disposable fixture only" });
    baseline = fixture.prepare("SELECT revision_id AS production_revision_id FROM canonical_workbench_states WHERE canonical_entity_id = 'drawing-draft-drawing-cc7187b8-1ec4-4936-91da-4771f1b8a877' AND data_layer = 'drawing_production'").get();
    check("isolated fixture has A0002 production and RD rows", fixture.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states state JOIN drawings drawing ON drawing.id = state.canonical_entity_id WHERE drawing.drawing_number='A0002-M01' AND state.data_layer IN ('drawing_production', 'drawing_rd')").get().count >= 2);
  } finally {
    fixture.close();
  }

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  runtimeProjectRoot = prepareTaskOwnedRuntimeProject(path.join(root, ".tmp", `qc-dev087-fault-runtime-project-${port}`));
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: ".next", PDM_NEXT_TSCONFIG_PATH: "tsconfig.next.json", PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_DEV087_FAULT_PROFILE: profile
  });
  console.log(`QC DEV-087 fault runtime: profile=${profile}; project=${root}; runtimeProject=${runtimeProjectRoot}; purpose=rendered UI review fault path; port=${port}; processTree=task-owned Next dev + Playwright; cleanup=after browser assertions; sourceDb=${sourceDb}; PDM_DATA_DIR=${fixtureDataDir}; PDM_REPOSITORY_DIR=${fixtureRepository}; mutationScope=isolated fixture only`);
  app = startNextApp(runtimeProjectRoot, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });

  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(ownerContext, "系統管理員");
  const owner = await openDrawing(ownerContext, "owner drawing workbench");
  diagnosticPage = owner;
  const productionRow = owner.locator(".canonical-table-wrap tbody tr").filter({ hasText: "量產版 1" }).first();
  check("production row visible for UI fault journey", await productionRow.count() === 1);
  await productionRow.locator(".drawing-workbench-row-action, .canonical-row-open").first().click().catch(async () => { await productionRow.click(); });
  await owner.locator('[role="complementary"][data-detail-code="A0002-M01"]').waitFor({ state: "visible", timeout: 30_000 });
  await owner.getByRole("button", { name: "進版", exact: true }).click();
  const revisionModal = owner.getByRole("dialog", { name: "建立進版工作" });
  await revisionModal.waitFor({ state: "visible", timeout: 30_000 });
  await owner.waitForFunction(() => Boolean(document.querySelector(".canonical-revision-targets label, .canonical-revision-recovery, .canonical-revision-modal .canonical-error")), null, { timeout: 30_000 });
  const rdTarget = revisionModal.locator(".canonical-revision-targets label:not(.is-disabled)").filter({ hasText: "研發版" }).first();
  const rdTargetText = await rdTarget.innerText().catch(() => "");
  check("fault UI offers expected RD 1.2 candidate", await rdTarget.count() === 1 && /研發版 1\.2/u.test(rdTargetText), rdTargetText);
  await rdTarget.click();
  const createResponsePromise = owner.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/revision-works"), { timeout: 30_000 });
  await revisionModal.getByRole("button", { name: "建立進版工作", exact: true }).click();
  const createResponse = await createResponsePromise;
  const createBody = await createResponse.json().catch(() => null);
  check("fault RD 1.2 work created through rendered UI", createResponse.ok(), JSON.stringify(createBody));
  await owner.locator(".dev079-workspace").waitFor({ state: "visible", timeout: 30_000 });
  await owner.getByRole("button", { name: "取消本次工作", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const readyStatus = owner.getByText("本版次 2D 與 3D 主檔已齊備。", { exact: true }).first();
  if (await readyStatus.count() === 0) {
    const fileInput = owner.locator(".dev079-workspace-file-upload input[type='file']").first();
    check("fault owner workspace exposes rendered file upload", await fileInput.count() === 1);
    await fileInput.setInputFiles([drawingUpload2d, drawingUpload3d]);
    const uploadButton = owner.getByRole("button", { name: "上傳所選檔案", exact: true }).first();
    check("fault owner upload action is rendered and enabled", await uploadButton.count() === 1 && await uploadButton.isEnabled());
    await uploadButton.click();
    await owner.waitForFunction(() => {
      const rows = [...document.querySelectorAll(".dev079-upload-progress-list li")];
      return rows.filter((row) => row.classList.contains("is-success")).length >= 2
        || rows.some((row) => row.classList.contains("is-failed"));
    }, null, { timeout: 45_000 });
    const failedUploads = await owner.locator(".dev079-upload-progress-list li.is-failed").allTextContents();
    const successfulUploads = await owner.locator(".dev079-upload-progress-list li.is-success").allTextContents();
    check("fault drawing prerequisites uploaded through rendered UI", failedUploads.length === 0 && successfulUploads.length >= 2, JSON.stringify({ failedUploads, successfulUploads }));
  }
  await readyStatus.waitFor({ state: "visible", timeout: 45_000 });
  const fffAxes = owner.locator(".canonical-fff-grid select[data-fff-axis]");
  const fffAxisCount = await fffAxes.count();
  check("fault owner sees three required FFF axes", fffAxisCount === 3, `count=${fffAxisCount}`);
  for (let index = 0; index < fffAxisCount; index += 1) {
    const axis = fffAxes.nth(index);
    if (!(await axis.inputValue())) await axis.selectOption("no_impact");
  }
  await owner.waitForFunction(() => Array.from(document.querySelectorAll(".canonical-fff-grid select[data-fff-axis]"))
    .every((axis) => axis instanceof HTMLSelectElement && axis.value === "no_impact"), undefined, { timeout: 10_000 });
  const submitButton = owner.locator(".dev079-workspace-footer").getByRole("button", { name: "送出審核" });
  check("owner editor is rendered before review", await submitButton.count() === 1 && await submitButton.isEnabled());
  await submitButton.focus();
  await submitButton.press("Enter");
  await owner.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await owner.close();

  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(reviewerContext, "研發主管");
  const reviewer = await openDrawing(reviewerContext, "reviewer drawing workbench");
  diagnosticPage = reviewer;
  const listRead = await readWorkbench(reviewer);
  check("review request appears in read-only workbench readback", listRead.status === 200 && Array.isArray(listRead.body?.data?.groups), JSON.stringify(listRead.body));
  const rows = (listRead.body?.data?.groups ?? []).flatMap((group) => group.rows ?? []);
  const reviewRow = rows.find((row) => row.layerLabel === "研發版 1.2");
  check("review row has a UI review action", Boolean(reviewRow?.actions?.some((action) => action.key === "review" && typeof action.href === "string")), JSON.stringify(reviewRow));
  const reviewHref = reviewRow.actions.find((action) => action.key === "review")?.href;
  await reviewer.goto(`${baseUrl}${reviewHref}?returnTo=${encodeURIComponent("/numbering/drawings?query=A0002-M01")}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await reviewer.locator("[data-pdm-edit-page='true'], .dev079-workspace").first().waitFor({ state: "visible", timeout: 30_000 });
  await reviewer.locator(".pdm-edit-page-body, .dev079-workspace-grid, .canonical-error[role='alert']").first().waitFor({ state: "visible", timeout: 30_000 });
  const reviewLoadError = await reviewer.locator(".canonical-error[role='alert']:visible").count() > 0
    && await reviewer.locator(".pdm-edit-page-body").count() === 0
    && await reviewer.locator(".dev079-workspace-grid").count() === 0;
  check("fault review editor loaded without terminal error", !reviewLoadError);
  const readonlyNotice = await reviewer.getByText(/目前為唯讀/u).count();
  const filesSectionHeading = await reviewer.getByRole("heading", { name: "版次與檔案" }).count();
  const readonlyControls = await reviewer.locator("input[disabled], select[disabled], textarea[disabled]").count();
  check("reviewer sees the same drawing editor in read-only mode", readonlyNotice >= 1 && filesSectionHeading === 1 && readonlyControls >= 1, JSON.stringify({ readonlyNotice, filesSectionHeading, readonlyControls }));
  const approveButton = reviewer.locator(".dev079-workspace-footer").getByRole("button", { name: "核准" });
  check("reviewer approve action is rendered and enabled", await approveButton.count() === 1 && await approveButton.isEnabled());
  const decisionResponsePromise = reviewer.waitForResponse((response) => response.url().includes("/api/pdm/review-requests/") && response.url().endsWith("/decisions") && response.request().method() === "POST", { timeout: 30_000 });
  await approveButton.focus();
  await approveButton.press("Enter");
  const decisionResponse = await decisionResponsePromise;
  const decisionBody = await decisionResponse.json().catch(() => null);
  check("review decision request accepted", decisionResponse.ok(), JSON.stringify(decisionBody));
  await reviewer.waitForURL((url) => url.pathname === "/approvals" || url.pathname === "/numbering/drawings", { timeout: 30_000 });
  await reviewer.close();
  const finalPage = await openDrawing(reviewerContext, "final drawing workbench");
  diagnosticPage = finalPage;
  const finalRead = await readWorkbench(finalPage);
  const finalRows = (finalRead.body?.data?.groups ?? []).flatMap((group) => group.rows ?? []);
  const faultRow = finalRows.find((row) => row.layerLabel === "研發版 1.2");
  check("canonical UI row exposes selected fault handling", faultRow?.handling === profile && faultRow?.handlingLabel === (profile === "system_admin" ? "系統管理員處理" : "受阻"), JSON.stringify(faultRow));
  check("fault review request is no longer actionable", !faultRow?.actions?.length, JSON.stringify(faultRow?.actions));
  if (profile === "blocked") {
    await finalPage.locator(".canonical-table-wrap tbody tr").filter({ hasText: "研發版 1.2" }).locator(".canonical-row-open").click();
    await finalPage.locator('[role="complementary"][data-detail-code="A0002-M01"]').waitFor({ state: "visible", timeout: 30_000 });
    check("blocked drawer shows human-readable blocker", await finalPage.getByText("自動化正式化缺少安全修復路徑。", { exact: true }).count() === 1);
  }
  await finalPage.screenshot({ path: path.join(screenshotDir, `${profile}-after-review.png`), fullPage: true });
  await finalPage.close();
  await reviewerContext.close();
  await ownerContext.close();

  const evidence = new Database(fixtureDb, { readonly: true });
  try {
    const dbState = evidence.prepare("SELECT work_id, handling, blocker_reason FROM canonical_workbench_states WHERE work_id IS NOT NULL AND canonical_entity_id = 'drawing-draft-drawing-cc7187b8-1ec4-4936-91da-4771f1b8a877' ORDER BY updated_at DESC LIMIT 1").get();
    const dbReview = evidence.prepare("SELECT COUNT(*) AS count FROM pdm_work_review_requests WHERE work_id = ? AND request_status IN ('pending', 'applying')").get(dbState?.work_id ?? "");
    const after = evidence.prepare("SELECT revision_id AS production_revision_id FROM canonical_workbench_states WHERE canonical_entity_id = 'drawing-draft-drawing-cc7187b8-1ec4-4936-91da-4771f1b8a877' AND data_layer = 'drawing_production'").get();
    check("database canonical state matches UI fault handling", dbState?.handling === profile && (profile === "blocked" ? dbState?.blocker_reason === "自動化正式化缺少安全修復路徑。" : dbState?.blocker_reason === null), JSON.stringify(dbState));
    check("database has no actionable review request after terminal fault", Number(dbReview?.count ?? 0) === 0, JSON.stringify(dbReview));
    check("formal drawing data was not changed by fault path", after?.production_revision_id === baseline?.production_revision_id, JSON.stringify({ baseline, after }));
  } finally {
    evidence.close();
  }
} catch (error) {
  try {
    if (diagnosticPage && !diagnosticPage.isClosed()) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await diagnosticPage.screenshot({ path: path.join(screenshotDir, "fault-first-failure.png"), fullPage: true });
      fs.writeFileSync(path.join(outputDir, "fault-first-failure.json"), `${JSON.stringify(await diagnosticPage.evaluate(() => ({
        url: window.location.href,
        title: document.title,
        alerts: [...document.querySelectorAll("[role='alert']")].map((node) => node.textContent?.trim()).filter(Boolean),
        statuses: [...document.querySelectorAll("[role='status']")].map((node) => node.textContent?.trim()).filter(Boolean),
        buttons: [...document.querySelectorAll("button")].map((node) => ({ text: node.textContent?.trim(), disabled: node.disabled })).filter((item) => item.text),
        bodyText: document.body.innerText.slice(0, 8000)
      })), null, 2)}\n`, "utf8");
    }
  } catch { /* diagnostic evidence is best-effort and never changes the first failure */ }
  checks.push({ name: "fault browser execution", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const probe = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: probe, detail: `port=${port}` });
  }
  const faultTempCleanup = await removeTaskOwnedFaultTempDir(tempRoot);
  checks.push({ name: "temporary data/repository root removed", pass: faultTempCleanup.removed, detail: JSON.stringify(faultTempCleanup) });
  const runtimeCleanup = runtimeProjectRoot
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeProjectRoot)
    : { removed: true, path: null, notCreated: true, error: null };
  checks.push({ name: "temporary runtime project removed", pass: runtimeCleanup.removed, detail: JSON.stringify(runtimeCleanup) });
}

const failed = checks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-087",
  runId,
  parentRunId,
  profile,
  status: failed.length || failures.length ? "FAIL" : "PASS",
  port,
  outputDir,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  failures,
  fixtureMutationLedger,
  mutationPolicy: "test setup only in task-owned fixture; business writes through rendered UI; API/DB readback only"
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length || failures.length) process.exitCode = 1;
