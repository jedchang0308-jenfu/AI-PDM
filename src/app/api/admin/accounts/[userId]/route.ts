import { NextResponse } from "next/server";
import { AccountLifecycleError, getAdminAccountDetailAsync } from "@/lib/account-lifecycle";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { JenfuPrincipalAdminAccountRepository } from "@/lib/jenfu-principal-admin-account-repository";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號資料處理失敗，請稍後重試。" }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (principalToken) {
    const { userId } = await params;
    if (!userId || userId.length > 255) {
      return NextResponse.json({ error: "invalid_account_id" }, { status: 400 });
    }
    if (!resolveJenfuRoutePolicy("src/app/api/admin/accounts/[userId]/route.ts", "GET",
      { expectedPermissionCode: "accounts.lifecycle.manage" })) {
      return NextResponse.json({ error: "principal_policy_unavailable" }, { status: 503 });
    }
    try {
      if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
          getJenfuEntitlementMode() !== "enforce") {
        return NextResponse.json({ error: "principal_authorization_unavailable" }, { status: 503 });
      }
      return await withVerifiedJenfuPrincipalRequest(principalRequestInput(principalToken),
        async (snapshot, verified) => {
          const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
            [{ permissionKind: "action", permissionCode: "accounts.lifecycle.manage" }]);
          if (decisions.length !== 1) throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
          if (!decisions[0].allowed) {
            return NextResponse.json({ error: "permission_not_granted" }, { status: 403 });
          }
          const account = await new JenfuPrincipalAdminAccountRepository(snapshot)
            .getByProfile(verified.profile.companyId, userId);
          if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
          return NextResponse.json({ account, subjectMode: "principal" },
            { headers: { "cache-control": "no-store" } });
        });
    } catch (error) {
      return principalRequestFailure(error);
    }
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response) return auth.response;

  const { userId } = await params;
  try {
    const account = await getAdminAccountDetailAsync(userId);
    if (!account) return NextResponse.json({ error: "account_not_found", message: "找不到指定帳號。" }, { status: 404 });
    return NextResponse.json({ account });
  } catch (error) {
    return accountLifecycleError(error);
  }
}
