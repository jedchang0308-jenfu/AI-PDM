#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";

const root = process.cwd();
const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const route = "/numbering/drawings/drawing-draft-drawing-cc7187b8-1ec4-4936-91da-4771f1b8a877/workspace?intent=edit_revision&returnTo=%2Fnumbering%2Fdrawings%3Fview%3Dwork";
const viewportCases = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "phone", width: 390, height: 844 }
];
const runId = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const outputDir = path.resolve(root, "output", "qa", "dev-056-2d-preview", `${runId}-browser`);
const dbPath = process.env.PDM_DATA_DIR
  ? path.resolve(root, process.env.PDM_DATA_DIR, "ai-pdm.sqlite")
  : path.resolve(root, "data", "ai-pdm.sqlite");
const db = new Database(dbPath, { readonly: true });
const source = db.prepare("SELECT id FROM file_assets WHERE lower(file_name) = 'a0002-m01.slddrw' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1").get();
const derivative = source
  ? db.prepare("SELECT id FROM file_derivatives WHERE source_file_asset_id = ? AND status = 'ready' ORDER BY created_at DESC LIMIT 1").get(source.id)
  : null;
db.close();
if (!source || !derivative) throw new Error("A0002 current derivative not found");

fs.mkdirSync(outputDir, { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewportCases) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const login = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Admin" } });
    if (!login.ok()) throw new Error(`${viewport.name}: local admin login HTTP ${login.status()}`);
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? "failed"}`));
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    await page.waitForFunction(() => Boolean(document.querySelector('a[href*="previewDerivative="]')), null, { timeout: 10_000 }).catch(() => {});
    const verification = await page.evaluate((expectedDerivativeId) => {
      const bodyText = document.body.innerText;
      const selectedTab = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? "";
      const previewLink = Array.from(document.querySelectorAll("a")).find((link) => link.getAttribute("href")?.includes("previewDerivative="));
      const previewFrame = document.querySelector('.drawing-preview-frame:not(.placeholder-frame)');
      const previewImage = document.querySelector('[data-preview-media="image"]');
      const frameRect = previewFrame?.getBoundingClientRect();
      const imageRect = previewImage?.getBoundingClientRect();
      const imageCentered = Boolean(frameRect && imageRect)
        && Math.abs((imageRect.left + imageRect.width / 2) - (frameRect.left + frameRect.width / 2)) <= 2
        && Math.abs((imageRect.top + imageRect.height / 2) - (frameRect.top + frameRect.height / 2)) <= 2;
      return {
        heading: document.querySelector("h1")?.textContent?.trim() ?? "",
        selectedTab,
        previewLinkPresent: Boolean(previewLink),
        derivativeBound: Boolean(previewLink?.getAttribute("href")?.includes(expectedDerivativeId)),
        renderedMode: previewLink?.getAttribute("data-preview-rendered-mode") ?? "",
        previewImagePresent: Boolean(previewImage),
        previewImageCentered: imageCentered,
        previewImageWidthRatio: frameRect && imageRect ? Number((imageRect.width / frameRect.width).toFixed(3)) : null,
        previewImageHeightRatio: frameRect && imageRect ? Number((imageRect.height / frameRect.height).toFixed(3)) : null,
        stuckProcessingTextAbsent: !bodyText.includes("預覽產生中"),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }, derivative.id);
    const passed = response?.status() < 400
      && verification.heading.includes("A0002-M01")
      && verification.selectedTab.includes("2D 圖面")
      && verification.previewLinkPresent
      && verification.derivativeBound
      && verification.renderedMode === "image"
      && verification.previewImagePresent
      && verification.previewImageCentered
      && verification.previewImageWidthRatio >= 0.95
      && verification.previewImageHeightRatio >= 0.95
      && verification.stuckProcessingTextAbsent
      && verification.horizontalOverflow <= 2
      && consoleErrors.length === 0
      && failedRequests.length === 0;
    const screenshot = path.join(outputDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({ viewport, httpStatus: response?.status() ?? null, passed, verification, consoleErrors, failedRequests, screenshot: path.relative(root, screenshot) });
    await context.close();
    if (!passed) throw new Error(`${viewport.name} browser verification failed: ${JSON.stringify(results.at(-1))}`);
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outputDir, "browser-verification.json"), `${JSON.stringify({ baseUrl, route, derivativeId: derivative.id, results, status: "PASS" }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "PASS", outputDir, results }, null, 2));
