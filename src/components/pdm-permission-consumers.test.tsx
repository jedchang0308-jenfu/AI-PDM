// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";

const permission = vi.hoisted(() => ({ kind: "loading", allow: false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/parts", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/pdm-permission-provider", () => ({
  usePdmPermissions: () => ({ allowsAction: () => permission.allow, allowsPage: () => permission.allow, retry: vi.fn(), state: { kind: permission.kind, projection: {
    pages: Object.fromEntries(NUMBERING_PAGE_PERMISSION_CODES.map(code => [code, permission.allow])),
    actions: Object.fromEntries(NUMBERING_ACTION_PERMISSION_CODES.map(code => [code, permission.allow]))
  } } })
}));
import { SidebarNav } from "./sidebar-nav";
import { TransferPackageWorkbenchShell } from "./transfer-package-workbench";
import { CanonicalPartAttachmentManager } from "./canonical-part-attachment-manager";
import { CanonicalChangeWorkspace } from "./canonical-change-workspace";

const savedPackage = { id: "fixture-package", packageCode: "FIXTURE", title: "Fixture package", status: "Draft",
  caseType: "development_case", caseReason: "Fixture reason", sourceReferenceStatus: "not_available",
  sourceReference: null, sourceReferenceReason: "Fixture reference", rowVersion: 1, items: [], draftItems: [], blockers: [], adapters: [], events: [] };

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  permission.kind = "loading"; permission.allow = false;
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
    String(input).startsWith("/api/transfer-packages/fixture-package")
      ? { workbench: savedPackage, readiness: { ready: false, stale: false, blockers: [] } }
      : String(input).startsWith("/api/transfer-packages/workbench-context")
      ? { context: { mode: "unsaved", caseType: "development_case", sourceItem: null, sourceRequested: false, sourceResolved: false } }
      : { configured: false }
  ), { status: 200 })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("permission loading is distinct from denial in consumers", () => {
  it.each([["loading", false], ["unavailable", false], ["ready", true], ["ready", false]] as const)("saved transfer controls reserve %s layout (allowed=%s) without enabling pending writes", async (kind, allow) => {
    permission.kind = kind; permission.allow = allow;
    await act(async () => root.render(<TransferPackageWorkbenchShell packageId="fixture-package" />));
    const cancel = Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes("取消技轉包"));
    if (kind === "ready" && !allow) expect(cancel).toBeUndefined();
    else { expect(cancel).toBeDefined(); expect(cancel?.disabled).toBe(!allow); }
  });
  it.each([["loading", false], ["unavailable", false], ["ready", true], ["ready", false]] as const)("change workspace and attachment manager consume the same %s projection (allowed=%s)", async (kind, allow) => {
    permission.kind = kind; permission.allow = allow;
    await act(async () => root.render(<>
      <CanonicalChangeWorkspace entityType="part" initialData={{ entityType: "part", entityId: "fixture-part", workId: "fixture-work", rowVersion: 1, payload: {}, readonly: false, identity: { code: "FIXTURE-P01" }, attachments: [] }} />
      <CanonicalPartAttachmentManager partNumber="FIXTURE-P01" returnTo="/parts" embedded />
    </>));
    const manage = Array.from(container.querySelectorAll("button")).find(item => item.textContent === "管理附件");
    if (kind === "ready" && !allow) expect(manage).toBeUndefined();
    else { expect(manage).toBeDefined(); expect(manage?.disabled).toBe(!allow); }
    expect(Boolean(container.querySelector('[aria-label="附件上傳"]'))).toBe(allow);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => url === "/api/numbering/permissions")).toBe(false);
  });
  it("reserves non-interactive sidebar entries while loading and reuses their labels when allowed", async () => {
    await act(async () => root.render(<SidebarNav />));
    const labels = Array.from(container.querySelectorAll("[data-permission-placeholder]"), entry => entry.textContent);
    expect(labels.length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/parts"]')).toBeNull();
    expect(container.querySelector('[data-permission-placeholder="/parts"]')?.getAttribute("aria-busy")).toBe("true");
    permission.kind = "ready"; permission.allow = true;
    await act(async () => root.render(<SidebarNav />));
    expect(container.querySelectorAll("[data-permission-placeholder]")).toHaveLength(0);
    for (const label of labels) expect(container.textContent).toContain(label);
    expect(container.querySelector('a[href="/parts"]')).not.toBeNull();
    permission.allow = false;
    await act(async () => root.render(<SidebarNav />));
    expect(container.querySelector('a[href="/parts"]')).toBeNull();
  });
  it.each(["loading", "unavailable", "ready"])("transfer context success preserves %s permission semantics", async kind => {
    permission.kind = kind;
    await act(async () => root.render(<TransferPackageWorkbenchShell />));
    const button = Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes("建立技轉包"));
    expect(button).toBeDefined(); expect(button?.disabled).toBe(true);
    expect(button?.title).toBe(kind === "loading" ? "正在載入操作權限" : kind === "unavailable" ? "暫時無法確認操作權限" : "目前帳號沒有建立技轉包權限");
  });
});
