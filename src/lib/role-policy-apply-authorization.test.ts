import { afterEach, describe, expect, it, vi } from 'vitest'
import { lockAndRevalidateRolePolicyApply } from '@/lib/role-policy-apply-authorization'

afterEach(() => vi.restoreAllMocks())

function fixture(overrides: { eligible?: boolean; epoch?: number; accountStatus?: string;
  accountType?: string; revoked?: boolean; expiryMs?: number; waitMs?: number; lifecycleVersion?: number;
  profileVersion?: number; assuranceLevel?: string; sessionAssuranceLevel?: string } = {}) {
  const started = Date.parse('2026-10-21T00:00:00Z')
  let now = started
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const issuedAt = new Date(started - 60_000).toISOString()
  const expiresAt = new Date(started + (overrides.expiryMs ?? 60_000)).toISOString()
  const verified = { profile: { pdmUserId: 'profile-a', companyId: 'company-jenfu' }, session: {
    sessionId: 'test-session-00000001', principalId: 'principal-a', employeeId: 'employee-a',
    identityIssuer: 'test-issuer', identitySubject: 'test-subject', assuranceLevel: overrides.assuranceLevel ?? 'aal2',
    accountLifecycleVersion: 1, profileVersion: overrides.profileVersion ?? 1, authEpoch: 3,
    issuedAt, authenticatedAt: issuedAt, expiresAt
  } }
  const sql: string[] = []
  const client = { kind: 'postgres', transactionScope: 'postgres',
    query: vi.fn(async (text: string) => { sql.push(text); now += overrides.waitMs ?? 0; return [] }),
    queryOne: vi.fn(async (text: string) => {
      sql.push(text)
      if (text.includes('principal_accounts')) return { principal_id: 'principal-a', pdm_user_id: 'profile-a',
        employee_id: 'employee-a', account_type: overrides.accountType ?? 'human_privileged', company_id: 'company-jenfu',
        lifecycle_version: overrides.lifecycleVersion ?? 1, profile_version: overrides.profileVersion ?? 1,
        account_status: overrides.accountStatus ?? 'active', system_role_enabled: true,
        minimum_assurance: 'aal1', session_invalid_before: null }
      if (text.includes('principal_session_records')) return { principal_auth_epoch: 3, lifecycle_version: 1,
        profile_version: 1, issued_at: issuedAt, authenticated_at: issuedAt, expires_at: expiresAt,
        revoked_at: overrides.revoked ? issuedAt : null,
        assurance_level: overrides.sessionAssuranceLevel ?? overrides.assuranceLevel ?? 'aal2' }
      if (text.includes('read_principal_auth_state_v3')) return { principal_id: 'principal-a',
        auth_epoch: overrides.epoch ?? 3, revoked_before: null }
      if (text.includes('manager_eligible_v1')) return { eligible: overrides.eligible ?? true }
      throw new Error('unexpected query')
    }) }
  const run = () => lockAndRevalidateRolePolicyApply(client as never, verified as never,
    '10000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010')
  return { client, verified, sql, run }
}

describe('DEV-123 post-wait apply admission', () => {
  it('locks first and separately revalidates account, session, epoch and the timed OrgMaster manager', async () => {
    const f = fixture()
    await expect(f.run()).resolves.toBeUndefined()
    expect(f.sql[0]).toContain('role_policy_lock_apply_v1')
    expect(f.sql.at(-1)).toContain('manager_eligible_v1')
    expect(f.sql.findIndex(sql => sql.includes('principal_accounts'))).toBeGreaterThan(0)
  })

  it('accepts a verified AAL1 manager when the registered session has the same assurance', async () => {
    await expect(fixture({ assuranceLevel: 'aal1' }).run()).resolves.toBeUndefined()
  })

  it.each([
    ['revoked OrgMaster grant or identity', { eligible: false }],
    ['ordinary account', { accountType: 'human_personal' }],
    ['delegated OrgMaster grant', { eligible: false }],
    ['workload or agent grant', { eligible: false }],
    ['disabled PDM account', { accountStatus: 'suspended' }],
    ['changed account lifecycle', { lifecycleVersion: 2 }],
    ['changed account profile', { profileVersion: 2 }],
    ['revoked session', { revoked: true }],
    ['changed canonical epoch', { epoch: 4 }],
    ['session expires during lock wait', { expiryMs: 500, waitMs: 1000 }],
    ['session and claim assurance mismatch', { assuranceLevel: 'aal1', sessionAssuranceLevel: 'aal2' }],
    ['unsupported claim assurance', { assuranceLevel: 'aal3' }],
    ['unsupported registered session assurance', { sessionAssuranceLevel: 'aal3' }],
  ])('rejects %s before preview or apply', async (_label, overrides) => {
    await expect(fixture(overrides).run()).rejects.toMatchObject({ code: 'ROLE_POLICY_MANAGER_REQUIRED', status: 403 })
  })

  it('refuses an unpinned transaction', async () => {
    const f = fixture()
    f.client.transactionScope = 'unscoped'
    await expect(f.run()).rejects.toMatchObject({ code: 'ROLE_POLICY_TRANSACTION_UNAVAILABLE', status: 503 })
    expect(f.sql).toHaveLength(0)
  })
})
