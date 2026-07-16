import { NextResponse } from "next/server";
import { getAuthMode, getFirebaseWebConfig } from "@/lib/auth-config";
import { getGoogleOAuthPublicStatus } from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET() {
  const authMode = getAuthMode();
  const firebaseConfig = authMode === "firebase_bff" ? getFirebaseWebConfig() : null;
  return NextResponse.json({
    authMode,
    accountInvitations: authMode !== "firebase_bff",
    googleOAuth: authMode === "firebase_bff" ? { enabled: Boolean(firebaseConfig), provider: "firebase" } : getGoogleOAuthPublicStatus(),
    firebase: firebaseConfig ? { enabled: true, config: firebaseConfig } : { enabled: false, config: null }
  });
}
