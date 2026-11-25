// @vitest-environment jsdom
import React, { act, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePdmLocalDraft } from "./use-pdm-local-draft";
import { clearCurrentPdmUser } from "@/lib/pdm-current-user-client";
import { invalidatePdmPermissions } from "@/lib/pdm-permission-client";
import { draftKey, readLocalDraft, writeLocalDraft, type LocalDraft } from "@/lib/pdm-local-draft";

let node: HTMLDivElement, root: Root, actor: string, hook: ReturnType<typeof usePdmLocalDraft>;
const owner = (actor = "a") => JSON.stringify([actor, "company", actor]);
const draft = (version = "v1", revision = "one"): LocalDraft => ({ schema: 1, owner: owner(), record: "record-a", version, revision, savedAt: Date.now(), fields: { note: "未保存文字" } });
function Form({ version = "v1", record = "record-a", savedNote }: { version?: string; record?: string; savedNote?: string }) {
  const [note, setNote] = useState("");
  const value = usePdmLocalDraft({ record, version, fields: { note }, savedFields: savedNote === undefined ? undefined : { note: savedNote }, dirty: !!note && note !== savedNote, apply: f => setNote(String(f.note)), reset: () => setNote("") });
  useLayoutEffect(() => { hook = value; });
  return <>{value.feedback}<input aria-label="note" value={note} onChange={e => setNote(e.target.value)} /></>;
}
const render = async (version = "v1", record = "record-a") => { await act(async () => root.render(<Form version={version} record={record} />)); };
const click = async (text: string) => { await act(async () => [...node.querySelectorAll("button")].find(b => b.textContent === text)!.click()); };
const type = async (text: string) => { await act(async () => { const input = node.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); };
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear(); actor = "a"; clearCurrentPdmUser();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: { id: actor }, session: { principalId: actor, companyId: "company" } }))));
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); clearCurrentPdmUser(); });
it("offers explicit recovery after reopening without a business mutation", async () => {
  await render(); await type("未保存文字");
  expect(readLocalDraft(window.localStorage, owner(), "record-a")?.fields.note).toBe("未保存文字");
  await act(async () => root.unmount()); root = createRoot(node); await render();
  expect(node.querySelector("input")!.value).toBe(""); await click("恢復草稿");
  expect(node.querySelector("input")!.value).toBe("未保存文字");
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it.each(["account", "record"])("does not offer another %s's draft", async boundary => {
  writeLocalDraft(window.localStorage, draft(), null);
  if (boundary === "account") actor = "b";
  await render("v1", boundary === "record" ? "record-b" : "record-a");
  expect(node.textContent).not.toContain("恢復草稿"); expect(node.querySelector("input")!.value).toBe("");
});
it("retains a conflicting server version for comparison without applying it", async () => {
  writeLocalDraft(window.localStorage, draft(), null); await render("v2");
  expect(node.textContent).toContain("伺服器版本已變更"); expect(node.textContent).toContain("未保存文字");
  expect(node.textContent).not.toContain("恢復草稿"); await type("伺服器新版本輸入");
  expect(readLocalDraft(window.localStorage, owner(), "record-a")?.version).toBe("v1");
});
it("rechecks the pending recovery when the loaded server version changes", async () => {
  await render(); await type("v1文字"); await render("v2");
  expect(node.textContent).toContain("伺服器版本已變更");
  await type("v2文字"); expect(readLocalDraft(window.localStorage, owner(), "record-a")?.fields.note).toBe("v1文字");
});
it("invalidates synchronously and clears visible fields on account switch", async () => {
  await render(); await type("帳號A內容");
  await act(async () => invalidatePdmPermissions("account-changed"));
  expect(hook.isCurrent()).toBe(false); expect(node.querySelector("input")!.value).toBe("");
  expect(readLocalDraft(window.localStorage, owner(), "record-a")?.fields.note).toBe("帳號A內容");
});
it("retains the editor and its unsaved draft when a resource request is forbidden", async () => {
  await render(); await type("尚未保存的圖號備註");
  await act(async () => invalidatePdmPermissions("forbidden"));
  expect(hook.isCurrent()).toBe(true);
  expect(hook.invalidated).toBe(false);
  expect(node.querySelector("input")!.value).toBe("尚未保存的圖號備註");
  expect(readLocalDraft(localStorage, owner(), "record-a")?.fields.note).toBe("尚未保存的圖號備註");
});
it.each(["logout", "unauthenticated", "permissions-changed"] as const)("still clears the editor on %s", async reason => {
  await render(); await type("不再顯示的內容");
  await act(async () => invalidatePdmPermissions(reason));
  expect(hook.isCurrent()).toBe(false);
  expect(hook.invalidated).toBe(true);
  expect(node.querySelector("input")!.value).toBe("");
});
it("handles a denied localStorage getter without crashing the editor", async () => {
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
  await render(); await type("仍可編輯");
  expect(node.textContent).toContain("無法保留本機草稿"); expect(node.querySelector("input")!.value).toBe("仍可編輯");
});
it("handles quota failure without deleting another recovery slot", async () => {
  writeLocalDraft(window.localStorage, draft(), null);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
  await render("v1", "record-b"); await type("新輸入");
  expect(node.textContent).toContain("無法保留本機草稿"); expect(readLocalDraft(window.localStorage, owner(), "record-a")).not.toBeNull();
});
it("rechecks a newer other-tab draft at the restore click", async () => {
  writeLocalDraft(window.localStorage, draft(), null); await render();
  writeLocalDraft(window.localStorage, { ...draft("v1", "two"), fields: { note: "另一分頁" } }, "one");
  await click("恢復草稿"); expect(node.querySelector("input")!.value).toBe("");
  await click("恢復草稿"); expect(node.querySelector("input")!.value).toBe("另一分頁");
});
it("discards a pending draft and clears only the acknowledged server-save revision", async () => {
  writeLocalDraft(window.localStorage, draft(), null); await render(); await click("捨棄草稿");
  expect(window.localStorage.getItem(draftKey(owner(), "record-a"))).toBeNull();
  await type("儲存內容"); await act(async () => hook.clear());
  expect(window.localStorage.getItem(draftKey(owner(), "record-a"))).toBeNull();
});
it("removes an acknowledged autosaved copy without offering a false version conflict", async () => {
  await render(); await type("已自動儲存");
  await act(async () => root.render(<Form version="v2" savedNote="已自動儲存" />));
  expect(readLocalDraft(localStorage, owner(), "record-a")).toBeNull();
  expect(node.textContent).not.toContain("版本已變更");
});
