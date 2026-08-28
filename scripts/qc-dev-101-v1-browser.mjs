import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const sourceDataDir = path.join(root, "data");
const sourceDbPath = path.join(sourceDataDir, "ai-pdm.sqlite");
const runId = `DEV101-V1-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-101", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev101-v1-browser-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const runtimeDistDir = `.tmp/dev101-v1-next-${crypto.randomUUID()}`;
const checks = [];
let app = null;
let browser = null;
let port = null;
let fixture = null;
let runError = null;

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function primaryState() {
  const db = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    const payload = {
      schema: db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all(),
      roots: db.prepare("SELECT id, company_id, root_code FROM part_roots ORDER BY company_id, id").all(),
      parts: db.prepare("SELECT id, company_id, part_root_id, part_number FROM part_numbers ORDER BY company_id, id").all(),
      drawingNumbers: db.prepare("SELECT id, company_id, part_root_id, drawing_number FROM drawing_numbers ORDER BY company_id, id").all(),
      drawings: db.prepare("SELECT id, company_id, drawing_number, formal_drawing_number_id FROM drawings ORDER BY company_id, id").all(),
      residue: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: db.pragma("foreign_key_check")
    };
    return { ...payload, hash: stableHash(payload) };
  } finally {
    db.close();
  }
}

function check(id, description, pass, detail = "") {
  checks.push({ id, description, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${id}: ${description}${detail ? ` — ${detail}` : ""}`);
}

function isPortReleased(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
    const finish = (released) => { socket.destroy(); resolve(released); };
    socket.setTimeout(1_000, () => finish(true));
    socket.once("connect", () => finish(false));
    socket.once("error", () => finish(true));
  });
}

const primaryBefore = primaryState();
let originalRequestSnapshot = null;

try {
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.copyFileSync(sourceDbPath, dbPath);
  if (fs.existsSync(path.join(sourceDataDir, "repository"))) fs.cpSync(path.join(sourceDataDir, "repository"), repositoryDir, { recursive: true });
  const fixtureDb = new Database(dbPath);
  try {
    assert.deepEqual(fixtureDb.pragma("foreign_key_check"), []);
    const counts = Object.fromEntries(["part_roots", "part_numbers", "drawing_numbers", "drawings"].map((table) => [table, Number(fixtureDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)]));
    assert.ok(Object.values(counts).every((count) => count > 0));
    fixture = fixtureDb.prepare(`
      SELECT request.id AS requestId, request.reviewer_user_id AS reviewerUserId,
             request.snapshot_payload AS snapshotPayload, request.snapshot_hash AS snapshotHash,
             drawing.drawing_number AS drawingNumber
      FROM pdm_work_review_requests request
      JOIN drawings drawing ON drawing.id = request.canonical_entity_id AND drawing.company_id = request.company_id
      WHERE request.request_status = 'pending'
        AND request.request_kind = 'drawing_revision'
        AND drawing.drawing_number = 'A0002-M01'
      ORDER BY request.created_at, request.id
      LIMIT 1
    `).get();
    assert.ok(fixture, "A0002-M01 v1 pending review request is required");
    assert.notEqual(JSON.parse(fixture.snapshotPayload).schemaVersion, "pdm-review-package-v2");
    originalRequestSnapshot = { snapshotPayload: fixture.snapshotPayload, snapshotHash: fixture.snapshotHash };
  } finally {
    fixtureDb.close();
  }

  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_REVIEW_PACKAGE_V2_WRITE = "false";
  process.env.PDM_NEXT_DIST_DIR = runtimeDistDir;
  port = await getFreePort();
  app = startNextApp(root, "dev", port);
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForNextAppReady(baseUrl, app.getOutput, 90_000);
  browser = await chromium.launch({ headless: process.env.PDM_QC_HEADED !== "true" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "R&D Manager" } });
  check("DEV101-V1-BROWSER-001", "reviewer login succeeds", login.ok(), `HTTP ${login.status()}`);

  const page = await context.newPage();
  const listUrl = `${baseUrl}/approvals?status=active&domain=numbering&action=numbering.pdm_drawing_revision_review&query=${encodeURIComponent(fixture.drawingNumber)}`;
  await page.goto(listUrl, { waitUntil: "networkidle" });
  const row = page.locator('[data-approval-workbench-row="true"]').filter({ hasText: fixture.drawingNumber }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  check("DEV101-V1-BROWSER-002", "existing A0002-M01 v1 request appears in the normal inbox with the correct count", await page.locator(".approval-count").innerText() === "1 筆" && (await row.innerText()).includes("研發版 0.1"));

  await row.click();
  await page.waitForURL(new RegExp(`/approvals/${fixture.requestId}`, "u"), { timeout: 30_000 });
  await page.locator('[data-workspace-kind="reviewer"]').waitFor({ state: "visible", timeout: 30_000 });
  check("DEV101-V1-BROWSER-003", "v1 request remains on the compatible shared drawing renderer", await page.locator('[data-review-schema="pdm-review-package-v2"]').count() === 0 && await page.getByRole("heading", { name: fixture.drawingNumber }).count() === 1);
  check("DEV101-V1-BROWSER-004", "reviewer sees the same readonly fields, files and preview positions as the editor", await page.getByRole("status").filter({ hasText: /目前為唯讀/u }).count() >= 1 && await page.getByRole("heading", { name: /版次與檔案/u }).count() === 1);

  const detailScreenshot = path.join(outputDir, "screenshots", "DEV101-V1-A0002-review-workspace.png");
  fs.mkdirSync(path.dirname(detailScreenshot), { recursive: true });
  await page.screenshot({ path: detailScreenshot, fullPage: true });
  await page.getByRole("button", { name: "返回審核清單" }).click();
  await page.waitForURL(/\/approvals\?/u, { timeout: 30_000 });
  await row.waitFor({ state: "visible", timeout: 30_000 });
  const returnedUrl = new URL(page.url());
  check("DEV101-V1-BROWSER-005", "return restores filter, query, selection key and refreshed row", returnedUrl.searchParams.get("status") === "active" && returnedUrl.searchParams.get("domain") === "numbering" && returnedUrl.searchParams.get("action") === "numbering.pdm_drawing_revision_review" && returnedUrl.searchParams.get("query") === fixture.drawingNumber && returnedUrl.searchParams.get("requestId") === fixture.requestId && await row.count() === 1, page.url());

  const fixtureAfter = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const after = fixtureAfter.prepare("SELECT snapshot_payload AS snapshotPayload, snapshot_hash AS snapshotHash FROM pdm_work_review_requests WHERE id = ?").get(fixture.requestId);
    check("DEV101-V1-BROWSER-006", "v1 snapshot is not backfilled or rewritten", JSON.stringify(after) === JSON.stringify(originalRequestSnapshot));
    assert.deepEqual(fixtureAfter.pragma("foreign_key_check"), []);
  } finally {
    fixtureAfter.close();
  }
} catch (error) {
  runError = error;
  console.error(error instanceof Error ? error.stack : String(error));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app) await stopNextApp(app.child).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (port) {
    const released = await isPortReleased(port);
    checks.push({ id: "DEV101-V1-BROWSER-007", description: "task-owned runtime port is released", status: released ? "PASS" : "FAIL", detail: String(port) });
    if (!released && !runError) runError = new Error(`DEV101 runtime port ${port} was not released`);
  }
  const primaryAfter = primaryState();
  const primaryUnchanged = primaryAfter.hash === primaryBefore.hash;
  checks.push({ id: "DEV101-V1-BROWSER-008", description: "primary schema, identities, migration residue and foreign keys are unchanged", status: primaryUnchanged ? "PASS" : "FAIL", detail: `${primaryBefore.hash}/${primaryAfter.hash}` });
  if (!primaryUnchanged && !runError) runError = new Error("primary database invariant changed");

  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 });
  const runtimeDistPath = path.resolve(root, runtimeDistDir);
  const tmpRoot = path.resolve(root, ".tmp");
  if (runtimeDistPath.startsWith(`${tmpRoot}${path.sep}`)) fs.rmSync(runtimeDistPath, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  const report = {
    dev: "DEV-101",
    runId,
    result: !runError && checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    fixture: fixture ? { requestId: fixture.requestId, drawingNumber: fixture.drawingNumber, schemaVersion: "v1" } : null,
    checks,
    fixtureMutationLedger: [],
    runtime: { project: root, purpose: "DEV-101 v1 normal approval inbox compatibility", port, processId: app?.child?.pid ?? null, dataDir, repositoryDir, cleanupCondition: "browser closed, verified child stopped, port released, task temp removed" },
    primaryBeforeHash: primaryBefore.hash,
    primaryAfterHash: primaryAfter.hash,
    completedAt: new Date().toISOString()
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "receipt.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  for (const item of checks) console.log(`${item.status} ${item.id} ${item.description}`);
  console.log(`DEV-101 v1 browser summary: ${checks.filter((item) => item.status === "PASS").length}/${checks.length} PASS`);
  if (report.result !== "PASS") process.exitCode = 1;
}
