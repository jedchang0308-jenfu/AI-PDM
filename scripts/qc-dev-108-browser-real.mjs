#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { PartChangeWorkService } from "../src/lib/part-change-work.ts";
import { issueCanonicalWorkbenchContract } from "../src/lib/pdm-workbench-authority-control.ts";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV108-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev108-browser-"));
const dataDir = path.join(taskRoot, "data");
const fixtureDb = path.join(dataDir, "ai-pdm.sqlite");
const fixtureRepository = path.join(dataDir, "repository");
const output = path.join(root, "output", "qa", "dev-108", "browser-real", runId);
const screenshotDir = path.join(output, "screenshots");
fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(screenshotDir, { recursive: true });
fs.cpSync(path.join(root, "data", "ai-pdm.sqlite"), fixtureDb);
if (fs.existsSync(path.join(root, "data", "repository"))) fs.cpSync(path.join(root, "data", "repository"), fixtureRepository, { recursive: true });
const sourceSnapshot = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${path.join(root, "data", "ai-pdm.sqlite")}`], { cwd: root, encoding: "utf8" });
if (sourceSnapshot.status !== 0) throw new Error(`DEV108_PRIMARY_SNAPSHOT_FAILED:${sourceSnapshot.stderr || sourceSnapshot.stdout}`);
const primaryBefore = sourceSnapshot.stdout.trim();
const nextEnvPath = path.join(root, "next-env.d.ts");
const nextEnvBefore = fs.existsSync(nextEnvPath) ? fs.readFileSync(nextEnvPath, "utf8") : null;
let app = null; let browser = null; let port = null; let sourcePartId = ""; let sourceWorkId = ""; let siblingPartId = "";

function prepareFixture() {
  const db = new Database(fixtureDb);
  try {
    const source = db.prepare("SELECT p.id,p.part_root_id,p.part_number,p.company_id,p.created_by,r.root_code FROM part_numbers p JOIN part_roots r ON r.id=p.part_root_id WHERE p.part_number='A0001-P01' LIMIT 1").get();
    assert.ok(source, "A0001 source part exists"); sourcePartId = source.id;
    const existingSibling = db.prepare("SELECT id FROM part_numbers WHERE part_number='A0001-P02'").get();
    if (existingSibling) siblingPartId = existingSibling.id;
    else {
      siblingPartId = "dev108-browser-a0001-p02";
      db.prepare("INSERT INTO part_numbers (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,record_status,created_by) SELECT ?,company_id,part_root_id,'A0001-P02',2,'P02','同根差異料號',item_kind,'Released',created_by FROM part_numbers WHERE id=?").run(siblingPartId, sourcePartId);
      db.prepare("INSERT INTO canonical_workbench_states (id,company_id,entity_type,canonical_entity_id,data_layer) SELECT ?,company_id,'part',?,'part_formal' FROM part_numbers WHERE id=?").run("dev108-state-a0001-p02", siblingPartId, siblingPartId);
    }
    db.prepare("UPDATE part_numbers SET record_status='Released' WHERE id=?").run(sourcePartId);
    db.prepare("UPDATE canonical_workbench_states SET row_version=1 WHERE canonical_entity_id=? AND entity_type='part' AND data_layer='part_formal'").run(sourcePartId);
    const heatDefinition = db.prepare("SELECT id FROM pdm_attribute_definitions WHERE company_id=? AND stable_key='heat_treatment' AND status='active' LIMIT 1").get(source.company_id);
    const formalizationEvent = db.prepare("SELECT id FROM drawing_recognition_formalization_events WHERE company_id=? LIMIT 1").get(source.company_id);
    if (heatDefinition && formalizationEvent) {
      const upsertHeat = db.prepare(`INSERT OR IGNORE INTO pdm_part_attribute_values
        (id, company_id, part_number_id, attribute_definition_id, applicability_state, value_text, last_formalization_event_id, created_by, updated_by)
        VALUES (?, ?, ?, ?, 'value', ?, ?, ?, ?)`);
      upsertHeat.run("dev108-heat-a0001-p01", source.company_id, sourcePartId, heatDefinition.id, "無", formalizationEvent.id, source.created_by, source.created_by);
      upsertHeat.run("dev108-heat-a0001-p02", source.company_id, siblingPartId, heatDefinition.id, "氮化", formalizationEvent.id, source.created_by, source.created_by);
    }
  } finally { db.close(); }
}

async function createSourceWork() {
  process.env.PDM_DATA_DIR = dataDir; process.env.PDM_REPOSITORY_DIR = fixtureRepository; process.env.PDM_DB_PROVIDER = "sqlite"; process.env.PDM_BUILD_COMMIT = "local-dev";
  const db = new Database(fixtureDb); const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
  try {
    const actor = { id: "user-admin-local-quick", companyId: "company-jenfu", canEditNonOwned: true, permissions: { create: true, update: true, submit: true, cancel: true, decide: true, obsolete: true, manageAttachments: true } };
    const token = await issueCanonicalWorkbenchContract(client, { companyId: actor.companyId, actorId: actor.id });
    const work = await new PartChangeWorkService(client).create(sourcePartId, actor, { idempotencyKey: `dev108-browser-${runId}`, contractToken: token, expectedRowVersion: 1 });
    sourceWorkId = work.workId;
  } finally { await client.close(); db.close(); }
}

async function login(context) {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  await page.close();
}

try {
  prepareFixture(); await createSourceWork();
  port = await getFreePort();
  const distDir = `.tmp/qc-dev108-browser-${port}`;
  Object.assign(process.env, { NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_NEXT_DIST_DIR: distDir, PDM_PUBLIC_BASE_URL: `http://127.0.0.1:${port}` });
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-108 real browser matrix and autosave gate", port, owningProcessTree: "this runner -> task-owned next dev child", cleanupCondition: "after screenshots and assertions; stop only app child and remove task temp", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: fixtureRepository, mutationScope: taskRoot } }));
  app = startNextApp(root, "dev", port);
  const baseUrl = `http://127.0.0.1:${port}`; await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  const route = `/parts/${encodeURIComponent(sourcePartId)}/workspace?workId=${encodeURIComponent(sourceWorkId)}`;
  const viewports = [{ name: "desktop", width: 1536, height: 1024 }, { name: "laptop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "mobile", width: 390, height: 844 }];
  const checks = [];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    await login(context);
    const page = await context.newPage();
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator("table.part-number-matrix").waitFor({ state: "visible", timeout: 30_000 });
    const geometry = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, cells: document.querySelectorAll(".part-number-matrix-cell").length, directEditors: document.querySelectorAll(".part-number-matrix-cell.is-editable > input, .part-number-matrix-cell.is-editable > select, .part-number-matrix-cell.is-editable > textarea").length, displayButtons: document.querySelectorAll(".part-number-matrix-display").length, confirmedHeatRows: document.querySelectorAll('tr[data-confirmed-row="heat_treatment"]').length, aggregateRows: [...document.querySelectorAll(".part-number-matrix-row-header")].filter((node) => node.textContent?.includes("其他已確認屬性")).length, alerts: document.querySelectorAll('[role="alert"]').length }));
    assert.ok(geometry.cells >= 18, `${viewport.name}: matrix cells rendered`); assert.ok(geometry.directEditors >= 18, `${viewport.name}: editable cells render direct editors`); assert.equal(geometry.displayButtons, 0, `${viewport.name}: no click-to-edit display layer`); assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, `${viewport.name}: no page overflow`); assert.equal(geometry.alerts, 0, `${viewport.name}: no visible errors`);
    assert.equal(geometry.confirmedHeatRows, 1, `${viewport.name}: heat treatment is an independent row`); assert.equal(geometry.aggregateRows, 0, `${viewport.name}: no aggregate confirmed-attributes row`);
    await page.screenshot({ path: path.join(screenshotDir, `matrix-${viewport.name}.png`), fullPage: true }); checks.push({ viewport, status: "PASS", geometry });
    if (viewport.name === "desktop") {
      const editor = page.locator(`[data-cell="${siblingPartId}:partName"] input`); await editor.fill("同根差異料號-已編輯"); await editor.blur();
      let readback;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await page.waitForTimeout(700);
        readback = await page.evaluate(async ({ id, sourceWork }) => { const response = await fetch(`/api/pdm/parts/${id}/matrix-workspace?workId=${encodeURIComponent(sourceWork)}`, { cache: "no-store" }); return { status: response.status, body: await response.json() }; }, { id: sourcePartId, sourceWork: sourceWorkId });
        const value = readback.body?.data?.columns?.find((column) => column.partId === siblingPartId)?.payload?.partName;
        if (value === "同根差異料號-已編輯") break;
      }
      assert.equal(readback.status, 200); const savedColumn = readback.body.data.columns.find((column) => column.partId === siblingPartId); assert.equal(savedColumn?.payload.partName, "同根差異料號-已編輯", JSON.stringify(readback.body)); checks.push({ id: "B09", status: "PASS", savedPart: siblingPartId });
    }
    await context.close();
  }
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify({ status: "PASS", denominator: 22, route, sourcePartId, sourceWorkId, siblingPartId, checks }, null, 2)}\n`);
  console.log("DEV-108 browser real: PASS (matrix, autosave, 4 viewports)");
} finally {
  await browser?.close();
  if (app?.child) await stopNextApp(app.child);
  if (nextEnvBefore === null) { try { fs.rmSync(nextEnvPath, { force: true }); } catch { /* best effort */ } } else { try { fs.writeFileSync(nextEnvPath, nextEnvBefore, "utf8"); } catch { /* report via git diff if host locks it */ } }
  for (let attempt = 1; attempt <= 12 && fs.existsSync(taskRoot); attempt += 1) {
    try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 }); }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  const sourceAfter = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${path.join(root, "data", "ai-pdm.sqlite")}`], { cwd: root, encoding: "utf8" });
  if (sourceAfter.status === 0 && sourceAfter.stdout.trim() !== primaryBefore) console.error("DEV108 primary snapshot changed unexpectedly");
}
