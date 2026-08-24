#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV087-PART-ATTACHMENTS-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-087", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-part-attachments-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
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
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ label, kind: "requestfailed", url: request.url(), message: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push({ label, kind: "http", status: response.status(), url: response.url() }); });
}

async function login(context) {
  const page = await context.newPage();
  monitor(page, "login");
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  check("local admin login", !page.url().endsWith("/login"), page.url());
  await page.close();
}

async function waitForPartWorkbench(page) {
  await page.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false" && [...document.querySelectorAll(".canonical-row-open")].some((element) => element.textContent?.trim() === "A0002-P01"), null, { timeout: 30_000 });
}

async function verifyManager(page, viewportName, mutate = false) {
  await page.getByRole("heading", { name: "管理附件", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("料號 A0002-P01", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".part-attachment-upload-card").waitFor({ state: "visible", timeout: 30_000 });
  check(`${viewportName}: upload has no category control`, await page.locator(".part-attachment-category select").count() === 0 && await page.getByText("附件分類", { exact: true }).count() === 0);
  check(`${viewportName}: dropzone supports multiple files`, await page.locator(".part-attachment-upload-card input[type='file'][multiple]").count() === 1);
  check(`${viewportName}: deleted-data restore area exists`, await page.locator(".part-attachment-deleted").count() === 1);
  check(`${viewportName}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

  if (mutate) {
    const fileName = `part-attachment-${runId}.html`;
    await page.locator(".part-attachment-upload-card input[type='file']").setInputFiles({ name: fileName, mimeType: "text/html", buffer: Buffer.from(`<html><body>DEV-087 part attachment ${runId}</body></html>`, "utf8") });
    const upload = page.getByRole("button", { name: "上傳 1 個附件", exact: true });
    check("upload enables after file selection", await upload.isEnabled());
    await upload.click();
    await page.getByText("已上傳 1 個附件。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    const activeSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "目前附件", exact: true }) });
    let activeRow = activeSection.locator(".part-attachment-list li").filter({ hasText: fileName });
    await activeRow.waitFor({ state: "visible", timeout: 30_000 });
    check("download uses protected file route", (await activeRow.getByRole("link", { name: `下載 ${fileName}` }).getAttribute("href"))?.startsWith("/api/pdm/file-assets/") === true);

    page.once("dialog", (dialog) => dialog.accept());
    await activeRow.getByRole("button", { name: "刪除", exact: true }).click();
    await page.getByText("附件已移至已刪除區，可於本頁還原。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.locator(".part-attachment-deleted summary").click();
    const deletedRow = page.locator(".part-attachment-list.is-deleted li").filter({ hasText: fileName });
    await deletedRow.waitFor({ state: "visible", timeout: 30_000 });
    await deletedRow.getByRole("button", { name: "還原", exact: true }).click();
    await page.getByText("附件已還原。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    activeRow = activeSection.locator(".part-attachment-list li").filter({ hasText: fileName });
    await activeRow.waitFor({ state: "visible", timeout: 30_000 });
    check("soft-delete and restore returns attachment to active list", await activeRow.count() === 1);
  }

  await page.screenshot({ path: path.join(screenshotDir, `${viewportName}.png`), fullPage: true });
}

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.copyFileSync(path.join(root, "data", "ai-pdm.sqlite"), fixtureDb);
  const sourceRepository = path.join(root, "data", "repository");
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const migration = spawnSync(process.execPath, [
    path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"),
    `--db=${fixtureDb}`, "--apply", "--confirm-disposable-dev-087", "--discard-unapproved-part-only-drafts", `--output-dir=${path.join(tempRoot, "migration")}`
  ], { cwd: root, encoding: "utf8" });
  check("isolated migration applied or safely quarantined", migration.status === 0 || migration.status === 2, `${migration.stdout}\n${migration.stderr}`);
  const ownerEditorSource = fs.readFileSync(path.join(root, "src", "components", "canonical-change-workspace.tsx"), "utf8");
  check("part owner editor keeps secondary attachment manager entry contract", ownerEditorSource.includes("!data.readonly && canManageAttachments") && ownerEditorSource.includes("管理附件") && ownerEditorSource.includes("/attachments?returnTo="));
  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1").run();
  check("fixture contains target part", fixture.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_number='A0002-P01'").get().count === 1);
  fixture.close();

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: `.tmp/qc-dev087-part-attachments-${port}`, PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`QC DEV-087 attachment runtime: project=${root}; purpose=part attachment upload/delete/restore UI QC; port=${port}; owner=current QC process tree; cleanup=after focused assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });

  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await login(context);
    const page = await context.newPage();
    monitor(page, viewport.name);
    if (viewport.name === "desktop") {
      await page.goto(`${baseUrl}/parts?query=A0002-P01`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await waitForPartWorkbench(page);
      await page.getByRole("button", { name: "A0002-P01", exact: true }).first().click();
      const section = page.locator("[data-section='part-attachments']");
      await section.waitFor({ state: "visible", timeout: 30_000 });
      check("drawer always shows attachment section", await section.getByRole("heading", { name: "附件", exact: true }).count() === 1);
      const manage = section.getByRole("button", { name: "管理附件", exact: true });
      await manage.waitFor({ state: "visible", timeout: 30_000 });
      check("drawer shows manage entry to authorized actor", await manage.isEnabled());
      const detail = new URL(page.url()).searchParams.get("detail");
      await manage.click();
      await page.waitForURL((url) => url.pathname === "/parts/A0002-P01/attachments", { timeout: 30_000 });
      await verifyManager(page, viewport.name, true);
      await page.getByRole("button", { name: "返回上一個工作清單", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/parts" && url.searchParams.get("detail") === detail, { timeout: 30_000 });
      check("manager returns to originating drawer", new URL(page.url()).searchParams.get("detail") === detail);
    } else {
      await page.goto(`${baseUrl}/parts/A0002-P01/attachments`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await verifyManager(page, viewport.name);
    }
    await page.close();
    await context.close();
  }
  check("browser has no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("browser has no page/network failures", failures.length === 0, JSON.stringify(failures));
} catch (error) {
  checks.push({ name: "focused browser execution", pass: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: released, detail: `port=${port}` });
  }
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((item) => !item.pass);
const manifest = { devId: "DEV-087", scope: "part-attachments", runId, status: failed.length ? "FAIL" : "PASS", port, outputDir, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, consoleErrors, failures };
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
