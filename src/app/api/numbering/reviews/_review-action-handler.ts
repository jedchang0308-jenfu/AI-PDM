import { NextResponse } from "next/server";

export async function handleDrawingRevisionReviewAction(_request: Request, _context?: unknown, _action?: unknown) {
  return NextResponse.json({ error: "DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED", message: "舊版圖面審核動作已退役，請回新版工作台。" }, { status: 410 });
}
