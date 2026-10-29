// @vitest-environment jsdom
import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPdmPermissionStore, pdmPermissionFetch, invalidatePdmPermissions } from "@/lib/pdm-permission-client";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { PdmPermissionProvider, usePdmPermissions } from "./pdm-permission-provider";

const navigation = vi.hoisted(() => ({ pathname: "/parts" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

export const projection = (allow = true) => ({
  contractVersion: "ai-pdm.frontend-permission-projection.v1", applicationId: "ai-pdm",
  generatedAt: "2026-10-28T00:00:00.000Z",
  pages: Object.fromEntries(NUMBERING_PAGE_PERMISSION_CODES.map(code => [code, allow])),
  actions: Object.fromEntries(NUMBERING_ACTION_PERMISSION_CODES.map(code => [code, allow]))
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  navigation.pathname = "/parts";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function Consumer({ label = "create" }: { label?: string }) {
  const { state, allowsAction, retry } = usePdmPermissions();
  return <button onClick={retry} data-state={state.kind} disabled={!allowsAction("numbering.create")}>{label}</button>;
}
async function render(label = "create") {
  await act(async () => root.render(<StrictMode><PdmPermissionProvider><Consumer label={label} /><Consumer /></PdmPermissionProvider></StrictMode>));
}
describe("app-shell permission ownership", () => {
  it("clears display data on writes (even unknown outcomes) and logout without reusing a previous account", async () => {
    let cache!: ReturnType<typeof usePdmPermissions>["workbenchCache"];
    function Capture() {
      const value = usePdmPermissions().workbenchCache;
      React.useEffect(() => { cache = value; }, [value]);
      return null;
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== "/api/numbering/permissions") throw new Error("connection lost");
      return json(projection());
    });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<PdmPermissionProvider><Capture /></PdmPermissionProvider>));
    const data = { groups: [], nextCursor: null, previousCursor: null, totalGroups: 0, totalRows: 0 };
    cache.writeList("/api/parts/workbench", data, cache.generation());
    await act(async () => {
      await expect(pdmPermissionFetch("/api/pdm/work", { method: "POST" })).rejects.toThrow("connection lost");
    });
    expect(cache.readList("/api/parts/workbench")).toBeNull();
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/numbering/permissions")).toHaveLength(1);
    let finishWrite!: (response: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { finishWrite = resolve; }));
    await act(async () => {
      const write = pdmPermissionFetch("/api/pdm/work", { method: "POST" });
      cache.writeList("/api/parts/workbench", data, cache.generation());
      finishWrite(json({}));
      await write;
    });
    expect(cache.readList("/api/parts/workbench")).toBeNull();
    cache.writeList("/api/parts/workbench", data, cache.generation());
    await act(async () => invalidatePdmPermissions("logout"));
    expect(cache.readList("/api/parts/workbench")).toBeNull();
  });
  it("deduplicates StrictMode and concurrent consumers; three route changes reuse the projection", async () => {
    const fetcher = vi.fn(async () => json(projection())); vi.stubGlobal("fetch", fetcher);
    await render();
    for (const pathname of ["/numbering/drawings", "/numbering/approvals", "/parts"]) { navigation.pathname = pathname; await render(pathname); }
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("button:disabled")).toHaveLength(0);
  });
  it("distinguishes denied, unauthenticated and unavailable; retries only explicitly", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json(projection(false)));
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("無法確認");
    await act(async () => invalidatePdmPermissions("permissions-changed"));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("button")?.dataset.state).toBe("ready");
    expect(container.querySelector("button")?.disabled).toBe(true);
    await act(async () => invalidatePdmPermissions("unauthenticated"));
    expect(container.querySelector("button")?.dataset.state).toBe("unauthenticated");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("clears A before public auth page, ignores A's late response and loads B once", async () => {
    let resolveA!: (r: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveA = resolve; }))
      .mockResolvedValueOnce(json(projection(false)));
    vi.stubGlobal("fetch", fetcher);
    await render();
    navigation.pathname = "/login"; await render();
    navigation.pathname = "/parts"; await render();
    await act(async () => resolveA(json(projection(true))));
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(container.querySelector("button")?.dataset.state).toBe("ready");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("a rejected mutation refreshes the projection once without replaying the command", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/numbering/permissions"
      ? json(projection()) : json({ code: "permission_not_granted" }, 403));
    vi.stubGlobal("fetch", fetcher); await render();
    await act(async () => { const response = await pdmPermissionFetch("/api/pdm/test", { method: "POST", body: "{}" }); expect(response.status).toBe(403); });
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/pdm/test")).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/numbering/permissions")).toHaveLength(2);
  });
});
describe("store failure and lifecycle boundaries", () => {
  it("a first 403 replaces an older in-flight projection; concurrent 403s share the replacement", async () => {
    let finishOld!: (response: Response) => void;
    let finishRefresh!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finishRefresh = resolve; }));
    const store = createPdmPermissionStore(fetcher);
    try {
      const oldFlight = store.ensure();
      store.invalidate("forbidden");
      store.invalidate("forbidden");
      expect(fetcher).toHaveBeenCalledTimes(2);
      finishRefresh(json(projection(false)));
      await store.ensure();
      finishOld(json(projection(true)));
      await oldFlight;
      expect(store.getSnapshot()).toMatchObject({ kind: "ready", projection: { actions: { "numbering.create": false } } });
    } finally { store.dispose(); }
  });
  it.each([401, 403, 503])("classifies permission endpoint HTTP %i without manufacturing a denied projection", async status => {
    const store = createPdmPermissionStore(vi.fn(async () => json({}, status)));
    await store.ensure(); expect(store.getSnapshot().kind).toBe(status === 401 ? "unauthenticated" : "unavailable"); store.dispose();
  });
  it("rejects incomplete or wrong-app contracts", async () => {
    const store = createPdmPermissionStore(vi.fn(async () => json({ ...projection(), applicationId: "orgmaster" })));
    await store.ensure(); expect(store.getSnapshot()).toMatchObject({ kind: "unavailable", code: "permission_contract_mismatch" }); store.dispose();
  });
  it("times out even when the dependency ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const store = createPdmPermissionStore(vi.fn(() => new Promise<Response>(() => {})), 50);
    void store.ensure(); await vi.advanceTimersByTimeAsync(50);
    expect(store.getSnapshot()).toMatchObject({ kind: "unavailable", code: "permission_timeout" }); store.dispose();
  });
  it("disposed requests cannot restore a stale grant", async () => {
    let finish!: (r: Response) => void;
    const store = createPdmPermissionStore(vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const pending = store.ensure(); store.dispose(); finish(json(projection())); await pending;
    expect(store.getSnapshot().kind).toBe("unauthenticated");
  });
});
