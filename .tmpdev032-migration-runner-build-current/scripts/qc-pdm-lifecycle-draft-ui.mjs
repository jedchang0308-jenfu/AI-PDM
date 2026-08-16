#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const screenshotPath = path.join(root, "output", "playwright", "pdm-lifecycle-owner-drafts-compatibility.png");
const checks = [];

function record(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function isAppReady(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${baseUrl}/login`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password })
  });
  record("admin login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("admin login returns session cookie", Boolean(name && valueParts.length));
  return { name, value: valueParts.join("=") };
}

async function runCompatibilityCheck(baseUrl, cookie) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: cookie.name, value: cookie.value, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const legacyApiRequests = [];
    const failedResponses = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/numbering/part-number-drafts")) legacyApiRequests.push(`${request.method()} ${request.url()}`);
    });
    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(`${baseUrl}/numbering/part-drafts?foo=bar&returnTo=${encodeURIComponent("/numbering/search")}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /料號模組/ }).waitFor({ timeout: 15_000 });
    await page.getByRole("region", { name: "保留號清單" }).waitFor({ timeout: 15_000 });

    const current = new URL(page.url());
    record("retired draft URL redirects to parts owner surface", current.pathname === "/parts", current.pathname);
    record("redirect selects drafts tab", current.searchParams.get("tab") === "drafts", current.search);
    record("redirect preserves query and returnTo", current.searchParams.get("foo") === "bar" && current.searchParams.get("returnTo") === "/numbering/search", current.search);
    record("redirect records legacy source", current.searchParams.get("legacyFrom") === "/numbering/part-drafts", current.search);
    record("legacy deleted-data workbench is absent", (await page.getByText("已刪除資料", { exact: true }).count()) === 0);
    record("legacy part-number-draft API is not called", legacyApiRequests.length === 0, legacyApiRequests.join("\n"));
    record("no API responses failed", failedResponses.length === 0, failedResponses.join("\n"));
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    record("desktop viewport has no horizontal overflow", noOverflow);

    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    record("owner draft compatibility screenshot captured", true, screenshotPath);
    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  const configuredBaseUrl = process.env.PDM_BASE_URL?.replace(/\/$/u, "");
  let baseUrl = configuredBaseUrl ?? null;
  let app = null;
  try {
    if (!baseUrl) {
      for (const candidate of ["http://127.0.0.1:3000", "http://localhost:3000"]) {
        if (await isAppReady(candidate)) {
          baseUrl = candidate;
          break;
        }
      }
    }
    if (!baseUrl) {
      const port = await getFreePort();
      baseUrl = `http://127.0.0.1:${port}`;
      app = startNextApp(root, "dev", port);
      await waitForNextAppReady(baseUrl, app.getOutput);
    }
    const cookie = await login(baseUrl);
    await runCompatibilityCheck(baseUrl, cookie);
  } finally {
    if (app) await stopNextApp(app.child);
  }
  console.log(`qc:pdm-lifecycle-draft-ui passed ${checks.length}/${checks.length} checks`);
  console.log(`screenshot: ${screenshotPath}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: checks.filter((check) => check.passed).length, failed: 1, checks, error: error.message }, null, 2));
  process.exit(1);
});
