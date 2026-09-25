import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { resolvePrincipalCompanyContextInSnapshot,
  type PdmCompanyContext, type PdmCompanyRequest } from "@/lib/company-context";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot,
  type PrincipalWorkspacePermission } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest,
  type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

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
      const company = await resolvePrincipalCompanyContextInSnapshot(snapshot, verified, requestedCompany);
      if (company.response) return company.response;
      const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified, permissions);
      if (decisions.length !== permissions.length || decisions.some((decision, index) =>
        !decision || decision.principalId !== verified.session.principalId ||
        decision.permissionCode !== permissions[index].permissionCode)) {
        throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
      }
      if (!decisions.some((decision) => decision.allowed)) {
        return jenfuEntitlementFailureResponse(decisions[0]?.decisionCode ?? "permission_not_granted");
      }
      return read(snapshot, company.company, verified);
    });
  } catch (error) {
    return principalRequestFailure(error);
  }
}
