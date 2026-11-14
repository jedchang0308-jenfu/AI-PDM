import { NextResponse } from "next/server";

import { getAsyncDatabaseClient, verifyAsyncDatabaseReadiness } from "@/lib/db-async-provider";
import { principalPermissionSnapshotsEnabled } from "@/lib/principal-session-permission-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await verifyAsyncDatabaseReadiness();
    if (principalPermissionSnapshotsEnabled() &&
        !await getAsyncDatabaseClient().queryOne("SELECT initial_source_version FROM ai_pdm_core.reviewer_authority_state")) {
      return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
    }
    return NextResponse.json({ status: "ready" }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
}
