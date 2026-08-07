import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { restoreTrackedConfigSnapshots, stopNextProcess } from "./qc-next-tracked-config-guard.mjs";

const root = process.cwd();
const runId = crypto.randomUUID();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev048-phase1d-ui-"));
const distDirRelative = `.tmp/next-qc-dev048-phase1d-ui-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const outputDir = path.join(root, "output", "playwright", "dev048-phase1d-qc");
const password = "DEV048-Phase1D-UI-QC";
const results = [];
const browserErrors = [];
const snapshots = new Map(
  ["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);
let app;
let browser;

const users = [
  { id: "phase1d-ui-admin", displayName: "Phase1D UI Admin", email: "phase1d.ui.admin@example.invalid", password, role: "Admin", companyCodes: ["JENFU"] },
  { id: "phase1d-ui-manufacturing", displayName: "Phase1D UI Manufacturing", email: "phase1d.ui.manufacturing@example.invalid", password, role: "Manufacturing", companyCodes: ["JENFU"] }
];

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("PORT_UNAVAILABLE")));
    });
  });
}

function startApp(port) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
      PDM_PRODUCTION_SLICE_MODE: "",
      PDM_AUTH_MODE: "managed",
      PDM_BOOTSTRAP_USERS: JSON.stringify(users),
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_DB_PROVIDER: "sqlite",
      PDM_PUBLICATION_EVIDENCE_MODE: "local_fake",
      PDM_NUMBER_STATE_FLOW_V1: "true",
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  return { child, output: () => output };
}

async function waitForApp(baseUrl) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {}
    await delay(400);
  }
  throw new Error(`SERVER_START_TIMEOUT\n${app?.output() ?? ""}`);
}

async function login(context, baseUrl, email) {
  const response = await context.request.post(`${baseUrl}/api/auth/login`, { data: { email, password } });
  if (!response.ok()) throw new Error(`LOGIN_FAILED:${email}:${response.status()}`);
}

function seedTransferPackages() {
  const db = new Database(path.join(tempDir, "ai-pdm.sqlite"));
  const now = new Date().toISOString();
  const rows = [
    ["ui-prepared", "TP-2026-UI-PREPARED-LONG-CODE-0001", "準備中的超長技術移轉案件名稱，用於確認手機版文字能自然換行", "Draft", null, null],
    ["ui-review", "TP-2026-UI-REVIEW-0002", "整包審核中的技轉案件", "InReview", "ui-review-request", null],
    ["ui-approved", "TP-2026-UI-APPROVED-0003", "已核准仍待正式發布的案件", "ApprovedPendingPublish", "ui-approved-request", null],
    ["ui-published", "TP-2026-UI-PUBLISHED-0004", "已發布製造交接案件", "Published", "ui-published-request", now]
  ];
  const insert = db.prepare(`INSERT INTO transfer_packages (
    id, company_id, package_code, title, case_type, case_reason,
    source_reference_status, source_reference_reason, package_status,
    owner_id, created_by, create_idempotency_key, row_version,
    review_request_id, review_snapshot_hash, review_snapshot_version,
    submitted_by, submitted_at, approved_by, approved_at,
    published_by, published_at, created_at, updated_at
  ) VALUES (
    ?, 'company-jenfu', ?, ?, 'design_change_case', 'Phase1D browser fixture',
    'not_available', 'Phase1D browser fixture', ?,
    'phase1d-ui-admin', 'phase1d-ui-admin', ?, 1,
    ?, NULL, 0,
    ?, ?, ?, ?,
    ?, ?, ?, ?
  )`);
  for (const [id, code, title, status, requestId, publishedAt] of rows) {
    const submitted = status === "Draft" ? null : "phase1d-ui-admin";
    const approved = ["ApprovedPendingPublish", "Published"].includes(status) ? "phase1d-ui-admin" : null;
    const publisher = status === "Published" ? "phase1d-ui-admin" : null;
    insert.run(
      id, code, title, status, `ui-key-${id}`, requestId,
      submitted, submitted ? now : null,
      approved, approved ? now : null,
      publisher, publishedAt,
      now, now
    );
  }
  db.prepare(`INSERT INTO part_roots (
    id, company_id, root_code, core_name, item_kind, record_status,
    rule_version_id, created_by, created_at, updated_at
  ) VALUES (
    'ui-published-root', 'company-jenfu', 'UI-PUBLISHED-ROOT', 'Published browser fixture',
    'manufactured', 'Active', 'numbering-rule-v3-alpha-root',
    'phase1d-ui-admin', ?, ?
  )`).run(now, now);
  db.prepare(`INSERT INTO part_numbers (
    id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
    item_kind, is_universal, bom_usage_policy, custom_specification,
    record_status, universal_reason, rule_version_id, created_by, created_at, updated_at
  ) VALUES (
    'ui-published-part', 'company-jenfu', 'ui-published-root', 'UI-PUBLISHED-PART-001',
    1, '001', 'Published browser fixture part', 'manufactured', 0, 'not_required',
    NULL, 'Active', NULL, 'numbering-rule-v3-alpha-root',
    'phase1d-ui-admin', ?, ?
  )`).run(now, now);
  db.prepare(`INSERT INTO transfer_package_items (
    id, company_id, package_id, entity_type, entity_id, entity_code, display_label, added_by, created_at
  ) VALUES (
    'ui-published-package-item', 'company-jenfu', 'ui-published', 'part_number',
    'ui-published-part', 'UI-PUBLISHED-PART-001', 'Published browser fixture part', 'phase1d-ui-admin', ?
  )`).run(now);
  db.close();
}

function monitor(page) {
  page.on("pageerror", (error) => browserErrors.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ type: "console", message: message.text() });
  });
  page.on("response", (response) => {
    if (response.status() >= 500) browserErrors.push({ type: "network", status: response.status(), url: response.url() });
  });
}

async function metrics(page) {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll(".technical-transfer-page button, .technical-transfer-page a, .technical-transfer-page input, .technical-transfer-page select, .technical-transfer-page textarea")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      })
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1 || element.scrollWidth > element.clientWidth + 3;
      })
      .map((element) => (element.textContent || element.getAttribute("aria-label") || element.tagName).trim().slice(0, 80));
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentScrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      controls,
      tabCount: document.querySelectorAll(".technical-transfer-tabs button").length,
      primaryCtaCount: document.querySelectorAll(".technical-transfer-header .primary-button").length,
      visibleAlerts: [...document.querySelectorAll('[role="alert"]')].filter((element) => (element.textContent || "").trim()).map((element) => (element.textContent || "").trim().slice(0, 120))
    };
  });
}

async function stopApp() {
  await stopNextProcess(app?.child);
}

async function removeTree(target) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch {
      await delay(350);
    }
  }
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  app = startApp(port);
  await waitForApp(baseUrl);
  browser = await chromium.launch({ headless: true });

  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await login(admin, baseUrl, users[0].email);
  seedTransferPackages();
  const page = await admin.newPage();
  monitor(page);

  await page.goto(`${baseUrl}/technical-transfer?tab=prepared`, { waitUntil: "networkidle" });
  await page.getByText("準備中的超長技術移轉案件名稱，用於確認手機版文字能自然換行", { exact: true }).waitFor();
  const preparedText = await page.locator(".technical-transfer-list").innerText();
  record("TRF-001/UI-013 prepared tab partitions facts and exposes one CTA", preparedText.includes("TP-2026-UI-PREPARED") && !preparedText.includes("TP-2026-UI-REVIEW") && await page.getByRole("link", { name: "建立技轉包" }).count() === 1);

  await page.getByRole("button", { name: "審核中" }).click();
  await page.getByText("整包審核中的技轉案件", { exact: true }).waitFor();
  const reviewText = await page.locator(".technical-transfer-list").innerText();
  record("TRF-008/UI-013 review tab includes InReview and ApprovedPendingPublish only", reviewText.includes("TP-2026-UI-REVIEW") && reviewText.includes("TP-2026-UI-APPROVED") && !reviewText.includes("TP-2026-UI-PUBLISHED"));

  await page.getByRole("button", { name: "已發布交接" }).click();
  await page.getByText("已發布製造交接案件", { exact: true }).waitFor();
  const publishedText = await page.locator(".technical-transfer-list").innerText();
  record("TRF-012/UI-016 published tab excludes candidate and pending packages", publishedText.includes("TP-2026-UI-PUBLISHED") && !publishedText.includes("TP-2026-UI-APPROVED") && !publishedText.includes("候選") && await page.getByRole("link", { name: "建立技轉包" }).count() === 0);

  const viewportResults = [];
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width <= 390 ? 760 : 900 });
    await page.goto(`${baseUrl}/technical-transfer?tab=prepared`, { waitUntil: "networkidle" });
    await page.getByText("準備中的超長技術移轉案件名稱，用於確認手機版文字能自然換行", { exact: true }).waitFor();
    const result = await metrics(page);
    viewportResults.push(result);
    await page.screenshot({ path: path.join(outputDir, `technical-transfer-${width}.png`), fullPage: true });
  }
  record("UI-019/UI-024..030 five viewports have no page/control overflow", viewportResults.every((item) => !item.horizontalOverflow && item.controls.length === 0 && item.tabCount === 3 && item.primaryCtaCount === 1 && item.visibleAlerts.length === 0), { viewportResults });

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`${baseUrl}/handoff?query=legacy-code&returnTo=%2Fnumbering%2Fsearch`, { waitUntil: "networkidle" });
  const redirected = new URL(page.url());
  record("CON-006/UI-015 handoff bookmark preserves query and return context", redirected.pathname === "/technical-transfer" && redirected.searchParams.get("tab") === "published" && redirected.searchParams.get("query") === "legacy-code" && redirected.searchParams.get("returnTo") === "/numbering/search" && redirected.searchParams.get("legacyFrom") === "/handoff", { url: page.url() });

  await page.goto(`${baseUrl}/upload`, { waitUntil: "networkidle" });
  record("CON-006 contextless upload is guidance with no generic mutation form", await page.getByText("請改從物件或案件開始", { exact: true }).count() === 1 && await page.locator("form").count() === 0);

  const manufacturing = await browser.newContext({ viewport: { width: 390, height: 760 } });
  await login(manufacturing, baseUrl, users[1].email);
  const denied = await manufacturing.request.get(`${baseUrl}/api/technical-transfer?tab=prepared`, { headers: { "x-pdm-company-code": "JENFU" } });
  const allowed = await manufacturing.request.get(`${baseUrl}/api/technical-transfer?tab=published`, { headers: { "x-pdm-company-code": "JENFU" } });
  const manufacturingPage = await manufacturing.newPage();
  monitor(manufacturingPage);
  await manufacturingPage.goto(`${baseUrl}/technical-transfer`, { waitUntil: "networkidle" });
  await manufacturingPage.getByText("已發布製造交接案件", { exact: true }).waitFor();
  record("SEC-009/TRF-012 manufacturing is denied prepared API and auto-falls back to Published", denied.status() === 403 && allowed.ok() && new URL(manufacturingPage.url()).searchParams.get("tab") === "published" && await manufacturingPage.getByRole("link", { name: "建立技轉包" }).count() === 0, { denied: denied.status(), allowed: allowed.status(), url: manufacturingPage.url() });
  await manufacturingPage.screenshot({ path: path.join(outputDir, "technical-transfer-manufacturing-390.png"), fullPage: true });
  await manufacturing.close();

  record("UI-021 visible-error, console and HTTP 5xx sweep", browserErrors.length === 0, { browserErrors });
  await admin.close();
} catch (error) {
  record("UI-RUNTIME", false, { error: String(error), stack: error instanceof Error ? error.stack : "", serverOutput: app?.output() ?? "" });
} finally {
  await browser?.close().catch(() => {});
  await stopApp();
  restoreTrackedConfigSnapshots(root, snapshots);
  await removeTree(tempDir);
  await removeTree(distDir);
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, outputDir, results }, null, 2));
if (failed.length) process.exitCode = 1;
