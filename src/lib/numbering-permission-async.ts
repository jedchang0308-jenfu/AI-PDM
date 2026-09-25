import crypto from "node:crypto";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { createAuthorizationDecisionLog } from "@/lib/authorization-decision-log";
import { assertJenfuEnforcePrerequisites, getJenfuEntitlementMode } from "@/lib/entitlement-config";
import type { CheckNumberingPermissionInput, NumberingPermissionCheckResult } from "@/lib/db";
import { JENFU_ENTITLEMENT_CONTRACT_VERSION } from "@/lib/jenfu-entitlement-contract";
import { JenfuPrincipalAdmissionError, JenfuPrincipalAdmissionRepository } from "@/lib/jenfu-principal-admission-repository";
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

export async function checkNumberingPermissionsAsync(inputs: readonly CheckNumberingPermissionInput[]): Promise<NumberingPermissionCheckResult[]> {
  if (inputs.length === 0) return [];
  // A v2 principal session must use the verified principal evaluator. This
  // request-free helper cannot revalidate that session or prove a resource.
  if (inputs.some((input) => input.user.authorizationActor?.sessionSchemaVersion === 2)) {
    return inputs.map((input) => decisionResult(input, "entitlement_scope_mismatch"));
  }
  const client = getAsyncDatabaseClient();
  if (getJenfuEntitlementMode() !== "enforce") {
    const repository = new AsyncAccessControlRepository(client);
    return Promise.all(inputs.map((input) => repository.checkPermission(input)));
  }

  const actor = inputs[0].user.authorizationActor;
  if (!actor) return inputs.map((input) => decisionResult(input, "entitlement_session_invalid"));
  const validActor = actor.localPrincipalId === inputs[0].user.id
    && Boolean(inputs[0].user.company_id)
    && actor.companyId === inputs[0].user.company_id
    && inputs.every((input) => {
      const candidate = input.user.authorizationActor;
      return input.user.id === actor.localPrincipalId
        && input.user.company_id === actor.companyId
        && candidate?.identityIssuer === actor.identityIssuer
        && candidate.identitySubject === actor.identitySubject
        && candidate.principalId === actor.principalId
        && candidate.employeeId === actor.employeeId
        && candidate.localPrincipalId === actor.localPrincipalId
        && candidate.companyId === actor.companyId;
    });
  if (!validActor) return inputs.map((input) => decisionResult(input, "entitlement_session_invalid"));

  try {
    assertJenfuEnforcePrerequisites({
      platformAuthMode: getJenfuPlatformAuthMode(),
      databaseKind: client.kind,
      contractLockMatches: JENFU_ENTITLEMENT_CONTRACT_VERSION === "jenfu.platform-entitlement.v1"
    });
    const results = await client.transaction(async (snapshot) => {
      const admitted = await new JenfuPrincipalAdmissionRepository(snapshot).requireActivePrincipal(actor.identityIssuer, actor.identitySubject);
      if (admitted.principalId !== actor.principalId || admitted.employeeId !== actor.employeeId) {
        throw new JenfuPrincipalAdmissionError("auth_contract_mismatch", 409);
      }
      const timeRows = await snapshot.query<{ decision_at: string }>("SELECT transaction_timestamp()::text AS decision_at");
      const decisionAt = timeRows.length === 1 ? new Date(timeRows[0].decision_at) : new Date(Number.NaN);
      if (!Number.isFinite(decisionAt.getTime())) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      const accessControl = new AsyncAccessControlRepository(snapshot);
      const rolePriority = await accessControl.getEnforcedRolePriority([]);
      const evaluated = await new JenfuEntitlementRepository(snapshot).evaluatePermissions(inputs.map((input) => ({
        actor,
        permissionKind: input.permissionKind,
        permissionCode: input.permissionCode.trim(),
        workspaceCode: input.workspaceCode,
        projectCode: input.projectCode,
        rolePriority
      })), decisionAt);
      if (evaluated[0]?.decisionCode === "legacy_authority") {
        const legacyResults: NumberingPermissionCheckResult[] = [];
        for (const input of inputs) {
          const legacy = await accessControl.checkPermission(input, { enforceRolePriority: true, rolePriority, decisionAt: decisionAt.toISOString() });
          legacyResults.push({
            ...legacy,
            decisionCode: legacy.allowed ? "allowed" : legacy.reason === "explicit" ? "permission_explicit_deny" : "permission_not_granted"
          });
        }
        return inputs.map((input, index) => ({ permission: legacyResults[index], evaluated: null }));
      }
      return evaluated.map((result, index) => {
        if (result.decisionCode !== "allowed") {
          return { permission: decisionResult(inputs[index], result.decisionCode), evaluated: null };
        }
        return {
          permission: {
            allowed: true,
            permissionKind: inputs[index].permissionKind,
            permissionCode: inputs[index].permissionCode.trim(),
            roleCode: result.assignment.roleCode,
            evaluatedRoles: result.evaluatedRoles,
            reason: "explicit",
            decisionCode: "allowed"
          } satisfies NumberingPermissionCheckResult,
          evaluated: result
        };
      });
    }, { isolationLevel: "repeatable_read", readOnly: true });

    for (const [index, result] of results.entries()) {
      if (result.evaluated?.decisionCode !== "allowed") continue;
      const log = createAuthorizationDecisionLog({
        correlationId: crypto.randomUUID(),
        authority: result.evaluated.authority,
        permissionCode: inputs[index].permissionCode.trim(),
        scopeKind: result.evaluated.assignment.scopeKind,
        matchedStableRoleId: result.evaluated.assignment.stableRoleId,
        decisionCode: "allowed",
        principalId: actor.principalId,
        employeeId: actor.employeeId,
        assignmentId: result.evaluated.assignment.assignmentId
      });
      console.info(`[jenfu-authorization] ${JSON.stringify(log)}`);
    }
    return results.map((result) => result.permission);
  } catch (error) {
    const decisionCode = error instanceof JenfuEntitlementRepositoryError
      ? error.code
      : error instanceof JenfuPrincipalAdmissionError
        ? error.code === "principal_directory_unavailable" ? "entitlement_authority_unavailable" : "entitlement_session_invalid"
        : "entitlement_authority_unavailable";
    return inputs.map((input) => decisionResult(input, decisionCode));
  }
}

export async function checkNumberingPermissionAsync(input: CheckNumberingPermissionInput): Promise<NumberingPermissionCheckResult> {
  return (await checkNumberingPermissionsAsync([input]))[0];
}
