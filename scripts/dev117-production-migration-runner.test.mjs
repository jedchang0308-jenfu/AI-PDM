import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertMigrationBundle,
  assertRunnerTarget,
  canonicalize,
  crc32cBase64,
  executeProductionMigration,
  parseGsUri,
  parseRunnerArgs,
  planMigration,
  sha256,
} from './lib/dev012-production-migration-runner.mjs'
import { TARGET, runMain } from './dev117-production-migration-runner.mjs'
import { UNLINKED_PROFILE_CLEANUP_PREFIX, UNLINKED_PROFILE_CLEANUP_PATH } from './lib/dev121-unlinked-profile-cleanup.mjs'

const H40 = 'a'.repeat(40)
const environment = {
  OWNER_APPLICATION_ID: TARGET.ownerApplicationId,
  RELEASE_BUCKET: TARGET.releaseBucket,
  GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod',
  GOOGLE_CLOUD_REGION: 'asia-east1',
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  POSTGRES_DATABASE: 'jenfu_prod',
  POSTGRES_IAM_LOGIN: TARGET.login,
  POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  CLOUD_RUN_JOB: TARGET.job,
}

function fixture(extra = 1) {
  const entries = Array.from({ length: TARGET.baselineCount + extra }, (_, index) => {
    const sql = Buffer.from(`SELECT ${index + 1};\n`)
    return { order: index + 1, version: `dev012-ai-pdm-${String(index + 1).padStart(3, '0')}`, name: `migration_${index + 1}`, path: `db/postgres/${String(index + 1).padStart(3, '0')}.sql`, sourceSha256: sha256(sql), appliedSha256: sha256(sql), sqlBase64: sql.toString('base64') }
  })
  const core = { schemaVersion: 'jenfu.dev012.migration-bundle.v1', ownerApplicationId: TARGET.ownerApplicationId, sourceRevision: H40, projectId: 'jenfu-platform-prod', region: 'asia-east1', database: 'jenfu_prod', ledger: TARGET.ledger, baselineCount: TARGET.baselineCount, entries }
  const bundle = { ...core, manifestSha256: sha256(canonicalize(core)) }
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`)
  return { bundle, bytes, bundleSha256: sha256(bytes) }
}

test('S1B-20 AI-PDM runner accepts only exact production target and refs', () => {
  assert.equal(assertRunnerTarget(environment, TARGET).database, 'jenfu_prod')
  assert.throws(() => assertRunnerTarget({ ...environment, POSTGRES_DATABASE: 'jenfu_stg' }, TARGET), /TARGET_MISMATCH/)
  assert.equal(parseGsUri(`gs://${TARGET.releaseBucket}/source/migration-bundles/a.json`, TARGET.releaseBucket, 'source/migration-bundles').object, 'source/migration-bundles/a.json')
  assert.throws(() => parseGsUri('gs://jenfu-platform-prod-orgmaster-release/source/migration-bundles/a.json', TARGET.releaseBucket, 'source/migration-bundles'), /GCS_REF_INVALID/)
  assert.equal(parseRunnerArgs(['--bundle-ref', `gs://${TARGET.releaseBucket}/source/migration-bundles/a.json`, '--bundle-sha256', 'b'.repeat(64), '--source-revision', H40, '--output-ref', `gs://${TARGET.releaseBucket}/receipts/r/migrate.json`]).sourceRevision, H40)
  for (const forbidden of ['--cleanup-ref', '--target-profile-id', '--sql']) {
    assert.throws(() => parseRunnerArgs([forbidden, 'synthetic-selector']), /MIGRATION_ARGUMENT_INVALID/u)
  }
  assert.equal(crc32cBase64(Buffer.from('123456789')), '4waSgw==')
})

test('S1B-20 AI-PDM runner validates bundle, baseline and one forward migration', async () => {
  const input = fixture()
  assertMigrationBundle(input.bundle, { target: TARGET, sourceRevision: H40, bundleSha256: input.bundleSha256, bytes: input.bytes })
  let ledger = input.bundle.entries.slice(0, TARGET.baselineCount).map((entry) => ({ version: entry.version, name: entry.name, checksum_sha256: entry.appliedSha256, source_revision: 'prior' }))
  assert.equal(planMigration(input.bundle, ledger).length, 1)
  const database = {
    async query(sql, values) {
      if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17, migratorMember: true, runtimeCanCreateCore: false }] }
      if (sql.includes('unnest(')) return { rows: TARGET.siblingCoreSchemas.map((schema_name) => ({ schema_name, can_use: false })) }
      if (sql.includes('FROM pg_catalog.pg_class')) return { rows: [{ exists: true }] }
      if (sql.includes('ORDER BY applied_at')) return { rows: ledger.map((row) => ({ ...row })) }
      if (sql.startsWith('INSERT INTO')) ledger.push({ version: values[0], name: values[1], checksum_sha256: values[2], source_revision: values[3] })
      return { rows: [] }
    },
  }
  const receipt = await executeProductionMigration({ bundle: input.bundle, database, target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true, now: () => '2026-09-08T00:00:00.000Z' })
  assert.equal(receipt.status, 'PASS')
  assert.equal(receipt.applied, 1)
  assert.equal(ledger.length, TARGET.baselineCount + 1)
  const drift = structuredClone(input.bundle)
  drift.entries[0].appliedSha256 = '0'.repeat(64)
  assert.throws(() => planMigration(drift, ledger), /LEDGER_PREFIX_MISMATCH/)
})

test('S1B-20 AI-PDM runner bootstraps only its private ledger and applies a fresh database from zero', async () => {
  const input = fixture()
  let ledger = []
  let tableExists = false
  const statements = []
  const database = {
    async query(sql, values) {
      statements.push(sql)
      if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17, migratorMember: true, runtimeCanCreateCore: false }] }
      if (sql.includes('unnest(')) return { rows: TARGET.siblingCoreSchemas.map((schema_name) => ({ schema_name, can_use: false })) }
      if (sql.includes('FROM pg_catalog.pg_class')) return { rows: [{ exists: tableExists }] }
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) tableExists = true
      if (sql.includes('ORDER BY applied_at')) return { rows: ledger.map((row) => ({ ...row })) }
      if (sql.startsWith('INSERT INTO')) ledger.push({ version: values[0], name: values[1], checksum_sha256: values[2], source_revision: values[3] })
      return { rows: [] }
    },
  }
  const receipt = await executeProductionMigration({ bundle: input.bundle, database, target: TARGET, sourceRevision: H40, denyDatabaseConnect: async () => true, now: () => '2026-09-11T00:00:00.000Z' })
  assert.equal(receipt.status, 'PASS')
  assert.equal(receipt.minimumLedgerCount, 0)
  assert.deepEqual(receipt.ledgerBootstrap, { enabled: true, created: true })
  assert.equal(receipt.applied, input.bundle.entries.length)
  assert.equal(ledger.length, input.bundle.entries.length)
  assert.ok(statements.some((sql) => sql === `SET LOCAL ROLE ${TARGET.migratorRole}`))
  assert.ok(statements.some((sql) => sql === `REVOKE ALL ON TABLE ${TARGET.ledger} FROM PUBLIC`))
})

test('owner migration preflight rejects before any pending SQL begins', async () => {
  const input = fixture(2)
  const ledger = input.bundle.entries.slice(0, TARGET.baselineCount).map((entry) => ({
    version: entry.version, name: entry.name,
    checksum_sha256: entry.appliedSha256, source_revision: 'prior',
  }))
  let began = false
  const database = { async query(sql) {
    if (sql.startsWith('SELECT current_database')) return { rows: [{
      database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17,
      migratorMember: true, runtimeCanCreateCore: false }] }
    if (sql.includes('unnest(')) return { rows: TARGET.siblingCoreSchemas.map(
      (schema_name) => ({ schema_name, can_use: false })) }
    if (sql.includes('FROM pg_catalog.pg_class')) return { rows: [{ exists: true }] }
    if (sql.includes('ORDER BY applied_at')) return { rows: ledger }
    if (sql === 'BEGIN') began = true
    return { rows: [] }
  } }
  await assert.rejects(executeProductionMigration({ bundle: input.bundle,
    database, target: TARGET, sourceRevision: H40,
    denyDatabaseConnect: async () => true,
    beforePending: async (pending) => {
      assert.equal(pending.length, 2)
      throw new Error('QUIESCENCE_REQUIRED')
    },
  }), /QUIESCENCE_REQUIRED/u)
  assert.equal(began, false)
})

function cleanupRunnerFixture({ binding = true, applied = 33, operationPatch = {}, operationGeneration = '123456789', cleanupFailure = false } = {}) {
  const input = fixture(19)
  const last = input.bundle.entries.at(-1)
  Object.assign(last, { path: UNLINKED_PROFILE_CLEANUP_PATH, name: 'dev121_unlinked_legacy_profile_cleanup', version: 'ai-pdm-084' })
  const privateOperation = { schemaVersion: 'ai-pdm.unlinked-profile-cleanup-operation.v1', ownerApplicationId: 'ai-pdm', sourceRevision: H40,
    migrationSourceSha256: last.sourceSha256, operationId: '22222222-2222-4222-8222-222222222222',
    targetProfileId: 'synthetic-unused-profile', targetCompanyId: 'synthetic-company', ...operationPatch }
  const operationBytes = Buffer.from(JSON.stringify(privateOperation))
  const operationRef = { uri: `gs://${TARGET.releaseBucket}/${UNLINKED_PROFILE_CLEANUP_PREFIX}/22222222-2222-4222-8222-222222222222.json`, generation: '123456789', sha256: sha256(operationBytes) }
  if (binding) input.bundle.unlinkedProfileCleanupRef = operationRef
  const core = { ...input.bundle }; delete core.manifestSha256
  input.bundle.manifestSha256 = sha256(canonicalize(core))
  input.bytes = Buffer.from(canonicalize(input.bundle) + '\n')
  input.bundleSha256 = sha256(input.bytes)
  const bundleUri = `gs://${TARGET.releaseBucket}/source/migration-bundles/synthetic-test.json`
  const outputUri = `gs://${TARGET.releaseBucket}/receipts/synthetic-test/migrate.json`
  const objects = new Map([[bundleUri, { bytes: input.bytes, generation: '101' }], [operationRef.uri, { bytes: operationBytes, generation: operationGeneration }]])
  const state = { ledger: input.bundle.entries.slice(0, applied).map(entry => ({ version: entry.version, name: entry.name, checksum_sha256: entry.appliedSha256, source_revision: H40 })),
    genericInstalled: applied === 34, cleanupCalls: 0, deleted: false, connects: 0, statements: [], requests: [] }
  let transaction = null
  const fetchImpl = async (url, options = {}) => {
    state.requests.push({ url, method: options.method ?? 'GET' })
    if (url === 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token') return Response.json({ access_token: 'synthetic-opaque-token-only-for-memory-test', expires_in: 3600 })
    const parsed = new URL(url)
    const marker = parsed.pathname.includes('/upload/') ? /\/b\/([^/]+)\/o$/u : /\/b\/([^/]+)\/o\/(.+)$/u
    const match = marker.exec(parsed.pathname)
    assert.ok(match)
    const objectName = parsed.searchParams.get('name') ?? decodeURIComponent(match[2])
    const uri = `gs://${decodeURIComponent(match[1])}/${objectName}`
    if (options.method === 'POST') {
      assert.equal(parsed.searchParams.get('ifGenerationMatch'), '0')
      if (objects.has(uri)) return new Response('', { status: 412 })
      objects.set(uri, { bytes: Buffer.from(options.body), generation: '999' })
      return Response.json({ generation: '999' })
    }
    const object = objects.get(uri)
    if (!object) return new Response('', { status: 404 })
    if (parsed.searchParams.get('generation') && parsed.searchParams.get('generation') !== object.generation) return new Response('', { status: 404 })
    return parsed.searchParams.get('alt') === 'media'
      ? new Response(object.bytes) : Response.json({ generation: object.generation, crc32c: crc32cBase64(object.bytes) })
  }
  class Client {
    constructor(options) { this.options = options }
    async connect() {
      state.connects++
      if (this.options.database !== 'jenfu_prod') throw Error('synthetic-cross-database-denial')
    }
    async end() {}
    async query(sql, parameters) {
      state.statements.push({ sql, parameters })
      if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17, migratorMember: true, runtimeCanCreateCore: false }] }
      if (sql.includes('unnest(')) return { rows: TARGET.siblingCoreSchemas.map(schema_name => ({ schema_name, can_use: false })) }
      if (sql.includes('FROM pg_catalog.pg_class')) return { rows: [{ exists: true }] }
      if (sql.includes('ORDER BY applied_at')) return { rows: state.ledger.map(row => ({ ...row })) }
      if (sql === 'BEGIN') transaction = { ledger: state.ledger.map(row => ({ ...row })), genericInstalled: state.genericInstalled, deleted: state.deleted }
      if (sql === 'SELECT 34;\n') state.genericInstalled = true
      if (sql.startsWith('SELECT ai_pdm_core.delete_unlinked_legacy_profile_v1')) {
        state.cleanupCalls++
        assert.equal(state.genericInstalled, true)
        assert.ok(transaction)
        assert.equal(sql.includes(privateOperation.targetProfileId), false)
        assert.deepEqual(parameters.slice(0, 3), [privateOperation.targetProfileId, privateOperation.targetCompanyId, privateOperation.operationId])
        assert.deepEqual(JSON.parse(parameters[3]), { sourceRevision: H40, inputSha256: operationRef.sha256 })
        if (cleanupFailure) throw Error('synthetic-private-native-error')
        const status = state.deleted ? 'REPLAYED' : 'DELETED'
        state.deleted = true
        return { rows: [{ result: { status, auditId: 'dev121-unlinked-profile-cleanup-v2-' + 'c'.repeat(64), priorRowSha256: 'd'.repeat(64) } }] }
      }
      if (sql.startsWith('INSERT INTO')) state.ledger.push({ version: parameters[0], name: parameters[1], checksum_sha256: parameters[2], source_revision: parameters[3] })
      if (sql === 'COMMIT') transaction = null
      if (sql === 'ROLLBACK') { if (transaction) Object.assign(state, transaction); transaction = null }
      return { rows: [] }
    }
  }
  const argv = ['--bundle-ref', bundleUri, '--bundle-sha256', input.bundleSha256, '--source-revision', H40, '--output-ref', outputUri]
  return { state, input, operationRef, objects, outputUri, run: () => runMain({ argv, environment, fetchImpl, Client }) }
}

test('private runner binding executes inside pending 084 before ledger commit and publishes only bounded private receipt', async () => {
  const h = cleanupRunnerFixture()
  const output = await h.run()
  assert.equal(output.status, 'PASS')
  assert.equal(output.applied, 1)
  assert.equal(h.state.cleanupCalls, 1)
  assert.equal(h.state.ledger.length, 34)
  const statements = h.state.statements.map(row => row.sql)
  const cleanupIndex = statements.findIndex(sql => sql.startsWith('SELECT ai_pdm_core.delete_unlinked_legacy_profile_v1'))
  const ledgerIndex = statements.findIndex(sql => sql.startsWith('INSERT INTO'))
  assert.ok(statements.lastIndexOf('BEGIN', cleanupIndex) < cleanupIndex)
  assert.ok(cleanupIndex < ledgerIndex)
  assert.equal(statements[ledgerIndex + 1], 'COMMIT')
  const published = JSON.parse(h.objects.get(h.outputUri).bytes.toString())
  assert.deepEqual(published.unlinkedProfileCleanup.operationRef, h.operationRef)
  assert.equal(published.unlinkedProfileCleanup.result.status, 'DELETED')
  assert.equal(JSON.stringify(published).includes('synthetic-unused-profile'), false)
  assert.equal(JSON.stringify(published).includes('targetCompanyId'), false)
  assert.ok(h.state.requests.some(row => row.url.includes(encodeURIComponent(h.operationRef.uri.split('/').slice(3).join('/'))) && row.url.includes('generation=123456789')))
})

test('private runner binding replays an already installed 084 in a short transaction under native migration lock', async () => {
  const h = cleanupRunnerFixture({ applied: 34 })
  h.state.deleted = true
  const output = await h.run()
  assert.equal(output.applied, 0)
  assert.equal(output.replayed, 34)
  assert.equal(output.unlinkedProfileCleanup.result.status, 'REPLAYED')
  assert.equal(h.state.cleanupCalls, 1)
  assert.equal(h.state.ledger.length, 34)
  const statements = h.state.statements.map(row => row.sql)
  const cleanupIndex = statements.findIndex(sql => sql.startsWith('SELECT ai_pdm_core.delete_unlinked_legacy_profile_v1'))
  const unlockIndex = statements.findIndex(sql => sql.includes('pg_advisory_unlock'))
  assert.equal(statements.filter(sql => sql === 'BEGIN').length, 1)
  assert.equal(statements.includes('SELECT 34;\n'), false)
  assert.ok(cleanupIndex < unlockIndex)
})

test('no private binding installs only generic 084 and never reads a target operation or executes a deletion', async () => {
  const h = cleanupRunnerFixture({ binding: false })
  const output = await h.run()
  assert.equal(output.applied, 1)
  assert.equal(output.unlinkedProfileCleanup, undefined)
  assert.equal(h.state.cleanupCalls, 0)
  assert.equal(h.state.deleted, false)
  assert.equal(h.state.requests.some(row => row.url.includes('unlinked-profile-cleanup')), false)
})

test('private operation mismatches fail before opening the database connection', async () => {
  for (const options of [{ operationGeneration: '123456790' }, { operationPatch: { sourceRevision: 'e'.repeat(40) } },
    { operationPatch: { migrationSourceSha256: 'f'.repeat(64) } }, { operationPatch: { targetProfileId: ['synthetic-one', 'synthetic-two'] } }]) {
    const h = cleanupRunnerFixture(options)
    await assert.rejects(h.run(), /UNLINKED_PROFILE_CLEANUP/u)
    assert.equal(h.state.connects, 0)
    assert.equal(h.state.cleanupCalls, 0)
    assert.equal(h.objects.has(h.outputUri), false)
  }
})

test('failed private cleanup rolls back pending generic migration and ledger without exposing SQL payload', async () => {
  const h = cleanupRunnerFixture({ cleanupFailure: true })
  await assert.rejects(h.run(), { code: 'UNLINKED_PROFILE_CLEANUP_EXECUTION_FAILED', message: 'UNLINKED_PROFILE_CLEANUP_EXECUTION_FAILED' })
  assert.equal(h.state.ledger.length, 33)
  assert.equal(h.state.genericInstalled, false)
  assert.equal(h.state.deleted, false)
  assert.equal(h.state.statements.some(row => row.sql === 'ROLLBACK'), true)
  assert.equal(h.objects.has(h.outputUri), false)
})
