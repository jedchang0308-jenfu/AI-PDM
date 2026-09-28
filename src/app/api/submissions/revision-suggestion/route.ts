import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** The generic upload flow is retired; revision suggestions belong to the drawing workbench. */
function retiredRevisionSuggestion() {
  return NextResponse.json({
    code: "GENERIC_SUBMISSION_RETIRED",
    message: "通用上傳送審已退役。請從圖號工作台建立送審。",
    canonicalHref: "/numbering/drawings"
  }, { status: 410, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  return retiredRevisionSuggestion();
}

export async function POST() {
  return retiredRevisionSuggestion();
}
