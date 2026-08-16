import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canManageBomDraftRecordAsync } from "@/lib/bom-create-context";
import { getBomWorkbenchDraftByIdAsync, setBomWorkbenchActiveDraftAsync } from "@/lib/bom-workbench-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  if (!(await canManageBomDraftRecordAsync(auth.user, draft))) return forbidden();

  try {
    return NextResponse.json({
      draft: await setBomWorkbenchActiveDraftAsync({ draftId, actorId: auth.user.id })
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BOM_DRAFT_ACTIVE_FAILED" }, { status: 400 });
  }
}
