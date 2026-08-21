import "client-only";

import {
  DRAWING_OCR_ADAPTER_CODE,
  DRAWING_OCR_POLICY,
  drawingOcrTextLayerIsSufficient,
  selectDrawingOcrObservations,
  type DrawingOcrRequiredOutcome,
  type DrawingOcrTextBlock
} from "@/lib/drawing-ocr-priority-policy";
import type { DrawingRecognitionAdapterCompletion } from "@/lib/drawing-recognition-contract";
import {
  buildDrawingPdfTextLayerBlocks,
  type DrawingPdfTextItem
} from "@/lib/drawing-pdf-text-layout";
import {
  buildDrawingOcrSpatialLayoutBlocks,
  type DrawingOcrLayoutBlock
} from "@/lib/drawing-ocr-spatial-layout";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

const PDFJS_VERSION = "6.2.108";
const TESSERACT_VERSION = "7.0.0";
const OCR_ASSET_BASE = `/generated/dev-082-ocr/pdfjs-${PDFJS_VERSION}_tesseract-${TESSERACT_VERSION}`;
const MAX_RASTER_PIXELS = 12_000_000;
const MAX_OCR_PAGES = 20;
const PAGE_TIMEOUT_MS = 60_000;
const DOCUMENT_TIMEOUT_MS = 10 * 60_000;

export const DEV_082_OCR_LIMITS = {
  maxRasterPixels: MAX_RASTER_PIXELS,
  maxOcrPages: MAX_OCR_PAGES,
  pageTimeoutMs: PAGE_TIMEOUT_MS,
  documentTimeoutMs: DOCUMENT_TIMEOUT_MS,
  concurrency: 1
} as const;

export type BrowserPdfOcrStage = "preparing" | "text_layer" | "ocr" | "ranking" | "submitting";

export type BrowserPdfOcrProgress = {
  stage: BrowserPdfOcrStage;
  pageNumber?: number;
  pageCount?: number;
  progress?: number;
};

export type BrowserPdfOcrResult = DrawingRecognitionAdapterCompletion & {
  requiredOutcomes: DrawingOcrRequiredOutcome[];
  metrics: {
    pageCount: number;
    textLayerPages: number;
    ocrPages: number;
    selectedObservations: number;
    discardedObservations: number;
    elapsedMs: number;
  };
};

function assertBrowserCapability() {
  if (typeof window === "undefined" || typeof Worker === "undefined" || typeof WebAssembly === "undefined" || typeof OffscreenCanvas === "undefined" && typeof document === "undefined") {
    throw new Error("pdf_ocr_browser_capability_missing");
  }
}

function assertPdfBytes(bytes: ArrayBuffer) {
  if (bytes.byteLength < 5) throw new Error("pdf_source_invalid");
  const magic = new TextDecoder("ascii").decode(new Uint8Array(bytes, 0, 5));
  if (magic !== "%PDF-") throw new Error("pdf_source_invalid");
}

function printableCharacters(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "").length;
}

function timeout<T>(promise: Promise<T>, durationMs: number, code: string, signal?: AbortSignal) {
  let timer = 0;
  let abort: (() => void) | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(code)), Math.max(1, durationMs));
    if (signal) {
      abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }
  });
  return Promise.race([promise, deadline]).finally(() => {
    window.clearTimeout(timer);
    if (signal && abort) signal.removeEventListener("abort", abort);
  });
}

function remainingTimeout(startedAt: number, operationLimitMs: number) {
  const remainingDocumentMs = DOCUMENT_TIMEOUT_MS - (Date.now() - startedAt);
  if (remainingDocumentMs <= 0) throw new Error("pdf_ocr_document_timeout");
  return Math.min(operationLimitMs, remainingDocumentMs);
}

function safeDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/password|encrypted/iu.test(message)) return "pdf_encrypted_or_password_required";
  if (/page_timeout/iu.test(message)) return "pdf_ocr_page_timeout";
  if (/document_timeout/iu.test(message)) return "pdf_ocr_document_timeout";
  if (/capability/iu.test(message)) return "pdf_ocr_browser_capability_missing";
  if (/invalid|format|pdf_source/iu.test(message)) return "pdf_source_invalid";
  if (/worker|wasm|tesseract|network|fetch/iu.test(message)) return "pdf_ocr_runtime_unavailable";
  return "pdf_ocr_failed";
}

function terminalFailure(sourceId: string, startedAt: number, error: unknown): BrowserPdfOcrResult {
  return {
    sourceId,
    adapterCode: DRAWING_OCR_ADAPTER_CODE,
    adapterVersion: `pdfjs-${PDFJS_VERSION}+tesseractjs-${TESSERACT_VERSION}+policy-${DRAWING_OCR_POLICY.policyVersion}`,
    status: safeDiagnostic(error) === "pdf_ocr_browser_capability_missing" ? "unsupported" : safeDiagnostic(error).includes("timeout") ? "timeout" : "failed",
    diagnostics: [safeDiagnostic(error)],
    observations: [],
    requiredOutcomes: DRAWING_OCR_POLICY.fields.filter((field) => field.tier === 0).map((field) => ({
      fieldKey: field.key,
      fieldLabel: field.label,
      outcome: "not_found",
      distinctValueCount: 0,
      overflow: false
    })),
    metrics: { pageCount: 0, textLayerPages: 0, ocrPages: 0, selectedObservations: 0, discardedObservations: 0, elapsedMs: Date.now() - startedAt }
  };
}

export async function runBrowserPdfOcr(input: {
  sourceId: string;
  bytes: ArrayBuffer;
  signal?: AbortSignal;
  onProgress?: (progress: BrowserPdfOcrProgress) => void;
}): Promise<BrowserPdfOcrResult> {
  const startedAt = Date.now();
  let pdfLoadingTask: PDFDocumentLoadingTask | null = null;
  let pdfDocument: PDFDocumentProxy | null = null;
  let tesseractWorker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
  try {
    assertBrowserCapability();
    assertPdfBytes(input.bytes);
    input.onProgress?.({ stage: "preparing" });
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `${OCR_ASSET_BASE}/pdf.worker.min.mjs`;
    pdfLoadingTask = pdfjs.getDocument({ data: new Uint8Array(input.bytes) });
    const openedDocument = await timeout(pdfLoadingTask.promise, remainingTimeout(startedAt, DOCUMENT_TIMEOUT_MS), "pdf_ocr_document_timeout", input.signal);
    pdfDocument = openedDocument;
    const pageCount = openedDocument.numPages;
    const textPages: Array<{ page: PDFPageProxy; pageNumber: number; pageWidth: number; pageHeight: number; pageRotation: number; blocks: DrawingOcrTextBlock[]; text: string }> = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      input.onProgress?.({ stage: "text_layer", pageNumber, pageCount, progress: pageNumber / pageCount });
      const page = await timeout(openedDocument.getPage(pageNumber), remainingTimeout(startedAt, PAGE_TIMEOUT_MS), "pdf_ocr_page_timeout", input.signal);
      const viewport = page.getViewport({ scale: 1 });
      const content = await timeout(page.getTextContent(), remainingTimeout(startedAt, PAGE_TIMEOUT_MS), "pdf_ocr_page_timeout", input.signal);
      const blocks = buildDrawingPdfTextLayerBlocks({
        items: content.items as DrawingPdfTextItem[],
        pageNumber,
        pageWidth: Number(viewport.width ?? 0),
        pageHeight: Number(viewport.height ?? 0),
        pageRotation: Number(page.rotate ?? 0)
      });
      textPages.push({ page, pageNumber, pageWidth: Number(viewport.width ?? 0), pageHeight: Number(viewport.height ?? 0), pageRotation: Number(page.rotate ?? 0), blocks, text: blocks.map((block) => block.text).join("\n") });
    }
    const documentPrintable = textPages.reduce((total, page) => total + printableCharacters(page.text), 0);
    const allBlocks: DrawingOcrTextBlock[] = [];
    let textLayerPages = 0;
    let ocrPages = 0;
    const runtimeDiagnostics: string[] = [];
    for (const pageData of textPages) {
      if (input.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (drawingOcrTextLayerIsSufficient(pageData.text, documentPrintable)) {
        textLayerPages += 1;
        allBlocks.push(...pageData.blocks);
        pageData.page.cleanup();
        continue;
      }
      if (ocrPages >= MAX_OCR_PAGES) {
        runtimeDiagnostics.push("pdf_ocr_page_limit_reached");
        pageData.page.cleanup();
        continue;
      }
      ocrPages += 1;
      input.onProgress?.({ stage: "ocr", pageNumber: pageData.pageNumber, pageCount, progress: ocrPages / Math.min(pageCount, MAX_OCR_PAGES) });
      if (!tesseractWorker) {
        const tesseract = await import("tesseract.js");
        const workerPromise = tesseract.createWorker(["chi_tra", "eng"], tesseract.OEM.LSTM_ONLY, {
          workerPath: `${OCR_ASSET_BASE}/worker-wrapper.js`,
          corePath: `${OCR_ASSET_BASE}/tesseract-core-lstm.wasm.js`,
          langPath: `${OCR_ASSET_BASE}/lang`,
          workerBlobURL: false,
          gzip: true,
          logger: (message) => {
            if (message.status === "recognizing text") input.onProgress?.({ stage: "ocr", pageNumber: pageData.pageNumber, pageCount, progress: message.progress });
          }
        });
        try {
          tesseractWorker = await timeout(workerPromise, remainingTimeout(startedAt, PAGE_TIMEOUT_MS), "pdf_ocr_page_timeout", input.signal);
        } catch (error) {
          void workerPromise.then((worker) => worker.terminate()).catch(() => undefined);
          throw error;
        }
        await timeout(tesseractWorker.setParameters({
          tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT
        }), remainingTimeout(startedAt, PAGE_TIMEOUT_MS), "pdf_ocr_page_timeout", input.signal);
      }
      const baseViewport = pageData.page.getViewport({ scale: 1 });
      const basePixels = Math.max(1, Number(baseViewport.width) * Number(baseViewport.height));
      const scale = Math.min(2.5, Math.sqrt(MAX_RASTER_PIXELS / basePixels));
      const viewport = pageData.page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      try {
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("pdf_ocr_canvas_unavailable");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await timeout(pageData.page.render({ canvas, canvasContext: context, viewport }).promise, remainingTimeout(startedAt, PAGE_TIMEOUT_MS), "pdf_ocr_page_timeout", input.signal);
        const recognized = await timeout(tesseractWorker.recognize(canvas, {}, { text: true, blocks: true }), remainingTimeout(startedAt, PAGE_TIMEOUT_MS), "pdf_ocr_page_timeout", input.signal);
        const confidence = Number(recognized.data.confidence ?? 0);
        const recognizedText = String(recognized.data.text ?? "");
        allBlocks.push(...buildDrawingOcrSpatialLayoutBlocks({
          blocks: recognized.data.blocks as DrawingOcrLayoutBlock[] | null,
          pageNumber: pageData.pageNumber,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          fallbackConfidence: confidence,
          pageWidth: pageData.pageWidth,
          pageHeight: pageData.pageHeight,
          pageRotation: pageData.pageRotation,
          producerSpace: "pdfjs_rendered_canvas"
        }));
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        pageData.page.cleanup();
      }
      if (Date.now() - startedAt > DOCUMENT_TIMEOUT_MS) throw new Error("pdf_ocr_document_timeout");
    }
    input.onProgress?.({ stage: "ranking" });
    const selection = selectDrawingOcrObservations(allBlocks);
    const partial = runtimeDiagnostics.length > 0 || selection.requiredOutcomes.some((outcome) => outcome.overflow);
    return {
      sourceId: input.sourceId,
      adapterCode: DRAWING_OCR_ADAPTER_CODE,
      adapterVersion: `pdfjs-${PDFJS_VERSION}+tesseractjs-${TESSERACT_VERSION}+policy-${selection.policyVersion}`,
      status: partial ? "partial" : "succeeded",
      diagnostics: [...selection.diagnostics, ...runtimeDiagnostics].slice(0, 20),
      observations: selection.observations,
      requiredOutcomes: selection.requiredOutcomes,
      metrics: {
        pageCount,
        textLayerPages,
        ocrPages,
        selectedObservations: selection.counts.selected,
        discardedObservations: selection.counts.discarded,
        elapsedMs: Date.now() - startedAt
      }
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return terminalFailure(input.sourceId, startedAt, error);
  } finally {
    if (tesseractWorker) await tesseractWorker.terminate().catch(() => undefined);
    if (pdfDocument) await pdfDocument.cleanup().catch(() => undefined);
    if (pdfLoadingTask) await pdfLoadingTask.destroy().catch(() => undefined);
  }
}

export const DEV_082_OCR_ASSET_BASE = OCR_ASSET_BASE;
export const DEV_082_OCR_VERSIONS = { pdfjs: PDFJS_VERSION, tesseract: TESSERACT_VERSION, policy: DRAWING_OCR_POLICY.policyVersion };
