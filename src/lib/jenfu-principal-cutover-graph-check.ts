import type { PrincipalAclMigrationInput } from "@/lib/jenfu-principal-acl-migration-plan";
import { hashPrincipalSource, orderedPrincipalSourceRows } from "@/lib/jenfu-principal-source-canonical";

type Plan = {
  accountAssurance: Array<{ principalId: string; minimumAssurance: "aal1" | "aal2" }>;
  principalAssignments: Array<Record<string, unknown>>;
  principalDelegations: Array<Record<string, unknown>>;
};

const BASE_ROLE_CODES: Record<string, readonly string[]> = {
  Admin: ["system_admin", "pdm_admin"],
  "R&D Manager": ["rd_manager"],
  Engineer: ["rd"],
  Manufacturing: ["manufacturing"],
  Procurement: ["procurement"]
};

function mismatch(): never { throw new Error("PRINCIPAL_CUTOVER_GRAPH_MISMATCH"); }
function instant(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) mismatch();
  return date.toISOString();
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) mismatch();
  return value;
}
function same(expected: unknown, actual: unknown) {
  try {
    if (hashPrincipalSource(expected) === hashPrincipalSource(actual)) return;
  } catch { /* Invalid canonical input is a mismatch. */ }
  mismatch();
}

/**
 * Independently checks the active legacy ACL graph against the proposed
 * principal rows. It proves no active role, scope or delegation is invented or
 * dropped; a separate evaluator shadow must still prove behavioral parity.
 */
export function assertPrincipalAclGraphPreserved(
  source: PrincipalAclMigrationInput, plan: Plan
) {
  if (!source || !plan || !Array.isArray(source.profiles) ||
    !Array.isArray(source.assignments) || !Array.isArray(source.delegations) ||
    !Array.isArray(source.roles) || !Array.isArray(source.externalActiveAccounts) ||
    !Array.isArray(plan.principalAssignments) ||
    !Array.isArray(plan.principalDelegations) ||
    !Array.isArray(plan.accountAssurance)) mismatch();
  const principalByProfile = new Map<string, string>();
  for (const row of [...source.profiles, ...source.externalActiveAccounts]) {
    if (!row?.pdmUserId || !row.principalId || principalByProfile.has(row.pdmUserId)) mismatch();
    principalByProfile.set(row.pdmUserId, row.principalId);
  }
  const cohort = new Set(source.profiles.map((row) => row.pdmUserId));
  const roleIdByCode = new Map(source.roles.map((row) => [row.roleCode, row.id]));
  if (roleIdByCode.size !== source.roles.length) mismatch();
  const expectedAssurance = source.profiles.map((row) => ({
    principalId: row.principalId,
    minimumAssurance: row.accountType === "human_privileged" ||
      row.legacyRole === "Admin" || row.legacyRole === "R&D Manager" ? "aal2" : "aal1"
  }));
  same(orderedPrincipalSourceRows(expectedAssurance),
    orderedPrincipalSourceRows(plan.accountAssurance));

  const expectedBase = source.profiles.flatMap((row) => {
    const codes = BASE_ROLE_CODES[row.legacyRole];
    if (!codes) mismatch();
    return codes.map((code) => {
      const roleId = roleIdByCode.get(code);
      if (!roleId) mismatch();
      return { principalId: row.principalId, roleId, scopeTemplate: "workspace_all",
        namedScope: "", sponsorPrincipalId: null, startsAt: null,
        reviewDueAt: null, hardEndsAt: null, revokedAt: null };
    });
  });
  const actualBase = plan.principalAssignments.filter((row) => row.origin === "legacy_base")
    .map((row) => ({ principalId: text(row.principalId), roleId: text(row.roleId),
      scopeTemplate: row.scopeTemplate, namedScope: row.namedScope,
      sponsorPrincipalId: row.sponsorPrincipalId, startsAt: row.startsAt,
      reviewDueAt: row.reviewDueAt, hardEndsAt: row.hardEndsAt,
      revokedAt: row.revokedAt }));
  same(orderedPrincipalSourceRows(expectedBase), orderedPrincipalSourceRows(actualBase));

  const activeAssignmentSource = source.assignments.filter((row) =>
    cohort.has(row.userId) && row.revokedAt === null);
  const actualAssignments = plan.principalAssignments.filter((row) =>
    row.origin === "legacy_assignment" && row.revokedAt === null);
  if (activeAssignmentSource.length !== actualAssignments.length ||
    new Set(actualAssignments.map((row) => row.sourceAssignmentId)).size !==
      actualAssignments.length) mismatch();
  const actualAssignmentBySource = new Map(actualAssignments.map((row) =>
    [row.sourceAssignmentId, row]));
  const assignmentFacts = activeAssignmentSource.map((row) => {
    const target = actualAssignmentBySource.get(row.id);
    const sponsor = row.sponsorUserId === null ? null :
      principalByProfile.get(row.sponsorUserId);
    if (!target || (row.sponsorUserId !== null && !sponsor)) mismatch();
    const expected = { principalId: principalByProfile.get(row.userId),
      roleId: row.roleId, scopeTemplate: row.scopeTemplate,
      namedScope: row.namedScope, sponsorPrincipalId: sponsor,
      startsAt: instant(row.startsAt), reviewDueAt: instant(row.reviewDueAt),
      hardEndsAt: instant(row.hardEndsAt), assignedAt: instant(row.assignedAt),
      revokedAt: null };
    const actual = { principalId: target.principalId, roleId: target.roleId,
      scopeTemplate: target.scopeTemplate, namedScope: target.namedScope,
      sponsorPrincipalId: target.sponsorPrincipalId,
      startsAt: target.startsAt, reviewDueAt: target.reviewDueAt,
      hardEndsAt: target.hardEndsAt, assignedAt: target.assignedAt,
      revokedAt: target.revokedAt };
    same(expected, actual);
    return { sourceAssignmentId: row.id, ...expected };
  });
  if (plan.principalAssignments.some((row) => row.origin !== "legacy_base" &&
    row.origin !== "legacy_assignment")) mismatch();

  const activeDelegationSource = source.delegations.filter((row) =>
    (cohort.has(row.delegatedFrom) || cohort.has(row.delegatedTo)) &&
      row.revokedAt === null);
  const actualDelegations = plan.principalDelegations.filter((row) => row.revokedAt === null);
  if (activeDelegationSource.length !== actualDelegations.length ||
    new Set(actualDelegations.map((row) => row.sourceDelegationId)).size !==
      actualDelegations.length) mismatch();
  const actualDelegationBySource = new Map(actualDelegations.map((row) =>
    [row.sourceDelegationId, row]));
  const delegationFacts = activeDelegationSource.map((row) => {
    const target = actualDelegationBySource.get(row.id);
    const from = principalByProfile.get(row.delegatedFrom);
    const to = principalByProfile.get(row.delegatedTo);
    if (!target || !from || !to) mismatch();
    const expected = { fromPrincipalId: from, toPrincipalId: to,
      projectCode: row.projectCode, actionCode: row.actionCode,
      startsAt: instant(row.startsAt), endsAt: instant(row.endsAt),
      createdAt: instant(row.createdAt), revokedAt: null };
    const actual = { fromPrincipalId: target.fromPrincipalId,
      toPrincipalId: target.toPrincipalId, projectCode: target.projectCode,
      actionCode: target.actionCode, startsAt: target.startsAt,
      endsAt: target.endsAt, createdAt: target.createdAt,
      revokedAt: target.revokedAt };
    same(expected, actual);
    return { sourceDelegationId: row.id, ...expected };
  });
  const graphHash = hashPrincipalSource({
    contractVersion: "ai-pdm.principal-cutover-active-acl-graph.v1",
    assurance: orderedPrincipalSourceRows(expectedAssurance),
    base: orderedPrincipalSourceRows(expectedBase),
    assignments: orderedPrincipalSourceRows(assignmentFacts),
    delegations: orderedPrincipalSourceRows(delegationFacts)
  });
  return { graphHash, activeAssignments: assignmentFacts.length,
    activeDelegations: delegationFacts.length };
}
