import crypto from "node:crypto";

type AccountType = "human_personal" | "human_privileged";
type LegacyRole = "Admin" | "R&D Manager" | "Engineer" | "Manufacturing" | "Procurement";
type LegacyProfile = {
  pdmUserId: string; principalId: string; legacyRole: LegacyRole;
  accountType: AccountType; systemRoleEnabled: boolean;
};
type Role = { id: string; roleCode: string; enabled: boolean };
type LegacyAssignment = {
  id: string; userId: string; roleId: string; reason: string;
  scopeTemplate: string; namedScope: string; sponsorUserId: string | null;
  startsAt: string | null; reviewDueAt: string | null; hardEndsAt: string | null;
  assignedBy: string; assignedAt: string; revokedAt: string | null;
  revokedBy: string | null;
};
type LegacyDelegation = {
  id: string; delegatedFrom: string; delegatedTo: string;
  projectCode: string | null; actionCode: string | null;
  startsAt: string | null; endsAt: string | null;
  reason: string; createdBy: string; createdAt: string;
  revokedAt: string | null; revokedBy: string | null;
};

export type PrincipalAclMigrationInput = {
  profiles: LegacyProfile[];
  // The caller must read these active account/profile pairs from the same
  // owner snapshot. Unverified mapping candidates cannot satisfy ACL FKs.
  externalActiveAccounts: Array<{ pdmUserId: string; principalId: string }>;
  roles: Role[];
  rolePriority: string[];
  assignments: LegacyAssignment[];
  delegations: LegacyDelegation[];
  cutoverAt: string;
};

const BASE_ROLES: Record<LegacyRole, readonly string[]> = {
  Admin: ["system_admin", "pdm_admin"],
  "R&D Manager": ["rd_manager"],
  Engineer: ["rd"],
  Manufacturing: ["manufacturing"],
  Procurement: ["procurement"]
};
const SCOPES = new Set(["workspace_all", "own_department", "workspace_quality",
  "released_only", "named_scope", "self"]);

export class PrincipalAclMigrationPlanError extends Error {
  constructor(readonly code: "principal_acl_plan_invalid" |
    "principal_acl_plan_role_missing" | "principal_acl_plan_reference_unresolved" |
    "principal_acl_plan_priority_incomplete") { super(code); }
}

function invalid(): never { throw new PrincipalAclMigrationPlanError("principal_acl_plan_invalid"); }
function exact(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 255 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}
function instant(value: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) invalid();
  return new Date(value).toISOString();
}
function requiredInstant(value: string): string {
  const result = instant(value);
  if (!result) invalid();
  return result;
}
function requireOrdered(start: string | null, end: string | null,
  strict: boolean) {
  if (start !== null && end !== null &&
    (strict ? end <= start : end < start)) invalid();
}
function compare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function hashId(kind: string, source: string) {
  return `dev121-${kind}-${crypto.createHash("sha256").update(source).digest("hex")}`;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Pure, deterministic rows for owner review; no database write or authorization decision. */
export function planPrincipalAclMigration(input: PrincipalAclMigrationInput) {
  if (!input || !Array.isArray(input.profiles) || input.profiles.length === 0 ||
    !Array.isArray(input.roles) || !Array.isArray(input.assignments) ||
    !Array.isArray(input.delegations) || !Array.isArray(input.rolePriority) ||
    !Array.isArray(input.externalActiveAccounts)) invalid();
  const cutoverAt = requiredInstant(input.cutoverAt);
  const roleById = new Map<string, Role>();
  const roleByCode = new Map<string, Role>();
  for (const role of input.roles) {
    if (!exact(role?.id) || !exact(role.roleCode) || typeof role.enabled !== "boolean" ||
      roleById.has(role.id) || roleByCode.has(role.roleCode)) invalid();
    roleById.set(role.id, role);
    roleByCode.set(role.roleCode, role);
  }
  if (input.rolePriority.length === 0 ||
    input.rolePriority.some((code) => !exact(code)) ||
    new Set(input.rolePriority).size !== input.rolePriority.length) invalid();
  const principals = new Map<string, string>();
  const usedPrincipals = new Set<string>();
  const profiles = [...input.profiles].sort((a, b) => compare(a.pdmUserId, b.pdmUserId));
  for (const profile of profiles) {
    if (!exact(profile?.pdmUserId) || !exact(profile.principalId) ||
      profile.principalId.startsWith("pdm:") ||
      !Object.hasOwn(BASE_ROLES, profile.legacyRole) ||
      !["human_personal", "human_privileged"].includes(profile.accountType) ||
      typeof profile.systemRoleEnabled !== "boolean" ||
      principals.has(profile.pdmUserId) || usedPrincipals.has(profile.principalId)) invalid();
    principals.set(profile.pdmUserId, profile.principalId);
    usedPrincipals.add(profile.principalId);
  }
  const resolvablePrincipals = new Map(principals);
  for (const account of input.externalActiveAccounts) {
    if (!exact(account?.pdmUserId) || !exact(account.principalId) ||
      account.principalId.startsWith("pdm:") ||
      resolvablePrincipals.has(account.pdmUserId) ||
      usedPrincipals.has(account.principalId)) invalid();
    resolvablePrincipals.set(account.pdmUserId, account.principalId);
    usedPrincipals.add(account.principalId);
  }
  const principalFor = (pdmUserId: string): string | null => {
    return resolvablePrincipals.get(pdmUserId) ?? null;
  };
  const requiredCodes = new Set<string>();
  const principalAssignments: Array<Record<string, unknown>> = [];
  const accountAssurance: Array<{ principalId: string; minimumAssurance: "aal1" | "aal2" }> = [];
  for (const profile of profiles) {
    accountAssurance.push({ principalId: profile.principalId,
      minimumAssurance: profile.accountType === "human_privileged" ||
        ["Admin", "R&D Manager"].includes(profile.legacyRole) ? "aal2" : "aal1" });
    for (const roleCode of BASE_ROLES[profile.legacyRole]) {
      requiredCodes.add(roleCode);
      const role = roleByCode.get(roleCode);
      if (!role) throw new PrincipalAclMigrationPlanError("principal_acl_plan_role_missing");
      principalAssignments.push({
        id: hashId("base", `${profile.pdmUserId}\0${roleCode}`),
        principalId: profile.principalId, roleId: role.id,
        sourceAssignmentId: null, origin: "legacy_base", reason: "DEV-121 base role materialization",
        scopeTemplate: "workspace_all", namedScope: "", sponsorPrincipalId: null,
        startsAt: null, reviewDueAt: null, hardEndsAt: null, assignedAt: cutoverAt,
        revokedAt: null, assignedByPrincipalId: null, revokedByPrincipalId: null,
        legacyAssignedByUserId: null, legacyRevokedByUserId: null
      });
    }
  }
  const sourceAssignments = new Set<string>();
  const historicalAssignmentsLeftInPlace: string[] = [];
  for (const assignment of [...input.assignments].sort((a, b) => compare(a.id, b.id))) {
    if (!exact(assignment?.id) || sourceAssignments.has(assignment.id) ||
      !exact(assignment.userId) || !exact(assignment.roleId) ||
      !exact(assignment.assignedBy) || !SCOPES.has(assignment.scopeTemplate) ||
      typeof assignment.namedScope !== "string" || typeof assignment.reason !== "string" ||
      (assignment.sponsorUserId !== null && !exact(assignment.sponsorUserId)) ||
      (assignment.revokedBy !== null && !exact(assignment.revokedBy))) invalid();
    sourceAssignments.add(assignment.id);
    const targetPrincipal = principals.get(assignment.userId);
    if (!targetPrincipal) continue;
    const role = roleById.get(assignment.roleId);
    if (!role) throw new PrincipalAclMigrationPlanError("principal_acl_plan_role_missing");
    requiredCodes.add(role.roleCode);
    const sponsorPrincipal = assignment.sponsorUserId === null ? null : principalFor(assignment.sponsorUserId);
    if (assignment.sponsorUserId !== null && !sponsorPrincipal) {
      if (assignment.revokedAt === null) {
        throw new PrincipalAclMigrationPlanError("principal_acl_plan_reference_unresolved");
      }
      historicalAssignmentsLeftInPlace.push(assignment.id);
      continue;
    }
    if (assignment.scopeTemplate === "named_scope" && !exact(assignment.namedScope)) invalid();
    const startsAt = instant(assignment.startsAt);
    const hardEndsAt = instant(assignment.hardEndsAt);
    const assignedAt = requiredInstant(assignment.assignedAt);
    const revokedAt = instant(assignment.revokedAt);
    requireOrdered(startsAt, hardEndsAt, true);
    requireOrdered(assignedAt, revokedAt, false);
    principalAssignments.push({
      id: hashId("assignment", assignment.id), principalId: targetPrincipal,
      roleId: role.id, sourceAssignmentId: assignment.id,
      origin: "legacy_assignment", reason: assignment.reason,
      scopeTemplate: assignment.scopeTemplate, namedScope: assignment.namedScope,
      sponsorPrincipalId: sponsorPrincipal, startsAt,
      reviewDueAt: instant(assignment.reviewDueAt), hardEndsAt,
      assignedAt, revokedAt,
      assignedByPrincipalId: principalFor(assignment.assignedBy),
      revokedByPrincipalId: assignment.revokedBy === null ? null : principalFor(assignment.revokedBy),
      legacyAssignedByUserId: assignment.assignedBy,
      legacyRevokedByUserId: assignment.revokedBy
    });
  }
  if ([...requiredCodes].some((code) => !input.rolePriority.includes(code))) {
    throw new PrincipalAclMigrationPlanError("principal_acl_plan_priority_incomplete");
  }
  const principalDelegations: Array<Record<string, unknown>> = [];
  const historicalDelegationsLeftInPlace: string[] = [];
  const sourceDelegations = new Set<string>();
  for (const delegation of [...input.delegations].sort((a, b) => compare(a.id, b.id))) {
    if (!exact(delegation?.id) || sourceDelegations.has(delegation.id) ||
      !exact(delegation.delegatedFrom) || !exact(delegation.delegatedTo) ||
      !exact(delegation.createdBy) || typeof delegation.reason !== "string" ||
      (delegation.projectCode !== null && !exact(delegation.projectCode)) ||
      (delegation.actionCode !== null && !exact(delegation.actionCode)) ||
      (delegation.revokedBy !== null && !exact(delegation.revokedBy))) invalid();
    sourceDelegations.add(delegation.id);
    if (!principals.has(delegation.delegatedFrom) && !principals.has(delegation.delegatedTo)) continue;
    const fromPrincipal = principalFor(delegation.delegatedFrom);
    const toPrincipal = principalFor(delegation.delegatedTo);
    if (!fromPrincipal || !toPrincipal) {
      if (delegation.revokedAt === null) {
        throw new PrincipalAclMigrationPlanError("principal_acl_plan_reference_unresolved");
      }
      historicalDelegationsLeftInPlace.push(delegation.id);
      continue;
    }
    const startsAt = instant(delegation.startsAt);
    const endsAt = instant(delegation.endsAt);
    requireOrdered(startsAt, endsAt, true);
    principalDelegations.push({
      id: hashId("delegation", delegation.id), sourceDelegationId: delegation.id,
      fromPrincipalId: fromPrincipal, toPrincipalId: toPrincipal,
      projectCode: delegation.projectCode, actionCode: delegation.actionCode,
      startsAt, endsAt,
      reason: delegation.reason, createdAt: requiredInstant(delegation.createdAt),
      revokedAt: instant(delegation.revokedAt),
      createdByPrincipalId: principalFor(delegation.createdBy),
      revokedByPrincipalId: delegation.revokedBy === null ? null : principalFor(delegation.revokedBy),
      legacyCreatedByUserId: delegation.createdBy,
      legacyRevokedByUserId: delegation.revokedBy
    });
  }
  const plan = { accountAssurance, principalAssignments,
    principalDelegations, historicalAssignmentsLeftInPlace, historicalDelegationsLeftInPlace };
  return { ...plan,
    planHash: crypto.createHash("sha256").update(canonical(plan)).digest("hex") };
}
