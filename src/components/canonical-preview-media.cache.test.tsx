// @vitest-environment jsdom
import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { invalidatePdmPermissions, pdmPermissionFetch } from "@/lib/pdm-permission-client";
import { CanonicalPreviewMedia } from "./canonical-preview-media";
import { PdmPermissionProvider } from "./pdm-permission-provider";
import { PartPreviewSourceControl } from "./part-preview-source-control";

vi.mock("next/navigation", () => ({ usePathname: () => "/parts" }));
vi.mock("./pdf-page-viewport", () => ({ PdfPageViewport: () => null }));
vi.mock("./pdf-document-viewport", () => ({ PdfDocumentViewport: () => null }));

const href = "/api/pdm/file-assets/model?context=drawing_revision&contextId=r1&bindingId=b1&previewDerivative=d1";
const permission = () => Response.json({
  contractVersion: "ai-pdm.frontend-permission-projection.v1", applicationId: "ai-pdm", generatedAt: new Date().toISOString(),
  pages: Object.fromEntries(NUMBERING_PAGE_PERMISSION_CODES.map(code => [code, true])),
  actions: Object.fromEntries(NUMBERING_ACTION_PERMISSION_CODES.map(code => [code, false]))
});
const picture = () => new Response("image bytes", { headers: { "content-type": "image/png" } });
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:task-preview");
    static revokeObjectURL = vi.fn();
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(count = 1, source = href) {
  await act(async () => root.render(<StrictMode><PdmPermissionProvider>{Array.from({ length: count }, (_, index) =>
    <CanonicalPreviewMedia key={index} media={{ href: source, mode: "image", title: "預覽" }} />
  )}</PdmPermissionProvider></StrictMode>));
}
function serve() {
  const read = vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/numbering/permissions" ? permission() : picture());
  vi.stubGlobal("fetch", read);
  return read;
}
const imageReads = (read: ReturnType<typeof serve>) => read.mock.calls.filter(([input]) => String(input) !== "/api/numbering/permissions");

it("shares a protected image read between two views and reuses bytes after reopening", async () => {
  const read = serve();
  await render(2);
  expect(host.querySelectorAll("img")).toHaveLength(2);
  expect(imageReads(read)).toHaveLength(1);
  await render(0);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  await render();
  expect(host.querySelector("img")).not.toBeNull();
  expect(imageReads(read)).toHaveLength(1);
  await render(1, href.replace("d1", "d2"));
  expect(imageReads(read)).toHaveLength(2);
});

it("clears image bytes on a write, including an unknown write outcome", async () => {
  const read = serve();
  await render();
  read.mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/numbering/permissions") return permission();
    if (String(input) === "/api/change-preview") throw new Error("connection lost");
    return picture();
  });
  await act(async () => { await expect(pdmPermissionFetch("/api/change-preview", { method: "POST" })).rejects.toThrow("connection lost"); });
  const previousReads = imageReads(read).length;
  expect(previousReads).toBeGreaterThan(1);
  expect(host.querySelector("img")).not.toBeNull();
  await render(0); await render();
  expect(imageReads(read)).toHaveLength(previousReads);
});

it("the actual preview source control clears image bytes when restoring the drawing preview", async () => {
  const preview = { state: "ready" as const, media: { href, mode: "image" as const, fileName: "preview.png" },
    sourceType: "custom_image" as const, sourceLabel: "自訂圖片", sourceDrawingNumber: null, sourceRevision: null, alt: "預覽" };
  const committed = vi.fn();
  const read = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/numbering/permissions") return permission();
    if (String(input).endsWith("/preview-image/reset")) return Response.json({ data: { preview, settingRowVersion: 2 } });
    return picture();
  });
  vi.stubGlobal("fetch", read);
  await act(async () => root.render(<PdmPermissionProvider>
    <CanonicalPreviewMedia media={{ href, mode: "image", title: "預覽" }} />
    <PartPreviewSourceControl partNumber="P-1" preview={preview}
      control={{ settingRowVersion: 1, canManage: true, hasPrimaryManufacturingDrawing: true, disabledReason: null }} onCommitted={committed} />
  </PdmPermissionProvider>));
  expect(read.mock.calls.filter(([input]) => String(input) === href)).toHaveLength(1);
  await act(async () => Array.from(host.querySelectorAll("button")).find(button => button.textContent === "使用主要製造圖")!.click());
  expect(committed).toHaveBeenCalledOnce();
  expect(read.mock.calls.filter(([input]) => String(input).endsWith("/preview-image/reset"))).toHaveLength(1);
  expect(read.mock.calls.filter(([input]) => String(input) === href).length).toBeGreaterThan(1);
  expect(host.querySelector("img")).not.toBeNull();
});

it("hides a previous account's image on logout and reads again for the next account", async () => {
  const read = serve();
  await render();
  await act(async () => invalidatePdmPermissions("logout"));
  expect(host.querySelector("img")).toBeNull();
  expect(imageReads(read)).toHaveLength(1);
  await act(async () => invalidatePdmPermissions("account-changed"));
  expect(host.querySelector("img")).not.toBeNull();
  expect(imageReads(read)).toHaveLength(2);
});

it("a shared forbidden image refreshes permissions once, then recovers after a permission change", async () => {
  const read = vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/numbering/permissions"
    ? permission() : Response.json({ error: { retryable: false } }, { status: 403 }));
  vi.stubGlobal("fetch", read);
  await render(3);
  expect(host.querySelector("img")).toBeNull();
  expect(host.textContent).toContain("預覽無法顯示");
  expect(imageReads(read)).toHaveLength(1);
  expect(read.mock.calls.filter(([input]) => String(input) === "/api/numbering/permissions")).toHaveLength(2);
  read.mockImplementation(async (input: RequestInfo | URL) => String(input) === "/api/numbering/permissions" ? permission() : picture());
  await act(async () => invalidatePdmPermissions("permissions-changed"));
  expect(host.querySelectorAll("img")).toHaveLength(3);
  expect(imageReads(read)).toHaveLength(2);
});

it("evicts a successful HTTP image whose bytes fail to decode", async () => {
  const read = serve();
  await render();
  await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error", { bubbles: true })));
  expect(host.querySelector("img")).toBeNull();
  await render(0); await render();
  expect(imageReads(read)).toHaveLength(2);
});

it("an explicit permission retry also releases a previous image denial", async () => {
  let permissionReads = 0;
  let restored = false;
  const read = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/numbering/permissions") {
      permissionReads += 1;
      return permissionReads === 2 ? Response.json({}, { status: 503 }) : permission();
    }
    return restored ? picture() : Response.json({}, { status: 403 });
  });
  vi.stubGlobal("fetch", read);
  await render();
  const retry = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "重試權限");
  expect(retry).toBeDefined();
  restored = true;
  await act(async () => retry!.click());
  expect(host.querySelector("img")).not.toBeNull();
  expect(imageReads(read)).toHaveLength(2);
});

it("ignores a late denial from a cancelled image request", async () => {
  let finish!: (response: Response) => void;
  const read = vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/numbering/permissions"
    ? permission() : new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", read);
  await render(); await render(0);
  await act(async () => { finish(Response.json({}, { status: 401 })); });
  expect(host.textContent).not.toContain("登入已失效");
  expect(read.mock.calls.filter(([input]) => String(input) === "/api/numbering/permissions")).toHaveLength(1);
});
