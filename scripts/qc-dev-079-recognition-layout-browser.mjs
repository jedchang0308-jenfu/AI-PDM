#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startDev079IsolatedRuntime } from "./qc-dev-079-isolated-runtime.mjs";

const root = process.cwd();
const ownsRuntime = !process.env.PDM_BASE_URL;
let drawingId = process.env.PDM_DEV_079_DRAWING_ID ?? "";
let workId = process.env.PDM_DEV_079_WORK_ID ?? "";
let drawingNumber = process.env.PDM_DEV_079_DRAWING_NUMBER ?? "";
let recognitionSessionId = process.env.PDM_DEV_079_RECOGNITION_SESSION_ID ?? "";
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "phone", width: 390, height: 844 }
].filter((viewport) => !process.env.PDM_DEV_079_VIEWPORT || process.env.PDM_DEV_079_VIEWPORT === viewport.name);
const runId = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const outputDir = path.resolve(root, "output", "qa", "dev-079-recognition-layout", `${runId}-browser`);
fs.mkdirSync(outputDir, { recursive: true });

let baseUrl = process.env.PDM_BASE_URL ?? "";
let isolatedRuntime = null;
const browser = await chromium.launch({ headless: true });
const results = [];

async function prepareA0002Successor() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const login = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "R&D Manager" } });
    if (!login.ok()) throw new Error(`A0002 setup login HTTP ${login.status()}`);
    const latestResponse = await context.request.get(`${baseUrl}/api/numbering/drawings/${encodeURIComponent(drawingNumber)}/recognition-session`, { failOnStatusCode: false });
    if (!latestResponse.ok()) throw new Error(`A0002 latest recognition HTTP ${latestResponse.status()}`);
    const latestBody = await latestResponse.json();
    const sessionId = latestBody.session?.id ?? recognitionSessionId;
    if (!sessionId) throw new Error("A0002 current recognition session is unavailable");
    const projectionResponse = await context.request.get(`${baseUrl}/api/numbering/recognition-sessions/${encodeURIComponent(sessionId)}`, { failOnStatusCode: false });
    const projectionBody = await projectionResponse.json();
    const hasLocatablePdf = (projectionBody.session?.reviewGroups ?? []).some((group) => (group.fieldKey === "revision" || group.fieldLabel === "版次")
      && (group.observations ?? []).some((observation) => /.pdf$/iu.test(observation.sourceFileName ?? "") && observation.geometry?.coordinateSpace === "normalized_page" && observation.geometry?.origin === "top_left"));
    if (projectionBody.session?.status !== "review_ready" || !hasLocatablePdf) throw new Error(`A0002 current review-ready locatable PDF evidence is unavailable:${JSON.stringify({ sessionId, status: projectionBody.session?.status, hasLocatablePdf })}`);
    return { sessionId, status: projectionBody.session?.status ?? "unknown" };
  } finally {
    await context.close();
  }
}

if (ownsRuntime) {
  isolatedRuntime = await startDev079IsolatedRuntime();
  baseUrl = isolatedRuntime.baseUrl;
  drawingId = isolatedRuntime.drawingId;
  workId = isolatedRuntime.workId;
  drawingNumber = isolatedRuntime.drawingNumber;
  recognitionSessionId = isolatedRuntime.recognitionSessionId;
}
if (!drawingId || !workId || !drawingNumber) throw new Error("DEV-079 canonical drawingId/workId/drawingNumber are required");
const route = `/numbering/drawings/${encodeURIComponent(drawingId)}/workspace?workId=${encodeURIComponent(workId)}&returnTo=%2Fnumbering%2Fdrawings`;
try {
  const successor = await prepareA0002Successor();
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const login = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "R&D Manager" } });
    if (!login.ok()) throw new Error(`${viewport.name}: local admin login HTTP ${login.status()}`);
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    const expectedPreviewCancellations = [];
    const expectedNavigationCancellations = [];
    const recognitionResponses = [];
    const workbenchResponses = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "failed";
      const requestUrl = request.url();
      let pathname = "";
      try { pathname = new URL(requestUrl).pathname; } catch {}
      if (requestUrl.startsWith("blob:") && failure === "net::ERR_ABORTED") expectedPreviewCancellations.push(`${requestUrl} ${failure}`);
      else if (requestUrl.includes("_rsc=") && failure === "net::ERR_ABORTED") expectedNavigationCancellations.push(`${requestUrl} ${failure}`);
      else if (failure === "net::ERR_ABORTED" && request.method() === "GET" && [
        `/api/pdm/drawing-revision-works/${workId}`,
        `/api/numbering/drawings/${drawingNumber}/recognition-session`
      ].includes(pathname)) expectedNavigationCancellations.push(`${requestUrl} ${failure}`);
      else failedRequests.push(`${request.url()} ${failure}`);
    });
    page.on("response", async (response) => {
      const isRecognition = response.url().includes("recognition");
      const isWorkbench = response.url().includes("/api/numbering/drawings/workbench/");
      if (!isRecognition && !isWorkbench) return;
      const body = await response.text().catch(() => "");
      let summary = null;
      try {
        const parsed = JSON.parse(body);
        const session = parsed.session;
        summary = session ? { id: session.id, status: session.status, sourceContextType: session.sourceContextType, sourceContextId: session.sourceContextId, sourceAssetIds: session.sourceAssetIds, candidates: session.candidates?.length ?? null, candidateFields: session.candidates?.map((item) => `${item.category}:${item.fieldKey}`), reviewGroups: session.reviewGroups?.length ?? null, reviewGroupFields: session.reviewGroups?.map((item) => `${item.category}:${item.fieldKey}:${item.primaryCandidateId}`), pdfOcrSources: session.pdfOcrSources?.length ?? null, pendingClientAdapters: session.pendingClientAdapters?.length ?? null } : parsed;
      } catch { summary = body.slice(0, 800); }
      if (isRecognition) recognitionResponses.push({ url: response.url(), status: response.status(), summary });
      if (response.url().includes("/api/numbering/drawings/workbench/")) {
        try {
          const parsed = JSON.parse(body);
          workbenchResponses.push({ status: response.status(), candidate: parsed.candidate ? { id: parsed.candidate.id, lifecycleStatus: parsed.candidate.lifecycleStatus, ownerId: parsed.candidate.ownerId, capabilities: parsed.candidate.capabilities, lifecycleV2: parsed.candidate.lifecycleV2 } : null, capabilities: parsed.capabilities, error: parsed.error });
        } catch { workbenchResponses.push({ status: response.status(), body: body.slice(0, 800) }); }
      }
    });
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    await page.waitForSelector('.dev079-workspace, .dev079-workspace-state', { timeout: 30_000 });
    await page.waitForSelector('#dev079-recognition-heading', { timeout: 30_000 });
    try {
      await page.waitForSelector('.dev079-recognition-candidate input[aria-label*="版次"]', { timeout: 30_000 });
    } catch (error) {
      throw new Error(`${viewport.name}: 版次 candidate input missing; body=${(await page.locator("body").innerText()).slice(0, 4_000)}; recognition=${JSON.stringify(recognitionResponses)}; cause=${error instanceof Error ? error.message : String(error)}`);
    }
    const firstCandidateInput = page.locator('.dev079-recognition-candidate input[aria-label*="版次"]').first();
    await firstCandidateInput.focus();
    await page.waitForTimeout(180);
    const originalValue = await firstCandidateInput.inputValue();
    if (await firstCandidateInput.isEditable() === false) throw new Error(`${viewport.name}: candidate input is readonly; workbench=${JSON.stringify(workbenchResponses)}; body=${(await page.locator("body").innerText()).slice(0, 2_000)}`);
    await firstCandidateInput.fill(`${originalValue} ${viewport.name}`.trim());
    await page.waitForTimeout(120);
    await page.waitForFunction(() => [...document.querySelectorAll('.dev079-recognition-evidence-source')].some((button) => button.textContent?.trim() === 'PDF圖面'), null, { timeout: 30_000 });
    const materialCard = page.locator('.dev079-recognition-candidate[data-recognition-field-key="material"]');
    const pdfEvidenceButton = materialCard.getByRole("button", { name: "PDF圖面", exact: true }).first();
    const cadEvidenceButton = materialCard.getByRole("button", { name: "檔案屬性", exact: true }).first();
    if (await pdfEvidenceButton.count() < 1 || await cadEvidenceButton.count() < 1) throw new Error(`${viewport.name}: explicit PDF/CAD evidence controls missing`);
    const originalPreview = await page.evaluate(() => ({
      activeTabText: document.querySelector('.dev079-workspace-preview-tabs [role="tab"][aria-selected="true"], .drawing-preview-tabs [role="tab"][aria-selected="true"]')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      mediaKind: document.querySelector('[data-preview-media]')?.getAttribute('data-preview-media') ?? '',
      mediaSrc: document.querySelector('[data-preview-media]')?.getAttribute('src') ?? document.querySelector('[data-preview-media]')?.getAttribute('href') ?? ''
    }));
    await pdfEvidenceButton.click();
    try {
      await page.waitForSelector('[data-pdf-page-state="ready"] .dev079-evidence-highlighter', { timeout: 30_000 });
      await page.waitForSelector('[data-magnifier-state="ready"]', { timeout: 30_000 });
    } catch (error) {
      const states = await page.locator('[data-pdf-page-state], [data-magnifier-state]').evaluateAll((nodes) => nodes.map((node) => ({ page: node.getAttribute('data-pdf-page-state'), magnifier: node.getAttribute('data-magnifier-state'), text: node.textContent })));
      throw new Error(`${viewport.name}: PDF evidence did not reach ready; body=${(await page.locator("body").innerText()).slice(0, 4_000)}; states=${JSON.stringify(states)}; failed=${JSON.stringify(failedRequests)}; console=${JSON.stringify(consoleErrors)}; cause=${error instanceof Error ? error.message : String(error)}`);
    }
    const pdfEvidence = await page.evaluate(() => {
      const highlightElement = document.querySelector('.dev079-evidence-highlighter');
      const highlight = highlightElement?.getBoundingClientRect();
      const magnifier = document.querySelector('.dev079-evidence-magnifier')?.getBoundingClientRect();
      const magnifierCanvas = document.querySelector('.dev079-evidence-magnifier canvas');
      const paper = document.querySelector('.drawing-preview-pdf-page')?.getBoundingClientRect();
      const frame = document.querySelector('.drawing-preview-frame')?.getBoundingClientRect();
      const normalizedHighlight = highlight && paper && paper.width > 0 && paper.height > 0 ? {
        x: (highlight.left - paper.left) / paper.width,
        y: (highlight.top - paper.top) / paper.height,
        width: highlight.width / paper.width,
        height: highlight.height / paper.height
      } : null;
      const intersects = Boolean(highlight && magnifier
        && highlight.left < magnifier.right
        && highlight.right > magnifier.left
        && highlight.top < magnifier.bottom
        && highlight.bottom > magnifier.top);
      let magnifierNonWhitePixels = 0;
      if (magnifierCanvas instanceof HTMLCanvasElement) {
        const context = magnifierCanvas.getContext('2d');
        const pixels = context?.getImageData(0, 0, magnifierCanvas.width, magnifierCanvas.height).data;
        if (pixels) {
          for (let index = 0; index < pixels.length; index += 16) {
            if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) magnifierNonWhitePixels += 1;
          }
        }
      }
      const highlightStyle = highlightElement ? window.getComputedStyle(highlightElement) : null;
      const magnifierElement = document.querySelector('.dev079-evidence-magnifier');
      const magnifierViewport = document.querySelector('.dev079-evidence-magnifier-viewport');
      const magnifierStyle = magnifierViewport ? window.getComputedStyle(magnifierViewport) : null;
      const materialCard = document.querySelector('.dev079-recognition-candidate[data-recognition-field-key="material"]');
      const materialInputValue = materialCard?.querySelector('input')?.value ?? '';
      return {
        highlightPresent: Boolean(highlight),
        highlightMarkerKind: highlightElement?.getAttribute('data-evidence-marker') ?? '',
        highlightBackgroundImage: highlightStyle?.backgroundImage ?? '',
        highlightBorderWidth: highlightStyle?.borderTopWidth ?? '',
        highlightOutlineWidth: highlightStyle?.outlineWidth ?? '',
        magnifierPresent: Boolean(magnifier),
        magnifierState: document.querySelector('.dev079-evidence-magnifier')?.getAttribute('data-magnifier-state') ?? '',
        magnifierResolutionMode: magnifierElement?.getAttribute('data-resolution-mode') ?? '',
        magnifierCoverageRatio: Number(magnifierElement?.getAttribute('data-coverage-ratio') ?? 0),
        magnifierEffectiveZoom: Number(magnifierElement?.getAttribute('data-effective-zoom') ?? 0),
        magnifierBackingScale: Number(magnifierElement?.getAttribute('data-backing-scale') ?? 0),
        magnifierTargetRect: magnifierElement?.getAttribute('data-target-rect') ?? '',
        magnifierCropRect: magnifierElement?.getAttribute('data-crop-rect') ?? '',
        magnifierCacheState: magnifierElement?.getAttribute('data-cache-state') ?? '',
        magnifierLruSize: Number(magnifierElement?.getAttribute('data-lru-size') ?? 0),
        magnifierRenderElapsedMs: Number(magnifierElement?.getAttribute('data-render-elapsed-ms') ?? 0),
        magnifierRingBorder: magnifierStyle?.borderTop ?? '',
        magnifierPseudoHandleDisplay: window.getComputedStyle(magnifierElement, '::after').display,
        magnifierCanvasWidth: magnifierCanvas instanceof HTMLCanvasElement ? magnifierCanvas.width : 0,
        magnifierCanvasHeight: magnifierCanvas instanceof HTMLCanvasElement ? magnifierCanvas.height : 0,
        magnifierNonWhitePixels,
        caption: document.querySelector('.dev079-evidence-caption')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        renderedMode: document.querySelector('[data-preview-rendered-mode]')?.getAttribute('data-preview-rendered-mode') ?? '',
        pdfPageState: document.querySelector('[data-pdf-page-state]')?.getAttribute('data-pdf-page-state') ?? '',
        pdfPageRendererCount: document.querySelectorAll('[data-pdf-page-state]').length,
        documentViewerCount: document.querySelectorAll('[data-preview-media="document"]').length,
        previewLinkTarget: document.querySelector('a.drawing-preview-media-link[data-preview-rendered-mode="document"]')?.getAttribute('target') ?? '',
        previewSurfaceCount: document.querySelectorAll('[data-component="canonical-preview-panel"]').length,
        previewTabCount: document.querySelectorAll('.drawing-preview-tabs [role="tab"], .dev079-workspace-preview-tabs [role="tab"]').length,
        pdfTabCount: [...document.querySelectorAll('.drawing-preview-tabs [role="tab"], .dev079-workspace-preview-tabs [role="tab"]')].filter((tab) => /^pdf\b/iu.test((tab.textContent ?? '').trim())).length,
        secondPreviewViewerCount: document.querySelectorAll('[data-preview-media="document"], [data-pdf-page-state]').length,
        highlightWithinRenderedPage: Boolean(highlight && paper && highlight.left >= paper.left - 1 && highlight.top >= paper.top - 1 && highlight.right <= paper.right + 1 && highlight.bottom <= paper.bottom + 1),
        magnifierWithinRenderedPage: Boolean(magnifier && paper && magnifier.left >= paper.left - 1 && magnifier.top >= paper.top - 1 && magnifier.right <= paper.right + 1 && magnifier.bottom <= paper.bottom + 1),
        magnifierOverlapsHighlight: intersects,
        renderedPageWithinFrame: Boolean(paper && frame && paper.left >= frame.left && paper.top >= frame.top && paper.right <= frame.right && paper.bottom <= frame.bottom),
        normalizedHighlight,
        materialEvidenceText: `${materialCard?.textContent?.replace(/\s+/gu, ' ').trim() ?? ''} ${materialInputValue}`.trim()
      };
    });
    const pdfPreviewLink = page.locator('a.drawing-preview-media-link[data-preview-rendered-mode="document"]');
    const openedPreviewPagePromise = context.waitForEvent("page", { timeout: 5_000 }).catch(() => null);
    await pdfPreviewLink.click();
    const openedPreviewPage = await openedPreviewPagePromise;
    if (openedPreviewPage) {
      await openedPreviewPage.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
      await openedPreviewPage.close();
    }
    pdfEvidence.clickedPreviewOpenedNewTab = Boolean(openedPreviewPage);
    const evidenceScreenshot = path.join(outputDir, `${viewport.name}-pdf-evidence.png`);
    await page.screenshot({ path: evidenceScreenshot, fullPage: true });
    await cadEvidenceButton.click();
    await page.waitForFunction(() => Boolean(document.querySelector('.dev079-evidence-flash')?.textContent?.includes('A0002.SLDPRT')), null, { timeout: 5_000 });
    const cadEvidence = await page.evaluate(() => ({
      flash: document.querySelector('.dev079-evidence-flash')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      highlightPresent: Boolean(document.querySelector('.dev079-evidence-highlighter')),
      magnifierPresent: Boolean(document.querySelector('.dev079-evidence-magnifier')),
      documentViewerCount: document.querySelectorAll('[data-preview-media="document"]').length
    }));
    await pdfEvidenceButton.click();
    await page.waitForSelector('[data-pdf-page-state="ready"] .dev079-evidence-highlighter', { timeout: 30_000 });
    await page.waitForSelector('[data-magnifier-state="ready"]', { timeout: 30_000 });
    const focusedEvidence = await page.evaluate(() => ({
      highlightPresent: Boolean(document.querySelector('.dev079-evidence-highlighter')),
      magnifierPresent: Boolean(document.querySelector('.dev079-evidence-magnifier')),
      caption: document.querySelector('.dev079-evidence-caption')?.textContent?.replace(/\s+/gu, ' ').trim() ?? ''
    }));
    const returnToOriginalButtonPresent = await page.getByRole("button", { name: "返回原圖面" }).count() > 0;
    await page.getByRole("tab", { name: /3D 模型/u }).click();
    await page.getByRole("tab", { name: /2D 圖面/u }).click();
    await page.waitForTimeout(100);
    const restoredEvidence = await page.evaluate(() => ({
      highlightPresent: Boolean(document.querySelector('.dev079-evidence-highlighter')),
      magnifierPresent: Boolean(document.querySelector('.dev079-evidence-magnifier')),
      flashPresent: Boolean(document.querySelector('.dev079-evidence-flash')),
        activeTabText: document.querySelector('.dev079-workspace-preview-tabs [role="tab"][aria-selected="true"], .drawing-preview-tabs [role="tab"][aria-selected="true"]')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      mediaKind: document.querySelector('[data-preview-media]')?.getAttribute('data-preview-media') ?? '',
      mediaSrc: document.querySelector('[data-preview-media]')?.getAttribute('src') ?? document.querySelector('[data-preview-media]')?.getAttribute('href') ?? ''
    }));
    const evidencePreview = {
      successorSessionId: successor.sessionId,
      successorStatus: successor.status,
      pdfEvidence,
      cadEvidence,
      focusedEvidence,
      returnToOriginalButtonPresent,
      restoredEvidence,
      originalPreview
    };
    const evidenceSurface = pdfEvidence;
    const guardInput = page.locator('.dev079-recognition-candidate input[aria-label*="版次"]').first();
    const guardValue = await guardInput.inputValue();
    await guardInput.fill(`${guardValue} guard`.trim());
    await page.waitForSelector('.dev079-recognition-candidate.is-modified input[aria-label*="版次"]', { timeout: 5_000 });
    let unsavedGuardMessage = "";
    page.once("dialog", async (dialog) => {
      unsavedGuardMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "返回圖號清單", exact: true }).last().click();
    await page.waitForTimeout(80);
    const verification = await page.evaluate(() => {
      const recognitionHeading = document.querySelector('#dev079-recognition-heading');
      const unifiedHeadings = [...document.querySelectorAll('.dev079-unified-task-heading')];
      const footer = document.querySelector('.dev079-workspace-footer')?.getBoundingClientRect();
      const heading = document.querySelector('.dev079-section-heading')?.getBoundingClientRect();
      const taskContent = document.querySelector('.dev079-unified-task-content')?.getBoundingClientRect();
      const preSubmit = document.querySelector('.drawing-revision-recognition-pre-submit')?.getBoundingClientRect();
      const candidateCards = [...document.querySelectorAll('.dev079-recognition-candidate')];
      const canonicalFieldKeys = candidateCards.map((card) => card.getAttribute('data-recognition-field-key')).filter(Boolean);
      const duplicateCanonicalFieldKeys = [...new Set(canonicalFieldKeys.filter((fieldKey, index) => canonicalFieldKeys.indexOf(fieldKey) !== index))];
      const candidateHelperLabelsPresent = Boolean(document.querySelector('.dev079-recognition-candidate label > span'));
      const candidateCurrentMetaPresent = Boolean(document.querySelector('.dev079-recognition-current span, .dev079-recognition-current small'));
      const candidateCurrentRowCount = document.querySelectorAll('.dev079-recognition-current').length;
      const candidateInputCount = document.querySelectorAll('.dev079-recognition-candidate input').length;
      const candidateInputWithoutAccessibleName = [...document.querySelectorAll('.dev079-recognition-candidate input')].filter((input) => !input.getAttribute('aria-label')).length;
      const candidateActionButtonCount = document.querySelectorAll('.dev079-recognition-candidate-actions button').length;
      const standaloneLocateButtonPresent = [...document.querySelectorAll('.dev079-recognition-candidate-actions button')].some((button) => button.textContent?.includes('在圖面定位'));
      const evidenceFlashText = document.querySelector('.dev079-evidence-flash')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
      const evidenceHighlighterPresent = Boolean(document.querySelector('.dev079-evidence-highlighter'));
      const evidenceMagnifierPresent = Boolean(document.querySelector('.dev079-evidence-magnifier'));
      const pdfOcrStatusPanelPresent = Boolean(document.querySelector('.drawing-pdf-ocr'));
      const recognitionScopeHelpPresent = Boolean(document.querySelector('.dev079-section-heading .status-scope-help-button'));
      const recognitionEyebrowPresent = Boolean(document.querySelector('.dev079-section-heading .eyebrow'));
      const recognitionFootnotePresent = Boolean(document.querySelector('.dev079-recognition-footnote'));
      const manualStartRecognitionPresent = [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('開始辨識'));
      const modifiedInputCount = document.querySelectorAll('.dev079-recognition-candidate.is-modified input').length;
      const modifiedIndicatorText = document.querySelector('.dev079-recognition-field-signals .is-modified')?.textContent?.trim() ?? '';
      const globalSaveButtons = [...document.querySelectorAll('.dev079-recognition-save-status .primary-button')];
      const materialCards = [...document.querySelectorAll('.dev079-recognition-candidate[data-recognition-field-key="material"]')];
      const materialCard = materialCards[0];
      const materialEvidenceLabels = materialCard ? [...materialCard.querySelectorAll('.dev079-recognition-evidence-source')].map((item) => item.textContent?.replace(/\s+/gu, ' ').trim() ?? '') : [];
      const bodyText = document.body.innerText;
      return {
        recognitionHeadingText: recognitionHeading?.textContent?.replace(/\s+/gu, " ").trim() ?? "",
        unifiedHeadingTexts: unifiedHeadings.map((item) => item.textContent?.replace(/\s+/gu, " ").trim() ?? ""),
        legacyTaskTabsPresent: Boolean(document.querySelector('.dev079-task-tabs')),
        readonlyTagPresent: Boolean(document.querySelector('.dev079-readonly-tag')),
        compactIntroPresent: Boolean(document.querySelector('.drawing-revision-recognition-pre-submit.is-compact .drawing-revision-recognition-title, .drawing-revision-recognition-pre-submit.is-compact .drawing-revision-recognition-copy p, .drawing-revision-recognition-pre-submit.is-compact .drawing-revision-recognition-copy small')),
        compactStatusChipPresent: Boolean(document.querySelector('.drawing-revision-recognition-pre-submit.is-compact .drawing-recognition-chip')),
        summaryPresent: Boolean(document.querySelector('.dev079-recognition-summary')),
        categoryHeadingsPresent: Boolean(document.querySelector('.dev079-recognition-section h3')),
        sourceRoleCards: candidateCards.filter((card) => card.textContent?.includes("來源檔案角色")).length,
        candidateCount: candidateCards.length,
        duplicateCanonicalFieldKeys,
        candidateHelperLabelsPresent,
        candidateCurrentMetaPresent,
        candidateCurrentRowCount,
        candidateInputCount,
        candidateInputWithoutAccessibleName,
        candidateActionButtonCount,
        standaloneLocateButtonPresent,
        evidenceFlashText,
        evidenceHighlighterPresent,
        evidenceMagnifierPresent,
        pdfOcrStatusPanelPresent,
        recognitionScopeHelpPresent,
        recognitionEyebrowPresent,
        recognitionFootnotePresent,
        manualStartRecognitionPresent,
        modifiedInputCount,
        modifiedIndicatorText,
        globalSaveButtonCount: globalSaveButtons.length,
        globalSaveButtonText: globalSaveButtons[0]?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        globalSaveButtonEnabled: globalSaveButtons[0] instanceof HTMLButtonElement && !globalSaveButtons[0].disabled,
        materialCardCount: materialCards.length,
        materialReviewGroupCount: Number(materialCard?.getAttribute('data-review-group-count') ?? 0),
        materialMergedCandidateCount: Number(materialCard?.querySelector('input')?.getAttribute('data-merged-candidate-count') ?? 0),
        materialScopeText: materialCard?.querySelector('.dev079-recognition-scope-summary')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        materialEvidenceLabels,
        recognitionStillVisible: Boolean(recognitionHeading && recognitionHeading.getClientRects().length > 0),
        legacyPendingReviewTextPresent: bodyText.includes("待處理"),
        headingBottom: heading?.bottom ?? null,
        preSubmitTop: preSubmit?.top ?? null,
        footerTop: footer?.top ?? null,
        footerOverlapsRecognition: Boolean(footer && taskContent && footer.top < taskContent.bottom - 2),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        visibleAlerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent?.trim()).filter(Boolean),
        processingTextAbsent: !bodyText.includes("預覽產生中")
      };
    });
    verification.unsavedGuardMessage = unsavedGuardMessage;
    const passed = response?.status() < 400
      && verification.recognitionHeadingText === "智慧辨識"
      && verification.unifiedHeadingTexts.length === 3
      && verification.unifiedHeadingTexts[0].startsWith("版次與檔案")
      && /^(FFF／變更影響|關聯料號)$/u.test(verification.unifiedHeadingTexts[1])
      && verification.unifiedHeadingTexts[2] === "智慧辨識"
      && !verification.legacyTaskTabsPresent
      && !verification.readonlyTagPresent
      && !verification.compactIntroPresent
      && !verification.compactStatusChipPresent
      && !verification.summaryPresent
      && !verification.categoryHeadingsPresent
      && verification.sourceRoleCards === 0
      && verification.candidateCount > 0
      && verification.duplicateCanonicalFieldKeys.length === 0
      && !verification.candidateHelperLabelsPresent
      && !verification.candidateCurrentMetaPresent
      && verification.candidateInputCount === verification.candidateCount
      && verification.candidateInputWithoutAccessibleName === 0
      && verification.candidateActionButtonCount === 0
      && !verification.standaloneLocateButtonPresent
      && !verification.pdfOcrStatusPanelPresent
      && !verification.recognitionScopeHelpPresent
      && !verification.recognitionEyebrowPresent
      && !verification.recognitionFootnotePresent
      && !verification.manualStartRecognitionPresent
      && evidencePreview.pdfEvidence.highlightPresent
      && evidencePreview.pdfEvidence.highlightMarkerKind === "highlighter"
      && evidencePreview.pdfEvidence.highlightBackgroundImage.includes("linear-gradient")
      && evidencePreview.pdfEvidence.highlightBorderWidth === "0px"
      && evidencePreview.pdfEvidence.highlightOutlineWidth === "0px"
      && evidencePreview.pdfEvidence.magnifierPresent
      && evidencePreview.pdfEvidence.magnifierState === "ready"
      && evidencePreview.pdfEvidence.magnifierResolutionMode === "pdf_high_res_crop"
      && evidencePreview.pdfEvidence.magnifierCoverageRatio >= 1
      && evidencePreview.pdfEvidence.magnifierBackingScale >= 2.5
      && evidencePreview.pdfEvidence.magnifierBackingScale <= 3
      && evidencePreview.pdfEvidence.magnifierTargetRect.length > 0
      && evidencePreview.pdfEvidence.magnifierCropRect.length > 0
      && evidencePreview.pdfEvidence.magnifierLruSize >= 1
      && evidencePreview.pdfEvidence.magnifierRenderElapsedMs <= 150
      && evidencePreview.pdfEvidence.magnifierRingBorder.includes("rgb(241, 204, 20)")
      && evidencePreview.pdfEvidence.magnifierPseudoHandleDisplay === "none"
      && evidencePreview.pdfEvidence.magnifierCanvasWidth > 0
      && evidencePreview.pdfEvidence.magnifierCanvasHeight > 0
      && evidencePreview.pdfEvidence.magnifierNonWhitePixels > 100
      && evidencePreview.pdfEvidence.caption === ""
      && evidencePreview.pdfEvidence.previewLinkTarget === "_blank"
      && evidencePreview.pdfEvidence.clickedPreviewOpenedNewTab
      && evidencePreview.pdfEvidence.renderedMode === "document"
      && evidencePreview.pdfEvidence.pdfPageState === "ready"
      && evidencePreview.pdfEvidence.pdfPageRendererCount === 1
      && evidencePreview.pdfEvidence.documentViewerCount === 0
      && evidencePreview.pdfEvidence.highlightWithinRenderedPage
      && evidencePreview.pdfEvidence.magnifierWithinRenderedPage
      && !evidencePreview.pdfEvidence.magnifierOverlapsHighlight
      && evidencePreview.pdfEvidence.renderedPageWithinFrame
      && evidencePreview.pdfEvidence.normalizedHighlight?.x > 0
      && evidencePreview.pdfEvidence.normalizedHighlight?.x < 1
      && evidencePreview.pdfEvidence.normalizedHighlight?.y > 0
      && evidencePreview.pdfEvidence.normalizedHighlight?.y < 1
      && evidencePreview.pdfEvidence.materialEvidenceText.includes("不鏽鋼SUS304")
      && evidencePreview.cadEvidence.flash.includes("A0002.SLDPRT")
      && evidencePreview.cadEvidence.flash.includes("檔案屬性")
      && !evidencePreview.cadEvidence.highlightPresent
      && !evidencePreview.cadEvidence.magnifierPresent
      && evidencePreview.focusedEvidence.highlightPresent
      && evidencePreview.focusedEvidence.magnifierPresent
      && !evidencePreview.returnToOriginalButtonPresent
      && evidencePreview.restoredEvidence.highlightPresent === false
      && evidencePreview.restoredEvidence.magnifierPresent === false
      && evidencePreview.restoredEvidence.flashPresent === false
      && evidencePreview.restoredEvidence.activeTabText === evidencePreview.originalPreview.activeTabText
      && evidenceSurface.previewSurfaceCount === 1
      && evidenceSurface.previewTabCount === 2
      && evidenceSurface.pdfTabCount === 0
      && evidenceSurface.secondPreviewViewerCount <= 1
      && evidenceSurface.documentViewerCount === 0
      && verification.modifiedInputCount === 1
      && verification.modifiedIndicatorText === "已修改"
      && verification.globalSaveButtonCount === 1
      && /^(確認寫入 PDM|更新寫入 PDM|確認資料已一致|帶入 \d+ 個料號工作)$/u.test(verification.globalSaveButtonText)
      && (verification.globalSaveButtonEnabled || verification.globalSaveButtonText === "帶入 0 個料號工作")
      && verification.materialCardCount === 1
      && verification.materialReviewGroupCount === 1
      && verification.materialMergedCandidateCount === 2
      && verification.materialScopeText === ""
      && verification.materialEvidenceLabels.length > 0
      && verification.materialEvidenceLabels.every((label) => ["PDF圖面", "檔案屬性"].includes(label))
      && verification.recognitionStillVisible
      && verification.unsavedGuardMessage.includes("尚未儲存的變更")
      && !verification.legacyPendingReviewTextPresent
      && !verification.footerOverlapsRecognition
      && verification.horizontalOverflow <= 2
      && verification.visibleAlerts.length === 0
      && verification.processingTextAbsent
      && consoleErrors.length === 0
      && failedRequests.length === 0;
    const screenshot = path.join(outputDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.locator('.dev079-recognition-save-status .primary-button').scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    const saveButtonScreenshot = path.join(outputDir, `${viewport.name}-save-button.png`);
    await page.screenshot({ path: saveButtonScreenshot, fullPage: true });
    results.push({ viewport, httpStatus: response?.status() ?? null, passed, verification, evidencePreview, consoleErrors, failedRequests, expectedPreviewCancellations, expectedNavigationCancellations, evidenceScreenshot: path.relative(root, evidenceScreenshot), screenshot: path.relative(root, screenshot), saveButtonScreenshot: path.relative(root, saveButtonScreenshot) });
    await context.close();
    if (!passed) throw new Error(`${viewport.name} recognition layout verification failed: ${JSON.stringify(results.at(-1))}`);
  }
} finally {
  await browser.close();
  await isolatedRuntime?.stop();
}

fs.writeFileSync(path.join(outputDir, "browser-verification.json"), `${JSON.stringify({ baseUrl, route, drawingId, workId, drawingNumber, recognitionSessionId, status: "PASS", runtimeReceipt: isolatedRuntime?.runtimeReceipt ?? null, results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "PASS", outputDir, results }, null, 2));
