#!/usr/bin/env node

/* DEV-106 real Chromium browser evidence against task-owned SQLite data. */
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
const runId = `DEV106-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev106-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const outputDir = path.resolve(process.env.DEV106_BROWSER_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-106", runId, "browser"));
const screenshotDir = path.join(outputDir, "screenshots");
const fixture = {
  companyId: "company-jenfu",
  parentId: "dev106-browser-parent",
  childAId: "dev106-browser-child-a",
  childBId: "dev106-browser-child-b",
  parentRootId: "dev106-browser-parent-root",
  childRootId: "dev106-browser-child-root",
  engineerEmail: "dev106-browser-engineer@example.com"
};
const now = "2026-08-31T12:00:00.000Z";
const checks = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const serverErrors = [];
const screenshots = [];
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
let fixtureLedger = null;

function text(error) { return error instanceof Error ? error.message : String(error); }
function assertText(locator, value) { return locator.getByText(value, { exact: false }).first().waitFor({ state: "visible", timeout: 30000 }); }
function attachMonitor(page, label) {
  page.on("console", (event) => { if (event.type() === "error") consoleErrors.push({ label, message: event.text() }); });
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    void response.text().then((body) => {
      const entry = { label, url: response.url(), status: response.status(), body: body.slice(0, 2_000) };
      if (response.status() >= 500) serverErrors.push(entry);
      else if (response.url().includes("/api/parts/workbench")) serverErrors.push(entry);
    }).catch(() => undefined);
  });
  page.on("requestfailed", (request) => { const failure = request.failure(); if (failure?.errorText && !failure.errorText.includes("ABORTED")) failedRequests.push({ label, url: request.url(), error: failure.errorText }); });
}
async function login(page, role = "Engineer") {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const response = await page.evaluate(async (selectedRole) => {
    const result = await fetch("/api/auth/local-quick-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: selectedRole }) });
    return { status: result.status, body: await result.json().catch(() => ({})) };
  }, role);
  assert.equal(response.status, 200, `${role} login failed: ${JSON.stringify(response.body)}`);
}
async function api(page, route, init = {}) {
  return await page.evaluate(async ({ route, init }) => {
    const response = await fetch(route, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.json().catch(() => null) };
  }, { route, init });
}
async function openPage(role, route, viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  attachMonitor(page, label);
  await login(page, role);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { context, page };
}
async function waitEditor(page) { await page.locator('[data-testid="bom-structured-editor"]').waitFor({ state: "visible", timeout: 30000 }); }
async function screenshot(page, name) { const file = path.join(screenshotDir, `${name}.png`); await page.screenshot({ path: file, fullPage: true }); screenshots.push(file); }
async function noOverflow(page) { return await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })); }
async function runCase(id, label, fn) {
  try { const evidence = await fn(); checks.push({ id, label, status: "PASS", evidence }); console.log(`PASS ${id} ${label}`); }
  catch (error) { checks.push({ id, label, status: "FAIL", error: text(error) }); console.error(`FAIL ${id} ${text(error)}`); }
}

function seedFixture() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  // The schema bootstrap defaults to legacy_only. This task-owned fixture is
  // explicitly a post-cutover canonical read model, matching local-dev runtime.
  db.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1, switched_at=? WHERE id=1").run(now);
  const inserted = [];
  const insert = (table, columns, values) => {
    const result = db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...values);
    if (result.changes) inserted.push({ table, id: values[0] });
  };
  db.transaction(() => {
    insert("users", ["id", "display_name", "email", "role", "company_id", "account_status", "system_role_enabled", "created_at", "updated_at"], ["dev106-browser-engineer", "DEV-106 Browser Engineer", fixture.engineerEmail, "Engineer", fixture.companyId, "active", 1, now, now]);
    insert("users", ["id", "display_name", "email", "role", "company_id", "account_status", "system_role_enabled", "created_at", "updated_at"], ["dev106-browser-manager", "DEV-106 Browser Manager", "dev106-browser-manager@example.com", "R&D Manager", fixture.companyId, "active", 1, now, now]);
    insert("part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "rule_version_id", "created_by", "created_at", "updated_at"], [fixture.parentRootId, fixture.companyId, "D106BP", "DEV-106 Browser Parent Root", "purchased", "Active", "numbering-rule-v3-alpha-root", "dev106-browser-engineer", now, now]);
    insert("part_roots", ["id", "company_id", "root_code", "core_name", "item_kind", "record_status", "rule_version_id", "created_by", "created_at", "updated_at"], [fixture.childRootId, fixture.companyId, "D106BC", "DEV-106 Browser Child Root", "purchased", "Active", "numbering-rule-v3-alpha-root", "dev106-browser-engineer", now, now]);
    insert("part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "bom_usage_policy", "record_status", "rule_version_id", "created_by", "created_at", "updated_at"], [fixture.parentId, fixture.companyId, fixture.parentRootId, "D106-P01", 1, "01", "市售組合包 Parent", "purchased", "assembly", "undecided", "Active", "numbering-rule-v3-alpha-root", "dev106-browser-engineer", now, now]);
    insert("part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "bom_usage_policy", "record_status", "rule_version_id", "created_by", "created_at", "updated_at"], [fixture.childAId, fixture.companyId, fixture.childRootId, "D106-C01", 1, "01", "市售標準品 A", "purchased", "single_part", "undecided", "Active", "numbering-rule-v3-alpha-root", "dev106-browser-engineer", now, now]);
    insert("part_numbers", ["id", "company_id", "part_root_id", "part_number", "sequence_no", "sequence_code", "part_name", "item_kind", "structure_type", "bom_usage_policy", "record_status", "rule_version_id", "created_by", "created_at", "updated_at"], [fixture.childBId, fixture.companyId, fixture.childRootId, "D106-C02", 2, "02", "市售標準品 B", "purchased", "single_part", "undecided", "Active", "numbering-rule-v3-alpha-root", "dev106-browser-engineer", now, now]);
    const insertAggregate = db.prepare("INSERT OR IGNORE INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id, open_branch_count, row_version, updated_at) VALUES (?, ?, 'part', ?, 0, 1, ?)");
    const insertState = db.prepare("INSERT OR IGNORE INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, work_id, handling, row_version, created_at, updated_at) VALUES (?, ?, 'part', ?, 'part_formal', NULL, NULL, NULL, 'none', 1, ?, ?)");
    for (const partId of [fixture.parentId, fixture.childAId, fixture.childBId]) {
      insertAggregate.run(`dev106-browser-aggregate-${partId}`, fixture.companyId, partId, now);
      insertState.run(crypto.randomUUID(), fixture.companyId, partId, now, now);
    }
  })();
  const foreignKeys = db.pragma("foreign_key_check");
  db.close();
  if (foreignKeys.length) throw new Error(`DEV106_BROWSER_FIXTURE_FK:${JSON.stringify(foreignKeys)}`);
  return { inserted, databasePath, primaryWrites: false };
}

async function portReleased(checkPort) {
  return await new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: checkPort });
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(true); });
  });
}

async function startServer() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    process.env.PDM_NEXT_DIST_DIR = `.tmp/qc-dev106-browser-${port}`;
    nextTsconfig = createTaskOwnedNextTsconfig(root, `dev106-${port}`, process.env.PDM_NEXT_DIST_DIR);
    process.env.PDM_NEXT_TSCONFIG_PATH = nextTsconfig.relativePath;
    console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-106 real Chromium sales-kit BOM flow", port, owningProcessTree: `this runner ${process.pid} -> task-owned Next.js child`, cleanupCondition: "browser closed, exact Next.js child stopped, port released, task fixture and dist removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot, productionWrites: false } }));
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
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  fixtureLedger = seedFixture();
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

  await runCase("QA-106-019", "BOM workbench exposes the normal Part-based create entry", async () => {
    const { context, page } = await openPage("Engineer", "/bom/workbench", { width: 1440, height: 900 }, "019-entry");
    try {
      await page.getByRole("heading", { name: "BOM 工作台", exact: false }).waitFor({ state: "visible" });
      const trigger = page.getByRole("button", { name: "從料號建立", exact: true }).first();
      assert.equal(await trigger.count(), 1);
      await trigger.click();
      await page.getByRole("dialog", { name: "從料號建立 BOM" }).waitFor({ state: "visible" });
      await screenshot(page, "019-entry-picker");
      return { triggerCount: 1 };
    } finally { await context.close(); }
  });

  await runCase("QA-106-020", "picker navigates to the exact Part drawer", async () => {
    const { context, page } = await openPage("Engineer", "/bom/workbench", { width: 1280, height: 800 }, "020-picker");
    try {
      await page.getByRole("button", { name: "從料號建立", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: "從料號建立 BOM" });
      await dialog.getByText("D106-P01", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await dialog.getByRole("button", { name: "建立銷售組合包", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/parts" && /^cw_[0-9a-f-]{36}$/u.test(url.searchParams.get("detail") ?? ""), { timeout: 30000 });
      await page.locator("aside.pdm-entity-detail-drawer").waitFor({ state: "visible", timeout: 30000 });
      return { url: page.url() };
    } finally { await context.close(); }
  });

  const partFlow = await openPage("Engineer", `/parts?query=${encodeURIComponent("D106-P01")}`, { width: 1440, height: 900 }, "021-part-flow");
  const partPage = partFlow.page;
  await runCase("QA-106-021", "Part drawer shows purpose-aware sales-kit create flow", async () => {
    try {
      await partPage.locator(".canonical-row-open").filter({ hasText: "D106-P01" }).click();
      const drawer = partPage.locator("aside.pdm-entity-detail-drawer");
      await drawer.waitFor({ state: "visible", timeout: 30000 });
      const bom = drawer.locator('[data-section="part-bom-context"]');
      await bom.getByRole("button", { name: "建立銷售組合包", exact: true }).waitFor({ state: "visible", timeout: 30000 });
      await bom.getByRole("button", { name: "建立銷售組合包", exact: true }).click();
      const dialog = partPage.getByRole("dialog", { name: "建立 BOM" });
      await dialog.waitFor({ state: "visible", timeout: 30000 });
      await dialog.getByText("用途：銷售組合包", { exact: false }).waitFor({ state: "visible", timeout: 30000 });
      const createButton = dialog.getByRole("button", { name: "建立銷售組合包", exact: true });
      await partPage.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some((button) => button.textContent?.trim() === "建立銷售組合包" && !button.disabled), undefined, { timeout: 30000 });
      assert.equal(await createButton.isEnabled(), true);
      return { purpose: "sales_kit", parentLocked: true };
    } catch (error) { await partFlow.context.close(); throw error; }
  });

  await runCase("QA-106-022", "sales-kit purpose is visible in the structured editor", async () => {
    try {
      const dialog = partPage.getByRole("dialog", { name: "建立 BOM" });
      await dialog.getByRole("button", { name: "建立銷售組合包", exact: true }).click();
      await partPage.waitForURL(/\/bom\/workbench\//u, { timeout: 30000 });
      await waitEditor(partPage);
      await partPage.getByText("銷售組合包", { exact: false }).first().waitFor({ state: "visible", timeout: 30000 });
      return { url: partPage.url() };
    } catch (error) { await partFlow.context.close(); throw error; }
  });

  await runCase("QA-106-023", "picker supports Escape and restores focus to its trigger", async () => {
    const { context, page } = await openPage("Engineer", "/bom/workbench", { width: 390, height: 844 }, "023-keyboard");
    try {
      const trigger = page.getByRole("button", { name: "從料號建立", exact: true }).first();
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "從料號建立 BOM" });
      await dialog.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
      return { restoredFocus: true };
    } finally { await context.close(); }
  });

  await runCase("QA-106-024", "empty-state and header share the same create action", async () => {
    const { context, page } = await openPage("Engineer", "/bom/workbench", { width: 1024, height: 768 }, "024-empty");
    try {
      await page.getByPlaceholder("料號、品名、BOM Rev").fill("DEV106-NO-MATCH");
      await page.getByRole("button", { name: "套用", exact: true }).click();
      const empty = page.getByText("目前沒有符合條件的 BOM", { exact: true });
      await empty.waitFor({ state: "visible", timeout: 30000 });
      const buttons = page.getByRole("button", { name: "從料號建立", exact: true });
      assert.equal(await buttons.count(), 2);
      return { sharedEntryCount: await buttons.count() };
    } finally { await context.close(); }
  });

  await runCase("QA-106-025", "purpose filter and picker remain usable at four viewports", async () => {
    const { context, page } = await openPage("Engineer", "/bom/workbench", { width: 1440, height: 900 }, "025-responsive");
    try {
      const purpose = page.locator("label").filter({ hasText: "BOM 用途" }).locator("select").first();
      assert.equal(await purpose.count(), 1);
      await purpose.selectOption("sales_kit");
      await page.getByRole("button", { name: "套用", exact: true }).click();
      for (const viewport of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
        await page.setViewportSize({ width: viewport[0], height: viewport[1] });
        const geometry = await noOverflow(page);
        assert.ok(geometry.scrollWidth <= geometry.viewport + 1, JSON.stringify(geometry));
      }
      return { viewports: 4 };
    } finally { await context.close(); }
  });

  await runCase("QA-106-026", "sales-kit editor hides Parent mapping and keeps fixed child editing", async () => {
    try {
      const detail = await api(partPage, `/api/bom/drafts/${new URL(partPage.url()).pathname.split("/").pop()}`);
      assert.equal(detail.status, 200);
      const draft = detail.body.draft;
      const lineId = "dev106-browser-line";
      const logicalLineId = "10600000-0000-4000-8000-000000000001";
      const save = await api(partPage, `/api/bom/drafts/${draft.id}`, { method: "PATCH", body: JSON.stringify({ expectedEditorVersion: draft.editor_version, reason: "DEV-106 browser child", lines: [{ id: lineId, logicalLineId, parentLineId: null, nodeType: "item", partNumber: "D106-C01", revision: null, groupName: null, quantity: 2, sequenceNo: 1 }], floatingTopics: [], components: [{ nodeId: lineId, logicalLineId, nodeLocation: "tree", componentMode: "fixed", childPartNumberIds: [fixture.childAId], parentSelections: [] }] }) });
      assert.equal(save.status, 200, JSON.stringify(save.body));
      await partPage.reload({ waitUntil: "domcontentloaded" });
      await waitEditor(partPage);
      assert.equal(await partPage.locator(".bom-parent-mapping").count(), 0);
      assert.equal(await partPage.getByRole("heading", { name: "適用料號對應", exact: true }).count(), 0);
      await partPage.locator('[data-testid="bom-structured-editor"]').getByText("D106-C01", { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
      await screenshot(partPage, "026-sales-kit-editor");
      return { fixedChild: "D106-C01", parentMappingVisible: false };
    } finally { await partFlow.context.close(); }
  });

  const clean = consoleErrors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0 && serverErrors.length === 0;
  assert.equal(clean, true, JSON.stringify({ consoleErrors, pageErrors, failedRequests, serverErrors }));
}

let exitCode = 1;
let cleanup = { portReleased: false, processesStopped: false, fixtureRemoved: false, distRemoved: false };
try { await main(); exitCode = checks.length === 8 && checks.every((item) => item.status === "PASS") ? 0 : 1; }
catch (error) { console.error(`DEV106_BROWSER_RUNNER_ERROR: ${text(error)}`); }
finally {
  if (browser) await browser.close().catch(() => undefined);
  if (app) { await stopNextApp(app.child).catch(() => undefined); cleanup.processesStopped = app.child.exitCode !== null; }
  cleanup.portReleased = port === null ? true : await portReleased(port);
  if (nextTsconfig) cleanup.distRemoved = removeTaskOwnedWorkspaceTempDir(root, process.env.PDM_NEXT_DIST_DIR).removed;
  await restoreNextEnv(nextEnvSnapshot).catch(() => undefined);
  for (const [key, value] of originalEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); cleanup.fixtureRemoved = !fs.existsSync(taskRoot); } catch { cleanup.fixtureRemoved = false; }
}

const allIds = Array.from({ length: 8 }, (_, index) => `QA-106-${String(index + 19).padStart(3, "0")}`);
const result = {
  schemaVersion: 1,
  runner: "browser",
  execution: "real-chromium",
  status: exitCode === 0 && cleanup.portReleased && cleanup.fixtureRemoved ? "PASS" : "FAIL",
  runId,
  fixedCases: allIds,
  productionWrites: false,
  primaryWrites: false,
  runtime: { project: root, port, dataDir, repositoryDir, cleanup, mutationScope: taskRoot },
  fixtureLedger,
  checks: allIds.map((id) => checks.find((item) => item.id === id) ?? { id, status: "BLOCKED", error: "browser setup did not complete" }),
  browserEvidence: { screenshots, consoleErrors, pageErrors, failedRequests, serverErrors }
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "browser.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ runner: result.runner, execution: result.execution, status: result.status, passed: result.checks.filter((item) => item.status === "PASS").length, total: result.checks.length, cleanup }));
if (result.status !== "PASS") process.exitCode = 1;
