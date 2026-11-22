// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PartMatrixPayload } from "@/lib/part-number-matrix-contract";
import type { DraftFields } from "@/lib/pdm-local-draft";

const recovery = vi.hoisted(() => ({ current: null as any }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./use-pdm-local-draft", () => ({ usePdmLocalDraft: (options: unknown) => {
  recovery.current = options;
  return { feedback: null, invalidated: false };
} }));
vi.mock("./part-maintenance-workspace-sections", () => ({ PartMaintenanceWorkspaceSections: () => null }));
vi.mock("./pdm-edit-page-frame", () => ({ PdmEditPageFrame: ({ children, actionDock, notice, error, onRetry }: any) => <main>{notice}{error}<button onClick={onRetry}>重讀</button>{children}{actionDock}</main> }));
import { PartNumberMatrixWorkspace } from "./part-number-matrix-workspace";

const payload: PartMatrixPayload = { partName: "原品名", itemKind: "manufactured", customSpecification: null, isUniversal: false, materialCode: "SUS", materialLabel: "不鏽鋼", colorCode: null, colorLabel: null, surfaceTreatment: null, variantNote: null };
function column(partId = "part-one", editable = true) {
  return { partId, partNumber: partId, sequenceNo: 1, formalRowVersion: 2, recordStatus: "Released", lifecycleIntent: "edit", canRequestRelease: false,
    handling: "owner", canEdit: editable, canSubmit: true, disabledReason: null, workId: `work-${partId}`, workRowVersion: 4, workOwner: { id: "owner" }, valueSource: "work", payload, formalPayload: payload, attachmentCount: 0, confirmedAttributes: [] };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const matrix = () => json({ data: { root: { id: "root", code: "A0001" }, sourcePartId: "part-one", sourceRowKey: "row-one", columns: [column(), column("readonly", false)] }, meta: { contractToken: "server-command-token" } });
const key = (field: string, part = "part-one") => JSON.stringify([part, field]);
let container: HTMLDivElement, root: Root;
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset(); fetcher.mockImplementation(async (_input, init) => init?.method === "PATCH"
    ? json({ data: { workId: "work-part-one", rowVersion: 5, payload: JSON.parse(String(init.body)) } }) : matrix());
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); recovery.current = null; vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render(partId = "part-one") { await act(async () => root.render(<PartNumberMatrixWorkspace partId={partId} workId={`work-${partId}`} />)); }
async function edit(value: string) {
  const field = container.querySelector<HTMLInputElement>('[aria-label="part-one partName"] input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const writes = () => fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH" || init?.method === "POST");

it("passes only editable text and persisted values to recovery and retains the 800ms If-Match autosave", async () => {
  await render();
  expect(Object.keys(recovery.current.fields)).toEqual(["partName", "customSpecification", "materialLabel", "colorLabel", "surfaceTreatment", "variantNote"].map(field => key(field)));
  expect(recovery.current.version).toContain('"work-part-one",2,4');
  expect(recovery.current.dirty).toBe(false);
  await edit("離線前品名");
  expect(recovery.current.fields[key("partName")]).toBe("離線前品名");
  expect(recovery.current.savedFields[key("partName")]).toBe("原品名");
  expect(recovery.current.dirty).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(799)); expect(writes()).toHaveLength(0);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(writes()).toHaveLength(1);
  expect(writes()[0][1]?.headers).toMatchObject({ "if-match": '"4"', "x-pdm-workbench-contract": "server-command-token" });
});

it("restores text through normal field rules and autosaves without restoring readonly or command fields", async () => {
  await render();
  const restored: DraftFields = { [key("partName")]: "恢復品名", [key("materialLabel")]: "鋁", [key("itemKind")]: "purchased", [key("partName", "readonly")]: "不能改", contractToken: "stale-token" };
  fetcher.mockImplementation(async (_input, init) => json({ data: { workId: "work-part-one", rowVersion: 5, payload: JSON.parse(String(init?.body)) } }));
  await act(async () => recovery.current.apply(restored));
  expect(container.textContent).toContain("已恢復文字草稿，將沿用自動儲存");
  await act(async () => vi.advanceTimersByTimeAsync(800));
  expect(writes()).toHaveLength(1);
  const body = JSON.parse(String(writes()[0][1]?.body));
  expect(body).toMatchObject({ partName: "恢復品名", materialLabel: "鋁", materialCode: null, itemKind: "manufactured" });
  expect(recovery.current.savedFields[key("partName")]).toBe("恢復品名");
  expect(recovery.current.dirty).toBe(false);
  expect(JSON.stringify(recovery.current.fields)).not.toContain("token");
});

it("retains unsaved recovery fields when ordinary autosave loses its connection", async () => {
  await render(); await edit("斷線文字");
  fetcher.mockImplementationOnce(async () => { throw new Error("fixture connection loss"); });
  await act(async () => vi.advanceTimersByTimeAsync(800));
  expect(container.textContent).toContain("fixture connection loss");
  expect(recovery.current.fields[key("partName")]).toBe("斷線文字");
  expect(recovery.current.savedFields[key("partName")]).toBe("原品名");
  expect(recovery.current.dirty).toBe(true);
});

it("does not enable a new record's recovery using the previous endpoint's fields", async () => {
  await render(); await edit("另一物件的文字");
  let finish!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render("part-two");
  expect(recovery.current.record).toContain("part-two");
  expect(recovery.current.enabled).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(writes()).toHaveLength(0);
  await act(async () => finish(matrix()));
  expect(recovery.current.enabled).toBe(true);
  expect(recovery.current.fields[key("partName")]).toBe("原品名");
});

it("cancels queued autosave and prevents late load data after invalidation", async () => {
  await render(); await edit("不能晚到儲存");
  let finish!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "重讀")!.click());
  await act(async () => recovery.current.reset());
  await act(async () => finish(matrix()));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.textContent).not.toContain("原品名"); expect(container.textContent).not.toContain("不能晚到儲存");
  expect(container.querySelector("table")).toBeNull(); expect(writes()).toHaveLength(0);
});

it.each([200, 409])("ignores a pending save after invalidation, including expired-token retry (%i)", async status => {
  await render(); await edit("上一位身分的文字");
  let finish!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => vi.advanceTimersByTimeAsync(800));
  expect(writes()).toHaveLength(1);
  await act(async () => recovery.current.reset());
  await act(async () => finish(status === 200 ? json({ data: { workId: "work-part-one", rowVersion: 5, payload: { ...payload, partName: "遲到資料" } } }) : json({ error: { code: "WORKBENCH_CONTRACT_EXPIRED" } }, 409)));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(fetcher).toHaveBeenCalledTimes(2); expect(container.querySelector("table")).toBeNull();
  expect(container.textContent).not.toContain("遲到資料");
});
