import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { drawingRevisionLifecycleLatestHref } from "@/lib/drawing-revision-lifecycle";

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

export type LegacyDrawingLifecycleNavigation = {
  canonicalHref: string;
  drawingNumber: string;
};

export async function resolveLegacyDrawingLifecycleNavigation(input: {
  submissionId: string;
  actorId: string;
  companyId: string;
}): Promise<LegacyDrawingLifecycleNavigation | null> {
  const row = await getAsyncDatabaseClient().queryOne<{
    approval_request_id: string | null;
    drawing_number_id: string;
    drawing_number: string;
    company_id: string;
    reviewer_match: number | string;
  }>(
    `SELECT
       workflow.approval_request_id,
       package.drawing_number_id,
       package.drawing_number,
       workflow.company_id,
       CASE WHEN EXISTS (
         SELECT 1
         FROM drawing_revision_lifecycle_reviewers reviewer
         WHERE reviewer.workflow_id = workflow.id
           AND reviewer.reviewer_id = :actorId
       ) THEN 1 ELSE 0 END AS reviewer_match
     FROM drawing_revision_lifecycle_workflows workflow
     JOIN drawing_revision_packages package ON package.id = workflow.package_id
     WHERE workflow.legacy_submission_id = :submissionId
     LIMIT 1`,
    { submissionId: input.submissionId, actorId: input.actorId }
  );
  if (!row || row.company_id !== input.companyId) return null;
  const canonicalHref = row.approval_request_id && Number(row.reviewer_match) === 1
    ? `/approvals?requestId=${encodeURIComponent(row.approval_request_id)}&drawing=${encodeURIComponent(row.drawing_number)}`
    : drawingRevisionLifecycleLatestHref({
        drawingNumber: row.drawing_number,
        drawingNumberId: row.drawing_number_id
      });
  return { canonicalHref, drawingNumber: row.drawing_number };
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
