import { NextResponse } from "next/server";
import { productionSliceClientStatus } from "@/lib/production-slice";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(productionSliceClientStatus());
}
