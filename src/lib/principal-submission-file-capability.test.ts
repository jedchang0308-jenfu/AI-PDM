import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ dynamic: vi.fn(), authorize: vi.fn() }))
vi.mock('@/lib/principal-resource-capability', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/principal-resource-capability')>(),
  isDynamicRolePolicyInSnapshot: mocks.dynamic,
  authorizeDynamicResourceCapabilityInSnapshot: mocks.authorize
}))
import { authorizeSubmissionOriginalsInSnapshot, submissionFileCapabilityGroups,
  type SubmissionFileCapabilitySource } from '@/lib/principal-submission-file-capability'
const verified = { profile: { companyId: 'company-one' } } as never
const row = (overrides = {}): SubmissionFileCapabilitySource => ({ id: 'file-one', file_role: 'pdf', sha256: 'hash',
  source_entity_type: 'drawing_number', linked_entity_type: 'drawing_number', document_category: 'drawing_2d', ...overrides })
const snapshot = (rows = [row()]) => ({ query: vi.fn(async (_sql: string) => rows),
  queryOne: vi.fn(async (_sql: string) => ({ project_code: 'P-ONE' })) })
beforeEach(() => { vi.clearAllMocks(); mocks.dynamic.mockResolvedValue(true); mocks.authorize.mockResolvedValue(null) })
it('resolves the actual parent/member groups and persisted legacy roles without filename inference', () => {
  expect(submissionFileCapabilityGroups(row({ source_entity_type: 'part_number', document_category: 'cad_3d' })))
    .toEqual(['part', 'drawing', 'model'])
  expect(submissionFileCapabilityGroups(row({ source_entity_type: null, linked_entity_type: null, file_role: 'sldasm' })))
    .toEqual(['model'])
  expect(submissionFileCapabilityGroups(row({ source_entity_type: 'other' }))).toEqual([])
  expect(submissionFileCapabilityGroups(row({ source_entity_type: '' }))).toEqual([])
  expect(submissionFileCapabilityGroups(row({ linked_entity_type: '' }))).toEqual([])
  expect(submissionFileCapabilityGroups(row({ linked_entity_type: null, file_role: 'other' }))).toEqual([])
})
it('uses each actual group download with the server project scope for mixed packages', async () => {
  const db = snapshot([row(), row({ id: 'file-two', linked_entity_type: 'part_number', document_category: 'cad_3d' })])
  expect(await authorizeSubmissionOriginalsInSnapshot(db as never, verified, 'submission-one')).toBeNull()
  expect(mocks.authorize).toHaveBeenCalledWith(db, verified, ['drawing', 'part', 'model'], 'download', { projectCode: 'P-ONE' })
  expect(db.query.mock.calls[0][0]).toContain('s.company_id=:companyId')
})
it('rejects a single missing file or any unclassified member before capability evaluation', async () => {
  for (const rows of [[], [row({ id: 'file-other' })], [row({ linked_entity_type: null, file_role: 'other' })]]) {
    const result = await authorizeSubmissionOriginalsInSnapshot(snapshot(rows) as never, verified, 'submission-one', 'file-one')
    expect(result?.status).toBe(503)
  }
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it('binds ZIP authorization to exact immutable manifest member IDs, roles and hashes', async () => {
  const db = snapshot()
  const manifest = { schema: 'ai-pdm-release-package.v1', submission: { id: 'submission-one' },
    files: [{ id: 'file-one', sha256: 'hash', file_role: 'pdf' }] }
  expect(await authorizeSubmissionOriginalsInSnapshot(db as never, verified, 'submission-one', undefined, JSON.stringify(manifest))).toBeNull()
  manifest.files[0].sha256 = 'changed'
  expect((await authorizeSubmissionOriginalsInSnapshot(db as never, verified, 'submission-one', undefined, JSON.stringify(manifest)))?.status).toBe(503)
  expect((await authorizeSubmissionOriginalsInSnapshot(db as never, verified, 'submission-one', undefined, 'null'))?.status).toBe(503)
})
it.each(['json-text', 'postgres-jsonb'])('validates a complete immutable manifest from %s before authorizing bytes', async representation => {
  const manifest = { schema: 'ai-pdm-release-package.v1', submission: { id: 'submission-one' },
    files: [{ id: 'file-one', sha256: 'hash', file_role: 'pdf' }] }
  const input = representation === 'json-text' ? JSON.stringify(manifest) : manifest
  const db = snapshot()
  expect(await authorizeSubmissionOriginalsInSnapshot(db as never, verified, 'submission-one', undefined, input)).toBeNull()
  expect(mocks.authorize).toHaveBeenCalledWith(db, verified, ['drawing'], 'download', { projectCode: 'P-ONE' })
})
it.each([
  null, [], false, 42, 'not-json',
  { schema: 'other', submission: { id: 'submission-one' }, files: [] },
  { schema: 'ai-pdm-release-package.v1', submission: { id: 'other' }, files: [{ id: 'file-one', sha256: 'hash', file_role: 'pdf' }] },
  { schema: 'ai-pdm-release-package.v1', submission: { id: 'submission-one' }, files: [{ id: 'file-one', sha256: 'changed', file_role: 'pdf' }] },
  { schema: 'ai-pdm-release-package.v1', submission: { id: 'submission-one' }, files: [{ id: 'file-one', sha256: 'hash', file_role: 'sldasm' }] },
  { schema: 'ai-pdm-release-package.v1', submission: { id: 'submission-one' }, files: [{ id: 'other', sha256: 'hash', file_role: 'pdf' }] },
  { schema: 'ai-pdm-release-package.v1', submission: { id: 'submission-one' }, files: [null] }
])('rejects malformed or mismatched decoded manifests without capability evaluation: %j', async manifest => {
  const response = await authorizeSubmissionOriginalsInSnapshot(snapshot() as never, verified, 'submission-one', undefined, manifest)
  expect(response?.status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it('preserves decoded legacy publication behavior without new member queries', async () => {
  mocks.dynamic.mockResolvedValue(false)
  const db = snapshot()
  expect(await authorizeSubmissionOriginalsInSnapshot(db as never, verified, 'submission-one')).toBeNull()
  expect(db.query).not.toHaveBeenCalled()
})
