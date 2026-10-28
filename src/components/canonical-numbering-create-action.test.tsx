// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
const permission = vi.hoisted(() => ({ kind: "loading", allowed: false, retry: vi.fn() }));
vi.mock("@/components/pdm-permission-provider", () => ({
  usePdmPermissions: () => ({ state: { kind: permission.kind }, allowsAction: () => permission.allowed, retry: permission.retry })
}));
import { CanonicalNumberingCreateAction } from "./canonical-numbering-create-action";
afterEach(() => { permission.kind = "loading"; permission.allowed = false; });
describe("create action consumes the shell projection", () => {
  it("preserves its label while loading without mounting a request", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const html = renderToStaticMarkup(<CanonicalNumberingCreateAction surface="drawing" />);
    expect(html).toContain("建立編號"); expect(html).not.toContain("確認權限中…");
    expect(html).toContain('aria-busy="true"'); expect(fetcher).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
  it("provides the canonical link only when allowed", () => {
    permission.kind = "ready"; permission.allowed = true;
    expect(renderToStaticMarkup(<CanonicalNumberingCreateAction surface="drawing" />)).toContain("/numbering/create?from=drawing");
  });
  it("distinguishes a denial from an unavailable dependency", () => {
    permission.kind = "ready";
    expect(renderToStaticMarkup(<CanonicalNumberingCreateAction surface="part" />)).toContain("沒有建立編號權限");
    permission.kind = "unavailable";
    const html = renderToStaticMarkup(<CanonicalNumberingCreateAction surface="part" />);
    expect(html).toContain("重試權限"); expect(html).not.toContain("沒有建立編號權限");
  });
});
