import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canManageBomDraftRecordAsync } from "@/lib/bom-create-context";
import { getBomWorkbenchDraftByIdAsync, requestBomWorkbenchObsoleteReviewAsync } from "@/lib/bom-workbench-async";
import { buildBomWorkbenchDraftLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";
import { authorizeSharedBomHttpAsync, sharedBomHttpError } from "@/lib/bom-shared-http";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });

  if (draft.definition_id) {
    const access = await authorizeSharedBomHttpAsync({ user: auth.user, draftId, capability: "edit" });
    if (access.response) return access.response;
  } else if (!(await canManageBomDraftRecordAsync(auth.user, draft))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  try {
    const review = await requestBomWorkbenchObsoleteReviewAsync({
      draftId,
      actorId: auth.user.id,
      reason: typeof body.reason === "string" ? body.reason : ""
    });
    return NextResponse.json(
      {
        review,
        policy: buildBomWorkbenchDraftLifecyclePolicy({
          draftId,
          status: draft.status,
          pendingObsoleteRequest: true
        })
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "BOM_OBSOLETE_REQUEST_FAILED";
    return NextResponse.json({ error: message }, { status: bomObsoleteErrorStatus(message) });
  }
}

function bomObsoleteErrorStatus(message: string) {
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("PERMISSION")) return 403;
  if (message.includes("ALREADY") || message.includes("NOT_FORMAL") || message.includes("REASON_REQUIRED")) return 409;
  return 400;
}
