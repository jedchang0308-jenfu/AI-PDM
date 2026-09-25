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
import { PrincipalLocalAclRepository } from "@/lib/repositories/principal-local-acl-repository";
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
  authorityVersion: number;
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
  if (permissions.length === 0 || permissions.some(({ permissionCode }) =>
    !permissionCode || permissionCode !== permissionCode.trim())) {
    throw new JenfuPrincipalRequestError("auth_session_invalid");
  }
    const actor = createJenfuVerifiedAuthorizationActor({
      identityIssuer: verified.session.identityIssuer,
      identitySubject: verified.session.identitySubject,
      principalId: verified.session.principalId,
      employeeId: verified.session.employeeId,
      localPrincipalId: verified.profile.pdmUserId,
      companyId: verified.profile.companyId,
      sessionSchemaVersion: 2
    });
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
        workspaceCode: verified.profile.companyId,
        projectCode: null,
        rolePriority
      })), decisionAt
    );
    const localDecisions = evaluated[0]?.decisionCode === "legacy_authority"
      ? await new PrincipalLocalAclRepository(snapshot).evaluateWorkspace({
        principalId: actor.principalId, permissions,
        rolePriority, decisionAt, assuranceLevel: verified.session.assuranceLevel
      })
      : null;
    return evaluated.map((result, index) => {
      const permissionCode = permissions[index].permissionCode;
      if (result.decisionCode === "legacy_authority") {
        const local = localDecisions?.[index];
        if (!local) throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
        return { allowed: local.allowed, permissionCode, decisionCode: local.decisionCode,
          roleCode: local.roleCode, assignmentId: local.assignmentId, principalId: actor.principalId,
          authorityVersion: result.authority.authorityVersion };
      }
      if (result.decisionCode !== "allowed") {
        return { allowed: false, permissionCode, decisionCode: result.decisionCode,
          roleCode: null, assignmentId: null, principalId: actor.principalId,
          authorityVersion: result.authority.authorityVersion };
      }
      const privileged = result.role.risk !== "normal" ||
        ["system_admin", "pdm_admin", "rd_manager"].includes(result.role.roleCode);
      const assured = !privileged || verified.session.assuranceLevel === "aal2";
      return {
        allowed: assured,
        permissionCode,
        decisionCode: assured ? "allowed" : "assurance_insufficient",
        roleCode: assured ? result.role.roleCode : null,
        assignmentId: assured ? result.assignment.assignmentId : null,
        principalId: actor.principalId,
        authorityVersion: result.authority.authorityVersion
      };
    });
}
