import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { getBomWorkbenchDraftById, getSubmission, setBomWorkbenchActiveDraft } from "@/lib/db";
import { canReadBomDraft } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = getBomWorkbenchDraftById(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  const submission = getSubmission(draft.parent_submission_id);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!canReadBomDraft(auth.user, submission)) return forbidden();

  try {
    return NextResponse.json({
      draft: setBomWorkbenchActiveDraft({ draftId, actorId: auth.user.id })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_DRAFT_ACTIVE_FAILED" }, { status: 400 });
  }
}
