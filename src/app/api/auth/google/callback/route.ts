import { NextResponse } from "next/server";
import { acceptAccountInvitationWithGoogleAsync, AccountInvitationError } from "@/lib/account-invitations";
import { createAuditLogAsync } from "@/lib/audit-async";
import { createSessionCookie } from "@/lib/auth";
import { getGoogleIdentityAsync, getUserByIdAsync, recordIdentityLoginAsync } from "@/lib/auth-async";
import { clearGoogleOAuthStateCookie, completeGoogleOAuth, GoogleOAuthError } from "@/lib/google-oauth";
import { AuthIdentityError } from "@/lib/repositories/auth-identity-async-repository";

export const runtime = "nodejs";

function redirectWithError(request: Request, code: string) {
  const redirectUrl = new URL("/login", request.url);
  redirectUrl.searchParams.set("auth_error", code);
  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  response.headers.append("set-cookie", clearGoogleOAuthStateCookie());
  return response;
}

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url);
  if (callbackUrl.searchParams.has("error")) {
    return redirectWithError(request, callbackUrl.searchParams.get("error") === "access_denied" ? "google_cancelled" : "google_failed");
  }

  try {
    const completed = await completeGoogleOAuth(request);
    let userId: string;
    let identityId: string;

    if (completed.state.purpose === "invite") {
      const accepted = await acceptAccountInvitationWithGoogleAsync({
        invitationId: completed.state.invitationId ?? "",
        expectedEmail: completed.state.invitationEmail ?? "",
        googleSubject: completed.identity.subject,
        googleEmail: completed.identity.email
      });
      userId = accepted.userId;
      identityId = accepted.identityId;
    } else {
      const resolved = await getGoogleIdentityAsync(completed.identity.subject);
      if (!resolved) return redirectWithError(request, "google_account_not_linked");
      if (
        resolved.status !== "active" ||
        resolved.user.account_status !== "active" ||
        resolved.user.system_role_enabled === 0 ||
        resolved.user.system_role_enabled === false
      ) {
        return redirectWithError(request, "google_account_inactive");
      }
      userId = resolved.user.id;
      identityId = resolved.identityId;
    }

    const user = await getUserByIdAsync(userId);
    if (!user || user.account_status !== "active" || user.system_role_enabled === 0 || user.system_role_enabled === false) {
      return redirectWithError(request, "google_account_inactive");
    }

    await recordIdentityLoginAsync(identityId, completed.identity.email);
    await createAuditLogAsync({
      actorId: user.id,
      action: "Login",
      detail: { email: completed.identity.email, role: user.role, provider: "google_oauth", identityId }
    });

    const redirectUrl = new URL(completed.state.returnTo, request.url);
    const response = NextResponse.redirect(redirectUrl, { status: 303 });
    response.headers.append("set-cookie", clearGoogleOAuthStateCookie());
    response.headers.append("set-cookie", createSessionCookie(user.id));
    return response;
  } catch (error) {
    if (error instanceof AccountInvitationError && error.code === "invitation_email_mismatch") {
      return redirectWithError(request, "google_invitation_email_mismatch");
    }
    if (error instanceof AccountInvitationError) {
      return redirectWithError(request, "google_invitation_unavailable");
    }
    if (error instanceof AuthIdentityError) {
      return redirectWithError(request, "google_identity_conflict");
    }
    if (error instanceof GoogleOAuthError) {
      return redirectWithError(
        request,
        error.code === "google_oauth_not_configured"
          ? "google_unavailable"
          : error.code === "google_oauth_invalid_state"
            ? "google_invalid_state"
            : "google_failed"
      );
    }
    return redirectWithError(request, "google_failed");
  }
}
