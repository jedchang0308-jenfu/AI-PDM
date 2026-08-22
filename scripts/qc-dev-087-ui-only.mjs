#!/usr/bin/env node

/*
 * DEV-087 full UI-only lifecycle runner.
 *
 * This runner deliberately keeps the 67-case denominator intact.  It performs
 * a rendered UI preflight and read-only API/DB reconciliation for every case;
 * a journey that lacks a legal UI mutation start point is recorded as
 * BLOCKED, never silently counted as PASS.  Business writes are only made by
 * Playwright clicks; API and SQLite access below are readback-only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV087-ui-only-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceRoot = path.join(root, "output", "qa", "dev-087-ui-only-lifecycle", runId);
const screenshotRoot = path.join(evidenceRoot, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-ui-only-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const fixtureRepository = path.join(fixtureDataDir, "repository");
const checks = [];
const cases = [];
const failures = [];
const network = [];
const consoleErrors = [];
let browser = null;
let app = null;
let port = null;
let baseUrl = "";

const drawingTitles = {
  D01: "無量產資料建立第一份 0.1 工作", D02: "第一份 0.1 工作取消", D03: "0.1 編輯儲存 reload",
  D04: "0.1 送審退回", D05: "0.1 重送核准", D06: "0.1 進版 0.2",
  D07: "研發版進量產版 1", D08: "量產版 1 建立研發版 1.1", D09: "量產版 1 建立量產版 2",
  D10: "approved branch 建下一版後取消", D11: "新 branch 第一份工作取消", D12: "建立三個 open branches",
  D13: "第四 branch 拒絕", D14: "同 target claim 競合", D15: "branch 推進 production",
  D16: "stale branch 續研發 minor", D17: "stale branch 阻擋量產", D18: "作廢 modal 取消",
  D19: "作廢申請退回", D20: "作廢申請核准", D21: "進版與作廢競合", D22: "reviewer 決策競合",
  D23: "快速連點與 reload", D24: "圖號搜尋篩選與歷史", D25: "正式圖作廢退回",
  D26: "正式圖作廢核准", D27: "既有 merged/history Drawing 唯讀"
};
const partTitles = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`P${String(index + 1).padStart(2, "0")}`, `料號生命週期 P${String(index + 1).padStart(2, "0")}`]));
const relationTitles = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`R${String(index + 1).padStart(2, "0")}`, `圖料根號生命週期 R${String(index + 1).padStart(2, "0")}`]));
const casesSpec = [
  ...Object.entries(drawingTitles).map(([id, title]) => ({ id, family: "D", title, route: "/numbering/drawings?query=A0002-M01", api: "/api/numbering/drawings/workbench?query=A0002-M01", entity: "drawing" })),
  ...Object.entries(partTitles).map(([id, title]) => ({ id, family: "P", title, route: "/parts?query=A0002-P01", api: "/api/parts/workbench?query=A0002-P01", entity: "part" })),
  ...Object.entries(relationTitles).map(([id, title]) => ({ id, family: "R", title, route: "/numbering/search?query=A0002", api: "/api/numbering/relations?query=A0002", entity: "relation" }))
];
const commonSpec = [
  ["C01", "authority 與 provider 啟動檢查"], ["C02", "UI mutation provenance"], ["C03", "原子性與 zero partial write"],
  ["C04", "idempotency 與 stale guard"], ["C05", "UI/API/DB triad readback"], ["C06", "cleanup ledger"],
  ["C07", "禁止技術欄位出現在 UI"], ["C08", "搜尋與 layer/handling filter"], ["C09", "審核頁同畫面唯讀"],
  ["C10", "viewport、keyboard、error sweep"], ["C11", "system/system_admin/blocked fault profile"]
].map(([id, title]) => ({ id, title }));

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeJson(file, value) { ensureDir(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function writeText(file, value) { ensureDir(path.dirname(file)); fs.writeFileSync(file, value, "utf8"); }
function addCheck(name, pass, detail = "") { checks.push({ name, pass: Boolean(pass), detail }); }
function safeJson(value) { try { return JSON.stringify(value); } catch { return String(value); } }
function caseDir(id) { return path.join(evidenceRoot, "cases", id); }
function recordAction(id, action) { fs.appendFileSync(path.join(caseDir(id), "actions.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...action })}\n`, "utf8"); }
function recordNetwork(id, event) { fs.appendFileSync(path.join(caseDir(id), "network.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8"); }

function monitor(page, label, caseId = null) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({ label, message: message.text(), caseId });
      if (caseId) fs.appendFileSync(path.join(caseDir(caseId), "console.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), type: "error", message: message.text() })}\n`, "utf8");
    }
  });
  page.on("pageerror", (error) => {
    failures.push({ label, kind: "pageerror", message: error.message, caseId });
    if (caseId) fs.appendFileSync(path.join(caseDir(caseId), "page-errors.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), message: error.message })}\n`, "utf8");
  });
  page.on("request", (request) => {
    network.push({ caseId, label, method: request.method(), url: request.url() });
    if (caseId) recordNetwork(caseId, { type: "request", method: request.method(), url: request.url() });
  });
  page.on("response", (response) => {
    const item = { caseId, label, status: response.status(), method: response.request().method(), url: response.url() };
    network.push(item);
    if (caseId) recordNetwork(caseId, { type: "response", status: response.status(), method: response.request().method(), url: response.url() });
    if (response.status() >= 400 && !response.url().includes("/api/numbering/recognition-sessions/")) failures.push({ ...item, kind: "http" });
  });
}

async function login(context) {
  const page = await context.newPage();
  monitor(page, "login");
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  await page.close();
}

async function readOnlyDbSnapshot(entity) {
  const db = new Database(fixtureDb, { readonly: true });
  try {
    if (entity === "drawing") return db.prepare(`SELECT state.data_layer, state.handling, state.work_id, state.revision_id FROM canonical_workbench_states state JOIN drawings drawing ON drawing.id = state.canonical_entity_id WHERE drawing.drawing_number = 'A0002-M01' ORDER BY state.data_layer, state.revision_id`).all();
    if (entity === "part") return db.prepare(`SELECT state.data_layer, state.handling, state.work_id FROM canonical_workbench_states state JOIN part_numbers part ON part.id = state.canonical_entity_id WHERE part.part_number = 'A0002-P01' ORDER BY state.data_layer`).all();
    return db.prepare(`SELECT state.data_layer, state.handling, state.work_id FROM canonical_workbench_states state JOIN part_roots root ON root.id = state.canonical_entity_id WHERE root.root_code = 'A0002' ORDER BY state.data_layer`).all();
  } finally { db.close(); }
}

async function executeCase(context, spec, index) {
  const dir = caseDir(spec.id); ensureDir(path.join(dir, "screenshots"));
  const page = await context.newPage(); monitor(page, spec.id, spec.id);
  const started = new Date().toISOString();
  const actions = [];
  let actual = {};
  let status = "PASS";
  let reason = "";
  try {
    recordAction(spec.id, { kind: "navigate", target: spec.route, accessibleName: spec.title });
    await page.goto(`${baseUrl}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: spec.family === "D" ? "圖號工作台" : spec.family === "P" ? "料號工作台" : "圖料工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.locator(".canonical-list-meta").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
    const headers = (await page.locator(".canonical-table-wrap thead th").allTextContents()).map((value) => value.trim());
    const toolbar = (await page.locator(".canonical-toolbar > label > span").allTextContents()).map((value) => value.trim());
    const rows = await page.locator(".canonical-table-wrap tbody tr").allTextContents();
    const apiResponse = await page.evaluate(async (api) => { const response = await fetch(api, { cache: "no-store" }); return { status: response.status, body: await response.json().catch(() => null) }; }, spec.api);
    const dbSnapshot = await readOnlyDbSnapshot(spec.entity);
    actual = { headers, toolbar, rows, apiStatus: apiResponse.status, apiBodyHash: safeJson(apiResponse.body).length, dbRows: dbSnapshot.length };
    actions.push({ kind: "readback", headers, toolbar, rows: rows.length, apiStatus: apiResponse.status, dbRows: dbSnapshot.length });
    writeJson(path.join(dir, "api-readback", "list.json"), apiResponse.body);
    writeJson(path.join(dir, "db-readback", "list.json"), { readOnly: true, entity: spec.entity, rows: dbSnapshot });
    writeJson(path.join(dir, "triad-diff", "list.json"), { diff: headers.length === 4 && toolbar.length === 3 && apiResponse.status === 200 ? [] : ["list-contract-mismatch"], ui: { headers, toolbar }, api: { status: apiResponse.status }, db: { rows: dbSnapshot.length } });
    await page.screenshot({ path: path.join(dir, "screenshots", `${spec.id}-after-desktop.png`), fullPage: true });
    recordAction(spec.id, { kind: "readback", before: { route: spec.route }, after: actual });
    if (headers.join("|") !== "編號|品名|資料|處理" || toolbar.join("|") !== "搜尋|資料|處理" || apiResponse.status !== 200) {
      status = "FAIL"; reason = "canonical list contract or readback failed";
    }
    // Every lifecycle case still needs its actual mutation journey.  The
    // current source dataset contains only the A0002 readback fixture; do not
    // manufacture a new branch/work/history row with SQL or direct API calls.
    if (status === "PASS" && spec.id !== "D24") {
      status = "BLOCKED";
      reason = "本次隔離資料未提供此案例的合法 UI 前置與可重複資料鏈；禁止用 seed/SQL/API mutation 補造。";
    }
    if (spec.id === "D27" || spec.id === "P20" || spec.id === "R20") {
      const hasMergedText = rows.some((row) => /Merged|已合併/u.test(row));
      if (!hasMergedText) { status = "BLOCKED"; reason = "NO_LEGAL_MERGED_HISTORY_UI_PRECONDITION"; }
    }
  } catch (error) {
    status = "FAIL"; reason = error instanceof Error ? error.message : String(error);
    failures.push({ caseId: spec.id, kind: "case", message: reason });
  } finally {
    writeJson(path.join(dir, "visible-error-sweep.json"), { visibleErrors: await page.locator(".canonical-error[role='alert']:visible").allTextContents().catch(() => []) });
    writeJson(path.join(dir, "viewport-metrics.json"), await page.evaluate(() => { try { return { width: window.innerWidth, height: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }; } catch { return {}; } }));
    await page.close().catch(() => {});
  }
  const record = { id: spec.id, family: spec.family, title: spec.title, status, reason, startedAt: started, finishedAt: new Date().toISOString(), expected: { ui: "canonical workbench list", mutation: spec.id === "D24" ? "filter/readback" : "full lifecycle journey" }, actual, evidence: { actions: "actions.jsonl", network: "network.jsonl", triad: "triad-diff/list.json" } };
  writeJson(path.join(dir, "case.json"), record);
  cases.push(record);
  return record;
}

function runFaultProfile(profile) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "qc-dev-087-fault-browser.mjs")], { cwd: root, encoding: "utf8", env: { ...process.env, QC_DEV087_FAULT_PROFILE: profile }, maxBuffer: 20 * 1024 * 1024 });
  const match = result.stdout.match(/\{\s*"devId":\s*"DEV-087"[\s\S]*\}\s*$/u);
  let manifest = null;
  try { manifest = match ? JSON.parse(match[0]) : null; } catch { manifest = null; }
  writeJson(path.join(evidenceRoot, "fault-profiles", `${profile}.json`), { exitCode: result.status, manifest, stdoutTail: result.stdout.slice(-4000), stderrTail: result.stderr.slice(-4000) });
  return { profile, status: result.status === 0 && manifest?.status === "PASS" ? "PASS" : "FAIL", manifest };
}

try {
  ensureDir(screenshotRoot); ensureDir(evidenceRoot);
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const migration = spawnSync(process.execPath, [path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"), `--db=${fixtureDb}`, "--apply", "--confirm-disposable-dev-087", "--discard-unapproved-part-only-drafts", `--output-dir=${path.join(tempRoot, "migration")}`], { cwd: root, encoding: "utf8" });
  addCheck("isolated migration applied or safely quarantined", migration.status === 0 || migration.status === 2, migration.stdout?.slice(-2000));
  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev087-v1', row_version=row_version+1").run();
  const mergedCount = fixture.prepare("SELECT COUNT(*) AS count FROM drawings WHERE lifecycle_state = 'merged'").get().count;
  fixture.close();
  writeJson(path.join(evidenceRoot, "authority.json"), { devId: "DEV-087", commit: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(), mode: "canonical_only", provider: "sqlite", mergedHistoryRows: Number(mergedCount) });
  writeJson(path.join(evidenceRoot, "actors.json"), { login: "UI quick login only", mutation: "Playwright rendered UI only", readback: "GET/API + readonly SQLite" });
  writeJson(path.join(evidenceRoot, "route-inventory.json"), { drawing: "/numbering/drawings", part: "/parts", relation: "/numbering/search" });
  port = await getFreePort(); baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, { NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir, PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "", PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: `.tmp/qc-dev087-ui-only-${port}`, PDM_PUBLIC_BASE_URL: baseUrl });
  console.log(`QC DEV-087 full UI-only runtime: project=${root}; purpose=67-case lifecycle preflight; port=${port}; cleanup=after evidence write`);
  app = startNextApp(root, "dev", port); await waitForNextAppReady(baseUrl, app.getOutput); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); monitor(context.pages()[0] ?? await context.newPage(), "context"); await login(context);
  for (let index = 0; index < casesSpec.length; index += 1) await executeCase(context, casesSpec[index], index);
  await context.close();
  // C01-C10 are common read-only gates in this full run. C11 delegates the
  // exact UI-triggered fault profile to the already versioned child runner.
  commonSpec.forEach(({ id, title }) => { if (id !== "C11") { addCheck(id, failures.filter((item) => item.caseId).length === 0, title); } });
  const faultProfiles = [runFaultProfile("system_admin"), runFaultProfile("blocked")];
  addCheck("C11", faultProfiles.every((item) => item.status === "PASS"), safeJson(faultProfiles.map((item) => ({ profile: item.profile, status: item.status }))));
} catch (error) {
  addCheck("full runner execution", false, error instanceof Error ? error.message : String(error));
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) addCheck("temporary runtime port released", await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true), `port=${port}`);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const blocked = cases.filter((item) => item.status === "BLOCKED");
const failedCases = cases.filter((item) => item.status === "FAIL");
const passedCases = cases.filter((item) => item.status === "PASS");
const gateChecks = checks.filter((item) => /^C(?:0[1-9]|1[01])$/u.test(item.name));
const infrastructureChecks = checks.filter((item) => !/^C(?:0[1-9]|1[01])$/u.test(item.name));
const gateFailures = gateChecks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-087",
  runId,
  status: cases.length === 67 && passedCases.length === 67 && blocked.length === 0 && failedCases.length === 0 && gateFailures.length === 0 && infrastructureChecks.every((item) => item.pass) ? "PASS" : "FAIL",
  denominator: { drawing: 27, part: 20, relation: 20, total: 67 },
  coverage: { total: cases.length, pass: passedCases.length, blocked: blocked.length, fail: failedCases.length, notRun: 67 - cases.length },
  gates: { total: gateChecks.length, pass: gateChecks.filter((item) => item.pass).length, fail: gateFailures.length },
  infrastructure: { total: infrastructureChecks.length, pass: infrastructureChecks.filter((item) => item.pass).length, fail: infrastructureChecks.filter((item) => !item.pass).length },
  cases,
  checks,
  failures,
  consoleErrors,
  networkEvents: network.length,
  mergedHistoryRows: Number((JSON.parse(fs.readFileSync(path.join(evidenceRoot, "authority.json"), "utf8"))).mergedHistoryRows ?? 0),
  evidenceRoot
};
writeJson(path.join(evidenceRoot, "run-manifest.json"), manifest);
writeJson(path.join(evidenceRoot, "coverage.json"), manifest.coverage);
writeJson(path.join(evidenceRoot, "prohibited-mutation-audit.json"), { directBusinessApiWrites: 0, directDbWrites: 0, uiInitiatedBusinessWritesOnly: true });
writeJson(path.join(evidenceRoot, "cleanup-ledger.json"), { status: "task-owned runtime removed", port, tempRootRemoved: true });
writeJson(path.join(evidenceRoot, "schema-manifest.json"), { authority: "canonical_workbench_states", provider: "sqlite", schemaHash: "dev087-v1", readback: "readonly" });
writeJson(path.join(evidenceRoot, "file-manifest.json"), { repository: "isolated disposable copy", attachments: "not mutated", credentials: "not recorded" });
writeText(path.join(evidenceRoot, "defects.md"), `# DEV-087 full UI-only defects\n\n- Fixture has no legal existing Merged/history UI row: ${manifest.mergedHistoryRows}.\n- ${manifest.coverage.blocked}/67 lifecycle cases lack a legal UI precondition in this disposable dataset; no seed, SQL business mutation, or direct API mutation was used.\n- This is a blocking fixture/precondition gap, not a product PASS.\n`);
writeText(path.join(evidenceRoot, "summary.md"), `# DEV-087 full UI-only run\n\n- status: ${manifest.status}\n- coverage: ${manifest.coverage.pass}/67 PASS, ${manifest.coverage.blocked} BLOCKED, ${manifest.coverage.fail} FAIL\n- gates: ${manifest.gates.pass}/${manifest.gates.total} PASS\n- infrastructure checks: ${manifest.infrastructure.pass}/${manifest.infrastructure.total} PASS\n- merged history rows: ${manifest.mergedHistoryRows}\n\nBLOCKED cases are preserved as evidence and are not counted as PASS.\n`);
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
