#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = process.cwd();
const runId = crypto.randomUUID();
const useExistingServer = process.env.PDM_STATUS_SCOPE_QC_USE_EXISTING === "1";
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev049-status-scope-"));
const distDirRelative = `.tmp/next-qc-dev049-status-scope-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const outputDir = path.join(root, "output", "playwright", "dev-049-status-scope");
const timestamp = new Date().toISOString();
const password = "DEV049-Status-Scope-QC";
const user = {
  id: "dev049-status-scope-admin",
  displayName: "DEV049 Status Scope Admin",
  email: "dev049.status.scope@example.invalid",
  password,
  role: "Admin",
  companyCodes: ["JENFU"]
};
const snapshots = new Map(
  ["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);
const routes = [
  { path: "/parts", scope: "partsList" },
  { path: "/numbering/drawings", scope: "drawingList" },
  { path: "/numbering/search", scope: "numberingSearch" },
  { path: "/numbering/part-drafts", scope: "numberingDraftList", fallbackScopes: ["numberStateWorkspace"] },
  { path: "/approvals", scope: "approvalInbox" },
  { path: "/settings", scope: "settingsCenter" },
  { path: "/settings/accounts", scope: "accountList" },
  { path: "/settings/account-invitations", scope: "invitationList" }
];
const viewports = [
  { width: 1440, height: 900, name: "1440x900" },
  { width: 1024, height: 768, name: "1024x768" },
  { width: 768, height: 1024, name: "768x1024" },
  { width: 390, height: 844, name: "390x844" },
  { width: 320, height: 844, name: "320x844" }
];
const results = [];
const browserErrors = [];
let app;
let browser;
let baseUrl = (process.env.PDM_STATUS_SCOPE_QC_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
}

function screenshotName(routePath, viewportName) {
  const slug = routePath.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "root";
  return `${slug}-${viewportName}-scope-help.png`;
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
      PDM_AUTH_MODE: "managed",
      PDM_BOOTSTRAP_USERS: JSON.stringify([user]),
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_DB_PROVIDER: "sqlite",
      PDM_RELEASE_MODE: "local_stub",
      PDM_PUBLICATION_EVIDENCE_MODE: "local_fake",
      PDM_NUMBER_STATE_FLOW_V1: "true",
      PDM_PRODUCTION_SLICE_MODE: "",
      GOOGLE_SERVICE_ACCOUNT_KEY_PATH: "",
      GOOGLE_DRIVE_MOCK_ACCESS_TOKEN: "",
      GOOGLE_DRIVE_API_BASE_URL: "",
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-30000);
  });
  child.stderr.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-30000);
  });
  return { child, output: () => output };
}

async function waitForServer(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status < 500) return;
    } catch {}
    await delay(400);
  }
  throw new Error(`Local server is not reachable at ${baseUrl}\n${app?.output() ?? ""}`);
}

async function stopApp() {
  if (!app || app.child.exitCode !== null) return;
  app.child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => app.child.once("exit", resolve)),
    delay(4000).then(() => {
      if (app.child.exitCode === null) app.child.kill("SIGTERM");
    })
  ]);
}

async function removeTempDir(target) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch {
      await delay(300);
    }
  }
}

async function loginIfNeeded(context) {
  if (useExistingServer && process.env.PDM_STATUS_SCOPE_QC_SKIP_LOGIN === "1") return;
  const login = await context.request.post(`${baseUrl}/api/auth/login`, { data: { email: user.email, password } });
  if (!login.ok()) {
    const body = await login.text().catch(() => "");
    throw new Error(`LOGIN_FAILED:${login.status()}:${body}`);
  }
}

async function visibleErrorSweep(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const inlineErrors = [...document.querySelectorAll(".inline-error")].filter(isVisible).map((element) => element.textContent?.trim()).filter(Boolean);
    const alerts = [...document.querySelectorAll('[role="alert"]')].filter(isVisible).map((element) => element.textContent?.trim()).filter(Boolean);
    const bodyText = document.body.innerText;
    const visibleHttpErrors = ["HTTP 4", "HTTP 5", "Not Found", "Internal Server Error"].filter((text) => bodyText.includes(text));
    const apiRouteText = bodyText.includes("/api/") ? [bodyText.match(/\/api\/[^\s，。)]+/)?.[0] ?? "/api/"] : [];
    return { inlineErrors, alerts, visibleHttpErrors, apiRouteText };
  });
}

async function scopeMetrics(page, scope) {
  return page.evaluate((scopeId) => {
    const panel = document.querySelector(`[data-status-scope-help="true"][data-status-scope="${scopeId}"]`);
    const panelRect = panel?.getBoundingClientRect();
    const trigger = document.querySelector(`[data-status-scope-help-trigger="${scopeId}"] button`);
    const triggerRect = trigger?.getBoundingClientRect();
    const items = panel ? [...panel.querySelectorAll(".status-help-item")] : [];
    const itemRects = items.map((item) => item.getBoundingClientRect());
    const groups = panel ? [...panel.querySelectorAll(".status-scope-help-group h3")].map((heading) => heading.textContent?.trim()).filter(Boolean) : [];
    return {
      url: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      triggerVisible: Boolean(triggerRect && triggerRect.width > 0 && triggerRect.height > 0),
      panelVisible: Boolean(panelRect && panelRect.width > 0 && panelRect.height > 0),
      panelInsideViewport: Boolean(panelRect && panelRect.left >= 0 && panelRect.top >= 0 && panelRect.right <= window.innerWidth && panelRect.bottom <= window.innerHeight),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      panelHorizontalOverflow: Boolean(panel && panel.scrollWidth > panel.clientWidth + 1),
      itemOverlap: itemRects.some((rect, index) => index > 0 && itemRects[index - 1].bottom > rect.top + 1),
      groupCount: groups.length,
      groups
    };
  }, scope);
}

async function waitForPrivacyGateToSettle(page) {
  await page.waitForFunction(
    () => !document.querySelector(".privacy-gate-state"),
    undefined,
    { timeout: 5000 }
  ).catch(() => undefined);
}

async function pageDebugSnapshot(page) {
  return page.evaluate(() => ({
    title: document.title,
    bodyPreview: document.body.innerText.slice(0, 1200),
    privacyGate: document.querySelector(".privacy-gate-state")?.textContent?.trim() ?? null,
    statusScopeTriggers: [...document.querySelectorAll("[data-status-scope-help-trigger]")]
      .map((element) => element.getAttribute("data-status-scope-help-trigger"))
      .filter(Boolean),
    alerts: [...document.querySelectorAll('[role="alert"]')]
      .map((element) => element.textContent?.trim())
      .filter(Boolean)
  }));
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  if (!useExistingServer) {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    app = startApp(port);
  }
  await waitForServer(useExistingServer ? 15000 : 90000);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await loginIfNeeded(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of 40[13]/.test(message.text())) browserErrors.push({ type: "console", message: message.text() });
  });
  page.on("response", (response) => {
    if (response.status() >= 500) browserErrors.push({ type: "network", status: response.status(), url: response.url() });
  });

  for (const route of routes) {
    for (const viewport of viewports) {
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const url = `${baseUrl}${route.path}`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => undefined);
        await waitForPrivacyGateToSettle(page);
        const candidateScopes = [route.scope, ...(route.fallbackScopes ?? [])];
        let activeScope = route.scope;
        let trigger = null;
        for (const candidateScope of candidateScopes) {
          const candidateTrigger = page.locator(`[data-status-scope-help-trigger="${candidateScope}"] button`).first();
          const visible = await candidateTrigger.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
          if (visible) {
            activeScope = candidateScope;
            trigger = candidateTrigger;
            break;
          }
        }
        if (!trigger) {
          const debug = await pageDebugSnapshot(page);
          throw new Error(`Missing StatusScopeHelp trigger for ${candidateScopes.join(" or ")} at ${page.url()}: ${JSON.stringify(debug)}`);
        }
        const beforeErrors = await visibleErrorSweep(page);
        await trigger.click();
        const panel = page.locator(`[data-status-scope-help="true"][data-status-scope="${activeScope}"]`).first();
        await panel.waitFor({ state: "visible", timeout: 5000 });
        const metrics = await scopeMetrics(page, activeScope);
        const screenshotPath = path.join(outputDir, screenshotName(route.path, viewport.name));
        await page.screenshot({ path: screenshotPath, fullPage: false });
        await page.keyboard.press("Escape");
        const focusRestored = await page.evaluate((scopeId) => document.activeElement === document.querySelector(`[data-status-scope-help-trigger="${scopeId}"] button`), activeScope);
        await trigger.click();
        await panel.waitFor({ state: "visible", timeout: 5000 });
        await page.mouse.click(4, 4);
        await panel.waitFor({ state: "hidden", timeout: 5000 });
        const afterErrors = await visibleErrorSweep(page);
        const errorsClean =
          beforeErrors.inlineErrors.length === 0 &&
          beforeErrors.alerts.length === 0 &&
          beforeErrors.visibleHttpErrors.length === 0 &&
          beforeErrors.apiRouteText.length === 0 &&
          afterErrors.inlineErrors.length === 0 &&
          afterErrors.alerts.length === 0 &&
          afterErrors.visibleHttpErrors.length === 0 &&
          afterErrors.apiRouteText.length === 0;
        record(`${route.scope}:${viewport.name}`, errorsClean && metrics.triggerVisible && metrics.panelVisible && metrics.panelInsideViewport && !metrics.horizontalOverflow && !metrics.panelHorizontalOverflow && !metrics.itemOverlap && metrics.groupCount > 0 && focusRestored, {
          route: route.path,
          finalUrl: page.url(),
          requestedScope: route.scope,
          activeScope,
          viewport,
          screenshotPath,
          metrics,
          focusRestored,
          visibleErrors: { beforeErrors, afterErrors }
        });
      } catch (error) {
        record(`${route.scope}:${viewport.name}`, false, {
          route: route.path,
          finalUrl: page.url(),
          viewport,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
    }
  }

  await context.close();
} catch (error) {
  record("browser-qc-runtime", false, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    serverTail: app?.output() ?? ""
  });
} finally {
  await browser?.close().catch(() => undefined);
  await stopApp();
  for (const [file, content] of snapshots) fs.writeFileSync(path.join(root, file), content, "utf8");
  if (!useExistingServer) await removeTempDir(distDir);
  await removeTempDir(tempDir);
}

const failed = results.filter((result) => !result.passed);
const report = {
  suite: "DEV-049 status scope browser QC",
  checkedAt: timestamp,
  baseUrl,
  routes,
  viewports,
  browserErrors,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results
};

fs.writeFileSync(path.join(outputDir, "status-scope-browser-metrics.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0 || browserErrors.length > 0) process.exit(1);
