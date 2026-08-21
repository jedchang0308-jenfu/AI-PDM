import { NextResponse } from "next/server";
import { getAuthMode, getFirebaseWebConfig } from "@/lib/auth-config";
import { getGoogleOAuthPublicStatus } from "@/lib/google-oauth";
import { isLocalQuickLoginAvailable } from "@/lib/local-quick-login";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authMode = getAuthMode();
  const firebaseConfig = authMode === "firebase_bff" ? getFirebaseWebConfig() : null;
  return NextResponse.json({
    authMode,
    accountInvitations: authMode !== "firebase_bff",
    localQuickLogin: isLocalQuickLoginAvailable(request),
    googleOAuth: authMode === "firebase_bff" ? { enabled: Boolean(firebaseConfig), provider: "firebase" } : getGoogleOAuthPublicStatus(),
    firebase: firebaseConfig ? { enabled: true, config: firebaseConfig } : { enabled: false, config: null }
  });
}
