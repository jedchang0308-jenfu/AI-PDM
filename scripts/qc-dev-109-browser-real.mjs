#!/usr/bin/env node

/* DEV-109 real Chromium evidence against task-owned SQLite data. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createConnection } from "node:net";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import {
  createTaskOwnedNextTsconfig,
  getFreePort,
  removeTaskOwnedWorkspaceTempDir,
  restoreNextEnv,
  snapshotNextEnv,
  startNextApp,
  stopNextApp,
  waitForNextAppReady
} from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV109-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev109-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const evidenceDir = path.resolve(process.env.DEV109_BROWSER_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-109", runId, "browser-real"));
const screenshotDir = path.join(evidenceDir, "screenshots");
const now = "2026-08-31T00:00:00.000Z";
const fixture = {
  companyId: "company-jenfu",
  actorId: "user-engineer-local-quick",
  actorEmail: "engineer@example.com",
  redRootId: "dev109-browser-red-root",
  kitRootId: "dev109-browser-kit-root",
  unknownRootId: "dev109-browser-unknown-root",
  existingRootId: "dev109-browser-existing-root",
  singleRootId: "dev109-browser-single-root",
  visualKitRootId: "dev109-browser-visual-kit-root",
  redPartId: "dev109-browser-red",
  kitPartId: "dev109-browser-kit",
  unknownPartId: "dev109-browser-unknown",
  existingPartId: "dev109-browser-existing",
  singlePartId: "dev109-browser-single",
  visualKitPartId: "dev109-browser-visual-kit"
};
const checks = [];
const screenshots = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const expectedConsoleErrors = [];
const fixtureMutations = [];
const originalEnv = new Map([
  "NODE_ENV", "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_RELEASE_MODE",
  "PDM_ENABLE_LOCAL_QUICK_LOGIN", "PDM_ASSEMBLY_SHARED_BOM_V1", "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1",
  "PDM_BOM_XMIND_EDITOR_V2_ENABLED", "PDM_SALES_KIT_BOM_V1_ENABLED", "PDM_NEXT_DIST_DIR", "PDM_NEXT_TSCONFIG_PATH",
  "PDM_PUBLIC_BASE_URL", "DATABASE_URL", "PDM_POSTGRES_URL"
].map((key) => [key, process.env[key]]));
const nextEnvSnapshot = snapshotNextEnv(root);
let app = null;
let browser = null;
let port = null;
let nextTsconfig = null;
let baseUrl = "";
let expectedAbortedRequests = 0;

function errorText(error) { return error instanceof Error ? error.message : String(error); }
function allowExpectedConsoleError(label, pattern) { expectedConsoleErrors.push({ label, pattern }); }
function insert(db, table, columns, values) {
  const result = db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...values);
  if (result.changes) fixtureMutations.push({ table, id: values[0] });
}
function seedFixture() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  // The fixture writes the canonical drawing aggregate directly. Mark the
  // legacy startup backfill as applied so runtime initialization does not
  // attempt to re-project the same formal drawing into a second row.
  db.prepare("INSERT OR IGNORE INTO pdm_local_data_migrations (version, detail_json) VALUES (?, ?)").run(
    "dev-064-unified-drawing-aggregate-v1",
    JSON.stringify({ source: "DEV-109 browser fixture canonical seed" })
  );
  db.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='dev109-browser', schema_hash='dev109-v1', row_version=row_version+1, switched_at=? WHERE id=1").run(now);

  insert(db, "users", ["id", "display_name", "email", "role", "company_id", "account_status", "system_role_enabled", "created_at", "updated_at"], [fixture.actorId, "DEV-109 Browser Engineer", fixture.actorEmail, "Engineer", fixture.companyId, "active", 1, now, now]);
  insert(db, "user_company_memberships", ["user_id", "company_id", "is_default", "created_at"], [fixture.actorId, fixture.companyId, 1, now]);
  insert(db, "auth_identities", ["id", "user_id", "provider", "provider_subject", "login_identifier", "email_normalized", "verified_at", "status", "created_at", "updated_at"], ["dev109-browser-identity", fixture.actorId, "local_password", fixture.actorEmail, fixture.actorEmail, fixture.actorEmail, now, "active", now, now]);

  for (const [rootId, code, name] of [
    [fixture.redRootId, "D109BR", "RED ASSEMBLY"],
    [fixture.kitRootId, "D109BK", "市售標準品組合包"],
    [fixture.unknownRootId, "D109BU", "UNKNOWN RESULT KIT"],
    [fixture.existingRootId, "D109BE", "EXISTING BOM KIT"],
    [fixture.singleRootId, "D109BS", "SINGLE PART"],
    [fixture.visualKitRootId, "D109BV", "VISUAL SALES KIT"]
  ]) insert(db, "part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "rule_version_id", "created_by", "created_at", "updated_at"], [rootId, fixture.companyId, code, name, "manufactured", "Active", "numbering-rule-v3-alpha-root", fixture.actorId, now, now]);

  for (const [id, rootId, number, name, kind, structure] of [
    [fixture.redPartId, fixture.redRootId, "D109-R01", "RED ASSEMBLY", "manufactured", "assembly"],
    [fixture.kitPartId, fixture.kitRootId, "D109-K01", "市售標準品組合包", "purchased", "assembly"],
    [fixture.unknownPartId, fixture.unknownRootId, "D109-U01", "UNKNOWN RESULT KIT", "purchased", "assembly"],
    [fixture.existingPartId, fixture.existingRootId, "D109-E01", "EXISTING BOM KIT", "purchased", "assembly"],
    [fixture.singlePartId, fixture.singleRootId, "D109-S01", "SINGLE PART", "purchased", "single_part"],
    [fixture.visualKitPartId, fixture.visualKitRootId, "D109-V01", "VISUAL SALES KIT", "purchased", "assembly"]
  ]) insert(db, "part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "bom_usage_policy", "record_status", "rule_version_id", "created_by", "created_at", "updated_at"], [id, fixture.companyId, rootId, number, 1, "01", name, kind, structure, "undecided", "Active", "numbering-rule-v3-alpha-root", fixture.actorId, now, now]);

  const insertAggregate = db.prepare("INSERT OR IGNORE INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id, open_branch_count, row_version, updated_at) VALUES (?, ?, 'part', ?, 0, 1, ?)");
  const insertState = db.prepare("INSERT OR IGNORE INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, work_id, handling, row_version, created_at, updated_at) VALUES (?, ?, 'part', ?, 'part_formal', NULL, NULL, NULL, 'none', 1, ?, ?)");
  for (const partId of [fixture.redPartId, fixture.kitPartId, fixture.unknownPartId, fixture.existingPartId, fixture.singlePartId, fixture.visualKitPartId]) {
    insertAggregate.run(`dev109-browser-aggregate-${partId}`, fixture.companyId, partId, now);
    insertState.run(`dev109-browser-state-${partId}`, fixture.companyId, partId, now, now);
  }

  const drawingNumberId = "dev109-browser-red-drawing-number";
  const drawingId = "dev109-browser-red-drawing";
  const revisionId = "dev109-browser-red-revision";
  const assetId = "dev109-browser-red-asset";
  insert(db, "drawing_numbers", ["id", "company_id", "part_root_id", "drawing_number", "purpose_code", "purpose_description", "sequence_no", "is_primary_manufacturing", "record_status", "created_by", "created_at", "updated_at"], [drawingNumberId, fixture.companyId, fixture.redRootId, "D109-R01-M", "M", "DEV-109 Browser M", 1, 1, "Released", fixture.actorId, now, now]);
  insert(db, "drawing_part_links", ["id", "drawing_number_id", "part_number_id", "link_type", "created_by", "created_at"], ["dev109-browser-red-link", drawingNumberId, fixture.redPartId, "primary_manufacturing", fixture.actorId, now]);
  insert(db, "drawings", ["id", "company_id", "lifecycle_state", "formal_drawing_number_id", "part_root_id", "purpose_code", "purpose_description", "sequence_no", "is_primary_manufacturing", "owner_id", "created_by", "created_at", "updated_at"], [drawingId, fixture.companyId, "released", drawingNumberId, fixture.redRootId, "M", "DEV-109 Browser M", 1, 1, fixture.actorId, fixture.actorId, now, now]);
  // Controlled drawing revisions must receive their immutable file relation
  // while still preparing; the lifecycle transition happens only after the
  // relation is complete (the schema guard rejects late controlled inserts).
  insert(db, "drawing_revisions", ["id", "company_id", "drawing_id", "revision", "lifecycle_state", "created_by", "updated_by", "created_at", "updated_at"], [revisionId, fixture.companyId, drawingId, "A", "preparing", fixture.actorId, fixture.actorId, now, now]);
  insert(db, "file_assets", ["id", "file_name", "file_ext", "linked_entity_type", "linked_entity_id", "document_category", "uploaded_by", "created_at", "updated_at"], [assetId, "D109-R01.SLDASM", "sldasm", "drawing_revision", revisionId, "cad_3d", fixture.actorId, now, now]);
  insert(db, "drawing_revision_files", ["id", "company_id", "drawing_revision_id", "source_file_asset_id", "role", "role_source", "display_name", "is_primary", "created_by", "created_at", "updated_at"], ["dev109-browser-red-file", fixture.companyId, revisionId, assetId, "cad_3d", "system", "D109-R01.SLDASM", 1, fixture.actorId, now, now]);
  db.prepare("UPDATE drawing_revisions SET lifecycle_state='released', released_at=?, updated_by=?, updated_at=? WHERE id=?").run(now, fixture.actorId, now, revisionId);
  insert(db, "canonical_workbench_states", ["id", "company_id", "entity_type", "canonical_entity_id", "data_layer", "revision_id", "handling", "row_version", "created_at", "updated_at"], ["dev109-browser-red-drawing-state", fixture.companyId, "drawing", drawingId, "drawing_production", revisionId, "none", 1, now, now]);

  const foreignKeys = db.pragma("foreign_key_check");
  db.close();
  if (foreignKeys.length) throw new Error(`DEV109_BROWSER_FIXTURE_FK:${JSON.stringify(foreignKeys)}`);
  return { databasePath, primaryWrites: false, inserted: fixtureMutations.length };
}
function seedExistingDraft() {
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  insert(db, "bom_definitions", ["id", "company_id", "part_root_id", "purpose", "row_version", "created_by", "updated_by", "created_at", "updated_at"], ["dev109-browser-existing-definition", fixture.companyId, fixture.existingRootId, "sales_kit", 1, fixture.actorId, fixture.actorId, now, now]);
  insert(db, "bom_definition_parent_bindings", ["id", "company_id", "definition_id", "part_number_id", "bound_from_bom_revision", "created_by", "created_at"], ["dev109-browser-existing-binding", fixture.companyId, "dev109-browser-existing-definition", fixture.existingPartId, "1", fixture.actorId, now]);
  insert(db, "bom_drafts", ["id", "company_id", "definition_id", "owner_part_number_id", "bom_revision", "identity_authority", "draft_name", "status", "source", "is_active", "line_count", "review_attempt", "editor_version", "created_by", "updated_by", "created_at", "updated_at"], ["dev109-browser-existing-draft", fixture.companyId, "dev109-browser-existing-definition", fixture.existingPartId, "1", "canonical_part_number", "DEV-109 existing BOM", "Draft", "manual", 1, 0, 0, 0, fixture.actorId, fixture.actorId, now, now]);
  insert(db, "bom_draft_parent_bindings", ["id", "company_id", "bom_draft_id", "part_number_id", "selection_order", "created_by", "created_at"], ["dev109-browser-existing-draft-parent", fixture.companyId, "dev109-browser-existing-draft", fixture.existingPartId, 0, fixture.actorId, now]);
  const foreignKeys = db.pragma("foreign_key_check");
  db.close();
  if (foreignKeys.length) throw new Error(`DEV109_BROWSER_EXISTING_FK:${JSON.stringify(foreignKeys)}`);
}
function setFixturePartStatus(partNumberId, recordStatus) {
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.prepare("UPDATE part_numbers SET record_status=?, updated_at=? WHERE id=?").run(recordStatus, now, partNumberId);
  db.close();
  fixtureMutations.push({ table: "part_numbers", id: partNumberId, operation: `temporary status=${recordStatus} for visual action case` });
}
function attachMonitor(page, label) {
  page.on("console", (event) => {
    if (event.type() !== "error") return;
    const expectedIndex = expectedConsoleErrors.findIndex((item) => item.label === label && item.pattern.test(event.text()));
    if (expectedIndex >= 0) { expectedConsoleErrors.splice(expectedIndex, 1); return; }
    consoleErrors.push({ label, message: event.text() });
  });
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (failure?.errorText && !failure.errorText.includes("ABORTED")) failedRequests.push({ label, url: request.url(), error: failure.errorText });
  });
}
async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/auth/local-quick-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "Engineer" }) });
    return { status: result.status, body: await result.json().catch(() => ({})) };
  });
  assert.equal(response.status, 200, `quick login failed: ${JSON.stringify(response.body)}`);
}
async function openPage(route, viewport, label, expectedConsolePatterns = []) {
  for (const pattern of expectedConsolePatterns) allowExpectedConsoleError(label, pattern);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  attachMonitor(page, label);
  await login(page);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { context, page };
}
async function waitCreate(page) {
  await page.getByRole("heading", { name: "建立 BOM", exact: true }).waitFor({ state: "visible", timeout: 30000 });
  await page.locator('input[placeholder="搜尋料號或品名"]').waitFor({ state: "visible", timeout: 30000 }).catch(() => undefined);
}
async function waitCandidate(page, number) {
  await page.getByText(number, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
}
async function capture(page, name) {
  const file = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(file);
}
async function noOverflow(page) {
  return await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
}
async function layoutMetrics(page) {
  return await page.locator('[data-ui="bom-create-page"]').evaluate((root) => {
    const input = root.querySelector('input[placeholder="搜尋料號或品名"]');
    const searchLabel = input?.closest("label");
    const searchCaption = searchLabel?.querySelector(":scope > span");
    const list = root.querySelector('[role="radiogroup"]');
    const footer = root.querySelector("footer");
    const rect = (element) => element ? (() => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom }; })() : null;
    return { input: rect(input), searchLabel: rect(searchLabel), searchCaption: rect(searchCaption), list: rect(list), footer: rect(footer), viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
  });
}
async function runCase(id, label, fn) {
  try {
    const evidence = await fn();
    checks.push({ id, label, status: "PASS", evidence });
    console.log(`PASS ${id} ${label}`);
  } catch (error) {
    checks.push({ id, label, status: "FAIL", error: errorText(error) });
    console.error(`FAIL ${id} ${label}: ${errorText(error)}`);
  }
}
async function portReleased(checkPort) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const released = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port: checkPort });
      socket.once("connect", () => { socket.destroy(); resolve(false); });
      socket.once("error", () => resolve(true));
      socket.setTimeout(1000, () => { socket.destroy(); resolve(true); });
    });
    if (released) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}
async function startServer() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    process.env.PDM_NEXT_DIST_DIR = `.tmp/qc-dev109-browser-${port}`;
    nextTsconfig = createTaskOwnedNextTsconfig(root, `dev109-${port}`, process.env.PDM_NEXT_DIST_DIR);
    process.env.PDM_NEXT_TSCONFIG_PATH = nextTsconfig.relativePath;
    console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-109 real Chromium create-page flow", port, owningProcessTree: `this runner ${process.pid} -> task-owned Next.js child`, cleanupCondition: "browser closed, exact Next.js child stopped, port released, task fixture and dist removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot, productionWrites: false } }));
    app = startNextApp(root, "dev", port);
    try {
      await waitForNextAppReady(baseUrl, app.getOutput, 120000);
      return;
    } catch (error) {
      const output = app?.getOutput?.() ?? "";
      await stopNextApp(app.child).catch(() => undefined);
      app = null;
      removeTaskOwnedWorkspaceTempDir(root, process.env.PDM_NEXT_DIST_DIR);
      const transientNextEnvLock = /next-env\.d\.ts/iu.test(output) && /UNKNOWN|EBUSY|EPERM|EACCES/iu.test(output);
      if (!transientNextEnvLock || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
}

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  const fixtureLedger = seedFixture();
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "legacy",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_RELEASE_MODE: "local_stub",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_ASSEMBLY_SHARED_BOM_V1: "true",
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
    PDM_BOM_XMIND_EDITOR_V2_ENABLED: "true",
    PDM_SALES_KIT_BOM_V1_ENABLED: "true",
    DATABASE_URL: "",
    PDM_POSTGRES_URL: ""
  });
  await startServer();
  browser = await chromium.launch({ headless: true });

  await runCase("QA-109-030", "workbench header canonical entry", async () => {
    const { context, page } = await openPage("/bom/workbench", { width: 1440, height: 900 }, "030-header");
    try {
      await page.getByRole("heading", { name: "BOM 工作台", exact: false }).waitFor({ state: "visible" });
      const links = page.getByRole("link", { name: "建立 BOM", exact: true });
      assert.ok(await links.count() >= 1);
      await links.first().click();
      await page.waitForURL((url) => url.pathname === "/bom/create");
      await waitCreate(page);
      await capture(page, "030-header-create");
      return { links: await links.count(), path: new URL(page.url()).pathname };
    } finally { await context.close(); }
  });

  await runCase("QA-109-031", "true empty state canonical entry", async () => {
    const { context, page } = await openPage("/bom/workbench", { width: 1024, height: 768 }, "031-empty");
    try {
      await page.getByText("目前沒有符合條件的 BOM", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      const emptyLink = page.getByRole("link", { name: "建立 BOM", exact: true }).last();
      await emptyLink.click();
      await page.waitForURL((url) => url.pathname === "/bom/create");
      return { emptyState: true, path: new URL(page.url()).pathname };
    } finally { await context.close(); }
  });

  await runCase("QA-109-032", "Part context routes to exact create page", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.kitPartId}&returnTo=/parts`, { width: 1440, height: 900 }, "032-exact");
    try {
      await page.getByRole("heading", { name: "D109-K01", exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await page.getByText("市售標準品組合包", { exact: true }).waitFor({ state: "visible" });
      assert.equal(new URL(page.url()).searchParams.get("partNumberId"), fixture.kitPartId);
      return { selectedParent: "D109-K01", exactId: fixture.kitPartId };
    } finally { await context.close(); }
  });

  await runCase("QA-109-033", "suggested and search modes share list", async () => {
    const { context, page } = await openPage("/bom/create", { width: 1440, height: 900 }, "033-modes");
    try {
      await waitCreate(page);
      await waitCandidate(page, "D109-K01");
      const input = page.locator('input[placeholder="搜尋料號或品名"]');
      await input.fill("D109-K01");
      await waitCandidate(page, "D109-K01");
      assert.equal(await page.getByRole("radiogroup", { name: "建議料號" }).count(), 1);
      await input.fill("");
      await waitCandidate(page, "D109-R01");
      return { suggested: true, search: true, listCount: await page.getByRole("radiogroup", { name: "建議料號" }).count() };
    } finally { await context.close(); }
  });

  await runCase("QA-109-034", "debounce and stale request cancellation", async () => {
    const { context, page } = await openPage("/bom/create", { width: 1440, height: 900 }, "034-debounce");
    try {
      const requests = [];
      page.on("request", (request) => { if (request.url().includes("/api/bom/create-candidates?query=")) requests.push(request.url()); });
      const input = page.locator('input[placeholder="搜尋料號或品名"]');
      await input.fill("D");
      await input.fill("D1");
      await input.fill("D109-K01");
      await waitCandidate(page, "D109-K01");
      assert.ok(requests.length <= 1, `debounced query requests=${requests.length}`);
      return { queryRequests: requests.length, finalText: "D109-K01" };
    } finally { await context.close(); }
  });

  await runCase("QA-109-035", "select and change Parent URL recovery", async () => {
    const { context, page } = await openPage("/bom/create", { width: 1440, height: 900 }, "035-change");
    try {
      const input = page.locator('input[placeholder="搜尋料號或品名"]');
      await input.fill("D109-R01");
      await page.locator('[data-candidate-action="create"] [role="radio"]').waitFor({ state: "visible", timeout: 30000 });
      await page.locator('[data-candidate-action="create"] [role="radio"]').click();
      await page.getByRole("heading", { name: "D109-R01", exact: true }).waitFor({ state: "visible" });
      await page.waitForURL((url) => url.searchParams.get("partNumberId") === fixture.redPartId, { timeout: 30000 });
      assert.equal(new URL(page.url()).searchParams.get("partNumberId"), fixture.redPartId);
      await page.getByRole("button", { name: "更換", exact: true }).click();
      await input.waitFor({ state: "visible" });
      assert.equal(await input.inputValue(), "D109-R01");
      await page.waitForURL((url) => !url.searchParams.has("partNumberId"), { timeout: 30000 });
      assert.equal(new URL(page.url()).searchParams.get("partNumberId"), null);
      return { restoredQuery: await input.inputValue(), exactCleared: true };
    } finally { await context.close(); }
  });

  await runCase("QA-109-036", "single and dual purpose presentation", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.redPartId}`, { width: 1440, height: 900 }, "036-purpose");
    try {
      await page.getByRole("heading", { name: "D109-R01", exact: true }).waitFor({ state: "visible" });
      const radios = page.locator('input[name="bom-purpose"]');
      assert.equal(await radios.count(), 2);
      await page.getByText("非製造 BOM", { exact: true }).first().click();
      await page.getByRole("heading", { name: "將建立", exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await page.locator("dl").getByText("非製造 BOM", { exact: true }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "建立非製造 BOM", exact: true }).waitFor({ state: "visible" });
      const kitContext = await openPage(`/bom/create?partNumberId=${fixture.kitPartId}`, { width: 1024, height: 768 }, "036-single-purpose");
      try {
        await kitContext.page.getByRole("heading", { name: "D109-K01", exact: true }).waitFor({ state: "visible" });
        assert.equal(await kitContext.page.locator('input[name="bom-purpose"]').count(), 0);
        await kitContext.page.getByRole("heading", { name: "將建立", exact: true }).waitFor({ state: "visible", timeout: 30000 });
        await kitContext.page.locator("dl").getByText("非製造 BOM", { exact: true }).waitFor({ state: "visible" });
      } finally { await kitContext.context.close(); }
      return { dualPurposes: await radios.count(), singlePurposeHasSelector: false };
    } finally { await context.close(); }
  });

  await runCase("QA-109-037", "read-only create preview", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.kitPartId}`, { width: 1440, height: 900 }, "037-preview");
    try {
      await page.getByRole("heading", { name: "D109-K01", exact: true }).waitFor({ state: "visible" });
      await page.getByRole("heading", { name: "將建立", exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await page.locator("dl").getByText("非製造 BOM", { exact: true }).waitFor({ state: "visible" });
      assert.equal(await page.locator('[contenteditable="true"]').count(), 0);
      return { preview: true, contentEditable: 0 };
    } finally { await context.close(); }
  });

  seedExistingDraft();
  await runCase("QA-109-038", "existing BOM action", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.existingPartId}`, { width: 1440, height: 900 }, "038-existing");
    try {
      await page.getByRole("button", { name: "開啟既有 BOM", exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await page.getByRole("button", { name: "開啟既有 BOM", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/bom/workbench/dev109-browser-existing-draft");
      return { openedDraft: "dev109-browser-existing-draft" };
    } finally { await context.close(); }
  });

  await runCase("QA-109-039", "classify action", async () => {
    const { context, page } = await openPage(`/bom/create?query=D109-S01`, { width: 1440, height: 900 }, "039-classify");
    try {
      await page.getByRole("button", { name: "設定為組立件", exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await page.getByRole("button", { name: "設定為組立件", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/parts", { waitUntil: "commit" });
      assert.equal(new URL(page.url()).searchParams.get("detail"), `cw_dev109-browser-state-${fixture.singlePartId}`);
      return { path: new URL(page.url()).pathname, canonicalRow: new URL(page.url()).searchParams.get("detail") };
    } finally { await context.close(); }
  });

  await runCase("QA-109-040", "idempotent create request", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.kitPartId}`, { width: 1440, height: 900 }, "040-idempotency");
    try {
      let requestCapture = null;
      page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/api/bom/drafts")) requestCapture = { headers: request.headers(), body: request.postData() }; });
      await page.getByRole("button", { name: "建立非製造 BOM", exact: true }).click();
      await page.waitForURL((url) => url.pathname.startsWith("/bom/workbench/"), { timeout: 30000 });
      assert.ok(requestCapture?.headers?.["idempotency-key"]);
      const replay = await page.evaluate(async ({ headers, body }) => {
        const response = await fetch("/api/bom/drafts", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": headers["idempotency-key"], "if-match": headers["if-match"] }, body });
        return { status: response.status, body: await response.json().catch(() => ({})) };
      }, requestCapture);
      assert.ok([200, 409].includes(replay.status));
      assert.ok(replay.body?.workbenchUrl || replay.body?.draftId);
      return { initialPath: new URL(page.url()).pathname, replayStatus: replay.status, idempotencyKey: requestCapture.headers["idempotency-key"] };
    } finally { await context.close(); }
  });

  await runCase("QA-109-041", "unknown network result readback", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.unknownPartId}`, { width: 1440, height: 900 }, "041-network");
    try {
      let postCount = 0;
      await page.route("**/api/bom/drafts", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        postCount += 1;
        if (postCount === 1) { expectedAbortedRequests += 1; return route.abort("failed"); }
        return route.continue();
      });
      allowExpectedConsoleError("041-network", /net::ERR_FAILED/iu);
      allowExpectedConsoleError("041-network", /status of 404/iu);
      await page.getByRole("button", { name: "建立非製造 BOM", exact: true }).click();
      await page.waitForURL((url) => url.pathname.startsWith("/bom/workbench/"), { timeout: 30000 });
      await page.unroute("**/api/bom/drafts");
      assert.ok(postCount >= 2);
      return { postCount, recovered: true };
    } finally { await context.close(); }
  });

  await runCase("QA-109-042", "stale applicability retry preserves selection", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.redPartId}`, { width: 1440, height: 900 }, "042-stale");
    try {
      let aborted = false;
      await page.route("**/api/bom/applicability-candidates**", async (route) => {
        if (!aborted) { aborted = true; expectedAbortedRequests += 1; return route.abort("failed"); }
        return route.continue();
      });
      allowExpectedConsoleError("042-stale", /net::ERR_FAILED/iu);
      await page.getByText("非製造 BOM", { exact: true }).first().click();
      await page.getByRole("alert").getByRole("button", { name: "重試", exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await page.getByRole("alert").getByRole("button", { name: "重試", exact: true }).click();
      await page.getByRole("heading", { name: "將建立", exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await page.unroute("**/api/bom/applicability-candidates**");
      return { preservedParent: fixture.redPartId, retried: true };
    } finally { await context.close(); }
  });

  await runCase("QA-109-043", "keyboard and live error semantics", async () => {
    const { context, page } = await openPage("/bom/create?query=NO-SUCH-PART", { width: 390, height: 844 }, "043-keyboard");
    try {
      await page.getByText("找不到符合條件的料號。", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      assert.equal(await page.getByRole("status").count() >= 1, true);
      assert.equal(await page.locator('button[type="button"]').count() > 0, true);
      await page.locator('input[placeholder="搜尋料號或品名"]').focus();
      await page.keyboard.press("Tab");
      return { statusRole: true, buttonSemantics: true, focusableSearch: true };
    } finally { await context.close(); }
  });

  await runCase("QA-109-044", "validated safe returnTo and responsive visual sweep", async () => {
    const viewportResults = [];
    for (const [width, height, label] of [[1440, 900, "desktop"], [1024, 768, "tablet"], [390, 844, "mobile"]]) {
      const { context, page } = await openPage(`/bom/create?returnTo=https%3A%2F%2Fevil.example%2Fredirect`, { width, height }, `044-${label}`, [/hydration-mismatch/iu]);
      try {
        await waitCreate(page);
        await capture(page, `044-${label}`);
        const overflow = await noOverflow(page);
        assert.ok(overflow.scrollWidth <= overflow.viewport, `${label} overflow ${JSON.stringify(overflow)}`);
        await page.getByRole("button", { name: "返回 BOM 工作台", exact: true }).click();
        await page.waitForURL((url) => url.pathname === "/bom/workbench");
        assert.equal(new URL(page.url()).hostname, "127.0.0.1");
        viewportResults.push({ label, overflow, safeReturn: true });
      } finally { await context.close(); }
    }
    return { viewportResults };
  });

  await runCase("QA-109-049", "workbench entry reaches canonical create page", async () => {
    const { context, page } = await openPage("/bom/workbench", { width: 1440, height: 900 }, "049-entry");
    try {
      await page.getByRole("heading", { name: "BOM 工作台", exact: false }).waitFor({ state: "visible" });
      const entry = page.getByRole("link", { name: "建立 BOM", exact: true }).first();
      await entry.click();
      await page.waitForURL((url) => url.pathname === "/bom/create");
      await waitCreate(page);
      return { path: new URL(page.url()).pathname, entryCount: await page.getByRole("link", { name: "建立 BOM", exact: true }).count() };
    } finally { await context.close(); }
  });

  await runCase("QA-109-050", "full width search has no legacy grid collision", async () => {
    const { context, page } = await openPage("/bom/create", { width: 1440, height: 900 }, "050-search");
    try {
      await waitCreate(page);
      await waitCandidate(page, "D109-R01");
      const metrics = await layoutMetrics(page);
      assert.ok(metrics.input && metrics.list && metrics.searchCaption);
      assert.ok(metrics.searchCaption.bottom <= metrics.input.y + 1, JSON.stringify(metrics));
      assert.ok(metrics.searchLabel.width >= metrics.list.width - 2, JSON.stringify(metrics));
      assert.ok(metrics.input.width >= metrics.list.width * 0.7, JSON.stringify(metrics));
      assert.ok(metrics.scrollWidth <= metrics.viewport, JSON.stringify(metrics));
      await capture(page, "050-search-desktop");
      return { metrics };
    } finally { await context.close(); }
  });

  seedExistingDraft();
  await runCase("QA-109-051", "candidate action semantics stay server-derived", async () => {
    setFixturePartStatus(fixture.unknownPartId, "Obsolete");
    const { context, page } = await openPage("/bom/create?query=D109", { width: 1440, height: 900 }, "051-actions");
    try {
      await waitCreate(page);
      await page.locator('[data-candidate-action="create"]').first().waitFor({ state: "visible" });
      await page.locator('[data-candidate-action="open"]').first().waitFor({ state: "visible" });
      await page.locator('[data-candidate-action="classify"]').first().waitFor({ state: "visible" });
      await page.locator('[data-candidate-action="none"]').first().waitFor({ state: "visible" });
      assert.ok(await page.locator('[data-candidate-action="create"] [role="radio"]').count() >= 1);
      assert.equal(await page.locator('[data-candidate-action="open"] [role="radio"]').count(), 0);
      assert.equal(await page.locator('[data-candidate-action="classify"] [role="radio"]').count(), 0);
      assert.equal(await page.getByRole("button", { name: "設定為組立件", exact: true }).count(), 1);
      assert.ok(await page.getByRole("button", { name: "開啟既有 BOM", exact: true }).count() >= 1);
      assert.equal(await page.locator('[data-candidate-action="none"] button').count(), 0);
      return { actions: { create: await page.locator('[data-candidate-action="create"]').count(), open: 1, classify: 1, none: 1 } };
    } finally {
      await context.close();
      setFixturePartStatus(fixture.unknownPartId, "Active");
    }
  });

  await runCase("QA-109-052", "create row selection is explicit and URL-backed", async () => {
    const { context, page } = await openPage("/bom/create", { width: 1440, height: 900 }, "052-select");
    try {
      await waitCreate(page);
      assert.equal(await page.locator('[role="radio"][aria-checked="true"]').count(), 0);
      const row = page.locator('[data-candidate-action="create"]').first();
      await row.getByRole("radio").click();
      await page.getByRole("heading", { name: "Parent 料號", exact: true }).waitFor({ state: "visible" }).catch(() => undefined);
      await page.getByRole("heading", { name: /D109-/u }).first().waitFor({ state: "visible" });
      await page.waitForURL((url) => Boolean(url.searchParams.get("partNumberId")), { timeout: 30000 });
      assert.equal(await page.locator('[role="radio"][aria-checked="true"]').count(), 0);
      assert.equal(await page.locator('[data-ui="bom-create-page"] .summary').count(), 0);
      return { selectedId: new URL(page.url()).searchParams.get("partNumberId"), autoSelectedBeforeClick: false };
    } finally { await context.close(); }
  });

  await runCase("QA-109-053", "dual purpose segment synchronizes selection and summary", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.redPartId}`, { width: 1440, height: 900 }, "053-purpose");
    try {
      await page.getByRole("heading", { name: "D109-R01", exact: true }).waitFor({ state: "visible" });
      const radios = page.locator('input[name="bom-purpose"]');
      assert.equal(await radios.count(), 2);
      await page.getByText("非製造 BOM", { exact: true }).first().click();
      await page.locator("dl").getByText("非製造 BOM", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await page.waitForURL((url) => url.searchParams.get("purpose") === "sales_kit", { waitUntil: "commit", timeout: 30000 });
      assert.equal(await page.locator('input[name="bom-purpose"]:checked').inputValue(), "sales_kit");
      assert.equal(new URL(page.url()).searchParams.get("purpose"), "sales_kit");
      return { purpose: "sales_kit", summaryRows: await page.locator("dl > div").count() };
    } finally { await context.close(); }
  });

  await runCase("QA-109-054", "single purpose omits empty selector", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.visualKitPartId}`, { width: 1440, height: 900 }, "054-single-purpose");
    try {
      await page.getByRole("heading", { name: "D109-V01", exact: true }).waitFor({ state: "visible" });
      assert.equal(await page.locator('input[name="bom-purpose"]').count(), 0);
      await page.locator("dl").getByText("非製造 BOM", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      assert.equal(await page.locator("fieldset").filter({ hasText: "BOM 用途" }).count(), 0);
      return { purpose: "sales_kit", selectorCount: 0 };
    } finally { await context.close(); }
  });

  await runCase("QA-109-055", "controlled file evidence is structured in summary", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.redPartId}`, { width: 1440, height: 900 }, "055-file-summary");
    try {
      await page.getByRole("heading", { name: "D109-R01", exact: true }).waitFor({ state: "visible" });
      await page.getByText("製造 BOM", { exact: true }).first().click();
      await page.locator("dl").getByText("D109-R01.SLDASM", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      assert.equal(await page.locator("dt").filter({ hasText: "組合檔" }).count(), 1);
      assert.equal(await page.locator("code").getByText("D109-R01.SLDASM", { exact: true }).count(), 1);
      return { file: "D109-R01.SLDASM", structured: true };
    } finally { await context.close(); }
  });

  await runCase("QA-109-056", "non-file sales kit does not invent assembly evidence", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.visualKitPartId}`, { width: 1440, height: 900 }, "056-sales-kit");
    try {
      await page.getByRole("heading", { name: "D109-V01", exact: true }).waitFor({ state: "visible" });
      await page.locator("dl").getByText("非製造 BOM", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      assert.equal(await page.locator("dt").filter({ hasText: "組合檔" }).count(), 0);
      assert.equal(await page.getByText("銷售組合包", { exact: true }).count(), 0);
      return { purpose: "sales_kit", fileEvidence: false };
    } finally { await context.close(); }
  });

  await runCase("QA-109-057", "footer keeps cancel stable and primary conditional", async () => {
    const { context, page } = await openPage("/bom/create", { width: 1440, height: 900 }, "057-footer");
    try {
      await waitCreate(page);
      assert.equal(await page.getByRole("button", { name: "取消", exact: true }).count(), 1);
      assert.equal(await page.getByRole("button", { name: /建立(?:非製造|製造)? BOM/u, exact: true }).count(), 0);
      const kit = await openPage(`/bom/create?partNumberId=${fixture.visualKitPartId}`, { width: 1440, height: 900 }, "057-ready");
      try {
        await kit.page.getByRole("button", { name: "建立非製造 BOM", exact: true }).waitFor({ state: "visible", timeout: 30000 });
        assert.equal(await kit.page.getByRole("button", { name: "建立非製造 BOM", exact: true }).count(), 1);
        assert.equal(await kit.page.getByRole("button", { name: "取消", exact: true }).count(), 1);
        return { initialPrimary: false, readyPrimary: 1, cancel: true };
      } finally { await kit.context.close(); }
    } finally { await context.close(); }
  });

  await runCase("QA-109-058", "desktop frozen candidate visual sweep", async () => {
    const { context, page } = await openPage(`/bom/create?partNumberId=${fixture.visualKitPartId}`, { width: 1440, height: 900 }, "058-desktop");
    try {
      await page.locator("dl").getByText("非製造 BOM", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      const metrics = await layoutMetrics(page);
      assert.equal(metrics.scrollWidth <= metrics.viewport, true);
      assert.equal(await page.locator("dl > div").count(), 3);
      assert.equal(await page.getByRole("button", { name: "建立非製造 BOM", exact: true }).count(), 1);
      await capture(page, "058-desktop-selected");
      return { viewport: [1440, 900], metrics, summary: 3 };
    } finally { await context.close(); }
  });

  await runCase("QA-109-059", "tablet candidate action remains readable", async () => {
    const { context, page } = await openPage("/bom/create", { width: 1024, height: 768 }, "059-tablet");
    try {
      await waitCreate(page);
      await waitCandidate(page, "D109-R01");
      const metrics = await layoutMetrics(page);
      assert.equal(metrics.scrollWidth <= metrics.viewport, true);
      const row = page.locator('[data-candidate-action="create"]').first();
      const rects = await row.getByRole("radio").evaluate((element) => {
        const copy = element.children.item(1);
        const action = element.children.item(2);
        const copyRect = copy?.getBoundingClientRect();
        const actionRect = action?.getBoundingClientRect();
        return { copyRight: copyRect?.right ?? 0, actionLeft: actionRect?.left ?? 0 };
      });
      assert.ok(rects.copyRight <= rects.actionLeft + 1, JSON.stringify(rects));
      await capture(page, "059-tablet");
      return { viewport: [1024, 768], metrics, rects };
    } finally { await context.close(); }
  });

  await runCase("QA-109-060", "mobile keyboard path has no overflow or clipping", async () => {
    const { context, page } = await openPage("/bom/create", { width: 390, height: 844 }, "060-mobile");
    try {
      await waitCreate(page);
      await waitCandidate(page, "D109-R01");
      const input = page.locator('input[placeholder="搜尋料號或品名"]');
      await input.focus();
      await page.keyboard.press("Tab");
      const activeRole = await page.evaluate(() => document.activeElement?.getAttribute("role"));
      assert.equal(activeRole, "radio");
      const metrics = await layoutMetrics(page);
      assert.equal(metrics.scrollWidth <= metrics.viewport, true);
      assert.ok(metrics.footer);
      await capture(page, "060-mobile");
      return { viewport: [390, 844], activeRole, metrics };
    } finally { await context.close(); }
  });

  assert.equal(pageErrors.length, 0, JSON.stringify(pageErrors));
  assert.equal(consoleErrors.length, 0, JSON.stringify(consoleErrors));
  assert.ok(failedRequests.length <= expectedAbortedRequests, JSON.stringify({ failedRequests, expectedAbortedRequests }));
  return { fixtureLedger, expectedAbortedRequests };
}

let exitCode = 1;
let cleanup = { portReleased: false, processesStopped: false, fixtureRemoved: false, distRemoved: false };
let fixtureLedger = null;
try {
  fixtureLedger = await main();
  exitCode = checks.length === 27 && checks.every((item) => item.status === "PASS") ? 0 : 1;
} catch (error) {
  console.error(`DEV109_BROWSER_RUNNER_ERROR: ${errorText(error)}`);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (app) { await stopNextApp(app.child).catch(() => undefined); cleanup.processesStopped = app.child.exitCode !== null; }
  cleanup.portReleased = port === null ? true : await portReleased(port);
  if (nextTsconfig) cleanup.distRemoved = removeTaskOwnedWorkspaceTempDir(root, process.env.PDM_NEXT_DIST_DIR).removed;
  await restoreNextEnv(nextEnvSnapshot).catch(() => undefined);
  for (const [key, value] of originalEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); cleanup.fixtureRemoved = !fs.existsSync(taskRoot); } catch { cleanup.fixtureRemoved = false; }
}

const ids = [...Array.from({ length: 15 }, (_, index) => `QA-109-${String(index + 30).padStart(3, "0")}`), ...Array.from({ length: 12 }, (_, index) => `QA-109-${String(index + 49).padStart(3, "0")}`)];
const result = {
  schemaVersion: 1,
  devId: "DEV-109",
  runner: "browser",
  execution: "real-chromium",
  status: exitCode === 0 && cleanup.portReleased && cleanup.fixtureRemoved ? "PASS" : "FAIL",
  runId,
  fixedCases: ids,
  productionWrites: false,
  primaryWrites: false,
  runtime: { project: root, port, dataDir, repositoryDir, cleanup, mutationScope: taskRoot },
  fixtureLedger: { ...fixtureLedger, mutations: fixtureMutations },
  checks: ids.map((id) => checks.find((item) => item.id === id) ?? { id, status: "BLOCKED", error: "browser setup did not complete" }),
  browserEvidence: { screenshots, consoleErrors, pageErrors, failedRequests, expectedAbortedRequests }
};
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "browser-real.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ runner: result.runner, execution: result.execution, status: result.status, passed: result.checks.filter((item) => item.status === "PASS").length, total: result.checks.length, cleanup, evidenceDir }));
if (result.status !== "PASS") process.exitCode = 1;
