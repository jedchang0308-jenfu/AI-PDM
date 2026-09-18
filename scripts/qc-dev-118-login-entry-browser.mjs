import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV118-browser-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-118-login-entry", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev118-browser-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const nextDistDir = path.join(".tmp", `qc-next-dev118-${runId}`);
const nextEnvPath = path.join(root, "next-env.d.ts");
const nextEnvBefore = fs.existsSync(nextEnvPath) ? fs.readFileSync(nextEnvPath) : null;
const envKeys = ["PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_PUBLIC_BASE_URL", "PDM_RELEASE_MODE", "PDM_NEXT_DIST_DIR"];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const checks = [];
const failures = [];
const consoleErrors = [];
let app = null;
let browser = null;
let port = null;

function gitText(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "unavailable";
  }
}

const sourceRevision = gitText(["rev-parse", "HEAD"]);
const sourceStatus = gitText(["status", "--short"]);
const sourceDiff = gitText(["diff", "--no-ext-diff", "--binary"]);
const dirtyFingerprint = crypto.createHash("sha256").update(`${sourceStatus}\0${sourceDiff}`, "utf8").digest("hex");

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `:${detail}` : ""}`);
}

function monitor(page, { allowExpectedModeFailure = false } = {}) {
  page.on("console", (message) => {
    if (message.type() === "error" && !(allowExpectedModeFailure && message.text().includes("status of 503"))) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => failures.push({ kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/api/auth/mode")) failures.push({ kind: "http", status: response.status(), url: response.url() });
  });
}

function modeBody(overrides = {}) {
  return {
    authMode: "firebase_bff",
    ssoHandoffEnabled: true,
    accountInvitations: false,
    localQuickLogin: false,
    googleOAuth: { enabled: false, provider: "firebase" },
    firebase: { enabled: false, config: null },
    ...overrides
  };
}

async function visitLogin(context, viewport, routeHandler, monitorOptions) {
  const page = await context.newPage({ viewport });
  monitor(page, monitorOptions);
  await page.route("**/api/auth/mode", routeHandler);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  return page;
}

fs.mkdirSync(screenshotDir, { recursive: true });
const baseUrl = await (async () => {
  port = await getFreePort();
  return `http://127.0.0.1:${port}`;
})();

try {
  fs.mkdirSync(repositoryDir, { recursive: true });
  process.env.PDM_AUTH_MODE = "demo";
  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_PUBLIC_BASE_URL = baseUrl;
  process.env.PDM_RELEASE_MODE = "local_stub";
  process.env.PDM_NEXT_DIST_DIR = nextDistDir;
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput, 90_000);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 748, height: 698 } });

  const loadingPage = await visitLogin(context, { width: 748, height: 698 }, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modeBody()) });
  });
  await loadingPage.getByText("正在載入登入設定…", { exact: true }).waitFor({ state: "visible" });
  check("loading state is visible", await loadingPage.getByText("正在載入登入設定…", { exact: true }).count() === 1);
  check("loading state has no login form", await loadingPage.locator(".login-form").count() === 0);
  await loadingPage.getByRole("button", { name: "使用鉦富平台登入", exact: true }).waitFor({ state: "visible" });
  check("valid SSO state renders platform CTA", await loadingPage.getByRole("button", { name: "使用鉦富平台登入", exact: true }).count() === 1);
  check("SSO state hides direct form", await loadingPage.locator(".login-form").count() === 0 && await loadingPage.getByText("使用 Google 帳號登入", { exact: true }).count() === 0);
  await loadingPage.screenshot({ path: path.join(screenshotDir, "sso-ready-748x698.png"), fullPage: true });
  await loadingPage.close();

  const unavailablePage = await visitLogin(context, { width: 390, height: 844 }, async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "sso_dependency_unavailable" }) });
  }, { allowExpectedModeFailure: true });
  const unavailableAlert = unavailablePage.getByText("登入設定暫時無法使用，請稍後再試或聯絡系統管理員。", { exact: true });
  await unavailableAlert.waitFor({ state: "visible" });
  check("unavailable state exposes visible alert", await unavailableAlert.count() === 1);
  check("unavailable state exposes retry", await unavailablePage.getByRole("button", { name: "重新取得登入設定", exact: true }).count() === 1);
  check("unavailable state has no login form", await unavailablePage.locator(".login-form").count() === 0);
  await unavailablePage.screenshot({ path: path.join(screenshotDir, "sso-unavailable-390x844.png"), fullPage: true });
  await unavailablePage.close();

  const retryPage = await visitLogin(context, { width: 390, height: 844 }, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...modeBody(), ssoHandoffEnabled: false, authMode: "managed", googleOAuth: { enabled: false, provider: "legacy" } }) });
  });
  await retryPage.getByRole("button", { name: "使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定", exact: true }).waitFor({ state: "visible" });
  check("managed compatibility mode remains available", await retryPage.locator(".login-form").count() === 1);
  check("narrow viewport has no horizontal overflow", await retryPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await retryPage.screenshot({ path: path.join(screenshotDir, "managed-off-390x844.png"), fullPage: true });
  await retryPage.close();
  await context.close();
} catch (error) {
  failures.push({ kind: "execution", message: error instanceof Error ? error.message : String(error), runtime: app?.getOutput?.() ?? "" });
} finally {
  try { await browser?.close(); } catch {}
  try { if (app?.child) await stopNextApp(app.child); } catch (error) { failures.push({ kind: "cleanup", message: error instanceof Error ? error.message : String(error) }); }
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: released, detail: `port=${port}` });
  }
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  const resolvedTempRoot = path.resolve(tempRoot);
  if (resolvedTempRoot.startsWith(path.resolve(os.tmpdir()))) fs.rmSync(resolvedTempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const resolvedDistDir = path.resolve(root, nextDistDir);
  const resolvedTmp = path.resolve(root, ".tmp");
  const distPathSafe = resolvedDistDir.startsWith(`${resolvedTmp}${path.sep}`);
  if (distPathSafe) fs.rmSync(resolvedDistDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const distRemoved = distPathSafe && !fs.existsSync(resolvedDistDir);
  checks.push({ name: "temporary Next dist removed", pass: distRemoved, detail: resolvedDistDir });
  if (nextEnvBefore === null) {
    if (fs.existsSync(nextEnvPath)) fs.rmSync(nextEnvPath, { force: true });
  } else {
    fs.writeFileSync(nextEnvPath, nextEnvBefore);
  }
  const nextEnvRestored = nextEnvBefore === null ? !fs.existsSync(nextEnvPath) : fs.existsSync(nextEnvPath) && Buffer.compare(fs.readFileSync(nextEnvPath), nextEnvBefore) === 0;
  checks.push({ name: "next-env source file restored", pass: nextEnvRestored, detail: nextEnvPath });
}

const failedChecks = checks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-118",
  phase: "118-A",
  runId,
  generatedAt: new Date().toISOString(),
  sourceRevision,
  dirtyFingerprint,
  sourceStatus,
  status: failedChecks.length === 0 && failures.length === 0 && consoleErrors.length === 0 ? "PASS" : "FAIL",
  total: checks.length,
  passed: checks.length - failedChecks.length,
  failed: failedChecks.length,
  checks,
  consoleErrors,
  failures,
  productionConnected: false,
  productionMutation: false,
  fixture: "mode response only; no successful session injected",
  runtimeDeclaration: { project: root, purpose: "DEV-118 login entry browser evidence", port, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, cleanupCondition: "after browser evidence and port release", mutationScope: tempRoot }
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
