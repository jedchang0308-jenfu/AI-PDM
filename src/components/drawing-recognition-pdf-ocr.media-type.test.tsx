// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDrawingRecognitionBrowserOcr, type DrawingRecognitionBrowserOcrSession } from "./drawing-recognition-pdf-ocr";

const ocr = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/browser-pdf-ocr", () => ({ runBrowserPdfOcr: ocr.run }));
const session: DrawingRecognitionBrowserOcrSession = { id: "session", status: "review", rowVersion: 3,
  pendingClientAdapters: [{ sourceId: "source", fileName: "drawing.pdf", contentHash: "hash", adapterCode: "browser-pdf-ocr.v1" }] };
let root: Root, container: HTMLDivElement;
const fetchMock = vi.fn<typeof fetch>(), onError = vi.fn(), onProjection = vi.fn();
function Harness() { useDrawingRecognitionBrowserOcr({ session, onError, onProjection }); return null; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  ocr.run.mockResolvedValue({ adapterCode: "browser-pdf-ocr.v1", adapterVersion: "1", status: "succeeded", diagnostics: [], observations: [] });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it.each([
  [" Application/PDF ; charset=binary ", "hash", true],
  ["application/pdfx", "hash", false],
  ["application/octet-stream", "hash", false],
  ["application/pdf; charset=binary", "changed-hash", false]
])("checks response media type and content hash before OCR or submission: %s / %s", async (mimeType, hash, accepted) => {
  fetchMock.mockImplementation(async (_url, init) => init?.method === "POST"
    ? Response.json({ session: { ...session, pendingClientAdapters: [] } })
    : new Response("%PDF-source", { headers: { "content-type": mimeType, "content-hash": hash } }));
  await act(async () => root.render(<Harness />));
  if (accepted) {
    expect(ocr.run).toHaveBeenCalledOnce(); expect(onProjection).toHaveBeenCalledOnce(); expect(onError).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  } else {
    expect(ocr.run).not.toHaveBeenCalled(); expect(onProjection).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(hash === "hash" ? "伺服器回傳的來源不是 PDF。" : "PDF 內容已變更，請重新整理後再辨識。");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  }
});
