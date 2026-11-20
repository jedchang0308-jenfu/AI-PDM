import { NextResponse } from "next/server";
import { getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { AsyncApprovalPlatformRepository, type ApprovalPlatformInboxCursor,
  type ApprovalPlatformStatus, type SharedReviewInboxAccess } from "@/lib/repositories/approval-platform-async-repository";
import { principalRequestFailure, principalRequestInput,
  principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest, type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { evaluatePrincipalWorkspacePermissionsInSnapshot, type PrincipalWorkspacePermission } from "@/lib/jenfu-principal-permission-service";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { isVerifiedLocalTestAdmin } from "@/lib/local-test-admin";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { isSafePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";
import { SHARED_REVIEW_ENTRY_PERMISSIONS, sharedReviewEntryAccess } from "@/lib/approval-workbench-contract";
import { buildPdmApprovalOwnerHref } from "@/lib/pdm-approval-owner-route";
import { decodePdmWorkbenchCursor, encodePdmWorkbenchCursor, pdmWorkbenchFilterHash, PdmWorkbenchCursorError } from "@/lib/pdm-workbench-cursor";

export const runtime = "nodejs";

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
  if (platformMode !== "on") return NextResponse.json({ code: "principal_mode_required" },
    { status: 503, headers: { "cache-control": "no-store" } });
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
    return await withVerifiedJenfuPrincipalRequest(await principalRequestInput(token, request), async (snapshot, verified) => {
      const mine = new URL(request.url).searchParams.get("view") === "submitted";
      const repository = new AsyncApprovalPlatformRepository(snapshot);
      if (mine) {
        const readable = await readSubmittedAccess(snapshot, verified);
        if (!readable) return jenfuEntitlementFailureResponse("permission_not_granted");
        return renderInbox(request, verified.profile.companyId, verified.session.principalId,
          verified.profile.pdmUserId, repository, { readable });
      }
      const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
        [{ permissionKind: "action", permissionCode: "approval.inbox.view" }]);
      const decision = decisions[0];
      if (decisions.length !== 1 || !decision || decision.permissionCode !== "approval.inbox.view" ||
        decision.principalId !== verified.session.principalId) {
        return NextResponse.json({ code: "principal_dependency_unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } });
      }
      const sharedAccess = await readSharedAccess(snapshot, verified);
      if (!decision.allowed && !(sharedAccess?.drawing || sharedAccess?.part || sharedAccess?.transfer)) {
        return jenfuEntitlementFailureResponse(decision.decisionCode);
      }
      return renderInbox(request, verified.profile.companyId, verified.session.principalId,
        verified.profile.pdmUserId, repository, { sharedAccess, includeAssigned: decision.allowed });
    });
  } catch (error) {
    return error instanceof JenfuPrincipalRequestError
      ? principalRequestFailure(error)
      : NextResponse.json({ code: "principal_dependency_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
  }
}

async function readSubmittedAccess(snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) {
  if (!verified.permissions && !isVerifiedLocalTestAdmin(verified, snapshot)) return null;
  const checks = [
    { permissionKind: "page", permissionCode: "numbering.drawings.view", resourceGroup: "drawing" },
    { permissionKind: "page", permissionCode: "numbering.search", resourceGroup: "part" },
    { permissionKind: "action", permissionCode: "transfer.package.view", resourceGroup: "transfer" }
  ] satisfies PrincipalWorkspacePermission[];
  const [drawing, part, transfer] = await readInboxDecisions(snapshot, verified, checks);
  return drawing.allowed || part.allowed || transfer.allowed
    ? { drawing: drawing.allowed, part: part.allowed, transfer: transfer.allowed }
    : null;
}

async function readSharedAccess(snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest): Promise<SharedReviewInboxAccess | undefined> {
  if (!verified.permissions && !isVerifiedLocalTestAdmin(verified, snapshot)) return undefined;
  const checks = [
    ...SHARED_REVIEW_ENTRY_PERMISSIONS,
    { permissionKind: "action", permissionCode: "pdm.model.review", resourceGroup: "model" },
    { permissionKind: "action", permissionCode: "numbering.publish", resourceGroup: "drawing" },
    { permissionKind: "action", permissionCode: "numbering.publish", resourceGroup: "part" }
  ] satisfies PrincipalWorkspacePermission[];
  const decisions = await readInboxDecisions(snapshot, verified, checks);
  const entry = sharedReviewEntryAccess(decisions);
  const [model, publishDrawing, publishPart] = decisions.slice(SHARED_REVIEW_ENTRY_PERMISSIONS.length);
  const dynamic = verified.permissions?.catalogVersion.startsWith("ai-pdm.role-policy.") === true;
  return { ...entry, model: !dynamic || model.allowed,
    publishDrawing: publishDrawing.allowed, publishPart: publishPart.allowed };
}

async function readInboxDecisions(snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest,
  checks: readonly PrincipalWorkspacePermission[]) {
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified, checks);
  if (decisions.length !== checks.length || decisions.some((decision, index) =>
    decision.principalId !== verified.session.principalId ||
    decision.permissionCode !== checks[index].permissionCode ||
    decision.allowed !== (decision.decisionCode === "allowed"))) {
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
  return decisions;
}

async function renderInbox(request: Request, companyId: string, principalId: string,
  reviewerProfileId: string, repository: AsyncApprovalPlatformRepository,
  access: { sharedAccess?: SharedReviewInboxAccess; includeAssigned?: boolean;
    readable?: Pick<SharedReviewInboxAccess, "drawing" | "part" | "transfer"> }) {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? (access.readable ? "all" : "active");
  const status = (allowedStatuses.has(statusParam) ? statusParam : "active") as
    | "active"
    | "all"
    | ApprovalPlatformStatus;
  const limitParam = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 100;
  const requestedDomain = url.searchParams.get("domain")?.trim();
  const domainCode = requestedDomain && requestedDomain !== "all" ? requestedDomain : undefined;
  const actionCode = url.searchParams.get("action")?.trim() || undefined;
  const query = normalizeApprovalQuery(url.searchParams.get("query"));
  const filterHash = pdmWorkbenchFilterHash({
    namespace: "approval-inbox-principal-v2",
    filters: { status, domain: domainCode ?? "all", action: actionCode ?? "all", query, limit,
      ...(access.readable ? { view: "submitted" } : {}) },
    companyId,
    actorId: principalId
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
  const filter = {
    companyId,
    actorId: reviewerProfileId,
    principalId,
    status,
    limit,
    domainCode,
    actionCode,
    query,
    cursor
  };
  const page = access.readable
    ? await repository.listPrincipalSubmittedReviews({ ...filter, readable: access.readable })
    : await repository.listPrincipalWorkReviewInbox({ ...filter, summaryOnly: url.searchParams.get("view") === "count", includeAssigned: access.includeAssigned,
      ...(access.sharedAccess ? { sharedAccess: access.sharedAccess } : {}) });
  const requestedReturnTo = url.searchParams.get("returnTo") ?? "";
  const returnTo = isSafePdmApprovalReturnTo(requestedReturnTo) ? requestedReturnTo : buildApprovalReturnTo(url);
  const ownerItems = access.readable ? page.items : page.items.map((item) => ({
    ...item,
    ownerHref: item.source === "platform" && item.actionCode === "transfer.package_review"
      ? `/approvals/${encodeURIComponent(item.id)}?returnTo=${encodeURIComponent(returnTo)}`
      : buildPdmApprovalOwnerHref(item, returnTo) ?? undefined
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
