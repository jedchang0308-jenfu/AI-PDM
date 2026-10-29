// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { invalidatePdmPermissions } from "@/lib/pdm-permission-client";
import type { CanonicalWorkbenchListDto } from "@/lib/pdm-canonical-workbench-contract";

vi.mock("next/navigation", () => ({ usePathname: () => "/parts", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/pdm-detail-drawer", () => ({ useRememberedDrawerWidth: () => ({ drawerWidth: 480, startDrawerResize: vi.fn() }) }));
vi.mock("@/components/drawing-detail-preview", () => ({ DrawingDetailPreview: () => null }));
vi.mock("@/components/pdm-entity-detail-drawer", () => ({ PdmEntityDetailDrawer: () => null }));
vi.mock("@/components/canonical-pdm-preview-gallery", () => ({ CanonicalEntityPreviewGallery: () => null, CanonicalPreviewThumbnail: () => null }));
vi.mock("@/components/canonical-preview-panel", () => ({ CanonicalPreviewPanel: () => null }));
vi.mock("@/components/part-preview-source-control", () => ({ PartPreviewSourceControl: () => null }));
vi.mock("@/components/canonical-part-preview-section", () => ({ CanonicalPartPreviewSection: () => null }));
vi.mock("@/components/canonical-relation-matrix-section", () => ({ CanonicalRelationMatrixSection: () => null }));
vi.mock("@/components/canonical-numbering-create-action", () => ({ CanonicalNumberingCreateAction: () => null }));
import { CanonicalPdmWorkbench } from "./canonical-pdm-workbench";
import { PdmPermissionProvider } from "./pdm-permission-provider";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function list(name: string): CanonicalWorkbenchListDto {
  return { data: { groups: [{ groupKey: "part", rows: [{
    rowKey: "cw_navigation", entityType: "part", entityId: "navigation", code: "NAV-001", name,
    layer: "formal", layerLabel: "主檔", revision: null, dataState: "available", dataStateLabel: "可使用",
    handling: "none", handlingLabel: "無須處理", blockerReason: null, detailHref: "/parts?detail=cw_navigation",
    rowVersion: 1, basisState: null, actions: []
  }] }], nextCursor: null, previousCursor: null, totalGroups: 1, totalRows: 1 },
    meta: { contractToken: "fresh-only", correlationId: "navigation" } };
}
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/parts");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render(visible = true) {
  await act(async () => root.render(<PdmPermissionProvider>{visible ? <CanonicalPdmWorkbench entityType="part" /> : <div>另一頁</div>}</PdmPermissionProvider>));
  await act(async () => vi.advanceTimersByTimeAsync(0));
}
function setupFetch() {
  let pending: Promise<Response> | null = null;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/numbering/permissions") return json({
      contractVersion: "ai-pdm.frontend-permission-projection.v1", applicationId: "ai-pdm", generatedAt: new Date().toISOString(),
      pages: Object.fromEntries(NUMBERING_PAGE_PERMISSION_CODES.map(code => [code, true])),
      actions: Object.fromEntries(NUMBERING_ACTION_PERMISSION_CODES.map(code => [code, false]))
    });
    if (url === "/api/numbering/series-codes") return json({ seriesCodeOptions: ["NAV"] });
    return pending ?? json(list("原先的清單"));
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, defer() { let finish!: (response: Response) => void; pending = new Promise(resolve => { finish = resolve; }); return finish; } };
}

it("renders a returning list before revalidation completes, shares series, and replaces with fresh data", async () => {
  const { fetcher, defer } = setupFetch();
  await render();
  expect(container.textContent).toContain("原先的清單");
  expect(vi.getTimerCount()).toBe(0);
  await render(false);
  const finish = defer();
  await render();
  expect(container.textContent).toContain("原先的清單");
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => String(url).startsWith("/api/parts/workbench"))).toHaveLength(2);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/numbering/series-codes")).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/numbering/permissions")).toHaveLength(1);
  await act(async () => finish(json(list("伺服器新資料"))));
  expect(container.textContent).toContain("伺服器新資料");
  expect(container.textContent).not.toContain("原先的清單");
});

it.each([401, 403, 503])("removes restored rows after HTTP %i without keeping a successful-looking list", async status => {
  const { defer } = setupFetch();
  await render(); await render(false);
  const finish = defer(); await render();
  expect(container.textContent).toContain("原先的清單");
  await act(async () => finish(json({ message: "無法讀取清單" }, status)));
  expect(container.textContent).not.toContain("原先的清單");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

it("clears visible cached rows at logout and rejects an older pending response", async () => {
  const { defer } = setupFetch();
  await render(); await render(false);
  const finish = defer(); await render();
  await act(async () => invalidatePdmPermissions("logout"));
  expect(container.textContent).not.toContain("原先的清單");
  await act(async () => finish(json(list("上一位使用者的遲到資料"))));
  expect(container.textContent).not.toContain("上一位使用者的遲到資料");
});
