import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canReadBomDraftRecordAsync } from "@/lib/bom-create-context";
import { getBomWorkbenchDraftByIdAsync, getBomWorkbenchDraftDiffAsync } from "@/lib/bom-workbench-async";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const draft = await getBomWorkbenchDraftByIdAsync(draftId);
  if (!draft) {
    return NextResponse.json({ error: "BOM draft not found" }, { status: 404 });
  }

  if (!(await canReadBomDraftRecordAsync(auth.user, draft))) return forbidden();

  return NextResponse.json({ diff: await getBomWorkbenchDraftDiffAsync(draftId) });
}
