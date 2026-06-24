import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { getBomWorkbenchDraftByIdAsync, reconfirmBomWorkbenchReplacementFlagsAsync } from "@/lib/bom-workbench-async";
import { canReadBomDraftAsync } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  const submission = await getSubmissionAsync(draft.parent_submission_id);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!(await canReadBomDraftAsync(auth.user, submission))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as { note?: unknown };
  try {
    const updated = await reconfirmBomWorkbenchReplacementFlagsAsync({
      draftId,
      actorId: auth.user.id,
      note: typeof body.note === "string" ? body.note : undefined
    });
    return NextResponse.json({ draft: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_RECONFIRMATION_FAILED" }, { status: 400 });
  }
}
