import crypto from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const schemaArg = process.argv.find((value) => value.startsWith("--schema="))?.split("=", 2)[1] ?? "v2";
if (!new Set(["v1", "v2"]).has(schemaArg)) throw new Error(`Unsupported schema: ${schemaArg}`);
const expectedSchema = schemaArg;
const v2Enabled = expectedSchema === "v2";
const runId = `DEV101-OWNER-${expectedSchema.toUpperCase()}-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-101", runId);
const sourceDataDir = path.join(root, "data");
const sourceDbPath = path.join(sourceDataDir, "ai-pdm.sqlite");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ai-pdm-dev101-owner-${expectedSchema}-`));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const runtimeProjectRoot = path.join(root, ".tmp", `qc-dev101-owner-runtime-project-${expectedSchema}-${crypto.randomUUID()}`);
const checks = [];
const mutationLedger = [];
let app = null;
let browser = null;
let port = null;
let fixture = null;
let screenshotPath = null;
let runError = null;
let fixtureAttachment = null;
const browserEvidence = {
  networkLedger: [],
  requestFailures: [],
  consoleErrors: [],
  pageErrors: [],
  focusTrace: [],
  geometry: [],
  accessibilityTree: null,
  renderedDom: null,
  visibleErrors: [],
  screenshots: []
};

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function prepareTaskOwnedRuntimeProject(targetRoot) {
  const workspaceTemp = path.resolve(root, ".tmp");
  const resolved = path.resolve(targetRoot);
  if (!resolved.startsWith(`${workspaceTemp}${path.sep}`) || !path.basename(resolved).startsWith("qc-dev101-owner-runtime-project-")) throw new Error(`UNSAFE_RUNTIME_PROJECT_PATH:${resolved}`);
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
  if (process.env.DEV101_MUTATE_INBOX_ADAPTER === "true") {
    const repositoryPath = path.join(resolved, "src", "lib", "repositories", "approval-platform-async-repository.ts");
    const source = fs.readFileSync(repositoryPath, "utf8");
    const adapterCall = `this.listPdmWorkReviewInbox({
        companyId,
        actorId: input.actorId,
        status: input.status,
        domainCode: input.domainCode,
        actionCode: input.actionCode,
        allowedActionCodes: input.allowedActionCodes,
        query: input.query,
        cursor: input.cursor,
        // Canonical review cursor/count must not be clipped by the generic
        // per-source prefetch floor. The public inbox contract is capped at
        // 500 rows, so fetch that bounded window after actor/filter pushdown.
        limit: 500
      }),`;
    if (!source.includes(adapterCall)) throw new Error("DEV101_INBOX_MUTANT_ANCHOR_MISSING");
    fs.writeFileSync(repositoryPath, source.replace(adapterCall, "Promise.resolve([]), // DEV101 task-owned missing inbox adapter mutant"), "utf8");
  }
  fs.mkdirSync(path.join(resolved, "scripts"), { recursive: true });
  for (const file of ["qc-process-warning-guard.mjs", "qc-node-listener-budget.cjs"]) fs.copyFileSync(path.join(root, "scripts", file), path.join(resolved, "scripts", file));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(resolved, "node_modules"), "junction");
}

function primaryState() {
  const database = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    const payload = {
      schema: database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all(),
      roots: database.prepare("SELECT id, company_id, root_code FROM part_roots ORDER BY company_id, id").all(),
      parts: database.prepare("SELECT id, company_id, part_root_id, part_number FROM part_numbers ORDER BY company_id, id").all(),
      drawingNumbers: database.prepare("SELECT id, company_id, part_root_id, drawing_number FROM drawing_numbers ORDER BY company_id, id").all(),
      drawings: database.prepare("SELECT id, company_id, drawing_number, formal_drawing_number_id FROM drawings ORDER BY company_id, id").all(),
      residue: database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { ...payload, hash: stableHash(payload) };
  } finally {
    database.close();
  }
}

function check(id, description, pass, detail = "") {
  checks.push({ id, description, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${id}: ${description}${detail ? ` — ${detail}` : ""}`);
}

function isPortReleased(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
    const finish = (released) => { socket.destroy(); resolve(released); };
    socket.setTimeout(1_000, () => finish(true));
    socket.once("connect", () => finish(false));
    socket.once("error", () => finish(true));
  });
}

function readRequestByWork(workId) {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = database.prepare(`
      SELECT request.id, request.company_id, request.request_kind, request.entity_type,
             request.canonical_entity_id, request.work_id, request.reviewer_user_id,
             request.review_cycle_id,
             request.snapshot_payload, request.snapshot_hash, request.request_status,
             request.row_version, part.part_number
      FROM pdm_work_review_requests request
      JOIN part_numbers part
        ON part.id = request.canonical_entity_id
       AND part.company_id = request.company_id
      WHERE request.work_id = ?
      ORDER BY request.created_at, request.id
      LIMIT 1
    `).get(workId);
    return row ? { ...row, snapshot: JSON.parse(row.snapshot_payload) } : null;
  } finally {
    database.close();
  }
}

function mutateContextDrawing(snapshot) {
  const target = snapshot?.targets?.find((candidate) => candidate?.workspace?.kind === "drawing");
  assert.ok(target?.workspace?.entityId, "v2 request must contain a context Drawing target");
  const database = new Database(dbPath);
  try {
    const before = database.prepare("SELECT purpose_description FROM drawings WHERE id = ?").get(target.workspace.entityId);
    assert.ok(before, "context Drawing must exist before drift mutation");
    const next = `${before.purpose_description ?? ""} [DEV101 drift]`;
    database.prepare("UPDATE drawings SET purpose_description = ? WHERE id = ?").run(next, target.workspace.entityId);
    mutationLedger.push({ method: "SQL", table: "drawings", id: target.workspace.entityId, field: "purpose_description", before: before.purpose_description, after: next, purpose: "post-submit context drift oracle" });
    return target.workspace.entityId;
  } finally {
    database.close();
  }
}

function seedPartAttachment(partId) {
  const id = `dev101-attachment-${crypto.randomUUID()}`;
  const bytes = Buffer.from("DEV-101 immutable review package attachment evidence\n", "utf8");
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const storageKey = `dev101/${id}.txt`;
  const localPath = path.join(repositoryDir, ...storageKey.split("/"));
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, bytes);
  const database = new Database(dbPath);
  try {
    database.prepare(`INSERT INTO file_assets
      (id,storage_provider,original_path,storage_key,file_name,file_ext,mime_type,file_size,content_hash,hash_algorithm,
       linked_entity_type,linked_entity_id,document_category,display_name,description,uploaded_by,sync_status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, "local_repository", localPath, storageKey, `${id}.txt`, ".txt", "text/plain", bytes.byteLength, contentHash, "SHA-256",
      "part_number", partId, "other", "DEV-101 送審附件", "task-owned immutable review evidence", "user-engineer-demo", "local_only"
    );
  } finally { database.close(); }
  mutationLedger.push({ method: "FIXTURE", table: "file_assets", id, linkedEntityId: partId, storageKey, contentHash, purpose: "post-preflight immutable review-package file security oracle" });
  return { id, bindingId: id, partId, storageKey, localPath, contentHash, bytes: bytes.byteLength };
}

function seedRecognitionProjectionFixture(candidate, fallbackAttachment) {
  const database = new Database(dbPath);
  try {
    const target = database.prepare(`SELECT drawing.id AS drawing_id, revision.id AS revision_id,
        asset.id AS file_asset_id, asset.content_hash, asset.storage_generation, asset.file_name, asset.file_ext,
        asset.mime_type, asset.file_size, file.role AS source_role
      FROM drawings drawing
      JOIN drawing_revisions revision ON revision.drawing_id = drawing.id AND revision.company_id = drawing.company_id
      LEFT JOIN drawing_revision_files file ON file.drawing_revision_id = revision.id AND file.company_id = revision.company_id
        AND file.removed_at IS NULL
      LEFT JOIN file_assets asset ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
      WHERE drawing.company_id = ? AND drawing.part_root_id = ?
      ORDER BY revision.updated_at DESC, revision.id DESC, file.is_primary DESC, file.sort_order, file.id
      LIMIT 1`).get(candidate.company_id, candidate.part_root_id);
    assert.ok(target?.drawing_id && target?.revision_id, "recognition fixture requires a Drawing revision in the selected root");
    const fallbackAsset = database.prepare("SELECT id AS file_asset_id, content_hash, storage_generation, file_name, file_ext, mime_type, file_size FROM file_assets WHERE id = ?").get(fallbackAttachment.id);
    const sourceAsset = target.file_asset_id ? target : { ...fallbackAsset, source_role: "fixture_evidence" };
    assert.ok(sourceAsset?.file_asset_id && sourceAsset?.content_hash, "recognition fixture requires a hashed source asset");
    const sessionId = `dev101-recognition-${crypto.randomUUID()}`;
    const sourceId = `dev101-recognition-source-${crypto.randomUUID()}`;
    const adapterId = `dev101-recognition-adapter-${crypto.randomUUID()}`;
    const observationId = `dev101-recognition-observation-${crypto.randomUUID()}`;
    const candidateId = `dev101-recognition-candidate-${crypto.randomUUID()}`;
    const createdAt = "2098-01-01T00:00:00.000Z";
    database.transaction(() => {
      database.prepare(`INSERT INTO drawing_recognition_sessions
        (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,
         source_set_fingerprint,deduplication_key,status,row_version,created_by,created_at,updated_at)
        VALUES(?,?, 'drawing_revision', ?, ?, ?, ?, ?, ?, 'review_ready', 1, 'user-engineer-demo', ?, ?)`).run(
        sessionId, candidate.company_id, target.revision_id, `drawing_revision:${target.revision_id}`, target.drawing_id, target.revision_id,
        `fixture:${sourceAsset.content_hash}`, sessionId, createdAt, createdAt
      );
      database.prepare(`INSERT INTO drawing_recognition_sources
        (id,session_id,company_id,file_asset_id,content_hash,storage_generation,file_name,file_ext,mime_type,file_size,source_role,sort_order,adapter_plan_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        sourceId, sessionId, candidate.company_id, sourceAsset.file_asset_id, sourceAsset.content_hash, sourceAsset.storage_generation ?? null,
        sourceAsset.file_name, sourceAsset.file_ext, sourceAsset.mime_type, Number(sourceAsset.file_size ?? 0), sourceAsset.source_role ?? "drawing_2d", 0, '["dev101.fixture.v1"]', createdAt
      );
      database.prepare(`INSERT INTO drawing_recognition_adapter_results
        (id,session_id,source_id,company_id,adapter_code,adapter_version,status,observation_count,diagnostics_json,started_at,completed_at)
        VALUES(?,?,?,?, 'dev101.fixture.v1', '1', 'succeeded', 1, '[]', ?, ?)`).run(adapterId, sessionId, sourceId, candidate.company_id, createdAt, createdAt);
      database.prepare(`INSERT INTO drawing_recognition_observations
        (id,session_id,source_id,adapter_result_id,company_id,raw_text,raw_value,normalized_value,location_kind,page_number,
         geometry_json,confidence_band,extractor_code,extractor_version,captured_at)
        VALUES(?,?,?,?,?, '製圖者：DEV101 RD', 'DEV101 RD', 'DEV101 RD', 'page_region', 1,
         '{"coordinateSpace":"normalized_page","origin":"top_left","x":0.1,"y":0.1,"width":0.2,"height":0.08}',
         'high', 'dev101.fixture.v1', '1', ?)`).run(observationId, sessionId, sourceId, adapterId, candidate.company_id, createdAt);
      database.prepare(`INSERT INTO drawing_recognition_candidates
        (id,session_id,company_id,category,field_key,field_label,raw_value,proposed_value,normalized_value,
         applicability_scope,variant_status,confidence_band,review_state,group_key,sort_order,row_version,created_at,updated_at)
        VALUES(?,?,?, 'drawing_revision', 'drawn_by_name', '製圖者', 'DEV101 RD', 'DEV101 RD', 'DEV101 RD',
         'overall', 'added', 'high', 'accepted', 'dev101:drawn_by_name', 0, 1, ?, ?)`).run(candidateId, sessionId, candidate.company_id, createdAt, createdAt);
      database.prepare("INSERT INTO drawing_recognition_candidate_observations (candidate_id,observation_id,company_id,created_at) VALUES(?,?,?,?)").run(candidateId, observationId, candidate.company_id, createdAt);
    })();
    mutationLedger.push({ method: "FIXTURE", tables: ["drawing_recognition_sessions", "drawing_recognition_sources", "drawing_recognition_adapter_results", "drawing_recognition_observations", "drawing_recognition_candidates", "drawing_recognition_candidate_observations"], sessionId, drawingId: target.drawing_id, revisionId: target.revision_id, purpose: "post-preflight editor-to-review immutable recognition projection oracle" });
    return { sessionId, drawingId: target.drawing_id, revisionId: target.revision_id };
  } finally { database.close(); }
}

function softDeletePartAttachment(attachment) {
  const database = new Database(dbPath);
  try {
    database.prepare(`UPDATE file_assets SET deleted_at=CURRENT_TIMESTAMP,deleted_by='user-engineer-demo',
      deleted_reason='DEV101 post-submit drift',display_name='目前已更名的附件' WHERE id=?`).run(attachment.id);
  } finally { database.close(); }
  mutationLedger.push({ method: "SQL", table: "file_assets", id: attachment.id, fields: ["deleted_at", "deleted_by", "deleted_reason", "display_name"], purpose: "post-submit attachment drift and submitted-object read oracle" });
}

function selectEligiblePart() {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const preflight = {
      masterCounts: Object.fromEntries(["part_roots", "part_numbers", "drawing_numbers", "drawings"].map((table) => [table, Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)])),
      foreignKeys: database.pragma("foreign_key_check"),
      migrationResidue: database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all()
    };
    const candidate = database.prepare(`
      SELECT state.canonical_entity_id AS part_id, state.row_version AS formal_row_version,
             part.company_id, part.part_number, part.part_name, part.part_root_id,
             root.root_code,
             (SELECT COUNT(*) FROM drawing_numbers drawing_number
               WHERE drawing_number.company_id = part.company_id
                 AND drawing_number.part_root_id = part.part_root_id) AS drawing_count,
             (SELECT COUNT(*) FROM drawing_recognition_sessions session
               JOIN drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
               WHERE session.company_id = part.company_id
                 AND drawing.part_root_id = part.part_root_id
                 AND session.source_context_type = 'drawing_revision'
                 AND session.source_context_id = session.drawing_revision_id) AS recognition_count
      FROM canonical_workbench_states state
      JOIN part_numbers part
        ON part.id = state.canonical_entity_id
       AND part.company_id = state.company_id
      JOIN part_roots root
        ON root.id = part.part_root_id
       AND root.company_id = part.company_id
      WHERE state.entity_type = 'part'
        AND state.data_layer = 'part_formal'
        AND state.handling = 'none'
        AND state.work_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM part_change_works work
           WHERE work.company_id = part.company_id
             AND work.part_id = part.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM pdm_work_review_requests request
           WHERE request.company_id = part.company_id
             AND request.canonical_entity_id = part.id
             AND request.request_status IN ('pending', 'applying', 'apply_failed')
        )
      ORDER BY recognition_count DESC, drawing_count DESC, part.part_number
      LIMIT 1
    `).get();
    return { preflight, candidate };
  } finally {
    database.close();
  }
}

const primaryBefore = primaryState();
let primaryAfter = primaryBefore;

try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.copyFileSync(sourceDbPath, dbPath);
  if (fs.existsSync(path.join(sourceDataDir, "repository"))) fs.cpSync(path.join(sourceDataDir, "repository"), repositoryDir, { recursive: true });

  const { preflight, candidate } = selectEligiblePart();
  fixture = candidate;
  check(`DEV101-OWNER-${expectedSchema}-001`, "unmodified source snapshot passes master-count, migration-residue and global foreign-key preflight", Object.values(preflight.masterCounts).every((count) => count > 0) && preflight.foreignKeys.length === 0, JSON.stringify(preflight));
  check(`DEV101-OWNER-${expectedSchema}-002`, "normal owner-flow candidate exists, has a drawing axis and has no pre-existing work or review request", Boolean(candidate) && Number(candidate.drawing_count) > 0, JSON.stringify(candidate));
  fixtureAttachment = seedPartAttachment(candidate.part_id);
  if (v2Enabled) seedRecognitionProjectionFixture(candidate, fixtureAttachment);

  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_REVIEW_PACKAGE_V2_WRITE = v2Enabled ? "true" : "false";
  process.env.PDM_NEXT_DIST_DIR = ".next";
  process.env.PDM_NEXT_TSCONFIG_PATH = "tsconfig.next.json";
  prepareTaskOwnedRuntimeProject(runtimeProjectRoot);
  port = await getFreePort();
  console.log(JSON.stringify({
    runtimeDeclaration: {
      project: root,
      purpose: `DEV-101 rendered owner create/submit to reviewer inbox ${expectedSchema} flow`,
      port,
      owningProcessTree: `QC process ${process.pid} -> task-owned Next child`,
      cleanupCondition: "browser closed, verified Next child tree stopped, port released, task temp removed",
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      mutationScope: `task-owned SQLite/repository plus isolated runtime project ${runtimeProjectRoot}`
    }
  }));
  app = startNextApp(runtimeProjectRoot, "dev", port);
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForNextAppReady(baseUrl, app.getOutput, 90_000);
  browser = await chromium.launch({ headless: process.env.PDM_QC_HEADED !== "true" });

  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const ownerLogin = await ownerContext.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Engineer" } });
  mutationLedger.push({ method: "POST", route: "/api/auth/local-quick-login", actor: "Engineer", status: ownerLogin.status() });
  check(`DEV101-OWNER-${expectedSchema}-003`, "engineer login succeeds in the isolated runtime", ownerLogin.ok(), `HTTP ${ownerLogin.status()}`);

  const owner = await ownerContext.newPage();
  await owner.goto(`${baseUrl}/parts?query=${encodeURIComponent(candidate.part_number)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await owner.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await owner.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
  const formalRow = owner.locator('[data-canonical-workbench-row="true"]').filter({ hasText: candidate.part_number }).filter({ hasText: "正式資料" }).first();
  await formalRow.waitFor({ state: "visible", timeout: 30_000 });
  await formalRow.locator(".canonical-row-open").click();
  const createButton = owner.getByRole("button", { name: "建立修改", exact: true });
  await createButton.waitFor({ state: "visible", timeout: 60_000 });
  const createResponsePromise = owner.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/api/pdm/parts/${candidate.part_id}/change-works`), { timeout: 60_000 });
  await createButton.click();
  const createResponse = await createResponsePromise;
  const createBody = await createResponse.json().catch(() => null);
  const workId = createBody?.data?.workId ?? null;
  mutationLedger.push({ method: "POST", route: `/api/pdm/parts/${candidate.part_id}/change-works`, actor: "Engineer", status: createResponse.status(), workId });
  await owner.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.get("workId") === workId, { timeout: 30_000 });
  await owner.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  check(`DEV101-OWNER-${expectedSchema}-004`, "rendered Part workbench creates a canonical owner work without direct database seeding", createResponse.status() === 200 && Boolean(workId) && await owner.getByRole("button", { name: "送出審核", exact: true }).isEnabled(), JSON.stringify({ status: createResponse.status(), body: createBody, url: owner.url() }));

  const submitButton = owner.getByRole("button", { name: "送出審核", exact: true });
  await submitButton.waitFor({ state: "visible", timeout: 60_000 });
  const submitResponsePromise = owner.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/pdm/part-change-works/${workId}/submit`), { timeout: 60_000 });
  await submitButton.click();
  const submitResponse = await submitResponsePromise;
  const submitBody = await submitResponse.json().catch(() => null);
  mutationLedger.push({ method: "POST", route: `/api/pdm/part-change-works/${workId}/submit`, actor: "Engineer", status: submitResponse.status() });
  await owner.waitForURL((url) => url.pathname === "/parts", { timeout: 30_000 });
  const requestRow = readRequestByWork(workId);
  const actualSchema = requestRow?.snapshot?.schemaVersion === "pdm-review-package-v2" ? "v2" : "v1";
  check(`DEV101-OWNER-${expectedSchema}-005`, `rendered owner UI persists an actual ${expectedSchema} request with the assigned reviewer`, submitResponse.status() === 200 && requestRow?.request_kind === "part_change" && requestRow?.request_status === "pending" && requestRow?.reviewer_user_id === "user-manager-demo" && actualSchema === expectedSchema, JSON.stringify({ submitStatus: submitResponse.status(), submitBody, requestRow, actualSchema }));
  const packageBeforeDrift = v2Enabled ? { snapshot: requestRow.snapshot, hash: requestRow.snapshot_hash } : null;
  if (v2Enabled) {
    mutateContextDrawing(requestRow.snapshot);
    softDeletePartAttachment(fixtureAttachment);
  }
  await ownerContext.close();

  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const reviewerLogin = await reviewerContext.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "R&D Manager" } });
  mutationLedger.push({ method: "POST", route: "/api/auth/local-quick-login", actor: "R&D Manager", status: reviewerLogin.status() });
  check(`DEV101-OWNER-${expectedSchema}-006`, "assigned reviewer login succeeds", reviewerLogin.ok(), `HTTP ${reviewerLogin.status()}`);

  if (v2Enabled) {
    const submittedTarget = requestRow.snapshot.targets.find((target) => target.scope === "submitted");
    assert.ok(submittedTarget, "v2 submitted target missing");
    const [entityType, entityId] = submittedTarget.targetKey.split(":", 2);
    const shellResponse = await reviewerContext.request.get(`${baseUrl}/api/pdm/review-requests/${requestRow.id}`);
    const targetResponse = await reviewerContext.request.get(`${baseUrl}/api/pdm/review-requests/${requestRow.id}/targets/${entityType}/${entityId}`);
    const invalidTargetResponse = await reviewerContext.request.get(`${baseUrl}/api/pdm/review-requests/${requestRow.id}/targets/${entityType}/foreign-target`);
    const targetResponseBody = await targetResponse.json().catch(() => null);
    check("DEV101-API-V2-001", "assigned reviewer can read the v2 shell and exact immutable target while arbitrary target IDs fail closed", shellResponse.status() === 200 && targetResponse.status() === 200 && invalidTargetResponse.status() === 404, JSON.stringify({ targetKey: submittedTarget.targetKey, entityType, entityId, shell: shellResponse.status(), target: targetResponse.status(), targetBody: targetResponseBody, invalidTarget: invalidTargetResponse.status() }));
    const fileQuery = new URLSearchParams({ context: "review_package", contextId: fixtureAttachment.partId, bindingId: fixtureAttachment.bindingId, reviewRequestId: requestRow.id });
    const exactFileResponse = await reviewerContext.request.get(`${baseUrl}/api/pdm/file-assets/${fixtureAttachment.id}?${fileQuery}`);
    const exactFileBytes = Buffer.from(await exactFileResponse.body());
    const wrongBindingQuery = new URLSearchParams({ context: "review_package", contextId: fixtureAttachment.partId, bindingId: "foreign-binding", reviewRequestId: requestRow.id });
    const wrongBindingResponse = await reviewerContext.request.get(`${baseUrl}/api/pdm/file-assets/${fixtureAttachment.id}?${wrongBindingQuery}`);
    check("DEV101-API-V2-002", "submitted soft-deleted attachment remains readable only through exact request/target/binding/hash membership", exactFileResponse.status() === 200 && crypto.createHash("sha256").update(exactFileBytes).digest("hex") === fixtureAttachment.contentHash && wrongBindingResponse.status() === 404, JSON.stringify({ exact: exactFileResponse.status(), wrongBinding: wrongBindingResponse.status() }));
    const malformedDecision = await reviewerContext.request.post(`${baseUrl}/api/pdm/review-requests/${requestRow.id}/decisions`, { data: { decision: "approve", target: submittedTarget.targetKey } });
    const invalidDecision = await reviewerContext.request.post(`${baseUrl}/api/pdm/review-requests/${requestRow.id}/decisions`, { data: { decision: "needs_info" } });
    const activeAfterInvalid = readRequestByWork(workId);
    check("DEV101-API-V2-003", "decision endpoint accepts only one exact approve/return field and invalid bodies have zero effect", malformedDecision.status() === 422 && invalidDecision.status() === 422 && activeAfterInvalid?.request_status === "pending", JSON.stringify({ malformed: malformedDecision.status(), invalid: invalidDecision.status(), active: activeAfterInvalid?.request_status }));
    const otherContext = await browser.newContext();
    try {
      const otherLogin = await otherContext.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Engineer" } });
      const otherShell = await otherContext.request.get(`${baseUrl}/api/pdm/review-requests/${requestRow.id}`);
      const otherFile = await otherContext.request.get(`${baseUrl}/api/pdm/file-assets/${fixtureAttachment.id}?${fileQuery}`);
      check("DEV101-API-V2-004", "owner/non-reviewer cannot hydrate shell or submitted file facts", otherLogin.ok() && [403, 404].includes(otherShell.status()) && [403, 404].includes(otherFile.status()), JSON.stringify({ login: otherLogin.status(), shell: otherShell.status(), file: otherFile.status() }));
    } finally { await otherContext.close(); }
  }

  const reviewer = await reviewerContext.newPage();
  const recognitionNetwork = [];
  reviewer.on("response", (response) => {
    const request = response.request();
    browserEvidence.networkLedger.push({ method: request.method(), url: response.url(), status: response.status(), resourceType: request.resourceType() });
  });
  reviewer.on("requestfailed", (request) => {
    browserEvidence.requestFailures.push({ method: request.method(), url: request.url(), resourceType: request.resourceType(), errorText: request.failure()?.errorText ?? null });
  });
  reviewer.on("console", (message) => {
    if (message.type() === "error") browserEvidence.consoleErrors.push({ text: message.text(), location: message.location() });
  });
  reviewer.on("pageerror", (error) => browserEvidence.pageErrors.push(error.message));
  reviewer.on("request", (request) => {
    if (/\/api\/numbering\/(?:recognition-sessions|drawings\/[^/]+\/recognition-session)/u.test(new URL(request.url()).pathname)) recognitionNetwork.push({ method: request.method(), url: request.url() });
  });
  const listUrl = `${baseUrl}/approvals?status=active&domain=numbering&action=numbering.pdm_part_change_review&query=${encodeURIComponent(candidate.part_number)}`;
  await reviewer.goto(listUrl, { waitUntil: "networkidle", timeout: 45_000 });
  const inboxRow = reviewer.locator('[data-approval-workbench-row="true"]').filter({ hasText: candidate.part_number }).first();
  if (process.env.DEV101_MUTATE_INBOX_ADAPTER === "true") {
    await reviewer.waitForFunction(() => document.querySelector(".approval-page")?.getAttribute("aria-busy") !== "true", null, { timeout: 30_000 }).catch(() => {});
    check("DEV101-MUTANT-INBOX-001", "task-owned missing canonical inbox adapter removes the freshly submitted request from normal entry", await inboxRow.count() === 0);
    throw new Error("DEV101_EXPECTED_MUTANT_DETECTED");
  }
  await inboxRow.waitFor({ state: "visible", timeout: 30_000 });
  check(`DEV101-OWNER-${expectedSchema}-007`, "newly submitted request is discoverable from the assigned reviewer's normal approval inbox", await reviewer.locator(".approval-count").innerText() === "1 筆" && (await inboxRow.innerText()).includes(candidate.part_number));

  await inboxRow.click();
  await reviewer.waitForURL(new RegExp(`/approvals/${requestRow.id}`, "u"), { timeout: 30_000 });
  const reviewUrl = new URL(reviewer.url());
  const returnTo = reviewUrl.searchParams.get("returnTo") ?? "";
  check(`DEV101-OWNER-${expectedSchema}-008`, "approval row opens the full-page workspace and preserves list filters, query and selection", returnTo.includes("status=active") && returnTo.includes("domain=numbering") && returnTo.includes("action=numbering.pdm_part_change_review") && returnTo.includes(`query=${encodeURIComponent(candidate.part_number)}`) && returnTo.includes(`requestId=${requestRow.id}`), returnTo);

  if (v2Enabled) {
    await reviewer.locator('[data-review-schema="pdm-review-package-v2"]').waitFor({ state: "visible", timeout: 30_000 });
    await reviewer.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    const recognitionDrawingSnapshot = requestRow.snapshot.targets.find((target) => target.workspace.kind === "drawing" && target.workspace.recognition?.schemaVersion === "pdm-recognition-review-projection-v1");
    const drawingTarget = recognitionDrawingSnapshot
      ? reviewer.locator(".pdm-relation-matrix thead .pdm-relation-matrix-identity").filter({ hasText: recognitionDrawingSnapshot.workspace.identity.code }).first()
      : reviewer.locator(".pdm-relation-matrix thead .pdm-relation-matrix-identity").first();
    const partTarget = reviewer.locator(".pdm-relation-matrix tbody th .pdm-relation-matrix-identity").filter({ hasText: candidate.part_number }).first();
    check(`DEV101-OWNER-${expectedSchema}-009`, "v2 review page simultaneously exposes the Drawing-Part matrix and both target types", await reviewer.getByRole("region", { name: "圖料關聯矩陣" }).count() === 1 && await drawingTarget.count() === 1 && await partTarget.count() === 1 && await reviewer.locator(".pdm-relation-matrix-marker").count() >= 1);
    const partIdentityWrap = partTarget.locator("xpath=..");
    const submittedMarker = partIdentityWrap.getByRole("button", { name: "此對象屬於本次送審範圍", exact: true });
    await submittedMarker.focus();
    browserEvidence.focusTrace.push({ step: "marker-focus", active: await submittedMarker.evaluate((node) => node === document.activeElement) });
    const focusTooltipVisible = await reviewer.getByRole("tooltip", { name: "此對象屬於本次送審範圍", exact: true }).isVisible();
    await submittedMarker.click();
    await reviewer.keyboard.press("Escape");
    browserEvidence.focusTrace.push({ step: "escape-restores-marker", active: await submittedMarker.evaluate((node) => node === document.activeElement), expanded: await submittedMarker.getAttribute("aria-expanded") });
    check("DEV101-UX-V2-003", "marker keeps three fixed visual slots and focus/click/Escape tooltip behavior restores trigger focus", await partIdentityWrap.locator("[data-marker-slot]").count() === 3 && focusTooltipVisible && await submittedMarker.getAttribute("aria-expanded") === "false" && await submittedMarker.evaluate((node) => node === document.activeElement));
    await drawingTarget.click();
    await reviewer.waitForURL((url) => url.searchParams.get("activeTarget")?.startsWith("drawing:") === true, { timeout: 30_000 });
    await reviewer.getByRole("heading", { name: "版次與檔案", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    check(`DEV101-OWNER-${expectedSchema}-010`, "matrix target click switches to the embedded shared readonly Drawing renderer without a duplicate page header", new URL(reviewer.url()).searchParams.get("activeTarget")?.startsWith("drawing:") === true && await reviewer.getByRole("status").filter({ hasText: /目前為唯讀/u }).count() >= 1 && await reviewer.locator(".dev079-workspace.is-embedded > .dev079-workspace-header").count() === 0, reviewer.url());
    check("DEV101-OWNER-v2-010R", "reviewer renders the full immutable recognition projection through the shared editor panel without a live/latest recognition request", Boolean(recognitionDrawingSnapshot)
      && await reviewer.locator('[data-dev079-recognition="immutable-review"]').count() === 1
      && await reviewer.locator('[data-dev079-recognition="immutable-review"] .dev079-recognition-candidate').count() > 0
      && await reviewer.locator('[data-dev079-recognition="immutable-review"]').getByText(recognitionDrawingSnapshot.workspace.recognition.projectionHash.slice(0, 12), { exact: false }).count() === 1
      && recognitionNetwork.length === 0, JSON.stringify({ target: recognitionDrawingSnapshot?.targetKey ?? null, recognitionNetwork }));
    const activeTargetBeforeCompare = new URL(reviewer.url()).searchParams.get("activeTarget");
    const driftTrigger = reviewer.getByRole("button", { name: "目前資料與送審快照不同；開啟差異比較", exact: true });
    await driftTrigger.waitFor({ state: "visible", timeout: 30_000 });
    await driftTrigger.click();
    const compare = reviewer.getByRole("region", { name: "送審快照與目前資料比較", exact: true });
    await compare.waitFor({ state: "visible", timeout: 30_000 });
    check(`DEV101-OWNER-${expectedSchema}-011`, "post-submit drift opens an in-page snapshot/current comparison with changed-first evidence and hash identities", await compare.locator(".review-compare-pane").count() === 2 && await compare.locator('details[data-changed="true"][open]').count() >= 1 && await compare.locator("code").count() === 2 && new URL(reviewer.url()).searchParams.get("activeTarget") === activeTargetBeforeCompare);
    const compareScreenshot = path.join(outputDir, "screenshots", `DEV101-OWNER-${expectedSchema}-compare.png`);
    fs.mkdirSync(path.dirname(compareScreenshot), { recursive: true });
    await reviewer.screenshot({ path: compareScreenshot, fullPage: true });
    await compare.getByRole("button", { name: "關閉差異比較", exact: true }).click();
    await compare.waitFor({ state: "detached", timeout: 10_000 });
    const packageAfterDrift = readRequestByWork(workId);
    check(`DEV101-OWNER-${expectedSchema}-012`, "current context drift does not rewrite the persisted review package or package hash", JSON.stringify(packageAfterDrift.snapshot) === JSON.stringify(packageBeforeDrift.snapshot) && packageAfterDrift.snapshot_hash === packageBeforeDrift.hash);
    await reviewer.setViewportSize({ width: 390, height: 844 });
    await driftTrigger.click();
    const mobileCompare = reviewer.getByRole("region", { name: "送審快照與目前資料比較", exact: true });
    await mobileCompare.waitFor({ state: "visible", timeout: 30_000 });
    const mobileGeometry = await reviewer.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const matrix = document.querySelector(".pdm-relation-matrix-wrap");
      const dock = document.querySelector(".canonical-review-decision-dock");
      const dockRect = dock?.getBoundingClientRect();
      return {
        documentOverflow: root.scrollWidth - root.clientWidth,
        bodyOverflow: body.scrollWidth - root.clientWidth,
        matrixOwnsOverflow: matrix ? matrix.scrollWidth >= matrix.clientWidth : false,
        dockVisible: Boolean(dockRect && dockRect.bottom <= window.innerHeight + 1 && dockRect.top >= 0)
      };
    });
    const snapshotSwitch = mobileCompare.getByRole("button", { name: "送審快照", exact: true });
    const currentSwitch = mobileCompare.getByRole("button", { name: "目前資料", exact: true });
    check("DEV101-UX-V2-001", "390px layout keeps page overflow contained by the matrix, decision dock visible and snapshot as the compare default", await snapshotSwitch.getAttribute("aria-pressed") === "true" && mobileGeometry.documentOverflow <= 1 && mobileGeometry.bodyOverflow <= 1 && mobileGeometry.matrixOwnsOverflow && mobileGeometry.dockVisible, JSON.stringify(mobileGeometry));
    const compareBox = await mobileCompare.boundingBox();
    assert.ok(compareBox, "mobile compare geometry missing");
    const swipeY = Math.min(compareBox.y + 180, 700);
    await reviewer.mouse.move(compareBox.x + compareBox.width - 55, swipeY);
    await reviewer.mouse.down();
    await reviewer.mouse.move(compareBox.x + 70, swipeY, { steps: 6 });
    await reviewer.mouse.up();
    check("DEV101-UX-V2-002", "mobile compare horizontal swipe outside the browser-back guard switches from snapshot to current", await currentSwitch.getAttribute("aria-pressed") === "true");
    const mobileScreenshot = path.join(outputDir, "screenshots", `DEV101-OWNER-${expectedSchema}-mobile-390.png`);
    await reviewer.screenshot({ path: mobileScreenshot, fullPage: true });
    await mobileCompare.getByRole("button", { name: "關閉差異比較", exact: true }).click();
    await mobileCompare.waitFor({ state: "detached", timeout: 10_000 });
    await reviewer.setViewportSize({ width: 1440, height: 1000 });

    for (const viewport of [
      { label: "desktop-1440", width: 1440, height: 1000, cssZoom: 1 },
      { label: "laptop-1024", width: 1024, height: 768, cssZoom: 1 },
      { label: "tablet-768", width: 768, height: 1024, cssZoom: 1 },
      { label: "mobile-390", width: 390, height: 844, cssZoom: 1 },
      { label: "desktop-200-percent", width: 1440, height: 1000, cssZoom: 2 }
    ]) {
      await reviewer.setViewportSize({ width: viewport.width, height: viewport.height });
      await reviewer.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, viewport.cssZoom);
      const geometry = await reviewer.evaluate(() => {
        const root = document.documentElement;
        const matrix = document.querySelector(".pdm-relation-matrix-wrap");
        const dock = document.querySelector(".canonical-review-decision-dock");
        const approve = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "核准");
        const rect = dock?.getBoundingClientRect();
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          rootOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
          matrixScrollable: Boolean(matrix && matrix.scrollWidth >= matrix.clientWidth),
          dockPresent: Boolean(dock),
          dockRect: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null,
          approveReachable: Boolean(approve && !approve.hasAttribute("disabled"))
        };
      });
      browserEvidence.geometry.push({ ...viewport, ...geometry });
      const viewportScreenshot = path.join(outputDir, "screenshots", `DEV101-OWNER-${expectedSchema}-${viewport.label}.png`);
      await reviewer.screenshot({ path: viewportScreenshot, fullPage: true });
      browserEvidence.screenshots.push(path.relative(root, viewportScreenshot).replaceAll("\\", "/"));
      await reviewer.evaluate(() => { document.documentElement.style.zoom = ""; });
    }
    await reviewer.setViewportSize({ width: 1440, height: 1000 });
    browserEvidence.accessibilityTree = await reviewer.locator("body").ariaSnapshot();
    browserEvidence.renderedDom = await reviewer.locator("main").evaluate((node) => ({
      text: node.textContent?.replace(/\s+/gu, " ").trim().slice(0, 12000) ?? "",
      headings: [...node.querySelectorAll("h1,h2,h3")].map((heading) => heading.textContent?.trim() ?? ""),
      regions: [...node.querySelectorAll('[role="region"]')].map((region) => region.getAttribute("aria-label") ?? region.getAttribute("aria-labelledby") ?? ""),
      schema: node.querySelector('[data-review-schema="pdm-review-package-v2"]')?.getAttribute("data-review-schema") ?? null,
      immutableRecognition: node.querySelectorAll('[data-dev079-recognition="immutable-review"]').length
    }));
    browserEvidence.visibleErrors = await reviewer.locator('[role="alert"], [data-error="true"], .error-message').evaluateAll((nodes) => nodes
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((node) => node.textContent?.replace(/\s+/gu, " ").trim() ?? "")
      .filter(Boolean));
    check("DEV101-UX-V2-004", "five viewport, CSS 200% zoom, accessibility tree and focus evidence are captured without losing the request-level decision", browserEvidence.geometry.length === 5 && browserEvidence.geometry.every((item) => item.dockPresent && item.approveReachable) && Boolean(browserEvidence.accessibilityTree) && browserEvidence.focusTrace.every((item) => item.active === true));
  } else {
    await reviewer.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    check(`DEV101-OWNER-${expectedSchema}-009`, "v1 request remains on the compatible shared readonly Part editor renderer", await reviewer.locator('[data-review-schema="pdm-review-package-v2"]').count() === 0 && await reviewer.getByRole("status").filter({ hasText: /目前為唯讀/u }).count() >= 1);
  }

  screenshotPath = path.join(outputDir, "screenshots", `DEV101-OWNER-${expectedSchema}-review-workspace.png`);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await reviewer.screenshot({ path: screenshotPath, fullPage: true });
  const returnButton = v2Enabled
    ? reviewer.locator(".canonical-review-package > .dev079-workspace-header").getByRole("button", { name: "返回審核清單", exact: true })
    : reviewer.getByRole("button", { name: "返回上一個工作清單", exact: true });
  await returnButton.click();
  await reviewer.waitForURL(/\/approvals\?/u, { timeout: 30_000 });
  await inboxRow.waitFor({ state: "visible", timeout: 30_000 });
  const returnedUrl = new URL(reviewer.url());
  check(`DEV101-OWNER-${expectedSchema}-${v2Enabled ? "013" : "010"}`, "return restores the approval list state and selected request", returnedUrl.searchParams.get("status") === "active" && returnedUrl.searchParams.get("domain") === "numbering" && returnedUrl.searchParams.get("action") === "numbering.pdm_part_change_review" && returnedUrl.searchParams.get("query") === candidate.part_number && returnedUrl.searchParams.get("requestId") === requestRow.id && await inboxRow.count() === 1, reviewer.url());

  if (v2Enabled) {
    await inboxRow.click();
    await reviewer.waitForURL(new RegExp(`/approvals/${requestRow.id}`, "u"), { timeout: 30_000 });
    await reviewer.locator('[data-review-schema="pdm-review-package-v2"]').waitFor({ state: "visible", timeout: 30_000 });
    const approveButton = reviewer.getByRole("button", { name: "核准", exact: true });
    await approveButton.waitFor({ state: "visible", timeout: 60_000 });
    const decisionRequestPromise = reviewer.waitForRequest((request) => request.method() === "POST" && request.url().endsWith(`/api/pdm/review-requests/${requestRow.id}/decisions`), { timeout: 60_000 });
    const decisionResponsePromise = reviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/pdm/review-requests/${requestRow.id}/decisions`), { timeout: 60_000 });
    await approveButton.click();
    const decisionRequest = await decisionRequestPromise;
    const decisionResponse = await decisionResponsePromise;
    const decisionBody = decisionRequest.postDataJSON();
    mutationLedger.push({ method: "POST", route: `/api/pdm/review-requests/${requestRow.id}/decisions`, actor: "R&D Manager", status: decisionResponse.status(), body: decisionBody });
    await reviewer.waitForURL(/\/approvals\?/u, { timeout: 30_000 });
    check(`DEV101-OWNER-${expectedSchema}-014`, "request-level approve sends an exact target-free body and context-only drift does not block the decision basis", decisionResponse.status() === 200 && JSON.stringify(decisionBody) === JSON.stringify({ decision: "approve" }));
    const decisionDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const effect = {
        activeRequest: Number(decisionDb.prepare("SELECT COUNT(*) AS count FROM pdm_work_review_requests WHERE id = ?").get(requestRow.id).count),
        terminalReceipt: Number(decisionDb.prepare("SELECT COUNT(*) AS count FROM pdm_work_review_terminal_receipts WHERE request_id = ?").get(requestRow.id).count),
        trace: Number(decisionDb.prepare("SELECT COUNT(*) AS count FROM pdm_review_traces WHERE review_cycle_id = ?").get(requestRow.review_cycle_id).count),
        approvedSnapshot: Number(decisionDb.prepare("SELECT COUNT(*) AS count FROM part_approved_change_snapshots WHERE part_id = ?").get(candidate.part_id).count),
        work: Number(decisionDb.prepare("SELECT COUNT(*) AS count FROM part_change_works WHERE id = ?").get(workId).count)
      };
      check(`DEV101-OWNER-${expectedSchema}-015`, "approve produces one terminal receipt, one trace and one formal snapshot with no active request or work", effect.activeRequest === 0 && effect.terminalReceipt === 1 && effect.trace === 1 && effect.approvedSnapshot === 1 && effect.work === 0, JSON.stringify(effect));
    } finally {
      decisionDb.close();
    }
    const terminalShell = await reviewerContext.request.get(`${baseUrl}/api/pdm/review-requests/${requestRow.id}`);
    const terminalTarget = await reviewerContext.request.get(`${baseUrl}/api/pdm/review-requests/${requestRow.id}/targets/part/${candidate.part_id}`);
    const terminalFileQuery = new URLSearchParams({ context: "review_package", contextId: candidate.part_id, bindingId: fixtureAttachment.bindingId, reviewRequestId: requestRow.id });
    const terminalFile = await reviewerContext.request.get(`${baseUrl}/api/pdm/file-assets/${fixtureAttachment.id}?${terminalFileQuery}`);
    const retryDecision = await reviewerContext.request.post(`${baseUrl}/api/pdm/review-requests/${requestRow.id}/decisions`, { data: { decision: "approve" } });
    check("DEV101-API-V2-005", "terminal request rejects shell, target, file and a second decision without exposing submitted facts or adding effects", terminalShell.status() === 404 && terminalTarget.status() === 404 && terminalFile.status() === 404 && retryDecision.status() === 409, JSON.stringify({ shell: terminalShell.status(), target: terminalTarget.status(), file: terminalFile.status(), retry: retryDecision.status() }));
  } else {
    await inboxRow.click();
    await reviewer.waitForURL(new RegExp(`/approvals/${requestRow.id}`, "u"), { timeout: 30_000 });
    await reviewer.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    const returnDecisionButton = reviewer.getByRole("button", { name: "退回修改", exact: true });
    await returnDecisionButton.waitFor({ state: "visible", timeout: 60_000 });
    const returnRequestPromise = reviewer.waitForRequest((request) => request.method() === "POST" && request.url().endsWith(`/api/pdm/review-requests/${requestRow.id}/decisions`), { timeout: 60_000 });
    const returnResponsePromise = reviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/pdm/review-requests/${requestRow.id}/decisions`), { timeout: 60_000 });
    await returnDecisionButton.click();
    const returnRequest = await returnRequestPromise;
    const returnResponse = await returnResponsePromise;
    const returnBody = returnRequest.postDataJSON();
    mutationLedger.push({ method: "POST", route: `/api/pdm/review-requests/${requestRow.id}/decisions`, actor: "R&D Manager", status: returnResponse.status(), body: returnBody });
    await reviewer.waitForURL(/\/approvals\?/u, { timeout: 30_000 });
    check(`DEV101-OWNER-${expectedSchema}-011`, "legacy return sends the exact request-level body and completes from the shared readonly workspace", returnResponse.status() === 200 && JSON.stringify(returnBody) === JSON.stringify({ decision: "return_for_correction" }));
    const returnDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const effect = {
        activeRequest: Number(returnDb.prepare("SELECT COUNT(*) AS count FROM pdm_work_review_requests WHERE id = ?").get(requestRow.id).count),
        terminalReceipt: Number(returnDb.prepare("SELECT COUNT(*) AS count FROM pdm_work_review_terminal_receipts WHERE request_id = ?").get(requestRow.id).count),
        trace: Number(returnDb.prepare("SELECT COUNT(*) AS count FROM pdm_review_traces WHERE review_cycle_id = ?").get(requestRow.review_cycle_id).count),
        work: Number(returnDb.prepare("SELECT COUNT(*) AS count FROM part_change_works WHERE id = ?").get(workId).count),
        handling: returnDb.prepare("SELECT handling FROM canonical_workbench_states WHERE work_id = ?").get(workId)?.handling ?? null
      };
      check(`DEV101-OWNER-${expectedSchema}-012`, "legacy return records one terminal receipt and trace while restoring the same work to its owner", effect.activeRequest === 0 && effect.terminalReceipt === 1 && effect.trace === 1 && effect.work === 1 && effect.handling === "owner", JSON.stringify(effect));
    } finally {
      returnDb.close();
    }
  }

  const finalDatabase = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    check(`DEV101-OWNER-${expectedSchema}-${v2Enabled ? "016" : "013"}`, "isolated UI mutations retain global foreign-key integrity", finalDatabase.pragma("foreign_key_check").length === 0);
  } finally {
    finalDatabase.close();
  }
  await reviewerContext.close();
} catch (error) {
  runError = error;
  console.error(error instanceof Error ? error.stack : String(error));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app) await stopNextApp(app.child).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (port) {
    const released = await isPortReleased(port);
    checks.push({ id: `DEV101-OWNER-${expectedSchema}-PORT`, description: "task-owned runtime port is released", status: released ? "PASS" : "FAIL", detail: String(port) });
    if (!released && !runError) runError = new Error(`DEV101 owner-flow runtime port ${port} was not released`);
  }
  primaryAfter = primaryState();
  const primaryUnchanged = primaryAfter.hash === primaryBefore.hash;
  checks.push({ id: `DEV101-OWNER-${expectedSchema}-PRIMARY`, description: "primary schema, identities, migration residue and foreign keys are unchanged", status: primaryUnchanged ? "PASS" : "FAIL", detail: `${primaryBefore.hash}/${primaryAfter.hash}` });
  if (!primaryUnchanged && !runError) runError = new Error("primary database invariant changed");
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 });
  const runtimeCleanup = removeTaskOwnedWorkspaceTempDir(root, runtimeProjectRoot);
  checks.push({ id: `DEV101-OWNER-${expectedSchema}-RUNTIME-PROJECT`, description: "task-owned runtime project is removed", status: runtimeCleanup.removed ? "PASS" : "FAIL", detail: runtimeCleanup });
  if (!runtimeCleanup.removed && !runError) runError = new Error(`task-owned runtime project cleanup failed: ${runtimeCleanup.error}`);
}

const report = {
  dev: "DEV-101",
  runId,
  parentRunId: process.env.DEV101_PARENT_RUN_ID?.trim() || null,
  expectedSchema,
  result: !runError && checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
  expectedMutantDetected: process.env.DEV101_MUTATE_INBOX_ADAPTER === "true" && runError instanceof Error && runError.message === "DEV101_EXPECTED_MUTANT_DETECTED",
  fixture,
  checks,
  fixtureMutationLedger: mutationLedger,
  runtime: {
    project: root,
    purpose: `DEV-101 rendered owner create/submit to reviewer inbox ${expectedSchema} flow`,
    port,
    processId: app?.child?.pid ?? null,
    dataDir,
    repositoryDir,
    runtimeProjectRoot,
    mutationScope: "task-owned SQLite/repository plus isolated runtime project only",
    cleanupCondition: "browser closed, verified child stopped, port released, task temp removed"
  },
  primaryBeforeHash: primaryBefore.hash,
  primaryAfterHash: primaryAfter.hash,
  screenshot: screenshotPath ? path.relative(root, screenshotPath).replaceAll("\\", "/") : null,
  browserEvidence,
  completedAt: new Date().toISOString()
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "receipt.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
for (const item of checks) console.log(`${item.status} ${item.id} ${item.description}`);
console.log(`DEV-101 owner ${expectedSchema} browser summary: ${checks.filter((item) => item.status === "PASS").length}/${checks.length} PASS`);
if (report.result !== "PASS") process.exitCode = 1;
