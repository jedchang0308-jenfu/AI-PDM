import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { JenfuApplicationRole } from "@/lib/jenfu-entitlement-contract";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { baselineRoleIdentityHash, protectedPolicyHash, rebuildRolePolicyCandidate,
  ROLE_POLICY_CANONICALIZATION, ROLE_POLICY_PUBLICATION_FORMAT, rolePolicyRegistry,
  rolePolicyRegistryHash, type RolePolicyProfile, type RolePolicyRole } from "@/lib/role-policy-editor";
import type { JenfuEntitlementRoleCatalog } from "@/lib/repositories/jenfu-entitlement-repository";
import principalRoleCatalog from "../../config/access-control/jenfu-role-catalog.v7.json" with { type: "json" };

export const principalCatalog = principalRoleCatalog as JenfuEntitlementRoleCatalog & {
  contractVersion: string; applicationId: string; catalogVersion: string; catalogSha256: string;
};

type CatalogRow = Record<string, unknown>;
export type PublishedPrincipalCatalog = JenfuEntitlementRoleCatalog & {
  contractVersion: string; applicationId: string; catalogVersion: string; catalogSha256: string;
};

const catalogColumns = `contract_version,application_id,catalog_version,published_at,catalog_sha256,
  display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,
  recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,
  metadata,role_definition_hash,publication_format,canonicalization_version,role_schema_id,
  activation_generation,baseline_role_identity_hash,role_identity_hash,protected_policy_hash,
  registry_hash,role_profile_schema_id,role_profile_hash,role_status,permission_role_id,
  presentation_name,presentation_order,assignment_disposition,lifecycle`;

function invalid(): never { throw new JenfuPrincipalRequestError("principal_dependency_unavailable"); }
function json<T>(value: unknown): T {
  if (typeof value === "string") {
    try { return JSON.parse(value) as T; } catch { invalid(); }
  }
  return value as T;
}
function same(value: unknown, expected: unknown) { return JSON.stringify(value) === JSON.stringify(expected); }
function legacyCatalog(rows: CatalogRow[]): PublishedPrincipalCatalog {
  if (rows.length !== principalCatalog.roles.length || rows.some((row, index) =>
      row.contract_version !== principalCatalog.contractVersion || row.application_id !== principalCatalog.applicationId ||
      row.catalog_version !== principalCatalog.catalogVersion || row.catalog_sha256 !== principalCatalog.catalogSha256 ||
      Number(row.display_order) !== index || row.stable_role_id !== principalCatalog.roles[index].stableRoleId ||
      row.role_definition_hash !== principalCatalog.roles[index].roleDefinitionHash || row.role_status !== "active")) invalid();
  return principalCatalog;
}

export function decodePublishedPrincipalCatalogRows(rows: CatalogRow[]): PublishedPrincipalCatalog {
  if (rows.length < 1 || rows.length > rolePolicyRegistry.limits.maxRoles) invalid();
  const first = rows[0];
  if (first.publication_format !== ROLE_POLICY_PUBLICATION_FORMAT) return legacyCatalog(rows);
  const metadataFields = ["contract_version", "application_id", "catalog_version", "catalog_sha256",
    "publication_format", "canonicalization_version", "role_schema_id", "activation_generation",
    "baseline_role_identity_hash", "role_identity_hash", "protected_policy_hash", "registry_hash",
    "role_profile_schema_id", "role_profile_hash", "lifecycle"];
  if (first.contract_version !== "jenfu.platform-entitlement.v1" || first.application_id !== "ai-pdm" ||
      first.canonicalization_version !== ROLE_POLICY_CANONICALIZATION ||
      first.role_schema_id !== rolePolicyRegistry.roleSchemaId ||
      first.role_profile_schema_id !== rolePolicyRegistry.roleProfileSchemaId ||
      first.registry_hash !== rolePolicyRegistryHash || first.baseline_role_identity_hash !== baselineRoleIdentityHash ||
      first.protected_policy_hash !== protectedPolicyHash || first.lifecycle !== "active" ||
      typeof first.catalog_version !== "string" || !/^ai-pdm\.role-policy\.[a-f0-9-]{36}$/u.test(first.catalog_version) ||
      !/^[a-f0-9]{64}$/u.test(String(first.catalog_sha256)) ||
      !/^(0|[1-9][0-9]*)$/u.test(String(first.activation_generation))) invalid();
  const roles = rows.map((row, index): RolePolicyRole => {
    if (Number(row.display_order) !== index || metadataFields.some(field => !same(row[field], first[field]))) invalid();
    return {
      stableRoleId: String(row.stable_role_id), roleCode: String(row.role_code), displayName: String(row.display_name),
      assignable: row.assignable === true, risk: row.risk as RolePolicyRole["risk"],
      subjectKind: row.subject_kind as RolePolicyRole["subjectKind"],
      recommendationAllowed: row.recommendation_allowed === true, delegationAllowed: row.delegation_allowed === true,
      allowedScopeKinds: json<string[]>(row.allowed_scope_kinds), assignmentTier: row.assignment_tier as RolePolicyRole["assignmentTier"],
      permissions: json<RolePolicyRole["permissions"]>(row.permissions),
      metadata: row.metadata == null ? null : json<Record<string, unknown>>(row.metadata),
      roleStatus: row.role_status as RolePolicyRole["roleStatus"], roleDefinitionHash: String(row.role_definition_hash)
    };
  });
  const roleProfiles = rows.map((row): RolePolicyProfile => ({
    stableRoleId: String(row.stable_role_id), permissionRoleId: String(row.permission_role_id),
    presentationName: String(row.presentation_name), presentationOrder: Number(row.presentation_order),
    assignmentDisposition: row.assignment_disposition as RolePolicyProfile["assignmentDisposition"]
  }));
  const rebuilt = rebuildRolePolicyCandidate({ roles, roleProfiles, candidateCatalogVersion: first.catalog_version });
  if (rebuilt.contentHash !== first.catalog_sha256 || rebuilt.roleIdentityHash !== first.role_identity_hash ||
      rebuilt.roleProfileHash !== first.role_profile_hash || roles.some((role, index) =>
        role.roleDefinitionHash !== rebuilt.roles[index].roleDefinitionHash)) invalid();
  const roleById = new Map(rebuilt.roles.map(role => [role.stableRoleId, role]));
  const expectedBuiltinProfiles = new Map(rolePolicyRegistry.roleProfiles.map(profile => [profile.stableRoleId, profile]));
  const effectiveRoles: JenfuApplicationRole[] = [];
  const profileIds = new Set<string>();
  for (const profile of rebuilt.roleProfiles) {
    const identityRole = roleById.get(profile.stableRoleId);
    const permissionRole = roleById.get(profile.permissionRoleId);
    if (!identityRole || !permissionRole || profileIds.has(profile.stableRoleId)) invalid();
    profileIds.add(profile.stableRoleId);
    const expected = expectedBuiltinProfiles.get(profile.stableRoleId);
    if (expected) {
      if (!same(profile, expected)) invalid();
    } else if (!profile.stableRoleId.startsWith("role-custom-") || profile.permissionRoleId !== profile.stableRoleId ||
        profile.presentationName !== identityRole.displayName || profile.assignmentDisposition !== "selectable") invalid();
    if (identityRole.roleStatus === "inactive" || permissionRole.roleStatus === "inactive") continue;
    effectiveRoles.push({
      stableRoleId: identityRole.stableRoleId, roleCode: identityRole.roleCode, displayName: identityRole.displayName,
      assignable: identityRole.assignable, risk: identityRole.risk, subjectKind: identityRole.subjectKind,
      recommendationAllowed: identityRole.recommendationAllowed, delegationAllowed: identityRole.delegationAllowed,
      allowedScopeKinds: identityRole.allowedScopeKinds as JenfuApplicationRole["allowedScopeKinds"],
      assignmentTier: identityRole.assignmentTier, permissions: permissionRole.permissions,
      metadata: (identityRole.metadata ?? undefined) as JenfuApplicationRole["metadata"],
      roleDefinitionHash: identityRole.roleDefinitionHash
    });
  }
  if (profileIds.size !== rebuilt.roles.length || rebuilt.roles[4]?.roleStatus !== rebuilt.roles[5]?.roleStatus) invalid();
  return { contractVersion: "jenfu.platform-entitlement.v1", applicationId: "ai-pdm",
    catalogVersion: first.catalog_version, catalogSha256: String(first.catalog_sha256), roles: effectiveRoles };
}

/** Read and verify the current owner publication in the caller's authorization snapshot. */
export async function requirePublishedPrincipalCatalog(snapshot: AsyncDatabaseClient): Promise<PublishedPrincipalCatalog> {
  try {
    const rows = await snapshot.query<CatalogRow>(`SELECT ${catalogColumns}
      FROM ai_pdm_contract.v_application_role_catalog_v2 ORDER BY display_order`);
    return decodePublishedPrincipalCatalogRows(rows);
  } catch (error) {
    if (error instanceof JenfuPrincipalRequestError) throw error;
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
}
