#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startDev079IsolatedRuntime } from "./qc-dev-079-isolated-runtime.mjs";

const root = process.cwd();
const ownsRuntime = !process.env.PDM_BASE_URL;
let baseUrl = process.env.PDM_BASE_URL ?? "";
const drawingId = process.env.PDM_DEV_079_DRAWING_ID ?? "drawing-draft-drawing-5252ba10-7bf4-449c-b44d-43e7c68a1978";
const route = `/numbering/drawings/${encodeURIComponent(drawingId)}/workspace?intent=edit_revision&returnTo=%2Fnumbering%2Fdrawings%3Fview%3Dwork`;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "phone", width: 390, height: 844 }
];
const runId = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const outputDir = path.resolve(root, "output", "qa", "dev-079-layout", `${runId}-browser`);
fs.mkdirSync(outputDir, { recursive: true });

let isolatedRuntime = null;
if (ownsRuntime) {
  isolatedRuntime = await startDev079IsolatedRuntime();
  baseUrl = isolatedRuntime.baseUrl;
}
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const login = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Admin" } });
    if (!login.ok()) throw new Error(`${viewport.name}: local admin login HTTP ${login.status()}`);
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? "failed"}`));
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_200);
    await page.waitForFunction(() => Boolean(document.querySelector('[data-preview-media="image"]')), null, { timeout: 10_000 }).catch(() => {});
    const verification = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { top: Number(box.top.toFixed(1)), bottom: Number(box.bottom.toFixed(1)), height: Number(box.height.toFixed(1)), width: Number(box.width.toFixed(1)) };
      };
      const bodyText = document.body.innerText;
      const visual = document.querySelector('[data-drawing-detail-section="dev079-primary-visual"]');
      const previewTabs = document.querySelector('.dev079-workspace-preview-tabs');
      const selectedTab = previewTabs?.querySelector('[role="tab"][aria-selected="true"]');
      const previewFrame = visual?.querySelector('.drawing-preview-frame:not(.placeholder-frame)');
      const previewImage = visual?.querySelector('[data-preview-media="image"]');
      const frameRect = previewFrame?.getBoundingClientRect();
      const imageRect = previewImage?.getBoundingClientRect();
      const imageCentered = Boolean(frameRect && imageRect)
        && Math.abs((imageRect.left + imageRect.width / 2) - (frameRect.left + frameRect.width / 2)) <= 2
        && Math.abs((imageRect.top + imageRect.height / 2) - (frameRect.top + frameRect.height / 2)) <= 2;
      const previewHeader = visual?.querySelector('.drawing-preview-board-header');
      const candidateHeader = document.querySelector('.candidate-revision-card > header');
      const taskTabs = document.querySelector('.dev079-task-tabs');
      const candidateLabel = document.querySelector('.candidate-revision-header-info strong');
      const tabText = selectedTab?.textContent?.replace(/\s+/gu, " ").trim() ?? "";
      const gap = (from, to) => from && to ? Number(Math.max(0, from.top - to.bottom).toFixed(1)) : null;
      return {
        heading: document.querySelector("h1")?.textContent?.trim() ?? "",
        selectedTab: tabText,
        inlineFileName: /A0002-M01\.SLDDRW/iu.test(tabText),
        previewHeaderPresent: Boolean(previewHeader),
        previewCountPresent: Boolean(previewHeader?.querySelector("strong")),
        duplicateDrawingLabelPresent: Boolean(candidateLabel && /A0002-M01/iu.test(candidateLabel.textContent ?? "")),
        previewFooterFileNamePresent: Boolean(document.querySelector('.dev079-primary-visual .drawing-preview-footer strong')),
        controlledFileMetaPresent: Boolean(document.querySelector('.dev079-workspace-editor .numbering-submission-result-file-meta')),
        previewFrame: rect('.drawing-preview-frame:not(.placeholder-frame)'),
        previewImage: rect('[data-preview-media="image"]'),
        previewImageCentered: imageCentered,
        previewImageWidthRatio: frameRect && imageRect ? Number((imageRect.width / frameRect.width).toFixed(3)) : null,
        previewImageHeightRatio: frameRect && imageRect ? Number((imageRect.height / frameRect.height).toFixed(3)) : null,
        previewTabsPresent: Boolean(previewTabs),
        previewTabCount: previewTabs?.querySelectorAll('[role="tab"]').length ?? 0,
        previewTabSelectedCount: previewTabs?.querySelectorAll('[role="tab"][aria-selected="true"]').length ?? 0,
        tabs: rect('.dev079-workspace-preview-tabs'),
        taskTabs: rect('.dev079-task-tabs'),
        candidateHeader: rect('.candidate-revision-card > header'),
        previewTabsAboveFrame: Boolean(previewTabs && frameRect && previewTabs.getBoundingClientRect().bottom <= frameRect.top + 2),
        taskToCandidateGap: gap(candidateHeader ? { top: candidateHeader.getBoundingClientRect().top } : null, taskTabs?.getBoundingClientRect() ?? null),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        visibleError: Boolean(document.querySelector('[role="alert"]')),
        processingTextAbsent: !bodyText.includes("預覽產生中")
      };
    });
    const passed = response?.status() < 400
      && verification.heading.includes("A0002-M01")
      && verification.inlineFileName
      && !verification.previewHeaderPresent
      && !verification.previewCountPresent
      && !verification.duplicateDrawingLabelPresent
      && !verification.previewFooterFileNamePresent
      && !verification.controlledFileMetaPresent
      && Boolean(verification.previewFrame)
      && Boolean(verification.previewImage)
      && verification.previewImageCentered
      && verification.previewImageWidthRatio >= 0.95
      && verification.previewImageHeightRatio >= 0.95
      && verification.previewTabsPresent
      && verification.previewTabCount === 2
      && verification.previewTabSelectedCount === 1
      && verification.previewTabsAboveFrame
      && verification.taskToCandidateGap <= 4
      && verification.horizontalOverflow <= 2
      && !verification.visibleError
      && verification.processingTextAbsent
      && consoleErrors.length === 0
      && failedRequests.length === 0;
    const screenshot = path.join(outputDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({ viewport, httpStatus: response?.status() ?? null, passed, verification, consoleErrors, failedRequests, screenshot: path.relative(root, screenshot) });
    await context.close();
    if (!passed) throw new Error(`${viewport.name} layout verification failed: ${JSON.stringify(results.at(-1))}`);
  }
} finally {
  await browser.close();
  await isolatedRuntime?.stop();
}

const status = results.every((result) => result.passed) ? "PASS" : "FAIL";
fs.writeFileSync(path.join(outputDir, "browser-verification.json"), `${JSON.stringify({ baseUrl, route, status, results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status, outputDir, results }, null, 2));
