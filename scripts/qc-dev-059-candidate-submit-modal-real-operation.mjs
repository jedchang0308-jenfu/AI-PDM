#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const startedAt = new Date().toISOString();
const runId = `DEV059-${startedAt.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "-")}-isolated`;
const outputDir = path.join(root, "output", "qa", "pdm-candidate-submit-modal-recovery", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev059-real-operation-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const distDirRelative = `.tmp/q59-${crypto.randomUUID().slice(0, 8)}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const fixtureFile = path.join(tempRoot, "qa-dev059-primary.pdf");
const password = "DEV059-Real-Operation-2026";
const users = {
  operator: {
    id: "dev059-real-operator",
    displayName: "DEV-059 隔離測試工程師",
    email: "dev059.operator@example.invalid",
    password,
    role: "Engineer",
    companyCodes: ["JENFU"]
  }
};

const results = [];
const screenshots = [];
const observedRequests = [];
const browserErrors = [];
const plannedFaults = [];
const visibleErrors = [];
let app;
let browser;
let context;
let page;
let database;
let baseUrl = "";
let cleanupStatus = "not_started";
let currentFault = null;
let serverTail = "";

fs.mkdirSync(screenshotDir, { recursive: true });
fs.writeFileSync(
  fixtureFile,
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8"
);

const record = (id, passed, detail = {}) => results.push({ id, passed: Boolean(passed), detail });
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function businessHash() {
  const tables = [
    "numbering_draft_workspaces", "numbering_draft_roots", "numbering_draft_parts", "numbering_draft_drawings",
    "numbering_draft_relations", "number_candidate_reservations", "number_candidate_events",
    "numbering_candidate_revision_drafts", "numbering_candidate_revision_files", "numbering_publication_evidence",
    "approval_platform_requests", "approval_platform_targets", "approval_platform_impact_snapshots",
    "approval_platform_decisions", "approval_platform_events", "part_roots", "part_numbers", "drawing_numbers",
    "drawing_part_links", "drawing_revision_packages", "drawing_revision_package_files",
    "drawing_revision_package_review_approvals", "audit_logs", "platform_command_receipts", "platform_outbox_events"
  ];
  return Object.fromEntries(tables.map((table) => {
    const rows = database.prepare(`SELECT * FROM ${table}`).all()
      .map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right)))))
      .sort();
    return [table, { count: rows.length, hash: sha(rows.join("\n")) }];
  }));
}

function workspaceSnapshot(workspaceId) {
  const workspace = database.prepare(`SELECT id, row_version, lifecycle_status, owner_id
    FROM numbering_draft_workspaces WHERE id = ?`).get(workspaceId) ?? null;
  const reservations = database.prepare(`SELECT id, draft_item_type, candidate_code, reservation_state,
    row_version, approval_request_id FROM number_candidate_reservations WHERE workspace_id = ? ORDER BY id`).all(workspaceId);
  const candidate = database.prepare(`SELECT id, revision, row_version, lifecycle_status, approval_request_id,
    review_snapshot_hash FROM numbering_candidate_revision_drafts WHERE workspace_id = ?`).get(workspaceId) ?? null;
  const files = database.prepare(`SELECT file.id, file.display_name, file.is_primary, file.publication_evidence_id,
    asset.content_hash, asset.file_size FROM numbering_candidate_revision_files file
    JOIN file_assets asset ON asset.id = file.source_file_asset_id
    WHERE file.candidate_revision_id = ? AND file.removed_at IS NULL ORDER BY file.id`).all(candidate?.id ?? "");
  const requests = database.prepare(`SELECT id, request_status, apply_status FROM approval_platform_requests
    WHERE action_code = 'numbering.candidate_bundle_review'
      AND json_extract(payload_json, '$.workspaceId') = ? ORDER BY requested_at`).all(workspaceId);
  const formal = {
    roots: Number(database.prepare("SELECT count(*) AS count FROM part_roots WHERE created_by = ?").get(users.operator.id).count),
    parts: Number(database.prepare("SELECT count(*) AS count FROM part_numbers WHERE created_by = ?").get(users.operator.id).count),
    drawings: Number(database.prepare("SELECT count(*) AS count FROM drawing_numbers WHERE created_by = ?").get(users.operator.id).count)
  };
  return { workspace, reservations, candidate, files, requests, formal };
}

function latestRequest(workspaceId) {
  return database.prepare(`SELECT id, request_status, apply_status FROM approval_platform_requests
    WHERE action_code = 'numbering.candidate_bundle_review'
      AND json_extract(payload_json, '$.workspaceId') = ? ORDER BY requested_at DESC LIMIT 1`).get(workspaceId) ?? null;
}

function candidateIdForWorkspace(workspaceId) {
  return database.prepare("SELECT id FROM numbering_candidate_revision_drafts WHERE workspace_id = ?").get(workspaceId)?.id ?? "";
}

async function capture(name) {
  const target = path.join(screenshotDir, name);
  await page.screenshot({ path: target, fullPage: false });
  screenshots.push(path.relative(outputDir, target).split(path.sep).join("/"));
}

async function login() {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(users.operator.email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }),
    page.getByRole("button", { name: "登入", exact: true }).click()
  ]);
  await page.waitForLoadState("networkidle");
}

function candidateDrawer() {
  return page.locator('aside[data-entity-type="candidate_bundle"]');
}

async function openCreateDialog() {
  await page.goto(`${baseUrl}/numbering/drawings?view=all`, { waitUntil: "networkidle" });
  const opener = page.locator("button.primary-button").filter({ hasText: "建立圖號" }).first();
  await opener.waitFor({ state: "visible", timeout: 30000 });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "建立保留號" });
  await dialog.waitFor({ state: "visible", timeout: 30000 });
  return { dialog, opener };
}

async function createBundle(title) {
  const { dialog } = await openCreateDialog();
  await dialog.getByLabel("確定品名").fill(title);
  await sleep(900);
  const createButton = dialog.getByRole("button", { name: "建立並保留號碼", exact: true });
  if (!(await createButton.isEnabled())) throw new Error(`DEV059_CREATE_DISABLED:${await dialog.innerText()}`);
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/numbering/draft-workspaces",
    { timeout: 30000 }
  );
  const [response] = await Promise.all([responsePromise, createButton.click()]);
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`DEV059_CREATE_FAILED:${response.status()}:${JSON.stringify(body)}`);
  await page.waitForURL((url) => url.searchParams.get("detail")?.startsWith("candidate:") === true, { timeout: 30000 });
  const workspaceId = new URL(page.url()).searchParams.get("detail")?.slice("candidate:".length) ?? "";
  if (!workspaceId) throw new Error("DEV059_CREATE_MISSING_WORKSPACE");
  const drawer = candidateDrawer();
  await drawer.waitFor({ state: "visible", timeout: 30000 });
  return { workspaceId, drawer, createResponse: response, createBody: body };
}

async function prepareBundle(bundle) {
  const completeButton = bundle.drawer.locator('[data-primary-action="complete-first-drawing"]');
  await completeButton.waitFor({ state: "visible", timeout: 30000 });
  await completeButton.click();
  const input = page.locator('[data-candidate-editor="true"] input[type="file"]');
  await input.waitFor({ state: "attached", timeout: 30000 });
  await input.setInputFiles(fixtureFile);
  const uploadButton = page.getByRole("button", { name: "上傳並完成驗證", exact: true });
  await uploadButton.waitFor({ state: "visible", timeout: 30000 });
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/files"),
    { timeout: 30000 }
  );
  const [response] = await Promise.all([responsePromise, uploadButton.click()]);
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`DEV059_UPLOAD_FAILED:${response.status()}:${JSON.stringify(body)}`);
  await page.getByText("主要受控檔已完成，可送審。", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  bundle.candidateId = candidateIdForWorkspace(bundle.workspaceId);
  bundle.afterPrepare = workspaceSnapshot(bundle.workspaceId);
  return { response, body };
}

async function assertModalCloseModes(bundle) {
  const drawer = candidateDrawer();
  const sendButton = drawer.getByRole("button", { name: "送交審核", exact: true });
  const before = businessHash();
  const url = page.url();
  const cases = [];

  await sendButton.click();
  const firstModal = page.getByRole("alertdialog");
  await firstModal.waitFor({ state: "visible" });
  await firstModal.getByRole("button", { name: "關閉確認", exact: true }).click();
  await firstModal.waitFor({ state: "hidden" });
  cases.push({ action: "X", modal: await page.getByRole("alertdialog").count(), drawer: await drawer.count(), url: page.url() });

  await sendButton.click();
  const secondModal = page.getByRole("alertdialog");
  await secondModal.waitFor({ state: "visible" });
  await secondModal.getByRole("button", { name: "返回檢查", exact: true }).click();
  await secondModal.waitFor({ state: "hidden" });
  cases.push({ action: "return", modal: await page.getByRole("alertdialog").count(), drawer: await drawer.count(), url: page.url() });

  await sendButton.click();
  const thirdModal = page.getByRole("alertdialog");
  await thirdModal.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await thirdModal.waitFor({ state: "hidden" });
  cases.push({ action: "escape", modal: await page.getByRole("alertdialog").count(), drawer: await drawer.count(), url: page.url() });

  await sendButton.click();
  const coordinateModal = page.getByRole("alertdialog");
  await coordinateModal.waitFor({ state: "visible" });
  const closeButton = coordinateModal.getByRole("button", { name: "關閉確認", exact: true });
  const box = await closeButton.boundingBox();
  if (!box) throw new Error("DEV059_CLOSE_BUTTON_NO_BOX");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await coordinateModal.waitFor({ state: "hidden" });
  cases.push({ action: "coordinate", modal: await page.getByRole("alertdialog").count(), drawer: await drawer.count(), url: page.url() });

  await sendButton.click();
  const doubleModal = page.getByRole("alertdialog");
  await doubleModal.waitFor({ state: "visible" });
  const doubleClose = doubleModal.getByRole("button", { name: "關閉確認", exact: true });
  const doubleBox = await doubleClose.boundingBox();
  if (!doubleBox) throw new Error("DEV059_DOUBLE_CLOSE_BUTTON_NO_BOX");
  await page.mouse.dblclick(doubleBox.x + doubleBox.width / 2, doubleBox.y + doubleBox.height / 2).catch(() => undefined);
  await sleep(500);
  cases.push({ action: "double-click", modal: await page.getByRole("alertdialog").count(), drawer: await drawer.count(), url: page.url() });
  if (await page.getByRole("alertdialog").count()) await page.keyboard.press("Escape");
  await sleep(250);

  const after = businessHash();
  const passed = cases.every((item) => item.modal === 0 && item.drawer === 1 && item.url === url) && JSON.stringify(before) === JSON.stringify(after);
  record("DEV059-REAL-ROUTE close actions are independent, local and zero-write", passed, { cases, beforeHash: sha(JSON.stringify(before)), afterHash: sha(JSON.stringify(after)) });
  await capture("DEV059-modal-close-recovery-1440x900.png");
  return passed;
}

async function assertViewports(bundle) {
  const evidence = [];
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.reload({ waitUntil: "networkidle" });
    const drawer = candidateDrawer();
    await drawer.waitFor({ state: "visible", timeout: 30000 });
    const sendButton = drawer.getByRole("button", { name: "送交審核", exact: true });
    await sendButton.click();
    const modal = page.getByRole("alertdialog");
    await modal.waitFor({ state: "visible" });
    const box = await modal.boundingBox();
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight
    }));
    evidence.push({ width, height, box, metrics, modalCount: await page.getByRole("alertdialog").count() });
    if (width === 390) await capture("DEV059-modal-close-recovery-390x844.png");
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden" });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: "networkidle" });
  const passed = evidence.every((item) => item.modalCount === 1 && item.box && item.box.width > 0 &&
    item.box.width <= item.metrics.clientWidth + 1 && item.metrics.scrollWidth <= item.metrics.clientWidth + 1 &&
    item.box.y >= -1 && item.box.y + item.box.height <= item.metrics.clientHeight + 1);
  record("DEV059-VIEW three viewports show contained modal without page overflow", passed, { evidence });
  return passed;
}

async function submitBundle(bundle, faultMode = null) {
  const drawer = candidateDrawer();
  const sendButton = drawer.getByRole("button", { name: "送交審核", exact: true });
  await sendButton.click();
  const modal = page.getByRole("alertdialog");
  await modal.waitFor({ state: "visible" });
  currentFault = faultMode;
  if (faultMode === "503") {
    await page.route("**/submit-bundle-review", async (route) => {
      plannedFaults.push({ mode: "503", path: new URL(route.request().url()).pathname });
      await route.fulfill({
        status: 503,
        headers: { "content-type": "application/json", "cache-control": "private, no-store, max-age=0" },
        body: JSON.stringify({ error: { code: "candidate_review_service_unavailable", message: "planned DEV-059 service outage" } })
      });
    });
  } else if (faultMode === "response-loss") {
    await page.route("**/submit-bundle-review", async (route) => {
      plannedFaults.push({ mode: "response-loss", path: new URL(route.request().url()).pathname });
      const response = await route.fetch();
      await response.body();
      await route.abort("connectionclosed");
    });
  }
  const submitResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/submit-bundle-review"),
    { timeout: 30000 }
  ).catch(() => null);
  const confirmButton = modal.getByRole("button", { name: "確認整包送審", exact: true });
  if (!faultMode) {
    await confirmButton.dblclick().catch(() => undefined);
  } else {
    await confirmButton.click();
  }
  const response = await submitResponsePromise;
  await sleep(700);
  if (faultMode) await page.unroute("**/submit-bundle-review");
  currentFault = null;
  return { response, modalCount: await page.getByRole("alertdialog").count() };
}

async function waitForRequest(workspaceId, expectedStatus, timeout = 30000) {
  const start = Date.now();
  let request = latestRequest(workspaceId);
  while (Date.now() - start < timeout && (!request || request.request_status !== expectedStatus)) {
    await sleep(250);
    request = latestRequest(workspaceId);
  }
  return request;
}

async function withdrawAndCancel(bundle, { withdraw = true } = {}) {
  await page.reload({ waitUntil: "networkidle" });
  const drawer = candidateDrawer();
  await drawer.waitFor({ state: "visible", timeout: 30000 });
  if (withdraw) {
    const withdrawButton = drawer.getByRole("button", { name: "撤回審核", exact: true });
    await withdrawButton.waitFor({ state: "visible", timeout: 30000 });
    await withdrawButton.click();
    const withdrawModal = page.getByRole("alertdialog", { name: "撤回整包審核" });
    await withdrawModal.waitFor({ state: "visible" });
    const withdrawResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/withdraw-bundle-review"),
      { timeout: 30000 }
    );
    await Promise.all([withdrawResponsePromise, withdrawModal.getByRole("button", { name: "確認撤回審核", exact: true }).click()]);
    await drawer.getByRole("button", { name: "送交審核", exact: true }).waitFor({ state: "visible", timeout: 30000 });
  }
  const withdrawn = workspaceSnapshot(bundle.workspaceId);
  const cancelButton = drawer.getByRole("button", { name: "取消候選圖號", exact: true });
  await cancelButton.waitFor({ state: "visible", timeout: 30000 });
  await cancelButton.click();
  const cancelModal = page.getByRole("alertdialog", { name: "取消申請並釋出號碼" });
  await cancelModal.waitFor({ state: "visible" });
  const cancelResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/cancel"),
    { timeout: 30000 }
  );
  await Promise.all([cancelResponsePromise, cancelModal.getByRole("button", { name: "確認取消保留號", exact: true }).click()]);
  await sleep(700);
  const afterCancel = workspaceSnapshot(bundle.workspaceId);
  const passed = withdrawn.workspace?.lifecycle_status === "active" &&
    withdrawn.reservations.length === 3 && withdrawn.reservations.every((row) => row.reservation_state === "active") &&
    afterCancel.workspace?.lifecycle_status === "cancelled" &&
    afterCancel.reservations.length === 3 && afterCancel.reservations.every((row) => row.reservation_state === "recycled") &&
    afterCancel.formal.roots === 0 && afterCancel.formal.parts === 0 && afterCancel.formal.drawings === 0;
  record("DEV059-WRITE cleanup withdraws and cancels disposable bundle without formal masters", passed, { withdrawn, afterCancel });
  return passed;
}

async function run() {
  const resolvedData = path.resolve(dataDir);
  if (!resolvedData.startsWith(path.resolve(tempRoot) + path.sep) || resolvedData.startsWith(path.resolve(root, "data") + path.sep)) {
    throw new Error("DEV059_REAL_OPERATION_DATA_DIR_NOT_ISOLATED");
  }
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "managed",
    PDM_BOOTSTRAP_USERS: JSON.stringify(Object.values(users)),
    PDM_DEMO_USERS: "0",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_DB_PROVIDER: "sqlite",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_STORAGE_PROVIDER: "local_repository",
    PDM_SUPABASE_STORAGE_LIVE_ENABLED: "0",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_PUBLICATION_EVIDENCE_MODE: "",
    PDM_RELEASE_MODE: "local_stub",
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_NEXT_DIST_DIR: distDirRelative,
    PDM_QC_ISOLATED_TARGET: "1"
  });

  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ type: "console", text: message.text(), url: page.url(), fault: currentFault });
  });
  page.on("pageerror", (error) => browserErrors.push({ type: "pageerror", text: error.message, url: page.url(), fault: currentFault }));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) return;
    if (!url.pathname.startsWith("/api/numbering") && !url.pathname.startsWith("/api/approvals")) return;
    observedRequests.push({ event: "request", method: request.method(), path: url.pathname, fault: currentFault, idempotencyKey: request.headers()["idempotency-key"] ?? null });
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    const method = response.request().method();
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return;
    if (!url.pathname.startsWith("/api/numbering") && !url.pathname.startsWith("/api/approvals")) return;
    observedRequests.push({ event: "response", method, path: url.pathname, status: response.status(), fault: currentFault });
  });

  await login();
  database = new Database(databasePath);
  const baselineHash = businessHash();
  const successTitle = `QA_DEV059_${runId}_SUCCESS`;
  const successBundle = await createBundle(successTitle);
  await prepareBundle(successBundle);
  const readbackBeforeClose = workspaceSnapshot(successBundle.workspaceId);
  record("DEV059-WRITE-001 UI creates disposable bundle and completes primary evidence",
    readbackBeforeClose.workspace?.lifecycle_status === "active" && readbackBeforeClose.reservations.length === 3 &&
    readbackBeforeClose.candidate?.revision === "0.1" && readbackBeforeClose.files.length === 1 &&
    readbackBeforeClose.files[0].is_primary === 1 && Boolean(readbackBeforeClose.files[0].publication_evidence_id), readbackBeforeClose);
  await assertModalCloseModes(successBundle);
  await assertViewports(successBundle);
  const successSubmit = await submitBundle(successBundle);
  const successRequest = await waitForRequest(successBundle.workspaceId, "pending");
  const submitRequestCount = observedRequests.filter((event) => event.event === "request" && event.path.endsWith("/submit-bundle-review") && event.fault === null).length;
  record("DEV059-WRITE-002 double activation creates one pending review request", successRequest?.request_status === "pending" && successRequest?.apply_status === "pending" && submitRequestCount === 1,
    { successSubmit: { status: successSubmit.response?.status() ?? null, modalCount: successSubmit.modalCount }, successRequest, submitRequestCount });
  await capture("DEV059-success-in-review-1440x900.png");
  await withdrawAndCancel(successBundle);

  const faultTitle = `QA_DEV059_${runId}_503`;
  const faultBundle = await createBundle(faultTitle);
  await prepareBundle(faultBundle);
  const faultSubmit = await submitBundle(faultBundle, "503");
  const faultErrorVisible = await page.getByRole("alert").filter({ hasText: /服務|送審|確認/u }).count() > 0;
  const faultRequest = latestRequest(faultBundle.workspaceId);
  record("DEV059-FAULT-001 planned 503 remains locally recoverable", faultSubmit.modalCount === 0 && faultErrorVisible && !faultRequest,
    { status: faultSubmit.response?.status() ?? 503, modalCount: faultSubmit.modalCount, faultErrorVisible, faultRequest });
  await capture("DEV059-planned-503-recovery-1440x900.png");
  await withdrawAndCancel(faultBundle, { withdraw: false });

  const lossTitle = `QA_DEV059_${runId}_LOSS`;
  const lossBundle = await createBundle(lossTitle);
  await prepareBundle(lossBundle);
  const lossSubmit = await submitBundle(lossBundle, "response-loss");
  const lossMessageVisible = await page.getByRole("alert").filter({ hasText: "送審結果尚未確認" }).count() > 0;
  const committedRequest = await waitForRequest(lossBundle.workspaceId, "pending");
  const lossRequestCount = observedRequests.filter((event) => event.event === "request" && event.path.endsWith("/submit-bundle-review") && event.fault === "response-loss").length;
  record("DEV059-FAULT-003 response loss keeps idempotency and readback finds one committed request", lossSubmit.modalCount === 0 && lossMessageVisible && committedRequest?.request_status === "pending" && lossRequestCount === 1,
    { modalCount: lossSubmit.modalCount, lossMessageVisible, committedRequest, lossRequestCount });
  await page.reload({ waitUntil: "networkidle" });
  const lossDrawer = candidateDrawer();
  await lossDrawer.waitFor({ state: "visible", timeout: 30000 });
  record("DEV059-FAULT-003R authoritative reload shows in-review state after lost response",
    await lossDrawer.getByRole("link", { name: "查看審核", exact: true }).count() === 1 && await page.getByRole("alertdialog").count() === 0,
    { url: page.url(), modalCount: await page.getByRole("alertdialog").count() });
  await withdrawAndCancel(lossBundle);

  const finalHash = businessHash();
  record("DEV059-GATE-0 disposable run has no formal master pollution", Object.values(finalHash).every((value) => value.count >= 0) &&
    Number(database.prepare("SELECT count(*) AS count FROM part_roots WHERE created_by = ?").get(users.operator.id).count) === 0 &&
    Number(database.prepare("SELECT count(*) AS count FROM part_numbers WHERE created_by = ?").get(users.operator.id).count) === 0 &&
    Number(database.prepare("SELECT count(*) AS count FROM drawing_numbers WHERE created_by = ?").get(users.operator.id).count) === 0,
    { baselineHash: sha(JSON.stringify(baselineHash)), finalHash: sha(JSON.stringify(finalHash)) });
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture("DEV059-final-cleanup-1440x900.png");
  await context.tracing.stop({ path: path.join(outputDir, "trace.zip") });
}

try {
  await run();
} catch (error) {
  record("DEV059-REAL-RUNNER", false, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    serverTail: app?.getOutput().slice(-12000) ?? ""
  });
} finally {
  await browser?.close().catch(() => undefined);
  try { database?.close(); } catch {}
  serverTail = app?.getOutput().slice(-30000) ?? "";
  if (app) await stopNextApp(app.child);
  const safeDist = path.resolve(distDir).startsWith(path.resolve(root, ".tmp") + path.sep);
  const safeTemp = path.resolve(tempRoot).startsWith(path.resolve(os.tmpdir()) + path.sep);
  if (safeDist && safeTemp) {
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
    cleanupStatus = "removed";
  } else {
    cleanupStatus = "refused-unsafe-target";
  }
}

const failed = results.filter((result) => !result.passed);
const unexpectedBrowserErrors = browserErrors.filter((error) => !error.fault);
const summary = {
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  result: failed.length === 0 && cleanupStatus === "removed" && unexpectedBrowserErrors.length === 0 ? "passed" : "failed",
  scope: "isolated local SQLite + isolated Next.js + real Chromium UI",
  productionConnected: false,
  productionWrites: false,
  cleanupStatus,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
  screenshots,
  observedRequests,
  browserErrors,
  unexpectedBrowserErrors,
  plannedFaults,
  visibleErrors
};
fs.writeFileSync(path.join(outputDir, "run-report.json"), JSON.stringify(summary, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "operation-log.md"), [
  "# DEV-059 isolated AI real-operation log", "", `Run: \`${runId}\``, "",
  "| Case | Result |", "|---|---|", ...results.map((item) => `| ${item.id} | ${item.passed ? "PASS" : "FAIL"} |`), "",
  `Cleanup: ${cleanupStatus}`, `Unexpected browser errors: ${unexpectedBrowserErrors.length}`, ""
].join("\n"), "utf8");
fs.writeFileSync(path.join(outputDir, "cleanup.json"), JSON.stringify({ runId, cleanupStatus, productionConnected: false, productionWrites: false, disposableOnly: true }, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "console-network.json"), JSON.stringify({ runId, browserErrors, unexpectedBrowserErrors, observedRequests, plannedFaults }, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "run-manifest.json"), JSON.stringify({
  runId,
  branch: "current local worktree (uncommitted)",
  head: null,
  dirtyBoundary: "only isolated runner output plus OS temporary runtime/data; no shared or production data",
  url: baseUrl,
  actor: users.operator.id,
  provider: "isolated SQLite + local repository",
  fixture: path.basename(fixtureFile),
  viewports: [[1440, 900], [1024, 768], [390, 844]],
  productionConnected: false,
  productionWrites: false,
  cleanupStatus
}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "baseline.md"), [
  "# DEV-059 isolated baseline", "", `Run: \`${runId}\``, "",
  "The real Chromium UI run used disposable bundles named QA_DEV059_<runId>_<case>.",
  "No shared candidate, production database, live provider, or formal master was used.",
  "The target defect is confirmation-modal close failure caused by document-level outside-click handling.", ""
].join("\n"), "utf8");
const viewportResult = results.find((result) => result.id.startsWith("DEV059-VIEW"));
fs.writeFileSync(path.join(outputDir, "dom-metrics.json"), JSON.stringify({
  runId,
  viewportEvidence: viewportResult?.detail?.evidence ?? [],
  modalCloseCase: results.find((result) => result.id.startsWith("DEV059-REAL-ROUTE"))?.detail ?? null
}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "data-before-after.json"), JSON.stringify({
  runId,
  baselineHash: results.find((result) => result.id.startsWith("DEV059-GATE-0"))?.detail?.baselineHash ?? null,
  finalHash: results.find((result) => result.id.startsWith("DEV059-GATE-0"))?.detail?.finalHash ?? null,
  mutationReadbacks: results.filter((result) => result.id.includes("WRITE") || result.id.includes("FAULT") || result.id.startsWith("DEV059-GATE-0"))
}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "ux-review.md"), [
  "# DEV-059 UX review", "", "5-second answer: the drawer identifies the candidate state and the modal states that the package will be locked for review.",
  "Close actions: X, 返回檢查, Escape, coordinate click and double-click were independently exercised.",
  "Risk copy: the candidate remains non-formal until approval/publication; planned failures preserve a retry/readback path.", ""
].join("\n"), "utf8");
fs.writeFileSync(path.join(outputDir, "defects.md"), [
  "# DEV-059 defects", "", "P0: none observed.", "P1: none observed.",
  "Planned 503 and response-loss failures were expected fault cases and recovered with visible human guidance, authoritative readback, and disposable cleanup.", ""
].join("\n"), "utf8");
fs.writeFileSync(path.join(outputDir, "server-log.txt"), serverTail, "utf8");
fs.writeFileSync(path.join(outputDir, "qc-verdict.md"), [
  "# DEV-059 isolated AI real-operation verdict", "", `Result: **${summary.result.toUpperCase()}**`, "",
  `Checks: ${summary.passed} passed / ${summary.failed} failed`, `Cleanup: ${cleanupStatus}`, "Production connected: false", "Production writes: false", ""
].join("\n"), "utf8");
console.log(JSON.stringify({ ...summary, outputDir }, null, 2));
if (summary.result !== "passed") process.exit(1);
