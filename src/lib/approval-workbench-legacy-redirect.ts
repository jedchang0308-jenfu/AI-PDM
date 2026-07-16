export type LegacyApprovalRouteKind = "numbering_approvals" | "bom_reviews" | "numbering_change_reviews";

export type LegacyApprovalSearchParams = Record<string, string | string[] | undefined>;

const allowedStatuses = new Set(["active", "pending", "needs_info", "apply_failed", "approved", "rejected", "all"]);

const routeConfig: Record<LegacyApprovalRouteKind, { domain: string; action?: string }> = {
  numbering_approvals: { domain: "numbering" },
  bom_reviews: { domain: "bom" },
  numbering_change_reviews: { domain: "numbering", action: "numbering.drawing_revision_impact_review" }
};

export function buildLegacyApprovalWorkbenchRedirect(kind: LegacyApprovalRouteKind, searchParams: LegacyApprovalSearchParams = {}) {
  const config = routeConfig[kind];
  const params = new URLSearchParams();
  params.set("status", normalizeStatus(firstParam(searchParams.status)));
  params.set("domain", config.domain);
  if (config.action) params.set("action", config.action);
  params.set("legacyRedirect", kind);

  const requestId =
    firstParam(searchParams.requestId) ??
    firstParam(searchParams.approvalRequestId) ??
    firstParam(searchParams.reviewId) ??
    firstParam(searchParams.id);
  if (requestId) params.set("requestId", requestId);

  return `/approvals?${params.toString()}`;
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function normalizeStatus(value: string | null) {
  if (!value) return "active";
  if (value === "partially_approved") return "active";
  return allowedStatuses.has(value) ? value : "active";
}
