import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyRolePolicyDraftChanges, buildDefaultRolePolicyCandidate } from '@/lib/role-policy-editor'

describe('DEV-123 real OrgMaster handoff vector', () => {
  it('rebuilds the exact v7 vector consumed by the DEV-058 decoder', () => {
    const orgMasterRoot = process.env.ORGMASTER_DEV058_ROOT
    expect(orgMasterRoot, 'ORGMASTER_DEV058_ROOT is required for the bilateral data check').toBeTruthy()
    const vectorPath = join(orgMasterRoot!, 'config/catalogs/test-vectors/ai-pdm-dynamic-policy-v1.json')
    const vectors = JSON.parse(readFileSync(vectorPath, 'utf8')) as Array<{
        baselineCatalogVersion: string; policy: ReturnType<typeof buildDefaultRolePolicyCandidate>
      }>
    const vector = vectors.find(item => item.baselineCatalogVersion === 'ai-pdm.role-catalog.2026-10-10.v7')
    expect(vector).toBeDefined()
    const base = buildDefaultRolePolicyCandidate(vector!.policy.candidateCatalogVersion)
    const { candidate } = applyRolePolicyDraftChanges({
      candidate: base,
      roleChanges: [{ type: 'create', clientRoleId: 'client-supply', displayName: '供應協作' }],
      changes: [{ roleRef: { clientRoleId: 'client-supply' }, groupId: 'drawing', actionId: 'view', enabled: true }],
      uuid: () => '30000000-0000-4000-8000-000000000001'
    })
    if (process.env.UPDATE_DEV123_VECTOR === '1') {
      vector!.policy = candidate
      writeFileSync(vectorPath, `${JSON.stringify(vectors, null, 2)}\n`, 'utf8')
    }
    expect(candidate).toEqual(vector!.policy)
  })
})
