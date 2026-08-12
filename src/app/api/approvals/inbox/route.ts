import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { listApprovalPlatformInboxAsync } from "@/lib/approval-platform";
import type { ApprovalPlatformStatus } from "@/lib/repositories/approval-platform-async-repository";
import { isPdmEntityDetailV1Enabled } from "@/lib/number-state-flow-feature";
import { isSafePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";

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
  const items = await listApprovalPlatformInboxAsync({ companyId, actorId: auth.user.id, status, limit, domainCode, actionCode });
  const requestedReturnTo = url.searchParams.get("returnTo") ?? "";
  const returnTo = isSafePdmApprovalReturnTo(requestedReturnTo) ? requestedReturnTo : `/approvals${url.search ? `?${url.searchParams.toString()}` : ""}`;
  const ownerItems = isPdmEntityDetailV1Enabled() ? items.map((item) => ({ ...item, ownerHref: approvalOwnerHref(item, returnTo) ?? undefined })) : items;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: ownerItems.length,
      pending: ownerItems.filter((item) => item.status === "pending").length,
      needsInfo: ownerItems.filter((item) => item.status === "needs_info").length,
      applyFailed: ownerItems.filter((item) => item.status === "apply_failed").length
    },
    items: ownerItems
  });
}

function approvalOwnerHref(item: { source: string; actionCode: string; id: string; primaryTarget?: { type: string; targetId: string } }, returnTo: string) {
  // Legacy records do not have the native request/target scope receipt yet.
  // Keep them on the existing drawer rather than emitting an unverifiable URL.
  if (item.source !== "platform") return null;
  const target = item.primaryTarget;
  if (!target) return null;
  const covered = new Set([
    "numbering.candidate_bundle_review",
    "numbering.candidate_publication_review",
    "numbering.drawing_revision_lifecycle_review",
    "numbering.drawing_revision_impact_review",
    "numbering.same_drawing_variant_after_release",
    "numbering.main_drawing_restore",
    "numbering.obsolete_part_number",
    "numbering.obsolete_ma_drawing",
    "numbering.obsolete_part_root",
    "numbering.release",
    "numbering.release_missing_ma_confirm"
  ]);
  if (!covered.has(item.actionCode)) return null;
  const targetType = target.type.toLowerCase();
  const surface = targetType.includes("workspace") || targetType.includes("root") ? "relation" : targetType.includes("drawing") ? "drawing" : "part";
  const prefix = surface === "drawing" ? "drawing" : surface === "part" ? "part" : targetType.includes("workspace") ? "candidate" : "root";
  const path = surface === "drawing" ? "/numbering/drawings" : surface === "part" ? "/parts" : "/numbering/search";
  const params = new URLSearchParams({ detail: `${prefix}:${target.targetId}`, reviewRequestId: item.id, returnTo });
  return `${path}?${params.toString()}`;
}
