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
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const nextEnvPath = path.join(root, "next-env.d.ts");
const nextEnvSnapshot = fs.readFileSync(nextEnvPath, "utf8");
const runId = `DEV082-canonical-location-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-082-canonical-location", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev082-location-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const fixtureRepository = path.join(fixtureDataDir, "repository");
const checks = [];
const browserFailures = [];
let app = null;
let browser = null;
let port = null;
let baseUrl = "";
let runtimeDistDir = null;
let primaryBefore = null;
let primaryAfter = null;

function record(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
  return Boolean(pass);
}

function requireCheck(name, pass, detail = "") {
  if (!record(name, pass, detail)) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function primarySnapshot() {
  const database = new Database(sourceDb, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  const masterTables = ["part_roots", "part_numbers", "drawing_numbers"];
  const counts = Object.fromEntries(masterTables.map((table) => [
    table,
    Number(database.prepare(`SELECT COUNT(*) FROM "${table}"`).pluck().get())
  ]));
  const identities = Object.fromEntries(masterTables.map((table) => [
    table,
    database.prepare(`SELECT * FROM "${table}" ORDER BY id`).all()
  ]));
  const rootReferenceProblems = database.prepare(`
    SELECT 'part_numbers' AS source, number.id, number.part_root_id
    FROM part_numbers number
    LEFT JOIN part_roots root ON root.id = number.part_root_id
    WHERE number.part_root_id IS NULL OR root.id IS NULL
    UNION ALL
    SELECT 'drawing_numbers' AS source, number.id, number.part_root_id
    FROM drawing_numbers number
    LEFT JOIN part_roots root ON root.id = number.part_root_id
    WHERE number.part_root_id IS NULL OR root.id IS NULL
    UNION ALL
    SELECT 'drawings' AS source, drawing.id, drawing.part_root_id
    FROM drawings drawing
    LEFT JOIN part_roots root ON root.id = drawing.part_root_id
    WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL
  `).all();
  const residue = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND (name LIKE '%_migration%' OR name LIKE '%quarantine%')
    ORDER BY name
  `).all();
  const foreignKeys = database.pragma("foreign_key_check");
  const schema = database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name").all();
  database.close();
  return {
    counts,
    identityHash: hash(identities),
    schemaHash: hash(schema),
    residue,
    rootReferenceProblems,
    foreignKeys
  };
}

function monitor(page) {
  page.on("console", (message) => {
    if (message.type() === "error") browserFailures.push({ kind: "console", message: message.text() });
  });
  page.on("pageerror", (error) => browserFailures.push({ kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    const message = request.failure()?.errorText;
    if (message && message !== "net::ERR_ABORTED") browserFailures.push({ kind: "requestfailed", url: request.url(), message });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) browserFailures.push({ kind: "http", url: response.url(), status: response.status() });
  });
}

async function login(context) {
  const page = await context.newPage();
  monitor(page);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  requireCheck("rendered login succeeds", !page.url().endsWith("/login"), page.url());
  await page.close();
}

function percentValues(style) {
  return Object.fromEntries(Object.entries(style).map(([key, value]) => [key, Number.parseFloat(String(value))]));
}

function isContained(inner, outer, tolerance = 1.5) {
  return inner && outer
    && inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance;
}

async function restoreTextFileWithRetry(filePath, content) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.writeFileSync(filePath, content, "utf8");
      if (fs.readFileSync(filePath, "utf8") === content) return;
      lastError = new Error(`restored content mismatch: ${filePath}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw lastError ?? new Error(`unable to restore file: ${filePath}`);
}

async function locatePdfEvidence(page, fixture, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${baseUrl}${fixture.workUrl}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "A0006-M01", exact: true }).waitFor({ state: "visible", timeout: 30_000 });

  const previewTabs = page.locator('.drawing-preview-tabs [role="tab"]');
  await previewTabs.nth(1).waitFor({ state: "visible", timeout: 30_000 });
  requireCheck(`${viewport.name}: one shared preview surface`, await page.locator('[data-component="canonical-preview-panel"]').count() === 1);
  requireCheck(`${viewport.name}: preview keeps exactly 3D and 2D tabs`, await previewTabs.count() === 2, JSON.stringify(await previewTabs.allTextContents()));
  requireCheck(`${viewport.name}: no PDF-only third tab`, (await previewTabs.allTextContents()).every((label) => !/^PDF/iu.test(label.trim())), JSON.stringify(await previewTabs.allTextContents()));

  await page.getByRole("tab", { name: /3D 模型/u }).click();
  requireCheck(`${viewport.name}: original preview starts on 3D`, await page.getByRole("tab", { name: /3D 模型/u }).getAttribute("aria-selected") === "true");
  await page.getByRole("tab", { name: "智慧辨識", exact: true }).click();
  await page.locator('[data-dev079-recognition="embedded"]').waitFor({ state: "visible", timeout: 30_000 });
  if (viewport.name === "desktop-1440x900") {
    const exceptionLabel = page.locator('[data-recognition-field-key="part_number"] .dev079-recognition-field-signals .is-exception').first();
    await exceptionLabel.waitFor({ state: "visible", timeout: 30_000 });
    const exceptionSemantics = await exceptionLabel.evaluate((element) => ({
      tagName: element.tagName,
      insideButton: Boolean(element.closest("button")),
      triggerTabIndex: element.closest("button")?.tabIndex ?? -1
    }));
    requireCheck("part-number exception status has an accessible trigger", exceptionSemantics.tagName === "SMALL" && exceptionSemantics.insideButton && exceptionSemantics.triggerTabIndex === 0, JSON.stringify(exceptionSemantics));
    await exceptionLabel.hover();
    const exceptionTooltip = page.getByRole("tooltip");
    await exceptionTooltip.waitFor({ state: "visible", timeout: 5_000 });
    const exceptionHelp = await exceptionTooltip.textContent() ?? "";
    requireCheck("part-number hover tooltip distinguishes ownership from OCR accuracy", exceptionHelp.includes("尚未連結正式料號主檔") && exceptionHelp.includes("不代表 OCR 辨識錯誤"), exceptionHelp);
    await page.screenshot({ path: path.join(outputDir, "desktop-1440x900-exception-tooltip.png"), fullPage: true });
    await page.mouse.move(8, 8);
    await exceptionTooltip.waitFor({ state: "hidden", timeout: 5_000 });
    const exceptionTrigger = exceptionLabel.locator("xpath=ancestor::button");
    await exceptionTrigger.focus();
    await exceptionTooltip.waitFor({ state: "visible", timeout: 5_000 });
    requireCheck("part-number tooltip also opens from keyboard focus", await exceptionTrigger.getAttribute("aria-describedby") === await exceptionTooltip.getAttribute("id"));
    await page.keyboard.press("Escape");
    await exceptionTooltip.waitFor({ state: "hidden", timeout: 5_000 });
  }
  const pdfButton = page.getByRole("button", { name: "PDF圖面", exact: true }).first();
  await pdfButton.waitFor({ state: "visible", timeout: 30_000 });
  const sourceId = await pdfButton.getAttribute("data-evidence-source-id");
  requireCheck(`${viewport.name}: PDF evidence retains exact source id`, sourceId === fixture.pdfSourceId, String(sourceId));

  const contentPath = `/api/numbering/recognition-sessions/${encodeURIComponent(fixture.sessionId)}/sources/${encodeURIComponent(fixture.pdfSourceId)}/content`;
  const contentResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === contentPath, { timeout: 45_000 });
  await pdfButton.click();
  const contentResponse = await contentResponsePromise;
  requireCheck(`${viewport.name}: exact recognition PDF endpoint returns 200`, contentResponse.status() === 200, `${contentResponse.status()} ${contentResponse.url()}`);
  requireCheck(`${viewport.name}: evidence endpoint returns PDF`, (contentResponse.headers()["content-type"] ?? "").includes("application/pdf"), contentResponse.headers()["content-type"] ?? "");
  requireCheck(`${viewport.name}: evidence reuses 2D tab`, await page.getByRole("tab", { name: /2D 圖面/u }).getAttribute("aria-selected") === "true");

  const stage = page.locator('[data-pdf-page-state="ready"]');
  await stage.waitFor({ state: "visible", timeout: 60_000 });
  const marker = stage.locator('[data-evidence-marker="highlighter"]');
  const magnifier = stage.locator('[data-magnifier-state="ready"]');
  await marker.waitFor({ state: "visible", timeout: 30_000 });
  await magnifier.waitFor({ state: "visible", timeout: 60_000 });
  requireCheck(`${viewport.name}: exact PDF page rendered`, await stage.locator('.drawing-preview-pdf-page[data-pdf-page-number="1"]').count() === 1);
  requireCheck(`${viewport.name}: one highlighter and one magnifier`, await marker.count() === 1 && await magnifier.count() === 1);
  requireCheck(`${viewport.name}: magnifier uses high-resolution PDF crop`, await magnifier.getAttribute("data-resolution-mode") === "pdf_high_res_crop", await magnifier.getAttribute("data-resolution-mode") ?? "");

  const markerStyle = percentValues(await marker.evaluate((element) => ({
    left: element.style.left,
    top: element.style.top,
    width: element.style.width,
    height: element.style.height
  })));
  const matchedGeometry = fixture.pdfGeometries.find((geometry) =>
    Math.abs(markerStyle.left - geometry.x * 100) < 0.02
    && Math.abs(markerStyle.top - geometry.y * 100) < 0.02
    && Math.abs(markerStyle.width - Math.max(0.5, geometry.width * 100)) < 0.02
    && Math.abs(markerStyle.height - Math.max(0.5, geometry.height * 100)) < 0.02
  );
  requireCheck(`${viewport.name}: marker matches persisted normalized-page geometry`, Boolean(matchedGeometry), JSON.stringify(markerStyle));

  const pageBox = await stage.locator(".drawing-preview-pdf-page").boundingBox();
  const markerBox = await marker.boundingBox();
  const magnifierBox = await magnifier.boundingBox();
  requireCheck(`${viewport.name}: highlighter remains inside PDF page`, isContained(markerBox, pageBox), JSON.stringify({ markerBox, pageBox }));
  requireCheck(`${viewport.name}: magnifier remains inside PDF page`, isContained(magnifierBox, pageBox), JSON.stringify({ magnifierBox, pageBox }));
  await page.screenshot({ path: path.join(outputDir, `${viewport.name}-located.png`), fullPage: true });

  return { contentPath };
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  primaryBefore = primarySnapshot();
  requireCheck("primary master counts are populated", Object.values(primaryBefore.counts).every((count) => count > 0), JSON.stringify(primaryBefore.counts));
  requireCheck("primary root references are valid before fixture copy", primaryBefore.rootReferenceProblems.length === 0, JSON.stringify(primaryBefore.rootReferenceProblems));
  requireCheck("primary global foreign keys are valid before fixture copy", primaryBefore.foreignKeys.length === 0, JSON.stringify(primaryBefore.foreignKeys));
  record("primary migration-residue inventory captured before fixture copy", true, JSON.stringify(primaryBefore.residue));

  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });

  const fixtureDatabase = new Database(fixtureDb);
  const canonicalTables = fixtureDatabase.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN ('canonical_workbench_states', 'drawing_revision_works', 'drawing_recognition_sessions')
    ORDER BY name
  `).all().map((row) => row.name);
  requireCheck("isolated copy already has canonical schema", canonicalTables.length === 3, JSON.stringify(canonicalTables));
  fixtureDatabase.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1").run();
  const work = fixtureDatabase.prepare(`
    SELECT work.id, state.revision_id, drawing.id AS drawing_id, drawing.drawing_number
    FROM drawing_revision_works work
    JOIN drawings drawing ON drawing.id = work.drawing_id
    JOIN canonical_workbench_states state ON state.work_id = work.id AND state.entity_type = 'drawing'
    WHERE drawing.drawing_number = 'A0006-M01'
    ORDER BY work.created_at DESC
    LIMIT 1
  `).get();
  requireCheck("A0006 canonical work fixture exists", Boolean(work?.id && work?.revision_id), JSON.stringify(work));
  const session = fixtureDatabase.prepare(`
    SELECT id FROM drawing_recognition_sessions
    WHERE drawing_revision_id = ? AND source_context_type = 'drawing_revision'
      AND source_context_id = ? AND status = 'review_ready'
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(work.revision_id, work.revision_id);
  requireCheck("A0006 current-context review-ready session exists", Boolean(session?.id), JSON.stringify(session));
  const pdfSource = fixtureDatabase.prepare(`
    SELECT id, file_name FROM drawing_recognition_sources
    WHERE session_id = ? AND source_role = 'pdf'
    ORDER BY sort_order, id
    LIMIT 1
  `).get(session.id);
  requireCheck("A0006 recognition session retains PDF source", Boolean(pdfSource?.id), JSON.stringify(pdfSource));
  const pdfGeometries = fixtureDatabase.prepare(`
    SELECT geometry_json FROM drawing_recognition_observations
    WHERE session_id = ? AND source_id = ? AND page_number = 1 AND geometry_json IS NOT NULL
    ORDER BY captured_at, id
  `).all(session.id, pdfSource.id).map((row) => JSON.parse(row.geometry_json)).filter((geometry) =>
    geometry?.coordinateSpace === "normalized_page" && geometry?.origin === "top_left"
  );
  requireCheck("A0006 PDF source retains normalized-page evidence", pdfGeometries.length > 0, String(pdfGeometries.length));
  fixtureDatabase.close();

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  runtimeDistDir = path.join(root, ".tmp", `qc-dev082-canonical-location-${port}`);
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
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: path.relative(root, runtimeDistDir),
    PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_DRAWING_RECOGNITION_V1: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true"
  });
  console.log(`QC DEV-082 canonical-location runtime: project=${root}; purpose=canonical recognition evidence positioning; port=${port}; owner=current QC process tree; cleanup=after assertions; PDM_DATA_DIR=${fixtureDataDir}; PDM_REPOSITORY_DIR=${fixtureRepository}; mutationScope=${tempRoot}`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context);
  const page = await context.newPage();
  monitor(page);
  let recognitionPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/numbering/recognition-sessions")) recognitionPosts += 1;
  });
  const fixture = {
    sessionId: session.id,
    pdfSourceId: pdfSource.id,
    pdfGeometries,
    workUrl: `/numbering/drawings/${encodeURIComponent(work.drawing_id)}/workspace?workId=${encodeURIComponent(work.id)}`
  };

  await locatePdfEvidence(page, fixture, { name: "desktop-1440x900", width: 1440, height: 900 });
  const cadButton = page.getByRole("button", { name: "檔案屬性", exact: true }).first();
  await cadButton.waitFor({ state: "visible", timeout: 30_000 });
  await cadButton.click();
  const cadNotice = page.locator(".dev079-evidence-flash");
  await cadNotice.waitFor({ state: "visible", timeout: 10_000 });
  requireCheck("CAD evidence truthfully reports no drawing coordinates", /檔案屬性證據.*沒有圖面座標/u.test(await cadNotice.textContent() ?? ""), await cadNotice.textContent() ?? "");
  requireCheck("CAD evidence removes PDF-only marker", await page.locator('[data-evidence-marker="highlighter"]').count() === 0);
  requireCheck("CAD evidence restores original 3D preview", await page.getByRole("tab", { name: /3D 模型/u }).getAttribute("aria-selected") === "true");

  const secondPdfButton = page.getByRole("button", { name: "PDF圖面", exact: true }).first();
  const secondContent = page.waitForResponse((response) => new URL(response.url()).pathname.includes(`/recognition-sessions/${session.id}/sources/${pdfSource.id}/content`), { timeout: 45_000 });
  await secondPdfButton.click();
  await secondContent;
  await page.locator('[data-pdf-page-state="ready"] [data-evidence-marker="highlighter"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("tab", { name: "版次與檔案", exact: true }).click();
  requireCheck("leaving recognition removes evidence marker", await page.locator('[data-evidence-marker="highlighter"]').count() === 0);
  requireCheck("leaving recognition restores original 3D preview", await page.getByRole("tab", { name: /3D 模型/u }).getAttribute("aria-selected") === "true");

  await locatePdfEvidence(page, fixture, { name: "tablet-1024x768", width: 1024, height: 768 });
  await locatePdfEvidence(page, fixture, { name: "phone-390x844", width: 390, height: 844 });
  requireCheck("existing current-context session is reused without recognition POST", recognitionPosts === 0, String(recognitionPosts));
  requireCheck("browser run has no console, page, request, or HTTP failures", browserFailures.length === 0, JSON.stringify(browserFailures));
  await context.close();
} catch (error) {
  record("canonical location browser execution", false, error instanceof Error ? error.message : String(error));
} finally {
  try { await browser?.close(); } catch {}
  if (app?.child) {
    try {
      await stopNextApp(app.child);
      record(
        "temporary runtime process tree stopped",
        app.child.exitCode !== null || app.child.signalCode !== null,
        `pid=${app.child.pid}; exitCode=${app.child.exitCode}; signalCode=${app.child.signalCode}`
      );
    } catch (error) {
      record("temporary runtime process tree stopped", false, error instanceof Error ? error.message : String(error));
    }
  }
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    record("temporary runtime port released", released, `port=${port}`);
  }
  const runtimeCleanup = runtimeDistDir
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeDistDir)
    : { removed: true, path: null, error: null };
  record("temporary runtime dist removed", runtimeCleanup.removed, JSON.stringify(runtimeCleanup));
  try {
    await restoreTextFileWithRetry(nextEnvPath, nextEnvSnapshot);
    record("Next generated declarations restored", true, nextEnvPath);
  } catch (error) {
    record("Next generated declarations restored", false, error instanceof Error ? error.message : String(error));
  }
  try {
    const resolvedTempRoot = path.resolve(tempRoot);
    if (!resolvedTempRoot.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) throw new Error(`unsafe temp path: ${resolvedTempRoot}`);
    fs.rmSync(resolvedTempRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    record("isolated data and repository removed", !fs.existsSync(resolvedTempRoot), resolvedTempRoot);
  } catch (error) {
    record("isolated data and repository removed", false, error instanceof Error ? error.message : String(error));
  }
  try {
    primaryAfter = primarySnapshot();
    record("primary canonical identities unchanged", primaryBefore?.identityHash === primaryAfter.identityHash, JSON.stringify({ before: primaryBefore?.identityHash, after: primaryAfter.identityHash }));
    record("primary master counts unchanged", JSON.stringify(primaryBefore?.counts) === JSON.stringify(primaryAfter.counts), JSON.stringify({ before: primaryBefore?.counts, after: primaryAfter.counts }));
    record("primary schema unchanged", primaryBefore?.schemaHash === primaryAfter.schemaHash, JSON.stringify({ before: primaryBefore?.schemaHash, after: primaryAfter.schemaHash }));
    record("primary migration-residue inventory unchanged", JSON.stringify(primaryBefore?.residue) === JSON.stringify(primaryAfter.residue), JSON.stringify({ before: primaryBefore?.residue, after: primaryAfter.residue }));
    record("primary root references remain valid", primaryAfter.rootReferenceProblems.length === 0, JSON.stringify(primaryAfter.rootReferenceProblems));
    record("primary global foreign keys remain valid", primaryAfter.foreignKeys.length === 0, JSON.stringify(primaryAfter.foreignKeys));
  } catch (error) {
    record("primary post-run invariant snapshot", false, error instanceof Error ? error.message : String(error));
  }
}

const failed = checks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-082-canonical-location",
  runId,
  status: failed.length === 0 ? "PASS" : "FAIL",
  port,
  runtime: {
    project: root,
    purpose: "canonical recognition evidence positioning",
    dataDir: fixtureDataDir,
    repositoryDir: fixtureRepository,
    cleanup: "completed by this QC process"
  },
  primaryBefore,
  primaryAfter,
  checks,
  browserFailures
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length > 0) process.exitCode = 1;
