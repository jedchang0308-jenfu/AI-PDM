import { NextResponse } from "next/server";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export async function handleDrawingRevisionReviewAction(request: Request, _context?: unknown, _action?: unknown) {
  const auth = await requireNumberingActionAsync(request, "numbering.approval.batch.decide");
  if (auth.response) return auth.response;
  return NextResponse.json({ error: "DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED", message: "舊版圖面審核動作已退役，請回新版工作台。" }, { status: 410 });
}
