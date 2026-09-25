import {
  hashPrincipalSource, orderedPrincipalSourceRows
} from "@/lib/jenfu-principal-source-canonical";

/** Only the owner-curated security fields belong here. Never hash whole user rows or tokens. */
export type PrincipalCutoverLocalSource = {
  inventory: ReadonlyArray<Record<string, unknown>>;
  profiles: ReadonlyArray<Record<string, unknown>>;
  roles: ReadonlyArray<Record<string, unknown>>;
  rolePermissions: ReadonlyArray<Record<string, unknown>>;
  roleScopeRules: ReadonlyArray<Record<string, unknown>>;
  activeCatalog: ReadonlyArray<Record<string, unknown>>;
  priority: { id: string; versionCode: string; order: string[] };
  assignments: ReadonlyArray<Record<string, unknown>>;
  delegations: ReadonlyArray<Record<string, unknown>>;
  memberships: ReadonlyArray<Record<string, unknown>>;
  sessions: ReadonlyArray<Record<string, unknown>>;
  externalActiveAccounts: ReadonlyArray<Record<string, unknown>>;
};

/** Preview hash of local owner state only; not the complete cross-owner cutover source hash. */
export function hashPrincipalCutoverLocalSource(source: PrincipalCutoverLocalSource) {
  if (!source || !source.priority || !Array.isArray(source.priority.order) ||
    source.inventory.length === 0 || source.profiles.length === 0 ||
    source.activeCatalog.length === 0 ||
    !source.priority.id || !source.priority.versionCode) {
    throw new Error("PRINCIPAL_LOCAL_SOURCE_INVALID");
  }
  const normalized = {
    contractVersion: "ai-pdm.principal-cutover-local-source.v1",
    inventory: orderedPrincipalSourceRows(source.inventory),
    profiles: orderedPrincipalSourceRows(source.profiles),
    roles: orderedPrincipalSourceRows(source.roles),
    rolePermissions: orderedPrincipalSourceRows(source.rolePermissions),
    roleScopeRules: orderedPrincipalSourceRows(source.roleScopeRules),
    activeCatalog: orderedPrincipalSourceRows(source.activeCatalog),
    priority: source.priority,
    assignments: orderedPrincipalSourceRows(source.assignments),
    delegations: orderedPrincipalSourceRows(source.delegations),
    memberships: orderedPrincipalSourceRows(source.memberships),
    sessions: orderedPrincipalSourceRows(source.sessions),
    externalActiveAccounts: orderedPrincipalSourceRows(source.externalActiveAccounts)
  };
  return hashPrincipalSource(normalized);
}
