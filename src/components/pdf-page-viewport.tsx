"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

const PDFJS_WORKER = "/generated/dev-082-ocr/pdfjs-6.2.108_tesseract-7.0.0/pdf.worker.min.mjs";
const MAGNIFIER_CACHE_LIMIT = 4;
const MAGNIFIER_SAFE_DIAMETER_RATIO = 0.78;
const MAGNIFIER_MIN_RESOLUTION = 2.5;
const MAGNIFIER_MAX_RESOLUTION = 3;

type PageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type MagnifierPlan = {
  targetRect: PageRect;
  cropRect: PageRect;
  effectiveZoom: number;
  coverageRatio: number;
};

type MagnifierCropCacheEntry = {
  canvas: HTMLCanvasElement;
  cropRect: PageRect;
  outputScale: number;
  effectiveZoom: number;
  coverageRatio: number;
};

type RenderedPdfPage = {
  pdfPage: PDFPageProxy;
  safePageNumber: number;
  fitScale: number;
  cssWidth: number;
  cssHeight: number;
};

function renderingWasCancelled(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

export type PdfPageFocusRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  const safeMaximum = Math.max(minimum, maximum);
  return Math.min(Math.max(value, minimum), safeMaximum);
}

function normalizedPageRect({
  pageWidth,
  pageHeight,
  region
}: {
  pageWidth: number;
  pageHeight: number;
  region: PdfPageFocusRegion;
}): PageRect {
  const firstX = clamp(region.x, 0, 1) * pageWidth;
  const firstY = clamp(region.y, 0, 1) * pageHeight;
  const secondX = clamp(region.x + region.width, 0, 1) * pageWidth;
  const secondY = clamp(region.y + region.height, 0, 1) * pageHeight;
  return {
    left: Math.min(firstX, secondX),
    top: Math.min(firstY, secondY),
    width: Math.max(0.5, Math.abs(secondX - firstX)),
    height: Math.max(0.5, Math.abs(secondY - firstY))
  };
}

function expandTargetRect({
  pageWidth,
  pageHeight,
  region
}: {
  pageWidth: number;
  pageHeight: number;
  region: PageRect;
}): PageRect {
  const horizontalPadding = Math.max(region.width * 0.3, pageWidth * 0.005);
  const verticalPadding = Math.max(region.height * 0.5, pageHeight * 0.005);
  const left = clamp(region.left - horizontalPadding, 0, pageWidth);
  const top = clamp(region.top - verticalPadding, 0, pageHeight);
  const right = clamp(region.left + region.width + horizontalPadding, 0, pageWidth);
  const bottom = clamp(region.top + region.height + verticalPadding, 0, pageHeight);
  return {
    left,
    top,
    width: Math.max(0.5, right - left),
    height: Math.max(0.5, bottom - top)
  };
}

function rectangleCorners(rect: PageRect) {
  return [
    { x: rect.left, y: rect.top },
    { x: rect.left + rect.width, y: rect.top },
    { x: rect.left, y: rect.top + rect.height },
    { x: rect.left + rect.width, y: rect.top + rect.height }
  ];
}

function coverageRatioFor({
  targetRect,
  cropRect,
  lensSize
}: {
  targetRect: PageRect;
  cropRect: PageRect;
  lensSize: number;
}) {
  const lensCenter = lensSize / 2;
  const safeRadius = lensSize * MAGNIFIER_SAFE_DIAMETER_RATIO / 2;
  const scaleX = lensSize / Math.max(0.5, cropRect.width);
  const scaleY = lensSize / Math.max(0.5, cropRect.height);
  const coveredCorners = rectangleCorners(targetRect).filter((corner) => {
    const x = (corner.x - cropRect.left) * scaleX;
    const y = (corner.y - cropRect.top) * scaleY;
    const distance = Math.hypot(x - lensCenter, y - lensCenter);
    return distance <= safeRadius + 0.5;
  });
  return coveredCorners.length / 4;
}

function buildMagnifierPlan({
  pageWidth,
  pageHeight,
  region,
  lensSize
}: {
  pageWidth: number;
  pageHeight: number;
  region: PageRect;
  lensSize: number;
}): MagnifierPlan {
  const targetRect = expandTargetRect({ pageWidth, pageHeight, region });
  // Permit a virtual white margin outside the page when the evidence is on a
  // page edge. PDF.js clips the page into this padded canvas, so the target
  // can still sit inside the circular safe area instead of being corner-cut.
  const maximumCropSize = Math.max(1, Math.max(pageWidth, pageHeight));
  const minimumCropSize = lensSize / 3;
  let cropSize = Math.min(
    maximumCropSize,
    Math.max(minimumCropSize, Math.hypot(targetRect.width, targetRect.height) / MAGNIFIER_SAFE_DIAMETER_RATIO)
  );
  let cropRect: PageRect = { left: 0, top: 0, width: cropSize, height: cropSize };
  let coverageRatio = 0;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;
    cropRect = {
      left: centerX - cropSize / 2,
      top: centerY - cropSize / 2,
      width: cropSize,
      height: cropSize
    };
    coverageRatio = coverageRatioFor({ targetRect, cropRect, lensSize });
    if (coverageRatio >= 1 || cropSize >= maximumCropSize) break;
    cropSize = Math.min(maximumCropSize, Math.max(cropSize + 1, cropSize * 1.25));
  }

  return {
    targetRect,
    cropRect,
    effectiveZoom: Math.min(lensSize / cropRect.width, lensSize / cropRect.height),
    coverageRatio
  };
}

function overlapArea(first: PageRect, second: PageRect) {
  const width = Math.max(0, Math.min(first.left + first.width, second.left + second.width) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.top + first.height, second.top + second.height) - Math.max(first.top, second.top));
  return width * height;
}

function magnifierPosition({
  pageWidth,
  pageHeight,
  region,
  size
}: {
  pageWidth: number;
  pageHeight: number;
  region: PageRect;
  size: number;
}) {
  const gap = Math.max(10, size * 0.1);
  const marginX = Math.min(Math.max(8, size * 0.16), Math.max(0, (pageWidth - size) / 2));
  const marginY = Math.min(Math.max(8, size * 0.16), Math.max(0, (pageHeight - size) / 2));
  const centerX = region.left + region.width / 2;
  const centerY = region.top + region.height / 2;
  const maximumLeft = Math.max(marginX, pageWidth - size - marginX);
  const maximumTop = Math.max(marginY, pageHeight - size - marginY);
  const rawCandidates = [
    { left: region.left - size - gap, top: centerY - size / 2 },
    { left: region.left + region.width + gap, top: centerY - size / 2 },
    { left: centerX - size / 2, top: region.top - size - gap },
    { left: centerX - size / 2, top: region.top + region.height + gap }
  ];
  const expandedRegion = {
    left: region.left - gap / 2,
    top: region.top - gap / 2,
    width: region.width + gap,
    height: region.height + gap
  };
  return rawCandidates
    .map((candidate, index) => {
      const positioned = {
        left: clamp(candidate.left, marginX, maximumLeft),
        top: clamp(candidate.top, marginY, maximumTop),
        width: size,
        height: size
      };
      const clampDistance = Math.abs(positioned.left - candidate.left) + Math.abs(positioned.top - candidate.top);
      return { ...positioned, score: overlapArea(positioned, expandedRegion) * 1000 + clampDistance + index * 0.01 };
    })
    .sort((first, second) => first.score - second.score)[0];
}

function lensSizeForViewport(pageWidth: number, pageHeight: number) {
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const pageShortSide = Math.min(pageWidth, pageHeight);
  const maximum = viewportWidth <= 480 ? 140 : viewportWidth <= 1024 ? 168 : 200;
  const minimum = viewportWidth <= 480 ? 120 : 128;
  return clamp(pageShortSide * 0.32, Math.min(minimum, pageShortSide), Math.min(maximum, pageShortSide));
}

function clearMagnifierCache(cache: Map<string, MagnifierCropCacheEntry>) {
  for (const entry of cache.values()) {
    entry.canvas.width = 0;
    entry.canvas.height = 0;
  }
  cache.clear();
}

function cacheKeyFor({
  sourceKey,
  pageNumber,
  cropRect,
  outputScale
}: {
  sourceKey: string;
  pageNumber: number;
  cropRect: PageRect;
  outputScale: number;
}) {
  return [
    sourceKey,
    pageNumber,
    cropRect.left.toFixed(3),
    cropRect.top.toFixed(3),
    cropRect.width.toFixed(3),
    cropRect.height.toFixed(3),
    outputScale.toFixed(2)
  ].join(":");
}

export function PdfPageViewport({
  bytes,
  pageNumber,
  title,
  focusRegion,
  sourceKey
}: {
  bytes: ArrayBuffer;
  pageNumber: number;
  title: string;
  focusRegion?: PdfPageFocusRegion;
  sourceKey?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const magnifierRef = useRef<HTMLSpanElement>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderedPageRef = useRef<RenderedPdfPage | null>(null);
  const magnifierRenderTaskRef = useRef<RenderTask | null>(null);
  const magnifierSequenceRef = useRef(0);
  const magnifierCacheRef = useRef(new Map<string, MagnifierCropCacheEntry>());
  const [renderState, setRenderState] = useState<"loading" | "ready" | "failed">("loading");
  const [renderVersion, setRenderVersion] = useState(0);
  const [magnifierError, setMagnifierError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let scheduledFrame = 0;
    let renderSequence = 0;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let pdfDocument: PDFDocumentProxy | null = null;
    let pdfPage: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    let observer: ResizeObserver | null = null;
    const magnifierCache = magnifierCacheRef.current;

    async function start() {
      const pdfjs = await import("pdfjs-dist");
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
      pdfDocument = await loadingTask.promise;
      if (disposed) return;
      const safePageNumber = Math.min(Math.max(1, Math.trunc(pageNumber)), pdfDocument.numPages);
      pdfPage = await pdfDocument.getPage(safePageNumber);
      if (disposed) return;
      const baseViewport = pdfPage.getViewport({ scale: 1 });

      const render = async () => {
        const currentSequence = ++renderSequence;
        const stage = stageRef.current;
        const pageElement = pageRef.current;
        const canvas = canvasRef.current;
        if (disposed || !stage || !pageElement || !canvas || !pdfPage) return;
        const availableWidth = Math.max(1, stage.clientWidth);
        const availableHeight = Math.max(1, stage.clientHeight);
        const fitScale = Math.max(0.01, Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height));
        const cssWidth = Math.max(1, baseViewport.width * fitScale);
        const cssHeight = Math.max(1, baseViewport.height * fitScale);
        const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
        const viewport = pdfPage.getViewport({ scale: fitScale * pixelRatio });

        renderTask?.cancel();
        magnifierSequenceRef.current += 1;
        magnifierRenderTaskRef.current?.cancel();
        magnifierRenderTaskRef.current = null;
        pageElement.style.width = `${cssWidth}px`;
        pageElement.style.height = `${cssHeight}px`;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("pdf_page_canvas_unavailable");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
        try {
          await renderTask.promise;
          if (disposed || currentSequence !== renderSequence) return;
          renderedPageRef.current = { pdfPage, safePageNumber, fitScale, cssWidth, cssHeight };
          setRenderState("ready");
          setRenderVersion((version) => version + 1);
        } catch (error) {
          if (!renderingWasCancelled(error)) throw error;
        }
      };

      const scheduleRender = () => {
        window.cancelAnimationFrame(scheduledFrame);
        scheduledFrame = window.requestAnimationFrame(() => void render().catch(() => {
          if (!disposed) setRenderState("failed");
        }));
      };
      observer = new ResizeObserver(scheduleRender);
      if (stageRef.current) observer.observe(stageRef.current);
      scheduleRender();
    }

    renderedPageRef.current = null;
    magnifierSequenceRef.current += 1;
    magnifierRenderTaskRef.current?.cancel();
    magnifierRenderTaskRef.current = null;
    clearMagnifierCache(magnifierCache);
    setRenderState("loading");
    void start().catch(() => {
      if (!disposed) setRenderState("failed");
    });
    return () => {
      disposed = true;
      renderSequence += 1;
      window.cancelAnimationFrame(scheduledFrame);
      observer?.disconnect();
      renderTask?.cancel();
      magnifierSequenceRef.current += 1;
      magnifierRenderTaskRef.current?.cancel();
      magnifierRenderTaskRef.current = null;
      renderedPageRef.current = null;
      clearMagnifierCache(magnifierCache);
      pdfPage?.cleanup();
      void pdfDocument?.cleanup().catch(() => undefined);
      void loadingTask?.destroy().catch(() => undefined);
    };
  }, [bytes, pageNumber]);

  useEffect(() => {
    const renderedPage = renderedPageRef.current;
    const magnifier = magnifierRef.current;
    const magnifierCanvas = magnifierCanvasRef.current;
    const sequence = ++magnifierSequenceRef.current;
    let disposed = false;

    magnifierRenderTaskRef.current?.cancel();
    magnifierRenderTaskRef.current = null;
    setMagnifierError(false);
    if (!focusRegion || renderState !== "ready" || !renderedPage || !magnifier || !magnifierCanvas) return;
    const activeRenderedPage = renderedPage;
    const activeFocusRegion = focusRegion;
    const activeMagnifier = magnifier;
    const activeMagnifierCanvas = magnifierCanvas;
    const hasReadyCrop = activeMagnifier.dataset.magnifierState === "ready"
      && activeMagnifierCanvas.width > 0
      && activeMagnifierCanvas.height > 0;
    if (!hasReadyCrop) activeMagnifier.style.visibility = "hidden";

    async function renderMagnifier() {
      const { pdfPage, safePageNumber, fitScale, cssWidth, cssHeight } = activeRenderedPage;
      const region = normalizedPageRect({ pageWidth: cssWidth, pageHeight: cssHeight, region: activeFocusRegion });
      const lensSize = lensSizeForViewport(cssWidth, cssHeight);
      const position = magnifierPosition({ pageWidth: cssWidth, pageHeight: cssHeight, region, size: lensSize });
      const plan = buildMagnifierPlan({ pageWidth: cssWidth, pageHeight: cssHeight, region, lensSize });
      const outputScale = Math.min(MAGNIFIER_MAX_RESOLUTION, Math.max(MAGNIFIER_MIN_RESOLUTION, window.devicePixelRatio || 1));
      const magnifierStartedAt = performance.now();
      const lensPixelSize = Math.max(1, Math.round(lensSize * outputScale));
      const cropRectInBaseUnits = {
        left: plan.cropRect.left / fitScale,
        top: plan.cropRect.top / fitScale,
        width: plan.cropRect.width / fitScale,
        height: plan.cropRect.height / fitScale
      };
      const key = cacheKeyFor({
        sourceKey: sourceKey ?? title,
        pageNumber: safePageNumber,
        cropRect: cropRectInBaseUnits,
        outputScale
      });
      const magnifierCache = magnifierCacheRef.current;

      activeMagnifier.dataset.magnifierState = "loading";
      activeMagnifier.dataset.resolutionMode = "pending";
      activeMagnifier.dataset.coverageRatio = plan.coverageRatio.toFixed(3);
      activeMagnifier.dataset.effectiveZoom = plan.effectiveZoom.toFixed(3);
      activeMagnifier.dataset.backingScale = outputScale.toFixed(2);
      activeMagnifier.dataset.targetRect = JSON.stringify(plan.targetRect);
      activeMagnifier.dataset.cropRect = JSON.stringify(cropRectInBaseUnits);
      activeMagnifier.dataset.cacheState = "miss";
      activeMagnifier.dataset.lruSize = String(magnifierCache.size);
      activeMagnifier.dataset.renderElapsedMs = "0";

      let cropEntry = magnifierCache.get(key);
      if (cropEntry) {
        magnifierCache.delete(key);
        magnifierCache.set(key, cropEntry);
        activeMagnifier.dataset.cacheState = "hit";
      } else {
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = Math.max(1, Math.min(1024, Math.ceil(cropRectInBaseUnits.width * outputScale)));
        cropCanvas.height = Math.max(1, Math.min(1024, Math.ceil(cropRectInBaseUnits.height * outputScale)));
        const cropContext = cropCanvas.getContext("2d", { alpha: false });
        if (!cropContext) throw new Error("pdf_magnifier_crop_canvas_unavailable");
        cropContext.fillStyle = "#ffffff";
        cropContext.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
        const cropViewport = pdfPage.getViewport({
          scale: outputScale,
          offsetX: -cropRectInBaseUnits.left * outputScale,
          offsetY: -cropRectInBaseUnits.top * outputScale
        });
        const task = pdfPage.render({ canvas: cropCanvas, canvasContext: cropContext, viewport: cropViewport });
        magnifierRenderTaskRef.current = task;
        try {
          await task.promise;
        } catch (error) {
          cropCanvas.width = 0;
          cropCanvas.height = 0;
          if (renderingWasCancelled(error)) return;
          throw error;
        } finally {
          if (magnifierRenderTaskRef.current === task) magnifierRenderTaskRef.current = null;
        }
        cropEntry = {
          canvas: cropCanvas,
          cropRect: cropRectInBaseUnits,
          outputScale,
          effectiveZoom: plan.effectiveZoom,
          coverageRatio: plan.coverageRatio
        };
        magnifierCache.set(key, cropEntry);
        while (magnifierCache.size > MAGNIFIER_CACHE_LIMIT) {
          const oldestKey = magnifierCache.keys().next().value;
          if (!oldestKey) break;
          const oldest = magnifierCache.get(oldestKey);
          magnifierCache.delete(oldestKey);
          if (oldest) {
            oldest.canvas.width = 0;
            oldest.canvas.height = 0;
          }
        }
      }

      if (disposed || sequence !== magnifierSequenceRef.current || !cropEntry) return;
      activeMagnifierCanvas.width = lensPixelSize;
      activeMagnifierCanvas.height = lensPixelSize;
      const magnifierContext = activeMagnifierCanvas.getContext("2d", { alpha: false });
      if (!magnifierContext) throw new Error("pdf_magnifier_canvas_unavailable");
      magnifierContext.fillStyle = "#ffffff";
      magnifierContext.fillRect(0, 0, lensPixelSize, lensPixelSize);
      magnifierContext.imageSmoothingEnabled = false;
      magnifierContext.drawImage(cropEntry.canvas, 0, 0, lensPixelSize, lensPixelSize);
      // Keep the previous crop in place while the next high-resolution crop is
      // prepared. Position and pixels now update in one paint, avoiding a frame
      // where old evidence appears at the new field's coordinates.
      activeMagnifier.style.left = `${position.left}px`;
      activeMagnifier.style.top = `${position.top}px`;
      activeMagnifier.style.width = `${lensSize}px`;
      activeMagnifier.style.height = `${lensSize}px`;
      activeMagnifier.style.visibility = "visible";
      activeMagnifier.dataset.magnifierState = "ready";
      activeMagnifier.dataset.resolutionMode = "pdf_high_res_crop";
      activeMagnifier.dataset.coverageRatio = cropEntry.coverageRatio.toFixed(3);
      activeMagnifier.dataset.effectiveZoom = cropEntry.effectiveZoom.toFixed(3);
      activeMagnifier.dataset.backingScale = cropEntry.outputScale.toFixed(2);
      activeMagnifier.dataset.lruSize = String(magnifierCache.size);
      activeMagnifier.dataset.renderElapsedMs = Math.max(0, performance.now() - magnifierStartedAt).toFixed(1);
    }

    void renderMagnifier().catch((error) => {
      if (disposed || sequence !== magnifierSequenceRef.current || renderingWasCancelled(error)) return;
      activeMagnifier.style.visibility = "hidden";
      activeMagnifier.dataset.magnifierState = "failed";
      activeMagnifier.dataset.resolutionMode = "fallback";
      setMagnifierError(true);
    });

    return () => {
      disposed = true;
      if (sequence !== magnifierSequenceRef.current) return;
      magnifierSequenceRef.current += 1;
      magnifierRenderTaskRef.current?.cancel();
      magnifierRenderTaskRef.current = null;
    };
  }, [focusRegion, renderState, renderVersion, sourceKey, title]);

  const focusStyle = focusRegion ? {
    left: `${focusRegion.x * 100}%`,
    top: `${focusRegion.y * 100}%`,
    width: `${Math.max(0.5, focusRegion.width * 100)}%`,
    height: `${Math.max(0.5, focusRegion.height * 100)}%`
  } : undefined;

  return (
    <div className="drawing-preview-pdf-stage" ref={stageRef} data-pdf-page-state={renderState}>
      <div className="drawing-preview-pdf-page" ref={pageRef} data-pdf-page-number={pageNumber}>
        <canvas ref={canvasRef} role="img" aria-label={title} />
        {focusRegion ? (
          <div className="dev079-evidence-page-overlay" aria-hidden="true">
            <span className="dev079-evidence-highlighter" style={focusStyle} data-evidence-marker="highlighter" />
            <span
              className="dev079-evidence-magnifier"
              ref={magnifierRef}
              data-magnifier-state="loading"
              data-resolution-mode="pending"
              data-coverage-ratio="0"
              data-effective-zoom="0"
              data-backing-scale="0"
              data-target-rect=""
              data-crop-rect=""
              data-cache-state="miss"
              data-lru-size="0"
              data-render-elapsed-ms="0"
            >
              <span className="dev079-evidence-magnifier-viewport">
                <canvas ref={magnifierCanvasRef} />
              </span>
            </span>
          </div>
        ) : null}
      </div>
      {renderState === "loading" ? <span className="drawing-preview-pdf-page-status" role="status">正在載入預覽頁面</span> : null}
      {renderState === "failed" ? <span className="drawing-preview-pdf-page-status is-error" role="alert">預覽頁面無法顯示，請重新整理後再試。</span> : null}
      {magnifierError ? <span className="drawing-preview-pdf-magnifier-status" role="status">局部放大載入失敗，已保留原定位。</span> : null}
    </div>
  );
}
