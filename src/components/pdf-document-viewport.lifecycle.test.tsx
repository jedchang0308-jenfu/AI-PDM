import { afterEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as Array<{ current: unknown }>, effects: [] as Array<() => void | (() => void)>, stateIndex: 0, refIndex: 0, resize: null as null | (() => void), renders: 0, cancels: 0, disconnects: 0, destroys: 0 }));
vi.mock("react", () => ({
  useState: (initial: unknown) => { const i = harness.stateIndex++; if (!(i in harness.values)) harness.values[i] = initial; return [harness.values[i], (next: unknown) => { harness.values[i] = typeof next === "function" ? next(harness.values[i]) : next; }]; },
  useRef: (initial: unknown) => { const i = harness.refIndex++; harness.refs[i] ??= { current: initial }; return harness.refs[i]; },
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect)
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({ destroy: async () => { harness.destroys++; }, promise: Promise.resolve({ numPages: 2, getPage: async () => ({ getViewport: () => ({ width: 842, height: 595 }), cleanup: () => undefined, render: () => { harness.renders++; return { cancel: () => { harness.cancels++; }, promise: new Promise<void>(() => undefined) }; } }) }) })
}));
import { PdfDocumentViewport } from "@/components/pdf-document-viewport";
function render() { harness.stateIndex = 0; harness.refIndex = 0; harness.effects.length = 0; PdfDocumentViewport({ bytes: new ArrayBuffer(8), sourceKey: "owned", title: "Drawing" }); }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); harness.values.length = 0; harness.refs.length = 0; harness.effects.length = 0; harness.resize = null; harness.renders = 0; harness.cancels = 0; harness.disconnects = 0; harness.destroys = 0; });

describe("PDF document owned render lifetime with captured hooks and a stalled PDF.js task", () => {
  it("ignores duplicate ResizeObserver measurements instead of cancelling the active render", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout, devicePixelRatio: 1, requestAnimationFrame: (callback: () => void) => setTimeout(callback, 16), cancelAnimationFrame: clearTimeout });
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { harness.resize = callback; } observe() {} disconnect() { harness.disconnects++; } });
    render(); harness.refs[0].current = { clientWidth: 400 }; harness.refs[1].current = { style: {}, getContext: () => ({}) };
    const disposeDocument = harness.effects[0](); await vi.advanceTimersByTimeAsync(0);
    render(); const disposeRender = harness.effects[1](); await vi.advanceTimersByTimeAsync(16);
    expect(harness.renders).toBe(1); expect(harness.cancels).toBe(0);
    harness.resize?.(); await vi.advanceTimersByTimeAsync(16);
    expect(harness.renders).toBe(1); expect(harness.cancels).toBe(0);
    if (typeof disposeRender === "function") disposeRender(); if (typeof disposeDocument === "function") disposeDocument();
  });
  it("cleans its observer and queued frame when the first animation frame is delayed beyond the deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout, devicePixelRatio: 1, requestAnimationFrame: (callback: () => void) => setTimeout(callback, 100_000), cancelAnimationFrame: clearTimeout });
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { harness.resize = callback; } observe() {} disconnect() { harness.disconnects++; } });
    render(); harness.refs[0].current = { clientWidth: 400 }; harness.refs[1].current = { style: {}, getContext: () => ({}) };
    const disposeDocument = harness.effects[0](); await vi.advanceTimersByTimeAsync(0);
    render(); const disposeRender = harness.effects[1](); await vi.advanceTimersByTimeAsync(0);
    expect(harness.renders).toBe(0); expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(60_000); expect(harness.values[4]).toBe("failed"); expect(harness.disconnects).toBe(1);
    expect(vi.getTimerCount()).toBe(0); harness.resize?.(); expect(vi.getTimerCount()).toBe(0);
    if (typeof disposeRender === "function") disposeRender(); if (typeof disposeDocument === "function") disposeDocument();
    expect(harness.destroys).toBe(1);
  });
  it("keeps a render timeout terminal even if a late ResizeObserver event arrives", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout, devicePixelRatio: 1, requestAnimationFrame: (callback: () => void) => setTimeout(callback, 16), cancelAnimationFrame: clearTimeout });
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { harness.resize = callback; } observe() {} disconnect() { harness.disconnects++; } });
    render(); harness.refs[0].current = { clientWidth: 400 }; harness.refs[1].current = { style: {}, getContext: () => ({}) };
    const disposeDocument = harness.effects[0](); await vi.advanceTimersByTimeAsync(0);
    render(); const disposeRender = harness.effects[1](); await vi.advanceTimersByTimeAsync(16); expect(harness.renders).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000); expect(harness.values[4]).toBe("failed"); expect(harness.disconnects).toBeGreaterThan(0);
    harness.resize?.(); await vi.advanceTimersByTimeAsync(16); expect(harness.values[4]).toBe("failed"); expect(harness.renders).toBe(1);
    if (typeof disposeRender === "function") disposeRender(); if (typeof disposeDocument === "function") disposeDocument();
    expect(harness.destroys).toBe(1); expect(vi.getTimerCount()).toBe(0);
  });
});
