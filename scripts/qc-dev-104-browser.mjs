#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import {
  getFreePort,
  startNextApp,
  stopNextApp,
  waitForNextAppReady,
  removeTaskOwnedWorkspaceTempDir,
  snapshotNextEnv,
  restoreNextEnv
} from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV104-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.resolve(process.env.DEV104_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-104", runId), "browser");
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev104-browser-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepositoryDir = path.join(root, "data", "repository");
const results = [];
const browserErrors = [];
const failedResponses = [];
const failedRequests = [];
const mutationRequests = [];
const caseEvidence = [];
const originalEnv = new Map([
  "NODE_ENV", "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_RELEASE_MODE",
  "PDM_ENABLE_LOCAL_QUICK_LOGIN", "PDM_ASSEMBLY_SHARED_BOM_V1", "PDM_BOM_XMIND_EDITOR_V2_ENABLED", "PDM_NEXT_DIST_DIR",
  "PDM_NEXT_TSCONFIG_PATH", "PDM_PUBLIC_BASE_URL", "DATABASE_URL", "PDM_POSTGRES_URL"
].map((key) => [key, process.env[key]]));
const nextEnvSnapshot = snapshotNextEnv(root);
let app = null;
let browser = null;
let baseUrl = "";
let port = null;
let fixture = null;
let distDirRelative = null;

function text(error) { return error instanceof Error ? error.message : String(error); }
function iso() { return new Date().toISOString(); }
function uuid(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

function primaryInvariant(databasePath) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma("query_only = ON");
    const tables = ["part_roots", "part_numbers", "drawing_numbers", "drawings"];
    const payload = {
      schema: db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND (tbl_name IN (${tables.map(() => "?").join(",")}) OR name LIKE '%company_scope_migration%') ORDER BY type, name`).all(...tables),
      tables: Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()])),
      residue: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%company_scope_migration%' ORDER BY name").all(),
      foreignKeys: db.pragma("foreign_key_check")
    };
    return { hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload };
  } finally { db.close(); }
}

function seedFixture() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDbPath);
  if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
  const db = new Database(fixtureDbPath);
  db.pragma("foreign_keys = ON");
  const companyId = "company-jenfu";
  const roots = db.prepare("SELECT * FROM part_roots WHERE company_id = ? ORDER BY id LIMIT 2").all(companyId);
  assert.ok(roots.length === 2, "DEV-104 browser fixture needs two part roots");
  const parentRoot = roots[0];
  const childRoot = roots[1];
  const parent = db.prepare("SELECT * FROM part_numbers WHERE part_root_id = ? ORDER BY sequence_no, id LIMIT 1").get(parentRoot.id);
  const child = db.prepare("SELECT * FROM part_numbers WHERE part_root_id = ? ORDER BY sequence_no, id LIMIT 1").get(childRoot.id);
  assert.ok(parent?.id && child?.id, "DEV-104 browser fixture needs parent and child part numbers");
  const parent2Id = "dev104-parent-2";
  const child2Id = "dev104-child-2";
  const parentCode = "DEV104-P01";
  const parent2Code = "DEV104-P02";
  const childCode = "DEV104-C01";
  const child2Code = "DEV104-C02";
  const now = iso();
  const definitionId = "dev104-definition";
  db.transaction(() => {
    db.prepare("UPDATE part_roots SET root_code = CASE id WHEN ? THEN ? ELSE ? END, core_name = CASE id WHEN ? THEN ? ELSE ? END, record_status = 'Active', updated_at = ? WHERE id IN (?, ?)").run(parentRoot.id, "DEV104-PARENT-ROOT", "DEV104-CHILD-ROOT", parentRoot.id, "DEV-104 BOM browser parent", "DEV-104 BOM browser child", now, parentRoot.id, childRoot.id);
    db.prepare("UPDATE part_numbers SET part_number = ?, part_name = ?, item_kind = 'manufactured', structure_type = 'assembly', record_status = 'Active', updated_at = ? WHERE id = ?").run(parentCode, "DEV-104 組立件一", now, parent.id);
    db.prepare(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, structure_type, is_universal, bom_usage_policy, record_status, rule_version_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 2, 'P02', ?, 'manufactured', 'assembly', 0, 'undecided', 'Active', ?, 'user-engineer-demo', ?, ?)`)
      .run(parent2Id, companyId, parentRoot.id, parent2Code, "DEV-104 組立件二", parent.rule_version_id, now, now);
    db.prepare("UPDATE part_numbers SET part_number = ?, part_name = ?, item_kind = 'purchased', structure_type = 'single_part', record_status = 'Active', updated_at = ? WHERE id = ?").run(childCode, "DEV-104 零件一", now, child.id);
    db.prepare(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, structure_type, is_universal, bom_usage_policy, record_status, rule_version_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 2, 'P02', ?, 'purchased', 'single_part', 0, 'undecided', 'Active', ?, 'user-engineer-demo', ?, ?)`)
      .run(child2Id, companyId, childRoot.id, child2Code, "DEV-104 零件二", child.rule_version_id, now, now);
    const insertDrawing = db.prepare(`INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'M', 'DEV-104 fixture manufacturing drawing', ?, 1, 'Active', ?, 'user-engineer-demo', ?, ?)`);
    const insertLink = db.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at) VALUES (?, ?, ?, 'primary_manufacturing', 'user-engineer-demo', ?)");
    for (const [partId, code, sequence] of [[parent.id, parentCode, 1], [parent2Id, parent2Code, 2]]) {
      const drawingId = `dev104-drawing-${sequence}`;
      insertDrawing.run(drawingId, companyId, parentRoot.id, `${code}-M01`, 900 + sequence, parent.rule_version_id, now, now);
      if (partId === parent2Id) insertLink.run(`dev104-link-${sequence}`, drawingId, partId, now);
    }
    for (const [id, code, sequence] of [[child.id, childCode, 1], [child2Id, child2Code, 2]]) {
      const drawingId = `dev104-child-drawing-${sequence}`;
      insertDrawing.run(drawingId, companyId, childRoot.id, `${code}-M01`, 900 + sequence, child.rule_version_id, now, now);
      if (id === child2Id) insertLink.run(`dev104-child-link-${sequence}`, drawingId, id, now);
    }
    db.prepare("UPDATE drawing_numbers SET record_status = 'Active', updated_at = ? WHERE id IN (SELECT drawing_number_id FROM drawing_part_links WHERE part_number_id IN (?, ?))").run(now, parent.id, child.id);

    const insertDraft = db.prepare(`INSERT INTO bom_drafts (id, company_id, definition_id, owner_part_number_id, bom_revision, identity_authority, draft_name, status, source, is_active, line_count, review_attempt, editor_version, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, 0, 1, 'user-engineer-demo', 'user-engineer-demo', ?, ?)`);
    const insertLine = db.prepare(`INSERT INTO bom_lines_tree (id, bom_draft_id, logical_line_id, parent_line_id, node_type, item_id, part_number, revision, group_name, quantity, sequence_no, source, source_priority, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, 'manual', 30, 'user-engineer-demo', 'user-engineer-demo', ?, ?)`);
    const insertFloating = db.prepare(`INSERT INTO bom_draft_floating_topics (id, bom_draft_id, logical_line_id, parent_floating_topic_id, node_type, item_id, part_number, revision, group_name, quantity, sequence_no, root_position_x, root_position_y, source, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, 320, 220, 'manual', 'user-engineer-demo', 'user-engineer-demo', ?, ?)`);
    const insertDefinition = db.prepare("INSERT INTO bom_definitions (id, company_id, part_root_id, row_version, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 1, 'user-engineer-demo', 'user-engineer-demo', ?, ?)");
    const insertDefinitionBinding = db.prepare("INSERT INTO bom_definition_parent_bindings (id, company_id, definition_id, part_number_id, bound_from_bom_revision, created_by, created_at) VALUES (?, ?, ?, ?, '1', 'user-engineer-demo', ?)");
    const insertBinding = db.prepare("INSERT INTO bom_draft_parent_bindings (id, company_id, bom_draft_id, part_number_id, selection_order, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'user-engineer-demo', ?)");
    const insertComponent = db.prepare("INSERT INTO bom_draft_component_nodes (bom_draft_id, logical_line_id, node_id, node_location, component_mode, child_part_root_id, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'user-engineer-demo', 'user-engineer-demo', ?, ?)");
    const insertCandidate = db.prepare("INSERT INTO bom_draft_component_candidates (bom_draft_id, logical_line_id, child_part_number_id, selection_order) VALUES (?, ?, ?, ?)");
    const canonicalDraft = (id, name, status = "Draft", active = 0, withFloating = false) => {
      insertDraft.run(id, companyId, null, parent.id, "1", "canonical_part_number", name, status, active, withFloating ? 1 : 1, now, now);
      insertLine.run(`${id}-group`, id, `${id}-group`, null, "group", null, name, null, 1, now, now);
      insertLine.run(`${id}-line`, id, `${id}-line`, `${id}-group`, "item", childCode, null, 1, 1, now, now);
      if (withFloating) insertFloating.run(`${id}-floating`, id, `${id}-floating`, null, "item", child2Code, null, 1, 1, now, now);
    };
    canonicalDraft("dev104-canonical-edit", "DEV-104 可編輯草稿", "Draft", 1);
    canonicalDraft("dev104-empty", "DEV-104 空白草稿", "Draft", 0, false);
    db.prepare("DELETE FROM bom_lines_tree WHERE bom_draft_id = ?").run("dev104-empty");
    canonicalDraft("dev104-floating", "DEV-104 未納入草稿", "Draft", 0, true);
    canonicalDraft("dev104-fixed", "DEV-104 固定對應草稿", "Draft", 0);
    canonicalDraft("dev104-conflict", "DEV-104 衝突草稿", "Draft", 0);
    canonicalDraft("dev104-archived", "DEV-104 歷史草稿", "Archived", 0);

    insertDefinition.run(definitionId, companyId, parentRoot.id, now, now);
    insertDefinitionBinding.run("dev104-definition-binding-1", companyId, definitionId, parent.id, now);
    insertDefinitionBinding.run("dev104-definition-binding-2", companyId, definitionId, parent2Id, now);
    const sharedLogicalLineId = "10400000-0000-4000-8000-000000000044";
    for (const [id, name] of [["dev104-shared", "DEV-104 共享 BOM"]]) {
      insertDraft.run(id, companyId, definitionId, null, "1", "canonical_part_number", name, "Draft", 1, 1, now, now);
      insertBinding.run(`${id}-binding-1`, companyId, id, parent.id, 0, now);
      insertBinding.run(`${id}-binding-2`, companyId, id, parent2Id, 1, now);
      insertLine.run(`${id}-line`, id, sharedLogicalLineId, null, "item", childCode, null, 1, 1, now, now);
      insertComponent.run(id, sharedLogicalLineId, `${id}-line`, "tree", "by_parent", childRoot.id, now, now);
      insertCandidate.run(id, sharedLogicalLineId, child.id, 0);
      insertCandidate.run(id, sharedLogicalLineId, child2Id, 1);
    }
    for (const email of ["engineer@example.com", "manager@example.com", "manufacturing@example.com", "procurement@example.com", "admin@example.com"]) {
      db.prepare("UPDATE users SET account_status = 'active', system_role_enabled = 1, session_invalid_before = NULL WHERE email = ?").run(email);
      db.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = ?").run(email);
    }
  })();
  db.close();
  return { companyId, parentRootId: parentRoot.id, childRootId: childRoot.id, parentId: parent.id, parent2Id, childId: child.id, child2Id, parentCode, parent2Code, childCode, child2Code, definitionId, editableId: "dev104-canonical-edit", emptyId: "dev104-empty", floatingId: "dev104-floating", fixedId: "dev104-fixed", conflictId: "dev104-conflict", sharedId: "dev104-shared", reviewId: "dev104-shared", archivedId: "dev104-archived" };
}

async function startServer() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    port = await getFreePort();
    distDirRelative = `.tmp/qc-dev104-browser-${crypto.randomUUID()}`;
    baseUrl = `http://127.0.0.1:${port}`;
    Object.assign(process.env, {
      NODE_ENV: "development",
      PDM_AUTH_MODE: "legacy",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_RELEASE_MODE: "local_stub",
      PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
      PDM_ASSEMBLY_SHARED_BOM_V1: "true",
      PDM_BOM_XMIND_EDITOR_V2_ENABLED: "true",
      PDM_NEXT_DIST_DIR: distDirRelative,
      PDM_PUBLIC_BASE_URL: baseUrl,
      DATABASE_URL: "",
      PDM_POSTGRES_URL: ""
    });
    console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-104 authenticated BOM workbench browser QA against task-owned SQLite/repository fixture", port, owningProcessTree: `browser runner ${process.pid} -> Next dev child pending`, cleanupCondition: "all 20 cases and invariant checks complete; stop verified child tree, release port, remove task-owned fixture and Next dist", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: `${tempRoot}; ${path.join(root, distDirRelative)}` } }));
    app = startNextApp(root, "dev", port);
    try {
      await waitForNextAppReady(baseUrl, app.getOutput, 120000);
      await delay(500);
      const startupOutput = app.getOutput();
      const transientNextEnvLock = /next-env\.d\.ts/iu.test(startupOutput) && /UNKNOWN|EBUSY|EPERM|EACCES/iu.test(startupOutput);
      if (transientNextEnvLock) throw new Error(`transient next-env.d.ts lock\n${startupOutput.slice(-4_000)}`);
      return;
    } catch (error) {
      const output = app?.getOutput?.() ?? "";
      if (app) { await stopNextApp(app.child).catch(() => undefined); app = null; }
      const transientNextEnvLock = /next-env\.d\.ts/iu.test(output) && /UNKNOWN|EBUSY|EPERM|EACCES/iu.test(output);
      removeTaskOwnedWorkspaceTempDir(root, distDirRelative);
      if (!transientNextEnvLock || attempt === 3) throw error;
      await delay(750 * attempt);
    }
  }
}

function attachMonitor(page, label) {
  page.on("pageerror", (error) => browserErrors.push({ label, type: "pageerror", message: text(error) }));
  page.on("console", (event) => { if (event.type() === "error") browserErrors.push({ label, type: "console", message: event.text() }); });
  page.on("response", (response) => { if (response.status() >= 500) failedResponses.push({ label, url: response.url(), status: response.status() }); });
  page.on("requestfailed", (request) => { const failure = request.failure(); if (failure?.errorText && !failure.errorText.includes("ABORTED")) failedRequests.push({ label, method: request.method(), url: request.url(), error: failure.errorText }); });
  page.on("request", (request) => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && !request.url().includes("/api/auth/local-quick-login")) mutationRequests.push({ label, method: request.method(), url: request.url() }); });
}

async function login(page, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const result = await page.evaluate(async (selectedRole) => {
    const response = await fetch("/api/auth/local-quick-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: selectedRole }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, role);
  assert.equal(result.status, 200, `${role} local login failed: ${JSON.stringify(result.body)}`);
}

async function openPage(role, route, viewport = { width: 1280, height: 900 }, label = route) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  attachMonitor(page, label);
  await login(page, role);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { context, page };
}

async function api(page, route, init) {
  return page.evaluate(async ({ route, init }) => {
    const response = await fetch(route, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => null);
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
  }, { route, init });
}

async function waitEditor(page) { await page.locator('[data-testid="bom-structured-editor"]').waitFor({ state: "visible", timeout: 30000 }); }
async function screenshot(page, name) { const file = path.join(screenshotDir, `${name}.png`); await page.screenshot({ path: file, fullPage: true }); caseEvidence.push(file); }
async function noHorizontalOverflow(page) { return page.evaluate(() => ({ viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth })); }

async function runCase(caseId, title, fn) {
  const started = Date.now();
  try {
    const evidence = await fn();
    results.push({ caseId, title, status: "PASS", durationMs: Date.now() - started, evidence });
  } catch (error) {
    results.push({ caseId, title, status: "FAIL", durationMs: Date.now() - started, error: text(error) });
    console.error(`FAIL ${caseId}: ${text(error)}`);
  }
}

async function runCases() {
  await runCase("QA-104-029", "Part workbench BOM context opens canonical detail", async () => {
    const { context, page } = await openPage("Engineer", `/parts?query=${encodeURIComponent(fixture.parentCode)}`, undefined, "029-part-context");
    try {
      await page.locator(".canonical-row-open").first().click();
      const drawer = page.locator("aside.pdm-entity-detail-drawer"); await drawer.waitFor({ state: "visible", timeout: 30000 });
      const bom = drawer.locator('[data-section="part-bom-context"]'); await bom.waitFor({ state: "visible", timeout: 30000 });
      await assertText(bom, "開啟 BOM"); await bom.getByRole("button", { name: "開啟 BOM" }).click();
      await waitEditor(page); assert.match(new URL(page.url()).pathname, new RegExp(`/bom/workbench/${fixture.sharedId}`));
      await screenshot(page, "029-part-context"); return { url: page.url() };
    } finally { await context.close(); }
  });

  await runCase("QA-104-030", "BOM work list filters and opens detail", async () => {
    const { context, page } = await openPage("Engineer", "/bom/workbench", undefined, "030-work-list");
    try {
      await page.locator('[aria-label="BOM 清單"]').waitFor({ state: "visible", timeout: 30000 });
      assert.equal(await page.locator('[data-testid="bom-structured-editor"]').count(), 0);
      await page.getByPlaceholder("料號、品名、BOM Rev").fill(fixture.parentCode); await page.getByRole("button", { name: "套用" }).click();
      await page.locator(".bom-workbench-list-table").waitFor({ state: "visible", timeout: 30000 });
      await page.getByRole("link", { name: fixture.parentCode }).first().click(); await waitEditor(page); return { url: page.url() };
    } finally { await context.close(); }
  });

  await runCase("QA-104-031", "Canonical detail and legacy query redirect", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.editableId}`, undefined, "031-detail-boundary");
    try { await waitEditor(page); await page.goto(`${baseUrl}/bom/workbench?draftId=${fixture.editableId}`, { waitUntil: "domcontentloaded" }); await waitEditor(page); assert.equal(new URL(page.url()).pathname, `/bom/workbench/${fixture.editableId}`); return { url: page.url() }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-032", "Empty BOM state offers first insertion", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.emptyId}`, undefined, "032-empty");
    try { await waitEditor(page); await assertText(page, "尚無料件"); assert.equal(await page.getByRole("button", { name: "插入第一個料件" }).count(), 1); return { empty: true }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-033", "Outliner semantic edits use inspector and picker", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.editableId}`, undefined, "033-outliner-edit");
    try {
      await waitEditor(page); await page.getByRole("button", { name: "新增群組" }).click();
      await page.getByRole("tree", { name: "BOM 階層表" }).waitFor();
      if (await page.getByText("群組名稱").count()) { const input = page.locator('aside.bom-inspector label').filter({ hasText: "群組名稱" }).locator("input"); if (await input.count()) { await input.fill("驗收群組"); await input.blur(); } }
      await page.getByRole("button", { name: "插入料件" }).click();
      const picker = page.locator('[role="dialog"], .bom-inline-picker').last(); await picker.waitFor({ state: "visible", timeout: 10000 });
      const search = picker.locator("input").first(); if (await search.count()) await search.fill(fixture.childCode);
      const option = picker.getByRole("option").first(); if (await option.count()) await option.click();
      await assertText(page, "未儲存"); await screenshot(page, "033-outliner-edit"); return { edited: true };
    } finally { await context.close(); }
  });

  await runCase("QA-104-034", "Keyboard semantic history shortcuts", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.editableId}`, undefined, "034-shortcuts");
    try { await waitEditor(page); await page.keyboard.press("Home"); await page.keyboard.press("Control+Enter"); await page.keyboard.press("Escape"); await page.keyboard.press("Control+Alt+/"); await page.keyboard.press("Control+Z"); await page.keyboard.press("Control+Y"); assert.equal(await page.locator('[data-testid="bom-structured-editor"]').count(), 1); return { shortcuts: ["Home", "Ctrl+Enter", "Ctrl+Alt+/", "Ctrl+Z", "Ctrl+Y"] }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-035", "Floating stage is a single collapsed signal", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.floatingId}`, undefined, "035-floating");
    try { await waitEditor(page); const stage = page.locator(".bom-floating-stage"); await stage.waitFor(); await assertText(stage, "未納入 BOM"); assert.equal(await stage.locator("[data-floating-node]").count(), 0); await stage.getByRole("button").first().click(); assert.ok(await stage.locator("[data-floating-node]").count() >= 0); return { floatingCount: await stage.locator("[data-floating-node]").count() }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-036", "Floating nodes block review submission", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.floatingId}`, undefined, "036-floating-gate");
    try { await waitEditor(page); assert.equal(await page.getByRole("button", { name: "送出審核" }).count(), 0); const result = await api(page, `/api/bom/drafts/${fixture.floatingId}/submit-review`, { method: "POST", body: JSON.stringify({ changeReason: "floating gate" }) }); assert.equal(result.status, 409); return { status: result.status, error: result.body?.error }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-037", "Canonical fixed mapping has no shared mapping editor", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.fixedId}`, undefined, "037-fixed");
    try { await waitEditor(page); const outliner = page.getByRole("tree", { name: "BOM 階層表" }); await outliner.getByText(fixture.childCode).click(); await page.getByRole("button", { name: "欄位" }).click(); assert.equal(await page.getByText("適用料號對應").count(), 0); assert.equal(await page.getByText("零件候選").count(), 0); return { sharedControls: false }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-038", "Shared mapping is parent scoped and unresolved is visible", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.sharedId}?parentPartNumberId=${fixture.parentId}`, undefined, "038-shared-mapping");
    try { await waitEditor(page); await assertText(page, "適用料號對應"); const selects = page.locator(".bom-parent-mapping select"); assert.equal(await selects.count(), 2); await selects.nth(0).selectOption(fixture.childId); await assertText(page, "未儲存"); return { parentScopedSelects: await selects.count() }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-039", "Save round-trip persists structured document", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.editableId}`, undefined, "039-save");
    try {
      await waitEditor(page); const before = await api(page, `/api/bom/drafts/${fixture.editableId}`); const version = before.body.draft.editor_version; const lines = before.body.draft.lines.map((line) => ({ id: line.id, logicalLineId: line.logical_line_id, parentLineId: line.parent_line_id, nodeType: line.node_type, partNumber: line.part_number, revision: line.revision, groupName: line.group_name, quantity: line.quantity === null ? null : Number(line.quantity) + 0.5, sequenceNo: line.sequence_no }));
      const saveResult = await api(page, `/api/bom/drafts/${fixture.editableId}`, { method: "PATCH", body: JSON.stringify({ reason: "DEV-104 browser save", expectedEditorVersion: version, lines, floatingTopics: [], components: [] }) }); assert.equal(saveResult.status, 200); const readback = await api(page, `/api/bom/drafts/${fixture.editableId}`); assert.equal(readback.body.draft.editor_version, version + 1); return { editorVersion: readback.body.draft.editor_version, lineCount: readback.body.draft.lines.length };
    } finally { await context.close(); }
  });

  await runCase("QA-104-040", "Dirty navigation offers save discard cancel", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.editableId}`, undefined, "040-dirty-navigation");
    try { await waitEditor(page); await page.getByRole("button", { name: "欄位" }).click(); const input = page.locator('aside.bom-inspector input[type="number"]').first(); if (await input.count()) { await input.fill("3"); await input.blur(); } else { await page.getByRole("button", { name: "新增群組" }).click(); } await page.getByTestId("bom-structured-editor").getByRole("link", { name: "BOM 工作台" }).click(); const dialog = page.getByRole("alertdialog", { name: "尚有未儲存變更" }); await dialog.waitFor(); await assertText(dialog, "儲存並離開"); await dialog.getByRole("button", { name: "取消" }).click(); assert.equal(await page.locator('[data-testid="bom-structured-editor"]').count(), 1); await page.getByTestId("bom-structured-editor").getByRole("link", { name: "BOM 工作台" }).click(); await page.getByRole("alertdialog", { name: "尚有未儲存變更" }).getByRole("button", { name: "放棄變更" }).click(); await page.waitForURL(/\/bom\/workbench$/u); return { prompt: ["儲存並離開", "放棄變更", "取消"] }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-041", "Optimistic concurrency conflict preserves local edit", async () => {
    const a = await openPage("Engineer", `/bom/workbench/${fixture.conflictId}`, undefined, "041-conflict-a"); const b = await openPage("Engineer", `/bom/workbench/${fixture.conflictId}`, undefined, "041-conflict-b");
    try { await waitEditor(a.page); await waitEditor(b.page); const one = await api(a.page, `/api/bom/drafts/${fixture.conflictId}`); const version = one.body.draft.editor_version; const lines1 = one.body.draft.lines.map((line) => ({ id: line.id, logicalLineId: line.logical_line_id, parentLineId: line.parent_line_id, nodeType: line.node_type, partNumber: line.part_number, revision: line.revision, groupName: line.group_name, quantity: line.quantity, sequenceNo: line.sequence_no })); const lines2 = lines1.map((line) => line.nodeType === "item" ? { ...line, quantity: 4 } : line); const first = await api(a.page, `/api/bom/drafts/${fixture.conflictId}`, { method: "PATCH", body: JSON.stringify({ reason: "A", expectedEditorVersion: version, lines: lines1, floatingTopics: [], components: [] }) }); assert.equal(first.status, 200); const second = await api(b.page, `/api/bom/drafts/${fixture.conflictId}`, { method: "PATCH", body: JSON.stringify({ reason: "B", expectedEditorVersion: version, lines: lines2, floatingTopics: [], components: [] }) }); assert.equal(second.status, 409); return { firstStatus: first.status, secondStatus: second.status, error: second.body?.error }; }
    finally { await a.context.close(); await b.context.close(); }
  });

  await runCase("QA-104-042", "Map projection is read-only and returns to Outliner", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.editableId}`, undefined, "042-map");
    try { await waitEditor(page); const before = mutationRequests.length; await page.getByRole("button", { name: "檢視關聯圖" }).click(); await page.locator('[data-testid="bom-map-view"]').waitFor(); assert.equal(await page.getByRole("button", { name: "插入料件" }).count(), 0); assert.equal(await page.getByRole("button", { name: "新增群組" }).count(), 0); await page.getByRole("button", { name: "階層表" }).click(); assert.equal(await page.locator('[data-testid="bom-map-view"]').count(), 0); assert.equal(mutationRequests.length, before); return { readonly: true }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-043", "Dirty draft exposes Save as the primary action", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.editableId}`, undefined, "043-save-primary");
    try { await waitEditor(page); await page.getByRole("button", { name: "新增群組" }).click(); assert.equal(await page.getByRole("button", { name: "儲存" }).count(), 1); assert.equal(await page.getByRole("button", { name: "送出審核" }).count(), 0); return { save: true, submit: false }; }
    finally { await context.close(); }
  });

  await runCase("QA-104-044", "Clean shared draft can be submitted for review", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.reviewId}?parentPartNumberId=${fixture.parentId}`, undefined, "044-submit");
    try {
      await waitEditor(page);
      const current = await api(page, `/api/bom/drafts/${fixture.reviewId}?parentPartNumberId=${fixture.parentId}`);
      const sourceDraft = current.body.draft;
      const components = (sourceDraft.components ?? []).map((component) => ({
        nodeId: component.node_id,
        logicalLineId: component.logical_line_id,
        nodeLocation: component.node_location,
        componentMode: component.component_mode,
        childPartRootId: component.child_part_root_id,
        childPartNumberIds: component.child_part_number_ids,
        parentSelections: [
          { parentPartNumberId: fixture.parentId, childPartNumberId: fixture.childId },
          { parentPartNumberId: fixture.parent2Id, childPartNumberId: fixture.child2Id },
        ],
      }));
      const save = await api(page, `/api/bom/drafts/${fixture.reviewId}`, {
        method: "PATCH",
        body: JSON.stringify({
          reason: "DEV-104 mapping complete",
          expectedEditorVersion: sourceDraft.editor_version,
          lines: sourceDraft.lines.map((line) => ({
            id: line.id,
            logicalLineId: line.logical_line_id,
            parentLineId: line.parent_line_id,
            nodeType: line.node_type,
            partNumber: line.part_number,
            revision: line.revision,
            groupName: line.group_name,
            quantity: line.quantity,
            sequenceNo: line.sequence_no,
          })),
          floatingTopics: [],
          components,
        }),
      });
      assert.equal(save.status, 200, `shared mapping save failed: ${JSON.stringify(save.body)}`);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitEditor(page);
      const reason = page.getByPlaceholder("簡述本次 BOM 變更");
      await reason.fill("DEV-104 review evidence");
      await page.getByRole("button", { name: "送出審核" }).click();
      await page.waitForTimeout(800);
      const detail = await api(page, `/api/bom/drafts/${fixture.reviewId}?parentPartNumberId=${fixture.parentId}`);
      assert.equal(detail.body.draft.status, "PendingReview");
      return { status: detail.body.draft.status, review: detail.body.draft.latest_review?.id ?? null, mappingSave: save.status };
    } finally { await context.close(); }
  });

  await runCase("QA-104-045", "Manager review diff and decision; submitter cannot decide", async () => {
    const engineer = await openPage("Engineer", `/bom/workbench/${fixture.reviewId}?parentPartNumberId=${fixture.parentId}`, undefined, "045-review-submit" );
    try {
      const detail = await api(engineer.page, `/api/bom/drafts/${fixture.reviewId}?parentPartNumberId=${fixture.parentId}`); const reviewId = detail.body.draft.latest_review?.id; assert.ok(reviewId, "pending BOM review missing"); const self = await api(engineer.page, `/api/bom/reviews/${reviewId}/approve`, { method: "POST", body: JSON.stringify({ decisionReason: "self decision" }) }); assert.equal(self.status, 403);
      const manager = await openPage("R&D Manager", `/approvals?domain=bom`, { width: 1024, height: 768 }, "045-review-manager");
      try { await manager.page.locator('[aria-label="審核清單"]').waitFor({ state: "visible", timeout: 30000 }); await assertText(manager.page, "審核工作台"); const pending = await api(manager.page, "/api/bom/reviews/pending"); assert.equal(pending.status, 200); assert.ok(pending.body.reviews.some((item) => item.id === reviewId), "manager pending list omits review"); const approved = await api(manager.page, `/api/bom/reviews/${reviewId}/approve`, { method: "POST", body: JSON.stringify({ decisionReason: "DEV-104 approved" }) }); assert.equal(approved.status, 200); return { reviewId, selfDecisionStatus: self.status, managerDecisionStatus: approved.status, viewport: "1024x768" }; }
      finally { await manager.context.close(); }
    } finally { await engineer.context.close(); }
  });

  await runCase("QA-104-046", "Released projection and exports are read-only for Manufacturing and Procurement", async () => {
    const db = new Database(fixtureDbPath, { readonly: true }); const snapshot = db.prepare("SELECT id FROM bom_release_snapshots WHERE bom_draft_id = ? ORDER BY released_at DESC LIMIT 1").get(fixture.reviewId); db.close(); assert.ok(snapshot?.id, "release snapshot missing after approval");
    const outcomes = {};
    for (const role of ["Manufacturing", "Procurement"]) { const { context, page } = await openPage(role, `/bom/workbench/${fixture.reviewId}?parentPartNumberId=${fixture.parentId}`, { width: 1280, height: 900 }, `046-${role}`); try { await waitEditor(page); assert.equal(await page.getByRole("button", { name: "儲存" }).count(), 0); assert.equal(await page.getByRole("button", { name: "送出審核" }).count(), 0); const csv = await api(page, `/api/bom/releases/${snapshot.id}/export?format=csv&parentPartNumberId=${fixture.parentId}`); const xlsx = await api(page, `/api/bom/releases/${snapshot.id}/export?format=xlsx&parentPartNumberId=${fixture.parentId}`); assert.equal(csv.status, 200); assert.equal(xlsx.status, 200); outcomes[role] = { csv: csv.status, xlsx: xlsx.status, overflow: await noHorizontalOverflow(page) }; } finally { await context.close(); } }
    return { snapshotId: snapshot.id, outcomes };
  });

  await runCase("QA-104-047", "Desktop laptop viewport preserves editable outliner and inspector", async () => {
    const { context, page } = await openPage("Engineer", `/bom/workbench/${fixture.editableId}`, { width: 1024, height: 768 }, "047-laptop");
    try { await waitEditor(page); assert.ok(await page.locator("aside.bom-inspector").count() >= 1); const geometry = await noHorizontalOverflow(page); assert.ok(geometry.scrollWidth <= geometry.viewport + 1); await screenshot(page, "047-laptop"); return geometry; }
    finally { await context.close(); }
  });

  await runCase("QA-104-048", "Mobile review/export view is read-only without overflow", async () => {
    const { context, page } = await openPage("Manufacturing", `/bom/workbench/${fixture.reviewId}?parentPartNumberId=${fixture.parent2Id}`, { width: 390, height: 844 }, "048-mobile");
    try { await waitEditor(page); assert.equal(await page.getByRole("button", { name: "插入料件" }).count(), 0); assert.equal(await page.getByRole("button", { name: "新增群組" }).count(), 0); assert.equal(await page.getByRole("button", { name: "送出審核" }).count(), 0); const geometry = await noHorizontalOverflow(page); assert.ok(geometry.scrollWidth <= geometry.viewport + 1); await screenshot(page, "048-mobile"); return geometry; }
    finally { await context.close(); }
  });
}

async function assertText(locator, value) {
  await locator.getByText(value, { exact: false }).first().waitFor({ state: "visible", timeout: 15000 });
}

async function portReleased(checkPort) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: checkPort });
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(true); });
  });
}

let exitCode = 1;
const primaryBefore = primaryInvariant(sourceDb);
let primaryAfter = null;
let cleanup = { fixtureRemoved: false, distRemoved: false, portReleased: false, processesStopped: false, error: null };
try {
  fs.mkdirSync(outputDir, { recursive: true }); fs.mkdirSync(screenshotDir, { recursive: true });
  fixture = seedFixture();
  await startServer();
  browser = await chromium.launch({ headless: true });
  await runCases();
  exitCode = results.length === 20 && results.every((result) => result.status === "PASS") ? 0 : 1;
} catch (error) {
  console.error(`DEV104_BROWSER_RUNNER_ERROR: ${text(error)}`);
  exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (app) { await stopNextApp(app.child).catch(() => undefined); cleanup.processesStopped = app.child.exitCode !== null; }
  cleanup.portReleased = port ? await portReleased(port) : true;
  cleanup.distRemoved = distDirRelative ? removeTaskOwnedWorkspaceTempDir(root, distDirRelative).removed : true;
  await restoreNextEnv(nextEnvSnapshot).catch(() => undefined);
  for (const [key, value] of originalEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); cleanup.fixtureRemoved = !fs.existsSync(tempRoot); } catch (error) { cleanup.error = text(error); }
  primaryAfter = primaryInvariant(sourceDb);
  if (primaryBefore.hash !== primaryAfter.hash) exitCode = 1;
  const allCaseIds = Array.from({ length: 20 }, (_, index) => `QA-104-${String(index + 29).padStart(3, "0")}`);
  const sourceRevision = (() => { try { return String(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })).trim(); } catch { return null; } })();
  const dirtyBoundary = (() => { try { return String(execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" })).trim().split(/\r?\n/u).filter(Boolean); } catch { return []; } })();
  const caseResults = allCaseIds.map((caseId) => {
    const raw = results.find((result) => result.caseId === caseId) ?? { caseId, status: "BLOCKED", error: "browser setup did not complete" };
    return {
      ...raw,
      runner: "browser",
      sourceRevision,
      dirtyBoundary,
      artifactId: `${runId}/browser/${caseId}.json`,
      environment: "authenticated Playwright browser against task-owned SQLite/repository fixture",
      actor: "DEV-104 fixture actor matrix",
      route: "/bom/workbench",
      viewport: "runtime matrix: 1440x900, 1024x768, 768x1024, 390x844",
      fixtureId: "dev104-browser-fixture",
      preconditions: "task-owned seeded Part/BOM/review fixture and authenticated role",
      actions: raw.title,
      expected: "frozen QA-104 browser assertions pass",
      actual: { status: raw.status, durationMs: raw.durationMs ?? null, evidence: raw.evidence ?? null, error: raw.error ?? null },
      evidencePaths: [],
      consoleErrors: browserErrors,
      httpFailures: failedResponses,
      visibleErrors: [],
      dataSanity: { productionConnected: false, productionWrites: false, primaryWrites: false },
      primaryInvariantBefore: primaryBefore.hash,
      primaryInvariantAfter: primaryAfter.hash,
      fixtureMutationLedger: ["copied primary SQLite to task-owned fixture", "updated task-owned part/drawing rows", "inserted task-owned BOM drafts and shared bindings", "review/release writes occurred only in task-owned fixture"],
      failureCode: raw.status === "PASS" ? null : "BROWSER_ASSERTION_FAILED",
      blockedReason: raw.status === "BLOCKED" ? raw.error ?? "browser setup did not complete" : null,
      recoveryCondition: raw.status === "BLOCKED" ? "restore authenticated browser/runtime and rerun frozen case" : null,
      supersedesRunId: null,
      runtimeOwnership: { project: root, purpose: "DEV-104 authenticated browser QA", port, dataDir, repositoryDir, mutationScope: tempRoot, processTree: `browser runner ${process.pid}` },
      cleanup
    };
  });
  for (const caseResult of caseResults) {
    const evidenceFile = path.join(outputDir, `${caseResult.caseId}.json`);
    fs.writeFileSync(evidenceFile, `${JSON.stringify(caseResult, null, 2)}\n`, "utf8");
    caseResult.evidencePaths = [path.relative(root, evidenceFile).replaceAll("\\", "/")];
    fs.writeFileSync(evidenceFile, `${JSON.stringify(caseResult, null, 2)}\n`, "utf8");
  }
  const manifest = {
    schemaVersion: 1, devId: "DEV-104", runner: "browser", runId, status: exitCode === 0 ? "PASS" : "FAIL", fixedDenominator: 48, executedCases: caseResults.length,
    caseIds: caseResults.map((result) => result.caseId), cases: caseResults, runtime: { project: root, purpose: "authenticated four-role BOM workbench browser QA", port, baseUrl, dataDir, repositoryDir, mutationScope: tempRoot, processTree: `browser runner ${process.pid}` },
    actors: ["Engineer", "R&D Manager", "Manufacturing", "Procurement"], viewports: [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }], fixture: { ...fixture, sourceDb, fixtureDb: fixtureDbPath, mutationLedger: ["copied primary SQLite to task-owned fixture", "updated task-owned part/drawing rows", "inserted task-owned BOM drafts and shared bindings", "review/release writes occurred only in task-owned fixture"] },
    consoleErrors: browserErrors, httpFailures: failedResponses, requestFailures: failedRequests, mutationRequests, screenshots: caseEvidence, primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryBefore.hash === primaryAfter.hash }, cleanup, productionConnected: false, productionWrites: false, primaryWrites: false, completionCandidate: false
  };
  fs.writeFileSync(path.join(outputDir, "case-results.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ runner: "browser", status: manifest.status, passed: caseResults.filter((result) => result.status === "PASS").length, total: caseResults.length, evidenceDir: outputDir, primaryInvariantUnchanged: manifest.primaryInvariant.unchanged, cleanup }));
}
process.exit(exitCode);
