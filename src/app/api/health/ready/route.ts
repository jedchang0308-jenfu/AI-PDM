import { NextResponse } from "next/server";

import { verifyAsyncDatabaseReadiness } from "@/lib/db-async-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await verifyAsyncDatabaseReadiness();
    return NextResponse.json({ status: "ready" }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}
