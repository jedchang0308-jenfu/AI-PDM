import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), evaluate: vi.fn() }))
vi.mock('@/lib/jenfu-principal-role-catalog', () => ({ requirePublishedPrincipalCatalog: mocks.catalog }))
vi.mock('@/lib/jenfu-principal-permission-service', () => ({ evaluatePrincipalResourcePermissionsInSnapshot: mocks.evaluate }))
import { authorizeDynamicResourceCapabilityInSnapshot, canonicalCapabilityGroups } from '@/lib/principal-resource-capability'

const client = { kind: 'postgres' } as never
const verified = { profile: { companyId: 'company-a' }, session: { principalId: 'principal-a' } } as never
beforeEach(() => {
  vi.clearAllMocks()
  mocks.catalog.mockResolvedValue({ catalogVersion: 'ai-pdm.role-policy.test' })
  mocks.evaluate.mockImplementation(async (_db, _actor, permissions) => permissions.map((permission: { permissionCode: string }) =>
    ({ allowed: true, permissionCode: permission.permissionCode, principalId: 'principal-a' })))
})

describe('DEV-123 canonical resource capability supplement', () => {
  it('requires each canonical package group and relies on download requiring view too', async () => {
    expect(await authorizeDynamicResourceCapabilityInSnapshot(client, verified,
      ['drawing', 'model', 'drawing'], 'download', { projectCode: 'P1' })).toBeNull()
    expect(mocks.evaluate).toHaveBeenCalledWith(client, verified, [
      { permissionKind: 'action', permissionCode: 'pdm.drawing.download' },
      { permissionKind: 'action', permissionCode: 'pdm.model.download' }
    ], { workspaceCode: 'company-a', projectCode: 'P1' })
  })
  it('rejects when any contained group lacks permission', async () => {
    mocks.evaluate.mockResolvedValue([
      { allowed: true, permissionCode: 'pdm.drawing.download', principalId: 'principal-a' },
      { allowed: false, decisionCode: 'permission_not_granted', permissionCode: 'pdm.model.download', principalId: 'principal-a' }
    ])
    expect((await authorizeDynamicResourceCapabilityInSnapshot(client, verified, ['drawing', 'model'], 'download'))?.status).toBe(403)
  })
  it('rejects incomplete or wrong-principal decisions and unknown canonical types', async () => {
    mocks.evaluate.mockResolvedValue([{ allowed: true, permissionCode: 'pdm.part.view', principalId: 'other' }])
    expect((await authorizeDynamicResourceCapabilityInSnapshot(client, verified, ['part'], 'view'))?.status).toBe(503)
    expect((await authorizeDynamicResourceCapabilityInSnapshot(client, verified, [], 'view'))?.status).toBe(503)
  })
  it('keeps the existing legacy authorization path and fails closed on catalog errors', async () => {
    mocks.catalog.mockResolvedValueOnce({ catalogVersion: 'ai-pdm.role-catalog.2026-10-10.v7' })
    expect(await authorizeDynamicResourceCapabilityInSnapshot(client, verified, [], 'download')).toBeNull()
    expect(mocks.evaluate).not.toHaveBeenCalled()
    mocks.catalog.mockRejectedValueOnce(new Error('unavailable'))
    await expect(authorizeDynamicResourceCapabilityInSnapshot(client, verified, ['part'], 'view')).rejects.toThrow('unavailable')
  })
  it('uses canonical entity and persisted category, never an extension', () => {
    expect(canonicalCapabilityGroups('part_number', 'catalog')).toEqual(['part'])
    expect(canonicalCapabilityGroups('drawing_revision', 'cad_3d')).toEqual(['drawing', 'model'])
    expect(canonicalCapabilityGroups('shared_model')).toEqual(['model'])
    expect(canonicalCapabilityGroups('made-up')).toEqual([])
  })
})
