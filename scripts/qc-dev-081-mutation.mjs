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
const runId = "DEV081-MUT-" + new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z") + "-" + crypto.randomUUID().slice(0, 8);
const outputDir = path.resolve(root, "output", "qa", "dev-081-mutation", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev081-mutation-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepositoryDir = path.join(root, "data", "repository");
const distDirRelative = ".tmp/qc-dev081-mutation-" + crypto.randomUUID();
const distDir = path.resolve(root, ...distDirRelative.split("/"));
const fixtureDrawing = path.join(tempRoot, "qa081-revision.slddrw");
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
let taskPort = null;

function msg(error) { return error instanceof Error ? error.message : String(error); }
function one(sql, ...params) { return database.prepare(sql).get(...params) ?? null; }
function many(sql, ...params) { return database.prepare(sql).all(...params); }
function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
  if (!passed) console.error("FAIL " + id + ": " + (detail.error ?? JSON.stringify(detail)));
}
async function runCase(id, fn) {
  try { record(id, true, await fn()); } catch (error) { record(id, false, { error: msg(error), stack: error instanceof Error ? error.stack : undefined }); }
}
function auditTail(actorId, action = null) {
  return many(
    `SELECT actor_id AS actorId, action, detail_json AS detailJson
       FROM audit_logs WHERE actor_id = ? ${action ? "AND action = ?" : ""}
      ORDER BY created_at DESC, id DESC LIMIT 20`,
    ...(action ? [actorId, action] : [actorId])
  );
}
function receipts(actorId, commandName) {
  return many(
    "SELECT actor_id AS actorId, command_name AS commandName, command_status AS status, idempotency_key AS idempotencyKey FROM platform_command_receipts WHERE actor_id = ? AND command_name = ? ORDER BY created_at DESC, id DESC LIMIT 10",
    actorId, commandName
  );
}
function monitor(page, label) {
  page.on("pageerror", (error) => browserErrors.push({ label, actor: currentActor, type: "pageerror", message: msg(error) }));
  page.on("console", (event) => { if (event.type() === "error") browserErrors.push({ label, actor: currentActor, type: "console", message: event.text() }); });
  page.on("response", (response) => { if (response.status() >= 500) failedResponses.push({ label, actor: currentActor, url: response.url(), status: response.status() }); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && url.pathname !== "/api/auth/login") {
      mutations.push({ label, actor: currentActor, method: request.method(), path: url.pathname, status: null, idempotencyKey: request.headers()["idempotency-key"] ?? request.headers()["Idempotency-Key"] ?? null });
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
async function login(page, email) {
  currentActor = email;
  await page.goto(baseUrl + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  const result = await page.evaluate(async (loginEmail) => {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: loginEmail, password: "pdm-demo" }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, email);
  assert.equal(result.status, 200, email + " login failed: " + JSON.stringify(result.body));
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
async function multipartApi(page, route, filePath, fields = {}) {
  return page.evaluate(async (input) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(input.fields)) form.append(key, String(value));
    form.append("file", new File([new Uint8Array(input.bytes)], input.fileName, { type: "application/octet-stream" }));
    const response = await fetch(input.route, { method: "POST", body: form });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { route, fields, bytes: Array.from(fs.readFileSync(filePath)), fileName: path.basename(filePath) });
}
function configure() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDbPath);
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
  fs.writeFileSync(fixtureDrawing, "DEV-081 disposable drawing revision payload\n", "utf8");
  database = new Database(fixtureDbPath);
  if (!database.pragma("table_info(part_numbers)").some((column) => column.name === "base_uom_code")) database.exec("ALTER TABLE part_numbers ADD COLUMN base_uom_code TEXT");
  if (!database.pragma("table_info(bom_lines_tree)").some((column) => column.name === "quantity_uom_code")) database.exec("ALTER TABLE bom_lines_tree ADD COLUMN quantity_uom_code TEXT");
  if (!database.pragma("table_info(bom_lines_tree)").some((column) => column.name === "quantity_scaled_6")) database.exec("ALTER TABLE bom_lines_tree ADD COLUMN quantity_scaled_6 INTEGER");
  if (!database.pragma("table_info(bom_draft_floating_topics)").some((column) => column.name === "quantity_uom_code")) database.exec("ALTER TABLE bom_draft_floating_topics ADD COLUMN quantity_uom_code TEXT");
  if (!database.pragma("table_info(bom_draft_floating_topics)").some((column) => column.name === "quantity_scaled_6")) database.exec("ALTER TABLE bom_draft_floating_topics ADD COLUMN quantity_scaled_6 INTEGER");
  for (const email of ["engineer@example.com", "admin@example.com", "manager@example.com", "manufacturing@example.com"]) {
    database.prepare("UPDATE users SET account_status='active', system_role_enabled=1, session_invalid_before=NULL WHERE email=?").run(email);
    database.prepare("UPDATE auth_identities SET status='active' WHERE login_identifier=?").run(email);
  }
  for (const userId of ["user-engineer-demo", "user-admin-local-quick", "user-manager-demo", "user-manufacturing-demo"]) {
    database.prepare("UPDATE users SET company_id='company-jenfu' WHERE id=?").run(userId);
    database.prepare("DELETE FROM user_company_memberships WHERE user_id=?").run(userId);
    database.prepare("INSERT INTO user_company_memberships (user_id, company_id, is_default) VALUES (?, 'company-jenfu', 1)").run(userId);
  }
  const part = one(`SELECT p.id AS partId, p.part_number AS partNumber, p.part_name AS partName, p.company_id AS companyId,
      state.row_version AS formalRowVersion, p.part_root_id AS rootId
    FROM part_numbers p
    JOIN canonical_workbench_states state ON state.company_id=p.company_id AND state.entity_type='part'
      AND state.canonical_entity_id=p.id AND state.data_layer='part_formal'
    WHERE p.company_id='company-jenfu' AND p.record_status NOT IN ('Obsolete','Merged')
      AND NOT EXISTS (SELECT 1 FROM part_change_works work WHERE work.company_id=p.company_id AND work.part_id=p.id)
    ORDER BY p.updated_at DESC, p.id LIMIT 1`);
  assert.ok(part?.partId && part.partNumber && Number(part.formalRowVersion) > 0, "formal Part fixture is required");
  const relation = one(`SELECT root.id AS relationRootId, root.root_code AS relationRootCode,
      drawing.id AS relationDrawingId, drawing.drawing_number AS relationDrawingNumber,
      part.id AS relationPartId, part.part_number AS relationPartNumber,
      link.link_type AS relationType
    FROM part_roots root
    JOIN drawing_numbers drawing ON drawing.part_root_id=root.id AND drawing.company_id=root.company_id
    JOIN part_numbers part ON part.part_root_id=root.id AND part.company_id=root.company_id
    JOIN drawing_part_links link ON link.drawing_number_id=drawing.id AND link.part_number_id=part.id
    JOIN drawings formalDrawing ON formalDrawing.formal_drawing_number_id=drawing.id AND formalDrawing.company_id=drawing.company_id
    JOIN canonical_workbench_states drawingState ON drawingState.company_id=formalDrawing.company_id
      AND drawingState.entity_type='drawing' AND drawingState.canonical_entity_id=formalDrawing.id
    JOIN canonical_workbench_states partState ON partState.company_id=part.company_id
      AND partState.entity_type='part' AND partState.canonical_entity_id=part.id
    WHERE root.company_id='company-jenfu' AND root.record_status NOT IN ('Obsolete','Merged')
    ORDER BY root.created_at, root.id LIMIT 1`);
  assert.ok(relation?.relationRootId && relation.relationDrawingId && relation.relationPartId, "formal Relation matrix fixture is required");
  const bomPart = one(`SELECT p.id AS bomPartId, p.part_number AS bomPartNumber, p.part_name AS bomPartName
    FROM part_numbers p
    WHERE p.company_id='company-jenfu' AND p.record_status NOT IN ('Obsolete','Merged')
      AND NOT EXISTS (SELECT 1 FROM bom_drafts draft WHERE draft.company_id=p.company_id AND draft.owner_part_number_id=p.id)
    ORDER BY CASE WHEN p.id=? THEN 0 ELSE 1 END, p.updated_at DESC, p.id LIMIT 1`, part.partId);
  assert.ok(bomPart?.bomPartId && bomPart.bomPartNumber, "BOM owner fixture is required");
  return { ...part, ...relation, ...bomPart };
}
async function startServer() {
  taskPort = await getFreePort();
  baseUrl = "http://127.0.0.1:" + taskPort;
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "demo", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir,
    PDM_RELEASE_MODE: "local_stub", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_NUMBER_STATE_FLOW_V1: "true", PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_ENTITY_DETAIL_V1: "true", PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true", PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_BOM_XMIND_EDITOR_V2_ENABLED: "1", PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: distDirRelative, PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_QC_ISOLATED_TARGET: "1"
  });
  app = startNextApp(root, "dev", taskPort);
  await waitForNextAppReady(baseUrl, app.getOutput);
}
function activePartState() { return one("SELECT row_version AS rowVersion, data_layer AS dataLayer, handling FROM canonical_workbench_states WHERE company_id='company-jenfu' AND entity_type='part' AND canonical_entity_id=? AND data_layer='part_formal'", fixture.partId); }
function partWork(workId) { return one("SELECT id, part_id AS partId, owner_user_id AS ownerUserId, row_version AS rowVersion, proposed_payload AS proposedPayload FROM part_change_works WHERE id=?", workId); }
async function readWorkbench(page) {
  const response = await api(page, "GET", "/api/parts/workbench?limit=100&query=" + encodeURIComponent(fixture.partNumber));
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const groups = response.body?.data?.groups ?? [];
  const row = groups.flatMap((group) => group.rows ?? []).find((candidate) => candidate.entityId === fixture.partId && candidate.layer === "formal");
  assert.ok(row, "formal Part row must be projected");
  assert.ok(response.body?.meta?.contractToken, "workbench contract token is required");
  return { row, token: response.body.meta.contractToken };
}
function commandHeaders(rowVersion, token) {
  return { "if-match": `"${rowVersion}"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": token };
}
async function runPartActor(page, email, { checkUi = false } = {}) {
  await login(page, email);
  const beforeFormal = { ...activePartState(), partName: one("SELECT part_name AS partName FROM part_numbers WHERE id=?", fixture.partId)?.partName };
  const workbench = await readWorkbench(page);
  const create = await api(page, "POST", "/api/pdm/parts/" + encodeURIComponent(fixture.partId) + "/change-works", {}, commandHeaders(workbench.row.rowVersion, workbench.token));
  assert.equal(create.status, 200, JSON.stringify({ create: create.body, row: workbench.row, tokenPresent: Boolean(workbench.token) }));
  const workId = create.body?.data?.workId;
  assert.ok(workId, "Part change work id is required");
  const read = await api(page, "GET", "/api/pdm/part-change-works/" + encodeURIComponent(workId));
  assert.equal(read.status, 200, JSON.stringify(read.body));
  const originalPayload = read.body?.data?.payload;
  assert.ok(originalPayload && typeof originalPayload === "object", "Part payload is required");
  const payload = { ...originalPayload, partName: `${originalPayload.partName} [DEV081 ${email.split("@")[0]}]`, variantNote: `DEV081 ${email}` };
  const update = await api(page, "PATCH", "/api/pdm/part-change-works/" + encodeURIComponent(workId), payload, commandHeaders(1, read.body.meta.contractToken));
  assert.equal(update.status, 200, JSON.stringify(update.body));
  assert.equal(Number(update.body?.data?.rowVersion), 2);
  const updated = partWork(workId);
  assert.equal(updated?.ownerUserId, email === "manager@example.com" ? "user-manager-demo" : email === "admin@example.com" ? "user-admin-local-quick" : "user-engineer-demo");
  assert.equal(Number(updated?.rowVersion), 2);
  assert.equal(JSON.parse(updated.proposedPayload).variantNote, `DEV081 ${email}`);
  const createReceipt = receipts(updated.ownerUserId, "dev087:part.create")[0];
  const updateReceipt = receipts(updated.ownerUserId, "dev087:part.update")[0];
  const afterUpdateRead = await api(page, "GET", "/api/pdm/part-change-works/" + encodeURIComponent(workId));
  assert.equal(afterUpdateRead.status, 200, JSON.stringify(afterUpdateRead.body));
  if (checkUi) {
    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto(baseUrl + "/parts/" + encodeURIComponent(fixture.partId) + "/workspace?workId=" + encodeURIComponent(workId) + "&returnTo=%2Fparts", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.locator('[data-pdm-edit-page="true"] .pdm-edit-page-body').waitFor({ state: "visible", timeout: 30000 });
      assert.ok(await page.locator('[data-pdm-edit-page="true"] input, [data-pdm-edit-page="true"] textarea, [data-pdm-edit-page="true"] select').count() > 0, `Part editor controls required at ${viewport.width}px`);
    }
    await page.screenshot({ path: path.join(screenshotDir, "part-workspace-1440.png"), fullPage: true });
  }
  const cancel = await api(page, "POST", "/api/pdm/part-change-works/" + encodeURIComponent(workId) + "/cancel", {}, commandHeaders(2, afterUpdateRead.body.meta.contractToken));
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  const afterFormal = { ...activePartState(), partName: one("SELECT part_name AS partName FROM part_numbers WHERE id=?", fixture.partId)?.partName };
  record(`QA-081 Part ${email} same-company create/update/cancel scope`, create.status === 200 && update.status === 200 && cancel.status === 200 && !partWork(workId) && JSON.stringify(beforeFormal) === JSON.stringify(afterFormal) && createReceipt?.status === "completed" && updateReceipt?.status === "completed", { create, update, cancel, workId, beforeFormal, afterFormal, createReceipt, updateReceipt });
  return { email, workId, create, update, cancel, beforeFormal, afterFormal };
}
async function partMutation(page) {
  await runPartActor(page, "manager@example.com", { checkUi: true });
  await runPartActor(page, "admin@example.com");
  await runPartActor(page, "engineer@example.com");
  await login(page, "manufacturing@example.com");
  const workbench = await readWorkbench(page);
  const denied = await api(page, "POST", "/api/pdm/parts/" + encodeURIComponent(fixture.partId) + "/change-works", {}, commandHeaders(workbench.row.rowVersion, workbench.token));
  record("QA-081 non-editor Part same-company denied", [401, 403, 404, 409, 422].includes(denied.status), { denied });
  for (let index = browserErrors.length - 1; index >= 0; index -= 1) {
    const item = browserErrors[index];
    if (item?.actor === "manufacturing@example.com" && item.type === "console" && /status of (?:a )?403\b/u.test(item.message)) browserErrors.splice(index, 1);
  }
}
async function drawingMutation(page) {
  const actorCases = [];
  for (const [email, userId] of [["manager@example.com", "user-manager-demo"], ["admin@example.com", "user-admin-local-quick"], ["engineer@example.com", "user-engineer-demo"]]) {
    await login(page, email);
    const revision = email === "manager@example.com" ? "2.1" : email === "admin@example.com" ? "2.2" : "2.3";
    const response = await multipartApi(page, "/api/numbering/drawings/" + encodeURIComponent(fixture.relationDrawingNumber) + "/revision-files", fixtureDrawing, { revision, display_name: `DEV081 ${email} drawing` });
    const row = one("SELECT uploaded_by AS uploadedBy, revision, file_name AS fileName FROM file_assets WHERE linked_entity_type='drawing_number' AND linked_entity_id=? AND revision=? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1", fixture.relationDrawingId, revision);
    const audit = auditTail(userId, "numbering.master_attachment.upload");
    actorCases.push({ email, response, row, auditCount: audit.length });
  }
  record("QA-081 Drawing Manager/Admin/Engineer same-company upload audit", actorCases.every((item) => item.response.status === 201 && item.row?.uploadedBy === (item.email === "manager@example.com" ? "user-manager-demo" : item.email === "admin@example.com" ? "user-admin-local-quick" : "user-engineer-demo") && item.auditCount > 0), { actorCases });
}
async function relationMutation(page) {
  const actorCases = [];
  for (const [email, userId] of [["manager@example.com", "user-manager-demo"], ["admin@example.com", "user-admin-local-quick"], ["engineer@example.com", "user-engineer-demo"]]) {
    await login(page, email);
    const read = await api(page, "GET", "/api/pdm/relations/" + encodeURIComponent(fixture.relationRootId) + "/matrix");
    assert.equal(read.status, 200, JSON.stringify(read.body));
    const current = (read.body?.data?.cells ?? []).find((cell) => cell.drawingNumberId === fixture.relationDrawingId && cell.partNumberId === fixture.relationPartId);
    assert.ok(current, "relation target cell is required");
    const nextType = current.relationType === "manufacturing_basis" ? "reference" : "manufacturing_basis";
    const patch = await api(page, "PATCH", "/api/pdm/relations/" + encodeURIComponent(fixture.relationRootId) + "/matrix", { changes: [{ drawingNumberId: fixture.relationDrawingId, partNumberId: fixture.relationPartId, relationType: nextType }] }, { "if-match": `"${read.body.data.matrixEtag}"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": read.body.meta.contractToken });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    const readback = await api(page, "GET", "/api/pdm/relations/" + encodeURIComponent(fixture.relationRootId) + "/matrix");
    const cell = (readback.body?.data?.cells ?? []).find((item) => item.drawingNumberId === fixture.relationDrawingId && item.partNumberId === fixture.relationPartId);
    const receipt = receipts(userId, "pdm.relation_matrix.update.v1")[0];
    actorCases.push({ email, current: current.relationType, nextType, patch, readback: cell?.relationType, receipt });
  }
  record("QA-081 Relation Matrix Manager/Admin/Engineer exactly-once readback", actorCases.every((item) => item.patch.status === 200 && item.readback === item.nextType && item.receipt?.status === "completed"), { actorCases });
}
async function bomMutation(page) {
  await login(page, "admin@example.com");
  const idempotencyKey = "qa081-bom-create-" + crypto.randomUUID();
  const create = await api(page, "POST", "/api/bom/drafts", { ownerPartNumberId: fixture.bomPartId, bomRevision: "1", source: "manual", draftName: "DEV081 disposable BOM" }, { "Idempotency-Key": idempotencyKey });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const draftId = create.body?.draftId;
  assert.ok(draftId, "BOM draft id is required");
  const created = create.body?.draft ?? {};
  const initialEditorVersion = Number(created.editor_version ?? created.editorVersion ?? 0);
  assert.ok(Number.isInteger(initialEditorVersion), "BOM editor version is required");
  const save = await api(page, "PATCH", "/api/bom/drafts/" + encodeURIComponent(draftId), {
    lines: [{ logicalLineId: "qa081-bom-line-1", parentLineId: null, nodeType: "item", partNumber: fixture.partNumber, revision: null, groupName: null, quantity: 2, quantityUomCode: "EA", sequenceNo: 1 }],
    floatingTopics: [], expectedEditorVersion: initialEditorVersion, reason: "DEV-081 supervisor edit-scope disposable mutation"
  });
  assert.equal(save.status, 200, JSON.stringify(save.body));
  const read = await api(page, "GET", "/api/bom/drafts/" + encodeURIComponent(draftId));
  assert.equal(read.status, 200, JSON.stringify(read.body));
  const draft = one("SELECT status, line_count AS lineCount, editor_version AS editorVersion, updated_by AS updatedBy, owner_part_number_id AS ownerPartNumberId FROM bom_drafts WHERE id=?", draftId);
  const line = one("SELECT part_number AS partNumber, quantity, quantity_uom_code AS quantityUomCode, updated_by AS updatedBy FROM bom_lines_tree WHERE bom_draft_id=? ORDER BY sequence_no, id LIMIT 1", draftId);
  const event = one("SELECT actor_id AS actorId, event_type AS eventType FROM bom_edit_events WHERE bom_draft_id=? ORDER BY created_at DESC, id DESC LIMIT 1", draftId);
  const audit = many("SELECT actor_id AS actorId, action FROM audit_logs WHERE action='BomWorkbenchDraftSaved' AND detail_json LIKE ? ORDER BY created_at DESC, id DESC LIMIT 1", `%${draftId}%`)[0] ?? null;
  record("QA-081 BOM same-company edit persists with owner/audit actor", create.status === 201 && save.status === 200 && read.status === 200 && draft?.status === "Draft" && Number(draft.lineCount) === 1 && Number(draft.editorVersion) === initialEditorVersion + 1 && draft.updatedBy === "user-admin-local-quick" && draft.ownerPartNumberId === fixture.bomPartId && line?.partNumber === fixture.partNumber && Number(line.quantity) === 2 && line.quantityUomCode === "EA" && line.updatedBy === "user-admin-local-quick" && event?.actorId === "user-admin-local-quick" && event?.eventType === "save_tree" && audit?.actorId === "user-admin-local-quick", { create, save, read, draftId, initialEditorVersion, draft, line, event, audit });
}
async function main() {
  fixture = configure();
  await startServer();
  fs.mkdirSync(screenshotDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  monitor(page, "mutation");
  await runCase("part-mutation", () => partMutation(page));
  await runCase("drawing-mutation", () => drawingMutation(page));
  await runCase("relation-mutation", () => relationMutation(page));
  await runCase("bom-mutation", () => bomMutation(page));
  await page.close();
}
try { await main(); } catch (error) { record("DEV-081 mutation runner", false, { error: msg(error), stack: error instanceof Error ? error.stack : undefined, serverTail: app?.getOutput().slice(-12000) ?? "" }); }
finally {
  await browser?.close().catch(() => undefined);
  try { database?.close(); } catch {}
  if (app) await stopNextApp(app.child).catch(() => undefined);
  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
}
const failed = results.filter((item) => !item.passed);
const summary = {
  runId, generatedAt: new Date().toISOString(), result: failed.length === 0 && browserErrors.length === 0 && failedResponses.length === 0 ? "passed" : "failed",
  scope: "DEV-081 isolated SQLite + disposable Chromium bounded mutation runner", fixture, results, mutations, browserErrors, failedResponses,
  productionWrites: false, primaryPortsTouched: [], taskOwnedRuntime: true, taskPort, cleanupStatus: "removed"
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(outputDir, "mutation-log.md"), ["# DEV-081 mutation evidence", "", "Run: " + runId, "", "| Case | Result |", "|---|---|", ...results.map((item) => "| " + item.id + " | " + (item.passed ? "PASS" : "FAIL") + " |"), "", "Production writes: false", "Primary ports touched: none", "Cleanup: " + summary.cleanupStatus, "Unexpected browser errors: " + browserErrors.length, ""].join("\n"), "utf8");
console.log(JSON.stringify({ ...summary, outputDir }, null, 2));
if (summary.result !== "passed") process.exitCode = 1;
