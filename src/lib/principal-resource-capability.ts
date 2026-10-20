import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import { jenfuEntitlementFailureResponse } from '@/lib/jenfu-entitlement-http'
import { evaluatePrincipalResourcePermissionsInSnapshot,
  type PrincipalResourceScope } from '@/lib/jenfu-principal-permission-service'
import { requirePublishedPrincipalCatalog } from '@/lib/jenfu-principal-role-catalog'
import type { VerifiedPrincipalRequest } from '@/lib/jenfu-principal-request-guard'

export type PrincipalCapabilityGroup = 'drawing' | 'part' | 'model' | 'transfer'

/** Only a decoded owner publication selects the compatibility path. */
export async function isDynamicRolePolicyInSnapshot(snapshot: AsyncDatabaseClient) {
  // The owner publication contract exists only on the governed PostgreSQL path.
  // Local SQLite callers retain their existing authorization and fixtures.
  if (snapshot.kind !== 'postgres') return false
  return (await requirePublishedPrincipalCatalog(snapshot)).catalogVersion.startsWith('ai-pdm.role-policy.')
}

/** These are canonical DB entity types/categories, never a filename or query group. */
export function canonicalCapabilityGroups(entityType: string, category?: string | null): PrincipalCapabilityGroup[] {
  const group: PrincipalCapabilityGroup | null =
    ['drawing', 'drawing_number', 'drawing_revision', 'drawing_revision_work', 'drawing_revision_package',
      'numbering_candidate_revision', 'candidate_revision'].includes(entityType) ? 'drawing'
      : ['part', 'part_number', 'part_change', 'part_change_work'].includes(entityType) ? 'part'
        : ['shared_model', 'model'].includes(entityType) ? 'model'
          : ['transfer_package', 'technical_transfer'].includes(entityType) ? 'transfer' : null
  if (!group) return []
  return category === 'cad_3d' || category === 'intermediate'
    ? [...new Set<PrincipalCapabilityGroup>([group, 'model'])] : [group]
}

/** Supplement an existing domain/parent guard. Legacy publications keep their
 * existing checks; dynamic publications use the exact current business actions. */
export async function authorizeDynamicResourceCapabilityInSnapshot(snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest, groups: readonly PrincipalCapabilityGroup[],
  action: 'view' | 'download' | 'edit' | 'review' | 'publish', resource: PrincipalResourceScope = {}) {
  if (!await isDynamicRolePolicyInSnapshot(snapshot)) return null
  const unique = [...new Set(groups)]
  if (!unique.length || unique.some(group => !['drawing', 'part', 'model', 'transfer'].includes(group))) {
    return Response.json({ code: 'principal_resource_group_unavailable' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } })
  }
  const permissions = unique.map(group => ({ permissionKind: 'action' as const,
    permissionCode: `pdm.${group}.${action}` }))
  const decisions = await evaluatePrincipalResourcePermissionsInSnapshot(snapshot, verified, permissions,
    { workspaceCode: verified.profile.companyId, ...resource })
  if (decisions.length !== permissions.length || decisions.some((decision, index) =>
    !decision || decision.principalId !== verified.session.principalId ||
    decision.permissionCode !== permissions[index].permissionCode)) {
    return Response.json({ code: 'principal_dependency_unavailable' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } })
  }
  const denial = decisions.find(decision => !decision.allowed)
  return denial ? jenfuEntitlementFailureResponse(denial.decisionCode) : null
}
