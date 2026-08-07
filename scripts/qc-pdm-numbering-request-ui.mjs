#!/usr/bin/env node

import { chromium } from "playwright";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://localhost:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-request-ui" });
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function loginAsManager(context) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "manager@example.com", password })
  });
  record("Manager login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("Manager login returns session cookie", Boolean(name && valueParts.length > 0));
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name, value: valueParts.join("="), domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
}

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const draftWrites = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/numbering/draft-workspaces")) draftWrites.push(`${request.method()} ${request.url()}`);
  });

  await loginAsManager(context);
  const returnTo = "/parts?tab=drafts";
  await page.goto(`${apiBaseUrl}/numbering/request?foo=bar&returnTo=${encodeURIComponent(returnTo)}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "建立保留號" }).waitFor({ timeout: 10_000 });

  const current = new URL(page.url());
  record(`Retired request URL redirects to owner surface at ${viewport.width}px`, current.pathname === "/numbering/search", current.pathname);
  record(`Redirect opens reserved create intent at ${viewport.width}px`, current.searchParams.get("tab") === "reserved" && current.searchParams.get("create") === "new_bundle", current.search);
  record(`Redirect preserves query and returnTo at ${viewport.width}px`, current.searchParams.get("foo") === "bar" && current.searchParams.get("returnTo") === returnTo, current.search);
  record(`Redirect records legacy source at ${viewport.width}px`, current.searchParams.get("legacyFrom") === "/numbering/request", current.search);
  record(`Old request page shell is absent at ${viewport.width}px`, (await page.locator(".numbering-request-page").count()) === 0);

  for (const label of ["建立新圖料", "既有主根加圖號", "既有主根加料號", "既有主根加圖號與料號"]) {
    record(`${label} mode is available at ${viewport.width}px`, await page.getByText(label, { exact: true }).isVisible());
  }
  record(`Confirmed-name owner field is visible at ${viewport.width}px`, await page.getByLabel("確定品名").isVisible());
  record(`Manufactured series code is visible at ${viewport.width}px`, await page.getByLabel("系列代號（選填）").isVisible());
  record(`M/R drawing choices are present at ${viewport.width}px`, (await page.getByText("製造圖 M", { exact: true }).count()) === 1 && (await page.getByText("參考圖 R", { exact: true }).count()) === 1);

  await page.getByRole("button", { name: "關閉建立保留號" }).click();
  await page.getByRole("heading", { name: "建立保留號" }).waitFor({ state: "hidden" });
  record(`Closing create modal performs no write at ${viewport.width}px`, draftWrites.length === 0, draftWrites.join("\n"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`Owner create surface avoids horizontal overflow at ${viewport.width}px`, overflow <= 2, `${overflow}px`);
  record(`Owner create surface has no console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyViewport(browser, { width: 1440, height: 1050 });
  await verifyViewport(browser, { width: 390, height: 920 });
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  results
}, null, 2));
