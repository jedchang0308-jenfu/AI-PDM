#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { seedDev099Fixture, fixture } from "./dev099-qc-fixture.mjs";
import { createTaskOwnedNextTsconfig, getFreePort, restoreNextEnv, snapshotNextEnv, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV099-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.resolve(process.env.DEV099_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-099", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev099-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const nextEnvSnapshot = snapshotNextEnv(root);
const checks = [];
const screenshots = [];
const responseLedger = [];
const requestLedger = [];
const previewLedger = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const fixtureLedger = [];
const envKeys = [
  "NODE_ENV", "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_RELEASE_MODE",
  "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_ENABLE_LOCAL_QUICK_LOGIN", "PDM_PRODUCTION_SLICE_MODE",
  "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_NEXT_TSCONFIG_PATH", "PDM_PUBLIC_BASE_URL", "PDM_BUILD_COMMIT",
  "PDM_ASSEMBLY_SHARED_BOM_V1", "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1", "PDM_BOM_XMIND_EDITOR_V2_ENABLED"
];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
let app = null;
let browser = null;
let port = null;
let baseUrl = "";
let nextTsconfig = null;

function record(cases, label, pass, detail = "") {
  const row = { cases: Array.isArray(cases) ? cases : [cases], label, pass: Boolean(pass), detail };
  checks.push(row);
  console.log(`${row.pass ? "PASS" : "FAIL"} ${label}${detail ? ` · ${detail}` : ""}`);
  return row.pass;
}

function requirePass(cases, label, pass, detail = "") {
  if (!record(cases, label, pass, detail)) throw new Error(`${label}: ${detail}`);
}

function restoreEnvironment() {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function cleanupStaleBrowserDists() {
  const tmpRoot = path.join(root, ".tmp");
  if (!fs.existsSync(tmpRoot)) return;
  for (const name of fs.readdirSync(tmpRoot)) {
    if (!name.startsWith("qc-dev099-browser-")) continue;
    fs.rmSync(path.join(tmpRoot, name), { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
  }
}

function dbRead(sql, params = {}) {
  const database = new Database(databasePath, { readonly: true });
  const rows = database.prepare(sql).all(params);
  database.close();
  return rows;
}

function dbOne(sql, params = {}) {
  return dbRead(sql, params)[0] ?? null;
}

function counts() {
  const database = new Database(databasePath, { readonly: true });
  const count = (table) => Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  const result = { roots: count("part_roots"), parts: count("part_numbers"), drawings: count("drawing_numbers"), links: count("drawing_part_links"), audits: count("audit_logs"), receipts: count("platform_command_receipts") };
  database.close();
  return result;
}

function partByNumber(partNumber) {
  return dbOne("SELECT id, company_id, part_root_id, part_number, part_name, item_kind, structure_type, record_status FROM part_numbers WHERE part_number = ? LIMIT 1", [partNumber]);
}

function monitor(page, label) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // The stale-write 412 is an intentionally exercised, recoverable conflict.
    if (text.includes("412") || text.includes("Precondition Failed")) return;
    consoleErrors.push({ label, message: text });
  });
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  page.on("request", (request) => {
    if (request.method() === "GET" || request.method() === "HEAD") return;
    requestLedger.push({ label, method: request.method(), url: request.url(), body: request.postData() ?? null, headers: request.headers() });
  });
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    if (error !== "net::ERR_ABORTED") failedRequests.push({ label, url: request.url(), error });
  });
  page.on("response", async (response) => {
    const entry = { label, status: response.status(), url: response.url() };
    responseLedger.push(entry);
    if (response.url().includes("/api/numbering/records/preview")) {
      try { previewLedger.push({ url: response.url(), status: response.status(), body: await response.json() }); } catch { /* response may be aborted */ }
    }
  });
}

async function login(context, role = "Engineer") {
  const response = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role } });
  requirePass([], `local quick login ${role}`, response.status() === 200, `status=${response.status()}`);
}

async function openCreate(context, from = "part", rootCode = "") {
  const page = await context.newPage();
  monitor(page, `create:${from}:${rootCode || "new"}`);
  const url = new URL(`${baseUrl}/numbering/create`);
  url.searchParams.set("from", from);
  if (rootCode) url.searchParams.set("root", rootCode);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "建立編號", exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  return page;
}

async function submitNewRoot(page, input) {
  const requestRows = [];
  const responseRows = [];
  const onRequest = (request) => {
    if (request.method() === "POST" && request.url().includes("/api/numbering/records") && !request.url().includes("duplicate-check")) {
      let body = null;
      try { body = request.postDataJSON(); } catch { /* no JSON */ }
      requestRows.push({ url: request.url(), body, headers: request.headers() });
    }
  };
  page.on("request", onRequest);
  const onResponse = async (response) => {
    if (response.request().method() === "POST" && response.url().includes("/api/numbering/roots/") && response.url().endsWith("/parts")) {
      responseRows.push({ status: response.status(), body: await response.text().catch(() => "") });
    }
  };
  page.on("response", onResponse);
  const itemKindSelect = page.locator(".canonical-create-part-fields select");
  if (await itemKindSelect.count()) {
    await page.waitForTimeout(500);
    await itemKindSelect.selectOption(input.itemKind);
    await page.waitForFunction((expected) => document.querySelector(".canonical-create-part-fields select")?.value === expected, input.itemKind);
  }
  if (input.reference && await page.getByLabel("同時建立參考圖 R", { exact: true }).count()) await page.getByLabel("同時建立參考圖 R", { exact: true }).check();
  if (await page.getByLabel("主要名詞", { exact: true }).count()) {
    await page.getByLabel("主要名詞", { exact: true }).fill(input.primaryNoun);
    if (input.seriesCode && await page.getByLabel("系列代號（選填）", { exact: true }).count()) await page.getByLabel("系列代號（選填）", { exact: true }).fill(input.seriesCode);
    if (input.feature && await page.getByLabel("規格／特性（選填）", { exact: true }).count()) await page.getByLabel("規格／特性（選填）", { exact: true }).fill(input.feature);
    if (input.brand && await page.getByLabel("品牌（選填）", { exact: true }).count()) await page.getByLabel("品牌（選填）", { exact: true }).fill(input.brand);
    if (input.model && await page.getByLabel("規格／型號（選填）", { exact: true }).count()) await page.getByLabel("規格／型號（選填）", { exact: true }).fill(input.model);
    await page.getByRole("button", { name: "套用建議品名", exact: true }).click();
  }
  if (input.referencePurpose && await page.getByLabel("參考圖用途", { exact: true }).count()) await page.getByLabel("參考圖用途", { exact: true }).fill(input.referencePurpose);
  if (input.appendReason && await page.getByLabel("追加原因", { exact: true }).count()) await page.getByLabel("追加原因", { exact: true }).fill(input.appendReason);
  await page.waitForTimeout(700);
  const submit = page.getByRole("button", { name: "建立編號", exact: true });
  requirePass([], `${input.label} has one enabled primary action`, await submit.count() === 1 && await submit.isEnabled(), `count=${await submit.count()}`);
  await submit.click();
  try {
    await page.getByRole("heading", { name: "編號已建立", exact: true }).waitFor({ state: "visible", timeout: 45_000 });
  } catch (error) {
    const alerts = await page.locator('[role="alert"]').allTextContents().catch(() => []);
    throw new Error(`${error instanceof Error ? error.message : String(error)}; appendResponses=${JSON.stringify(responseRows)}; alerts=${JSON.stringify(alerts)}; request=${JSON.stringify(requestRows[0] ?? null)}`);
  }
  page.off("request", onRequest);
  page.off("response", onResponse);
  return { request: requestRows[0] ?? null, href: await page.getByRole("link", { name: "查看建立結果", exact: true }).getAttribute("href") };
}

async function openPartDrawer(context, partNumber) {
  const page = await context.newPage();
  monitor(page, `part:${partNumber}`);
  await page.goto(`${baseUrl}/parts`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const row = page.getByRole("button", { name: partNumber, exact: true });
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.click();
  const drawer = page.locator('aside[aria-label="工作台明細"]');
  await drawer.waitFor({ state: "visible", timeout: 30_000 });
  await drawer.locator('[data-section="part-structure-classification"]').waitFor({ state: "visible", timeout: 30_000 });
  await drawer.locator('[data-section="part-structure-classification"]').getByRole("button", { name: "分類／批次分類", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  return { page, drawer };
}

function screenshotPath(name) {
  const target = path.join(outputDir, name);
  screenshots.push(name);
  return target;
}

async function verifyNoOverflow(page, label, viewport) {
  const metrics = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
  requirePass([40], `${label} no horizontal overflow`, metrics.scrollWidth <= metrics.clientWidth + 1 && metrics.bodyWidth <= metrics.clientWidth + 1, `${viewport.width}x${viewport.height} ${JSON.stringify(metrics)}`);
}

async function runBrowserCases() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context, "Engineer");
  try {
    const previewPage = await openCreate(context, "part");
    requirePass([1, 2], "new-root rendered form omits structure selector", await previewPage.getByText("結構型態", { exact: true }).count() === 0 && await previewPage.locator('select[name="structureType"]').count() === 0);
    await previewPage.getByLabel("主要名詞", { exact: true }).fill("DEV099_PREVIEW");
    // Webpack-isolated task roots can take a few seconds to hydrate the
    // client component after the SSR heading is visible.
    await previewPage.waitForTimeout(10000);
    const preview = previewLedger.at(-1);
    requirePass([3], "preview omits structure query and reports deferred default", Boolean(preview && preview.status === 200 && !new URL(preview.url).searchParams.has("structureType") && preview.body?.effectiveStructureType === "unclassified" && preview.body?.structureInitializationSource === "deferred_default"), JSON.stringify(preview ?? null));
    const compatibilitySingle = await context.request.post(`${baseUrl}/api/numbering/records`, {
      headers: { "idempotency-key": "dev099-browser-compat-single" },
      data: { coreName: "DEV099_COMPAT_SINGLE", itemKind: "purchased", structureType: "single_part", customSpecification: "compat", drawingRequested: false }
    });
    const compatibilitySingleBody = await compatibilitySingle.json();
    requirePass([6], "known single_part compatibility request is accepted", compatibilitySingle.status() === 201 && compatibilitySingleBody.partNumber?.structureType === "single_part", JSON.stringify({ status: compatibilitySingle.status(), body: compatibilitySingleBody }));
    const compatibilityAssembly = await context.request.post(`${baseUrl}/api/numbering/records`, {
      headers: { "idempotency-key": "dev099-browser-compat-purchased-assembly" },
      data: { coreName: "DEV099_COMPAT_PURCHASED_ASSEMBLY", itemKind: "purchased", structureType: "assembly", customSpecification: "compat", drawingRequested: false }
    });
    const compatibilityAssemblyBody = await compatibilityAssembly.json();
    requirePass([7], "purchased assembly compatibility request is accepted without BOM side effect", compatibilityAssembly.status() === 201 && compatibilityAssemblyBody.partNumber?.structureType === "assembly", JSON.stringify({ status: compatibilityAssembly.status(), body: compatibilityAssemblyBody }));
    const unknownCompatibility = await context.request.post(`${baseUrl}/api/numbering/records`, {
      headers: { "idempotency-key": "dev099-browser-compat-unknown" },
      data: { coreName: "DEV099_COMPAT_UNKNOWN", itemKind: "purchased", structureType: "not-a-structure", customSpecification: "compat", drawingRequested: false }
    });
    requirePass([8], "unknown explicit structure is rejected without creating a record", unknownCompatibility.status() === 422, `status=${unknownCompatibility.status()}`);
    await previewPage.close();

    const manufacturedPage = await openCreate(context, "part");
    const beforeManufactured = counts();
    const manufactured = await submitNewRoot(manufacturedPage, { label: "manufactured new-root", itemKind: "manufactured", primaryNoun: "DEV099_UI_MANUFACTURED", seriesCode: "JF", feature: "400W" });
    const manufacturedPart = dbRead("SELECT * FROM part_numbers WHERE part_name LIKE 'DEV099_UI_MANUFACTURED%' ORDER BY created_at DESC LIMIT 1")[0];
    const afterManufactured = counts();
    requirePass([4], "manufactured rendered create writes explicit unclassified Part", Boolean(manufacturedPart && manufacturedPart.item_kind === "manufactured" && manufacturedPart.structure_type === "unclassified" && afterManufactured.roots === beforeManufactured.roots + 1 && afterManufactured.parts === beforeManufactured.parts + 1 && afterManufactured.drawings === beforeManufactured.drawings + 1), JSON.stringify({ request: manufactured.request?.body, part: manufacturedPart, beforeManufactured, afterManufactured }));
    requirePass([3, 4], "manufactured create payload has no structure assertion", !Object.hasOwn(manufactured.request?.body ?? {}, "structureType"), JSON.stringify(manufactured.request?.body ?? null));
    await manufacturedPage.close();

    const purchasedPage = await openCreate(context, "part");
    const beforePurchased = counts();
    const purchased = await submitNewRoot(purchasedPage, { label: "purchased new-root", itemKind: "purchased", primaryNoun: "DEV099_UI_PURCHASED", brand: "DEV", model: "P-1" });
    const purchasedPart = dbRead("SELECT * FROM part_numbers WHERE part_name LIKE 'DEV099_UI_PURCHASED%' ORDER BY created_at DESC LIMIT 1")[0];
    const afterPurchased = counts();
    requirePass([5], "purchased rendered create writes explicit unclassified Part", Boolean(purchasedPart && purchasedPart.item_kind === "purchased" && purchasedPart.structure_type === "unclassified" && afterPurchased.roots === beforePurchased.roots + 1 && afterPurchased.parts === beforePurchased.parts + 1 && afterPurchased.drawings === beforePurchased.drawings), JSON.stringify({ request: purchased.request?.body, part: purchasedPart, beforePurchased, afterPurchased }));
    await purchasedPage.close();

    const existingPage = await openCreate(context, "part", fixture.classificationRootCode);
    await existingPage.locator(".canonical-create-number-list").waitFor({ state: "visible", timeout: 30_000 });
    requirePass([9, 12, 13], "existing-root form permits append without structure selector", await existingPage.getByText("結構型態", { exact: true }).count() === 0 && await existingPage.getByText(fixture.classificationRootCode, { exact: true }).count() > 0);
    const beforeAppend = counts();
    const append = await submitNewRoot(existingPage, { label: "existing-root append", itemKind: "purchased", primaryNoun: "", appendReason: "DEV-099 existing-root deferred classification append" });
    const appended = dbRead("SELECT * FROM part_numbers WHERE part_root_id = ? ORDER BY created_at DESC LIMIT 1", ["dev099-classification-root"])[0];
    const afterAppend = counts();
    requirePass([11, 12, 13, 16], "existing-root append initializes unclassified and preserves root", Boolean(appended?.structure_type === "unclassified" && afterAppend.roots === beforeAppend.roots && afterAppend.parts === beforeAppend.parts + 1 && afterAppend.drawings === beforeAppend.drawings), JSON.stringify({ append: append.request?.body, appended, beforeAppend, afterAppend }));
    await existingPage.close();

    const classification = await openPartDrawer(context, fixture.classificationPartNumbers[0]);
    const { page, drawer } = classification;
    const section = drawer.locator('[data-section="part-structure-classification"]');
    requirePass([29, 30, 31], "normal Part drawer exposes classification action", await section.getByRole("button", { name: "分類／批次分類", exact: true }).count() === 1 && await section.getByText("未分類", { exact: false }).count() > 0);
    await section.getByRole("button", { name: "分類／批次分類", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "設定結構型態" });
    await dialog.waitFor({ state: "visible", timeout: 30_000 });
    const candidates = dialog.locator("label.part-structure-candidate");
    requirePass([31, 32], "classification dialog is minimal and multi-selectable", await candidates.count() >= 4 && await dialog.getByText("不會因顏色差異建立不同 BOM", { exact: false }).count() === 1 && await dialog.getByRole("radio").count() === 2);
    const currentCheckbox = candidates.filter({ hasText: fixture.classificationPartNumbers[0] }).locator("input[type=checkbox]");
    const blueCheckbox = candidates.filter({ hasText: fixture.classificationPartNumbers[1] }).locator("input[type=checkbox]");
    const blackCheckbox = candidates.filter({ hasText: fixture.classificationPartNumbers[2] }).locator("input[type=checkbox]");
    requirePass([32], "current Part is required and locked while peers are selectable", await currentCheckbox.isChecked() && await currentCheckbox.isDisabled() && !await blueCheckbox.isDisabled());
    await blueCheckbox.check();
    await blackCheckbox.check();
    requirePass([32], "color variants can be selected independently", await blueCheckbox.isChecked() && await blackCheckbox.isChecked() && (await candidates.filter({ hasText: fixture.classificationPartNumbers[3] }).locator("input[type=checkbox]").isChecked()) === false);
    const assemblyRadio = dialog.getByRole("radio", { name: "組立件", exact: true });
    await assemblyRadio.check();
    const reason = dialog.locator("textarea");
    requirePass([22, 32], "batch classification reveals conditional reason", await dialog.getByText("分類原因（必填）", { exact: true }).count() === 1);
    await reason.fill("DEV-099 browser multi-select color classification");
    await page.screenshot({ path: screenshotPath("classification-dialog-1440.png"), fullPage: true });
    const patchRequest = page.waitForRequest((request) => request.method() === "PATCH" && request.url().includes("/structure-type"));
    await dialog.getByRole("button", { name: "儲存分類", exact: true }).click();
    const patch = await patchRequest;
    const patchBody = patch.postDataJSON();
    const patchHeaders = patch.headers();
    await dialog.waitFor({ state: "hidden", timeout: 30_000 });
    await section.getByText("組立件", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
    const classifiedRows = dbRead("SELECT id, structure_type FROM part_numbers WHERE id IN (?,?,?,?) ORDER BY id", fixture.classificationParts);
    requirePass([20, 21, 23, 32, 33], "batch classification commits exact selected Parts", classifiedRows.filter((row) => row.structure_type === "assembly").length === 3 && classifiedRows.filter((row) => row.structure_type === "unclassified").length === 1 && patchBody.targetPartNumberIds.length === 3 && patchBody.reason.includes("color") && Boolean(patchHeaders["if-match"]) && Boolean(patchHeaders["idempotency-key"]) && Boolean(patchHeaders["x-pdm-workbench-contract"]), JSON.stringify({ patchBody, rows: classifiedRows }));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator(".canonical-list").getByRole("button", { name: fixture.classificationPartNumbers[0], exact: true }).click();
    await page.locator('aside[aria-label="工作台明細"] [data-section="part-structure-classification"]').getByText("組立件", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
    requirePass([33], "fresh drawer readback preserves classification after reload", await page.locator('[data-section="part-structure-classification"]').getByText("組立件", { exact: false }).count() > 0);
    await page.locator('aside[aria-label="工作台明細"] [data-pdm-drawer-close="true"]').click();

    const stale = await openPartDrawer(context, fixture.classificationPartNumbers[0]);
    const staleSection = stale.drawer.locator('[data-section="part-structure-classification"]');
    await staleSection.getByRole("button", { name: "分類／批次分類", exact: true }).click();
    const staleDialog = stale.page.getByRole("dialog", { name: "設定結構型態" });
    await staleDialog.waitFor({ state: "visible", timeout: 30_000 });
    const staleBlue = staleDialog.locator("label.part-structure-candidate").filter({ hasText: fixture.classificationPartNumbers[3] }).locator("input[type=checkbox]");
    await staleBlue.check();
    const staleReason = staleDialog.locator("textarea");
    await staleReason.fill("stale recovery proof");
    const currentEtag = dbOne("SELECT updated_at FROM part_numbers WHERE id = ?", [fixture.classificationParts[0]]).updated_at;
    const staleViewResponse = await stale.page.request.get(`${baseUrl}/api/pdm/parts/${fixture.classificationParts[0]}/structure-type`);
    const staleView = await staleViewResponse.json();
    const stalePart = new Database(databasePath);
    stalePart.prepare("UPDATE part_numbers SET updated_at = ? WHERE id = ?").run(new Date(Date.now() + 1000).toISOString(), fixture.classificationParts[0]);
    stalePart.close();
    const stalePatch = stale.page.waitForResponse((response) => response.url().includes("/structure-type") && response.request().method() === "PATCH");
    await staleDialog.getByRole("button", { name: "儲存分類", exact: true }).click();
    const staleResponse = await stalePatch;
    requirePass([27, 34], "stale classification returns precondition response", staleResponse.status() === 412, `status=${staleResponse.status()} etag=${staleView?.data?.etag} old=${currentEtag}`);
    await staleDialog.getByRole("alert").waitFor({ state: "visible", timeout: 30_000 });
    requirePass([34, 35], "stale recovery preserves form and refreshes candidates", await staleBlue.isChecked() && await staleReason.inputValue() === "stale recovery proof" && await staleDialog.getByRole("button", { name: "儲存分類", exact: true }).isEnabled());
    await staleDialog.getByRole("button", { name: "取消", exact: true }).click();
    await stale.page.locator('[data-pdm-drawer-close="true"]').click();

    for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "landscape-tablet", width: 1024, height: 768 }, { name: "portrait-tablet", width: 768, height: 1024 }, { name: "mobile", width: 390, height: 844 }]) {
      const viewportClassification = await openPartDrawer(context, fixture.classificationPartNumbers[0]);
      await viewportClassification.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await viewportClassification.page.waitForTimeout(150);
      await verifyNoOverflow(viewportClassification.page, `${viewport.name} Part drawer`, viewport);
      const sectionBox = await viewportClassification.drawer.locator('[data-section="part-structure-classification"]').boundingBox();
      requirePass([40], `${viewport.name} classification section remains visible`, Boolean(sectionBox && sectionBox.width > 0 && sectionBox.height > 0), JSON.stringify(sectionBox));
      await viewportClassification.page.screenshot({ path: screenshotPath(`classification-${viewport.name}.png`), fullPage: true });
      await viewportClassification.page.keyboard.press("Escape");
      await viewportClassification.page.close();
    }

    const single = await openPartDrawer(context, fixture.singlePartNumber);
    requirePass([36], "single Part has no BOM section or CTA", await single.drawer.locator('[data-section="part-bom-context"]').count() === 0 && await single.drawer.getByRole("button", { name: "建立 BOM", exact: true }).count() === 0);
    await single.page.locator('[data-pdm-drawer-close="true"]').click();
    const assembly = await openPartDrawer(context, fixture.assemblyPartNumber);
    requirePass([37], "manufactured assembly with M exposes BOM create", await assembly.drawer.locator('[data-section="part-bom-context"]').count() === 1 && await assembly.drawer.getByRole("button", { name: "建立 BOM", exact: true }).count() === 1);
    await assembly.page.locator('[data-pdm-drawer-close="true"]').click();
    const noM = await openPartDrawer(context, fixture.assemblyNoMPartNumber);
    requirePass([38], "manufactured assembly without M shows blocker without create", await noM.drawer.locator('[data-bom-blocker="BOM_ASSEMBLY_REQUIRES_M_DRAWING"]').count() === 1 && await noM.drawer.getByRole("button", { name: "建立 BOM", exact: true }).count() === 0);
    await noM.page.locator('[data-pdm-drawer-close="true"]').click();
    const purchasedAssembly = await openPartDrawer(context, fixture.purchasedAssemblyPartNumber);
    requirePass([39], "purchased assembly is classifiable but has no manufacturing BOM action", await purchasedAssembly.drawer.locator('[data-bom-blocker="BOM_PURCHASED_ASSEMBLY_NOT_APPLICABLE"]').count() === 1 && await purchasedAssembly.drawer.getByRole("button", { name: "建立 BOM", exact: true }).count() === 0);
    await purchasedAssembly.page.locator('[data-pdm-drawer-close="true"]').click();

    const drawingPage = await context.newPage();
    monitor(drawingPage, "drawing-workbench");
    await drawingPage.goto(`${baseUrl}/numbering/drawings?query=Z990201-M`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await drawingPage.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    requirePass([36, 44], "drawing workbench has no parallel classification or BOM entry", await drawingPage.getByRole("button", { name: "建立 BOM", exact: true }).count() === 0 && await drawingPage.getByText("分類／批次分類", { exact: true }).count() === 0);
    await drawingPage.close();
  } finally {
    await context.close();
  }
}

async function main() {
  cleanupStaleBrowserDists();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
  const database = new Database(databasePath);
  database.exec(schema);
  database.close();
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "legacy", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir, PDM_RELEASE_MODE: "local_stub", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "", PDM_POSTGRES_URL: "", DATABASE_URL: "",
    PDM_ASSEMBLY_SHARED_BOM_V1: "true", PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true", PDM_BOM_XMIND_EDITOR_V2_ENABLED: "true",
    PDM_NEXT_DIST_DIR: `.tmp/qc-dev099-browser-${port ?? "pending"}`, PDM_BUILD_COMMIT: "dev099-browser-fixture"
  });
  const seeded = seedDev099Fixture();
  fixtureLedger.push(seeded);
  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  process.env.PDM_NEXT_DIST_DIR = `.tmp/qc-dev099-browser-${port}`;
  nextTsconfig = createTaskOwnedNextTsconfig(root, `dev099-${port}`, process.env.PDM_NEXT_DIST_DIR);
  process.env.PDM_NEXT_TSCONFIG_PATH = nextTsconfig.relativePath;
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-099 authenticated rendered UI and four viewport validation", port, owningProcessTree: "this runner -> task-owned Next.js child", cleanupCondition: "browser closed, exact Next child stopped, port released, task temp removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot } }));
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput, 90_000);
  browser = await chromium.launch({ headless: process.env.DEV099_HEADLESS !== "false" });
  await runBrowserCases();
  requirePass([35], "browser console/page/network sweep is clean", consoleErrors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0 && responseLedger.every((response) => response.status < 500), JSON.stringify({ consoleErrors, pageErrors, failedRequests, serverErrors: responseLedger.filter((response) => response.status >= 500) }));
}

let firstFailure = null;
try {
  await main();
} catch (error) {
  firstFailure = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(firstFailure);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (app) await stopNextApp(app.child).catch(() => undefined);
  if (port !== null) fs.rmSync(path.join(root, ".tmp", `qc-dev099-browser-${port}`), { recursive: true, force: true });
  if (nextTsconfig) fs.rmSync(nextTsconfig.absolutePath, { force: true });
  const nextEnvRestore = await restoreNextEnv(nextEnvSnapshot);
  if (!nextEnvRestore.restored) console.warn(`DEV099 next-env cleanup pending: ${nextEnvRestore.error}`);
  restoreEnvironment();
}

const result = {
  runner: "browser",
  status: !firstFailure && checks.every((item) => item.pass) ? "PASS" : "FAIL",
  runId,
  provider: "sqlite",
  productionWrites: false,
  runtime: { project: root, purpose: "DEV-099 authenticated rendered UI and four viewport validation", port, dataDir, repositoryDir, taskRoot, cleanupCondition: "browser and task-owned Next process stopped" },
  fixtureLedger,
  checks,
  cases: [...new Set(checks.filter((item) => item.pass).flatMap((item) => item.cases))].sort((a, b) => a - b),
  screenshots,
  requestLedger,
  responseLedger,
  previewLedger,
  consoleErrors,
  pageErrors,
  failedRequests,
  firstFailure
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "browser.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((item) => item.pass).length, total: checks.length, cases: result.cases }, null, 2));
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); } catch { /* cleanup is recorded in runtime */ }
if (result.status !== "PASS") process.exitCode = 1;
