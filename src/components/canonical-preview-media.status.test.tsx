// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/pdf-page-viewport", () => ({ PdfPageViewport: () => null }));
vi.mock("@/components/pdf-document-viewport", () => ({ PdfDocumentViewport: () => null }));

import { CanonicalPreviewMedia } from "./canonical-preview-media";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("explains a disconnected Windows preview worker and offers a result refresh", async () => {
  const read = vi.fn(async () => Response.json({
    error: { code: "PREVIEW_FAILED", jobErrorCode: "preview_worker_unavailable", retryable: false }
  }, { status: 409, headers: { "x-pdm-preview-state": "failed" } }));
  vi.stubGlobal("fetch", read);

  await act(async () => root.render(<CanonicalPreviewMedia media={{ href: "/private-preview", mode: "image", title: "圖面" }} />));

  expect(host.textContent).toContain("Windows 預覽服務目前未連線");
  expect(Array.from(host.querySelectorAll("button")).some(button => button.textContent === "重新讀取結果")).toBe(true);
  expect(read).toHaveBeenCalledOnce();
});

it("bounds a hung non-PDF preview request", async () => {
  let signal: AbortSignal | null | undefined;
  const read = vi.fn((_href: unknown, init?: RequestInit) => {
    signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  });
  vi.stubGlobal("fetch", read);

  await act(async () => root.render(<CanonicalPreviewMedia media={{ href: "/private-preview", mode: "image", title: "圖面" }} />));
  await act(async () => vi.advanceTimersByTimeAsync(20_000));

  expect(signal?.aborted).toBe(true);
  expect(host.textContent).toContain("預覽服務回應逾時");
  expect(vi.getTimerCount()).toBe(0);
});

it("falls back to the current PNG after the uploaded PDF cannot be read", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fallback");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const read = vi.fn(async (href: string) => href.includes("current.pdf")
    ? Response.json({ error: { code: "PREVIEW_FAILED", retryable: false } }, { status: 409, headers: { "x-pdm-preview-state": "failed" } })
    : new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }));
  vi.stubGlobal("fetch", read);

  await act(async () => root.render(<CanonicalPreviewMedia media={{
    href: "/current.pdf", mode: "document", title: "完整 PDF", fullPdf: true,
    fallback: { href: "/current-slddrw-preview", mode: "image", title: "簡易預覽" },
    fallbackNotice: "已改用本版簡易預覽。"
  }} />));

  expect(host.textContent).toContain("已改用本版簡易預覽");
  expect(host.querySelector("img")?.getAttribute("src")).toBe("blob:fallback");
  expect(read).toHaveBeenCalledTimes(2);
});
