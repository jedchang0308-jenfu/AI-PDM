import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { restoreTrackedConfigSnapshots, stopNextProcess } from "./qc-next-tracked-config-guard.mjs";

const root = process.cwd();
const runId = crypto.randomUUID();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev048-phase1c-ui-"));
const legacyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev048-phase1c-ui-legacy-"));
const distDirRelative = `.tmp/next-qc-dev048-phase1c-ui-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const v2DistDir = `${distDir}-v2`;
const legacyDistDir = `${distDir}-legacy`;
const outputDir = path.join(root, "output", "playwright", "dev048-phase1c-qc-rerun");
const password = "DEV048-Phase1C-UI-QC";
const results = [];
const browserErrors = [];
const snapshots = new Map(
  ["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);
let app;
let v2App;
let browser;
let sequence = 0;

const users = [
  { id: "phase1c-ui-owner", displayName: "Phase1C UI Owner", email: "phase1c.ui.owner@example.invalid", password, role: "Engineer", companyCodes: ["JENFU"] },
  { id: "phase1c-ui-reviewer", displayName: "Phase1C UI Reviewer", email: "phase1c.ui.reviewer@example.invalid", password, role: "R&D Manager", companyCodes: ["JENFU"] },
  { id: "phase1c-ui-admin", displayName: "Phase1C UI Admin", email: "phase1c.ui.admin@example.invalid", password, role: "Admin", companyCodes: ["JENFU"] }
];

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
}

function nextKey(label) {
  sequence += 1;
  return `phase1c:ui:${label.replace(/[^A-Za-z0-9._:/-]+/gu, "-")}:${sequence}`;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("PORT_UNAVAILABLE")));
    });
  });
}

function startApp(port, lifecycleV2Enabled, runtimeDataDir) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "managed",
      PDM_BOOTSTRAP_USERS: JSON.stringify(users),
      PDM_DATA_DIR: runtimeDataDir,
      PDM_REPOSITORY_DIR: path.join(runtimeDataDir, "repository"),
      PDM_DB_PROVIDER: "sqlite",
      PDM_RELEASE_MODE: "local_stub",
      PDM_PUBLICATION_EVIDENCE_MODE: "local_fake",
      PDM_NUMBER_STATE_FLOW_V1: "true",
      PDM_NUMBER_LIFECYCLE_V2: lifecycleV2Enabled ? "true" : "false",
      PDM_PRODUCTION_SLICE_MODE: "",
      PDM_NEXT_DIST_DIR: `${distDirRelative}-${lifecycleV2Enabled ? "v2" : "legacy"}`
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  return { child, output: () => output };
}

async function waitForApp(baseUrl) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {}
    await delay(400);
  }
  throw new Error(`SERVER_START_TIMEOUT\n${app?.output() ?? ""}`);
}

async function stopApp(target = app) {
  await stopNextProcess(target?.child);
}

async function removeTempDir(target) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch {
      await delay(300);
    }
  }
}

async function login(context, baseUrl, email) {
  const response = await context.request.post(`${baseUrl}/api/auth/login`, {
    data: { email, password }
  });
  if (!response.ok()) throw new Error(`LOGIN_FAILED:${email}:${response.status()}`);
}

async function api(context, baseUrl, input) {
  const response = await context.request.fetch(`${baseUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      "x-pdm-company-code": "JENFU",
      ...(input.key ? { "Idempotency-Key": input.key } : {}),
      ...(input.headers ?? {})
    },
    data: input.body
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`API_FAILED:${input.path}:${response.status()}:${JSON.stringify(body)}`);
  return body;
}

function rootPartBody(label) {
  return {
    draftMode: "new_bundle",
    root: { coreName: `${label} Root`, itemKind: "manufactured" },
    parts: [{ clientKey: "part-1", partName: `${label} Part`, itemKind: "manufactured" }],
    drawings: [],
    relations: []
  };
}

async function createSubmitted(ownerContext, baseUrl, label) {
  const created = await api(ownerContext, baseUrl, {
    method: "POST",
    path: "/api/numbering/draft-workspaces",
    key: nextKey(`create-${label}`),
    body: rootPartBody(label)
  });
  const acquired = await api(ownerContext, baseUrl, {
    method: "POST",
    path: `/api/numbering/draft-workspaces/${created.workspace.id}/candidate-numbers`,
    key: nextKey(`acquire-${label}`),
    body: { expectedRowVersion: created.workspace.rowVersion }
  });
  const submitted = await api(ownerContext, baseUrl, {
    method: "POST",
    path: `/api/numbering/draft-workspaces/${created.workspace.id}/submit-review`,
    key: nextKey(`submit-${label}`),
    body: { expectedRowVersion: acquired.workspace.rowVersion, reason: `${label} browser QC` }
  });
  return { workspace: submitted.workspace, requestId: submitted.requestId };
}

async function decide(reviewerContext, baseUrl, requestId, decision) {
  return api(reviewerContext, baseUrl, {
    method: "POST",
    path: `/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`,
    key: nextKey(`decision-${decision}`),
    body: { decision, comment: `browser_qc_${decision}` }
  });
}

function monitorPage(page) {
  page.on("pageerror", (error) => browserErrors.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ type: "console", message: message.text() });
  });
  page.on("response", (response) => {
    if (response.status() >= 500) browserErrors.push({ type: "network", status: response.status(), url: response.url() });
  });
}

async function openWorkspace(page, baseUrl, workspaceId, expectedText, expectedLifecycleStage) {
  await page.goto(`${baseUrl}/parts?tab=drafts&detail=${encodeURIComponent(workspaceId)}`, { waitUntil: "networkidle" });
  await page.locator('.pdm-entity-detail-drawer[data-entity-type="candidate_bundle"]').waitFor({ state: "visible" });
  if (expectedLifecycleStage) {
    await page.locator(`[data-lifecycle-v2-stage="${expectedLifecycleStage}"]`).waitFor({ state: "visible" });
  }
  if (expectedText) await page.getByText(expectedText, { exact: true }).first().waitFor({ state: "visible" });
}

async function viewportMetrics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const overflowingControls = [...document.querySelectorAll('.pdm-entity-detail-drawer[data-entity-type="candidate_bundle"] button, .pdm-entity-detail-drawer[data-entity-type="candidate_bundle"] a, .pdm-entity-detail-drawer[data-entity-type="candidate_bundle"] input, .pdm-entity-detail-drawer[data-entity-type="candidate_bundle"] select, .pdm-entity-detail-drawer[data-entity-type="candidate_bundle"] textarea')]
      .filter((element) => visible(element))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1 || element.scrollWidth > element.clientWidth + 2;
      })
      .map((element) => (element.textContent || element.getAttribute("aria-label") || element.tagName).trim().slice(0, 80));
    const visibleScrollOwners = [...document.querySelectorAll('.pdm-entity-detail-drawer[data-entity-type="candidate_bundle"], .pdm-entity-detail-drawer[data-entity-type="candidate_bundle"] *')]
      .filter((element) => visible(element))
      .filter((element) => {
        const style = getComputedStyle(element);
        return [style.overflowX, style.overflowY].some((value) => value === "auto" || value === "scroll");
      })
      .map((element) => ({
        selector: element.classList.contains("number-state-drawer-body")
          ? ".number-state-drawer-body"
          : element.className || element.tagName.toLowerCase(),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        horizontalOverflow: element.scrollWidth > element.clientWidth + 1
      }));
    const drawerBody = document.querySelector(".number-state-drawer-body");
    return {
      width: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      overflowingControls,
      visibleScrollOwners,
      drawerBody: drawerBody ? {
        clientWidth: drawerBody.clientWidth,
        scrollWidth: drawerBody.scrollWidth,
        horizontalOverflow: drawerBody.scrollWidth > drawerBody.clientWidth + 1
      } : null,
      candidateWatermarkCount: document.querySelectorAll(".number-state-candidate-watermark").length,
      dialogVisible: Boolean(document.querySelector('.pdm-entity-detail-drawer[data-entity-type="candidate_bundle"]'))
    };
  });
}

async function drawerResizeMetrics(page) {
  const drawer = page.locator('.pdm-entity-detail-drawer[data-entity-type="candidate_bundle"]');
  const handle = page.getByRole("button", { name: "調整保留號明細寬度" });
  await handle.waitFor({ state: "visible" });
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("DRAWER_RESIZE_HANDLE_BOX_UNAVAILABLE");
  const beforeWidth = await drawer.evaluate((element) => element.getBoundingClientRect().width);
  const pointerY = handleBox.y + Math.min(80, Math.max(8, handleBox.height / 2));
  await page.mouse.move(handleBox.x + handleBox.width / 2, pointerY);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 - 160, pointerY, { steps: 8 });
  await page.mouse.up();
  await delay(100);
  const afterWidth = await drawer.evaluate((element) => element.getBoundingClientRect().width);
  const storedWidth = await page.evaluate(() => Number.parseInt(window.localStorage.getItem("pdm-number-state-detail-drawer-width") ?? "", 10));
  const resizingClassCleared = await page.evaluate(() => !document.body.classList.contains("pdm-drawer-resizing"));
  await page.reload({ waitUntil: "networkidle" });
  await drawer.waitFor({ state: "visible" });
  const restoredWidth = await drawer.evaluate((element) => element.getBoundingClientRect().width);
  return { beforeWidth, afterWidth, storedWidth, restoredWidth, resizingClassCleared };
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  const port = await getFreePort();
  let baseUrl = `http://127.0.0.1:${port}`;
  app = startApp(port, true, tempDir);
  v2App = app;
  await waitForApp(baseUrl);
  browser = await chromium.launch({ headless: true });
  const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const reviewer = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await login(owner, baseUrl, "phase1c.ui.owner@example.invalid");
  await login(reviewer, baseUrl, "phase1c.ui.reviewer@example.invalid");
  await login(admin, baseUrl, "phase1c.ui.admin@example.invalid");

  const publishedFlow = await createSubmitted(owner, baseUrl, "Published responsive");
  await decide(reviewer, baseUrl, publishedFlow.requestId, "approved");
  const officialResult = await api(admin, baseUrl, {
    method: "POST",
    path: `/api/numbering/draft-workspaces/${publishedFlow.workspace.id}/publish`,
    key: nextKey("publish-responsive"),
    body: {}
  });

  const ownerPage = await owner.newPage();
  monitorPage(ownerPage);
  await ownerPage.setViewportSize({ width: 1440, height: 1000 });
  await openWorkspace(ownerPage, baseUrl, publishedFlow.workspace.id, "圖料號正式；研發版核准", "official_controlled");
  await ownerPage.getByText("圖料號已正式建立；研發版已核准。", { exact: true }).waitFor({ state: "visible" });
  const officialDrawerText = await ownerPage.locator('.pdm-entity-detail-drawer[data-entity-type="candidate_bundle"]').innerText();
  record(
    "UI-C-00A V2 uses the official_controlled projection and controlled wording instead of legacy release wording",
    officialResult.workspace?.lifecycleV2?.stage === "official_controlled" &&
      officialDrawerText.includes("圖料號正式；研發版核准") &&
      !officialDrawerText.includes("Released") &&
      !officialDrawerText.includes("可正式使用"),
    { lifecycleStage: officialResult.workspace?.lifecycleV2?.stage }
  );
  const resizeMetrics = await drawerResizeMetrics(ownerPage);
  await ownerPage.screenshot({ path: path.join(outputDir, "drawer-resized-1440.png"), fullPage: true });
  record(
    "UI-C-000 reserved-number drawer resizes by drag and restores the remembered width after reload",
    resizeMetrics.afterWidth >= resizeMetrics.beforeWidth + 140 &&
      Math.abs(resizeMetrics.storedWidth - resizeMetrics.afterWidth) <= 2 &&
      Math.abs(resizeMetrics.restoredWidth - resizeMetrics.afterWidth) <= 2 &&
      resizeMetrics.resizingClassCleared,
    { resizeMetrics }
  );
  const responsiveMetrics = [];
  for (const width of [1440, 1024, 768, 390, 320]) {
    await ownerPage.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    await openWorkspace(ownerPage, baseUrl, publishedFlow.workspace.id, "圖料號正式；研發版核准", "official_controlled");
    const metrics = await viewportMetrics(ownerPage);
    responsiveMetrics.push(metrics);
    await ownerPage.screenshot({ path: path.join(outputDir, `published-${width}.png`), fullPage: true });
  }
  record(
    "UI-C-001 published workspace is usable at 1440/1024/768/390/320 without candidate warning or viewport overflow",
    responsiveMetrics.every((item) => item.dialogVisible && !item.horizontalOverflow &&
      item.drawerBody && item.drawerBody.scrollWidth <= item.drawerBody.clientWidth + 1 &&
      item.candidateWatermarkCount === 0 && item.overflowingControls.length === 0),
    { responsiveMetrics }
  );

  const legacyPort = await getFreePort();
  baseUrl = `http://127.0.0.1:${legacyPort}`;
  app = startApp(legacyPort, false, legacyTempDir);
  await waitForApp(baseUrl);
  await Promise.all([
    login(owner, baseUrl, "phase1c.ui.owner@example.invalid"),
    login(reviewer, baseUrl, "phase1c.ui.reviewer@example.invalid"),
    login(admin, baseUrl, "phase1c.ui.admin@example.invalid")
  ]);

  await ownerPage.setViewportSize({ width: 1024, height: 900 });
  const withdrawFlow = await createSubmitted(owner, baseUrl, "Withdraw browser");
  await openWorkspace(ownerPage, baseUrl, withdrawFlow.workspace.id, "審核中");
  await ownerPage.getByRole("button", { name: "撤回審核" }).click();
  await ownerPage.getByRole("alertdialog").waitFor({ state: "visible" });
  await ownerPage.screenshot({ path: path.join(outputDir, "withdraw-confirmation-1024.png"), fullPage: true });
  await ownerPage.getByRole("button", { name: "確認撤回審核" }).click();
  await ownerPage.getByRole("status").filter({ hasText: "待審申請已撤回，保留號碼已解鎖，可繼續編輯。" }).waitFor({ state: "visible" });
  await ownerPage.screenshot({ path: path.join(outputDir, "withdraw-complete-1024.png"), fullPage: true });
  record("UI-C-002 owner withdrawal confirmation and recovery state are visible", true);

  const needsInfoFlow = await createSubmitted(owner, baseUrl, "Needs info browser");
  await decide(reviewer, baseUrl, needsInfoFlow.requestId, "needs_info");
  await ownerPage.setViewportSize({ width: 768, height: 900 });
  await openWorkspace(ownerPage, baseUrl, needsInfoFlow.workspace.id, "待補資料");
  await ownerPage.screenshot({ path: path.join(outputDir, "needs-info-768.png"), fullPage: true });

  const rejectedFlow = await createSubmitted(owner, baseUrl, "Rejected browser");
  await decide(reviewer, baseUrl, rejectedFlow.requestId, "rejected");
  await ownerPage.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(ownerPage, baseUrl, rejectedFlow.workspace.id, "已退回");
  await ownerPage.screenshot({ path: path.join(outputDir, "rejected-390.png"), fullPage: true });
  record("UI-C-003 needs-info and rejected projections are visible and remain draft-only", true);

  const applyFailedFlow = await createSubmitted(owner, baseUrl, "Apply failed browser");
  const db = new Database(path.join(legacyTempDir, "ai-pdm.sqlite"));
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO approval_platform_decisions (
      id, request_id, approver_role, approver_id, decision, comment, decided_at
    ) VALUES (?, ?, 'R&D Manager', 'phase1c-ui-reviewer', 'approved', 'browser forced apply failure', ?)
  `).run(`APD-${crypto.randomUUID()}`, applyFailedFlow.requestId, now);
  db.prepare(`
    UPDATE approval_platform_requests
    SET request_status = 'apply_failed', resolved_by = 'phase1c-ui-reviewer', resolved_at = ?,
        apply_status = 'failed', apply_attempts = 1, apply_error = 'CONTROLLED_BROWSER_FAULT', updated_at = ?
    WHERE id = ?
  `).run(now, now, applyFailedFlow.requestId);
  db.close();

  const reviewerPage = await reviewer.newPage();
  monitorPage(reviewerPage);
  await reviewerPage.setViewportSize({ width: 1024, height: 900 });
  await reviewerPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(applyFailedFlow.requestId)}`, { waitUntil: "networkidle" });
  await reviewerPage.getByRole("button", { name: "重試套用" }).waitFor({ state: "visible" });
  await reviewerPage.screenshot({ path: path.join(outputDir, "apply-failed-retry-1024.png"), fullPage: true });
  const [retryResponse] = await Promise.all([
    reviewerPage.waitForResponse((response) => response.url().includes(`/api/approvals/requests/${applyFailedFlow.requestId}/apply`) && response.request().method() === "POST"),
    reviewerPage.getByRole("button", { name: "重試套用" }).click()
  ]);
  await delay(500);
  const retryDb = new Database(path.join(legacyTempDir, "ai-pdm.sqlite"), { readonly: true });
  const retryFacts = retryDb.prepare("SELECT request_status, apply_status, apply_attempts FROM approval_platform_requests WHERE id = ?").get(applyFailedFlow.requestId);
  const workspaceAfterRetry = retryDb.prepare("SELECT lifecycle_status FROM numbering_draft_workspaces WHERE id = ?").get(applyFailedFlow.workspace.id);
  const promotedAfterRetry = retryDb.prepare("SELECT count(*) count FROM number_candidate_reservations WHERE workspace_id = ? AND reservation_state = 'promoted'").get(applyFailedFlow.workspace.id).count;
  retryDb.close();
  await reviewerPage.screenshot({ path: path.join(outputDir, "apply-retry-complete-1024.png"), fullPage: true });
  record(
    "UI-C-004 approval apply-failed recovery is visible and retry completes without publishing",
    retryResponse.status() === 200 && retryFacts?.request_status === "approved" && retryFacts?.apply_status === "applied" &&
      retryFacts?.apply_attempts === 2 && workspaceAfterRetry?.lifecycle_status === "active" && promotedAfterRetry === 0,
    { retryStatus: retryResponse.status(), retryFacts, workspaceAfterRetry, promotedAfterRetry }
  );

  await delay(500);
  record("UI-C-005 browser run has no console, page, or 5xx network errors", browserErrors.length === 0, { browserErrors });
  fs.writeFileSync(path.join(outputDir, "phase1c-ui-rerun-metrics.json"), JSON.stringify({ responsiveMetrics, results }, null, 2));
  fs.writeFileSync(path.join(outputDir, "phase1c-ui-rerun-browser-errors.json"), JSON.stringify(browserErrors, null, 2));
  await Promise.all([owner.close(), reviewer.close(), admin.close()]);
} catch (error) {
  record("UI-C-FIXTURE", false, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    browserErrors,
    serverTail: app?.output() ?? ""
  });
} finally {
  await browser?.close().catch(() => undefined);
  await stopApp();
  if (v2App !== app) await stopApp(v2App);
  restoreTrackedConfigSnapshots(root, snapshots);
  await removeTempDir(distDir);
  await removeTempDir(v2DistDir);
  await removeTempDir(legacyDistDir);
  await removeTempDir(tempDir);
  await removeTempDir(legacyTempDir);
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: "DEV-048 Phase 1C browser/RWD QC", passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
