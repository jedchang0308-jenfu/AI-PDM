import type { PdmWorkbenchListResponse } from "@/lib/pdm-workbench-contract";

export const SHARED_REVIEW_ENTRY_PERMISSIONS = [
  { permissionKind: "action", permissionCode: "approval.inbox.view", resourceGroup: "drawing" },
  { permissionKind: "action", permissionCode: "approval.request.decide", resourceGroup: "drawing" },
  { permissionKind: "action", permissionCode: "approval.inbox.view", resourceGroup: "part" },
  { permissionKind: "action", permissionCode: "approval.request.decide", resourceGroup: "part" },
  { permissionKind: "action", permissionCode: "transfer.package.view", resourceGroup: "transfer" },
  { permissionKind: "action", permissionCode: "approval.request.decide", resourceGroup: "transfer" },
] as const;

export function sharedReviewEntryAccess(decisions: readonly { allowed: boolean }[]) {
  const [drawingView, drawingReview, partView, partReview, transferView, transferReview] = decisions;
  return {
    drawing: drawingView?.allowed === true && drawingReview?.allowed === true,
    part: partView?.allowed === true && partReview?.allowed === true,
    transfer: transferView?.allowed === true && transferReview?.allowed === true,
  };
}

export type ApprovalWorkbenchStatus =
  | "active"
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "needs_info"
  | "cancelled"
  | "apply_failed"
  | "applied";

export type ApprovalWorkbenchQuery = {
  view?: "submitted";
  status: ApprovalWorkbenchStatus;
  domain: string;
  action: string;
  query: string;
  limit: number;
};

export type ApprovalWorkbenchCursorDirection = "after" | "before";

export type ApprovalWorkbenchCursor = {
  sortValue: string;
  rowKey: string;
  direction?: ApprovalWorkbenchCursorDirection;
};

export type ApprovalWorkbenchRow = {
  rowKey: string;
  id: string;
  source: string;
  companyId: string;
  actionCode: string;
  actionTitle: string;
  domainCode: string;
  title: string;
  status: Exclude<ApprovalWorkbenchStatus, "active" | "all">;
  reason: string;
  requestedBy: string | null;
  requestedByName: string | null;
  requestedAt: string;
  packageId: string | null;
  packageCode: string | null;
  packageStatus: string | null;
  targetSummary: string;
  impactSummary: string | null;
  legacy: { table: string; id: string } | null;
  primaryTarget?: { type: string; targetId: string; code: string | null; label: string };
  ownerHref?: string;
  historyOnly?: boolean;
  supersededByRequestId?: string | null;
  supersededAt?: string | null;
};

export type ApprovalWorkbenchFilters = {
  status: ApprovalWorkbenchStatus;
  domain: string;
  action: string;
  query: string;
};

export type ApprovalWorkbenchListResponse = PdmWorkbenchListResponse<ApprovalWorkbenchRow, ApprovalWorkbenchFilters> & {
  previousCursor?: string | null;
  pageIndex?: number;
  summary: {
    total: number;
    pending: number;
    needsInfo: number;
    applyFailed: number;
  };
};

export function approvalWorkbenchRowKey(source: string, id: string) {
  return `approval:${source}:${id}`;
}

export function approvalWorkbenchCursorSortValue(requestedAt: string) {
  return requestedAt;
}
