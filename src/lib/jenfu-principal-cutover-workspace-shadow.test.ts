import { describe, expect, it } from "vitest";
import { planPrincipalAclMigration, type PrincipalAclMigrationInput } from
  "@/lib/jenfu-principal-acl-migration-plan";
import { assessPrincipalCutoverWorkspaceShadow } from
  "@/lib/jenfu-principal-cutover-workspace-shadow";

const cutoverAt = "2026-09-25T04:00:00.000Z";
function source(): PrincipalAclMigrationInput {
  return {
    profiles: [{ pdmUserId: "pdm-one", principalId: "principal-one",
      legacyRole: "Engineer", accountType: "human_personal", systemRoleEnabled: true }],
    externalActiveAccounts: [],
    roles: [{ id: "role-rd", roleCode: "rd", enabled: true },
      { id: "role-qa", roleCode: "qa", enabled: true }],
    rolePriority: ["qa", "rd"], assignments: [], delegations: [], cutoverAt
  };
}
function assess(input = source(), options: {
  rolePermissions?: Array<{ role_id: string; permission_kind: string;
    permission_code: string; allowed: number }>;
  roleScopeRules?: Array<{ role_id: string }>;
} = {}) {
  return assessPrincipalCutoverWorkspaceShadow({
    source: input, plan: planPrincipalAclMigration(input),
    accounts: [{ pdmUserId: "pdm-one", accountStatus: "active", systemRoleEnabled: true }],
    rolePermissions: options.rolePermissions ?? [{ role_id: "role-rd",
      permission_kind: "action", permission_code: "drawing.read", allowed: 1 }],
    roleScopeRules: options.roleScopeRules ?? []
  });
}

describe("DEV-121 workspace behavior shadow", () => {
  it("proves a simple principal base role preserves explicit allow and deny", () => {
    const result = assess();
    expect(result.status).toBe("pass");
    expect(result.decisionCount).toBeGreaterThan(1);
    expect(result.gaps).toEqual([]);
    expect(result.mismatches).toEqual([]);
    expect(result.shadowHash).toMatch(/^[0-9a-f]{64}$/u);
    const denied = assess(source(), { rolePermissions: [{ role_id: "role-rd",
      permission_kind: "action", permission_code: "drawing.read", allowed: 0 }] });
    expect(denied.status).toBe("pass");
    expect(denied.shadowHash).not.toBe(result.shadowHash);
  });

  it("exposes a scoped legacy assignment as an adapter gap, not parity", () => {
    const input = source();
    input.assignments = [{ id: "assignment-qa", userId: "pdm-one", roleId: "role-qa",
      reason: "review", scopeTemplate: "own_department", namedScope: "",
      sponsorUserId: null, startsAt: null, reviewDueAt: null, hardEndsAt: null,
      assignedBy: "pdm-one", assignedAt: "2026-09-24 12:00:00+00",
      revokedAt: null, revokedBy: null }];
    const result = assess(input, { rolePermissions: [{ role_id: "role-qa",
      permission_kind: "action", permission_code: "drawing.read", allowed: 1 }] });
    expect(result.status).toBe("requires_resource_adapter");
    expect(result.gaps).toContainEqual({ pdmUserId: "pdm-one",
      reason: "resource_scoped_assignment", sourceId: "assignment-qa" });
    expect(result.mismatches).toContainEqual({ pdmUserId: "pdm-one",
      permission: "action\0drawing.read", legacy: "qa:allow", principal: "none:deny" });
  });

  it("compares effective access when different roles produce the same decision", () => {
    const input = source();
    const plan = planPrincipalAclMigration(input);
    plan.principalAssignments[0].roleId = "role-qa";
    const policies = ["role-rd", "role-qa"].map((role_id) => ({
      role_id, permission_kind: "action", permission_code: "drawing.read", allowed: 1
    }));
    const result = assessPrincipalCutoverWorkspaceShadow({
      source: input, plan,
      accounts: [{ pdmUserId: "pdm-one", accountStatus: "active", systemRoleEnabled: true }],
      rolePermissions: policies, roleScopeRules: []
    });
    expect(result.status).toBe("pass");
    expect(result.mismatches).toEqual([]);

    policies[1].allowed = 0;
    const denied = assessPrincipalCutoverWorkspaceShadow({
      source: input, plan,
      accounts: [{ pdmUserId: "pdm-one", accountStatus: "active", systemRoleEnabled: true }],
      rolePermissions: policies, roleScopeRules: []
    });
    expect(denied.status).toBe("mismatch");
    expect(denied.mismatches).toContainEqual({ pdmUserId: "pdm-one",
      permission: "action\0drawing.read", legacy: "rd:allow", principal: "qa:deny" });
  });

  it("exposes active delegation and role scope rules", () => {
    const input = source();
    input.externalActiveAccounts = [{ pdmUserId: "pdm-two", principalId: "principal-two" }];
    input.delegations = [{ id: "delegation-one", delegatedFrom: "pdm-one",
      delegatedTo: "pdm-two", projectCode: "project-one", actionCode: null,
      startsAt: null, endsAt: null, reason: "cover", createdBy: "pdm-one",
      createdAt: cutoverAt, revokedAt: null, revokedBy: null }];
    const result = assess(input, { roleScopeRules: [{ role_id: "role-rd" }] });
    expect(result.status).toBe("requires_resource_adapter");
    expect(result.gaps.map((row) => row.reason)).toEqual([
      "role_scope_rule", "active_delegation"
    ]);
  });

  it("rejects duplicate policy facts rather than selecting one", () => {
    const permission = { role_id: "role-rd", permission_kind: "action",
      permission_code: "drawing.read", allowed: 1 };
    expect(() => assess(source(), { rolePermissions: [permission, permission] }))
      .toThrow("PRINCIPAL_WORKSPACE_SHADOW_INVALID");
  });

  it("keeps the sealed shadow independent of host locale collation", () => {
    const input = source();
    input.profiles.push({ pdmUserId: "pdm-Z", principalId: "principal-Z",
      legacyRole: "Engineer", accountType: "human_personal", systemRoleEnabled: true });
    input.assignments.push({ id: "assignment-Z", userId: "pdm-Z", roleId: "role-qa",
      reason: "review", scopeTemplate: "own_department", namedScope: "",
      sponsorUserId: null, startsAt: null, reviewDueAt: null, hardEndsAt: null,
      assignedBy: "pdm-one", assignedAt: "2026-09-24 12:00:00+00",
      revokedAt: null, revokedBy: null });
    input.delegations.push({ id: "delegation-Z", delegatedFrom: "pdm-one",
      delegatedTo: "pdm-Z", projectCode: "project-one", actionCode: null,
      startsAt: null, endsAt: null, reason: "cover", createdBy: "pdm-one",
      createdAt: cutoverAt, revokedAt: null, revokedBy: null });
    const args = { source: input, plan: planPrincipalAclMigration(input),
      accounts: input.profiles.map((profile) => ({ pdmUserId: profile.pdmUserId,
        accountStatus: "active", systemRoleEnabled: true })),
      rolePermissions: [{ role_id: "role-qa", permission_kind: "action",
        permission_code: "drawing.read", allowed: 1 }],
      roleScopeRules: [{ role_id: "role-rd" }] };
    const baseline = assessPrincipalCutoverWorkspaceShadow(args);
    const original = String.prototype.localeCompare;
    let independent;
    try {
      String.prototype.localeCompare = () => { throw new Error("HOST_LOCALE_USED"); };
      independent = assessPrincipalCutoverWorkspaceShadow(args);
    } finally {
      String.prototype.localeCompare = original;
    }
    expect(independent).toEqual(baseline);
    expect(independent.status).toBe("requires_resource_adapter");
  });
});
