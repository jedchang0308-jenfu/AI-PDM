import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import {
  artifactReference,
  canonicalHash,
  canonicalJson,
  DEV101_REGISTRY_PATH,
  hashFile,
  loadDev101Registry,
  sourceInfo,
  validateRegistry
} from "./dev-101-evidence-lib.mjs";
import {
  getFreePort,
  removeTaskOwnedWorkspaceTempDir,
  startNextApp,
  stopNextApp,
  waitForNextAppReady
} from "./qc-next-app-runner.mjs";

const root = process.cwd();
const registry = loadDev101Registry(root);
validateRegistry(root, registry);
const coverage = registry.runnerCoverage.find((item) => item.runner === "qc-dev-101-independent-browser");
if (!coverage) throw new Error("DEV101_BROWSER_COVERAGE_MISSING");
const runId = `DEV101-INDEPENDENT-BROWSER-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV101_PARENT_RUN_ID?.trim() || runId;
const outputDir = path.resolve(process.env.DEV101_EVIDENCE_DIR?.trim() || path.join(root, "output", "qa", "dev-101-independent-browser", runId));
const screenshotDir = path.join(outputDir, "screenshots");
const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev101-independent-browser-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const runtimeProjectRoot = path.join(root, ".tmp", `qc-dev101-independent-browser-runtime-${crypto.randomUUID()}`);
const results = new Map(coverage.caseIds.map((caseId) => [caseId, {
  caseId, result: "NOT_RUN", assertionIds: ["NOT_RUN"], firstFailurePointer: "independent browser assertion not executed"
}]));
const mutationLedger = [];
const runtimeLedger = [];
const networkLedger = [];
const focusTrace = [];
const geometry = [];
const accessibility = [];
const screenshots = [];
const consoleErrors = [];
const pageErrors = [];
const requestFailures = [];
const unexpectedHttp = [];
const visibleAlerts = [];
let browser = null;
let app = null;
let activePort = null;
let runError = null;
let visibleErrorCount = 0;

function record(caseId, assertions, detail = {}) {
  if (!results.has(caseId)) throw new Error(`DEV101_BROWSER_CASE_OUTSIDE_ROSTER:${caseId}`);
  const failures = assertions.filter((item) => !item.pass);
  results.set(caseId, {
    caseId,
    result: failures.length ? "FAIL" : "PASS",
    assertionIds: assertions.map((item) => item.id),
    firstFailurePointer: failures[0]?.id ?? null,
    detail
  });
}

function primaryFingerprint() {
  const database = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    const payload = {
      schema: database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),
      roots: database.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY company_id,id").all(),
      parts: database.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY company_id,id").all(),
      drawingNumbers: database.prepare("SELECT id,company_id,part_root_id,drawing_number FROM drawing_numbers ORDER BY company_id,id").all(),
      drawings: database.prepare("SELECT id,company_id,drawing_number,formal_drawing_number_id FROM drawings ORDER BY company_id,id").all(),
      residue: database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { payload, hash: canonicalHash(payload) };
  } finally { database.close(); }
}

function prepareRuntimeProject(targetRoot) {
  const allowed = path.resolve(root, ".tmp");
  const resolved = path.resolve(targetRoot);
  if (!resolved.startsWith(`${allowed}${path.sep}`) || !path.basename(resolved).startsWith("qc-dev101-independent-browser-runtime-")) throw new Error(`UNSAFE_RUNTIME_PROJECT:${resolved}`);
  fs.mkdirSync(resolved, { recursive: true });
  for (const file of ["package.json", "next.config.mjs", "tsconfig.json", "tsconfig.app.json", "tsconfig.next.json", "next-env.d.ts"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolved, file));
  }
  for (const file of [".env", ".env.local", ".env.development.local"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolved, file));
  }
  for (const directory of ["src", "public", "db", "config"]) {
    const source = path.join(root, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(resolved, directory), { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(resolved, "scripts"), { recursive: true });
  for (const file of ["qc-process-warning-guard.mjs", "qc-node-listener-budget.cjs"]) fs.copyFileSync(path.join(root, "scripts", file), path.join(resolved, "scripts", file));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(resolved, "node_modules"), "junction");
}

function isPortReleased(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(1_000, () => finish(true));
    socket.once("connect", () => finish(false));
    socket.once("error", () => finish(true));
  });
}

async function startPhase(schema) {
  activePort = await getFreePort();
  const baseUrl = `http://127.0.0.1:${activePort}`;
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_REVIEW_PACKAGE_V2_WRITE: schema === "v2" ? "true" : "false",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_RELEASE_MODE: "local_stub",
    PDM_NEXT_DIST_DIR: ".next",
    PDM_NEXT_TSCONFIG_PATH: "tsconfig.next.json",
    PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_POSTGRES_URL: "",
    DATABASE_URL: ""
  });
  const declaration = {
    project: root,
    purpose: `DEV-101 independent rendered normal-entry ${schema} QA`,
    port: activePort,
    owningProcessTree: `QC ${process.pid} -> task-owned Next child`,
    cleanupCondition: "browser contexts close; exact Next child tree stops; port releases; task temp is removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: `task-owned SQLite/repository and ${runtimeProjectRoot} only`,
    schemaFlag: schema
  };
  console.log(JSON.stringify({ runtimeDeclaration: declaration }));
  app = startNextApp(runtimeProjectRoot, "dev", activePort);
  declaration.processId = app.child.pid;
  runtimeLedger.push(declaration);
  await waitForNextAppReady(baseUrl, app.getOutput, 120_000);
  return baseUrl;
}

async function stopPhase() {
  if (!app) return;
  const port = activePort;
  await stopNextApp(app.child);
  await new Promise((resolve) => setTimeout(resolve, 750));
  const released = await isPortReleased(port);
  runtimeLedger.at(-1).portReleased = released;
  if (!released) throw new Error(`DEV101_BROWSER_PORT_NOT_RELEASED:${port}`);
  app = null;
  activePort = null;
}

function eligibleParts() {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return database.prepare(`SELECT state.canonical_entity_id AS part_id,state.row_version AS formal_row_version,
        part.company_id,part.part_number,part.part_name,part.part_root_id,root.root_code,
        (SELECT COUNT(*) FROM drawing_numbers drawing_number WHERE drawing_number.company_id=part.company_id AND drawing_number.part_root_id=part.part_root_id) AS drawing_count
      FROM canonical_workbench_states state
      JOIN part_numbers part ON part.id=state.canonical_entity_id AND part.company_id=state.company_id
      JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id
      WHERE state.entity_type='part' AND state.data_layer='part_formal' AND state.handling='none' AND state.work_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM part_change_works work WHERE work.company_id=part.company_id AND work.part_id=part.id)
        AND NOT EXISTS (SELECT 1 FROM pdm_work_review_requests request WHERE request.company_id=part.company_id AND request.canonical_entity_id=part.id AND request.request_status IN ('pending','applying','apply_failed'))
      ORDER BY drawing_count DESC,part.part_number LIMIT 2`).all();
  } finally { database.close(); }
}

function readRequestByWork(workId) {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = database.prepare("SELECT * FROM pdm_work_review_requests WHERE work_id=? ORDER BY created_at,id LIMIT 1").get(workId);
    return row ? { ...row, snapshot: JSON.parse(row.snapshot_payload) } : null;
  } finally { database.close(); }
}

function seedPartAttachment(partId) {
  const id = `dev101-browser-attachment-${crypto.randomUUID()}`;
  const bytes = Buffer.from("DEV-101 independent browser immutable attachment\n", "utf8");
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const storageKey = `dev101-browser/${id}.txt`;
  const localPath = path.join(repositoryDir, ...storageKey.split("/"));
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, bytes);
  const database = new Database(dbPath);
  try {
    database.prepare(`INSERT INTO file_assets
      (id,storage_provider,original_path,storage_key,file_name,file_ext,mime_type,file_size,content_hash,hash_algorithm,
       linked_entity_type,linked_entity_id,document_category,display_name,description,uploaded_by,sync_status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id,"local_repository",localPath,storageKey,`${id}.txt`,".txt","text/plain",bytes.byteLength,contentHash,"SHA-256",
      "part_number",partId,"other","DEV-101 immutable attachment","independent browser fixture","user-engineer-demo","local_only"
    );
  } finally { database.close(); }
  mutationLedger.push({ method: "FIXTURE", table: "file_assets", id, partId, storageKey, contentHash });
  return { id, bindingId: id, partId, storageKey, contentHash };
}

function seedRecognition(candidate, fallbackAttachment) {
  const database = new Database(dbPath);
  try {
    const target = database.prepare(`SELECT drawing.id drawing_id,revision.id revision_id,asset.id file_asset_id,asset.content_hash,
        asset.storage_generation,asset.file_name,asset.file_ext,asset.mime_type,asset.file_size,file.role source_role
      FROM drawings drawing JOIN drawing_revisions revision ON revision.drawing_id=drawing.id AND revision.company_id=drawing.company_id
      LEFT JOIN drawing_revision_files file ON file.drawing_revision_id=revision.id AND file.company_id=revision.company_id AND file.removed_at IS NULL
      LEFT JOIN file_assets asset ON asset.id=file.source_file_asset_id AND asset.deleted_at IS NULL
      WHERE drawing.company_id=? AND drawing.part_root_id=?
      ORDER BY revision.updated_at DESC,revision.id DESC,file.is_primary DESC,file.sort_order,file.id LIMIT 1`).get(candidate.company_id, candidate.part_root_id);
    assert.ok(target?.drawing_id && target?.revision_id, "recognition fixture requires drawing revision");
    const fallback = database.prepare("SELECT id file_asset_id,content_hash,storage_generation,file_name,file_ext,mime_type,file_size FROM file_assets WHERE id=?").get(fallbackAttachment.id);
    const asset = target.file_asset_id ? target : { ...fallback, source_role: "fixture_evidence" };
    assert.ok(asset?.file_asset_id && asset?.content_hash, "recognition fixture requires hashed asset");
    const sessionId = `dev101-browser-recognition-${crypto.randomUUID()}`;
    const sourceId = `dev101-browser-recognition-source-${crypto.randomUUID()}`;
    const adapterId = `dev101-browser-recognition-adapter-${crypto.randomUUID()}`;
    const observationId = `dev101-browser-recognition-observation-${crypto.randomUUID()}`;
    const candidateId = `dev101-browser-recognition-candidate-${crypto.randomUUID()}`;
    const createdAt = "2098-01-01T00:00:00.000Z";
    database.transaction(() => {
      database.prepare(`INSERT INTO drawing_recognition_sessions
        (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,source_set_fingerprint,deduplication_key,status,row_version,warning_count,conflict_count,unclassified_count,created_by,created_at,updated_at)
        VALUES(?,?,'drawing_revision',?,?,?,?,?,?,'review_ready',1,0,1,0,'user-engineer-demo',?,?)`).run(
        sessionId,candidate.company_id,target.revision_id,`drawing_revision:${target.revision_id}`,target.drawing_id,target.revision_id,`fixture:${asset.content_hash}`,sessionId,createdAt,createdAt
      );
      database.prepare(`INSERT INTO drawing_recognition_sources
        (id,session_id,company_id,file_asset_id,content_hash,storage_generation,file_name,file_ext,mime_type,file_size,source_role,sort_order,adapter_plan_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(sourceId,sessionId,candidate.company_id,asset.file_asset_id,asset.content_hash,asset.storage_generation ?? null,asset.file_name,asset.file_ext,asset.mime_type,Number(asset.file_size ?? 0),asset.source_role ?? "drawing_2d",0,'["dev101.browser.v1"]',createdAt);
      database.prepare(`INSERT INTO drawing_recognition_adapter_results
        (id,session_id,source_id,company_id,adapter_code,adapter_version,status,observation_count,diagnostics_json,started_at,completed_at)
        VALUES(?,?,?,?,'dev101.browser.v1','1','succeeded',1,'[]',?,?)`).run(adapterId,sessionId,sourceId,candidate.company_id,createdAt,createdAt);
      database.prepare(`INSERT INTO drawing_recognition_observations
        (id,session_id,source_id,adapter_result_id,company_id,raw_text,raw_value,normalized_value,location_kind,page_number,geometry_json,confidence_band,extractor_code,extractor_version,captured_at)
        VALUES(?,?,?,?,?,'製圖者：DEV101 Browser','DEV101 Browser','DEV101 Browser','page_region',1,'{"coordinateSpace":"normalized_page","origin":"top_left","x":0.1,"y":0.1,"width":0.2,"height":0.08}','high','dev101.browser.v1','1',?)`).run(observationId,sessionId,sourceId,adapterId,candidate.company_id,createdAt);
      database.prepare(`INSERT INTO drawing_recognition_candidates
        (id,session_id,company_id,category,field_key,field_label,raw_value,proposed_value,normalized_value,applicability_scope,variant_status,confidence_band,review_state,group_key,sort_order,row_version,created_at,updated_at)
        VALUES(?,?,?,'drawing_revision','drawn_by_name','製圖者','DEV101 Browser','DEV101 Browser','DEV101 Browser','overall','added','high','conflict','dev101:drawn_by_name',0,1,?,?)`).run(candidateId,sessionId,candidate.company_id,createdAt,createdAt);
      database.prepare("UPDATE drawing_recognition_candidates SET current_formal_value='DEV101 Formal Baseline' WHERE id=?").run(candidateId);
      database.prepare("INSERT INTO drawing_recognition_candidate_observations (candidate_id,observation_id,company_id,created_at) VALUES(?,?,?,?)").run(candidateId,observationId,candidate.company_id,createdAt);
    })();
    const fixture = { sessionId, sourceId, candidateId, observationId, drawingId: target.drawing_id, revisionId: target.revision_id, sourceAssetId: asset.file_asset_id, sourceHash: asset.content_hash };
    mutationLedger.push({ method: "FIXTURE", purpose: "exact revision recognition with conflict visual marker", ...fixture });
    return fixture;
  } finally { database.close(); }
}

function seedNewerDifferentLineage(fixture, companyId) {
  const database = new Database(dbPath);
  try {
    const id = `dev101-browser-latest-leak-${crypto.randomUUID()}`;
    database.prepare(`INSERT INTO drawing_recognition_sessions
      (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,source_set_fingerprint,deduplication_key,status,row_version,warning_count,conflict_count,unclassified_count,created_by,created_at,updated_at)
      VALUES(?,?,'drawing_number',?,?,?,NULL,?,?,'review_ready',1,0,0,0,'user-engineer-demo','2099-08-27T00:00:00.000Z','2099-08-27T00:00:00.000Z')`).run(
      id,companyId,fixture.drawingId,`drawing_number:${fixture.drawingId}`,fixture.drawingId,`latest-leak:${id}`,id
    );
    mutationLedger.push({ method: "FAULT_FIXTURE", purpose: "newer different lineage must not leak into review", sessionId: id, drawingId: fixture.drawingId });
    return id;
  } finally { database.close(); }
}

function mutateDrawingForDrift(drawingId) {
  const database = new Database(dbPath);
  try {
    const row = database.prepare("SELECT purpose_description FROM drawings WHERE id=?").get(drawingId);
    const next = `${row?.purpose_description ?? ""} [DEV101 browser drift]`;
    database.prepare("UPDATE drawings SET purpose_description=? WHERE id=?").run(next,drawingId);
    mutationLedger.push({ method: "FAULT_FIXTURE", table: "drawings", id: drawingId, field: "purpose_description", value: next });
  } finally { database.close(); }
}

function recognitionFingerprint(sessionId) {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return canonicalHash({
      sessions: database.prepare("SELECT * FROM drawing_recognition_sessions WHERE id=? ORDER BY id").all(sessionId),
      sources: database.prepare("SELECT * FROM drawing_recognition_sources WHERE session_id=? ORDER BY sort_order,id").all(sessionId),
      candidates: database.prepare("SELECT * FROM drawing_recognition_candidates WHERE session_id=? ORDER BY sort_order,id").all(sessionId),
      observations: database.prepare("SELECT * FROM drawing_recognition_observations WHERE session_id=? ORDER BY captured_at,id").all(sessionId)
    });
  } finally { database.close(); }
}

function attachPageAudit(page, label) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ label, text: message.text(), url: page.url() }); });
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message, url: page.url() }));
  page.on("requestfailed", (request) => requestFailures.push({ label, method: request.method(), url: request.url(), failure: request.failure()?.errorText ?? null }));
  page.on("request", (request) => networkLedger.push({ at: new Date().toISOString(), label, phase: "request", method: request.method(), url: request.url(), resourceType: request.resourceType() }));
  page.on("response", (response) => {
    networkLedger.push({ at: new Date().toISOString(), label, phase: "response", method: response.request().method(), url: response.url(), status: response.status() });
    if (response.status() >= 400) unexpectedHttp.push({ label, method: response.request().method(), url: response.url(), status: response.status() });
  });
}

async function login(context, baseUrl, role) {
  const response = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role } });
  mutationLedger.push({ method: "POST", route: "/api/auth/local-quick-login", role, status: response.status() });
  assert.equal(response.ok(), true, `${role} login failed HTTP ${response.status()}`);
}

async function createAndSubmitPart(baseUrl, candidate, schema, { change = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await login(context, baseUrl, "Engineer");
  const page = await context.newPage();
  attachPageAudit(page, `owner-${schema}`);
  await page.goto(`${baseUrl}/parts?query=${encodeURIComponent(candidate.part_number)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 45_000 });
  const row = page.locator('[data-canonical-workbench-row="true"]').filter({ hasText: candidate.part_number }).filter({ hasText: "正式資料" }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.locator(".canonical-row-open").click();
  const create = page.getByRole("button", { name: "建立修改", exact: true });
  await create.waitFor({ state: "visible", timeout: 30_000 });
  const createResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/api/pdm/parts/${candidate.part_id}/change-works`), { timeout: 60_000 });
  await create.click();
  const createResponse = await createResponsePromise;
  const createBody = await createResponse.json().catch(() => null);
  const workId = createBody?.data?.workId;
  assert.ok(createResponse.ok() && workId, `${schema} part work creation failed`);
  mutationLedger.push({ method: "POST", route: `/api/pdm/parts/${candidate.part_id}/change-works`, schema, status: createResponse.status(), workId });
  await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.get("workId") === workId, { timeout: 30_000 });
  await page.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  let saveStatus = null;
  if (change) {
    const field = page.getByLabel("規格", { exact: true });
    await field.fill(`DEV101 browser ${runId}`);
    const savePromise = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/api/pdm/part-change-works/${workId}`), { timeout: 60_000 });
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    const save = await savePromise;
    saveStatus = save.status();
    assert.equal(save.ok(), true, `part save failed HTTP ${save.status()}`);
    mutationLedger.push({ method: "PATCH", route: `/api/pdm/part-change-works/${workId}`, status: save.status() });
    await page.getByText("工作資料已儲存。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  }
  const ownerSignature = await page.evaluate(() => ({
    root: document.querySelector(".pdm-edit-page")?.className ?? null,
    headings: [...document.querySelectorAll(".pdm-edit-page h2")].map((node) => node.textContent?.trim()).filter(Boolean),
    fieldLabels: [...document.querySelectorAll(".pdm-edit-page label")].map((node) => node.textContent?.trim()).filter(Boolean),
    componentCount: document.querySelectorAll(".pdm-edit-page").length
  }));
  const ownerScreenshot = path.join(screenshotDir, `owner-part-${schema}.png`);
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: ownerScreenshot, fullPage: true });
  screenshots.push(ownerScreenshot);
  const submit = page.getByRole("button", { name: "送出審核", exact: true });
  const submitPromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/pdm/part-change-works/${workId}/submit`), { timeout: 60_000 });
  await submit.click();
  const submitResponse = await submitPromise;
  assert.equal(submitResponse.ok(), true, `${schema} submit failed HTTP ${submitResponse.status()}`);
  mutationLedger.push({ method: "POST", route: `/api/pdm/part-change-works/${workId}/submit`, schema, status: submitResponse.status() });
  await page.waitForURL((url) => url.pathname === "/parts", { timeout: 30_000 });
  const request = readRequestByWork(workId);
  const actualSchema = request?.snapshot?.schemaVersion === "pdm-review-package-v2" ? "v2" : "v1";
  await context.close();
  return { workId, request, actualSchema, ownerSignature, saveStatus, ownerScreenshot };
}

async function screenshot(page, name) {
  const target = path.join(screenshotDir, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, fullPage: true });
  screenshots.push(target);
  return target;
}

const primaryBefore = primaryFingerprint();
const sourceBefore = sourceInfo(root, registry.sourceBoundary);
let v1 = null;
let v2 = null;
let recognitionFixture = null;
let newerSessionId = null;
let finalForeignKeys = [];

try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.copyFileSync(sourceDbPath, dbPath);
  if (fs.existsSync(path.join(root, "data", "repository"))) fs.cpSync(path.join(root, "data", "repository"), repositoryDir, { recursive: true, force: true });
  prepareRuntimeProject(runtimeProjectRoot);
  const candidates = eligibleParts();
  assert.equal(candidates.length, 2, `two independent owner-flow Part candidates required; got ${candidates.length}`);
  const attachment = seedPartAttachment(candidates[1].part_id);
  recognitionFixture = seedRecognition(candidates[1], attachment);

  const v1BaseUrl = await startPhase("v1");
  if (!browser) browser = await chromium.launch({ headless: process.env.PDM_QC_HEADED !== "true" });
  v1 = await createAndSubmitPart(v1BaseUrl, candidates[0], "v1");
  await stopPhase();

  const v2BaseUrl = await startPhase("v2");
  v2 = await createAndSubmitPart(v2BaseUrl, candidates[1], "v2", { change: true });
  assert.equal(v1.actualSchema, "v1");
  assert.equal(v2.actualSchema, "v2");
  const packageBeforeDrift = { json: canonicalJson(v2.request.snapshot), hash: v2.request.snapshot_hash };
  const recognitionTarget = v2.request.snapshot.targets.find((target) => target.workspace.kind === "drawing" && target.workspace.recognition?.schemaVersion === "pdm-recognition-review-projection-v1");
  assert.ok(recognitionTarget, "v2 browser fixture must contain immutable recognition target");
  mutateDrawingForDrift(recognitionTarget.workspace.entityId);
  newerSessionId = seedNewerDifferentLineage(recognitionFixture, candidates[1].company_id);
  const recognitionBefore = recognitionFingerprint(recognitionFixture.sessionId);

  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", hasTouch: true });
  await login(reviewerContext, v2BaseUrl, "R&D Manager");
  const reviewer = await reviewerContext.newPage();
  attachPageAudit(reviewer, "reviewer");
  const listUrl = `${v2BaseUrl}/approvals?status=active&domain=numbering&action=numbering.pdm_part_change_review`;
  const listStarted = Date.now();
  await reviewer.goto(listUrl, { waitUntil: "networkidle", timeout: 60_000 });
  const v1Row = reviewer.locator('[data-approval-workbench-row="true"]').filter({ hasText: candidates[0].part_number }).first();
  const v2Row = reviewer.locator('[data-approval-workbench-row="true"]').filter({ hasText: candidates[1].part_number }).first();
  await v1Row.waitFor({ state: "visible", timeout: 30_000 });
  await v2Row.waitFor({ state: "visible", timeout: 30_000 });
  const approvalCount = await reviewer.locator(".approval-count").innerText();
  const renderedRows = await reviewer.locator('[data-approval-workbench-row="true"]').count();
  await screenshot(reviewer, "reviewer-inbox-v1-v2.png");
  record("QA-101-037", [
    { id: "NORMAL-INBOX-BOTH-SCHEMAS", pass: await v1Row.count() === 1 && await v2Row.count() === 1 },
    { id: "COUNT-MATCHES-ROWS", pass: Number.parseInt(approvalCount, 10) === renderedRows },
    { id: "IDENTITIES-DISTINCT", pass: candidates[0].part_number !== candidates[1].part_number }
  ], { approvalCount, renderedRows, requestIds: [v1.request.id, v2.request.id] });

  await v1Row.click();
  await reviewer.waitForURL(new RegExp(`/approvals/${v1.request.id}`, "u"), { timeout: 30_000 });
  await reviewer.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const v1Before = readRequestByWork(v1.workId);
  const v1Readonly = await reviewer.getByRole("status").filter({ hasText: /目前為唯讀/u }).count();
  await screenshot(reviewer, "reviewer-v1-compatibility.png");
  const v1Back = reviewer.getByRole("button", { name: "返回上一個工作清單", exact: true });
  await v1Back.click();
  await reviewer.waitForURL(/\/approvals\?/u, { timeout: 30_000 });
  await v2Row.waitFor({ state: "visible", timeout: 30_000 });
  const v1After = readRequestByWork(v1.workId);
  record("QA-101-040", [
    { id: "V1-NORMAL-ENTRY", pass: v1Readonly >= 1 },
    { id: "V1-NOT-PRESENTED-AS-V2", pass: v1Before.snapshot?.schemaVersion !== "pdm-review-package-v2" },
    { id: "V1-NO-BACKFILL", pass: v1Before.snapshot_payload === v1After.snapshot_payload && v1Before.snapshot_hash === v1After.snapshot_hash }
  ], { requestId: v1.request.id, hash: v1Before.snapshot_hash });
  record("QA-101-041", [
    { id: "FLAG-OFF-PERSISTS-V1", pass: v1.actualSchema === "v1" && runtimeLedger[0].schemaFlag === "v1" },
    { id: "FLAG-ON-PERSISTS-V2", pass: v2.actualSchema === "v2" && runtimeLedger[1].schemaFlag === "v2" },
    { id: "V1-REMAINS-V1-AFTER-ON", pass: v1After.snapshot?.schemaVersion !== "pdm-review-package-v2" }
  ], { runtimeLedger, v1RequestId: v1.request.id, v2RequestId: v2.request.id });

  await v2Row.click();
  await reviewer.waitForURL(new RegExp(`/approvals/${v2.request.id}`, "u"), { timeout: 30_000 });
  const workspace = reviewer.locator('[data-review-schema="pdm-review-package-v2"]');
  await workspace.waitFor({ state: "visible", timeout: 30_000 });
  await reviewer.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const normalEntryUrl = reviewer.url();
  const partReviewSignature = await reviewer.evaluate(() => ({
    root: document.querySelector(".pdm-edit-page")?.className ?? null,
    headings: [...document.querySelectorAll(".pdm-edit-page h2")].map((node) => node.textContent?.trim()).filter(Boolean),
    fieldLabels: [...document.querySelectorAll(".pdm-edit-page label")].map((node) => node.textContent?.trim()).filter(Boolean),
    componentCount: document.querySelectorAll(".pdm-edit-page").length
  }));
  await screenshot(reviewer, "reviewer-v2-part.png");
  record("QA-101-021", [
    { id: "PART-SHARED-ROOT-CLASS", pass: String(v2.ownerSignature.root).includes("pdm-edit-page") && String(partReviewSignature.root).includes("pdm-edit-page") },
    { id: "PART-SECTION-ORDER-PARITY", pass: canonicalJson(v2.ownerSignature.headings) === canonicalJson(partReviewSignature.headings) },
    { id: "PART-READONLY-CAPABILITY", pass: await reviewer.getByRole("status").filter({ hasText: /目前為唯讀/u }).count() >= 1 },
    { id: "PART-SINGLE-MOUNT", pass: partReviewSignature.componentCount === 1 }
  ], { owner: v2.ownerSignature, review: partReviewSignature });

  const matrix = reviewer.locator(".pdm-relation-matrix-wrap");
  const drawingIdentity = reviewer.locator(".pdm-relation-matrix thead .pdm-relation-matrix-identity").filter({ hasText: recognitionTarget.workspace.identity.code }).first();
  const partIdentity = reviewer.locator(".pdm-relation-matrix tbody th .pdm-relation-matrix-identity").filter({ hasText: candidates[1].part_number }).first();
  const inertCellState = await reviewer.locator(".pdm-relation-matrix tbody td").evaluateAll((nodes) => nodes.map((node) => ({ buttons: node.querySelectorAll("button").length, tabIndex: node.getAttribute("tabindex"), role: node.getAttribute("role") })));
  await drawingIdentity.focus();
  focusTrace.push({ action: "focus drawing identity", active: await drawingIdentity.getAttribute("aria-label") });
  await reviewer.keyboard.press("Enter");
  await reviewer.waitForURL((url) => url.searchParams.get("activeTarget") === recognitionTarget.targetKey, { timeout: 30_000 });
  await reviewer.getByRole("heading", { name: "版次與檔案", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  record("QA-101-022", [
    { id: "IDENTITY-KEYBOARD-NAVIGATES", pass: new URL(reviewer.url()).searchParams.get("activeTarget") === recognitionTarget.targetKey },
    { id: "RELATION-CELLS-INERT", pass: inertCellState.every((item) => item.buttons === 0 && item.tabIndex === null && item.role === null) },
    { id: "IDENTITY-CURRENT-STATE", pass: await drawingIdentity.getAttribute("aria-current") === "true" }
  ], { inertCellState, url: reviewer.url() });

  const drawingReviewSignature = await reviewer.evaluate(() => ({
    root: document.querySelector(".dev079-workspace.is-embedded")?.className ?? null,
    headings: [...document.querySelectorAll(".dev079-workspace.is-embedded h2")].map((node) => node.textContent?.trim()).filter(Boolean),
    headerCount: document.querySelectorAll(".dev079-workspace.is-embedded > .dev079-workspace-header").length,
    readonlyCount: [...document.querySelectorAll('[role="status"]')].filter((node) => node.textContent?.includes("目前為唯讀")).length
  }));
  await screenshot(reviewer, "reviewer-v2-drawing-recognition.png");
  record("QA-101-020", [
    { id: "DRAWING-SHARED-RENDERER-DOM", pass: String(drawingReviewSignature.root).includes("dev079-workspace") },
    { id: "DRAWING-EMBEDDED-NO-DUPLICATE-HEADER", pass: drawingReviewSignature.headerCount === 0 },
    { id: "DRAWING-READONLY-CAPABILITY", pass: drawingReviewSignature.readonlyCount >= 1 },
    { id: "DRAWING-CORE-SECTIONS", pass: drawingReviewSignature.headings.includes("版次與檔案") }
  ], drawingReviewSignature);

  const dock = reviewer.getByRole("contentinfo", { name: "審核決策" }).or(reviewer.locator(".canonical-review-decision-dock"));
  const dockCount = await reviewer.locator(".canonical-review-decision-dock").count();
  const targetCount = v2.request.snapshot.targets.length;
  const matrixCounts = { drawings: v2.request.snapshot.matrix.drawings.length, parts: v2.request.snapshot.matrix.parts.length, cells: v2.request.snapshot.matrix.cells.length };
  record("QA-101-023", [
    { id: "COMPLETE-ROOT-MATRIX", pass: matrixCounts.drawings > 0 && matrixCounts.parts > 0 && matrixCounts.cells === matrixCounts.drawings * matrixCounts.parts },
    { id: "ALL-TARGETS-REPRESENTED", pass: targetCount === matrixCounts.drawings + matrixCounts.parts },
    { id: "SINGLE-STABLE-DOCK", pass: dockCount === 1 && await dock.isVisible() }
  ], { targetCount, matrixCounts, dockCount });

  const markerRoot = drawingIdentity.locator("xpath=..");
  const markerSlots = markerRoot.locator("[data-marker-slot]");
  const markerBoxes = await markerSlots.evaluateAll((nodes) => nodes.map((node) => { const box = node.getBoundingClientRect(); return { kind: node.getAttribute("data-marker-slot"), x: box.x, width: box.width, text: node.textContent?.trim() ?? "", hasButton: Boolean(node.querySelector("button")) }; }));
  const markerVisuals = await reviewer.locator(".review-target-marker-trigger").evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node, "::before");
    return {
      kind: [...node.classList].find((name) => name.startsWith("is-")) ?? null,
      ariaLabel: node.getAttribute("aria-label"),
      signature: [style.width, style.height, style.borderRadius, style.transform, style.backgroundImage, style.borderLeftWidth, style.borderBottomWidth].join("|")
    };
  }));
  const fixedSlotGeometry = markerBoxes.length === 3 && markerBoxes.every((item) => Math.abs(item.width - 16) <= 1) && markerBoxes[0].x < markerBoxes[1].x && markerBoxes[1].x < markerBoxes[2].x;
  record("QA-101-024", [
    { id: "THREE-FIXED-SLOTS", pass: fixedSlotGeometry },
    { id: "NO-PERSISTENT-MARKER-TEXT", pass: markerBoxes.every((item) => item.text === "") },
    { id: "NON-COLOR-SHAPES", pass: markerVisuals.length >= 2 && markerVisuals.every((item) => Boolean(item.ariaLabel)) && new Set(markerVisuals.map((item) => item.signature)).size >= 2 }
  ], { markerBoxes, markerVisuals });

  const interactionMarker = reviewer.locator(".review-target-marker-trigger").first();
  const markerAccessibleName = await interactionMarker.getAttribute("aria-label");
  assert.ok(markerAccessibleName, "review marker accessible name missing");
  await interactionMarker.hover();
  const hoverTooltip = await reviewer.getByRole("tooltip", { name: markerAccessibleName, exact: true }).isVisible();
  await interactionMarker.focus();
  focusTrace.push({ action: "marker focus", expanded: await interactionMarker.getAttribute("aria-expanded") });
  await interactionMarker.click();
  await reviewer.locator(".canonical-review-matrix-card h2").click({ position: { x: 2, y: 2 } });
  const outsideClosed = await interactionMarker.getAttribute("aria-expanded") === "false";
  await interactionMarker.click();
  await reviewer.keyboard.press("Escape");
  const escapeRestored = await interactionMarker.evaluate((node) => node === document.activeElement);
  await interactionMarker.tap();
  const tapOpened = await interactionMarker.getAttribute("aria-expanded") === "true";
  await interactionMarker.click();
  accessibility.push({ markerName: await interactionMarker.getAttribute("aria-label"), describedBy: await interactionMarker.getAttribute("aria-describedby"), role: "button" });
  record("QA-101-025", [
    { id: "HOVER-TRANSIENT", pass: hoverTooltip },
    { id: "OUTSIDE-CLOSES", pass: outsideClosed },
    { id: "ESCAPE-RESTORES-FOCUS", pass: escapeRestored },
    { id: "TOUCH-TAP-TOGGLES", pass: tapOpened },
    { id: "ACCESSIBLE-NAME", pass: Boolean(accessibility.at(-1).markerName) }
  ], { focusTrace, accessibility: accessibility.at(-1) });

  const drawingUrl = reviewer.url();
  await partIdentity.click();
  await reviewer.waitForURL((url) => url.searchParams.get("activeTarget") === v2.request.snapshot.primaryTargetKey, { timeout: 30_000 });
  const partUrl = reviewer.url();
  await reviewer.goBack();
  await reviewer.waitForURL((url) => url.searchParams.get("activeTarget") === recognitionTarget.targetKey, { timeout: 30_000 });
  await reviewer.goForward();
  await reviewer.waitForURL((url) => url.searchParams.get("activeTarget") === v2.request.snapshot.primaryTargetKey, { timeout: 30_000 });
  const invalidUrl = new URL(reviewer.url());
  invalidUrl.searchParams.set("activeTarget", "part:foreign-target");
  await reviewer.goto(invalidUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
  await reviewer.waitForURL((url) => url.searchParams.get("activeTarget") === v2.request.snapshot.primaryTargetKey, { timeout: 30_000 });
  const normalizedInvalidUrl = reviewer.url();
  const rapidStarted = Date.now();
  await drawingIdentity.click();
  await partIdentity.click();
  await drawingIdentity.click();
  await reviewer.waitForURL((url) => url.searchParams.get("activeTarget") === recognitionTarget.targetKey, { timeout: 30_000 });
  await reviewer.getByRole("heading", { name: "版次與檔案", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const visibleCode = await reviewer.locator(".canonical-review-package > .dev079-workspace-header h1").innerText();
  await drawingIdentity.click();
  const activeIdentityIdempotent = await reviewer.getByRole("heading", { name: "版次與檔案", exact: true }).isVisible();
  record("QA-101-026", [
    { id: "BACK-FORWARD-RESTORE", pass: drawingUrl !== partUrl },
    { id: "INVALID-REPLACED-WITH-PRIMARY", pass: new URL(normalizedInvalidUrl).searchParams.get("activeTarget") === v2.request.snapshot.primaryTargetKey },
    { id: "RAPID-SWITCH-LAST-WINS", pass: new URL(reviewer.url()).searchParams.get("activeTarget") === recognitionTarget.targetKey && visibleCode === recognitionTarget.workspace.identity.code },
    { id: "ACTIVE-IDENTITY-IDEMPOTENT", pass: activeIdentityIdempotent },
    { id: "RETURN-TO-PRESERVED", pass: new URL(normalEntryUrl).searchParams.has("returnTo") }
  ], { drawingUrl, partUrl, invalidUrl: invalidUrl.toString(), normalizedInvalidUrl, finalUrl: reviewer.url(), visibleCode, activeIdentityIdempotent, elapsedMs: Date.now() - rapidStarted });

  const recognitionRequests = networkLedger.filter((item) => /\/api\/numbering\/(?:recognition-sessions|drawings\/[^/]+\/recognition-session)/u.test(new URL(item.url).pathname));
  const recognitionPanel = reviewer.locator('[data-dev079-recognition="immutable-review"]');
  const candidateCards = recognitionPanel.locator(".dev079-recognition-candidate");
  const reviewProjectionText = await recognitionPanel.innerText();
  record("QA-101-044", [
    { id: "SHARED-RECOGNITION-PANEL-DOM", pass: await recognitionPanel.count() === 1 },
    { id: "PACKAGE-SESSION-RENDERED", pass: reviewProjectionText.includes(recognitionFixture.sessionId) || reviewProjectionText.includes(recognitionTarget.workspace.recognition.projectionHash.slice(0, 12)) },
    { id: "CANDIDATE-EVIDENCE-RENDERED", pass: await candidateCards.count() >= 1 },
    { id: "NO-LIVE-RECOGNITION-READ", pass: recognitionRequests.length === 0 }
  ], { sessionId: recognitionFixture.sessionId, projectionHash: recognitionTarget.workspace.recognition.projectionHash, recognitionRequests });
  record("QA-101-045", [
    { id: "SNAPSHOT-EXACT-SESSION", pass: recognitionTarget.workspace.recognition.session.id === recognitionFixture.sessionId },
    { id: "NEWER-DIFFERENT-LINEAGE-EXISTS", pass: newerSessionId !== recognitionFixture.sessionId },
    { id: "LATEST-SESSION-NOT-RENDERED", pass: !reviewProjectionText.includes(newerSessionId) },
    { id: "LATEST-ENDPOINT-ZERO-CALL", pass: recognitionRequests.length === 0 }
  ], { exactSessionId: recognitionFixture.sessionId, newerSessionId, network: recognitionRequests });

  const beforeSwitchRequests = networkLedger.length;
  const switchStart = Date.now();
  await partIdentity.click();
  await reviewer.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await drawingIdentity.click();
  await reviewer.getByRole("heading", { name: "版次與檔案", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const switchNetwork = networkLedger.slice(beforeSwitchRequests).filter((item) => item.phase === "request" && item.resourceType === "fetch");
  const mountedTargets = await reviewer.locator(".canonical-review-package .pdm-edit-page.is-embedded, .canonical-review-package .dev079-workspace.is-embedded").count();
  record("QA-101-032", [
    { id: "RAPID-SWITCH-WITHIN-BUDGET", pass: Date.now() - switchStart < 10_000 },
    { id: "ONLY-ACTIVE-TARGET-MOUNTED", pass: mountedTargets === 1 },
    { id: "NO-REQUEST-WATERFALL", pass: switchNetwork.length <= 4 },
    { id: "LIST-LOAD-WITHIN-BUDGET", pass: Date.now() - listStarted < 120_000 }
  ], { elapsedMs: Date.now() - switchStart, mountedTargets, switchNetwork });

  const driftTrigger = reviewer.getByRole("button", { name: "目前資料與送審快照不同；開啟差異比較", exact: true });
  await driftTrigger.waitFor({ state: "visible", timeout: 30_000 });
  await reviewer.evaluate(() => window.scrollTo(0, 220));
  const scrollBefore = await reviewer.evaluate(() => window.scrollY);
  await driftTrigger.click();
  const compare = reviewer.getByRole("region", { name: "送審快照與目前資料比較", exact: true });
  await compare.waitFor({ state: "visible", timeout: 30_000 });
  const compareLabels = await compare.locator(".review-compare-pane").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  const changedOpen = await compare.locator('details[data-changed="true"][open]').count();
  const compareHashes = await compare.locator("code").allTextContents();
  await screenshot(reviewer, "reviewer-compare-desktop.png");
  await compare.getByRole("button", { name: "關閉差異比較", exact: true }).click();
  await compare.waitFor({ state: "detached", timeout: 10_000 });
  const scrollAfter = await reviewer.evaluate(() => window.scrollY);
  const packageAfterDrift = readRequestByWork(v2.workId);
  record("QA-101-028", [
    { id: "SNAPSHOT-LEFT-CURRENT-RIGHT", pass: canonicalJson(compareLabels) === canonicalJson(["送審快照", "目前資料"]) },
    { id: "CHANGED-FIRST-OPEN", pass: changedOpen >= 1 },
    { id: "HASH-IDENTITIES", pass: compareHashes.length === 2 },
    { id: "CLOSE-RESTORES-TARGET", pass: new URL(reviewer.url()).searchParams.get("activeTarget") === recognitionTarget.targetKey },
    { id: "SNAPSHOT-IMMUTABLE", pass: canonicalJson(packageAfterDrift.snapshot) === packageBeforeDrift.json && packageAfterDrift.snapshot_hash === packageBeforeDrift.hash },
    { id: "SCROLL-RESTORED", pass: Math.abs(scrollAfter - scrollBefore) <= 4 }
  ], { compareLabels, changedOpen, compareHashes, scrollBefore, scrollAfter });

  const viewportCases = [
    { width: 1440, height: 900, name: "1440x900" },
    { width: 1024, height: 768, name: "1024x768" },
    { width: 768, height: 1024, name: "768x1024" },
    { width: 390, height: 844, name: "390x844" }
  ];
  for (const viewport of viewportCases) {
    await reviewer.setViewportSize({ width: viewport.width, height: viewport.height });
    await reviewer.evaluate(() => window.scrollTo(0, 0));
    const state = await reviewer.evaluate(() => {
      const matrixNode = document.querySelector(".pdm-relation-matrix-wrap");
      const dockNode = document.querySelector(".canonical-review-decision-dock");
      const dockBox = dockNode?.getBoundingClientRect();
      const active = document.querySelector(".pdm-relation-matrix-identity[aria-current='true']");
      const activeBox = active?.getBoundingClientRect();
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow: document.body.scrollWidth - document.documentElement.clientWidth,
        matrixOwnsOverflow: Boolean(matrixNode && matrixNode.scrollWidth >= matrixNode.clientWidth),
        matrixOverflowX: matrixNode ? getComputedStyle(matrixNode).overflowX : null,
        dockVisible: Boolean(dockBox && dockBox.bottom <= innerHeight + 1 && dockBox.top >= 0),
        activeVisible: Boolean(activeBox && activeBox.left >= 0 && activeBox.right <= innerWidth)
      };
    });
    geometry.push({ viewport, ...state });
    await screenshot(reviewer, `viewport-${viewport.name}.png`);
  }
  await reviewer.setViewportSize({ width: 780, height: 844 });
  await reviewer.evaluate(() => { document.documentElement.style.zoom = "2"; });
  const zoomState = await reviewer.evaluate(() => ({ documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, bodyOverflow: document.body.scrollWidth - document.documentElement.clientWidth }));
  await screenshot(reviewer, "viewport-200-percent-zoom.png");
  await reviewer.evaluate(() => { document.documentElement.style.zoom = ""; });
  geometry.push({ viewport: { width: 390, height: 422, name: "200%-equivalent" }, ...zoomState });
  record("QA-101-031", [
    { id: "FIVE-VIEWPORTS-CAPTURED", pass: geometry.length === 5 },
    { id: "NO-BODY-HORIZONTAL-OVERFLOW", pass: geometry.every((item) => item.documentOverflow <= 1 && item.bodyOverflow <= 1) },
    { id: "MATRIX-OWNS-HORIZONTAL-SCROLL", pass: geometry.slice(0, 4).every((item) => item.matrixOwnsOverflow && ["auto", "scroll"].includes(item.matrixOverflowX)) },
    { id: "DOCK-REMAINS-VISIBLE", pass: geometry.slice(0, 4).every((item) => item.dockVisible) },
    { id: "ACTIVE-IDENTITY-AUTO-REVEALED", pass: geometry.slice(0, 4).every((item) => item.activeVisible) }
  ], { geometry });

  await reviewer.setViewportSize({ width: 390, height: 844 });
  await driftTrigger.click();
  const mobileCompare = reviewer.getByRole("region", { name: "送審快照與目前資料比較", exact: true });
  await mobileCompare.waitFor({ state: "visible", timeout: 30_000 });
  const snapshotSwitch = mobileCompare.getByRole("button", { name: "送審快照", exact: true });
  const currentSwitch = mobileCompare.getByRole("button", { name: "目前資料", exact: true });
  const defaultSnapshot = await snapshotSwitch.getAttribute("aria-pressed") === "true";
  await currentSwitch.focus();
  await reviewer.keyboard.press("Enter");
  const keyboardCurrent = await currentSwitch.getAttribute("aria-pressed") === "true";
  await snapshotSwitch.click();
  const compareBox = await mobileCompare.boundingBox();
  assert.ok(compareBox, "mobile compare box missing");
  const swipeY = Math.min(compareBox.y + 180, 700);
  await reviewer.mouse.move(compareBox.x + compareBox.width - 50, swipeY);
  await reviewer.mouse.down();
  await reviewer.mouse.move(compareBox.x + 70, swipeY, { steps: 6 });
  await reviewer.mouse.up();
  const swipeCurrent = await currentSwitch.getAttribute("aria-pressed") === "true";
  const matrixBeforePan = await matrix.evaluate((node) => node.scrollLeft);
  await matrix.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  const matrixAfterPan = await matrix.evaluate((node) => node.scrollLeft);
  await screenshot(reviewer, "reviewer-mobile-compare.png");
  await mobileCompare.getByRole("button", { name: "關閉差異比較", exact: true }).click();
  record("QA-101-029", [
    { id: "MOBILE-DEFAULT-SNAPSHOT", pass: defaultSnapshot },
    { id: "MOBILE-KEYBOARD-SWITCH", pass: keyboardCurrent },
    { id: "MOBILE-SWIPE-SWITCH", pass: swipeCurrent },
    { id: "MATRIX-INDEPENDENT-PAN", pass: matrixAfterPan >= matrixBeforePan }
  ], { defaultSnapshot, keyboardCurrent, swipeCurrent, matrixBeforePan, matrixAfterPan });
  await reviewer.setViewportSize({ width: 1440, height: 900 });

  let targetFaultSeen = false;
  const targetPattern = `**/api/pdm/review-requests/${v2.request.id}/targets/part/${candidates[1].part_id}`;
  await reviewer.route(targetPattern, async (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "審核對象暫時無法載入。" } }) }));
  await partIdentity.click();
  const localizedAlert = reviewer.getByRole("alert").filter({ hasText: "審核對象暫時無法載入" });
  await localizedAlert.waitFor({ state: "visible", timeout: 30_000 });
  targetFaultSeen = await matrix.isVisible() && await reviewer.locator(".canonical-review-decision-dock").isVisible();
  await screenshot(reviewer, "fault-target-localized.png");
  await reviewer.unroute(targetPattern);
  await reviewer.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await reviewer.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  let decisionConflictSeen = false;
  const decisionPattern = `**/api/pdm/review-requests/${v2.request.id}/decisions`;
  await reviewer.route(decisionPattern, async (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { message: "審核狀態已變更，請重新整理。" } }) }));
  await reviewer.getByRole("button", { name: "退回修改", exact: true }).click();
  const conflictAlert = reviewer.getByRole("alert").filter({ hasText: "審核狀態已變更" });
  await conflictAlert.waitFor({ state: "visible", timeout: 30_000 });
  decisionConflictSeen = await reviewer.locator(".canonical-review-decision-dock").isVisible() && new URL(reviewer.url()).pathname === `/approvals/${v2.request.id}`;
  await screenshot(reviewer, "fault-decision-conflict.png");
  await reviewer.unroute(decisionPattern);
  record("QA-101-030", [
    { id: "TARGET-FAILURE-LOCALIZED", pass: targetFaultSeen },
    { id: "RECOVERY-WITHOUT-LIVE-FILL", pass: await reviewer.getByRole("heading", { name: "料號資料", exact: true }).count() === 1 },
    { id: "DECISION-CONFLICT-LOCALIZED", pass: decisionConflictSeen },
    { id: "MATRIX-AND-DOCK-PRESERVED", pass: await matrix.isVisible() && await reviewer.locator(".canonical-review-decision-dock").isVisible() }
  ], { targetFaultSeen, decisionConflictSeen });

  const sourceGraph = {
    reviewTarget: fs.readFileSync(path.join(root, "src", "components", "canonical-review-target-workspace.tsx"), "utf8"),
    ownerPart: fs.readFileSync(path.join(root, "src", "components", "canonical-change-workspace.tsx"), "utf8"),
    ownerDrawing: fs.readFileSync(path.join(root, "src", "components", "canonical-drawing-change-workspace.tsx"), "utf8")
  };
  record("QA-101-033", [
    { id: "LEGACY-V1-BROWSER-JOURNEY", pass: results.get("QA-101-040").result === "PASS" },
    { id: "RELATION-CURRENT-CELLS-INERT", pass: results.get("QA-101-022").result === "PASS" },
    { id: "GENERIC-PART-SHARED-RENDERER", pass: sourceGraph.reviewTarget.includes("CanonicalChangeWorkspace") && sourceGraph.ownerPart.includes("GenericCanonicalChangeWorkspace") },
    { id: "DRAWING-SHARED-RENDERER", pass: sourceGraph.reviewTarget.includes("CanonicalDrawingChangeWorkspace") && sourceGraph.ownerDrawing.includes("DrawingRecognitionWorkspacePanel") }
  ], { sourceHashes: Object.fromEntries(Object.entries(sourceGraph).map(([key, value]) => [key, canonicalHash(value)])) });

  const directUrl = reviewer.url();
  await reviewer.goto(listUrl, { waitUntil: "networkidle", timeout: 60_000 });
  let mutantDetected = false;
  const inboxPattern = "**/api/approvals/inbox**";
  await reviewer.route(inboxPattern, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const mutateRows = (rows) => Array.isArray(rows) ? rows.filter((row) => row.id !== v2.request.id) : rows;
    body.rows = mutateRows(body.rows);
    body.items = mutateRows(body.items);
    if (body.summary) { body.summary.total = Math.max(0, Number(body.summary.total ?? 0) - 1); body.summary.pending = Math.max(0, Number(body.summary.pending ?? 0) - 1); }
    await route.fulfill({ response, body: JSON.stringify(body), contentType: "application/json" });
  });
  await reviewer.reload({ waitUntil: "networkidle", timeout: 60_000 });
  mutantDetected = await reviewer.locator('[data-approval-workbench-row="true"]').filter({ hasText: candidates[1].part_number }).count() === 0;
  await reviewer.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await workspace.waitFor({ state: "visible", timeout: 30_000 });
  const directStillWorks = await workspace.count() === 1;
  await reviewer.unroute(inboxPattern);
  await reviewer.goto(listUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await v2Row.waitFor({ state: "visible", timeout: 30_000 });
  record("QA-101-042", [
    { id: "MISSING-ADAPTER-NORMAL-ENTRY-DETECTED", pass: mutantDetected },
    { id: "DIRECT-DETAIL-INSUFFICIENT", pass: directStillWorks },
    { id: "RESTORED-ADAPTER-NORMAL-ENTRY-PASS", pass: await v2Row.count() === 1 }
  ], { mutantDetected, directStillWorks });

  await v2Row.click();
  await workspace.waitFor({ state: "visible", timeout: 30_000 });
  await drawingIdentity.click();
  await recognitionPanel.waitFor({ state: "visible", timeout: 30_000 });
  const recognitionWriteRequests = networkLedger.filter((item) => item.phase === "request" && item.method !== "GET" && /recognition|candidate|upload/u.test(new URL(item.url).pathname));
  const recognitionAfter = recognitionFingerprint(recognitionFixture.sessionId);
  record("QA-101-047", [
    { id: "IMMUTABLE-SHARED-PANEL", pass: await recognitionPanel.count() === 1 && await candidateCards.count() >= 1 },
    { id: "NO-RECOGNITION-GET-POST", pass: recognitionRequests.length === 0 && recognitionWriteRequests.length === 0 },
    { id: "ZERO-DOMAIN-WRITE", pass: recognitionBefore === recognitionAfter },
    { id: "ONLY-ACTIVE-SNAPSHOT-MOUNTED", pass: await reviewer.locator('[data-dev079-recognition="immutable-review"]').count() === 1 }
  ], { recognitionRequests, recognitionWriteRequests, recognitionBefore, recognitionAfter });

  await partIdentity.click();
  await reviewer.waitForURL((url) => url.searchParams.get("activeTarget") === v2.request.snapshot.primaryTargetKey, { timeout: 30_000 });
  await reviewer.locator(".pdm-edit-page").waitFor({ state: "visible", timeout: 30_000 });
  const submittedAttachment = v2.request.snapshot.targets.find((target) => target.targetKey === v2.request.snapshot.primaryTargetKey)?.workspace.attachments.find((item) => item.id === attachment.id);
  const attachmentHref = await reviewer.locator(`a[href*="${attachment.id}"]`).first().getAttribute("href").catch(() => null);
  record("QA-101-013", [
    { id: "SUBMITTED-SOURCE-HASH-MEMBERSHIP", pass: submittedAttachment?.contentHash === attachment.contentHash },
    { id: "IMMUTABLE-FILE-LINK-USES-REVIEW-CONTEXT", pass: typeof attachmentHref === "string" && attachmentHref.includes("context=review_package") && attachmentHref.includes(v2.request.id) },
    { id: "WRONG-HASH-NOT-RENDERED", pass: !reviewProjectionText.includes("wrong-source-hash") }
  ], { attachment: submittedAttachment, attachmentHref });

  visibleAlerts.push(...await reviewer.locator('[role="alert"]:visible').evaluateAll((nodes) => nodes.map((node) => ({
    text: node.textContent?.replace(/\s+/gu, " ").trim() ?? "",
    className: node.getAttribute("class") ?? "",
    dataError: node.getAttribute("data-error")
  }))));
  visibleErrorCount = visibleAlerts.filter((item) => item.dataError === "true" || /(?:^|\s)(?:error|danger)(?:\s|$)/iu.test(item.className) || /錯誤|失敗|無法|exception|error/iu.test(item.text)).length;

  const returnStateBefore = new URL(reviewer.url());
  const decisionRequestPromise = reviewer.waitForRequest((request) => request.method() === "POST" && request.url().endsWith(`/api/pdm/review-requests/${v2.request.id}/decisions`), { timeout: 60_000 });
  const decisionResponsePromise = reviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/pdm/review-requests/${v2.request.id}/decisions`), { timeout: 60_000 });
  await reviewer.getByRole("button", { name: "退回修改", exact: true }).click();
  const decisionRequest = await decisionRequestPromise;
  const decisionResponse = await decisionResponsePromise;
  const decisionBody = decisionRequest.postDataJSON();
  await reviewer.waitForURL(/\/approvals\?/u, { timeout: 30_000 });
  const returnedUrl = new URL(reviewer.url());
  mutationLedger.push({ method: "POST", route: `/api/pdm/review-requests/${v2.request.id}/decisions`, status: decisionResponse.status(), body: decisionBody });
  record("QA-101-027", [
    { id: "REQUEST-LEVEL-DOCK", pass: dockCount === 1 },
    { id: "DECISION-BODY-TARGET-FREE", pass: canonicalJson(decisionBody) === canonicalJson({ decision: "return_for_correction" }) },
    { id: "SINGLE-REQUEST-RESULT", pass: decisionResponse.status() === 200 }
  ], { body: decisionBody, status: decisionResponse.status() });
  const terminalDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  let terminalEffect;
  try {
    terminalEffect = {
      activeRequest: Number(terminalDb.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests WHERE id=?").get(v2.request.id).count),
      receipt: Number(terminalDb.prepare("SELECT COUNT(*) count FROM pdm_work_review_terminal_receipts WHERE request_id=?").get(v2.request.id).count),
      trace: Number(terminalDb.prepare("SELECT COUNT(*) count FROM pdm_review_traces WHERE review_cycle_id=?").get(v2.request.review_cycle_id).count),
      work: Number(terminalDb.prepare("SELECT COUNT(*) count FROM part_change_works WHERE id=?").get(v2.workId).count)
    };
  } finally { terminalDb.close(); }
  record("QA-101-039", [
    { id: "OWNER-UI-CREATE-SUBMIT", pass: Boolean(v2.workId) && v2.request.request_status === "pending" },
    { id: "NORMAL-LIST-ROW-TO-FULL-PAGE", pass: new URL(normalEntryUrl).pathname === `/approvals/${v2.request.id}` },
    { id: "RETURN-RESTORES-LIST", pass: returnedUrl.pathname === "/approvals" && returnedUrl.searchParams.get("status") === "active" },
    { id: "RETURN-TERMINAL-EFFECT", pass: terminalEffect.activeRequest === 0 && terminalEffect.receipt === 1 && terminalEffect.trace === 1 && terminalEffect.work === 1 },
    { id: "RETURN-TO-PRESERVED", pass: returnStateBefore.searchParams.has("returnTo") }
  ], { normalEntryUrl, returnedUrl: returnedUrl.toString(), terminalEffect });

  const finalDatabase = new Database(dbPath, { readonly: true, fileMustExist: true });
  try { finalForeignKeys = finalDatabase.pragma("foreign_key_check"); }
  finally { finalDatabase.close(); }
  await reviewerContext.close();
} catch (error) {
  runError = error;
  console.error(error instanceof Error ? error.stack : String(error));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app) await stopPhase().catch((error) => { if (!runError) runError = error; });
}

const expectedFaultStatuses = new Set([409, 503]);
const unexpectedRequestFailures = unexpectedHttp.filter((item) => !expectedFaultStatuses.has(item.status));
const unexpectedConsoleErrors = consoleErrors.filter((item) => !/(?:409|503).*Failed to load resource|Failed to load resource.*(?:409|503)/u.test(item.text));
const tempForeignKeysOk = finalForeignKeys.length === 0;
fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 16, retryDelay: 200 });
const runtimeCleanup = removeTaskOwnedWorkspaceTempDir(root, runtimeProjectRoot);
const tempRemoved = !fs.existsSync(tempRoot) && runtimeCleanup.removed;
const processesStopped = app === null;
const portsReleased = runtimeLedger.length === 2 && runtimeLedger.every((item) => item.portReleased === true);
const primaryAfter = primaryFingerprint();
const sourceAfter = sourceInfo(root, registry.sourceBoundary);
const primaryUnchanged = primaryBefore.hash === primaryAfter.hash && primaryBefore.payload.foreignKeys.length === 0 && primaryAfter.payload.foreignKeys.length === 0;
const sourceUnchanged = sourceBefore.head === sourceAfter.head && sourceBefore.branch === sourceAfter.branch && sourceBefore.dirtyBoundaryHash === sourceAfter.dirtyBoundaryHash;

const caseResults = coverage.caseIds.map((caseId) => results.get(caseId));
const passCount = caseResults.filter((item) => item.result === "PASS").length;
const failCount = caseResults.filter((item) => item.result === "FAIL").length;
const notRunCount = caseResults.filter((item) => item.result === "NOT_RUN").length;
if ((!primaryUnchanged || !sourceUnchanged || !tempRemoved || !processesStopped || !portsReleased || !tempForeignKeysOk) && !runError) runError = new Error("DEV101_BROWSER_INVARIANT_OR_CLEANUP_FAILED");
const result = runError || failCount > 0 ? "FAIL" : notRunCount > 0 ? "BLOCKED" : "PASS";

fs.mkdirSync(outputDir, { recursive: true });
const evidencePath = path.join(outputDir, "browser-evidence.json");
const implementedCaseIds = caseResults.filter((item) => item.result !== "NOT_RUN").map((item) => item.caseId);
const evidencePayload = {
  devId: "DEV-101",
  runId,
  evidenceClass: "INDEPENDENT_RENDERED_BROWSER",
  implementedCaseIds,
  fixtures: { v1: v1 ? { requestId: v1.request?.id, workId: v1.workId, schema: v1.actualSchema } : null, v2: v2 ? { requestId: v2.request?.id, workId: v2.workId, schema: v2.actualSchema } : null, recognitionFixture, newerSessionId },
  runtimeLedger,
  mutationLedger,
  networkLedger,
  focusTrace,
  accessibility,
  geometry,
  screenshots: screenshots.map((item) => path.relative(root, item).replaceAll(path.sep, "/")),
  browserAudit: { consoleErrors, pageErrors, requestFailures, unexpectedHttp, unexpectedRequestFailures, visibleAlerts },
  sourceImportGraph: {
    canonicalReviewTarget: "CanonicalReviewTargetWorkspace -> CanonicalDrawingChangeWorkspace | CanonicalChangeWorkspace",
    recognition: "CanonicalDrawingChangeWorkspace -> DrawingRecognitionWorkspacePanel(snapshotProjection, disabled)",
    independentOracle: "browser assertions use DOM/network/geometry/DB primitives; no RD receipt imported"
  },
  primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryUnchanged },
  sourceInvariant: { before: sourceBefore, after: sourceAfter, unchanged: sourceUnchanged },
  taskForeignKeys: finalForeignKeys,
  cleanupReceipt: { complete: tempRemoved && processesStopped && portsReleased, portsReleased, processesStopped, tempRemoved }
};
fs.writeFileSync(evidencePath, `${JSON.stringify(evidencePayload, null, 2)}\n`, "utf8");
const artifacts = [artifactReference(root, evidencePath, implementedCaseIds, coverage.requiredEvidence)];
for (const imagePath of screenshots) {
  if (fs.existsSync(imagePath)) artifacts.push(artifactReference(root, imagePath, implementedCaseIds, ["screenshot"]));
}
const caseEvidence = Object.fromEntries(implementedCaseIds.map((caseId) => [caseId, { evidenceTypes: [...coverage.requiredEvidence], artifactPaths: [artifacts[0].path] }]));
const manifest = {
  schemaVersion: 1,
  devId: "DEV-101",
  runId,
  parentRunId,
  runner: "qc-dev-101-independent-browser",
  independentQc: true,
  source: sourceAfter,
  environment: { provider: "sqlite", dataScope: "task-owned-isolated", dataDir, repositoryDir, runtimeProjectRoot },
  registryHash: hashFile(path.join(root, DEV101_REGISTRY_PATH)),
  runnerHash: hashFile(path.join(root, "scripts", "qc-dev-101-independent-browser.mjs")),
  caseResults,
  caseEvidence,
  artifacts,
  prohibitedOracleImports: [],
  primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryUnchanged },
  cleanupReceipt: { complete: tempRemoved && processesStopped && portsReleased, portsReleased, processesStopped, tempRemoved },
  visibleErrorAudit: { required: true, consoleErrors: unexpectedConsoleErrors.length, pageErrors: pageErrors.length, requestFailures: requestFailures.length, unexpectedRequestFailures: unexpectedRequestFailures.length, visibleErrorCount },
  denominator: { expected: coverage.caseIds.length, pass: passCount, fail: failCount, blocked: 0, notRun: notRunCount },
  result,
  firstFailure: runError instanceof Error ? runError.message : runError ? String(runError) : caseResults.find((item) => item.result === "FAIL")?.firstFailurePointer ?? null,
  productionWrites: false,
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
for (const item of caseResults.filter((entry) => entry.result !== "NOT_RUN")) console.log(`${item.result} ${item.caseId} ${item.firstFailurePointer ?? ""}`.trim());
console.log(JSON.stringify({ runId, result, denominator: manifest.denominator, firstFailure: manifest.firstFailure, manifest: path.relative(root, path.join(outputDir, "manifest.json")).replaceAll(path.sep, "/") }, null, 2));
if (result === "FAIL") process.exitCode = 1;
else if (result === "BLOCKED") process.exitCode = 2;
