#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV087-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-087", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-browser-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const fixtureRepository = path.join(fixtureDataDir, "repository");
const checks = [];
const failures = [];
const consoleErrors = [];
let app = null;
let browser = null;
let port = null;
let baseUrl = "";

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}
function monitor(page, label) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ label, message: message.text() }); });
  page.on("pageerror", (error) => failures.push({ label, kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ label, kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push({ label, kind: "http", status: response.status(), url: response.url() });
  });
}
async function login(context) {
  const page = await context.newPage(); monitor(page, "login");
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  check("local admin login via rendered UI", !page.url().endsWith("/login"), page.url());
  await page.close();
}
async function openWorkbench(context, route, title, allowError = false) {
  const page = await context.newPage(); monitor(page, title);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: title, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-list-meta").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => {
    const list = document.querySelector(".canonical-list");
    return list?.getAttribute("aria-busy") === "false"
      && Boolean(document.querySelector(".canonical-row-open, .canonical-error[role='alert'], .canonical-empty"));
  }, null, { timeout: 30_000 });
  const visibleErrors = await page.locator(".canonical-error[role='alert']:visible").allTextContents();
  if (!allowError) check(`${title} loads without visible error`, visibleErrors.length === 0, JSON.stringify(visibleErrors));
  return page;
}
async function verifyWorkbench(page, name) {
  const headers = await page.locator(".canonical-table-wrap thead th").allTextContents();
  check(`${name} four-column list`, JSON.stringify(headers.map((item) => item.trim())) === JSON.stringify(["編號", "品名", "資料", "處理"]), JSON.stringify(headers));
  const labels = await page.locator(".canonical-toolbar > label > span").allTextContents();
  check(`${name} only simplified filters`, JSON.stringify(labels.map((item) => item.trim())) === JSON.stringify(["搜尋", "資料", "處理"]), JSON.stringify(labels));
  const oldTerms = await page.locator(".canonical-toolbar").innerText();
  check(`${name} old filters absent`, !/工作狀態|資料狀態|版本列|系列代號|類型/u.test(oldTerms), oldTerms);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check(`${name} no page horizontal overflow`, overflow);
}

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true }); fs.mkdirSync(screenshotDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const migration = spawnSync(process.execPath, [
    path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"),
    `--db=${fixtureDb}`, "--apply", "--confirm-disposable-dev-087", "--discard-unapproved-part-only-drafts", `--output-dir=${path.join(tempRoot, "migration")}`
  ], { cwd: root, encoding: "utf8" });
  check("isolated migration applied or safely quarantined", migration.status === 0 || migration.status === 2, `${migration.stdout}\n${migration.stderr}`);
  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev087-v1', row_version=row_version+1").run();
  check("isolated fixture has A0002 production and RD rows", fixture.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states state JOIN drawings drawing ON drawing.id = state.canonical_entity_id WHERE drawing.drawing_number='A0002-M01' AND state.data_layer IN ('drawing_production', 'drawing_rd')").get().count >= 2);
  fixture.close();

  port = await getFreePort(); baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: `.tmp/qc-dev087-browser-${port}`, PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`QC DEV-087 runtime: project=${root}; purpose=canonical workbench browser QA; port=${port}; owner=current QC process tree; cleanup=after browser assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });

  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); await login(context);
    const drawing = await openWorkbench(context, "/numbering/drawings?query=A0002-M01", "圖號工作台");
    await verifyWorkbench(drawing, `drawing/${viewport.name}`);
    const drawingRows = await drawing.locator(".canonical-table-wrap tbody tr").allTextContents();
    check(`drawing/${viewport.name} production and RD visible together`, drawingRows.some((row) => row.includes("量產版 1")) && drawingRows.some((row) => row.includes("研發版 1.1")), JSON.stringify(drawingRows));
    await drawing.screenshot({ path: path.join(screenshotDir, `drawing-${viewport.name}.png`), fullPage: true });
    if (viewport.name === "desktop") {
      await drawing.locator(".canonical-row-open").first().click();
      await drawing.getByRole("dialog", { name: /A0002-M01/u }).waitFor({ state: "visible" });
      check("drawing drawer has history", await drawing.getByRole("heading", { name: "歷史版次清單" }).count() === 1);
      await drawing.getByRole("button", { name: "關閉明細" }).click();
      const productionRow = drawing.locator(".canonical-table-wrap tbody tr").filter({ hasText: "量產版 1" }).first();
      await productionRow.getByRole("button").click();
      await drawing.getByRole("dialog", { name: /A0002-M01/u }).waitFor({ state: "visible" });
      await drawing.getByRole("button", { name: "進版", exact: true }).click();
      await drawing.getByRole("dialog", { name: "選擇進版方式" }).waitFor({ state: "visible" });
      await drawing.getByRole("button", { name: /^研發版 1\.2/u }).click();
      await drawing.getByText("圖號編輯", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      check("drawing editor keeps dedicated file and recognition tabs", await drawing.getByRole("tab", { name: "版次與檔案" }).count() === 1 && await drawing.getByRole("tab", { name: "智慧辨識" }).count() === 1);
      await drawing.getByRole("tab", { name: "智慧辨識" }).click();
      await drawing.waitForTimeout(500);
      check("drawing recognition uses the work revision context", await drawing.getByText("這筆工作資料尚無可辨識的版次來源。", { exact: true }).count() === 0);
      check("drawing owner editor remains mutable before submit", await drawing.getByRole("button", { name: "送出審核" }).isEnabled());
      await drawing.screenshot({ path: path.join(screenshotDir, "drawing-editor-recognition-desktop.png"), fullPage: true });
      drawing.once("dialog", (dialog) => dialog.accept());
      await drawing.getByRole("button", { name: "取消本次工作" }).click();
      await drawing.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await drawing.locator(".canonical-toolbar select").first().selectOption("rd");
      await drawing.waitForTimeout(400);
      const filtered = await drawing.locator(".canonical-layer").allTextContents();
      check("drawing layer filter applies directly", filtered.length > 0 && filtered.every((label) => label.includes("研發版")), JSON.stringify(filtered));
    }
    await drawing.close();
    if (viewport.name === "desktop") {
      const part = await openWorkbench(context, "/parts?query=A0002-P01", "料號工作台"); await verifyWorkbench(part, "part/desktop");
      check("part formal row has no revision", (await part.locator(".canonical-layer").allTextContents()).some((label) => label.trim() === "正式資料"));
      await part.screenshot({ path: path.join(screenshotDir, "part-desktop.png"), fullPage: true }); await part.close();
      const relation = await openWorkbench(context, "/numbering/search?query=A0002", "圖料工作台"); await verifyWorkbench(relation, "relation/desktop");
      check("relation formal row has no revision", (await relation.locator(".canonical-layer").allTextContents()).some((label) => label.trim() === "正式關聯"));
      await relation.screenshot({ path: path.join(screenshotDir, "relation-desktop.png"), fullPage: true }); await relation.close();
      const retired = await openWorkbench(context, "/numbering/drawings?query=A0002-M01&view=all", "圖號工作台", true);
      check("retired query is explicit", await retired.getByRole("alert").getByText("此篩選網址已失效", { exact: true }).count() === 1);
      await retired.close();
    }
    await context.close();
  }
  const cleanupEvidence = new Database(fixtureDb, { readonly: true });
  check("cancelled editor leaves no orphan recognition session", cleanupEvidence.prepare(`SELECT COUNT(*) AS count FROM drawing_recognition_sessions session WHERE session.source_context_type = 'drawing_revision' AND NOT EXISTS (SELECT 1 FROM drawing_revisions revision WHERE revision.id = session.source_context_id)`).get().count === 0);
  check("cancelled editor releases target revision claim", cleanupEvidence.prepare(`SELECT COUNT(*) AS count FROM drawing_revision_claims claim JOIN drawings drawing ON drawing.id = claim.drawing_id WHERE drawing.drawing_number = 'A0002-M01' AND claim.target_label = '1.2'`).get().count === 0);
  cleanupEvidence.close();
  check("browser has no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("browser has no page/network failures", failures.length === 0, JSON.stringify(failures));
} catch (error) {
  checks.push({ name: "browser execution", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const probe = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: probe, detail: `port=${port}` });
  }
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((item) => !item.pass);
const manifest = { devId: "DEV-087", runId, status: failed.length ? "FAIL" : "PASS", port, outputDir, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, consoleErrors, failures };
fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
