import { NextResponse } from "next/server";
import { getAuthMode } from "@/lib/auth-config";
import { getGoogleOAuthPublicStatus } from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ authMode: getAuthMode(), accountInvitations: true, googleOAuth: getGoogleOAuthPublicStatus() });
}
