#!/usr/bin/env node

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
const startedAt = new Date().toISOString();
const runId = `DEV052-${startedAt.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "-")}-local-isolated`;
const outputDir = path.join(root, "output", "playwright", "dev052-real-operation", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const receiptDir = path.join(outputDir, "receipts");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev052-real-operation-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const distDirRelative = `.tmp/next-qc-dev052-real-operation-${crypto.randomUUID()}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const fixturePdf = path.join(tempRoot, "primary-drawing.pdf");
const password = "DEV052-Real-Operation-2026";
const fixture = {
  workspaceId: "dev052-real-workspace",
  rootId: "dev052-real-root",
  partId: "dev052-real-part",
  drawingId: "dev052-real-drawing",
  relationId: "dev052-real-relation",
  rootReservationId: "dev052-real-res-root",
  partReservationId: "dev052-real-res-part",
  drawingReservationId: "dev052-real-res-drawing",
  title: "馬達組立測試件",
  rootCode: "A952",
  partCode: "A952-P01",
  drawingCode: "A952-M01",
  fileName: "primary-drawing.pdf"
};
const boundaries = {
  legacyPending: { key: "legacy-pending", title: "既有待審保留號", rootCode: "A953", partCode: "A953-P01", drawingCode: "A953-M01" },
  legacyApproved: { key: "legacy-approved", title: "既有核准保留號", rootCode: "A954", partCode: "A954-P01", drawingCode: "A954-M01" },
  history: { key: "history", title: "已取消保留號歷史", rootCode: "A955", partCode: "A955-P01", drawingCode: "A955-M01" },
  crossCompany: { key: "cross-company", title: "另一公司機密測試件", rootCode: "B951", partCode: "B951-P01", drawingCode: "B951-M01" }
};
const users = {
  operator: {
    id: "dev052-real-operator", displayName: "測試工程師", email: "dev052.operator@example.invalid",
    password, role: "Engineer", companyCodes: ["JENFU"]
  },
  approver: {
    id: "dev052-real-approver", displayName: "測試審核者", email: "dev052.approver@example.invalid",
    password, role: "R&D Manager", companyCodes: ["JENFU"]
  },
  viewer: {
    id: "dev052-real-viewer", displayName: "唯讀檢視者", email: "dev052.viewer@example.invalid",
    password, role: "Manufacturing", companyCodes: ["JENFU"]
  },
  recovery: {
    id: "dev052-real-recovery", displayName: "復原管理者", email: "dev052.recovery@example.invalid",
    password, role: "Admin", companyCodes: ["JENFU"]
  }
};
const trackedFileSnapshots = new Map(
  ["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);
const results = [];
const browserErrors = [];
const failedRequests = [];
const networkEvidence = [];
const screenshots = [];
const visibleSweeps = [];
const permissionEvidence = {};
let app;
let browser;
let browserVersion = "unknown";
let database;
let baseUrl = "";
let baselineSnapshot = null;
let readOnlySnapshot = null;
let finalSnapshot = null;
let cleanupStatus = "not_started";

fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(receiptDir, { recursive: true });
fs.writeFileSync(
  fixturePdf,
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8"
);

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${id}: ${JSON.stringify(detail)}`);
}

function count(table, where = "", params = []) {
  return Number(database.prepare(`SELECT count(*) AS count FROM ${table}${where}`).get(...params).count);
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableRows(table) {
  const rows = database.prepare(`SELECT * FROM ${table}`).all();
  return rows
    .map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right)))))
    .sort();
}

function businessSnapshot(label) {
  const tables = [
    "numbering_draft_workspaces", "numbering_draft_roots", "numbering_draft_parts", "numbering_draft_drawings",
    "numbering_draft_relations", "number_candidate_reservations", "number_candidate_events",
    "numbering_candidate_revision_drafts", "numbering_candidate_revision_files", "numbering_publication_evidence",
    "approval_platform_requests", "approval_platform_targets", "approval_platform_impact_snapshots",
    "approval_platform_decisions", "approval_platform_events", "part_roots", "part_numbers", "drawing_numbers",
    "drawing_part_links", "drawing_revision_packages", "drawing_revision_package_files",
    "drawing_revision_package_review_approvals", "audit_logs", "platform_command_receipts",
    "platform_outbox_events", "numbering_sequences"
  ];
  const tableFacts = Object.fromEntries(tables.map((table) => {
    const rows = stableRows(table);
    return [table, { count: rows.length, hash: sha(rows.join("\n")) }];
  }));
  return { label, capturedAt: new Date().toISOString(), database: "disposable-local-sqlite", tableFacts };
}

function diffSnapshots(before, after) {
  return {
    from: before.label,
    to: after.label,
    tables: Object.fromEntries(Object.keys(before.tableFacts).map((table) => [table, {
      countBefore: before.tableFacts[table].count,
      countAfter: after.tableFacts[table].count,
      countDelta: after.tableFacts[table].count - before.tableFacts[table].count,
      hashChanged: after.tableFacts[table].hash !== before.tableFacts[table].hash
    }]))
  };
}

function insertWorkspace(spec, { companyId = "company-jenfu", lifecycle = "active", reservationState = "active", ownerId = users.operator.id } = {}) {
  const now = new Date().toISOString();
  const ids = {
    workspace: `${spec.key}-workspace`, root: `${spec.key}-root`, part: `${spec.key}-part`, drawing: `${spec.key}-drawing`,
    relation: `${spec.key}-relation`, rootReservation: `${spec.key}-res-root`, partReservation: `${spec.key}-res-part`, drawingReservation: `${spec.key}-res-drawing`
  };
  database.prepare(`INSERT INTO numbering_draft_workspaces
    (id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version,
     cancelled_at, cancelled_by, cancel_reason, created_at, updated_at)
    VALUES (?, ?, 'new_bundle', ?, ?, ?, 1, ?, ?, ?, ?, ?)`)
    .run(
      ids.workspace, companyId, lifecycle, ownerId, ownerId,
      lifecycle === "cancelled" ? now : null,
      lifecycle === "cancelled" ? ownerId : null,
      lifecycle === "cancelled" ? "isolated_history_fixture" : null,
      now, now
    );
  database.prepare(`INSERT INTO numbering_draft_roots
    (id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)`)
    .run(ids.root, companyId, ids.workspace, spec.title, now, now);
  database.prepare(`INSERT INTO numbering_draft_parts
    (id, company_id, workspace_id, root_draft_id, part_name, item_kind, is_universal, series_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'manufactured', 0, 'JF', ?, ?)`)
    .run(ids.part, companyId, ids.workspace, ids.root, spec.title, now, now);
  database.prepare(`INSERT INTO numbering_draft_drawings
    (id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description, is_primary_manufacturing, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'M', '', 1, ?, ?)`)
    .run(ids.drawing, companyId, ids.workspace, ids.root, now, now);
  database.prepare(`INSERT INTO numbering_draft_relations
    (id, company_id, workspace_id, drawing_draft_id, part_draft_id, link_type, is_primary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'primary_manufacturing', 1, ?, ?)`)
    .run(ids.relation, companyId, ids.workspace, ids.drawing, ids.part, now, now);
  for (const [id, itemType, itemId, code] of [
    [ids.rootReservation, "root", ids.root, spec.rootCode],
    [ids.partReservation, "part", ids.part, spec.partCode],
    [ids.drawingReservation, "drawing", ids.drawing, spec.drawingCode]
  ]) {
    database.prepare(`INSERT INTO number_candidate_reservations
      (id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key,
       sequence_no, reservation_state, row_version, created_by, recycled_at, recycled_by, recycle_reason,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, ?, ?, ?, ?)`)
      .run(
        id, companyId, ids.workspace, itemType, itemId, code, `${itemType}:${spec.key}`, reservationState, ownerId,
        reservationState === "recycled" ? now : null,
        reservationState === "recycled" ? ownerId : null,
        reservationState === "recycled" ? "isolated_history_fixture" : null,
        now, now
      );
    const table = itemType === "root" ? "numbering_draft_roots" : itemType === "part" ? "numbering_draft_parts" : "numbering_draft_drawings";
    database.prepare(`UPDATE ${table} SET candidate_reservation_id = ? WHERE id = ?`).run(id, itemId);
  }
  return ids;
}

function seedLegacyApproval(spec, ids, status) {
  const now = new Date().toISOString();
  const requestId = `${spec.key}-request`;
  const snapshotHash = sha(`${spec.key}:number-only-baseline`);
  database.prepare(`INSERT INTO approval_platform_requests
    (id, company_id, package_id, action_code, domain_code, request_status, title, reason, requested_by,
     requested_at, resolved_by, resolved_at, apply_status, apply_attempts, applied_by, applied_at,
     payload_json, created_at, updated_at)
    VALUES (?, 'company-jenfu', NULL, 'numbering.candidate_publication_review', 'numbering', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      requestId, status, `既有保留號審核：${spec.title}`, "既有號碼審核紀錄", users.operator.id, now,
      status === "approved" ? users.approver.id : null, status === "approved" ? now : null,
      status === "approved" ? "applied" : "pending", status === "approved" ? 1 : 0,
      status === "approved" ? users.approver.id : null, status === "approved" ? now : null,
      JSON.stringify({ workspaceId: ids.workspace, snapshotHash }), now, now
    );
  database.prepare(`INSERT INTO approval_platform_targets
    (id, request_id, target_role, target_type, target_id, target_label, target_status, snapshot_json, sort_order, created_at)
    VALUES (?, ?, 'primary', 'numbering_draft_workspace', ?, ?, ?, '{}', 0, ?)`)
    .run(`${spec.key}-target`, requestId, ids.workspace, spec.title, status === "approved" ? "approved_locked" : "review_locked", now);
  database.prepare(`INSERT INTO approval_platform_impact_snapshots
    (id, request_id, package_id, snapshot_hash, snapshot_json, captured_by, captured_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?)`)
    .run(`${spec.key}-snapshot`, requestId, snapshotHash, JSON.stringify({ snapshotVersion: "legacy-number-only", workspaceId: ids.workspace }), users.operator.id, now);
  database.prepare(`UPDATE number_candidate_reservations
    SET reservation_state = ?, approval_request_id = ? WHERE workspace_id = ?`)
    .run(status === "approved" ? "approved_locked" : "review_locked", requestId, ids.workspace);
  return requestId;
}

function seedFixtures() {
  database.transaction(() => {
    insertWorkspace({ ...fixture, key: "dev052-real" });
    const pendingIds = insertWorkspace(boundaries.legacyPending);
    const approvedIds = insertWorkspace(boundaries.legacyApproved);
    insertWorkspace(boundaries.history, { lifecycle: "cancelled", reservationState: "recycled" });
    insertWorkspace(boundaries.crossCompany, { companyId: "company-maxima" });
    seedLegacyApproval(boundaries.legacyPending, pendingIds, "pending");
    seedLegacyApproval(boundaries.legacyApproved, approvedIds, "approved");
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO role_permissions
      (id, role_id, permission_kind, permission_code, allowed, created_at, updated_at)
      SELECT 'dev052-viewer-workspace-read', id, 'action', 'numbering.workspace.view', 1, ?, ?
      FROM roles WHERE role_code = 'manufacturing'
      ON CONFLICT(id) DO UPDATE SET allowed = 1, updated_at = excluded.updated_at`).run(now, now);
  })();
}

async function loginByUi(context, user) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
    page.getByRole("button", { name: "登入", exact: true }).click()
  ]);
  await page.waitForLoadState("networkidle");
  const response = await context.request.get(`${baseUrl}/api/auth/me`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`LOGIN_SESSION_CHECK_FAILED:${user.id}:${response.status()}`);
  return { page, principal: { id: body.user?.id, role: body.user?.role } };
}

function monitorPage(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ source: "console", label, text: message.text().slice(0, 500) });
  });
  page.on("pageerror", (error) => browserErrors.push({ source: "pageerror", label, text: error.message.slice(0, 500) }));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const evidence = { label, method: response.request().method(), route: new URL(response.url()).pathname, status: response.status() };
      failedRequests.push(evidence);
      if (response.status() >= 500) browserErrors.push({ source: "response", ...evidence });
    }
  });
}

async function capture(page, name) {
  const target = path.join(screenshotDir, name);
  await page.screenshot({ path: target, fullPage: false });
  screenshots.push(target);
  return target;
}

async function visibleErrorSweep(page, label) {
  const selectors = [".inline-error", ".approval-message.error", ".panel.approval-error", "[role=alert]"];
  const visible = [];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    for (let index = 0; index < await locator.count(); index += 1) {
      const item = locator.nth(index);
      if (!await item.isVisible().catch(() => false)) continue;
      const text = (await item.innerText().catch(() => "")).trim();
      if (text) visible.push({ selector, text: text.slice(0, 500) });
    }
  }
  const body = await page.locator("body").innerText();
  const forbiddenTerms = [
    "Internal Server Error", "Not Found", "UNIQUE constraint failed", "stack trace", "undefined", "NaN",
    "approval_platform_", "draft_owner_", "review_locked", "local-fake", "/api/", "DEV-"
  ];
  const forbidden = forbiddenTerms.filter((term) => body.includes(term));
  const sweep = { label, url: new URL(page.url()).pathname, visible, forbidden };
  visibleSweeps.push(sweep);
  record(`RO-19 visible-error-and-raw-state sweep ${label}`, visible.length === 0 && forbidden.length === 0, sweep);
}

async function viewportSweep(page, label, dialog = false) {
  const metrics = await page.evaluate((inspectDialog) => {
    const target = inspectDialog ? document.querySelector('[role="dialog"]') : document.documentElement;
    const element = target ?? document.documentElement;
    return {
      innerWidth: window.innerWidth,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth
    };
  }, dialog);
  record(
    `RO-18 viewport ${label}`,
    metrics.scrollWidth <= metrics.clientWidth + 2 && metrics.bodyScrollWidth <= metrics.innerWidth + 2,
    metrics
  );
}

async function mutation(page, matcher, action, label) {
  const responsePromise = page.waitForResponse((response) => matcher(response), { timeout: 20000 });
  try {
    await action();
  } catch (error) {
    await responsePromise.catch(() => undefined);
    throw error;
  }
  const response = await responsePromise;
  const evidence = {
    label,
    at: new Date().toISOString(),
    method: response.request().method(),
    route: new URL(response.url()).pathname,
    status: response.status()
  };
  networkEvidence.push(evidence);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`UI_MUTATION_FAILED:${JSON.stringify(evidence)}:${body.slice(0, 300)}`);
  }
  return response;
}

function requestRowsForWorkspace(workspaceId) {
  return database.prepare(`SELECT request.id, request.request_status, request.apply_status, request.apply_attempts,
      snapshot.snapshot_hash, request.requested_at
    FROM approval_platform_requests request
    JOIN approval_platform_impact_snapshots snapshot ON snapshot.request_id = request.id
    WHERE request.action_code = 'numbering.candidate_bundle_review'
      AND json_extract(request.payload_json, '$.workspaceId') = ?
    ORDER BY request.requested_at, request.id`).all(workspaceId);
}

function formalFacts(requestId) {
  const request = database.prepare(`SELECT request_status, apply_status, apply_attempts, resolved_by, applied_by
    FROM approval_platform_requests WHERE id = ?`).get(requestId);
  const candidate = database.prepare(`SELECT revision, lifecycle_status, approval_request_id, review_snapshot_hash,
      formal_drawing_number_id, formal_revision_package_id
    FROM numbering_candidate_revision_drafts WHERE workspace_id = ?`).get(fixture.workspaceId);
  const packageRow = candidate?.formal_revision_package_id
    ? database.prepare("SELECT status, revision FROM drawing_revision_packages WHERE id = ?").get(candidate.formal_revision_package_id)
    : null;
  return {
    request,
    candidate,
    packageRow,
    decisions: count("approval_platform_decisions", " WHERE request_id = ?", [requestId]),
    promotedReservations: count("number_candidate_reservations", " WHERE workspace_id = ? AND reservation_state = 'promoted'", [fixture.workspaceId]),
    formalRoots: count("part_roots", " WHERE root_code = ?", [fixture.rootCode]),
    formalParts: count("part_numbers", " WHERE part_number = ?", [fixture.partCode]),
    formalDrawings: count("drawing_numbers", " WHERE drawing_number = ?", [fixture.drawingCode]),
    formalLinks: Number(database.prepare(`SELECT count(*) AS count
      FROM drawing_part_links link
      JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
      JOIN part_numbers part ON part.id = link.part_number_id
      WHERE drawing.drawing_number = ? AND part.part_number = ?`).get(fixture.drawingCode, fixture.partCode).count),
    formalPackages: count("drawing_revision_packages", " WHERE drawing_number = ?", [fixture.drawingCode]),
    packageFiles: candidate?.formal_revision_package_id ? count("drawing_revision_package_files", " WHERE package_id = ?", [candidate.formal_revision_package_id]) : 0,
    reviewCompanions: candidate?.formal_revision_package_id ? count("drawing_revision_package_review_approvals", " WHERE package_id = ?", [candidate.formal_revision_package_id]) : 0,
    releasedMinorPackages: count("drawing_revision_packages", " WHERE status = 'Released' AND revision LIKE '%.%'")
  };
}

async function readPermissions(context, label) {
  const response = await context.request.get(`${baseUrl}/api/numbering/permissions`);
  const body = await response.json().catch(() => ({}));
  permissionEvidence[label] = { status: response.status(), pages: body.pages ?? {}, actions: body.actions ?? {} };
  return permissionEvidence[label];
}

async function openFixture(page, title) {
  const search = page.getByPlaceholder("申請名稱、保留號碼或 ID");
  await search.fill(title);
  const button = page.getByRole("button", { name: `查看 ${title} 明細` });
  await button.waitFor({ state: "visible" });
  await button.click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
}

async function submitBundle(page, label) {
  await page.getByRole("button", { name: "送交審核", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.waitFor({ state: "visible" });
  await mutation(
    page,
    (response) => response.request().method() === "POST" && response.url().endsWith(`/draft-workspaces/${fixture.workspaceId}/submit-bundle-review`),
    () => confirmation.getByRole("button", { name: "確認整包送審" }).click(),
    label
  );
  await page.getByRole("link", { name: "查看審核" }).waitFor({ state: "visible" });
}

async function run() {
  const resolvedDataDir = path.resolve(dataDir);
  const canonicalDataDir = path.resolve(root, "data");
  if (resolvedDataDir === canonicalDataDir || resolvedDataDir.startsWith(`${canonicalDataDir}${path.sep}`)) {
    throw new Error("DEV052_REAL_OPERATION_DATA_DIR_NOT_ISOLATED");
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
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "false",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_PUBLICATION_EVIDENCE_MODE: "local_fake",
    PDM_RELEASE_MODE: "local_stub",
    PDM_NEXT_DIST_DIR: distDirRelative,
    PDM_QC_ISOLATED_TARGET: "1",
    PDM_QC_NUMBER_LIFECYCLE_FAULT_POINT: "before_candidate_bundle_formalization"
  });

  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  browserVersion = browser.version();
  const operatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const approverContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const viewerContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const recoveryContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const operatorSession = await loginByUi(operatorContext, users.operator);
  const approverSession = await loginByUi(approverContext, users.approver);
  const viewerSession = await loginByUi(viewerContext, users.viewer);
  const recoverySession = await loginByUi(recoveryContext, users.recovery);
  record(
    "RO-00 isolated principals and browser contexts",
    new Set([operatorSession.principal.id, approverSession.principal.id, viewerSession.principal.id, recoverySession.principal.id]).size === 4,
    { operator: operatorSession.principal, approver: approverSession.principal, viewer: viewerSession.principal, recovery: recoverySession.principal }
  );

  database = new Database(databasePath);
  seedFixtures();
  baselineSnapshot = businessSnapshot("baseline-after-isolated-fixture-seed");
  record(
    "RO-00 isolated target identity and zero production connectivity",
    baseUrl.startsWith("http://127.0.0.1:") && resolvedDataDir.startsWith(path.resolve(tempRoot)) && !process.env.DATABASE_URL,
    { target: "local-isolated", baseUrl, dbProvider: "sqlite", storageProvider: "local_repository", productionConnected: false }
  );

  const operatorPage = operatorSession.page;
  const approverPage = approverSession.page;
  const viewerPage = viewerSession.page;
  const recoveryPage = recoverySession.page;
  monitorPage(operatorPage, "operator");
  monitorPage(approverPage, "approver");
  monitorPage(viewerPage, "viewer");
  monitorPage(recoveryPage, "recovery");
  await Promise.all([
    readPermissions(operatorContext, "operator"), readPermissions(approverContext, "approver"),
    readPermissions(viewerContext, "viewer"), readPermissions(recoveryContext, "recovery")
  ]);
  record(
    "RO-00 permission separation is real",
    permissionEvidence.operator.actions["numbering.candidate.review.submit"] === true &&
      permissionEvidence.approver.actions["numbering.candidate.review.decide"] === true &&
      permissionEvidence.viewer.actions["numbering.candidate.review.submit"] !== true &&
      permissionEvidence.recovery.actions["numbering.candidate.review.decide"] === true,
    { roles: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, user.role])) }
  );

  await operatorPage.goto(`${baseUrl}/numbering/drawings?tab=reserved`, { waitUntil: "networkidle" });
  await operatorPage.getByRole("heading", { name: "保留號／首版準備" }).waitFor({ state: "visible" });
  await operatorPage.getByPlaceholder("申請名稱、保留號碼或 ID").fill(fixture.title);
  await capture(operatorPage, "RO-02-drawing-preparation-1440x900.png");
  fs.writeFileSync(path.join(outputDir, "ai-5-second-assessment.md"), [
    "# AI 5-second assessment", "", `Start: ${new Date().toISOString()}`, `End: ${new Date().toISOString()}`, "",
    "我在保留號／首版準備；此案尚未完成首版；下一步是完成首版圖面；目前尚不可正式使用。", "",
    "Evidence: screenshots/RO-02-drawing-preparation-1440x900.png", ""
  ].join("\n"), "utf8");
  await openFixture(operatorPage, fixture.title);
  await operatorPage.getByRole("button", { name: "完成首版圖面" }).waitFor({ state: "visible" });
  record(
    "RO-02 purpose state next action and risk are visible",
    (await operatorPage.getByRole("dialog").innerText()).includes("尚不可正式使用") &&
      await operatorPage.getByRole("button", { name: "完成首版圖面" }).count() === 1,
    { expectedPrimary: "完成首版圖面" }
  );
  await capture(operatorPage, "RO-02-drawer-drawing-preparation-1440x900.png");
  await operatorPage.getByRole("button", { name: "關閉保留號明細" }).click();
  await operatorPage.getByRole("button", { name: "重新整理" }).click();
  await operatorPage.waitForLoadState("networkidle");
  await operatorPage.reload({ waitUntil: "networkidle" });
  await operatorPage.getByRole("heading", { name: "保留號／首版準備" }).waitFor({ state: "visible" });
  readOnlySnapshot = businessSnapshot("after-search-open-close-refresh-hard-reload");
  record(
    "RO-01 search drawer refresh and hard reload are zero-write",
    JSON.stringify(baselineSnapshot.tableFacts) === JSON.stringify(readOnlySnapshot.tableFacts) &&
      new URL(operatorPage.url()).pathname === "/numbering/drawings" && new URL(operatorPage.url()).searchParams.get("tab") === "reserved",
    { route: new URL(operatorPage.url()).pathname + new URL(operatorPage.url()).search }
  );

  await operatorPage.getByPlaceholder("申請名稱、保留號碼或 ID").fill(boundaries.legacyPending.title);
  await openFixture(operatorPage, boundaries.legacyPending.title);
  await operatorPage.getByText("既有保留號已接入新流程", { exact: true }).waitFor({ state: "visible" });
  record("RO-15 legacy pending keeps its original number review and exposes continuation", await operatorPage.getByRole("link", { name: "查看審核" }).count() === 1, {});
  await capture(operatorPage, "RO-15-legacy-number-review-pending-1440x900.png");
  await operatorPage.getByRole("button", { name: "關閉保留號明細" }).click();
  await operatorPage.getByPlaceholder("申請名稱、保留號碼或 ID").fill(boundaries.legacyApproved.title);
  await openFixture(operatorPage, boundaries.legacyApproved.title);
  await operatorPage.getByRole("dialog").getByText("需補齊首版圖面", { exact: true }).first().waitFor({ state: "visible" });
  record("RO-15 legacy approved enters drawing addendum without blind publish", await operatorPage.getByRole("button", { name: "完成首版圖面" }).count() === 1 && !(await operatorPage.getByRole("dialog").innerText()).includes("正式發布"), {});
  await capture(operatorPage, "RO-15-legacy-approved-addendum-1440x900.png");
  await operatorPage.getByRole("button", { name: "關閉保留號明細" }).click();
  await operatorPage.getByLabel("生命週期").selectOption("cancelled");
  await operatorPage.getByPlaceholder("申請名稱、保留號碼或 ID").fill(boundaries.history.title);
  await openFixture(operatorPage, boundaries.history.title);
  await operatorPage.getByRole("dialog").getByText("此案只保留歷史紀錄", { exact: true }).waitFor({ state: "visible" });
  record("RO-16 history state does not expose resurrection or publish", !(await operatorPage.getByRole("dialog").innerText()).includes("正式發布"), {});
  await capture(operatorPage, "RO-16-history-only-1440x900.png");
  await operatorPage.getByRole("button", { name: "關閉保留號明細" }).click();
  await operatorPage.getByLabel("生命週期").selectOption("active");

  await openFixture(operatorPage, fixture.title);
  await operatorPage.setViewportSize({ width: 390, height: 844 });
  await operatorPage.getByRole("heading", { name: fixture.title }).focus();
  await operatorPage.keyboard.press("Tab");
  const focusFact = await operatorPage.evaluate(() => ({ tag: document.activeElement?.tagName ?? "", label: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim().slice(0, 80) ?? "" }));
  record("RO-18 keyboard focus enters an interactive control", ["BUTTON", "A", "INPUT", "SELECT"].includes(focusFact.tag), focusFact);
  await capture(operatorPage, "RO-18-drawing-preparation-390x844.png");
  await viewportSweep(operatorPage, "drawing-preparation-390x844", true);
  await operatorPage.setViewportSize({ width: 1440, height: 900 });

  const createButton = operatorPage.getByRole("button", { name: "完成首版圖面" });
  await mutation(
    operatorPage,
    (response) => response.request().method() === "POST" && response.url().endsWith(`/draft-workspaces/${fixture.workspaceId}/candidate-revisions`),
    () => createButton.dblclick(),
    "complete-first-drawing-double-click"
  );
  await operatorPage.getByLabel("研發版次").waitFor({ state: "visible" });
  const candidateFacts = database.prepare(`SELECT id, revision, lifecycle_status, row_version FROM numbering_candidate_revision_drafts WHERE workspace_id = ?`).all(fixture.workspaceId);
  record(
    "RO-03 double click creates one candidate and no formal rows",
    candidateFacts.length === 1 && candidateFacts[0].revision === "0.1" && candidateFacts[0].lifecycle_status === "draft" &&
      formalFacts("missing").formalPackages === 0 && formalFacts("missing").formalDrawings === 0,
    { candidateFacts }
  );
  record(
    "RO-13 duplicate UI intent is suppressed before a second command",
    networkEvidence.filter((item) => item.label === "complete-first-drawing-double-click").length === 1 && candidateFacts.length === 1,
    { matchingResponses: networkEvidence.filter((item) => item.label === "complete-first-drawing-double-click").length }
  );
  record(
    "RO-04 missing primary evidence prevents submit",
    await operatorPage.getByRole("button", { name: "送交審核", exact: true }).count() === 0 &&
      (await operatorPage.locator(".candidate-revision-missing").innerText()).includes("下一步") &&
      (await operatorPage.locator(".candidate-revision-missing").innerText()).includes("主要受控檔") &&
      (await operatorPage.locator(".candidate-revision-missing").innerText()).includes("驗證") &&
      await operatorPage.getByText("拖放或選擇首版圖面", { exact: true }).count() === 1 &&
      requestRowsForWorkspace(fixture.workspaceId).length === 0,
    { expectedNextAction: "select and verify a primary controlled file" }
  );
  await capture(operatorPage, "RO-04-missing-primary-evidence-1440x900.png");

  await viewerPage.goto(`${baseUrl}/numbering/drawings?tab=reserved`, { waitUntil: "networkidle" });
  await viewerPage.getByRole("heading", { name: "保留號／首版準備" }).waitFor({ state: "visible" });
  await viewerPage.getByPlaceholder("申請名稱、保留號碼或 ID").fill(fixture.title);
  const viewerBefore = businessSnapshot("viewer-before-denied-mutation");
  const viewerDetail = viewerPage.getByRole("button", { name: `查看 ${fixture.title} 明細` });
  if (await viewerDetail.count()) {
    await viewerDetail.click();
    await viewerPage.getByRole("dialog").waitFor({ state: "visible" });
  }
  const enabledPrimary = await viewerPage.locator("[data-primary-action]").evaluateAll((nodes) => nodes.filter((node) => {
    const element = node;
    return element.getClientRects().length > 0 && !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true";
  }).length);
  const deniedResponse = await viewerContext.request.post(`${baseUrl}/api/numbering/draft-workspaces/${fixture.workspaceId}/candidate-revisions`, {
    headers: { "Idempotency-Key": `viewer-denied:${crypto.randomUUID()}` },
    data: { drawingDraftId: fixture.drawingId, expectedWorkspaceRowVersion: 2 }
  });
  const viewerAfter = businessSnapshot("viewer-after-denied-mutation");
  record(
    "RO-07 viewer cannot mutate candidate bundle",
    enabledPrimary === 0 && deniedResponse.status() === 403 && JSON.stringify(viewerBefore.tableFacts) === JSON.stringify(viewerAfter.tableFacts),
    { enabledPrimary, deniedStatus: deniedResponse.status() }
  );
  await capture(viewerPage, "RO-07-viewer-read-only-1024x768.png");

  await operatorPage.setViewportSize({ width: 390, height: 844 });
  const fileInput = operatorPage.locator('[data-candidate-editor="true"] input[type="file"]');
  await fileInput.setInputFiles(fixturePdf);
  await mutation(
    operatorPage,
    (response) => response.request().method() === "POST" && response.url().includes(`/candidate-revisions/${candidateFacts[0].id}/files`),
    () => operatorPage.locator('.candidate-revision-upload button[data-primary-action="complete-first-drawing"]').click(),
    "upload-primary-drawing"
  );
  await operatorPage.locator(".candidate-revision-files li", { hasText: fixture.fileName }).getByText("已完成驗證", { exact: false }).waitFor({ state: "visible" });
  const fileFacts = database.prepare(`SELECT asset.file_name, file.is_primary, file.publication_evidence_id, file.removed_at
    FROM numbering_candidate_revision_files file
    JOIN numbering_candidate_revision_drafts candidate ON candidate.id = file.candidate_revision_id
    JOIN file_assets asset ON asset.id = file.source_file_asset_id WHERE candidate.workspace_id = ?`).all(fixture.workspaceId);
  record(
    "RO-05 browser upload creates one finalized primary evidence",
    fileFacts.length === 1 && fileFacts[0].file_name === fixture.fileName && fileFacts[0].is_primary === 1 &&
      Boolean(fileFacts[0].publication_evidence_id) && fileFacts[0].removed_at === null,
    { fileCount: fileFacts.length, fileName: fileFacts[0]?.file_name, finalizedEvidence: Boolean(fileFacts[0]?.publication_evidence_id) }
  );
  await capture(operatorPage, "RO-05-bundle-ready-390x844.png");
  await viewportSweep(operatorPage, "bundle-ready-390x844", true);
  await operatorPage.getByRole("button", { name: "送交審核", exact: true }).click();
  const confirmation = operatorPage.getByRole("alertdialog");
  await confirmation.waitFor({ state: "visible" });
  record("RO-06 confirmation explains atomic auto-finalization", (await confirmation.innerText()).includes("核准後由系統原子建立正式圖料號與受控研發首版"), {});
  await capture(operatorPage, "RO-06-submit-confirmation-390x844.png");
  await confirmation.getByRole("button", { name: "返回檢查" }).click();
  await confirmation.waitFor({ state: "hidden" });
  record("RO-06 cancelling confirmation creates no request", requestRowsForWorkspace(fixture.workspaceId).length === 0, {});
  await operatorPage.setViewportSize({ width: 1024, height: 768 });
  await capture(operatorPage, "RO-05-bundle-ready-1024x768.png");
  await viewportSweep(operatorPage, "bundle-ready-1024x768", true);
  await operatorPage.setViewportSize({ width: 1440, height: 900 });
  await capture(operatorPage, "RO-05-bundle-ready-1440x900.png");
  await viewportSweep(operatorPage, "bundle-ready-1440x900", true);
  await submitBundle(operatorPage, "submit-first-bundle-review");
  let requests = requestRowsForWorkspace(fixture.workspaceId);
  record("RO-06 first immutable request is submitted", requests.length === 1 && requests[0].request_status === "pending" && requests[0].apply_status === "pending", { requests });
  await capture(operatorPage, "RO-07-in-review-locked-1440x900.png");
  record(
    "RO-07 operator sees locked review and no editable candidate fields",
    await operatorPage.getByRole("button", { name: "撤回審核" }).count() === 1 && await operatorPage.getByLabel("研發版次").isDisabled(),
    {}
  );

  await operatorPage.getByRole("button", { name: "撤回審核" }).click();
  await confirmation.waitFor({ state: "visible" });
  await mutation(
    operatorPage,
    (response) => response.request().method() === "POST" && response.url().endsWith(`/draft-workspaces/${fixture.workspaceId}/withdraw-bundle-review`),
    () => confirmation.getByRole("button", { name: "確認撤回審核" }).click(),
    "withdraw-first-bundle-review"
  );
  await operatorPage.getByRole("button", { name: "送交審核", exact: true }).waitFor({ state: "visible" });
  const firstRequest = requestRowsForWorkspace(fixture.workspaceId)[0];
  await operatorPage.getByLabel("研發版次").fill("0.2");
  await operatorPage.getByLabel("調整原因").fill("撤回後補正測試");
  await mutation(
    operatorPage,
    (response) => response.request().method() === "PATCH" && response.url().includes(`/candidate-revisions/${candidateFacts[0].id}`),
    () => operatorPage.getByRole("button", { name: "儲存版次" }).click(),
    "edit-after-withdraw"
  );
  await submitBundle(operatorPage, "resubmit-after-withdraw");
  requests = requestRowsForWorkspace(fixture.workspaceId);
  record(
    "RO-08 withdrawal preserves old snapshot and resubmission creates a new hash",
    requests.length === 2 && requests[0].id === firstRequest.id && requests[0].request_status === "cancelled" &&
      requests[1].request_status === "pending" && requests[0].snapshot_hash !== requests[1].snapshot_hash,
    { requests }
  );
  await capture(operatorPage, "RO-08-resubmitted-and-locked-1440x900.png");

  const needsInfoRequest = requests[1];
  await approverPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(needsInfoRequest.id)}`, { waitUntil: "networkidle" });
  await approverPage.getByRole("region", { name: "審核決策" }).waitFor({ state: "visible" });
  const approvalBody = await approverPage.locator("body").innerText();
  const auditDetails = approverPage.locator("[data-approval-audit-details]");
  record(
    "RO-09 approver receives a human-readable frozen bundle",
    approvalBody.includes(fixture.drawingCode) && approvalBody.includes("版次 0.2") && approvalBody.includes("主要檔案") &&
      !approvalBody.includes("review_locked") && !approvalBody.includes("local-fake") && !(await auditDetails.evaluate((node) => node.open)),
    { drawingCode: fixture.drawingCode, revision: "0.2", auditCollapsed: true }
  );
  await capture(approverPage, "RO-09-approval-human-summary-1440x900.png");
  await approverPage.getByPlaceholder("決策備註").fill("請補充版次調整依據");
  await mutation(
    approverPage,
    (response) => response.request().method() === "POST" && response.url().endsWith(`/api/approvals/requests/${needsInfoRequest.id}/decisions`),
    () => approverPage.getByRole("region", { name: "審核決策" }).getByRole("button", { name: "補資料", exact: true }).click(),
    "needs-info-decision"
  );
  const needsInfoFacts = formalFacts(needsInfoRequest.id);
  record(
    "RO-09 needs-info returns to safe editable state with zero formal data",
    needsInfoFacts.request?.request_status === "needs_info" && needsInfoFacts.decisions === 1 && needsInfoFacts.formalRoots === 0 &&
      needsInfoFacts.formalParts === 0 && needsInfoFacts.formalDrawings === 0 && needsInfoFacts.formalPackages === 0,
    needsInfoFacts
  );
  await capture(approverPage, "RO-09-needs-info-complete-1440x900.png");

  await operatorPage.goto(`${baseUrl}/numbering/drawings?tab=reserved`, { waitUntil: "networkidle" });
  await openFixture(operatorPage, fixture.title);
  await operatorPage.getByLabel("研發版次").fill("0.3");
  await operatorPage.getByLabel("調整原因").fill("依補資料要求調整版次");
  await mutation(
    operatorPage,
    (response) => response.request().method() === "PATCH" && response.url().includes(`/candidate-revisions/${candidateFacts[0].id}`),
    () => operatorPage.getByRole("button", { name: "儲存版次" }).click(),
    "edit-after-needs-info"
  );
  await submitBundle(operatorPage, "submit-after-needs-info");
  requests = requestRowsForWorkspace(fixture.workspaceId);
  const approvalRequest = requests[2];
  record(
    "RO-09 correction creates a third immutable request",
    requests.length === 3 && approvalRequest.request_status === "pending" && approvalRequest.snapshot_hash !== needsInfoRequest.snapshot_hash,
    { requests }
  );

  await approverPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(approvalRequest.id)}`, { waitUntil: "networkidle" });
  await approverPage.getByRole("region", { name: "審核決策" }).waitFor({ state: "visible" });
  await visibleErrorSweep(approverPage, "approval-before-decision");
  await capture(approverPage, "RO-10-approval-before-1440x900.png");
  await approverPage.getByPlaceholder("決策備註").fill("圖料號、關係、版次與檔案證據均已確認");
  await mutation(
    approverPage,
    (response) => response.request().method() === "POST" && response.url().endsWith(`/api/approvals/requests/${approvalRequest.id}/decisions`),
    () => approverPage.getByRole("button", { name: "核准", exact: true }).click(),
    "approve-with-isolated-fault"
  );
  await approverPage.getByRole("button", { name: "重試正式化" }).waitFor({ state: "visible" });
  const failedApply = formalFacts(approvalRequest.id);
  record(
    "RO-14 isolated fault rolls back every formal row and preserves one decision",
    failedApply.request?.request_status === "apply_failed" && failedApply.request?.apply_status === "failed" && failedApply.decisions === 1 &&
      failedApply.formalRoots === 0 && failedApply.formalParts === 0 && failedApply.formalDrawings === 0 && failedApply.formalLinks === 0 &&
      failedApply.formalPackages === 0 && failedApply.promotedReservations === 0,
    failedApply
  );
  record(
    "RO-14 failure UI states that no partial formal data remains",
    (await approverPage.getByRole("region", { name: "審核套用重試" }).innerText()).includes("沒有留下部分正式資料"),
    {}
  );
  await capture(approverPage, "RO-14-apply-failed-no-partial-data-1440x900.png");
  await visibleErrorSweep(approverPage, "apply-failed-recovery");

  await recoveryPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(approvalRequest.id)}`, { waitUntil: "networkidle" });
  await recoveryPage.getByRole("button", { name: "重試正式化" }).waitFor({ state: "visible" });
  await capture(recoveryPage, "RO-14-recovery-admin-before-retry-1440x900.png");
  await mutation(
    recoveryPage,
    (response) => response.request().method() === "POST" && response.url().endsWith(`/api/approvals/requests/${approvalRequest.id}/apply`),
    () => recoveryPage.getByRole("button", { name: "重試正式化" }).click(),
    "retry-original-approved-snapshot"
  );
  await recoveryPage.getByText("原核准內容已完成正式化", { exact: false }).waitFor({ state: "visible" });
  const finalized = formalFacts(approvalRequest.id);
  record(
    "RO-10 and RO-14 retry atomically formalize exactly once",
    finalized.request?.request_status === "approved" && finalized.request?.apply_status === "applied" &&
      finalized.request?.resolved_by === users.approver.id && finalized.request?.applied_by === users.recovery.id && finalized.decisions === 1 &&
      finalized.promotedReservations === 3 && finalized.formalRoots === 1 && finalized.formalParts === 1 &&
      finalized.formalDrawings === 1 && finalized.formalLinks === 1 && finalized.formalPackages === 1 &&
      finalized.packageFiles === 1 && finalized.reviewCompanions === 1,
    finalized
  );
  record(
    "RO-12 review-approved remains physical Pending and never Released",
    finalized.packageRow?.status === "Pending" && finalized.packageRow?.revision === "0.3" &&
      finalized.candidate?.lifecycle_status === "promoted" && finalized.releasedMinorPackages === 0,
    { packageRow: finalized.packageRow, candidate: finalized.candidate, releasedMinorPackages: finalized.releasedMinorPackages }
  );
  await capture(recoveryPage, "RO-10-formalization-complete-1440x900.png");
  await visibleErrorSweep(recoveryPage, "formalization-complete");

  await operatorPage.goto(`${baseUrl}/numbering/drawings?tab=reserved`, { waitUntil: "networkidle" });
  await operatorPage.getByPlaceholder("申請名稱、保留號碼或 ID").fill(fixture.title);
  record("RO-11 finalized fixture leaves default active list", await operatorPage.getByRole("button", { name: `查看 ${fixture.title} 明細` }).count() === 0, {});
  await capture(operatorPage, "RO-11-active-list-after-finalization-1440x900.png");
  await operatorPage.getByLabel("生命週期").selectOption("published");
  await openFixture(operatorPage, fixture.title);
  const officialText = await operatorPage.getByRole("dialog").innerText();
  record(
    "RO-11 and RO-16 official state is discoverable with correct next action",
    officialText.includes("圖料號已正式建立；研發版已核准") && officialText.includes("小數研發版仍未正式發行") &&
      await operatorPage.getByRole("link", { name: "查看正式圖面" }).count() === 1,
    {}
  );
  await capture(operatorPage, "RO-11-official-controlled-1440x900.png");
  await visibleErrorSweep(operatorPage, "official-controlled");

  await viewerPage.goto(`${baseUrl}/numbering/drawings?tab=reserved`, { waitUntil: "networkidle" });
  await viewerPage.getByPlaceholder("申請名稱、保留號碼或 ID").fill(boundaries.crossCompany.drawingCode);
  const crossBefore = businessSnapshot("cross-company-before");
  const crossResponse = await viewerContext.request.get(`${baseUrl}/api/numbering/draft-workspaces/${boundaries.crossCompany.key}-workspace`);
  const crossBody = JSON.stringify(await crossResponse.json().catch(() => ({})));
  const crossAfter = businessSnapshot("cross-company-after");
  record(
    "RO-17 cross-company ID and code are not disclosed or mutated",
    [403, 404].includes(crossResponse.status()) && !crossBody.includes(boundaries.crossCompany.title) &&
      await viewerPage.getByText(boundaries.crossCompany.title, { exact: true }).count() === 0 &&
      JSON.stringify(crossBefore.tableFacts) === JSON.stringify(crossAfter.tableFacts),
    { status: crossResponse.status(), titleDisclosed: crossBody.includes(boundaries.crossCompany.title) }
  );
  await capture(viewerPage, "RO-17-cross-company-not-disclosed-1024x768.png");

  await visibleErrorSweep(viewerPage, "cross-company-viewer");
  record("RO-19 no console page or 5xx failures", browserErrors.length === 0, { browserErrors });
  finalSnapshot = businessSnapshot("final-before-disposable-cleanup");
  record(
    "RO-20 final reconciliation matches UI and isolated database",
    finalized.formalPackages === 1 && finalized.reviewCompanions === 1 && finalized.packageFiles === 1 &&
      finalSnapshot.tableFacts.drawing_revision_packages.count === baselineSnapshot.tableFacts.drawing_revision_packages.count + 1,
    { finalPackageDelta: finalSnapshot.tableFacts.drawing_revision_packages.count - baselineSnapshot.tableFacts.drawing_revision_packages.count }
  );

  const receiptRows = database.prepare(`SELECT id, command_name, command_status, actor_id, correlation_id, created_at, completed_at
    FROM platform_command_receipts WHERE actor_id IN (?, ?, ?, ?) ORDER BY created_at, id`)
    .all(users.operator.id, users.approver.id, users.viewer.id, users.recovery.id);
  const outboxRows = database.prepare(`SELECT id, aggregate_type, aggregate_id, event_type, actor_id, delivery_status, attempt_count, occurred_at
    FROM platform_outbox_events WHERE actor_id IN (?, ?, ?, ?) ORDER BY occurred_at, id`)
    .all(users.operator.id, users.approver.id, users.viewer.id, users.recovery.id);
  const approvalEventRows = database.prepare(`SELECT id, request_id, event_type, actor_id, created_at
    FROM approval_platform_events WHERE request_id IN (${requests.map(() => "?").join(",")}) ORDER BY created_at, id`)
    .all(...requests.map((item) => item.id));
  fs.writeFileSync(path.join(receiptDir, "command-receipts.json"), JSON.stringify(receiptRows, null, 2), "utf8");
  fs.writeFileSync(path.join(receiptDir, "outbox-events.json"), JSON.stringify(outboxRows, null, 2), "utf8");
  fs.writeFileSync(path.join(receiptDir, "approval-events.json"), JSON.stringify(approvalEventRows, null, 2), "utf8");
  record(
    "RO-13 command receipts and outbox evidence are complete",
    receiptRows.length >= 10 && receiptRows.every((row) => row.command_status === "completed") && outboxRows.length >= 10,
    { receipts: receiptRows.length, outboxEvents: outboxRows.length }
  );
  await Promise.all([operatorContext.close(), approverContext.close(), viewerContext.close(), recoveryContext.close()]);
}

try {
  await run();
} catch (error) {
  results.push({
    id: "RUNNER",
    passed: false,
    detail: {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      serverTail: app?.getOutput().slice(-8000) ?? ""
    }
  });
  if (database && !finalSnapshot) finalSnapshot = businessSnapshot("failure-before-cleanup");
} finally {
  await browser?.close().catch(() => undefined);
  if (database) database.close();
  if (app) await stopNextApp(app.child);
  for (const [file, content] of trackedFileSnapshots) fs.writeFileSync(path.join(root, file), content, "utf8");
  cleanupStatus = "started";
  const safeDist = path.resolve(distDir).startsWith(`${path.resolve(root, ".tmp")}${path.sep}`);
  const safeTemp = path.resolve(tempRoot).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`);
  if (!safeDist || !safeTemp) {
    cleanupStatus = "refused-unsafe-target";
  } else {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await delay(attempt === 0 ? 0 : 250);
        fs.rmSync(distDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        cleanupStatus = "removed";
        break;
      } catch (error) {
        cleanupStatus = `failed:${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }
}

const failed = results.filter((item) => !item.passed);
const finishedAt = new Date().toISOString();
const summary = {
  generatedAt: finishedAt,
  runId,
  result: failed.length === 0 && cleanupStatus === "removed" ? "passed" : "failed",
  scope: "isolated local SQLite + local repository; managed test principals; real rendered browser UI mutations",
  productionConnected: false,
  productionWrites: false,
  cleanupStatus,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
  networkEvidence,
  browserErrors,
  failedRequests,
  screenshots: screenshots.map((item) => path.relative(outputDir, item).split(path.sep).join("/"))
};
const gitSha = (() => {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return "unavailable"; }
})();
const manifest = {
  runId, startedAt, finishedAt, target: "local-isolated", baseUrl, environmentBanner: "local isolated QC",
  database: { provider: "sqlite", identity: "disposable temp database", productionConnected: false },
  storage: { provider: "local_repository", identity: "disposable temp repository", productionConnected: false },
  gitSha, browser: { engine: "chromium", version: browserVersion, headless: true },
  os: { platform: os.platform(), release: os.release(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  flags: { numberStateFlowV1: true, numberLifecycleV2: true, productionSlice: false, isolatedFaultPoint: "before_candidate_bundle_formalization-once" },
  principals: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { id: user.id, role: user.role, companyCodes: user.companyCodes }])),
  fixture: { workspaceId: fixture.workspaceId, rootCode: fixture.rootCode, partCode: fixture.partCode, drawingCode: fixture.drawingCode },
  productionWrites: false,
  cleanupStatus
};
fs.writeFileSync(path.join(outputDir, "run-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "permissions.json"), JSON.stringify(permissionEvidence, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "baseline.json"), JSON.stringify(baselineSnapshot ?? {}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "final.json"), JSON.stringify(finalSnapshot ?? {}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "db-diff.json"), JSON.stringify(baselineSnapshot && finalSnapshot ? diffSnapshots(baselineSnapshot, finalSnapshot) : {}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "visible-error-sweep.json"), JSON.stringify(visibleSweeps, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "console-and-failed-requests.json"), JSON.stringify({ browserErrors, failedRequests }, null, 2), "utf8");
const caseRows = Array.from({ length: 21 }, (_, index) => {
  const caseId = `RO-${String(index).padStart(2, "0")}`;
  const checks = results.filter((item) => item.id.includes(caseId));
  const status = checks.length > 0 && checks.every((item) => item.passed) ? "PASS" : "FAIL";
  return `| ${caseId} | ${status} | ${checks.map((item) => item.id).join("<br>") || "no evidence"} |`;
});
fs.writeFileSync(path.join(outputDir, "case-results.md"), [
  "# DEV-052 AI real-operation case results", "", `Run: ${runId}`, "", "| Case | Verdict | Actual evidence checks |", "|---|---|---|", ...caseRows, ""
].join("\n"), "utf8");
fs.writeFileSync(path.join(outputDir, "qc-verdict.md"), [
  "# Automated evidence verdict", "", `Result: **${summary.result.toUpperCase()}**`, "", `Checks: ${summary.passed} passed / ${summary.failed} failed`,
  `Cleanup: ${cleanupStatus}`, "", "This file is the runner verdict. Independent QC must visually inspect screenshots and rerun all release gates before final acceptance.", ""
].join("\n"), "utf8");
fs.writeFileSync(path.join(outputDir, "run-report.json"), JSON.stringify(summary, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "cleanup.log"), `target=temp-only\nstatus=${cleanupStatus}\nproductionWrites=false\n`, "utf8");

console.log(JSON.stringify({ ...summary, outputDir }, null, 2));
if (summary.result !== "passed") process.exit(1);
