import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import roleCatalog from "../../../config/access-control/jenfu-role-catalog.v1.json" with { type: "json" };
import {rolePolicyPermissionDecision} from '@/lib/role-policy-permission-mapping';
import { AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256, AI_PDM_ADMINISTRATIVE_DEFINITION_VERSION,
  AI_PDM_ADMINISTRATIVE_PROFILE_ID, aiPdmAdministrativeRole } from '@/lib/administrative-capability-definition'
import {
  JENFU_AI_PDM_APPLICATION_ID,
  JENFU_PRINCIPAL_GRANTS_CONTRACT_VERSION,
  type JenfuApplicationRole,
  type JenfuEffectiveRoleAssignment,
  type JenfuVerifiedAuthorizationActor,
  resolveJenfuWorkspaceScopeKey,
  scopeMatches,
  validateEffectiveRoleAssignment
} from "@/lib/jenfu-entitlement-contract";

export class JenfuEntitlementRepositoryError extends Error {
  constructor(readonly code: "entitlement_authority_unavailable" | "entitlement_authority_unknown" | "entitlement_contract_mismatch" | "entitlement_assignment_not_found" | "entitlement_role_inactive" | "entitlement_scope_mismatch" | "permission_explicit_deny" | "permission_not_granted" | "entitlement_dual_authority_detected" | "legacy_assignment_mutation_retired") {
    super(code);
    this.name = "JenfuEntitlementRepositoryError";
  }
}

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
  source_assignment_id: string | null;
  source_grant_id: string | null;
  admin_catalog_sha256: string | null;
  role_definition_hash: string | null;
};

export type JenfuEnforcedPermissionInput = {
  actor: JenfuVerifiedAuthorizationActor;
  permissionKind: "page" | "action";
  permissionCode: string;
  /** Set only by a server-owned canonical resource adapter. */
  resourceGroup?: "drawing" | "part" | "model" | "transfer";
  /** Exact canonical group union for a server-resolved mixed resource. */
  resourceGroups?: readonly ("drawing" | "part" | "model" | "transfer")[];
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

type SessionAuthorityRow = {
  contract_version: string; source_version: string; evaluated_at: string;
  next_boundary: string | null; accounts: ActiveAccountRow[]; grants: AssignmentRow[];
};

export type JenfuEntitlementRoleCatalog = {
  roles: Array<JenfuApplicationRole & { roleStatus?: "active" | "inactive" }>;
  catalogVersion?: string;
};

const catalog = roleCatalog as unknown as JenfuEntitlementRoleCatalog;

export class JenfuEntitlementRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly activeCatalog: JenfuEntitlementRoleCatalog = catalog
  ) {}

  async listEffectiveAssignments(input: {
    identityIssuer: string;
    identitySubject: string;
    principalId: string;
    employeeId: string;
    applicationId?: string;
  }): Promise<JenfuEffectiveRoleAssignment[]> {
    return (await this.readAssignments(input)).assignments;
  }

  async readAssignments(input: {
    identityIssuer: string;
    identitySubject: string;
    principalId: string;
    employeeId: string;
    applicationId?: string;
  }, sessionAuthority = false, provisionAuthority?: unknown, sessionHash?: string) {
    if (this.client.kind !== "postgres") throw new JenfuEntitlementRepositoryError("entitlement_authority_unavailable");
    const applicationId = input.applicationId ?? JENFU_AI_PDM_APPLICATION_ID;
    if (applicationId !== JENFU_AI_PDM_APPLICATION_ID || !input.principalId || !input.employeeId ||
      !input.identityIssuer || !input.identitySubject) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
    let accounts: ActiveAccountRow[];
    let rows: AssignmentRow[];
    let sourceVersion: string | null = null;
    let nextBoundary: string | null = null;
    let evaluatedAt: string | null = null;
    try {
      if (sessionAuthority) {
        if (!sessionHash) throw new Error("PRINCIPAL_SESSION_AUTHORITY_INVALID");
        // The private provisioner returns the exact row that authorized it.
        const source = (provisionAuthority ?? await this.client.queryOne<SessionAuthorityRow>(`
          SELECT contract_version,source_version,evaluated_at::text,next_boundary::text,accounts,grants
          FROM ai_pdm_core.read_principal_session_authority_v2(
            :principalId,:employeeId,:identityIssuer,:identitySubject,:sessionHash)
        `, { ...input, sessionHash })) as SessionAuthorityRow | null;
        if (source?.contract_version !== "orgmaster.ai-pdm-session-authority.v1" ||
          !source.source_version || !Number.isFinite(Date.parse(source.evaluated_at)) ||
          !Array.isArray(source.accounts) || !Array.isArray(source.grants) ||
          (source.next_boundary !== null && !Number.isFinite(Date.parse(source.next_boundary)))) {
          throw new Error("PRINCIPAL_SESSION_AUTHORITY_INVALID");
        }
        sourceVersion = source.source_version;
        nextBoundary = source.next_boundary;
        evaluatedAt = source.evaluated_at;
        accounts = source.accounts;
        rows = source.grants;
      } else {
        accounts = await this.client.query<ActiveAccountRow>(`
          SELECT contract_version, principal_issuer, principal_subject, principal_id,
                 employee_id, employee_status
          FROM orgmaster_contract.read_ai_pdm_active_principal_accounts_v1(:principalId)
          WHERE principal_id = :principalId
          ORDER BY principal_issuer, principal_subject
          LIMIT 3
        `, { principalId: input.principalId });
        rows = await this.client.query<AssignmentRow>(`
          SELECT contract_version, assignment_version_id, assignment_version, assignment_id,
                 grant_kind, delegation_id, application_id,
                 principal_id, employee_id, subject_kind, target_principal_id, stable_role_id,
                 role_code, catalog_version, scope_kind, scope_key, valid_from::text,
                 valid_until::text, published_at::text,
                 source_assignment_id, source_grant_id, admin_catalog_sha256, role_definition_hash
          FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v6(:principalId, :employeeId)
          WHERE application_id = :applicationId
            AND principal_id = :principalId
            AND employee_id = :employeeId
          ORDER BY stable_role_id, assignment_id
          LIMIT 33
        `, { ...input, applicationId });
      }
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
      if (row.stable_role_id === AI_PDM_ADMINISTRATIVE_PROFILE_ID
        && (row.catalog_version !== AI_PDM_ADMINISTRATIVE_DEFINITION_VERSION
          || row.admin_catalog_sha256 !== AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256
          || row.role_definition_hash !== AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256)) {
        throw new JenfuEntitlementRepositoryError('entitlement_contract_mismatch')
      }
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
        sourceAssignmentId: row.source_assignment_id, sourceGrantId: row.source_grant_id,
        adminCatalogSha256: row.admin_catalog_sha256, roleDefinitionHash: row.role_definition_hash
      });
    }
    return { assignments, sourceVersion, nextBoundary, evaluatedAt };
  }

  async evaluatePermissions(inputs: readonly JenfuEnforcedPermissionInput[], decisionAt = new Date()) {
    if (inputs.length === 0) return [];
    this.assertSingleActor(inputs);
    const assignments = await this.listEffectiveAssignments(inputs[0].actor);
    return this.evaluatePublishedAssignments(inputs, assignments, decisionAt);
  }

  evaluatePublishedAssignments(inputs: readonly JenfuEnforcedPermissionInput[],
    assignments: JenfuEffectiveRoleAssignment[], decisionAt: Date) {
    if (inputs.length === 0) return [];
    this.assertSingleActor(inputs);
    const input = inputs[0];
    const { publication, preparedAssignments, evaluatedRoles } =
      this.preparePermissions(input.actor, assignments, input.rolePriority, decisionAt);
    if (inputs.some((candidate) => candidate.rolePriority.join("\0") !== input.rolePriority.join("\0"))) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
    return inputs.map((candidate) => {
      let scopeCandidate = false;
      for (const { assignment, role } of preparedAssignments) {
        const dynamicPolicy = this.activeCatalog.catalogVersion?.startsWith("ai-pdm.role-policy.") === true;
        const permissionDecision = rolePolicyPermissionDecision(role, candidate.permissionKind, candidate.permissionCode,
          dynamicPolicy, candidate.resourceGroup, candidate.resourceGroups);
        if (permissionDecision === "not_granted") continue;
        const workspaceKey = assignment.scopeKind === "workspace" && assignment.scopeKey
          ? resolveJenfuWorkspaceScopeKey(candidate.actor.companyId, assignment.scopeKey, candidate.workspaceCode ?? "")
          : null;
        const inScope = assignment.scopeKind === "workspace"
          ? workspaceKey !== null && workspaceKey === candidate.actor.companyId
          : scopeMatches(assignment, { workspaceKey: candidate.workspaceCode, projectKey: candidate.projectCode });
        if (!inScope) { scopeCandidate = true; continue; }
        if (permissionDecision === "explicit_deny") {
          return { publication, assignments, decisionCode: "permission_explicit_deny" as const, evaluatedRoles };
        }
        return { publication, assignments, decisionCode: "allowed" as const, role, assignment, evaluatedRoles };
      }
      if (scopeCandidate) return { publication, assignments, decisionCode: "entitlement_scope_mismatch" as const, evaluatedRoles };
      return { publication, assignments, decisionCode: "permission_not_granted" as const, evaluatedRoles };
    });
  }

  private assertSingleActor(inputs: readonly JenfuEnforcedPermissionInput[]) {
    const { actor } = inputs[0];
    if (inputs.some(candidate => candidate.actor.identityIssuer !== actor.identityIssuer ||
      candidate.actor.identitySubject !== actor.identitySubject ||
      candidate.actor.principalId !== actor.principalId || candidate.actor.employeeId !== actor.employeeId ||
      candidate.actor.localPrincipalId !== actor.localPrincipalId || candidate.actor.companyId !== actor.companyId)) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
  }

  preparePermissions(actor: JenfuEnforcedPermissionInput["actor"], assignments: JenfuEffectiveRoleAssignment[],
    rolePriority: readonly string[], decisionAt: Date) {
    if (assignments.length === 0) throw new JenfuEntitlementRepositoryError("entitlement_assignment_not_found");
    const publication = {
      assignmentVersionId: assignments[0].assignmentVersionId,
      assignmentVersion: assignments[0].assignmentVersion,
      publishedAt: assignments[0].publishedAt
    };
    if (assignments.some((assignment) => assignment.assignmentVersionId !== publication.assignmentVersionId ||
      assignment.assignmentVersion !== publication.assignmentVersion ||
      assignment.publishedAt !== publication.publishedAt)) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
    const effectivePriority = [...rolePriority];
    if (this.activeCatalog.catalogVersion?.startsWith("ai-pdm.role-policy.") === true) {
      for (const role of this.activeCatalog.roles) if (!effectivePriority.includes(role.roleCode)) effectivePriority.push(role.roleCode);
    }
    if (assignments.some(assignment => assignment.stableRoleId === AI_PDM_ADMINISTRATIVE_PROFILE_ID) &&
        !effectivePriority.includes('application_system_admin')) effectivePriority.push('application_system_admin');
    const priorityRank = new Map(effectivePriority.map((roleCode, index) => [roleCode, index]));
    if (new Set(rolePriority).size !== rolePriority.length) {
      throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
    }
    const preparedAssignments: Array<{ assignment: JenfuEffectiveRoleAssignment; role: JenfuApplicationRole }> = [];
    for (const assignment of assignments) {
      if (!priorityRank.has(assignment.roleCode)) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      const administrator = assignment.stableRoleId === AI_PDM_ADMINISTRATIVE_PROFILE_ID;
      const role = administrator ? aiPdmAdministrativeRole
        : this.activeCatalog.roles.find((candidate) => candidate.stableRoleId === assignment.stableRoleId);
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
          && assignment.targetPrincipalId === actor.principalId
          && assignment.scopeKind === "global"
          && assignment.scopeKey === null
          && assignment.grantKind === "direct"
          && assignment.delegationId === null
        );
      if (administrator && (
          role.roleCode !== 'application_system_admin' || role.assignable !== false || role.risk !== 'critical' ||
          role.subjectKind !== 'principal' || role.assignmentTier !== 'app_admin' || role.recommendationAllowed || role.delegationAllowed ||
          JSON.stringify(role.allowedScopeKinds) !== '["global"]' || assignment.subjectKind !== 'principal' ||
          assignment.targetPrincipalId !== actor.principalId || assignment.grantKind !== 'direct' || assignment.delegationId !== null ||
          assignment.scopeKind !== 'global' || assignment.scopeKey !== null ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(assignment.sourceGrantId ?? '') ||
          assignment.sourceGrantId !== assignment.sourceAssignmentId || assignment.assignmentId !== assignment.sourceGrantId ||
          assignment.catalogVersion !== AI_PDM_ADMINISTRATIVE_DEFINITION_VERSION ||
          assignment.adminCatalogSha256 !== AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256 ||
          assignment.roleDefinitionHash !== role.roleDefinitionHash || role.roleStatus === 'inactive'
        )) throw new JenfuEntitlementRepositoryError('entitlement_contract_mismatch');
      if (role.roleCode !== assignment.roleCode || role.subjectKind !== assignment.subjectKind || (!role.assignable && !administrator) || !role.allowedScopeKinds.includes(assignment.scopeKind) || !privilegedPolicyMatches) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      const validationIssues = validateEffectiveRoleAssignment(assignment, actor, decisionAt);
      if (validationIssues.length) throw new JenfuEntitlementRepositoryError("entitlement_contract_mismatch");
      // Retain and validate tombstones, then omit only their authorization.
      // A legitimate inactive grant must not deny another active role.
      if (role.roleStatus === "inactive") continue;
      preparedAssignments.push({ assignment, role });
    }
    const evaluatedRoles = [...new Set(preparedAssignments.map(({ assignment }) => assignment.roleCode))];
    preparedAssignments.sort((left, right) =>
      (priorityRank.get(left.assignment.roleCode) ?? Infinity) - (priorityRank.get(right.assignment.roleCode) ?? Infinity));
    return { publication, preparedAssignments, evaluatedRoles };
  }

  async evaluatePermission(input: JenfuEnforcedPermissionInput, decisionAt = new Date()) {
    const [result] = await this.evaluatePermissions([input], decisionAt);
    if (result.decisionCode === "allowed") return result;
    throw new JenfuEntitlementRepositoryError(result.decisionCode);
  }
}
