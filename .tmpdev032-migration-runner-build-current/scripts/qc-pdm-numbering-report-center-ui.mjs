#!/usr/bin/env node

import { chromium } from "playwright";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function loginAsAdmin(context) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password })
  });
  record("Admin login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("Admin login returns session cookie", Boolean(name && valueParts.length > 0), cookie);
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name, value: valueParts.join("="), domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
}

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await loginAsAdmin(context);
  await page.goto(`${apiBaseUrl}/numbering/reports`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "圖號稽核報表" }).waitFor({ timeout: 10_000 });
  await page.getByRole("heading", { name: "月報重產" }).waitFor({ timeout: 10_000 });
  await page.getByRole("heading", { name: "總表匯出" }).waitFor({ timeout: 10_000 });
  record(`Report center page renders at ${viewport.width}px`, await page.getByText("近期月報").isVisible());

  const reportResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/numbering/monthly-audit-reports") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "重產月報" }).click();
  const reportResponse = await reportResponsePromise;
  record(`Manual monthly report regenerate succeeds at ${viewport.width}px`, reportResponse.ok(), `HTTP ${reportResponse.status()}`);
  await page.locator(".pdm-detail-drawer").waitFor({ timeout: 10_000 });
  const backdropColor = await page.locator(".pdm-detail-drawer-backdrop").evaluate((element) => getComputedStyle(element).backgroundColor);
  record(`Monthly report detail opens as non-dark drawer at ${viewport.width}px`, backdropColor === "rgba(0, 0, 0, 0)" || backdropColor === "transparent", backdropColor);
  await page.getByRole("button", { name: "研發" }).waitFor({ timeout: 10_000 });
  record(`Department tabs render at ${viewport.width}px`, (await page.getByRole("button", { name: "研發" }).count()) >= 1);
  await page.getByRole("button", { name: "PDM 管理" }).click();
  record(`PDM department page renders at ${viewport.width}px`, await page.getByText("PDM 管理").first().isVisible());
  await page.getByRole("button", { name: "專案分頁" }).click();
  record(`Project page renders at ${viewport.width}px`, (await page.getByText(/專案|目前沒有專案待辦資料/).count()) >= 1);

  await page.keyboard.press("Escape");
  await page.locator(".pdm-detail-drawer").waitFor({ state: "detached", timeout: 10_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出下載" }).click();
  const download = await downloadPromise;
  record(`Export JSON download is created at ${viewport.width}px`, download.suggestedFilename().endsWith(".json"), download.suggestedFilename());

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`Report center avoids page-level horizontal overflow at ${viewport.width}px`, bodyOverflow <= 2, `${bodyOverflow}px`);
  record(`No browser console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyViewport(browser, { width: 1440, height: 1100 });
  await verifyViewport(browser, { width: 390, height: 920 });
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
