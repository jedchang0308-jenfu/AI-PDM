// @vitest-environment jsdom
import React, { act } from "react";
import { Blob as NodeBlob } from "node:buffer";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CanonicalPreviewMedia } from "./canonical-preview-media";
import { useDrawingRecognitionBrowserOcr } from "./drawing-recognition-pdf-ocr";
import { PdmPreviewImageCacheContext } from "./pdm-preview-image-cache-context";
import { createPdmProtectedPdfCache } from "@/lib/pdm-protected-pdf-cache";
import { createPdmPreviewImageCache, createPdmPreviewImageDenials } from "@/lib/pdm-preview-image-cache";

const ocr = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/browser-pdf-ocr", () => ({ runBrowserPdfOcr: ocr.run }));
vi.mock("./pdf-document-viewport", () => ({ PdfDocumentViewport: () => <div data-testid="pdf-viewer">PDF</div> }));
const hash = "a".repeat(64);
const session = { id: "session", status: "review_ready", rowVersion: 1,
  pendingClientAdapters: [{ sourceId: "source", fileName: "A.pdf", contentHash: hash, adapterCode: "browser-pdf-ocr.v1" as const }] };

it("uses one PDF body for the mounted viewer and automatic OCR, with separate authorized GETs", async () => {
  const calls: Array<{ url: string; conditional: boolean; body: number }> = [];
  const bytes = "%PDF-1.7 shared fixture";
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === "POST") return Response.json({ session: { ...session, pendingClientAdapters: [] } });
    const conditional = new Headers(init?.headers).has("if-none-match");
    calls.push({ url, conditional, body: conditional ? 0 : bytes.length });
    return new Response(conditional ? null : bytes, { status: conditional ? 304 : 200,
      headers: { "content-type": "application/pdf", "content-hash": hash } });
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("React", React); vi.stubGlobal("fetch", fetcher); vi.stubGlobal("Blob", NodeBlob);
  ocr.run.mockResolvedValue({ adapterCode: "browser-pdf-ocr.v1", adapterVersion: "1", status: "succeeded", diagnostics: [], observations: [] });
  const cache = createPdmProtectedPdfCache(fetcher);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container), onError = vi.fn(), projected = vi.fn();
  function Ocr() { useDrawingRecognitionBrowserOcr({ session, onError, onProjection: projected }); return null; }
  try {
    await act(async () => root.render(<PdmPreviewImageCacheContext.Provider value={{ cache: createPdmPreviewImageCache(), pdfCache: cache, deniedHrefs: createPdmPreviewImageDenials(), enabled: true }}>
      <CanonicalPreviewMedia media={{ href: "/api/pdm/file-assets/pdf?preview=1", mode: "document", title: "A.pdf", fullPdf: true, contentHash: hash }} />
      <Ocr />
    </PdmPreviewImageCacheContext.Provider>));
    for (let attempt = 0; attempt < 20 && !container.querySelector('[data-testid="pdf-viewer"]'); attempt++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    expect(container.querySelector('[data-testid="pdf-viewer"]'), JSON.stringify({ html: container.innerHTML, calls, errors: onError.mock.calls })).not.toBeNull();
    expect(ocr.run).toHaveBeenCalledOnce(); expect(projected).toHaveBeenCalledOnce(); expect(onError).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
    expect(calls.reduce((sum, call) => sum + call.body, 0)).toBe(bytes.length);
    expect(calls.some(call => call.url.includes("/sources/source/content"))).toBe(true);
    expect(calls.some(call => call.url.includes("/file-assets/pdf"))).toBe(true);
    expect(calls.filter(call => call.conditional)).toHaveLength(1);
  } finally { await act(async () => root.unmount()); cache.clear(); container.remove(); vi.unstubAllGlobals(); }
});
