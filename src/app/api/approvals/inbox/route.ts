import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { listApprovalPlatformInboxAsync } from "@/lib/approval-platform";
import type { ApprovalPlatformInboxCursor, ApprovalPlatformStatus } from "@/lib/repositories/approval-platform-async-repository";
import { isPdmEntityDetailV1Enabled } from "@/lib/number-state-flow-feature";
import { isSafePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";
import { buildPdmApprovalOwnerHref } from "@/lib/pdm-approval-owner-route";
import { decodePdmWorkbenchCursor, encodePdmWorkbenchCursor, pdmWorkbenchFilterHash, PdmWorkbenchCursorError } from "@/lib/pdm-workbench-cursor";

export const runtime = "nodejs";
const reviewerRoles = ["R&D Manager", "Admin"] as const;

const allowedStatuses = new Set<string>([
  "active",
  "all",
  "pending",
  "approved",
  "rejected",
  "needs_info",
  "cancelled",
  "apply_failed",
  "applied"
]);

export async function GET(request: Request) {
  const auth = await requireRoleAsync(request, [...reviewerRoles]);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "active";
  const status = (allowedStatuses.has(statusParam) ? statusParam : "active") as
    | "active"
    | "all"
    | ApprovalPlatformStatus;
  const limitParam = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 100;
  const companyId = auth.user.company_id || undefined;
  const domainCode = url.searchParams.get("domain")?.trim() || undefined;
  const actionCode = url.searchParams.get("action")?.trim() || undefined;
  const query = normalizeApprovalQuery(url.searchParams.get("query"));
  const filterHash = pdmWorkbenchFilterHash({
    namespace: "approval-inbox-v1",
    filters: { status, domain: domainCode ?? "all", action: actionCode ?? "all", query, limit },
    companyId: companyId ?? "",
    actorId: auth.user.id
  });
  const cursorValue = url.searchParams.get("cursor")?.trim() || null;
  let cursor: ApprovalPlatformInboxCursor | null = null;
  let cursorPageIndex: number | null = null;
  if (cursorValue) {
    try {
      const decoded = decodePdmWorkbenchCursor(cursorValue, filterHash);
      cursor = { sortValue: decoded.sortValue ?? decoded.updatedAt, rowKey: decoded.rowKey, direction: decoded.direction };
      cursorPageIndex = decoded.pageIndex ?? null;
    } catch (error) {
      const message = error instanceof PdmWorkbenchCursorError ? error.message : "這個清單位置已失效，請從第一頁重新查詢。";
      return NextResponse.json({ error: { code: "workbench_invalid_cursor", message, retryable: true } }, { status: 400 });
    }
  }
  const page = await listApprovalPlatformInboxAsync({ companyId, actorId: auth.user.id, status, limit, domainCode, actionCode, query, cursor });
  const requestedReturnTo = url.searchParams.get("returnTo") ?? "";
  const returnTo = isSafePdmApprovalReturnTo(requestedReturnTo) ? requestedReturnTo : buildApprovalReturnTo(url);
  const ownerItems = isPdmEntityDetailV1Enabled() ? page.items.map((item) => ({ ...item, ownerHref: buildPdmApprovalOwnerHref(item, returnTo) ?? undefined })) : page.items;
  const pageIndex = cursorPageIndex ?? normalizePageIndex(url.searchParams.get("page"));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: page.summary,
    rows: ownerItems,
    items: ownerItems,
    nextCursor: page.nextCursor ? encodeApprovalCursor(page.nextCursor, filterHash, pageIndex + 1) : null,
    previousCursor: page.previousCursor ? encodeApprovalCursor(page.previousCursor, filterHash, Math.max(0, pageIndex - 1)) : null,
    pageIndex,
    filters: { status, domain: domainCode ?? "all", action: actionCode ?? "all", query }
  });
}

function encodeApprovalCursor(cursor: { sortValue: string; rowKey: string; direction?: "after" | "before" }, filterHash: string, pageIndex: number) {
  return encodePdmWorkbenchCursor({
    version: 1,
    filterHash,
    updatedAt: cursor.sortValue,
    sortValue: cursor.sortValue,
    rowKey: cursor.rowKey,
    direction: cursor.direction,
    pageIndex
  });
}

function normalizePageIndex(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeApprovalQuery(value: string | null) {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, 160);
}

function buildApprovalReturnTo(url: URL) {
  const params = new URLSearchParams(url.searchParams);
  params.delete("cursor");
  params.delete("page");
  params.delete("returnTo");
  const query = params.toString();
  return `/approvals${query ? `?${query}` : ""}`;
}
