import crypto from 'node:crypto'
import type { RoleCapabilityMutationInput, RoleCapabilityMutationResponse, RoleCapabilityProjection, RoleCapabilityWorkspaceV2 } from '@/lib/ai-pdm-role-capability-contract'

export class AiPdmRoleCapabilityRepositoryError extends Error {
  constructor(readonly code: 'ORGMASTER_UNAVAILABLE' | 'ORGMASTER_CONTRACT_INVALID' | 'ORGMASTER_REVISION_CONFLICT' | 'ORGMASTER_CATALOG_MISMATCH' | 'ORGMASTER_OUTCOME_UNKNOWN' | 'COMMAND_STILL_PROCESSING' | 'COMMAND_NOT_FOUND' | 'REQUEST_HASH_MISMATCH' | 'CHANGE_CURSOR_EXPIRED') {
    super(code)
    this.name = 'AiPdmRoleCapabilityRepositoryError'
  }
}

function orgMasterBaseUrl() {
  return (process.env.ORGMASTER_PUBLIC_BASE_URL?.trim() || 'http://localhost:5000').replace(/\/+$/u, '')
}

function orgMasterHeaders(correlationId: string) {
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' }
  const base = orgMasterBaseUrl()
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/u.test(base)) {
    headers['x-orgmaster-dev-issuer'] = process.env.ORGMASTER_DEV_ISSUER?.trim() || 'urn:orgmaster:dev'
    headers['x-orgmaster-dev-subject'] = process.env.ORGMASTER_DEV_SUBJECT?.trim() || 'local-admin'
  }
  headers['x-correlation-id'] = correlationId
  return headers
}

async function readJson<T>(url: string, init?: RequestInit, outcomeUnknown = false, timeoutMs = 3000, correlationId: string = crypto.randomUUID()) {
  try {
    const response = await fetch(url, { ...init, headers: { ...orgMasterHeaders(correlationId), ...(init?.headers ?? {}) }, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    const body = await response.json().catch(() => ({})) as T & { error?: string }
    if (!response.ok) {
      if (response.status === 410 && body.error === 'CHANGE_CURSOR_EXPIRED') throw new AiPdmRoleCapabilityRepositoryError('CHANGE_CURSOR_EXPIRED')
      if (response.status === 409) {
        if (body.error === 'COMMAND_STILL_PROCESSING') throw new AiPdmRoleCapabilityRepositoryError('COMMAND_STILL_PROCESSING')
        if (body.error === 'REQUEST_HASH_MISMATCH') throw new AiPdmRoleCapabilityRepositoryError('REQUEST_HASH_MISMATCH')
        if (body.error === 'CATALOG_VERSION_CONFLICT' || body.error === 'CATALOG_PAYLOAD_HASH_MISMATCH') throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_CATALOG_MISMATCH')
        throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_REVISION_CONFLICT')
      }
      throw new AiPdmRoleCapabilityRepositoryError(response.status >= 500 ? 'ORGMASTER_UNAVAILABLE' : 'ORGMASTER_CONTRACT_INVALID')
    }
    return body
  } catch (error) {
    if (error instanceof AiPdmRoleCapabilityRepositoryError) throw error
    throw new AiPdmRoleCapabilityRepositoryError(outcomeUnknown ? 'ORGMASTER_OUTCOME_UNKNOWN' : 'ORGMASTER_UNAVAILABLE')
  }
}

export async function getRoleCapabilityWorkspace() {
  return readJson<RoleCapabilityWorkspaceV2>(`${orgMasterBaseUrl()}/api/orgmaster/governance/applications/ai-pdm/role-capabilities`)
}

export async function getRoleCapabilityProjection(stableRoleId: string) {
  return readJson<RoleCapabilityProjection>(`${orgMasterBaseUrl()}/api/orgmaster/governance/applications/ai-pdm/role-capabilities/${encodeURIComponent(stableRoleId)}`)
}

export async function previewRoleCapabilityChange(input: RoleCapabilityMutationInput) {
  const correlationId = crypto.randomUUID()
  await assertMutationPreconditions(input, correlationId)
  const { commandId: _commandId, ...payload } = input
  return readJson<RoleCapabilityMutationResponse>(`${orgMasterBaseUrl()}/api/orgmaster/governance/applications/ai-pdm/role-capabilities/${encodeURIComponent(input.stableRoleId)}/preview`, { method: 'POST', body: JSON.stringify(payload) }, false, 5000, correlationId)
}

export async function publishRoleCapabilityChange(input: Required<Pick<RoleCapabilityMutationInput, 'commandId'>> & RoleCapabilityMutationInput) {
  const correlationId = crypto.randomUUID()
  await assertMutationPreconditions(input, correlationId)
  return readJson<RoleCapabilityMutationResponse>(`${orgMasterBaseUrl()}/api/orgmaster/governance/applications/ai-pdm/role-capabilities/${encodeURIComponent(input.stableRoleId)}/publish`, { method: 'POST', body: JSON.stringify(input) }, true, 8000, correlationId)
}

export async function getRoleCapabilityCommandReceipt(commandId: string) {
  return readJson(`${orgMasterBaseUrl()}/api/orgmaster/governance/applications/ai-pdm/commands/${encodeURIComponent(commandId)}`, undefined, false, 3000)
}

export async function resolveRoleCapabilityCommandUnknown(commandId: string, requestHash: string) {
  return readJson(`${orgMasterBaseUrl()}/api/orgmaster/governance/applications/ai-pdm/commands/${encodeURIComponent(commandId)}/resolve-unknown`, { method: 'POST', body: JSON.stringify({ requestHash, action: 'cancel_if_absent_or_expired' }) }, false, 3000)
}

async function assertMutationPreconditions(input: RoleCapabilityMutationInput, correlationId: string) {
  if (!input.expectedCatalogVersion || !input.expectedCatalogPayloadHash || !input.expectedGovernanceRevision || !input.expectedOrganizationRevision) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_REVISION_CONFLICT')
  const workspace = await readJson<RoleCapabilityWorkspaceV2>(`${orgMasterBaseUrl()}/api/orgmaster/governance/applications/ai-pdm/role-capabilities`, undefined, false, 3000, correlationId)
  const workspaceHash = typeof workspace.catalogPayloadHash === 'string' ? workspace.catalogPayloadHash.toLowerCase() : ''
  const roles = Array.isArray(workspace.roles) ? workspace.roles : []
  if (workspace.applicationId !== 'ai-pdm' || workspace.catalogVersion !== input.expectedCatalogVersion || workspaceHash !== input.expectedCatalogPayloadHash.toLowerCase() || workspace.governanceRevision !== input.expectedGovernanceRevision || workspace.organizationRevision !== input.expectedOrganizationRevision || workspace.projectionCursor !== input.baseProjectionCursor || !roles.some((role) => role.catalogRole.stableRoleId === input.stableRoleId)) throw new AiPdmRoleCapabilityRepositoryError('ORGMASTER_REVISION_CONFLICT')
}

export async function getRoleCapabilityChangeFeed(after: number, limit = 100) {
  return readJson<{
    items: Array<{
      eventId: string
      eventType: 'orgmaster.application_projection.changed.v1'
      applicationId: 'ai-pdm'
      cursor: number
      occurredAt: string
      organizationVersionId: string
      organizationRevision: string
      positionIds: string[]
      changeKinds: Array<'position' | 'position_assignment' | 'position_role_recommendation' | 'role_assignment'>
      roleIds: string[]
      auditReference: string
    }>
    nextCursor: number | null
    hasMore: boolean
    currentOrganizationRevision: string
  }>(`${orgMasterBaseUrl()}/api/orgmaster/governance/applications/ai-pdm/change-feed?after=${Math.max(0, after)}&limit=${Math.max(1, Math.min(100, limit))}`)
}
