#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV073-${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}-${crypto.randomUUID().slice(0, 8)}`;
const outputDir = path.resolve(root, "output", "qa", "dev-073-status-actionability", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev073-browser-"));
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepositoryDir = path.join(root, "data", "repository");
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const originalEnv = new Map([
  "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_RELEASE_MODE",
  "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_NUMBER_STATE_FLOW_V1", "PDM_NUMBER_LIFECYCLE_V2",
  "PDM_UNIFIED_ENTITY_DETAIL_V1", "PDM_UNIFIED_DRAWING_WORKBENCH_V1", "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1",
  "PDM_PRODUCTION_SLICE_MODE", "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_PUBLIC_BASE_URL"
].map((key) => [key, process.env[key]]));
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844, touch: true }
];
const cases = [];
const browserEvidence = [];
const consoleEvents = [];
const networkEvents = [];
const startedDistDirs = [];
let browser = null;
let app = null;
let baseUrl = "";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function recordCase(id, passed, detail = {}) {
  cases.push({ id, passed: Boolean(passed), detail });
  if (!passed) console.error(`FAIL ${id}: ${detail.error ?? JSON.stringify(detail)}`);
}

async function runCase(id, fn) {
  try {
    recordCase(id, true, await fn());
  } catch (error) {
    recordCase(id, false, { error: errorMessage(error) });
  }
}

function configureDatabase() {
  const dataDir = path.join(tempRoot, "data");
  const repositoryDir = path.join(dataDir, "repository");
  const databasePath = path.join(dataDir, "ai-pdm.sqlite");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(sourceDb, databasePath);
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
  const db = new Database(databasePath);
  db.prepare("UPDATE users SET account_status = 'active', system_role_enabled = 1, session_invalid_before = NULL WHERE email = ?").run("admin@example.com");
  db.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = ?").run("admin@example.com");
  const drawing = db.prepare(`
    SELECT id, drawing_number AS drawingNumber, lifecycle_state AS lifecycleState
    FROM drawings
    WHERE drawing_number = 'A0005-M01'
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get();
  assert.ok(drawing?.id, "A0005-M01 canonical drawing is required");
  assert.equal(drawing.lifecycleState, "rd_controlled", "A0005-M01 must be repaired to R&D controlled");
  const revisions = db.prepare(`
    SELECT revision, lifecycle_state AS lifecycleState
    FROM drawing_revisions
    WHERE drawing_id = ?
    ORDER BY revision
  `).all(drawing.id);
  for (const revision of ["0.2", "0.3", "0.5"]) {
    assert.equal(revisions.find((row) => row.revision === revision)?.lifecycleState, "rd_controlled", `A0005-M01 ${revision} must be R&D controlled`);
  }
  const terminalConfirmations = db.prepare(`
    SELECT COUNT(*) AS count
    FROM drawing_revision_fff_assessments assessment
    JOIN review_confirmation_events confirmation
      ON confirmation.review_id = assessment.id AND confirmation.company_id = assessment.company_id
    WHERE assessment.drawing_number_id = (SELECT id FROM drawing_numbers WHERE drawing_number = 'A0005-M01')
      AND confirmation.action IN ('confirm_bom_no_revision', 'confirm_original_part_reuse', 'approve_replacement_part_and_drawing_release')
  `).get();
  assert.ok(Number(terminalConfirmations.count) >= 3, "A0005-M01 terminal FFF evidence is required");
  const orphan = db.prepare("SELECT id, drawing_number AS drawingNumber FROM drawings WHERE drawing_number = 'A0007-M01' LIMIT 1").get();
  assert.ok(orphan?.id, "A0007-M01 orphan review fixture is required");
  db.prepare("UPDATE drawings SET lifecycle_state = 'in_review' WHERE id = ?").run(orphan.id);
  db.close();
  return {
    dataDir,
    repositoryDir,
    databasePath,
    drawingKey: `drawing:${drawing.id}`,
    orphanKey: `drawing:${orphan.id}`,
    orphan,
    drawing,
    revisions,
    terminalConfirmationCount: Number(terminalConfirmations.count)
  };
}

async function startServer(fixture) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const port = await getFreePort();
    const distDirRelative = `.tmp/qc-dev073-browser-${crypto.randomUUID()}`;
    startedDistDirs.push(path.resolve(root, ...distDirRelative.split("/")));
    baseUrl = `http://127.0.0.1:${port}`;
    Object.assign(process.env, {
      NODE_ENV: "development",
      PDM_AUTH_MODE: "demo",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: fixture.dataDir,
      PDM_REPOSITORY_DIR: fixture.repositoryDir,
      PDM_RELEASE_MODE: "local_stub",
      PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
      PDM_NUMBER_STATE_FLOW_V1: "true",
      PDM_NUMBER_LIFECYCLE_V2: "true",
      PDM_UNIFIED_ENTITY_DETAIL_V1: "true",
      PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
      PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
      PDM_PRODUCTION_SLICE_MODE: "",
      PDM_POSTGRES_URL: "",
      DATABASE_URL: "",
      PDM_NEXT_DIST_DIR: distDirRelative,
      PDM_PUBLIC_BASE_URL: baseUrl
    });
    app = startNextApp(root, "dev", port);
    try {
      await waitForNextAppReady(baseUrl, app.getOutput);
      return;
    } catch (error) {
      const output = app.getOutput();
      await stopNextApp(app.child).catch(() => undefined);
      app = null;
      const transientLock = /next-env\.d\.ts/iu.test(output) && /UNKNOWN|EBUSY|EPERM|EACCES/iu.test(output);
      if (!transientLock || attempt === 3) throw error;
      await delay(750 * attempt);
    }
  }
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  assert.equal(result.status, 200, `demo login failed: ${JSON.stringify(result.body)}`);
}

function monitor(page, label) {
  page.on("console", (entry) => {
    if (entry.type() === "error") consoleEvents.push({ label, type: "console", message: entry.text() });
  });
  page.on("pageerror", (error) => consoleEvents.push({ label, type: "pageerror", message: errorMessage(error) }));
  page.on("request", (request) => {
    if (request.method() !== "GET" && !request.url().includes("/api/auth/login")) {
      networkEvents.push({ label, type: "mutation", method: request.method(), url: request.url() });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkEvents.push({ label, type: "http_error", method: response.request().method(), status: response.status(), url: response.url() });
    }
  });
}

async function visibleErrorSweep(page, label) {
  const errors = await page.locator(".inline-error, .unified-pdm-error").evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }).map((node) => (node.textContent ?? "").trim()).filter(Boolean));
  assert.deepEqual(errors, [], `${label}: visible error surface must be empty`);
  return errors;
}

async function inspectDrawing(page, fixture, viewport) {
  const label = `A0005-${viewport.name}`;
  monitor(page, label);
  await login(page);
  await page.goto(`${baseUrl}/numbering/drawings?view=all&detail=${encodeURIComponent(fixture.drawingKey)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const drawer = page.locator('[data-component="unified-pdm-entity-detail-drawer"]');
  await drawer.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".unified-pdm-loading") && !document.querySelector(".unified-pdm-error"), null, { timeout: 30000 });
  const badge = page.locator("aside.pdm-entity-detail-drawer .human-status-badge").first();
  const status = {
    key: await badge.getAttribute("data-human-status-key"),
    phase: await badge.getAttribute("data-human-status-phase"),
    primary: await badge.getAttribute("data-human-status-primary"),
    viewerCategory: await badge.getAttribute("data-viewer-status-category")
  };
  const drawerText = (await drawer.innerText()).trim();
  const actions = await page.locator('[data-component="ContextActionBar"] [data-action-id]').evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute("data-action-id"),
    enabled: node.getAttribute("data-action-enabled") === "true",
    label: (node.textContent ?? "").trim()
  })));
  const geometry = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    drawer: (() => {
      const node = document.querySelector("aside.pdm-entity-detail-drawer");
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    })()
  }));
  assert.equal(status.key, "rd_controlled", `${label}: objective state must be R&D controlled`);
  assert.equal(status.phase, "usable", `${label}: status phase must be usable`);
  assert.equal(status.viewerCategory, "usable", `${label}: viewer status must be usable`);
  assert.ok(!status.primary?.includes("待你處理") && !drawerText.includes("待你處理"), `${label}: false responsibility label must not render`);
  assert.ok(drawerText.includes("A0005-M01"), `${label}: correct drawing must render`);
  const actionIds = actions.map((action) => action.id);
  for (const required of ["detail:drawing:create_revision", "detail:drawing:view_history", "detail:navigation:return"]) {
    assert.ok(actionIds.includes(required), `${label}: missing ${required}`);
  }
  assert.ok(!actionIds.some((id) => id?.includes("submit_review") || id?.includes("view_review") || id?.includes("withdraw_review")), `${label}: terminal review actions must not render`);
  assert.equal(geometry.documentScrollWidth > geometry.viewportWidth + 1, false, `${label}: horizontal overflow`);
  assert.ok(geometry.drawer && geometry.drawer.left >= -1 && geometry.drawer.right <= geometry.viewportWidth + 1, `${label}: drawer must stay in viewport`);
  await visibleErrorSweep(page, label);
  await page.screenshot({ path: path.join(screenshotDir, `A0005-M01-${viewport.name}.png`), fullPage: true });
  const evidence = { label, viewport, status, actions, geometry };
  browserEvidence.push(evidence);
  return evidence;
}

async function inspectOrphanRecovery(page, fixture, viewport) {
  const label = `orphan-${viewport.name}`;
  monitor(page, label);
  await login(page);
  await page.goto(`${baseUrl}/numbering/drawings?view=all&detail=${encodeURIComponent(fixture.orphanKey)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const drawer = page.locator('[data-component="unified-pdm-entity-detail-drawer"]');
  await drawer.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".unified-pdm-loading") && !document.querySelector(".unified-pdm-error"), null, { timeout: 30000 });
  const badge = page.locator("aside.pdm-entity-detail-drawer .human-status-badge").first();
  assert.equal(await badge.getAttribute("data-viewer-status-category"), "unknown", `${label}: orphan responsibility must fail closed`);
  assert.equal(await badge.getAttribute("data-human-status-primary"), "負責人待確認", `${label}: orphan label must request confirmation`);
  const control = page.locator('[data-action-id="detail:drawing:view_review"]');
  assert.equal(await control.getAttribute("aria-disabled"), "true", `${label}: recovery gateway must remain locked without a target`);
  assert.equal(await control.getAttribute("data-action-reason-code"), "PDM_ACTION_TARGET_UNAVAILABLE", `${label}: reason code must be exact`);
  const beforeUrl = page.url();
  if (viewport.touch) {
    await control.click({ force: true });
  } else if (viewport.name === "tablet") {
    await control.focus();
  } else {
    await control.hover();
    await page.waitForTimeout(360);
  }
  const tooltip = page.locator('[data-action-tooltip-for="detail:drawing:view_review"]');
  await tooltip.waitFor({ state: "visible", timeout: 3000 });
  const recovery = await tooltip.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { text: (node.textContent ?? "").trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.ok(recovery.text.includes("找不到有效的審核工作項") && recovery.text.includes("PDM 管理者"), `${label}: recovery owner and impact must be explicit`);
  assert.ok(recovery.left >= 0 && recovery.right <= recovery.viewportWidth + 1 && recovery.top >= 0 && recovery.bottom <= recovery.viewportHeight + 1, `${label}: recovery tooltip must stay in viewport`);
  assert.equal(page.url(), beforeUrl, `${label}: locked recovery gateway must not navigate`);
  await visibleErrorSweep(page, label);
  await page.screenshot({ path: path.join(screenshotDir, `orphan-recovery-${viewport.name}.png`), fullPage: true });
  const evidence = { label, viewport, status: "unknown", actionId: "detail:drawing:view_review", reasonCode: "PDM_ACTION_TARGET_UNAVAILABLE", recovery };
  browserEvidence.push(evidence);
  return evidence;
}

async function inspectApprovalInbox(page) {
  const label = "A0005-active-inbox";
  monitor(page, label);
  await login(page);
  await page.goto(`${baseUrl}/approvals`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  const body = await page.locator("body").innerText();
  assert.ok(!body.includes("A0005-M01"), "terminal A0005 confirmation must not appear in active approval inbox");
  assert.ok(!body.includes("Internal Server Error"), "approval inbox must render without a fatal error");
  await visibleErrorSweep(page, label);
  await page.screenshot({ path: path.join(screenshotDir, "approval-inbox-active.png"), fullPage: true });
  const evidence = { label, absentDrawingNumber: "A0005-M01" };
  browserEvidence.push(evidence);
  return evidence;
}

async function inspectA0005CrossPage(page) {
  const label = "A0005-cross-page";
  monitor(page, label);
  await login(page);
  await page.goto(`${baseUrl}/numbering/drawings?view=all&query=A0005-M01`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const row = page.locator("[data-drawing-workbench-row='true']").filter({ hasText: "A0005-M01" }).first();
  await row.waitFor({ state: "visible", timeout: 30000 });
  const rowText = (await row.innerText()).trim();
  assert.ok(rowText.includes("A0005-M01"), `${label}: workbench list must find A0005-M01`);
  assert.ok(rowText.includes("研發可用"), `${label}: workbench list must project the effective controlled status`);
  assert.ok(!rowText.includes("待你處理"), `${label}: workbench list must not show a phantom current-user task`);
  await row.getByRole("button", { name: "A0005-M01" }).click();
  const drawer = page.locator('[data-component="unified-pdm-entity-detail-drawer"]');
  await drawer.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".unified-pdm-loading") && !document.querySelector(".unified-pdm-error"), null, { timeout: 30000 });
  const drawerText = (await drawer.innerText()).trim();
  for (const partNumber of ["A0005-P01", "A0005-P02", "A0005-P03", "A0005-P04"]) {
    assert.ok(drawerText.includes(partNumber), `${label}: detail must show ${partNumber}`);
  }
  assert.ok(drawerText.includes("0.10"), `${label}: detail must show the current revision 0.10`);
  assert.ok(!drawerText.includes("待你處理"), `${label}: detail must not show a phantom current-user task`);
  await page.goto(`${baseUrl}/numbering/tasks?status=open`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  const taskText = await page.locator("body").innerText();
  assert.ok(!taskText.includes("A0005-M01"), `${label}: open task center must exclude terminal A0005-M01`);
  await page.goto(`${baseUrl}/approvals?status=active`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  const approvalText = await page.locator("body").innerText();
  assert.ok(!approvalText.includes("A0005-M01"), `${label}: active approval center must exclude terminal A0005-M01`);
  await visibleErrorSweep(page, label);
  await page.screenshot({ path: path.join(screenshotDir, "A0005-cross-page-approval.png"), fullPage: true });
  const evidence = { label, rowStatus: "研發可用", linkedParts: ["A0005-P01", "A0005-P02", "A0005-P03", "A0005-P04"], revision: "0.10", taskCenter: "absent", approvalCenter: "absent" };
  browserEvidence.push(evidence);
  return evidence;
}

async function cleanup() {
  if (app) await stopNextApp(app.child).catch(() => undefined);
  if (browser) await browser.close().catch(() => undefined);
  for (const [file, contents] of trackedFiles) fs.writeFileSync(path.join(root, file), contents);
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const allowedTmpRoot = path.resolve(root, ".tmp") + path.sep;
  for (const distDir of startedDistDirs) {
    const resolved = path.resolve(distDir);
    if (resolved.startsWith(allowedTmpRoot) && fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  }
  const resolvedTemp = path.resolve(tempRoot);
  if (resolvedTemp.startsWith(path.resolve(os.tmpdir()) + path.sep) && fs.existsSync(resolvedTemp)) {
    fs.rmSync(resolvedTemp, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  }
}

function writeEvidence(fixture) {
  fs.mkdirSync(outputDir, { recursive: true });
  const failed = cases.filter((item) => !item.passed);
  const manifest = {
    runId,
    generatedAt: new Date().toISOString(),
    tool: "Playwright Chromium isolated local QC",
    productionConnection: false,
    productionWrite: false,
    database: "disposable SQLite copy",
    fixture: fixture ? {
      drawingKey: fixture.drawingKey,
      drawing: fixture.drawing,
      revisions: fixture.revisions,
      terminalConfirmationCount: fixture.terminalConfirmationCount,
      orphanKey: fixture.orphanKey,
      orphan: fixture.orphan
    } : null,
    viewports,
    cases,
    P0: failed.length,
    P1: 0,
    sourceDatabaseSha256: crypto.createHash("sha256").update(fs.readFileSync(sourceDb)).digest("hex"),
    files: ["browser-evidence.json", "console-network.json", "defects.md"]
  };
  fs.writeFileSync(path.join(outputDir, "run-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "browser-evidence.json"), `${JSON.stringify(browserEvidence, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "console-network.json"), `${JSON.stringify({ consoleEvents, networkEvents }, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "defects.md"), failed.length ? `# DEV-073 defects\n\n${failed.map((item) => `- ${item.id}: ${item.detail.error}`).join("\n")}\n` : "# DEV-073 defects\n\nNo P0/P1 defects observed in this run.\n");
}

let fixture = null;
try {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fixture = configureDatabase();
  await startServer(fixture);
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    await runCase(`CAPA-BROWSER-${viewport.name}`, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: Boolean(viewport.touch), isMobile: Boolean(viewport.touch) });
      try {
        return await inspectDrawing(await context.newPage(), fixture, viewport);
      } finally {
        await context.close();
      }
    });
  }
  for (const viewport of viewports) {
    await runCase(`CAPA-BROWSER-ORPHAN-${viewport.name}`, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: Boolean(viewport.touch), isMobile: Boolean(viewport.touch) });
      try {
        return await inspectOrphanRecovery(await context.newPage(), fixture, viewport);
      } finally {
        await context.close();
      }
    });
  }
  await runCase("CAPA-BROWSER-ACTIVE-INBOX", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      return await inspectApprovalInbox(await context.newPage());
    } finally {
      await context.close();
    }
  });
  await runCase("CAPA-BROWSER-A0005-CROSS-PAGE", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      return await inspectA0005CrossPage(await context.newPage());
    } finally {
      await context.close();
    }
  });
  assert.equal(networkEvents.length, 0, `unexpected browser mutations: ${JSON.stringify(networkEvents)}`);
  assert.equal(consoleEvents.length, 0, `console/page errors: ${JSON.stringify(consoleEvents)}`);
  assert.equal(cases.filter((item) => !item.passed).length, 0, `failed cases: ${JSON.stringify(cases.filter((item) => !item.passed))}`);
} catch (error) {
  recordCase("RUN-FATAL", false, { error: errorMessage(error) });
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => recordCase("CLEANUP", false, { error: errorMessage(error) }));
  writeEvidence(fixture);
}

if (!process.exitCode) console.log(`PASS DEV-073 real-browser status/actionability matrix (${cases.length} cases); evidence=${path.relative(root, outputDir)}`);
