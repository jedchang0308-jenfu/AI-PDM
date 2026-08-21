#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV083-${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}-${crypto.randomUUID().slice(0, 8)}`;
const outputDir = path.resolve(root, "output", "qa", "dev-083-part-relation-fullpage-workspaces", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev083-browser-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
const sourceRepositoryDir = path.join(root, "data", "repository");
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const originalEnv = new Map([
  "NODE_ENV", "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_RELEASE_MODE",
  "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_NUMBER_STATE_FLOW_V1", "PDM_NUMBER_LIFECYCLE_V2",
  "PDM_UNIFIED_ENTITY_DETAIL_V1", "PDM_UNIFIED_DRAWING_WORKBENCH_V1", "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1",
  "PDM_PRODUCTION_SLICE_MODE", "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_PUBLIC_BASE_URL"
].map((key) => [key, process.env[key]]));
const startedDistDirs = [];
const results = [];
const browserErrors = [];
const failedResponses = [];
const mutationRequests = [];
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true }
];

let fixture;
let app = null;
let browser = null;
let baseUrl = "";

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
  if (!passed) console.error(`FAIL ${id}: ${detail.error ?? JSON.stringify(detail)}`);
}

async function runCase(id, fn) {
  try {
    record(id, true, await fn());
  } catch (error) {
    record(id, false, { error: message(error) });
  }
}

function configureFixture() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDbPath);
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
  const db = new Database(fixtureDbPath);
  for (const email of ["admin@example.com", "manager@example.com", "manufacturing@example.com"]) {
    db.prepare("UPDATE users SET account_status = 'active', system_role_enabled = 1, session_invalid_before = NULL WHERE email = ?").run(email);
    db.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = ?").run(email);
  }

  let review = db.prepare(`
    SELECT candidate.workspace_id AS workspaceId, candidate.id AS candidateRevisionId,
           candidate.approval_request_id AS requestId
      FROM numbering_candidate_revision_drafts candidate
      JOIN approval_platform_requests request ON request.id = candidate.approval_request_id
     WHERE candidate.lifecycle_status = 'review_locked' AND request.request_status = 'pending'
     ORDER BY request.updated_at DESC, request.id
     LIMIT 1
  `).get();
  let restoredReview = false;
  if (!review) {
    const closedReview = db.prepare(`
      SELECT candidate.workspace_id AS workspaceId, candidate.id AS candidateRevisionId,
             candidate.approval_request_id AS requestId
        FROM numbering_candidate_revision_drafts candidate
        JOIN approval_platform_requests request ON request.id = candidate.approval_request_id
       WHERE candidate.lifecycle_status = 'promoted'
         AND request.request_status IN ('approved', 'needs_info')
       ORDER BY candidate.updated_at DESC, candidate.id
       LIMIT 1
    `).get();
    if (closedReview?.workspaceId && closedReview?.candidateRevisionId && closedReview?.requestId) {
      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare(`UPDATE approval_platform_requests SET request_status = 'pending', resolved_by = NULL, resolved_at = NULL, apply_status = 'not_ready', apply_attempts = 0, apply_error = NULL, applied_by = NULL, applied_at = NULL, updated_at = ? WHERE id = ?`).run(now, closedReview.requestId);
        db.prepare(`UPDATE numbering_candidate_revision_drafts SET lifecycle_status = 'review_locked', formal_drawing_number_id = NULL, formal_revision_package_id = NULL, promoted_at = NULL, updated_at = ? WHERE id = ?`).run(now, closedReview.candidateRevisionId);
        db.prepare(`UPDATE numbering_draft_workspaces SET lifecycle_status = 'active', published_at = NULL, published_by = NULL, updated_at = ? WHERE id = ?`).run(now, closedReview.workspaceId);
      })();
      review = closedReview;
      restoredReview = true;
    }
  }

  const candidate = db.prepare(`
    SELECT candidate.workspace_id AS workspaceId, candidate.id AS candidateRevisionId
      FROM numbering_candidate_revision_drafts candidate
      JOIN numbering_draft_workspaces workspace ON workspace.id = candidate.workspace_id
     WHERE workspace.lifecycle_status = 'active'
       AND candidate.lifecycle_status IN ('draft', 'review_locked')
     ORDER BY CASE candidate.lifecycle_status WHEN 'draft' THEN 0 ELSE 1 END, workspace.updated_at DESC, candidate.id
     LIMIT 1
  `).get();
  const part = db.prepare(`
    SELECT id, part_number AS partNumber
      FROM part_numbers
     WHERE record_status NOT IN ('Obsolete', 'Merged')
     ORDER BY updated_at DESC, id
     LIMIT 1
  `).get();
  const relation = db.prepare(`
    SELECT root.id AS rootId, root.root_code AS rootCode
      FROM part_roots root
      JOIN part_numbers part ON part.part_root_id = root.id
      JOIN drawing_part_links link ON link.part_number_id = part.id
     WHERE root.record_status NOT IN ('Obsolete', 'Merged')
     ORDER BY root.created_at, root.id
     LIMIT 1
  `).get();
  assert.ok(candidate?.workspaceId && candidate?.candidateRevisionId, "DEV-083 browser fixture needs an active candidate workspace");
  assert.ok(part?.id && part?.partNumber, "DEV-083 browser fixture needs a formal Part");
  assert.ok(relation?.rootId && relation?.rootCode, "DEV-083 browser fixture needs a formal Relation root");
  db.prepare("UPDATE numbering_draft_workspaces SET owner_id = 'user-admin-local-quick' WHERE id = ?").run(candidate.workspaceId);
  db.prepare("UPDATE numbering_candidate_revision_drafts SET created_by = 'user-admin-local-quick', updated_by = 'user-admin-local-quick' WHERE id = ?").run(candidate.candidateRevisionId);
  db.close();
  return {
    candidateWorkspaceId: candidate.workspaceId,
    candidateRevisionId: candidate.candidateRevisionId,
    reviewRequestId: review?.requestId ?? null,
    partId: part.id,
    partNumber: part.partNumber,
    relationRootId: relation.rootId,
    relationRootCode: relation.rootCode,
    restoredReview
  };
}

async function startServer() {
  const port = await getFreePort();
  const distDirRelative = `.tmp/qc-dev083-browser-${crypto.randomUUID()}`;
  startedDistDirs.push(path.resolve(root, ...distDirRelative.split("/")));
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "demo",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
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
    PDM_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`
  });
  baseUrl = `http://127.0.0.1:${port}`;
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
}

function attachMonitor(page, label) {
  page.on("pageerror", (error) => browserErrors.push({ label, type: "pageerror", message: message(error) }));
  page.on("console", (event) => { if (event.type() === "error") browserErrors.push({ label, type: "console", message: event.text() }); });
  page.on("response", (response) => { if (response.status() >= 500) failedResponses.push({ label, url: response.url(), status: response.status() }); });
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && !request.url().endsWith("/api/auth/login")) {
      mutationRequests.push({ label, method: request.method(), url: request.url() });
    }
  });
  page.on("requestfailed", (request) => { const failure = request.failure(); if (failure?.errorText && !failure.errorText.includes("ABORTED")) browserErrors.push({ label, type: "requestfailed", message: `${request.method()} ${request.url()} ${failure.errorText}` }); });
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  assert.equal(result.status, 200, `demo login failed: ${JSON.stringify(result.body)}`);
}

async function waitForDrawer(page) {
  const drawer = page.locator("aside.pdm-entity-detail-drawer");
  await drawer.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(350);
  return drawer;
}

async function inspectNoWriteDrawer(page, drawer, label, ownerFragment) {
  await drawer.locator(`a[href*="${ownerFragment}"]`).first().waitFor({ state: "visible", timeout: 20000 });
  const controls = await drawer.locator("form,input,select,textarea,[type=file]").count();
  assert.equal(controls, 0, `${label}: drawer must not expose form controls`);
  const dangerous = await drawer.locator("button,a").evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").trim()).filter((text) => /儲存|送交審核|撤回審核|取消申請|建立／更新|設為主要|設為參考|移除關聯|核准|退回|補資料|重試/u.test(text)));
  assert.deepEqual(dangerous, [], `${label}: drawer exposes write or reviewer controls: ${dangerous.join("、")}`);
  const links = await drawer.locator("a").evaluateAll((nodes) => nodes.map((node) => ({ text: (node.textContent ?? "").trim(), href: node.getAttribute("href") ?? "" })));
  assert.ok(links.some((link) => link.href.includes(ownerFragment)), `${label}: canonical owner link missing (${ownerFragment})`);
  const primaryActions = await drawer.locator(".unified-pdm-action-bar .primary-button").count();
  assert.ok(primaryActions <= 1, `${label}: drawer exposes more than one primary action (${primaryActions})`);
  const geometry = await page.evaluate(() => {
    const body = document.querySelector(".pdm-entity-drawer-body");
    const style = body ? window.getComputedStyle(body) : null;
    return {
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      drawerBody: body?.scrollHeight ?? 0,
      drawerBodyOverflowY: style?.overflowY ?? "unknown",
      drawerBodyIsScrollOwner: Boolean(body && body.scrollHeight > body.clientHeight && style && ["auto", "scroll"].includes(style.overflowY))
    };
  });
  assert.ok(geometry.scrollWidth <= geometry.viewportWidth + 1, `${label}: horizontal overflow ${geometry.scrollWidth} > ${geometry.viewportWidth}`);
  assert.equal(await drawer.locator("[role=alert]").count(), 0, `${label}: visible drawer error`);
  return { controls, links, geometry };
}

async function openDrawerCase(viewport, name, route, ownerFragment) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch });
  const page = await context.newPage();
  const label = `${viewport.name}/${name}`;
  attachMonitor(page, label);
  const mutationStart = mutationRequests.length;
  try {
    await login(page);
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const drawer = await waitForDrawer(page);
    const detail = await inspectNoWriteDrawer(page, drawer, label, ownerFragment);
    await page.screenshot({ path: path.join(screenshotDir, `${name}-${viewport.name}-drawer.png`), fullPage: true });
    assert.equal(mutationRequests.slice(mutationStart).length, 0, `${label}: drawer navigation emitted mutation request`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("aside.pdm-entity-detail-drawer"), null, { timeout: 10000 });
    assert.equal(new URL(page.url()).searchParams.has("detail"), false, `${label}: close must clear detail query`);
    return { route, ownerFragment, detail, returnUrl: page.url() };
  } finally {
    await context.close();
  }
}

async function ownerPageCase(name, route, expectControls, viewport = viewports[0]) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch });
  const page = await context.newPage();
  const label = `owner/${name}/${viewport.name}`;
  attachMonitor(page, label);
  const mutationStart = mutationRequests.length;
  try {
    await login(page);
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('[data-pdm-edit-page="true"] .pdm-edit-page-body').waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(350);
    const inputs = await page.locator('[data-pdm-edit-page="true"] input, [data-pdm-edit-page="true"] select, [data-pdm-edit-page="true"] textarea').count();
    assert.equal(inputs > 0, expectControls, `${label}: unexpected control presence (${inputs})`);
    assert.equal(await page.locator('[data-pdm-edit-page="true"] [role=alert]').count(), 0, `${label}: visible owner error`);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await page.waitForTimeout(100);
    const geometry = await page.evaluate(() => {
      const pageBody = document.querySelector(".pdm-edit-page-body");
      const dock = document.querySelector(".pdm-edit-page-action-dock");
      const cards = [...document.querySelectorAll(".pdm-edit-page-card")];
      const lastCard = cards.at(-1);
      const dockRect = dock?.getBoundingClientRect();
      const lastRect = lastCard?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyHeight: document.body.scrollHeight,
        pageBodyOverflowY: pageBody ? window.getComputedStyle(pageBody).overflowY : "unknown",
        actionDockHeight: dockRect?.height ?? 0,
        lastCardBottom: lastRect?.bottom ?? 0,
        actionDockTop: dockRect?.top ?? window.innerHeight,
        lastControlClearance: lastRect && dockRect ? dockRect.top - lastRect.bottom : 0
      };
    });
    assert.ok(geometry.scrollWidth <= geometry.viewportWidth + 1, `${label}: horizontal overflow ${geometry.scrollWidth} > ${geometry.viewportWidth}`);
    assert.ok(geometry.lastControlClearance >= -1, `${label}: action dock overlaps final content by ${Math.abs(geometry.lastControlClearance)}px`);
    await page.screenshot({ path: path.join(screenshotDir, `${name}-${viewport.name}-owner.png`), fullPage: true });
    assert.equal(mutationRequests.slice(mutationStart).length, 0, `${label}: initial owner load emitted mutation request`);
    return { route, inputs, geometry };
  } finally {
    await context.close();
  }
}

async function safeReturnCase() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "safe-return");
  const cases = [
    { route: `/parts/${encodeURIComponent(fixture.partId)}/workspace?intent=view&returnTo=${encodeURIComponent("https://evil.example/steal")}`, expectedPath: "/parts" },
    { route: `/numbering/relations/${encodeURIComponent(fixture.relationRootId)}/workspace?intent=view&returnTo=${encodeURIComponent("//evil.example")}`, expectedPath: "/numbering/search" },
    { route: `/approvals/${encodeURIComponent(fixture.reviewRequestId ?? "missing")}?returnTo=${encodeURIComponent("/parts")}`, expectedPath: "/approvals" }
  ];
  try {
    await login(page);
    const observed = [];
    for (const testCase of cases) {
      await page.goto(`${baseUrl}${testCase.route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const owner = testCase.expectedPath === "/approvals"
        ? page.locator('[data-workspace-kind="reviewer"]')
        : page.locator('[data-pdm-edit-page="true"]');
      await owner.waitFor({ state: "visible", timeout: 20000 });
      const backButton = testCase.expectedPath === "/approvals"
        ? page.getByRole("button", { name: "返回審核清單" })
        : page.getByRole("button", { name: "返回上一個工作清單" });
      await backButton.waitFor({ state: "visible", timeout: 20000 });
      await page.waitForTimeout(250);
      await backButton.evaluate((node) => { (node instanceof HTMLElement ? node : null)?.click(); });
      await page.waitForURL((url) => url.origin === baseUrl && url.pathname === testCase.expectedPath, { timeout: 20000 });
      const url = new URL(page.url());
      assert.equal(url.origin, baseUrl, "unsafe returnTo must never leave the current origin");
      assert.equal(url.pathname, testCase.expectedPath, `unsafe returnTo must fall back to ${testCase.expectedPath}`);
      observed.push({ expectedPath: testCase.expectedPath, actualPath: url.pathname });
    }
    return { observed };
  } finally {
    await context.close();
  }
}

async function navigationStateCase() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "navigation-state");
  const statePath = `/parts?view=all&query=${encodeURIComponent(fixture.partNumber)}&sortDirection=desc&history=include&layout=table`;
  const detailPath = `${statePath}&detail=${encodeURIComponent(`part:${fixture.partId}`)}`;
  try {
    await login(page);
    await page.goto(`${baseUrl}${statePath}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("[data-part-workbench-row='true']").first().waitFor({ state: "visible", timeout: 20000 });
    await page.goto(`${baseUrl}${detailPath}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForDrawer(page);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.locator("[data-part-workbench-row='true']").first().waitFor({ state: "visible", timeout: 20000 });
    const backUrl = new URL(page.url());
    assert.equal(backUrl.pathname, "/parts");
    assert.equal(backUrl.searchParams.get("query"), fixture.partNumber);
    assert.equal(backUrl.searchParams.get("sortDirection"), "desc");
    assert.equal(backUrl.searchParams.get("history"), "include");
    assert.equal(backUrl.searchParams.get("layout"), "table");
    assert.equal(backUrl.searchParams.has("detail"), false);
    await page.goForward({ waitUntil: "domcontentloaded" });
    await waitForDrawer(page);
    const forwardUrl = new URL(page.url());
    assert.equal(forwardUrl.searchParams.get("detail"), `part:${fixture.partId}`);
    return { back: backUrl.toString(), forward: forwardUrl.toString(), selectedRows: await page.locator("[data-part-workbench-row='true'].selected-row").count() };
  } finally {
    await context.close();
  }
}

async function focusAndActionOwnershipCase() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "focus-action-owner");
  try {
    await login(page);
    await page.goto(`${baseUrl}/parts?view=all`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const row = page.locator("[data-part-workbench-row='true']").first();
    await row.waitFor({ state: "visible", timeout: 20000 });
    await row.focus();
    await row.click();
    const drawer = await waitForDrawer(page);
    const primaryActions = await drawer.locator(".unified-pdm-action-bar .primary-button").count();
    assert.ok(primaryActions <= 1, `drawer must have at most one primary navigation action (${primaryActions})`);
    await drawer.locator("[data-pdm-drawer-close='true']").click();
    await page.waitForTimeout(200);
    const focusReturned = await page.evaluate(() => document.activeElement?.matches("[data-part-workbench-row='true']") ?? false);
    assert.equal(focusReturned, true, "closing drawer must restore focus to the triggering row");
    return { primaryActions, focusReturned };
  } finally {
    await context.close();
  }
}

async function failureRecoveryCase() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "failure-recovery");
  let injected = { status: 500, network: false };
  await page.route("**/api/pdm/entity-details/**", async (route) => {
    if (injected.network) return route.abort();
    const body = injected.status === 404 ? {} : { error: { code: "DEV083_RAW_INJECTED", message: "目前無法載入這筆資料，請重新整理。" } };
    await route.fulfill({ status: injected.status, contentType: "application/json", body: JSON.stringify(body) });
  });
  const observed = [];
  try {
    await login(page);
    for (const status of [401, 403, 404, 409, 500]) {
      injected = { status, network: false };
      await page.goto(`${baseUrl}/parts/${encodeURIComponent(fixture.partId)}/workspace?intent=view&returnTo=%2Fparts`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const alert = page.locator('[data-pdm-edit-page="true"] [role="alert"]');
      await alert.waitFor({ state: "visible", timeout: 20000 });
      const text = (await alert.innerText()).trim();
      assert.doesNotMatch(text, /DEV083_RAW_INJECTED|\/api\/|HTTP|stack|trace/iu, `status ${status} leaked raw technical detail`);
      observed.push({ status, text });
    }
    injected = { status: 0, network: true };
    await page.goto(`${baseUrl}/parts/${encodeURIComponent(fixture.partId)}/workspace?intent=view&returnTo=%2Fparts`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const networkAlert = page.locator('[data-pdm-edit-page="true"] [role="alert"]');
    await networkAlert.waitFor({ state: "visible", timeout: 20000 });
    const networkText = (await networkAlert.innerText()).trim();
    assert.doesNotMatch(networkText, /\/api\/|HTTP|stack|trace/iu, "network failure leaked raw technical detail");
    observed.push({ status: "network", text: networkText });
    for (let index = browserErrors.length - 1; index >= 0; index -= 1) {
      if (browserErrors[index].label === "failure-recovery") browserErrors.splice(index, 1);
    }
    for (let index = failedResponses.length - 1; index >= 0; index -= 1) {
      if (failedResponses[index].label === "failure-recovery") failedResponses.splice(index, 1);
    }
    return { observed };
  } finally {
    await context.close();
  }
}

async function noiseSweepCase() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "noise-sweep");
  const prohibited = /DEV-083|\/api\/|HTTP\s*\d{3}|stack trace|raw status/iu;
  try {
    await login(page);
    await page.goto(`${baseUrl}/parts?view=all&detail=${encodeURIComponent(`part:${fixture.partId}`)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const drawer = await waitForDrawer(page);
    const drawerText = await drawer.innerText();
    assert.doesNotMatch(drawerText, prohibited, "drawer visible text contains technical or DEV noise");
    await page.goto(`${baseUrl}/parts/${encodeURIComponent(fixture.partId)}/workspace?intent=edit&returnTo=%2Fparts`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('[data-pdm-edit-page="true"] .pdm-edit-page-body').waitFor({ state: "visible", timeout: 20000 });
    const ownerText = await page.locator('[data-pdm-edit-page="true"]').innerText();
    assert.doesNotMatch(ownerText, prohibited, "owner visible text contains technical or DEV noise");
    return { drawerCharacters: drawerText.length, ownerCharacters: ownerText.length };
  } finally {
    await context.close();
  }
}

async function unknownIntentCase() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "unknown-intent");
  try {
    await login(page);
    await page.goto(`${baseUrl}/parts/${encodeURIComponent(fixture.partId)}/workspace?intent=not-a-real-intent&returnTo=%2Fparts`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('[data-pdm-edit-page="true"]').waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await page.locator('[data-pdm-edit-page="true"] input, [data-pdm-edit-page="true"] select, [data-pdm-edit-page="true"] textarea').count(), 0, "unknown Part intent must fail closed without form controls");
    await page.goto(`${baseUrl}/numbering/relations/${encodeURIComponent(fixture.relationRootId)}/workspace?intent=unknown&returnTo=%2Fnumbering%2Fsearch`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('[data-pdm-edit-page="true"]').waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await page.locator('[data-pdm-edit-page="true"] input, [data-pdm-edit-page="true"] select, [data-pdm-edit-page="true"] textarea').count(), 0, "unknown Relation intent must fail closed without maintenance controls");
    return { part: "view-only", relation: "view-only" };
  } finally {
    await context.close();
  }
}

async function unsavedGuardCase() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "unsaved-guard");
  try {
    await login(page);
    await page.goto(`${baseUrl}/parts/${encodeURIComponent(fixture.partId)}/workspace?intent=edit&returnTo=%2Fparts`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('[data-pdm-edit-page="true"] .pdm-edit-page-body').waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(350);
    await page.locator('[data-pdm-edit-page="true"] input').first().waitFor({ state: "visible", timeout: 20000 });
    await page.locator('[data-pdm-edit-page="true"] input').first().fill("DEV083 unsaved guard");
    let dialogMessage = "";
    page.once("dialog", async (dialog) => { dialogMessage = dialog.message(); await dialog.dismiss(); });
    await page.locator('[data-pdm-edit-page="true"] header button[aria-label="返回上一個工作清單"]').click();
    await page.waitForTimeout(250);
    assert.match(dialogMessage, /尚未儲存/u, "dirty owner must ask for discard confirmation");
    assert.equal(new URL(page.url()).pathname, `/parts/${fixture.partId}/workspace`, "dismissed discard confirmation must keep the owner page");
    return { dialogMessage };
  } finally {
    await context.close();
  }
}

async function reviewerCase() {
  assert.ok(fixture.reviewRequestId, "fixture needs a reviewer request");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "reviewer");
  const mutationStart = mutationRequests.length;
  try {
    await login(page);
    const inbox = await page.evaluate(async () => {
      const response = await fetch("/api/approvals/inbox?status=active&limit=100&domain=numbering", { cache: "no-store" });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    });
    assert.equal(inbox.status, 200, `approval inbox failed: ${JSON.stringify(inbox.body)}`);
    const item = (inbox.body.items ?? []).find((entry) => entry.id === fixture.reviewRequestId);
    assert.ok(item?.ownerHref, "PDM approval item must expose ownerHref");
    assert.ok(item.ownerHref.startsWith(`/approvals/${fixture.reviewRequestId}`), `ownerHref must be exact reviewer route: ${item.ownerHref}`);
    assert.equal(item.ownerHref.includes("/numbering/search"), false, "review owner must not fall back to list route");
    await page.goto(`${baseUrl}${item.ownerHref}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('[data-workspace-kind="reviewer"] .dev079-workspace-grid').waitFor({ state: "visible", timeout: 20000 });
    const reviewerAlerts = await page.locator('[data-workspace-kind="reviewer"] [role=alert]').allTextContents();
    if (reviewerAlerts.length > 0) await page.screenshot({ path: path.join(screenshotDir, "reviewer-owner-error.png"), fullPage: true });
    assert.deepEqual(reviewerAlerts, [], `reviewer must not show visible error: ${reviewerAlerts.join(" | ")}`);
    assert.ok(await page.locator('[data-workspace-kind="reviewer"] [data-component="PartProjection"], [data-workspace-kind="reviewer"] [data-component="RelationProjection"], [data-workspace-kind="reviewer"] [data-component="DrawingProjection"]').count() > 0, "reviewer must render a server-selected PDM projection");
    assert.equal(mutationRequests.slice(mutationStart).length, 0, "reviewer load must not decide or apply automatically");
    await page.screenshot({ path: path.join(screenshotDir, "reviewer-owner-desktop.png"), fullPage: true });
    return { ownerHref: item.ownerHref, projection: await page.locator('[data-workspace-kind="reviewer"] [data-component$="Projection"]').count() };
  } finally {
    await context.close();
  }
}

async function writeEvidence() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify({
    runId,
    generatedAt: new Date().toISOString(),
    tool: "Playwright Chromium",
    fixture,
    viewports,
    server: { database: "isolated SQLite copy", featureFlag: "PDM_UNIFIED_ENTITY_DETAIL_V1=true", taskOwnedServerCleanup: "stopNextApp + tempRoot removal" },
    results,
    browserErrors,
    failedResponses,
    mutationRequests
  }, null, 2)}\n`, "utf8");
}

async function cleanup() {
  if (app) {
    await stopNextApp(app.child).catch(() => undefined);
    app = null;
  }
  if (browser) await browser.close().catch(() => undefined);
  for (const [file, contents] of trackedFiles) fs.writeFileSync(path.join(root, file), contents, "utf8");
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const distDir of startedDistDirs) {
    const resolved = path.resolve(distDir);
    const tmpRoot = path.resolve(root, ".tmp") + path.sep;
    if (resolved.startsWith(tmpRoot)) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    console.warn(`temporary browser fixture cleanup deferred: ${message(error)}`);
  }
}

try {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fixture = configureFixture();
  await startServer();
  browser = await chromium.launch({ headless: true });
  await runCase("QA-083-01/02/04 candidate drawer canonical owner", () => openDrawerCase(viewports[0], "candidate-parts", `/parts?view=all&detail=${encodeURIComponent(`candidate:${fixture.candidateWorkspaceId}`)}`, "/numbering/workspaces/"));
  await runCase("QA-083-06/07/08 Part formal drawer zero-write", () => openDrawerCase(viewports[0], "part-formal", `/parts?view=all&detail=${encodeURIComponent(`part:${fixture.partId}`)}`, `/parts/${fixture.partId}/workspace`));
  await runCase("QA-083-06/07/08 Relation formal drawer zero-write", () => openDrawerCase(viewports[0], "relation-formal", `/numbering/search?view=all&detail=${encodeURIComponent(`root:${fixture.relationRootId}`)}`, `/numbering/relations/${fixture.relationRootId}/workspace`));
  for (const viewport of viewports) {
    await runCase(`QA-083-21/22 Part drawer ${viewport.name}`, () => openDrawerCase(viewport, "part-formal", `/parts?view=all&detail=${encodeURIComponent(`part:${fixture.partId}`)}`, `/parts/${fixture.partId}/workspace`));
    await runCase(`QA-083-21/22 Relation drawer ${viewport.name}`, () => openDrawerCase(viewport, "relation-formal", `/numbering/search?view=all&detail=${encodeURIComponent(`root:${fixture.relationRootId}`)}`, `/numbering/relations/${fixture.relationRootId}/workspace`));
  }
  await runCase("QA-083-11 candidate owner editor", () => ownerPageCase("candidate", `/numbering/workspaces/${fixture.candidateWorkspaceId}?intent=edit&returnTo=%2Fparts`, true));
  await runCase("QA-083-12 Part owner editor", () => ownerPageCase("part", `/parts/${fixture.partId}/workspace?intent=edit&returnTo=%2Fparts`, true));
  await runCase("QA-083-12/15/21 Part owner laptop", () => ownerPageCase("part", `/parts/${fixture.partId}/workspace?intent=edit&returnTo=%2Fparts`, true, viewports[1]));
  await runCase("QA-083-12/15/21 Part owner mobile", () => ownerPageCase("part", `/parts/${fixture.partId}/workspace?intent=edit&returnTo=%2Fparts`, true, viewports[2]));
  await runCase("QA-083-13 Relation owner editor", () => ownerPageCase("relation", `/numbering/relations/${fixture.relationRootId}/workspace?intent=manage_relation&returnTo=%2Fnumbering%2Fsearch`, true));
  await runCase("QA-083-03 unknown intent fail closed", unknownIntentCase);
  await runCase("QA-083-04 safe return rejects unsafe targets", safeReturnCase);
  await runCase("QA-083-05 URL state back forward recovery", navigationStateCase);
  await runCase("QA-083-08/09 focus and single action owner", focusAndActionOwnershipCase);
  await runCase("QA-083-14 unsaved guard", unsavedGuardCase);
  await runCase("QA-083-20 failure recovery and redaction", failureRecoveryCase);
  await runCase("QA-083-23 visible-error and noise sweep", noiseSweepCase);
  await runCase("QA-083-16/17/18 exact reviewer owner", reviewerCase);
  await writeEvidence();
  assert.equal(browserErrors.length, 0, `browser errors observed: ${JSON.stringify(browserErrors)}`);
  assert.equal(failedResponses.length, 0, `5xx responses observed: ${JSON.stringify(failedResponses)}`);
  assert.equal(mutationRequests.length, 0, `unexpected mutation requests observed: ${JSON.stringify(mutationRequests)}`);
  const failures = results.filter((result) => !result.passed);
  assert.equal(failures.length, 0, `DEV-083 browser failures: ${JSON.stringify(failures)}`);
  console.log(`PASS DEV-083 authenticated browser matrix (${results.length} cases); evidence=${path.relative(root, outputDir)}`);
} catch (error) {
  await writeEvidence().catch(() => undefined);
  console.error(`DEV-083 browser QC failed: ${message(error)}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
