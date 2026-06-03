#!/usr/bin/env node

import { chromium } from "playwright";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
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
  await context.addCookies([
    {
      name,
      value: valueParts.join("="),
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
}

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await loginAsAdmin(context);
  await page.goto(`${apiBaseUrl}/settings`, { waitUntil: "networkidle" });
  await page.getByText("審核矩陣設定台").waitFor({ timeout: 10_000 });

  const matrixRows = await page.locator("table").first().locator("tbody tr").count();
  record(`Approval matrix rows render at ${viewport.width}px`, matrixRows >= 2, `${matrixRows} rows`);
  record(`Hard-rule table renders at ${viewport.width}px`, (await page.getByText("不可關閉硬限制").count()) >= 1);
  record(`Rule templates render at ${viewport.width}px`, (await page.getByText("規則模板").count()) >= 1);
  record(`Rule version history renders at ${viewport.width}px`, (await page.getByText("規則版本").count()) >= 1);
  record(`Rule simulator renders at ${viewport.width}px`, (await page.getByText("規則模擬器").count()) >= 1);
  record(`Warning markers render at ${viewport.width}px`, (await page.locator("button[title]").filter({ hasText: "!" }).count()) >= 1);

  await page.getByRole("button", { name: "模擬" }).click();
  await page.locator("pre").last().waitFor({ timeout: 10_000 });
  const simulationText = await page.locator("pre").last().innerText();
  record(`Rule simulator returns result at ${viewport.width}px`, simulationText.includes("requiredRoles"), simulationText.slice(0, 160));

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`Settings body avoids page-level horizontal overflow at ${viewport.width}px`, bodyOverflow <= 2, `${bodyOverflow}px`);
  record(`No browser console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyViewport(browser, { width: 1440, height: 1200 });
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
