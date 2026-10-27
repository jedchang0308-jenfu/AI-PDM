import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ dynamic: vi.fn(), authorize: vi.fn(), parse: vi.fn(), job: vi.fn() }))
vi.mock('@/lib/principal-resource-capability', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/principal-resource-capability')>(),
  isDynamicRolePolicyInSnapshot: mocks.dynamic, authorizeDynamicResourceCapabilityInSnapshot: mocks.authorize
}))
vi.mock('@/lib/principal-job-authority', () => ({ parsePrincipalJobInitiator: mocks.parse,
  requireCurrentPrincipalJobAuthority: mocks.job }))
import { requireRecognitionImpactCapabilities, requireRecognitionJobAuthority,
  requireRecognitionSourceCapabilities } from '@/lib/principal-recognition-capability'
const verified = { profile: { companyId: 'company-one' } } as never
const session = { id: 'session-one', company_id: 'company-one', created_by: 'profile-one',
  initiator_principal_id: 'principal-one', initiator_authority_json: {} }
beforeEach(() => {
  vi.clearAllMocks(); mocks.dynamic.mockResolvedValue(true); mocks.authorize.mockResolvedValue(null)
  mocks.parse.mockReturnValue({ principalId: 'principal-one', pdmUserId: 'profile-one', companyId: 'company-one' })
  mocks.job.mockResolvedValue(undefined)
})
it('requires both actual drawing and part edit for mixed adoption targets', async () => {
  const changes = [{ targetType: 'drawing_revision' }, { targetType: 'part_number' }] as never
  await requireRecognitionImpactCapabilities({} as never, verified, changes)
  expect(mocks.authorize).toHaveBeenCalledWith({}, verified, ['drawing', 'part'], 'edit')
  mocks.authorize.mockResolvedValue(Response.json({}, { status: 403 }))
  await expect(requireRecognitionImpactCapabilities({} as never, verified, changes)).rejects.toMatchObject({ status: 403 })
})
it('rejects unclassified adoption targets instead of treating them as drawing', async () => {
  await expect(requireRecognitionImpactCapabilities({} as never, verified, [{ targetType: 'unknown' }] as never))
    .rejects.toMatchObject({ code: 'RECOGNITION_TARGET_SCOPE_INVALID', status: 503 })
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it('requires download for actual browser original sources with CAD model group', async () => {
  const db = { query: vi.fn(async (_sql: string) => [{ linked_entity_type: 'drawing_revision', source_role: 'cad_3d' }]) }
  await requireRecognitionSourceCapabilities(db as never, verified, 'session-one', 'download', 'source-one')
  expect(mocks.authorize).toHaveBeenCalledWith(db, verified, ['drawing', 'drawing', 'model'], 'download')
  expect(db.query.mock.calls[0][0]).toContain('source.company_id=session.company_id')
})
it('rejects legacy missing or mismatched durable initiators without deriving current epoch', async () => {
  mocks.parse.mockReturnValueOnce(null).mockReturnValueOnce({ principalId: 'other', pdmUserId: 'profile-one', companyId: 'company-one' })
  for (let i = 0; i < 2; i++) await expect(requireRecognitionJobAuthority({} as never, session))
    .rejects.toMatchObject({ code: 'RECOGNITION_INITIATOR_RETRY_REQUIRED', status: 403 })
  expect(mocks.job).not.toHaveBeenCalled()
})
it('re-admits the captured initiator with DB canonical drawing/model source before worker use', async () => {
  const db = { query: vi.fn(async () => [{ linked_entity_type: 'shared_model', source_role: 'cad_3d', document_category: 'other' }]) }
  await requireRecognitionJobAuthority(db as never, session)
  expect(mocks.job).toHaveBeenCalledWith(db, expect.objectContaining({ principalId: 'principal-one' }),
    { linkedEntityType: 'shared_model', documentCategory: 'cad_3d', action: 'view_and_download' })
  expect(mocks.job).toHaveBeenCalledWith(db, expect.objectContaining({ principalId: 'principal-one' }),
    { linkedEntityType: 'drawing_revision', action: 'view_and_download' })
  mocks.job.mockRejectedValue({ status: 403 })
  await expect(requireRecognitionJobAuthority(db as never, session)).rejects.toMatchObject({ status: 403 })
})
it('rejects unknown actual asset types before admitting a recognition worker', async () => {
  const db = { query: vi.fn(async () => [{ linked_entity_type: 'unknown', source_role: 'pdf' }]) }
  await expect(requireRecognitionJobAuthority(db as never, session)).rejects.toMatchObject({ status: 503 })
  expect(mocks.job).not.toHaveBeenCalled()
})
it('preserves the legacy publication path without changing its job or target behavior', async () => {
  mocks.dynamic.mockResolvedValue(false)
  await requireRecognitionJobAuthority({} as never, session)
  await requireRecognitionImpactCapabilities({} as never, verified, [{ targetType: 'unknown' }] as never)
  expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.authorize).not.toHaveBeenCalled()
})
