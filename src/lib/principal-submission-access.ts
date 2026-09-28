import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

export type PrincipalSubmissionResource = { company_id: string; submitted_by: string };

function denied(code: string): Response {
  const response = jenfuEntitlementFailureResponse(code);
  response.headers.set("x-jenfu-principal-historical", "1");
  return response;
}

/** Authorize the published Principal and historical profile relation before any detail or file read. */
export async function authorizePrincipalSubmissionReadInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, id: string
): Promise<Response | PrincipalSubmissionResource> {
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
    [{ permissionKind: "action", permissionCode: "submission.view" }]);
  const decision = decisions[0];
  if (decisions.length !== 1 || !decision || decision.permissionCode !== "submission.view" ||
      decision.principalId !== verified.session.principalId) {
    return Response.json({ code: "principal_dependency_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!decision.allowed) return denied(decision.decisionCode);
  const role = decision.roleCode;
  if (role !== "rd" && role !== "rd_manager" && role !== "pdm_admin" && role !== "system_admin") {
    return Response.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const resource = await snapshot.queryOne<PrincipalSubmissionResource>(
    "SELECT company_id, submitted_by FROM ai_pdm_core.submissions WHERE id=:id", { id });
  if (!resource || !resource.company_id || resource.company_id !== verified.profile.companyId) {
    return Response.json({ error: "submission_not_found" }, { status: 404 });
  }
  if (role === "rd" && resource.submitted_by !== verified.profile.pdmUserId) {
    return denied("permission_not_granted");
  }
  if (role !== "rd" && verified.session.assuranceLevel !== "aal2") {
    return denied("assurance_insufficient");
  }
  return resource;
}
