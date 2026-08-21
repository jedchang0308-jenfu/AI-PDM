import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { buildA0005FixtureResult, buildFilenameAdapterResult } from "../src/lib/drawing-recognition-adapters.ts";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev068-browser-"));
const distDirRelative = `.tmp/next-qc-dev068-${crypto.randomUUID()}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const outputDir = path.join(root, "output", "qa", "dev-068-drawing-recognition", `browser-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-local-isolated`);
const snapshots = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const workerToken = `dev068-worker-${crypto.randomUUID()}`;
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
});
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let browser;

async function restoreGeneratedFiles() {
  for (const [file, content] of snapshots) {
    let lastError;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        fs.writeFileSync(path.join(root, file), content, "utf8");
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        await delay(attempt * 100);
      }
    }
    if (lastError) throw lastError;
  }
}

function checkpoint(name) {
  console.log(`[DEV-068 browser] ${name}`);
}

async function removeTemporaryTarget(target) {
  const resolved = path.resolve(target);
  const allowed = resolved.startsWith(path.resolve(os.tmpdir())) || resolved.startsWith(`${path.resolve(root, ".tmp")}${path.sep}`);
  if (!allowed || !fs.existsSync(resolved)) return;
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      lastError = error;
      await delay(attempt * 150);
    }
  }
  throw lastError;
}

async function waitForServer() {
  const deadline = Date.now() + 75_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(`${baseUrl}/login`); if (response.status < 500) return; } catch {}
    await delay(400);
  }
  throw new Error("DEV-068 browser server did not start");
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
    return;
  }
  child.kill("SIGINT");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(4_000).then(() => child.kill("SIGTERM"))]);
}

const sourceDb = path.resolve(
  process.env.PDM_DEV_068_SOURCE_SQLITE_PATH?.trim() || path.join(root, "data", "ai-pdm.sqlite")
);
const targetDb = path.join(tempDir, "ai-pdm.sqlite");
fs.copyFileSync(sourceDb, targetDb);
const fixtureDb = new Database(targetDb);
fixtureDb.prepare("UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1 WHERE email = 'admin@example.com'").run();
fixtureDb.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = 'admin@example.com'").run();
fixtureDb.close();

try {
  child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "demo",
      PDM_AUTH_SECRET: "dev068-browser-auth-secret",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_RELEASE_MODE: "local_stub",
      PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
      PDM_NUMBER_STATE_FLOW_V1: "true",
      PDM_NUMBER_LIFECYCLE_V2: "true",
      PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
      PDM_DRAWING_RECOGNITION_V1: "true",
      PDM_DRAWING_RECOGNITION_WORKER_TOKEN: workerToken,
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: "ignore",
    windowsHide: true
  });
  await waitForServer();
  checkpoint("server ready");
  assert.equal((await fetch(`${baseUrl}/api/recognition-jobs/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workerId: "unauthorized" }) })).status, 401);
  checkpoint("worker auth guard passed");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const login = await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  checkpoint("login passed");

  const create = await page.evaluate(async () => {
    const response = await fetch("/api/numbering/recognition-sessions", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `dev068-browser-create-${crypto.randomUUID()}` },
      body: JSON.stringify({ sourceContextType: "drawing_revision", sourceContextId: "drawing-revision-package-DRP-2478790e-6f97-41b3-a735-d0cee48814ed" })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  checkpoint("session created");
  const sessionId = create.body.session.id;
  await delay(2_100);
  const claimResponse = await fetch(`${baseUrl}/api/recognition-jobs/claim`, { method: "POST", headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" }, body: JSON.stringify({ workerId: "qc-dev068-browser", maxAttempts: 2 }) });
  assert.equal(claimResponse.status, 200);
  checkpoint("worker claim passed");
  const job = await claimResponse.json();
  const results = job.sources.flatMap((source) => {
    const fixture = buildA0005FixtureResult(job, source);
    return [buildFilenameAdapterResult(source), ...(fixture ? [fixture] : [])];
  });
  const completeResponse = await fetch(`${baseUrl}/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/complete`, {
    method: "POST", headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" },
    body: JSON.stringify({ workerId: "qc-dev068-browser", sourceSetFingerprint: job.sourceSetFingerprint, results })
  });
  assert.equal(completeResponse.status, 200, JSON.stringify(await completeResponse.json().catch(() => ({}))));
  checkpoint("worker completion passed");

  const projectionApi = await page.evaluate(async (id) => {
    const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(id)}`, { cache: "no-store" });
    return { status: response.status, cacheControl: response.headers.get("cache-control"), body: await response.json().catch(() => ({})) };
  }, sessionId);
  assert.equal(projectionApi.status, 200);
  assert.match(projectionApi.cacheControl ?? "", /private.*no-store/u);
  assert.equal(projectionApi.body.session.candidates.length, 21);
  checkpoint("projection API passed");

  await page.goto(`${baseUrl}/numbering/recognition/${encodeURIComponent(sessionId)}`, { waitUntil: "domcontentloaded" });
  await page.locator(".drawing-recognition-section").first().waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(await page.locator(".drawing-recognition-section").count(), 6);
  const bodyText = await page.locator("body").innerText();
  for (const expected of ["識別與關聯", "料號基準與各料號變體", "圖面與版次資料", "特殊要求與受控註記", "幾何與工程辨識證據", "尚未歸類 OCR", "SUS304", "SUS301", "A0005-P03", "黑"]) assert.match(bodyText, new RegExp(expected, "u"));
  assert.equal(await page.locator(".drawing-recognition-jump").count(), 0);
  assert.doesNotMatch(bodyText, /來源檔名/u);
  checkpoint("six-section page passed");
  const evidenceTrigger = page.locator(".drawing-recognition-candidate .link-button", { hasText: "查看來源證據" }).first();
  await evidenceTrigger.click();
  await page.locator(".drawing-recognition-evidence").waitFor({ state: "visible" });
  assert.match(await page.locator(".drawing-recognition-evidence").innerText(), /來源檔|原始內容/u);
  await page.locator(".drawing-recognition-evidence button[aria-label='關閉證據']").click();
  assert.equal(await evidenceTrigger.evaluate((element) => element === document.activeElement), true, "evidence close must restore trigger focus");
  checkpoint("evidence drawer passed");

  for (const category of ["identity_relation", "part_attribute", "drawing_revision", "controlled_note", "engineering_evidence"]) {
    const section = page.locator(`#recognition-${category}`);
    const button = section.getByRole("button", { name: "接受此區辨識值" });
    if (await button.count()) {
      await button.click();
      await button.waitFor({ state: "detached", timeout: 10_000 });
    }
  }
  checkpoint("section decisions saved");
  const confirmButton = page.getByRole("button", { name: "確認寫入內容" });
  assert.equal(await confirmButton.isEnabled(), true);
  await confirmButton.click();
  const modal = page.locator(".drawing-recognition-modal");
  await modal.waitFor({ state: "visible" });
  await page.keyboard.press("Shift+Tab");
  assert.equal(await modal.evaluate((element) => element.contains(document.activeElement)), true, "impact modal must trap keyboard focus");
  const modalText = await modal.innerText();
  assert.match(modalText, /正式寫入影響預覽/u);
  assert.match(modalText, /這一步仍未寫入/u);
  assert.match(modalText, /將新增／更新\s*4\s*筆/u);
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ path: path.join(outputDir, "impact-preview-1440x960.png"), fullPage: false });
  checkpoint("desktop impact preview passed");
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "detached" });
  assert.equal(await confirmButton.evaluate((element) => element === document.activeElement), true, "impact close must restore trigger focus");
  await confirmButton.click();
  await modal.waitFor({ state: "visible" });
  await modal.getByRole("button", { name: "返回核對" }).click();
  await modal.waitFor({ state: "detached" });

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, "mobile page must not overflow horizontally");
  await confirmButton.click();
  await modal.waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(outputDir, "impact-preview-390x844.png"), fullPage: false });
  checkpoint("mobile impact preview passed");
  await modal.getByRole("button", { name: "正式寫入 PDM" }).click();
  await modal.waitFor({ state: "detached", timeout: 15_000 });
  await page.getByText(/已正式寫入 4 筆 PDM 資料/u).waitFor({ state: "visible", timeout: 15_000 });
  assert.match(await page.locator("body").innerText(), /這批結果已正式寫入/u);
  checkpoint("formalization passed");

  const report = { dev: "DEV-068", sessionId, sourceCount: job.sources.length, candidateCount: 21, sections: 6, impactChangeCount: 4, desktopScreenshot: path.join(outputDir, "impact-preview-1440x960.png"), mobileScreenshot: path.join(outputDir, "impact-preview-390x844.png"), workerUnauthorizedStatus: 401, formalization: "PASS", checks: "PASS", completedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "report.md"), `# DEV-068 browser QC\n\n- Result: PASS\n- Session: ${sessionId}\n- Six sections: PASS\n- Desktop/mobile impact preview: PASS\n- HTTP worker auth/formalization: PASS\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await stopServer();
  await restoreGeneratedFiles();
  await delay(500);
  for (const target of [distDir, tempDir]) await removeTemporaryTarget(target);
}
