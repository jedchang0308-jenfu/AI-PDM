import { describe, expect, it, vi } from 'vitest'
import { readRolePolicyWorkspace, readRolePolicyCommand, applyRolePolicy, readRolePolicyCompatibility, rolePolicyInput } from '@/lib/role-policy-service'

import { rolePolicySource } from '@/lib/role-policy-editor'
import { sha256CanonicalJson } from '@/lib/role-capability-canonical-hash.server'
import { lockAndRevalidateRolePolicyApply } from '@/lib/role-policy-apply-authorization'

vi.mock('@/lib/role-policy-apply-authorization', () => ({ lockAndRevalidateRolePolicyApply: vi.fn(async () => undefined) }))

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


describe('DEV-123 apply replay', () => {
  it('returns the original committed result before consulting an APPLIED draft or changed readiness', async () => {
    const actor = 'principal-admin'
    const body = { requestId: '10000000-0000-4000-8000-000000000010',
      draftId: '20000000-0000-4000-8000-000000000010', expectedDraftRevision: 2,
      expectedDraftHash: 'a'.repeat(64),
      expectedActive: { catalogVersion: 'ai-pdm.role-catalog.2026-10-10.v7',
        catalogSha256: 'b'.repeat(64), activationGeneration: '0' },
      expectedCompatibilityRevision: '1', confirmationHash: 'c'.repeat(64), reason: '調整角色' }
    const payload = { draftId: body.draftId, expectedRevision: body.expectedDraftRevision,
      expectedHash: body.expectedDraftHash, expectedActive: body.expectedActive,
      expectedCompatibilityRevision: body.expectedCompatibilityRevision,
      confirmationHash: body.confirmationHash, reason: body.reason }
    const requestHash = sha256CanonicalJson({ contractVersion: 'ai-pdm.role-policy-command.v3',
      operation: 'apply', resource: 'ai-pdm:role-policy', actorPrincipalId: actor, payload })
    const original = { status: 'ACTIVE', catalogVersion: 'published-once', activationGeneration: '1' }
    const seen: string[] = []
    const client = {
      queryOne: vi.fn(async (sql: string) => {
        seen.push(sql)
        if (sql.includes('principal_accounts')) return { account_type: 'human_privileged', account_status: 'active' }
        if (sql.includes('role_policy_commands')) return { actor_principal_id: actor, operation: 'apply',
          request_hash: requestHash, original_http_status: 200, result_json: original, error_code: null }
        throw new Error('draft/current must not be consulted on replay')
      }),
      query: vi.fn(async () => [{ assignment_id: 'direct-global-system-admin' }])
    }
    const verified = { session: { principalId: actor, employeeId: 'employee-admin', assuranceLevel: 'aal2' } } as never
    await expect(applyRolePolicy(client as never, verified, body)).resolves.toEqual(original)
    expect(lockAndRevalidateRolePolicyApply).toHaveBeenCalledWith(client, verified, body.requestId, body.draftId)
    expect(seen.every(sql => !sql.includes('role_policy_drafts'))).toBe(true)
    await expect(applyRolePolicy(client as never, verified, { ...body, reason: '不同內容' }))
      .rejects.toMatchObject({ code: 'REQUEST_ID_REUSE', status: 409 })
  })
})


describe('DEV-123 command read authorization', () => {
  const requestId = '10000000-0000-4000-8000-000000000011'
  const row = { actor_principal_id: 'original-actor', operation: 'save', outcome: 'ACCEPTED',
    original_http_status: 200, result_json: { draftId: 'draft' }, error_code: null,
    completed_at: '2026-10-21T00:00:00Z' }

  it('lets the route-authorized original reader query their receipt without a new management appointment', async () => {
    const client = { queryOne: vi.fn(async () => row), query: vi.fn() }
    await expect(readRolePolicyCommand(client as never, requestId,
      { session: { principalId: 'original-actor' } } as never))
      .resolves.toMatchObject({ requestId, outcome: 'ACCEPTED', result: { draftId: 'draft' } })
    expect(client.queryOne).toHaveBeenCalledOnce()
    expect(client.query).not.toHaveBeenCalled()
  })

  it('requires a current direct global manager before disclosing another actor receipt', async () => {
    const read = vi.fn(async (sql: string) => sql.includes('role_policy_commands') ? row
      : { account_type: 'human_privileged', account_status: 'active' })
    const client = { queryOne: read, query: vi.fn(async () => []) }
    await expect(readRolePolicyCommand(client as never, requestId,
      { session: { principalId: 'other-actor', employeeId: 'employee', assuranceLevel: 'aal2' } } as never))
      .rejects.toMatchObject({ code: 'ROLE_POLICY_MANAGER_REQUIRED', status: 403 })
    expect(read).toHaveBeenCalledTimes(2)
  })
})

describe('DEV-123 legacy workspace during disabled rollout', () => {
  it('shows the actual legacy permissions without injecting the new default template', async () => {
    const source = rolePolicySource()
    const rows = source.baseCatalog.roles.map((role, index) => ({
      contract_version: 'jenfu.platform-entitlement.v1', application_id: 'ai-pdm',
      catalog_version: source.baseCatalog.catalogVersion, catalog_sha256: source.baseCatalog.catalogSha256,
      stable_role_id: role.stableRoleId, role_definition_hash: role.roleDefinitionHash,
      display_order: index, role_status: 'active', publication_format: 'legacy-static-v1'
    }))
    const client = { queryOne: vi.fn(async () => ({ mode: 'DISABLED', activation_generation: '0',
      registry_hash: source.registryHash })),
      query: vi.fn(async (sql: string) => sql.includes('v_application_role_catalog_v2') ? rows : []) }
    const workspace = await readRolePolicyWorkspace(client as never)
    expect(workspace.roles[8].permissions.some(permission => /^pdm\.(drawing|part|model|transfer)\./u.test(permission.code))).toBe(false)
    expect(workspace.roles[0].permissions).toEqual(source.baseCatalog.roles[0].permissions)
    expect(workspace.admission).toEqual({ read: true, edit: false, apply: false })
    expect(workspace.roleProfiles[0].presentationName).toBe(source.baseCatalog.roles[0].displayName)
  })
})
