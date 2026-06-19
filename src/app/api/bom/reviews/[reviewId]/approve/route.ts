import { NextResponse } from "next/server";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import {
  approveBomWorkbenchReviewAsync,
  BomReleaseGateError,
  getBomWorkbenchDraftByIdAsync,
  getBomWorkbenchReviewByIdAsync
} from "@/lib/bom-workbench-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { reviewId } = await params;
  const review = await getBomWorkbenchReviewByIdAsync(reviewId);
  if (!review) {
    return NextResponse.json({ error: "BOM review not found" }, { status: 404 });
  }
  const draft = await getBomWorkbenchDraftByIdAsync(review.bom_draft_id);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }
  const submission = await getSubmissionAsync(draft.parent_submission_id);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as { decisionReason?: unknown };
  try {
    return NextResponse.json({
      result: await approveBomWorkbenchReviewAsync({
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
