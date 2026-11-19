// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("./drawing-assembly-package-panel", () => ({ DrawingAssemblyPackagePanel: () => null }));
vi.mock("@/components/drawing-detail-preview", () => ({ DrawingDetailPreview: () => <div data-testid="preview" /> }));
vi.mock("@/components/drawing-recognition-workspace-panel", () => ({ DrawingRecognitionWorkspacePanel: () => null }));
vi.mock("@/components/file-dropzone", () => ({ FileDropzone: () => null }));

import { CanonicalDrawingChangeWorkspace, type DrawingWorkspacePayload } from "./canonical-drawing-change-workspace";
import { DrawingWorkSubmitAction } from "./drawing-work-submit-action";
import { resolveCanonicalWorkbenchActions, type CanonicalWorkbenchActor, type CanonicalWorkbenchStateRecord } from "@/lib/pdm-canonical-workbench-state";

let container: HTMLDivElement, root: Root, work: DrawingWorkspacePayload;
const fetchMock = vi.fn<typeof fetch>();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const calls = (method: string) => fetchMock.mock.calls.filter(([, init]) => init?.method === method);
const button = (name: string) => {
  const result = [...container.querySelectorAll("button")].find(item => item.textContent === name);
  expect(result, name).toBeDefined();
  return result!;
};
function preview(member: boolean) {
  return { rootCode: "A0054", ...(member ? { target: { kind: "drawing", code: "A0054-M01" } } : {}),
    drawingNumbers: ["A0054-M01"], partNumbers: member ? [] : ["A0054-P01"],
    numberReuse: [
      { kind: "drawing", code: "A0054-M01", status: "reusable" },
      ...(member ? [] : [{ kind: "part", code: "A0054-P01", status: "reusable" }, { kind: "root", code: "A0054", status: "reusable" }])
    ], affectedFileAssets: 1, fileNames: ["A0054.SLDASM"], affectedAuxiliaryJobs: 0, transferReferences: [], fingerprint: "a".repeat(64) };
}
async function render() {
  await act(async () => root.render(<CanonicalDrawingChangeWorkspace drawingId="drawing-one" workId="work-one" />));
}
async function editNote(value: string) {
  const field = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function openDelete() { await act(async () => button("刪除").click()); }
async function selectScope(index: number) {
  await act(async () => (container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[index]).click());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { callback(0); return 1; });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  work = { entityType: "drawing", entityId: "drawing-one", workId: "work-one", revisionId: "revision-one", revision: "0.2", rowVersion: 4,
    interaction: { mode: "owner_edit", basisState: "preproduction", canMutateContent: true, canSubmit: true, canCancel: true, canApprove: false, canReturn: false, reasonCode: null },
    readonly: false, identity: { code: "A0054-M01" }, changeImpactRequired: true,
    payload: { changeImpact: { formState: "no_impact", fitState: "no_impact", functionState: "no_impact", note: "原備註" } },
    files: [ { id: "2d", role: "drawing_2d", file_name: "A0054.SLDDRW", is_primary: true, current_revision_upload: true },
      { id: "3d", role: "cad_3d", file_name: "A0054.SLDASM", is_primary: true, current_revision_upload: true } ] };
  fetchMock.mockImplementation(async (input, init) => {
    if (init?.method === "PATCH") {
      work = { ...work, rowVersion: 5, payload: JSON.parse(String(init.body)) };
      return json({ data: { rowVersion: 5 } });
    }
    if (init?.method === "POST") return json({ data: { requestId: "review-one" } });
    if (init?.method === "DELETE") return json({ result: preview(String(input).includes("kind=")) });
    if (String(input).includes("/draft")) return json(preview(String(input).includes("kind=")));
    return json({ data: work, meta: { contractToken: "contract-one" } });
  });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});

describe("direct submission from Drawing detail", () => {
  const done = vi.fn();
  async function renderAction(before = () => true) {
    await act(async () => root.render(<DrawingWorkSubmitAction drawingId="drawing-one" submitHref="/api/pdm/drawing-revision-works/work-one/submit"
      disabled={false} onBeforeSubmit={before} onBusyChange={() => {}} onSubmitted={done} />));
  }
  it("reads the fresh saved work, submits it without PATCH, and refreshes the list", async () => {
    await renderAction(); await act(async () => button("送審").click());
    expect(calls("PATCH")).toHaveLength(0); expect(calls("POST")).toHaveLength(1);
    expect(calls("POST")[0][1]?.headers).toMatchObject({ "if-match": '"4"', "x-pdm-workbench-contract": "contract-one" });
    expect(done).toHaveBeenCalledOnce(); expect(navigation.push).not.toHaveBeenCalled();
  });
  it.each(["readiness", "server-validation"])("opens the editor only when %s requires corrections", async kind => {
    if (kind === "readiness") {
      work.interaction!.canSubmit = false;
      work.assemblyPackage = { applicable: true, canSubmit: false, reason: "組立包尚未完成" };
    }
    else fetchMock.mockImplementation(async (_url, init) => init?.method === "POST"
      ? json({ error: { code: "DRAWING_2D_REQUIRED", message: "請補齊主檔" } }, 422)
      : json({ data: work, meta: { contractToken: "contract-one" } }));
    await renderAction(); await act(async () => button("送審").click());
    expect(navigation.push).toHaveBeenCalledWith(expect.stringContaining("/numbering/drawings/drawing-one/workspace?workId=work-one"));
    expect(done).not.toHaveBeenCalled();
    expect(calls("POST")).toHaveLength(kind === "readiness" ? 0 : 1);
  });
  it.each([403, 409])("keeps a rejected %i in detail rather than navigating or resubmitting", async status => {
    fetchMock.mockImplementation(async (_url, init) => init?.method === "POST"
      ? json({ error: { message: "目前不可送審" } }, status)
      : json({ data: work, meta: { contractToken: "contract-one" } }));
    await renderAction(); await act(async () => button("送審").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("目前不可送審");
    expect(navigation.push).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled(); expect(calls("POST")).toHaveLength(1);
  });
  it("does not replay a write after a lost response; recovery only refreshes status", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "POST") throw new Error("response lost");
      return json({ data: work, meta: { contractToken: "contract-one" } });
    });
    await renderAction(); await act(async () => button("送審").click());
    expect(container.textContent).toContain("送審結果尚未確認");
    expect(container.querySelector("button")?.textContent).toBe("重新整理狀態");
    await act(async () => button("重新整理狀態").click());
    expect(calls("POST")).toHaveLength(1); expect(done).toHaveBeenCalledOnce();
  });
  it("does nothing when an unsaved matrix prevents leaving", async () => {
    await renderAction(() => false); await act(async () => button("送審").click());
    expect(fetchMock).not.toHaveBeenCalled(); expect(done).not.toHaveBeenCalled();
  });
  it("does not mistake revoked submit permission for missing content", async () => {
    work.interaction!.canSubmit = false;
    await renderAction(); await act(async () => button("送審").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("權限");
    expect(calls("POST")).toHaveLength(0); expect(navigation.push).not.toHaveBeenCalled();
  });
  it("does not submit a row after its detail was closed during the read", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await renderAction(); await act(async () => button("送審").click());
    await act(async () => root.render(<div>另一筆明細</div>));
    await act(async () => finish(json({ data: work, meta: { contractToken: "contract-one" } })));
    expect(calls("POST")).toHaveLength(0); expect(done).not.toHaveBeenCalled();
  });
});

describe("server-derived submit action", () => {
  const actor: CanonicalWorkbenchActor = { id: "owner", companyId: "company", canEditNonOwned: false,
    permissions: { createWork: false, updateWork: true, submitWork: true, cancelWork: true, decideReview: false, obsoleteDrawing: false } };
  const record = { entityType: "drawing", companyId: "company", workId: "work-one", handling: "owner", workOwnerId: "owner",
    canonicalEntityId: "drawing-one", basisState: "preproduction" } as CanonicalWorkbenchStateRecord;
  it("allows submit-only actors to use the saved work without granting edit permission", () => {
    const actions = resolveCanonicalWorkbenchActions(record, { ...actor, permissions: { ...actor.permissions, updateWork: false, cancelWork: false } });
    expect(actions.map(item => item.key)).toEqual(["submit_work"]);
  });
  it.each([
    { ...record, basisState: "stale" }, { ...record, workOwnerId: "another" },
    { ...record, companyId: "another" }, { ...record, handling: "review_owner" }
  ])("omits submit for an ineligible context", value => {
    expect(resolveCanonicalWorkbenchActions(value as CanonicalWorkbenchStateRecord, actor).some(item => item.key === "submit_work")).toBe(false);
  });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Drawing owner actions", () => {
  it("never renders owner mutations for an immutable snapshot", async () => {
    await act(async () => root.render(<CanonicalDrawingChangeWorkspace initialData={{ ...work, readonly: true,
      interaction: undefined }} snapshotMode />));
    expect(container.querySelector("footer button")).toBeNull();
    expect(container.querySelector("textarea")!.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("saves in place, preserves preview and scroll, and submits with the saved row version", async () => {
    await render();
    expect([...container.querySelectorAll("footer button")].map(item => item.textContent)).toEqual(["儲存", "刪除", "送審"]);
    expect(button("儲存").disabled).toBe(true);
    const panel = container.querySelector(".dev079-task-panel")!; panel.scrollTop = 240;
    const previewNode = container.querySelector('[data-testid="preview"]');
    await editNote("保留這筆修改");
    await act(async () => button("儲存").click());
    expect(calls("PATCH")).toHaveLength(1);
    expect(JSON.parse(String(calls("PATCH")[0][1]?.body)).changeImpact.note).toBe("保留這筆修改");
    expect(calls("PATCH")[0][1]?.headers).toMatchObject({ "if-match": '"4"', "x-pdm-workbench-contract": "contract-one" });
    expect(container.textContent).toContain("已儲存");
    expect(container.querySelector("textarea")!.value).toBe("保留這筆修改");
    expect(container.querySelector('[data-testid="preview"]')).toBe(previewNode);
    expect(panel.scrollTop).toBe(240);
    expect(button("儲存").disabled).toBe(true);
    expect(navigation.push).not.toHaveBeenCalled();
    await act(async () => button("送審").click());
    expect(calls("PATCH")).toHaveLength(1);
    expect(calls("POST")[0][1]?.headers).toMatchObject({ "if-match": '"5"' });
    expect(String(calls("POST")[0][0])).toMatch(/\/submit$/u);
  });
  it("saves pending input before submitting and uses the returned version", async () => {
    await render(); await editNote("直接送審的修改");
    await act(async () => button("送審").click());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method).map(([, init]) => init?.method)).toEqual(["PATCH", "POST"]);
    expect(calls("POST")[0][1]?.headers).toMatchObject({ "if-match": '"5"' });
  });
  it.each(["儲存", "送審"])("retains input when %s cannot save and never sends a terminal command", async action => {
    await render(); await editNote("不能丟掉");
    fetchMock.mockResolvedValue(json({ error: { message: "資料版本已改變" } }, 409));
    await act(async () => button(action).click());
    expect(container.querySelector("textarea")!.value).toBe("不能丟掉");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("資料版本已改變");
    expect(calls("POST")).toHaveLength(0);
    expect(button("儲存").disabled).toBe(false);
    expect(navigation.push).not.toHaveBeenCalled();
  });
  it("serializes saves and disables editing while a save is pending", async () => {
    await render(); await editNote("只送一次");
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(async (_url, init) => init?.method === "PATCH" ? new Promise(resolve => { finish = resolve; })
      : json({ data: { ...work, rowVersion: 5 }, meta: { contractToken: "contract-one" } }));
    const save = button("儲存");
    await act(async () => { save.click(); save.click(); });
    expect(calls("PATCH")).toHaveLength(1);
    expect(container.querySelector("textarea")!.closest("[inert]")).not.toBeNull();
    expect(button("刪除").disabled).toBe(true);
    await act(async () => finish(json({ data: { rowVersion: 5 } })));
    expect(container.querySelector("textarea")!.closest("[inert]")).toBeNull();
  });
  it("reads canonical FFF normalization after save without leaving the editor", async () => {
    await render(); await editNote("  會被正規化的備註  ");
    fetchMock.mockImplementation(async (_url, init) => init?.method === "PATCH" ? json({ data: { rowVersion: 5 } })
      : json({ data: { ...work, rowVersion: 5, payload: { changeImpact: { ...work.payload.changeImpact as object, note: "會被正規化的備註" } } }, meta: { contractToken: "fresh-contract" } }));
    await act(async () => button("儲存").click());
    expect(container.querySelector("textarea")!.value).toBe("會被正規化的備註");
    expect(navigation.push).not.toHaveBeenCalled();
  });
  it("distinguishes an accepted save from a failed readback without resending it", async () => {
    await render(); await editNote("確實已儲存");
    fetchMock.mockImplementation(async (_url, init) => init?.method === "PATCH" ? json({ data: { rowVersion: 5 } }) : json({}, 503));
    await act(async () => button("儲存").click());
    expect(calls("PATCH")).toHaveLength(1);
    expect(container.querySelector("textarea")!.value).toBe("確實已儲存");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("工作內容已儲存");
    expect(button("儲存").disabled).toBe(true);
  });
  it("opens three unselected delete scopes without mutating and allows dismissal", async () => {
    await render(); await openDelete();
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios).toHaveLength(3);
    expect(radios.some(item => item.checked)).toBe(false);
    expect(button("確認刪除").disabled).toBe(true);
    expect(container.textContent).toContain("保留編號不代表保留草稿");
    await selectScope(0); await act(async () => button("取消").click());
    expect(calls("POST")).toHaveLength(0); expect(calls("DELETE")).toHaveLength(0);
    expect(navigation.push).not.toHaveBeenCalled();
  });
  it("discards saved and unsaved work only after explicit work-scope confirmation", async () => {
    await render(); await editNote("捨棄的內容"); await openDelete(); await selectScope(0);
    expect(calls("POST")).toHaveLength(0);
    await act(async () => button("確認捨棄此版未核准的修改").click());
    expect(calls("PATCH")).toHaveLength(0); expect(calls("DELETE")).toHaveLength(0);
    expect(String(calls("POST")[0][0])).toMatch(/\/cancel$/u);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(navigation.push).toHaveBeenCalledWith("/numbering/drawings");
  });
  it.each([1, 2])("confirms exact permanent scope %i using its preview fingerprint", async scope => {
    await render(); await openDelete(); await selectScope(scope);
    await act(async () => button(scope === 1 ? "確認永久刪除 A0054-M01" : "確認永久刪除 A0054 整組").click());
    expect(calls("POST")).toHaveLength(0); expect(calls("DELETE")).toHaveLength(1);
    const [href, init] = calls("DELETE")[0];
    expect(String(href).includes("kind=drawing&code=A0054-M01")).toBe(scope === 1);
    expect(JSON.parse(String(init?.body))).toEqual({ confirmDelete: true, fingerprint: "a".repeat(64) });
    expect(navigation.push).not.toHaveBeenCalled();
    await act(async () => button("完成").click());
    expect(navigation.push).toHaveBeenCalledWith("/numbering/drawings");
  });
  it("keeps a denied permanent scope disabled and retains work discard eligibility", async () => {
    await render();
    fetchMock.mockResolvedValue(json({ error: "已有核准版本，不能永久刪除" }, 403));
    await openDelete();
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map(item => item.disabled)).toEqual([false, true, true]);
    expect(container.textContent).toContain("已有核准版本，不能永久刪除");
    expect(calls("DELETE")).toHaveLength(0);
  });
});
