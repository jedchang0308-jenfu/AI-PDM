import { NextResponse } from "next/server";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.update");
  if (auth.response) return auth.response;
  return NextResponse.json({ error: "DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED", message: "FFF 請由新版圖號工作台處理。" }, { status: 410 });
}
