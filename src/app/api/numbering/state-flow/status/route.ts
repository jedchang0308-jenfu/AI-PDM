import { NextResponse } from "next/server";
import { numberStateFlowV1ClientStatus } from "@/lib/number-state-flow-feature";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(numberStateFlowV1ClientStatus(), {
    headers: { "cache-control": "private, no-store" }
  });
}
