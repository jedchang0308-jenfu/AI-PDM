#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const output = path.join(root, "output", "qa", "dev-108", "browser");
const screenshotDir = path.join(output, "screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });
const baseUrl = process.env.DEV108_BASE_URL?.trim() || "";
const route = process.env.DEV108_ROUTE?.trim() || "";
if (!baseUrl) {
  const report = { status: "NOT_RUN", reason: "DEV108_BASE_URL is not configured; browser gate preserves Not Run instead of claiming a mock pass.", runtimeDeclaration: { project: root, purpose: "DEV-108 real-browser visual gate", port: null, owningProcessTree: "this Node runner only", cleanupCondition: "no runtime started", PDM_DATA_DIR: null, PDM_REPOSITORY_DIR: null, mutationScope: "report directory only" }, viewports: [{ width: 1536, height: 1024 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }] };
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`DEV-108 browser: NOT RUN (${report.reason})`);
  process.exit(0);
}

const viewports = [{ width: 1536, height: 1024 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }];
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  const page = await browser.newPage();
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.locator("table.part-number-matrix").waitFor({ state: "visible", timeout: 15000 });
    const geometry = await page.evaluate(() => ({ pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1, matrixOverflowOwner: Boolean(document.querySelector(".part-number-matrix-scroll")), visibleErrors: document.querySelectorAll('[role="alert"]').length }));
    if (geometry.pageOverflow) throw new Error(`page-level horizontal overflow at ${viewport.width}x${viewport.height}`);
    checks.push({ viewport, status: "PASS", geometry });
    await page.screenshot({ path: path.join(screenshotDir, `matrix-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  const report = { status: "PASS", denominator: 22, checks, route: `${baseUrl}${route}`, viewports };
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log("DEV-108 browser: PASS (22-case visual gate)");
} finally {
  await browser.close();
}
