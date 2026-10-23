// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/pdf-page-viewport", () => ({ PdfPageViewport: () => null }));
vi.mock("@/components/pdf-document-viewport", () => ({ PdfDocumentViewport: () => null }));
import { CanonicalPreviewMedia } from "./canonical-preview-media";
let root: Root, host: HTMLDivElement;
const cancelled = () => Response.json({ error: { code: "PREVIEW_CANCELLED", retryable: false, message: "預覽已取消；可下載原檔。" } },
  { status: 409, headers: { "x-pdm-preview-state": "cancelled" } });
beforeEach(() => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("renders cancelled as terminal and never polls it again", async () => {
  const read = vi.fn(async () => cancelled()); vi.stubGlobal("fetch", read);
  await act(async () => root.render(<CanonicalPreviewMedia media={{ href: "/private-preview", mode: "image", title: "圖面" }} />));
  expect(host.textContent).toContain("預覽已取消；可下載原檔。"); expect(read).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(120000));
  expect(read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("stops a pending mounted poll when the next response is cancelled", async () => {
  const read = vi.fn().mockResolvedValueOnce(Response.json({ error: { retryable: true } },
    { status: 202, headers: { "x-pdm-preview-state": "pending" } })).mockImplementation(async () => cancelled());
  vi.stubGlobal("fetch", read);
  await act(async () => root.render(<CanonicalPreviewMedia media={{ href: "/private-preview", mode: "image", title: "圖面" }} />));
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(host.textContent).toContain("預覽已取消"); expect(read).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(60000)); expect(read).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
it("is quiet after unmount, including a late cancelled response", async () => {
  let deliver!: (response: Response) => void;
  const read = vi.fn(() => new Promise<Response>(resolve => { deliver = resolve; })); vi.stubGlobal("fetch", read);
  await act(async () => root.render(<CanonicalPreviewMedia media={{ href: "/private-preview", mode: "image", title: "圖面" }} />));
  await act(async () => root.unmount());
  await act(async () => { deliver(cancelled()); await vi.advanceTimersByTimeAsync(60000); });
  expect(read).toHaveBeenCalledOnce(); expect(host.textContent).toBe(""); expect(vi.getTimerCount()).toBe(0);
});
