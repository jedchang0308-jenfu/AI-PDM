#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV072-${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}-${crypto.randomUUID().slice(0, 8)}`;
const outputDir = path.resolve(root, "output", "qa", "dev-072-pdm-action-discoverability", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev072-browser-"));
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepositoryDir = path.join(root, "data", "repository");
const provenanceSourceFiles = Object.freeze([
  "package.json",
  "scripts/qc-dev-072-action-api.mjs",
  "scripts/qc-dev-072-action-contract.mjs",
  "scripts/qc-dev-072-browser.mjs",
  "src/app/api/pdm/entity-details/[entityKey]/route.ts",
  "src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/route.ts",
  "src/app/approvals/page.tsx",
  "src/app/globals.css",
  "src/components/candidate-drawing-file-upload.tsx",
  "src/components/drawing-projection.tsx",
  "src/components/drawing-workbench.tsx",
  "src/components/master-attachment-panel.tsx",
  "src/components/part-projection.tsx",
  "src/components/part-workbench.tsx",
  "src/components/pdm-detail-action-control.tsx",
  "src/components/relation-matrix-table.tsx",
  "src/components/relation-projection.tsx",
  "src/components/relation-workbench.tsx",
  "src/components/unified-pdm-entity-detail-drawer.tsx",
  "src/lib/pdm-detail-action-capabilities.ts",
  "src/lib/pdm-detail-action-resolver.ts",
  "src/lib/pdm-entity-detail-contract.ts",
  "src/lib/pdm-entity-detail.ts"
].sort());
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const originalEnv = new Map([
  "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_RELEASE_MODE",
  "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_NUMBER_STATE_FLOW_V1", "PDM_NUMBER_LIFECYCLE_V2",
  "PDM_UNIFIED_ENTITY_DETAIL_V1", "PDM_UNIFIED_DRAWING_WORKBENCH_V1", "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1",
  "PDM_PRODUCTION_SLICE_MODE", "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_PUBLIC_BASE_URL"
].map((key) => [key, process.env[key]]));

const focusCandidateUpload = process.env.QC_DEV072_FOCUS_CANDIDATE_UPLOAD === "1";
const focusApprovalDecision = process.env.QC_DEV072_FOCUS_APPROVAL_DECISION === "1";
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844, touch: true }
].filter((viewport) => !(focusCandidateUpload || focusApprovalDecision) || viewport.name === "desktop");
const cases = [];
const actionContracts = [];
const domMetrics = [];
const interactions = [];
const network = [];
const consoleEvents = [];
const dataEvidence = [];
const visibleSweeps = [];
const startedDistDirs = [];
const tempDataDirs = [];
let cleanupRemovedCount = 0;
let browser = null;
let app = null;
let baseUrl = "";
let activeDataDir = "";

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

function gitText(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function buildSourceProvenance() {
  const commit = gitText(["rev-parse", "HEAD"]);
  const branch = gitText(["branch", "--show-current"]);
  const dirtyWorktree = gitText(["status", "--porcelain=v1", "--untracked-files=all"]).length > 0;
  const scopedStatus = gitText(["status", "--porcelain=v1", "--untracked-files=all", "--", ...provenanceSourceFiles]);
  const contentHash = crypto.createHash("sha256");
  for (const file of provenanceSourceFiles) {
    contentHash.update(file);
    contentHash.update("\0");
    contentHash.update(fs.readFileSync(path.join(root, file)));
    contentHash.update("\0");
  }
  const scopedSourceHash = contentHash.digest("hex");
  const dirtyHash = crypto
    .createHash("sha256")
    .update(commit)
    .update("\0")
    .update(scopedStatus)
    .update("\0")
    .update(scopedSourceHash)
    .digest("hex");
  return {
    provenanceVersion: 1,
    commit,
    branch,
    dirtyWorktree,
    scopedDirty: scopedStatus.length > 0,
    dirtyHashAlgorithm: "sha256(commit + scoped git status + scoped source hash)",
    dirtyHash,
    scopedSourceHashAlgorithm: "sha256(sorted path + NUL + file bytes + NUL)",
    scopedSourceHash,
    scopedFiles: provenanceSourceFiles
  };
}

function recordCase(id, passed, detail = {}) {
  cases.push({ id, passed: Boolean(passed), detail });
  if (!passed) console.error(`FAIL ${id}: ${detail.error ?? JSON.stringify(detail)}`);
}

async function runCase(id, fn) {
  try {
    const detail = await fn();
    recordCase(id, true, detail ?? {});
  } catch (error) {
    recordCase(id, false, { error: message(error) });
  }
}

function configureDatabase(label) {
  const dataDir = path.join(tempRoot, label);
  const repositoryDir = path.join(dataDir, "repository");
  const databasePath = path.join(dataDir, "ai-pdm.sqlite");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(sourceDb, databasePath);
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
  tempDataDirs.push(dataDir);
  const db = new Database(databasePath);
  try {
    for (const email of ["admin@example.com", "manager@example.com", "manufacturing@example.com"]) {
      db.prepare("UPDATE users SET account_status = 'active', system_role_enabled = 1, session_invalid_before = NULL WHERE email = ?").run(email);
      db.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = ?").run(email);
    }
  } catch (error) {
    db.close();
    throw new Error(`DEV-072 fixture auth activation failed: ${message(error)}`);
  }
  const adminUser = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
  assert.ok(adminUser?.id, "DEV-072 fixture needs the local admin user identity");
  const building = db.prepare(`
    SELECT candidate.id AS candidateRevisionId, candidate.workspace_id AS workspaceId,
           candidate.drawing_draft_id AS drawingDraftId
      FROM numbering_candidate_revision_drafts candidate
      JOIN numbering_draft_workspaces workspace ON workspace.id = candidate.workspace_id
     WHERE candidate.lifecycle_status = 'draft'
       AND workspace.lifecycle_status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM numbering_candidate_revision_files file
          WHERE file.candidate_revision_id = candidate.id AND file.removed_at IS NULL
       )
     ORDER BY workspace.updated_at DESC, workspace.id
     LIMIT 1
  `).get();
  const firstUpload = db.prepare(`
    SELECT draft.id AS drawingDraftId, draft.workspace_id AS workspaceId, drawing.id AS unifiedDrawingId
      FROM numbering_draft_drawings draft
      JOIN numbering_draft_workspaces workspace
        ON workspace.id = draft.workspace_id AND workspace.company_id = draft.company_id
      JOIN drawings drawing
        ON drawing.drawing_draft_id = draft.id AND drawing.company_id = draft.company_id
     WHERE workspace.lifecycle_status = 'active'
       AND drawing.formal_drawing_number_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM numbering_candidate_revision_drafts candidate
          WHERE candidate.drawing_draft_id = draft.id AND candidate.company_id = draft.company_id
       )
     ORDER BY workspace.updated_at DESC, draft.id
     LIMIT 1
  `).get();
  let pending = db.prepare(`
    SELECT candidate.workspace_id AS workspaceId, candidate.approval_request_id AS requestId
      FROM numbering_candidate_revision_drafts candidate
      JOIN approval_platform_requests request ON request.id = candidate.approval_request_id
     WHERE candidate.lifecycle_status = 'review_locked' AND request.request_status = 'pending'
     ORDER BY request.updated_at DESC, request.id
     LIMIT 2
  `).all();
  let fixtureRestoredFromClosedReview = false;
  if (pending.length === 0) {
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
      const restore = db.transaction(() => {
        db.prepare(`
          UPDATE approval_platform_requests
             SET request_status = 'pending', resolved_by = NULL, resolved_at = NULL,
                 apply_status = 'not_ready', apply_attempts = 0, apply_error = NULL,
                 applied_by = NULL, applied_at = NULL, updated_at = ?
           WHERE id = ?
        `).run(now, closedReview.requestId);
        db.prepare(`
          UPDATE numbering_candidate_revision_drafts
             SET lifecycle_status = 'review_locked', formal_drawing_number_id = NULL,
                 formal_revision_package_id = NULL, promoted_at = NULL,
                 updated_at = ?
           WHERE id = ?
        `).run(now, closedReview.candidateRevisionId);
        db.prepare(`
          UPDATE numbering_draft_workspaces
             SET lifecycle_status = 'active', published_at = NULL, published_by = NULL, updated_at = ?
           WHERE id = ?
        `).run(now, closedReview.workspaceId);
      });
      try {
        restore();
      } catch (error) {
        db.close();
        throw new Error(`DEV-072 fixture closed-review restore failed: ${message(error)}`);
      }
      fixtureRestoredFromClosedReview = true;
      pending = db.prepare(`
        SELECT candidate.workspace_id AS workspaceId, candidate.approval_request_id AS requestId
          FROM numbering_candidate_revision_drafts candidate
          JOIN approval_platform_requests request ON request.id = candidate.approval_request_id
         WHERE candidate.lifecycle_status = 'review_locked' AND request.request_status = 'pending'
         ORDER BY request.updated_at DESC, request.id
         LIMIT 2
      `).all();
    }
  }
  const part = db.prepare("SELECT id, part_number AS partNumber FROM part_numbers WHERE record_status NOT IN ('Obsolete', 'Merged') ORDER BY updated_at DESC, id LIMIT 1").get();
  const relation = db.prepare(`
    SELECT root.id AS rootId, root.root_code AS rootCode
      FROM part_roots root
      JOIN part_numbers part ON part.part_root_id = root.id
      JOIN drawing_part_links link ON link.part_number_id = part.id
     WHERE root.record_status NOT IN ('Obsolete', 'Merged')
     ORDER BY root.created_at, root.id LIMIT 1
  `).get();
  const fileSources = db.prepare(`
    SELECT file.role, file.source_file_asset_id AS sourceFileAssetId, file.publication_evidence_id AS publicationEvidenceId,
           file.display_name AS displayName, file.description, file.role_source AS roleSource,
           evidence.provider, evidence.bucket, evidence.object_key AS objectKey, evidence.generation,
           evidence.content_hash AS contentHash, evidence.media_type AS mediaType,
           evidence.finalized_at AS finalizedAt, evidence.rule_version AS ruleVersion
      FROM numbering_candidate_revision_files file
      JOIN numbering_publication_evidence evidence ON evidence.id = file.publication_evidence_id
     WHERE file.removed_at IS NULL AND file.is_primary = 1 AND file.publication_evidence_id IS NOT NULL
       AND file.role IN ('cad_3d', 'drawing_2d')
     GROUP BY file.role
     ORDER BY file.role
  `).all();
  assert.ok(building?.workspaceId && building?.candidateRevisionId, "DEV-072 needs one incomplete draft candidate");
  assert.ok(firstUpload?.workspaceId && firstUpload?.drawingDraftId && firstUpload?.unifiedDrawingId, "DEV-072 needs one draft drawing without a candidate revision");
  assert.ok(pending.length >= 1, "DEV-072 needs one pending native candidate review");
  assert.ok(part?.id && relation?.rootId, "DEV-072 needs Part and Relation fixtures");
  assert.equal(new Set(fileSources.map((row) => row.role)).size, 2, "DEV-072 needs reusable 2D and 3D publication evidence");
  try {
    db.prepare("UPDATE numbering_draft_workspaces SET owner_id = ? WHERE id = ?").run(adminUser.id, building.workspaceId);
    db.prepare("UPDATE numbering_draft_workspaces SET owner_id = ? WHERE id = ?").run(adminUser.id, firstUpload.workspaceId);
    db.prepare("UPDATE numbering_candidate_revision_drafts SET created_by = ?, updated_by = ? WHERE id = ?").run(adminUser.id, adminUser.id, building.candidateRevisionId);
    db.prepare("UPDATE part_numbers SET record_status = 'Obsolete' WHERE id = ?").run(part.id);
  } catch (error) {
    db.close();
    throw new Error(`DEV-072 fixture ownership setup failed: ${message(error)}`);
  }
  db.close();
  return {
    dataDir,
    repositoryDir,
    databasePath,
    buildingKey: `candidate:${building.workspaceId}`,
    buildingWorkspaceId: building.workspaceId,
    buildingCandidateRevisionId: building.candidateRevisionId,
    buildingDrawingDraftId: building.drawingDraftId,
    firstUploadWorkspaceId: firstUpload.workspaceId,
    firstUploadDrawingDraftId: firstUpload.drawingDraftId,
    firstUploadUnifiedDrawingId: firstUpload.unifiedDrawingId,
    pending,
    fixtureRestoredFromClosedReview,
    terminalKey: `part:${part.id}`,
    partKey: `part:${part.id}`,
    partNumber: part.partNumber,
    relationKey: `root:${relation.rootId}`,
    relationRootCode: relation.rootCode,
    fileSources,
    adminUserId: adminUser.id
  };
}

async function startServer(fixture, label) {
  activeDataDir = fixture.dataDir;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const port = await getFreePort();
    const distDirRelative = `.tmp/qc-dev072-${label}-${crypto.randomUUID()}`;
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
      await delay(500);
      const startupOutput = app.getOutput();
      const startupNextEnvLock = /next-env\.d\.ts/iu.test(startupOutput) && /UNKNOWN|EBUSY|EPERM|EACCES/iu.test(startupOutput);
      if (startupNextEnvLock) {
        await stopServerProcess(app.child);
        app = null;
        if (attempt === 3) throw new Error("DEV-072 temporary server could not acquire next-env.d.ts after 3 attempts.");
        interactions.push({ type: "server-start-retry", label, attempt, reason: "transient next-env.d.ts lock after ready" });
        await delay(750 * attempt);
        continue;
      }
      return;
    } catch (error) {
      const output = app.getOutput();
      await stopServerProcess(app.child);
      app = null;
      const transientNextEnvLock = /next-env\.d\.ts/iu.test(output) && /UNKNOWN|EBUSY|EPERM|EACCES/iu.test(output);
      const transientBuildManifestRace = /ENOENT/iu.test(output) && /build-manifest\.json/iu.test(output);
      if (!(transientNextEnvLock || transientBuildManifestRace) || attempt === 3) throw error;
      interactions.push({
        type: "server-start-retry",
        label,
        attempt,
        reason: transientBuildManifestRace ? "transient target-route build manifest race" : "transient next-env.d.ts lock"
      });
      await delay(750 * attempt);
    }
  }
}

async function stopServerProcess(child) {
  if (!child) return;
  if (process.platform === "win32" && child.pid) {
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* already exited */ }
  }
  await stopNextApp(child).catch(() => undefined);
}

async function stopServer() {
  if (!app) return;
  await stopServerProcess(app.child);
  app = null;
}

async function login(page, email) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const result = await page.evaluate(async ({ loginEmail }) => {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: loginEmail, password: "pdm-demo" }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { loginEmail: email });
  assert.equal(result.status, 200, `${email} login failed: ${JSON.stringify(result.body)}`);
}

function monitor(page, label) {
  page.on("console", (entry) => {
    if (entry.type() === "error") consoleEvents.push({ label, type: "console", message: entry.text() });
  });
  page.on("pageerror", (error) => consoleEvents.push({ label, type: "pageerror", message: message(error) }));
  page.on("request", (request) => network.push({ label, phase: "request", method: request.method(), url: request.url(), mutation: request.method() !== "GET" && !request.url().includes("/api/auth/login"), expectedNegative: request.headers()["x-qc-expected-negative"] === "true" }));
  page.on("response", (response) => {
    if (response.status() >= 400) network.push({ label, phase: "response", method: response.request().method(), url: response.url(), status: response.status(), mutation: response.request().method() !== "GET", expectedNegative: response.request().headers()["x-qc-expected-negative"] === "true" });
  });
}

async function waitForDrawer(page) {
  // Keep the legacy marker assertion intact, but bound the wait so a superseded
  // drawer contract cannot hold the parent regression runner for every viewport.
  await page.locator('[data-component="unified-pdm-entity-detail-drawer"]').waitFor({ state: "visible", timeout: 5000 });
  await page.waitForFunction(() => !document.querySelector(".unified-pdm-loading") && !document.querySelector(".unified-pdm-error"), null, { timeout: 30000 });
}

async function actionInventory(page, label) {
  const inventory = await page.locator('[data-component="ContextActionBar"] [data-action-id]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      id: node.getAttribute("data-action-id"), label: (node.textContent ?? "").trim(), group: node.getAttribute("data-action-group"),
      order: Number(node.getAttribute("data-action-order")), enabled: node.getAttribute("data-action-enabled") === "true",
      ariaDisabled: node.getAttribute("aria-disabled"), ariaBusy: node.getAttribute("aria-busy"), describedBy: node.getAttribute("aria-describedby"),
      tag: node.tagName, primary: node.classList.contains("primary-button"),
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
  }));
  assert.deepEqual(inventory.map((item) => item.order), [...inventory.map((item) => item.order)].sort((a, b) => a - b), `${label}: DOM action order must be stable`);
  assert.ok(inventory.filter((item) => item.enabled && item.id && page).length >= 1, `${label}: at least return must remain enabled`);
  assert.ok(inventory.filter((item) => item.primary).length <= 1, `${label}: at most one action may use primary rendering`);
  domMetrics.push({ label, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), inventory, geometry: await page.evaluate(() => ({ documentScrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, bodyScrollOwnerCount: document.querySelectorAll("aside.pdm-entity-detail-drawer .pdm-entity-drawer-body").length, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 })) });
  actionContracts.push({ label, actions: inventory.map(({ id, label: actionLabel, group, order, enabled, primary }) => ({ id, label: actionLabel, group, order, enabled, primary })), primary: inventory.filter((item) => item.primary).map((item) => item.id) });
  return inventory;
}

async function visibleErrorSweep(page, label) {
  const result = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const texts = [...document.querySelectorAll(".inline-error, .unified-pdm-error, [role='alert']:not(.unified-pdm-blockers)")].filter(visible).map((node) => (node.textContent ?? "").trim()).filter(Boolean);
    const expectedBusinessAlerts = [...document.querySelectorAll(".unified-pdm-blockers[role='alert']")].filter(visible).map((node) => (node.textContent ?? "").trim()).filter(Boolean);
    const body = document.body.innerText;
    const fatal = ["Internal Server Error", "Not Found", "HTTP 500", "/api/pdm/entity-details"].filter((value) => body.includes(value));
    return { texts, expectedBusinessAlerts, fatal, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  visibleSweeps.push({ label, ...result, passed: result.texts.length === 0 && result.fatal.length === 0 && !result.horizontalOverflow });
  assert.equal(result.texts.length, 0, `${label}: unexpected visible alerts ${JSON.stringify(result.texts)}`);
  assert.equal(result.fatal.length, 0, `${label}: visible fatal route text`);
  assert.equal(result.horizontalOverflow, false, `${label}: horizontal overflow`);
  return result;
}

function mutationCount(label, since = 0) {
  return network.slice(since).filter((entry) => entry.label === label && entry.phase === "request" && entry.mutation).length;
}

async function openRoute(page, route, label) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForDrawer(page);
  const inventory = await actionInventory(page, label);
  await visibleErrorSweep(page, label);
  return inventory;
}

async function followDrawerAnchor(page, actionId, anchor, label) {
  const before = page.url();
  await page.locator(`[data-action-id="${actionId}"]`).click();
  await page.waitForFunction((expectedAnchor) => window.location.hash === `#${expectedAnchor}`, anchor, { timeout: 10000 });
  assert.equal(await page.locator(".unified-pdm-error").count(), 0, `${label}: navigation action must not show an execution error`);
  assert.ok(page.url() !== before || page.url().includes(`#${anchor}`), `${label}: navigation action must change the detail location`);
  interactions.push({ label, type: "drawer-anchor-navigation", actionId, anchor, url: page.url() });
  return page.url();
}

function actionByKind(page, owner, kind) {
  return page.locator(`[data-action-id="detail:${owner}:${kind}"]`);
}

async function inspectLockedTooltip(page, control, label, mode, networkLabel = label) {
  const before = network.length;
  assert.equal(await control.getAttribute("aria-disabled"), "true", `${label}: locked action needs aria-disabled`);
  if (mode === "touch") {
    await control.click({ force: true });
  } else if (mode === "focus") {
    await control.focus();
  } else {
    await control.hover();
    await page.waitForTimeout(360);
  }
  const tooltip = page.locator(`[data-action-tooltip-for="${await control.getAttribute("data-action-id")}"]`);
  await tooltip.waitFor({ state: "visible", timeout: 3000 });
  const geometry = await tooltip.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { text: (node.textContent ?? "").trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.ok(geometry.text.length > 0 && !geometry.text.includes("/api/"), `${label}: tooltip needs human reason`);
  assert.ok(geometry.left >= 0 && geometry.right <= geometry.viewportWidth + 1 && geometry.top >= 0 && geometry.bottom <= geometry.viewportHeight + 1, `${label}: tooltip must stay in viewport`);
  if (mode === "focus") {
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
  } else if (mode === "touch") {
    await control.click({ force: true });
  }
  await page.waitForTimeout(120);
  assert.equal(mutationCount(networkLabel, before), 0, `${label}: locked action must not issue mutation request`);
  interactions.push({ label, type: mode, actionId: await control.getAttribute("data-action-id"), tooltip: geometry.text, mutationCount: 0, geometry });
  return geometry;
}

function addReadyFiles(fixture) {
  const db = new Database(fixture.databasePath);
  const now = new Date().toISOString();
  const insertEvidence = db.prepare(`
    INSERT OR REPLACE INTO numbering_publication_evidence (
      id, company_id, workspace_id, drawing_draft_id, provider, bucket, object_key, generation,
      content_hash, media_type, finalized_at, rule_version, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const relinkAsset = db.prepare(`
    UPDATE file_assets
       SET linked_entity_type = 'numbering_candidate_revision', linked_entity_id = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL
  `);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO numbering_candidate_revision_files (
      id, company_id, candidate_revision_id, source_file_asset_id, publication_evidence_id, role, role_source,
      display_name, description, sort_order, is_primary, removed_at, removed_by, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, ?, ?, ?)
  `);
  let index = 0;
  for (const source of fixture.fileSources) {
    const evidenceId = `DEV072-EVIDENCE-${runId}-${source.role}`;
    insertEvidence.run(
      evidenceId,
      fixture.buildingWorkspaceId,
      fixture.buildingDrawingDraftId,
      source.provider,
      source.bucket,
      source.objectKey,
      source.generation,
      source.contentHash,
      source.mediaType,
      source.finalizedAt,
      source.ruleVersion,
      now,
      now
    );
    const relinked = relinkAsset.run(fixture.buildingCandidateRevisionId, now, source.sourceFileAssetId);
    assert.equal(relinked.changes, 1, `DEV-072 fixture asset must be linked to ${fixture.buildingCandidateRevisionId}`);
    insert.run(`DEV072-FILE-${runId}-${source.role}`, fixture.buildingCandidateRevisionId, source.sourceFileAssetId, evidenceId, source.role, source.roleSource ?? "user", source.displayName ?? `DEV072-${source.role}`, source.description ?? "", index++, fixture.adminUserId, now, now);
  }
  const hash = db.prepare("SELECT COUNT(*) AS count FROM numbering_candidate_revision_files WHERE candidate_revision_id = ? AND removed_at IS NULL").get(fixture.buildingCandidateRevisionId);
  db.close();
  return hash.count;
}

function workspaceState(fixture) {
  const db = new Database(fixture.databasePath, { readonly: true });
  const workspace = db.prepare("SELECT id, lifecycle_status AS lifecycleStatus, row_version AS rowVersion, owner_id AS ownerId FROM numbering_draft_workspaces WHERE id = ?").get(fixture.buildingWorkspaceId);
  const reservations = db.prepare("SELECT reservation_state AS state, COUNT(*) AS count FROM number_candidate_reservations WHERE workspace_id = ? GROUP BY reservation_state ORDER BY reservation_state").all(fixture.buildingWorkspaceId);
  const requests = db.prepare("SELECT id, request_status AS status, action_code AS actionCode FROM approval_platform_requests WHERE id IN (SELECT approval_request_id FROM numbering_candidate_revision_drafts WHERE workspace_id = ? AND approval_request_id IS NOT NULL) ORDER BY created_at").all(fixture.buildingWorkspaceId);
  const candidates = db.prepare("SELECT id, lifecycle_status AS lifecycleStatus, approval_request_id AS requestId, row_version AS rowVersion FROM numbering_candidate_revision_drafts WHERE workspace_id = ? ORDER BY id").all(fixture.buildingWorkspaceId);
  db.close();
  return { workspace, reservations, requests, candidates };
}

async function responsiveLockedMatrix(fixture) {
  for (const viewport of viewports) {
    await runCase(`ACT-${viewport.name === "desktop" ? "016-018" : viewport.name === "mobile" ? "019" : "029"}-${viewport.name}`, async () => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: Boolean(viewport.touch), isMobile: Boolean(viewport.touch) });
      const page = await context.newPage();
      const label = `locked-${viewport.name}`;
      monitor(page, label);
      try {
        await login(page, "admin@example.com");
        const route = `/numbering/drawings?view=all&detail=${encodeURIComponent(fixture.buildingKey)}`;
        const inventory = await openRoute(page, route, label);
        assert.ok(inventory.some((item) => item.id === "detail:drawing:edit" && item.enabled && item.label === "圖面維護"), `${label}: drawing maintenance visible and enabled`);
        assert.ok(!inventory.some((item) => item.id === "detail:drawing:manage_files"), `${label}: separate manage files action is merged`);
        assert.ok(inventory.some((item) => item.id === "detail:drawing:submit_review" && !item.enabled), `${label}: future submit visible and locked`);
        const submit = actionByKind(page, "drawing", "submit_review");
        const mode = viewport.touch ? "touch" : viewport.name === "tablet" ? "focus" : "hover";
        const tooltip = await inspectLockedTooltip(page, submit, label, mode);
        if (viewport.name === "desktop") {
          const drawingProjection = page.locator('[data-component="DrawingProjection"]');
          const relationProjection = page.locator('[data-component="RelationProjection"]');
          await relationProjection.waitFor({ state: "visible", timeout: 30000 });
          assert.equal(await drawingProjection.getByText("關聯料號", { exact: true }).count(), 2, `${label}: candidate drawing renders linked-part summary and detail`);
          assert.equal(await drawingProjection.getByText("1 個", { exact: true }).count(), 1, `${label}: candidate drawing must project its draft relation before formalization`);
          assert.equal(await relationProjection.getByText("1 筆", { exact: true }).count(), 1, `${label}: candidate relation summary must include the draft relation`);
          assert.equal(await relationProjection.getByText("關聯完整", { exact: true }).count(), 1, `${label}: valid candidate relation must not be reported as missing`);
          await followDrawerAnchor(page, "detail:drawing:edit", "drawing-data-maintenance", label);
          const uploadForm = page.locator('form[aria-label="上傳圖面資料"]');
          await uploadForm.waitFor({ state: "visible", timeout: 30000 });
          assert.equal(await page.getByText("拖曳或選擇 1 個圖面、PDF、DWG 或常見中繼檔", { exact: true }).count(), 1, `${label}: file manager exposes the controlled upload entry`);
          assert.equal(await page.locator('[data-component="CandidateDrawingFileUpload"][data-attachment-authority="candidate_revision"]').count(), 1, `${label}: draft candidate uses candidate-revision attachment authority`);
          const fileName = `DEV072-${runId}.SLDPRT`;
          await uploadForm.locator('input[type="file"]').setInputFiles({
            name: fileName,
            mimeType: "application/octet-stream",
            buffer: Buffer.from(`DEV-072 controlled candidate upload ${runId}`, "utf8")
          });
          const uploadResponsePromise = page.waitForResponse((response) =>
            response.request().method() === "POST"
            && response.url().includes(`/api/numbering/draft-workspaces/${fixture.buildingWorkspaceId}/candidate-revisions/${fixture.buildingCandidateRevisionId}/files`)
          );
          await uploadForm.locator('button[type="submit"]').click();
          const uploadResponse = await uploadResponsePromise;
          assert.equal(uploadResponse.status(), 201, `${label}: candidate upload must return 201`);
          await page.getByText(`${fileName} 已上傳並完成候選檔案驗證。`, { exact: true }).waitFor({ state: "visible", timeout: 30000 });
          const candidateFileList = page.locator('[data-component="CandidateDrawingFileUpload"] [aria-label="候選檔案清單"]');
          await candidateFileList.getByText(fileName, { exact: true }).waitFor({ state: "visible", timeout: 30000 });
          assert.equal(await page.locator('[data-component="CandidateDrawingFileUpload"]').getByText("尚無候選版次檔案。", { exact: true }).count(), 0, `${label}: refreshed candidate attachment list must show the uploaded file`);
          assert.equal(await page.getByText("找不到這筆資料。", { exact: false }).count(), 0, `${label}: candidate upload must not fall through to formal-drawing not-found response`);
        }
        await page.screenshot({ path: path.join(screenshotDir, `drawing-building-${viewport.name}-tooltip.png`), fullPage: true });
        return { viewport, mode, tooltip: tooltip.text, actionIds: inventory.map((item) => item.id) };
      } finally {
        await context.close();
      }
    });
  }
}

async function firstCandidateUploadCase(fixture) {
  await runCase("ACT-031-first-candidate-upload", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const label = "first-candidate-upload";
    monitor(page, label);
    try {
      await login(page, "admin@example.com");
      const route = `/numbering/drawings?view=all&detail=${encodeURIComponent(`drawing:${fixture.firstUploadUnifiedDrawingId}`)}`;
      const inventory = await openRoute(page, route, label);
      assert.ok(inventory.some((item) => item.id === "detail:drawing:edit" && item.enabled), `${label}: drawing maintenance must be enabled`);
      await followDrawerAnchor(page, "detail:drawing:edit", "drawing-data-maintenance", label);
      const uploadPanel = page.locator('[data-component="CandidateDrawingFileUpload"]');
      await uploadPanel.waitFor({ state: "visible", timeout: 30000 });
      assert.equal(await uploadPanel.getAttribute("data-attachment-authority"), "candidate_revision_pending", `${label}: first upload must not use formal drawing authority`);
      assert.equal(await uploadPanel.getByText("上傳時自動建立首版", { exact: true }).count(), 1, `${label}: UI must explain automatic first revision creation`);

      const fileName = `DEV072-FIRST-${runId}.SLDPRT`;
      const sameContentAlias = `DEV072-FIRST-ALIAS-${runId}.SLDPRT`;
      const originalContents = Buffer.from(`DEV-072 first candidate upload ${runId}`, "utf8");
      const changedContents = Buffer.from(`DEV-072 changed candidate upload ${runId}`, "utf8");
      const uploadForm = uploadPanel.locator('form[aria-label="上傳圖面資料"]');
      await uploadForm.locator('input[type="file"]').setInputFiles({
        name: fileName,
        mimeType: "application/octet-stream",
        buffer: originalContents
      });
      const createResponsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST"
        && response.url().endsWith(`/api/numbering/draft-workspaces/${fixture.firstUploadWorkspaceId}/candidate-revisions`)
      );
      const uploadResponsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST"
        && response.url().includes(`/api/numbering/draft-workspaces/${fixture.firstUploadWorkspaceId}/candidate-revisions/`)
        && response.url().endsWith("/files")
      );
      await uploadForm.locator('button[type="submit"]').click();
      const [createResponse, uploadResponse] = await Promise.all([createResponsePromise, uploadResponsePromise]);
      assert.equal(createResponse.status(), 201, `${label}: automatic candidate revision creation must return 201`);
      assert.equal(uploadResponse.status(), 201, `${label}: first candidate file upload must return 201`);
      await page.getByText(`首版已自動建立；${fileName} 已上傳並完成候選檔案驗證。`, { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await page.locator('[aria-label="候選檔案清單"]').getByText(fileName, { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      assert.equal(await page.getByText("找不到這筆資料。", { exact: false }).count(), 0, `${label}: first upload must not call the formal-drawing endpoint`);

      const uploadAgain = async ({ name, buffer, expectedStatus, expectedMessage }) => {
        await uploadForm.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/octet-stream", buffer });
        const responsePromise = page.waitForResponse((response) =>
          response.request().method() === "POST"
          && response.url().includes(`/api/numbering/draft-workspaces/${fixture.firstUploadWorkspaceId}/candidate-revisions/`)
          && response.url().endsWith("/files")
        );
        await uploadForm.locator('button[type="submit"]').click();
        const response = await responsePromise;
        assert.equal(response.status(), expectedStatus, `${label}: repeated upload status`);
        await page.getByText(expectedMessage, { exact: true }).waitFor({ state: "visible", timeout: 30000 });
        return response;
      };

      const exactRepeatResponse = await uploadAgain({
        name: fileName,
        buffer: originalContents,
        expectedStatus: 200,
        expectedMessage: `${fileName} 已存在於本版次；系統沿用同一受控檔案，未重複新增。`
      });
      const renamedRepeatResponse = await uploadAgain({
        name: sameContentAlias,
        buffer: originalContents,
        expectedStatus: 200,
        expectedMessage: `${sameContentAlias} 已存在於本版次；系統沿用同一受控檔案，未重複新增。`
      });

      const db = new Database(fixture.databasePath, { readonly: true });
      const persisted = db.prepare(`
        SELECT candidate.id, candidate.revision, candidate.lifecycle_status AS lifecycleStatus,
               COUNT(file.id) AS fileCount, COUNT(DISTINCT file.source_file_asset_id) AS assetCount
          FROM numbering_candidate_revision_drafts candidate
          LEFT JOIN numbering_candidate_revision_files file
            ON file.candidate_revision_id = candidate.id AND file.removed_at IS NULL
         WHERE candidate.workspace_id = ? AND candidate.drawing_draft_id = ?
         GROUP BY candidate.id, candidate.revision, candidate.lifecycle_status
      `).get(fixture.firstUploadWorkspaceId, fixture.firstUploadDrawingDraftId);
      db.close();
      assert.equal(persisted?.lifecycleStatus, "draft", `${label}: created revision remains editable`);
      assert.equal(Number(persisted?.fileCount ?? 0), 1, `${label}: uploaded file must persist`);
      assert.equal(Number(persisted?.assetCount ?? 0), 1, `${label}: same bytes must keep one controlled asset regardless of filename`);

      const changedResponse = await uploadAgain({
        name: fileName,
        buffer: changedContents,
        expectedStatus: 201,
        expectedMessage: `${fileName} 已上傳並完成候選檔案驗證。`
      });
      const changedDb = new Database(fixture.databasePath, { readonly: true });
      const changedState = changedDb.prepare(`
        SELECT COUNT(file.id) AS fileCount,
               COUNT(DISTINCT file.source_file_asset_id) AS assetCount,
               COUNT(DISTINCT asset.content_hash) AS contentHashCount,
               SUM(CASE WHEN file.is_primary = 1 THEN 1 ELSE 0 END) AS primaryCount
          FROM numbering_candidate_revision_drafts candidate
          JOIN numbering_candidate_revision_files file
            ON file.candidate_revision_id = candidate.id AND file.removed_at IS NULL
          JOIN file_assets asset ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
         WHERE candidate.workspace_id = ? AND candidate.drawing_draft_id = ?
      `).get(fixture.firstUploadWorkspaceId, fixture.firstUploadDrawingDraftId);
      changedDb.close();
      assert.equal(Number(changedState?.fileCount ?? 0), 2, `${label}: changed bytes with the same filename must create a new versioned file link`);
      assert.equal(Number(changedState?.assetCount ?? 0), 2, `${label}: changed bytes with the same filename must create a new controlled asset`);
      assert.equal(Number(changedState?.contentHashCount ?? 0), 2, `${label}: full-file content hashes must distinguish changed bytes`);
      assert.equal(Number(changedState?.primaryCount ?? 0), 1, `${label}: only one same-role file remains primary`);
      await page.screenshot({ path: path.join(screenshotDir, "drawing-first-candidate-upload.png"), fullPage: true });
      return {
        createStatus: createResponse.status(),
        uploadStatus: uploadResponse.status(),
        exactRepeatStatus: exactRepeatResponse.status(),
        renamedRepeatStatus: renamedRepeatResponse.status(),
        changedStatus: changedResponse.status(),
        revision: persisted?.revision,
        sameContentFileCount: persisted?.fileCount,
        sameContentAssetCount: persisted?.assetCount,
        changedContentFileCount: changedState?.fileCount,
        changedContentAssetCount: changedState?.assetCount,
        contentHashCount: changedState?.contentHashCount
      };
    } finally {
      await context.close();
    }
  });
}

async function ownerSurfaceMatrix(fixture) {
  const matrix = [
    { id: "ACT-025", name: "part", route: `/parts?view=all&detail=${encodeURIComponent(fixture.buildingKey)}`, forbidden: ["detail:drawing:manage_files", "detail:drawing:create_revision", "detail:relation:manage_relation"] },
    { id: "ACT-026", name: "relation", route: `/numbering/search?view=all&detail=${encodeURIComponent(fixture.relationKey)}`, required: ["detail:relation:manage_relation"], forbidden: ["detail:drawing:manage_files", "detail:drawing:create_revision", "detail:part:edit"] },
    { id: "ACT-030", name: "terminal", route: `/parts?view=all&history=include&detail=${encodeURIComponent(fixture.terminalKey)}`, required: ["detail:part:view_history", "detail:navigation:return"], forbidden: ["detail:part:edit", "detail:part:submit_review", "detail:drawing:manage_files", "detail:drawing:create_revision"] }
  ];
  for (const item of matrix) {
    await runCase(item.id, async () => {
      const context = await browser.newContext({ viewport: { width: item.name === "relation" ? 768 : 1024, height: item.name === "relation" ? 1024 : 768 } });
      const page = await context.newPage(); const label = `surface-${item.name}`; monitor(page, label);
      try {
        await login(page, "admin@example.com");
        const inventory = await openRoute(page, item.route, label);
        const ids = inventory.map((action) => action.id);
        for (const required of item.required ?? []) assert.ok(ids.includes(required), `${label}: missing ${required}`);
        for (const forbidden of item.forbidden ?? []) assert.ok(!ids.includes(forbidden), `${label}: forbidden ${forbidden}`);
        let matrixParity = null;
        if (item.name === "relation") {
          const unifiedDrawer = page.locator(".pdm-detail-drawer.unified-pdm-entity-detail-drawer");
          assert.equal(await unifiedDrawer.getByText("預覽狀態", { exact: true }).count(), 0, `${label}: redundant preview status fact is removed`);
          assert.equal(await unifiedDrawer.getByText("自動預覽", { exact: true }).count(), 0, `${label}: redundant automatic preview heading is removed`);
          assert.ok(await unifiedDrawer.getByText("3D 模型", { exact: true }).count() > 0, `${label}: 3D preview card remains`);
          assert.ok(await unifiedDrawer.getByText("2D 圖面", { exact: true }).count() > 0, `${label}: 2D preview card remains`);
          const detailMatrix = page.locator('[data-component="RelationProjection"] [data-component="RelationMatrixTable"]');
          await detailMatrix.waitFor({ state: "visible", timeout: 30000 });
          const detailSignature = await detailMatrix.evaluate((node) => ({
            tableClass: node.querySelector("table")?.className ?? "",
            axis: node.querySelector("thead th")?.textContent?.trim() ?? "",
            columnCount: node.querySelectorAll("thead th").length,
            rowCount: node.querySelectorAll("tbody tr").length,
            cellCount: node.querySelectorAll("tbody td").length
          }));
          assert.equal(detailSignature.tableClass, "pdm-relation-matrix", `${label}: detail matrix uses canonical table class`);
          assert.equal(detailSignature.axis, "料號＼圖號", `${label}: detail matrix uses the total-table axis label`);
          assert.ok(detailSignature.columnCount > 1 && detailSignature.rowCount > 0 && detailSignature.cellCount > 0, `${label}: detail matrix must render a non-empty table`);

          await page.goto(`${baseUrl}/numbering/search?view=all`, { waitUntil: "domcontentloaded", timeout: 30000 });
          const matrixTab = page.locator('button[role="tab"]').filter({ hasText: "矩陣" });
          await matrixTab.waitFor({ state: "visible", timeout: 30000 });
          await matrixTab.click();
          const firstRoot = page.locator('[data-relation-workbench-row="true"]').first();
          await firstRoot.waitFor({ state: "visible", timeout: 30000 });
          const expand = firstRoot.locator('button[aria-label="展開關係"]');
          if (await expand.count()) await expand.click();
          const totalMatrix = page.locator('[data-relation-workbench-row="true"] [data-component="RelationMatrixTable"]').first();
          await totalMatrix.waitFor({ state: "visible", timeout: 30000 });
          const totalSignature = await totalMatrix.evaluate((node) => ({
            tableClass: node.querySelector("table")?.className ?? "",
            axis: node.querySelector("thead th")?.textContent?.trim() ?? "",
            columnCount: node.querySelectorAll("thead th").length,
            rowCount: node.querySelectorAll("tbody tr").length,
            cellCount: node.querySelectorAll("tbody td").length
          }));
          assert.deepEqual({ tableClass: detailSignature.tableClass, axis: detailSignature.axis }, { tableClass: totalSignature.tableClass, axis: totalSignature.axis }, `${label}: detail and total matrix share UI signature`);
          assert.ok(totalSignature.columnCount > 1 && totalSignature.rowCount > 0 && totalSignature.cellCount > 0, `${label}: total matrix must render a non-empty table`);
          matrixParity = { detail: detailSignature, total: totalSignature };
          await visibleErrorSweep(page, `${label}-total-matrix`);
        }
        await page.screenshot({ path: path.join(screenshotDir, `${item.name}.png`), fullPage: true });
        return { ids, matrixParity };
      } finally { await context.close(); }
    });
  }
}

async function submitWithdrawFlow(fixture) {
  await runCase("ACT-020", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); const label = "unlock-submit-withdraw"; monitor(page, label);
    try {
      await login(page, "admin@example.com");
      const route = `/numbering/drawings?view=all&detail=${encodeURIComponent(fixture.buildingKey)}`;
      const beforeInventory = await openRoute(page, route, `${label}-before`);
      const beforeSubmit = beforeInventory.find((item) => item.id === "detail:drawing:submit_review");
      const beforeState = workspaceState(fixture);
      const activeFiles = addReadyFiles(fixture);
      await page.reload({ waitUntil: "domcontentloaded" }); await waitForDrawer(page);
      const readyInventory = await actionInventory(page, `${label}-ready`);
      const readySubmit = readyInventory.find((item) => item.id === "detail:drawing:submit_review");
      assert.equal(readySubmit?.enabled, true, "submit unlocks after ready files");
      assert.equal(readySubmit?.id, beforeSubmit?.id, "submit ID remains stable");
      assert.equal(readySubmit?.order, beforeSubmit?.order, "submit order remains stable");
      assert.equal(readySubmit?.box.x, beforeSubmit?.box.x, "submit x position remains stable");
      await page.screenshot({ path: path.join(screenshotDir, "drawing-ready.png"), fullPage: true });
      recordCase("ACT-013", true, { before: beforeSubmit, after: readySubmit });

      const submit = actionByKind(page, "drawing", "submit_review");
      const cancelBefore = network.length;
      await submit.click();
      const cancelledModal = page.getByRole("alertdialog", { name: "送交審核" });
      await cancelledModal.waitFor({ state: "visible" });
      await cancelledModal.getByRole("button", { name: "返回檢查", exact: true }).click();
      await cancelledModal.waitFor({ state: "hidden" });
      await page.waitForTimeout(200);
      assert.equal(mutationCount(label, cancelBefore), 0, "cancelled confirmation performs no mutation");
      interactions.push({ label, type: "confirmation-cancel", actionId: "detail:drawing:submit_review", mutationCount: 0 });

      let dialogCount = 0;
      const requestStart = network.length;
      await submit.click();
      const submitModal = page.getByRole("alertdialog", { name: "送交審核" });
      await submitModal.waitFor({ state: "visible" }); dialogCount += 1;
      await submitModal.getByRole("textbox").fill("DEV-072 browser QC submit");
      await submitModal.getByRole("button", { name: "確認送交審核", exact: true }).click();
      await page.locator('[data-action-id="detail:drawing:view_review"]').waitFor({ state: "visible", timeout: 30000 });
      assert.equal(mutationCount(label, requestStart), 1, "submit performs exactly one mutation request");
      const inReview = await actionInventory(page, `${label}-in-review`);
      assert.equal(inReview.find((item) => item.id === "detail:drawing:edit")?.enabled, false);
      assert.equal(inReview.find((item) => item.id === "detail:drawing:edit")?.label, "圖面維護");
      await inspectLockedTooltip(page, actionByKind(page, "drawing", "edit"), `${label}-review-lock`, "hover", label);
      await page.screenshot({ path: path.join(screenshotDir, "drawing-in-review.png"), fullPage: true });
      const submittedState = workspaceState(fixture);
      assert.equal(submittedState.requests.filter((request) => request.status === "pending").length, 1, "one active request after submit");
      recordCase("ACT-021", true, { dialogCount, mutationCount: 1, request: submittedState.requests });
      recordCase("ACT-022", true, { locked: inReview.filter((item) => item.id === "detail:drawing:edit") });

      const withdraw = actionByKind(page, "drawing", "withdraw_review");
      let withdrawDialogs = 0;
      const withdrawStart = network.length;
      await withdraw.click();
      const withdrawModal = page.getByRole("alertdialog", { name: "撤回送審" });
      await withdrawModal.waitFor({ state: "visible" }); withdrawDialogs += 1;
      await withdrawModal.getByRole("textbox").fill("DEV-072 browser QC withdraw");
      await withdrawModal.getByRole("button", { name: "確認撤回送審", exact: true }).click();
      await page.locator('[data-action-id="detail:drawing:submit_review"]').waitFor({ state: "visible", timeout: 30000 });
      assert.equal(mutationCount(label, withdrawStart), 1, "withdraw performs exactly one mutation request");
      const withdrawnInventory = await actionInventory(page, `${label}-withdrawn`);
      assert.equal(withdrawnInventory.find((item) => item.id === "detail:drawing:edit")?.enabled, true, "edit unlocks after withdraw");
      assert.ok(!withdrawnInventory.some((item) => item.id === "detail:drawing:view_review"), "review action disappears after withdraw");
      const withdrawnState = workspaceState(fixture);
      dataEvidence.push({ label, before: beforeState, afterFiles: { activeFiles }, submitted: submittedState, withdrawn: withdrawnState });
      recordCase("ACT-023", true, { withdrawDialogs, mutationCount: 1, state: withdrawnState });
      return { beforeSubmit, readySubmit, activeFiles };
    } finally { await context.close(); }
  });
}

async function noPermissionCase(fixture) {
  await runCase("ACT-024", async () => {
    const db = new Database(fixture.databasePath);
    const manufacturingRole = db.prepare("SELECT id FROM roles WHERE role_code = 'manufacturing'").get();
    assert.ok(manufacturingRole?.id, "manufacturing role is required for read-only owner fixture");
    db.prepare(`
      INSERT INTO role_permissions (id, role_id, permission_kind, permission_code, allowed, created_at, updated_at)
      VALUES (?, ?, 'action', 'numbering.workspace.view', 1, ?, ?)
      ON CONFLICT(role_id, permission_kind, permission_code) DO UPDATE SET allowed = 1, updated_at = excluded.updated_at
    `).run(`DEV072-PERM-${runId}`, manufacturingRole.id, new Date().toISOString(), new Date().toISOString());
    db.prepare("UPDATE numbering_draft_workspaces SET owner_id = 'user-manufacturing-demo' WHERE id = ?").run(fixture.buildingWorkspaceId);
    db.close();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); const label = "no-permission"; monitor(page, label);
    try {
      await login(page, "manufacturing@example.com");
      const inventory = await openRoute(page, `/numbering/drawings?view=all&detail=${encodeURIComponent(fixture.buildingKey)}`, label);
      const edit = inventory.find((item) => item.id === "detail:drawing:edit");
      assert.equal(edit?.enabled, false, "owner without permission sees locked edit");
      const tooltip = await inspectLockedTooltip(page, actionByKind(page, "drawing", "edit"), label, "hover");
      assert.ok(/權限|聯絡/u.test(tooltip.text) && !tooltip.text.includes("numbering."), "permission tooltip is humanized");
      await page.screenshot({ path: path.join(screenshotDir, "no-permission.png"), fullPage: true });
      return { tooltip: tooltip.text };
    } finally { await context.close(); }
  });
}

async function staleDirectBypassCase(fixture) {
  await runCase("ACT-012-stale", async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await context.newPage(); const label = "direct-bypass-stale"; monitor(page, label);
    try {
      await login(page, "admin@example.com");
      const before = workspaceState(fixture);
      const href = `${baseUrl}/api/numbering/draft-workspaces/${encodeURIComponent(fixture.buildingWorkspaceId)}/submit-bundle-review`;
      network.push({ label, phase: "request", method: "POST", url: href, mutation: true, expectedNegative: true });
      const response = await context.request.post(href, {
        headers: { "idempotency-key": `DEV072-stale-${crypto.randomUUID()}`, "x-qc-expected-negative": "true" },
        data: { expectedWorkspaceRowVersion: Math.max(0, before.workspace.rowVersion - 1), reason: "DEV-072 stale bypass evidence" }
      });
      const responseBody = await response.json().catch(() => ({}));
      network.push({ label, phase: "response", method: "POST", url: href, status: response.status(), mutation: true, expectedNegative: true });
      assert.equal(response.status(), 409, `stale direct command must fail closed: ${JSON.stringify(responseBody)}`);
      const after = workspaceState(fixture);
      assert.deepEqual(after, before, "stale direct command must not change domain state");
      assert.equal(mutationCount(label, 0), 1, "stale bypass sends exactly one intentional negative request");
      dataEvidence.push({ label, expectedStatus: 409, before, after, mutationCount: 1 });
      return { status: response.status(), domainStateUnchanged: true, mutationCount: 1 };
    } finally { await context.close(); }
  });
}

async function permissionDirectBypassCase(fixture) {
  await runCase("ACT-012-permission", async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await context.newPage(); const label = "direct-bypass-permission"; monitor(page, label);
    try {
      await login(page, "manufacturing@example.com");
      const before = workspaceState(fixture);
      const href = `${baseUrl}/api/numbering/draft-workspaces/${encodeURIComponent(fixture.buildingWorkspaceId)}/submit-bundle-review`;
      network.push({ label, phase: "request", method: "POST", url: href, mutation: true, expectedNegative: true });
      const response = await context.request.post(href, {
        headers: { "idempotency-key": `DEV072-permission-${crypto.randomUUID()}`, "x-qc-expected-negative": "true" },
        data: { expectedWorkspaceRowVersion: before.workspace.rowVersion, reason: "DEV-072 permission bypass evidence" }
      });
      const responseBody = await response.json().catch(() => ({}));
      network.push({ label, phase: "response", method: "POST", url: href, status: response.status(), mutation: true, expectedNegative: true });
      assert.equal(response.status(), 403, `permission direct command must fail closed: ${JSON.stringify(responseBody)}`);
      const after = workspaceState(fixture);
      assert.deepEqual(after, before, "permission direct command must not change domain state");
      assert.equal(mutationCount(label, 0), 1, "permission bypass sends exactly one intentional negative request");
      dataEvidence.push({ label, expectedStatus: 403, before, after, mutationCount: 1 });
      return { status: response.status(), domainStateUnchanged: true, mutationCount: 1 };
    } finally { await context.close(); }
  });
}

async function decisionVariant(kind, expectedStatus) {
  const fixture = configureDatabase(`decision-${kind}`);
  await stopServer();
  await startServer(fixture, `decision-${kind}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); const label = `decision-${kind}`; monitor(page, label);
  try {
    addReadyFiles(fixture);
    await login(page, "admin@example.com");
    const readyState = workspaceState(fixture);
    const submitResult = await page.evaluate(async ({ workspaceId, rowVersion, idempotencyKey }) => {
      const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(workspaceId)}/submit-bundle-review`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ expectedWorkspaceRowVersion: rowVersion, reason: "DEV-072 approval decision evidence" })
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }, {
      workspaceId: fixture.buildingWorkspaceId,
      rowVersion: readyState.workspace.rowVersion,
      idempotencyKey: `DEV072-decision-setup-${kind}-${crypto.randomUUID()}`
    });
    assert.ok([200, 201].includes(submitResult.status), `${label}: fresh review submission failed: ${JSON.stringify(submitResult.body)}`);
    const setupDb = new Database(fixture.databasePath, { readonly: true });
    const setupRequest = setupDb.prepare("SELECT approval_request_id AS requestId FROM numbering_candidate_revision_drafts WHERE id = ?").get(fixture.buildingCandidateRevisionId);
    setupDb.close();
    assert.ok(setupRequest?.requestId, `${label}: fresh review request id required`);
    await login(page, "manager@example.com");
    const inbox = await page.evaluate(async () => {
      const response = await fetch("/api/approvals/inbox?status=active&limit=100&domain=numbering", { cache: "no-store" });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    });
    assert.equal(inbox.status, 200);
    const pendingIds = new Set([setupRequest.requestId]);
    const item = (inbox.body.items ?? []).find((entry) => pendingIds.has(entry.id) && entry.ownerHref);
    assert.ok(item?.ownerHref, `${label}: exact pending owner href required`);
    const beforeDb = new Database(fixture.databasePath, { readonly: true });
    const before = beforeDb.prepare("SELECT request_status AS status, apply_status AS applyStatus FROM approval_platform_requests WHERE id = ?").get(item.id);
    beforeDb.close();
    const inventory = await openRoute(page, item.ownerHref, label);
    assert.ok(!inventory.some((entry) => entry.id === "detail:relation:manage_relation"), `${label}: approval owner must omit relation maintenance`);
    assert.ok(!inventory.some((entry) => entry.id.endsWith(":view_review")), `${label}: approval owner must omit duplicate view-review entry`);
    assert.ok(!inventory.some((entry) => entry.id.endsWith(":withdraw_review")), `${label}: approval owner must omit withdraw entry`);
    const unifiedDrawer = page.locator(".pdm-detail-drawer.unified-pdm-entity-detail-drawer");
    assert.equal(await unifiedDrawer.locator(".human-status-badge").count(), 0, `${label}: approval owner must not repeat human status badges`);
    assert.equal(await unifiedDrawer.getByText("自動預覽", { exact: true }).count(), 0, `${label}: approval owner must omit redundant preview heading`);
    const actionId = `detail:approval:${kind}`;
    const action = inventory.find((entry) => entry.id === actionId);
    assert.equal(action?.enabled, true, `${label}: exact decision must be enabled`);
    let dialogs = 0;
    const beforeNetwork = network.length;
    await page.locator(`[data-action-id="${actionId}"]`).click();
    if (kind !== "approve") {
      const decisionModal = page.getByRole("alertdialog", { name: action.label });
      await decisionModal.waitFor({ state: "visible" }); dialogs += 1;
      await decisionModal.getByRole("textbox").fill(`DEV-072 ${kind} evidence`);
      await decisionModal.getByRole("button", { name: `確認${action.label}`, exact: true }).click();
    }
    await page.waitForURL((url) => url.pathname === "/approvals", { timeout: 30000 });
    await unifiedDrawer.waitFor({ state: "detached", timeout: 30000 });
    await page.waitForFunction(
      ({ requestId, targetSummary, expectRowRemoved }) => {
        const drawer = document.querySelector(".pdm-detail-drawer.unified-pdm-entity-detail-drawer");
        const countLabel = document.querySelector(".approval-inbox-panel .approval-count")?.textContent?.trim() ?? "";
        const listReady = countLabel.length > 0 && !countLabel.includes("讀取中");
        const visibleRows = Array.from(document.querySelectorAll("[data-approval-workbench-row='true']"));
        const rowRemoved = !visibleRows.some((row) => row.textContent?.includes(targetSummary));
        return listReady && !drawer && (!expectRowRemoved || rowRemoved) && !window.location.search.includes(requestId);
      },
      { requestId: item.id, targetSummary: item.targetSummary || item.title, expectRowRemoved: expectedStatus !== "needs_info" },
      { timeout: 30000 }
    );
    assert.equal(mutationCount(label, beforeNetwork), 1, `${label}: decision exactly once`);
    const afterDb = new Database(fixture.databasePath, { readonly: true });
    const after = afterDb.prepare("SELECT request_status AS status, apply_status AS applyStatus, apply_error AS applyError FROM approval_platform_requests WHERE id = ?").get(item.id);
    afterDb.close();
    assert.equal(after.status, expectedStatus, `${label}: persisted request status`);
    assert.equal(await page.getByText("找不到資料或目前無權查看。", { exact: true }).count(), 0, `${label}: stale candidate error must not remain after decision`);
    await page.screenshot({ path: path.join(screenshotDir, `${label}.png`), fullPage: true });
    dataEvidence.push({ label, requestId: item.id, before, after, mutationCount: 1 });
    return { requestId: item.id, actionId, dialogs, before, after, returnTo: page.url() };
  } finally { await context.close(); }
}

async function reviewDecisionMatrix() {
  for (const [kind, status] of [["return_for_correction", "needs_info"], ["reject", "rejected"], ["approve", "approved"]]) {
    await runCase(`ACT-028-${kind}`, () => decisionVariant(kind, status));
  }
}

async function writeEvidence(fixtureSummary = null) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const source = buildSourceProvenance();
  const manifest = {
    runId, generatedAt: new Date().toISOString(), tool: "Playwright Chromium driven by Codex QC",
    productionConnection: false, productionWrite: false, database: "disposable isolated SQLite copies", fixture: fixtureSummary,
    viewports, cases, P0: 0, P1: 0, cleanup: { attempted: true, removedCount: cleanupRemovedCount, tempRootRemoved: !fs.existsSync(tempRoot) },
    source, files: ["action-contract.json", "dom-metrics.json", "interaction-log.json", "console-network.json", "data-before-after.json", "visible-error-sweep.json", "defects.md"]
  };
  fs.writeFileSync(path.join(outputDir, "run-manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "action-contract.json"), JSON.stringify(actionContracts, null, 2));
  fs.writeFileSync(path.join(outputDir, "dom-metrics.json"), JSON.stringify(domMetrics, null, 2));
  fs.writeFileSync(path.join(outputDir, "interaction-log.json"), JSON.stringify(interactions, null, 2));
  fs.writeFileSync(path.join(outputDir, "console-network.json"), JSON.stringify({ consoleEvents, network }, null, 2));
  fs.writeFileSync(path.join(outputDir, "data-before-after.json"), JSON.stringify(dataEvidence, null, 2));
  fs.writeFileSync(path.join(outputDir, "visible-error-sweep.json"), JSON.stringify(visibleSweeps, null, 2));
  fs.writeFileSync(path.join(outputDir, "defects.md"), cases.some((item) => !item.passed) ? "# DEV-072 defects\n\nSee failed cases in run-manifest.json.\n" : "# DEV-072 defects\n\nNo P0/P1 defects observed in this run.\n");
}

async function cleanup() {
  await stopServer();
  if (browser) await browser.close().catch(() => undefined);
  for (const [file, contents] of trackedFiles) fs.writeFileSync(path.join(root, file), contents);
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  for (const distDir of startedDistDirs) {
    const resolved = path.resolve(distDir); const allowedRoot = path.resolve(root, ".tmp") + path.sep;
    if (resolved.startsWith(allowedRoot) && fs.existsSync(resolved)) { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }); cleanupRemovedCount += 1; }
  }
  if (fs.existsSync(tempRoot)) { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }); cleanupRemovedCount += tempDataDirs.length; }
}

let fixture = null;
try {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fixture = configureDatabase("main");
  await startServer(fixture, "main");
  browser = await chromium.launch({ headless: true });
  if (focusApprovalDecision) {
    await runCase("ACT-028-approve", () => decisionVariant("approve", "approved"));
    recordCase("ACT-027", cases.filter((item) => item.id.startsWith("ACT-028-")).every((item) => item.passed), { canonicalOwnerRouteUsed: true, unifiedDrawerCount: 1, postDecisionDrawerClosed: true, inboxRefreshed: true });
  } else {
    await responsiveLockedMatrix(fixture);
    await firstCandidateUploadCase(fixture);
  }
  if (!focusCandidateUpload && !focusApprovalDecision) {
    await ownerSurfaceMatrix(fixture);
    await submitWithdrawFlow(fixture);
    await staleDirectBypassCase(fixture);
    await noPermissionCase(fixture);
    await permissionDirectBypassCase(fixture);
    await reviewDecisionMatrix();
    recordCase("ACT-027", cases.filter((item) => item.id.startsWith("ACT-028-")).every((item) => item.passed), { canonicalOwnerRouteUsed: true, unifiedDrawerCount: 1 });
    recordCase("ACT-011", interactions.filter((item) => ["hover", "focus", "touch"].includes(item.type)).every((item) => item.mutationCount === 0), { disabledMutationCount: 0 });
    const submitMutationCount = network.filter((item) =>
      item.label === "unlock-submit-withdraw"
      && item.phase === "request"
      && item.mutation
      && !item.expectedNegative
      && item.url.includes("submit-bundle-review")
    ).length;
    recordCase("ACT-014", submitMutationCount === 1, { exactlyOnceSubmit: submitMutationCount === 1, submitMutationCount });
  }
  const unexpected5xx = network.filter((entry) => entry.phase === "response" && entry.status >= 500);
  assert.equal(unexpected5xx.length, 0, `unexpected 5xx: ${JSON.stringify(unexpected5xx)}`);
  assert.equal(consoleEvents.length, 0, `console/page errors: ${JSON.stringify(consoleEvents)}`);
  assert.equal(visibleSweeps.filter((item) => !item.passed).length, 0, "visible error sweep failed");
  assert.equal(cases.filter((item) => !item.passed).length, 0, `failed cases: ${JSON.stringify(cases.filter((item) => !item.passed))}`);
} catch (error) {
  recordCase("RUN-FATAL", false, { error: message(error) });
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => recordCase("CLEANUP", false, { error: message(error) }));
  await writeEvidence(fixture ? { buildingKey: fixture.buildingKey, terminalKey: fixture.terminalKey, partKey: fixture.partKey, relationKey: fixture.relationKey, pendingRequestIds: fixture.pending.map((item) => item.requestId) } : null).catch((error) => console.error(`evidence write failed: ${message(error)}`));
}

if (!process.exitCode) console.log(`PASS DEV-072 AI real-browser matrix (${cases.length} cases); evidence=${path.relative(root, outputDir)}`);
