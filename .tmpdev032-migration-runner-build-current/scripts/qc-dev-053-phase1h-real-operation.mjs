#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const startedAt = new Date().toISOString();
const runId = `DEV053-PHASE1H-${startedAt.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "-")}`;
const outputDir = path.join(root, "output", "playwright", "dev053-phase1h-real-operation", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev053-phase1h-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const distDirRelative = `.tmp/q53h-${crypto.randomUUID().slice(0, 8)}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const password = "DEV053-Phase1H-Real-2026";
const fixture = {
  rootId: "dev053-h-real-root",
  drawingId: "dev053-h-real-drawing",
  rootCode: "H9001",
  drawingNumber: "H9001-M01",
  revision: "0.1"
};
const users = {
  operator: {
    id: "dev053-h-real-engineer",
    displayName: "DEV-053 Phase 1H 工程師",
    email: "dev053.phase1h.engineer@example.invalid",
    password,
    role: "Engineer",
    companyCodes: ["JENFU"]
  },
  approver: {
    id: "dev053-h-real-manager",
    displayName: "DEV-053 Phase 1H 審核者",
    email: "dev053.phase1h.manager@example.invalid",
    password,
    role: "R&D Manager",
    companyCodes: ["JENFU"]
  }
};
const results = [];
const screenshots = [];
const browserErrors = [];
const expectedBrowserErrors = [];
const failedResponses = [];
const mutatingRequests = [];
let app;
let browser;
let database;
let baseUrl = "";
let cleanupStatus = "not_started";
let expectGoneNavigation = false;

fs.mkdirSync(screenshotDir, { recursive: true });
const record = (id, passed, detail = {}) => results.push({ id, passed: Boolean(passed), detail });
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

function seedFixture() {
  const now = "2026-08-06T15:00:00.000Z";
  const files = [
    { id: "dev053-h-real-slddrw", name: `${fixture.rootCode}-M01.SLDDRW`, ext: "slddrw", category: "drawing_2d", bytes: Buffer.from("DEV053 Phase1H drawing\n") },
    { id: "dev053-h-real-sldprt", name: `${fixture.rootCode}.SLDPRT`, ext: "sldprt", category: "cad_3d", bytes: Buffer.from("DEV053 Phase1H model\n") }
  ];
  database.transaction(() => {
    database.prepare(`INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, 'Phase 1H 真實操作料件', 'manufactured', 'Active', ?, ?, ?)`)
      .run(fixture.rootId, fixture.rootCode, users.operator.id, now, now);
    database.prepare(`INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, sequence_no,
      is_primary_manufacturing, record_status, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 'M', 1, 1, 'Active', ?, ?, ?)`)
      .run(fixture.drawingId, fixture.rootId, fixture.drawingNumber, users.operator.id, now, now);

    for (let index = 1; index <= 3; index += 1) {
      const partId = `dev053-h-real-part-${index}`;
      const itemId = `dev053-h-real-item-${index}`;
      const partNumber = `${fixture.rootCode}-P0${index}`;
      database.prepare(`INSERT INTO part_numbers (
        id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, record_status, created_by, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, 'manufactured', 'Active', ?, ?, ?)`)
        .run(partId, fixture.rootId, partNumber, index, `0${index}`, `Phase 1H 料號 ${index}`, users.operator.id, now, now);
      database.prepare(`INSERT INTO items (id, company_id, part_number, part_name, created_at, updated_at)
        VALUES (?, 'company-jenfu', ?, ?, ?, ?)`)
        .run(itemId, partNumber, `Phase 1H 料號 ${index}`, now, now);
      database.prepare(`INSERT INTO drawing_part_links (
        id, drawing_number_id, part_number_id, link_type, created_by, created_at
      ) VALUES (?, ?, ?, 'primary_manufacturing', ?, ?)`)
        .run(`dev053-h-real-link-${index}`, fixture.drawingId, partId, users.operator.id, now);
      database.prepare(`INSERT INTO part_variant_attributes (
        id, part_number_id, material_code, material_label, surface_treatment, updated_by, created_at, updated_at
      ) VALUES (?, ?, 'SUS304', 'SUS304', '無', ?, ?, ?)`)
        .run(`dev053-h-real-variant-${index}`, partId, users.operator.id, now, now);
    }

    for (const file of files) {
      const storageKey = `phase1h/${file.id}-${file.name}`;
      const originalPath = path.join(repositoryDir, ...storageKey.split("/"));
      fs.mkdirSync(path.dirname(originalPath), { recursive: true });
      fs.writeFileSync(originalPath, file.bytes);
      database.prepare(`INSERT INTO file_assets (
        id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size,
        content_hash, linked_entity_type, linked_entity_id, document_category, display_name, revision,
        uploaded_by, sync_status, created_at, updated_at
      ) VALUES (?, 'local_repository', ?, ?, ?, ?, 'application/octet-stream', ?, ?,
        'drawing_number', ?, ?, ?, ?, ?, 'local_only', ?, ?)`)
        .run(file.id, originalPath, storageKey, file.name, file.ext, file.bytes.byteLength, sha(file.bytes),
          fixture.drawingId, file.category, file.name, fixture.revision, users.operator.id, now, now);
    }
  })();
}

function counts() {
  return database.prepare(`SELECT
    (SELECT COUNT(*) FROM submissions) AS submissions,
    (SELECT COUNT(*) FROM audit_logs) AS audit_logs,
    (SELECT COUNT(*) FROM numbering_task_items) AS task_rows,
    (SELECT COUNT(*) FROM numbering_notifications) AS notifications,
    (SELECT COUNT(*) FROM approval_platform_requests) AS requests,
    (SELECT COUNT(*) FROM approval_platform_events) AS events,
    (SELECT COUNT(*) FROM drawing_revision_lifecycle_workflows) AS workflows,
    (SELECT COUNT(*) FROM drawing_revision_packages WHERE drawing_number_id = '${fixture.drawingId}') AS packages,
    (SELECT COUNT(*) FROM drawing_revision_package_part_scopes scope
      JOIN drawing_revision_packages package ON package.id = scope.package_id
      WHERE package.drawing_number_id = '${fixture.drawingId}') AS scopes,
    (SELECT COUNT(*) FROM drawing_revision_package_files file
      JOIN drawing_revision_packages package ON package.id = file.package_id
      WHERE package.drawing_number_id = '${fixture.drawingId}') AS package_files
  `).get();
}

async function waitForDatabase(predicate, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("DEV053_PHASE1H_DATABASE_WAIT_TIMEOUT");
}

async function login(page, actor) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(actor.email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
    page.getByRole("button", { name: "登入", exact: true }).click()
  ]);
  await page.waitForLoadState("networkidle");
}

function monitor(page, actor) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const entry = { actor, type: "console", text: message.text().slice(0, 500) };
    if (expectGoneNavigation && entry.text.includes("410")) expectedBrowserErrors.push(entry);
    else browserErrors.push(entry);
  });
  page.on("pageerror", (error) => browserErrors.push({ actor, type: "pageerror", text: error.message.slice(0, 500) }));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method()) && url.pathname.startsWith("/api/")) {
      mutatingRequests.push({ actor, method: request.method(), path: url.pathname, idempotencyKey: Boolean(request.headers()["idempotency-key"]) });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failedResponses.push({ actor, status: response.status(), url: response.url() });
  });
}

async function capture(page, name) {
  const target = path.join(screenshotDir, name);
  await page.screenshot({ path: target, fullPage: false });
  screenshots.push(path.relative(outputDir, target).split(path.sep).join("/"));
}

async function run() {
  const resolvedData = path.resolve(dataDir);
  if (!resolvedData.startsWith(path.resolve(tempRoot) + path.sep) || resolvedData.startsWith(path.resolve(root, "data") + path.sep)) {
    throw new Error("DEV053_PHASE1H_TARGET_NOT_ISOLATED");
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
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_RELEASE_MODE: "local_stub",
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_DRAWING_REVISION_LIFECYCLE_MODE: "enforced",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_NEXT_DIST_DIR: distDirRelative,
    PDM_QC_ISOLATED_TARGET: "1"
  });

  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  for (const route of [
    "/numbering/revisions?drawingNumber=prewarm&revision=0.1",
    "/numbering/tasks",
    "/approvals",
    "/api/numbering/drawings/prewarm/submission-workbench?revision=0.1",
    "/api/numbering/drawing-revisions/submissions",
    "/api/approvals/requests/prewarm/decisions"
  ]) await fetch(`${baseUrl}${route}`, { redirect: "manual" }).catch(() => null);

  browser = await chromium.launch({ headless: true });
  const operatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const approverContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const operatorPage = await operatorContext.newPage();
  const approverPage = await approverContext.newPage();
  monitor(operatorPage, "operator");
  monitor(approverPage, "approver");
  await Promise.all([login(operatorPage, users.operator), login(approverPage, users.approver)]);
  database = new Database(databasePath);
  seedFixture();
  const baselineCounts = counts();

  await operatorPage.goto(`${baseUrl}/numbering/revisions?drawingNumber=${fixture.drawingNumber}&revision=${fixture.revision}`, { waitUntil: "networkidle" });
  await operatorPage.getByRole("heading", { name: "圖面進版", exact: false }).waitFor({ state: "visible" });
  await operatorPage.getByText("本次一起進版的料號", { exact: true }).waitFor({ state: "visible" });
  const selectedParts = await operatorPage.locator('input[name="revision-part-scope"]:checked').count();
  const selectedFiles = await operatorPage.locator('input[aria-label^="選擇 "]:checked').count();
  record("DEV053-H-REAL-001 shared revision page defaults to one drawing, all three parts and two matching files",
    selectedParts === 3 && selectedFiles === 2, { selectedParts, selectedFiles });
  await operatorPage.locator("textarea").last().fill("修正圖面尺寸標註，FFF 判定無影響");
  const submitButton = operatorPage.getByRole("button", { name: "建立送審（1 張圖・3 個料號）", exact: true });
  await submitButton.waitFor({ state: "visible" });
  await submitButton.click();
  const nextState = operatorPage.locator("[data-drawing-lifecycle-next]");
  await nextState.waitFor({ state: "visible", timeout: 20000 });
  const nextText = await nextState.innerText();
  const primaryCount = await nextState.locator(".primary-button").count();
  const legacySubmissionLinkCount = await nextState.locator('a[href^="/submissions/"]').count();
  record("DEV053-H-REAL-002 submit stays in place with one primary next step and optional withdrawal",
    nextText.includes("送審中") && nextText.includes("查看進度") && nextText.includes("撤回送審") &&
    legacySubmissionLinkCount === 0 && primaryCount === 1,
    { nextText, primaryCount, legacySubmissionLinkCount, url: operatorPage.url() });
  await capture(operatorPage, "01-submitted-one-next-step.png");

  const request = await waitForDatabase(() => database.prepare(`SELECT workflow.approval_request_id AS request_id,
      package.id AS package_id, package.lifecycle_state
    FROM drawing_revision_lifecycle_workflows workflow
    JOIN drawing_revision_packages package ON package.id = workflow.package_id
    WHERE package.drawing_number_id = ?`).get(fixture.drawingId));
  const afterSubmit = counts();
  record("DEV053-H-REAL-003 fresh submit has one native transient authority and no legacy permanent projection",
    afterSubmit.submissions === baselineCounts.submissions && afterSubmit.audit_logs === baselineCounts.audit_logs &&
    afterSubmit.task_rows === baselineCounts.task_rows && afterSubmit.notifications === baselineCounts.notifications &&
    afterSubmit.requests === 1 && afterSubmit.workflows === 1 && afterSubmit.packages === 1 && afterSubmit.scopes === 3 && afterSubmit.package_files === 2,
    { baselineCounts, afterSubmit });

  await approverPage.goto(`${baseUrl}/numbering/tasks`, { waitUntil: "networkidle" });
  await approverPage.getByText(`${fixture.drawingNumber} / rev ${fixture.revision}`, { exact: true }).waitFor({ state: "visible" });
  const taskCard = approverPage.locator("tr").filter({ hasText: `${fixture.drawingNumber} / rev ${fixture.revision}` }).first();
  const taskText = await taskCard.innerText();
  const manualCompleteCount = await taskCard.getByRole("button", { name: "完成", exact: true }).count();
  record("DEV053-H-REAL-004 reviewer task is projected and cannot be manually completed",
    taskText.includes(fixture.drawingNumber) && manualCompleteCount === 0,
    { taskText: taskText.slice(0, 500), manualCompleteCount, taskRows: counts().task_rows });
  await capture(approverPage, "02-projected-reviewer-task.png");

  const reviewUrl = `${baseUrl}/approvals?requestId=${encodeURIComponent(request.request_id)}&drawing=${encodeURIComponent(fixture.drawingNumber)}`;
  await approverPage.goto(reviewUrl, { waitUntil: "networkidle" });
  await approverPage.getByRole("heading", { name: "審核工作台", exact: false }).waitFor({ state: "visible" });
  await approverPage.getByRole("button", { name: "核准", exact: true }).waitFor({ state: "visible" });
  const decisionBox = approverPage.locator('[aria-label="審核決策"]');
  const decisionText = await decisionBox.innerText();
  const decisionButtonLabels = (await decisionBox.getByRole("button").allTextContents()).map((value) => value.trim());
  const reasonPlaceholder = await decisionBox.locator("textarea").getAttribute("placeholder");
  const traceCount = await approverPage.locator(".approval-trace-details, [data-approval-audit-details]").count();
  record("DEV053-H-REAL-005 shared review page exposes only the compact lifecycle decision",
    JSON.stringify(decisionButtonLabels) === JSON.stringify(["退回修改", "核准"]) &&
    reasonPlaceholder === "退回說明（選填）" && traceCount === 0,
    { decisionText, decisionButtonLabels, reasonPlaceholder, traceCount });
  await capture(approverPage, "03-compact-shared-review.png");

  await approverPage.getByRole("button", { name: "核准", exact: true }).click();
  await approverPage.getByText("已核准", { exact: true }).waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
  const terminalPackage = await waitForDatabase(() => {
    const row = database.prepare(`SELECT id, lifecycle_state, status FROM drawing_revision_packages
      WHERE drawing_number_id = ? AND revision = ?`).get(fixture.drawingId, fixture.revision);
    const workflows = Number(database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_lifecycle_workflows").get().count);
    return row?.lifecycle_state === "rd_controlled" && workflows === 0 ? row : null;
  });
  const afterApproval = counts();
  record("DEV053-H-REAL-006 approval atomically keeps durable revision data and cleans all transient review data",
    terminalPackage.lifecycle_state === "rd_controlled" && afterApproval.requests === 0 && afterApproval.events === 0 &&
    afterApproval.workflows === 0 && afterApproval.packages === 1 && afterApproval.scopes === 3 && afterApproval.package_files === 2 &&
    afterApproval.submissions === baselineCounts.submissions && afterApproval.audit_logs === baselineCounts.audit_logs &&
    afterApproval.task_rows === baselineCounts.task_rows && afterApproval.notifications === baselineCounts.notifications,
    { terminalPackage, baselineCounts, afterApproval });

  expectGoneNavigation = true;
  await approverPage.goto(reviewUrl, { waitUntil: "networkidle" });
  await approverPage.waitForURL((url) => url.pathname === "/numbering/drawings", { timeout: 20000 });
  expectGoneNavigation = false;
  await approverPage.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible" });
  const finalUrl = new URL(approverPage.url());
  record("DEV053-H-REAL-007 cleaned review link redirects to the drawing latest state",
    finalUrl.searchParams.get("query") === fixture.drawingNumber && finalUrl.searchParams.get("detail") === `drawing:${fixture.drawingId}`,
    { url: approverPage.url() });
  await capture(approverPage, "04-cleaned-link-latest-drawing.png");

  record("DEV053-H-REAL-008 no browser error or HTTP 5xx was observed",
    browserErrors.length === 0 && failedResponses.length === 0,
    { browserErrors, failedResponses });
  await Promise.all([operatorContext.close(), approverContext.close()]);
}

try {
  await run();
} catch (error) {
  record("DEV053-H-REAL-RUNNER", false, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    serverTail: app?.getOutput().slice(-10000) ?? ""
  });
} finally {
  await browser?.close().catch(() => undefined);
  try { database?.close(); } catch {}
  if (app) await stopNextApp(app.child);
  for (const [file, content] of trackedFiles) fs.writeFileSync(path.join(root, file), content, "utf8");
  const safeDist = path.resolve(distDir).startsWith(path.resolve(root, ".tmp") + path.sep);
  const safeTemp = path.resolve(tempRoot).startsWith(path.resolve(os.tmpdir()) + path.sep);
  if (safeDist && safeTemp) {
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
    cleanupStatus = "removed";
  } else cleanupStatus = "refused-unsafe-target";
}

const failed = results.filter((result) => !result.passed);
const report = {
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  result: failed.length === 0 && cleanupStatus === "removed" ? "passed" : "failed",
  scope: "isolated local SQLite + isolated Next.js + real Chromium UI",
  productionConnected: false,
  productionWrites: false,
  cleanupStatus,
  gitSha: (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return "unavailable"; } })(),
  passed: results.length - failed.length,
  failed: failed.length,
  results,
  screenshots,
  browserErrors,
  expectedBrowserErrors,
  failedResponses,
  mutatingRequests
};
fs.writeFileSync(path.join(outputDir, "run-report.json"), JSON.stringify(report, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "case-results.md"), [
  "# DEV-053 Phase 1H AI real-operation results",
  "",
  `- Run: ${runId}`,
  `- Result: ${report.result}`,
  `- Isolation: local disposable SQLite/Next.js/Chromium; production connected = false`,
  `- Cleanup: ${cleanupStatus}`,
  "",
  ...results.map((result) => `- ${result.passed ? "PASS" : "FAIL"} ${result.id}`),
  ""
].join("\n"), "utf8");
console.log(JSON.stringify(report, null, 2));
if (report.result !== "passed") process.exit(1);
