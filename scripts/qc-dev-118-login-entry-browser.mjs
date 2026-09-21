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
const tempParent = path.resolve(process.env.PDM_QC_TEMP_ROOT || os.tmpdir());
const tempRoot = fs.mkdtempSync(path.join(tempParent, "ai-pdm-dev118-browser-"));
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
const runtimeDeclaration = { project: root, purpose: "DEV-118 login entry browser evidence", port: null, owningProcessTree: { runnerPid: process.pid, nextPid: null }, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, cleanupCondition: "after browser evidence and port release", mutationScope: [tempRoot, path.resolve(root, nextDistDir)] };
const primarySnapshot = () => fs.existsSync(path.join(root, "data", "ai-pdm.sqlite"))
  ? JSON.parse(execFileSync(process.execPath, ["scripts/dev-087-primary-snapshot.mjs"], { cwd: root, encoding: "utf8" }))
  : { exists: false };
const primaryBefore = primarySnapshot();
let primaryAfter = null;

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

async function visitLogin(context, viewport, routeHandler, monitorOptions, configurePage, loginQuery = "") {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  monitor(page, monitorOptions);
  if (configurePage) await configurePage(page);
  await page.route("**/api/auth/mode", routeHandler);
  await page.goto(`${baseUrl}/login${loginQuery}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
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
  runtimeDeclaration.port = port;
  console.log(JSON.stringify({ runtimeDeclaration }));
  app = startNextApp(root, "dev", port);
  runtimeDeclaration.owningProcessTree.nextPid = app.child.pid;
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

  // A03: malformed mode responses must never expose a direct-login fallback.
  const missingSso = modeBody();
  delete missingSso.ssoHandoffEnabled;
  for (const [name, body] of [
    ["missing SSO field", JSON.stringify(missingSso)],
    ["unknown mode", JSON.stringify(modeBody({ authMode: "unknown" }))],
    ["invalid SSO field", JSON.stringify(modeBody({ ssoHandoffEnabled: "true" }))],
    ["incomplete Firebase config", JSON.stringify(modeBody({ firebase: { config: { apiKey: "fixture-only" } } }))],
    ["non-JSON response", "not-json"],
    ["null response", "null"]
  ]) {
    const invalidPage = await visitLogin(context, { width: 748, height: 698 }, (route) => route.fulfill({ status: 200, contentType: "application/json", body }));
    await invalidPage.locator('.login-panel [role="alert"]').waitFor({ state: "visible" });
    check(`${name} fails closed`, await invalidPage.locator(".login-form").count() === 0 && await invalidPage.getByRole("button", { name: "使用鉦富平台登入", exact: true }).count() === 0);
    await invalidPage.close();
  }

  // Only the external /mode transport is delayed. The real client deadline,
  // retry control and generation guard execute in the compiled application.
  let retryRequests = 0;
  const recoveryPage = await visitLogin(context, { width: 748, height: 698 }, (route) => {
    retryRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modeBody()) });
  }, {}, async (page) => {
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      const oldModeRequests = [];
      window.__dev118ReleaseOldMode = () => oldModeRequests.forEach((resolve) => resolve(new Response(JSON.stringify({ authMode: "managed", ssoHandoffEnabled: false, localQuickLogin: false, googleOAuth: { enabled: false }, firebase: { config: null } }), { status: 200 })));
      window.fetch = (input, init) => {
        if (input === "/api/auth/mode" && !window.__dev118AllowModeRetry) {
          window.__dev118ModeSignal = init?.signal;
          // Simulate a transport/body completion that arrives after abort.
          return new Promise((resolve) => { oldModeRequests.push(resolve); });
        }
        return originalFetch(input, init);
      };
    });
  });
  await recoveryPage.locator('.login-panel [role="alert"]').waitFor({ state: "visible", timeout: 15_000 });
  check("mode request times out and aborts transport", await recoveryPage.evaluate(() => window.__dev118ModeSignal?.aborted === true));
  check("timeout keeps direct login unavailable", await recoveryPage.locator(".login-form").count() === 0);
  await recoveryPage.evaluate(() => { window.__dev118AllowModeRetry = true; });
  const retryButton = recoveryPage.getByRole("button", { name: "重新取得登入設定", exact: true });
  await retryButton.focus();
  await recoveryPage.keyboard.press("Enter");
  await recoveryPage.getByRole("button", { name: "使用鉦富平台登入", exact: true }).waitFor({ state: "visible" });
  check("keyboard retry makes one new request and recovers", retryRequests === 1 && await recoveryPage.locator('.login-panel [role="alert"]').count() === 0);
  await recoveryPage.evaluate(async () => {
    window.__dev118ReleaseOldMode();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  check("late response cannot replace recovered SSO state", await recoveryPage.getByRole("button", { name: "使用鉦富平台登入", exact: true }).count() === 1 && await recoveryPage.locator(".login-form").count() === 0);
  await recoveryPage.screenshot({ path: path.join(screenshotDir, "retry-recovered-748x698.png"), fullPage: true });
  await recoveryPage.close();

  // C05 prerequisite: an authenticated user can explicitly end the local
  // AI-PDM session before starting a Google-first or employee-number-first flow.
  const logoutPage = await context.newPage();
  await logoutPage.setViewportSize({ width: 1440, height: 900 });
  monitor(logoutPage);
  let logoutMethod = null;
  await logoutPage.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "dev118-user", display_name: "DEV-118 Operator", email: "operator@example.invalid" } })
  }));
  await logoutPage.route("**/api/account/sessions", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ sessions: [] })
  }));
  await logoutPage.route("**/api/production-slice/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ configured: false, active: false, openPagePaths: [], unopenedMessage: "" })
  }));
  await logoutPage.route("**/api/numbering/permissions", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ pages: {} })
  }));
  await logoutPage.route("**/api/auth/logout", (route) => {
    logoutMethod = route.request().method();
    return route.fulfill({ status: 204, body: "" });
  });
  await logoutPage.goto(`${baseUrl}/account/security`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const localLogout = logoutPage.locator('a[href="/login"][aria-label="DEV-118 Operator，登出 AI PDM"]');
  await localLogout.waitFor({ state: "visible", timeout: 30_000 });
  check("signed-in sidebar logout exposes an explicit accessible action", await localLogout.count() === 1);
  await localLogout.focus();
  check("signed-in sidebar logout is keyboard reachable", await localLogout.evaluate((element) => element === document.activeElement));
  await logoutPage.keyboard.press("Enter");
  await logoutPage.waitForURL("**/login?reason=local-logout", { timeout: 30_000 });
  check("signed-in sidebar posts local logout before clean login navigation", logoutMethod === "POST");
  await logoutPage.close();

  // A05/A06: exercise the existing entry button and both return-path cases.
  for (const [viewport, returnTo] of [
    [{ width: 1440, height: 900 }, "/drawings?tab=recent"],
    [{ width: 390, height: 844 }, "https://outside.example/"]
  ]) {
    const navigationPage = await visitLogin(context, viewport, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modeBody()) }), {}, undefined, `?returnTo=${encodeURIComponent(returnTo)}`);
    const entry = navigationPage.getByRole("button", { name: "使用鉦富平台登入", exact: true });
    await entry.waitFor({ state: "visible" });
    check(`SSO viewport ${viewport.width} has no overflow`, await navigationPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await navigationPage.screenshot({ path: path.join(screenshotDir, `sso-ready-${viewport.width}x${viewport.height}.png`), fullPage: true });
    let entryUrl = null;
    await navigationPage.route("**/api/auth/jenfu-sso/start?**", async (route) => {
      entryUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: "text/html", body: "<main>SSO entry fixture</main>" });
    });
    await entry.focus();
    await navigationPage.keyboard.press("Tab");
    await navigationPage.keyboard.press("Shift+Tab");
    check(`SSO button ${viewport.width} remains keyboard reachable`, await entry.evaluate((element) => element === document.activeElement));
    await navigationPage.keyboard.press("Enter");
    await navigationPage.waitForURL("**/api/auth/jenfu-sso/start?**");
    check(`SSO button ${viewport.width} enters existing start with safe returnTo`, entryUrl !== null && new URL(entryUrl).searchParams.get("returnTo") === (returnTo.startsWith("/") ? returnTo : "/"), JSON.stringify({ entryUrl, actualUrl: navigationPage.url(), requestedReturnTo: returnTo }));
    await navigationPage.close();
  }

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
  if (resolvedTempRoot.startsWith(`${tempParent}${path.sep}`)) fs.rmSync(resolvedTempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  checks.push({ name: "temporary data root removed", pass: !fs.existsSync(resolvedTempRoot), detail: resolvedTempRoot });
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
  primaryAfter = primarySnapshot();
  checks.push({ name: "primary schema identities residue and foreign keys unchanged", pass: JSON.stringify(primaryBefore) === JSON.stringify(primaryAfter) });
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
  fixture: "mode response/transport and SSO start destination only; no successful session injected",
  browserVersion: browser?.version(),
  primaryBefore,
  primaryAfter,
  runtimeDeclaration
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
