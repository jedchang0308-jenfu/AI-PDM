import { NextResponse } from "next/server";
import { getPublicPrivacyNotice } from "@/lib/privacy-notice";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { notice: getPublicPrivacyNotice() },
    { headers: { "cache-control": "public, max-age=300, must-revalidate" } }
  );
}
