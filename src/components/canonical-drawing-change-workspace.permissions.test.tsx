// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./drawing-detail-preview", () => ({ DrawingDetailPreview: () => null }));
vi.mock("./drawing-recognition-workspace-panel", () => ({ DrawingRecognitionWorkspacePanel: () => null }));
vi.mock("./drawing-workspace-upload", () => ({ DrawingWorkspaceUpload: () => null }));
import { CanonicalDrawingChangeWorkspace, type DrawingWorkspacePayload } from "./canonical-drawing-change-workspace";
import { clearCurrentPdmUser } from "@/lib/pdm-current-user-client";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const base = "/api/pdm/drawing-revision-works/work";
let root: Root, container: HTMLDivElement, finishPackage: (response: Response) => void;
let work: DrawingWorkspacePayload;
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clearCurrentPdmUser(); localStorage.clear(); fetcher.mockReset();
  work = { entityType: "drawing", entityId: "drawing", workId: "work", revisionId: "revision", rowVersion: 1,
    revision: "0.2", readonly: false, identity: { code: "A0002-M01" }, changeImpactRequired: true,
    payload: { changeImpact: { formState: "no_impact", fitState: "no_impact", functionState: "no_impact", note: "原備註" } }, files: [] };
  fetcher.mockImplementation(async (input, init) => {
    if (String(input) === base + "/assembly-packages") return new Promise<Response>(resolve => { finishPackage = resolve; });
    if (String(input) === "/api/auth/me") return json({ user: { id: "user" }, session: { principalId: "principal", companyId: "company" } });
    if (String(input) === base) {
      if (init?.method === "PATCH") { work = { ...work, rowVersion: 2, payload: JSON.parse(String(init.body)) }; return json({ data: { rowVersion: 2 } }); }
      return json({ data: work, meta: { contractToken: "fresh-contract" } });
    }
    throw new Error("Unexpected fixture request: " + String(input));
  });
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); clearCurrentPdmUser();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const render = async () => { await act(async () => root.render(<CanonicalDrawingChangeWorkspace drawingId="drawing" workId="work" />)); };

it("keeps unsaved drawing text editable and savable after an assembly 403, without polling the denial", async () => {
  await render();
  await act(async () => {
    const field = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "尚未儲存的備註");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  vi.useFakeTimers();
  await act(async () => finishPackage(json({ error: { message: "無權限執行此操作" } }, 403)));
  expect(container.querySelector('section[aria-label="組立包"] [role="alert"]')?.textContent).toBe("目前無權限讀取組立包。");
  expect(container.querySelector("textarea")?.value).toBe("尚未儲存的備註");
  expect(container.querySelector("textarea")?.disabled).toBe(false);
  expect(container.textContent).not.toContain("身分或權限已變更");
  expect(Object.values(localStorage).join(" ")).toContain("尚未儲存的備註");
  await act(async () => vi.advanceTimersByTimeAsync(45_000));
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/assembly-packages"))).toHaveLength(1);
  await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "儲存")!.click());
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  expect((work.payload.changeImpact as { note: string }).note).toBe("尚未儲存的備註");
});
it("still closes the drawing editor when the assembly response establishes an invalid session", async () => {
  await render();
  await act(async () => finishPackage(json({ code: "auth_session_invalid" }, 401)));
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).toContain("身分或權限已變更");
});
it("enables local draft protection when identity resolves after an initial assembly denial", async () => {
  const normal = fetcher.getMockImplementation()!;
  let finishIdentity!: (response: Response) => void;
  fetcher.mockImplementation((input, init) => String(input) === "/api/auth/me"
    ? new Promise<Response>(resolve => { finishIdentity = resolve; }) : normal(input, init));
  await render();
  await act(async () => {
    const field = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "身分確認前的文字");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    finishPackage(json({ error: { message: "拒絕" } }, 403));
  });
  await act(async () => finishIdentity(json({ user: { id: "user" }, session: { principalId: "principal", companyId: "company" } })));
  expect(container.querySelector("textarea")?.value).toBe("身分確認前的文字");
  expect(container.textContent).toContain("已保留本機草稿，尚未儲存至伺服器。");
  expect(Object.values(localStorage).join(" ")).toContain("身分確認前的文字");
});
