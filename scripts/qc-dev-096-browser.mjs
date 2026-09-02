#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { fixture, seedDev096Fixture } from "./dev096-qc-fixture.mjs";
import { createTaskOwnedNextTsconfig, getFreePort, restoreNextEnv, snapshotNextEnv, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV096-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.resolve(process.env.DEV096_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-096", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev096-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const nextEnvSnapshot = snapshotNextEnv(root);
const checks = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const responses = [];
const screenshots = [];
let expectedConflictConsoleErrors = 0;
let app = null;
let browser = null;
let port = null;
let nextTsconfig = null;

function check(cases, label, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ cases, label, pass, detail });
  if (!pass) throw new Error(`${label}: ${detail}`);
  console.log(`PASS ${label}`);
}

function monitor(page) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (expectedConflictConsoleErrors > 0 && message.text().includes("server responded with a status of 409")) {
      expectedConflictConsoleErrors -= 1;
      return;
    }
    consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    if (error !== "net::ERR_ABORTED") failedRequests.push({ url: request.url(), error });
  });
  page.on("response", (response) => responses.push({ status: response.status(), url: response.url() }));
}

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
const database = new Database(databasePath);
database.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
database.close();

Object.assign(process.env, {
  NODE_ENV: "development",
  PDM_AUTH_MODE: "legacy",
  PDM_DB_PROVIDER: "sqlite",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
  PDM_NEXT_DIST_DIR: ".tmp/qc-dev096-browser-pending",
  PDM_BUILD_COMMIT: "dev096-browser-fixture",
  PDM_ASSEMBLY_SHARED_BOM_V1: "true",
  PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
  PDM_BOM_XMIND_EDITOR_V2_ENABLED: "true"
});
const fixtureLedger = seedDev096Fixture();
seedCanonicalPartWorkbench();

try {
  port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  process.env.PDM_NEXT_DIST_DIR = `.tmp/qc-dev096-browser-${port}`;
  nextTsconfig = createTaskOwnedNextTsconfig(root, `dev096-${port}`, process.env.PDM_NEXT_DIST_DIR);
  process.env.PDM_NEXT_TSCONFIG_PATH = nextTsconfig.relativePath;
  console.log(JSON.stringify({
    runtimeDeclaration: {
      project: root,
      purpose: "DEV-096 isolated browser validation",
      port,
      owningProcessTree: "this runner -> task-owned Next.js child",
      cleanupCondition: "browser closed, exact Next.js child stopped, port released",
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      mutationScope: taskRoot
    }
  }));
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput, 90000);
  browser = await chromium.launch({ headless: true });
  for (const [role, allowed] of [["Engineer", true], ["R&D Manager", true], ["Admin", true], ["Manufacturing", false], ["Procurement", false]]) {
    const roleContext = await browser.newContext();
    const roleLogin = await roleContext.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role } });
    const candidates = await roleContext.request.get(`${baseUrl}/api/bom/applicability-candidates?contextPartNumberId=${fixture.parents.red}`);
    check(
      allowed ? [47, 49, 50] : [48, 51, 52],
      `${role} candidate capability is enforced`,
      roleLogin.status() === 200 && candidates.status() === (allowed ? 200 : 403),
      `login=${roleLogin.status()} candidates=${candidates.status()}`
    );
    await roleContext.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Engineer" } });
  check([47, 49], "authenticated Engineer session is established", login.status() === 200, `status=${login.status()}`);

  const page = await context.newPage();
  monitor(page);
  await page.goto(`${baseUrl}/parts`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible", timeout: 30000 });
  const partRow = page.getByRole("button", { name: "Z960101", exact: true });
  await partRow.waitFor({ state: "visible", timeout: 30000 });
  await partRow.click();
  const createButton = page.getByRole("button", { name: "建立 BOM", exact: true });
  await createButton.waitFor({ state: "visible", timeout: 30000 });
  check([9, 10, 61], "assembly Part drawer is the only create entry", await createButton.count() === 1, `count=${await createButton.count()}`);

  const drawingPage = await context.newPage();
  monitor(drawingPage);
  await drawingPage.goto(`${baseUrl}/numbering/drawings?query=Z960101-M`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await drawingPage.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30000 });
  await drawingPage.locator(".canonical-row-open").first().waitFor({ state: "visible", timeout: 30000 });
  await drawingPage.locator(".canonical-row-open").first().click();
  await drawingPage.getByRole("complementary", { name: /Z960101-M/u }).waitFor({ state: "visible", timeout: 30000 });
  check([10], "drawing drawer never exposes the BOM create action", await drawingPage.getByRole("button", { name: "建立 BOM", exact: true }).count() === 0);
  await drawingPage.close();

  let releaseCandidateRequest;
  const candidateDelay = new Promise((resolve) => { releaseCandidateRequest = resolve; });
  await page.route("**/api/bom/applicability-candidates?**", async (route) => {
    await candidateDelay;
    await route.continue();
  });
  await createButton.click();
  const dialog = page.getByRole("dialog", { name: "建立 BOM" });
  await dialog.waitFor({ state: "visible", timeout: 30000 });
  check([63, 67], "create dialog renders a disabled loading state", await dialog.getByRole("status").getByText("載入中…", { exact: true }).count() === 1 && await dialog.getByRole("button", { name: "建立 BOM", exact: true }).isDisabled());
  releaseCandidateRequest();
  await dialog.getByText("Z960103", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  await page.unroute("**/api/bom/applicability-candidates?**");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 30000 });
  check([68], "Escape closes the dialog and returns focus to the trigger", await createButton.evaluate((element) => element === document.activeElement));
  await createButton.click();
  await dialog.getByText("Z960103", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  const current = dialog.locator("label.part-bom-candidate").filter({ hasText: "Z960101" }).locator("input[type=checkbox]");
  const blue = dialog.locator("label.part-bom-candidate").filter({ hasText: "Z960102" }).locator("input[type=checkbox]");
  check([11, 12, 14, 61, 62], "same-root Parent candidates are visible and multi-selectable", await dialog.getByText("Z960103", { exact: true }).count() === 1 && await blue.count() === 1, "candidate list mismatch");
  check([13, 63], "current Parent is required and locked", await current.isChecked() && await current.isDisabled(), "current Parent checkbox state mismatch");
  check([61, 68], "dialog receives initial keyboard focus", await dialog.getByRole("button", { name: "取消", exact: true }).evaluate((element) => element === document.activeElement), "cancel button is not focused");
  await blue.check();
  check([15, 64], "color variant Parent can share one BOM selection", await blue.isChecked(), "blue Parent was not selected");
  await page.screenshot({ path: path.join(outputDir, "assembly-multiselect.png"), fullPage: true });
  screenshots.push("assembly-multiselect.png");

  await page.route("**/api/bom/drafts", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "BOM_APPLICABILITY_STALE", message: "候選資料已更新，請保留選擇後重試", details: {}, correlationId: "dev096-browser-retry" })
    });
  });
  expectedConflictConsoleErrors += 1;
  await dialog.getByRole("button", { name: "建立 BOM", exact: true }).click();
  await dialog.getByRole("alert").waitFor({ state: "visible", timeout: 30000 });
  check([67, 79], "failed create preserves the dialog and multi-selection for retry", await dialog.isVisible() && await blue.isChecked(), await dialog.getByRole("alert").innerText());
  await page.unroute("**/api/bom/drafts");
  await dialog.getByRole("button", { name: "建立 BOM", exact: true }).click();
  await page.waitForURL(/\/bom\/workbench\//u, { timeout: 30000 });
  await page.locator('section.bom-structured-editor[aria-label="BOM 工作台編輯器"]').waitFor({ state: "visible", timeout: 30000 });
  await page.getByText("Z960101 · BOM Rev 1", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  check([16, 17, 18, 69], "create commits one shared Draft and opens contextual workbench", page.url().includes(`parentPartNumberId=${fixture.parents.red}`), page.url());
  await page.screenshot({ path: path.join(outputDir, "shared-bom-workbench.png"), fullPage: true });
  screenshots.push("shared-bom-workbench.png");

  const readback = new Database(databasePath, { readonly: true });
  const created = readback.prepare(`SELECT draft.id, draft.bom_revision, draft.status, draft.definition_id,
      (SELECT COUNT(*) FROM bom_draft_parent_bindings binding WHERE binding.bom_draft_id=draft.id) AS parent_count
    FROM bom_drafts draft WHERE draft.definition_id IS NOT NULL ORDER BY draft.created_at DESC LIMIT 1`).get();
  const foreignKeys = readback.pragma("foreign_key_check");
  readback.close();
  check([11, 16, 17, 18, 51], "visible selection matches committed relational projection", created?.bom_revision === "1" && created?.status === "Draft" && Number(created?.parent_count) === 2 && foreignKeys.length === 0, JSON.stringify({ created, foreignKeys }));

  const logicalLineId = "00000000-0000-4000-8000-000000000065";
  const nodeId = "dev096-browser-line-65";
  const save = await context.request.patch(`${baseUrl}/api/bom/drafts/${created.id}`, {
    data: {
      expectedEditorVersion: 0,
      reason: "DEV-096 browser parent mapping proof",
      lines: [{ id: nodeId, logicalLineId, parentLineId: null, nodeType: "item", partNumber: "Z960201", revision: null, groupName: null, quantity: 4, sequenceNo: 1 }],
      floatingTopics: [],
      components: [{
        nodeId,
        logicalLineId,
        nodeLocation: "tree",
        componentMode: "by_parent",
        childPartNumberIds: [fixture.children.red, fixture.children.blue],
        parentSelections: [
          { parentPartNumberId: fixture.parents.red, childPartNumberId: fixture.children.red },
          { parentPartNumberId: fixture.parents.blue, childPartNumberId: fixture.children.blue }
        ]
      }]
    }
  });
  check([65], "shared component mapping is accepted by the HTTP save boundary", save.status() === 200, `status=${save.status()} body=${await save.text()}`);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator('section.bom-structured-editor[aria-label="BOM 工作台編輯器"]').waitFor({ state: "visible", timeout: 30000 });
  const mapping = page.locator('section[aria-label="適用料號對應"]');
  await mapping.waitFor({ state: "visible", timeout: 30000 });
  const mappingSelects = mapping.locator("select");
  check([65], "inspector exposes one explicit child selector for each selected Parent", await mappingSelects.count() === 2 && await mapping.getByText("Z960101", { exact: false }).count() > 0 && await mapping.getByText("Z960102", { exact: false }).count() > 0, `selects=${await mappingSelects.count()}`);
  await mappingSelects.nth(0).focus();
  await page.keyboard.press("Tab");
  check([65, 68], "parent mapping is keyboard traversable", await mappingSelects.nth(1).evaluate((element) => element === document.activeElement));
  await mappingSelects.nth(0).selectOption(fixture.children.blue);
  await page.getByText("未儲存", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  await page.getByTestId("bom-structured-editor").getByRole("link", { name: "BOM 工作台", exact: true }).click();
  const navigationDialog = page.getByRole("alertdialog", { name: "尚有未儲存變更" });
  check([65, 79], "dirty mapping blocks navigation until saved or reverted", page.url().includes(`/bom/workbench/${created.id}`) && await navigationDialog.count() === 1, page.url());
  await navigationDialog.getByRole("button", { name: "取消" }).click();
  await page.keyboard.press("Control+z");
  await page.getByText("已同步", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  await page.screenshot({ path: path.join(outputDir, "parent-child-mapping.png"), fullPage: true });
  screenshots.push("parent-child-mapping.png");

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "landscape-tablet", width: 1024, height: 768 },
    { name: "portrait-tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(150);
    const geometry = await page.evaluate(() => {
      const root = document.documentElement;
      const workbench = document.querySelector('section.bom-structured-editor[aria-label="BOM 工作台編輯器"]');
      const rect = workbench?.getBoundingClientRect();
      return {
        documentWidth: root.scrollWidth,
        viewportWidth: root.clientWidth,
        workbenchLeft: rect?.left ?? -1,
        workbenchRight: rect?.right ?? Number.POSITIVE_INFINITY,
        actionVisible: [...document.querySelectorAll("section.bom-structured-editor button")].some((button) => button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0)
      };
    });
    check([66], `${viewport.name} keeps the workbench and primary action inside the viewport`, geometry.documentWidth <= geometry.viewportWidth + 1 && geometry.workbenchLeft >= 0 && geometry.workbenchRight <= geometry.viewportWidth + 1 && geometry.actionVisible, JSON.stringify(geometry));
    const screenshot = `viewport-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true });
    screenshots.push(screenshot);
  }

  await context.close();
  check([67, 68, 79], "browser console, page and network sweep is clean", consoleErrors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0 && responses.every((response) => response.status < 500), JSON.stringify({ consoleErrors, pageErrors, failedRequests, serverErrors: responses.filter((response) => response.status >= 500) }));
} catch (error) {
  checks.push({ cases: [], label: "first failure", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  if (browser) await browser.close();
  if (app) await stopNextApp(app.child);
}

const portReleased = port === null || await isPortReleased(port);
const result = {
  runner: "browser",
  status: checks.every((item) => item.pass) && portReleased ? "PASS" : "FAIL",
  runId,
  runtime: { project: root, purpose: "DEV-096 isolated browser validation", port, dataDir, repositoryDir, cleanupCondition: "browser and task-owned Next process stopped", portReleased },
  productionWrites: false,
  fixtureLedger,
  checks,
  cases: [...new Set(checks.filter((item) => item.pass).flatMap((item) => item.cases))].sort((a, b) => a - b),
  browserEvidence: { screenshots, consoleErrors, pageErrors, failedRequests }
};
fs.writeFileSync(path.join(outputDir, "browser.json"), `${JSON.stringify(result, null, 2)}\n`);
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); } catch {}
try { fs.rmSync(path.join(root, ".tmp", `qc-dev096-browser-${port}`), { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch {}
if (nextTsconfig) try { fs.rmSync(nextTsconfig.absolutePath, { force: true }); } catch {}
const nextEnvRestore = await restoreNextEnv(nextEnvSnapshot);
if (!nextEnvRestore.restored) console.warn(`DEV096 next-env cleanup pending: ${nextEnvRestore.error}`);
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((item) => item.pass).length, total: checks.length, portReleased }));
if (result.status !== "PASS") process.exitCode = 1;

async function isPortReleased(targetPort) {
  try {
    const response = await fetch(`http://127.0.0.1:${targetPort}/login`, { signal: AbortSignal.timeout(500) });
    return !response;
  } catch { return true; }
}

function seedCanonicalPartWorkbench() {
  const fixtureDatabase = new Database(databasePath);
  const now = "2026-08-24T00:00:00.000Z";
  fixtureDatabase.prepare(`UPDATE pdm_workbench_state_authority_control
    SET mode='canonical_only', expected_commit='dev096-browser-fixture', schema_hash='dev090-v1', row_version=row_version+1, switched_at=?
    WHERE id=1`).run(now);
  const parts = fixtureDatabase.prepare("SELECT id, company_id FROM part_numbers WHERE company_id=? ORDER BY id").all(fixture.companyId);
  const insertAggregate = fixtureDatabase.prepare(`INSERT OR IGNORE INTO pdm_workbench_aggregates
    (id,company_id,entity_type,canonical_entity_id,open_branch_count,row_version,updated_at)
    VALUES (?,?,'part',?,0,1,?)`);
  const insertState = fixtureDatabase.prepare(`INSERT OR IGNORE INTO canonical_workbench_states
    (id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling,row_version,created_at,updated_at)
    VALUES (?,?,'part',?,'part_formal',NULL,NULL,NULL,'none',1,?,?)`);
  const transaction = fixtureDatabase.transaction(() => {
    for (const part of parts) {
      insertAggregate.run(stableUuid("aggregate", part.id), part.company_id, part.id, now);
      insertState.run(stableUuid("state", part.id), part.company_id, part.id, now, now);
    }
    const drawingId = "dev096-canonical-drawing-red";
    const revisionId = "dev096-canonical-drawing-red-rev-1";
    fixtureDatabase.prepare(`INSERT INTO drawings
      (id,company_id,drawing_number,lifecycle_state,formal_drawing_number_id,part_root_id,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,owner_id,row_version,created_by,created_at,updated_at,released_at)
      VALUES (?,?,?,'released',?,?,?,'Primary manufacturing',1,1,?,1,?,?,?,?)`).run(
      drawingId,
      fixture.companyId,
      "Z960101-M",
      `${fixture.parents.red}-drawing`,
      fixture.parentRootId,
      "M",
      fixture.users.engineer,
      fixture.users.engineer,
      now,
      now,
      now
    );
    fixtureDatabase.prepare(`INSERT INTO drawing_revisions
      (id,company_id,drawing_id,revision,lifecycle_state,policy_snapshot_json,row_version,created_by,created_at,updated_by,updated_at,released_at)
      VALUES (?,?,?,'1','released','{}',1,?,?,?,?,?)`).run(revisionId, fixture.companyId, drawingId, fixture.users.engineer, now, fixture.users.engineer, now, now);
    fixtureDatabase.prepare(`INSERT INTO pdm_workbench_aggregates
      (id,company_id,entity_type,canonical_entity_id,open_branch_count,row_version,updated_at)
      VALUES (?,?,'drawing',?,0,1,?)`).run(stableUuid("aggregate", drawingId), fixture.companyId, drawingId, now);
    fixtureDatabase.prepare(`INSERT INTO canonical_workbench_states
      (id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling,row_version,created_at,updated_at)
      VALUES (?,?,'drawing',?,'drawing_production',NULL,?,NULL,'none',1,?,?)`).run(stableUuid("state", drawingId), fixture.companyId, drawingId, revisionId, now, now);
    fixtureDatabase.prepare(`INSERT OR IGNORE INTO pdm_local_data_migrations (version,applied_at,detail_json)
      VALUES ('dev-064-unified-drawing-aggregate-v1',?,?)`).run(now, JSON.stringify({ source: "DEV-096 disposable canonical drawing fixture" }));
  });
  transaction();
  fixtureDatabase.close();
}

function stableUuid(kind, source) {
  const bytes = crypto.createHash("sha256").update(`dev096-browser|${kind}|${source}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
