import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

export type PrincipalSubmissionResource = { company_id: string; submitted_by: string };
export type PrincipalSubmissionListScope = { submittedBy?: string };

function denied(code: string): Response {
  const response = jenfuEntitlementFailureResponse(code);
  response.headers.set("x-jenfu-principal-historical", "1");
  return response;
}

/** The same published grant and selected role constrain list, search, and detail reads. */
export async function authorizePrincipalSubmissionListInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest
): Promise<Response | PrincipalSubmissionListScope> {
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
  if (role !== "rd" && verified.session.assuranceLevel !== "aal2") {
    return denied("assurance_insufficient");
  }
  return { submittedBy: role === "rd" ? verified.profile.pdmUserId : undefined };
}

/** Authorize the published Principal and historical profile relation before any detail or file read. */
export async function authorizePrincipalSubmissionReadInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, id: string
): Promise<Response | PrincipalSubmissionResource> {
  const scope = await authorizePrincipalSubmissionListInSnapshot(snapshot, verified);
  if (scope instanceof Response) return scope;
  const resource = await snapshot.queryOne<PrincipalSubmissionResource>(
    "SELECT company_id, submitted_by FROM ai_pdm_core.submissions WHERE id=:id", { id });
  if (!resource || !resource.company_id || resource.company_id !== verified.profile.companyId) {
    return Response.json({ error: "submission_not_found" }, { status: 404 });
  }
  if (scope.submittedBy && resource.submitted_by !== scope.submittedBy) {
    return denied("permission_not_granted");
  }
  return resource;
}
