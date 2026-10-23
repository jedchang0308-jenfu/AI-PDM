import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), integrity: vi.fn(), access: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/drawing-preview-asset', () => ({ resolveDrawingPreviewAsync: mocks.resolve }))
vi.mock('@/lib/file-storage', () => ({
  storagePointerFromRecord: (record: { storage_key: string }) => ({ key: record.storage_key, provider: 'local_repository' }),
  createFileStorageServiceForPointer: () => ({ readObject: mocks.read, createDownloadUrl: mocks.access }),
  assertStoredFileIntegrity: mocks.integrity
}))
vi.mock('@/lib/storage-access-audit', () => ({ auditStorageAccess: mocks.audit,
  resolveStorageAccessAuditProvenance: () => ({ source: 'runtime' }) }))

import { deliverPrincipalSharePreview, resolvePrincipalSharePreviewInSnapshot } from '@/lib/principal-share-preview'

const sourceHash = 'a'.repeat(64)
const source = { id: 'asset-one', content_hash: sourceHash }
const file = { id: 'file-one', sha256: sourceHash, file_role: 'pdf' }
const authorized = { share: { id: 'share-one' }, submission: { id: 'submission-one', files: [file],
  release_package: { id: 'package-one', sha256: 'b'.repeat(64), manifest_json: {
    schema: 'ai-pdm-release-package.v1', submission: { id: 'submission-one' }, files: [{ ...file }] } } },
  externalProjectContext: { originalAssignmentId: 'assignment-one', projectScopeKey: 'P1' } }
const verified = { session: { principalId: 'principal-one' },
  profile: { pdmUserId: 'profile-one', companyId: 'company-one' } } as never
const preview = { record: { id: 'derivative-one', storage_key: 'safe.png', content_hash: 'c'.repeat(64) },
  fileName: 'safe.png', mimeType: 'image/png' }
const snapshot = { queryOne: vi.fn() }
const request = new Request('https://pdm.test/api/public/shares/token?previewFileId=file-one')

describe('share-scoped safe preview delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    snapshot.queryOne.mockResolvedValue(source)
    mocks.resolve.mockResolvedValue(preview)
    mocks.read.mockResolvedValue(Buffer.from('safe preview'))
    mocks.access.mockResolvedValue({ provider: 'local_repository', mode: 'server_stream', url: null })
  })
  const select = () => resolvePrincipalSharePreviewInSnapshot(snapshot as never, verified, authorized as never, 'file-one')

  it('resolves only the exact delivered file source and a derivative, including original PDF sources', async () => {
    expect(await select()).toMatchObject({ fileId: 'file-one', sourceId: 'asset-one', externalAssignmentId: 'assignment-one', preview })
    expect(snapshot.queryOne.mock.calls[0][0]).toContain('a.content_hash=f.sha256')
    expect(snapshot.queryOne.mock.calls[0][1]).toEqual({ companyId: 'company-one', submissionId: 'submission-one', fileId: 'file-one', sourceHash })
    expect(mocks.resolve).toHaveBeenCalledWith(snapshot, source, { requireDerivative: true })
  })

  it('rejects unshared members or a changed manifest before source lookup', async () => {
    expect((await resolvePrincipalSharePreviewInSnapshot(snapshot as never, verified, authorized as never, 'not-delivered') as Response).status).toBe(404)
    const changed = structuredClone(authorized)
    changed.submission.files[0].sha256 = 'd'.repeat(64)
    expect((await resolvePrincipalSharePreviewInSnapshot(snapshot as never, verified, changed as never, 'file-one') as Response).status).toBe(404)
    expect(snapshot.queryOne).not.toHaveBeenCalled()
  })

  it.each([null, { ...preview, record: source }, { ...preview, mimeType: 'text/html' }])(
    'never falls back to original or active-content bytes: %j', async value => {
      mocks.resolve.mockResolvedValue(value)
      expect((await select() as Response).status).toBe(404)
      expect(mocks.read).not.toHaveBeenCalled()
    })

  it('streams only integrity-checked derivative bytes and records share/Principal provenance', async () => {
    const response = await deliverPrincipalSharePreview(request, select)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('safe preview')
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(snapshot.queryOne).toHaveBeenCalledTimes(2)
    expect(mocks.integrity).toHaveBeenCalledWith(Buffer.from('safe preview'), preview.record)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ principalId: 'principal-one', shareId: 'share-one',
      externalAccess: true, resourceContext: { context: 'public_share', contextId: 'share-one', bindingId: 'file-one', derivativeId: 'derivative-one' } }))
  })

  it('normalizes safe derivative MIME parameters without allowing active content', async () => {
    mocks.resolve.mockResolvedValue({ ...preview, mimeType: ' IMAGE/PNG; charset=binary ' })
    const response = await deliverPrincipalSharePreview(request, select)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/)
  })

  it('rechecks after storage IO and emits neither bytes nor audit on revocation', async () => {
    const selected = await select()
    const readAuthorized = vi.fn().mockResolvedValueOnce(selected).mockResolvedValueOnce(Response.json({ code: 'permission_not_granted' }, { status: 403 }))
    const response = await deliverPrincipalSharePreview(request, readAuthorized)
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('safe preview')
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('rejects a changed assignment/binding/package/derivative on the final read', async () => {
    const selected = await select()
    const readAuthorized = vi.fn().mockResolvedValueOnce(selected).mockResolvedValueOnce({ ...selected, externalAssignmentId: 'assignment-two' })
    expect((await deliverPrincipalSharePreview(request, readAuthorized)).status).toBe(409)
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('fails closed on corrupt or unavailable storage without an original fallback', async () => {
    mocks.integrity.mockImplementation(() => { throw new Error('STORED_FILE_INTEGRITY_MISMATCH') })
    expect((await deliverPrincipalSharePreview(request, select)).status).toBe(503)
    expect(mocks.read).toHaveBeenCalledTimes(1)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
