import crypto from "node:crypto";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { createAuthorizationDecisionLog } from "@/lib/authorization-decision-log";
import { assertJenfuEnforcePrerequisites, getJenfuEntitlementMode } from "@/lib/entitlement-config";
import type { CheckNumberingPermissionInput, NumberingPermissionCheckResult } from "@/lib/db";
import { JENFU_ENTITLEMENT_CONTRACT_VERSION } from "@/lib/jenfu-entitlement-contract";
import { AsyncAccessControlRepository } from "@/lib/repositories/access-control-async-repository";
import { JenfuEntitlementRepository, JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";

function decisionResult(input: CheckNumberingPermissionInput, decisionCode: string, roleCode: string | null = null, authoritySource = "unknown", authorityVersion: number | null = null): NumberingPermissionCheckResult {
  const actor = input.user.authorizationActor;
  if (actor) {
    const log = createAuthorizationDecisionLog({
      correlationId: crypto.randomUUID(),
      authority: authoritySource === "unknown" ? null : {
        contractVersion: JENFU_ENTITLEMENT_CONTRACT_VERSION,
        applicationId: "ai-pdm",
        authoritySource: authoritySource as "legacy_authority" | "orgmaster_authority",
        authorityVersion: authorityVersion ?? 1,
        employeeId: actor.employeeId,
        updatedAt: new Date().toISOString(),
        operationId: null
      },
      permissionCode: input.permissionCode.trim(),
      scopeKind: input.projectCode ? "project" : input.workspaceCode ? "workspace" : "global",
      matchedStableRoleId: null,
      decisionCode,
      principalId: actor.principalId,
      employeeId: actor.employeeId
    });
    console.info(`[jenfu-authorization] ${JSON.stringify(log)}`);
  }
  return {
    allowed: false,
    permissionKind: input.permissionKind,
    permissionCode: input.permissionCode.trim(),
    roleCode,
    evaluatedRoles: [],
    reason: decisionCode === "permission_explicit_deny" ? "explicit" : decisionCode === "permission_not_granted" ? "missing_permission" : "no_candidate_role",
    decisionCode
  };
}

export async function checkNumberingPermissionAsync(input: CheckNumberingPermissionInput): Promise<NumberingPermissionCheckResult> {
  const client = getAsyncDatabaseClient();
  if (getJenfuEntitlementMode() === "enforce") {
    const actor = input.user.authorizationActor;
    if (!actor) return decisionResult(input, "entitlement_session_invalid");
    try {
      assertJenfuEnforcePrerequisites({
        platformAuthMode: getJenfuPlatformAuthMode(),
        databaseKind: client.kind,
        contractLockMatches: JENFU_ENTITLEMENT_CONTRACT_VERSION === "jenfu.platform-entitlement.v1"
      });
      const repository = new JenfuEntitlementRepository(client);
      const evaluated = await repository.evaluatePermission({
        actor,
        permissionKind: input.permissionKind,
        permissionCode: input.permissionCode.trim(),
        workspaceCode: input.workspaceCode,
        projectCode: input.projectCode
      });
      if (evaluated.decisionCode === "legacy_authority") {
        const legacy = await new AsyncAccessControlRepository(client).checkPermission(input);
        return {
          ...legacy,
          decisionCode: legacy.allowed ? "allowed" : legacy.reason === "explicit" ? "permission_explicit_deny" : "permission_not_granted"
        };
      }
      if (evaluated.decisionCode === "allowed") {
        const log = createAuthorizationDecisionLog({
          correlationId: crypto.randomUUID(),
          authority: evaluated.authority,
          permissionCode: input.permissionCode.trim(),
          scopeKind: evaluated.assignment.scopeKind,
          matchedStableRoleId: evaluated.assignment.stableRoleId,
          decisionCode: "allowed",
          principalId: actor.principalId,
          employeeId: actor.employeeId,
          assignmentId: evaluated.assignment.assignmentId
        });
        console.info(`[jenfu-authorization] ${JSON.stringify(log)}`);
        return {
          allowed: true,
          permissionKind: input.permissionKind,
          permissionCode: input.permissionCode.trim(),
          roleCode: evaluated.assignment.roleCode,
          evaluatedRoles: evaluated.evaluatedRoles,
          reason: "explicit",
          decisionCode: "allowed"
        };
      }
      return decisionResult(input, "permission_not_granted");
    } catch (error) {
      const decisionCode = error instanceof JenfuEntitlementRepositoryError ? error.code : "entitlement_authority_unavailable";
      return decisionResult(input, decisionCode);
    }
  }
  const repository = new AsyncAccessControlRepository(client);
  return repository.checkPermission(input);
}
