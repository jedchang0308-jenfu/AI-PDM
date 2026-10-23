import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn()
}))

vi.mock('@/lib/principal-company-read', () => ({
  withPrincipalCompanyRead: mocks.read,
  withPrincipalCompanyWrite: mocks.write
}))

import { rolePolicyReadRoute, rolePolicyWriteRoute } from '@/lib/role-policy-route'

const routePath = 'src/app/api/settings/access/role-policies/drafts/route.ts'
const routeUrl = 'https://ai-pdm.test/api/settings/access/role-policies/drafts'
const snapshot = { kind: 'postgres', transactionScope: 'principal-workspace' }
const company = { companyId: 'company-one', companyCode: 'JENFU' }
const verified = {
  session: { principalId: 'principal-one' },
  profile: { pdmUserId: 'profile-one' }
}

function readRequest(headers: Record<string, string> = {}) {
  return new Request(routeUrl, { headers })
}

function writeRequest(headers: Record<string, string> = {}) {
  return new Request(routeUrl, {
    method: 'POST',
    headers: {
      origin: 'https://ai-pdm.test',
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({ requestId: 'request-one' })
  })
}

describe('role policy route private actor binding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.read.mockImplementation(async (_request, _company, _permissions, callback) =>
      callback(snapshot, company, verified))
    mocks.write.mockImplementation(async (_request, _path, _permission, callback) =>
      callback(snapshot, company, verified))
  })

  it.each([undefined, 'principal-other'])('rejects a write with a missing or mismatched private actor header: %s', async (principal) => {
    const handler = vi.fn(async () => ({ saved: true }))
    const header: Record<string, string> = principal === undefined ? {} : { 'x-pdm-policy-principal': principal }
    const response = await rolePolicyWriteRoute(writeRequest(header), routePath, handler)

    expect(response.status).toBe(409)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ code: 'PRINCIPAL_CONTEXT_CONFLICT' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('reaches the write service only with the verified private actor header', async () => {
    const handler = vi.fn(async (_client, _company, actor, body) => ({
      principalId: actor.session.principalId,
      body
    }))
    const request = writeRequest({ 'x-pdm-policy-principal': 'principal-one' })
    const response = await rolePolicyWriteRoute(request, routePath, handler)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({
      contractVersion: 'ai-pdm.role-policy-workspace.v3',
      data: { principalId: 'principal-one', body: { requestId: 'request-one' } },
      correlationId: expect.any(String)
    })
    expect(handler).toHaveBeenCalledWith(snapshot, company, verified, { requestId: 'request-one' })
  })

  it('rejects a read with a mismatched private actor header before the service', async () => {
    const handler = vi.fn(async () => ({ workspace: true }))
    const response = await rolePolicyReadRoute(
      readRequest({ 'x-pdm-policy-principal': 'principal-other' }), routePath, handler)

    expect(response.status).toBe(409)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ code: 'PRINCIPAL_CONTEXT_CONFLICT' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('keeps the no-header read path and private no-store response', async () => {
    const handler = vi.fn(async () => ({ workspace: true }))
    const response = await rolePolicyReadRoute(readRequest(), routePath, handler)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({
      contractVersion: 'ai-pdm.role-policy-workspace.v3',
      data: { workspace: true },
      correlationId: expect.any(String)
    })
    expect(handler).toHaveBeenCalledWith(snapshot, company, verified)
  })

  it('keeps the auth fallback when the read authorization wrapper returns no response', async () => {
    mocks.read.mockResolvedValue(null)
    const handler = vi.fn(async () => ({ workspace: true }))
    const response = await rolePolicyReadRoute(readRequest(), routePath, handler)

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ code: 'auth_session_invalid' })
    expect(handler).not.toHaveBeenCalled()
  })
})
