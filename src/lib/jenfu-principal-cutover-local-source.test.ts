import { describe, expect, it } from "vitest";
import {
  hashPrincipalCutoverLocalSource, type PrincipalCutoverLocalSource
} from "@/lib/jenfu-principal-cutover-local-source";

function source(): PrincipalCutoverLocalSource {
  return {
    inventory: [{ pdmUserId: "pdm-one", principalId: "principal-one" }],
    profiles: [{ pdmUserId: "pdm-one", role: "Engineer", systemRoleEnabled: true }],
    roles: [{ id: "role-rd", code: "rd" }, { id: "role-qa", code: "qa" }],
    rolePermissions: [{ roleId: "role-rd", permissionCode: "drawing.read", allowed: true }],
    activeCatalog: [{ catalogVersion: "catalog-v3", roleCode: "rd", definitionHash: "hash-one" }],
    roleScopeRules: [], priority: { id: "priority-one", versionCode: "v1", order: ["qa", "rd"] },
    assignments: [{ id: "assignment-one", revokedAt: null }], delegations: [],
    memberships: [{ userId: "pdm-one", companyId: "company-one" }],
    sessions: [{ sessionIdHash: "hash-one", revokedAt: null }],
    externalActiveAccounts: []
  };
}

describe("principal local cutover source hash", () => {
  it("is independent of table row and object key order", () => {
    const input = source();
    expect(hashPrincipalCutoverLocalSource({ ...input,
      roles: [...input.roles].reverse(),
      profiles: [{ systemRoleEnabled: true, role: "Engineer", pdmUserId: "pdm-one" }]
    })).toBe(hashPrincipalCutoverLocalSource(input));
  });

  it("binds permission deny, priority order, session and membership facts", () => {
    const baseline = hashPrincipalCutoverLocalSource(source());
    const permission = source();
    permission.rolePermissions = [{ roleId: "role-rd", permissionCode: "drawing.read", allowed: false }];
    expect(hashPrincipalCutoverLocalSource(permission)).not.toBe(baseline);
    const priority = source();
    priority.priority = { ...priority.priority, order: ["rd", "qa"] };
    expect(hashPrincipalCutoverLocalSource(priority)).not.toBe(baseline);
    const session = source();
    session.sessions = [{ sessionIdHash: "hash-one", revokedAt: "2026-09-25T04:00:00Z" }];
    expect(hashPrincipalCutoverLocalSource(session)).not.toBe(baseline);
    const membership = source();
    membership.memberships = [];
    expect(hashPrincipalCutoverLocalSource(membership)).not.toBe(baseline);
    const catalog = source();
    catalog.activeCatalog = [{ catalogVersion: "catalog-v4", roleCode: "rd", definitionHash: "hash-two" }];
    expect(hashPrincipalCutoverLocalSource(catalog)).not.toBe(baseline);
  });

  it("rejects undefined or non-finite security facts", () => {
    const input = source();
    input.profiles = [{ pdmUserId: "pdm-one", role: undefined }];
    expect(() => hashPrincipalCutoverLocalSource(input)).toThrow("PRINCIPAL_SOURCE_INVALID");
  });
});
