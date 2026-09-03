import { randomUUID } from 'node:crypto'
import roleCatalog from '../../config/access-control/jenfu-role-catalog.v1.json' with { type: 'json' }
import type { RoleCapabilityCatalog, RoleCapabilityPrivilegedCatalogRole, RoleCapabilityWorkspaceV2, RoleCapabilityWorkspaceV3 } from '@/lib/ai-pdm-role-capability-contract'
import { getPrivilegedAssignmentWorkspace, getRoleCapabilityWorkspace, AiPdmRoleCapabilityRepositoryError, type PrivilegedAssignmentWorkspaceSource } from '@/lib/repositories/ai-pdm-role-capability-repository'
import { getRoleCapabilityDisplaySnapshot, saveRoleCapabilityDisplaySnapshot } from '@/lib/repositories/role-capability-display-snapshot-repository'

const catalog = roleCatalog as RoleCapabilityCatalog
const PRIVILEGED_SNAPSHOT_KEY = 'ai-pdm:role-system-admin'
const ORGMASTER_ASSIGNMENTS_PATH = '/?panels=governance&focus=governance&details=none&governanceSection=assignments'

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

function privilegedCatalogRole(): RoleCapabilityPrivilegedCatalogRole {
  const role = catalog.roles.find((candidate) => candidate.stableRoleId === 'role-system-admin')
  if (!role || role.roleCode !== 'system_admin' || role.risk !== 'critical' || role.subjectKind !== 'principal' || role.assignmentTier !== 'cross_app_override' || role.recommendationAllowed || role.delegationAllowed || JSON.stringify(role.allowedScopeKinds) !== '["global"]') throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CATALOG_MISMATCH')
  return {
    stableRoleId: 'role-system-admin', roleCode: 'system_admin', displayName: role.displayName, status: 'active', assignable: true,
    riskLevel: 'critical', subjectKind: 'principal', assignmentTier: 'cross_app_override', recommendationAllowed: false,
    delegationAllowed: false, allowedScopeKinds: ['global'],
  }
}

function managementSurface() {
  const configured = process.env.ORGMASTER_PUBLIC_BASE_URL?.trim()
  const base = configured || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000')
  if (!base) return undefined
  try {
    const url = new URL(base)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (!local && url.protocol !== 'https:') || (local && process.env.NODE_ENV === 'production')) return undefined
    return { label: '前往 OrgMaster 角色指派' as const, href: `${url.origin}${ORGMASTER_ASSIGNMENTS_PATH}` }
  } catch {
    return undefined
  }
}

function isRedactedHint(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 && value.includes('•••') && !/(issuer|subject|token|cookie|fingerprint)/iu.test(value)
}

function validatePrivilegedSource(source: PrivilegedAssignmentWorkspaceSource, base: ReturnType<typeof validateWorkspace>) {
  const role = privilegedCatalogRole()
  if (source.contractVersion !== 'orgmaster.privileged-assignment-workspace.v1' || source.applicationId !== 'ai-pdm' || source.stableRoleId !== 'role-system-admin' || source.catalogVersion !== catalog.catalogVersion || source.catalogPayloadHash.toLowerCase() !== base.catalogPayloadHash.toLowerCase() || source.governanceRevision !== base.governanceRevision || source.organizationVersionId !== base.organizationVersionId || source.organizationRevision !== base.organizationRevision || source.mutationAllowed !== false || !Array.isArray(source.blockers) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(source.sourceDataAt) || !Number.isFinite(Date.parse(source.sourceDataAt))) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CONTRACT_INVALID')
  const incoming = source.role
  if (!incoming) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CONTRACT_INVALID')
  if (incoming.stableRoleId !== role.stableRoleId || incoming.roleCode !== role.roleCode || incoming.status !== role.status || incoming.assignable !== role.assignable || incoming.riskLevel !== role.riskLevel || incoming.subjectKind !== role.subjectKind || incoming.assignmentTier !== role.assignmentTier || incoming.recommendationAllowed !== role.recommendationAllowed || incoming.delegationAllowed !== role.delegationAllowed || JSON.stringify(incoming.allowedScopeKinds) !== JSON.stringify(role.allowedScopeKinds)) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CATALOG_MISMATCH')
  for (const principal of source.eligiblePrincipals) {
    if (!principal.employeeId.trim() || !principal.principalAdmissionId.trim() || principal.accountType !== 'human_privileged' || principal.status !== 'active' || !isRedactedHint(principal.principalHint)) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CONTRACT_INVALID')
  }
  for (const assignment of source.assignments) {
    if (!assignment.assignmentId.trim() || !assignment.employeeId.trim() || !assignment.principalAdmissionId.trim() || !isRedactedHint(assignment.principalHint) || (assignment.status !== 'active' && assignment.status !== 'revoked') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(assignment.validFrom) || (assignment.validTo !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(assignment.validTo)) || !assignment.auditReference.trim()) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CONTRACT_INVALID')
  }
  return { source, role }
}

export function buildManagementSurface() {
  return managementSurface()
}

export function buildPrivilegedRoleCapabilityWorkspace(baseWorkspace: Awaited<ReturnType<typeof getRoleCapabilityWorkspace>>, privilegedSource: PrivilegedAssignmentWorkspaceSource, correlationId = 'test-correlation'): RoleCapabilityWorkspaceV3 {
  const base = validateWorkspace(baseWorkspace)
  const { source, role } = validatePrivilegedSource(privilegedSource, base)
  const activePrincipalIds = new Set(source.assignments.filter((assignment) => assignment.status === 'active').map((assignment) => assignment.principalAdmissionId))
  const privilegedRole = {
    catalogRole: role,
    effectiveHolderCount: activePrincipalIds.size,
    holderCountLabel: `特權身分 ${activePrincipalIds.size} 個`,
    managementKind: 'privileged_principal' as const,
    manualAssignments: source.assignments,
  }
  const surface = managementSurface()
  return {
    contractVersion: 'ai-pdm.role-capability-workspace.v3', applicationId: 'ai-pdm', catalogVersion: base.catalogVersion,
    catalogPayloadHash: base.catalogPayloadHash, governanceRevision: base.governanceRevision, organizationVersionId: base.organizationVersionId,
    organizationRevision: base.organizationRevision, projectionCursor: base.projectionCursor, selectedRoleId: 'role-system-admin',
    roles: [privilegedRole], dataState: 'current', mutationAllowed: false, sourceDataAt: source.sourceDataAt, snapshotStoredAt: null,
    dependency: { status: 'available', decisionCode: 'ORGMASTER_AVAILABLE', correlationId }, ...(surface ? { managementSurface: surface } : {}),
  }
}

function isPrivilegedSnapshotPayload(value: unknown): value is Omit<RoleCapabilityWorkspaceV3, 'managementSurface'> {
  if (!value || typeof value !== 'object') return false
  const workspace = value as Partial<Omit<RoleCapabilityWorkspaceV3, 'managementSurface'>>
  const role = workspace.roles?.[0]
  const assignments = role?.manualAssignments
  const forbiddenKey = (candidate: unknown): boolean => {
    if (!candidate || typeof candidate !== 'object') return false
    if (Array.isArray(candidate)) return candidate.some(forbiddenKey)
    return Object.entries(candidate).some(([key, child]) => /^(?:issuer|subject|token|cookie|fingerprint)$/iu.test(key) || forbiddenKey(child))
  }
  return workspace.contractVersion === 'ai-pdm.role-capability-workspace.v3'
    && workspace.applicationId === 'ai-pdm'
    && workspace.selectedRoleId === 'role-system-admin'
    && workspace.dataState === 'current'
    && workspace.mutationAllowed === false
    && workspace.roles?.length === 1
    && role?.managementKind === 'privileged_principal'
    && role.catalogRole.stableRoleId === 'role-system-admin'
    && role.catalogRole.roleCode === 'system_admin'
    && role.catalogRole.subjectKind === 'principal'
    && role.catalogRole.assignmentTier === 'cross_app_override'
    && role.catalogRole.recommendationAllowed === false
    && role.catalogRole.delegationAllowed === false
    && JSON.stringify(role.catalogRole.allowedScopeKinds) === '["global"]'
    && Array.isArray(assignments)
    && assignments.every((assignment) => isRedactedHint(assignment.principalHint))
    && !forbiddenKey(workspace)
}

function restorePrivilegedSnapshot(snapshot: ReturnType<typeof getRoleCapabilityDisplaySnapshot>, decisionCode: string, correlationId: string): RoleCapabilityWorkspaceV3 | null {
  if (!snapshot || !isPrivilegedSnapshotPayload(snapshot.payload)) return null
  const surface = managementSurface()
  return {
    ...snapshot.payload, dataState: 'stale_snapshot', mutationAllowed: false, snapshotStoredAt: snapshot.snapshotStoredAt,
    dependency: { status: 'unavailable', decisionCode, correlationId }, ...(surface ? { managementSurface: surface } : {}),
  }
}

function unavailablePrivilegedWorkspace(decisionCode: string, correlationId: string): RoleCapabilityWorkspaceV3 {
  const surface = managementSurface()
  const fallbackRole = catalog.roles.find((candidate) => candidate.stableRoleId === 'role-system-admin')
  const roles = fallbackRole ? [{
    catalogRole: {
      stableRoleId: 'role-system-admin' as const, roleCode: 'system_admin' as const, displayName: fallbackRole.displayName, status: 'active' as const, assignable: true as const,
      riskLevel: 'critical' as const, subjectKind: 'principal' as const, assignmentTier: 'cross_app_override' as const, recommendationAllowed: false as const,
      delegationAllowed: false as const, allowedScopeKinds: ['global'] as ['global'],
    }, effectiveHolderCount: 0, holderCountLabel: '特權身分 0 個', managementKind: 'privileged_principal' as const, manualAssignments: [],
  }] : []
  return {
    contractVersion: 'ai-pdm.role-capability-workspace.v3', applicationId: 'ai-pdm', catalogVersion: catalog.catalogVersion,
    catalogPayloadHash: String((roleCatalog as unknown as { catalogSha256?: string }).catalogSha256 ?? '').toLowerCase(), governanceRevision: '',
    organizationVersionId: '', organizationRevision: '', projectionCursor: 0, selectedRoleId: 'role-system-admin', roles,
    dataState: 'unavailable', mutationAllowed: false, sourceDataAt: null, snapshotStoredAt: null,
    dependency: { status: 'unavailable', decisionCode, correlationId }, ...(surface ? { managementSurface: surface } : {}),
  }
}

export async function readPrivilegedRoleCapabilityWorkspace(): Promise<RoleCapabilityWorkspaceV3> {
  const correlationId = randomUUID()
  try {
    const [baseWorkspace, privilegedSource] = await Promise.all([getRoleCapabilityWorkspace(), getPrivilegedAssignmentWorkspace()])
    const current = buildPrivilegedRoleCapabilityWorkspace(baseWorkspace, privilegedSource, correlationId)
    try {
      const stored = saveRoleCapabilityDisplaySnapshot(current)
      return { ...current, snapshotStoredAt: stored?.snapshotStoredAt ?? null }
    } catch {
      const previous = restorePrivilegedSnapshot(getRoleCapabilityDisplaySnapshot(PRIVILEGED_SNAPSHOT_KEY), 'ROLE_CAPABILITY_SNAPSHOT_PERSIST_FAILED', correlationId)
      return previous ?? unavailablePrivilegedWorkspace('ROLE_CAPABILITY_SNAPSHOT_PERSIST_FAILED', correlationId)
    }
  } catch (error) {
    const decisionCode = unavailableCode(error)
    return restorePrivilegedSnapshot(getRoleCapabilityDisplaySnapshot(PRIVILEGED_SNAPSHOT_KEY), decisionCode, correlationId) ?? unavailablePrivilegedWorkspace(decisionCode, correlationId)
  }
}

export async function readRoleCapabilityWorkspace(): Promise<RoleCapabilityWorkspaceV2> {
  const correlationId = randomUUID()
  try {
    const source = validateWorkspace(await getRoleCapabilityWorkspace())
    const current: RoleCapabilityWorkspaceV2 = { ...source, contractVersion: 'ai-pdm.role-capability-workspace.v2', dataState: 'current', mutationAllowed: true, sourceDataAt: source.sourceDataAt, snapshotStoredAt: null, catalogPayloadHash: source.catalogPayloadHash, dependency: { status: 'available', decisionCode: 'CURRENT_SOURCE', correlationId } }
    let stored: ReturnType<typeof saveRoleCapabilityDisplaySnapshot> = null
    try { stored = saveRoleCapabilityDisplaySnapshot(current) } catch {
      const previous = getRoleCapabilityDisplaySnapshot()
      if (previous && previous.catalogVersion === catalog.catalogVersion && previous.payload.contractVersion === 'ai-pdm.role-capability-workspace.v2') {
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
    if (snapshot && snapshot.catalogVersion === catalog.catalogVersion && snapshot.payload.contractVersion === 'ai-pdm.role-capability-workspace.v2' && /^[a-f0-9]{64}$/u.test(snapshot.catalogPayloadHash)) {
      try {
        const validatedSnapshot = validateWorkspace(snapshot.payload)
        return { ...validatedSnapshot, contractVersion: 'ai-pdm.role-capability-workspace.v2', dataState: 'stale_snapshot', mutationAllowed: false, snapshotStoredAt: snapshot.snapshotStoredAt, dependency: { status: 'unavailable', decisionCode: unavailableCode(error), correlationId } }
      } catch { /* do not serve an invalid or catalog-drifted snapshot */ }
    }
    const code = unavailableCode(error)
    return { contractVersion: 'ai-pdm.role-capability-workspace.v2', applicationId: 'ai-pdm', catalogVersion: catalog.catalogVersion, catalogPayloadHash: String((roleCatalog as unknown as { catalogSha256?: string }).catalogSha256 ?? '').toLowerCase(), governanceRevision: '', organizationVersionId: '', organizationRevision: '', projectionCursor: 0, selectedRoleId: null, roles: [], dataState: 'unavailable', mutationAllowed: false, sourceDataAt: null, snapshotStoredAt: null, dependency: { status: 'unavailable', decisionCode: code, correlationId } }
  }
}
