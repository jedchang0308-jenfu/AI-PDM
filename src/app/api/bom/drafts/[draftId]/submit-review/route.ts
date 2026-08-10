import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canReadBomDraftRecordAsync } from "@/lib/bom-create-context";
import { getBomWorkbenchDraftByIdAsync, submitBomWorkbenchDraftReviewAsync } from "@/lib/bom-workbench-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  if (!(await canReadBomDraftRecordAsync(auth.user, draft))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as { changeReason?: unknown };
  try {
    const review = await submitBomWorkbenchDraftReviewAsync({
      draftId,
      actorId: auth.user.id,
      changeReason: typeof body.changeReason === "string" ? body.changeReason : ""
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_REVIEW_SUBMIT_FAILED" }, { status: 400 });
  }
}
