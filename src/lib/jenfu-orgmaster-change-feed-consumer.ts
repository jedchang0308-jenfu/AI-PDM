import roleCatalog from '../../config/access-control/jenfu-role-catalog.v1.json'
import {
  getRoleCapabilityChangeFeed,
  getRoleCapabilityWorkspace,
  getRoleCapabilityProjection,
  AiPdmRoleCapabilityRepositoryError
} from '@/lib/repositories/ai-pdm-role-capability-repository'

export type AiPdmRoleCapabilityChangeEvent = {
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
}

export type AiPdmRoleCapabilityChangeFeed = {
  items: AiPdmRoleCapabilityChangeEvent[]
  nextCursor: number | null
  hasMore: boolean
  currentOrganizationRevision: string
}

export type AiPdmRoleCapabilityConsumerResult = {
  cursor: number
  nextCursor: number | null
  hasMore: boolean
  currentOrganizationRevision: string
  processedEventIds: string[]
  invalidatedEventCount: number
  reconciled: boolean
  needsFullReconciliation: boolean
}

export class AiPdmRoleCapabilityChangeFeedConsumerError extends Error {
  constructor(readonly code: 'CHANGE_FEED_INVALID' | 'CHANGE_FEED_GAP' | 'CHANGE_FEED_REVISION_MISMATCH' | 'ROLE_CAPABILITY_RECONCILIATION_FAILED', detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'AiPdmRoleCapabilityChangeFeedConsumerError'
  }
}

type FetchFeed = (after: number, limit: number) => Promise<AiPdmRoleCapabilityChangeFeed>
type Reconcile = (roleIds: string[], expectedOrganizationRevision: string) => Promise<{ organizationRevision: string }>
type Invalidate = (event: AiPdmRoleCapabilityChangeEvent) => Promise<void> | void
type ExpiredCursorRecovery = () => Promise<{ projectionCursor: number; organizationRevision: string }>

const CHANGE_KINDS = new Set<AiPdmRoleCapabilityChangeEvent['changeKinds'][number]>([
  'position',
  'position_assignment',
  'position_role_recommendation',
  'role_assignment'
])

function catalogRoleIds() {
  return (roleCatalog as { roles: Array<{ stableRoleId: string }> }).roles.map((role) => role.stableRoleId)
}

function validateEvent(value: unknown): AiPdmRoleCapabilityChangeEvent {
  if (!value || typeof value !== 'object') throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'event must be an object')
  const event = value as Record<string, unknown>
  if (event.eventType !== 'orgmaster.application_projection.changed.v1' || event.applicationId !== 'ai-pdm') throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'event identity is invalid')
  if (typeof event.eventId !== 'string' || !event.eventId.trim() || !Number.isSafeInteger(event.cursor) || Number(event.cursor) < 1 || typeof event.occurredAt !== 'string' || !Number.isFinite(Date.parse(event.occurredAt))) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'event identity, cursor or timestamp is invalid')
  if (typeof event.organizationVersionId !== 'string' || !event.organizationVersionId.trim() || typeof event.organizationRevision !== 'string' || !event.organizationRevision.trim() || typeof event.auditReference !== 'string' || !event.auditReference.trim()) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'event revision fields are invalid')
  if (!Array.isArray(event.positionIds) || !event.positionIds.every((value) => typeof value === 'string') || !Array.isArray(event.roleIds) || !event.roleIds.every((value) => typeof value === 'string') || !Array.isArray(event.changeKinds) || !event.changeKinds.every((value) => typeof value === 'string' && CHANGE_KINDS.has(value as AiPdmRoleCapabilityChangeEvent['changeKinds'][number]))) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'event arrays are invalid')
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    applicationId: event.applicationId,
    cursor: Number(event.cursor),
    occurredAt: event.occurredAt,
    organizationVersionId: event.organizationVersionId,
    organizationRevision: event.organizationRevision,
    positionIds: [...event.positionIds] as string[],
    changeKinds: [...event.changeKinds] as AiPdmRoleCapabilityChangeEvent['changeKinds'],
    roleIds: [...event.roleIds] as string[],
    auditReference: event.auditReference
  }
}

function validateFeed(value: AiPdmRoleCapabilityChangeFeed): AiPdmRoleCapabilityChangeEvent[] {
  if (!value || !Array.isArray(value.items) || typeof value.hasMore !== 'boolean' || (value.nextCursor !== null && !Number.isSafeInteger(value.nextCursor)) || typeof value.currentOrganizationRevision !== 'string' || !value.currentOrganizationRevision.trim()) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'feed envelope is invalid')
  if (value.hasMore !== (value.nextCursor !== null)) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'hasMore and nextCursor disagree')
  return value.items.map(validateEvent)
}

async function reconcileCatalogRoleProjections(roleIds: string[], expectedOrganizationRevision: string) {
  const projections = await Promise.all(roleIds.map((roleId) => getRoleCapabilityProjection(roleId)))
  if (projections.length === 0 || projections.some((projection) => projection.organizationRevision !== expectedOrganizationRevision)) throw new AiPdmRoleCapabilityChangeFeedConsumerError('ROLE_CAPABILITY_RECONCILIATION_FAILED', 'projection revision does not match change feed')
  const revisions = new Set(projections.map((projection) => projection.organizationRevision))
  if (revisions.size !== 1) throw new AiPdmRoleCapabilityChangeFeedConsumerError('ROLE_CAPABILITY_RECONCILIATION_FAILED', 'projections disagree on organization revision')
  return { organizationRevision: projections[0].organizationRevision }
}

async function recoverExpiredCursor() {
  const workspace = await getRoleCapabilityWorkspace()
  if (!Number.isSafeInteger(workspace.projectionCursor) || workspace.projectionCursor < 0 || typeof workspace.organizationRevision !== 'string' || !workspace.organizationRevision.trim()) throw new AiPdmRoleCapabilityChangeFeedConsumerError('ROLE_CAPABILITY_RECONCILIATION_FAILED', 'current workspace cannot recover an expired cursor')
  return { projectionCursor: workspace.projectionCursor, organizationRevision: workspace.organizationRevision }
}

export async function consumeAiPdmRoleCapabilityChangeFeed(input: {
  after: number
  limit?: number
  knownOrganizationRevision?: string | null
  roleIds?: string[]
  fetchFeed?: FetchFeed
  reconcile?: Reconcile
  invalidate?: Invalidate
  recoverExpired?: ExpiredCursorRecovery
}): Promise<AiPdmRoleCapabilityConsumerResult> {
  if (!Number.isSafeInteger(input.after) || input.after < 0) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'after must be a non-negative integer')
  const limit = Math.max(1, Math.min(100, Number.isSafeInteger(input.limit) ? Number(input.limit) : 100))
  const fetchFeed = input.fetchFeed ?? getRoleCapabilityChangeFeed
  const roleIds = input.roleIds?.length ? [...new Set(input.roleIds)] : catalogRoleIds()
  let feed: AiPdmRoleCapabilityChangeFeed
  try {
    feed = await fetchFeed(input.after, limit)
  } catch (error) {
    if (!(error instanceof AiPdmRoleCapabilityRepositoryError) || error.code !== 'CHANGE_CURSOR_EXPIRED') throw error
    const recovery = await (input.recoverExpired ?? recoverExpiredCursor)()
    const reconcile = input.reconcile ?? reconcileCatalogRoleProjections
    const result = await reconcile(roleIds, recovery.organizationRevision)
    if (result.organizationRevision !== recovery.organizationRevision) throw new AiPdmRoleCapabilityChangeFeedConsumerError('ROLE_CAPABILITY_RECONCILIATION_FAILED', 'expired cursor recovery returned a stale organization revision')
    return {
      cursor: recovery.projectionCursor,
      nextCursor: null,
      hasMore: false,
      currentOrganizationRevision: recovery.organizationRevision,
      processedEventIds: [],
      invalidatedEventCount: 0,
      reconciled: true,
      needsFullReconciliation: true
    }
  }
  const events = validateFeed(feed)
  const uniqueEvents: AiPdmRoleCapabilityChangeEvent[] = []
  const eventById = new Map<string, AiPdmRoleCapabilityChangeEvent>()
  for (const event of events) {
    const previous = eventById.get(event.eventId)
    if (previous) {
      if (previous.cursor !== event.cursor || previous.organizationRevision !== event.organizationRevision) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', `duplicate event ${event.eventId} conflicts`)
      continue
    }
    eventById.set(event.eventId, event)
    uniqueEvents.push(event)
  }

  let needsFullReconciliation = false
  let previousCursor = input.after
  for (const event of uniqueEvents) {
    if (event.cursor !== previousCursor + 1) needsFullReconciliation = true
    previousCursor = event.cursor
  }
  if (feed.hasMore && feed.nextCursor === null) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'paged feed has no next cursor')
  if (!feed.hasMore && feed.nextCursor !== null) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'terminal feed has a next cursor')
  if (feed.nextCursor !== null && feed.nextCursor <= input.after) throw new AiPdmRoleCapabilityChangeFeedConsumerError('CHANGE_FEED_INVALID', 'next cursor did not advance')

  const revisions = new Set(uniqueEvents.map((event) => event.organizationRevision))
  if (revisions.size > 1 || [...revisions][0] !== undefined && [...revisions][0] !== feed.currentOrganizationRevision) needsFullReconciliation = true
  if (input.knownOrganizationRevision && input.knownOrganizationRevision !== feed.currentOrganizationRevision) needsFullReconciliation = true

  if (needsFullReconciliation) {
    const reconcile = input.reconcile ?? reconcileCatalogRoleProjections
    const result = await reconcile(roleIds, feed.currentOrganizationRevision)
    if (result.organizationRevision !== feed.currentOrganizationRevision) throw new AiPdmRoleCapabilityChangeFeedConsumerError('ROLE_CAPABILITY_RECONCILIATION_FAILED', 'reconciliation returned a stale organization revision')
  } else {
    for (const event of uniqueEvents) await input.invalidate?.(event)
  }

  const cursor = feed.hasMore ? feed.nextCursor! : (uniqueEvents.at(-1)?.cursor ?? input.after)
  return {
    cursor,
    nextCursor: feed.nextCursor,
    hasMore: feed.hasMore,
    currentOrganizationRevision: feed.currentOrganizationRevision,
    processedEventIds: uniqueEvents.map((event) => event.eventId),
    invalidatedEventCount: needsFullReconciliation ? 0 : uniqueEvents.length,
    reconciled: needsFullReconciliation,
    needsFullReconciliation
  }
}
