import { describe, expect, it, vi } from 'vitest'
import { resolveDrawingPreviewAsync } from '@/lib/drawing-preview-asset'

const source = { id: 'source', company_id: 'company-a', file_name: 'original.pdf', file_ext: 'pdf',
  mime_type: 'application/pdf', content_hash: 'source-hash', storage_provider: 'test',
  storage_bucket: null, storage_key: 'original', original_path: null }
describe('DEV-123 safe derived preview', () => {
  it('preserves the legacy original PDF preview path', async () => {
    const queryOne = vi.fn()
    expect((await resolveDrawingPreviewAsync({ queryOne } as never, source))?.record).toBe(source)
    expect(queryOne).not.toHaveBeenCalled()
  })
  it('never falls back to the original PDF when a safe derivative is required', async () => {
    const queryOne = vi.fn(async () => null)
    expect(await resolveDrawingPreviewAsync({ queryOne } as never, source, { requireDerivative: true })).toBeNull()
    expect(queryOne).toHaveBeenCalledOnce()
  })
  it('returns only the same-company derivative of the exact source hash', async () => {
    const derivative = { id: 'derived', company_id: 'company-a', source_content_hash: 'source-hash',
      file_name: 'preview.png', mime_type: 'image/png' }
    const queryOne = vi.fn(async () => derivative)
    expect((await resolveDrawingPreviewAsync({ queryOne } as never, source, { requireDerivative: true }))?.record).toEqual(derivative)
    queryOne.mockResolvedValueOnce({ ...derivative, source_content_hash: 'other' })
    expect(await resolveDrawingPreviewAsync({ queryOne } as never, source, { requireDerivative: true })).toBeNull()
  })
})
