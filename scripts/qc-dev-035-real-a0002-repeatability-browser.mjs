#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import Database from "better-sqlite3";
import { chromium } from "playwright";

import { startDev079IsolatedRuntime } from "./qc-dev-079-isolated-runtime.mjs";

const root = process.cwd();
const expectTaskOpen = process.argv.includes("--expect-task-open");
const runId = `DEV035-A0002-REPEATABILITY-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-035-a0002-repeatability", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const fixturePath = path.join(root, ".ai-doc", "qa", "fixtures", "dev-035-a0002-property-expectations.md");
const taskPath = path.join(root, ".ai-doc", "dev_task.md");
const expectedKeys = ["part_name", "model_root_number", "revision", "drawn_by_name", "part_number", "material", "surface_finish", "heat_treatment"];
const fixtureText = fs.readFileSync(fixturePath, "utf8");
const expectedFields = Object.fromEntries([...fixtureText.matchAll(/^\| `[^`]+` \| `([^`]+)` \| `([^`]+)` \|/gmu)].map((match) => [match[2], match[1]]));
const checks = [];
const browserFailures = [];
let runtime = null;
let browser = null;
let worker = null;
let newSessionId = null;
const newSessionIds = [];
let baselineSessionId = null;
let workerOutput = "";
let evidenceSummary = null;

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function insertRow(database, table, row) {
  const columns = Object.keys(row);
  database.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => `:${column}`).join(", ")})`).run(row);
}

function seedRetryableA0002Session(databasePath, revisionId) {
  const database = new Database(databasePath);
  try {
    database.pragma("foreign_keys = ON");
    const baseline = database.prepare(`SELECT * FROM drawing_recognition_sessions
      WHERE source_context_type = 'drawing_revision' AND source_context_id = :revisionId
      ORDER BY created_at DESC, id DESC LIMIT 1`).get({ revisionId });
    if (!baseline || baseline.status !== "review_ready") throw new Error(`DEV035_A0002_BASELINE_REVIEW_READY_REQUIRED:${JSON.stringify(baseline)}`);
    const sources = database.prepare("SELECT * FROM drawing_recognition_sources WHERE session_id = :sessionId ORDER BY sort_order, id").all({ sessionId: baseline.id });
    const nativeSources = sources.filter((source) => ["sldprt", "sldasm", "slddrw"].includes(String(source.file_ext ?? "").toLowerCase()));
    if (!nativeSources.some((source) => String(source.file_name).toLowerCase() === "a0002.sldprt")) throw new Error("DEV035_A0002_SLDPRT_SOURCE_REQUIRED");
    const sourceAssets = database.prepare(`SELECT asset.id, asset.file_name, asset.file_size, asset.content_hash, asset.original_path, asset.storage_key
      FROM file_assets asset WHERE asset.id IN (${sources.map(() => "?").join(",")}) ORDER BY asset.file_name, asset.id`).all(...sources.map((source) => source.file_asset_id));
    const sourceAsset = sourceAssets.find((asset) => String(asset.file_name).toLowerCase() === "a0002.sldprt");
    if (!sourceAsset || Number(sourceAsset.file_size) !== 495749 || !/^[a-f0-9]{64}$/u.test(String(sourceAsset.content_hash ?? ""))) {
      throw new Error(`DEV035_A0002_SOURCE_SNAPSHOT_INVALID:${JSON.stringify(sourceAsset)}`);
    }
    const sessionId = `recognition-qc-dev035-retry-${crypto.randomUUID()}`;
    const timestamp = new Date(Date.now() + 1_000).toISOString();
    insertRow(database, "drawing_recognition_sessions", {
      ...baseline,
      id: sessionId,
      deduplication_key: crypto.createHash("sha256").update(sessionId).digest("hex"),
      status: "extraction_partial",
      not_before: null,
      attempt_count: 1,
      locked_by: null,
      locked_at: null,
      heartbeat_at: null,
      row_version: 1,
      warning_count: nativeSources.length,
      conflict_count: 0,
      unclassified_count: 0,
      supersedes_session_id: baseline.id,
      error_code: null,
      error_summary: null,
      created_at: timestamp,
      updated_at: timestamp,
      cancelled_at: null
    });
    const sourceMap = new Map();
    for (const source of sources) {
      const sourceId = `recognition-source-qc-dev035-${crypto.randomUUID()}`;
      sourceMap.set(source.id, sourceId);
      insertRow(database, "drawing_recognition_sources", { ...source, id: sourceId, session_id: sessionId, created_at: timestamp });
    }
    for (const source of nativeSources) {
      database.prepare(`INSERT INTO drawing_recognition_adapter_results (
          id, session_id, source_id, company_id, adapter_code, adapter_version,
          status, observation_count, diagnostics_json, started_at, completed_at
        ) VALUES (?, ?, ?, ?, 'native-metadata-bridge.v1', 'worker', 'unsupported', 0,
          '["native_metadata_not_configured"]', ?, ?)`)
        .run(`recognition-adapter-qc-dev035-${crypto.randomUUID()}`, sessionId, sourceMap.get(source.id), baseline.company_id, timestamp, timestamp);
    }
    const foreignKeys = database.pragma("foreign_key_check");
    if (foreignKeys.length) throw new Error(`DEV035_RETRY_FIXTURE_FOREIGN_KEYS:${JSON.stringify(foreignKeys)}`);
    return { baselineSessionId: baseline.id, retrySessionId: sessionId, sourceAsset, nativeSourceCount: nativeSources.length };
  } finally {
    database.close();
  }
}

function monitor(page) {
  page.on("console", (message) => {
    if (message.type() === "error") browserFailures.push({ kind: "console", message: message.text() });
  });
  page.on("pageerror", (error) => browserFailures.push({ kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "failed";
    if (failure === "net::ERR_ABORTED" && (request.url().startsWith("blob:") || request.method() === "GET" || request.url().includes("/client-adapter-results"))) return;
    browserFailures.push({ kind: "requestfailed", url: request.url(), message: failure });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) browserFailures.push({ kind: "http", status: response.status(), url: response.url() });
  });
}

function startWorkerOnce(input) {
  console.log(JSON.stringify({ runtime: {
    project: root,
    purpose: "DEV-035 second real A0002 SolidWorks metadata recognition",
    port: new URL(input.baseUrl).port,
    owningProcessTree: "current QC runner -> one-shot drawing recognition worker",
    cleanupCondition: "worker exits after one claimed job; isolated Next runtime is stopped by its owner",
    PDM_DATA_DIR: input.dataDir,
    PDM_REPOSITORY_DIR: input.repositoryDir,
    mutationScope: [input.dataDir, input.repositoryDir, outputDir]
  } }));
  const child = spawn(process.execPath, ["--experimental-transform-types", "scripts/run-drawing-recognition-worker.mjs", "--once"], {
    cwd: root,
    env: {
      ...process.env,
      PDM_DRAWING_RECOGNITION_WORKER_BASE_URL: input.baseUrl,
      PDM_DRAWING_RECOGNITION_WORKER_TOKEN: input.workerToken,
      PDM_PREVIEW_WORKER_TOKEN: input.previewToken,
      PDM_DRAWING_RECOGNITION_WORKER_ID: `dev035-a0002-${crypto.randomUUID()}`,
      PDM_DRAWING_RECOGNITION_POLL_MS: "250"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout?.on("data", (chunk) => { workerOutput = `${workerOutput}${String(chunk)}`.slice(-12_000); });
  child.stderr?.on("data", (chunk) => { workerOutput = `${workerOutput}${String(chunk)}`.slice(-12_000); });
  return child;
}

async function waitForWorker(child) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`DEV035_REAL_WORKER_TIMEOUT:${workerOutput}`)), 120_000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`DEV035_REAL_WORKER_EXIT_${code}:${workerOutput}`));
    });
  });
}

function evaluateA0002(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    const rows = database.prepare(`SELECT session.id AS session_id, session.status AS session_status,
        result.id AS adapter_result_id, result.status AS adapter_status, result.adapter_version,
        result.observation_count, result.completed_at, source.file_name, source.content_hash, source.file_size
      FROM drawing_recognition_sessions session
      JOIN drawing_recognition_sources source ON source.session_id = session.id
      JOIN drawing_recognition_adapter_results result ON result.session_id = session.id AND result.source_id = source.id
      WHERE LOWER(source.file_name) = 'a0002.sldprt' AND result.adapter_code = 'native-metadata-bridge.v1'
      ORDER BY result.completed_at DESC, result.id DESC`).all();
    const observationStatement = database.prepare(`SELECT candidate.field_key, candidate.raw_value, candidate.normalized_value,
        observation.location_kind, observation.configuration_name, candidate.proposed_owner_type,
        candidate.proposed_owner_id, candidate.applicability_scope
      FROM drawing_recognition_candidate_observations link
      JOIN drawing_recognition_candidates candidate ON candidate.id = link.candidate_id
      JOIN drawing_recognition_observations observation ON observation.id = link.observation_id
      WHERE observation.adapter_result_id = ? ORDER BY observation.id`);
    const evaluated = rows.map((row) => {
      const observations = observationStatement.all(row.adapter_result_id);
      const byKey = new Map();
      for (const observation of observations) {
        const key = String(observation.field_key ?? "");
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(observation);
      }
      const expectedOwner = (key) => ["part_name", "part_number", "material", "surface_finish", "heat_treatment"].includes(key)
        ? "part_number" : key === "model_root_number" ? "drawing" : "drawing_revision";
      const missingFields = expectedKeys.filter((key) => !byKey.has(key));
      const mismatchedFields = expectedKeys.filter((key) => {
        const values = new Set((byKey.get(key) ?? []).map((observation) => String(observation.normalized_value ?? "").trim()).filter(Boolean));
        return values.size !== 1 || !values.has(expectedFields[key]);
      });
      const ownerMismatches = expectedKeys.filter((key) => (byKey.get(key) ?? []).length === 0
        || (byKey.get(key) ?? []).some((observation) => observation.proposed_owner_type !== expectedOwner(key) || !observation.proposed_owner_id));
      const scopeMismatches = expectedKeys.filter((key) => (byKey.get(key) ?? []).some((observation) => observation.location_kind !== "cad_property" || !String(observation.applicability_scope ?? "").trim()));
      const projection = expectedKeys.flatMap((key) => (byKey.get(key) ?? []).map((observation) => [
        key,
        observation.raw_value ?? null,
        observation.normalized_value ?? null,
        observation.location_kind ?? null,
        observation.configuration_name ?? null,
        observation.applicability_scope ?? null,
        observation.proposed_owner_type ?? null,
        observation.proposed_owner_id ?? null
      ])).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      return {
        ...row,
        missingFields,
        mismatchedFields,
        ownerMismatches,
        scopeMismatches,
        projection,
        realReader: row.adapter_status === "succeeded" && String(row.adapter_version ?? "").startsWith("solidworks-document-manager") && Number(row.observation_count) >= expectedKeys.length,
        exactFields: missingFields.length === 0 && mismatchedFields.length === 0 && ownerMismatches.length === 0 && scopeMismatches.length === 0
      };
    });
    const successes = [...new Map(evaluated.filter((row) => row.realReader && row.exactFields && /^[a-f0-9]{64}$/u.test(String(row.content_hash ?? "")) && Number(row.file_size) > 0)
      .map((row) => [row.session_id, row])).values()].sort((left, right) => String(left.completed_at).localeCompare(String(right.completed_at)));
    const latestTwo = successes.slice(-2);
    const heartbeat = database.prepare(`SELECT status, applied_secret_version, applied_secret_fingerprint, last_seen_at
      FROM worker_capability_heartbeats WHERE capability_code = 'solidworks_document_manager'
      ORDER BY last_seen_at DESC LIMIT 1`).get() ?? null;
    const active = database.prepare(`SELECT version, fingerprint, vault_provider FROM secret_references
      WHERE kind = 'solidworks_document_manager' AND lifecycle_status = 'active' ORDER BY version DESC LIMIT 1`).get() ?? null;
    return {
      evaluated,
      successfulRuns: successes.length,
      latestTwo: latestTwo.map((row) => ({ sessionId: row.session_id, completedAt: row.completed_at, contentHash: row.content_hash, projection: row.projection })),
      repeatable: latestTwo.length === 2 && latestTwo[0].content_hash === latestTwo[1].content_hash && JSON.stringify(latestTwo[0].projection) === JSON.stringify(latestTwo[1].projection),
      heartbeat,
      active,
      foreignKeys: database.pragma("foreign_key_check")
    };
  } finally {
    database.close();
  }
}

async function runCompletionGate(dataDir) {
  const child = spawn(process.execPath, ["scripts/qc-dev-035-completion-gate.mjs"], {
    cwd: root,
    env: { ...process.env, PDM_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.stdout?.on("data", (chunk) => { output += String(chunk); });
  child.stderr?.on("data", (chunk) => { output += String(chunk); });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  return { code, output: output.slice(-30_000) };
}

try {
  fs.mkdirSync(screenshotDir, { recursive: true });
  check("A0002 eight-field fixture is parseable", expectedKeys.every((key) => expectedFields[key]), JSON.stringify(expectedFields));
  const taskText = fs.readFileSync(taskPath, "utf8");
  check("DEV-035 task status matches runner phase", expectTaskOpen ? /☐ DEV-035/u.test(taskText) : /✓ DEV-035/u.test(taskText));

  runtime = await startDev079IsolatedRuntime();
  let retryFixture = seedRetryableA0002Session(runtime.databasePath, runtime.revisionId);
  baselineSessionId = retryFixture.baselineSessionId;
  check("isolated retry fixture preserves canonical A0002 source bytes", retryFixture.sourceAsset.file_size === 495749 && retryFixture.sourceAsset.content_hash === "15cd458b983e4dddd0836555dfa8eac0f4d3ac87c056403d4279ebbf3d3ec7f4", JSON.stringify(retryFixture.sourceAsset));
  check("isolated retry fixture includes native SolidWorks sources", retryFixture.nativeSourceCount >= 1, JSON.stringify(retryFixture));

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const login = await context.request.post(`${runtime.baseUrl}/api/auth/local-quick-login`, { data: { role: "R&D Manager" } });
  check("R&D Manager can log into isolated runtime", login.ok(), `HTTP ${login.status()}`);
  const page = await context.newPage();
  monitor(page);
  const route = `${runtime.baseUrl}/numbering/drawings/${encodeURIComponent(runtime.drawingId)}/workspace?workId=${encodeURIComponent(runtime.workId)}&returnTo=%2Fnumbering%2Fdrawings`;
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const retryButton = page.getByRole("button", { name: "重新辨識", exact: true });
    await retryButton.waitFor({ state: "visible", timeout: 45_000 });
    check(`cycle ${cycle} canonical workspace exposes normal retry action`, await retryButton.isEnabled());
    await page.screenshot({ path: path.join(screenshotDir, `${cycle}-before-real-rerun.png`), fullPage: false });
    const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/numbering\/recognition-sessions\/[^/]+\/reruns$/u.test(new URL(response.url()).pathname), { timeout: 30_000 });
    await retryButton.click();
    const response = await responsePromise;
    const responseBody = await response.json();
    newSessionId = String(responseBody?.session?.id ?? "");
    newSessionIds.push(newSessionId);
    check(`cycle ${cycle} normal UI retry creates a queued successor`, response.status() === 201 && Boolean(newSessionId) && responseBody.session.status === "queued", JSON.stringify(responseBody));

    // The production queue intentionally applies a short not-before delay. Wait
    // for that contract instead of letting a one-shot worker exit with no claim.
    await page.waitForTimeout(2_500);
    worker = startWorkerOnce({
      baseUrl: runtime.baseUrl,
      dataDir: runtime.runtimeReceipt.PDM_DATA_DIR,
      repositoryDir: runtime.runtimeReceipt.PDM_REPOSITORY_DIR,
      workerToken: runtime.workerToken,
      previewToken: runtime.previewToken
    });
    await waitForWorker(worker);
    check(`cycle ${cycle} real one-shot recognition worker exits cleanly`, worker.exitCode === 0, workerOutput);
    const completedSession = new Database(runtime.databasePath, { readonly: true, fileMustExist: true });
    const completedState = completedSession.prepare("SELECT status, attempt_count, error_code FROM drawing_recognition_sessions WHERE id = ?").get(newSessionId);
    completedSession.close();
    check(`cycle ${cycle} worker completes the queued successor`, completedState?.status === "review_ready" && Number(completedState?.attempt_count) >= 1, JSON.stringify(completedState));
    await page.getByText("智慧辨識處理中", { exact: true }).waitFor({ state: "hidden", timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: path.join(screenshotDir, `${cycle}-after-real-rerun.png`), fullPage: false });
    if (cycle === 1) {
      retryFixture = seedRetryableA0002Session(runtime.databasePath, runtime.revisionId);
      check("second isolated retry fixture chains from first current reader result", retryFixture.baselineSessionId === newSessionId, JSON.stringify(retryFixture));
    }
  }

  const evidence = evaluateA0002(runtime.databasePath);
  check("both UI-created sessions used the real native reader", newSessionIds.every((sessionId) => evidence.evaluated.some((row) => row.session_id === sessionId && row.realReader && row.exactFields)), JSON.stringify(evidence.evaluated.filter((row) => newSessionIds.includes(row.session_id))));
  check("A0002 has two current successful exact sessions", evidence.successfulRuns >= 3, JSON.stringify(evidence.latestTwo));
  check("latest two A0002 runs preserve content hash and recognition projection", evidence.repeatable, JSON.stringify(evidence.latestTwo));
  check("worker acknowledges exact active secure-secret version", Boolean(evidence.active && evidence.heartbeat && evidence.heartbeat.status === "ready" && evidence.heartbeat.applied_secret_version === evidence.active.version && evidence.heartbeat.applied_secret_fingerprint === evidence.active.fingerprint), JSON.stringify({ active: evidence.active, heartbeat: evidence.heartbeat }));
  check("isolated runtime remains foreign-key clean", evidence.foreignKeys.length === 0, JSON.stringify(evidence.foreignKeys));
  check("browser has no unexpected console, page, network, or HTTP failures", browserFailures.length === 0, JSON.stringify(browserFailures));
  evidenceSummary = {
    sourceFileName: "A0002.SLDPRT",
    sourceBytes: 495749,
    sourceHash: "15cd458b983e4dddd0836555dfa8eac0f4d3ac87c056403d4279ebbf3d3ec7f4",
    sessionIds: [...newSessionIds],
    projectionHashes: evidence.latestTwo.map((row) => crypto.createHash("sha256").update(JSON.stringify(row.projection)).digest("hex")),
    repeatable: evidence.repeatable,
    activeSecret: evidence.active,
    workerHeartbeat: evidence.heartbeat,
    foreignKeyViolations: evidence.foreignKeys.length
  };

  if (!expectTaskOpen) {
    const completion = await runCompletionGate(runtime.runtimeReceipt.PDM_DATA_DIR);
    check("DEV-035 completion gate passes against isolated real evidence", completion.code === 0 && completion.output.includes('"state": "PASS"'), completion.output);
  }
  await context.close();
} catch (error) {
  checks.push({ name: "runner execution", pass: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  if (worker && worker.exitCode === null) {
    try { worker.kill("SIGTERM"); } catch {}
  }
  try { await runtime?.stop(); } catch (error) {
    checks.push({ name: "isolated runtime cleanup", pass: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

const failed = checks.filter((item) => !item.pass);
const manifest = {
  runId,
  status: failed.length === 0 ? "PASS" : "FAIL",
  phase: expectTaskOpen ? "pre-closure" : "closure",
  outputDir,
  baselineSessionId,
  newSessionId,
  newSessionIds,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  browserFailures,
  evidence: evidenceSummary,
  workerOutput
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
