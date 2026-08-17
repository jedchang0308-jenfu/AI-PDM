#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";

const root = process.cwd();
const runId = new Date().toISOString().replaceAll(/[-:.TZ]/gu, "").slice(0, 14);
const outputDir = path.join(root, "output", "qa", "dev-071-xmind-bom-editor", runId);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev071-browser-"));
const repositoryDir = path.join(tempDir, "repository");
const distDirRelative = `.tmp/next-qc-dev071-browser-${crypto.randomUUID()}`;
const distDir = path.resolve(root, distDirRelative);
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const token = Date.now().toString().slice(-8);
const results = [];
const screenshots = [];
const consoleErrors = [];
const unexpectedHttpErrors = [];
const expectedHttpErrors = [];
const generatedConfigBackups = new Map(
  ["tsconfig.json", "next-env.d.ts"].map((file) => [file, fs.readFileSync(path.join(root, file))])
);
let serverProcess;
let serverLog = "";
let browser;
let draftId = "";

const fixture = {
  parentPartId: `dev071-browser-parent-part-${token}`,
  parentItemId: `dev071-browser-parent-item-${token}`,
  parentPartNumber: `P-DEV071-UI-PARENT-${token}`,
  childPartId: `dev071-browser-child-part-${token}`,
  childItemId: `dev071-browser-child-item-${token}`,
  childSubmissionId: `dev071-browser-child-submission-${token}`,
  childPartNumber: `P-DEV071-UI-CHILD-${token}`
};

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  assert.ok(passed, `${name}${detail ? `: ${detail}` : ""}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function prepareFixture() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(path.join(root, "data", "ai-pdm.sqlite"), path.join(tempDir, "ai-pdm.sqlite"));
  const db = new Database(path.join(tempDir, "ai-pdm.sqlite"));
  try {
    db.prepare("UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1, session_invalid_before = NULL, account_lifecycle_version = 1 WHERE email IN ('engineer@example.com', 'manager@example.com')").run();
    const partRoot = db.prepare("SELECT id FROM part_roots WHERE record_status <> 'Obsolete' ORDER BY id LIMIT 1").get();
    if (!partRoot?.id) throw new Error("DEV071_BROWSER_PART_ROOT_MISSING");
    const maxSequence = Number(db.prepare("SELECT COALESCE(MAX(sequence_no), 0) AS value FROM part_numbers WHERE part_root_id = ?").get(partRoot.id).value);
    const now = new Date().toISOString();
    const insertItem = db.prepare("INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 'A', ?, ?)");
    insertItem.run(fixture.parentItemId, fixture.parentPartNumber, "DEV-071 UI parent", now, now);
    insertItem.run(fixture.childItemId, fixture.childPartNumber, "DEV-071 UI child", now, now);
    const insertPart = db.prepare("INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, created_by, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, 'manufactured', 'Released', 'user-engineer-demo', ?, ?)");
    insertPart.run(fixture.parentPartId, partRoot.id, fixture.parentPartNumber, maxSequence + 1, `U71P${token}`, "DEV-071 UI parent", now, now);
    insertPart.run(fixture.childPartId, partRoot.id, fixture.childPartNumber, maxSequence + 2, `U71C${token}`, "DEV-071 UI child", now, now);
    db.prepare("INSERT INTO submissions (id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type, change_description, status, submitted_by, approval_required, released_at, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 'A', 'QC', 'QC', 'Part', 'DEV-071 browser fixture', 'Released', 'user-engineer-demo', 1, ?, ?, ?)").run(fixture.childSubmissionId, fixture.childItemId, `DEV071-UI-${token}`, now, now, now);
  } finally { db.close(); }
}

function startServer() {
  serverProcess = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "demo",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_RELEASE_MODE: "local_stub",
      PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: distDirRelative,
      PDM_BOM_XMIND_EDITOR_V2_ENABLED: "true"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const capture = (chunk) => {
    serverLog = `${serverLog}${chunk.toString()}`.slice(-200_000);
  };
  serverProcess.stdout?.on("data", capture);
  serverProcess.stderr?.on("data", capture);
}

async function waitForServer() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null) throw new Error(`DEV071_BROWSER_SERVER_EXIT_${serverProcess?.exitCode}\n${serverLog.slice(-4_000)}`);
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`DEV071_BROWSER_SERVER_TIMEOUT\n${serverLog.slice(-4_000)}`);
}

async function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    const exited = new Promise((resolve) => serverProcess.once("exit", resolve));
    serverProcess.kill();
    await Promise.race([exited, delay(5_000)]);
  }
  for (const [file, content] of generatedConfigBackups) fs.writeFileSync(path.join(root, file), content);
  if (distDir.startsWith(path.join(root, ".tmp") + path.sep)) fs.rmSync(distDir, { recursive: true, force: true });
  if (tempDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(tempDir, { recursive: true, force: true });
  const manifestPath = path.join(outputDir, "run-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.cleanupStatus = "removed";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ?? "chrome", headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}

async function authenticatedContext(viewport) {
  const response = await fetch(`${baseUrl}/api/auth/login?account=Engineer`, { redirect: "manual" });
  const header = response.headers.get("set-cookie") ?? "";
  const pair = header.split(";", 1)[0];
  const separator = pair.indexOf("=");
  record(`login for ${viewport.width}x${viewport.height}`, response.status === 303 && separator > 0, `HTTP ${response.status}`);
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 768 });
  await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
  return context;
}

function watchPage(page) {
  page.on("console", (message) => {
    const value = message.text();
    const expectedConflictNoise = value.includes("Failed to load resource") && value.includes("409 (Conflict)");
    const dashboardTeardownNoise = page.url().endsWith("/") && value.includes("TypeError: Failed to fetch") && value.includes("Dashboard.useCallback[loadMe]");
    if (message.type() === "error" && !value.includes("favicon") && !expectedConflictNoise && !dashboardTeardownNoise) consoleErrors.push({ url: page.url(), text: value });
  });
  page.on("pageerror", (error) => consoleErrors.push({ url: page.url(), text: error.message }));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const entry = { url: response.url(), status: response.status(), method: response.request().method() };
    if (response.status() === 409 && response.url().includes(`/api/bom/drafts/${draftId}`)) expectedHttpErrors.push(entry);
    else if (!response.url().endsWith("/favicon.ico")) unexpectedHttpErrors.push(entry);
  });
}

async function screenshot(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  screenshots.push(file);
  return file;
}

async function createDraft(page) {
  const result = await page.evaluate(async ({ ownerPartNumberId }) => {
    const response = await fetch("/api/bom/drafts", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ ownerPartNumberId, bomRevision: "1", source: "manual", draftName: "DEV-071 browser draft" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { ownerPartNumberId: fixture.parentPartId });
  record("browser fixture draft created", result.status === 201 && Boolean(result.body.draft?.id), `HTTP ${result.status} ${JSON.stringify(result.body)}`);
  draftId = result.body.draft.id;
}

async function openEditor(page) {
  await page.goto(`${baseUrl}/bom/workbench/${encodeURIComponent(draftId)}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-testid='xmind-bom-editor']").waitFor({ timeout: 30_000 });
}

async function editActiveInput(page, value) {
  const input = page.locator(".xmind-bom-node-inline-input").last();
  try {
    await input.waitFor({ timeout: 5_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      activeElement: { tag: document.activeElement?.tagName, className: document.activeElement?.className, text: document.activeElement?.textContent?.slice(0, 80) },
      nodes: [...document.querySelectorAll("[data-editor-node-id]")].map((node) => {
        const rect = node.getBoundingClientRect();
        return { id: node.getAttribute("data-editor-node-id"), selected: node.getAttribute("aria-selected"), text: node.textContent?.slice(0, 80), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
      }),
      inputs: [...document.querySelectorAll(".xmind-bom-node-inline-input")].map((node) => {
        const rect = node.getBoundingClientRect();
        return { value: node.value, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
      })
    }));
    await screenshot(page, `debug-inline-input-${screenshots.length + 1}`);
    throw new Error(`INLINE_INPUT_NOT_VISIBLE ${JSON.stringify(diagnostics)} ${error.message}`);
  }
  await input.fill(value);
  await input.press("Enter");
}

async function createGroupFromPicker(page, value) {
  const picker = page.locator(".xmind-bom-inline-picker");
  await picker.waitFor({ timeout: 5_000 });
  await picker.getByRole("button", { name: /建立群組主題/u }).click();
  await editActiveInput(page, value);
}

async function assertNoHorizontalOverflow(page, label) {
  const value = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${label} no horizontal overflow`, value <= 2, `${value}px`);
}

async function pickerChooseItem(page, query, viaKeyboard = false) {
  const picker = page.locator(".xmind-bom-inline-picker");
  await picker.waitFor({ timeout: 5_000 });
  const input = picker.getByRole("textbox", { name: "搜尋料件" });
  await input.fill(query);
  const result = picker.getByRole("option").first();
  await result.waitFor({ timeout: 8_000 });
  if (viaKeyboard) await input.press("Enter");
  else await result.click();
}

async function impactedWalk(page) {
  await openEditor(page);
  const child = fixture.childPartNumber;
  const toolbarTopic = page.getByRole("button", { name: /^主題/u });
  const toolbarSubtopic = page.getByRole("button", { name: /^子主題/u });

  await toolbarTopic.click();
  record("CR-001 toolbar Topic opens canonical picker", await page.locator(".xmind-bom-inline-picker").isVisible());
  await screenshot(page, "14-impacted-topic-picker");
  await pickerChooseItem(page, child);
  record("CR-001 canonical item inserted as Topic", await page.locator(".xmind-bom-node", { hasText: child }).count() >= 1);

  await toolbarSubtopic.click();
  record("CR-002 toolbar Subtopic opens picker", await page.locator(".xmind-bom-inline-picker").isVisible());
  await pickerChooseItem(page, child, true);
  record("CR-002 keyboard Enter inserts first result", await page.locator(".xmind-bom-node", { hasText: child }).count() >= 2);

  const selectedItem = page.locator(".xmind-bom-node", { hasText: child }).last();
  await selectedItem.hover();
  await selectedItem.getByRole("button", { name: "新增子主題" }).click();
  record("CR-003 hover plus opens picker", await page.locator(".xmind-bom-inline-picker").isVisible());
  await pickerChooseItem(page, child);
  record("CR-003 hover plus inserts child", await page.locator(".xmind-bom-node", { hasText: child }).count() >= 3);

  await page.getByRole("button", { name: /^插入/u }).click();
  const insertMenu = page.getByRole("menu", { name: "插入選項" });
  await insertMenu.waitFor();
  record("TB-005 Insert menu exposes Parent/Floating/Group", (await insertMenu.getByRole("menuitem").allTextContents()).join(" ").includes("Parent Topic") && (await insertMenu.getByRole("menuitem").count()) === 4);
  await screenshot(page, "15-impacted-insert-menu");
  await insertMenu.getByRole("menuitem", { name: /父主題/u }).click();
  await editActiveInput(page, "Parent from Insert");

  await page.getByRole("button", { name: /^插入/u }).click();
  await page.getByRole("menuitem", { name: /浮動主題/u }).click();
  await page.locator(".xmind-bom-inline-picker").getByRole("button", { name: /建立群組主題/u }).click();
  await editActiveInput(page, "Floating from Insert");

  await page.getByRole("button", { name: /^插入/u }).click();
  await page.getByRole("menuitem", { name: /群組主題/u }).click();
  await editActiveInput(page, "Group from Insert");
  record("TB-005 Parent/Floating/Group actions complete", await page.locator(".xmind-bom-node", { hasText: "Parent from Insert" }).count() === 1 && await page.locator(".xmind-bom-node.floating", { hasText: "Floating from Insert" }).count() === 1);

  const detailButton = page.getByRole("button", { name: "詳細資料" });
  if (await detailButton.getAttribute("aria-pressed") === "true") await detailButton.click();
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(250);
  const leaf = page.locator(".xmind-bom-node", { hasText: child }).last();
  const beforeLeafDelete = await page.locator(".xmind-bom-node", { hasText: child }).count();
  await leaf.click();
  await page.keyboard.press("Delete");
  record("KB-008 leaf Delete is direct and reversible", await page.getByRole("alertdialog").count() === 0 && await page.locator(".xmind-bom-node", { hasText: child }).count() === beforeLeafDelete - 1);
  await page.keyboard.press("Control+z");
  record("KB-008 Ctrl+Z restores leaf", await page.locator(".xmind-bom-node", { hasText: child }).count() === beforeLeafDelete);
  if (await page.getByText("未儲存", { exact: true }).count()) {
    const saved = page.waitForResponse((response) => response.url().includes(`/api/bom/drafts/${draftId}`) && response.request().method() === "PATCH" && response.status() === 200);
    await page.keyboard.press("Control+s");
    await saved;
  }

  await page.getByRole("button", { name: "更多" }).click();
  const more = page.getByRole("dialog", { name: "更多編輯選項" });
  await more.waitFor();
  record("MR-004..007 More menu exposes lifecycle actions", await more.getByRole("button", { name: "導覽圖" }).isVisible() && await more.getByRole("button", { name: "設為目前" }).isVisible() && await more.getByRole("button", { name: "複製草稿" }).isVisible() && await more.getByRole("button", { name: "刪除草稿" }).isVisible());
  await screenshot(page, "16-impacted-more-menu");
  await more.getByRole("button", { name: "導覽圖" }).click();
  await page.getByRole("button", { name: "更多" }).click();
  await more.getByRole("button", { name: "複製草稿" }).waitFor({ state: "visible" });
  record("MR-006 clone action is enabled on saved Draft", await more.getByRole("button", { name: "複製草稿" }).isEnabled());
  const cloneResponse = page.waitForResponse((response) => response.url().endsWith("/api/bom/drafts") && response.request().method() === "POST" && response.status() === 201);
  await more.getByRole("button", { name: "複製草稿" }).click();
  const cloneBody = await (await cloneResponse).json();
  await page.waitForTimeout(1_000);
  record("MR-006 clone creates and selects a new Draft", page.url().includes(cloneBody.draft.id));

  const fixtureDb = new Database(path.join(tempDir, "ai-pdm.sqlite"));
  fixtureDb.prepare("UPDATE bom_drafts SET is_active = 0 WHERE id = ?").run(draftId);
  fixtureDb.close();
  await page.goto(`${baseUrl}/bom/workbench/${encodeURIComponent(draftId)}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-testid='xmind-bom-editor']").waitFor();
  await page.getByRole("button", { name: "更多" }).click();
  const cloneMore = page.getByRole("dialog", { name: "更多編輯選項" });
  const setActive = cloneMore.getByRole("button", { name: "設為目前" });
  record("MR-005 inactive Draft can be set active", await setActive.isEnabled());
  const activeResponse = page.waitForResponse((response) => response.url().endsWith(`/api/bom/drafts/${draftId}/active`) && response.request().method() === "POST" && response.status() === 200);
  await setActive.click();
  await activeResponse;
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("button", { name: "刪除草稿" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "刪除 BOM 草稿？" });
  await deleteDialog.waitFor();
  record("MR-007 delete shows high-risk impact confirmation", await deleteDialog.getByText(/移至已刪除資料區/u).isVisible());
  await screenshot(page, "17-impacted-draft-delete-dialog");
  await deleteDialog.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("button", { name: "刪除草稿" }).click();
  const deleteResponse = page.waitForResponse((response) => response.url().endsWith(`/api/bom/drafts/${draftId}/delete`) && response.request().method() === "POST" && response.status() === 200);
  await page.getByRole("alertdialog", { name: "刪除 BOM 草稿？" }).getByRole("button", { name: "確認刪除草稿" }).click();
  await deleteResponse;
  record("MR-007 confirmed delete completes", true);
}

async function desktopWalk(page) {
  await openEditor(page);
  const toolbarButtons = page.locator(".xmind-bom-toolbar-button");
  record("toolbar has exact 10 XMind slots", await toolbarButtons.count() === 10, String(await toolbarButtons.count()));
  const rects = await toolbarButtons.evaluateAll((buttons) => buttons.map((button) => ({ label: button.getAttribute("title"), left: button.getBoundingClientRect().left, height: button.getBoundingClientRect().height })));
  record("toolbar slot order is monotonic", rects.every((rect, index) => index === 0 || rect.left > rects[index - 1].left), JSON.stringify(rects));
  record("toolbar slots are 52px", rects.every((rect) => Math.abs(rect.height - 52) <= 1), JSON.stringify(rects));
  await screenshot(page, "01-1440-toolbar-map-initial");

  await page.keyboard.press("Tab");
  record("KB-002 Map Tab opens subtopic picker", await page.locator(".xmind-bom-inline-picker").isVisible());
  await createGroupFromPicker(page, "主群組");
  await page.keyboard.press("Enter");
  record("KB-001 Map Enter opens topic picker", await page.locator(".xmind-bom-inline-picker").isVisible());
  await createGroupFromPicker(page, "同層群組");
  await page.locator(".xmind-bom-node", { hasText: "主群組" }).click();
  await page.keyboard.press("Control+Enter");
  await editActiveInput(page, "父群組");
  record("Enter Tab Ctrl+Enter create expected topics", await page.locator(".xmind-bom-node", { hasText: "父群組" }).count() === 1 && await page.locator(".xmind-bom-node", { hasText: "同層群組" }).count() === 1);

  const pane = page.locator(".react-flow__pane");
  const paneBox = await pane.boundingBox();
  await page.mouse.dblclick(paneBox.x + paneBox.width * 0.76, paneBox.y + paneBox.height * 0.28);
  await editActiveInput(page, "暫存群組");
  record("double-click blank creates Floating Topic", await page.locator(".xmind-bom-node.floating", { hasText: "暫存群組" }).count() === 1);
  await screenshot(page, "02-1440-floating-stage");

  await page.getByRole("button", { name: "更多" }).click();
  const blocker = page.getByText(/尚有 1 個 Floating Topic 未歸位/u);
  await blocker.waitFor();
  record("unresolved Floating Topic has visible review blocker", await blocker.isVisible());
  record("review button disabled while floating exists", await page.getByRole("button", { name: "送出審核" }).isDisabled());
  await screenshot(page, "03-1440-unresolved-review-blocker");
  await page.keyboard.press("Escape");

  const saveResponse = page.waitForResponse((response) => response.url().includes(`/api/bom/drafts/${draftId}`) && response.request().method() === "PATCH" && response.status() === 200);
  await page.keyboard.press("Control+s");
  await saveResponse;
  record("Ctrl+S saves both editor graphs", await page.getByText(/已儲存/u).count() >= 1);

  await page.getByRole("tab", { name: "大綱" }).click();
  await page.locator(".xmind-bom-outliner").waitFor();
  record("Outliner renders formal and floating graphs", await page.locator(".xmind-bom-outliner-section", { hasText: "Floating Topic" }).isVisible());
  await screenshot(page, "04-1440-outliner-shared-state");
  await page.getByRole("tab", { name: "心智圖" }).click();

  await page.locator(".xmind-bom-node", { hasText: "父群組" }).click();
  await page.keyboard.press("Control+;");
  await page.getByRole("button", { name: "顯示完整內容" }).waitFor();
  record("branch focus exposes full-content recovery", await page.getByRole("button", { name: "顯示完整內容" }).isVisible());
  await screenshot(page, "05-1440-branch-focus-recovery");
  await page.getByRole("button", { name: "顯示完整內容" }).click();

  await page.locator(".xmind-bom-node", { hasText: "父群組" }).click();
  await page.keyboard.press("Delete");
  await page.getByRole("alertdialog").waitFor();
  record("Delete opens reversible branch confirmation", await page.getByText(/Ctrl\+Z 復原/u).isVisible());
  await screenshot(page, "06-1440-delete-confirm");
  await page.getByRole("button", { name: "取消" }).click();

  const source = page.locator(".xmind-bom-node", { hasText: "同層群組" });
  const target = page.locator(".xmind-bom-node", { hasText: "父群組" });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y - 16, { steps: 12 });
  await page.waitForTimeout(150);
  record("drag before preview is visible", await page.locator(".xmind-bom-node.drop-before").count() === 1);
  await screenshot(page, "07-1440-drop-before-preview");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.waitForTimeout(150);
  record("drag child preview is visible", await page.locator(".xmind-bom-node.drop-child").count() === 1);
  await screenshot(page, "08-1440-drop-child-preview");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height + 18, { steps: 8 });
  await page.waitForTimeout(150);
  record("drag after preview is visible", await page.locator(".xmind-bom-node.drop-after").count() === 1);
  await screenshot(page, "09-1440-drop-after-preview");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 6 });
  await page.mouse.up();

  if (await page.getByText("未儲存").count()) {
    const saved = page.waitForResponse((response) => response.url().includes(`/api/bom/drafts/${draftId}`) && response.request().method() === "PATCH" && response.status() === 200);
    await page.keyboard.press("Control+s");
    await saved;
  }
  await page.keyboard.press("Enter");
  await createGroupFromPicker(page, "衝突測試群組");
  const winner = await page.evaluate(async ({ draftId: id }) => {
    const getResponse = await fetch(`/api/bom/drafts/${id}`);
    const current = await getResponse.json();
    const draft = current.draft;
    const response = await fetch(`/api/bom/drafts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedEditorVersion: draft.editor_version,
        reason: "concurrent winner",
        lines: draft.lines.map((line) => ({ id: line.id, parentLineId: line.parent_line_id, nodeType: line.node_type, partNumber: line.part_number, revision: line.revision, groupName: line.group_name, quantity: line.quantity, sequenceNo: line.sequence_no })),
        floatingTopics: draft.floating_topics.map((topic) => ({ id: topic.id, parentFloatingTopicId: topic.parent_floating_topic_id, nodeType: topic.node_type, partNumber: topic.part_number, revision: topic.revision, groupName: topic.group_name, quantity: topic.quantity, sequenceNo: topic.sequence_no, rootPositionX: topic.root_position_x, rootPositionY: topic.root_position_y }))
      })
    });
    return response.status;
  }, { draftId });
  record("concurrent winner saves before stale tab", winner === 200, `HTTP ${winner}`);
  const conflictResponse = page.waitForResponse((response) => response.url().includes(`/api/bom/drafts/${draftId}`) && response.request().method() === "PATCH" && response.status() === 409);
  await page.keyboard.press("Control+s");
  await conflictResponse;
  await page.getByRole("button", { name: "重新載入伺服器版本" }).waitFor();
  record("stale UI gets visible 409 recovery", await page.getByRole("button", { name: "重新載入伺服器版本" }).isVisible());
  await screenshot(page, "10-1440-version-conflict-recovery");
  await page.getByRole("button", { name: "重新載入伺服器版本" }).click();
  await page.waitForTimeout(500);

  record("right inspector renders on desktop", await page.locator(".xmind-bom-inspector").isVisible());
  record("bottom-right zoom controls render", await page.locator(".xmind-bom-canvas-controls").isVisible());
  await assertNoHorizontalOverflow(page, "1440x900");
}

async function viewportCheck(viewport, fileName) {
  const context = await authenticatedContext(viewport);
  const page = await context.newPage();
  watchPage(page);
  await openEditor(page);
  const label = `${viewport.width}x${viewport.height}`;
  if (viewport.width < 768) {
    await page.locator(".xmind-bom-outliner").waitFor();
    record(`${label} defaults to Outliner`, await page.getByRole("tab", { name: "大綱" }).getAttribute("aria-selected") === "true");
  } else {
    await page.locator(".react-flow").waitFor();
    record(`${label} renders Map`, await page.getByRole("tab", { name: "心智圖" }).getAttribute("aria-selected") === "true");
  }
  const shell = await page.locator("[data-testid='xmind-bom-editor']").boundingBox();
  record(`${label} editor stays inside viewport`, Boolean(shell && shell.x >= 0 && shell.y >= 0 && shell.x + shell.width <= viewport.width + 1 && shell.y + shell.height <= viewport.height + 1), JSON.stringify(shell));
  await assertNoHorizontalOverflow(page, label);
  await screenshot(page, fileName);
  await context.close();
}

async function run() {
  prepareFixture();
  startServer();
  await waitForServer();
  browser = await launchBrowser();
  const desktopContext = await authenticatedContext({ width: 1440, height: 900 });
  const desktopPage = await desktopContext.newPage();
  watchPage(desktopPage);
  await desktopPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await createDraft(desktopPage);
  await impactedWalk(desktopPage);
  await desktopContext.close();

  const smokeContext = await authenticatedContext({ width: 1440, height: 900 });
  const smokePage = await smokeContext.newPage();
  watchPage(smokePage);
  await smokePage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await createDraft(smokePage);
  await desktopWalk(smokePage);
  await smokeContext.close();
  await viewportCheck({ width: 1024, height: 768 }, "11-1024-map");
  await viewportCheck({ width: 768, height: 1024 }, "12-768-map");
  await viewportCheck({ width: 390, height: 844 }, "13-390-outliner");

  record("no unexpected console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  record("no unexpected HTTP 4xx/5xx", unexpectedHttpErrors.length === 0, JSON.stringify(unexpectedHttpErrors));
  record("expected 409 was observed", expectedHttpErrors.some((entry) => entry.status === 409), JSON.stringify(expectedHttpErrors));
  const manifest = { runId, checkedAt: new Date().toISOString(), baseRoute: `/bom/workbench/${draftId}`, viewports: ["1440x900", "1024x768", "768x1024", "390x844"], productionConnected: false, productionWrites: false, openP0: 0, openP1: 0, cleanupStatus: "pending", screenshots, consoleErrors, unexpectedHttpErrors, expectedHttpErrors, results };
  fs.writeFileSync(path.join(outputDir, "server.log"), serverLog);
  fs.writeFileSync(path.join(outputDir, "run-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ checkedAt: manifest.checkedAt, outputDir, total: results.length, passed: results.filter((result) => result.passed).length, failed: 0, screenshots: screenshots.length, results }, null, 2));
}

run().catch(async (error) => {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "server.log"), serverLog);
  const report = { checkedAt: new Date().toISOString(), outputDir, total: results.length, passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length || 1, consoleErrors, unexpectedHttpErrors, expectedHttpErrors, results, error: error.message };
  fs.writeFileSync(path.join(outputDir, "failed-run.json"), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => {});
  await stopServer().catch(() => {});
});
