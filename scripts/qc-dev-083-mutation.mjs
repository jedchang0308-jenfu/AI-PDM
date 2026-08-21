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
const runId = "DEV083-MUT-" + new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z") + "-" + crypto.randomUUID().slice(0, 8);
const outputDir = path.resolve(root, "output", "qa", "dev-083-mutation", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev083-mutation-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepositoryDir = path.join(root, "data", "repository");
const distDirRelative = ".tmp/qc-dev083-mutation-" + crypto.randomUUID();
const distDir = path.resolve(root, ...distDirRelative.split("/"));
const extraPdf = path.join(tempRoot, "qa083-extra.pdf");
const fixtureDrawing = path.join(tempRoot, "qa083-review.slddrw");
const fixtureModel = path.join(tempRoot, "qa083-review.sldprt");
const results = [];
const mutations = [];
const browserErrors = [];
const failedResponses = [];
let database;
let app;
let browser;
let baseUrl = "";
let currentActor = "admin@example.com";
let fixture;

function msg(error) { return error instanceof Error ? error.message : String(error); }
function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
  if (!passed) console.error("FAIL " + id + ": " + (detail.error ?? JSON.stringify(detail)));
}
async function runCase(id, fn) {
  try { record(id, true, await fn()); } catch (error) { record(id, false, { error: msg(error), stack: error instanceof Error ? error.stack : undefined }); }
}
function one(sql, ...params) { return database.prepare(sql).get(...params) ?? null; }
function many(sql, ...params) { return database.prepare(sql).all(...params); }
function requestCount(start, fragment, method) {
  return mutations.slice(start).filter((item) => item.status === null && item.method === method && item.path.includes(fragment)).length;
}
function auditTail(actor) {
  return many("SELECT actor_id, action, detail_json FROM audit_logs WHERE actor_id = ? ORDER BY created_at DESC, id DESC LIMIT 8", actor);
}
function auditForRequest(actor, requestId) {
  return many("SELECT actor_id, action, detail_json FROM audit_logs WHERE actor_id = ? ORDER BY created_at DESC, id DESC LIMIT 40", actor)
    .filter((row) => {
      try { return JSON.parse(row.detail_json ?? "{}").requestId === requestId; } catch { return false; }
    });
}
async function ready(page, selector) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(250);
}
async function login(page, email) {
  currentActor = email;
  await page.goto(baseUrl + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  const result = await page.evaluate(async (loginEmail) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: "pdm-demo" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, email);
  assert.equal(result.status, 200, email + " login failed: " + JSON.stringify(result.body));
}
function monitor(page, label) {
  page.on("pageerror", (error) => browserErrors.push({ label, actor: currentActor, type: "pageerror", message: msg(error) }));
  page.on("console", (event) => { if (event.type() === "error") browserErrors.push({ label, actor: currentActor, type: "console", message: event.text() }); });
  page.on("response", (response) => { if (response.status() >= 500) failedResponses.push({ label, actor: currentActor, url: response.url(), status: response.status() }); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && url.pathname !== "/api/auth/login") {
      mutations.push({ label, actor: currentActor, method: request.method(), path: url.pathname, status: null, idempotencyKey: request.headers()["idempotency-key"] ?? null });
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    const method = response.request().method();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && url.pathname !== "/api/auth/login") {
      mutations.push({ label, actor: currentActor, method, path: url.pathname, status: response.status(), idempotencyKey: response.request().headers()["idempotency-key"] ?? null });
    }
  });
}
async function waitResponse(page, predicate, action) {
  const response = page.waitForResponse(predicate, { timeout: 30000 });
  await action();
  return response;
}
async function api(page, method, route, body, headers = {}) {
  return page.evaluate(async (input) => {
    const response = await fetch(input.route, {
      method: input.method,
      headers: { "content-type": "application/json", ...input.headers },
      body: input.body === undefined ? undefined : JSON.stringify(input.body)
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { method, route, body, headers });
}
function configure() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDbPath);
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
  fs.writeFileSync(extraPdf, "%PDF-1.4\n% DEV083 disposable PDF evidence\n", "utf8");
  fs.writeFileSync(fixtureDrawing, "DEV083 disposable drawing payload\n", "utf8");
  fs.writeFileSync(fixtureModel, "DEV083 disposable model payload\n", "utf8");
  database = new Database(fixtureDbPath);
  for (const email of ["engineer@example.com", "admin@example.com", "manager@example.com", "manufacturing@example.com", "procurement@example.com", "codex.local.admin@example.invalid"]) {
    database.prepare("UPDATE users SET account_status='active', system_role_enabled=1, session_invalid_before=NULL WHERE email=?").run(email);
    database.prepare("UPDATE auth_identities SET status='active' WHERE login_identifier=?").run(email);
  }
  for (const userId of ["user-engineer-demo", "user-admin-local-quick", "user-manager-demo", "user-manufacturing-demo", "user-procurement-demo"]) {
    database.prepare("UPDATE users SET company_id='company-jenfu' WHERE id=?").run(userId);
    database.prepare("DELETE FROM user_company_memberships WHERE user_id=?").run(userId);
    database.prepare("INSERT INTO user_company_memberships (user_id, company_id, is_default) VALUES (?, 'company-jenfu', 1)").run(userId);
  }
  let review = one("SELECT candidate.workspace_id AS workspaceId, candidate.id AS candidateRevisionId, candidate.approval_request_id AS requestId FROM numbering_candidate_revision_drafts candidate JOIN approval_platform_requests request ON request.id=candidate.approval_request_id WHERE candidate.lifecycle_status='review_locked' AND request.request_status='pending' ORDER BY request.updated_at DESC, request.id LIMIT 1");
  if (!review) {
    const closed = one("SELECT candidate.workspace_id AS workspaceId, candidate.id AS candidateRevisionId, candidate.approval_request_id AS requestId FROM numbering_candidate_revision_drafts candidate JOIN approval_platform_requests request ON request.id=candidate.approval_request_id WHERE candidate.lifecycle_status='promoted' AND request.request_status IN ('approved','needs_info') ORDER BY candidate.updated_at DESC, candidate.id LIMIT 1");
    if (closed?.workspaceId && closed?.candidateRevisionId && closed?.requestId) {
      const stamp = new Date().toISOString();
      database.transaction(() => {
        database.prepare("UPDATE approval_platform_requests SET request_status='pending', resolved_by=NULL, resolved_at=NULL, apply_status='not_ready', apply_attempts=0, apply_error=NULL, applied_by=NULL, applied_at=NULL, updated_at=? WHERE id=?").run(stamp, closed.requestId);
        database.prepare("UPDATE numbering_candidate_revision_drafts SET lifecycle_status='review_locked', formal_drawing_number_id=NULL, formal_revision_package_id=NULL, promoted_at=NULL, updated_at=? WHERE id=?").run(stamp, closed.candidateRevisionId);
        database.prepare("UPDATE numbering_draft_workspaces SET lifecycle_status='active', published_at=NULL, published_by=NULL, updated_at=? WHERE id=?").run(stamp, closed.workspaceId);
      })();
      review = closed;
    }
  }
  const candidate = one("SELECT candidate.workspace_id AS workspaceId, candidate.id AS candidateRevisionId FROM numbering_candidate_revision_drafts candidate JOIN numbering_draft_workspaces workspace ON workspace.id=candidate.workspace_id WHERE workspace.lifecycle_status='active' AND candidate.lifecycle_status='draft' AND EXISTS (SELECT 1 FROM numbering_candidate_revision_files file WHERE file.candidate_revision_id=candidate.id AND file.role='drawing_2d' AND file.is_primary=1 AND file.removed_at IS NULL) AND EXISTS (SELECT 1 FROM numbering_candidate_revision_files file WHERE file.candidate_revision_id=candidate.id AND file.role='cad_3d' AND file.is_primary=1 AND file.removed_at IS NULL) ORDER BY workspace.updated_at DESC, candidate.id LIMIT 1");
  const reviewCandidate = one("SELECT candidate.workspace_id AS workspaceId, candidate.id AS candidateRevisionId FROM numbering_candidate_revision_drafts candidate JOIN numbering_draft_workspaces workspace ON workspace.id=candidate.workspace_id WHERE workspace.lifecycle_status='active' AND candidate.lifecycle_status='draft' AND candidate.id <> ? ORDER BY workspace.updated_at, candidate.id LIMIT 1", candidate?.candidateRevisionId);
  const part = one("SELECT id, part_number AS partNumber FROM part_numbers WHERE record_status NOT IN ('Obsolete','Merged') ORDER BY updated_at DESC, id LIMIT 1");
  let relation = one("SELECT root.id AS rootId, root.root_code AS rootCode FROM part_roots root JOIN part_numbers part ON part.part_root_id=root.id JOIN drawing_part_links link ON link.part_number_id=part.id WHERE root.record_status NOT IN ('Obsolete','Merged') ORDER BY root.created_at, root.id LIMIT 1");
  assert.ok(candidate?.workspaceId && candidate?.candidateRevisionId, "active candidate with verified primary files is required");
  assert.ok(part?.id && part?.partNumber, "formal Part is required");
  assert.ok(relation?.rootId && relation?.rootCode, "formal Relation root is required");
  const syntheticRootId = "dev083-relation-root-" + crypto.randomUUID();
  const syntheticPartId = "dev083-relation-part-" + crypto.randomUUID();
  const syntheticDrawingId = "dev083-relation-drawing-" + crypto.randomUUID();
  const ownerRootId = "dev083-owner-root-" + crypto.randomUUID();
  const ownerPartId = "dev083-owner-part-" + crypto.randomUUID();
  const ownerDrawingId = "dev083-owner-drawing-" + crypto.randomUUID();
  const stamp = new Date().toISOString();
  database.prepare("INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at) VALUES (?, 'company-jenfu', ?, 'DEV083 relation fixture', 'manufactured', 'Active', 'numbering-rule-v3-alpha-root', 'user-admin-local-quick', ?, ?)").run(syntheticRootId, "DEV083-R" + syntheticRootId.slice(-6), stamp, stamp);
  database.prepare("INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, is_universal, bom_usage_policy, custom_specification, series_code, record_status, universal_reason, created_by, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 1, '01', 'DEV083 relation fixture part', 'manufactured', 0, 'undecided', NULL, 'DEV', 'Active', NULL, 'user-admin-local-quick', ?, ?)").run(syntheticPartId, syntheticRootId, "DEV083-P" + syntheticPartId.slice(-6), stamp, stamp);
  database.prepare("INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 'M', '', 1, 1, 'Active', 'numbering-rule-v3-alpha-root', 'user-admin-local-quick', ?, ?)").run(syntheticDrawingId, syntheticRootId, "DEV083-M" + syntheticDrawingId.slice(-6), stamp, stamp);
  database.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at) VALUES (?, ?, ?, 'primary_manufacturing', 'user-admin-local-quick', ?)").run("dev083-relation-link-" + crypto.randomUUID(), syntheticDrawingId, syntheticPartId, stamp);
  database.prepare("INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at) VALUES (?, 'company-jenfu', ?, 'DEV083 owner fixture', 'manufactured', 'Active', 'numbering-rule-v3-alpha-root', 'user-engineer-demo', ?, ?)").run(ownerRootId, "DEV083-O" + ownerRootId.slice(-6), stamp, stamp);
  database.prepare("INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, is_universal, bom_usage_policy, custom_specification, series_code, record_status, universal_reason, created_by, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 1, '01', 'DEV083 owner fixture part', 'manufactured', 0, 'undecided', NULL, 'DEV', 'Active', NULL, 'user-engineer-demo', ?, ?)").run(ownerPartId, ownerRootId, "DEV083-Q" + ownerPartId.slice(-6), stamp, stamp);
  database.prepare("INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 'M', '', 1, 1, 'Active', 'numbering-rule-v3-alpha-root', 'user-engineer-demo', ?, ?)").run(ownerDrawingId, ownerRootId, "DEV083-N" + ownerDrawingId.slice(-6), stamp, stamp);
  database.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at) VALUES (?, ?, ?, 'primary_manufacturing', 'user-engineer-demo', ?)").run("dev083-owner-link-" + crypto.randomUUID(), ownerDrawingId, ownerPartId, stamp);
  relation = { rootId: syntheticRootId, rootCode: "DEV083-R" + syntheticRootId.slice(-6) };
  const syntheticDrawing = one("SELECT drawing_number AS drawingNumber FROM drawing_numbers WHERE id=?", syntheticDrawingId);
  const syntheticPart = one("SELECT part_number AS partNumber FROM part_numbers WHERE id=?", syntheticPartId);
  const ownerDrawing = one("SELECT drawing_number AS drawingNumber FROM drawing_numbers WHERE id=?", ownerDrawingId);
  const ownerPart = one("SELECT part_number AS partNumber FROM part_numbers WHERE id=?", ownerPartId);
  assert.ok(ownerDrawing?.drawingNumber && ownerPart?.partNumber, "owner identity fixture is required");
  database.prepare("UPDATE numbering_draft_workspaces SET owner_id='user-admin-local-quick' WHERE id=?").run(candidate.workspaceId);
  database.prepare("UPDATE numbering_candidate_revision_drafts SET created_by='user-admin-local-quick', updated_by='user-admin-local-quick' WHERE id=?").run(candidate.candidateRevisionId);
  return { candidateWorkspaceId: candidate.workspaceId, candidateRevisionId: candidate.candidateRevisionId, reviewCandidateWorkspaceId: reviewCandidate?.workspaceId ?? null, reviewCandidateRevisionId: reviewCandidate?.candidateRevisionId ?? null, reviewRequestId: review?.requestId ?? null, partId: part.id, partNumber: part.partNumber, relationRootId: relation.rootId, relationRootCode: relation.rootCode, drawingNumber: syntheticDrawing?.drawingNumber ?? null, relationPartNumber: syntheticPart?.partNumber ?? null, ownerRootId, ownerPartId, ownerPartNumber: ownerPart?.partNumber ?? null, ownerDrawingNumber: ownerDrawing?.drawingNumber ?? null };
}
async function startServer() {
  const port = await getFreePort();
  baseUrl = "http://127.0.0.1:" + port;
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "demo", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir,
    PDM_RELEASE_MODE: "local_stub", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_NUMBER_STATE_FLOW_V1: "true", PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_ENTITY_DETAIL_V1: "true", PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true", PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: distDirRelative, PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_QC_ISOLATED_TARGET: "1", PDM_QC_NUMBER_LIFECYCLE_FAULT_POINT: "before_formal_master_promotion"
  });
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
}
function partVariant() { return partVariantFor(fixture.partNumber); }
function partVariantFor(partNumber) {
  return one("SELECT v.material_label AS materialLabel, v.color_label AS colorLabel, v.surface_treatment AS surfaceTreatment, v.variant_note AS variantNote, v.updated_by AS updatedBy FROM part_variant_attributes v JOIN part_numbers p ON p.id=v.part_number_id WHERE p.part_number=?", partNumber);
}
function relationRows() { return relationRowsFor(fixture.relationRootId); }
function relationRowsFor(rootId) {
  return many("SELECT link.id, link.link_type AS linkType, drawing.drawing_number AS drawingNumber, part.part_number AS partNumber FROM drawing_part_links link JOIN drawing_numbers drawing ON drawing.id=link.drawing_number_id JOIN part_numbers part ON part.id=link.part_number_id WHERE part.part_root_id=? ORDER BY link.id", rootId);
}
function drawingAttachmentRows() { return drawingAttachmentRowsFor(fixture.drawingNumber); }
function drawingAttachmentRowsFor(drawingNumber) {
  return many("SELECT id, file_name AS fileName, revision, uploaded_by AS uploadedBy, deleted_at AS deletedAt FROM file_assets WHERE linked_entity_type='drawing_number' AND linked_entity_id=(SELECT id FROM drawing_numbers WHERE drawing_number=?) ORDER BY created_at, id", drawingNumber);
}
async function multipartApi(page, method, route, filePath, fields = {}) {
  return page.evaluate(async (input) => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(input.bytes)], input.fileName, { type: "application/octet-stream" }));
    for (const [key, value] of Object.entries(input.fields)) form.append(key, value);
    const response = await fetch(input.route, { method: input.method, body: form });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { method, route, bytes: Array.from(fs.readFileSync(filePath)), fileName: path.basename(filePath), fields });
}
async function candidateMutation(page) {
  await login(page, "admin@example.com");
  await page.goto(baseUrl + "/numbering/workspaces/" + encodeURIComponent(fixture.candidateWorkspaceId) + "?intent=edit&returnTo=%2Fparts", { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready(page, '[data-pdm-edit-page="true"] .pdm-edit-page-body');
  const rootInput = page.locator('[data-pdm-edit-page="true"] input').first();
  await rootInput.fill((await rootInput.inputValue()) + " QA083");
  const patchStart = mutations.length;
  const patchResponse = await waitResponse(page, (item) => item.request().method() === "PATCH" && new URL(item.url()).pathname.includes("/api/numbering/draft-workspaces/"), () => page.getByRole("button", { name: "儲存變更", exact: true }).click());
  assert.equal(patchResponse.status(), 200);
  const patchCount = requestCount(patchStart, "/api/numbering/draft-workspaces/", "PATCH");
  const patchReadback = one("SELECT row_version FROM numbering_draft_workspaces WHERE id=?", fixture.candidateWorkspaceId);
  const fileInput = page.locator('[data-candidate-editor="true"] input[type="file"]').first();
  await fileInput.setInputFiles(extraPdf);
  const uploadStart = mutations.length;
  const uploadResponse = await waitResponse(page, (item) => item.request().method() === "POST" && new URL(item.url()).pathname.endsWith("/files"), () => page.getByRole("button", { name: "上傳受控檔案", exact: true }).click());
  assert.ok([200, 201].includes(uploadResponse.status()));
  const uploadCount = requestCount(uploadStart, "/files", "POST");
  const uploadReadback = one("SELECT display_name, role, removed_at FROM numbering_candidate_revision_files WHERE candidate_revision_id=? AND display_name=?", fixture.candidateRevisionId, "qa083-extra.pdf");
  await page.goto(baseUrl + "/numbering/workspaces/" + encodeURIComponent(fixture.candidateWorkspaceId) + "?intent=submit_review&returnTo=%2Fparts", { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready(page, '[data-pdm-edit-page="true"] .pdm-edit-page-body');
  const submitStart = mutations.length;
  const submitPromise = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname.endsWith("/submit-bundle-review"), { timeout: 30000 });
  await page.getByRole("button", { name: "送交審核", exact: true }).dblclick();
  assert.equal((await submitPromise).status(), 200);
  await page.waitForTimeout(500);
  const submitCount = requestCount(submitStart, "/submit-bundle-review", "POST");
  const submitted = one("SELECT lifecycle_status, approval_request_id FROM numbering_candidate_revision_drafts WHERE id=?", fixture.candidateRevisionId);
  await page.goto(baseUrl + "/numbering/workspaces/" + encodeURIComponent(fixture.candidateWorkspaceId) + "?intent=withdraw_review&returnTo=%2Fparts", { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready(page, '[data-pdm-edit-page="true"] .pdm-edit-page-body');
  const withdrawStart = mutations.length;
  const withdrawPromise = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname.endsWith("/withdraw-bundle-review"), { timeout: 30000 });
  await page.getByRole("button", { name: "撤回審核", exact: true }).click();
  assert.equal((await withdrawPromise).status(), 200);
  const withdrawCount = requestCount(withdrawStart, "/withdraw-bundle-review", "POST");
  const withdrawn = one("SELECT lifecycle_status FROM numbering_candidate_revision_drafts WHERE id=?", fixture.candidateRevisionId);
  await page.goto(baseUrl + "/numbering/workspaces/" + encodeURIComponent(fixture.candidateWorkspaceId) + "?intent=cancel&returnTo=%2Fparts", { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready(page, '[data-pdm-edit-page="true"] .pdm-edit-page-body');
  const cancelStart = mutations.length;
  const cancelPromise = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname.endsWith("/cancel"), { timeout: 30000 });
  await page.getByRole("button", { name: "取消申請", exact: true }).click();
  const cancelResponse = await cancelPromise;
  const cancelBody = await cancelResponse.json().catch(() => ({}));
  assert.equal(cancelResponse.status(), 200, JSON.stringify(cancelBody));
  const cancelCount = requestCount(cancelStart, "/cancel", "POST");
  const cancelled = one("SELECT lifecycle_status FROM numbering_candidate_revision_drafts WHERE id=?", fixture.candidateRevisionId);
  const workspace = one("SELECT lifecycle_status FROM numbering_draft_workspaces WHERE id=?", fixture.candidateWorkspaceId);
  record("QA-083-11 candidate edit/file/submit/withdraw/cancel exactly-once", patchCount === 1 && uploadCount === 1 && submitCount === 1 && withdrawCount === 1 && cancelCount === 1 && submitted?.lifecycle_status === "review_locked" && withdrawn?.lifecycle_status === "draft" && cancelled?.lifecycle_status === "draft" && workspace?.lifecycle_status === "cancelled", { patchCount, uploadCount, submitCount, withdrawCount, cancelCount, patchReadback, uploadReadback, submitted, withdrawn, cancelled, workspace, cancelBody });
  record("QA-083-11 candidate recovery readback", Boolean(cancelled) && Boolean(workspace), { cancelled, workspace });
}
async function partMutation(page) {
  await login(page, "admin@example.com");
  await page.goto(baseUrl + "/parts/" + encodeURIComponent(fixture.partId) + "/workspace?intent=edit&returnTo=%2Fparts", { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready(page, '[data-pdm-edit-page="true"] .pdm-edit-page-body');
  const before = partVariant();
  const inputs = page.locator('[data-pdm-edit-page="true"] input');
  await inputs.nth(0).fill("DEV083 材質");
  await inputs.nth(1).fill("DEV083 顏色");
  const start = mutations.length;
  const response = await waitResponse(page, (item) => item.request().method() === "PUT" && new URL(item.url()).pathname.endsWith("/variant"), () => page.getByRole("button", { name: "儲存料號資料", exact: true }).click());
  const after = partVariant();
  const count = requestCount(start, "/variant", "PUT");
  const audit = auditTail("user-admin-local-quick");
  record("QA-083-12 Part owner variant exactly-once with audit/readback", response.status() === 200 && count === 1 && after?.materialLabel === "DEV083 材質" && after?.colorLabel === "DEV083 顏色" && after?.updatedBy === "user-admin-local-quick" && audit.length > 0, { before, after, count, audit });
}
async function permissionMatrix(page) {
  const cases = [];
  for (const actor of ["manager@example.com", "admin@example.com", "manufacturing@example.com"]) {
    await login(page, actor);
    let readyAttempt = 0;
    let readyBody = false;
    for (readyAttempt = 1; readyAttempt <= 3; readyAttempt += 1) {
      await page.goto(baseUrl + "/parts/" + encodeURIComponent(fixture.partId) + "/workspace?intent=edit&returnTo=%2Fparts", { waitUntil: "domcontentloaded", timeout: 30000 });
      try {
        await page.locator('[data-pdm-edit-page="true"] .pdm-edit-page-body').waitFor({ state: "visible", timeout: 10000 });
        readyBody = true;
        break;
      } catch {
        if (readyAttempt < 3) await page.waitForTimeout(500);
      }
    }
    await page.waitForTimeout(250);
    cases.push({ actor, readyAttempt, readyBody, controls: await page.locator('[data-pdm-edit-page="true"] input').count(), alerts: await page.locator('[data-pdm-edit-page="true"] [role=alert]').allTextContents() });
  }
  await login(page, "manager@example.com");
  const managerPartResponse = await api(page, "PUT", "/api/parts/" + encodeURIComponent(fixture.partNumber) + "/variant", { materialLabel: "DEV083 Manager 材質", colorLabel: "DEV083 Manager 顏色" });
  const managerPartReadback = partVariant();
  const managerPartAudit = auditTail("user-manager-demo").filter((item) => item.action === "numbering.part_variant.upsert");
  record("QA-083-19 Part Manager non-owner same-company mutation/audit", managerPartResponse.status === 200 && managerPartReadback?.materialLabel === "DEV083 Manager 材質" && managerPartReadback?.updatedBy === "user-manager-demo" && managerPartAudit.length > 0, { response: managerPartResponse, readback: managerPartReadback, audit: managerPartAudit });

  await login(page, "admin@example.com");
  const adminPartResponse = await api(page, "PUT", "/api/parts/" + encodeURIComponent(fixture.partNumber) + "/variant", { materialLabel: "DEV083 Admin 材質", colorLabel: "DEV083 Admin 顏色" });
  const adminPartReadback = partVariant();
  const adminPartAudit = auditTail("user-admin-local-quick").filter((item) => item.action === "numbering.part_variant.upsert");
  record("QA-083-19 Part Admin non-owner same-company mutation/audit", adminPartResponse.status === 200 && adminPartReadback?.materialLabel === "DEV083 Admin 材質" && adminPartReadback?.updatedBy === "user-admin-local-quick" && adminPartAudit.length > 0, { response: adminPartResponse, readback: adminPartReadback, audit: adminPartAudit });

  await login(page, "manager@example.com");
  const managerDrawingResponse = await multipartApi(page, "POST", "/api/numbering/drawings/" + encodeURIComponent(fixture.drawingNumber) + "/revision-files", fixtureDrawing, { revision: "1.1", display_name: "DEV083 Manager drawing" });
  const managerDrawingReadback = drawingAttachmentRows().find((item) => item.revision === "1.1");
  const managerDrawingAudit = auditTail("user-manager-demo").filter((item) => item.action === "numbering.master_attachment.upload");
  record("QA-083-19 Drawing Manager non-owner upload/audit", managerDrawingResponse.status === 201 && managerDrawingReadback?.uploadedBy === "user-manager-demo" && managerDrawingAudit.length > 0, { response: managerDrawingResponse, readback: managerDrawingReadback, audit: managerDrawingAudit });

  await login(page, "admin@example.com");
  const adminDrawingResponse = await multipartApi(page, "POST", "/api/numbering/drawings/" + encodeURIComponent(fixture.drawingNumber) + "/revision-files", fixtureDrawing, { revision: "1.2", display_name: "DEV083 Admin drawing" });
  const adminDrawingReadback = drawingAttachmentRows().find((item) => item.revision === "1.2");
  const adminDrawingAudit = auditTail("user-admin-local-quick").filter((item) => item.action === "numbering.master_attachment.upload");
  record("QA-083-19 Drawing Admin non-owner upload/audit", adminDrawingResponse.status === 201 && adminDrawingReadback?.uploadedBy === "user-admin-local-quick" && adminDrawingAudit.length > 0, { response: adminDrawingResponse, readback: adminDrawingReadback, audit: adminDrawingAudit });

  const relationDrawing = fixture.drawingNumber;
  const relationPart = fixture.relationPartNumber;
  await login(page, "manager@example.com");
  const managerRelationResponse = await api(page, "POST", "/api/numbering/relations", { operation: "set_reference", drawingNumber: relationDrawing, partNumber: relationPart });
  const managerRelationReadback = relationRows().find((item) => item.drawingNumber === relationDrawing && item.partNumber === relationPart);
  const managerRelationAudit = auditTail("user-manager-demo").filter((item) => item.action === "numbering.drawing_part.relation_maintain");
  record("QA-083-19 Relation Manager non-owner mutation/audit", managerRelationResponse.status === 200 && managerRelationReadback?.linkType === "reference" && managerRelationAudit.length > 0, { response: managerRelationResponse, readback: managerRelationReadback, audit: managerRelationAudit });

  await login(page, "admin@example.com");
  const adminRelationResponse = await api(page, "POST", "/api/numbering/relations", { operation: "set_primary", drawingNumber: relationDrawing, partNumber: relationPart });
  const adminRelationReadback = relationRows().find((item) => item.drawingNumber === relationDrawing && item.partNumber === relationPart);
  const adminRelationAudit = auditTail("user-admin-local-quick").filter((item) => item.action === "numbering.drawing_part.relation_maintain");
  record("QA-083-19 Relation Admin non-owner mutation/audit", adminRelationResponse.status === 200 && adminRelationReadback?.linkType === "primary_manufacturing" && adminRelationAudit.length > 0, { response: adminRelationResponse, readback: adminRelationReadback, audit: adminRelationAudit });

  await login(page, "engineer@example.com");
  const engineerNonOwnerPartResponse = await api(page, "PUT", "/api/parts/" + encodeURIComponent(fixture.partNumber) + "/variant", { materialLabel: "DEV083 Engineer non-owner 材質", colorLabel: "DEV083 Engineer non-owner 顏色" });
  const engineerNonOwnerPartReadback = partVariant();
  const engineerNonOwnerPartAudit = auditTail("user-engineer-demo").filter((item) => item.action === "numbering.part_variant.upsert");
  const engineerNonOwnerDrawingResponse = await multipartApi(page, "POST", "/api/numbering/drawings/" + encodeURIComponent(fixture.drawingNumber) + "/revision-files", fixtureDrawing, { revision: "1.5", display_name: "DEV083 Engineer non-owner drawing" });
  const engineerNonOwnerDrawingReadback = drawingAttachmentRows().find((item) => item.revision === "1.5");
  const engineerNonOwnerDrawingAudit = auditTail("user-engineer-demo").filter((item) => item.action === "numbering.master_attachment.upload");
  const engineerNonOwnerRelationResponse = await api(page, "POST", "/api/numbering/relations", { operation: "set_reference", drawingNumber: relationDrawing, partNumber: relationPart });
  const engineerNonOwnerRelationReadback = relationRows().find((item) => item.drawingNumber === relationDrawing && item.partNumber === relationPart);
  const engineerNonOwnerRelationAudit = auditTail("user-engineer-demo").filter((item) => item.action === "numbering.drawing_part.relation_maintain");
  record("QA-083-19 Engineer non-owner same-company mutation/audit", engineerNonOwnerPartResponse.status === 200 && engineerNonOwnerPartReadback?.updatedBy === "user-engineer-demo" && engineerNonOwnerPartAudit.length > 0 && engineerNonOwnerDrawingResponse.status === 201 && engineerNonOwnerDrawingReadback?.uploadedBy === "user-engineer-demo" && engineerNonOwnerDrawingAudit.length > 0 && engineerNonOwnerRelationResponse.status === 200 && engineerNonOwnerRelationReadback?.linkType === "reference" && engineerNonOwnerRelationAudit.length > 0, { part: { response: engineerNonOwnerPartResponse, readback: engineerNonOwnerPartReadback, audit: engineerNonOwnerPartAudit }, drawing: { response: engineerNonOwnerDrawingResponse, readback: engineerNonOwnerDrawingReadback, audit: engineerNonOwnerDrawingAudit }, relation: { response: engineerNonOwnerRelationResponse, readback: engineerNonOwnerRelationReadback, audit: engineerNonOwnerRelationAudit } });

  const ownerPartRoute = "/api/parts/" + encodeURIComponent(fixture.ownerPartNumber) + "/variant";
  const ownerDrawingRoute = "/api/numbering/drawings/" + encodeURIComponent(fixture.ownerDrawingNumber) + "/revision-files";
  const ownerRelationDrawing = fixture.ownerDrawingNumber;
  const ownerRelationPart = fixture.ownerPartNumber;
  const engineerOwnerPartResponse = await api(page, "PUT", ownerPartRoute, { materialLabel: "DEV083 Engineer owner 材質", colorLabel: "DEV083 Engineer owner 顏色" });
  const engineerOwnerPartReadback = partVariantFor(fixture.ownerPartNumber);
  const engineerOwnerPartAudit = auditTail("user-engineer-demo").filter((item) => item.action === "numbering.part_variant.upsert");
  const engineerOwnerDrawingResponse = await multipartApi(page, "POST", ownerDrawingRoute, fixtureDrawing, { revision: "1.1", display_name: "DEV083 Engineer owner drawing" });
  const engineerOwnerDrawingReadback = drawingAttachmentRowsFor(fixture.ownerDrawingNumber).find((item) => item.revision === "1.1");
  const engineerOwnerDrawingAudit = auditTail("user-engineer-demo").filter((item) => item.action === "numbering.master_attachment.upload");
  const engineerOwnerRelationResponse = await api(page, "POST", "/api/numbering/relations", { operation: "set_reference", drawingNumber: ownerRelationDrawing, partNumber: ownerRelationPart });
  const engineerOwnerRelationReadback = relationRowsFor(fixture.ownerRootId).find((item) => item.drawingNumber === ownerRelationDrawing && item.partNumber === ownerRelationPart);
  const engineerOwnerRelationAudit = auditTail("user-engineer-demo").filter((item) => item.action === "numbering.drawing_part.relation_maintain");
  record("QA-083-19 Engineer owner identity same-company mutation/audit", engineerOwnerPartResponse.status === 200 && engineerOwnerPartReadback?.updatedBy === "user-engineer-demo" && engineerOwnerPartAudit.length > 0 && engineerOwnerDrawingResponse.status === 201 && engineerOwnerDrawingReadback?.uploadedBy === "user-engineer-demo" && engineerOwnerDrawingAudit.length > 0 && engineerOwnerRelationResponse.status === 200 && engineerOwnerRelationReadback?.linkType === "reference" && engineerOwnerRelationAudit.length > 0, { part: { response: engineerOwnerPartResponse, readback: engineerOwnerPartReadback, audit: engineerOwnerPartAudit }, drawing: { response: engineerOwnerDrawingResponse, readback: engineerOwnerDrawingReadback, audit: engineerOwnerDrawingAudit }, relation: { response: engineerOwnerRelationResponse, readback: engineerOwnerRelationReadback, audit: engineerOwnerRelationAudit } });

  await login(page, "manufacturing@example.com");
  const manufacturingPartResponse = await api(page, "PUT", "/api/parts/" + encodeURIComponent(fixture.partNumber) + "/variant", { materialLabel: "DEV083 Manufacturing must fail" });
  const manufacturingDrawingResponse = await multipartApi(page, "POST", "/api/numbering/drawings/" + encodeURIComponent(fixture.drawingNumber) + "/revision-files", fixtureDrawing, { revision: "1.3", display_name: "DEV083 Manufacturing must fail" });
  const manufacturingRelationResponse = await api(page, "POST", "/api/numbering/relations", { operation: "set_reference", drawingNumber: relationDrawing, partNumber: relationPart });
  record("QA-083-19 non-editor same-company fail-closed across domains", [400, 401, 403, 404, 409, 422].includes(manufacturingPartResponse.status) && [400, 401, 403, 404, 409, 422].includes(manufacturingDrawingResponse.status) && [400, 401, 403, 404, 409, 422].includes(manufacturingRelationResponse.status), { part: manufacturingPartResponse, drawing: manufacturingDrawingResponse, relation: manufacturingRelationResponse });

  database.prepare("UPDATE users SET company_id='company-maxima' WHERE id='user-manager-demo'").run();
  database.prepare("UPDATE user_company_memberships SET company_id='company-maxima' WHERE user_id='user-manager-demo'").run();
  await login(page, "manager@example.com");
  const cross = await api(page, "GET", "/api/pdm/entity-details/" + encodeURIComponent("part:" + fixture.partId) + "?surface=part");
  const manager = cases.find((item) => item.actor === "manager@example.com");
  const admin = cases.find((item) => item.actor === "admin@example.com");
  const manufacturing = cases.find((item) => item.actor === "manufacturing@example.com");
  record("QA-083-12 Manager/Admin positive and readonly negative matrix", (manager?.controls ?? 0) > 0 && (admin?.controls ?? 0) > 0 && manufacturing?.controls === 0, { cases });
  record("QA-083-12 cross-company actor denied", [401, 403, 404].includes(cross.status), { status: cross.status, body: cross.body });
  const denied = await api(page, "PUT", "/api/parts/" + encodeURIComponent(fixture.partNumber) + "/variant", { materialLabel: "cross-company must not write" });
  const crossDrawing = await multipartApi(page, "POST", "/api/numbering/drawings/" + encodeURIComponent(fixture.drawingNumber) + "/revision-files", fixtureDrawing, { revision: "1.4", display_name: "DEV083 cross-company must fail" });
  const crossRelation = await api(page, "POST", "/api/numbering/relations", { operation: "set_reference", drawingNumber: relationDrawing, partNumber: relationPart });
  record("QA-083-19 actor/company authority cannot be replaced by route intent", [400, 401, 403, 404].includes(denied.status) && [400, 401, 403, 404].includes(crossDrawing.status) && [400, 401, 403, 404].includes(crossRelation.status), { part: denied, drawing: crossDrawing, relation: crossRelation });
  database.prepare("UPDATE users SET company_id='company-jenfu' WHERE id='user-manager-demo'").run();
  database.prepare("UPDATE user_company_memberships SET company_id='company-jenfu' WHERE user_id='user-manager-demo'").run();
  for (let index = browserErrors.length - 1; index >= 0; index -= 1) {
    const item = browserErrors[index];
    const expectedDeniedResponse = item?.actor === "manager@example.com" && item.type === "console" && /status of (?:a )?(?:400|403|404)\b/u.test(item.message);
    if (expectedDeniedResponse) browserErrors.splice(index, 1);
  }
}
async function relationMutation(page) {
  await login(page, "admin@example.com");
  await page.goto(baseUrl + "/numbering/relations/" + encodeURIComponent(fixture.relationRootId) + "/workspace?intent=manage_relation&returnTo=%2Fnumbering%2Fsearch", { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready(page, '[data-pdm-edit-page="true"] .pdm-edit-page-body');
  const selects = page.locator('[data-pdm-edit-page="true"] select');
  const drawing = await selects.nth(0).inputValue();
  const part = await selects.nth(1).inputValue();
  const operations = [["建立／更新", "link", "link"], ["設為參考", "set_reference", "reference"], ["設為主要製造圖", "set_primary", "primary_manufacturing"], ["移除關聯", "remove", null], ["建立／更新", "link", "link"]];
  const evidence = [];
  for (const operation of operations) {
    const start = mutations.length;
    const responsePromise = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname === "/api/numbering/relations", { timeout: 30000 });
    await page.getByRole("button", { name: operation[0], exact: true }).click();
    const response = await responsePromise;
    const matching = relationRows().filter((row) => row.drawingNumber === drawing && row.partNumber === part);
    evidence.push({ operation: operation[1], status: response.status(), count: requestCount(start, "/api/numbering/relations", "POST"), matching });
    assert.equal(response.status(), 200);
    assert.equal(evidence.at(-1).count, 1);
    if (operation[2] === null) assert.equal(matching.length, 0);
    else if (operation[2] === "link") assert.ok(matching.length > 0);
    else assert.ok(matching.some((row) => row.linkType === operation[2]));
  }
  const audit = auditTail("user-admin-local-quick");
  record("QA-083-13 Relation operations exactly-once with readback", evidence.every((item) => item.status === 200 && item.count === 1) && evidence[0].matching.length > 0 && evidence[1].matching.some((row) => row.linkType === "reference") && evidence[2].matching.some((row) => row.linkType === "primary_manufacturing") && evidence[3].matching.length === 0 && evidence[4].matching.length > 0 && audit.length > 0, { drawing, part, evidence, audit });
}
async function submitReviewerCandidate(page, { upload = false } = {}) {
  await login(page, "admin@example.com");
  if (upload) {
    await page.goto(baseUrl + "/numbering/workspaces/" + encodeURIComponent(fixture.reviewCandidateWorkspaceId) + "?intent=edit&returnTo=%2Fparts", { waitUntil: "domcontentloaded", timeout: 30000 });
    await ready(page, '[data-pdm-edit-page="true"] .pdm-edit-page-body');
    const input = page.locator('[data-candidate-editor="true"] input[type="file"]').first();
    await input.setInputFiles([fixtureDrawing, fixtureModel]);
    const uploadPredicate = (item) => item.request().method() === "POST" && new URL(item.url()).pathname.endsWith("/files");
    const uploadResponsesPromise = new Promise((resolve, reject) => {
      const responses = [];
      const timeout = setTimeout(() => {
        page.off("response", onResponse);
        reject(new Error(`timed out waiting for two reviewer uploads; received ${responses.length}`));
      }, 30000);
      const onResponse = (response) => {
        if (!uploadPredicate(response)) return;
        responses.push(response);
        if (responses.length !== 2) return;
        clearTimeout(timeout);
        page.off("response", onResponse);
        resolve(responses);
      };
      page.on("response", onResponse);
    });
    await page.getByRole("button", { name: "上傳並完成驗證", exact: true }).click();
    const uploadResponses = await uploadResponsesPromise;
    assert.ok(uploadResponses.every((response) => [200, 201].includes(response.status())), JSON.stringify(uploadResponses.map((response) => response.status())));
    const uploadedFiles = many("SELECT role, removed_at FROM numbering_candidate_revision_files WHERE candidate_revision_id=? AND removed_at IS NULL", fixture.reviewCandidateRevisionId);
    assert.ok(uploadedFiles.some((file) => file.role === "drawing_2d") && uploadedFiles.some((file) => file.role === "cad_3d"), JSON.stringify(uploadedFiles));
  }
  await page.goto(baseUrl + "/numbering/workspaces/" + encodeURIComponent(fixture.reviewCandidateWorkspaceId) + "?intent=submit_review&returnTo=%2Fparts", { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready(page, '[data-pdm-edit-page="true"] .pdm-edit-page-body');
  const submitStart = mutations.length;
  const submitPromise = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname.endsWith("/submit-bundle-review"), { timeout: 30000 });
  await page.getByRole("button", { name: "送交審核", exact: true }).click();
  const submitResponse = await submitPromise;
  const submitBody = await submitResponse.json().catch(() => ({}));
  assert.equal(submitResponse.status(), 200, JSON.stringify(submitBody));
  await page.waitForTimeout(400);
  const request = one("SELECT id, request_status FROM approval_platform_requests WHERE action_code='numbering.candidate_bundle_review' AND json_extract(payload_json,'$.workspaceId')=? ORDER BY requested_at DESC, id DESC LIMIT 1", fixture.reviewCandidateWorkspaceId);
  assert.equal(request?.request_status, "pending");
  return { requestId: request.id, submitCount: requestCount(submitStart, "/submit-bundle-review", "POST"), submitStatus: submitResponse.status(), submitBody };
}

async function openReviewer(page, requestId) {
  await page.goto(baseUrl + "/approvals/" + encodeURIComponent(requestId) + "?returnTo=%2Fapprovals", { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready(page, '[data-workspace-kind="reviewer"] .dev079-workspace-grid');
}

async function decideReviewer(page, requestId, buttonName, clickMode = "click") {
  await login(page, "admin@example.com");
  await openReviewer(page, requestId);
  const start = mutations.length;
  const responsePromise = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname.endsWith("/decisions"), { timeout: 30000 });
  const button = page.getByRole("button", { name: buttonName, exact: true });
  if (clickMode === "dblclick") await button.dblclick();
  else await button.click();
  const response = await responsePromise;
  await page.waitForTimeout(700);
  return { status: response.status(), count: requestCount(start, "/decisions", "POST"), body: await response.json().catch(() => ({})) };
}

async function retryReviewer(page, requestId) {
  await login(page, "admin@example.com");
  await openReviewer(page, requestId);
  const start = mutations.length;
  const responsePromise = page.waitForResponse((item) => item.request().method() === "POST" && new URL(item.url()).pathname.endsWith("/apply"), { timeout: 30000 });
  await page.getByRole("button", { name: "重試正式化", exact: true }).click();
  const response = await responsePromise;
  await page.waitForTimeout(900);
  return { status: response.status(), count: requestCount(start, "/apply", "POST"), body: await response.json().catch(() => ({})) };
}

async function reviewerMutation(page) {
  assert.ok(fixture.reviewCandidateWorkspaceId && fixture.reviewCandidateRevisionId, "fresh disposable reviewer candidate is required");
  const first = await submitReviewerCandidate(page, { upload: true });
  const firstBefore = one("SELECT request_status FROM approval_platform_requests WHERE id=?", first.requestId);
  const firstDecision = await decideReviewer(page, first.requestId, "要求補資料", "dblclick");
  const firstAfter = one("SELECT request_status, resolved_by FROM approval_platform_requests WHERE id=?", first.requestId);
  const firstDecisionRow = one("SELECT approver_id, decision FROM approval_platform_decisions WHERE request_id=? ORDER BY decided_at DESC LIMIT 1", first.requestId);
  const firstEvents = many("SELECT event_type, actor_id FROM approval_platform_events WHERE request_id=? ORDER BY created_at DESC", first.requestId);
  const firstAudit = auditForRequest("user-admin-local-quick", first.requestId);
  record("QA-083-18 reviewer needs-info exactly-once with idempotency/audit/readback", first.submitCount === 1 && firstDecision.status === 200 && firstDecision.count === 1 && firstBefore?.request_status === "pending" && firstAfter?.request_status === "needs_info" && firstDecisionRow?.approver_id === "user-admin-local-quick" && firstDecisionRow?.decision === "needs_info" && firstEvents.some((item) => item.actor_id === "user-admin-local-quick") && firstAudit.length > 0, { requestId: first.requestId, first, firstBefore, firstDecision, firstAfter, firstDecisionRow, firstEvents, firstAudit });

  await login(page, "manufacturing@example.com");
  const unassignedProjection = await api(page, "GET", "/api/pdm/entity-details/" + encodeURIComponent("candidate:" + fixture.reviewCandidateWorkspaceId) + "?surface=relation&reviewRequestId=" + encodeURIComponent(first.requestId) + "&returnTo=%2Fapprovals");
  const unassignedDecision = await api(page, "POST", "/api/approvals/requests/" + encodeURIComponent(first.requestId) + "/decisions", { decision: "approved", comment: "unassigned must fail" }, { "Idempotency-Key": "qa083-unassigned-" + first.requestId });
  record("QA-083-17 unassigned reviewer fail-closed without full projection", [401, 403, 404].includes(unassignedProjection.status) && [401, 403, 404].includes(unassignedDecision.status), { projection: unassignedProjection, decision: unassignedDecision });

  database.prepare("UPDATE users SET company_id='company-maxima' WHERE id='user-manager-demo'").run();
  database.prepare("UPDATE user_company_memberships SET company_id='company-maxima' WHERE user_id='user-manager-demo'").run();
  await login(page, "manager@example.com");
  const crossProjection = await api(page, "GET", "/api/pdm/entity-details/" + encodeURIComponent("candidate:" + fixture.reviewCandidateWorkspaceId) + "?surface=relation&reviewRequestId=" + encodeURIComponent(first.requestId) + "&returnTo=%2Fapprovals");
  const crossDecision = await api(page, "POST", "/api/approvals/requests/" + encodeURIComponent(first.requestId) + "/decisions", { decision: "approved", comment: "cross company must fail" }, { "Idempotency-Key": "qa083-cross-company-" + first.requestId });
  database.prepare("UPDATE users SET company_id='company-jenfu' WHERE id='user-manager-demo'").run();
  database.prepare("UPDATE user_company_memberships SET company_id='company-jenfu' WHERE user_id='user-manager-demo'").run();
  record("QA-083-17 cross-company reviewer fail-closed without full projection", [401, 403, 404].includes(crossProjection.status) && [401, 403, 404].includes(crossDecision.status), { projection: crossProjection, decision: crossDecision });

  await login(page, "admin@example.com");
  const missingTargetProjection = await api(page, "GET", "/api/pdm/entity-details/" + encodeURIComponent("candidate:" + fixture.candidateWorkspaceId) + "?surface=relation&reviewRequestId=" + encodeURIComponent(first.requestId) + "&returnTo=%2Fapprovals");
  record("QA-083-17 missing target receipt fail-closed", [401, 403, 404].includes(missingTargetProjection.status), { status: missingTargetProjection.status, body: missingTargetProjection.body, requestTargetCount: many("SELECT id FROM approval_platform_targets WHERE request_id=?", first.requestId).length, requestedEntity: "candidate:" + fixture.candidateWorkspaceId, requestEntity: "candidate:" + fixture.reviewCandidateWorkspaceId });

  const second = await submitReviewerCandidate(page);
  const rejected = await decideReviewer(page, second.requestId, "退回修正", "dblclick");
  const rejectedState = one("SELECT request_status, apply_status, apply_attempts FROM approval_platform_requests WHERE id=?", second.requestId);
  const rejectedDecision = one("SELECT approver_id, decision FROM approval_platform_decisions WHERE request_id=? ORDER BY decided_at DESC LIMIT 1", second.requestId);
  const rejectedCandidate = one("SELECT lifecycle_status, approval_request_id FROM numbering_candidate_revision_drafts WHERE id=?", fixture.reviewCandidateRevisionId);
  const rejectedAudit = auditForRequest("user-admin-local-quick", second.requestId);
  record("QA-083-18 reviewer reject exactly-once with terminal readback/audit", second.submitCount === 1 && rejected.status === 200 && rejected.count === 1 && rejectedState?.request_status === "rejected" && rejectedState?.apply_status === "applied" && rejectedDecision?.decision === "rejected" && rejectedCandidate?.lifecycle_status === "draft" && rejectedCandidate?.approval_request_id === null && rejectedAudit.length > 0, { requestId: second.requestId, second, rejected, rejectedState, rejectedDecision, rejectedCandidate, rejectedAudit });
  const terminalBefore = many("SELECT id FROM approval_platform_decisions WHERE request_id=?", second.requestId).length;
  const terminal = await api(page, "POST", "/api/approvals/requests/" + encodeURIComponent(second.requestId) + "/decisions", { decision: "approved", comment: "terminal must fail" }, { "Idempotency-Key": "qa083-terminal-" + second.requestId });
  const terminalAfter = many("SELECT id FROM approval_platform_decisions WHERE request_id=?", second.requestId).length;
  record("QA-083-17 terminal reviewer decision fail-closed", [400, 409, 410].includes(terminal.status) && terminalBefore === terminalAfter, { status: terminal.status, body: terminal.body, terminalBefore, terminalAfter });

  const third = await submitReviewerCandidate(page);
  const originalSnapshotHash = one("SELECT review_snapshot_hash FROM numbering_candidate_revision_drafts WHERE id=?", fixture.reviewCandidateRevisionId)?.review_snapshot_hash;
  database.prepare("UPDATE numbering_candidate_revision_drafts SET review_snapshot_hash=? WHERE id=?").run(String(originalSnapshotHash) + "-DRIFT", fixture.reviewCandidateRevisionId);
  await login(page, "admin@example.com");
  const driftProjection = await api(page, "GET", "/api/pdm/entity-details/" + encodeURIComponent("candidate:" + fixture.reviewCandidateWorkspaceId) + "?surface=relation&reviewRequestId=" + encodeURIComponent(third.requestId) + "&returnTo=%2Fapprovals");
  const driftFlag = driftProjection.body?.projections?.review?.data?.snapshot?.drift === true;
  const driftDecisionBefore = many("SELECT id FROM approval_platform_decisions WHERE request_id=?", third.requestId).length;
  const driftDecision = await decideReviewer(page, third.requestId, "核准");
  const driftDecisionAfter = many("SELECT id FROM approval_platform_decisions WHERE request_id=?", third.requestId).length;
  const driftState = one("SELECT request_status, apply_status, apply_attempts, apply_error FROM approval_platform_requests WHERE id=?", third.requestId);
  const driftFormalData = one("SELECT formal_drawing_number_id, formal_revision_package_id, promoted_at FROM numbering_candidate_revision_drafts WHERE id=?", fixture.reviewCandidateRevisionId);
  database.prepare("UPDATE numbering_candidate_revision_drafts SET review_snapshot_hash=? WHERE id=?").run(originalSnapshotHash, fixture.reviewCandidateRevisionId);
  record("QA-083-17 snapshot drift fail-closed", driftFlag && driftDecision.status === 200 && driftDecision.count === 1 && driftDecisionBefore === 0 && driftDecisionAfter === 1 && driftState?.request_status === "apply_failed" && driftState?.apply_status === "failed" && driftState?.apply_error === "APPROVAL_SNAPSHOT_STALE" && driftFormalData?.formal_drawing_number_id == null && driftFormalData?.formal_revision_package_id == null && driftFormalData?.promoted_at == null, { requestId: third.requestId, projectionStatus: driftProjection.status, driftFlag, driftDecision, driftDecisionBefore, driftDecisionAfter, driftState, driftFormalData });

  const approvedDecision = one("SELECT approver_id, decision FROM approval_platform_decisions WHERE request_id=? ORDER BY decided_at DESC LIMIT 1", third.requestId);
  const failedEvent = many("SELECT event_type, actor_id, detail_json FROM approval_platform_events WHERE request_id=? ORDER BY created_at DESC", third.requestId).find((item) => item.event_type === "approval_platform.request.apply_failed");
  const failedAudit = auditForRequest("user-admin-local-quick", third.requestId);
  record("QA-083-18 reviewer approve enters apply_failed exactly-once", driftDecision.status === 200 && approvedDecision?.approver_id === "user-admin-local-quick" && approvedDecision?.decision === "approved" && failedEvent?.actor_id === "user-admin-local-quick" && failedAudit.length > 0, { requestId: third.requestId, approved: driftDecision, driftState, approvedDecision, failedEvent, failedAudit });

  const retryFirst = await retryReviewer(page, third.requestId);
  const retryFirstState = one("SELECT request_status, apply_status, apply_attempts, apply_error FROM approval_platform_requests WHERE id=?", third.requestId);
  const retryFirstFormalData = one("SELECT formal_drawing_number_id, formal_revision_package_id, promoted_at FROM numbering_candidate_revision_drafts WHERE id=?", fixture.reviewCandidateRevisionId);
  record("QA-083-18 retry fault remains recovery_required without partial formalization", retryFirst.status === 500 && retryFirst.count === 1 && retryFirstState?.request_status === "apply_failed" && retryFirstState?.apply_status === "failed" && Number(retryFirstState?.apply_attempts) === 1 && retryFirstFormalData?.formal_drawing_number_id == null && retryFirstFormalData?.formal_revision_package_id == null && retryFirstFormalData?.promoted_at == null, { requestId: third.requestId, retryFirst, retryFirstState, retryFirstFormalData, isolatedFaultPoint: "before_formal_master_promotion" });

  const retryFinal = await retryReviewer(page, third.requestId);
  const applied = one("SELECT request_status, apply_status, apply_attempts, applied_by FROM approval_platform_requests WHERE id=?", third.requestId);
  const retryEvent = many("SELECT event_type, actor_id, detail_json FROM approval_platform_events WHERE request_id=? ORDER BY created_at DESC", third.requestId).find((item) => item.event_type === "approval_platform.request.applied");
  const retryAudit = auditForRequest("user-admin-local-quick", third.requestId);
  record("QA-083-18 reviewer retry apply exactly-once with audit/readback", retryFinal.status === 200 && retryFinal.count === 1 && applied?.request_status === "approved" && applied?.apply_status === "applied" && Number(applied?.apply_attempts) === 2 && applied?.applied_by === "user-admin-local-quick" && retryEvent?.actor_id === "user-admin-local-quick" && retryAudit.length > 0, { requestId: third.requestId, retryStatus: retryFinal.status, retryCount: retryFinal.count, applied, retryEvent, retryAudit });
  for (let index = failedResponses.length - 1; index >= 0; index -= 1) {
    const item = failedResponses[index];
    if (item?.label === "mutation" && item.actor === "admin@example.com" && item.status === 500 && item.url.includes("/apply")) failedResponses.splice(index, 1);
  }
  for (let index = browserErrors.length - 1; index >= 0; index -= 1) {
    const item = browserErrors[index];
    if (item?.label === "mutation" && item.type === "console" && /status of (?:a )?(?:400|403|404|409|500)\b/u.test(item.message)) browserErrors.splice(index, 1);
  }
  await page.screenshot({ path: path.join(screenshotDir, "reviewer-decision-matrix.png"), fullPage: true });
}
async function main() {
  fixture = configure();
  await startServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  monitor(page, "mutation");
  await runCase("candidate-mutation", () => candidateMutation(page));
  await runCase("part-mutation", () => partMutation(page));
  await runCase("permission-matrix", () => permissionMatrix(page));
  await runCase("relation-mutation", () => relationMutation(page));
  await runCase("reviewer-mutation", () => reviewerMutation(page));
  await page.close();
}
try { fs.mkdirSync(screenshotDir, { recursive: true }); await main(); }
catch (error) { record("DEV-083 mutation runner", false, { error: msg(error), stack: error instanceof Error ? error.stack : undefined, serverTail: app?.getOutput().slice(-12000) ?? "" }); }
finally {
  await browser?.close().catch(() => undefined);
  try { database?.close(); } catch {}
  if (app) await stopNextApp(app.child).catch(() => undefined);
  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
}
const failed = results.filter((item) => !item.passed);
const summary = { runId, generatedAt: new Date().toISOString(), result: failed.length === 0 && browserErrors.length === 0 && failedResponses.length === 0 ? "passed" : "failed", scope: "isolated SQLite + disposable Chromium mutation runner", fixture, results, mutations, browserErrors, failedResponses, cleanupStatus: "removed" };
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(outputDir, "mutation-log.md"), ["# DEV-083 mutation evidence", "", "Run: " + runId, "", "| Case | Result |", "|---|---|", ...results.map((item) => "| " + item.id + " | " + (item.passed ? "PASS" : "FAIL") + " |"), "", "Cleanup: " + summary.cleanupStatus, "Unexpected browser errors: " + browserErrors.length, ""].join("\n"), "utf8");
console.log(JSON.stringify({ ...summary, outputDir }, null, 2));
if (summary.result !== "passed") process.exitCode = 1;
