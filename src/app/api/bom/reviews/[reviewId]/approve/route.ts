import { NextResponse } from "next/server";
import { decideApprovalPlatformLegacyBomAsync } from "@/lib/approval-platform";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { canReadBomDraftRecordAsync } from "@/lib/bom-create-context";
import {
  BomReleaseGateError,
  getBomWorkbenchDraftByIdAsync,
  getBomWorkbenchReviewByIdAsync
} from "@/lib/bom-workbench-async";

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
  if (!(await canReadBomDraftRecordAsync(auth.user, draft))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as { decisionReason?: unknown };
  try {
    return NextResponse.json({
      result: await decideApprovalPlatformLegacyBomAsync({
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_REVIEW_APPROVE_FAILED" }, { status: 400 });
  }
}
