#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import Database from "better-sqlite3";
import { chromium } from "playwright";

import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV098-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceRoot = path.resolve(process.env.DEV098_BROWSER_EVIDENCE_DIR?.trim() || path.join(root, "output", "qa", "dev-098", runId));
const screenshotRoot = path.join(evidenceRoot, "screenshots");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev098-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const uploadDir = path.join(taskRoot, "uploads");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
const upload2d = path.join(uploadDir, "DEV098-QA.SLDDRW");
const upload3d = path.join(uploadDir, "DEV098-QA.SLDPRT");
const companyId = "company-jenfu";
const primaryDbPath = path.resolve(process.env.PDM_PRIMARY_DB_PATH?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
const primaryRepositoryDir = path.resolve(process.env.PDM_PRIMARY_REPOSITORY_DIR?.trim() || path.join(root, "data", "repository"));
const fixedCaseIds = [...Array.from({ length: 8 }, (_, index) => `QA-098-${String(index + 17).padStart(3, "0")}`), "QA-098-029"];
const results = new Map();
const network = [];
const consoleErrors = [];
const pageErrors = [];
const requestFailures = [];
const expectedHttp = [];
let port = null;
let baseUrl = "";
let runtimeProjectRoot = null;
let app = null;
let browser = null;
let primaryBefore = null;
let primaryAfter = null;
let firstFailure = null;
let tempCleanup = { removed: false, path: taskRoot, error: "not-attempted" };
let runtimeCleanup = { removed: false, path: null, error: "not-attempted" };
let fixtureDrawingId = null;
let productionRowId = null;
let initialProductionRevisionId = null;

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function primarySnapshot() {
  const command = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${primaryDbPath}`], { cwd: root, encoding: "utf8" });
  if (command.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${command.stderr || command.stdout}`);
  return JSON.parse(command.stdout.trim());
}

function primarySafe(snapshot) {
  return snapshot
    && Object.values(snapshot.counts ?? {}).every((count) => Number(count) > 0)
    && Number(snapshot.migrationResidue?.unresolved ?? -1) === 0
    && Object.values(snapshot.rootReferenceViolations ?? {}).every((count) => Number(count) === 0)
    && Number(snapshot.foreignKeyViolations ?? -1) === 0;
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function prepareLifecycleFixture(database) {
  const drawing = database.prepare(`SELECT id,company_id,created_by FROM drawings WHERE drawing_number='A0002-M01' AND formal_drawing_number_id IS NOT NULL ORDER BY id LIMIT 1`).get();
  const baseRevision = drawing ? database.prepare(`SELECT * FROM drawing_revisions WHERE drawing_id=? ORDER BY CASE WHEN revision='0.1' THEN 0 ELSE 1 END,revision LIMIT 1`).get(drawing.id) : null;
  if (!drawing || !baseRevision) throw new Error("LIFECYCLE_FIXTURE_A0002_SOURCE_MISSING");
  const cloneRevision = (id, revision, lifecycleState) => {
    database.prepare(`INSERT INTO drawing_revisions (
        id,company_id,drawing_id,revision,lifecycle_state,policy_snapshot_json,override_reason,row_version,
        approval_request_id,review_snapshot_hash,source_candidate_revision_id,source_revision_package_id,
        created_by,created_at,updated_by,updated_at,submitted_at,controlled_at,released_at,superseded_at,cancelled_at
      ) SELECT ?,company_id,drawing_id,?,'preparing',policy_snapshot_json,override_reason,1,NULL,NULL,
        source_candidate_revision_id,source_revision_package_id,created_by,created_at,updated_by,updated_at,
        submitted_at,controlled_at,CASE WHEN ?='released' THEN CURRENT_TIMESTAMP ELSE NULL END,NULL,NULL
      FROM drawing_revisions WHERE id=?`).run(id, revision, lifecycleState, baseRevision.id);
    const files = database.prepare("SELECT * FROM drawing_revision_files WHERE drawing_revision_id=? AND removed_at IS NULL ORDER BY sort_order,id").all(baseRevision.id);
    files.forEach((file, index) => database.prepare(`INSERT INTO drawing_revision_files (
        id,company_id,drawing_revision_id,source_file_asset_id,source_candidate_file_id,source_package_file_id,
        role,role_source,display_name,description,sort_order,is_primary,removed_at,removed_by,created_by,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?)`).run(
      `${id}-file-${index + 1}`, file.company_id, id, file.source_file_asset_id, file.source_candidate_file_id,
      file.source_package_file_id, file.role, file.role_source, file.display_name, file.description,
      file.sort_order, file.is_primary, file.created_by, file.created_at, file.updated_at
    ));
    database.prepare("UPDATE drawing_revisions SET lifecycle_state=?,released_at=CASE WHEN ?='released' THEN CURRENT_TIMESTAMP ELSE NULL END,controlled_at=CASE WHEN ?='rd_controlled' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?").run(lifecycleState, lifecycleState, lifecycleState, id);
  };
  if (!database.prepare("SELECT id FROM drawing_revisions WHERE drawing_id=? AND revision='1'").get(drawing.id)) cloneRevision("qa-dev098-ui-production-revision", "1", "released");
  if (!database.prepare("SELECT id FROM drawing_revisions WHERE drawing_id=? AND revision='1.1'").get(drawing.id)) cloneRevision("qa-dev098-ui-rd-revision", "1.1", "rd_controlled");
  const targetTables = [
    "pdm_review_traces", "pdm_work_review_requests", "drawing_revision_work_files", "canonical_workbench_states",
    "drawing_revision_works", "drawing_revision_claims", "drawing_rd_branches", "pdm_workbench_aggregates",
    "part_change_works", "relation_change_works", "pdm_workbench_migration_quarantine"
  ];
  const placeholders = targetTables.map(() => "?").join(",");
  const guards = database.prepare(`SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name IN (${placeholders}) ORDER BY name`).all(...targetTables);
  if (guards.some((guard) => !guard.name || !guard.sql)) throw new Error(`LIFECYCLE_FIXTURE_TARGET_GUARD_SQL_MISSING:${safeJson(guards)}`);
  database.transaction(() => {
    for (const guard of guards) database.exec(`DROP TRIGGER IF EXISTS "${String(guard.name).replaceAll('"', '""')}"`);
    for (const table of targetTables) database.prepare(`DELETE FROM "${table}"`).run();
    for (const guard of guards) database.exec(guard.sql);
  })();
  const restored = database.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name IN (${placeholders}) ORDER BY name`).all(...targetTables).map((row) => row.name);
  assert.deepEqual(restored, guards.map((guard) => guard.name));
  assert.equal(database.pragma("foreign_key_check").length, 0);
}

function prepareRuntimeProject(targetRoot) {
  const workspaceTemp = path.resolve(root, ".tmp");
  const target = path.resolve(targetRoot);
  if (!target.startsWith(`${workspaceTemp}${path.sep}`) || !path.basename(target).startsWith("qc-dev098-runtime-project-")) throw new Error(`UNSAFE_RUNTIME_PROJECT_PATH:${target}`);
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
  const current = fs.readFileSync(nextConfigPath, "utf8");
  const isolated = current.replace("const nextConfig = {", "const nextConfig = {\n  agentRules: false,");
  if (isolated === current) throw new Error("RUNTIME_NEXT_CONFIG_PATCH_POINT_MISSING");
  fs.writeFileSync(nextConfigPath, isolated, "utf8");
  fs.mkdirSync(path.join(target, "scripts"), { recursive: true });
  for (const file of ["qc-process-warning-guard.mjs", "qc-node-listener-budget.cjs"]) fs.copyFileSync(path.join(root, "scripts", file), path.join(target, "scripts", file));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(target, "node_modules"), "junction");
  return target;
}

async function removeTaskRoot(target) {
  const resolved = path.resolve(target);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("ai-pdm-dev098-browser-")) return { removed: false, path: resolved, error: "unsafe-path" };
  let lastError = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 }); }
    catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    if (!fs.existsSync(resolved)) return { removed: true, path: resolved, error: null, attempts: attempt };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { removed: false, path: resolved, error: lastError ?? "path-still-exists", attempts: 30 };
}

function fixtureSnapshot() {
  const database = new Database(fixtureDbPath, { readonly: true, fileMustExist: true });
  try {
    return {
      production: database.prepare(`SELECT state.id AS row_id,state.row_version,state.revision_id,revision.revision
        FROM canonical_workbench_states state JOIN drawing_revisions revision ON revision.id=state.revision_id
        WHERE state.company_id=? AND state.canonical_entity_id=? AND state.data_layer='drawing_production'`).get(companyId, fixtureDrawingId) ?? null,
      rows: database.prepare(`SELECT state.id AS row_id,state.data_layer,state.handling,state.work_id,state.row_version,state.revision_id,revision.revision,branch.base_production_revision_id
        FROM canonical_workbench_states state JOIN drawing_revisions revision ON revision.id=state.revision_id
        LEFT JOIN drawing_rd_branches branch ON branch.id=state.branch_id
        WHERE state.company_id=? AND state.canonical_entity_id=? ORDER BY state.data_layer,revision.revision`).all(companyId, fixtureDrawingId),
      works: database.prepare("SELECT work.id,work.row_version,claim.target_label,claim.predecessor_revision_id,claim.claim_state FROM drawing_revision_works work JOIN drawing_revision_claims claim ON claim.id=work.target_claim_id WHERE work.company_id=? AND work.drawing_id=? ORDER BY claim.target_major,claim.target_minor").all(companyId, fixtureDrawingId),
      claims: database.prepare("SELECT target_label,predecessor_revision_id,claim_state FROM drawing_revision_claims WHERE company_id=? AND drawing_id=? ORDER BY target_major,target_minor").all(companyId, fixtureDrawingId),
      branches: database.prepare("SELECT id,base_production_revision_id,latest_approved_revision_id,status,closed_reason FROM drawing_rd_branches WHERE company_id=? AND drawing_id=? ORDER BY id").all(companyId, fixtureDrawingId),
      aggregate: database.prepare("SELECT open_branch_count,row_version FROM pdm_workbench_aggregates WHERE company_id=? AND canonical_entity_id=? AND entity_type='drawing'").get(companyId, fixtureDrawingId)
    };
  } finally { database.close(); }
}

function recordCase(id, title, detail) {
  results.set(id, { id, title, status: "PASS", detail });
  console.log(`PASS ${id} ${title}`);
}

function monitor(page, label) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ label, message: message.text() }); });
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  page.on("requestfailed", (request) => requestFailures.push({ label, method: request.method(), url: request.url(), failure: request.failure() }));
  page.on("response", (response) => network.push({ label, status: response.status(), method: response.request().method(), url: response.url() }));
}

async function installTaskOwnedQaSession(context, roleLabel) {
  const emailByRoleLabel = {
    "系統管理員": "admin@example.com",
    "工程師": "engineer@example.com",
    "研發主管": "manager@example.com",
    "製造": "manufacturing@example.com"
  };
  const email = emailByRoleLabel[roleLabel];
  if (!email) throw new Error(`DEV098_TASK_OWNED_QA_SESSION_ROLE_UNSUPPORTED:${roleLabel}`);
  const database = new Database(fixtureDbPath, { readonly: true, fileMustExist: true });
  let user;
  try {
    user = database.prepare("SELECT id,role,account_status,system_role_enabled FROM users WHERE lower(email)=lower(?) LIMIT 1").get(email);
  } finally {
    database.close();
  }
  if (!user || user.account_status !== "active" || Number(user.system_role_enabled) !== 1) {
    throw new Error(`DEV098_TASK_OWNED_QA_SESSION_USER_UNAVAILABLE:${roleLabel}`);
  }
  const payload = Buffer.from(JSON.stringify({ userId: user.id, createdAt: Date.now(), sessionId: crypto.randomUUID() })).toString("base64url");
  const secret = process.env.PDM_AUTH_SECRET || "dev-only-change-before-production";
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  await context.addCookies([{ name: "pdm_session", value: `${payload}.${signature}`, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  const verification = await context.request.get(`${baseUrl}/api/auth/me`);
  if (!verification.ok()) throw new Error(`DEV098_TASK_OWNED_QA_SESSION_VERIFY_HTTP_${verification.status()}:${roleLabel}`);
  const body = await verification.json().catch(() => null);
  if (body?.user?.role !== user.role) throw new Error(`DEV098_TASK_OWNED_QA_SESSION_ROLE_MISMATCH:${safeJson({ expected: user.role, actual: body?.user?.role })}`);
}

async function waitForList(page) {
  await page.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => Boolean(document.querySelector(".canonical-table-wrap tbody tr, .canonical-preview-card, .canonical-error[role='alert']")), null, { timeout: 30_000 });
}

async function openList(page) {
  await page.goto(`${baseUrl}/numbering/drawings?query=A0002-M01`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForList(page);
}

async function openRow(page, text) {
  const row = page.locator(".canonical-table-wrap tbody tr").filter({ hasText: text }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  const detailResponse = page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/api/numbering/drawings/workbench/"), { timeout: 30_000 });
  await row.locator(".canonical-row-open").click();
  const drawer = page.locator(".pdm-entity-detail-drawer").last();
  await drawer.waitFor({ state: "visible", timeout: 30_000 });
  const response = await detailResponse;
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => !document.querySelector(".canonical-drawer-message"), null, { timeout: 30_000 });
  return drawer;
}

async function openAdvance(page, rowText) {
  await openList(page);
  const drawer = await openRow(page, rowText);
  const advance = drawer.getByRole("button", { name: "進版", exact: true }).first();
  await advance.waitFor({ state: "visible", timeout: 30_000 });
  await advance.click();
  const modal = page.getByRole("dialog", { name: "建立進版工作" });
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => Boolean(document.querySelector(".canonical-revision-choice, .canonical-revision-recovery, .canonical-revision-modal .canonical-error")), null, { timeout: 30_000 });
  return { drawer, advance, modal };
}

async function chooseManual(modal, value) {
  await modal.getByRole("radio", { name: /自訂研發小版/u }).check();
  const input = modal.getByLabel("自訂研發小版次", { exact: true });
  await input.fill(value);
  return input;
}

async function cancelWorkspace(page) {
  const cancel = page.getByRole("button", { name: "取消本次工作", exact: true }).first();
  await cancel.waitFor({ state: "visible", timeout: 30_000 });
  page.once("dialog", (dialog) => dialog.accept());
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/cancel"), { timeout: 30_000 });
  await cancel.click();
  const response = await responsePromise;
  assert.ok(response.ok(), `cancel ${response.status()}`);
  await page.waitForURL((url) => url.pathname === "/numbering/drawings", { timeout: 30_000 });
  await waitForList(page);
}

async function uploadRequiredFiles(page) {
  const input = page.locator(".dev079-workspace-file-upload input[type='file']").first();
  await input.waitFor({ state: "attached", timeout: 30_000 });
  await input.setInputFiles([upload2d, upload3d]);
  const upload = page.getByRole("button", { name: "上傳所選檔案", exact: true }).first();
  await upload.click();
  await page.getByText("本版次 2D 與 3D 主檔已齊備。", { exact: true }).first().waitFor({ state: "visible", timeout: 45_000 });
}

async function submitWorkspace(page) {
  await uploadRequiredFiles(page);
  const axes = page.locator(".canonical-fff-grid select[data-fff-axis]");
  for (let index = 0; index < await axes.count(); index += 1) await axes.nth(index).selectOption("no_impact");
  const submit = page.getByRole("button", { name: "送出審核", exact: true }).first();
  await submit.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/submit"), { timeout: 30_000 });
  await submit.click();
  const response = await responsePromise;
  assert.ok(response.ok(), `submit ${response.status()}`);
  await page.waitForURL((url) => url.pathname === "/numbering/drawings", { timeout: 30_000 });
}

async function approveSubmitted(context, rowText) {
  const page = await context.newPage();
  monitor(page, "review-production");
  try {
    await openList(page);
    const drawer = await openRow(page, rowText);
    const action = drawer.getByRole("button", { name: "前往審核", exact: true }).first();
    await action.click();
    await page.waitForURL((url) => url.pathname.startsWith("/approvals/"), { timeout: 30_000 });
    await page.locator(".dev079-workspace-grid, .pdm-edit-page-body, .canonical-error[role='alert']").first().waitFor({ state: "visible", timeout: 30_000 });
    assert.ok(await page.getByText(/目前為唯讀/u).count() >= 1, "review workspace readonly notice");
    const approve = page.getByRole("button", { name: "核准", exact: true }).first();
    const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/decisions"), { timeout: 30_000 });
    await approve.click();
    const response = await responsePromise;
    assert.ok(response.ok(), `approve ${response.status()}`);
    await page.waitForURL((url) => url.pathname === "/approvals" || url.pathname === "/numbering/drawings", { timeout: 30_000 });
  } finally { await page.close(); }
}

async function createSelectedWork(page, modal) {
  const requestPromise = page.waitForRequest((request) => request.method() === "POST" && request.url().includes("/revision-works"), { timeout: 30_000 });
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/revision-works"), { timeout: 30_000 });
  await modal.getByRole("button", { name: "建立進版工作", exact: true }).click();
  const [request, response] = await Promise.all([requestPromise, responsePromise]);
  const body = request.postDataJSON();
  const responseBody = await response.json().catch(() => null);
  assert.ok(response.ok(), `create ${response.status()}:${JSON.stringify(responseBody)}`);
  await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
  await page.locator(".dev079-workspace").waitFor({ state: "visible", timeout: 30_000 });
  return { body, responseBody, url: page.url() };
}

async function runBrowserCases(ownerContext, raceOwnerContext, reviewerContext, viewerContext, adminContext) {
  const page = await ownerContext.newPage();
  monitor(page, "owner-main");
  try {
    const initial = fixtureSnapshot();
    const opened = await openAdvance(page, "量產版 1");
    const defaultMode = await opened.modal.getByRole("radio", { name: /使用系統建議/u }).isChecked();
    const primaryCount = await opened.modal.locator(".primary-button").count();
    const beforeRadio = fixtureSnapshot();
    await opened.modal.getByRole("radio", { name: /自訂研發小版/u }).check();
    await opened.modal.getByRole("radio", { name: /使用系統建議/u }).check();
    const afterRadio = fixtureSnapshot();
    assert.equal(defaultMode, true);
    assert.equal(primaryCount, 1);
    assert.deepEqual(afterRadio, beforeRadio);
    assert.ok((await opened.modal.innerText()).includes("由伺服器選擇下一個未占用版次"));
    recordCase("QA-098-017", "list, drawer and compact default-recommended modal have one primary action and radio zero-write", { defaultMode, primaryCount, beforeAfterEqual: true });

    const viewportEvidence = [];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => {
        const modal = document.querySelector(".canonical-revision-modal");
        const box = modal?.getBoundingClientRect();
        const primary = modal?.querySelector(".primary-button");
        return {
          viewport: { width: innerWidth, height: innerHeight },
          body: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
          modal: box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height } : null,
          primary: primary ? { scrollWidth: primary.scrollWidth, clientWidth: primary.clientWidth } : null
        };
      });
      assert.ok(geometry.modal);
      assert.ok(geometry.body.scrollWidth <= geometry.body.clientWidth);
      assert.ok(geometry.modal.left >= 0 && geometry.modal.right <= geometry.viewport.width + 1);
      assert.ok(geometry.primary.scrollWidth <= geometry.primary.clientWidth);
      const screenshot = path.join(screenshotRoot, `QA-098-024-${viewport.width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true, caret: "initial" });
      viewportEvidence.push({ ...geometry, screenshot: path.relative(root, screenshot) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const close = opened.modal.getByRole("button", { name: "關閉", exact: true });
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(await opened.modal.locator(":focus").innerText(), "建立進版工作");
    await opened.modal.getByRole("button", { name: "建立進版工作", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await opened.modal.locator(":focus").innerText(), "關閉");
    recordCase("QA-098-024", "responsive geometry, keyboard focus trap and clean interaction telemetry", { viewports: viewportEvidence, focusTrap: true });

    const postsBeforeInvalid = network.filter((entry) => entry.method === "POST" && entry.url.includes("/revision-works")).length;
    const input = await chooseManual(opened.modal, "");
    await opened.modal.getByRole("alert").waitFor({ state: "visible" });
    assert.ok((await opened.modal.getByRole("alert").innerText()).includes("請輸入"));
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    await input.fill("0");
    assert.ok((await opened.modal.getByRole("alert").innerText()).includes("必須大於"));
    await input.fill("2147483648");
    assert.ok((await opened.modal.getByRole("alert").innerText()).includes("不可大於"));
    await input.fill("05");
    assert.equal(await input.inputValue(), "05");
    assert.equal(await opened.modal.getByRole("button", { name: "建立進版工作", exact: true }).isEnabled(), true);
    const invalidBefore = fixtureSnapshot();
    await input.fill("8");
    await page.route("**/api/pdm/drawings/*/revision-works", async (route) => {
      const request = route.request();
      const original = request.postDataJSON();
      const response = await route.fetch({ postData: JSON.stringify({ ...original, requestedMinor: 0 }), headers: { ...request.headers(), "content-type": "application/json" } });
      await route.fulfill({ response });
    }, { times: 1 });
    expectedHttp.push({ method: "POST", pathSuffix: "/revision-works", status: 422, reason: "deliberate malformed minor" });
    const invalidResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/revision-works"), { timeout: 30_000 });
    await opened.modal.getByRole("button", { name: "建立進版工作", exact: true }).click();
    const rejected = await invalidResponse;
    assert.equal(rejected.status(), 422);
    await opened.modal.getByRole("alert").waitFor({ state: "visible" });
    const serverAlert = (await opened.modal.getByRole("alert").innerText()).trim();
    assert.ok(serverAlert.length > 0);
    assert.equal(await opened.modal.count(), 1);
    assert.equal(await opened.drawer.count(), 1);
    assert.deepEqual(fixtureSnapshot(), invalidBefore);
    const postsAfterInvalid = network.filter((entry) => entry.method === "POST" && entry.url.includes("/revision-works")).length;
    assert.equal(postsAfterInvalid - postsBeforeInvalid, 1);
    recordCase("QA-098-019", "manual invalid inputs and malformed server request remain visible with zero partial write", { values: ["05", "", "0", "2147483648"], directStatus: rejected.status(), serverAlert, modalPreserved: true, drawerPreserved: true, onlyPost: "deliberate malformed request" });

    await page.waitForFunction(() => {
      const button = document.querySelector(".canonical-revision-modal .canonical-modal-actions .primary-button");
      return button instanceof HTMLButtonElement && !button.disabled && button.textContent?.trim() === "建立進版工作";
    }, null, { timeout: 10_000 });
    await page.keyboard.press("Escape");
    await opened.modal.waitFor({ state: "detached", timeout: 10_000 });
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "進版", null, { timeout: 10_000 });
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "進版");

    const manual = await openAdvance(page, "量產版 1");
    await chooseManual(manual.modal, "7");
    const created = await createSelectedWork(page, manual.modal);
    assert.deepEqual(Object.keys(created.body).sort(), ["requestedMinor", "selectionMode", "sourceRowKey"]);
    assert.equal(created.body.selectionMode, "manual_minor");
    assert.equal(created.body.requestedMinor, 7);
    const work = fixtureSnapshot().works.find((entry) => entry.target_label === "1.7");
    assert.ok(work);
    assert.equal(work.predecessor_revision_id, initialProductionRevisionId);
    recordCase("QA-098-018", "manual 1.7 request shape and persisted predecessor are exact", { request: created.body, work });
    await cancelWorkspace(page);

    const viewerPage = await viewerContext.newPage();
    monitor(viewerPage, "viewer");
    try {
      await openList(viewerPage);
      const viewerDrawer = await openRow(viewerPage, "量產版 1");
      assert.equal(await viewerDrawer.getByRole("button", { name: "進版", exact: true }).count(), 0);
      expectedHttp.push({ method: "POST", pathSuffix: "/revision-works", status: 403, reason: "viewer direct mutation" });
      const viewerDirect = await viewerPage.evaluate(async ({ drawingId, rowKey }) => {
        const response = await fetch(`/api/pdm/drawings/${drawingId}/revision-works`, { method: "POST", headers: { "content-type": "application/json", "if-match": '"1"', "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": "invalid" }, body: JSON.stringify({ sourceRowKey: `cw_${rowKey}`, selectionMode: "manual_minor", requestedMinor: 9 }) });
        return { status: response.status, body: await response.json().catch(() => null) };
      }, { drawingId: fixtureDrawingId, rowKey: productionRowId });
      assert.equal(viewerDirect.status, 403);

      const adminPage = await adminContext.newPage();
      monitor(adminPage, "foreign-company");
      try {
        await openList(adminPage);
        const beforeForeign = fixtureSnapshot();
        expectedHttp.push({ method: "POST", pathSuffix: "/revision-works", status: 409, reason: "foreign-company direct mutation" });
        const foreign = await adminPage.evaluate(async ({ drawingId, rowKey }) => {
          const response = await fetch(`/api/pdm/drawings/${drawingId}/revision-works`, { method: "POST", headers: { "content-type": "application/json", "if-match": '"1"', "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": "invalid", "x-pdm-company-code": "MAXIMA" }, body: JSON.stringify({ sourceRowKey: `cw_${rowKey}`, selectionMode: "manual_minor", requestedMinor: 9 }) });
          return { status: response.status, body: await response.json().catch(() => null) };
        }, { drawingId: fixtureDrawingId, rowKey: productionRowId });
        assert.ok([403, 404, 409].includes(foreign.status), JSON.stringify(foreign));
        expectedHttp.at(-1).status = foreign.status;
        assert.deepEqual(fixtureSnapshot(), beforeForeign);
        recordCase("QA-098-023", "viewer and foreign-company mutation paths are fail-closed without disclosure or write", { viewer: viewerDirect, foreign, zeroWrite: true });
      } finally { await adminPage.close(); }
    } finally { await viewerPage.close(); }

    const racePage = await raceOwnerContext.newPage();
    monitor(racePage, "owner-race");
    await openList(racePage);
    const racePreviewButton = racePage.getByRole("button", { name: "預覽圖", exact: true });
    await racePreviewButton.waitFor({ state: "visible", timeout: 30_000 });
    await racePreviewButton.click();
    const raceGallery = racePage.locator(".canonical-preview-gallery");
    await raceGallery.waitFor({ state: "visible", timeout: 30_000 });
    const raceCard = racePage.locator(".canonical-preview-card").filter({ hasText: "研發版 1.1" }).first();
    const raceDetailResponse = racePage.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/api/numbering/drawings/workbench/"), { timeout: 30_000 });
    await raceCard.click();
    const raceDrawer = racePage.locator(".pdm-entity-detail-drawer").last();
    await raceDrawer.waitFor({ state: "visible", timeout: 30_000 });
    assert.equal((await raceDetailResponse).status(), 200);
    const raceAdvance = raceDrawer.getByRole("button", { name: "進版", exact: true }).first();
    await raceAdvance.waitFor({ state: "visible", timeout: 30_000 });
    const racePreviewBefore = await racePage.evaluate(() => {
      const node = document.querySelector(".canonical-preview-gallery");
      window.__dev098PreviewNode = node;
      const box = node?.getBoundingClientRect();
      return { box: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null, scrollX, scrollY };
    });

    const promotion = await openAdvance(page, "量產版 1");
    const productionTarget = promotion.modal.locator(".canonical-revision-targets label:not(.is-disabled)").filter({ hasText: "量產版 2" }).first();
    await productionTarget.waitFor({ state: "visible", timeout: 30_000 });
    assert.ok((await productionTarget.innerText()).includes("採用為量產版"));
    await productionTarget.click();
    const beforePromotion = fixtureSnapshot();
    const promotionCreated = await createSelectedWork(page, promotion.modal);
    assert.equal(promotionCreated.body.selectionMode, "recommended");
    assert.equal(fixtureSnapshot().production.revision, "1");
    await submitWorkspace(page);
    const afterSubmit = fixtureSnapshot();
    assert.equal(afterSubmit.production.revision, "1");
    assert.ok(afterSubmit.rows.some((row) => row.revision === "2" && row.handling === "review_owner"));
    await approveSubmitted(reviewerContext, "研發版 2");
    const afterApprove = fixtureSnapshot();
    assert.equal(afterApprove.production.revision, "2");
    recordCase("QA-098-022", "production candidate changes the production basis only after exact reviewer approval", { wording: "採用為量產版", before: beforePromotion.production, afterSubmit: afterSubmit.production, afterApprove: afterApprove.production });

    const raceTargetsRequests = [];
    const trackRaceTargets = (request) => { if (request.method() === "GET" && request.url().includes("revision-targets")) raceTargetsRequests.push(request.url()); };
    racePage.on("request", trackRaceTargets);
    const raceInitialGet = racePage.waitForRequest((request) => request.method() === "GET" && request.url().includes("revision-targets"), { timeout: 30_000 });
    await raceAdvance.click();
    await raceInitialGet;
    const raceModal = racePage.getByRole("dialog", { name: "建立進版工作" });
    await raceModal.waitFor({ state: "visible", timeout: 30_000 });
    const raceRecovery = raceModal.locator(".canonical-revision-recovery");
    await raceRecovery.waitFor({ state: "visible", timeout: 30_000 });
    assert.equal(await raceModal.locator(".canonical-revision-targets label:not(.is-disabled)").count(), 0);
    const raceRecoveryText = (await raceRecovery.innerText()).trim();
    assert.ok(raceRecoveryText.includes("量產基準已更新"));
    const raceRecoveryGet = racePage.waitForRequest((request) => request.method() === "GET" && request.url().includes("revision-targets") && raceTargetsRequests.length >= 1, { timeout: 30_000 });
    await raceRecovery.getByRole("button", { name: "從目前量產版建立新工作", exact: true }).click();
    await raceRecoveryGet;
    const raceRecoveredTarget = raceModal.locator(".canonical-revision-targets label:not(.is-disabled)").filter({ hasText: "研發版 2.1" }).first();
    await raceRecoveredTarget.waitFor({ state: "visible", timeout: 30_000 });
    const racePreviewAfter = await racePage.evaluate(() => {
      const node = document.querySelector(".canonical-preview-gallery");
      const box = node?.getBoundingClientRect();
      return { sameNode: window.__dev098PreviewNode === node, box: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null, scrollX, scrollY };
    });
    assert.equal(racePreviewAfter.sameNode, true);
    assert.deepEqual(racePreviewAfter.box, racePreviewBefore.box);
    assert.deepEqual({ x: racePreviewAfter.scrollX, y: racePreviewAfter.scrollY }, { x: racePreviewBefore.scrollX, y: racePreviewBefore.scrollY });
    assert.equal(raceTargetsRequests.length, 2);
    recordCase("QA-098-029", "post-load production-basis race switches the existing dialog to recovery without remounting preview", { targetsGets: raceTargetsRequests.length, recovery: raceRecoveryText, previewBefore: racePreviewBefore, previewAfter: racePreviewAfter });
    racePage.off("request", trackRaceTargets);
    await racePage.keyboard.press("Escape");
    await raceModal.waitFor({ state: "detached", timeout: 10_000 });
    await racePage.close();

    await openList(page);
    const previewButton = page.getByRole("button", { name: "預覽圖", exact: true });
    await previewButton.waitFor({ state: "visible", timeout: 30_000 });
    await previewButton.click();
    const gallery = page.locator(".canonical-preview-gallery");
    await gallery.waitFor({ state: "visible", timeout: 30_000 });
    const staleCard = page.locator(".canonical-preview-card").filter({ hasText: "研發版 1.1" }).first();
    const staleDetailResponse = page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/api/numbering/drawings/workbench/"), { timeout: 30_000 });
    await staleCard.click();
    const staleDrawer = page.locator(".pdm-entity-detail-drawer").last();
    await staleDrawer.waitFor({ state: "visible", timeout: 30_000 });
    assert.equal((await staleDetailResponse).status(), 200);
    assert.equal(await staleDrawer.getByRole("button", { name: "進版", exact: true }).count(), 0);
    const staleRestart = staleDrawer.getByRole("button", { name: "從目前量產版建立新工作", exact: true }).first();
    await staleRestart.waitFor({ state: "visible", timeout: 30_000 });
    const targetsRequests = [];
    const trackTargets = (request) => { if (request.method() === "GET" && request.url().includes("revision-targets")) targetsRequests.push(request.url()); };
    page.on("request", trackTargets);
    const previewBefore = await page.evaluate(() => {
      const node = document.querySelector(".canonical-preview-gallery");
      window.__dev098PreviewNode = node;
      const box = node?.getBoundingClientRect();
      return { box: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null, scrollX, scrollY };
    });
    const proactiveGet = page.waitForRequest((request) => request.method() === "GET" && request.url().includes("revision-targets"), { timeout: 30_000 });
    await staleRestart.click();
    await proactiveGet;
    const staleModal = page.getByRole("dialog", { name: "建立進版工作" });
    await staleModal.waitFor({ state: "visible", timeout: 30_000 });
    const recoveredTarget = staleModal.locator(".canonical-revision-targets label:not(.is-disabled)").filter({ hasText: "研發版 2.1" }).first();
    await recoveredTarget.waitFor({ state: "visible", timeout: 30_000 });
    const previewAfter = await page.evaluate(() => {
      const node = document.querySelector(".canonical-preview-gallery");
      const box = node?.getBoundingClientRect();
      return { sameNode: window.__dev098PreviewNode === node, box: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null, scrollX, scrollY };
    });
    assert.equal(previewAfter.sameNode, true);
    assert.deepEqual(previewAfter.box, previewBefore.box);
    assert.deepEqual({ x: previewAfter.scrollX, y: previewAfter.scrollY }, { x: previewBefore.scrollX, y: previewBefore.scrollY });
    assert.equal(targetsRequests.length, 1);
    assert.equal(await staleModal.locator(".canonical-revision-recovery").count(), 0);
    recordCase("QA-098-020", "initially stale row exposes proactive restart and loads current-production targets directly", { action: "從目前量產版建立新工作", targetsGets: targetsRequests.length, previewBefore, previewAfter });

    await recoveredTarget.click();
    const recoveredCreate = await createSelectedWork(page, staleModal);
    assert.equal(recoveredCreate.body.selectionMode, "recommended");
    const recoveredWork = fixtureSnapshot().works.find((entry) => entry.target_label === "2.1");
    assert.ok(recoveredWork);
    assert.equal(recoveredWork.predecessor_revision_id, fixtureSnapshot().production.revision_id);
    assert.ok(String(recoveredCreate.body.sourceRowKey).includes(productionRowId));
    recordCase("QA-098-021", "recovery creates 2.1 strictly from current production without stale payload merge", { request: recoveredCreate.body, work: recoveredWork, production: fixtureSnapshot().production });
    await cancelWorkspace(page);
    page.off("request", trackTargets);
  } finally { await page.close(); }
}

try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(screenshotRoot, { recursive: true });
  primaryBefore = primarySnapshot();
  if (!primarySafe(primaryBefore)) throw new Error(`PRIMARY_SOURCE_INVARIANT_FAILED:${JSON.stringify(primaryBefore)}`);

  const source = new Database(primaryDbPath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(fixtureDbPath);
  } finally {
    source.close();
  }
  const copiedSnapshotCommand = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${fixtureDbPath}`], { cwd: root, encoding: "utf8" });
  if (copiedSnapshotCommand.status !== 0) throw new Error(`FIXTURE_SOURCE_SNAPSHOT_FAILED:${copiedSnapshotCommand.stderr || copiedSnapshotCommand.stdout}`);
  assert.deepEqual(JSON.parse(copiedSnapshotCommand.stdout.trim()), primaryBefore);
  if (fs.existsSync(primaryRepositoryDir)) fs.cpSync(primaryRepositoryDir, repositoryDir, { recursive: true, force: true });
  const fixturePreparation = new Database(fixtureDbPath);
  try { prepareLifecycleFixture(fixturePreparation); } finally { fixturePreparation.close(); }
  const migrationDir = path.join(evidenceRoot, "migration");
  const migration = spawnSync(process.execPath, [
    path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"),
    `--db=${fixtureDbPath}`, "--apply", "--confirm-disposable-dev-087", "--retain-unmapped-legacy",
    "--switch-canonical-only", "--expected-commit=local-dev", `--output-dir=${migrationDir}`
  ], { cwd: root, encoding: "utf8" });
  if (migration.status !== 0) throw new Error(`ISOLATED_MIGRATION_FAILED:${safeJson({ status: migration.status, stdout: migration.stdout?.slice(-3000), stderr: migration.stderr?.slice(-3000) })}`);
  const fixtureAuthority = new Database(fixtureDbPath);
  try {
    fixtureAuthority.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only',expected_commit='local-dev',schema_hash='dev090-v1',row_version=row_version+1").run();
    const identity = fixtureAuthority.prepare(`SELECT drawing.id AS drawing_id,state.id AS production_row_id,state.revision_id AS production_revision_id,revision.revision
      FROM drawings drawing JOIN canonical_workbench_states state ON state.canonical_entity_id=drawing.id AND state.company_id=drawing.company_id AND state.data_layer='drawing_production'
      JOIN drawing_revisions revision ON revision.id=state.revision_id AND revision.company_id=state.company_id
      WHERE drawing.company_id=? AND drawing.drawing_number='A0002-M01'`).get(companyId);
    if (!identity || identity.revision !== "1") throw new Error(`DEV098_PRODUCTION_1_FIXTURE_MISSING:${safeJson(identity)}`);
    fixtureDrawingId = identity.drawing_id;
    productionRowId = identity.production_row_id;
    initialProductionRevisionId = identity.production_revision_id;
    const rd = fixtureAuthority.prepare(`SELECT revision.revision FROM canonical_workbench_states state JOIN drawing_revisions revision ON revision.id=state.revision_id WHERE state.company_id=? AND state.canonical_entity_id=? AND state.data_layer='drawing_rd'`).all(companyId, fixtureDrawingId);
    if (!rd.some((row) => row.revision === "1.1")) throw new Error(`DEV098_RD_1_1_FIXTURE_MISSING:${safeJson(rd)}`);
    assert.equal(fixtureAuthority.pragma("foreign_key_check").length, 0);
  } finally { fixtureAuthority.close(); }
  fs.writeFileSync(upload2d, "DEV-098 browser 2D fixture\n", "utf8");
  fs.writeFileSync(upload3d, "DEV-098 browser 3D fixture\n", "utf8");

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  runtimeProjectRoot = path.join(root, ".tmp", `qc-dev098-runtime-project-${port}`);
  prepareRuntimeProject(runtimeProjectRoot);
  Object.assign(process.env, {
    NODE_ENV: "production",
    QC_NEXT_USE_WEBPACK: "1",
    PDM_AUTH_MODE: "local",
    PDM_AUTH_SECRET: "dev098-task-owned-production-runtime-secret-v1",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_BUILD_COMMIT: "local-dev",
    PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_WORKBENCH_PREVIEW_GALLERY_V1: "true",
    PDM_DRAWING_RECOGNITION_V1: "false",
    PDM_REVIEW_PACKAGE_V2_WRITE: "false",
    PDM_NEXT_DIST_DIR: ".next",
    PDM_NEXT_TSCONFIG_PATH: "tsconfig.next.json",
    PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_POSTGRES_URL: "",
    DATABASE_URL: ""
  });
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    runtimeProject: runtimeProjectRoot,
    purpose: "DEV-098 QA-098-017..024 and QA-098-029 rendered browser verification",
    port,
    owningProcessTree: "qc-dev-098-browser -> task-owned Next webpack build/start + Chromium",
    cleanupCondition: "browser closed, Next tree stopped, port released, task data and runtime project removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: taskRoot
  } }));

  console.log(`QC DEV-098 isolated build: project=${runtimeProjectRoot}; purpose=multi-page DOM stability without dev HMR; port=none; processTree=task-owned Next build; cleanup=after evidence write; PDM_DATA_DIR=${dataDir}; PDM_REPOSITORY_DIR=${repositoryDir}; mutationScope=isolated fixture only`);
  const nextCli = path.join(runtimeProjectRoot, "node_modules", "next", "dist", "bin", "next");
  const build = spawnSync(process.execPath, [nextCli, "build", "--webpack"], { cwd: runtimeProjectRoot, env: process.env, stdio: "inherit" });
  if (build.status !== 0) throw new Error(`DEV098_PRODUCTION_RUNTIME_BUILD_FAILED:${build.status}`);
  app = startNextApp(runtimeProjectRoot, "start", port);
  await waitForNextAppReady(baseUrl, app.getOutput, 120_000);
  browser = await chromium.launch({ headless: true });
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const raceOwnerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installTaskOwnedQaSession(ownerContext, "工程師");
  await installTaskOwnedQaSession(raceOwnerContext, "工程師");
  await installTaskOwnedQaSession(reviewerContext, "研發主管");
  await installTaskOwnedQaSession(viewerContext, "製造");
  await installTaskOwnedQaSession(adminContext, "系統管理員");
  await runBrowserCases(ownerContext, raceOwnerContext, reviewerContext, viewerContext, adminContext);
  await Promise.all([ownerContext.close(), raceOwnerContext.close(), reviewerContext.close(), viewerContext.close(), adminContext.close()]);
} catch (error) {
  firstFailure = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  try { await browser?.close(); } catch { /* cleanup continues */ }
  try { await stopNextApp(app?.child); } catch { /* cleanup continues */ }
  tempCleanup = await removeTaskRoot(taskRoot);
  runtimeCleanup = runtimeProjectRoot ? removeTaskOwnedWorkspaceTempDir(root, runtimeProjectRoot) : { removed: true, path: null, error: null };
  primaryAfter = primarySnapshot();
}

const unexpectedHttp = network.filter((entry) => entry.status >= 400 && !expectedHttp.some((expected) => expected.method === entry.method && entry.url.endsWith(expected.pathSuffix) && expected.status === entry.status));
const expectedConsoleErrors = consoleErrors.filter((entry) => expectedHttp.some((expected) => entry.message.includes(`status of ${expected.status}`)));
const unexpectedConsoleErrors = consoleErrors.filter((entry) => !expectedConsoleErrors.includes(entry));
const expectedRequestFailures = requestFailures.filter((entry) => {
  if (entry.failure?.errorText !== "net::ERR_ABORTED") return false;
  if (entry.url.startsWith("blob:")) return true;
  const requestUrl = new URL(entry.url);
  const pathname = requestUrl.pathname;
  const expectedRscNavigationCancel = entry.method === "GET"
    && requestUrl.searchParams.has("_rsc")
    && (pathname === "/technical-transfer" || /^\/numbering\/drawings\/[^/]+\/workspace$/u.test(pathname));
  if (expectedRscNavigationCancel) return true;
  return pathname === "/api/numbering/series-codes"
    || pathname.startsWith("/api/pdm/drawing-revision-works/")
    || pathname.startsWith("/api/pdm/review-requests/")
    || pathname.startsWith("/api/pdm/file-assets/")
    || pathname.endsWith("/recognition-session");
});
const unexpectedRequestFailures = requestFailures.filter((entry) => !expectedRequestFailures.includes(entry));
const cleanup = {
  taskRootRemoved: tempCleanup.removed,
  runtimeProjectRemoved: runtimeCleanup.removed,
  portReleased: port ? await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true) : true,
  port
};
const cleanTelemetry = unexpectedConsoleErrors.length === 0 && pageErrors.length === 0 && unexpectedRequestFailures.length === 0 && unexpectedHttp.length === 0;
if (results.has("QA-098-024") && !cleanTelemetry) {
  const existing = results.get("QA-098-024");
  results.set("QA-098-024", { ...existing, status: "FAIL", detail: { ...existing.detail, telemetry: { unexpectedConsoleErrors, pageErrors, unexpectedRequestFailures, unexpectedHttp } } });
}
const finalCaseResults = fixedCaseIds.map((id) => results.get(id) ?? { id, title: "not executed", status: "FAIL", detail: null });
const primaryUnchanged = JSON.stringify(primaryBefore) === JSON.stringify(primaryAfter);
const passed = !firstFailure && finalCaseResults.every((entry) => entry.status === "PASS") && cleanTelemetry && cleanup.taskRootRemoved && cleanup.runtimeProjectRemoved && cleanup.portReleased && primaryUnchanged;
const manifest = {
  schemaVersion: 1,
  devId: "DEV-098",
  suite: "browser",
  runner: "browser",
  runId,
  generatedAt: new Date().toISOString(),
  status: passed ? "PASS" : "FAIL",
  fixedCaseIds,
  expected: fixedCaseIds.length,
  executed: finalCaseResults.filter((entry) => entry.title !== "not executed").length,
  passed: finalCaseResults.filter((entry) => entry.status === "PASS").length,
  firstFailure,
  productionWrites: false,
  dataBoundary: { provider: "sqlite", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, primaryBefore, primaryAfter, primaryUnchanged },
  cleanup,
  telemetry: { unexpectedConsoleErrors, pageErrors, unexpectedRequestFailures, unexpectedHttp, expectedHttp, expectedConsoleErrors, expectedRequestFailures },
  caseResults: finalCaseResults
};
writeJson(path.join(evidenceRoot, "manifest.json"), manifest);
console.log(JSON.stringify({ runner: manifest.runner, status: manifest.status, passed: manifest.passed, expected: manifest.expected, firstFailure, cleanup, primaryUnchanged, telemetry: { unexpectedConsoleErrors: unexpectedConsoleErrors.length, pageErrors: pageErrors.length, unexpectedRequestFailures: unexpectedRequestFailures.length, unexpectedHttp: unexpectedHttp.length } }, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
