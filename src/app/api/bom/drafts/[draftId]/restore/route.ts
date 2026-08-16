import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canManageBomDraftRecordAsync } from "@/lib/bom-create-context";
import { getBomWorkbenchDraftByIdAsync, restoreBomWorkbenchDraftAsync } from "@/lib/bom-workbench-async";
import { buildBomWorkbenchDraftLifecyclePolicy } from "@/lib/pdm-lifecycle-policy";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });

  if (!(await canManageBomDraftRecordAsync(auth.user, draft))) return forbidden();

  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  try {
    const restored = await restoreBomWorkbenchDraftAsync({
      draftId,
      actorId: auth.user.id,
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    if (!restored) return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
    return NextResponse.json({
      draft: restored,
      policy: buildBomWorkbenchDraftLifecyclePolicy({ draftId: restored.id, status: restored.status })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "BOM_DRAFT_RESTORE_FAILED";
    return NextResponse.json({ error: message }, { status: bomLifecycleErrorStatus(message) });
  }
}

function bomLifecycleErrorStatus(message: string) {
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("ALREADY") || message.includes("NOT_DELETABLE") || message.includes("NOT_DELETED")) return 409;
  return 400;
}
