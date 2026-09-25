import { describe, expect, it } from "vitest";
import { planPrincipalAclMigration, type PrincipalAclMigrationInput } from
  "@/lib/jenfu-principal-acl-migration-plan";

const at = "2026-09-25T08:00:00.000Z";
function source(): PrincipalAclMigrationInput {
  return {
    profiles: [
      { pdmUserId: "pdm-one", principalId: "principal-one", legacyRole: "Admin",
        accountType: "human_personal", systemRoleEnabled: true },
      { pdmUserId: "pdm-two", principalId: "principal-two", legacyRole: "Engineer",
        accountType: "human_personal", systemRoleEnabled: true }
    ],
    externalActiveAccounts: [],
    roles: [
      { id: "role-admin", roleCode: "system_admin", enabled: true },
      { id: "role-pdm", roleCode: "pdm_admin", enabled: true },
      { id: "role-rd", roleCode: "rd", enabled: true },
      { id: "role-qa", roleCode: "qa", enabled: true }
    ],
    rolePriority: ["system_admin", "pdm_admin", "qa", "rd"],
    assignments: [{ id: "assignment-one", userId: "pdm-one", roleId: "role-qa",
      reason: "approved", scopeTemplate: "own_department", namedScope: "",
      sponsorUserId: "pdm-two", startsAt: null, reviewDueAt: null, hardEndsAt: null,
      assignedBy: "pdm-two", assignedAt: at, revokedAt: null, revokedBy: null }],
    delegations: [{ id: "delegation-one", delegatedFrom: "pdm-one",
      delegatedTo: "pdm-two", projectCode: "project-one", actionCode: "approve",
      startsAt: at, endsAt: null, reason: "cover", createdBy: "pdm-one",
      createdAt: at, revokedAt: null, revokedBy: null }],
    cutoverAt: at
  };
}

describe("principal ACL migration plan", () => {
  it("materializes only exact roles, preserving scopes, sponsor, delegation and original creation time", () => {
    const plan = planPrincipalAclMigration(source());
    expect(plan.accountAssurance).toEqual([
      { principalId: "principal-one", minimumAssurance: "aal2" },
      { principalId: "principal-two", minimumAssurance: "aal1" }
    ]);
    expect(plan.principalAssignments).toHaveLength(4);
    expect(plan.principalAssignments.filter((row) => row.origin === "legacy_base")
      .map((row) => row.roleId)).toEqual(["role-admin", "role-pdm", "role-rd"]);
    expect(plan.principalAssignments.find((row) => row.sourceAssignmentId === "assignment-one"))
      .toMatchObject({ principalId: "principal-one", roleId: "role-qa",
        scopeTemplate: "own_department", sponsorPrincipalId: "principal-two",
        legacyAssignedByUserId: "pdm-two", assignedAt: at });
    expect(plan.principalDelegations).toEqual([expect.objectContaining({
      fromPrincipalId: "principal-one", toPrincipalId: "principal-two",
      projectCode: "project-one", actionCode: "approve", createdAt: at,
      sourceDelegationId: "delegation-one" })]);
    expect(JSON.stringify(plan)).not.toContain("permissionCode");
    expect(plan.planHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("is independent of input row order and refuses any inferred principal", () => {
    const input = source();
    const baseline = planPrincipalAclMigration(input).planHash;
    expect(planPrincipalAclMigration({ ...input, profiles: [...input.profiles].reverse(),
      roles: [...input.roles].reverse() }).planHash).toBe(baseline);
    expect(() => planPrincipalAclMigration({ ...input,
      externalActiveAccounts: [{ pdmUserId: "pdm-other", principalId: "principal-one" }] }))
      .toThrow("principal_acl_plan_invalid");
    expect(() => planPrincipalAclMigration({ ...input,
      externalActiveAccounts: [{ pdmUserId: "pdm-other", principalId: "pdm:pdm-other" }] }))
      .toThrow("principal_acl_plan_invalid");
  });

  it("blocks active dangling sponsor or delegation and keeps unmappable revoked history in place", () => {
    const external = source();
    external.delegations[0].delegatedTo = "pdm-unresolved";
    expect(() => planPrincipalAclMigration(external))
      .toThrow("principal_acl_plan_reference_unresolved");
    external.delegations[0].revokedAt = at;
    const plan = planPrincipalAclMigration(external);
    expect(plan.principalDelegations).toHaveLength(0);
    expect(plan.historicalDelegationsLeftInPlace).toEqual(["delegation-one"]);
    const sponsored = source();
    sponsored.assignments[0].sponsorUserId = "pdm-unresolved";
    expect(() => planPrincipalAclMigration(sponsored))
      .toThrow("principal_acl_plan_reference_unresolved");
    sponsored.assignments[0].revokedAt = at;
    expect(planPrincipalAclMigration(sponsored).historicalAssignmentsLeftInPlace)
      .toEqual(["assignment-one"]);
  });

  it("resolves external ACL references only from explicit active principal accounts", () => {
    const input = source();
    input.profiles = input.profiles.filter((profile) => profile.pdmUserId !== "pdm-two");
    expect(() => planPrincipalAclMigration(input))
      .toThrow("principal_acl_plan_reference_unresolved");
    input.externalActiveAccounts = [
      { pdmUserId: "pdm-two", principalId: "principal-two" }
    ];
    const plan = planPrincipalAclMigration(input);
    expect(plan.principalAssignments).toHaveLength(3);
    expect(plan.principalDelegations).toHaveLength(1);
    expect(plan.principalAssignments.find((row) => row.sourceAssignmentId === "assignment-one"))
      .toMatchObject({ sponsorPrincipalId: "principal-two" });
  });

  it("does not guess a role or accept an incomplete priority", () => {
    const input = source();
    expect(() => planPrincipalAclMigration({ ...input,
      roles: input.roles.filter((role) => role.roleCode !== "pdm_admin") }))
      .toThrow("principal_acl_plan_role_missing");
    expect(() => planPrincipalAclMigration({ ...input,
      rolePriority: ["system_admin", "pdm_admin", "rd"] }))
      .toThrow("principal_acl_plan_priority_incomplete");
  });

  it("rejects temporal rows that the owner schema cannot preserve", () => {
    const assignment = source();
    assignment.assignments[0].revokedAt = "2026-09-25T07:59:59.000Z";
    expect(() => planPrincipalAclMigration(assignment)).toThrow("principal_acl_plan_invalid");
    const delegation = source();
    delegation.delegations[0].endsAt = at;
    expect(() => planPrincipalAclMigration(delegation)).toThrow("principal_acl_plan_invalid");
  });
});
