import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  apply: vi.fn()
}))

vi.mock('@/lib/principal-company-read', () => ({
  withPrincipalCompanyRead: mocks.read,
  withPrincipalCompanyWrite: mocks.write
}))
vi.mock('@/lib/role-policy-service', () => ({ applyRolePolicy: mocks.apply }))

import { rolePolicyReadRoute, rolePolicyWriteRoute } from '@/lib/role-policy-route'
import { POST as applyPost } from '@/app/api/settings/access/role-policies/applications/route'

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
      contractVersion: 'ai-pdm.role-policy-workspace.v4',
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
      contractVersion: 'ai-pdm.role-policy-workspace.v4',
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

  const originalApplyBody = { requestId: '10000000-0000-4000-8000-000000000001',
    confirmation: { draftId: '10000000-0000-4000-8000-000000000002', draftRevision: 1,
      expectedActive: { catalogVersion: 'legacy-v8', catalogSha256: 'a'.repeat(64) } }, reason: '確認完整差異' }
  function applyRequest(body: Record<string, unknown>) {
    return new Request('https://ai-pdm.test/api/settings/access/role-policies/applications', {
      method: 'POST', headers: { origin: 'https://ai-pdm.test', 'content-type': 'application/json',
        'x-pdm-policy-principal': 'principal-one' }, body: JSON.stringify(body)
    })
  }
  it('lets the actual applications POST deliver a first-conversion semantic version to the apply service', async () => {
    const body = { ...originalApplyBody, semanticDiffVersion: 'ai-pdm.role-policy-semantic-diff.v1' }
    mocks.apply.mockResolvedValue({ status: 'APPLIED' })
    const response = await applyPost(applyRequest(body))
    expect(response.status).toBe(200)
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(snapshot, verified, body)
  })
  it('keeps an old apply body unchanged so the actual applications POST can return its durable receipt', async () => {
    const receipt = { commandId: originalApplyBody.requestId, status: 'APPLIED', catalogVersion: 'original-publication' }
    mocks.apply.mockResolvedValue(receipt)
    const response = await applyPost(applyRequest(originalApplyBody))
    expect(response.status).toBe(200)
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(snapshot, verified, originalApplyBody)
    expect(await response.json()).toMatchObject({ data: receipt })
  })
  it('rejects unknown actual applications POST fields before the apply service', async () => {
    const response = await applyPost(applyRequest({ ...originalApplyBody, semanticDiffVersion: 'ai-pdm.role-policy-semantic-diff.v1', extra: true }))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'REQUEST_SCHEMA_INVALID' })
    expect(mocks.apply).not.toHaveBeenCalled()
  })
})
