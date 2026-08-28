#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startDev079IsolatedRuntime } from "./qc-dev-079-isolated-runtime.mjs";

const root = process.cwd();
const ownsRuntime = !process.env.PDM_BASE_URL;
let baseUrl = process.env.PDM_BASE_URL ?? "";
let drawingId = process.env.PDM_DEV_079_DRAWING_ID ?? "";
let workId = process.env.PDM_DEV_079_WORK_ID ?? "";
let drawingNumber = process.env.PDM_DEV_079_DRAWING_NUMBER ?? "";
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
  drawingId = isolatedRuntime.drawingId;
  workId = isolatedRuntime.workId;
  drawingNumber = isolatedRuntime.drawingNumber;
}
if (!drawingId || !workId || !drawingNumber) throw new Error("DEV-079 canonical drawingId/workId/drawingNumber are required");
const route = `/numbering/drawings/${encodeURIComponent(drawingId)}/workspace?workId=${encodeURIComponent(workId)}&returnTo=%2Fnumbering%2Fdrawings`;
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
    const expectedCancellations = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("requestfailed", (request) => {
      const requestUrl = request.url();
      const failure = request.failure()?.errorText ?? "failed";
      let pathname = "";
      try { pathname = new URL(requestUrl).pathname; } catch {}
      const isExpectedCancellation = failure === "net::ERR_ABORTED"
        && request.method() === "GET"
        && (requestUrl.startsWith("blob:")
          || pathname === `/api/numbering/drawings/${drawingId}/work`
          || pathname === `/api/pdm/drawing-revision-works/${workId}`
          || pathname === `/api/numbering/drawings/${drawingNumber}/recognition-session`
          || pathname === `/api/drawing-recognition/drawing_revision/${isolatedRuntime?.revisionId ?? ""}`);
      (isExpectedCancellation ? expectedCancellations : failedRequests).push(`${requestUrl} ${failure}`);
    });
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('.dev079-workspace-grid', { timeout: 30_000 });
    await page.waitForFunction((targetDrawingNumber) => {
      const heading = document.querySelector("h1")?.textContent?.trim();
      const fileCount = document.querySelectorAll('.dev079-workspace-file-list li').length;
      const headingCount = document.querySelectorAll('.dev079-unified-task-heading').length;
      const previewReady = Boolean(document.querySelector('[data-pdf-page-state="ready"], [data-preview-media="image"], [data-preview-media="document"]'));
      return heading === targetDrawingNumber && fileCount === 3 && headingCount === 3 && previewReady;
    }, drawingNumber, { timeout: 30_000 });
    await page.waitForTimeout(500);
    const verification = await page.evaluate(({ targetDrawingNumber, viewportWidth }) => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: Number(box.left.toFixed(1)), right: Number(box.right.toFixed(1)), top: Number(box.top.toFixed(1)), bottom: Number(box.bottom.toFixed(1)), height: Number(box.height.toFixed(1)), width: Number(box.width.toFixed(1)) };
      };
      const bodyText = document.body.innerText;
      const visual = document.querySelector('.dev079-workspace-visual');
      const detail = document.querySelector('.dev079-workspace-detail');
      const previewTabs = visual?.querySelector('.drawing-preview-tabs');
      const selectedTab = previewTabs?.querySelector('[role="tab"][aria-selected="true"]');
      const previewFrame = visual?.querySelector('.drawing-preview-frame:not(.placeholder-frame)');
      const previewMedia = visual?.querySelector('[data-pdf-page-state="ready"] canvas, [data-preview-media="image"], [data-preview-media="document"]');
      const frameRect = previewFrame?.getBoundingClientRect();
      const mediaRect = previewMedia?.getBoundingClientRect();
      const mediaWithinFrame = Boolean(frameRect && mediaRect)
        && mediaRect.left >= frameRect.left - 2
        && mediaRect.right <= frameRect.right + 2
        && mediaRect.top >= frameRect.top - 2
        && mediaRect.bottom <= frameRect.bottom + 2;
      const previewHeader = visual?.querySelector('.drawing-preview-board-header');
      const tabText = selectedTab?.textContent?.replace(/\s+/gu, " ").trim() ?? "";
      const taskContent = document.querySelector('.dev079-unified-task-content');
      const footer = document.querySelector('.dev079-workspace-footer');
      const headingTexts = [...document.querySelectorAll('.dev079-unified-task-heading')].map((element) => element.textContent?.replace(/\s+/gu, " ").trim() ?? "");
      const headingTops = [...document.querySelectorAll('.dev079-unified-task-heading')].map((element) => element.getBoundingClientRect().top);
      const fileNames = [...document.querySelectorAll('.dev079-workspace-file-list strong')].map((element) => element.textContent?.trim() ?? "");
      const visualRect = visual?.getBoundingClientRect();
      const detailRect = detail?.getBoundingClientRect();
      const contentRect = taskContent?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const desktopLayout = viewportWidth > 900;
      return {
        heading: document.querySelector("h1")?.textContent?.trim() ?? "",
        layerLabel: document.querySelector('.canonical-layer.is-rd')?.textContent?.replace(/\s+/gu, " ").trim() ?? "",
        selectedTab: tabText,
        inlineFileName: tabText.includes(targetDrawingNumber),
        previewHeaderPresent: Boolean(previewHeader),
        previewCountPresent: Boolean(previewHeader?.querySelector("strong")),
        legacyCandidatePresent: Boolean(document.querySelector('.candidate-revision-card, .candidate-revision-header-info')),
        legacyTaskTabsPresent: Boolean(document.querySelector('.dev079-task-tabs')),
        legacyResizerPresent: Boolean(document.querySelector('.dev079-workspace-resizer')),
        previewFooterFileNamePresent: Boolean(visual?.querySelector('.drawing-preview-footer strong')),
        controlledFileMetaPresent: Boolean(document.querySelector('.dev079-workspace-editor .numbering-submission-result-file-meta')),
        previewFrame: rect('.drawing-preview-frame:not(.placeholder-frame)'),
        previewMedia: mediaRect ? { width: Number(mediaRect.width.toFixed(1)), height: Number(mediaRect.height.toFixed(1)) } : null,
        previewMediaWithinFrame: mediaWithinFrame,
        previewTabsPresent: Boolean(previewTabs),
        previewTabCount: previewTabs?.querySelectorAll('[role="tab"]').length ?? 0,
        previewTabSelectedCount: previewTabs?.querySelectorAll('[role="tab"][aria-selected="true"]').length ?? 0,
        previewTabsAboveFrame: Boolean(previewTabs && frameRect && previewTabs.getBoundingClientRect().bottom <= frameRect.top + 2),
        headingTexts,
        headingOrderValid: headingTops.every((top, index) => index === 0 || headingTops[index - 1] < top),
        fileNames,
        fileRolesComplete: fileNames.length === 3 && fileNames.some((name) => /\.pdf$/iu.test(name)) && fileNames.some((name) => /\.slddrw$/iu.test(name)) && fileNames.some((name) => /\.(sldprt|sldasm)$/iu.test(name)),
        taskContentOverflowY: taskContent ? getComputedStyle(taskContent).overflowY : null,
        desktopLayout,
        twoColumnOrderValid: desktopLayout ? Boolean(visualRect && detailRect && visualRect.right <= detailRect.left + 2) : null,
        stackedOrderValid: !desktopLayout ? Boolean(visualRect && detailRect && visualRect.bottom <= detailRect.top + 2) : null,
        footerInsideDetail: Boolean(detail && footer && detail.contains(footer)),
        footerAfterContent: Boolean(contentRect && footerRect && contentRect.bottom <= footerRect.top + 2),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        visibleError: Boolean(document.querySelector('[role="alert"]')),
        processingTextAbsent: !bodyText.includes("預覽產生中")
      };
    }, { targetDrawingNumber: drawingNumber, viewportWidth: viewport.width });
    const passed = response?.status() < 400
      && verification.heading === drawingNumber
      && verification.layerLabel === "研發版 0.1"
      && verification.inlineFileName
      && !verification.previewHeaderPresent
      && !verification.previewCountPresent
      && !verification.legacyCandidatePresent
      && !verification.legacyTaskTabsPresent
      && !verification.legacyResizerPresent
      && !verification.previewFooterFileNamePresent
      && !verification.controlledFileMetaPresent
      && Boolean(verification.previewFrame)
      && Boolean(verification.previewMedia)
      && verification.previewMedia.width > 40
      && verification.previewMedia.height > 40
      && verification.previewMediaWithinFrame
      && verification.previewTabsPresent
      && verification.previewTabCount === 2
      && verification.previewTabSelectedCount === 1
      && verification.previewTabsAboveFrame
      && verification.headingTexts.length === 3
      && verification.headingTexts[0] === "版次與檔案"
      && /^(FFF／變更影響|關聯料號)$/u.test(verification.headingTexts[1])
      && verification.headingTexts[2] === "智慧辨識"
      && verification.headingOrderValid
      && verification.fileRolesComplete
      && (verification.desktopLayout ? ["auto", "scroll"].includes(verification.taskContentOverflowY) : verification.taskContentOverflowY === "visible")
      && (verification.desktopLayout ? verification.twoColumnOrderValid : verification.stackedOrderValid)
      && verification.footerInsideDetail
      && verification.footerAfterContent
      && verification.horizontalOverflow <= 2
      && !verification.visibleError
      && verification.processingTextAbsent
      && consoleErrors.length === 0
      && failedRequests.length === 0;
    const screenshot = path.join(outputDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({ viewport, httpStatus: response?.status() ?? null, passed, verification, consoleErrors, failedRequests, expectedCancellations, screenshot: path.relative(root, screenshot) });
    await context.close();
    if (!passed) throw new Error(`${viewport.name} layout verification failed: ${JSON.stringify(results.at(-1))}`);
  }
} finally {
  await browser.close();
  await isolatedRuntime?.stop();
}

const status = results.every((result) => result.passed) ? "PASS" : "FAIL";
fs.writeFileSync(path.join(outputDir, "browser-verification.json"), `${JSON.stringify({ baseUrl, route, drawingId, workId, drawingNumber, status, runtimeReceipt: isolatedRuntime?.runtimeReceipt ?? null, results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status, outputDir, results }, null, 2));
