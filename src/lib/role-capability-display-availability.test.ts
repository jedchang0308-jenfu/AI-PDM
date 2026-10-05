import { beforeEach, describe, expect, it, vi } from 'vitest'
import catalog from '../../config/access-control/jenfu-role-catalog.v6.json'
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), privileged: vi.fn(), get: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/repositories/ai-pdm-role-capability-repository', () => ({
  getRoleCapabilityWorkspace: mocks.workspace, getPrivilegedAssignmentWorkspace: mocks.privileged,
  AiPdmRoleCapabilityRepositoryError: class extends Error { constructor(readonly code: string) { super(code) } }
}))
vi.mock('@/lib/repositories/role-capability-display-snapshot-repository', () => ({
  getRoleCapabilityDisplaySnapshot: mocks.get, saveRoleCapabilityDisplaySnapshot: mocks.save
}))
import { readRoleCapabilityWorkspace, readPrivilegedRoleCapabilityWorkspace } from './ai-pdm-role-capability-service'
function workspace() {
  return { contractVersion: 'ai-pdm.role-capability-workspace.v2', applicationId: 'ai-pdm',
    catalogVersion: catalog.catalogVersion, catalogPayloadHash: catalog.catalogSha256,
    governanceRevision: 'gov', organizationVersionId: 'org', organizationRevision: 'rev', projectionCursor: 1,
    dataState: 'current', mutationAllowed: false, sourceDataAt: '2026-10-05T00:00:00.000Z', selectedRoleId: null,
    roles: catalog.roles.map(catalogRole => ({ catalogRole, effectiveHolderCount: 0, projection: {
      contractVersion: 'orgmaster.role-capability-projection.v1', applicationId: 'ai-pdm',
      stableRoleId: catalogRole.stableRoleId, governanceRevision: 'gov', organizationVersionId: 'org',
      organizationRevision: 'rev', changeCursor: 1 } })) }
}
function snapshot() { return { catalogVersion: catalog.catalogVersion, catalogPayloadHash: catalog.catalogSha256,
  payload: workspace(), snapshotStoredAt: '2026-10-05T01:00:00.000Z' } }
describe('role display source and asynchronous cache failures', () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.workspace.mockResolvedValue(workspace()); mocks.get.mockResolvedValue(null)
    mocks.save.mockResolvedValue({ snapshotStoredAt: '2026-10-05T01:00:00.000Z' })
  })
  it('keeps validated live data current when cache persistence fails, without reading stale data', async () => {
    mocks.save.mockRejectedValue(new Error('raw database credential detail'))
    const result = await readRoleCapabilityWorkspace()
    expect(result).toMatchObject({ dataState: 'current', mutationAllowed: false, snapshotStoredAt: null,
      dependency: { status: 'available', decisionCode: 'ROLE_CAPABILITY_SNAPSHOT_PERSIST_FAILED' } })
    expect(result.roles).toHaveLength(9); expect(mocks.get).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('credential')
  })
  it('returns only catalog-matched readonly stale display after source failure', async () => {
    mocks.workspace.mockRejectedValue(new Error('timeout')); mocks.get.mockResolvedValue(snapshot())
    expect(await readRoleCapabilityWorkspace()).toMatchObject({ dataState: 'stale_snapshot', mutationAllowed: false })
  })
  it('contains both source and cache read failure as typed unavailable', async () => {
    mocks.workspace.mockRejectedValue(new Error('upstream raw')); mocks.get.mockRejectedValue(new Error('cache raw'))
    const result = await readRoleCapabilityWorkspace()
    expect(result).toMatchObject({ dataState: 'unavailable', roles: [], mutationAllowed: false,
      dependency: { decisionCode: 'ORGMASTER_UNAVAILABLE' } })
    expect(JSON.stringify(result)).not.toContain('raw')
    expect(await readPrivilegedRoleCapabilityWorkspace()).toMatchObject({ dataState: 'unavailable', mutationAllowed: false })
  })
  it('discards stale cache from v5, a wrong hash, or inconsistent role metadata', async () => {
    mocks.workspace.mockRejectedValue(new Error('offline'))
    for (const changed of [{ ...snapshot(), catalogVersion: 'ai-pdm.role-catalog.2026-09-28.v5' },
      { ...snapshot(), catalogPayloadHash: '0'.repeat(64) },
      { ...snapshot(), payload: { ...workspace(), roles: [] } }]) {
      mocks.get.mockResolvedValue(changed)
      expect((await readRoleCapabilityWorkspace()).dataState).toBe('unavailable')
    }
  })
})
