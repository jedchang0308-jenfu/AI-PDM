import { NextResponse } from "next/server";
import { getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { listApprovalPlatformInboxAsync } from "@/lib/approval-platform";
import { AsyncApprovalPlatformRepository, type ApprovalPlatformInboxCursor,
  type ApprovalPlatformInboxPage, type ApprovalPlatformStatus } from "@/lib/repositories/approval-platform-async-repository";
import { principalRequestFailure, principalRequestInput,
  principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { isSafePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";
import { buildPdmApprovalOwnerHref } from "@/lib/pdm-approval-owner-route";
import { decodePdmWorkbenchCursor, encodePdmWorkbenchCursor, pdmWorkbenchFilterHash, PdmWorkbenchCursorError } from "@/lib/pdm-workbench-cursor";
import { isProductionNumberingLifecycleApprovalAction, isProductionNumberingLifecycleGateOpen, isProductionSliceEnforced, productionSliceDeniedPayload } from "@/lib/production-slice";

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
  let platformMode: "on" | "off";
  try { platformMode = getJenfuPlatformAuthMode(); }
  catch { return NextResponse.json({ code: "principal_dependency_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } }); }
  if (platformMode === "on") {
    const token = principalSessionTokenFromRequest(request);
    if (!token) return NextResponse.json({ code: "auth_session_invalid" },
      { status: 401, headers: { "cache-control": "no-store" } });
    try {
      const policy = resolveJenfuRoutePolicy("src/app/api/approvals/inbox/route.ts", "GET",
        { expectedPermissionCode: "approval.inbox.view" });
      if (policy?.authorizationMode !== "permission" || policy.scopeResolver !== "company") {
        return NextResponse.json({ code: "principal_route_policy_unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } });
      }
      return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (snapshot, verified) => {
        if (verified.session.assuranceLevel !== "aal2") {
          return NextResponse.json({ code: "assurance_insufficient" },
            { status: 403, headers: { "cache-control": "no-store" } });
        }
        const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
          [{ permissionKind: "action", permissionCode: "approval.inbox.view" }]);
        const decision = decisions[0];
        if (decisions.length !== 1 || !decision || decision.permissionCode !== "approval.inbox.view" ||
          decision.principalId !== verified.session.principalId) {
          return NextResponse.json({ code: "principal_dependency_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
        }
        if (!decision.allowed) return jenfuEntitlementFailureResponse(decision.decisionCode);
        const repository = new AsyncApprovalPlatformRepository(snapshot);
        return renderInbox(request, verified.profile.companyId, verified.session.principalId,
          verified.profile.pdmUserId,
          (filter) => repository.listPrincipalWorkReviewInbox({ ...filter,
            companyId: verified.profile.companyId, actorId: verified.profile.pdmUserId }), false);
      });
    } catch (error) {
      return error instanceof JenfuPrincipalRequestError
        ? principalRequestFailure(error)
        : NextResponse.json({ code: "principal_dependency_unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, [...reviewerRoles]);
  if (auth.response) return auth.response;
  return renderInbox(request, auth.user.company_id || undefined, auth.user.id, auth.user.id,
    listApprovalPlatformInboxAsync, isProductionSliceEnforced());
}

type InboxFilter = NonNullable<Parameters<typeof listApprovalPlatformInboxAsync>[0]>;

async function renderInbox(request: Request, companyId: string | undefined, cursorActorId: string,
  reviewerProfileId: string, read: (filter: InboxFilter) => Promise<ApprovalPlatformInboxPage>,
  productionApprovalScope: boolean) {
  if (productionApprovalScope && !isProductionNumberingLifecycleGateOpen("formal-obsolete")) {
    return NextResponse.json(productionSliceDeniedPayload("approvals.inbox"), { status: 403 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "active";
  const status = (allowedStatuses.has(statusParam) ? statusParam : "active") as
    | "active"
    | "all"
    | ApprovalPlatformStatus;
  const limitParam = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 100;
  const domainCode = url.searchParams.get("domain")?.trim() || undefined;
  const actionCode = url.searchParams.get("action")?.trim() || undefined;
  const query = normalizeApprovalQuery(url.searchParams.get("query"));
  const filterHash = pdmWorkbenchFilterHash({
    namespace: "approval-inbox-v1",
    filters: { status, domain: domainCode ?? "all", action: actionCode ?? "all", query, limit },
    companyId: companyId ?? "",
    actorId: cursorActorId
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
  const page = await read({
    companyId,
    actorId: reviewerProfileId,
    status,
    limit,
    domainCode,
    actionCode: productionApprovalScope && actionCode && !isProductionNumberingLifecycleApprovalAction(actionCode) ? "__blocked_action__" : actionCode,
    allowedActionCodes: productionApprovalScope ? ["numbering.obsolete_part_root", "numbering.obsolete_part_number", "numbering.obsolete_ma_drawing"] : undefined,
    query,
    cursor
  });
  const requestedReturnTo = url.searchParams.get("returnTo") ?? "";
  const returnTo = isSafePdmApprovalReturnTo(requestedReturnTo) ? requestedReturnTo : buildApprovalReturnTo(url);
  const ownerItems = page.items.map((item) => ({
    ...item,
    ownerHref: buildPdmApprovalOwnerHref(item, returnTo) ?? undefined
  }));
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
  }, { headers: { "cache-control": "private, no-store" } });
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
