import { describe, expect, it } from "vitest";
import { planPrincipalAclMigration, type PrincipalAclMigrationInput } from
  "@/lib/jenfu-principal-acl-migration-plan";
import { assertPrincipalAclGraphPreserved } from
  "@/lib/jenfu-principal-cutover-graph-check";

const at = "2026-09-25T08:00:00.000Z";
function source(): PrincipalAclMigrationInput {
  return {
    profiles: [{ pdmUserId: "pdm-one", principalId: "principal-one",
      legacyRole: "Admin", accountType: "human_personal", systemRoleEnabled: true }],
    externalActiveAccounts: [{ pdmUserId: "pdm-two", principalId: "principal-two" }],
    roles: [
      { id: "role-admin", roleCode: "system_admin", enabled: true },
      { id: "role-pdm", roleCode: "pdm_admin", enabled: true },
      { id: "role-qa", roleCode: "qa", enabled: true }
    ],
    rolePriority: ["system_admin", "pdm_admin", "qa"],
    assignments: [{ id: "assignment-one", userId: "pdm-one", roleId: "role-qa",
      reason: "approved", scopeTemplate: "own_department", namedScope: "",
      sponsorUserId: "pdm-two", startsAt: null, reviewDueAt: null, hardEndsAt: null,
      assignedBy: "pdm-one", assignedAt: at, revokedAt: null, revokedBy: null }],
    delegations: [{ id: "delegation-one", delegatedFrom: "pdm-one",
      delegatedTo: "pdm-two", projectCode: "project-one", actionCode: "approve",
      startsAt: at, endsAt: null, reason: "cover", createdBy: "pdm-one",
      createdAt: at, revokedAt: null, revokedBy: null }],
    cutoverAt: at
  };
}

describe("principal cutover active ACL graph", () => {
  it("verifies exact active base, scoped role and delegation edges", () => {
    const input = source();
    const plan = planPrincipalAclMigration(input);
    expect(assertPrincipalAclGraphPreserved(input, plan)).toMatchObject({
      graphHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      activeAssignments: 1, activeDelegations: 1
    });
    const reordered = { ...input, roles: [...input.roles].reverse() };
    expect(assertPrincipalAclGraphPreserved(reordered, plan).graphHash)
      .toBe(assertPrincipalAclGraphPreserved(input, plan).graphHash);
  });

  it("rejects invented base access, wider scope and lost delegation", () => {
    const input = source();
    const plan = planPrincipalAclMigration(input);
    const first = plan.principalAssignments[0];
    expect(() => assertPrincipalAclGraphPreserved(input, {
      ...plan, principalAssignments: [
        { ...first, roleId: "role-qa" }, ...plan.principalAssignments.slice(1)
      ]
    })).toThrow("PRINCIPAL_CUTOVER_GRAPH_MISMATCH");
    expect(() => assertPrincipalAclGraphPreserved(input, {
      ...plan, principalAssignments: plan.principalAssignments.map((row) =>
        row.sourceAssignmentId === "assignment-one"
          ? { ...row, scopeTemplate: "workspace_all" } : row)
    })).toThrow("PRINCIPAL_CUTOVER_GRAPH_MISMATCH");
    expect(() => assertPrincipalAclGraphPreserved(input, {
      ...plan, principalDelegations: []
    })).toThrow("PRINCIPAL_CUTOVER_GRAPH_MISMATCH");
  });

  it("rejects lowering the migrated minimum assurance", () => {
    const input = source();
    const plan = planPrincipalAclMigration(input);
    expect(() => assertPrincipalAclGraphPreserved(input, {
      ...plan, accountAssurance: [{ principalId: "principal-one", minimumAssurance: "aal1" }]
    })).toThrow("PRINCIPAL_CUTOVER_GRAPH_MISMATCH");
  });
});
