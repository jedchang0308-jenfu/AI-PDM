import { describe, expect, it } from "vitest";
import { decodePublishedPrincipalCatalogRows } from "@/lib/jenfu-principal-role-catalog";
import { applyRolePolicyDraftChanges, buildDefaultRolePolicyCandidate,
  type RolePolicyCandidate } from "@/lib/role-policy-editor";

function rows(candidate: RolePolicyCandidate) {
  return candidate.roles.map((role, displayOrder) => ({
    contract_version: "jenfu.platform-entitlement.v1", application_id: "ai-pdm",
    catalog_version: candidate.candidateCatalogVersion, published_at: "2026-10-20T00:00:00.000Z",
    catalog_sha256: candidate.contentHash, display_order: displayOrder,
    stable_role_id: role.stableRoleId, role_code: role.roleCode, display_name: role.displayName,
    assignable: role.assignable, risk: role.risk, subject_kind: role.subjectKind,
    recommendation_allowed: role.recommendationAllowed, delegation_allowed: role.delegationAllowed,
    allowed_scope_kinds: role.allowedScopeKinds, assignment_tier: role.assignmentTier,
    permissions: role.permissions, metadata: role.metadata, role_definition_hash: role.roleDefinitionHash,
    publication_format: candidate.format, canonicalization_version: "jenfu.canonical-json.v1",
    role_schema_id: candidate.roleSchemaId, activation_generation: "1",
    baseline_role_identity_hash: candidate.baselineRoleIdentityHash,
    role_identity_hash: candidate.roleIdentityHash, protected_policy_hash: candidate.protectedPolicyHash,
    registry_hash: candidate.registryHash, role_profile_schema_id: candidate.roleProfileSchemaId,
    role_profile_hash: candidate.roleProfileHash, role_status: role.roleStatus,
    permission_role_id: candidate.roleProfiles[displayOrder].permissionRoleId,
    presentation_name: candidate.roleProfiles[displayOrder].presentationName,
    presentation_order: candidate.roleProfiles[displayOrder].presentationOrder,
    assignment_disposition: candidate.roleProfiles[displayOrder].assignmentDisposition,
    lifecycle: "active"
  }));
}

describe("DEV-123 dynamic principal catalog reader", () => {
  it("uses the canonical permission role for the legacy planning identity and admits active custom roles", () => {
    const version = "ai-pdm.role-policy.10000000-0000-4000-8000-000000000009";
    const { candidate } = applyRolePolicyDraftChanges({
      candidate: buildDefaultRolePolicyCandidate(version),
      roleChanges: [{ type: "create", clientRoleId: "client-supply", displayName: "供應協作" }],
      changes: [{ roleRef: { clientRoleId: "client-supply" }, groupId: "drawing", actionId: "view", enabled: true }],
      uuid: () => "30000000-0000-4000-8000-000000000009"
    });
    const catalog = decodePublishedPrincipalCatalogRows(rows(candidate));
    const planning = catalog.roles.find(role => role.stableRoleId === "role-production-planning")!;
    const procurement = catalog.roles.find(role => role.stableRoleId === "role-procurement")!;
    expect(planning.roleCode).toBe("production_planning");
    expect(planning.permissions).toEqual(procurement.permissions);
    expect(catalog.roles.find(role => role.displayName === "供應協作")?.permissions)
      .toContainEqual({ kind: "action", code: "pdm.drawing.view", allowed: true });
  });

  it("removes inactive canonical and alias identities from authorization and rejects hash drift", () => {
    const version = "ai-pdm.role-policy.10000000-0000-4000-8000-000000000010";
    const { candidate } = applyRolePolicyDraftChanges({ candidate: buildDefaultRolePolicyCandidate(version),
      roleChanges: [{ type: "deactivate", stableRoleId: "role-procurement" }], changes: [] });
    const projection = rows(candidate);
    const catalog = decodePublishedPrincipalCatalogRows(projection);
    expect(catalog.roles.some(role => ["role-production-planning", "role-procurement"].includes(role.stableRoleId))).toBe(false);
    expect(() => decodePublishedPrincipalCatalogRows(projection.map((row, index) =>
      index === 0 ? { ...row, role_profile_hash: "0".repeat(64) } : row))).toThrow("principal_dependency_unavailable");
  });
});
