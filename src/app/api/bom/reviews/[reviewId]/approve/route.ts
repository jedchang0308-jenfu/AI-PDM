import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { approveBomWorkbenchReview, BomReleaseGateError, getBomWorkbenchDraftById, getBomWorkbenchReviewById, getSubmission } from "@/lib/db";
import { canReadSubmission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;
  if (auth.user.role !== "R&D Manager" && auth.user.role !== "Admin") return forbidden();

  const { reviewId } = await params;
  const review = getBomWorkbenchReviewById(reviewId);
  if (!review) {
    return NextResponse.json({ error: "BOM review not found" }, { status: 404 });
  }
  const draft = getBomWorkbenchDraftById(review.bom_draft_id);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }
  const submission = getSubmission(draft.parent_submission_id);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const body = (await request.json().catch(() => ({}))) as { decisionReason?: unknown };
  try {
    return NextResponse.json({
      result: approveBomWorkbenchReview({
        reviewId,
        actorId: auth.user.id,
        decisionReason: typeof body.decisionReason === "string" ? body.decisionReason : undefined
      })
    });
  } catch (error) {
    if (error instanceof BomReleaseGateError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_REVIEW_APPROVE_FAILED" }, { status: 400 });
  }
}
