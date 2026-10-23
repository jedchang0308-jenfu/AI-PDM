import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ write: vi.fn(), company: vi.fn(), capability: vi.fn(), create: vi.fn(), result: vi.fn() }))
vi.mock('@/lib/principal-company-read', () => ({ withPrincipalCompanyWrite: mocks.write }))
vi.mock('@/lib/company-context', () => ({ resolvePrincipalCompanyContextInSnapshot: mocks.company }))
vi.mock('@/lib/principal-resource-capability', () => ({ authorizeDynamicResourceCapabilityInSnapshot: mocks.capability,
  isDynamicRolePolicyInSnapshot: vi.fn() }))
vi.mock('@/lib/numbering-company-context', () => ({ requestedNumberingCompanyCodeFromRequest: (_request: Request, body: Record<string, unknown>) => body.companyCode ?? null }))
vi.mock('@/lib/numbering-export-job-capability', () => ({ authorizeNumberingExportJobResultInSnapshot: mocks.result }))
vi.mock('@/lib/repositories/numbering-async-repository', () => ({ AsyncNumberingRepository: class {
  constructor(readonly snapshot: unknown) {}
  createNumberingExportJob(input: unknown) { return mocks.create(this.snapshot, input) }
} }))
import { POST } from './route'

const snapshot = { id: 'same-write-snapshot' }
const company = { companyId: 'company-one' }
const verified = { profile: { pdmUserId: 'profile-one', companyId: 'company-one' } }
const job = { id: 'job-one', status: 'completed', result: { roots: [] } }
const request = (body: unknown = {}) => new Request('https://pdm.test/api/numbering/export-jobs', {
  method: 'POST', body: JSON.stringify(body) })

describe('Principal numbering export creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.write.mockImplementation(async (_request, _path, _permission, execute) => execute(snapshot, company, verified))
    mocks.company.mockResolvedValue({ company })
    mocks.capability.mockResolvedValue(null)
    mocks.create.mockResolvedValue(job)
    mocks.result.mockResolvedValue(null)
  })
  it('checks live view/download before creating the job and its real result in the same writer transaction', async () => {
    const response = await POST(request())
    expect(response.status).toBe(201)
    expect(mocks.write).toHaveBeenCalledWith(expect.any(Request), 'src/app/api/numbering/export-jobs/route.ts', 'numbering.export.create', expect.any(Function))
    expect(mocks.capability.mock.calls).toEqual([
      [snapshot, verified, ['part', 'drawing'], 'view'], [snapshot, verified, ['part', 'drawing'], 'download'] ])
    expect(mocks.create).toHaveBeenCalledWith(snapshot, { companyId: 'company-one', generatedBy: 'profile-one', exportMode: 'no_audit' })
    expect(mocks.result).toHaveBeenCalledWith(snapshot, verified, job.result)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it.each(['view', 'download'])('creates no job after %s denial', async action => {
    mocks.capability.mockImplementation(async (_snapshot, _verified, _groups, checked) => checked === action ? new Response(null, { status: 403 }) : null)
    expect((await POST(request())).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('returns final result denial to the shared writer for rollback, without returning export data', async () => {
    mocks.result.mockResolvedValue(Response.json({ code: 'permission_not_granted' }, { status: 403 }))
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ code: 'permission_not_granted' })
  })
  it('rejects a caller-selected foreign company before creating a job', async () => {
    mocks.company.mockResolvedValue({ response: new Response(null, { status: 403 }) })
    expect((await POST(request({ companyCode: 'FOREIGN' }))).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('preserves export mode validation', async () => {
    expect((await POST(request({ exportMode: 'unknown' }))).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('preserves parsed input when the transaction retries its callback', async () => {
    mocks.write.mockImplementation(async (_request, _path, _permission, execute) => {
      await execute(snapshot, company, verified)
      return execute(snapshot, company, verified)
    })
    expect((await POST(request({ exportMode: 'full_change_summary' }))).status).toBe(201)
    expect(mocks.create.mock.calls.map(call => call[1].exportMode)).toEqual(['full_change_summary', 'full_change_summary'])
  })
})
