#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { chromium } from "playwright";
import Database from "better-sqlite3";

const root = process.cwd();
const ownsRuntime = !process.env.PDM_BASE_URL;
const drawingId = process.env.PDM_DEV_079_DRAWING_ID ?? "drawing-draft-drawing-5252ba10-7bf4-449c-b44d-43e7c68a1978";
const route = `/numbering/drawings/${encodeURIComponent(drawingId)}/workspace?intent=edit_revision&returnTo=%2Fnumbering%2Fdrawings%3Fview%3Dwork`;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "phone", width: 390, height: 844 }
].filter((viewport) => !process.env.PDM_DEV_079_VIEWPORT || process.env.PDM_DEV_079_VIEWPORT === viewport.name);
const runId = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const outputDir = path.resolve(root, "output", "qa", "dev-079-recognition-layout", `${runId}-browser`);
fs.mkdirSync(outputDir, { recursive: true });

let baseUrl = process.env.PDM_BASE_URL ?? "";
let isolatedTempDir = null;
let isolatedRepositoryDir = null;
let isolatedDistDir = null;
let isolatedChild = null;
let isolatedWorkerChild = null;
let isolatedWorkerToken = null;
let isolatedPreviewToken = null;
let isolatedPort = null;
const browser = await chromium.launch({ headless: true });
const results = [];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function waitForIsolatedServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("DEV-079 isolated browser server did not start");
}

function prepareA0002IsolatedDatabase(databasePath) {
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  const timestamp = new Date().toISOString();
  database.prepare("UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1 WHERE email = 'admin@example.com'").run();
  database.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = 'admin@example.com'").run();
  database.prepare("UPDATE number_candidate_reservations SET candidate_code = 'A0002-M01-FORMAL' WHERE id = 'f38497c0-c149-4888-9758-13a8c5c9b56c'").run();
  database.prepare(`UPDATE numbering_draft_workspaces
    SET lifecycle_status = 'active', owner_id = 'user-manager-demo', cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL, updated_at = :timestamp
    WHERE id = 'draft-workspace-2b88591e-128c-4bb8-a0e9-97864733700f'`).run({ timestamp });
  // The source snapshot deliberately keeps this drawing terminal. In the isolated
  // fixture we reopen only the copied row, then restore the schema trigger.
  database.exec("DROP TRIGGER IF EXISTS trg_drawings_terminal_state_guard");
  database.exec("DROP TRIGGER IF EXISTS trg_drawings_number_immutable_guard");
  database.prepare(`UPDATE drawings SET drawing_number = 'QC-A0002-M01-FORMAL'
    WHERE id = 'drawing-draft-drawing-cc7187b8-1ec4-4936-91da-4771f1b8a877'`).run();
  database.prepare(`UPDATE drawings
    SET lifecycle_state = 'drawing_preparation', owner_id = 'user-manager-demo', terminal_at = NULL, updated_at = :timestamp
    WHERE id = 'drawing-draft-drawing-5252ba10-7bf4-449c-b44d-43e7c68a1978'`).run({ timestamp });
  database.exec(`CREATE TRIGGER trg_drawings_terminal_state_guard
    BEFORE UPDATE OF lifecycle_state ON drawings
    WHEN OLD.lifecycle_state IN ('obsolete', 'merged', 'cancelled') AND NEW.lifecycle_state <> OLD.lifecycle_state
    BEGIN SELECT RAISE(ABORT, 'DRAWING_TERMINAL_STATE_IMMUTABLE'); END`);
  database.exec(`CREATE TRIGGER trg_drawings_number_immutable_guard
    BEFORE UPDATE OF drawing_number ON drawings
    WHEN OLD.drawing_number IS NOT NULL AND NEW.drawing_number IS NOT OLD.drawing_number
    BEGIN SELECT RAISE(ABORT, 'DRAWING_NUMBER_IMMUTABLE'); END`);
  database.prepare(`UPDATE number_candidate_reservations
    SET reservation_state = 'active', recycled_at = NULL, recycled_by = NULL, recycle_reason = NULL, updated_at = :timestamp
    WHERE id = '2cd09292-a291-4b7d-a222-9a22f6873c17'`).run({ timestamp });
  database.prepare(`UPDATE numbering_candidate_revision_drafts
    SET workspace_id = 'draft-workspace-2b88591e-128c-4bb8-a0e9-97864733700f',
        drawing_draft_id = 'draft-drawing-5252ba10-7bf4-449c-b44d-43e7c68a1978',
        candidate_reservation_id = '2cd09292-a291-4b7d-a222-9a22f6873c17',
        lifecycle_status = 'draft', approval_request_id = NULL,
        formal_drawing_number_id = NULL, formal_revision_package_id = NULL,
        promoted_at = NULL, cancelled_at = NULL, cancelled_by = NULL, updated_at = :timestamp
    WHERE id = 'NCR-55c7b355-cfe6-41f1-b714-7fa911b1fed7'`).run({ timestamp });
  const candidate = database.prepare(`SELECT id, workspace_id, drawing_draft_id, lifecycle_status
    FROM numbering_candidate_revision_drafts WHERE id = 'NCR-55c7b355-cfe6-41f1-b714-7fa911b1fed7'`).get();
  const activeFiles = candidate
    ? database.prepare(`SELECT COUNT(*) AS count FROM numbering_candidate_revision_files
      WHERE candidate_revision_id = :candidateId AND removed_at IS NULL`).get({ candidateId: candidate.id })
    : { count: 0 };
  if (!candidate || candidate.workspace_id !== 'draft-workspace-2b88591e-128c-4bb8-a0e9-97864733700f' || Number(activeFiles.count) < 3) {
    database.close();
    throw new Error("DEV-079 A0002 isolated candidate fixture was not prepared");
  }
  database.close();
}

function markA0002RecognitionReady(databasePath) {
  const database = new Database(databasePath);
  const timestamp = new Date().toISOString();
  const sourceSessionId = "recognition-8c16aaf4-8b8c-4369-b7a0-c1e9a5559ac6";
  const seedSessionId = "recognition-870fe33f-6dc3-4e72-a903-3446eac49102";
  const targetSessionId = "qc-recognition-a0002-dev079";
  const seed = database.prepare("SELECT * FROM drawing_recognition_sessions WHERE id = :id").get({ id: seedSessionId });
  if (!seed) throw new Error("DEV-079 isolated seed recognition session is missing");
  database.prepare("UPDATE drawing_recognition_sessions SET deduplication_key = :deduplicationKey WHERE id = :id").run({ id: seedSessionId, deduplicationKey: `qc-obsolete-${crypto.randomUUID()}` });
  database.prepare("DELETE FROM drawing_recognition_sessions WHERE id = :id").run({ id: targetSessionId });
  const insertRow = (table, row) => {
    const columns = Object.keys(row);
    database.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => `:${column}`).join(", ")})`).run(row);
  };
  const sourceRows = database.prepare("SELECT * FROM drawing_recognition_sources WHERE session_id = :sessionId ORDER BY sort_order, id").all({ sessionId: sourceSessionId });
  const seedRows = database.prepare("SELECT * FROM drawing_recognition_sources WHERE session_id = :sessionId ORDER BY sort_order, id").all({ sessionId: seedSessionId });
  const sourceIdByAsset = new Map(sourceRows.map((row) => [row.file_asset_id, row.id]));
  const targetSourceMap = new Map(seedRows.map((row) => [row.file_asset_id, `qc-source-${crypto.randomUUID()}`]));
  const sourceToTargetSource = new Map([...sourceIdByAsset.entries()].map(([assetId, sourceId]) => [sourceId, targetSourceMap.get(assetId)]));
  const originalDeduplicationKey = seed.deduplication_key;
  insertRow("drawing_recognition_sessions", { ...seed, id: targetSessionId, status: "review_ready", source_context_type: "candidate_revision", source_context_id: "NCR-55c7b355-cfe6-41f1-b714-7fa911b1fed7", source_lineage_key: "candidate_revision:NCR-55c7b355-cfe6-41f1-b714-7fa911b1fed7", deduplication_key: originalDeduplicationKey, supersedes_session_id: seedSessionId, created_at: timestamp, updated_at: timestamp, locked_by: null, locked_at: null, heartbeat_at: null, cancelled_at: null, error_code: null, error_summary: null });
  for (const row of seedRows) insertRow("drawing_recognition_sources", {
    ...row,
    id: targetSourceMap.get(row.file_asset_id),
    session_id: targetSessionId,
    adapter_plan_json: /\.pdf$/iu.test(row.file_name) ? '["filename.v1","browser-pdf-ocr.v1"]' : row.adapter_plan_json,
    created_at: timestamp
  });
  const sourceToTargetAdapter = new Map();
  for (const row of database.prepare("SELECT * FROM drawing_recognition_adapter_results WHERE session_id = :sessionId ORDER BY id").all({ sessionId: sourceSessionId })) {
    const id = `qc-adapter-${crypto.randomUUID()}`;
    sourceToTargetAdapter.set(row.id, id);
    insertRow("drawing_recognition_adapter_results", { ...row, id, session_id: targetSessionId, source_id: sourceToTargetSource.get(row.source_id) ?? row.source_id });
  }
  const candidateMap = new Map();
  for (const row of database.prepare("SELECT * FROM drawing_recognition_candidates WHERE session_id = :sessionId ORDER BY sort_order, id").all({ sessionId: sourceSessionId })) {
    const id = `qc-candidate-${crypto.randomUUID()}`;
    candidateMap.set(row.id, id);
    insertRow("drawing_recognition_candidates", { ...row, id, session_id: targetSessionId });
  }
  const observationMap = new Map();
  for (const row of database.prepare("SELECT * FROM drawing_recognition_observations WHERE session_id = :sessionId ORDER BY captured_at, id").all({ sessionId: sourceSessionId })) {
    const id = `qc-observation-${crypto.randomUUID()}`;
    observationMap.set(row.id, id);
    insertRow("drawing_recognition_observations", { ...row, id, session_id: targetSessionId, source_id: sourceToTargetSource.get(row.source_id) ?? row.source_id, adapter_result_id: sourceToTargetAdapter.get(row.adapter_result_id) ?? row.adapter_result_id });
  }
  for (const row of database.prepare("SELECT * FROM drawing_recognition_candidate_observations WHERE candidate_id IN (SELECT id FROM drawing_recognition_candidates WHERE session_id = :sessionId)").all({ sessionId: sourceSessionId })) {
    insertRow("drawing_recognition_candidate_observations", { ...row, candidate_id: candidateMap.get(row.candidate_id), observation_id: observationMap.get(row.observation_id) });
  }
  database.close();
}

async function startIsolatedRuntime() {
  if (!ownsRuntime) return;
  isolatedTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev079-browser-"));
  isolatedRepositoryDir = path.join(isolatedTempDir, "repository");
  isolatedDistDir = `.tmp/next-qc-dev079-${crypto.randomUUID()}`;
  const targetDb = path.join(isolatedTempDir, "ai-pdm.sqlite");
  fs.copyFileSync(path.join(root, "data", "ai-pdm.sqlite"), targetDb);
  fs.cpSync(path.join(root, "data", "repository"), isolatedRepositoryDir, { recursive: true });
  prepareA0002IsolatedDatabase(targetDb);
  isolatedPort = await getFreePort();
  baseUrl = `http://127.0.0.1:${isolatedPort}`;
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  isolatedWorkerToken = `dev079-worker-${crypto.randomUUID()}`;
  isolatedPreviewToken = `dev079-preview-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  isolatedChild = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(isolatedPort)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "demo",
      PDM_AUTH_SECRET: "dev079-browser-auth-secret",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: isolatedTempDir,
      PDM_REPOSITORY_DIR: isolatedRepositoryDir,
      PDM_RELEASE_MODE: "local_stub",
      PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
      PDM_NUMBER_STATE_FLOW_V1: "true",
      PDM_NUMBER_LIFECYCLE_V2: "true",
      PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
      PDM_DRAWING_RECOGNITION_V1: "true",
      PDM_DRAWING_RECOGNITION_WORKER_TOKEN: isolatedWorkerToken,
      PDM_PREVIEW_WORKER_TOKEN: isolatedPreviewToken,
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: isolatedDistDir
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  console.log(JSON.stringify({ runtime: { project: "AI_PDM", purpose: "DEV-079 A0002 isolated recognition-layout browser QC", port: isolatedPort, pid: isolatedChild.pid, cleanup: "stop exact process tree and verify port release" } }));
  await waitForIsolatedServer();
  isolatedWorkerChild = spawn(process.execPath, ["--experimental-transform-types", "scripts/run-drawing-recognition-worker.mjs", "--once"], {
    cwd: root,
    env: {
      ...process.env,
      PDM_DRAWING_RECOGNITION_WORKER_BASE_URL: baseUrl,
      PDM_DRAWING_RECOGNITION_WORKER_TOKEN: isolatedWorkerToken,
      PDM_PREVIEW_WORKER_TOKEN: isolatedPreviewToken,
      PDM_DRAWING_RECOGNITION_WORKER_ID: `dev079-browser-${crypto.randomUUID()}`,
      PDM_DRAWING_RECOGNITION_POLL_MS: "250"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let workerError = "";
  isolatedWorkerChild.stderr?.on("data", (chunk) => { workerError = `${workerError}${String(chunk)}`.slice(-4_000); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("DEV-079 isolated recognition worker timed out")), 90_000);
    isolatedWorkerChild.once("exit", (code) => { clearTimeout(timeout); if (code === 0) resolve(); else reject(new Error(`DEV-079 isolated recognition worker exited ${code}: ${workerError}`)); });
  });
  markA0002RecognitionReady(targetDb);
}

async function stopIsolatedRuntime() {
  if (isolatedWorkerChild && isolatedWorkerChild.exitCode === null) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(isolatedWorkerChild.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
    else isolatedWorkerChild.kill("SIGTERM");
  }
  if (isolatedChild && isolatedChild.exitCode === null) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(isolatedChild.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
      const deadline = Date.now() + 5_000;
      while (isolatedChild.exitCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    } else {
      isolatedChild.kill("SIGTERM");
    }
  }
  if (isolatedPort) {
    const released = await new Promise((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.listen(isolatedPort, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (!released) throw new Error(`temporary DEV-079 port ${isolatedPort} was not released`);
  }
  for (const target of [isolatedDistDir ? path.join(root, ...isolatedDistDir.split("/")) : null, isolatedTempDir]) {
    if (!target) continue;
    const resolved = path.resolve(target);
    const allowed = resolved.startsWith(path.resolve(os.tmpdir())) || resolved.startsWith(`${path.resolve(root, ".tmp")}${path.sep}`);
    if (allowed && fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
  }
}

async function prepareA0002Successor() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const login = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "R&D Manager" } });
    if (!login.ok()) throw new Error(`A0002 setup login HTTP ${login.status()}`);
    const latestResponse = await context.request.get(`${baseUrl}/api/numbering/drawings/A0002-M01/recognition-session`, { failOnStatusCode: false });
    if (!latestResponse.ok()) throw new Error(`A0002 latest recognition HTTP ${latestResponse.status()}`);
    const latestBody = await latestResponse.json();
    let sessionId = latestBody.session?.id ?? "qc-recognition-a0002-dev079";
    let projectionResponse = await context.request.get(`${baseUrl}/api/numbering/recognition-sessions/${encodeURIComponent(sessionId)}`, { failOnStatusCode: false });
    let projectionBody = await projectionResponse.json();
    const hasLocatablePdf = (projectionBody.session?.reviewGroups ?? []).some((group) => (group.fieldKey === "revision" || group.fieldLabel === "版次")
      && (group.observations ?? []).some((observation) => /.pdf$/iu.test(observation.sourceFileName ?? "") && observation.geometry?.coordinateSpace === "normalized_page" && observation.geometry?.origin === "top_left"));
    if (!hasLocatablePdf) {
      const rerunResponse = await context.request.post(`${baseUrl}/api/numbering/recognition-sessions/${encodeURIComponent(sessionId)}/reruns`, {
        headers: { "idempotency-key": `dev079:a0002-successor:${Date.now()}` },
        failOnStatusCode: false
      });
      if (!rerunResponse.ok()) throw new Error(`A0002 successor rerun HTTP ${rerunResponse.status()}: ${await rerunResponse.text()}`);
      const rerunBody = await rerunResponse.json();
      sessionId = rerunBody.session?.id;
      if (!sessionId) throw new Error("A0002 successor rerun did not return a session");
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        projectionResponse = await context.request.get(`${baseUrl}/api/numbering/recognition-sessions/${encodeURIComponent(sessionId)}`, { failOnStatusCode: false });
        projectionBody = await projectionResponse.json();
        if (!projectionBody.session || !["queued", "extracting"].includes(projectionBody.session.status)) break;
      }
    }
    return { sessionId, status: projectionBody.session?.status ?? "unknown" };
  } finally {
    await context.close();
  }
}

await startIsolatedRuntime();
try {
  const successor = await prepareA0002Successor();
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const login = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "R&D Manager" } });
    if (!login.ok()) throw new Error(`${viewport.name}: local admin login HTTP ${login.status()}`);
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    const expectedPreviewCancellations = [];
    const expectedNavigationCancellations = [];
    const recognitionResponses = [];
    const workbenchResponses = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "failed";
      if (request.url().startsWith("blob:") && failure === "net::ERR_ABORTED") expectedPreviewCancellations.push(`${request.url()} ${failure}`);
      else if (request.url().includes("_rsc=") && failure === "net::ERR_ABORTED") expectedNavigationCancellations.push(`${request.url()} ${failure}`);
      else failedRequests.push(`${request.url()} ${failure}`);
    });
    page.on("response", async (response) => {
      const isRecognition = response.url().includes("recognition");
      const isWorkbench = response.url().includes("/api/numbering/drawings/workbench/");
      if (!isRecognition && !isWorkbench) return;
      const body = await response.text().catch(() => "");
      let summary = null;
      try {
        const parsed = JSON.parse(body);
        const session = parsed.session;
        summary = session ? { id: session.id, status: session.status, sourceContextType: session.sourceContextType, sourceContextId: session.sourceContextId, sourceAssetIds: session.sourceAssetIds, candidates: session.candidates?.length ?? null, candidateFields: session.candidates?.map((item) => `${item.category}:${item.fieldKey}`), reviewGroups: session.reviewGroups?.length ?? null, reviewGroupFields: session.reviewGroups?.map((item) => `${item.category}:${item.fieldKey}:${item.primaryCandidateId}`), pdfOcrSources: session.pdfOcrSources?.length ?? null, pendingClientAdapters: session.pendingClientAdapters?.length ?? null } : parsed;
      } catch { summary = body.slice(0, 800); }
      if (isRecognition) recognitionResponses.push({ url: response.url(), status: response.status(), summary });
      if (response.url().includes("/api/numbering/drawings/workbench/")) {
        try {
          const parsed = JSON.parse(body);
          workbenchResponses.push({ status: response.status(), candidate: parsed.candidate ? { id: parsed.candidate.id, lifecycleStatus: parsed.candidate.lifecycleStatus, ownerId: parsed.candidate.ownerId, capabilities: parsed.candidate.capabilities, lifecycleV2: parsed.candidate.lifecycleV2 } : null, capabilities: parsed.capabilities, error: parsed.error });
        } catch { workbenchResponses.push({ status: response.status(), body: body.slice(0, 800) }); }
      }
    });
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    await page.waitForSelector('.dev079-workspace, .dev079-workspace-state', { timeout: 30_000 });
    const recognitionTab = page.getByRole("tab", { name: /智慧辨識/u });
    if (await recognitionTab.count() !== 1) throw new Error(`${viewport.name}: 智慧辨識 tab missing; body=${(await page.locator("body").innerText()).slice(0, 2_000)}`);
    await recognitionTab.click();
    try {
      await page.waitForSelector('.dev079-recognition-candidate input[aria-label*="版次"]', { timeout: 30_000 });
    } catch (error) {
      throw new Error(`${viewport.name}: 版次 candidate input missing; body=${(await page.locator("body").innerText()).slice(0, 4_000)}; recognition=${JSON.stringify(recognitionResponses)}; cause=${error instanceof Error ? error.message : String(error)}`);
    }
    const firstCandidateInput = page.locator('.dev079-recognition-candidate input[aria-label*="版次"]').first();
    await firstCandidateInput.focus();
    await page.waitForTimeout(180);
    const originalValue = await firstCandidateInput.inputValue();
    if (await firstCandidateInput.isEditable() === false) throw new Error(`${viewport.name}: candidate input is readonly; workbench=${JSON.stringify(workbenchResponses)}; body=${(await page.locator("body").innerText()).slice(0, 2_000)}`);
    await firstCandidateInput.fill(`${originalValue} ${viewport.name}`.trim());
    await page.waitForTimeout(120);
    await page.waitForFunction(() => [...document.querySelectorAll('.dev079-recognition-evidence-source')].some((button) => button.textContent?.trim() === 'PDF圖面'), null, { timeout: 30_000 });
    const pdfEvidenceButton = page.getByRole("button", { name: "PDF圖面", exact: true }).first();
    const cadEvidenceButton = page.getByRole("button", { name: "檔案屬性", exact: true }).first();
    if (await pdfEvidenceButton.count() < 1 || await cadEvidenceButton.count() < 1) throw new Error(`${viewport.name}: explicit PDF/CAD evidence controls missing`);
    const originalPreview = await page.evaluate(() => ({
      activeTabText: document.querySelector('.drawing-preview-tabs [role="tab"][aria-selected="true"]')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      mediaKind: document.querySelector('[data-preview-media]')?.getAttribute('data-preview-media') ?? '',
      mediaSrc: document.querySelector('[data-preview-media]')?.getAttribute('src') ?? document.querySelector('[data-preview-media]')?.getAttribute('href') ?? ''
    }));
    await pdfEvidenceButton.click();
    try {
      await page.waitForSelector('[data-pdf-page-state="ready"] .dev079-evidence-highlighter', { timeout: 30_000 });
      await page.waitForSelector('[data-magnifier-state="ready"]', { timeout: 30_000 });
    } catch (error) {
      const states = await page.locator('[data-pdf-page-state], [data-magnifier-state]').evaluateAll((nodes) => nodes.map((node) => ({ page: node.getAttribute('data-pdf-page-state'), magnifier: node.getAttribute('data-magnifier-state'), text: node.textContent })));
      throw new Error(`${viewport.name}: PDF evidence did not reach ready; body=${(await page.locator("body").innerText()).slice(0, 4_000)}; states=${JSON.stringify(states)}; failed=${JSON.stringify(failedRequests)}; console=${JSON.stringify(consoleErrors)}; cause=${error instanceof Error ? error.message : String(error)}`);
    }
    const pdfEvidence = await page.evaluate(() => {
      const highlightElement = document.querySelector('.dev079-evidence-highlighter');
      const highlight = highlightElement?.getBoundingClientRect();
      const magnifier = document.querySelector('.dev079-evidence-magnifier')?.getBoundingClientRect();
      const magnifierCanvas = document.querySelector('.dev079-evidence-magnifier canvas');
      const paper = document.querySelector('.drawing-preview-pdf-page')?.getBoundingClientRect();
      const frame = document.querySelector('.drawing-preview-frame')?.getBoundingClientRect();
      const normalizedHighlight = highlight && paper && paper.width > 0 && paper.height > 0 ? {
        x: (highlight.left - paper.left) / paper.width,
        y: (highlight.top - paper.top) / paper.height,
        width: highlight.width / paper.width,
        height: highlight.height / paper.height
      } : null;
      const intersects = Boolean(highlight && magnifier
        && highlight.left < magnifier.right
        && highlight.right > magnifier.left
        && highlight.top < magnifier.bottom
        && highlight.bottom > magnifier.top);
      let magnifierNonWhitePixels = 0;
      if (magnifierCanvas instanceof HTMLCanvasElement) {
        const context = magnifierCanvas.getContext('2d');
        const pixels = context?.getImageData(0, 0, magnifierCanvas.width, magnifierCanvas.height).data;
        if (pixels) {
          for (let index = 0; index < pixels.length; index += 16) {
            if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) magnifierNonWhitePixels += 1;
          }
        }
      }
      const highlightStyle = highlightElement ? window.getComputedStyle(highlightElement) : null;
      const magnifierElement = document.querySelector('.dev079-evidence-magnifier');
      const magnifierViewport = document.querySelector('.dev079-evidence-magnifier-viewport');
      const magnifierStyle = magnifierViewport ? window.getComputedStyle(magnifierViewport) : null;
      const materialCard = document.querySelector('.dev079-recognition-candidate[data-recognition-field-key="material"]');
      const materialInputValue = materialCard?.querySelector('input')?.value ?? '';
      return {
        highlightPresent: Boolean(highlight),
        highlightMarkerKind: highlightElement?.getAttribute('data-evidence-marker') ?? '',
        highlightBackgroundImage: highlightStyle?.backgroundImage ?? '',
        highlightBorderWidth: highlightStyle?.borderTopWidth ?? '',
        highlightOutlineWidth: highlightStyle?.outlineWidth ?? '',
        magnifierPresent: Boolean(magnifier),
        magnifierState: document.querySelector('.dev079-evidence-magnifier')?.getAttribute('data-magnifier-state') ?? '',
        magnifierResolutionMode: magnifierElement?.getAttribute('data-resolution-mode') ?? '',
        magnifierCoverageRatio: Number(magnifierElement?.getAttribute('data-coverage-ratio') ?? 0),
        magnifierEffectiveZoom: Number(magnifierElement?.getAttribute('data-effective-zoom') ?? 0),
        magnifierBackingScale: Number(magnifierElement?.getAttribute('data-backing-scale') ?? 0),
        magnifierTargetRect: magnifierElement?.getAttribute('data-target-rect') ?? '',
        magnifierCropRect: magnifierElement?.getAttribute('data-crop-rect') ?? '',
        magnifierCacheState: magnifierElement?.getAttribute('data-cache-state') ?? '',
        magnifierLruSize: Number(magnifierElement?.getAttribute('data-lru-size') ?? 0),
        magnifierRenderElapsedMs: Number(magnifierElement?.getAttribute('data-render-elapsed-ms') ?? 0),
        magnifierRingBorder: magnifierStyle?.borderTop ?? '',
        magnifierPseudoHandleDisplay: window.getComputedStyle(magnifierElement, '::after').display,
        magnifierCanvasWidth: magnifierCanvas instanceof HTMLCanvasElement ? magnifierCanvas.width : 0,
        magnifierCanvasHeight: magnifierCanvas instanceof HTMLCanvasElement ? magnifierCanvas.height : 0,
        magnifierNonWhitePixels,
        caption: document.querySelector('.dev079-evidence-caption')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        renderedMode: document.querySelector('[data-preview-rendered-mode]')?.getAttribute('data-preview-rendered-mode') ?? '',
        pdfPageState: document.querySelector('[data-pdf-page-state]')?.getAttribute('data-pdf-page-state') ?? '',
        pdfPageRendererCount: document.querySelectorAll('[data-preview-rendered-mode="pdf-page"]').length,
        documentViewerCount: document.querySelectorAll('[data-preview-media="document"]').length,
        previewLinkTarget: document.querySelector('a.drawing-preview-media-link[data-preview-rendered-mode="pdf-page"]')?.getAttribute('target') ?? '',
        previewSurfaceCount: document.querySelectorAll('[data-component="drawing-detail-preview"]').length,
        previewTabCount: document.querySelectorAll('.drawing-preview-tabs [role="tab"], .dev079-workspace-preview-tabs [role="tab"]').length,
        pdfTabCount: [...document.querySelectorAll('.drawing-preview-tabs [role="tab"], .dev079-workspace-preview-tabs [role="tab"]')].filter((tab) => /pdf/iu.test(tab.textContent ?? '')).length,
        secondPreviewViewerCount: document.querySelectorAll('[data-preview-media="document"], [data-preview-rendered-mode="pdf-page"]').length,
        highlightWithinRenderedPage: Boolean(highlight && paper && highlight.left >= paper.left - 1 && highlight.top >= paper.top - 1 && highlight.right <= paper.right + 1 && highlight.bottom <= paper.bottom + 1),
        magnifierWithinRenderedPage: Boolean(magnifier && paper && magnifier.left >= paper.left - 1 && magnifier.top >= paper.top - 1 && magnifier.right <= paper.right + 1 && magnifier.bottom <= paper.bottom + 1),
        magnifierOverlapsHighlight: intersects,
        renderedPageWithinFrame: Boolean(paper && frame && paper.left >= frame.left && paper.top >= frame.top && paper.right <= frame.right && paper.bottom <= frame.bottom),
        normalizedHighlight,
        materialEvidenceText: `${materialCard?.textContent?.replace(/\s+/gu, ' ').trim() ?? ''} ${materialInputValue}`.trim()
      };
    });
    const pdfPreviewLink = page.locator('a.drawing-preview-media-link[data-preview-rendered-mode="pdf-page"]');
    const openedPreviewPagePromise = context.waitForEvent("page", { timeout: 5_000 }).catch(() => null);
    await pdfPreviewLink.click();
    const openedPreviewPage = await openedPreviewPagePromise;
    if (openedPreviewPage) {
      await openedPreviewPage.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
      await openedPreviewPage.close();
    }
    pdfEvidence.clickedPreviewOpenedNewTab = Boolean(openedPreviewPage);
    const evidenceScreenshot = path.join(outputDir, `${viewport.name}-pdf-evidence.png`);
    await page.screenshot({ path: evidenceScreenshot, fullPage: true });
    await cadEvidenceButton.click();
    await page.waitForFunction(() => Boolean(document.querySelector('.dev079-evidence-flash')?.textContent?.includes('A0002.SLDPRT')), null, { timeout: 5_000 });
    const cadEvidence = await page.evaluate(() => ({
      flash: document.querySelector('.dev079-evidence-flash')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      highlightPresent: Boolean(document.querySelector('.dev079-evidence-highlighter')),
      magnifierPresent: Boolean(document.querySelector('.dev079-evidence-magnifier')),
      documentViewerCount: document.querySelectorAll('[data-preview-media="document"]').length
    }));
    await pdfEvidenceButton.click();
    await page.waitForSelector('[data-pdf-page-state="ready"] .dev079-evidence-highlighter', { timeout: 30_000 });
    await page.waitForSelector('[data-magnifier-state="ready"]', { timeout: 30_000 });
    const focusedEvidence = await page.evaluate(() => ({
      highlightPresent: Boolean(document.querySelector('.dev079-evidence-highlighter')),
      magnifierPresent: Boolean(document.querySelector('.dev079-evidence-magnifier')),
      caption: document.querySelector('.dev079-evidence-caption')?.textContent?.replace(/\s+/gu, ' ').trim() ?? ''
    }));
    const returnToOriginalButtonPresent = await page.getByRole("button", { name: "返回原圖面" }).count() > 0;
    await page.getByRole("tab", { name: /3D 模型/u }).click();
    await page.getByRole("tab", { name: /2D 圖面/u }).click();
    await page.waitForTimeout(100);
    const restoredEvidence = await page.evaluate(() => ({
      highlightPresent: Boolean(document.querySelector('.dev079-evidence-highlighter')),
      magnifierPresent: Boolean(document.querySelector('.dev079-evidence-magnifier')),
      flashPresent: Boolean(document.querySelector('.dev079-evidence-flash')),
      activeTabText: document.querySelector('.drawing-preview-tabs [role="tab"][aria-selected="true"]')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      mediaKind: document.querySelector('[data-preview-media]')?.getAttribute('data-preview-media') ?? '',
      mediaSrc: document.querySelector('[data-preview-media]')?.getAttribute('src') ?? document.querySelector('[data-preview-media]')?.getAttribute('href') ?? ''
    }));
    const evidencePreview = {
      successorSessionId: successor.sessionId,
      successorStatus: successor.status,
      pdfEvidence,
      cadEvidence,
      focusedEvidence,
      returnToOriginalButtonPresent,
      restoredEvidence,
      originalPreview
    };
    const evidenceSurface = pdfEvidence;
    const guardInput = page.locator('.dev079-recognition-candidate input[aria-label*="版次"]').first();
    const guardValue = await guardInput.inputValue();
    await guardInput.fill(`${guardValue} guard`.trim());
    await page.waitForSelector('.dev079-recognition-candidate.is-modified input[aria-label*="版次"]', { timeout: 5_000 });
    let unsavedGuardMessage = "";
    page.once("dialog", async (dialog) => {
      unsavedGuardMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.getByRole("tab", { name: /版次與檔案/u }).click();
    await page.waitForTimeout(80);
    const verification = await page.evaluate(() => {
      const tab = document.querySelector('.dev079-task-tabs [role="tab"][aria-selected="true"]');
      const footer = document.querySelector('.dev079-workspace-footer')?.getBoundingClientRect();
      const heading = document.querySelector('.dev079-section-heading')?.getBoundingClientRect();
      const preSubmit = document.querySelector('.drawing-revision-recognition-pre-submit')?.getBoundingClientRect();
      const candidateCards = [...document.querySelectorAll('.dev079-recognition-candidate')];
      const canonicalFieldKeys = candidateCards.map((card) => card.getAttribute('data-recognition-field-key')).filter(Boolean);
      const duplicateCanonicalFieldKeys = [...new Set(canonicalFieldKeys.filter((fieldKey, index) => canonicalFieldKeys.indexOf(fieldKey) !== index))];
      const candidateHelperLabelsPresent = Boolean(document.querySelector('.dev079-recognition-candidate label > span'));
      const candidateCurrentMetaPresent = Boolean(document.querySelector('.dev079-recognition-current span, .dev079-recognition-current small'));
      const candidateCurrentRowCount = document.querySelectorAll('.dev079-recognition-current').length;
      const candidateInputCount = document.querySelectorAll('.dev079-recognition-candidate input').length;
      const candidateInputWithoutAccessibleName = [...document.querySelectorAll('.dev079-recognition-candidate input')].filter((input) => !input.getAttribute('aria-label')).length;
      const candidateActionButtonCount = document.querySelectorAll('.dev079-recognition-candidate-actions button').length;
      const standaloneLocateButtonPresent = [...document.querySelectorAll('.dev079-recognition-candidate-actions button')].some((button) => button.textContent?.includes('在圖面定位'));
      const evidenceFlashText = document.querySelector('.dev079-evidence-flash')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
      const evidenceHighlighterPresent = Boolean(document.querySelector('.dev079-evidence-highlighter'));
      const evidenceMagnifierPresent = Boolean(document.querySelector('.dev079-evidence-magnifier'));
      const pdfOcrStatusPanelPresent = Boolean(document.querySelector('.drawing-pdf-ocr'));
      const recognitionScopeHelpPresent = Boolean(document.querySelector('.dev079-section-heading .status-scope-help-button'));
      const recognitionEyebrowPresent = Boolean(document.querySelector('.dev079-section-heading .eyebrow'));
      const recognitionFootnotePresent = Boolean(document.querySelector('.dev079-recognition-footnote'));
      const manualStartRecognitionPresent = [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('開始辨識'));
      const modifiedInputCount = document.querySelectorAll('.dev079-recognition-candidate.is-modified input').length;
      const modifiedIndicatorText = document.querySelector('.dev079-recognition-field-signals .is-modified')?.textContent?.trim() ?? '';
      const globalSaveButtons = [...document.querySelectorAll('.dev079-recognition-save-all')];
      const materialCards = [...document.querySelectorAll('.dev079-recognition-candidate[data-recognition-field-key="material"]')];
      const materialCard = materialCards[0];
      const materialEvidenceLabels = materialCard ? [...materialCard.querySelectorAll('.dev079-recognition-evidence-source')].map((item) => item.textContent?.replace(/\s+/gu, ' ').trim() ?? '') : [];
      const bodyText = document.body.innerText;
      return {
        tabText: tab?.textContent?.replace(/\s+/gu, " ").trim() ?? "",
        tabCountBadgePresent: Boolean(tab?.querySelector("span")),
        readonlyTagPresent: Boolean(document.querySelector('.dev079-readonly-tag')),
        compactIntroPresent: Boolean(document.querySelector('.drawing-revision-recognition-pre-submit.is-compact .drawing-revision-recognition-title, .drawing-revision-recognition-pre-submit.is-compact .drawing-revision-recognition-copy p, .drawing-revision-recognition-pre-submit.is-compact .drawing-revision-recognition-copy small')),
        compactStatusChipPresent: Boolean(document.querySelector('.drawing-revision-recognition-pre-submit.is-compact .drawing-recognition-chip')),
        summaryPresent: Boolean(document.querySelector('.dev079-recognition-summary')),
        categoryHeadingsPresent: Boolean(document.querySelector('.dev079-recognition-section h3')),
        sourceRoleCards: candidateCards.filter((card) => card.textContent?.includes("來源檔案角色")).length,
        candidateCount: candidateCards.length,
        duplicateCanonicalFieldKeys,
        candidateHelperLabelsPresent,
        candidateCurrentMetaPresent,
        candidateCurrentRowCount,
        candidateInputCount,
        candidateInputWithoutAccessibleName,
        candidateActionButtonCount,
        standaloneLocateButtonPresent,
        evidenceFlashText,
        evidenceHighlighterPresent,
        evidenceMagnifierPresent,
        pdfOcrStatusPanelPresent,
        recognitionScopeHelpPresent,
        recognitionEyebrowPresent,
        recognitionFootnotePresent,
        manualStartRecognitionPresent,
        modifiedInputCount,
        modifiedIndicatorText,
        globalSaveButtonCount: globalSaveButtons.length,
        globalSaveButtonText: globalSaveButtons[0]?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        globalSaveButtonEnabled: globalSaveButtons[0] instanceof HTMLButtonElement && !globalSaveButtons[0].disabled,
        materialCardCount: materialCards.length,
        materialReviewGroupCount: Number(materialCard?.getAttribute('data-review-group-count') ?? 0),
        materialMergedCandidateCount: Number(materialCard?.querySelector('input')?.getAttribute('data-merged-candidate-count') ?? 0),
        materialScopeText: materialCard?.querySelector('.dev079-recognition-scope-summary')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        materialEvidenceLabels,
        activeTabStillRecognition: document.querySelector('.dev079-task-tabs [role="tab"][aria-selected="true"]')?.textContent?.includes('智慧辨識') ?? false,
        pendingReviewTextPresent: bodyText.includes("待處理") || bodyText.includes("待核對"),
        headingBottom: heading?.bottom ?? null,
        preSubmitTop: preSubmit?.top ?? null,
        footerTop: footer?.top ?? null,
        footerOverlapsRecognition: Boolean(footer && heading && footer.top < heading.bottom),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        visibleAlerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim()).filter(Boolean),
        processingTextAbsent: !bodyText.includes("預覽產生中")
      };
    });
    verification.unsavedGuardMessage = unsavedGuardMessage;
    const passed = response?.status() < 400
      && verification.tabText === "智慧辨識"
      && !verification.tabCountBadgePresent
      && !verification.readonlyTagPresent
      && !verification.compactIntroPresent
      && !verification.compactStatusChipPresent
      && !verification.summaryPresent
      && !verification.categoryHeadingsPresent
      && verification.sourceRoleCards === 0
      && verification.candidateCount > 0
      && verification.duplicateCanonicalFieldKeys.length === 0
      && !verification.candidateHelperLabelsPresent
      && !verification.candidateCurrentMetaPresent
      && verification.candidateInputCount === verification.candidateCount
      && verification.candidateInputWithoutAccessibleName === 0
      && verification.candidateActionButtonCount === 0
      && !verification.standaloneLocateButtonPresent
      && !verification.pdfOcrStatusPanelPresent
      && !verification.recognitionScopeHelpPresent
      && !verification.recognitionEyebrowPresent
      && !verification.recognitionFootnotePresent
      && !verification.manualStartRecognitionPresent
      && evidencePreview.pdfEvidence.highlightPresent
      && evidencePreview.pdfEvidence.highlightMarkerKind === "highlighter"
      && evidencePreview.pdfEvidence.highlightBackgroundImage.includes("linear-gradient")
      && evidencePreview.pdfEvidence.highlightBorderWidth === "0px"
      && evidencePreview.pdfEvidence.highlightOutlineWidth === "0px"
      && evidencePreview.pdfEvidence.magnifierPresent
      && evidencePreview.pdfEvidence.magnifierState === "ready"
      && evidencePreview.pdfEvidence.magnifierResolutionMode === "pdf_high_res_crop"
      && evidencePreview.pdfEvidence.magnifierCoverageRatio >= 1
      && evidencePreview.pdfEvidence.magnifierBackingScale >= 2.5
      && evidencePreview.pdfEvidence.magnifierBackingScale <= 3
      && evidencePreview.pdfEvidence.magnifierTargetRect.length > 0
      && evidencePreview.pdfEvidence.magnifierCropRect.length > 0
      && evidencePreview.pdfEvidence.magnifierLruSize >= 1
      && evidencePreview.pdfEvidence.magnifierRenderElapsedMs <= 150
      && evidencePreview.pdfEvidence.magnifierRingBorder.includes("rgb(241, 204, 20)")
      && evidencePreview.pdfEvidence.magnifierPseudoHandleDisplay === "none"
      && evidencePreview.pdfEvidence.magnifierCanvasWidth > 0
      && evidencePreview.pdfEvidence.magnifierCanvasHeight > 0
      && evidencePreview.pdfEvidence.magnifierNonWhitePixels > 100
      && evidencePreview.pdfEvidence.caption === ""
      && evidencePreview.pdfEvidence.previewLinkTarget === "_blank"
      && evidencePreview.pdfEvidence.clickedPreviewOpenedNewTab
      && evidencePreview.pdfEvidence.renderedMode === "pdf-page"
      && evidencePreview.pdfEvidence.pdfPageState === "ready"
      && evidencePreview.pdfEvidence.pdfPageRendererCount === 1
      && evidencePreview.pdfEvidence.documentViewerCount === 0
      && evidencePreview.pdfEvidence.highlightWithinRenderedPage
      && evidencePreview.pdfEvidence.magnifierWithinRenderedPage
      && !evidencePreview.pdfEvidence.magnifierOverlapsHighlight
      && evidencePreview.pdfEvidence.renderedPageWithinFrame
      && evidencePreview.pdfEvidence.normalizedHighlight?.x > 0.7
      && evidencePreview.pdfEvidence.normalizedHighlight?.x < 1
      && evidencePreview.pdfEvidence.normalizedHighlight?.y > 0.75
      && evidencePreview.pdfEvidence.normalizedHighlight?.y < 1
      && evidencePreview.pdfEvidence.materialEvidenceText.includes("不鏽鋼SUS304")
      && evidencePreview.cadEvidence.flash.includes("A0002.SLDPRT")
      && evidencePreview.cadEvidence.flash.includes("檔案屬性")
      && !evidencePreview.cadEvidence.highlightPresent
      && !evidencePreview.cadEvidence.magnifierPresent
      && evidencePreview.focusedEvidence.highlightPresent
      && evidencePreview.focusedEvidence.magnifierPresent
      && !evidencePreview.returnToOriginalButtonPresent
      && evidencePreview.restoredEvidence.highlightPresent === false
      && evidencePreview.restoredEvidence.magnifierPresent === false
      && evidencePreview.restoredEvidence.flashPresent === false
      && evidencePreview.restoredEvidence.activeTabText === evidencePreview.originalPreview.activeTabText
      && evidenceSurface.previewSurfaceCount === 1
      && evidenceSurface.previewTabCount === 2
      && evidenceSurface.pdfTabCount === 0
      && evidenceSurface.secondPreviewViewerCount <= 1
      && evidenceSurface.documentViewerCount === 0
      && verification.modifiedInputCount === 1
      && verification.modifiedIndicatorText === "已修改"
      && verification.globalSaveButtonCount === 1
      && verification.globalSaveButtonText === "完成核對並儲存"
      && verification.globalSaveButtonEnabled
      && verification.materialCardCount === 1
      && verification.materialReviewGroupCount === 2
      && verification.materialMergedCandidateCount === 2
      && verification.materialScopeText === ""
      && verification.materialEvidenceLabels.length > 0
      && verification.materialEvidenceLabels.every((label) => ["PDF圖面", "檔案屬性"].includes(label))
      && verification.activeTabStillRecognition
      && verification.unsavedGuardMessage.includes("尚未儲存的變更")
      && !verification.pendingReviewTextPresent
      && !verification.footerOverlapsRecognition
      && verification.horizontalOverflow <= 2
      && verification.visibleAlerts.length === 0
      && verification.processingTextAbsent
      && consoleErrors.length === 0
      && failedRequests.length === 0;
    const screenshot = path.join(outputDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.locator('.dev079-recognition-save-all').scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    const saveButtonScreenshot = path.join(outputDir, `${viewport.name}-save-button.png`);
    await page.screenshot({ path: saveButtonScreenshot, fullPage: true });
    results.push({ viewport, httpStatus: response?.status() ?? null, passed, verification, evidencePreview, consoleErrors, failedRequests, expectedPreviewCancellations, expectedNavigationCancellations, evidenceScreenshot: path.relative(root, evidenceScreenshot), screenshot: path.relative(root, screenshot), saveButtonScreenshot: path.relative(root, saveButtonScreenshot) });
    await context.close();
    if (!passed) throw new Error(`${viewport.name} recognition layout verification failed: ${JSON.stringify(results.at(-1))}`);
  }
} finally {
  await browser.close();
  await stopIsolatedRuntime();
}

fs.writeFileSync(path.join(outputDir, "browser-verification.json"), `${JSON.stringify({ baseUrl, route, status: "PASS", results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "PASS", outputDir, results }, null, 2));
