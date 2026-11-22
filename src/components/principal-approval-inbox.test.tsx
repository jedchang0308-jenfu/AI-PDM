// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ApprovalWorkbenchRow } from "@/lib/approval-workbench-contract";
import { PrincipalApprovalInbox } from "./principal-approval-inbox";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
HTMLElement.prototype.scrollTo = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();

const pending: ApprovalWorkbenchRow = {
  id: "pending-drawing", rowKey: "approval:pdm_work_review:pending-drawing", source: "pdm_work_review",
  companyId: "test-company", actionCode: "numbering.pdm_drawing_revision_review", actionTitle: "圖面研發版審核",
  domainCode: "numbering", title: "送審圖面名稱", targetSummary: "A0001-M01", status: "pending", reason: "",
  requestedBy: "test-submit-user", requestedByName: "測試送審者", requestedAt: "2026-11-18T06:23:00Z",
  packageId: null, packageCode: null, packageStatus: null, impactSummary: null, legacy: null, historyOnly: true
};
const returned: ApprovalWorkbenchRow = {
  ...pending, id: "returned-drawing", rowKey: "approval:pdm_work_review:returned-drawing",
  status: "needs_info", targetSummary: "A0002-M01"
};
const reviewer: ApprovalWorkbenchRow = {
  ...pending, historyOnly: false, ownerHref: "/approvals/pending-drawing"
};

let root: Root;
let container: HTMLDivElement;
const drawer = () => container.querySelector('[role="complementary"]');
const rows = () => container.querySelectorAll<HTMLTableRowElement>("[data-approval-workbench-row]");
const fetchInbox = vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(String(input), window.location.origin);
  if (url.pathname !== "/api/approvals/inbox") throw new Error(`Unexpected request: ${url.pathname}`);
  return Response.json({ rows: url.searchParams.get("view") === "submitted" ? [pending, returned] : [reviewer] });
});

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchInbox);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderInbox(url: string) {
  window.history.replaceState(null, "", url);
  await act(async () => root.render(<PrincipalApprovalInbox />));
}

it("opens a submitted pending row as read-only details on click", async () => {
  await renderInbox("/approvals?view=submitted");
  await act(async () => rows()[0].click());

  expect(drawer()?.textContent).toContain("送審圖面名稱");
  expect(drawer()?.textContent).toContain("審核中");
  expect(drawer()?.textContent).toContain("測試送審者");
  expect(drawer()?.textContent).toContain(pending.id);
  expect(drawer()?.querySelector("time")?.dateTime).toBe(pending.requestedAt);
  expect(drawer()?.querySelectorAll("button")).toHaveLength(2);
  expect(window.location.search).toContain("requestId=pending-drawing");
  expect(fetchInbox).toHaveBeenCalledTimes(1);
  expect(push).not.toHaveBeenCalled();
});

it("opens the focused returned row via Enter and closes it via Escape", async () => {
  await renderInbox("/approvals?view=submitted");
  rows()[1].focus();
  await act(async () => rows()[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(drawer()?.textContent).toContain("A0002-M01");
  expect(drawer()?.textContent).toContain("已退回");

  await act(async () => rows()[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(drawer()).toBeNull();
  expect(window.location.search).not.toContain("requestId=");
});

it("opens details from the URL only for a row returned by the submitted inbox", async () => {
  await renderInbox("/approvals?view=submitted&requestId=missing");
  expect(drawer()).toBeNull();
  await act(async () => {
    window.history.replaceState(null, "", "/approvals?view=submitted&requestId=returned-drawing");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(drawer()?.textContent).toContain("A0002-M01");
});

it("keeps review rows linked to their authorized decision workspace", async () => {
  await renderInbox("/approvals?status=active");
  await act(async () => rows()[0].click());
  expect(drawer()).toBeNull();
  expect(push).toHaveBeenCalledWith("/approvals/pending-drawing?returnTo=%2Fapprovals%3Fstatus%3Dactive%26requestId%3Dpending-drawing");
});

it("restores the submitted list after the review inbox denies access", async () => {
  await renderInbox("/approvals?view=submitted");
  fetchInbox.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" }, { status: 403 }));
  const view = container.querySelector<HTMLSelectElement>("select")!;
  await act(async () => {
    view.value = "review";
    view.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(rows()).toHaveLength(0);

  await act(async () => {
    view.value = "submitted";
    view.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(rows()).toHaveLength(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await act(async () => rows()[0].click());
  expect(drawer()?.textContent).toContain("A0001-M01");
});
