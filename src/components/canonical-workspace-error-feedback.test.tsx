// @vitest-environment jsdom
import React, { act } from "react";
import { PdmPermissionProvider } from "./pdm-permission-provider";
import { NUMBERING_PAGE_PERMISSION_CODES, NUMBERING_ACTION_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewPackageTarget } from "@/lib/pdm-review-package-contract";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(),
  query: new URLSearchParams("activeTarget=drawing%3Adrawing-one") }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/approvals/review-one",
  useSearchParams: () => navigation.query
}));
vi.mock("@/components/canonical-review-target-workspace", () => ({
  CanonicalReviewTargetWorkspace: ({ target }: { target: ReviewPackageTarget }) =>
    <div data-testid="review-target">{target.targetKey}</div>
}));
vi.mock("@/components/relation-matrix-table", () => ({ RelationMatrixTable: () => <div>關聯矩陣</div> }));
vi.mock("@/components/review-snapshot-compare", () => ({ ReviewSnapshotCompare: () => <div>差異</div> }));

import { CanonicalReviewPackageWorkspace, type CanonicalReviewPackageShell } from "./canonical-review-package-workspace";
import { CanonicalPartAttachmentManager } from "./canonical-part-attachment-manager";

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body && typeof body === "object" && "pages" in body && "actions" in body ? {
  ...body, contractVersion: "ai-pdm.frontend-permission-projection.v1", applicationId: "ai-pdm", generatedAt: new Date().toISOString(),
  pages: { ...Object.fromEntries(NUMBERING_PAGE_PERMISSION_CODES.map(code => [code, false])), ...(body as { pages: object }).pages },
  actions: { ...Object.fromEntries(NUMBERING_ACTION_PERMISSION_CODES.map(code => [code, false])), ...(body as { actions: object }).actions }
} : body), {
  status, headers: { "content-type": "application/json" }
});
const markers = { submitted: true, change: null, risk: null };
const target: ReviewPackageTarget = {
  targetKey: "drawing:drawing-one", axisId: "drawing-one", scope: "submitted", markers,
  evidenceHash: "snapshot-one", workspace: {
    kind: "drawing", entityId: "drawing-one", revisionId: "revision-one",
    identity: { code: "A0002-M01", name: null, revision: "0.1", purposeCode: null, purposeDescription: null },
    payload: {}, baselinePayload: null, files: [], attachments: [], recognition: null
  }
};
const shell: CanonicalReviewPackageShell = {
  schemaVersion: "pdm-review-package-v2", requestId: "review-one", requestKind: "drawing_revision",
  entityType: "drawing", entityId: "drawing-one", rowVersion: 7, packageHash: "package-one",
  submittedAt: "2026-10-23T00:00:00Z", primaryTargetKey: target.targetKey,
  root: { id: "root-one", code: "A0002" },
  matrix: { rootId: "root-one", rootCode: "A0002", evidenceHash: "matrix-one", drawings: [], parts: [], cells: [] },
  targets: [{ targetKey: target.targetKey, targetId: "drawing-one", entityType: "drawing", number: "A0002-M01",
    identity: {}, revision: "0.1", scope: "submitted", markers, evidenceHash: "snapshot-one", fileCount: 0, attachmentCount: 0 }],
  actions: [{ key: "approve", label: "核准" }]
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState({}, "", "/approvals/review-one?activeTarget=drawing%3Adrawing-one");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function button(label: string) {
  const found = [...container.querySelectorAll("button")].find(item => item.textContent === label);
  expect(found, label).toBeDefined();
  return found!;
}

describe("review decision feedback", () => {
  it.each([
    [{ error: "permission_not_granted" }, "目前帳號沒有此審核的決策權限。請公司管理員確認有效的工作區指派與 approval.request.decide 權限；權限更新後重新整理本頁。"],
    [{ error: { message: "送審基準已更新，請重新整理。" } }, "送審基準已更新，請重新整理。"],
    [{ error: "unknown_error" }, "審核決策未完成。"]
  ])("retains the package, selection and current page after a rejected decision: %j", async (body, message) => {
    fetchMock.mockImplementation(async (_url, init) => init?.method === "POST"
      ? json(body, 403)
      : json({ data: { snapshot: target, drift: { status: "unchanged", changed: false, changedSections: [], currentEvidenceHash: "snapshot-one" } }, meta: { contractToken: "contract-one" } }));
    await act(async () => root.render(<CanonicalReviewPackageWorkspace requestId="review-one" initialShell={shell} initialContractToken="contract-one" />));
    await act(async () => button("核准").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(container.querySelector('[data-testid="review-target"]')?.textContent).toBe("drawing:drawing-one");
    expect(container.textContent).toContain("快照 package-on");
    expect(button("核准").disabled).toBe(false);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/approvals/review-one");
    expect(window.location.search).toContain("activeTarget=drawing%3Adrawing-one");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/api/pdm/review-requests/review-one/decisions");
    expect(post[1]?.body).toBe(JSON.stringify({ decision: "approve" }));
    expect((post[1]?.headers as Record<string, string>)["if-match"]).toBe('"7"');
  });
});

const attachment = (id: string) => ({ id, entityId: "part-one", displayName: `${id}.png`, description: "",
  fileName: `${id}.png`, fileExt: "png", mimeType: "image/png", fileSize: 5,
  uploadedByName: null, createdAt: "2026-10-23T00:00:00Z" });
describe("accepted attachment lifecycle commands followed by list refresh", () => {
  it.each([
    ["delete", "success"], ["restore", "success"], ["delete", "denied"], ["restore", "denied"]
  ])("preserves a normal %s result and a genuine command rejection: %s", async (command, outcome) => {
    let accepted = false;
    const deleted = { attachment: attachment("restore"), policy: { stageLabel: "已刪除", actions: { restore: { allowed: true } } } };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/numbering/permissions") return json({ pages: { "numbering.search": true }, actions: { "numbering.attachments.manage": true } });
      if (init?.method === "DELETE" || init?.method === "POST") {
        if (outcome === "denied") return json({ error: "command denied" }, 403);
        accepted = true; return json({});
      }
      if (String(input).endsWith("?surface=deleted_data")) return json({ attachments: accepted
        ? command === "delete" ? [{ ...deleted, attachment: attachment("old") }] : []
        : command === "restore" ? [deleted] : [] });
      return json({ attachments: accepted ? command === "delete" ? [] : [attachment("old"), attachment("restore")] : [attachment("old")] });
    });
    await act(async () => root.render(<PdmPermissionProvider><CanonicalPartAttachmentManager partNumber="A0002-P01" returnTo="/numbering/parts" embedded /></PdmPermissionProvider>));
    await act(async () => button(command === "delete" ? "刪除" : "還原").click());
    if (outcome === "denied") {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("command denied");
      expect(container.querySelector(".part-attachment-list:not(.is-deleted)")?.textContent).toContain("old.png");
      expect(container.textContent).not.toContain("已完成，但");
    } else {
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('[role="status"]')?.textContent).toContain(command === "delete" ? "附件已移至已刪除區" : "附件已還原");
      if (command === "delete") {
        expect(container.querySelector(".part-attachment-list:not(.is-deleted)")).toBeNull();
        expect(container.querySelector(".part-attachment-list.is-deleted")?.textContent).toContain("old.png");
      } else {
        expect(container.querySelector(".part-attachment-list:not(.is-deleted)")?.textContent).toContain("restore.png");
        expect(container.querySelector(".part-attachment-list.is-deleted")).toBeNull();
      }
    }
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE" || init?.method === "POST")).toHaveLength(1);
  });
  it.each(["delete", "restore"] as const)("distinguishes an accepted %s from a failed list refresh and reloads without resending", async command => {
    let accepted = false, failReload = true;
    const deleted = { attachment: attachment("restore"), policy: { stageLabel: "已刪除", actions: { restore: { allowed: true } } } };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/numbering/permissions") return json({ pages: { "numbering.search": true }, actions: { "numbering.attachments.manage": true } });
      if (init?.method === "DELETE" || init?.method === "POST") { accepted = true; return json({}); }
      if (url.endsWith("?surface=deleted_data")) {
        if (accepted && failReload && command === "restore") return json({}, 503);
        return json({ attachments: accepted ? command === "delete" ? [{ ...deleted, attachment: attachment("old") }] : [] : command === "restore" ? [deleted] : [] });
      }
      if (accepted && failReload && command === "delete") throw new Error("list connection interrupted");
      return json({ attachments: accepted ? command === "delete" ? [] : [attachment("old"), attachment("restore")] : [attachment("old")] });
    });
    await act(async () => root.render(<PdmPermissionProvider><CanonicalPartAttachmentManager partNumber="A0002-P01" returnTo="/numbering/parts" embedded /></PdmPermissionProvider>));
    await act(async () => button("預覽").click());
    await act(async () => button(command === "delete" ? "刪除" : "還原").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(command === "delete" ? "刪除已完成，但附件清單重新載入失敗" : "還原已完成，但附件清單重新載入失敗");
    expect(container.querySelector(".part-attachment-list")).toBeNull();
    expect(container.querySelector("iframe, img")).toBeNull();
    expect(container.textContent).not.toContain("尚無附件");
    failReload = false;
    await act(async () => button("重新載入").click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    if (command === "restore") {
      expect(container.querySelector(".part-attachment-list:not(.is-deleted)")?.textContent).toContain("restore.png");
      expect(container.querySelector(".part-attachment-list.is-deleted")).toBeNull();
    } else {
      expect(container.querySelector(".part-attachment-list:not(.is-deleted)")).toBeNull();
      expect(container.querySelector(".part-attachment-list.is-deleted")?.textContent).toContain("old.png");
    }
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE" || init?.method === "POST")).toHaveLength(1);
  });
});
describe("attachment upload followed by list refresh", () => {
  it("distinguishes an accepted upload from a confirmed list when the actor can manage but cannot read", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) === "/api/numbering/permissions") return json({
        pages: { "numbering.search": false }, actions: { "numbering.attachments.manage": true }
      });
      if (init?.method === "POST") return json({ attachment: attachment("new") }, 201);
      if (String(input).endsWith("?surface=deleted_data")) return json({ attachments: [] });
      throw new Error("Active list must not be requested without its page permission");
    });
    await act(async () => root.render(<PdmPermissionProvider><CanonicalPartAttachmentManager partNumber="A0002-P01" returnTo="/numbering/parts" embedded /></PdmPermissionProvider>));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["bytes"], "new.png", { type: "image/png" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => button("上傳 1 個附件").click());
    expect(container.querySelector('[role="status"]')?.textContent).toBe("上傳已接收；目前沒有查看有效附件的權限，請公司管理員確認有效指派後重新整理。");
    expect(container.textContent).not.toContain("已上傳");
    expect(container.textContent).toContain("目前沒有查看有效附件的權限。");
    expect(container.querySelector(".part-attachment-list")).toBeNull();
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/parts/A0002-P01/attachments" && init?.method !== "POST")).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it.each(["network", "http", "deleted-list", "success", "delayed-success"])("reports the actual refresh outcome: %s", async outcome => {
    let posted = false;
    let failRefresh = !outcome.endsWith("success");
    let finishRefresh: (() => void) | undefined;
    const refreshGate = new Promise<void>(resolve => { finishRefresh = resolve; });
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/numbering/permissions") return json({ pages: { "numbering.search": true }, actions: { "numbering.attachments.manage": true } });
      if (init?.method === "POST") { posted = true; return json({ attachment: attachment("new") }, 201); }
      if (url.endsWith("?surface=deleted_data")) return posted && failRefresh && outcome === "deleted-list" ? json({}, 503) : json({ attachments: [] });
      if (posted && failRefresh && outcome === "network") throw new Error("connection interrupted");
      if (posted && failRefresh && outcome === "http") return json({}, 503);
      if (posted && outcome === "delayed-success") await refreshGate;
      return json({ attachments: posted ? [attachment("old"), attachment("new")] : [attachment("old")] });
    });
    await act(async () => root.render(<PdmPermissionProvider><CanonicalPartAttachmentManager partNumber="A0002-P01" returnTo="/numbering/parts" embedded /></PdmPermissionProvider>));
    expect(container.querySelector(".part-attachment-list")?.textContent).toContain("old.png");
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["bytes"], "new.png", { type: "image/png" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => button("上傳 1 個附件").click());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    if (outcome === "delayed-success") {
      expect(container.textContent).not.toContain("已上傳");
      expect(container.querySelector(".part-attachment-list")?.textContent).not.toContain("new.png");
      await act(async () => finishRefresh!());
    }
    if (outcome.endsWith("success")) {
      expect(button("上傳附件").disabled).toBe(true);
      expect(container.querySelector('[role="status"]')?.textContent).toContain("已上傳 1 個附件。");
      expect(container.querySelector(".part-attachment-list")?.textContent).toContain("new.png");
      expect(container.querySelector('[role="alert"]')).toBeNull();
    } else {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("上傳已接收，但附件清單重新載入失敗，請重新整理後確認。");
      expect(container.querySelector('[role="status"]')?.textContent ?? "").not.toContain("已上傳");
      expect(container.querySelector(".part-attachment-list")).toBeNull();
      expect(container.textContent).not.toContain("尚無附件");
      expect(container.querySelector("iframe, img")).toBeNull();
      expect(button("重新載入").disabled).toBe(false);
      failRefresh = false;
      await act(async () => button("重新載入").click());
      expect(container.querySelector(".part-attachment-list")?.textContent).toContain("new.png");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(button("上傳附件").disabled).toBe(true);
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    }
  });
});
