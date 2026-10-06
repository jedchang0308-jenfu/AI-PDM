import assert from 'node:assert/strict'
import test from 'node:test'
import { assertPrincipalOnlyMigrationFence, assertPrincipalOnlyMigrationWritersAbsent,
  requiresPrincipalOnlyMigrationFence } from './dev121-migration-fence.mjs'
import { sha256 } from './dev012-production-migration-runner.mjs'

const sourceRevision = 'a'.repeat(40)
const oldRevision = 'ai-pdm-prod-f5ee2af2d7ec'
function input() {
  const service = {
    name: 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',
    uid: 'service-uid', generation: '65', observedGeneration: '65',
    reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
    updateTime: '2026-09-30T00:00:00.000Z',
    template: { timeout: '60s' },
    traffic: [{ revision: oldRevision, percent: 100 }],
    trafficStatuses: [{ revision: oldRevision, percent: 100 }],
  }
  const proof = {
    schemaVersion: 'ai-pdm.principal-only-migration-fence.v1',
    sourceRevision, projectId: 'jenfu-platform-prod', region: 'asia-east1',
    service: 'ai-pdm-prod', serviceUid: service.uid, oldRevision,
    beforeGeneration: '64', quiescentGeneration: '65',
    serviceUpdateTime: service.updateTime, requestTimeoutSeconds: 60,
    status: 'QUIESCED',
  }
  const bytes = Buffer.from(`${JSON.stringify(proof)}\n`)
  return { proof, bytes, expectedSha256: sha256(bytes), sourceRevision,
    service, observedAt: '2026-09-30T00:01:30.000Z' }
}

test('recognition and human assurance migrations require the Principal-only writer fence', () => {
  assert.equal(requiresPrincipalOnlyMigrationFence({
    path: 'db/postgres/073_dev121_drawing_recognition_initiator_principal.sql' }), true)
  assert.equal(requiresPrincipalOnlyMigrationFence({path: 'db/postgres/074_dev121_principal_human_assurance_aal1.sql' }), true)
  assert.equal(requiresPrincipalOnlyMigrationFence({path: 'db/postgres/080_dev121_principal_role_catalog_v6.sql' }), true)
  assert.equal(requiresPrincipalOnlyMigrationFence({path: 'db/postgres/075_unknown.sql' }), false)
  assert.equal(requiresPrincipalOnlyMigrationFence({
    path: 'db/postgres/072_dev121_principal_account_manager_grants_v3.sql' }), false)
})

test('accepts source-bound proof only after live service generation and drain agree', () => {
  const value = input()
  assert.equal(assertPrincipalOnlyMigrationFence(value).generation, 65)
  const mutations = [
    (item) => { item.expectedSha256 = '0'.repeat(64) },
    (item) => { item.proof.sourceRevision = 'b'.repeat(40) },
    (item) => { item.proof.quiescentGeneration = '66' },
    (item) => { item.service.generation = '66'; item.service.observedGeneration = '66' },
    (item) => { item.service.updateTime = '2026-09-30T00:00:01.000Z' },
    (item) => { item.service.scaling.manualInstanceCount = 1 },
    (item) => { item.service.traffic.push({ revision: oldRevision,
      percent: 0, tag: 'old' }) },
    (item) => { item.observedAt = '2026-09-30T00:01:29.999Z' },
  ]
  for (const mutate of mutations) {
    const changed = input()
    mutate(changed)
    assert.throws(() => assertPrincipalOnlyMigrationFence(changed),
      /DEV121_MIGRATION_073_FENCE_INVALID/u)
  }
})

test('migration fence reads all AI-PDM owner-role sessions before pending SQL', async () => {
  let inspected = false
  const database = { async query(sql, values) {
    inspected = true
    assert.match(sql, /pg_catalog\.pg_stat_activity/u)
    assert.match(sql, /pg_catalog\.pg_has_role\(usename,'jenfu_ai_pdm_runtime','MEMBER'\)/u)
    assert.match(sql, /pg_catalog\.pg_has_role\(usename,'jenfu_ai_pdm_migrator','MEMBER'\)/u)
    assert.deepEqual(values, ['aipdm-prod-runtime@jenfu-platform-prod.iam',
      'aipdm-prod-migrator@jenfu-platform-prod.iam'])
    return { rows: [{ ownerSessions: 0 }] }
  } }
  assert.deepEqual(await assertPrincipalOnlyMigrationWritersAbsent(database),
    { ownerWriterSessions: 0 })
  assert.equal(inspected, true)
  for (const value of [1, '2', null, -1]) {
    await assert.rejects(assertPrincipalOnlyMigrationWritersAbsent({
      query: async () => ({ rows: [{ ownerSessions: value }] }),
    }), /DEV121_MIGRATION_073_FENCE_INVALID/u)
  }
  await assert.rejects(assertPrincipalOnlyMigrationWritersAbsent({
    query: async () => { throw new Error('provider denied') },
  }), /DEV121_MIGRATION_073_FENCE_INVALID/u)
})
