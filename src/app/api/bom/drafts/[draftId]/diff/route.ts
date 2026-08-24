import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canReadBomDraftRecordAsync } from "@/lib/bom-create-context";
import { getBomWorkbenchDraftByIdAsync, getBomWorkbenchDraftDiffAsync } from "@/lib/bom-workbench-async";
import { authorizeSharedBomHttpAsync } from "@/lib/bom-shared-http";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  if (draft.definition_id) {
    const access = await authorizeSharedBomHttpAsync({
      user: auth.user,
      draftId,
      capability: draft.status === "Released" || draft.status === "Obsolete" ? "released_projection_read" : "draft_evidence_read"
    });
    if (access.response) return access.response;
  } else if (!(await canReadBomDraftRecordAsync(auth.user, draft))) return forbidden();

  return NextResponse.json({ diff: await getBomWorkbenchDraftDiffAsync(draftId) });
}
