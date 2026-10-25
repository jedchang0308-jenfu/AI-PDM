"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Minus, Plus } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

const PDFJS_WORKER = "/generated/dev-082-ocr/pdfjs-6.2.108_tesseract-7.0.0/pdf.worker.min.mjs";
const MAX_CANVAS_EDGE = 8192;
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;

export function pdfDocumentCanvasPlan(width: number, height: number, availableWidth: number, zoom: number, pixelRatio: number) {
  if (![width, height, availableWidth, zoom, pixelRatio].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error("invalid_pdf_page_dimensions");
  const scale = Math.max(1, availableWidth) / width * Math.min(4, Math.max(0.5, zoom));
  const cssWidth = width * scale, cssHeight = height * scale;
  const outputScale = Math.min(2, Math.max(1, pixelRatio), MAX_CANVAS_EDGE / cssWidth, MAX_CANVAS_EDGE / cssHeight, Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight)));
  return { scale, cssWidth, cssHeight, outputScale, pixelWidth: Math.max(1, Math.floor(cssWidth * outputScale)), pixelHeight: Math.max(1, Math.floor(cssHeight * outputScale)) };
}

export function PdfDocumentViewport({ bytes, sourceKey, title, showControls = true }: {
  bytes: ArrayBuffer; sourceKey: string; title: string; showControls?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [renderedPage, setRenderedPage] = useState(0);
  const [renderState, setRenderState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    const timeout = window.setTimeout(() => {
      disposed = true; setRenderState("failed");
      void loadingTask?.destroy().catch(() => undefined);
    }, 60_000);
    setDocument(null); setPageNumber(1); setZoom(1); setRenderedPage(0); setRenderState("loading");
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), stopAtErrors: true });
      const next = await loadingTask.promise;
      window.clearTimeout(timeout);
      if (!disposed) setDocument(next);
    })().catch(() => { window.clearTimeout(timeout); if (!disposed) setRenderState("failed"); });
    return () => { disposed = true; window.clearTimeout(timeout); renderTaskRef.current?.cancel(); void loadingTask?.destroy().catch(() => undefined); };
  }, [bytes, sourceKey]);

  useEffect(() => {
    if (!document) return;
    let disposed = false, sequence = 0, frame = 0;
    let scheduledRenderKey = "";
    let observer: ResizeObserver | null = null;
    let page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | null = null;
    const failAfterTimeout = () => {
      disposed = true; observer?.disconnect(); window.cancelAnimationFrame(frame); renderTaskRef.current?.cancel(); setRenderState("failed");
    };
    let timeout = window.setTimeout(failAfterTimeout, 60_000);
    setRenderState("loading"); setRenderedPage(0);
    const render = () => {
      if (disposed) return;
      const current = ++sequence;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        if (!disposed && current === sequence) failAfterTimeout();
      }, 60_000);
      // Settle the previous task before touching its canvas; sequence guards
      // alone cannot prevent two PDF.js renders using the same canvas.
      const queued = renderQueueRef.current.catch(() => undefined).then(async () => {
        const stage = stageRef.current, canvas = canvasRef.current;
        if (disposed || current !== sequence || !stage || !canvas || !page) return;
        const base = page.getViewport({ scale: 1 });
        const plan = pdfDocumentCanvasPlan(base.width, base.height, stage.clientWidth - 16, zoom, window.devicePixelRatio || 1);
        canvas.style.width = `${plan.cssWidth}px`; canvas.style.height = `${plan.cssHeight}px`;
        canvas.width = plan.pixelWidth; canvas.height = plan.pixelHeight;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("pdf_document_canvas_unavailable");
        const viewport = page.getViewport({ scale: plan.scale * plan.outputScale });
        const task = page.render({ canvas, canvasContext: context, viewport }); renderTaskRef.current = task;
        try {
          await task.promise;
          if (current === sequence) window.clearTimeout(timeout);
          if (!disposed && current === sequence) { setRenderedPage(pageNumber); setRenderState("ready"); }
        } finally { if (renderTaskRef.current === task) renderTaskRef.current = null; }
      });
      renderQueueRef.current = queued.catch((error: unknown) => {
        if (current === sequence) window.clearTimeout(timeout);
        if (!disposed && current === sequence && !(error instanceof Error && error.name === "RenderingCancelledException")) setRenderState("failed");
      });
    };
    const schedule = () => {
      const stage = stageRef.current;
      if (disposed || !stage) return;
      const renderKey = `${Math.max(1, stage.clientWidth - 16)}:${window.devicePixelRatio || 1}`;
      if (renderKey === scheduledRenderKey) return;
      scheduledRenderKey = renderKey;
      window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(render);
    };
    void document.getPage(Math.min(document.numPages, Math.max(1, pageNumber))).then(next => {
      page = next;
      if (disposed) { page.cleanup(); return; }
      observer = new ResizeObserver(schedule); if (stageRef.current) observer.observe(stageRef.current); schedule();
    }).catch(() => { window.clearTimeout(timeout); if (!disposed) setRenderState("failed"); });
    return () => {
      disposed = true; sequence++; window.clearTimeout(timeout); window.cancelAnimationFrame(frame); observer?.disconnect(); renderTaskRef.current?.cancel();
      void renderQueueRef.current.finally(() => page?.cleanup());
    };
  }, [document, pageNumber, zoom]);

  return <div className="dev122-pdf-document" data-pdf-render-state={renderState} data-pdf-page={renderedPage} data-pdf-page-count={document?.numPages ?? 0} data-pdf-zoom={zoom}>
    {showControls ? <div className="dev122-pdf-controls" role="toolbar" aria-label="PDF 閱讀工具">
      <button type="button" className="icon-button" aria-label="上一頁" disabled={!document || pageNumber <= 1} onClick={() => setPageNumber(page => Math.max(1, page - 1))}><ChevronLeft size={16} /></button>
      <label><input aria-label="PDF 頁碼" type="number" min={1} max={document?.numPages ?? 1} value={pageNumber} disabled={!document} onChange={event => setPageNumber(Math.min(document?.numPages ?? 1, Math.max(1, Math.trunc(Number(event.target.value)) || 1)))} /><span>／{document?.numPages ?? "—"}</span></label>
      <button type="button" className="icon-button" aria-label="下一頁" disabled={!document || pageNumber >= document.numPages} onClick={() => setPageNumber(page => Math.min(document?.numPages ?? 1, page + 1))}><ChevronRight size={16} /></button>
      <button type="button" className="icon-button" aria-label="縮小" disabled={!document || zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}><Minus size={16} /></button>
      <output aria-label="PDF 縮放">{Math.round(zoom * 100)}%</output>
      <button type="button" className="icon-button" aria-label="放大" disabled={!document || zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + 0.25))}><Plus size={16} /></button>
      <button type="button" className="ghost-button" disabled={!document} onClick={() => setZoom(1)}>符合寬度</button>
    </div> : null}
    <div className="dev122-pdf-scroll" ref={stageRef} tabIndex={0} aria-label={title}>
      <canvas ref={canvasRef} aria-label={`${title} · 第 ${pageNumber} 頁`} style={{ visibility: renderState === "ready" ? "visible" : "hidden" }} />
    </div>
    {renderState !== "ready" ? <div className="dev122-pdf-render-status" role={renderState === "failed" ? "alert" : "status"}>{renderState === "failed" ? "PDF 無法顯示，可下載原檔。" : <><LoaderCircle className="spin" size={18} aria-hidden="true" />載入 PDF…</>}</div> : null}
  </div>;
}
