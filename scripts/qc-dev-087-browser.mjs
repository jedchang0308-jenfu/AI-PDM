#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV087-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-087", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-browser-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const sourceDb = path.resolve(process.env.PDM_QC_SOURCE_DB?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
const sourceRepository = path.resolve(process.env.PDM_QC_SOURCE_REPOSITORY?.trim() || path.join(root, "data", "repository"));
const fixtureRepository = path.join(fixtureDataDir, "repository");
const checks = [];
const failures = [];
const consoleErrors = [];
const fixtureMutationLedger = [];
let sourceInvariantCheckedBeforeMutation = false;
let expectedMissingRecognitionSessionResponses = 0;
let app = null;
let browser = null;
let port = null;
let runtimeDistDir = null;
let baseUrl = "";

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}
function monitor(page, label) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // The cancelled-editor journey intentionally deletes its disposable
    // recognition session; the follow-up GET is therefore an expected 404.
    if (expectedMissingRecognitionSessionResponses > 0 && text === "Failed to load resource: the server responded with a status of 404 (Not Found)") {
      expectedMissingRecognitionSessionResponses -= 1;
      return;
    }
    consoleErrors.push({ label, message: text });
  });
  page.on("pageerror", (error) => failures.push({ label, kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ label, kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() === 404 && response.url().includes("/api/numbering/recognition-sessions/")) {
      expectedMissingRecognitionSessionResponses += 1;
      return;
    }
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
  check(`${name} only simplified filters`, JSON.stringify(labels.map((item) => item.trim())) === JSON.stringify(["搜尋"]), JSON.stringify(labels));
  const oldTerms = await page.locator(".canonical-toolbar").innerText();
  check(`${name} old filters absent`, !/工作狀態|資料狀態|版本列|系列代號|類型/u.test(oldTerms), oldTerms);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check(`${name} no page horizontal overflow`, overflow);
}

async function verifyWorkbenchInteractions(page, input) {
  const rows = page.locator("[data-canonical-workbench-row='true']");
  check(`${input.name} has consecutive rows for keyboard QC`, await rows.count() >= 2, String(await rows.count()));
  const list = page.getByRole("region", { name: "工作台資料清單" });
  const search = page.locator(".canonical-toolbar input").first();
  const selectedBeforeInput = await page.locator("[data-canonical-workbench-row='true'][aria-selected='true']").count();
  await search.focus();
  await search.press("ArrowDown");
  check(`${input.name} editable input keeps ArrowDown`, await page.locator("[data-canonical-workbench-row='true'][aria-selected='true']").count() === selectedBeforeInput);

  await list.focus();
  await list.press("ArrowDown");
  check(`${input.name} ArrowDown selects first row`, await rows.nth(0).getAttribute("aria-selected") === "true");
  await list.press("ArrowDown");
  check(`${input.name} second ArrowDown selects next row`, await rows.nth(1).getAttribute("aria-selected") === "true");
  await list.press("ArrowUp");
  check(`${input.name} ArrowUp selects previous row`, await rows.nth(0).getAttribute("aria-selected") === "true");
  await list.press("Enter");
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "visible", timeout: 30_000 });
  const initialDetailKey = new URL(page.url()).searchParams.get("detail");
  check(`${input.name} Enter opens selected detail`, Boolean(initialDetailKey), String(initialDetailKey));

  const drawer = page.locator(".pdm-entity-detail-drawer");
  const expectedWidth = await page.evaluate((storageKey) => Number.parseInt(window.localStorage.getItem(storageKey) ?? "0", 10), input.storageKey);
  const initialWidth = (await drawer.boundingBox())?.width ?? 0;
  check(`${input.name} reads its own remembered width`, Math.abs(initialWidth - expectedWidth) <= 2, `${initialWidth} != ${expectedWidth}`);
  const storageBefore = await page.evaluate(() => Object.fromEntries([
    "pdm-drawing-detail-drawer-width",
    "pdm-part-detail-drawer-width",
    "pdm-search-detail-drawer-width"
  ].map((key) => [key, window.localStorage.getItem(key)])));
  const handle = page.getByRole("button", { name: "調整明細欄寬度" });
  const handleBox = await handle.boundingBox();
  check(`${input.name} resize handle is measurable`, Boolean(handleBox), JSON.stringify(handleBox));
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + Math.min(30, handleBox.height / 2));
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 90, handleBox.y + Math.min(30, handleBox.height / 2), { steps: 5 });
  await page.mouse.up();
  const resizedWidth = (await drawer.boundingBox())?.width ?? 0;
  const storedWidth = await page.evaluate((storageKey) => Number.parseInt(window.localStorage.getItem(storageKey) ?? "0", 10), input.storageKey);
  check(`${input.name} actual drag changes drawer width`, resizedWidth > initialWidth + 50, `${initialWidth} -> ${resizedWidth}`);
  check(`${input.name} drag persists measured width`, Math.abs(resizedWidth - storedWidth) <= 2, `${resizedWidth} != ${storedWidth}`);
  const storageAfter = await page.evaluate(() => Object.fromEntries([
    "pdm-drawing-detail-drawer-width",
    "pdm-part-detail-drawer-width",
    "pdm-search-detail-drawer-width"
  ].map((key) => [key, window.localStorage.getItem(key)])));
  for (const [key, value] of Object.entries(storageBefore)) {
    if (key !== input.storageKey) check(`${input.name} does not overwrite ${key}`, storageAfter[key] === value, `${storageAfter[key]} != ${value}`);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  const reloadedWidth = (await page.locator(".pdm-entity-detail-drawer").boundingBox())?.width ?? 0;
  check(`${input.name} remembered width survives reload`, Math.abs(reloadedWidth - storedWidth) <= 2, `${reloadedWidth} != ${storedWidth}`);
  const scrollPrepared = await page.locator(".canonical-drawer-body").evaluate((element) => {
    element.style.maxHeight = "120px";
    element.style.overflowY = "auto";
    element.scrollTop = element.scrollHeight;
    return element.scrollTop > 0;
  });
  check(`${input.name} drawer scroll fixture reaches a non-zero position`, scrollPrepared);

  const close = page.getByRole("button", { name: "關閉明細" });
  await close.focus();
  const firstKey = new URL(page.url()).searchParams.get("detail");
  await close.press("ArrowDown");
  await page.waitForFunction((previous) => new URL(window.location.href).searchParams.get("detail") !== previous, firstKey, { timeout: 30_000 });
  const secondKey = new URL(page.url()).searchParams.get("detail");
  check(`${input.name} drawer ArrowDown changes rowKey`, Boolean(secondKey && secondKey !== firstKey), `${firstKey} -> ${secondKey}`);
  check(`${input.name} drawer ArrowDown selects second row`, await page.locator("[data-canonical-workbench-row='true']").nth(1).getAttribute("aria-selected") === "true");
  await page.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector(".canonical-drawer-body")?.scrollTop === 0, null, { timeout: 30_000 });
  check(`${input.name} row switching resets drawer scroll`, await page.locator(".canonical-drawer-body").evaluate((element) => element.scrollTop === 0));
  const secondLayer = (await page.locator("[data-canonical-workbench-row='true']").nth(1).locator(".canonical-layer").innerText()).trim();
  const secondCode = (await page.locator("[data-canonical-workbench-row='true']").nth(1).locator(".canonical-row-open").innerText()).trim();
  const drawerLayer = (await page.locator(".pdm-entity-drawer-status .canonical-layer").innerText()).trim();
  const drawerCode = (await page.locator(".pdm-entity-drawer-copy h2").innerText()).trim();
  const detailResult = await page.evaluate(async ({ endpoint, rowKey }) => {
    const response = await fetch(`${endpoint}/${encodeURIComponent(rowKey ?? "")}`, { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  }, { endpoint: input.detailEndpoint, rowKey: secondKey });
  check(`${input.name} switched detail API 200`, detailResult.status === 200, String(detailResult.status));
  check(`${input.name} URL/API/selected row stay aligned`, detailResult.body?.data?.row?.rowKey === secondKey && detailResult.body?.data?.row?.layerLabel === secondLayer && detailResult.body?.data?.row?.code === secondCode && drawerLayer === secondLayer && drawerCode === secondCode, JSON.stringify({ secondKey, apiKey: detailResult.body?.data?.row?.rowKey, secondCode, apiCode: detailResult.body?.data?.row?.code, drawerCode, secondLayer, apiLayer: detailResult.body?.data?.row?.layerLabel, drawerLayer }));

  await close.press("ArrowUp");
  await page.waitForFunction((expected) => new URL(window.location.href).searchParams.get("detail") === expected, firstKey, { timeout: 30_000 });
  await close.press("ArrowDown");
  await close.press("ArrowUp");
  await close.press("ArrowDown");
  await page.waitForFunction((expected) => new URL(window.location.href).searchParams.get("detail") === expected, secondKey, { timeout: 30_000 });
  await page.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  check(`${input.name} rapid switching leaves final selected row aligned`, await page.locator("[data-canonical-workbench-row='true']").nth(1).getAttribute("aria-selected") === "true" && (await page.locator(".pdm-entity-drawer-status .canonical-layer").innerText()).trim() === secondLayer);
  await page.screenshot({ path: path.join(screenshotDir, `${input.screenshot}.png`), fullPage: true });

  await close.press("Escape");
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "hidden", timeout: 30_000 });
  check(`${input.name} Escape returns focus to list`, await list.evaluate((element) => document.activeElement === element));
}

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true }); fs.mkdirSync(screenshotDir, { recursive: true });
  const source = new Database(sourceDb, { readonly: true, fileMustExist: true });
  await source.backup(fixtureDb);
  source.close();
  const sourceSnapshot = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  try {
    check("source snapshot root and part masters exist before fixture mutation", sourceSnapshot.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count > 0 && sourceSnapshot.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count > 0);
    check("source snapshot foreign keys clean before fixture mutation", sourceSnapshot.pragma("foreign_key_check").length === 0, JSON.stringify(sourceSnapshot.pragma("foreign_key_check")));
    check("source snapshot has no company-scope migration residue before fixture mutation", sourceSnapshot.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'
      AND name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration')`).get().count === 0);
    check("source snapshot root references resolve before fixture mutation", sourceSnapshot.prepare(`SELECT COUNT(*) AS count FROM drawings drawing
      WHERE drawing.part_root_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM part_roots root WHERE root.id=drawing.part_root_id AND root.company_id=drawing.company_id)`).get().count === 0);
    sourceInvariantCheckedBeforeMutation = true;
  } finally {
    sourceSnapshot.close();
  }
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const migration = spawnSync(process.execPath, [
    path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"),
    `--db=${fixtureDb}`, "--apply", "--confirm-disposable-dev-087", "--discard-unapproved-part-only-drafts", `--output-dir=${path.join(tempRoot, "migration")}`
  ], { cwd: root, encoding: "utf8" });
  fixtureMutationLedger.push({ action: "migrate-dev-087-canonical-workbench", status: migration.status, scope: "disposable fixture only" });
  check("isolated migration applied or safely quarantined", migration.status === 0 || migration.status === 2, `${migration.stdout}\n${migration.stderr}`);
  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1").run();
  fixtureMutationLedger.push({ action: "set-disposable-authority-control", scope: "disposable fixture only" });
  check("fixture remains FK-clean after declared mutations", fixture.pragma("foreign_key_check").length === 0, JSON.stringify(fixture.pragma("foreign_key_check")));
  check("isolated fixture has A0002 production and RD rows", fixture.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states state JOIN drawings drawing ON drawing.id = state.canonical_entity_id WHERE drawing.drawing_number='A0002-M01' AND state.data_layer IN ('drawing_production', 'drawing_rd')").get().count >= 2);
  fixture.close();

  port = await getFreePort(); baseUrl = `http://127.0.0.1:${port}`;
  runtimeDistDir = path.join(root, ".tmp", `qc-dev087-browser-${port}`);
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: path.relative(root, runtimeDistDir), PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`QC DEV-087 runtime: project=${root}; purpose=canonical workbench browser QA; port=${port}; owner=current QC process tree; cleanup=after browser assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });

  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); await login(context);
    if (viewport.name === "desktop") {
      const preferencePage = await context.newPage();
      await preferencePage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await preferencePage.evaluate(() => {
        window.localStorage.setItem("pdm-drawing-detail-drawer-width", "510");
        window.localStorage.setItem("pdm-part-detail-drawer-width", "560");
        window.localStorage.setItem("pdm-search-detail-drawer-width", "610");
      });
      await preferencePage.close();
    }
    const drawing = await openWorkbench(context, "/numbering/drawings?query=A0002-M01", "圖號工作台");
    await verifyWorkbench(drawing, `drawing/${viewport.name}`);
    const drawingRows = await drawing.locator(".canonical-table-wrap tbody tr").allTextContents();
    check(`drawing/${viewport.name} production and RD visible together`, drawingRows.some((row) => row.includes("量產版 1")) && drawingRows.some((row) => row.includes("研發版 1.1")), JSON.stringify(drawingRows));
    await drawing.screenshot({ path: path.join(screenshotDir, `drawing-${viewport.name}.png`), fullPage: true });
    if (viewport.name === "desktop") {
      await verifyWorkbenchInteractions(drawing, { name: "drawing/desktop", storageKey: "pdm-drawing-detail-drawer-width", detailEndpoint: "/api/numbering/drawings/workbench", screenshot: "drawing-interactions-desktop" });
      await drawing.locator(".canonical-row-open").first().click();
      await drawing.getByRole("complementary", { name: /A0002-M01/u }).waitFor({ state: "visible" });
      check("drawing drawer has history", await drawing.getByRole("heading", { name: "歷史版次清單" }).count() === 1);
      await drawing.getByRole("button", { name: "關閉明細" }).click();
      const productionRow = drawing.locator(".canonical-table-wrap tbody tr").filter({ hasText: "量產版 1" }).first();
      await productionRow.getByRole("button").click();
      await drawing.getByRole("complementary", { name: /A0002-M01/u }).waitFor({ state: "visible" });
      await drawing.getByRole("button", { name: "進版", exact: true }).click();
      await drawing.getByRole("dialog", { name: "選擇進版方式" }).waitFor({ state: "visible" });
      await drawing.getByRole("button", { name: /^研發版 1\.2/u }).click();
      await drawing.locator('[data-workspace-kind="drawing-revision-work"]').waitFor({ state: "visible", timeout: 30_000 });
      check("drawing editor keeps dedicated file and recognition tabs", await drawing.getByRole("tab", { name: "版次與檔案" }).count() === 1 && await drawing.getByRole("tab", { name: "智慧辨識" }).count() === 1);
      await drawing.getByRole("tab", { name: "智慧辨識" }).click();
      await drawing.waitForTimeout(500);
      check("drawing recognition uses the work revision context", await drawing.getByText("這筆工作資料尚無可辨識的版次來源。", { exact: true }).count() === 0);
      check("drawing owner editor remains mutable before submit", await drawing.getByRole("button", { name: "送出審核" }).isEnabled());
      await drawing.screenshot({ path: path.join(screenshotDir, "drawing-editor-recognition-desktop.png"), fullPage: true });
      drawing.once("dialog", (dialog) => dialog.accept());
      await drawing.getByRole("button", { name: "取消本次工作" }).click();
      await drawing.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await drawing.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
      const layerFilter = drawing.locator(".pdm-workbench-multi-select-filter").first();
      await layerFilter.getByRole("button").click();
      const layerDialog = drawing.getByRole("dialog", { name: "資料篩選" });
      await layerDialog.locator("label").filter({ hasText: "全部" }).click();
      await layerDialog.locator("label").filter({ hasText: "研發版" }).click();
      await layerDialog.getByRole("button", { name: "確定", exact: true }).click();
      await drawing.waitForFunction(() => {
        const layers = [...document.querySelectorAll(".canonical-layer")].map((element) => element.textContent?.trim() ?? "");
        return new URL(window.location.href).searchParams.get("layer") === "rd"
          && document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false"
          && layers.length > 0
          && layers.every((label) => label.includes("研發版"));
      }, null, { timeout: 30_000 });
      const filtered = await drawing.locator(".canonical-layer").allTextContents();
      check("drawing layer filter applies directly", filtered.length > 0 && filtered.every((label) => label.includes("研發版")), JSON.stringify(filtered));
    }
    await drawing.close();
    if (viewport.name === "desktop") {
      const part = await openWorkbench(context, "/parts?query=A000", "料號工作台"); await verifyWorkbench(part, "part/desktop");
      check("part formal row has no revision", (await part.locator(".canonical-layer").allTextContents()).some((label) => label.trim() === "正式資料"));
      await verifyWorkbenchInteractions(part, { name: "part/desktop", storageKey: "pdm-part-detail-drawer-width", detailEndpoint: "/api/parts/workbench", screenshot: "part-interactions-desktop" });
      await part.screenshot({ path: path.join(screenshotDir, "part-desktop.png"), fullPage: true }); await part.close();
      const relation = await context.newPage(); monitor(relation, "編號搜尋");
      await relation.goto(`${baseUrl}/numbering/search?query=A000`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await relation.getByRole("heading", { name: "編號搜尋", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await relation.locator(".canonical-list").waitFor({ state: "visible", timeout: 30_000 });
      await relation.waitForFunction(() => document.querySelector(".canonical-list tbody")?.textContent?.includes("A0002"), null, { timeout: 30_000 });
      const relationHeaders = await relation.locator(".canonical-list thead th").allTextContents();
      check("編號搜尋 four-column identity list", JSON.stringify(relationHeaders.map((item) => item.trim())) === JSON.stringify(["編號", "品名", "圖料根號", "資料狀態"]), JSON.stringify(relationHeaders));
      check("編號搜尋 exposes A0002 drawing and part identities", (await relation.locator(".canonical-list tbody").innerText()).includes("A0002-M01") && (await relation.locator(".canonical-list tbody").innerText()).includes("A0002-P01"));
      await relation.locator(".canonical-toolbar input").fill("A0002");
      await relation.waitForFunction(() => document.querySelector(".canonical-list tbody")?.textContent?.includes("A0002-M01"), null, { timeout: 30_000 });
      check("編號搜尋 query narrows to A0002", !(await relation.locator(".canonical-list tbody").innerText()).includes("A0003"));
      await relation.screenshot({ path: path.join(screenshotDir, "numbering-search-desktop.png"), fullPage: true }); await relation.close();
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
  const runtimeCleanup = runtimeDistDir
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeDistDir)
    : { removed: false, path: null, error: "runtime-not-started" };
  checks.push({ name: "temporary runtime dist removed", pass: runtimeCleanup.removed, detail: JSON.stringify(runtimeCleanup) });
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((item) => !item.pass);
const manifest = { devId: "DEV-087", runId, status: failed.length ? "FAIL" : "PASS", port, outputDir, sourceInvariantCheckedBeforeMutation, fixtureMutationLedger, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, consoleErrors, failures };
fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
