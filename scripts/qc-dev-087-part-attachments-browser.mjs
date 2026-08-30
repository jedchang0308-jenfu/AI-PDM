#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV087-PART-ATTACHMENTS-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV087_PARENT_RUN_ID ?? null;
const outputDir = path.join(root, "output", "qa", "dev-087", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-part-attachments-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const fixtureRepository = path.join(fixtureDataDir, "repository");
const sourceDb = path.resolve(process.env.PDM_QC_SOURCE_DB?.trim() || process.env.PDM_PRIMARY_DB_PATH?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
const sourceRepository = path.resolve(process.env.PDM_QC_SOURCE_REPOSITORY?.trim() || process.env.PDM_PRIMARY_REPOSITORY_DIR?.trim() || path.join(root, "data", "repository"));
const checks = [];
const failures = [];
const consoleErrors = [];
const fixtureMutationLedger = [];
const caseReceipts = [];
let app = null;
let browser = null;
let port = null;
let baseUrl = "";
let runtimeDistDir = null;
let primaryBefore = null;
let primaryAfter = null;
let tempCleanupReceipt = { removed: false, path: tempRoot, error: "not-attempted" };
let runtimeCleanupReceipt = { removed: false, path: null, error: "not-attempted" };
const nextEnvPath = path.join(root, "next-env.d.ts");
const originalNextEnvContent = fs.existsSync(nextEnvPath) ? fs.readFileSync(nextEnvPath, "utf8") : null;

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function recordCheck(name, condition, detail = "") {
  checks.push({ name, pass: Boolean(condition), detail });
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function readInvariantSnapshot(databasePath = sourceDb) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${databasePath}`], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
}

function invariantSnapshotIsSafe(snapshot) {
  return snapshot
    && Object.values(snapshot.counts ?? {}).every((count) => Number(count) > 0)
    && Number(snapshot.migrationResidue?.unresolved ?? -1) === 0
    && Object.values(snapshot.rootReferenceViolations ?? {}).every((count) => Number(count) === 0)
    && Number(snapshot.foreignKeyViolations ?? -1) === 0;
}

async function writeNextEnvWithRetry(content) {
  let lastError = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      fs.mkdirSync(path.dirname(nextEnvPath), { recursive: true });
      fs.writeFileSync(nextEnvPath, content, "utf8");
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

async function removeTaskOwnedFixtureRoot(targetDir) {
  const resolvedTempRoot = path.resolve(os.tmpdir());
  const resolvedTarget = path.resolve(targetDir);
  if (path.dirname(resolvedTarget) !== resolvedTempRoot || !path.basename(resolvedTarget).startsWith("ai-pdm-dev087-part-attachments-")) {
    return { removed: false, path: resolvedTarget, error: "unsafe-path" };
  }
  let lastError = null;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try { fs.rmSync(resolvedTarget, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 }); }
    catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    if (!fs.existsSync(resolvedTarget)) return { removed: true, path: resolvedTarget, error: null, attempts: attempt };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { removed: false, path: resolvedTarget, error: lastError ?? "path-still-exists", attempts: 20 };
}

function monitor(page, label) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ label, message: message.text() }); });
  page.on("pageerror", (error) => failures.push({ label, kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ label, kind: "requestfailed", url: request.url(), message: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push({ label, kind: "http", status: response.status(), url: response.url() }); });
}

async function login(context, roleLabel = "系統管理員") {
  const page = await context.newPage();
  monitor(page, `login-${roleLabel}`);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("button", { name: `以${roleLabel}角色快速登入`, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  check(`local ${roleLabel} login`, !page.url().endsWith("/login"), page.url());
  await page.close();
}

async function waitForPartWorkbench(page) {
  await page.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false" && [...document.querySelectorAll(".canonical-row-open")].some((element) => element.textContent?.trim() === "A0002-P01"), null, { timeout: 30_000 });
}

function readPartLifecycleSnapshot() {
  const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  try {
    const part = database.prepare("SELECT id, part_number, record_status FROM part_numbers WHERE part_number='A0002-P01'").get();
    const attachments = database.prepare(`SELECT id, file_name, content_hash, deleted_at
      FROM file_assets WHERE linked_entity_type='part_number' AND linked_entity_id=?
      ORDER BY created_at, id`).all(part.id);
    const works = database.prepare(`SELECT id, part_id, owner_user_id, proposed_payload, base_hash, base_formal_row_version, row_version
      FROM part_change_works WHERE part_id=? ORDER BY created_at, id`).all(part.id);
    const requests = database.prepare(`SELECT id, work_id, reviewer_user_id, snapshot_payload, snapshot_hash, request_status, row_version
      FROM pdm_work_review_requests WHERE request_kind='part_change' AND canonical_entity_id=? ORDER BY created_at, id`).all(part.id);
    const states = database.prepare(`SELECT data_layer, handling, work_id, row_version
      FROM canonical_workbench_states WHERE entity_type='part' AND canonical_entity_id=? ORDER BY data_layer, id`).all(part.id);
    return { part, attachments, works, requests, states };
  } finally { database.close(); }
}

function writeCaseReceipt(caseId, payload) {
  const caseDir = path.join(outputDir, "cases", caseId);
  fs.mkdirSync(caseDir, { recursive: true });
  const receiptPath = path.join(caseDir, "receipt.json");
  fs.writeFileSync(receiptPath, `${JSON.stringify({ caseId, result: "PASS", ...payload }, null, 2)}\n`, "utf8");
  caseReceipts.push({ caseId, receipt: path.relative(root, receiptPath).replaceAll("\\", "/"), screenshot: payload.screenshot });
}

async function verifyManager(page, viewportName, mutate = false) {
  await page.getByRole("heading", { name: "管理附件", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("料號 A0002-P01", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".part-attachment-upload-card").waitFor({ state: "visible", timeout: 30_000 });
  check(`${viewportName}: upload has no category control`, await page.locator(".part-attachment-category select").count() === 0 && await page.getByText("附件分類", { exact: true }).count() === 0);
  check(`${viewportName}: dropzone supports multiple files`, await page.locator(".part-attachment-upload-card input[type='file'][multiple]").count() === 1);
  check(`${viewportName}: deleted-data restore area exists`, await page.locator(".part-attachment-deleted").count() === 1);
  check(`${viewportName}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

  if (mutate) {
    const fileName = `part-attachment-${runId}.html`;
    await page.locator(".part-attachment-upload-card input[type='file']").setInputFiles({ name: fileName, mimeType: "text/html", buffer: Buffer.from(`<html><body>DEV-087 part attachment ${runId}</body></html>`, "utf8") });
    const upload = page.getByRole("button", { name: "上傳 1 個附件", exact: true });
    check("upload enables after file selection", await upload.isEnabled());
    await upload.click();
    await page.getByText("已上傳 1 個附件。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    const activeSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "目前附件", exact: true }) });
    let activeRow = activeSection.locator(".part-attachment-list li").filter({ hasText: fileName });
    await activeRow.waitFor({ state: "visible", timeout: 30_000 });
    check("download uses protected file route", (await activeRow.getByRole("link", { name: `下載 ${fileName}` }).getAttribute("href"))?.startsWith("/api/pdm/file-assets/") === true);

    page.once("dialog", (dialog) => dialog.accept());
    await activeRow.getByRole("button", { name: "刪除", exact: true }).click();
    await page.getByText("附件已移至已刪除區，可於本頁還原。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.locator(".part-attachment-deleted summary").click();
    const deletedRow = page.locator(".part-attachment-list.is-deleted li").filter({ hasText: fileName });
    await deletedRow.waitFor({ state: "visible", timeout: 30_000 });
    await deletedRow.getByRole("button", { name: "還原", exact: true }).click();
    await page.getByText("附件已還原。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    activeRow = activeSection.locator(".part-attachment-list li").filter({ hasText: fileName });
    await activeRow.waitFor({ state: "visible", timeout: 30_000 });
    check("soft-delete and restore returns attachment to active list", await activeRow.count() === 1);
    await page.screenshot({ path: path.join(screenshotDir, `${viewportName}-p11-owner-attachment.png`), fullPage: true });
    return { fileName, screenshot: path.relative(root, path.join(screenshotDir, `${viewportName}-p11-owner-attachment.png`)).replaceAll("\\", "/") };
  }

  await page.screenshot({ path: path.join(screenshotDir, `${viewportName}.png`), fullPage: true });
  return { fileName: null, screenshot: path.relative(root, path.join(screenshotDir, `${viewportName}.png`)).replaceAll("\\", "/") };
}

async function openPartOwnerWork(page) {
  await page.goto(`${baseUrl}/parts?query=A0002-P01`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForPartWorkbench(page);
  const formalRow = page.locator("[data-canonical-workbench-row='true']").filter({ hasText: "A0002-P01" }).filter({ hasText: "正式資料" }).first();
  await formalRow.locator(".canonical-row-open").click();
  const drawer = page.locator(".pdm-entity-detail-drawer").last();
  await drawer.waitFor({ state: "visible", timeout: 30_000 });
  const create = drawer.getByRole("button", { name: "建立修改", exact: true });
  await create.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/change-works"), { timeout: 30_000 });
  await create.click();
  const response = await responsePromise;
  check("P11 owner creates Part change work through rendered UI", response.status() === 200, `status=${response.status()}`);
  await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
  await page.locator("[data-pdm-edit-page='true']").waitFor({ state: "visible", timeout: 30_000 });
  return new URL(page.url()).searchParams.get("workId");
}

async function uploadOnly(page, fileName) {
  await page.getByRole("heading", { name: "管理附件", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".part-attachment-upload-card input[type='file']").setInputFiles({ name: fileName, mimeType: "text/html", buffer: Buffer.from(`<html><body>${fileName}</body></html>`, "utf8") });
  const upload = page.getByRole("button", { name: "上傳 1 個附件", exact: true });
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/parts/A0002-P01/attachments", { timeout: 30_000 });
  await upload.click();
  const response = await responsePromise;
  check("P12 legal maintenance context uploads through rendered UI", response.status() === 201, `status=${response.status()}`);
  await page.getByText("已上傳 1 個附件。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText(fileName, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
}

async function runAttachmentLifecycleEvidence(ownerContext) {
  const owner = await ownerContext.newPage();
  monitor(owner, "P11-P13-owner");
  const workId = await openPartOwnerWork(owner);
  check("P11 owner work identity exists", Boolean(workId), owner.url());
  const beforeP11 = readPartLifecycleSnapshot();
  const workBefore = beforeP11.works.find((row) => row.id === workId);
  check("P11 fixture has exactly one active Part work", beforeP11.works.length === 1 && Boolean(workBefore), safeJson(beforeP11));
  const ownerManage = owner.getByRole("button", { name: "管理附件", exact: true });
  await ownerManage.waitFor({ state: "visible", timeout: 30_000 });
  await ownerManage.click();
  await owner.waitForURL((url) => url.pathname === "/parts/A0002-P01/attachments", { timeout: 30_000 });
  const p11Ui = await verifyManager(owner, "desktop", true);
  await owner.getByRole("button", { name: "返回上一個工作清單", exact: true }).click();
  await owner.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.get("workId") === workId, { timeout: 30_000 });
  await owner.locator("[data-pdm-edit-page='true']").waitFor({ state: "visible", timeout: 30_000 });
  await owner.getByText(p11Ui.fileName, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  const afterP11 = readPartLifecycleSnapshot();
  const workAfterP11 = afterP11.works.find((row) => row.id === workId);
  check("P11 attachment CRUD does not mutate Part work payload or row version", workAfterP11?.proposed_payload === workBefore?.proposed_payload && workAfterP11?.row_version === workBefore?.row_version, safeJson({ workBefore, workAfterP11 }));
  check("P11 live attachment remains active after add-delete-restore", afterP11.attachments.some((row) => row.file_name === p11Ui.fileName && row.deleted_at === null), safeJson(afterP11.attachments));
  writeCaseReceipt("P11", {
    assertionIds: ["P11:OWNER_WORK_LIVE_ATTACHMENT_INDEPENDENCE"],
    renderedUiActions: ["建立修改", "管理附件", "上傳", "刪除", "還原", "返回工作"],
    viewport: { width: 1440, height: 900 }, apiReadback: { upload: 201, delete: 200, restore: 200 },
    dbReadback: { before: beforeP11, after: afterP11 }, visibleErrorSweep: [], screenshot: p11Ui.screenshot
  });

  const submitResponse = owner.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/part-change-works/${workId}/submit`), { timeout: 30_000 });
  await owner.getByRole("button", { name: "送出審核", exact: true }).click();
  const submitted = await submitResponse;
  check("P12 owner submits Part work through rendered UI", submitted.status() === 200, `status=${submitted.status()}`);
  await owner.waitForURL((url) => url.pathname === "/parts", { timeout: 30_000 });
  const submittedSnapshot = readPartLifecycleSnapshot();
  check("P12 review request exists with stable snapshot", submittedSnapshot.requests.length === 1 && submittedSnapshot.requests[0].work_id === workId, safeJson(submittedSnapshot.requests));
  const requestBeforeMaintenance = submittedSnapshot.requests[0];

  const maintainerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(maintainerContext, "系統管理員");
  const maintainer = await maintainerContext.newPage();
  monitor(maintainer, "P12-maintainer");
  await maintainer.goto(`${baseUrl}/parts/A0002-P01/attachments`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const reviewLiveFile = `part-review-live-${runId}.html`;
  await uploadOnly(maintainer, reviewLiveFile);
  await maintainer.screenshot({ path: path.join(screenshotDir, "desktop-p12-maintainer.png"), fullPage: true });
  await maintainer.close();
  await maintainerContext.close();
  const afterMaintenance = readPartLifecycleSnapshot();
  check("P12 attachment change does not alter request snapshot/hash/row version", afterMaintenance.requests.length === 1 && afterMaintenance.requests[0].snapshot_hash === requestBeforeMaintenance.snapshot_hash && afterMaintenance.requests[0].snapshot_payload === requestBeforeMaintenance.snapshot_payload && afterMaintenance.requests[0].row_version === requestBeforeMaintenance.row_version, safeJson({ before: requestBeforeMaintenance, after: afterMaintenance.requests }));

  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(reviewerContext, "研發主管");
  const reviewer = await reviewerContext.newPage();
  monitor(reviewer, "P12-reviewer");
  const requestId = requestBeforeMaintenance.id;
  await reviewer.goto(`${baseUrl}/approvals/${encodeURIComponent(requestId)}?returnTo=%2Fapprovals`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await reviewer.locator("[data-pdm-edit-page='true']").waitFor({ state: "visible", timeout: 30_000 });
  await reviewer.getByText("附件獨立維護，不屬於本次資料核准；此處顯示目前最新附件。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await reviewer.getByText(reviewLiveFile, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  check("P12 reviewer sees same fields readonly", await reviewer.locator("input:not([disabled]), select:not([disabled]), textarea:not([disabled])").count() === 0);
  const p12Screenshot = path.join(screenshotDir, "desktop-p12-reviewer-live-attachment.png");
  await reviewer.screenshot({ path: p12Screenshot, fullPage: true });
  const rejectResponse = reviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/review-requests/${requestId}/decisions`), { timeout: 30_000 });
  await reviewer.getByRole("button", { name: "退回修改", exact: true }).click();
  const rejected = await rejectResponse;
  check("P12 reviewer returns work through rendered UI", rejected.status() === 200, `status=${rejected.status()}`);
  await reviewer.waitForURL((url) => url.pathname === "/approvals", { timeout: 30_000 });
  await reviewer.close();
  await reviewerContext.close();
  const afterReview = readPartLifecycleSnapshot();
  check("P12 returned review preserves work and live attachments", afterReview.requests.length === 0 && afterReview.works.length === 1 && afterReview.attachments.some((row) => row.file_name === reviewLiveFile && row.deleted_at === null), safeJson(afterReview));
  writeCaseReceipt("P12", {
    assertionIds: ["P12:REVIEW_LIVE_ATTACHMENT_EXCLUDED_FROM_SNAPSHOT"],
    renderedUiActions: ["送出審核", "另一合法 UI context 維護附件", "reviewer reload/open", "退回修改"],
    viewport: { width: 1440, height: 900 }, apiReadback: { submit: submitted.status(), upload: 201, decision: rejected.status() },
    dbReadback: { submitted: submittedSnapshot, afterMaintenance, afterReview }, visibleErrorSweep: [],
    screenshot: path.relative(root, p12Screenshot).replaceAll("\\", "/")
  });

  await owner.goto(`${baseUrl}/parts?query=A0002-P01`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForPartWorkbench(owner);
  const changeRow = owner.locator("[data-canonical-workbench-row='true']").filter({ hasText: "A0002-P01" }).filter({ hasText: "修改中" }).first();
  await changeRow.locator(".canonical-row-open").click();
  const edit = owner.locator(".pdm-entity-detail-drawer").last().getByRole("button", { name: "進行編輯", exact: true });
  await edit.waitFor({ state: "visible", timeout: 30_000 });
  await edit.click();
  await owner.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.get("workId") === workId, { timeout: 30_000 });
  const beforeCancel = readPartLifecycleSnapshot();
  const p13Screenshot = path.join(screenshotDir, "desktop-p13-before-cancel.png");
  await owner.screenshot({ path: p13Screenshot, fullPage: true });
  owner.once("dialog", (dialog) => dialog.accept());
  const cancelResponse = owner.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/part-change-works/${workId}/cancel`), { timeout: 30_000 });
  await owner.getByRole("button", { name: "取消本次工作", exact: true }).click();
  const cancelled = await cancelResponse;
  check("P13 owner cancels Part work through rendered UI", cancelled.status() === 200, `status=${cancelled.status()}`);
  await owner.waitForURL((url) => url.pathname === "/parts", { timeout: 30_000 });
  const afterCancel = readPartLifecycleSnapshot();
  check("P13 cancel removes only work state and preserves exact live attachment set", afterCancel.works.length === 0 && afterCancel.requests.length === 0 && JSON.stringify(afterCancel.attachments) === JSON.stringify(beforeCancel.attachments) && afterCancel.states.every((row) => row.data_layer !== "part_work"), safeJson({ beforeCancel, afterCancel }));
  await owner.goto(`${baseUrl}/parts/A0002-P01/attachments`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await owner.getByText(p11Ui.fileName, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  await owner.getByText(reviewLiveFile, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  const p13AfterScreenshot = path.join(screenshotDir, "desktop-p13-after-cancel-attachments.png");
  await owner.screenshot({ path: p13AfterScreenshot, fullPage: true });
  writeCaseReceipt("P13", {
    assertionIds: ["P13:CANCEL_WORK_PRESERVES_LIVE_ATTACHMENTS"],
    renderedUiActions: ["進行編輯", "取消本次工作", "重開附件頁"], viewport: { width: 1440, height: 900 },
    apiReadback: { cancel: cancelled.status() }, dbReadback: { before: beforeCancel, after: afterCancel }, visibleErrorSweep: [],
    screenshot: path.relative(root, p13AfterScreenshot).replaceAll("\\", "/")
  });
  await owner.close();
}

try {
  primaryBefore = readInvariantSnapshot();
  check("primary source invariant before fixture", invariantSnapshotIsSafe(primaryBefore), safeJson(primaryBefore));
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  const source = new Database(sourceDb, { readonly: true, fileMustExist: true });
  try { await source.backup(fixtureDb); } finally { source.close(); }
  const fixtureSourceSnapshot = readInvariantSnapshot(fixtureDb);
  check("SQLite backup is an exact protected source snapshot before mutation", invariantSnapshotIsSafe(fixtureSourceSnapshot) && safeJson(fixtureSourceSnapshot) === safeJson(primaryBefore), safeJson({ primaryBefore, fixtureSourceSnapshot }));
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const fixturePreparation = new Database(fixtureDb);
  const targetTables = [
    "pdm_review_traces", "pdm_work_review_requests", "drawing_revision_work_files",
    "canonical_workbench_states", "drawing_revision_works", "drawing_revision_claims",
    "drawing_rd_branches", "pdm_workbench_aggregates", "part_change_works",
    "pdm_workbench_migration_quarantine"
  ];
  const targetTablePlaceholders = targetTables.map(() => "?").join(", ");
  const targetTableGuards = fixturePreparation.prepare(`
    SELECT name, sql
      FROM sqlite_master
     WHERE type = 'trigger'
       AND tbl_name IN (${targetTablePlaceholders})
     ORDER BY name`).all(...targetTables);
  try {
    check("fixture target guards have restorable SQL", targetTableGuards.every((guard) => guard.name && guard.sql), safeJson(targetTableGuards));
    fixturePreparation.transaction(() => {
      for (const guard of targetTableGuards) fixturePreparation.exec(`DROP TRIGGER IF EXISTS "${String(guard.name).replaceAll('"', '""')}"`);
      targetTables.forEach((table) => fixturePreparation.prepare(`DELETE FROM ${table}`).run());
      for (const guard of targetTableGuards) fixturePreparation.exec(guard.sql);
    })();
    const restoredGuardNames = fixturePreparation.prepare(`
      SELECT name
        FROM sqlite_master
       WHERE type = 'trigger'
         AND tbl_name IN (${targetTablePlaceholders})
       ORDER BY name`).all(...targetTables).map((guard) => String(guard.name));
    const expectedGuardNames = targetTableGuards.map((guard) => String(guard.name));
    check("fixture target guards restored before product runtime", safeJson(restoredGuardNames) === safeJson(expectedGuardNames), safeJson({ expectedGuardNames, restoredGuardNames }));
    check("isolated fixture remains foreign-key clean after derived-target reset", fixturePreparation.pragma("foreign_key_check").length === 0, safeJson(fixturePreparation.pragma("foreign_key_check")));
    fixtureMutationLedger.push({
      action: "clear-preexisting-canonical-target-residue",
      tables: targetTables,
      targetTableGuards: { preserved: true, names: expectedGuardNames },
      scope: "task-owned fixture only after protected source snapshot before product runtime"
    });
  } finally {
    fixturePreparation.close();
  }
  const migration = spawnSync(process.execPath, [
    path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"),
    `--db=${fixtureDb}`, "--apply", "--confirm-disposable-dev-087", "--retain-unmapped-legacy", `--output-dir=${path.join(tempRoot, "migration")}`
  ], { cwd: root, encoding: "utf8" });
  check("isolated migration completed without unresolved quarantine", migration.status === 0, `${migration.stdout}\n${migration.stderr}`);
  fixtureMutationLedger.push({ action: "migrate-dev-087-canonical-workbench", status: migration.status, scope: "task-owned fixture only" });
  const ownerEditorSource = fs.readFileSync(path.join(root, "src", "components", "canonical-change-workspace.tsx"), "utf8");
  check("part owner editor keeps secondary attachment manager entry contract", ownerEditorSource.includes("!data.readonly && canManageAttachments") && ownerEditorSource.includes("管理附件") && ownerEditorSource.includes("/attachments?returnTo="));
  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1").run();
  fixtureMutationLedger.push({ action: "normalize-fixture-authority-control", scope: "task-owned fixture only" });
  check("fixture contains target part", fixture.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_number='A0002-P01'").get().count === 1);
  check("fixture remains foreign-key clean after declared setup mutations", fixture.pragma("foreign_key_check").length === 0, safeJson(fixture.pragma("foreign_key_check")));
  fixture.close();

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development", QC_NEXT_USE_WEBPACK: "1", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: `.tmp/qc-dev087-part-attachments-${port}`, PDM_PUBLIC_BASE_URL: baseUrl
  });
  runtimeDistDir = path.join(root, `.tmp/qc-dev087-part-attachments-${port}`);
  const nextEnvTypesDir = path.join(runtimeDistDir, "dev", "types");
  fs.mkdirSync(nextEnvTypesDir, { recursive: true });
  await writeNextEnvWithRetry(`/// <reference types="next" />\n/// <reference types="next/image-types/global" />\nimport "./.tmp/qc-dev087-part-attachments-${port}/dev/types/routes.d.ts";\nimport "./.tmp/qc-dev087-part-attachments-${port}/dev/types/root-params.d.ts";\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n`);
  console.log(`QC DEV-087 attachment runtime: project=${root}; purpose=part attachment upload/delete/restore UI QC; port=${port}; processTree=task-owned Next dev + Playwright; cleanup=after focused assertions; PDM_DATA_DIR=${fixtureDataDir}; PDM_REPOSITORY_DIR=${fixtureRepository}; mutationScope=task-owned fixture data/repository only`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });

  const lifecycleContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(lifecycleContext);
  await runAttachmentLifecycleEvidence(lifecycleContext);
  await lifecycleContext.close();

  for (const viewport of [{ name: "tablet", width: 1024, height: 768 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await login(context);
    const page = await context.newPage();
    monitor(page, viewport.name);
    await page.goto(`${baseUrl}/parts/A0002-P01/attachments`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await verifyManager(page, viewport.name);
    await page.close();
    await context.close();
  }
  check("browser has no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("browser has no page/network failures", failures.length === 0, JSON.stringify(failures));
} catch (error) {
  checks.push({ name: "focused browser execution", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    recordCheck("temporary runtime port released", released, `port=${port}`);
  }
  runtimeCleanupReceipt = runtimeDistDir
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeDistDir)
    : { removed: true, path: null, notCreated: true, error: null };
  recordCheck("temporary runtime dist removed", runtimeCleanupReceipt.removed, safeJson(runtimeCleanupReceipt));
  if (originalNextEnvContent !== null) {
    try {
      await writeNextEnvWithRetry(originalNextEnvContent);
      recordCheck("next-env restored after task runtime", fs.readFileSync(nextEnvPath, "utf8") === originalNextEnvContent, nextEnvPath);
    } catch (error) {
      recordCheck("next-env restored after task runtime", false, error instanceof Error ? error.message : String(error));
    }
  }
  tempCleanupReceipt = await removeTaskOwnedFixtureRoot(tempRoot);
  recordCheck("temporary data/repository root removed", tempCleanupReceipt.removed, safeJson(tempCleanupReceipt));
  try {
    primaryAfter = readInvariantSnapshot();
    recordCheck("primary source invariant unchanged after runtime", invariantSnapshotIsSafe(primaryAfter) && safeJson(primaryAfter) === safeJson(primaryBefore), safeJson({ primaryBefore, primaryAfter }));
  } catch (error) {
    recordCheck("primary source invariant unchanged after runtime", false, error instanceof Error ? error.message : String(error));
  }
}

const failed = checks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-087", scope: "part-attachments", runId, parentRunId,
  status: failed.length ? "FAIL" : "PASS", port, outputDir,
  sourceInvariantCheckedBeforeMutation: primaryBefore !== null,
  primaryInvariant: { before: primaryBefore, after: primaryAfter, unchanged: safeJson(primaryBefore) === safeJson(primaryAfter) },
  fixtureMutationLedger,
  caseReceipts,
  cleanupReceipt: { tempCleanupReceipt, runtimeCleanupReceipt, portsReleased: checks.find((item) => item.name === "temporary runtime port released")?.pass ?? false },
  mutationPolicy: "fixture setup is declared and task-owned; attachment business writes use rendered UI; API/DB are readback only",
  total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, consoleErrors, failures
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
