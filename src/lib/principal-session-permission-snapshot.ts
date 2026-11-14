import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { JenfuVerifiedAuthorizationActor } from "@/lib/jenfu-entitlement-contract";
import type { PrincipalResourceScope, PrincipalWorkspacePermission } from "@/lib/jenfu-principal-permission-service";
import { requirePublishedPrincipalCatalog } from "@/lib/jenfu-principal-role-catalog";
import { AsyncAccessControlRepository } from "@/lib/repositories/access-control-async-repository";
import { JenfuEntitlementRepository, JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { rolePolicyPermissionDecision, type PolicyResourceGroup } from "@/lib/role-policy-permission-mapping";
import { readPrincipalChineseEmployeeName } from "@/lib/principal-employee-display-name-repository";
import registry from "../../config/access-control/role-policy-editor-registry.v3.json" with { type: "json" };

const groups: readonly PolicyResourceGroup[] = ["drawing", "part", "model", "transfer"];
const contexts = [undefined, ...Array.from({ length: 15 }, (_, index) =>
  groups.filter((_, groupIndex) => (index + 1) & (1 << groupIndex)))];

type Scope = ["global" | "workspace" | "project", string | null];
type Candidate = [scope: number, allowed: boolean, roleCode: string, assignmentId: string];
export type PrincipalSessionPermissions = {
  version: 1;
  sourceVersion: string;
  assignmentVersion: number;
  assignmentVersionId: string;
  catalogVersion: string;
  employeeName: string | null;
  canManageRolePolicy?: boolean;
  scopes: Scope[];
  permissions: Record<string, Candidate[]>;
};

export function principalPermissionSnapshotsEnabled() {
  return process.env.PDM_SESSION_REVOCATION_ENABLED === "1" &&
    process.env.PDM_SESSION_PERMISSION_SNAPSHOTS_ENABLED === "1";
}

export async function createPrincipalSessionPermissions(client: AsyncDatabaseClient,
  actor: JenfuVerifiedAuthorizationActor, accountType: "human_personal" | "human_privileged",
  provisionAuthority: unknown, sessionHash: string) {
  const catalog = await requirePublishedPrincipalCatalog(client);
  const catalogLocked = await client.queryOne<{ locked: boolean }>(`
    SELECT ai_pdm_core.lock_principal_session_catalog_v1(:version) AS locked
  `, { version: catalog.catalogVersion });
  if (catalogLocked?.locked !== true) throw new Error("PRINCIPAL_SESSION_CATALOG_UNAVAILABLE");
  const rolePriority = await new AsyncAccessControlRepository(client).getEnforcedRolePriority([]);
  const entitlement = new JenfuEntitlementRepository(client, catalog);
  const { assignments, sourceVersion, nextBoundary, evaluatedAt } =
    await entitlement.readAssignments(actor, true, provisionAuthority, sessionHash);
  const decisionAt = new Date(evaluatedAt ?? "");
  if (!sourceVersion || !Number.isFinite(decisionAt.getTime())) throw new Error("PRINCIPAL_SESSION_AUTHORITY_INVALID");
  if (assignments.length === 0) throw new JenfuEntitlementRepositoryError("permission_not_granted");
  const { publication, preparedAssignments } = entitlement.preparePermissions(actor, assignments, rolePriority, decisionAt);
  const dynamic = catalog.catalogVersion.startsWith("ai-pdm.role-policy.");
  const scopes: Scope[] = [];
  const permissions: PrincipalSessionPermissions["permissions"] = {};
  for (const { assignment, role } of preparedAssignments) {
    let scope = scopes.findIndex(([kind, key]) => kind === assignment.scopeKind && key === assignment.scopeKey);
    if (scope < 0) scope = scopes.push([assignment.scopeKind, assignment.scopeKey]) - 1;
    const operations = new Set(role.permissions.map(({ kind, code }) => `${kind}:${code}`));
    if (dynamic) {
      for (const operation of [...registry.businessActions, ...registry.legacyBindings]) {
        operations.add(`${operation.kind}:${operation.code}`);
      }
    }
    for (const operation of operations) {
      const separator = operation.indexOf(":");
      const kind = operation.slice(0, separator) as "page" | "action";
      const code = operation.slice(separator + 1);
      for (const [mask, selectedGroups] of contexts.entries()) {
        const decision = rolePolicyPermissionDecision(role, kind, code, dynamic, undefined, selectedGroups);
        if (decision === "not_granted") continue;
        const key = mask === 0 ? operation : `${operation}:${mask}`;
        const list = permissions[key] ??= [];
        if (!list.some(candidate => candidate[0] === scope)) {
          list.push([scope, decision === "allowed", role.roleCode, assignment.assignmentId]);
        }
      }
    }
  }
  const nextExpiry = Math.min(
    nextBoundary === null ? Infinity : Date.parse(nextBoundary),
    ...assignments.map(assignment => assignment.validUntil === null ? Infinity : Date.parse(assignment.validUntil))
  );
  const manager = preparedAssignments.some(({ assignment }) =>
    assignment.grantKind === "direct" && assignment.delegationId === null &&
    assignment.subjectKind === "principal" && assignment.targetPrincipalId === actor.principalId &&
    assignment.scopeKind === "global" && assignment.scopeKey === null &&
    ((assignment.stableRoleId === "role-application-system-admin" && assignment.sourceGrantId !== null) ||
      (assignment.stableRoleId === "role-system-admin" && assignment.roleCode === "system_admin" &&
        accountType === "human_privileged")));
  const snapshot: PrincipalSessionPermissions = {
    version: 1, sourceVersion, assignmentVersion: publication.assignmentVersion,
    assignmentVersionId: publication.assignmentVersionId, catalogVersion: catalog.catalogVersion,
    employeeName: await readPrincipalChineseEmployeeName(client, actor.principalId, actor.employeeId),
    canManageRolePolicy: manager,
    scopes, permissions
  };
  return { snapshot, nextExpiry };
}

export function resolvePrincipalSessionPermissions(snapshot: PrincipalSessionPermissions,
  actor: { principalId: string; companyId: string }, permissions: readonly PrincipalWorkspacePermission[],
  resource: PrincipalResourceScope) {
  return permissions.map(({ permissionKind, permissionCode, resourceGroup, resourceGroups }) => {
    // Single-group and multi-group operations share the registry's group filter.
    const selected = resourceGroups ?? (resourceGroup ? [resourceGroup] : undefined);
    const mask = selected?.reduce((bits, group) => bits | (1 << groups.indexOf(group)), 0);
    const candidates = mask === undefined || (mask > 0 && mask < 16)
      ? snapshot.permissions[`${permissionKind}:${permissionCode}${mask === undefined ? "" : `:${mask}`}`] ?? []
      : [];
    const match = candidates.find(([scope]) => {
      const [kind, key] = snapshot.scopes[scope];
      if (kind === "global") return true;
      if (kind === "project") return !!key && key === resource.projectCode;
      return actor.companyId === "company-jenfu" && (resource.workspaceCode ?? actor.companyId) === actor.companyId &&
        (key === "current" || key === actor.companyId);
    });
    return {
      allowed: match?.[1] === true, permissionCode,
      decisionCode: match ? match[1] ? "allowed" : "permission_explicit_deny"
        : candidates.length ? "entitlement_scope_mismatch" : "permission_not_granted",
      roleCode: match?.[1] === true ? match[2] : null,
      assignmentId: match?.[1] === true ? match[3] : null,
      principalId: actor.principalId, publishedAssignmentVersion: snapshot.assignmentVersion
    };
  });
}
