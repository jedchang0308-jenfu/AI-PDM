import { createJenfuVerifiedAuthorizationActor } from "@/lib/jenfu-entitlement-contract";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  JenfuPrincipalRequestError,
  withVerifiedJenfuPrincipalRequest,
  type PrincipalRequestInput,
  type VerifiedPrincipalRequest
} from "@/lib/jenfu-principal-request-guard";
import { AsyncAccessControlRepository } from "@/lib/repositories/access-control-async-repository";
import { JenfuEntitlementRepository } from "@/lib/repositories/jenfu-entitlement-repository";
import { requirePublishedPrincipalCatalog } from "@/lib/jenfu-principal-role-catalog";

export type PrincipalWorkspacePermission = {
  permissionKind: "page" | "action";
  permissionCode: string;
};

export type PrincipalWorkspaceDecision = {
  allowed: boolean;
  permissionCode: string;
  decisionCode: string;
  roleCode: string | null;
  assignmentId: string | null;
  principalId: string;
  publishedAssignmentVersion: number;
};

/** Workspace-only entrypoint. Project/resource grants require a server-owned resource adapter. */
export async function evaluatePrincipalWorkspacePermissions(input: PrincipalRequestInput & {
  permissions: readonly PrincipalWorkspacePermission[];
}): Promise<PrincipalWorkspaceDecision[]> {
  return withVerifiedJenfuPrincipalRequest(input, (snapshot, verified) =>
    evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified, input.permissions));
}

/** Reuse this evaluator inside a verified owner transaction; never start a second snapshot. */
export async function evaluatePrincipalWorkspacePermissionsInSnapshot(
  snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest,
  permissions: readonly PrincipalWorkspacePermission[]
): Promise<PrincipalWorkspaceDecision[]> {
  return evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot(snapshot, {
    identityIssuer: verified.session.identityIssuer, identitySubject: verified.session.identitySubject,
    principalId: verified.session.principalId, employeeId: verified.session.employeeId,
    localPrincipalId: verified.profile.pdmUserId, companyId: verified.profile.companyId,
    sessionSchemaVersion: 2
  }, permissions);
}

/** Server-only core. The caller must freshly admit the actor in this same snapshot. */
export async function evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot(
  snapshot: AsyncDatabaseClient,
  admitted: Parameters<typeof createJenfuVerifiedAuthorizationActor>[0],
  permissions: readonly PrincipalWorkspacePermission[]
): Promise<PrincipalWorkspaceDecision[]> {
  if (permissions.length === 0 || permissions.some(({ permissionCode }) =>
    !permissionCode || permissionCode !== permissionCode.trim())) {
    throw new JenfuPrincipalRequestError("auth_session_invalid");
  }
    const actor = createJenfuVerifiedAuthorizationActor(admitted);
    if (!actor) throw new JenfuPrincipalRequestError("auth_session_invalid");
    const times = await snapshot.query<{ decision_at: string }>("SELECT transaction_timestamp()::text AS decision_at");
    const decisionAt = times.length === 1 ? new Date(times[0].decision_at) : new Date(Number.NaN);
    if (!Number.isFinite(decisionAt.getTime())) {
      throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
    }
    const rolePriority = await new AsyncAccessControlRepository(snapshot).getEnforcedRolePriority([]);
    const publishedCatalog = await requirePublishedPrincipalCatalog(snapshot);
    const evaluated = await new JenfuEntitlementRepository(snapshot, publishedCatalog).evaluatePermissions(
      permissions.map(({ permissionKind, permissionCode }) => ({
        actor, permissionKind, permissionCode,
        workspaceCode: actor.companyId,
        projectCode: null,
        rolePriority
      })), decisionAt
    );
    return evaluated.map((result, index) => {
      const permissionCode = permissions[index].permissionCode;
      if (result.decisionCode !== "allowed") {
        return { allowed: false, permissionCode, decisionCode: result.decisionCode,
          roleCode: null, assignmentId: null, principalId: actor.principalId,
          publishedAssignmentVersion: result.publication.assignmentVersion };
      }
      const allowed = result.decisionCode === "allowed";
      return {
        allowed,
        permissionCode,
        decisionCode: result.decisionCode,
        roleCode: allowed ? result.role.roleCode : null,
        assignmentId: allowed ? result.assignment.assignmentId : null,
        principalId: actor.principalId,
        publishedAssignmentVersion: result.publication.assignmentVersion
      };
    });
}
