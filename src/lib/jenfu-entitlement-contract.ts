import { createHash } from "node:crypto";

export const JENFU_ENTITLEMENT_CONTRACT_VERSION = "jenfu.platform-entitlement.v1" as const;
export const JENFU_AI_PDM_APPLICATION_ID = "ai-pdm" as const;
export const JENFU_ROLE_CATALOG_VERSION = "ai-pdm.role-catalog.2026-09-02.v2" as const;

export type JenfuEntitlementErrorCode =
  | "entitlement_authority_unavailable"
  | "entitlement_authority_unknown"
  | "entitlement_contract_mismatch"
  | "entitlement_assignment_not_found"
  | "entitlement_role_inactive"
  | "entitlement_scope_mismatch"
  | "permission_explicit_deny"
  | "permission_not_granted"
  | "entitlement_dual_authority_detected"
  | "legacy_assignment_mutation_retired";

export type JenfuEntitlementAuthoritySource = "legacy_authority" | "orgmaster_authority";
export type JenfuEntitlementScopeKind = "workspace" | "project" | "global";
export type JenfuEntitlementSubjectKind = "employee" | "principal";

export type JenfuRolePermission = {
  code: string;
  kind: "page" | "action";
  allowed: boolean;
};

export type JenfuApplicationRole = {
  stableRoleId: string;
  roleCode: string;
  displayName: string;
  assignable: boolean;
  risk: "normal" | "high" | "critical";
  subjectKind: JenfuEntitlementSubjectKind;
  recommendationAllowed: boolean;
  delegationAllowed: boolean;
  allowedScopeKinds: JenfuEntitlementScopeKind[];
  assignmentTier: "app_admin" | "cross_app_override";
  permissions: JenfuRolePermission[];
  metadata?: Record<string, string | boolean | number | null>;
  roleDefinitionHash: string;
};

export type JenfuApplicationRoleCatalog = {
  contractVersion: typeof JENFU_ENTITLEMENT_CONTRACT_VERSION;
  applicationId: typeof JENFU_AI_PDM_APPLICATION_ID;
  catalogVersion: string;
  publishedAt: string;
  roles: JenfuApplicationRole[];
  catalogSha256: string;
};

export type JenfuEffectiveRoleAssignment = {
  contractVersion: typeof JENFU_ENTITLEMENT_CONTRACT_VERSION;
  assignmentVersionId: string;
  assignmentVersion: number;
  assignmentId: string;
  grantKind: "direct" | "delegated";
  delegationId: string | null;
  applicationId: typeof JENFU_AI_PDM_APPLICATION_ID;
  identityIssuer: string;
  identitySubject: string;
  principalId: string;
  employeeId: string;
  subjectKind: JenfuEntitlementSubjectKind;
  targetPrincipalId: string | null;
  stableRoleId: string;
  roleCode: string;
  catalogVersion: string;
  scopeKind: JenfuEntitlementScopeKind;
  scopeKey: string | null;
  validFrom: string;
  validUntil: string | null;
  publishedAt: string;
  authorityVersion: number;
};

export type JenfuEntitlementAuthority = {
  contractVersion: typeof JENFU_ENTITLEMENT_CONTRACT_VERSION;
  applicationId: typeof JENFU_AI_PDM_APPLICATION_ID;
  authoritySource: JenfuEntitlementAuthoritySource;
  authorityVersion: number;
  employeeId: string | null;
  updatedAt: string;
  operationId: string | null;
};

export type JenfuEntitlementResourceScope = {
  workspaceKey?: string | null;
  projectKey?: string | null;
};

export type JenfuEntitlementValidationIssue = {
  code: "ENTITLEMENT_CONTRACT_INVALID" | "ENTITLEMENT_SCOPE_INVALID" | "ENTITLEMENT_IDENTITY_MISMATCH";
  path: string;
  message: string;
};

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDateTime(value: string) {
  return Number.isFinite(Date.parse(value));
}

export function sha256Canonical(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function validateEffectiveRoleAssignment(
  assignment: JenfuEffectiveRoleAssignment,
  session: Pick<JenfuEffectiveRoleAssignment, "identityIssuer" | "identitySubject" | "principalId" | "employeeId">,
  now = new Date()
): JenfuEntitlementValidationIssue[] {
  const issues: JenfuEntitlementValidationIssue[] = [];
  const add = (code: JenfuEntitlementValidationIssue["code"], path: string, message: string) => issues.push({ code, path, message });
  if (assignment.contractVersion !== JENFU_ENTITLEMENT_CONTRACT_VERSION || assignment.applicationId !== JENFU_AI_PDM_APPLICATION_ID) {
    add("ENTITLEMENT_CONTRACT_INVALID", "contractVersion", "entitlement contract or application is not supported");
  }
  for (const field of ["assignmentVersionId", "assignmentId", "identityIssuer", "identitySubject", "principalId", "employeeId", "stableRoleId", "roleCode", "catalogVersion"] as const) {
    if (!nonBlank(assignment[field])) add("ENTITLEMENT_CONTRACT_INVALID", field, "value must be non-blank");
  }
  if (assignment.assignmentVersion < 1 || assignment.authorityVersion < 1) add("ENTITLEMENT_CONTRACT_INVALID", "assignmentVersion", "versions must be positive integers");
  if (!isDateTime(assignment.validFrom) || !isDateTime(assignment.publishedAt)) add("ENTITLEMENT_CONTRACT_INVALID", "validFrom", "timestamps must be ISO date-times");
  if (assignment.validUntil !== null && !isDateTime(assignment.validUntil)) add("ENTITLEMENT_CONTRACT_INVALID", "validUntil", "validUntil must be an ISO date-time or null");
  if (assignment.validUntil && Date.parse(assignment.validUntil) <= Date.parse(assignment.validFrom)) add("ENTITLEMENT_CONTRACT_INVALID", "validUntil", "validUntil must be after validFrom");
  if (assignment.grantKind === "direct" && assignment.delegationId !== null) add("ENTITLEMENT_CONTRACT_INVALID", "delegationId", "direct assignment cannot carry delegationId");
  if (assignment.grantKind === "delegated" && !nonBlank(assignment.delegationId)) add("ENTITLEMENT_CONTRACT_INVALID", "delegationId", "delegated assignment requires delegationId");
  if (assignment.subjectKind === "employee" && assignment.targetPrincipalId !== null) add("ENTITLEMENT_CONTRACT_INVALID", "targetPrincipalId", "employee assignment target must be null");
  if (assignment.subjectKind === "principal" && !nonBlank(assignment.targetPrincipalId)) add("ENTITLEMENT_CONTRACT_INVALID", "targetPrincipalId", "principal assignment requires target principal");
  if (assignment.scopeKind === "global" && assignment.scopeKey !== null) add("ENTITLEMENT_SCOPE_INVALID", "scopeKey", "global scope key must be null");
  if (assignment.scopeKind !== "global" && !nonBlank(assignment.scopeKey)) add("ENTITLEMENT_SCOPE_INVALID", "scopeKey", "workspace/project scope key must be non-blank");
  if (assignment.identityIssuer !== session.identityIssuer || assignment.identitySubject !== session.identitySubject || assignment.principalId !== session.principalId || assignment.employeeId !== session.employeeId) {
    add("ENTITLEMENT_IDENTITY_MISMATCH", "identity", "assignment identity must exactly match the verified session");
  }
  const at = now.getTime();
  if (Date.parse(assignment.validFrom) > at || (assignment.validUntil !== null && at >= Date.parse(assignment.validUntil))) add("ENTITLEMENT_CONTRACT_INVALID", "validFrom", "assignment is outside its half-open validity interval");
  return issues;
}

export function roleAllowsPermission(role: JenfuApplicationRole, permissionKind: "page" | "action", permissionCode: string) {
  return role.permissions.some((permission) => permission.kind === permissionKind && permission.code === permissionCode && permission.allowed);
}

export function scopeMatches(roleScope: Pick<JenfuEffectiveRoleAssignment, "scopeKind" | "scopeKey">, resource: JenfuEntitlementResourceScope) {
  if (roleScope.scopeKind === "global") return true;
  if (roleScope.scopeKind === "workspace") return nonBlank(resource.workspaceKey) && resource.workspaceKey === roleScope.scopeKey;
  return nonBlank(resource.projectKey) && resource.projectKey === roleScope.scopeKey;
}
