#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { chromium } from "playwright";

import { hashPassword } from "../src/lib/password.ts";
import { dev116EvidenceDir, dev116RunId, runCase, writeProducerManifest } from "./dev-116-evidence-utils.mjs";
import {
  getFreePort,
  removeTaskOwnedWorkspaceTempDir,
  startNextApp,
  stopNextApp,
  waitForNextAppReady
} from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = dev116RunId();
const cases = [];
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev116-browser-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const runtimeDist = `.tmp/qc-dev116-browser-${crypto.randomUUID()}`;
const screenshotDir = path.join(dev116EvidenceDir(runId), "screenshots");
const browserErrors = [];
const failedResponses = [];
const nextEnvPath = path.join(root, "next-env.d.ts");
const nextEnvBefore = fs.existsSync(nextEnvPath) ? fs.readFileSync(nextEnvPath) : null;
let port = null;
let app = null;
let browser = null;

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });
const fixture = new Database(databasePath);
fixture.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
const now = new Date().toISOString();
fixture.prepare(
  "INSERT INTO companies (id, company_code, company_kind, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
).run("company-smoke", "SMOKE", "production_smoke", "Production 驗證租戶", now, now);
const insertUser = fixture.prepare(
  "INSERT INTO users (id, display_name, email, password_hash, role, company_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
insertUser.run("actor-smoke", "Smoke Engineer", "smoke@example.invalid", hashPassword("dev116-smoke"), "Engineer", "company-smoke", now, now);
insertUser.run("actor-jenfu", "Jenfu Engineer", "jenfu@example.invalid", hashPassword("dev116-jenfu"), "Engineer", "company-jenfu", now, now);
const insertMembership = fixture.prepare("INSERT INTO user_company_memberships (user_id, company_id, is_default) VALUES (?, ?, 1)");
insertMembership.run("actor-smoke", "company-smoke");
insertMembership.run("actor-jenfu", "company-jenfu");
const insertIdentity = fixture.prepare(
  "INSERT INTO auth_identities (id,user_id,provider,provider_subject,login_identifier,email_normalized,verified_at,status,created_at,updated_at) VALUES (?,?, 'local_password',?,?,?,?, 'active',?,?)"
);
insertIdentity.run("identity-smoke", "actor-smoke", "smoke@example.invalid", "smoke@example.invalid", "smoke@example.invalid", now, now, now);
insertIdentity.run("identity-jenfu", "actor-jenfu", "jenfu@example.invalid", "jenfu@example.invalid", "jenfu@example.invalid", now, now, now);
fixture.prepare(
  "INSERT INTO platform_principal_mappings (platform_principal_id,pdm_user_id,mapping_status,created_at,updated_at) VALUES (?,?, 'active',?,?)"
).run("principal-smoke", "actor-smoke", now, now);
fixture.prepare(
  "INSERT INTO platform_organization_mappings (platform_organization_id,pdm_company_id,mapping_status,created_at,updated_at) VALUES (?,?, 'active',?,?)"
).run("organization-smoke", "company-smoke", now, now);
fixture.prepare(
  "UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1' WHERE id=1"
).run();
fixture.close();

async function portOpen(value) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: value });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

function monitor(page, label) {
  page.on("pageerror", (error) => browserErrors.push({ label, kind: "pageerror", message: error.message }));
  page.on("console", (event) => {
    if (event.type() !== "error") return;
    if (label === "response-loss" && /ERR_FAILED|Failed to fetch/iu.test(event.text())) return;
    browserErrors.push({ label, kind: "console", message: event.text() });
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failedResponses.push({ label, status: response.status(), url: response.url() });
  });
}

async function login(page, email, password) {
  await page.goto(`http://127.0.0.1:${port}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const result = await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { email, password });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

try {
  port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "managed",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_RELEASE_MODE: "local_stub",
    PDM_SMOKE_GCS_WRITER: "disabled",
    PDM_SMOKE_OUTBOX_CONSUMER: "disabled",
    PDM_SMOKE_EXTERNAL_NOTIFICATION: "disabled",
    PDM_NEXT_DIST_DIR: runtimeDist,
    PDM_PUBLIC_BASE_URL: baseUrl,
    DATABASE_URL: "",
    PDM_POSTGRES_URL: ""
  });
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-116 real Chromium tenant indication and navigation evidence",
    port,
    owningProcessTree: `runner ${process.pid} -> task-owned Next dev -> Chromium`,
    cleanupCondition: "browser closes, exact Next tree stops, port closes, fixture/dist removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: `${taskRoot}; ${path.join(root, runtimeDist)}`
  } }));
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput, 120_000);
  browser = await chromium.launch({ headless: true });

  await runCase(cases, "QA-116-013", "normal navigation shows smoke badge only to smoke actor", async () => {
    const smokeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const smokePage = await smokeContext.newPage();
    monitor(smokePage, "smoke");
    await login(smokePage, "smoke@example.invalid", "dev116-smoke");
    await smokePage.goto(`${baseUrl}/numbering/drawings`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const indicator = smokePage.getByTestId("production-smoke-tenant-indicator");
    await indicator.waitFor({ state: "visible", timeout: 30_000 });
    assert.equal(await indicator.textContent(), "驗證租戶");
    assert.equal(await indicator.evaluate((element) => ["A", "BUTTON", "SELECT"].includes(element.tagName)), false);
    assert.equal(await smokePage.getByRole("option", { name: /鉦富|久方|JENFU|MAXIMA/u }).count(), 0);
    const smokeScreenshot = path.join(screenshotDir, "qa-116-013-smoke-1440.png");
    await smokePage.screenshot({ path: smokeScreenshot, fullPage: true });
    await smokeContext.close();

    const jenfuContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const jenfuPage = await jenfuContext.newPage();
    monitor(jenfuPage, "jenfu");
    await login(jenfuPage, "jenfu@example.invalid", "dev116-jenfu");
    await jenfuPage.goto(`${baseUrl}/numbering/drawings`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await jenfuPage.getByRole("heading", { name: "圖號工作台" }).waitFor({ state: "visible", timeout: 30_000 });
    assert.equal(await jenfuPage.getByTestId("production-smoke-tenant-indicator").count(), 0);
    assert.doesNotMatch(await jenfuPage.locator("body").innerText(), /company-smoke|Production 驗證租戶/u);
    await jenfuContext.close();
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(failedResponses, []);
    return { smokeBadge: true, interactive: false, businessActorLeak: false, screenshot: smokeScreenshot };
  });

  let committedIdentity = null;
  await runCase(cases, "QA-116-023", "normal UI create commit reload search and detail read back one identity", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    monitor(page, "normal-create");
    await login(page, "smoke@example.invalid", "dev116-smoke");
    await page.goto(`${baseUrl}/numbering/create?from=drawing`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByLabel("主要名詞").fill("DEV116 瀏覽器驗證件");
    await page.getByLabel("確定品名").fill("DEV116 瀏覽器驗證件");
    await page.getByRole("button", { name: "建立編號", exact: true }).click();
    await page.getByRole("heading", { name: "編號已建立" }).waitFor({ state: "visible", timeout: 30_000 });
    const resultText = await page.locator(".canonical-create-result p").innerText();
    const codes = resultText.split("·").map((value) => value.trim()).filter(Boolean);
    assert.equal(codes.length, 3);
    await page.getByRole("link", { name: "查看建立結果" }).click();
    await page.waitForURL((url) => url.pathname === "/numbering/drawings", { timeout: 30_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(codes[2], { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
    await page.goto(`${baseUrl}/numbering/search?query=${encodeURIComponent(codes[0])}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByText(codes[0], { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
    const readDb = new Database(databasePath, { readonly: true, fileMustExist: true });
    const identity = readDb.prepare(
      `SELECT r.id root_id,p.id part_id,d.id drawing_id,r.company_id,r.root_code,p.part_number,d.drawing_number
       FROM part_roots r JOIN part_numbers p ON p.part_root_id=r.id JOIN drawing_numbers d ON d.part_root_id=r.id
       WHERE r.core_name=?`
    ).get("DEV116 瀏覽器驗證件");
    readDb.close();
    assert.ok(identity);
    assert.equal(identity.company_id, "company-smoke");
    committedIdentity = identity;
    await context.close();
    return { objectIds: [identity.root_id, identity.part_id, identity.drawing_id], codes, companyId: identity.company_id, reload: true, search: true };
  });

  await runCase(cases, "QA-116-024", "desktop and narrow layouts keep tenant identity visible without overflow", async () => {
    assert.ok(committedIdentity);
    const receipts = [];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      monitor(page, `viewport-${viewport.width}`);
      await login(page, "smoke@example.invalid", "dev116-smoke");
      await page.goto(`${baseUrl}/numbering/drawings?query=${encodeURIComponent(committedIdentity.drawing_number)}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.getByTestId("production-smoke-tenant-indicator").waitFor({ state: "visible", timeout: 30_000 });
      await page.getByText(committedIdentity.drawing_number, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
      const geometry = await page.evaluate(() => ({ viewportWidth: window.innerWidth, pageWidth: document.documentElement.scrollWidth, focusedTag: document.activeElement?.tagName ?? null }));
      assert.ok(geometry.pageWidth <= geometry.viewportWidth + 1, JSON.stringify(geometry));
      const screenshot = path.join(screenshotDir, `qa-116-024-${viewport.width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      receipts.push({ viewport, geometry, screenshot });
      await context.close();
    }
    return receipts;
  });

  await runCase(cases, "QA-116-025", "lost commit response retries with same key and converges exactly once", async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    monitor(page, "response-loss");
    await login(page, "smoke@example.invalid", "dev116-smoke");
    await page.goto(`${baseUrl}/numbering/create?from=drawing`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByLabel("主要名詞").fill("DEV116 回應遺失驗證件");
    await page.getByLabel("確定品名").fill("DEV116 回應遺失驗證件");
    let intercepted = false;
    const handler = async (route) => {
      if (!intercepted && route.request().method() === "POST") {
        intercepted = true;
        const response = await route.fetch();
        await response.body();
        await route.abort("failed");
        return;
      }
      await route.continue();
    };
    await page.route("**/api/numbering/records", handler);
    await page.getByRole("button", { name: "建立編號", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "建立結果尚未確認" }).waitFor({ state: "visible", timeout: 30_000 });
    await page.unroute("**/api/numbering/records", handler);
    await page.getByRole("button", { name: "建立編號", exact: true }).click();
    await page.getByRole("heading", { name: "編號已建立" }).waitFor({ state: "visible", timeout: 30_000 });
    const readDb = new Database(databasePath, { readonly: true, fileMustExist: true });
    const roots = readDb.prepare("SELECT id,root_code FROM part_roots WHERE core_name=?").all("DEV116 回應遺失驗證件");
    assert.equal(roots.length, 1);
    const rootId = roots[0].id;
    const counts = {
      roots: roots.length,
      parts: readDb.prepare("SELECT COUNT(*) count FROM part_numbers WHERE part_root_id=?").get(rootId).count,
      drawings: readDb.prepare("SELECT COUNT(*) count FROM drawing_numbers WHERE part_root_id=?").get(rootId).count,
      audits: readDb.prepare("SELECT COUNT(*) count FROM audit_logs WHERE company_id='company-smoke' AND scope_kind='tenant' AND action='numbering.create' AND json_extract(detail_json,'$.rootCode')=?").get(roots[0].root_code).count,
      receipts: readDb.prepare("SELECT COUNT(*) count FROM platform_command_receipts WHERE company_id='company-smoke' AND response_json LIKE ?").get(`%${rootId}%`).count
    };
    readDb.close();
    assert.deepEqual(counts, { roots: 1, parts: 1, drawings: 1, audits: 1, receipts: 1 });
    const screenshot = path.join(screenshotDir, "qa-116-025-retry.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    await context.close();
    return { intercepted, counts, sameKeyRetained: true, screenshot };
  });
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app) await stopNextApp(app.child).catch(() => {});
  removeTaskOwnedWorkspaceTempDir(root, runtimeDist);
  if (nextEnvBefore === null) fs.rmSync(nextEnvPath, { force: true });
  else fs.writeFileSync(nextEnvPath, nextEnvBefore);
  const portReleased = port === null ? true : !(await portOpen(port));
  const resolvedTaskRoot = path.resolve(taskRoot);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (resolvedTaskRoot.startsWith(`${resolvedTemp}${path.sep}`)) fs.rmSync(resolvedTaskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  const { manifest, target } = writeProducerManifest({
    runId,
    producer: "browser-b",
    cases,
    detail: {
      browserErrors,
      failedResponses,
      portReleased,
      runtimeDistRemoved: !fs.existsSync(path.join(root, runtimeDist)),
      nextEnvRestored: nextEnvBefore === null ? !fs.existsSync(nextEnvPath) : fs.readFileSync(nextEnvPath).equals(nextEnvBefore),
      taskRootRemoved: !fs.existsSync(resolvedTaskRoot)
    }
  });
  console.log(JSON.stringify({ evidence: target, status: manifest.status, cases: cases.length, portReleased }));
  if (manifest.status !== "PASS" || browserErrors.length > 0 || failedResponses.length > 0 || !portReleased) process.exitCode = 1;
}
