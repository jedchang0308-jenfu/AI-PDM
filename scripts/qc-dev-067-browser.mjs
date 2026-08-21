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
const runId = `DEV067-${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}-${crypto.randomUUID().slice(0, 8)}`;
const outputDir = path.resolve(root, "output", "playwright", "dev-067-unified-entity-detail", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev067-browser-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const results = [];
const browserErrors = [];
const failedResponses = [];
const startedDistDirs = [];
const originalEnv = new Map([
  "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_RELEASE_MODE",
  "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_NUMBER_STATE_FLOW_V1", "PDM_NUMBER_LIFECYCLE_V2",
  "PDM_UNIFIED_ENTITY_DETAIL_V1", "PDM_UNIFIED_DRAWING_WORKBENCH_V1", "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1",
  "PDM_PRODUCTION_SLICE_MODE", "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_PUBLIC_BASE_URL"
].map((key) => [key, process.env[key]]));

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 }
];

let fixture;
let app = null;
let browser = null;
let baseUrl = "";

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runCase(id, fn) {
  try {
    const detail = await fn();
    record(id, true, detail ?? {});
  } catch (error) {
    const detail = { error: errorMessage(error) };
    record(id, false, detail);
    console.error(`FAIL ${id}: ${detail.error}`);
  }
}

function configureFixtureDatabase() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDbPath);
  const sourceRepositoryDir = path.join(root, "data", "repository");
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
  const database = new Database(fixtureDbPath);
  database.prepare("UPDATE users SET account_status = 'active', system_role_enabled = 1, session_invalid_before = NULL WHERE id = 'user-admin-demo' OR email = 'admin@example.com'").run();
  database.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = 'admin@example.com'").run();
  let candidate = database.prepare(`
    SELECT c.workspace_id AS workspaceId, c.approval_request_id AS approvalRequestId,
           reservation.candidate_code AS drawingCode, root.core_name AS coreName,
           c.id AS candidateRevisionId
      FROM numbering_candidate_revision_drafts c
      JOIN number_candidate_reservations reservation ON reservation.id = c.candidate_reservation_id
      JOIN numbering_draft_roots root ON root.workspace_id = c.workspace_id
      JOIN approval_platform_requests request ON request.id = c.approval_request_id
     WHERE c.lifecycle_status = 'review_locked'
       AND request.request_status = 'pending'
     ORDER BY c.updated_at DESC, c.id
     LIMIT 1
  `).get();
  if (!candidate) {
    const closed = database.prepare(`
      SELECT c.workspace_id AS workspaceId, c.approval_request_id AS approvalRequestId,
             reservation.candidate_code AS drawingCode, root.core_name AS coreName,
             c.id AS candidateRevisionId
        FROM numbering_candidate_revision_drafts c
        JOIN number_candidate_reservations reservation ON reservation.id = c.candidate_reservation_id
        JOIN numbering_draft_roots root ON root.workspace_id = c.workspace_id
        JOIN approval_platform_requests request ON request.id = c.approval_request_id
       WHERE c.lifecycle_status = 'promoted'
         AND request.request_status IN ('approved', 'needs_info')
       ORDER BY c.updated_at DESC, c.id
       LIMIT 1
    `).get();
    if (closed?.workspaceId && closed.approvalRequestId && closed.candidateRevisionId) {
      const stamp = new Date().toISOString();
      database.transaction(() => {
        database.prepare("UPDATE approval_platform_requests SET request_status='pending', resolved_by=NULL, resolved_at=NULL, apply_status='not_ready', apply_attempts=0, apply_error=NULL, applied_by=NULL, applied_at=NULL, updated_at=? WHERE id=?").run(stamp, closed.approvalRequestId);
        database.prepare("UPDATE numbering_candidate_revision_drafts SET lifecycle_status='review_locked', formal_drawing_number_id=NULL, formal_revision_package_id=NULL, promoted_at=NULL, updated_at=? WHERE id=?").run(stamp, closed.candidateRevisionId);
        database.prepare("UPDATE numbering_draft_workspaces SET lifecycle_status='active', published_at=NULL, published_by=NULL, updated_at=? WHERE id=?").run(stamp, closed.workspaceId);
      })();
      candidate = closed;
    }
  }
  const relationRoot = database.prepare(`
    SELECT root.id AS rootId, root.root_code AS rootCode
      FROM part_roots root
      JOIN part_numbers part ON part.part_root_id = root.id
      JOIN drawing_part_links link ON link.part_number_id = part.id
     WHERE root.company_id = 'company-jenfu'
     ORDER BY root.created_at, root.id
     LIMIT 1
  `).get();
  database.close();
  if (!candidate?.workspaceId || !candidate.approvalRequestId) throw new Error("DEV-067 browser fixture needs one pending native candidate review.");
  if (!relationRoot?.rootId) throw new Error("DEV-067 browser fixture needs one drawing/part relation root.");
  return {
    candidateKey: `candidate:${candidate.workspaceId}`,
    workspaceId: candidate.workspaceId,
    approvalRequestId: candidate.approvalRequestId,
    drawingCode: candidate.drawingCode,
    candidateRevisionId: candidate.candidateRevisionId,
    relationKey: `root:${relationRoot.rootId}`,
    relationRootCode: relationRoot.rootCode
  };
}

async function startIsolatedServer(enabled) {
  const port = await getFreePort();
  const distDirRelative = `.tmp/qc-dev067-browser-${enabled ? "on" : "off"}-${crypto.randomUUID()}`;
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
    PDM_UNIFIED_ENTITY_DETAIL_V1: enabled ? "true" : "false",
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

async function stopIsolatedServer() {
  if (!app) return;
  await stopNextApp(app.child);
  app = null;
}

function attachMonitor(page, label) {
  page.on("pageerror", (error) => browserErrors.push({ label, type: "pageerror", message: errorMessage(error) }));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ label, type: "console", message: message.text() });
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failedResponses.push({ label, url: response.url(), status: response.status() });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (failure?.errorText && !failure.errorText.includes("ABORTED")) {
      browserErrors.push({ label, type: "requestfailed", message: `${request.method()} ${request.url()} ${failure.errorText}` });
    }
  });
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

async function waitForUnifiedDrawer(page) {
  const marker = page.locator('[data-component="unified-pdm-entity-detail-drawer"]');
  try {
    await marker.waitFor({ state: "visible", timeout: 20000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: window.location.href,
      unifiedMarkers: document.querySelectorAll('[data-component="unified-pdm-entity-detail-drawer"]').length,
      candidateMarkers: document.querySelectorAll('[data-component="drawing-workspace-drawer"]').length,
      asides: [...document.querySelectorAll("aside")].map((node) => ({ className: node.className, ariaLabel: node.getAttribute("aria-label"), hidden: node.getAttribute("aria-hidden") })),
      loading: [...document.querySelectorAll("[role=status], .drawing-workbench-detail-loading")].map((node) => (node.textContent ?? "").trim()).filter(Boolean).slice(0, 4),
      bodyText: (document.body.innerText ?? "").slice(0, 500)
    }));
    throw new Error(`${errorMessage(error)} diagnostic=${JSON.stringify(diagnostic)}`);
  }
  await page.locator("aside.pdm-entity-detail-drawer h2").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector(".unified-pdm-loading") && !document.querySelector(".unified-pdm-error"), null, { timeout: 20000 });
  return marker;
}

async function waitForCandidateDrawer(page) {
  const marker = page.locator('[data-component="drawing-workspace-drawer"]');
  try {
    await marker.waitFor({ state: "visible", timeout: 20000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: window.location.href,
      unifiedMarkers: document.querySelectorAll('[data-component="unified-pdm-entity-detail-drawer"]').length,
      candidateMarkers: document.querySelectorAll('[data-component="drawing-workspace-drawer"]').length,
      asides: [...document.querySelectorAll("aside")].map((node) => ({ className: node.className, ariaLabel: node.getAttribute("aria-label") })),
      bodyText: (document.body.innerText ?? "").slice(0, 500)
    }));
    throw new Error(`${errorMessage(error)} diagnostic=${JSON.stringify(diagnostic)}`);
  }
  await page.locator("aside.pdm-entity-detail-drawer h2").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector(".drawing-workbench-detail-loading"), null, { timeout: 20000 });
  return marker;
}

async function waitForAnyDrawer(page) {
  await page.waitForFunction(() => Boolean(
    document.querySelector('[data-component="unified-pdm-entity-detail-drawer"]') ||
    document.querySelector('[data-component="drawing-workspace-drawer"]')
  ), null, { timeout: 20000 });
  await page.locator("aside.pdm-entity-detail-drawer h2").waitFor({ state: "visible", timeout: 20000 });
  return page.evaluate(() => document.querySelector('[data-component="unified-pdm-entity-detail-drawer"]') ? "unified" : "candidate");
}

async function inspectCandidateDrawer(page, label) {
  const markerCount = await page.locator('[data-component="drawing-workspace-drawer"]').count();
  const drawer = page.locator("aside.pdm-entity-detail-drawer");
  assert.equal(markerCount, 1, `${label}: candidate drawer must render once`);
  assert.equal(await drawer.count(), 1, `${label}: candidate detail shell must render once`);
  const scrollOwnerCount = await drawer.locator(".pdm-entity-drawer-body, .number-state-drawer-body").count();
  if (scrollOwnerCount !== 1) {
    const diagnostic = await page.evaluate(() => ({
      aside: [...document.querySelectorAll("aside.pdm-entity-detail-drawer")].map((node) => ({ className: node.className, html: node.innerHTML.slice(0, 1200) })),
      markers: [...document.querySelectorAll('[data-component="drawing-workspace-drawer"]')].map((node) => ({ className: node.className, parent: node.parentElement?.className }))
    }));
    throw new Error(`${label}: candidate drawer one scroll owner ${scrollOwnerCount} !== 1 diagnostic=${JSON.stringify(diagnostic)}`);
  }
  assert.equal(await drawer.locator("[data-pdm-drawer-close='true']").count(), 1, `${label}: candidate close must render once`);
  assert.equal(await drawer.locator(".pdm-detail-drawer-resize-handle").count(), 1, `${label}: candidate resize affordance must render once`);
  assert.equal(await drawer.locator("form, input, textarea, select, [data-primary-action^='submit'], [data-primary-action^='save'], [data-capability*='maintenance']").count(), 0, `${label}: candidate drawer must remain read-only`);
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    drawerAria: document.querySelector("aside.pdm-entity-detail-drawer")?.getAttribute("aria-label"),
    labelledBy: document.querySelector("aside.pdm-entity-detail-drawer")?.getAttribute("aria-labelledby"),
    labelledByIsHeading: (() => { const id = document.querySelector("aside.pdm-entity-detail-drawer")?.getAttribute("aria-labelledby"); return Boolean(id && document.getElementById(id)?.tagName === "H2"); })(),
    headings: document.querySelectorAll("aside.pdm-entity-detail-drawer h2, aside.pdm-entity-detail-drawer h3").length,
    previewBoards: document.querySelectorAll('[data-component="drawing-detail-preview"]').length
  }));
  assert.ok(layout.scrollWidth <= layout.viewportWidth + 1, `${label}: horizontal overflow ${layout.scrollWidth} > ${layout.viewportWidth}`);
  assert.equal(layout.drawerAria?.includes("唯讀"), true, `${label}: candidate drawer needs read-only aria label`);
  assert.equal(layout.labelledByIsHeading, true, `${label}: candidate drawer must label its heading`);
  assert.ok(layout.headings >= 2, `${label}: candidate drawer should expose summary headings`);
  return { marker: "drawing-workspace-drawer", layout };
}

async function inspectDrawer(page, expectedProjectionOrder, label, expectPreview) {
  const markerCount = await page.locator('[data-component="unified-pdm-entity-detail-drawer"]').count();
  const composerCount = await page.locator('[data-component="ProjectionComposer"]').count();
  const drawer = page.locator("aside.pdm-entity-detail-drawer");
  assert.equal(markerCount, 1, `${label}: unified drawer must render once`);
  assert.equal(composerCount, 1, `${label}: projection composer must render once`);
  assert.equal(await drawer.count(), 1, `${label}: detail shell must render once`);
  assert.equal(await drawer.locator(".pdm-entity-drawer-body").count(), 1, `${label}: one scroll owner`);
  assert.equal(await drawer.locator("[data-pdm-drawer-close='true']").count(), 1, `${label}: inline close must render once`);
  assert.equal(await drawer.locator(".pdm-detail-drawer-resize-handle").count(), 1, `${label}: resize affordance must render once`);
  assert.equal(await drawer.locator('[data-component="ContextActionBar"]').count(), 1, `${label}: action bar must render once`);
  assert.equal(await drawer.locator(".number-state-drawer-body, .drawing-detail-drawer-body, .part-detail-drawer-body").count(), 0, `${label}: legacy drawer body must not be nested`);
  const projections = await drawer.locator('[data-component="ProjectionComposer"] > [data-component$="Projection"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-component")));
  assert.deepEqual(projections, expectedProjectionOrder, `${label}: projections must follow canonical order`);
  const a11y = await drawer.locator("button, a").evaluateAll((nodes) => nodes.map((node) => ({ tag: node.tagName, text: (node.textContent ?? "").trim(), aria: node.getAttribute("aria-label"), title: node.getAttribute("title") })));
  assert.equal(a11y.filter((item) => !item.text && !item.aria && !item.title).length, 0, `${label}: interactive controls need accessible names`);
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyHeight: document.body.scrollHeight,
    drawerAria: document.querySelector("aside.pdm-entity-detail-drawer")?.getAttribute("aria-label"),
    labelledBy: document.querySelector("aside.pdm-entity-detail-drawer")?.getAttribute("aria-labelledby"),
    labelledByIsHeading: (() => { const id = document.querySelector("aside.pdm-entity-detail-drawer")?.getAttribute("aria-labelledby"); return Boolean(id && document.getElementById(id)?.tagName === "H2"); })(),
    headings: document.querySelectorAll("aside.pdm-entity-detail-drawer h2, aside.pdm-entity-detail-drawer h3").length,
    previewBoards: document.querySelectorAll('[data-component="drawing-detail-preview"]').length,
    previewStates: [...document.querySelectorAll('[data-component="drawing-detail-preview"] [data-preview-state]')].map((node) => node.getAttribute("data-preview-state"))
  }));
  assert.ok(layout.scrollWidth <= layout.viewportWidth + 1, `${label}: horizontal overflow ${layout.scrollWidth} > ${layout.viewportWidth}`);
  assert.equal(layout.drawerAria?.includes("統一明細"), true, `${label}: drawer needs unified aria label`);
  assert.equal(layout.labelledByIsHeading, true, `${label}: drawer must label its heading`);
  assert.ok(layout.headings >= 2, `${label}: drawer should expose shared and projection headings`);
  assert.equal(layout.previewBoards, expectPreview ? 1 : 0, `${label}: preview board visibility must follow projection level`);
  assert.ok(layout.previewStates.every((state) => ["queued", "running", "ready", "pending", "delayed", "failed", "unavailable", "missing"].includes(state)), `${label}: unknown preview state`);
  return { projections, layout };
}

async function openAndInspect(page, route, expectedProjectionOrder, screenshotName, expectPreview = true) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForUnifiedDrawer(page);
  const detail = await inspectDrawer(page, expectedProjectionOrder, screenshotName, expectPreview);
  await page.screenshot({ path: path.join(screenshotDir, `${screenshotName}.png`), fullPage: true });
  return detail;
}

async function openAndInspectCandidate(page, route, screenshotName) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForCandidateDrawer(page);
  const detail = await inspectCandidateDrawer(page, screenshotName);
  await page.screenshot({ path: path.join(screenshotDir, `${screenshotName}.png`), fullPage: true });
  return detail;
}

async function openAndInspectAny(page, route, screenshotName, expectedProjectionOrder) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const drawerType = await waitForAnyDrawer(page);
  const detail = drawerType === "unified"
    ? await inspectDrawer(page, expectedProjectionOrder, screenshotName, true)
    : await inspectCandidateDrawer(page, screenshotName);
  await page.screenshot({ path: path.join(screenshotDir, `${screenshotName}.png`), fullPage: true });
  return { ...detail, drawerType };
}

async function closeByEscape(page) {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[data-component="unified-pdm-entity-detail-drawer"]') && !document.querySelector('[data-component="drawing-workspace-drawer"]'), null, { timeout: 10000 });
  const url = new URL(page.url());
  assert.equal(url.searchParams.has("detail"), false, "Escape must return to owner list without detail query");
}

async function runFocusRestoreCase() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "focus-restore");
  try {
    await login(page);
    await page.goto(`${baseUrl}/numbering/drawings?view=all`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const source = page.locator("[data-drawing-workbench-row='true'] button.pdm-identity-code").first();
    await source.waitFor({ state: "visible", timeout: 20000 });
    await source.focus();
    await source.click();
    const drawerType = await waitForAnyDrawer(page);
    assert.equal(await source.evaluate((node) => document.activeElement === node), true, "opening a non-modal drawer must preserve focus on the source row");
    const drawerTitle = page.locator("aside.pdm-entity-detail-drawer h2");
    const firstDrawerTitle = (await drawerTitle.innerText()).trim();
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction((previousTitle) => {
      const node = document.querySelector("aside.pdm-entity-detail-drawer h2");
      return Boolean(node && ((node.textContent ?? "").trim() !== previousTitle || document.querySelector('[data-component="drawing-workspace-drawer"]')));
    }, firstDrawerTitle, { timeout: 10000 });
    assert.equal(await page.locator('[data-component="unified-pdm-entity-detail-drawer"], [data-component="drawing-workspace-drawer"]').count(), 1, "ArrowDown after mouse-open must keep one drawer open");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-component="unified-pdm-entity-detail-drawer"]') && !document.querySelector('[data-component="drawing-workspace-drawer"]'), null, { timeout: 10000 });
    assert.equal(await source.evaluate((node) => document.activeElement === node), true, "closing a drawer must restore focus to the source row");
    record("UDD-BROWSER-mouse-open-arrow-navigation", true, { drawerType, shortcuts: "mouse open -> ArrowDown -> Escape", focusedAfterClose: await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim()) });
  } finally {
    await context.close();
  }
}

async function runKeyboardCase() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "keyboard-list");
  try {
    await login(page);
    await page.goto(`${baseUrl}/numbering/drawings?view=all`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const list = page.locator(".pdm-workbench-list-scroll");
    await list.waitFor({ state: "visible", timeout: 20000 });
    await list.focus();
    await page.keyboard.press("ArrowDown");
    await page.locator("tr[aria-selected='true']").first().waitFor({ state: "visible", timeout: 10000 });
    await list.focus();
    assert.equal(await list.evaluate((node) => document.activeElement === node), true, "keyboard list must retain an operable focus target");
    await page.keyboard.press("Enter");
    const drawerType = await waitForAnyDrawer(page);
    assert.equal(await page.locator('[data-component="unified-pdm-entity-detail-drawer"], [data-component="drawing-workspace-drawer"]').count(), 1, "keyboard Enter must open one canonical/read-only drawer");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-component="unified-pdm-entity-detail-drawer"]') && !document.querySelector('[data-component="drawing-workspace-drawer"]'), null, { timeout: 10000 });
    record("UDD-BROWSER-keyboard-list-navigation", true, { drawerType, shortcuts: "ArrowDown -> Enter -> Escape" });
  } finally {
    await context.close();
  }
}

async function getJson(page, route) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { cache: "no-store" });
    return { status: response.status, body: await response.json().catch(() => ({})), cacheControl: response.headers.get("cache-control") };
  }, route);
}

async function runRouteMatrix() {
  const candidate = encodeURIComponent(fixture.candidateKey);
  const relation = encodeURIComponent(fixture.relationKey);
  const routes = [
    { name: "drawing", route: `/numbering/drawings?view=all&detail=${candidate}`, projections: ["DrawingProjection", "PartProjection", "RelationProjection"] },
    { name: "part", route: `/parts?view=all&detail=${candidate}`, candidateDrawer: true },
    { name: "relation", route: `/numbering/search?view=all&detail=${relation}`, projections: ["DrawingProjection", "PartProjection", "RelationProjection"] }
  ];
  for (const viewport of viewports) {
    for (const route of routes) {
      await runCase(`UDD-BROWSER-${viewport.name}-${route.name}-drawer`, async () => {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const page = await context.newPage();
        const label = `${viewport.name}/${route.name}`;
        attachMonitor(page, label);
        try {
          await login(page);
          const screenshotName = `browser-${viewport.name}-${route.name}`;
          const detail = route.candidateDrawer
            ? await openAndInspectCandidate(page, route.route, screenshotName)
            : await openAndInspect(page, route.route, route.projections, screenshotName, route.expectPreview ?? true);
          await closeByEscape(page);
          return { viewport, route: route.name, projections: detail.projections, previewStates: detail.layout.previewStates, escapeReturnedTo: page.url() };
        } finally {
          await context.close();
        }
      });
    }
  }
}

async function runReviewInteraction() {
  const returnTo = "/approvals?status=active&limit=100&domain=numbering";
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachMonitor(page, "review-owner-route");
  try {
    await login(page);
    const inbox = await getJson(page, "/api/approvals/inbox?status=active&limit=100&domain=numbering");
    assert.equal(inbox.status, 200, `approval inbox failed: ${JSON.stringify(inbox.body)}`);
    const item = (inbox.body.items ?? []).find((entry) => entry.id === fixture.approvalRequestId);
    assert.ok(item?.ownerHref, `native approval ${fixture.approvalRequestId} must expose ownerHref`);
    assert.ok(String(item.ownerHref).startsWith(`/approvals/${encodeURIComponent(fixture.approvalRequestId)}`), `ownerHref must be exact reviewer route: ${item.ownerHref}`);
    assert.equal(String(item.ownerHref).includes("/numbering/search"), false, "review owner must not fall back to list route");
    await runCase("UDD-BROWSER-approval-owner-route", async () => {
      await page.goto(`${baseUrl}${item.ownerHref}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.locator('[data-workspace-kind="reviewer"] .dev079-workspace-grid').waitFor({ state: "visible", timeout: 20000 });
      const alerts = await page.locator('[data-workspace-kind="reviewer"] [role="alert"]').allTextContents();
      assert.deepEqual(alerts, [], `reviewer must not show visible error: ${alerts.join(" | ")}`);
      const projectionCount = await page.locator('[data-workspace-kind="reviewer"] [data-component$="Projection"]').count();
      assert.ok(projectionCount > 0, "reviewer must render a server-selected PDM projection");
      assert.equal(new URL(page.url()).pathname, `/approvals/${encodeURIComponent(fixture.approvalRequestId)}`, "review owner must use canonical reviewer workspace");
      await page.screenshot({ path: path.join(screenshotDir, "browser-review-owner.png"), fullPage: true });
      return { ownerHref: item.ownerHref, projectionCount };
    });
    await page.locator('[data-workspace-kind="reviewer"] header button[aria-label="返回審核清單"]').click();
    await page.waitForURL((url) => url.pathname === "/approvals", { timeout: 10000 });
    assert.equal(new URL(page.url()).searchParams.get("domain"), "numbering", "review back must preserve approval filters");
    record("UDD-BROWSER-review-close-returnTo", true, { returnTo: page.url(), expectedReturnTo: returnTo });
  } finally {
    await context.close();
  }
}

async function runFlagOffCheck() {
  await stopIsolatedServer();
  await startIsolatedServer(false);
  const response = await fetch(`${baseUrl}/api/pdm/entity-details/${encodeURIComponent(fixture.candidateKey)}?surface=drawing`);
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 404, `flag-off entity detail must be 404: ${JSON.stringify(body)}`);
  assert.equal(body.error?.code, "PDM_ENTITY_DETAIL_DISABLED");
  record("UDD-BROWSER-flag-off-server-boundary", true, { status: response.status, code: body.error?.code });
}

async function writeEvidence() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({
    runId,
    generatedAt: new Date().toISOString(),
    tool: "Playwright Chromium",
    fixture,
    viewports,
    server: { database: "isolated SQLite copy", featureFlagOnAndOff: true },
    cases: results,
    browserErrors,
    failedResponses
  }, null, 2));
}

async function restoreEnvironment() {
  await stopIsolatedServer();
  if (browser) await browser.close().catch(() => undefined);
  for (const [file, contents] of trackedFiles) fs.writeFileSync(path.join(root, file), contents);
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const distDir of startedDistDirs) {
    const resolved = path.resolve(distDir);
    const tmpRoot = path.resolve(root, ".tmp") + path.sep;
    if (resolved.startsWith(tmpRoot)) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  }
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}

try {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fixture = configureFixtureDatabase();
  await startIsolatedServer(true);
  browser = await chromium.launch({ headless: true });
  const status = await fetch(`${baseUrl}/api/numbering/state-flow/status`);
  const statusBody = await status.json();
  assert.equal(status.status, 200);
  assert.equal(statusBody.entityDetail?.enabled, true, `flag-on status must be enabled: ${JSON.stringify(statusBody)}`);
  record("UDD-BROWSER-flag-on-status", true, { entityDetail: statusBody.entityDetail });
  await runRouteMatrix();
  await runFocusRestoreCase();
  await runKeyboardCase();
  await runReviewInteraction();
  await runFlagOffCheck();
  await writeEvidence();
  const failures = results.filter((result) => !result.passed);
  assert.equal(browserErrors.length, 0, `browser errors observed: ${JSON.stringify(browserErrors)}`);
  assert.equal(failedResponses.length, 0, `5xx responses observed: ${JSON.stringify(failedResponses)}`);
  assert.equal(failures.length, 0, `browser QC failures: ${JSON.stringify(failures)}`);
  console.log(`PASS DEV-067 authenticated browser matrix (${results.length} cases); evidence=${path.relative(root, outputDir)}`);
} catch (error) {
  await writeEvidence().catch(() => undefined);
  console.error(`DEV-067 browser QC failed: ${errorMessage(error)}`);
  process.exitCode = 1;
} finally {
  await restoreEnvironment();
}
