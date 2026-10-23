import { describe, expect, it } from "vitest";
import { decodePublishedPrincipalCatalogRows, decodePublishedRolePolicyCandidateRows } from "@/lib/jenfu-principal-role-catalog";
import { applyRolePolicyDraftChanges, buildDefaultRolePolicyCandidate,
  type RolePolicyCandidate } from "@/lib/role-policy-editor";
import legacyV5 from "../../config/access-control/jenfu-role-catalog.v5.json" with { type: "json" };
import legacyV6 from "../../config/access-control/jenfu-role-catalog.v6.json" with { type: "json" };
import legacyV7 from "../../config/access-control/jenfu-role-catalog.v7.json" with { type: "json" };

type CatalogRow = Record<string, unknown>;
type CatalogPermission = { kind: "page" | "action"; code: string; allowed: boolean };
function isCatalogPermission(value: unknown): value is CatalogPermission {
  if (!value || typeof value !== "object") return false;
  const permission = value as Record<string, unknown>;
  return (permission.kind === "page" || permission.kind === "action") &&
    typeof permission.code === "string" && typeof permission.allowed === "boolean";
}
function catalogPermissions(row: CatalogRow): CatalogPermission[] {
  if (!Array.isArray(row.permissions) || !row.permissions.every(isCatalogPermission)) {
    throw new Error("invalid test catalog permissions");
  }
  return row.permissions;
}
function rows(candidate: RolePolicyCandidate, lifecycle: "active" | "retired" = "active"): CatalogRow[] {
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
    lifecycle
  }));
}

type LegacyRole = {
  stableRoleId: string; roleCode: string; displayName: string; assignable: boolean;
  risk: string; subjectKind: string; recommendationAllowed: boolean; delegationAllowed: boolean;
  allowedScopeKinds: unknown; assignmentTier: string; permissions: unknown;
  metadata?: unknown; roleDefinitionHash: string;
};
type LegacyArtifact = {
  contractVersion: string; applicationId: string; catalogVersion: string; publishedAt: string;
  catalogSha256: string; roles: LegacyRole[];
};
function legacyRows(catalog: LegacyArtifact) {
  return catalog.roles.map((role, displayOrder) => ({
    contract_version: catalog.contractVersion, application_id: catalog.applicationId,
    catalog_version: catalog.catalogVersion, published_at: catalog.publishedAt,
    catalog_sha256: catalog.catalogSha256, display_order: displayOrder,
    stable_role_id: role.stableRoleId, role_code: role.roleCode, display_name: role.displayName,
    assignable: role.assignable, risk: role.risk, subject_kind: role.subjectKind,
    recommendation_allowed: role.recommendationAllowed, delegation_allowed: role.delegationAllowed,
    allowed_scope_kinds: role.allowedScopeKinds, assignment_tier: role.assignmentTier,
    permissions: role.permissions, metadata: role.metadata ?? null,
    role_definition_hash: role.roleDefinitionHash, publication_format: "legacy-static-v1", role_status: "active"
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

  it("retains validated inactive canonical and alias tombstones and rejects hash drift", () => {
    const version = "ai-pdm.role-policy.10000000-0000-4000-8000-000000000010";
    const { candidate } = applyRolePolicyDraftChanges({ candidate: buildDefaultRolePolicyCandidate(version),
      roleChanges: [{ type: "deactivate", stableRoleId: "role-procurement" }], changes: [] });
    const projection = rows(candidate);
    const catalog = decodePublishedPrincipalCatalogRows(projection);
    expect(catalog.roles.filter(role => ["role-production-planning", "role-procurement"].includes(role.stableRoleId))
      .map(role => role.roleStatus)).toEqual(["inactive", "inactive"]);
    expect(() => decodePublishedPrincipalCatalogRows(projection.map((row, index) =>
      index === 0 ? { ...row, role_profile_hash: "0".repeat(64) } : row))).toThrow("principal_dependency_unavailable");
  });

  it("fails closed when any mixed candidate row changes shared metadata or role integrity", () => {
    const candidate = buildDefaultRolePolicyCandidate("ai-pdm.role-policy.10000000-0000-4000-8000-000000000011");
    const mutations: Array<[string, (row: CatalogRow) => CatalogRow]> = [
      ["metadata", row => ({ ...row, metadata: { tampered: true } })],
      ["schema", row => ({ ...row, role_schema_id: "ai-pdm.role-schema.tampered" })],
      ["protected", row => ({ ...row, protected_policy_hash: "0".repeat(64) })],
      ["hash", row => ({ ...row, role_identity_hash: "0".repeat(64) })],
      ["lifecycle", row => ({ ...row, lifecycle: "retired" })]
    ];
    for (const [label, mutate] of mutations) {
      const projection = rows(candidate).map((row, index) => index === 1 ? mutate(row) : row);
      expect(() => decodePublishedRolePolicyCandidateRows(projection), label)
        .toThrow();
    }
  });

  it("accepts a retired candidate only with the explicit historical lifecycle and rejects the runtime path", () => {
    const candidate = buildDefaultRolePolicyCandidate("ai-pdm.role-policy.10000000-0000-4000-8000-000000000012");
    const retired = rows(candidate, "retired");
    expect(decodePublishedRolePolicyCandidateRows(retired, "retired").contentHash).toBe(candidate.contentHash);
    expect(() => decodePublishedRolePolicyCandidateRows(retired)).toThrow("principal_dependency_unavailable");
    expect(() => decodePublishedPrincipalCatalogRows(retired)).toThrow("principal_dependency_unavailable");
  });

  it("rejects unknown and tampered permission entries", () => {
    const candidate = buildDefaultRolePolicyCandidate("ai-pdm.role-policy.10000000-0000-4000-8000-000000000013");
    const projection = rows(candidate);
    const unknown = projection.map((row, index) => index === 0 ? {
      ...row, permissions: [...catalogPermissions(row), { kind: "action" as const, code: "pdm.unknown.future", allowed: true }]
    } : row);
    const tampered = projection.map((row, index) => index === 0 ? {
      ...row, permissions: catalogPermissions(row).map((permission, permissionIndex) =>
        permissionIndex === 0 ? { ...permission, allowed: !permission.allowed } : permission)
    } : row);
    expect(() => decodePublishedRolePolicyCandidateRows(unknown)).toThrow();
    expect(() => decodePublishedRolePolicyCandidateRows(tampered)).toThrow();
  });

  it.each([
    ["v5", legacyV5], ["v6", legacyV6], ["v7", legacyV7]
  ] as const)("reads approved %s exact legacy artifact only with historical=true", (_label, artifact) => {
    expect(decodePublishedPrincipalCatalogRows(legacyRows(artifact), { historical: true })).toEqual(artifact);
  });

  it("keeps the current runtime on DEV121 v7 and rejects the legacy v6 publication", () => {
    expect(() => decodePublishedPrincipalCatalogRows(legacyRows(legacyV6), { historical: false }))
      .toThrow("principal_dependency_unavailable");
  });
});
