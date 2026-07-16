import { NextResponse } from "next/server";
import { AccountInvitationError, lookupAccountInvitationAsync } from "@/lib/account-invitations";
import { beginGoogleOAuth, GoogleOAuthError } from "@/lib/google-oauth";
import { getAuthMode } from "@/lib/auth-config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (getAuthMode() === "firebase_bff") {
    return NextResponse.json({ error: "legacy_google_oauth_disabled" }, { status: 404 });
  }
  const url = new URL(request.url);
  const invitationToken = url.searchParams.get("invite_token")?.trim() ?? "";
  const returnTo = url.searchParams.get("return_to") ?? "/";

  try {
    const invitation = invitationToken ? await lookupAccountInvitationAsync(invitationToken) : null;
    const authorization = await beginGoogleOAuth({
      purpose: invitation ? "invite" : "login",
      invitationId: invitation?.id,
      invitationEmail: invitation?.email,
      returnTo
    });
    return NextResponse.redirect(authorization.authorizationUrl, {
      status: 303,
      headers: { "set-cookie": authorization.stateCookie }
    });
  } catch (error) {
    if (error instanceof AccountInvitationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
    }
    if (error instanceof GoogleOAuthError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "google_oauth_start_failed", message: "Google 登入目前無法啟動，請稍後再試。" }, { status: 500 });
  }
}
