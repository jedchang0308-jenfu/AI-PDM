import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canManageBomDraftRecordAsync } from "@/lib/bom-create-context";
import { getBomWorkbenchDraftByIdAsync, setBomWorkbenchActiveDraftAsync } from "@/lib/bom-workbench-async";
import { authorizeSharedBomHttpAsync, sharedBomHttpError } from "@/lib/bom-shared-http";

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
  } else if (!(await canManageBomDraftRecordAsync(auth.user, draft))) return forbidden();

  try {
    return NextResponse.json({
      draft: await setBomWorkbenchActiveDraftAsync({ draftId, actorId: auth.user.id })
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BOM_DRAFT_ACTIVE_FAILED";
    return draft.definition_id && code === "BOM_OPERATION_RETIRED"
      ? sharedBomHttpError(code, 410)
      : NextResponse.json({ error: code }, { status: 400 });
  }
}
