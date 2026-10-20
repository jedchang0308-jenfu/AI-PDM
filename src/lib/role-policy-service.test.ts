import { describe, expect, it, vi } from 'vitest'
import { readRolePolicyCompatibility, rolePolicyInput } from '@/lib/role-policy-service'

describe('DEV-123 OrgMaster compatibility reader', () => {
  it('reads the exact fourteen-column NOT_READY row without guessing readiness', async () => {
    const row = {
      application_id: 'ai-pdm', consumer_id: 'orgmaster',
      contract_version: 'ai-pdm.role-policy-consumer-compatibility.v2', compatibility_revision: '0',
      supported_publication_format: 'dynamic-policy-v1', supported_canonicalization_version: 'jenfu.canonical-json.v1',
      supported_role_schema_id: 'ai-pdm.role-schema.flexible.v2',
      supported_role_profile_schema_id: 'ai-pdm.role-profile-schema.v1', accepted_registry_hash: null,
      accepted_baseline_role_identity_hash: null, accepted_protected_policy_hash: null,
      consumer_source_revision: null, enablement_ref: null, readiness: 'NOT_READY' as const
    }
    const seenSql: string[] = []
    const query = vi.fn(async (sql: string) => { seenSql.push(sql); return [row] })
    const result = await readRolePolicyCompatibility({ query } as never)
    expect(result).toEqual(row)
    expect(seenSql[0]).toContain('accepted_registry_hash')
    expect(seenSql[0]).toContain('v_ai_pdm_role_policy_compatibility_v2')
  })
  it('returns unavailable when the consumer view is absent', async () => {
    expect(await readRolePolicyCompatibility({ query: vi.fn(async () => { throw new Error('missing') }) } as never)).toBeNull()
  })
  it('rejects unknown nested command fields and ambiguous role references', () => {
    expect(() => rolePolicyInput.parseRoleChanges([
      { type: 'create', clientRoleId: 'client-a', displayName: '新角色', elevated: true }
    ])).toThrow('REQUEST_SCHEMA_INVALID')
    expect(() => rolePolicyInput.parseCapabilityChanges([{
      roleRef: { stableRoleId: 'role-rd', clientRoleId: 'client-a' }, groupId: 'documents', actionId: 'view', enabled: true
    }])).toThrow('REQUEST_SCHEMA_INVALID')
  })
})
