import { NextResponse } from "next/server";
import { getAuthMode, getFirebaseWebConfig, getJenfuSsoHandoffEntryState } from "@/lib/auth-config";
import { getGoogleOAuthPublicStatus } from "@/lib/google-oauth";
import { isLocalQuickLoginAvailable } from "@/lib/local-quick-login";
import { isLocalPrincipalSandboxRequested } from "@/lib/local-sandbox-principal-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let localPrincipalSandbox = false;
  let authMode: ReturnType<typeof getAuthMode> = "demo";
  try {
    localPrincipalSandbox = isLocalPrincipalSandboxRequested();
    authMode = getAuthMode();
  } catch {
    return NextResponse.json({ code: "local_sandbox_unavailable" }, { status: 503,
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
  const firebaseConfig = authMode === "firebase_bff" ? getFirebaseWebConfig() : null;
  const ssoState = authMode === "firebase_bff" ? getJenfuSsoHandoffEntryState() : "off";
  if (ssoState === "invalid") {
    return NextResponse.json({ code: "sso_dependency_unavailable" }, { status: 503, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
  return NextResponse.json({
    authMode,
    ssoHandoffEnabled: ssoState === "on",
    accountInvitations: authMode !== "firebase_bff",
    localQuickLogin: isLocalQuickLoginAvailable(request),
    localPrincipalSandbox,
    googleOAuth: ssoState === "on" ? { enabled: false, provider: "firebase" } : authMode === "firebase_bff" ? { enabled: Boolean(firebaseConfig), provider: "firebase" } : getGoogleOAuthPublicStatus(),
    firebase: firebaseConfig ? { enabled: true, config: firebaseConfig } : { enabled: false, config: null }
  }, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
