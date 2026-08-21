import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import Database from "better-sqlite3";

const root = process.cwd();

export async function startDev079IsolatedRuntime() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev079-layout-"));
  const repositoryDir = path.join(tempDir, "repository");
  const distDir = `.tmp/next-qc-dev079-layout-${crypto.randomUUID()}`;
  const targetDb = path.join(tempDir, "ai-pdm.sqlite");
  let port = null;
  let child = null;
  let workerChild = null;
  try {
    fs.copyFileSync(path.join(root, "data", "ai-pdm.sqlite"), targetDb);
    fs.cpSync(path.join(root, "data", "repository"), repositoryDir, { recursive: true });
    prepareA0002IsolatedDatabase(targetDb);
    port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
    const workerToken = `dev079-layout-worker-${crypto.randomUUID()}`;
    const previewToken = `dev079-layout-preview-${crypto.randomUUID()}-${crypto.randomUUID()}`;
    child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: root,
      env: {
        ...process.env,
        PDM_AUTH_MODE: "demo",
        PDM_AUTH_SECRET: "dev079-layout-auth-secret",
        PDM_DB_PROVIDER: "sqlite",
        PDM_DATA_DIR: tempDir,
        PDM_REPOSITORY_DIR: repositoryDir,
        PDM_RELEASE_MODE: "local_stub",
        PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
        PDM_NUMBER_STATE_FLOW_V1: "true",
        PDM_NUMBER_LIFECYCLE_V2: "true",
        PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
        PDM_DRAWING_RECOGNITION_V1: "true",
        PDM_DRAWING_RECOGNITION_WORKER_TOKEN: workerToken,
        PDM_PREVIEW_WORKER_TOKEN: previewToken,
        PDM_PUBLIC_BASE_URL: baseUrl,
        PDM_NEXT_DIST_DIR: distDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    console.log(JSON.stringify({ runtime: { project: "AI_PDM", purpose: "DEV-079 isolated layout browser QC", port, pid: child.pid, cleanup: "stop exact process tree and verify port release" } }));
    await waitForServer(baseUrl);
    workerChild = spawn(process.execPath, ["--experimental-transform-types", "scripts/run-drawing-recognition-worker.mjs", "--once"], {
      cwd: root,
      env: {
        ...process.env,
        PDM_DRAWING_RECOGNITION_WORKER_BASE_URL: baseUrl,
        PDM_DRAWING_RECOGNITION_WORKER_TOKEN: workerToken,
        PDM_PREVIEW_WORKER_TOKEN: previewToken,
        PDM_DRAWING_RECOGNITION_WORKER_ID: `dev079-layout-${crypto.randomUUID()}`,
        PDM_DRAWING_RECOGNITION_POLL_MS: "250"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let workerError = "";
    workerChild.stderr?.on("data", (chunk) => { workerError = `${workerError}${String(chunk)}`.slice(-4_000); });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("DEV-079 isolated layout worker timed out")), 90_000);
      workerChild.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`DEV-079 isolated layout worker exited ${code}: ${workerError}`));
      });
    });
    markA0002RecognitionReady(targetDb);
    let stopped = false;
    return {
      baseUrl,
      stop: async () => {
        if (stopped) return;
        stopped = true;
        await stopRuntime({ child, workerChild, port, tempDir, distDir });
      }
    };
  } catch (error) {
    await stopRuntime({ child, workerChild, port, tempDir, distDir }).catch(() => {});
    throw error;
  }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("DEV-079 isolated layout browser server did not start");
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
  database.exec("DROP TRIGGER IF EXISTS trg_drawings_terminal_state_guard");
  database.exec("DROP TRIGGER IF EXISTS trg_drawings_number_immutable_guard");
  database.prepare("UPDATE drawings SET drawing_number = 'QC-A0002-M01-FORMAL' WHERE id = 'drawing-draft-drawing-cc7187b8-1ec4-4936-91da-4771f1b8a877'").run();
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
  const candidate = database.prepare("SELECT id, workspace_id FROM numbering_candidate_revision_drafts WHERE id = 'NCR-55c7b355-cfe6-41f1-b714-7fa911b1fed7'").get();
  const activeFiles = candidate ? database.prepare("SELECT COUNT(*) AS count FROM numbering_candidate_revision_files WHERE candidate_revision_id = :candidateId AND removed_at IS NULL").get({ candidateId: candidate.id }) : { count: 0 };
  database.close();
  if (!candidate || candidate.workspace_id !== 'draft-workspace-2b88591e-128c-4bb8-a0e9-97864733700f' || Number(activeFiles.count) < 3) throw new Error("DEV-079 A0002 isolated layout candidate fixture was not prepared");
}

function markA0002RecognitionReady(databasePath) {
  const database = new Database(databasePath);
  const timestamp = new Date().toISOString();
  const sourceSessionId = "recognition-8c16aaf4-8b8c-4369-b7a0-c1e9a5559ac6";
  const seedSessionId = "recognition-870fe33f-6dc3-4e72-a903-3446eac49102";
  const targetSessionId = "qc-recognition-a0002-dev079-layout";
  const seed = database.prepare("SELECT * FROM drawing_recognition_sessions WHERE id = :id").get({ id: seedSessionId });
  if (!seed) { database.close(); throw new Error("DEV-079 isolated seed recognition session is missing"); }
  database.prepare("UPDATE drawing_recognition_sessions SET deduplication_key = :deduplicationKey WHERE id = :id").run({ id: seedSessionId, deduplicationKey: `qc-obsolete-${crypto.randomUUID()}` });
  database.prepare("DELETE FROM drawing_recognition_sessions WHERE id = :id").run({ id: targetSessionId });
  const insertRow = (table, row) => {
    const columns = Object.keys(row);
    database.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => `:${column}`).join(", ")})`).run(row);
  };
  const sourceRows = database.prepare("SELECT * FROM drawing_recognition_sources WHERE session_id = :sessionId ORDER BY sort_order, id").all({ sessionId: sourceSessionId });
  const seedRows = database.prepare("SELECT * FROM drawing_recognition_sources WHERE session_id = :sessionId ORDER BY sort_order, id").all({ sessionId: seedSessionId });
  const targetSourceMap = new Map(seedRows.map((row) => [row.file_asset_id, `qc-layout-source-${crypto.randomUUID()}`]));
  const sourceToTargetSource = new Map(sourceRows.map((row) => [row.file_asset_id, targetSourceMap.get(row.file_asset_id)]));
  insertRow("drawing_recognition_sessions", { ...seed, id: targetSessionId, status: "review_ready", source_context_type: "candidate_revision", source_context_id: "NCR-55c7b355-cfe6-41f1-b714-7fa911b1fed7", source_lineage_key: "candidate_revision:NCR-55c7b355-cfe6-41f1-b714-7fa911b1fed7", deduplication_key: seed.deduplication_key, supersedes_session_id: seedSessionId, created_at: timestamp, updated_at: timestamp, locked_by: null, locked_at: null, heartbeat_at: null, cancelled_at: null, error_code: null, error_summary: null });
  for (const row of seedRows) insertRow("drawing_recognition_sources", { ...row, id: targetSourceMap.get(row.file_asset_id), session_id: targetSessionId, adapter_plan_json: /\.pdf$/iu.test(row.file_name) ? '["filename.v1","browser-pdf-ocr.v1"]' : row.adapter_plan_json, created_at: timestamp });
  const sourceToTargetAdapter = new Map();
  for (const row of database.prepare("SELECT * FROM drawing_recognition_adapter_results WHERE session_id = :sessionId ORDER BY id").all({ sessionId: sourceSessionId })) {
    const id = `qc-layout-adapter-${crypto.randomUUID()}`;
    sourceToTargetAdapter.set(row.id, id);
    insertRow("drawing_recognition_adapter_results", { ...row, id, session_id: targetSessionId, source_id: sourceToTargetSource.get(row.source_id) ?? row.source_id });
  }
  const candidateMap = new Map();
  for (const row of database.prepare("SELECT * FROM drawing_recognition_candidates WHERE session_id = :sessionId ORDER BY sort_order, id").all({ sessionId: sourceSessionId })) {
    const id = `qc-layout-candidate-${crypto.randomUUID()}`;
    candidateMap.set(row.id, id);
    insertRow("drawing_recognition_candidates", { ...row, id, session_id: targetSessionId });
  }
  const observationMap = new Map();
  for (const row of database.prepare("SELECT * FROM drawing_recognition_observations WHERE session_id = :sessionId ORDER BY captured_at, id").all({ sessionId: sourceSessionId })) {
    const id = `qc-layout-observation-${crypto.randomUUID()}`;
    observationMap.set(row.id, id);
    insertRow("drawing_recognition_observations", { ...row, id, session_id: targetSessionId, source_id: sourceToTargetSource.get(row.source_id) ?? row.source_id, adapter_result_id: sourceToTargetAdapter.get(row.adapter_result_id) ?? row.adapter_result_id });
  }
  for (const row of database.prepare("SELECT * FROM drawing_recognition_candidate_observations WHERE candidate_id IN (SELECT id FROM drawing_recognition_candidates WHERE session_id = :sessionId)").all({ sessionId: sourceSessionId })) insertRow("drawing_recognition_candidate_observations", { ...row, candidate_id: candidateMap.get(row.candidate_id), observation_id: observationMap.get(row.observation_id) });
  database.close();
}

async function stopRuntime({ child, workerChild, port, tempDir, distDir }) {
  if (workerChild && workerChild.exitCode === null) terminate(workerChild);
  if (child && child.exitCode === null) {
    terminate(child);
    const deadline = Date.now() + 5_000;
    while (child.exitCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (port) {
    const released = await new Promise((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (!released) throw new Error(`temporary DEV-079 port ${port} was not released`);
  }
  for (const target of [path.join(root, ...distDir.split("/")), tempDir]) {
    const resolved = path.resolve(target);
    const allowed = resolved.startsWith(path.resolve(os.tmpdir())) || resolved.startsWith(`${path.resolve(root, ".tmp")}${path.sep}`);
    if (allowed && fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function terminate(child) {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
  else child.kill("SIGTERM");
}
