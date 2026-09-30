import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { runMain } from './dev121-production-principal-inventory-runner.mjs'
import { assertInventoryOperation } from './lib/dev121-principal-inventory-runner.mjs'
import { createApplyFixture } from './lib/dev121-principal-only-apply-fixture.mjs'
const environment = { OWNER_APPLICATION_ID: 'ai-pdm', RELEASE_BUCKET: 'jenfu-platform-prod-aipdm-release',
  GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1',
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  POSTGRES_DATABASE: 'jenfu_prod', POSTGRES_IAM_LOGIN: 'aipdm-prod-migrator@jenfu-platform-prod.iam',
  POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  CLOUD_RUN_JOB: 'ai-pdm-prod-dev121-principal-inventory', PDM_SOURCE_REVISION: 'a'.repeat(40) }
function harness() {
  const fixture = createApplyFixture()
  const state = { queries: [], committed: null, pending: null, mutations: 0, writers: 0, afterApply: null }
  class Client {
    async connect() {}
    async end() {}
    async query(sql) {
      state.queries.push(sql)
      if (typeof sql === 'string' && sql.includes('current_database() AS database')) return {
        rows: [{ database: 'jenfu_prod', login: environment.POSTGRES_IAM_LOGIN,
          major: 17, migrator_member: true, schema_ready: true }] }
      if (typeof sql === 'string' && sql.includes('ownerSessions')) return { rows: [{ ownerSessions: state.writers }] }
      if (sql === 'COMMIT' && state.pending) { state.committed = state.pending; state.pending = null }
      if (sql === 'ROLLBACK') state.pending = null
      return { rows: [] }
    }
  }
  const loadPrincipalOnlyApply = async () => ({ applyPrincipalOnlyCohortInOwnerTransaction:
    async (_client, operation, { beforeApply }) => {
      if (state.committed) return { replayed: true, result: state.committed }
      await beforeApply()
      state.mutations += 1
      const result = { contractVersion: 'ai-pdm.principal-only-cohort-result.v1',
        operationId: operation.operationId, inputHash: operation.inputHash,
        sourceHash: operation.sourceHash, cohortHash: operation.cohortHash,
        activatedAt: '2026-09-30T00:00:00.000Z', principalId: operation.verified.principalId,
        pdmUserId: operation.verified.pdmUserId, activeBeforeCount: 2, activatedCount: 1,
        withheldCount: 1, withheldPdmUserIds: ['pdm-two'] }
      state.pending = result
      await state.afterApply?.()
      return { replayed: false, result }
    } })
  const run = () => runMain({ argv: ['--operation-ref', fixture.inputRef.uri,
    '--operation-sha256', fixture.inputHash, '--source-revision', fixture.revision,
    '--output-ref', fixture.outputRef], environment, fetchImpl: fixture.fetchImpl,
    Client, loadPrincipalOnlyApply, loadInventory: () => { throw new Error('legacy writer called') } })
  return { ...fixture, state: fixture.state, database: state, run }
}
test('v3 apply envelope requires exact owner proofs and forbids supplied person mappings', () => {
  const fixture = createApplyFixture()
  for (const alter of [
    (v) => { v.schemaVersion = 'ai-pdm.principal-inventory-operation.v2' },
    (v) => { v.sources = [fixture.snapshot.verified] },
    (v) => { v.email = 'guess@example.com' },
    (v) => { v.sourceReceiptRef.generation = 'latest' },
    (v) => { v.sourceReceiptRef.uri = v.sourceReceiptRef.uri.replace('aipdm-release', 'orgmaster-release') },
    (v) => { delete v.principalOnlyRecovery },
    (v) => { v.principalOnlyFenceRef.sha256 = 'bad' },
  ]) {
    const value = structuredClone(fixture.operation)
    alter(value)
    const bytes = Buffer.from(JSON.stringify(value))
    assert.throws(() => assertInventoryOperation(value, { bytes,
      operationSha256: createHash('sha256').update(bytes).digest('hex'), sourceRevision: fixture.revision }))
  }
})
test('operator verifies immutable inputs and commits one cohort without calling legacy registration', async () => {
  const h = harness()
  const result = await h.run()
  assert.equal(result.outcome.activatedCount, 1)
  assert.equal(h.database.mutations, 1)
  assert.equal(h.state.serviceReads, 2)
  assert.deepEqual(h.database.queries.filter((s) => typeof s === 'string' &&
    /^(BEGIN|SET LOCAL|COMMIT)/u.test(s)), [
      'BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE',
      'SET LOCAL ROLE jenfu_ai_pdm_migrator', 'COMMIT'])
})
test('unknown publication outcome replays the committed receipt after canonical traffic resumes', async () => {
  const h = harness()
  h.state.failPublication = true
  await assert.rejects(h.run(), /MIGRATION_GCS_PUBLISH_FAILED/u)
  assert.ok(h.database.committed)
  const serviceReads = h.state.serviceReads
  h.state.service.scaling = { scalingMode: 'AUTOMATIC' }
  const replay = await h.run()
  const same = await h.run()
  assert.equal(h.database.mutations, 1)
  assert.equal(h.state.serviceReads, serviceReads)
  assert.equal(replay.outputSha256, same.outputSha256)
  assert.equal(replay.outcome.inputHash, h.inputHash)
})
test('source generation, service drift, incomplete recovery and live writers all reject before mutation', async () => {
  for (const alter of [
    (h) => { h.objects.get(h.sourceReceiptRef.uri).generation = '44' },
    (h) => { h.objects.get(h.sourceRef.uri).bytes = Buffer.from('{}') },
    (h) => { h.state.service.generation = '7'; h.state.service.observedGeneration = '7' },
    (h) => { h.state.service.scaling = { scalingMode: 'AUTOMATIC' } },
    (h) => { h.state.service.traffic[0].tag = 'old' },
    (h) => { h.state.recoveryRevision.containers[0].image = 'mutable:latest' },
    (h) => { h.database.writers = 1 },
  ]) {
    const h = harness()
    alter(h)
    await assert.rejects(h.run())
    assert.equal(h.database.mutations, 0)
    assert.equal(h.database.committed, null)
    assert.equal(h.objects.has(h.outputRef), false)
  }
})
test('failure after owner work rolls back the entire transaction and emits no receipt', async () => {
  const h = harness()
  h.database.afterApply = () => { throw new Error('forced owner failure') }
  await assert.rejects(h.run(), /forced owner failure/u)
  assert.equal(h.database.queries.at(-1), 'ROLLBACK')
  assert.equal(h.database.committed, null)
  assert.equal(h.database.pending, null)
  assert.equal(h.objects.has(h.outputRef), false)
})
