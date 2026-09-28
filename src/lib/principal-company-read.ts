import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { resolvePrincipalCompanyContextInSnapshot,
  requestedPdmCompanyCodeFromRequest,
  type PdmCompanyContext, type PdmCompanyRequest, type PdmCompanyResolveResult } from "@/lib/company-context";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot,
  type PrincipalWorkspacePermission } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest,
  type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";

async function authorizeInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest,
  requestedCompany: PdmCompanyRequest,
  permissions: readonly PrincipalWorkspacePermission[]
): Promise<PdmCompanyResolveResult> {
  const company = await resolvePrincipalCompanyContextInSnapshot(snapshot, verified, requestedCompany);
  if (company.response) return company;
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified, permissions);
  if (decisions.length !== permissions.length || decisions.some((decision, index) =>
    !decision || decision.principalId !== verified.session.principalId ||
    decision.permissionCode !== permissions[index].permissionCode)) {
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
  if (!decisions.some((decision) => decision.allowed)) {
    return { company: null,
      response: jenfuEntitlementFailureResponse(decisions[0]?.decisionCode ?? "permission_not_granted") };
  }
  return company;
}

/** A verified principal's company, permissions and resource read share one snapshot. */
export async function withPrincipalCompanyRead(
  request: Request,
  requestedCompany: PdmCompanyRequest,
  permissions: readonly PrincipalWorkspacePermission[],
  read: (snapshot: AsyncDatabaseClient, company: PdmCompanyContext,
    verified: VerifiedPrincipalRequest) => Promise<Response>
): Promise<Response | null> {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return null;
  if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    return Response.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (permissions.length === 0) {
    return Response.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  try {
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (snapshot, verified) => {
      const authorization = await authorizeInSnapshot(snapshot, verified, requestedCompany, permissions);
      if (authorization.response) return authorization.response;
      return read(snapshot, authorization.company, verified);
    });
  } catch (error) {
    return principalRequestFailure(error);
  }
}

/** Authorize within one snapshot, then close it before an external provider read. */
export async function authorizePrincipalWorkspaceExternalRead(
  request: Request, routePath: string, permissionCode: string
): Promise<Response | { principalId: string; profileId: string; company: PdmCompanyContext }> {
  const policy = resolveJenfuRoutePolicy(routePath, "GET", { expectedPermissionCode: permissionCode });
  if (policy?.path !== routePath || policy.authorizationMode !== "permission" ||
      policy.scopeResolver !== "workspace") {
    return Response.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const token = principalSessionTokenFromRequest(request);
  if (!token) return Response.json({ code: "auth_session_invalid" },
    { status: 401, headers: { "cache-control": "no-store" } });
  if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    return Response.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  try {
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (snapshot, verified) => {
      const authorization = await authorizeInSnapshot(snapshot, verified,
        requestedPdmCompanyCodeFromRequest(request),
        [{ permissionKind: "action", permissionCode }]);
      if (authorization.response) return authorization.response;
      return { principalId: verified.session.principalId,
        profileId: verified.profile.pdmUserId, company: authorization.company };
    });
  } catch (error) {
    return principalRequestFailure(error);
  }
}
