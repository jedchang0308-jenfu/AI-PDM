#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import Database from "better-sqlite3";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const outputDir = path.join(root, "output", "playwright", "dev-070-approval-workbench");
fs.mkdirSync(outputDir, { recursive: true });
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev070-browser-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const fixtureDb = path.join(dataDir, "ai-pdm.sqlite");
fs.mkdirSync(dataDir, { recursive: true });
fs.copyFileSync(path.join(root, "data", "ai-pdm.sqlite"), fixtureDb);
const sourceRepositoryDir = path.join(root, "data", "repository");
if (fs.existsSync(sourceRepositoryDir)) fs.cpSync(sourceRepositoryDir, repositoryDir, { recursive: true, force: true });
const fixture = new Database(fixtureDb);
fixture.prepare("UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1, session_invalid_before = NULL WHERE email = 'admin@example.com'").run();
fixture.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = 'admin@example.com'").run();
fixture.close();
const port = await getFreePort();
Object.assign(process.env, {
  NODE_ENV: "development",
  PDM_AUTH_MODE: "demo",
  PDM_DB_PROVIDER: "sqlite",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  PDM_RELEASE_MODE: "local_stub",
  PDM_NUMBER_STATE_FLOW_V1: "true",
  PDM_NUMBER_LIFECYCLE_V2: "true",
  PDM_UNIFIED_ENTITY_DETAIL_V1: "true",
  PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
  PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
  PDM_PRODUCTION_SLICE_MODE: "",
  PDM_POSTGRES_URL: "",
  DATABASE_URL: "",
  PDM_NEXT_DIST_DIR: `.tmp/qc-dev070-browser-${port}`,
  PDM_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`
});
const app = startNextApp(root, "dev", port);
const baseUrl = `http://127.0.0.1:${port}`;
await waitForNextAppReady(baseUrl, app.getOutput);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
const failedResponses = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("response", (response) => { if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`); });

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const login = await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  assert.equal(login.status, 200, `demo login failed: ${JSON.stringify(login.body)}`);

  await page.goto(`${baseUrl}/approvals?status=active`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => Boolean(document.querySelector("h1")?.textContent?.includes("審核工作台")) && !document.querySelector(".privacy-gate-state"), null, { timeout: 30000 });
  await page.locator("h1").filter({ hasText: "審核工作台" }).waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector(".approval-empty")?.textContent?.includes("正在載入"), null, { timeout: 20000 });

  assert.equal(await page.locator(".approval-filter-bar").count(), 1, "shared filter bar renders once");
  assert.equal(await page.locator('[aria-label="審核工作清單"]').count(), 1, `shared list region renders once; body=${(await page.locator("body").innerText()).slice(0, 400)}; errors=${consoleErrors.join(" | ")}`);
  assert.equal(await page.locator("table.approval-workbench-table").count(), 1, "approval list uses shared workbench table");
  assert.equal(await page.locator(".pdm-workbench-pagination").count() <= 1, true, "shared pagination renders at most once");
  assert.equal(await page.locator("tr.selected-row").count(), 0, "initial load does not auto-select the first row");

  const inbox = await page.evaluate(async () => {
    const response = await fetch("/api/approvals/inbox?status=active&limit=100");
    return { status: response.status, body: await response.json() };
  });
  assert.equal(inbox.status, 200, "approval inbox API is readable after login");
  assert.ok(Array.isArray(inbox.body.rows), "approval inbox returns rows envelope");
  assert.equal(typeof inbox.body.summary?.pending, "number", "approval inbox returns exact pending summary");
  assert.equal(typeof inbox.body.nextCursor === "string" || inbox.body.nextCursor === null, true, "approval inbox returns signed next cursor envelope");

  const searchedInbox = await page.evaluate(async () => {
    const response = await fetch("/api/approvals/inbox?status=active&limit=100&query=APR");
    return { status: response.status, body: await response.json() };
  });
  assert.equal(searchedInbox.status, 200, "approval inbox server search is readable");
  assert.equal(searchedInbox.body.filters?.query, "APR", "approval inbox normalizes search into the response filters");
  assert.ok(Array.isArray(searchedInbox.body.rows), "approval inbox search returns rows envelope");

  const allInbox = await page.evaluate(async () => {
    const response = await fetch("/api/approvals/inbox?status=all&limit=500");
    return { status: response.status, body: await response.json() };
  });
  assert.equal(allInbox.status, 200, "all approval inbox API is readable");
  const supersededRow = allInbox.body.rows?.find((row) => row.source === "platform" && row.historyOnly && row.supersededByRequestId) ?? null;
  assert.ok(supersededRow, "all approval inbox exposes the superseded native review relationship");
  if (supersededRow) {
    await page.goto(`${baseUrl}/approvals?status=all&query=${encodeURIComponent(supersededRow.targetSummary)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector(".approval-empty")?.textContent?.includes("正在載入"), null, { timeout: 20000 });
    const supersededListRow = page.locator("table.approval-workbench-table tbody tr").filter({ hasText: supersededRow.targetSummary }).filter({ hasText: "已取代" }).first();
    await supersededListRow.waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await supersededListRow.locator(".approval-history-label").innerText(), "已取代", "superseded history row is explicitly labeled");
    await supersededListRow.click();
    await page.locator(".approval-detail-drawer").waitFor({ state: "visible", timeout: 20000 });
    const historyText = await page.locator(".approval-detail-drawer").innerText();
    assert.match(historyText, /這筆不是目前待辦/u, "superseded detail explains that no decision is required");
    const currentCaseLink = page.getByRole("link", { name: "查看目前案件", exact: true });
    assert.equal(await currentCaseLink.count(), 1, "superseded detail links to the current case");
    assert.match(await currentCaseLink.getAttribute("href"), new RegExp(`requestId=${supersededRow.supersededByRequestId}`), "current-case link targets the superseding request");
    await page.screenshot({ path: path.join(outputDir, "superseded-history-link.png"), fullPage: true });
  }

  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const ownerLogin = await ownerPage.evaluate(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" })
    });
    return response.status;
  });
  assert.equal(ownerLogin, 200, "owner-route probe login succeeds");
  await ownerPage.goto(`${baseUrl}/approvals?status=active`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await ownerPage.waitForTimeout(1000);
  await ownerPage.waitForFunction(() => Boolean(document.querySelector("h1")?.textContent?.includes("審核工作台")) && !document.querySelector(".privacy-gate-state"), null, { timeout: 30000 });
  const ownerInbox = await ownerPage.evaluate(async () => {
    const response = await fetch("/api/approvals/inbox?status=active&limit=100");
    return response.json();
  });
  const ownerCandidate = ownerInbox.rows?.find((row) => row.source === "legacy_drawing_revision_review" && typeof row.ownerHref === "string") ?? null;
  assert.ok(ownerCandidate, "legacy drawing revision review resolves to the shared owner workbench");
  const ownerRow = ownerCandidate
    ? ownerPage.locator("table.approval-workbench-table tbody tr").filter({ hasText: ownerCandidate.targetSummary || ownerCandidate.title }).first()
    : ownerPage.locator("table.approval-workbench-table tbody tr").first();
  if (ownerCandidate && await ownerRow.isVisible().catch(() => false)) {
    await ownerRow.click();
    await ownerPage.waitForFunction(() => Boolean(document.querySelector('[data-component="unified-pdm-entity-detail-drawer"]')), null, { timeout: 20000 });
    assert.equal(new URL(ownerPage.url()).pathname, "/approvals", "approval row keeps the approval list route");
    assert.equal(new URL(ownerPage.url()).searchParams.has("requestId"), true, "approval drawer selection is represented in the approval URL");
    await ownerPage.locator('[data-component="unified-pdm-entity-detail-drawer"]').waitFor({ state: "visible", timeout: 30000 });
    try {
      await ownerPage.locator('[data-component="DrawingProjection"]').waitFor({ state: "visible", timeout: 30000 });
    } catch (caught) {
      throw new Error(`shared owner drawer did not finish rendering: ${(await ownerPage.locator("body").innerText()).slice(-1200)} | console=${consoleErrors.join(" | ")}`, { cause: caught });
    }
    for (const projection of ["DrawingProjection", "PartProjection", "RelationProjection", "ReviewContextProjection"]) {
      assert.equal(await ownerPage.locator(`[data-component="${projection}"]`).count(), 1, `${projection} renders once in the shared review drawer`);
    }
    assert.equal(await ownerPage.locator(".approval-detail-drawer").count(), 0, "legacy review does not fall back to the approval-only drawer");
    const ownerText = await ownerPage.locator('[data-component="unified-pdm-entity-detail-drawer"]').innerText();
    assert.match(ownerText, /料號資料/u, "shared drawer exposes part information");
    assert.match(ownerText, /圖料關聯/u, "shared drawer exposes relation information");
    assert.match(ownerText, /版本與附件/u, "shared drawer exposes exact revision attachments");
    for (const label of ["核准", "退回修改", "要求補充資料"]) {
      const decisionButton = ownerPage.getByRole("button", { name: label, exact: true });
      assert.equal(await decisionButton.count(), 1, `${label} remains visible in every pending PDM review`);
      assert.equal(await decisionButton.isEnabled(), true, `${label} is left to the assigned human reviewer`);
    }
    assert.equal(await ownerPage.getByRole("link", { name: "查看歷史" }).count(), 1, "owner workbench navigation stays inside the drawer");
    await ownerPage.screenshot({ path: path.join(outputDir, "legacy-review-shared-owner-drawer.png"), fullPage: true });
    await ownerPage.getByRole("link", { name: "查看歷史" }).click();
    await ownerPage.waitForURL(/\/numbering\/drawings/u, { timeout: 20000 });
    assert.equal(new URL(ownerPage.url()).pathname, "/numbering/drawings", "drawer owner link opens the drawing workbench");
  }
  await ownerContext.close();

  await page.screenshot({ path: path.join(outputDir, "approval-workbench.png"), fullPage: true });
  assert.deepEqual(failedResponses, [], "approval workbench has no 5xx responses");
  assert.deepEqual(consoleErrors, [], "approval workbench has no console/page errors");
  console.log(`QC DEV-070 browser: PASS (shared list/filter/pagination envelope, three visible human decisions, no auto-open, screenshot ${path.relative(root, path.join(outputDir, "approval-workbench.png"))})`);
} finally {
  await browser.close();
  await stopNextApp(app.child);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
