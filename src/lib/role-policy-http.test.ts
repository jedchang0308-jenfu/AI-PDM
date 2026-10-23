import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/request-origin', () => ({ isAllowedRequestOrigin: () => true }))
import { assertExactKeys, readRolePolicyJson } from '@/lib/role-policy-http'

function request(body: string) {
  return new Request('https://pdm.example/api/settings/access/role-policies/drafts', {
    method: 'POST', headers: { origin: 'https://pdm.example', 'content-type': 'application/json' }, body
  })
}

describe('DEV-123 strict request parsing', () => {
  it('rejects duplicate JSON keys before command execution', async () => {
    await expect(readRolePolicyJson(request('{"requestId":"one","requestId":"two"}')))
      .rejects.toMatchObject({ code: 'DUPLICATE_JSON_KEY', status: 400 })
  })
  it('keeps unknown fields out of typed commands', async () => {
    const parsed = await readRolePolicyJson(request('{"requestId":"one","extra":true}'))
    expect(() => assertExactKeys(parsed, ['requestId'])).toThrow('REQUEST_SCHEMA_INVALID')
  })
})
