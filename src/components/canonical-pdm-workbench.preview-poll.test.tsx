import { afterEach, describe, expect, it, vi } from "vitest";

// Captures the imported component's hooks and invokes its own load/effects.
// This is a component lifetime unit test, not a mounted DOM/HTTP/production test.
const runtime = vi.hoisted(() => ({ current: null as any }));
vi.mock("react", () => ({
  useState: (initial: unknown) => runtime.current.state(initial),
  useRef: (initial: unknown) => runtime.current.ref(initial),
  useMemo: (fn: () => unknown, deps: unknown[]) => runtime.current.memo(fn, deps),
  useCallback: (fn: unknown, deps: unknown[]) => runtime.current.callback(fn, deps),
  useEffect: (fn: unknown, deps: unknown[]) => runtime.current.effects.push({ fn, deps }),
  useId: () => "dev122-poll-fixture",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/pdm-detail-drawer", () => ({ useRememberedDrawerWidth: () => ({ drawerWidth: 480, startDrawerResize: vi.fn() }) }));
vi.mock("@/components/use-list-keyboard-shortcuts", () => ({ useListKeyboardShortcuts: () => ({ shortcuts: "", handleKeyDown: vi.fn() }) }));
// Children are not mounted in this hook-layer test; keep their server imports out.
vi.mock("@/components/drawing-detail-preview", () => ({ DrawingDetailPreview: () => null }));
vi.mock("@/components/pdm-entity-detail-drawer", () => ({ PdmEntityDetailDrawer: () => null }));
vi.mock("@/components/canonical-pdm-preview-gallery", () => ({ CanonicalEntityPreviewGallery: () => null, CanonicalPreviewThumbnail: () => null }));
vi.mock("@/components/canonical-preview-panel", () => ({ CanonicalPreviewPanel: () => null }));
vi.mock("@/components/part-preview-source-control", () => ({ PartPreviewSourceControl: () => null }));
vi.mock("@/components/canonical-part-preview-section", () => ({ CanonicalPartPreviewSection: () => null }));
vi.mock("@/components/canonical-relation-matrix-section", () => ({ CanonicalRelationMatrixSection: () => null }));
vi.mock("@/components/canonical-numbering-create-action", () => ({ CanonicalNumberingCreateAction: () => null }));
import { CanonicalPdmWorkbench } from "./canonical-pdm-workbench";

const same = (a: unknown[] | undefined, b: unknown[]) => Boolean(a && a.length === b.length && a.every((v, i) => Object.is(v, b[i])));
const row = { rowKey: "dev122-poll-row", entityId: "dev122-owned-drawing", entityType: "drawing", code: "DEV122", name: "Polling fixture", layer: "rd", actions: [] };
function payload(state: string, marker = "unchanged") {
  return { data: { groups: [{ rows: [{ ...row, name: marker }] }], previewByRowKey: { [row.rowKey]: { state, media: null } }, nextCursor: null, previousCursor: null }, meta: { contractToken: "dev122-owned" } };
}
const response = (state = "pending", marker?: string) => new Response(JSON.stringify(payload(state, marker)), { status: 200 });
function findNode(node: any, test: (props: any) => boolean): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map(n => findNode(n, test)).find(Boolean);
  if (node.props && test(node.props)) return node;
  return findNode(node.props?.children, test);
}

function harness() {
  const values: any[] = [], refs: any[] = [], memos: any[] = [], callbacks: any[] = [];
  let s = 0, r = 0, m = 0, c = 0;
  let poll: any, lifetime: any, tree: any;
  const listeners = new Set<() => void>();
  const document = { visibilityState: "visible", addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { setTimeout, clearTimeout, location: { href: "https://dev122.invalid/numbering/drawings" }, history: { replaceState: vi.fn(), pushState: vi.fn() }, localStorage: { setItem: vi.fn(), getItem: () => null } });
  const h: any = {
    effects: [] as any[], load: null,
    state(initial: unknown) { const i = s++; if (!(i in values)) values[i] = initial; return [values[i], (v: any) => { values[i] = typeof v === "function" ? v(values[i]) : v; }]; },
    ref(initial: unknown) { const i = r++; return refs[i] ??= { current: initial }; },
    memo(fn: () => unknown, deps: unknown[]) { const i = m++; if (!same(memos[i]?.deps, deps)) memos[i] = { deps, value: fn() }; return memos[i].value; },
    callback(fn: unknown, deps: unknown[]) { const i = c++; if (!same(callbacks[i]?.deps, deps)) callbacks[i] = { deps, value: fn }; if (deps.length === 2 && typeof deps[0] === "string" && deps[0].startsWith("/api/") && typeof deps[1] === "boolean") h.load = callbacks[i].value; return callbacks[i].value; },
    render(replay = false) {
      runtime.current = h; s = r = m = c = 0; h.effects = [];
      tree = CanonicalPdmWorkbench({ entityType: "drawing" });
      const nextLifetime = h.effects.find((e: any) => e.deps?.length === 1 && e.deps[0] === h.load);
      const nextPoll = h.effects.find((e: any) => [6, 7, 8].includes(e.deps?.length) && e.deps[2] === h.load);
      if (nextLifetime && (!same(lifetime?.deps, nextLifetime.deps) || replay)) { lifetime?.cleanup?.(); lifetime = { ...nextLifetime, cleanup: nextLifetime.fn() }; }
      if (!same(poll?.deps, nextPoll.deps) || replay) { poll?.cleanup?.(); poll = { ...nextPoll, cleanup: nextPoll.fn() }; }
      return tree;
    },
    layout(value: string) { findNode(tree, p => typeof p.onChange === "function" && ["list", "list_3d", "preview"].includes(p.value)).props.onChange(value); h.render(); },
    visibility(value: string) { document.visibilityState = value; for (const fn of [...listeners]) fn(); },
    unmount() { poll?.cleanup?.(); lifetime?.cleanup?.(); },
    text() { return JSON.stringify(tree, (_, v) => typeof v === "function" ? undefined : v); },
    listeners,
  };
  h.render();
  return h;
}
async function start(state = "pending") {
  vi.useFakeTimers();
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(state)); vi.stubGlobal("fetch", fetch);
  const h = harness(); await h.load(); h.render(); h.layout("list_3d");
  return { h, fetch };
}
afterEach(() => { runtime.current?.unmount(); runtime.current = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("DEV122 imported workbench list polling lifetime (captured hooks)", () => {
  it.each(["pending", "delayed"])("%s stops after 30 actual background starts, including equivalent rerenders", async state => {
    const { h, fetch } = await start(state);
    for (let i = 0; i < 30; i++) { await vi.advanceTimersByTimeAsync(state === "pending" ? 2500 : 5000); h.render(); }
    expect(fetch).toHaveBeenCalledTimes(31); // one foreground + thirty background
    expect(vi.getTimerCount()).toBe(0);
    expect(h.text()).toContain("自動刷新已停止");
    h.visibility("hidden"); h.visibility("visible"); h.layout("preview"); h.render(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetch).toHaveBeenCalledTimes(31); expect(vi.getTimerCount()).toBe(0);
    await h.load(); h.render(); await vi.advanceTimersByTimeAsync(state === "pending" ? 2500 : 5000);
    expect(fetch).toHaveBeenCalledTimes(33); // explicit foreground opens a new episode
  });

  it("foreground cursor reload before exhaustion reopens polling even when loading renders are batched", async () => {
    const { h, fetch } = await start();
    await vi.advanceTimersByTimeAsync(2500); h.render();
    expect(fetch).toHaveBeenCalledTimes(2);
    await h.load("fresh-owned-cursor", "before"); h.render();
    await vi.advanceTimersByTimeAsync(2500);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[3][0]).toContain("cursor=fresh-owned-cursor&direction=before");
  });

  it("30th start aborted by layout exit still reports the exhausted budget on re-entry", async () => {
    const { h, fetch } = await start();
    for (let i = 0; i < 29; i++) { await vi.advanceTimersByTimeAsync(2500); h.render(); }
    let resolve!: (value: Response) => void;
    fetch.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(2500);
    expect(fetch).toHaveBeenCalledTimes(31);
    const signal = fetch.mock.calls[30][1]!.signal!;
    h.layout("list"); expect(signal.aborted).toBe(true);
    resolve(response()); await vi.advanceTimersByTimeAsync(0); h.render(); h.layout("preview");
    expect(h.text()).toContain("自動刷新已停止");
    await vi.advanceTimersByTimeAsync(30_000); expect(fetch).toHaveBeenCalledTimes(31); expect(vi.getTimerCount()).toBe(0);
  });

  it("visibility return during an unresolved GET creates no overlapping request or second timer chain", async () => {
    const { h, fetch } = await start();
    let resolve!: (value: Response) => void;
    fetch.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(2500); expect(fetch).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 4; i++) { h.visibility("hidden"); h.visibility("visible"); }
    expect(fetch).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    resolve(response()); await vi.advanceTimersByTimeAsync(0); h.render();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2500); expect(fetch).toHaveBeenCalledTimes(3); expect(vi.getTimerCount()).toBe(1);
  });

  it("pending/delayed and layout transitions preserve the episode budget; hidden callbacks consume none", async () => {
    const { h, fetch } = await start();
    h.visibility("hidden"); await vi.advanceTimersByTimeAsync(20_000); expect(fetch).toHaveBeenCalledTimes(1);
    h.visibility("visible"); await vi.advanceTimersByTimeAsync(0); h.render();
    fetch.mockImplementation(async () => response("delayed"));
    await vi.advanceTimersByTimeAsync(2500); h.render(); h.layout("list");
    expect(vi.getTimerCount()).toBe(0); expect(h.listeners.size).toBe(0);
    h.layout("preview");
    for (let i = 0; i < 28; i++) { await vi.advanceTimersByTimeAsync(5000); h.render(); }
    expect(fetch).toHaveBeenCalledTimes(31); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["failed", "missing", "unavailable"])("terminal %s clears its timer and listener", async state => {
    const { h, fetch } = await start(); fetch.mockImplementationOnce(async () => response(state));
    await vi.advanceTimersByTimeAsync(2500); h.render();
    expect(vi.getTimerCount()).toBe(0); expect(h.listeners.size).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("a failed list GET stops polling", async () => {
    const { h, fetch } = await start(); fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { message: "Owned fixture failure" } }), { status: 503 }));
    await vi.advanceTimersByTimeAsync(2500); h.render();
    expect(vi.getTimerCount()).toBe(0); expect(h.listeners.size).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("new foreground cursor/direction rejects the old background completion and preserves its own controller", async () => {
    const { h, fetch } = await start(); let oldResolve!: (value: Response) => void;
    fetch.mockImplementationOnce(() => new Promise<Response>(done => { oldResolve = done; }));
    await vi.advanceTimersByTimeAsync(2500);
    const oldSignal = fetch.mock.calls[1][1]!.signal!;
    let newResolve!: (value: Response) => void;
    fetch.mockImplementationOnce(() => new Promise<Response>(done => { newResolve = done; }));
    const foreground = h.load("next-owned-page", "before"); h.render();
    const newSignal = fetch.mock.calls[2][1]!.signal!;
    expect(oldSignal.aborted).toBe(true); expect(newSignal.aborted).toBe(false);
    oldResolve(response("pending", "STALE_PAYLOAD")); await vi.advanceTimersByTimeAsync(0); h.render();
    expect(h.text()).not.toContain("STALE_PAYLOAD"); expect(newSignal.aborted).toBe(false); expect(vi.getTimerCount()).toBe(0);
    newResolve(response("pending", "CURRENT_PAGE")); await foreground; h.render();
    expect(h.text()).toContain("CURRENT_PAGE"); expect(fetch.mock.calls[2][0]).toContain("cursor=next-owned-page&direction=before");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("unmount aborts only its request, rejects late payload, and releases timer/listener", async () => {
    const { h, fetch } = await start(); let resolve!: (value: Response) => void;
    fetch.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(2500); const signal = fetch.mock.calls[1][1]!.signal!;
    h.unmount(); expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0); expect(h.listeners.size).toBe(0);
    resolve(response("pending", "AFTER_UNMOUNT")); await vi.advanceTimersByTimeAsync(0);
    expect(h.text()).not.toContain("AFTER_UNMOUNT"); expect(vi.getTimerCount()).toBe(0); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
