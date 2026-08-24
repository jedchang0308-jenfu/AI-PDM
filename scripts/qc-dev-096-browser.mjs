#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { fixture, seedDev096Fixture } from "./dev096-qc-fixture.mjs";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV096-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.resolve(process.env.DEV096_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-096", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev096-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const checks = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const responses = [];
let app = null;
let browser = null;
let port = null;

function check(cases, label, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ cases, label, pass, detail });
  if (!pass) throw new Error(`${label}: ${detail}`);
  console.log(`PASS ${label}`);
}

function monitor(page) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
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

  await createButton.click();
  const dialog = page.getByRole("dialog", { name: "建立 BOM" });
  await dialog.waitFor({ state: "visible", timeout: 30000 });
  await dialog.getByText("Z960103", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  const current = dialog.locator("label.part-bom-candidate").filter({ hasText: "Z960101" }).locator("input[type=checkbox]");
  const blue = dialog.locator("label.part-bom-candidate").filter({ hasText: "Z960102" }).locator("input[type=checkbox]");
  check([11, 12, 14, 61, 62], "same-root Parent candidates are visible and multi-selectable", await dialog.getByText("Z960103", { exact: true }).count() === 1 && await blue.count() === 1, "candidate list mismatch");
  check([13, 63], "current Parent is required and locked", await current.isChecked() && await current.isDisabled(), "current Parent checkbox state mismatch");
  check([61, 68], "dialog receives initial keyboard focus", await dialog.getByRole("button", { name: "取消", exact: true }).evaluate((element) => element === document.activeElement), "cancel button is not focused");
  await blue.check();
  check([15, 64], "color variant Parent can share one BOM selection", await blue.isChecked(), "blue Parent was not selected");
  await page.screenshot({ path: path.join(outputDir, "assembly-multiselect.png"), fullPage: true });

  await dialog.getByRole("button", { name: "建立 BOM", exact: true }).click();
  await page.waitForURL(/\/bom\/workbench\//u, { timeout: 30000 });
  await page.locator('section.bom-workbench-page[aria-label="BOM 工作台"]').waitFor({ state: "visible", timeout: 30000 });
  await page.getByText("Z960101 · BOM Rev 1", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  check([16, 17, 18, 69], "create commits one shared Draft and opens contextual workbench", page.url().includes(`parentPartNumberId=${fixture.parents.red}`), page.url());
  await page.screenshot({ path: path.join(outputDir, "shared-bom-workbench.png"), fullPage: true });

  const readback = new Database(databasePath, { readonly: true });
  const created = readback.prepare(`SELECT draft.id, draft.bom_revision, draft.status, draft.definition_id,
      (SELECT COUNT(*) FROM bom_draft_parent_bindings binding WHERE binding.bom_draft_id=draft.id) AS parent_count
    FROM bom_drafts draft WHERE draft.definition_id IS NOT NULL ORDER BY draft.created_at DESC LIMIT 1`).get();
  const foreignKeys = readback.pragma("foreign_key_check");
  readback.close();
  check([11, 16, 17, 18, 51], "visible selection matches committed relational projection", created?.bom_revision === "1" && created?.status === "Draft" && Number(created?.parent_count) === 2 && foreignKeys.length === 0, JSON.stringify({ created, foreignKeys }));

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
  browserEvidence: { screenshots: ["assembly-multiselect.png", "shared-bom-workbench.png"], consoleErrors, pageErrors, failedRequests }
};
fs.writeFileSync(path.join(outputDir, "browser.json"), `${JSON.stringify(result, null, 2)}\n`);
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); } catch {}
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
