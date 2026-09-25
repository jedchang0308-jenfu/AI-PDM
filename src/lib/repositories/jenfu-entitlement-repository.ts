import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import roleCatalog from "../../../config/access-control/jenfu-role-catalog.v1.json" with { type: "json" };
import {
  JENFU_AI_PDM_APPLICATION_ID,
  JENFU_ENTITLEMENT_CONTRACT_VERSION,
  JENFU_PRINCIPAL_GRANTS_CONTRACT_VERSION,
  type JenfuApplicationRole,
  type JenfuEffectiveRoleAssignment,
  type JenfuEntitlementAuthority,
  type JenfuVerifiedAuthorizationActor,
  resolveJenfuWorkspaceScopeKey,
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
  application_id: string;
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
  principal_id: string;
  employee_id: string;
  subject_kind: "employee" | "principal";
  target_principal_id: string | null;
  catalog_version: string;
  authority_version: number;
};

export type JenfuEnforcedPermissionInput = {
  actor: JenfuVerifiedAuthorizationActor;
  permissionKind: "page" | "action";
  permissionCode: string;
  workspaceCode?: string | null;
  projectCode?: string | null;
  rolePriority: readonly string[];
};

type ActiveAccountRow = {
  contract_version: string;
  principal_issuer: string;
  principal_subject: string;
  principal_id: string;
  employee_id: string;
  employee_status: string;
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
        FROM orgmaster_contract.v_ai_pdm_entitlement_authority_v1
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
    if (applicationId !== JENFU_AI_PDM_APPLICATION_ID || !input.principalId || !input.employeeId ||
      !input.identityIssuer || !input.identitySubject) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
    let accounts: ActiveAccountRow[];
    let rows: AssignmentRow[];
    try {
      accounts = await this.client.query<ActiveAccountRow>(`
        SELECT contract_version, principal_issuer, principal_subject, principal_id,
               employee_id, employee_status
        FROM orgmaster_contract.v_active_principal_accounts_v1
        WHERE principal_id = :principalId
        ORDER BY principal_issuer, principal_subject
        LIMIT 3
      `, { principalId: input.principalId });
      rows = await this.client.query<AssignmentRow>(`
        SELECT contract_version, assignment_version_id, assignment_version, assignment_id,
               grant_kind, delegation_id, application_id,
               principal_id, employee_id, subject_kind, target_principal_id, stable_role_id,
               role_code, catalog_version, scope_kind, scope_key, valid_from::text,
               valid_until::text, published_at::text, authority_version
        FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v2
        WHERE application_id = :applicationId
          AND principal_id = :principalId
          AND employee_id = :employeeId
        ORDER BY stable_role_id, assignment_id
        LIMIT 33
      `, { ...input, applicationId });
    } catch {
      throw new JenfuEntitlementRepositoryError("entitlement_authority_unavailable");
    }
    if (accounts.length < 1 || accounts.length > 2 || rows.length > 32) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
    const aliases = new Set<string>();
    for (const account of accounts) {
      if (account.contract_version !== "organization.active-principal.v1" ||
        account.principal_id !== input.principalId || account.employee_id !== input.employeeId ||
        account.employee_status !== "active" || !account.principal_issuer || !account.principal_subject) {
        throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      }
      const alias = JSON.stringify([account.principal_issuer, account.principal_subject]);
      if (aliases.has(alias)) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      aliases.add(alias);
    }
    const currentAlias = JSON.stringify([input.identityIssuer, input.identitySubject]);
    if (!aliases.has(currentAlias)) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    const assignments: JenfuEffectiveRoleAssignment[] = [];
    const grantKeys = new Set<string>();
    for (const row of rows) {
      if (row.contract_version !== JENFU_PRINCIPAL_GRANTS_CONTRACT_VERSION ||
        row.application_id !== applicationId || row.principal_id !== input.principalId ||
        row.employee_id !== input.employeeId) {
        throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      }
      const grantKey = JSON.stringify([row.stable_role_id, row.role_code,
        row.scope_kind, row.scope_key]);
      if (grantKeys.has(grantKey)) {
        throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      }
      grantKeys.add(grantKey);
      assignments.push({
        contractVersion: JENFU_PRINCIPAL_GRANTS_CONTRACT_VERSION,
        assignmentVersionId: row.assignment_version_id,
        assignmentVersion: Number(row.assignment_version),
        assignmentId: row.assignment_id,
        grantKind: row.grant_kind,
        delegationId: row.delegation_id,
        applicationId: JENFU_AI_PDM_APPLICATION_ID,
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
      });
    }
    return assignments;
  }

  async evaluatePermissions(inputs: readonly JenfuEnforcedPermissionInput[], decisionAt = new Date()) {
    if (inputs.length === 0) return [];
    const input = inputs[0];
    if (inputs.some((candidate) => candidate.actor.identityIssuer !== input.actor.identityIssuer
      || candidate.actor.identitySubject !== input.actor.identitySubject
      || candidate.actor.principalId !== input.actor.principalId
      || candidate.actor.employeeId !== input.actor.employeeId
      || candidate.actor.localPrincipalId !== input.actor.localPrincipalId
      || candidate.actor.companyId !== input.actor.companyId)) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
    const authority = await this.resolveAuthority({ employeeId: input.actor.employeeId });
    if (authority.authoritySource === "legacy_authority") {
      return inputs.map(() => ({ authority, assignments: [] as JenfuEffectiveRoleAssignment[], decisionCode: "legacy_authority" as const }));
    }
    if (authority.authoritySource !== "orgmaster_authority") throw new JenfuEntitlementRepositoryError("entitlement_dual_authority_detected");
    const assignments = await this.listEffectiveAssignments(input.actor);
    if (assignments.length === 0) throw new JenfuEntitlementRepositoryError("entitlement_assignment_not_found");
    if (assignments.some((assignment) => assignment.authorityVersion !== authority.authorityVersion)) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
    const priorityRank = new Map(input.rolePriority.map((roleCode, index) => [roleCode, index]));
    if (priorityRank.size !== input.rolePriority.length || inputs.some((candidate) => candidate.rolePriority.join("\0") !== input.rolePriority.join("\0"))) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
    const preparedAssignments: Array<{ assignment: JenfuEffectiveRoleAssignment; role: JenfuApplicationRole }> = [];
    for (const assignment of assignments) {
      if (!priorityRank.has(assignment.roleCode)) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
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
      const validationIssues = validateEffectiveRoleAssignment(assignment, input.actor, decisionAt);
      if (validationIssues.length) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      preparedAssignments.push({ assignment, role });
    }
    return inputs.map((candidate) => {
      let scopeCandidate = false;
      let permissionCandidate = false;
      const evaluatedRoles: string[] = [];
      const decisionCandidates: Array<{ assignment: JenfuEffectiveRoleAssignment; role: JenfuApplicationRole; allowed: boolean }> = [];
      for (const { assignment, role } of preparedAssignments) {
        if (!evaluatedRoles.includes(assignment.roleCode)) evaluatedRoles.push(assignment.roleCode);
        const permission = role.permissions.find((entry) => entry.kind === candidate.permissionKind && entry.code === candidate.permissionCode);
        if (!permission) continue;
        permissionCandidate = true;
        const workspaceKey = assignment.scopeKind === "workspace" && assignment.scopeKey
          ? resolveJenfuWorkspaceScopeKey(candidate.actor.companyId, assignment.scopeKey, candidate.workspaceCode ?? "")
          : null;
        const inScope = assignment.scopeKind === "workspace"
          ? workspaceKey !== null && workspaceKey === candidate.actor.companyId
          : scopeMatches(assignment, { workspaceKey: candidate.workspaceCode, projectKey: candidate.projectCode });
        if (!inScope) {
          scopeCandidate = true;
          continue;
        }
        decisionCandidates.push({ assignment, role, allowed: permission.allowed && roleAllowsPermission(role, candidate.permissionKind, candidate.permissionCode) });
      }
      decisionCandidates.sort((left, right) => (priorityRank.get(left.assignment.roleCode) ?? Number.MAX_SAFE_INTEGER) - (priorityRank.get(right.assignment.roleCode) ?? Number.MAX_SAFE_INTEGER));
      const selected = decisionCandidates[0];
      if (selected && !selected.allowed) return { authority, assignments, decisionCode: "permission_explicit_deny" as const, evaluatedRoles };
      if (selected) return { authority, assignments, decisionCode: "allowed" as const, role: selected.role, assignment: selected.assignment, evaluatedRoles };
      if (scopeCandidate && permissionCandidate) return { authority, assignments, decisionCode: "entitlement_scope_mismatch" as const, evaluatedRoles };
      return { authority, assignments, decisionCode: "permission_not_granted" as const, evaluatedRoles };
    });
  }

  async evaluatePermission(input: JenfuEnforcedPermissionInput, decisionAt = new Date()) {
    const [result] = await this.evaluatePermissions([input], decisionAt);
    if (result.decisionCode === "allowed" || result.decisionCode === "legacy_authority") return result;
    throw new JenfuEntitlementRepositoryError(result.decisionCode);
  }
}
