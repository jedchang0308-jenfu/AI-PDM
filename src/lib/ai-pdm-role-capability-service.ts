import { randomUUID } from 'node:crypto'
import roleCatalog from '../../config/access-control/jenfu-role-catalog.v1.json' with { type: 'json' }
import type { RoleCapabilityCatalog, RoleCapabilityWorkspaceV2 } from '@/lib/ai-pdm-role-capability-contract'
import { getRoleCapabilityWorkspace, AiPdmRoleCapabilityRepositoryError } from '@/lib/repositories/ai-pdm-role-capability-repository'
import { getRoleCapabilityDisplaySnapshot, saveRoleCapabilityDisplaySnapshot } from '@/lib/repositories/role-capability-display-snapshot-repository'

const catalog = roleCatalog as RoleCapabilityCatalog

function unavailableCode(error: unknown) {
  if (error instanceof AiPdmRoleCapabilityRepositoryError) return error.code
  return 'ORGMASTER_UNAVAILABLE'
}

function validateWorkspace(workspace: Awaited<ReturnType<typeof getRoleCapabilityWorkspace>>) {
  const expectedCatalogPayloadHash = String((roleCatalog as unknown as { catalogSha256?: string }).catalogSha256 ?? '').toLowerCase()
  if (workspace.contractVersion !== 'ai-pdm.role-capability-workspace.v2' || workspace.applicationId !== 'ai-pdm' || workspace.catalogVersion !== catalog.catalogVersion || workspace.catalogPayloadHash.toLowerCase() !== expectedCatalogPayloadHash || !/^[a-f0-9]{64}$/u.test(workspace.catalogPayloadHash) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(String(workspace.sourceDataAt ?? '')) || !Number.isFinite(Date.parse(String(workspace.sourceDataAt)))) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CATALOG_MISMATCH')
  if (!Array.isArray(workspace.roles) || workspace.roles.length !== catalog.roles.length) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CONTRACT_INVALID')
  const incomingRoleIds = workspace.roles.map((role) => role.catalogRole.stableRoleId)
  if (JSON.stringify(incomingRoleIds) !== JSON.stringify(catalog.roles.map((role) => role.stableRoleId))) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CATALOG_MISMATCH')
  const roles = catalog.roles.map((catalogRole) => {
    const sourceRole = workspace.roles.find((role) => role.catalogRole.stableRoleId === catalogRole.stableRoleId)
    if (!sourceRole) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CATALOG_MISMATCH')
    const comparable = (role: any) => ({ stableRoleId: role.stableRoleId, roleCode: role.roleCode ?? role.code, displayName: role.displayName, assignable: role.assignable, risk: role.risk ?? role.riskLevel, subjectKind: role.subjectKind, recommendationAllowed: role.recommendationAllowed, delegationAllowed: role.delegationAllowed, allowedScopeKinds: role.allowedScopeKinds, assignmentTier: role.assignmentTier, metadata: role.metadata ?? null, roleDefinitionHash: role.roleDefinitionHash, permissions: Array.isArray(role.permissions) ? [...role.permissions].sort((a, b) => `${a.code}:${a.kind}:${a.allowed}`.localeCompare(`${b.code}:${b.kind}:${b.allowed}`)) : [] })
    if (JSON.stringify(comparable(sourceRole.catalogRole)) !== JSON.stringify(comparable(catalogRole))) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CATALOG_MISMATCH')
    if (sourceRole.projection.contractVersion !== 'orgmaster.role-capability-projection.v1' || sourceRole.projection.applicationId !== 'ai-pdm' || sourceRole.projection.stableRoleId !== catalogRole.stableRoleId || sourceRole.projection.governanceRevision !== workspace.governanceRevision || sourceRole.projection.organizationVersionId !== workspace.organizationVersionId || sourceRole.projection.organizationRevision !== workspace.organizationRevision || sourceRole.projection.changeCursor !== workspace.projectionCursor) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CONTRACT_INVALID')
    return { catalogRole, projection: sourceRole.projection, effectiveHolderCount: sourceRole.effectiveHolderCount }
  })
  return { ...workspace, roles }
}

export async function readRoleCapabilityWorkspace(): Promise<RoleCapabilityWorkspaceV2> {
  const correlationId = randomUUID()
  try {
    const source = validateWorkspace(await getRoleCapabilityWorkspace())
    const current: RoleCapabilityWorkspaceV2 = { ...source, contractVersion: 'ai-pdm.role-capability-workspace.v2', dataState: 'current', mutationAllowed: true, sourceDataAt: source.sourceDataAt, snapshotStoredAt: null, catalogPayloadHash: source.catalogPayloadHash, dependency: { status: 'available', decisionCode: 'CURRENT_SOURCE', correlationId } }
    let stored: ReturnType<typeof saveRoleCapabilityDisplaySnapshot> = null
    try { stored = saveRoleCapabilityDisplaySnapshot(current) } catch {
      const previous = getRoleCapabilityDisplaySnapshot()
      if (previous && previous.catalogVersion === catalog.catalogVersion) {
        try {
          const validatedPrevious = validateWorkspace(previous.payload)
          return { ...validatedPrevious, contractVersion: 'ai-pdm.role-capability-workspace.v2', dataState: 'stale_snapshot', mutationAllowed: false, snapshotStoredAt: previous.snapshotStoredAt, dependency: { status: 'unavailable', decisionCode: 'ROLE_CAPABILITY_SNAPSHOT_PERSIST_FAILED', correlationId } }
        } catch { /* discard a snapshot that no longer matches the catalog contract */ }
      }
      return { ...current, roles: [], dataState: 'unavailable', mutationAllowed: false, sourceDataAt: null, snapshotStoredAt: null, dependency: { status: 'unavailable', decisionCode: 'ROLE_CAPABILITY_SNAPSHOT_PERSIST_FAILED', correlationId } }
    }
    return { ...current, snapshotStoredAt: stored?.snapshotStoredAt ?? null }
  } catch (error) {
    const snapshot = getRoleCapabilityDisplaySnapshot()
    if (snapshot && snapshot.catalogVersion === catalog.catalogVersion && /^[a-f0-9]{64}$/u.test(snapshot.catalogPayloadHash)) {
      try {
        const validatedSnapshot = validateWorkspace(snapshot.payload)
        return { ...validatedSnapshot, contractVersion: 'ai-pdm.role-capability-workspace.v2', dataState: 'stale_snapshot', mutationAllowed: false, snapshotStoredAt: snapshot.snapshotStoredAt, dependency: { status: 'unavailable', decisionCode: unavailableCode(error), correlationId } }
      } catch { /* do not serve an invalid or catalog-drifted snapshot */ }
    }
    const code = unavailableCode(error)
    return { contractVersion: 'ai-pdm.role-capability-workspace.v2', applicationId: 'ai-pdm', catalogVersion: catalog.catalogVersion, catalogPayloadHash: String((roleCatalog as unknown as { catalogSha256?: string }).catalogSha256 ?? '').toLowerCase(), governanceRevision: '', organizationVersionId: '', organizationRevision: '', projectionCursor: 0, selectedRoleId: null, roles: [], dataState: 'unavailable', mutationAllowed: false, sourceDataAt: null, snapshotStoredAt: null, dependency: { status: 'unavailable', decisionCode: code, correlationId } }
  }
}
