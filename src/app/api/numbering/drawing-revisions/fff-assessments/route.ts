import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ error: "DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED", message: "FFF 請由新版圖號工作台處理。" }, { status: 410, headers: { "cache-control": "no-store" } });
}
