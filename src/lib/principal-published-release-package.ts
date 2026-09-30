import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { deliverPrincipalReleasePackage } from "@/lib/principal-release-package-delivery";
import type { ReleasePackage } from "@/lib/types";

export type PublishedPackageRoute = {
  path: string;
  url: string;
  permissionCode: "handoff.published.view" | "integration.procurement.view";
  scopeResolver: string;
};

const CURRENT_RELEASED_SUBMISSION_SQL = [
  "SELECT s.id,s.company_id FROM ai_pdm_core.submissions s",
  "WHERE s.id=:id AND s.company_id=:companyId AND s.status='Released'",
  "AND NOT EXISTS (SELECT 1 FROM ai_pdm_core.submissions newer",
  "WHERE newer.item_id=s.item_id AND newer.company_id=s.company_id",
  "AND newer.status='Released'",
  "AND COALESCE(newer.released_at,newer.updated_at,newer.created_at) >",
  "COALESCE(s.released_at,s.updated_at,s.created_at))"
].join(" ");

/** Permission, company, current published version and package ownership share one snapshot. */
export async function servePublishedReleasePackage(
  request: Request, params: Promise<{ id: string }>, route: PublishedPackageRoute
): Promise<Response> {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const policy = resolveJenfuRoutePolicy(route.path, "GET",
    { expectedPermissionCode: route.permissionCode });
  if (policy?.path !== route.path || policy.authorizationMode !== "permission" ||
      policy.scopeResolver !== route.scopeResolver) {
    return Response.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    return Response.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const { id } = await params;
  try {
    const authorized = await withVerifiedJenfuPrincipalRequest(principalRequestInput(token),
      async (snapshot, verified) => {
        const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
          [{ permissionKind: "action", permissionCode: route.permissionCode }]);
        const decision = decisions[0];
        if (decisions.length !== 1 || !decision ||
            decision.permissionCode !== route.permissionCode ||
            decision.principalId !== verified.session.principalId) {
          return Response.json({ code: "principal_dependency_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
        }
        if (!decision.allowed) return jenfuEntitlementFailureResponse(decision.decisionCode);
        const resource = await snapshot.queryOne<{ id: string; company_id: string }>(
          CURRENT_RELEASED_SUBMISSION_SQL, { id, companyId: verified.profile.companyId });
        if (!resource || resource.id !== id ||
            resource.company_id !== verified.profile.companyId) {
          return Response.json({ error: "published_package_not_found" }, { status: 404 });
        }
        const releasePackage = await snapshot.queryOne<ReleasePackage>(
          "SELECT * FROM ai_pdm_core.release_packages WHERE submission_id=:id", { id });
        if (!releasePackage) return Response.json({ error: "Release package not found" }, { status: 404 });
        if (releasePackage.submission_id !== id) {
          return Response.json({ code: "principal_dependency_unavailable" },
            { status: 503, headers: { "cache-control": "no-store" } });
        }
        return { releasePackage, principalId: verified.session.principalId,
          profileId: verified.profile.pdmUserId, companyId: resource.company_id };
      });
    if (authorized instanceof Response) return authorized;
    return await deliverPrincipalReleasePackage(request, id, route.url, authorized);
  } catch (error) {
    return principalRequestFailure(error);
  }
}
