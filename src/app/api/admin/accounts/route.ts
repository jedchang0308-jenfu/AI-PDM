import { NextResponse } from "next/server";
import { AccountLifecycleError, listAdminAccountsAsync } from "@/lib/account-lifecycle";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { JenfuPrincipalAdminAccountRepository } from "@/lib/jenfu-principal-admin-account-repository";
import { JenfuPrincipalCandidateRepository } from "@/lib/jenfu-principal-candidate-repository";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalProvisionError, provisionPrincipalAccount } from "@/lib/jenfu-principal-provision-service";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

function accountLifecycleError(error: unknown) {
  if (error instanceof AccountLifecycleError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ error: "account_lifecycle_failed", message: "帳號資料處理失敗，請稍後重試。" }, { status: 500 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const views = url.searchParams.getAll("view");
  if (views.length > 1 || (views.length === 1 && views[0] !== "principal-candidate")) {
    return NextResponse.json({ error: "invalid_account_view" }, { status: 400 });
  }
  if (views[0] === "principal-candidate") {
    const ids = url.searchParams.getAll("principalId");
    const principalId = ids[0];
    if (ids.length !== 1 || !principalId || principalId.length > 255 ||
      principalId.trim() !== principalId || /[\u0000-\u001f\u007f]/u.test(principalId)) {
      return NextResponse.json({ error: "invalid_principal_id" }, { status: 400 });
    }
    const policy = resolveJenfuRoutePolicy("src/app/api/admin/accounts/route.ts", "GET", {
      discriminator: "view:principal-candidate", expectedPermissionCode: "accounts.invitation.manage"
    });
    if (!policy) return NextResponse.json({ error: "principal_policy_unavailable" }, { status: 503 });
    const token = principalSessionTokenFromRequest(request);
    if (!token) return NextResponse.json({ error: "principal_session_required" }, { status: 401 });
    try {
      if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
        getJenfuEntitlementMode() !== "enforce") {
        return NextResponse.json({ error: "principal_authorization_unavailable" }, { status: 503 });
      }
      return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (snapshot, verified) => {
        const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
          [{ permissionKind: "action", permissionCode: "accounts.invitation.manage" }]);
        if (decisions.length !== 1) throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
        if (!decisions[0].allowed) {
          return NextResponse.json({ error: "permission_not_granted" }, { status: 403 });
        }
        const candidates = await new JenfuPrincipalCandidateRepository(snapshot).listByPrincipal(principalId);
        return NextResponse.json({ candidates }, { headers: { "cache-control": "no-store" } });
      });
    } catch (error) {
      return principalRequestFailure(error);
    }
  }
  const principalToken = principalSessionTokenFromRequest(request);
  if (principalToken) {
    if (url.searchParams.has("provider") || url.searchParams.has("role")) {
      return NextResponse.json({ error: "invalid_account_filter" }, { status: 400 });
    }
    if (!resolveJenfuRoutePolicy("src/app/api/admin/accounts/route.ts", "GET",
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
          const accounts = await new JenfuPrincipalAdminAccountRepository(snapshot).list(
            verified.profile.companyId, {
              query: url.searchParams.get("query") ?? undefined,
              status: url.searchParams.get("status") ?? undefined,
              limit: Number(url.searchParams.get("limit") ?? 100)
            });
          return NextResponse.json({ accounts, subjectMode: "principal" },
            { headers: { "cache-control": "no-store" } });
        });
    } catch (error) {
      return principalRequestFailure(error);
    }
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
  if (auth.response) return auth.response;

  try {
    const accounts = await listAdminAccountsAsync({
      query: url.searchParams.get("query") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      provider: url.searchParams.get("provider") ?? undefined,
      role: url.searchParams.get("role") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 100)
    });
    return NextResponse.json({ accounts });
  } catch (error) {
    return accountLifecycleError(error);
  }
}

export async function POST(request: Request) {
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ error: "auth_origin_invalid" }, { status: 403 });
  }
  if (!resolveJenfuRoutePolicy("src/app/api/admin/accounts/route.ts", "POST",
    { expectedPermissionCode: "accounts.invitation.manage" })) {
    return NextResponse.json({ error: "principal_policy_unavailable" }, { status: 503 });
  }
  const token = principalSessionTokenFromRequest(request);
  if (!token) return NextResponse.json({ error: "principal_session_required" }, { status: 401 });
  try {
    if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
      return NextResponse.json({ error: "principal_authorization_unavailable" }, { status: 503 });
    }
    const encoded = await request.text();
    if (encoded.length > 16_384) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    let body: unknown;
    try { body = JSON.parse(encoded); }
    catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
    const result = await provisionPrincipalAccount({ ...principalRequestInput(token), body });
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    if (error instanceof JenfuPrincipalProvisionError) {
      return NextResponse.json({ error: error.code },
        { status: error.httpStatus, headers: { "cache-control": "no-store" } });
    }
    return principalRequestFailure(error);
  }
}
