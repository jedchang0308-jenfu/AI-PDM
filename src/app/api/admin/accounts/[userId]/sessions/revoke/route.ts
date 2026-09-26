import { NextResponse } from "next/server";
import { AccountLifecycleError, revokeAdminAccountSessionsAsync } from "@/lib/account-lifecycle";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { PrincipalAdminSessionRevokeError, revokePrincipalAccountSessions } from "@/lib/jenfu-principal-admin-session-revoke";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_session_revoke_failed", message: "撤銷登入狀態失敗，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (principalToken) {
    if (!isAllowedRequestOrigin(request)) {
      return NextResponse.json({ error: "auth_origin_invalid" }, { status: 403 });
    }
    if (!resolveJenfuRoutePolicy("src/app/api/admin/accounts/[userId]/sessions/revoke/route.ts", "POST",
      { expectedPermissionCode: "accounts.session.revoke" })) {
      return NextResponse.json({ error: "principal_policy_unavailable" }, { status: 503 });
    }
    const { userId } = await params;
    try {
      if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
          getJenfuEntitlementMode() !== "enforce") {
        return NextResponse.json({ error: "principal_authorization_unavailable" }, { status: 503 });
      }
      const encoded = await request.text();
      if (encoded.length > 4096) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      let body: unknown;
      try { body = JSON.parse(encoded); }
      catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
      const result = await revokePrincipalAccountSessions({
        ...principalRequestInput(principalToken), pdmUserId: userId, body
      });
      return NextResponse.json({ account: result, subjectMode: "principal" },
        { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof PrincipalAdminSessionRevokeError) {
        return NextResponse.json({ error: error.code }, { status: error.httpStatus });
      }
      return principalRequestFailure(error);
    }
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  const { userId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const account = await revokeAdminAccountSessionsAsync({
      actorId: auth.user.id,
      userId,
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    return NextResponse.json({ account });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
