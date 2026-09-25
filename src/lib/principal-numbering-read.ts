import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { resolvePrincipalCompanyContextInSnapshot, type PdmCompanyContext } from "@/lib/company-context";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest,
  type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { requestedNumberingCompanyCodeFromRequest } from "@/lib/numbering-company-context";

/** Keep a principal numbering read and its permission and company decision in one snapshot. */
export async function withPrincipalNumberingCompanyRead(
  request: Request,
  permissionCode: string,
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
  try {
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (snapshot, verified) => {
      const company = await resolvePrincipalCompanyContextInSnapshot(snapshot, verified,
        requestedNumberingCompanyCodeFromRequest(request));
      if (company.response) return company.response;
      const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
        [{ permissionKind: "page", permissionCode }]);
      const decision = decisions[0];
      if (decisions.length !== 1 || !decision || decision.principalId !== verified.session.principalId) {
        throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
      }
      if (!decision.allowed) return jenfuEntitlementFailureResponse(decision.decisionCode);
      return read(snapshot, company.company, verified);
    });
  } catch (error) {
    return principalRequestFailure(error);
  }
}
