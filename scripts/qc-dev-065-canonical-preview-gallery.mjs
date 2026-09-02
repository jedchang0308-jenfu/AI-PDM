#!/usr/bin/env node

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "playwright";
import sharp from "sharp";

import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev065-browser-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const fixtureRepository = path.join(fixtureDataDir, "repository");
const outputDir = path.join(root, "output", "qa", "dev-065-canonical-preview");
const browserDrawingQuery = "A0005";
const browserPartNumber = "A0005-P01";
const checks = [];
let app = null;
let browser = null;
let port = null;
const ownedDistDirs = [];

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login(page, baseUrl) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
}

async function waitForList(page) {
  await page.locator(".canonical-list").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false");
}

async function verifyEntity(page, viewport, input) {
  await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: input.title, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await waitForList(page);
  const baselineApi = await page.evaluate(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  }, input.api);
  check(`${viewport} ${input.entity} list API available`, baselineApi.status === 200, JSON.stringify(baselineApi.body));
  const rows = page.locator("[data-canonical-workbench-row='true']");
  check(`${viewport} ${input.entity} list loaded`, await rows.count() > 0, String(await rows.count()));
  const rowKeys = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-row-key")));
  const switcher = page.getByRole("radiogroup", { name: "顯示方式" });
  check(`${viewport} ${input.entity} layout switch visible`, await switcher.count() === 1);
  await switcher.getByRole("radio", { name: "3D 清單", exact: true }).click();
  check(`${viewport} ${input.entity} 3D list keeps table`, await page.locator(".canonical-table-wrap").count() === 1);
  check(`${viewport} ${input.entity} 3D list exposes inline preview`, await page.locator("[data-canonical-inline-preview='true']").count() >= 1);
  await switcher.getByRole("radio", { name: "預覽圖", exact: true }).click();
  await page.locator(".canonical-preview-gallery").waitFor({ state: "visible", timeout: 30_000 });
  const map = baselineApi.body?.data?.previewByRowKey;
  check(`${viewport} ${input.entity} neutral map matches visible rows`, map && Object.keys(map).sort().join(",") === rowKeys.slice().sort().join(","), JSON.stringify(map));
  const cards = page.locator("[data-canonical-preview-card='true']");
  check(`${viewport} ${input.entity} card count matches rows`, await cards.count() === rowKeys.length, `${await cards.count()} != ${rowKeys.length}`);
  check(`${viewport} ${input.entity} card has accessible state`, await cards.first().evaluate((element) => element.tagName === "BUTTON" && Boolean(element.getAttribute("aria-label"))));
  await cards.first().focus();
  await cards.first().press("ArrowRight");
  check(`${viewport} ${input.entity} roving focus moves`, await cards.nth(Math.min(1, (await cards.count()) - 1)).evaluate((element) => document.activeElement === element));
  await cards.first().press("Enter");
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "visible", timeout: 30_000 });
  check(`${viewport} ${input.entity} card opens canonical drawer`, await page.locator(".pdm-entity-detail-drawer").count() === 1);
  if (input.entity === "part") {
    await page.locator("[data-canonical-preview-section='canonical-part-preview']").waitFor({ state: "visible", timeout: 30_000 });
    check(`${viewport} Part drawer uses one shared preview panel`, await page.locator("[data-canonical-preview-section='canonical-part-preview']").count() === 1 && await page.locator("[data-canonical-preview-section='canonical-part-preview'] .drawing-preview-card").count() === 1);
  } else {
    await page.locator("[data-component='canonical-preview-panel']").first().waitFor({ state: "visible", timeout: 30_000 });
    check(`${viewport} Drawing adapter uses shared preview panel`, await page.locator("[data-component='canonical-preview-panel']").count() >= 1);
  }
  return { switcher, rowKeys, previewByRowKey: map };
}

async function verifyPartMutation(page, baseUrl) {
  const partNumber = (await page.locator(".pdm-entity-detail-drawer").getByRole("heading", { level: 2 }).textContent())?.trim() || browserPartNumber;
  const png = await sharp({ create: { width: 160, height: 120, channels: 4, background: { r: 16, g: 130, b: 110, alpha: 1 } } }).png().toBuffer();
  const fileInput = page.locator(".part-preview-source-control input[type='file']");
  await fileInput.setInputFiles({ name: "browser-part-preview.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "使用主要製造圖", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  check("desktop Part custom source label is omitted", await page.locator("[data-canonical-preview-section='canonical-part-preview']").getByText("自訂圖片", { exact: true }).count() === 0);
  await page.locator("[data-canonical-preview-section='canonical-part-preview'] [data-preview-media='image']").waitFor({ state: "visible", timeout: 30_000 });
  check("desktop Part custom upload renders through shared media", await page.locator("[data-canonical-preview-section='canonical-part-preview'] [data-preview-media='image']").count() === 1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "visible", timeout: 30_000 });
  check("desktop Part custom source label stays omitted after reload", await page.locator("[data-canonical-preview-section='canonical-part-preview']").getByText("自訂圖片", { exact: true }).count() === 0);
  await page.locator("[data-canonical-preview-section='canonical-part-preview'] [data-preview-media='image']").waitFor({ state: "visible", timeout: 30_000 });
  check("desktop Part custom source persists after reload", await page.getByRole("button", { name: "使用主要製造圖", exact: true }).count() === 1);

  const attachmentList = await page.request.get(`${baseUrl}/api/parts/${encodeURIComponent(partNumber)}/attachments`);
  const attachmentListBody = await attachmentList.json();
  const activeAttachment = attachmentListBody.attachments?.find((item) => item.documentCategory === "part_preview_image");
  const activeDeleteResponse = activeAttachment
    ? await page.request.delete(`${baseUrl}/api/parts/${encodeURIComponent(partNumber)}/attachments/${encodeURIComponent(activeAttachment.id)}`, {
        headers: { "content-type": "application/json" },
        data: { reason: "DEV-065 active guard QC" }
      })
    : null;
  const activeDelete = {
    listStatus: attachmentList.status(),
    status: activeDeleteResponse?.status() ?? 0,
    body: activeDeleteResponse ? await activeDeleteResponse.json() : null,
    attachmentId: activeAttachment?.id ?? null
  };
  check("desktop active preview generic delete is fixed 409", activeDelete.status === 409 && activeDelete.body?.error?.code === "PART_PREVIEW_ACTIVE_ASSET" && activeDelete.body?.error?.message === "請先恢復使用主要製造圖或更換預覽圖", JSON.stringify(activeDelete));

  const genericReservedResponse = await page.request.post(`${baseUrl}/api/parts/${encodeURIComponent(partNumber)}/attachments`, {
    multipart: {
      file: { name: "reserved.png", mimeType: "image/png", buffer: png },
      document_category: "part_preview_image"
    }
  });
  const genericReserved = { status: genericReservedResponse.status(), body: await genericReservedResponse.json() };
  check("desktop generic attachment POST cannot mint reserved category", genericReserved.status === 400 && String(genericReserved.body?.error ?? "").includes("CATEGORY"), JSON.stringify(genericReserved));

  await page.getByRole("button", { name: "使用主要製造圖", exact: true }).click();
  await page.getByRole("button", { name: "上傳圖片", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  check("desktop reset immediately uses server readback", await page.getByRole("button", { name: "上傳圖片", exact: true }).count() === 1);
  const releasedDeleteResponse = await page.request.delete(`${baseUrl}/api/parts/${encodeURIComponent(partNumber)}/attachments/${encodeURIComponent(activeDelete.attachmentId)}`, {
    headers: { "content-type": "application/json" },
    data: { reason: "DEV-065 reset cleanup QC" }
  });
  const releasedDelete = { status: releasedDeleteResponse.status(), body: await releasedDeleteResponse.json() };
  check("desktop reset releases prior custom asset for normal delete", releasedDelete.status === 200 && releasedDelete.body?.deleted === true, JSON.stringify(releasedDelete));

  const unauthenticated = await page.context().browser().newContext();
  const unauthPage = await unauthenticated.newPage();
  const unauthResponse = await unauthPage.request.post(`${baseUrl}/api/parts/${encodeURIComponent(partNumber)}/preview-image/reset`, { headers: { "content-type": "application/json", "idempotency-key": "dev065-unauth" }, data: { expectedRowVersion: 0 } });
  check("unauthenticated preview mutation is rejected", [401, 403].includes(unauthResponse.status()), String(unauthResponse.status()));
  await unauthenticated.close();
}

async function verifyViewport(context, baseUrl, viewport) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await login(page, baseUrl);
  const drawing = await verifyEntity(page, viewport.name, { entity: "drawing", title: "圖號工作台", url: `${baseUrl}/numbering/drawings?query=${browserDrawingQuery}`, api: `/api/numbering/drawings/workbench?query=${browserDrawingQuery}&limit=100` });
  await page.getByRole("button", { name: "關閉明細" }).click();
  await drawing.switcher.getByRole("radio", { name: "文字清單", exact: true }).click();
  check(`${viewport.name} Drawing layout preference is separate`, await page.evaluate(() => window.localStorage.getItem("pdm-canonical-drawing-layout-v1") === "list"));

  const part = await verifyEntity(page, viewport.name, { entity: "part", title: "料號工作台", url: `${baseUrl}/parts?query=${browserDrawingQuery}`, api: `/api/parts/workbench?query=${browserDrawingQuery}&limit=100` });
  const partPreview = Object.values(part.previewByRowKey ?? {})[0];
  const partPreviewSection = page.locator("[data-canonical-preview-section='canonical-part-preview']");
  check(`${viewport.name} Part custom source label is omitted`, partPreview?.sourceType === "custom_image" ? await partPreviewSection.getByText("自訂圖片", { exact: true }).count() === 0 : true);
  check(`${viewport.name} Part custom source metadata is omitted`, partPreview?.sourceType === "custom_image" ? await partPreviewSection.locator(".drawing-preview-board-header strong").count() === 0 : true);
  check(`${viewport.name} Part structure helper text is omitted`, !(await page.locator(".part-structure-classification-summary").textContent() ?? "").includes("同根號其他料號僅供批次選擇"));
  check(`${viewport.name} Part reset action is shown only with a manufacturing drawing`, await page.getByRole("button", { name: "使用主要製造圖", exact: true }).count() <= 1);
  check(`${viewport.name} A0005 auto preview uses active RD ready source`, partPreview?.state === "ready"
    && partPreview?.sourceLabel === "研發預覽"
    && partPreview?.sourceDrawingNumber === "A0005-M01"
    && partPreview?.sourceRevision === "0.1", JSON.stringify(partPreview));
  if (viewport.name === "desktop") await verifyPartMutation(page, baseUrl);
  await page.getByRole("button", { name: "關閉明細" }).click();
  check(`${viewport.name} no page horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  check(`${viewport.name} no page errors`, errors.length === 0, JSON.stringify(errors));
  check(`${viewport.name} evidence captures Part preview mode`, await page.locator(".canonical-preview-gallery").isVisible());
  await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
  await part.switcher.getByRole("radio", { name: "文字清單", exact: true }).click();
  check(`${viewport.name} Part layout preference is separate`, await page.evaluate(() => window.localStorage.getItem("pdm-canonical-part-layout-v1") === "list"));
  await page.close();
}

async function stopOwnedRuntime(runtime, runtimePort) {
  if (runtime?.child) await stopNextApp(runtime.child).catch(() => {});
  if (runtime?.child?.exitCode === null && process.platform === "win32") spawnSync("taskkill", ["/PID", String(runtime.child.pid), "/T", "/F"], { stdio: "ignore" });
  let released = runtimePort === null;
  if (runtimePort !== null) {
    for (let attempt = 0; attempt < 20 && !released; attempt += 1) { released = !(await canConnect(runtimePort)); if (!released) await delay(250); }
  }
  return released;
}

async function verifyFeatureOff(runtimeBrowser, baseUrl) {
  const context = await runtimeBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await login(page, baseUrl);
  await page.goto(`${baseUrl}/parts?query=${browserDrawingQuery}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForList(page);
  check("feature-off Part preview switch is absent", await page.getByRole("radio", { name: "預覽圖", exact: true }).count() === 0);
  const listResponse = await page.request.get(`${baseUrl}/api/parts/workbench?query=${browserDrawingQuery}&limit=100`);
  const listBody = await listResponse.json();
  check("feature-off Part list has no preview projection", listResponse.status() === 200 && listBody.data?.previewByRowKey === undefined);
  const resetResponse = await page.request.post(`${baseUrl}/api/parts/${browserPartNumber}/preview-image/reset`, {
    headers: { "content-type": "application/json", "idempotency-key": "dev065-feature-off" },
    data: { expectedRowVersion: 0 }
  });
  check("feature-off Part mutation route is 404", resetResponse.status() === 404, String(resetResponse.status()));
  await page.goto(`${baseUrl}/numbering/drawings?query=${browserDrawingQuery}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForList(page);
  check("feature-off keeps Drawing preview capability", await page.getByRole("radio", { name: "預覽圖", exact: true }).count() === 1);
  check("feature-off browser has no page errors", errors.length === 0, JSON.stringify(errors));
  await context.close();
}

function canConnect(portNumber) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: portNumber });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  port = await getFreePort();
  let baseUrl = `http://127.0.0.1:${port}`;
  const enabledDistDir = `.tmp/qc-dev065-browser-${port}`;
  ownedDistDirs.push(enabledDistDir);
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository,
    PDM_BUILD_COMMIT: "local-dev",
    PDM_RELEASE_MODE: "local_stub",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_NEXT_DIST_DIR: enabledDistDir,
    PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
    PDM_WORKBENCH_PREVIEW_GALLERY_V1: "true",
    PDM_PART_PREVIEW_V1: "true",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: ""
  });
  console.log(`QC DEV-065 runtime: project=${root}; purpose=Drawing+Part shared preview browser QA; port=${port}; owner=current QC process tree; cleanup=after assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "laptop", width: 1024, height: 768 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const context = await browser.newContext({ viewport });
    await verifyViewport(context, baseUrl, viewport);
    await context.close();
  }
  await browser.close();
  browser = null;
  const enabledPort = port;
  check("feature-on task runtime port released before off check", await stopOwnedRuntime(app, enabledPort), String(enabledPort));
  app = null;

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const disabledDistDir = `.tmp/qc-dev065-browser-${port}`;
  ownedDistDirs.push(disabledDistDir);
  Object.assign(process.env, {
    PDM_PART_PREVIEW_V1: "false",
    PDM_NEXT_DIST_DIR: disabledDistDir,
    PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`QC DEV-065 runtime: project=${root}; purpose=Part preview feature-off rollback QA; port=${port}; owner=current QC process tree; cleanup=after assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  await verifyFeatureOff(browser, baseUrl);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  const portReleased = await stopOwnedRuntime(app, port);
  check("task-owned browser runtime port released", portReleased, String(port));
  let cleanupStatus = "removed";
  try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch { cleanupStatus = "retry-required"; }
  for (const distDir of ownedDistDirs) {
    const removed = removeTaskOwnedWorkspaceTempDir(root, distDir);
    check(`task-owned Next dist removed: ${distDir}`, removed.removed, removed.error ?? removed.path);
  }
  console.log(`QC DEV-065 cleanup: tempRoot=${tempRoot}; status=${cleanupStatus}; port=${port ?? "not-started"}; portReleased=${portReleased}`);
  for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
  if (checks.length && checks.every((item) => item.pass) && process.exitCode !== 1) console.log(`DEV-065 browser QC passed: ${checks.length} checks; productionConnected=false; productionWrites=false`);
}
