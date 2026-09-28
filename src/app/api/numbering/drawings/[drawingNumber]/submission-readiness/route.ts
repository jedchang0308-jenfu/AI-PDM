import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    error: "DRAWING_SOURCE_SUBMISSION_RETIRED",
    code: "DRAWING_SOURCE_SUBMISSION_RETIRED",
    message: "舊圖面送審入口已退役，請從圖號工作台建立進版工作並送審。",
    recoveryHref: "/numbering/drawings"
  }, { status: 410, headers: { "cache-control": "no-store" } });
}
