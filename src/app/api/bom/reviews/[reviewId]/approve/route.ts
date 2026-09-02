import { NextResponse } from "next/server";
import { decideApprovalPlatformBomWorkbenchAsync, decideApprovalPlatformLegacyBomAsync } from "@/lib/approval-platform";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canReadBomDraftRecordAsync, resolveSharedBomCapabilityAsync } from "@/lib/bom-create-context";
import {
  BomReleaseGateError,
  BomFloatingTopicsUnresolvedError,
  getBomWorkbenchDraftByIdAsync,
  getBomWorkbenchReviewByIdAsync
} from "@/lib/bom-workbench-async";
import { sharedBomHttpError } from "@/lib/bom-shared-http";
import { SharedBomError } from "@/lib/bom-shared-structure";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;
  if (auth.user.role !== "R&D Manager" && auth.user.role !== "Admin") {
    return sharedBomHttpError("BOM_CAPABILITY_FORBIDDEN", 403);
  }

  const { reviewId } = await params;
  const review = await getBomWorkbenchReviewByIdAsync(reviewId);
  if (!review) {
    return NextResponse.json({ error: "BOM review not found" }, { status: 404 });
  }
  const draft = await getBomWorkbenchDraftByIdAsync(review.bom_draft_id);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }
  if (draft.definition_id) {
    const capability = await resolveSharedBomCapabilityAsync({
      user: auth.user,
      reviewId,
      capability: "decision"
    });
    if (!capability.authorized) {
      if (capability.submittedBy === auth.user.id) {
        return sharedBomHttpError("BOM_REVIEW_SELF_DECISION_FORBIDDEN", 403);
      }
      return capability.denial === "not_found"
        ? sharedBomHttpError("BOM_RESOURCE_NOT_FOUND", 404)
        : sharedBomHttpError("BOM_CAPABILITY_FORBIDDEN", 403);
    }
  } else if (!(await canReadBomDraftRecordAsync(auth.user, draft))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as { decisionReason?: unknown };
  try {
    const decide = Number(review.review_schema_version ?? 1) >= 2
      ? decideApprovalPlatformBomWorkbenchAsync
      : decideApprovalPlatformLegacyBomAsync;
    return NextResponse.json({
      result: await decide({
        reviewId,
        decision: "approved",
        actor: auth.user,
        comment: typeof body.decisionReason === "string" ? body.decisionReason : undefined
      })
    });
  } catch (error) {
    if (error instanceof BomReleaseGateError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 409 });
    }
    if (error instanceof BomFloatingTopicsUnresolvedError) {
      return NextResponse.json(
        { error: error.message, floatingTopicCount: error.floatingTopicCount },
        { status: 409 }
      );
    }
    if (error instanceof SharedBomError) {
      return sharedBomHttpError(error.code, error.status, error.details);
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_REVIEW_APPROVE_FAILED" }, { status: 400 });
  }
}
