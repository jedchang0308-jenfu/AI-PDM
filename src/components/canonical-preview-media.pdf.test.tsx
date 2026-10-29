import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
const hooks = vi.hoisted(() => ({ values: [] as unknown[], effects: [] as Array<() => void | (() => void)>, index: 0, updates: 0 }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => { hooks.updates++; hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  },
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect)
}));
vi.mock("@/components/pdf-page-viewport", () => ({ PdfPageViewport: () => null }));
vi.mock("@/components/pdf-document-viewport", () => ({ PdfDocumentViewport: () => null }));
import { CanonicalPreviewMedia, type CanonicalPreviewMediaModel } from "@/components/canonical-preview-media";
const full: CanonicalPreviewMediaModel = { href: "/protected-pdf?context=work&bindingId=pdf", mode: "document", title: "Current PDF", fullPdf: true };
function render(media = full, interactive = true, compact = false) {
  hooks.index = 0;
  return CanonicalPreviewMedia({ media, interactive, compact }) as ReactElement<Record<string, unknown>>;
}
async function ready() { await vi.waitFor(() => expect(hooks.values[3]).toBe("ready")); }
function servePdf() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("%PDF-1.7\nprotocol-only", { headers: { "content-type": "application/pdf" } })));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:owned-pdf");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); hooks.values.length = 0; hooks.effects.length = 0; hooks.index = 0; hooks.updates = 0; });

describe("DEV122 B42 full PDF presentation and lifetime; captured fetch hooks, not PDF.js rendering", () => {
  it("bounds a hung protected PDF read and ignores a response arriving after the deadline", async () => {
    vi.useFakeTimers(); let respond!: (response: Response) => void;
    const fetch = vi.fn((_href: string, _options: RequestInit) => new Promise<Response>(resolve => { respond = resolve; }));
    vi.stubGlobal("fetch", fetch); render(); const cleanup = hooks.effects[0]();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true); expect(hooks.values[3]).toBe("failed"); expect(hooks.values[5]).toContain("逾時");
    const updates = hooks.updates; respond(new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } }));
    await vi.advanceTimersByTimeAsync(0); expect(hooks.updates).toBe(updates);
    if (typeof cleanup === "function") cleanup(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    [422, "application/json", JSON.stringify({ error: { retryable: false } })],
    [200, "image/png", "%PDF-1.7"],
    [200, "application/pdf", "<html>failure"]
  ])("clears the read deadline after a terminal PDF response (%s, %s)", async (status, mime, bytes) => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status, headers: { "content-type": mime } })));
    render(); const cleanup = hooks.effects[0]();
    await vi.waitFor(() => expect(hooks.values[3]).toBe("failed"));
    const reason = hooks.values[5]; expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000); expect(hooks.values[5]).toBe(reason);
    if (typeof cleanup === "function") cleanup();
  });
  it("passes the complete PDF bytes to the document viewer with a separate open link", async () => {
    servePdf(); render(); const cleanup = hooks.effects[0](); await ready();
    const tree = render(); expect(tree.type).toBe("div"); expect(tree.props["data-preview-full-pdf"]).toBe("true");
    const [viewer, link] = tree.props.children as ReactElement<Record<string, unknown>>[];
    expect(viewer.props.bytes).toBeInstanceOf(ArrayBuffer); expect(viewer.props.sourceKey).toBe(full.href); expect(viewer.props.showControls).toBe(false); expect(viewer.props.fitPage).toBe(true); expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(link.type).toBe("a"); expect(link.props.href).toContain("bindingId=pdf");
    if (typeof cleanup === "function") cleanup();
  });
  it.each([["image/png", "%PDF-1.7"], ["application/pdf", "<html>failure"], ["application/pdf", ""]])("rejects non-PDF content instead of presenting a full drawing: %s", async (mime, bytes) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { headers: { "content-type": mime } })));
    const create = vi.spyOn(URL, "createObjectURL"); render(); const cleanup = hooks.effects[0]();
    await vi.waitFor(() => expect(hooks.values[3]).toBe("failed"));
    expect(create).not.toHaveBeenCalled(); expect(hooks.values[5]).toContain("PDF");
    if (typeof cleanup === "function") cleanup();
  });
  it("aborts only its owned request and rejects a late response after unmount", async () => {
    let respond!: (response: Response) => void;
    const fetch = vi.fn((_href: string, _options: RequestInit) => new Promise<Response>(resolve => { respond = resolve; }));
    vi.stubGlobal("fetch", fetch); const create = vi.spyOn(URL, "createObjectURL"); render(); const cleanup = hooks.effects[0]();
    const signal = fetch.mock.calls[0][1].signal; expect(signal?.aborted).toBe(false);
    if (typeof cleanup === "function") cleanup(); expect(signal?.aborted).toBe(true);
    const updates = hooks.updates; respond(new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } }));
    await new Promise(resolve => setTimeout(resolve, 0)); expect(hooks.updates).toBe(updates); expect(create).not.toHaveBeenCalled();
  });
  it("rejects a late evidence ArrayBuffer after unmount", async () => {
    let resolveBytes!: (bytes: ArrayBuffer) => void;
    const blob = { type: "application/pdf", arrayBuffer: vi.fn(() => new Promise<ArrayBuffer>(resolve => { resolveBytes = resolve; })) };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, blob: async () => blob })));
    render({ ...full, fullPdf: false, renderPdfPage: true, pageNumber: 2 }); const cleanup = hooks.effects[0]();
    await vi.waitFor(() => expect(blob.arrayBuffer).toHaveBeenCalledOnce());
    if (typeof cleanup === "function") cleanup(); const updates = hooks.updates; resolveBytes(new ArrayBuffer(8));
    await new Promise(resolve => setTimeout(resolve, 0)); expect(hooks.updates).toBe(updates); expect(hooks.values[1]).toBeNull();
  });
  it("does not render a previous blob under a new source and revokes its owned URL", async () => {
    servePdf(); const legacy = { ...full, fullPdf: false }; render(legacy); const cleanup = hooks.effects[0](); await ready();
    const tree = render({ ...legacy, href: "/protected-pdf?bindingId=other" });
    expect(tree.props["data-preview-full-pdf"]).toBeUndefined(); expect(tree.props["data-preview-state"]).toBe("pending");
    if (typeof cleanup === "function") cleanup(); expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:owned-pdf");
  });
  it("keeps evidence on its exact PdfPageViewport page", async () => {
    servePdf(); const media = { ...full, renderPdfPage: true, pageNumber: 2, focusRegion: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } };
    render(media); const cleanup = hooks.effects[0](); await ready(); const tree = render(media);
    expect(tree.type).toBe("a"); const page = tree.props.children as ReactElement<Record<string, unknown>>;
    expect(page.props.pageNumber).toBe(2); expect(page.props.focusRegion).toEqual(media.focusRegion); expect(URL.createObjectURL).not.toHaveBeenCalled();
    if (typeof cleanup === "function") cleanup();
  });
  it("keeps a compact noninteractive gallery as a compact preview", async () => {
    servePdf(); render(full, false, true); const cleanup = hooks.effects[0](); await ready(); const tree = render(full, false, true);
    expect(tree.type).toBe("span"); const viewer = tree.props.children as ReactElement<Record<string, unknown>>;
    expect(viewer.props.showControls).toBe(false); expect(viewer.props.bytes).toBeInstanceOf(ArrayBuffer);
    if (typeof cleanup === "function") cleanup();
  });
});
