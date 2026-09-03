import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import roleCatalog from "../../../config/access-control/jenfu-role-catalog.v1.json";
import {
  JENFU_AI_PDM_APPLICATION_ID,
  JENFU_ENTITLEMENT_CONTRACT_VERSION,
  type JenfuApplicationRole,
  type JenfuEffectiveRoleAssignment,
  type JenfuEntitlementAuthority,
  roleAllowsPermission,
  scopeMatches,
  validateEffectiveRoleAssignment
} from "@/lib/jenfu-entitlement-contract";

export class JenfuEntitlementRepositoryError extends Error {
  constructor(readonly code: "entitlement_authority_unavailable" | "entitlement_authority_unknown" | "entitlement_contract_mismatch" | "entitlement_assignment_not_found" | "entitlement_role_inactive" | "entitlement_scope_mismatch" | "permission_explicit_deny" | "permission_not_granted" | "entitlement_dual_authority_detected" | "legacy_assignment_mutation_retired") {
    super(code);
    this.name = "JenfuEntitlementRepositoryError";
  }
}

type AuthorityRow = {
  contract_version: string;
  application_id: string;
  authority_source: "legacy_authority" | "orgmaster_authority";
  authority_version: number;
  employee_id: string | null;
  updated_at: string;
  operation_id: string | null;
};

type AssignmentRow = {
  assignment_version_id: string;
  assignment_id: string;
  stable_role_id: string;
  role_code: string;
  scope_kind: "workspace" | "project" | "global";
  scope_key: string | null;
  valid_from: string;
  valid_until: string | null;
  published_at: string;
  contract_version: string;
  assignment_version: number;
  grant_kind: "direct" | "delegated";
  delegation_id: string | null;
  identity_issuer: string;
  identity_subject: string;
  principal_id: string;
  employee_id: string;
  subject_kind: "employee" | "principal";
  target_principal_id: string | null;
  catalog_version: string;
  authority_version: number;
};

type VerifiedAuthorizationActor = {
  identityIssuer: string;
  identitySubject: string;
  principalId: string;
  employeeId: string;
};

export type JenfuEnforcedPermissionInput = {
  actor: VerifiedAuthorizationActor;
  permissionKind: "page" | "action";
  permissionCode: string;
  workspaceCode?: string | null;
  projectCode?: string | null;
};

export type JenfuEntitlementRoleCatalog = { roles: JenfuApplicationRole[] };

const catalog = roleCatalog as unknown as JenfuEntitlementRoleCatalog;

export class JenfuEntitlementRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly activeCatalog: JenfuEntitlementRoleCatalog = catalog
  ) {}

  async resolveAuthority(input: { employeeId: string; applicationId?: string }): Promise<JenfuEntitlementAuthority> {
    if (this.client.kind !== "postgres") throw new JenfuEntitlementRepositoryError("entitlement_authority_unavailable");
    const applicationId = input.applicationId ?? JENFU_AI_PDM_APPLICATION_ID;
    if (applicationId !== JENFU_AI_PDM_APPLICATION_ID || !input.employeeId.trim()) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    let rows: AuthorityRow[];
    try {
      rows = await this.client.query<AuthorityRow>(`
        SELECT contract_version, application_id, authority_source, authority_version,
               employee_id, updated_at::text, operation_id
        FROM access_governance.v_ai_pdm_entitlement_authority_v1
        WHERE application_id = :applicationId AND (employee_id = :employeeId OR employee_id IS NULL)
        ORDER BY employee_id NULLS LAST
      `, { applicationId, employeeId: input.employeeId });
    } catch {
      throw new JenfuEntitlementRepositoryError("entitlement_authority_unavailable");
    }
    if (rows.length === 0) throw new JenfuEntitlementRepositoryError("entitlement_authority_unknown");
    if (rows.length > 1) throw new JenfuEntitlementRepositoryError("entitlement_dual_authority_detected");
    const row = rows[0];
    if (row.contract_version !== JENFU_ENTITLEMENT_CONTRACT_VERSION || row.application_id !== applicationId || !["legacy_authority", "orgmaster_authority"].includes(row.authority_source) || !Number.isSafeInteger(Number(row.authority_version)) || Number(row.authority_version) < 1 || !Number.isFinite(Date.parse(row.updated_at))) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    return {
      contractVersion: JENFU_ENTITLEMENT_CONTRACT_VERSION,
      applicationId: JENFU_AI_PDM_APPLICATION_ID,
      authoritySource: row.authority_source,
      authorityVersion: Number(row.authority_version),
      employeeId: row.employee_id,
      updatedAt: row.updated_at,
      operationId: row.operation_id
    };
  }

  async listEffectiveAssignments(input: {
    identityIssuer: string;
    identitySubject: string;
    principalId: string;
    employeeId: string;
    applicationId?: string;
  }): Promise<JenfuEffectiveRoleAssignment[]> {
    if (this.client.kind !== "postgres") throw new JenfuEntitlementRepositoryError("entitlement_authority_unavailable");
    const applicationId = input.applicationId ?? JENFU_AI_PDM_APPLICATION_ID;
    let rows: AssignmentRow[];
    try {
      rows = await this.client.query<AssignmentRow>(`
        SELECT contract_version, assignment_version_id, assignment_version, assignment_id,
               grant_kind, delegation_id, application_id, identity_issuer, identity_subject,
               principal_id, employee_id, subject_kind, target_principal_id, stable_role_id,
               role_code, catalog_version, scope_kind, scope_key, valid_from::text,
               valid_until::text, published_at::text, authority_version
        FROM access_governance.v_ai_pdm_effective_role_assignments_v1
        WHERE application_id = :applicationId
          AND identity_issuer = :identityIssuer
          AND identity_subject = :identitySubject
          AND principal_id = :principalId
          AND employee_id = :employeeId
        ORDER BY stable_role_id ASC, assignment_id ASC
        LIMIT 33
      `, input);
    } catch {
      throw new JenfuEntitlementRepositoryError("entitlement_authority_unavailable");
    }
    if (rows.length > 32) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    const assignments = rows.map((row) => ({
      contractVersion: row.contract_version as typeof JENFU_ENTITLEMENT_CONTRACT_VERSION,
      assignmentVersionId: row.assignment_version_id,
      assignmentVersion: Number(row.assignment_version),
      assignmentId: row.assignment_id,
      grantKind: row.grant_kind,
      delegationId: row.delegation_id,
      applicationId: JENFU_AI_PDM_APPLICATION_ID,
      identityIssuer: row.identity_issuer,
      identitySubject: row.identity_subject,
      principalId: row.principal_id,
      employeeId: row.employee_id,
      subjectKind: row.subject_kind,
      targetPrincipalId: row.target_principal_id,
      stableRoleId: row.stable_role_id,
      roleCode: row.role_code,
      catalogVersion: row.catalog_version,
      scopeKind: row.scope_kind,
      scopeKey: row.scope_key,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      publishedAt: row.published_at,
      authorityVersion: Number(row.authority_version)
    }));
    const keys = new Set<string>();
    for (const assignment of assignments) {
      const key = `${assignment.stableRoleId}|${assignment.roleCode}|${assignment.scopeKind}|${assignment.scopeKey ?? ""}`;
      if (keys.has(key)) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      keys.add(key);
    }
    return assignments;
  }

  async evaluatePermission(input: JenfuEnforcedPermissionInput) {
    const authority = await this.resolveAuthority({ employeeId: input.actor.employeeId });
    if (authority.authoritySource === "legacy_authority") {
      return { authority, assignments: [] as JenfuEffectiveRoleAssignment[], decisionCode: "legacy_authority" as const };
    }
    if (authority.authoritySource !== "orgmaster_authority") throw new JenfuEntitlementRepositoryError("entitlement_dual_authority_detected");
    const assignments = await this.listEffectiveAssignments(input.actor);
    if (assignments.length === 0) throw new JenfuEntitlementRepositoryError("entitlement_assignment_not_found");
    let scopeCandidate = false;
    let permissionCandidate = false;
    const evaluatedRoles: string[] = [];
    for (const assignment of assignments) {
      const role = this.activeCatalog.roles.find((candidate) => candidate.stableRoleId === assignment.stableRoleId);
      if (!role) throw new JenfuEntitlementRepositoryError("entitlement_role_inactive");
      const privilegedPolicyMatches = assignment.stableRoleId !== "role-system-admin"
        || (
          role.roleCode === "system_admin"
          && role.risk === "critical"
          && role.subjectKind === "principal"
          && role.assignmentTier === "cross_app_override"
          && role.recommendationAllowed === false
          && role.delegationAllowed === false
          && assignment.subjectKind === "principal"
          && assignment.targetPrincipalId === input.actor.principalId
          && assignment.scopeKind === "global"
          && assignment.scopeKey === null
          && assignment.grantKind === "direct"
          && assignment.delegationId === null
        );
      if (role.roleCode !== assignment.roleCode || role.subjectKind !== assignment.subjectKind || !role.assignable || !role.allowedScopeKinds.includes(assignment.scopeKind) || !privilegedPolicyMatches) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      const validationIssues = validateEffectiveRoleAssignment(assignment, input.actor);
      if (validationIssues.length) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      if (!evaluatedRoles.includes(assignment.roleCode)) evaluatedRoles.push(assignment.roleCode);
      const permission = role.permissions.find((candidate) => candidate.kind === input.permissionKind && candidate.code === input.permissionCode);
      if (!permission) continue;
      permissionCandidate = true;
      if (!scopeMatches(assignment, { workspaceKey: input.workspaceCode, projectKey: input.projectCode })) {
        scopeCandidate = true;
        continue;
      }
      if (!permission.allowed) throw new JenfuEntitlementRepositoryError("permission_explicit_deny");
      if (roleAllowsPermission(role, input.permissionKind, input.permissionCode)) return { authority, assignments, decisionCode: "allowed" as const, role, assignment, evaluatedRoles };
    }
    if (scopeCandidate && permissionCandidate) throw new JenfuEntitlementRepositoryError("entitlement_scope_mismatch");
    if (!permissionCandidate) throw new JenfuEntitlementRepositoryError("permission_not_granted");
    throw new JenfuEntitlementRepositoryError("permission_not_granted");
  }
}
