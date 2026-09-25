import { NextResponse } from "next/server";
import {
  AccountLifecycleError,
  updateAdminAccountLifecycleAsync,
  type AccountLifecycleAction
} from "@/lib/account-lifecycle";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { PrincipalLifecycleError, updatePrincipalAccountLifecycle } from "@/lib/jenfu-principal-lifecycle-service";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const validActions = new Set<AccountLifecycleAction>(["suspend", "reactivate", "offboard", "return_to_work"]);

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號狀態異動失敗，請稍後重試。" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (principalToken) {
    if (!isAllowedRequestOrigin(request)) {
      return NextResponse.json({ error: "auth_origin_invalid" }, { status: 403 });
    }
    if (!resolveJenfuRoutePolicy("src/app/api/admin/accounts/[userId]/lifecycle/route.ts", "POST",
      { expectedPermissionCode: "accounts.lifecycle.manage" })) {
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
      const result = await updatePrincipalAccountLifecycle({
        ...principalRequestInput(principalToken), pdmUserId: userId, body
      });
      return NextResponse.json({ account: result, subjectMode: "principal" },
        { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof PrincipalLifecycleError) {
        return NextResponse.json({ error: error.code }, { status: error.httpStatus });
      }
      return principalRequestFailure(error);
    }
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response || !auth.user) return auth.response;

  const { userId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "") as AccountLifecycleAction;
  if (!validActions.has(action)) {
    return NextResponse.json({ error: "invalid_lifecycle_action", message: "不支援的帳號狀態異動。" }, { status: 400 });
  }

  try {
    const account = await updateAdminAccountLifecycleAsync({
      actorId: auth.user.id,
      userId,
      action,
      reason: String(body.reason ?? "")
    });
    return NextResponse.json({ account });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
