import { randomUUID } from 'node:crypto'
import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import type { RoleCapabilityPublishedWorkspaceV4 } from '@/lib/ai-pdm-role-capability-contract'
import { requirePublishedPrincipalCatalog } from '@/lib/jenfu-principal-role-catalog'
import { JenfuPrincipalRequestError } from '@/lib/jenfu-principal-request-guard'
import { resolveJenfuWorkspaceScopeKey } from '@/lib/jenfu-entitlement-contract'
import { buildManagementSurface } from '@/lib/ai-pdm-role-capability-service'
import { principalPermissionSnapshotsEnabled } from '@/lib/principal-session-permission-snapshot'

type HolderRow = {
  contract_version: string; stable_role_id: string; role_code: string; holder_count: string | number
}

/** Display only. The caller supplies the verified Principal/company authorization snapshot. */
export async function readPublishedRoleCapabilityWorkspace(
  snapshot: AsyncDatabaseClient, companyId: string, selectedRoleId: string | null = null
): Promise<RoleCapabilityPublishedWorkspaceV4 | null> {
  if (snapshot.kind !== 'postgres' || snapshot.transactionScope !== 'postgres' || !companyId?.trim()) {
    throw new JenfuPrincipalRequestError('principal_dependency_unavailable')
  }
  const catalog = await requirePublishedPrincipalCatalog(snapshot)
  if (selectedRoleId && !catalog.roles.some(role => role.stableRoleId === selectedRoleId)) return null
  const times = await snapshot.query<{ source_data_at: string | Date }>(
    'SELECT transaction_timestamp() AS source_data_at')
  const sourceDataAt = times.length === 1 ? new Date(times[0].source_data_at).toISOString() : null
  if (!sourceDataAt) throw new JenfuPrincipalRequestError('principal_dependency_unavailable')
  const workspaceScopeKeys = ['current', companyId].filter(key =>
    resolveJenfuWorkspaceScopeKey(companyId, key, companyId) === companyId)
  const projected = principalPermissionSnapshotsEnabled()
  if (projected && !await snapshot.queryOne('SELECT initial_source_version FROM ai_pdm_core.reviewer_authority_state')) {
    throw new JenfuPrincipalRequestError('principal_dependency_unavailable')
  }
  const rows = await snapshot.query<HolderRow>(projected ?
    `SELECT 'jenfu.orgmaster.ai-pdm-principal-grants.v6' AS contract_version,
            grant_row.value->>'stable_role_id' AS stable_role_id,grant_row.value->>'role_code' AS role_code,
            COUNT(DISTINCT profile.principal_id)::integer AS holder_count
     FROM ai_pdm_core.principal_accounts profile
     JOIN ai_pdm_core.reviewer_authority authority USING(principal_id)
     JOIN ai_pdm_core.reviewer_authority_intervals period USING(principal_id)
     CROSS JOIN LATERAL jsonb_array_elements(period.grants) grant_row(value)
     WHERE profile.company_id=:companyId AND profile.account_status='active' AND profile.system_role_enabled
       AND authority.pending_operation_id IS NULL AND period.valid_from<=transaction_timestamp()
       AND (period.valid_until IS NULL OR period.valid_until>transaction_timestamp())
       AND profile.employee_id=grant_row.value->>'employee_id'
       AND grant_row.value->>'stable_role_id'<>'role-application-system-admin'
       AND ((grant_row.value->>'scope_kind'='global' AND grant_row.value->>'scope_key' IS NULL)
         OR (grant_row.value->>'scope_kind'='workspace' AND grant_row.value->>'scope_key'=ANY(:workspaceScopeKeys::text[])))
     GROUP BY 2,3 ORDER BY 2` :
    `SELECT grants.contract_version, grants.stable_role_id, grants.role_code,
            COUNT(DISTINCT grants.principal_id)::integer AS holder_count
     FROM orgmaster_contract.read_ai_pdm_principal_effective_grants_v6() grants
     JOIN ai_pdm_core.principal_accounts profile
       ON profile.principal_id=grants.principal_id AND profile.employee_id=grants.employee_id
      AND profile.company_id=:companyId AND profile.account_status='active'
      AND profile.system_role_enabled
     WHERE grants.application_id='ai-pdm'
       AND grants.stable_role_id <> 'role-application-system-admin'
       AND grants.valid_from <= transaction_timestamp()
       AND (grants.valid_until IS NULL OR grants.valid_until > transaction_timestamp())
       AND ((grants.scope_kind='global' AND grants.scope_key IS NULL)
         OR (grants.scope_kind='workspace' AND grants.scope_key=ANY(:workspaceScopeKeys::text[])))
     GROUP BY grants.contract_version, grants.stable_role_id, grants.role_code
     ORDER BY grants.stable_role_id`, { companyId, workspaceScopeKeys })
  const counts = new Map<string, number>()
  for (const row of rows) {
    const role = catalog.roles.find(value => value.stableRoleId === row.stable_role_id)
    const count = Number(row.holder_count)
    if (row.contract_version !== 'jenfu.orgmaster.ai-pdm-principal-grants.v6' ||
        !role || role.roleCode !== row.role_code || counts.has(row.stable_role_id) ||
        !Number.isSafeInteger(count) || count < 1) {
      throw new JenfuPrincipalRequestError('principal_dependency_unavailable')
    }
    counts.set(row.stable_role_id, count)
  }
  const managementSurface = buildManagementSurface()
  return {
    contractVersion: 'ai-pdm.role-capability-workspace.v4',
    applicationId: 'ai-pdm', catalogVersion: catalog.catalogVersion,
    catalogPayloadHash: catalog.catalogSha256, selectedRoleId,
    companyId, holderScope: 'current_company_workspace',
    roles: catalog.roles.map(catalogRole => ({
      catalogRole, effectiveWorkspaceHolderCount: counts.get(catalogRole.stableRoleId) ?? 0,
    })),
    dataState: 'current', mutationAllowed: false, sourceDataAt,
    dependency: { status: 'available', decisionCode: 'PUBLISHED_CONTRACT_AVAILABLE', correlationId: randomUUID() },
    ...(managementSurface ? { managementSurface } : {}),
  }
}
