import { createHash } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ scope: vi.fn(), source: vi.fn(), metadata: vi.fn(), read: vi.fn(), audit: vi.fn(), access: vi.fn() }))
vi.mock('@/lib/repositories/drawing-recognition-async-repository', () => ({ DrawingRecognitionAsyncRepository: class {
  assertSessionScope = mocks.scope; getSourceForActor = mocks.source
} }))
vi.mock('@/lib/file-storage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/file-storage')>(),
  storagePointerFromRecord: () => ({ provider: 'local_repository', key: 'pdf-one', bucket: null }),
  createFileStorageServiceForPointer: () => ({ getObjectMetadata: mocks.metadata, readObject: mocks.read,
    createDownloadUrl: mocks.access })
}))
vi.mock('@/lib/storage-access-audit', () => ({ auditStorageAccess: mocks.audit }))
import { readDrawingRecognitionPdfSource } from '@/lib/drawing-recognition'
const bytes = Buffer.from('%PDF-safe original')
const source = { sourceId: 'source-one', fileAssetId: 'asset-one', expectedBytes: bytes.length,
  expectedHash: createHash('sha256').update(bytes).digest('hex'), fileName: 'drawing.pdf', storage: {} }
const input = () => ({ sessionId: 'session-one', sourceId: 'source-one', companyId: 'company-one',
  actorId: 'profile-one', principalId: 'principal-one', roles: [], client: {} as never, reauthorize: vi.fn(async () => undefined) })
beforeEach(() => {
  vi.clearAllMocks(); mocks.scope.mockResolvedValue({}); mocks.source.mockResolvedValue(source)
  mocks.metadata.mockResolvedValue({ bytes: bytes.length }); mocks.read.mockResolvedValue(bytes)
  mocks.audit.mockResolvedValue(undefined); mocks.access.mockResolvedValue({ provider: 'local_repository' })
})
it('freshly authorizes before and after original reads, then audits the verified Principal', async () => {
  const request = input()
  expect((await readDrawingRecognitionPdfSource(request)).bytes).toEqual(bytes)
  expect(request.reauthorize).toHaveBeenCalledTimes(2)
  expect(request.reauthorize.mock.invocationCallOrder[0]).toBeLessThan(mocks.read.mock.invocationCallOrder[0])
  expect(request.reauthorize.mock.invocationCallOrder[1]).toBeGreaterThan(mocks.read.mock.invocationCallOrder[0])
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ principalId: 'principal-one',
    companyId: 'company-one', fileId: 'asset-one', disposition: 'inline' }))
})
it('does not read original PDF bytes after fresh authorization denial', async () => {
  const request = input(); request.reauthorize.mockRejectedValueOnce(new Error('revoked'))
  await expect(readDrawingRecognitionPdfSource(request)).rejects.toThrow('revoked')
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
})
it('does not deliver or audit bytes when authority changes during storage I/O', async () => {
  const request = input(); request.reauthorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('revoked'))
  await expect(readDrawingRecognitionPdfSource(request)).rejects.toThrow('revoked')
  expect(mocks.read).toHaveBeenCalledTimes(1); expect(mocks.audit).not.toHaveBeenCalled()
})
it('rejects bad hashes and failed audits without a successful response', async () => {
  mocks.read.mockResolvedValueOnce(Buffer.from('%PDF-changed file'))
  await expect(readDrawingRecognitionPdfSource(input())).rejects.toMatchObject({ code: 'RECOGNITION_PDF_SOURCE_INVALID' })
  expect(mocks.audit).not.toHaveBeenCalled()
  mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'))
  await expect(readDrawingRecognitionPdfSource(input())).rejects.toThrow('audit unavailable')
})
