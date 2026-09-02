import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canEditBomDraftRecordAsync } from "@/lib/bom-create-context";
import { BomFloatingTopicsUnresolvedError, getBomWorkbenchDraftByIdAsync, submitBomWorkbenchDraftReviewAsync } from "@/lib/bom-workbench-async";
import { authorizeSharedBomHttpAsync, sharedBomHttpError } from "@/lib/bom-shared-http";
import { SharedBomError } from "@/lib/bom-shared-structure";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }
  if (draft.definition_id) {
    const access = await authorizeSharedBomHttpAsync({ user: auth.user, draftId, capability: "edit" });
    if (access.response) return access.response;
  } else if (!(await canEditBomDraftRecordAsync(auth.user, draft))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as { changeReason?: unknown };
  try {
    const review = await submitBomWorkbenchDraftReviewAsync({
      draftId,
      actorId: auth.user.id,
      changeReason: typeof body.changeReason === "string" ? body.changeReason : ""
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    if (error instanceof BomFloatingTopicsUnresolvedError) {
      return NextResponse.json(
        {
          error: error.message,
          message: `尚有 ${error.floatingTopicCount} 個 Floating Topic 未歸入正式 BOM，請先拖回樹上或刪除。`,
          floatingTopicCount: error.floatingTopicCount
        },
        { status: 409 }
      );
    }
    if (error instanceof SharedBomError) {
      return sharedBomHttpError(error.code, error.status, error.details);
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_REVIEW_SUBMIT_FAILED" }, { status: 400 });
  }
}
