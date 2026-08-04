import { NextResponse } from "next/server";
import {
  numberLifecycleV2ClientStatus,
  numberStateFlowV1ClientStatus
} from "@/lib/number-state-flow-feature";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ...numberStateFlowV1ClientStatus(),
    lifecycleV2: numberLifecycleV2ClientStatus()
  }, {
    headers: { "cache-control": "private, no-store" }
  });
}
