#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { chromium } from "playwright";

import {
  getFreePort,
  removeTaskOwnedWorkspaceTempDir,
  startNextApp,
  stopNextApp,
  waitForNextAppReady
} from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV035-NATIVE-RETRY-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-035-native-retry", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev035-native-retry-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const fixtureRepository = path.join(tempRoot, "repository");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const nextEnvPath = path.join(root, "next-env.d.ts");
const nextEnvBefore = fs.existsSync(nextEnvPath) ? fs.readFileSync(nextEnvPath, "utf8") : null;
const installedChrome = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].find((candidate) => fs.existsSync(candidate));
const checks = [];
const browserFailures = [];
let browser = null;
let app = null;
let port = null;
let runtimeDistDir = null;
let sourceBefore = null;

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function sourceInvariant() {
  const database = new Database(sourceDb, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    const payload = {
      masters: {
        roots: database.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count,
        parts: database.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count,
        drawings: database.prepare("SELECT COUNT(*) AS count FROM drawings").get().count
      },
      residue: database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'
        AND name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration') ORDER BY name`).all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { payload, hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  } finally {
    database.close();
  }
}

function seedUnavailableSession(database) {
  const work = database.prepare(`SELECT state.company_id, state.work_id, state.revision_id,
      drawing.id AS drawing_id, drawing.drawing_number, work.owner_user_id
    FROM canonical_workbench_states state
    JOIN drawings drawing ON drawing.id = state.canonical_entity_id AND drawing.company_id = state.company_id
    JOIN drawing_revision_works work ON work.id = state.work_id AND work.company_id = state.company_id
    WHERE state.entity_type = 'drawing' AND state.handling = 'owner' AND state.work_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM drawing_revision_work_files source_binding
        JOIN drawing_revision_files source_file ON source_file.id = source_binding.file_binding_id
        JOIN file_assets source_asset ON source_asset.id = source_file.source_file_asset_id
        WHERE source_binding.work_id = state.work_id AND source_file.removed_at IS NULL AND source_asset.deleted_at IS NULL
          AND LOWER(source_asset.file_ext) IN ('slddrw', 'sldprt', 'sldasm')
      )
    ORDER BY CASE WHEN drawing.drawing_number = 'A0044-M01' THEN 0 ELSE 1 END, state.created_at, state.id
    LIMIT 1`).get();
  if (!work) throw new Error("ACTIVE_CANONICAL_DRAWING_WORK_REQUIRED");
  const files = database.prepare(`SELECT asset.id, asset.file_name, asset.file_ext, asset.mime_type,
      asset.file_size, asset.content_hash, file.role, binding.ordinal
    FROM drawing_revision_work_files binding
    JOIN drawing_revision_files file ON file.id = binding.file_binding_id
    JOIN file_assets asset ON asset.id = file.source_file_asset_id
    WHERE binding.work_id = ? AND file.removed_at IS NULL AND asset.deleted_at IS NULL
    ORDER BY binding.ordinal, binding.file_binding_id`).all(work.work_id);
  if (!files.some((file) => ["slddrw", "sldprt", "sldasm"].includes(String(file.file_ext).toLowerCase()))) {
    throw new Error("NATIVE_SOLIDWORKS_SOURCE_REQUIRED");
  }
  const sessionId = `recognition-qc-unavailable-${crypto.randomUUID()}`;
  const now = new Date(Date.now() + 1_000).toISOString();
  database.prepare(`INSERT INTO drawing_recognition_sessions (
      id, company_id, source_context_type, source_context_id, source_lineage_key,
      drawing_id, drawing_revision_id, source_set_fingerprint, deduplication_key,
      status, priority, not_before, attempt_count, row_version, warning_count,
      conflict_count, unclassified_count, created_by, created_at, updated_at
    ) VALUES (?, ?, 'drawing_revision', ?, ?, ?, ?, ?, ?, 'extraction_partial', 100, NULL, 1, 1, 1, 0, 0, ?, ?, ?)`)
    .run(
      sessionId,
      work.company_id,
      work.revision_id,
      `drawing_revision:${work.revision_id}`,
      work.drawing_id,
      work.revision_id,
      crypto.createHash("sha256").update(files.map((file) => file.id).join("|")).digest("hex"),
      crypto.createHash("sha256").update(sessionId).digest("hex"),
      work.owner_user_id,
      now,
      now
    );
  for (const [index, file] of files.entries()) {
    const sourceId = `recognition-source-qc-${crypto.randomUUID()}`;
    database.prepare(`INSERT INTO drawing_recognition_sources (
        id, session_id, company_id, file_asset_id, content_hash, storage_generation,
        file_name, file_ext, mime_type, file_size, source_role, sort_order,
        adapter_plan_json, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, '[]', ?)`)
      .run(sourceId, sessionId, work.company_id, file.id, file.content_hash, file.file_name, file.file_ext,
        file.mime_type, file.file_size, file.role, index, now);
    if (!["slddrw", "sldprt", "sldasm"].includes(String(file.file_ext).toLowerCase())) continue;
    database.prepare(`INSERT INTO drawing_recognition_adapter_results (
        id, session_id, source_id, company_id, adapter_code, adapter_version,
        status, observation_count, diagnostics_json, started_at, completed_at
      ) VALUES (?, ?, ?, ?, 'native-metadata-bridge.v1', '1.0.0', 'unsupported', 0,
        '["native_metadata_not_configured"]', ?, ?)`)
      .run(`recognition-adapter-qc-${crypto.randomUUID()}`, sessionId, sourceId, work.company_id, now, now);
  }
  return { ...work, sessionId, sourceCount: files.length };
}

function promoteLegacyUnresolvedPartOwnerSession(database, work) {
  const session = database.prepare(`SELECT session.id,
      COUNT(DISTINCT CASE WHEN candidate.review_state = 'blocked'
        AND candidate.proposed_owner_type = 'part_number'
        AND candidate.proposed_owner_id IS NULL
        AND TRIM(COALESCE(candidate.proposed_value, '')) <> '' THEN candidate.id END) AS unresolved_owner_count,
      COUNT(DISTINCT CASE WHEN candidate.review_state = 'blocked'
        AND NOT (candidate.proposed_owner_type = 'part_number'
          AND candidate.proposed_owner_id IS NULL
          AND TRIM(COALESCE(candidate.proposed_value, '')) <> '') THEN candidate.id END) AS other_blocked_count,
      COUNT(DISTINCT CASE WHEN adapter.adapter_code = 'native-metadata-bridge.v1'
        AND adapter.status = 'succeeded' THEN adapter.id END) AS native_success_count
    FROM drawing_recognition_sessions session
    JOIN drawing_recognition_candidates candidate ON candidate.session_id = session.id
    LEFT JOIN drawing_recognition_adapter_results adapter ON adapter.session_id = session.id
    WHERE session.company_id = ? AND session.source_context_type = 'drawing_revision'
      AND session.source_context_id = ? AND session.id <> ?
    GROUP BY session.id
    HAVING unresolved_owner_count > 0 AND native_success_count > 0
    ORDER BY session.created_at DESC, session.id DESC
    LIMIT 1`).get(work.company_id, work.revision_id, work.sessionId);
  if (!session) throw new Error("LEGACY_UNRESOLVED_PART_OWNER_SESSION_REQUIRED");
  const timestamp = new Date(Date.now() + 2_000).toISOString();
  database.prepare("UPDATE drawing_recognition_sessions SET created_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, session.id);
  return {
    id: session.id,
    unresolvedOwnerCount: Number(session.unresolved_owner_count),
    otherBlockedCount: Number(session.other_blocked_count)
  };
}

function monitor(page) {
  page.on("console", (message) => {
    if (message.type() === "error") browserFailures.push({ kind: "console", message: message.text() });
  });
  page.on("pageerror", (error) => browserFailures.push({ kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") browserFailures.push({ kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) browserFailures.push({ kind: "http", status: response.status(), url: response.url() });
  });
}

async function login(context, baseUrl) {
  const page = await context.newPage();
  monitor(page);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  await page.close();
}

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(fixtureRepository, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  sourceBefore = sourceInvariant();
  check("primary source foreign keys are clean before QC", sourceBefore.payload.foreignKeys.length === 0, JSON.stringify(sourceBefore.payload.foreignKeys));
  check("primary source has no company-scope migration residue", sourceBefore.payload.residue.length === 0, JSON.stringify(sourceBefore.payload.residue));

  const source = new Database(sourceDb, { readonly: true, fileMustExist: true });
  await source.backup(fixtureDb);
  source.close();
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const fixture = new Database(fixtureDb);
  let work;
  let legacyOwnerSession;
  try {
    fixture.pragma("foreign_keys = ON");
    work = seedUnavailableSession(fixture);
    legacyOwnerSession = promoteLegacyUnresolvedPartOwnerSession(fixture, work);
  } finally {
    fixture.close();
  }
  check("isolated fixture contains a controlled native source", work.sourceCount >= 2, JSON.stringify(work));
  check("isolated fixture contains a historical unresolved-owner failure", legacyOwnerSession.unresolvedOwnerCount >= 1, JSON.stringify(legacyOwnerSession));

  port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  runtimeDistDir = path.join(root, ".tmp", `qc-dev035-native-retry-${port}`);
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository,
    PDM_BUILD_COMMIT: "local-dev",
    PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_DRAWING_RECOGNITION_V1: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: path.relative(root, runtimeDistDir),
    PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`DEV-035 retry runtime: project=${root}; purpose=native metadata recovery UI QC; port=${port}; owner=current QC process tree; dataDir=${fixtureDataDir}; repositoryDir=${fixtureRepository}; mutationScope=isolated fixture only; cleanup=after browser assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput, 90_000);

  browser = await chromium.launch({ headless: true, ...(installedChrome ? { executablePath: installedChrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await login(context, baseUrl);

  const fullReview = await context.newPage();
  monitor(fullReview);
  await fullReview.goto(`${baseUrl}/numbering/recognition/${encodeURIComponent(work.sessionId)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const fullBanner = fullReview.locator(".drawing-recognition-adapter-health.is-unavailable");
  await fullBanner.waitFor({ state: "visible", timeout: 30_000 });
  check("full review exposes native recovery action", await fullBanner.getByRole("button", { name: "重新辨識", exact: true }).isEnabled());
  check("full review keeps a single recovery entry point", await fullReview.getByRole("button", { name: "重新辨識", exact: true }).count() === 1);
  await fullReview.screenshot({ path: path.join(screenshotDir, "01-full-review-unavailable.png"), fullPage: false });
  await fullReview.close();

  const ownerReview = await context.newPage();
  monitor(ownerReview);
  await ownerReview.goto(`${baseUrl}/numbering/recognition/${encodeURIComponent(legacyOwnerSession.id)}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const fullOwnerErrors = ownerReview.locator('.drawing-recognition-candidate[data-owner-required="true"]');
  await fullOwnerErrors.first().waitFor({ state: "visible", timeout: 30_000 });
  check("full review marks every unresolved owner on the affected field", await fullOwnerErrors.count() === legacyOwnerSession.unresolvedOwnerCount, `expected=${legacyOwnerSession.unresolvedOwnerCount}`);
  check("full review exposes red inline owner messages", await ownerReview.locator(".drawing-recognition-field-error").count() === legacyOwnerSession.unresolvedOwnerCount);
  check("full review identifies the invalid owner input accessibly", await ownerReview.locator('input[aria-invalid="true"]').count() === legacyOwnerSession.unresolvedOwnerCount);
  check("full review removes the false rerun recovery banner", await ownerReview.locator('[data-part-owner-recovery="true"]').count() === 0);
  await ownerReview.screenshot({ path: path.join(screenshotDir, "02-full-review-inline-owner-errors.png"), fullPage: false });
  await ownerReview.close();

  const page = await context.newPage();
  monitor(page);
  const workspaceUrl = `${baseUrl}/numbering/drawings/${encodeURIComponent(work.drawing_id)}/workspace?workId=${encodeURIComponent(work.work_id)}&returnTo=${encodeURIComponent("/numbering/drawings")}`;
  await page.goto(workspaceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator('[data-dev079-recognition="embedded"]').waitFor({ state: "visible", timeout: 30_000 });
  const embeddedOwnerErrors = page.locator('.dev079-recognition-candidate[data-owner-required="true"]');
  await embeddedOwnerErrors.first().waitFor({ state: "visible", timeout: 30_000 });
  check("embedded workspace marks every unresolved owner on the affected field", await embeddedOwnerErrors.count() === legacyOwnerSession.unresolvedOwnerCount, `expected=${legacyOwnerSession.unresolvedOwnerCount}`);
  check("embedded workspace exposes red inline owner messages", await page.locator(".dev079-recognition-field-error").count() === legacyOwnerSession.unresolvedOwnerCount);
  check("embedded owner values are read-only and accessibly invalid", await page.locator('.dev079-recognition-candidate[data-owner-required="true"] input[readonly][aria-invalid="true"]').count() === legacyOwnerSession.unresolvedOwnerCount);
  check("embedded workspace removes the false rerun recovery banner", await page.locator('[data-part-owner-recovery="true"]').count() === 0 && await page.getByRole("button", { name: "請先重新辨識", exact: true }).count() === 0);
  const saveAll = page.locator(".dev079-recognition-save-all");
  check("unresolved owner rows do not disable valid batch decisions", await saveAll.count() === 0 || await saveAll.isEnabled());
  check("desktop inline validation has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.screenshot({ path: path.join(screenshotDir, "03-embedded-inline-owner-errors-desktop.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileError = embeddedOwnerErrors.first().locator(".dev079-recognition-field-error");
  await mobileError.scrollIntoViewIfNeeded();
  const errorBox = await mobileError.boundingBox();
  check("mobile inline owner error is reachable", Boolean(errorBox && errorBox.y >= 0 && errorBox.y + errorBox.height <= 844), JSON.stringify(errorBox));
  check("mobile inline validation has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.screenshot({ path: path.join(screenshotDir, "04-embedded-inline-owner-errors-mobile.png"), fullPage: false });

  const verification = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  check("isolated fixture remains foreign-key clean", verification.pragma("foreign_key_check").length === 0, JSON.stringify(verification.pragma("foreign_key_check")));
  verification.close();
  check("browser has no unexpected console, page, network, or HTTP failures", browserFailures.length === 0, JSON.stringify(browserFailures));
  await context.close();
} catch (error) {
  checks.push({ name: "browser execution", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  try {
    if (nextEnvBefore === null) fs.rmSync(nextEnvPath, { force: true });
    else fs.writeFileSync(nextEnvPath, nextEnvBefore, "utf8");
    checks.push({ name: "Next type entry restored", pass: nextEnvBefore === null ? !fs.existsSync(nextEnvPath) : fs.readFileSync(nextEnvPath, "utf8") === nextEnvBefore, detail: nextEnvPath });
  } catch (error) {
    checks.push({ name: "Next type entry restored", pass: false, detail: error instanceof Error ? error.message : String(error) });
  }
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: released, detail: `port=${port}` });
  }
  const runtimeCleanup = runtimeDistDir ? removeTaskOwnedWorkspaceTempDir(root, runtimeDistDir) : { removed: true, path: null, error: null };
  checks.push({ name: "temporary runtime dist removed", pass: runtimeCleanup.removed, detail: JSON.stringify(runtimeCleanup) });
  try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch {}
  checks.push({ name: "temporary fixture removed", pass: !fs.existsSync(tempRoot), detail: tempRoot });
  if (sourceBefore) {
    try {
      const sourceAfter = sourceInvariant();
      checks.push({ name: "primary SQLite invariant unchanged", pass: sourceAfter.hash === sourceBefore.hash, detail: `${sourceBefore.hash} -> ${sourceAfter.hash}` });
    } catch (error) {
      checks.push({ name: "primary SQLite invariant unchanged", pass: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
}

const failed = checks.filter((item) => !item.pass);
const manifest = {
  runId,
  status: failed.length > 0 ? "FAIL" : "PASS",
  port,
  outputDir,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  browserFailures
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length > 0) process.exitCode = 1;
