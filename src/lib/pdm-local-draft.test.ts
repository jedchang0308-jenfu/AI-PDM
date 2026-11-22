// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { draftKey, readLocalDraft, removeLocalDraft, writeLocalDraft, type LocalDraft } from "./pdm-local-draft";
const draft = (record = "r", revision = "1"): LocalDraft => ({ schema: 1, owner: "actor/company", record, version: "v1", revision, savedAt: Date.now(), fields: { note: "文字", checked: true } });
beforeEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });
it("scopes recovery to actor/company and exact record, and expires after seven days", () => {
  const d = draft(); writeLocalDraft(localStorage, d, null);
  expect(readLocalDraft(localStorage, "other", "r")).toBeNull();
  expect(readLocalDraft(localStorage, d.owner, "other")).toBeNull();
  expect(readLocalDraft(localStorage, d.owner, "r", d.savedAt + 7 * 86400000)).toBeNull();
  expect(readLocalDraft(localStorage, d.owner, "r", d.savedAt - 1)).toBeNull();
});
it("ignores malformed, wrong-schema and non-text payloads", () => {
  for (const value of ["broken", JSON.stringify({ ...draft(), schema: 2 }), JSON.stringify({ ...draft(), fields: { note: { token: "not allowed" } } })]) {
    localStorage.setItem(draftKey(draft().owner, "r"), value);
    expect(readLocalDraft(localStorage, draft().owner, "r")).toBeNull();
  }
});
it("does not overwrite or remove a newer other-tab revision", () => {
  const old = draft(); writeLocalDraft(localStorage, old, null);
  const newer = draft("r", "2"); expect(writeLocalDraft(localStorage, newer, "1")).toBe(true);
  expect(writeLocalDraft(localStorage, draft("r", "3"), "1")).toBe(false);
  removeLocalDraft(localStorage, old); expect(readLocalDraft(localStorage, old.owner, "r")?.revision).toBe("2");
});
it("bounds capacity without silently deleting existing unsaved text or unrelated storage", () => {
  localStorage.setItem("unrelated", "keep");
  for (let i = 0; i < 20; i++) writeLocalDraft(localStorage, draft(String(i)), null);
  expect(() => writeLocalDraft(localStorage, draft("new"), null)).toThrow("DRAFT_LIMIT");
  expect(readLocalDraft(localStorage, draft().owner, "0")).not.toBeNull();
  expect(localStorage.getItem("unrelated")).toBe("keep");
});
it("refuses an oversized recovery without changing its prior contents", () => {
  const d = draft(); writeLocalDraft(localStorage, d, null);
  expect(() => writeLocalDraft(localStorage, { ...draft("r", "2"), fields: { note: "x".repeat(100001) } }, "1")).toThrow("DRAFT_TOO_LARGE");
  expect(readLocalDraft(localStorage, d.owner, "r")?.fields.note).toBe("文字");
});
it("reclaims only expired recovery slots so capacity is available again", () => {
  for (let i = 0; i < 20; i++) localStorage.setItem(draftKey(draft().owner, String(i)), JSON.stringify({ ...draft(String(i)), savedAt: Date.now() - 8 * 86400000 }));
  expect(writeLocalDraft(localStorage, draft("fresh"), null)).toBe(true);
  expect(localStorage.length).toBe(1);
});
