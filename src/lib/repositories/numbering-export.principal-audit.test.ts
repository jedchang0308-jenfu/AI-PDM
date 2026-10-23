import { describe, expect, it, vi } from 'vitest'
import { AsyncNumberingRepository } from '@/lib/repositories/numbering-async-repository'
import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import type { VerifiedPrincipalRequest } from '@/lib/jenfu-principal-request-guard'

function fixture(verified?: VerifiedPrincipalRequest) {
  const result = { exportMode: 'no_audit', companyId: 'company-one', generatedAt: '2026-10-24T00:00:00.000Z', roots: [], parts: [], drawings: [] }
  const client: AsyncDatabaseClient = { kind: 'postgres', query: vi.fn(async () => []),
    queryOne: vi.fn(async () => ({ id: 'job-one', export_mode: 'no_audit', status: 'completed', result_json: result })) as AsyncDatabaseClient['queryOne'],
    execute: vi.fn(async () => {}), transaction: async run => run(client), close: vi.fn(async () => {}) }
  return { client, repository: new AsyncNumberingRepository(client, () => result.generatedAt, () => 'job-one', undefined, verified) }
}

describe('export Principal audit', () => {
  it('records the exact verified Principal, historical profile and company in the job transaction', async () => {
    const verified = { profile: { pdmUserId: 'profile-one', companyId: 'company-one' },
      session: { principalId: 'principal-one', profileVersion: 3 } } as VerifiedPrincipalRequest
    const { client, repository } = fixture(verified)
    await repository.createNumberingExportJob({ companyId: 'company-one', exportMode: 'no_audit', generatedBy: 'profile-one' })
    const call = vi.mocked(client.execute).mock.calls.find(([sql]) => sql.includes('INSERT INTO audit_logs'))!
    expect(call[0]).toContain('company_id, scope_kind')
    expect(call[1]).toMatchObject({ actorId: 'profile-one', companyId: 'company-one', scopeKind: 'tenant' })
    expect(JSON.parse((call[1] as { detailJson: string }).detailJson)).toMatchObject({
      securityActor: { principalId: 'principal-one', profileVersion: 3 }, exportJobId: 'job-one' })
  })
  it('rejects a PostgreSQL export without the verified audit context', async () => {
    const { repository } = fixture()
    await expect(repository.createNumberingExportJob({ companyId: 'company-one', exportMode: 'no_audit', generatedBy: 'profile-one' }))
      .rejects.toThrow('NUMBERING_PRINCIPAL_AUDIT_REQUIRED')
  })
})
