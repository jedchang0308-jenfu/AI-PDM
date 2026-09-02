import { describe, expect, it, vi } from 'vitest'
import { AiPdmRoleCapabilityRepositoryError } from '@/lib/repositories/ai-pdm-role-capability-repository'
import { consumeAiPdmRoleCapabilityChangeFeed, type AiPdmRoleCapabilityChangeFeed } from '@/lib/jenfu-orgmaster-change-feed-consumer'

function event(cursor: number, revision = 'org-rev-1') {
  return {
    eventId: `event-${cursor}`,
    eventType: 'orgmaster.application_projection.changed.v1' as const,
    applicationId: 'ai-pdm' as const,
    cursor,
    occurredAt: '2026-09-02T00:00:00.000Z',
    organizationVersionId: 'org-version-1',
    organizationRevision: revision,
    positionIds: ['position-1'],
    changeKinds: ['position_assignment' as const],
    roleIds: ['role-rd'],
    auditReference: `audit-${cursor}`
  }
}

function feed(items: AiPdmRoleCapabilityChangeFeed['items'], currentOrganizationRevision = 'org-rev-1'): AiPdmRoleCapabilityChangeFeed {
  return { items, nextCursor: null, hasMore: false, currentOrganizationRevision }
}

const catalogRoleIds = ['role-rd', 'role-rd-manager', 'role-qa', 'role-manufacturing', 'role-production-planning', 'role-procurement', 'role-external-specialist', 'role-pdm-admin', 'role-system-admin']

describe('DEV-005 OrgMaster change-feed consumer', () => {
  it('invalidates each new event and returns the cursor only after processing', async () => {
    const invalidate = vi.fn()
    const result = await consumeAiPdmRoleCapabilityChangeFeed({ after: 0, roleIds: ['role-rd'], fetchFeed: async () => feed([event(1)]), invalidate })
    expect(invalidate).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ cursor: 1, processedEventIds: ['event-1'], invalidatedEventCount: 1, reconciled: false, needsFullReconciliation: false })
  })

  it('deduplicates at-least-once delivery by eventId', async () => {
    const invalidate = vi.fn()
    const result = await consumeAiPdmRoleCapabilityChangeFeed({ after: 0, fetchFeed: async () => feed([event(1), event(1)]), invalidate })
    expect(invalidate).toHaveBeenCalledOnce()
    expect(result.processedEventIds).toEqual(['event-1'])
  })

  it('reconciles all catalog roles when a cursor gap is detected', async () => {
    const reconcile = vi.fn(async () => ({ organizationRevision: 'org-rev-1' }))
    const invalidate = vi.fn()
    const result = await consumeAiPdmRoleCapabilityChangeFeed({ after: 0, fetchFeed: async () => feed([event(3)]), reconcile, invalidate })
    expect(reconcile).toHaveBeenCalledWith(catalogRoleIds, 'org-rev-1')
    expect(invalidate).not.toHaveBeenCalled()
    expect(result).toMatchObject({ cursor: 3, reconciled: true, needsFullReconciliation: true, invalidatedEventCount: 0 })
  })

  it('reconciles when the known organization revision is stale', async () => {
    const reconcile = vi.fn(async () => ({ organizationRevision: 'org-rev-2' }))
    const result = await consumeAiPdmRoleCapabilityChangeFeed({ after: 0, knownOrganizationRevision: 'org-rev-1', fetchFeed: async () => feed([event(1, 'org-rev-2')], 'org-rev-2'), reconcile })
    expect(reconcile).toHaveBeenCalledWith(catalogRoleIds, 'org-rev-2')
    expect(result.reconciled).toBe(true)
  })

  it('recovers an expired cursor from the current workspace before returning a cursor', async () => {
    const reconcile = vi.fn(async () => ({ organizationRevision: 'org-rev-2' }))
    const result = await consumeAiPdmRoleCapabilityChangeFeed({ after: 0, roleIds: ['role-rd'], fetchFeed: async () => { throw new AiPdmRoleCapabilityRepositoryError('CHANGE_CURSOR_EXPIRED') }, recoverExpired: async () => ({ projectionCursor: 7, organizationRevision: 'org-rev-2' }), reconcile })
    expect(reconcile).toHaveBeenCalledWith(['role-rd'], 'org-rev-2')
    expect(result).toMatchObject({ cursor: 7, reconciled: true, needsFullReconciliation: true })
  })
})
