import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), authorize: vi.fn(), snapshot: { kind: 'postgres', transactionScope: 'postgres' } }))
vi.mock('@/lib/ai-pdm-published-role-capability-workspace', () => ({ readPublishedRoleCapabilityWorkspace: mocks.read }))
vi.mock('@/lib/principal-company-read', () => ({ withPrincipalCompanyRead: mocks.authorize }))
import { GET } from '@/app/api/settings/access/role-capabilities/route'

describe('role capability GET uses the verified Principal/company snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockImplementation(async (_request, _company, _permissions, read) =>
      read(mocks.snapshot, { companyId: 'company-jenfu' }))
    mocks.read.mockResolvedValue({ contractVersion: 'ai-pdm.role-capability-workspace.v4',
      mutationAllowed: false, dataState: 'current' })
  })
  it('uses the existing action permission and the exact authorized snapshot', async () => {
    const request = new Request('https://ai-pdm.example/api/settings/access/role-capabilities?stableRoleId=role-system-admin')
    const response = await GET(request)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.authorize).toHaveBeenCalledWith(request, expect.anything(),
      [{ permissionKind: 'action', permissionCode: 'settings.admin_matrix' }], expect.any(Function))
    expect(mocks.read).toHaveBeenCalledWith(mocks.snapshot, 'company-jenfu', 'role-system-admin')
  })
  it.each([401, 403])('does not read published holders when Principal authorization returns %i', async (status) => {
    mocks.authorize.mockResolvedValue(Response.json({ code: 'permission_not_granted' }, { status }))
    expect((await GET(new Request('https://ai-pdm.example/api/settings/access/role-capabilities'))).status).toBe(status)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('returns 404 for an unregistered selected role, without fallback', async () => {
    mocks.read.mockResolvedValue(null)
    const response = await GET(new Request('https://ai-pdm.example/api/settings/access/role-capabilities?stableRoleId=unknown'))
    expect(response.status).toBe(404)
  })
  it('returns correlated 503 instead of 400 or raw dependency details', async () => {
    mocks.read.mockRejectedValue(new Error('connection secret upstream detail'))
    const event = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await GET(new Request('https://ai-pdm.example/api/settings/access/role-capabilities'))
      const body = await response.json()
      expect(response.status).toBe(503)
      expect(body).toMatchObject({ error: 'ROLE_CAPABILITY_UNAVAILABLE', correlationId: expect.any(String) })
      expect(JSON.stringify(body)).not.toContain('secret')
      expect(event).toHaveBeenCalledWith(JSON.stringify({
        event: 'role_capability_read_failed', stage: 'published_contract_read',
        correlationId: body.correlationId, reason: 'PUBLISHED_CONTRACT_UNAVAILABLE'
      }))
    } finally { event.mockRestore() }
  })
})
