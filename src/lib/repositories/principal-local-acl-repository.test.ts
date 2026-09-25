import { describe, expect, it, vi } from "vitest";
import { PrincipalLocalAclRepository } from "@/lib/repositories/principal-local-acl-repository";

function setup(assignments: object[], policies: object[]) {
  const query = vi.fn(async (sql: string, params: Record<string, unknown>) => {
    if (sql.includes("principal_role_assignments")) {
      expect(params.principalId).toBe("principal-a");
      return assignments;
    }
    if (sql.includes("role_permissions")) return policies;
    throw new Error("unexpected query");
  });
  const repository = new PrincipalLocalAclRepository({ kind: "postgres", query } as never);
  const input = { principalId: "principal-a", permissions: [{ permissionKind: "action" as const, permissionCode: "numbering.create" }],
    rolePriority: ["system_admin", "rd_manager", "rd"], decisionAt: new Date("2026-09-24T12:00:00Z"), assuranceLevel: "aal2" as const };
  return { repository, query, input };
}

const assignment = { id: "grant-a", role_id: "role-rd", role_code: "rd", enabled: 1,
  scope_template: "workspace_all", named_scope: "", assigned_at: "2026-09-01T00:00:00Z",
  has_scope_rules: false };

describe("DEV-121 principal local ACL", () => {
  it("permits an explicit policy for an active principal workspace assignment", async () => {
    const { repository, input, query } = setup([{ ...assignment, role_id: "role-qa", role_code: "qa" }], [{ role_id: "role-qa", allowed: 1 }]);
    input.rolePriority = ["system_admin", "qa", "rd"];
    await expect(repository.evaluateWorkspace(input)).resolves.toEqual([
      { allowed: true, decisionCode: "allowed", roleCode: "qa", assignmentId: "grant-a" }
    ]);
    expect(query.mock.calls[0][0]).toContain("a.principal_id = :principalId");
    expect(query.mock.calls[0][0]).not.toContain("users.role");
    expect(query.mock.calls[0][1].decisionAt).toBe("2026-09-24T12:00:00.000Z");
  });

  it("preserves ordinary roles with an explicit workspace permission under AAL1", async () => {
    const { repository, input } = setup([assignment], [{ role_id: "role-rd", allowed: 1 }]);
    await expect(repository.evaluateWorkspace({ ...input, assuranceLevel: "aal1" }))
      .resolves.toEqual([{ allowed: true, decisionCode: "allowed", roleCode: "rd", assignmentId: "grant-a" }]);
    const noPolicy = setup([assignment], []);
    await expect(noPolicy.repository.evaluateWorkspace({ ...noPolicy.input, assuranceLevel: "aal1" }))
      .resolves.toMatchObject([{ allowed: false, decisionCode: "permission_not_granted" }]);
  });

  it("keeps a higher priority explicit deny ahead of an allow", async () => {
    const { repository, input } = setup([
      { ...assignment, role_id: "role-qa", role_code: "qa" },
      { ...assignment, id: "grant-admin", role_id: "role-admin", role_code: "system_admin" }
    ], [{ role_id: "role-qa", allowed: 1 }, { role_id: "role-admin", allowed: 0 }]);
    input.rolePriority = ["system_admin", "qa", "rd"];
    await expect(repository.evaluateWorkspace(input)).resolves.toMatchObject([
      { allowed: false, decisionCode: "permission_explicit_deny" }
    ]);
  });

  it("does not promote resource-scoped roles into workspace-wide access", async () => {
    const { repository, input } = setup([{ ...assignment, scope_template: "own_department" }],
      [{ role_id: "role-rd", allowed: 1 }]);
    await expect(repository.evaluateWorkspace(input)).resolves.toMatchObject([
      { allowed: false, decisionCode: "permission_not_granted" }
    ]);
  });

  it("does not ignore role scope rules or a disabled workspace role", async () => {
    const restricted = setup([{ ...assignment, role_id: "role-qa", role_code: "qa", has_scope_rules: true }],
      [{ role_id: "role-qa", allowed: 1 }]);
    restricted.input.rolePriority = ["system_admin", "qa", "rd"];
    await expect(restricted.repository.evaluateWorkspace(restricted.input)).resolves.toMatchObject([
      { allowed: false, decisionCode: "permission_not_granted" }
    ]);
    const disabled = setup([{ ...assignment, enabled: 0 }], [{ role_id: "role-rd", allowed: 1 }]);
    await expect(disabled.repository.evaluateWorkspace(disabled.input)).resolves.toMatchObject([
      { allowed: false, decisionCode: "permission_not_granted" }
    ]);
  });

  it("requires AAL2 for a privileged principal assignment", async () => {
    const privileged = setup([{ ...assignment, role_id: "role-admin", role_code: "system_admin" }],
      [{ role_id: "role-admin", allowed: 1 }]);
    await expect(privileged.repository.evaluateWorkspace({ ...privileged.input, assuranceLevel: "aal1" }))
      .resolves.toMatchObject([{ allowed: false, decisionCode: "assurance_insufficient" }]);
  });

  it("preserves the existing admin default without bypassing explicit-only actions", async () => {
    const admin = setup([{ ...assignment, role_id: "role-admin", role_code: "system_admin" }], []);
    await expect(admin.repository.evaluateWorkspace(admin.input)).resolves.toMatchObject([
      { allowed: true, decisionCode: "allowed", roleCode: "system_admin" }
    ]);
    await expect(admin.repository.evaluateWorkspace({ ...admin.input,
      permissions: [{ permissionKind: "action", permissionCode: "numbering.publish" }] }))
      .resolves.toMatchObject([{ allowed: false, decisionCode: "permission_not_granted" }]);
  });

  it("uses the same decision time for assignment validity and permission read", async () => {
    const { repository, input, query } = setup([], []);
    await expect(repository.evaluateWorkspace(input)).resolves.toMatchObject([
      { allowed: false, decisionCode: "permission_not_granted" }
    ]);
    expect(query.mock.calls[0][0]).toContain("a.hard_ends_at > :decisionAt");
    expect(query.mock.calls[0][0]).toContain("a.starts_at <= :decisionAt");
    expect(query.mock.calls[0][0]).toContain("a.revoked_at IS NULL");
  });

  it("fails closed on unknown scope or incomplete priority", async () => {
    const unknown = setup([{ ...assignment, scope_template: "unknown" }], []);
    await expect(unknown.repository.evaluateWorkspace(unknown.input)).rejects.toThrow("PRINCIPAL_LOCAL_ACL_CONTRACT_INVALID");
    const incomplete = setup([assignment], []);
    await expect(incomplete.repository.evaluateWorkspace({ ...incomplete.input, rolePriority: ["system_admin"] }))
      .rejects.toThrow("PRINCIPAL_LOCAL_ACL_CONTRACT_INVALID");
  });
});
