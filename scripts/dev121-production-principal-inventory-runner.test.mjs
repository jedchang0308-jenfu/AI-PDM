import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { runMain } from './dev121-production-principal-inventory-runner.mjs'
import {
  assertInventoryDatabaseTarget, assertInventoryOperation,
  inventoryDatabaseAdapter, parseInventoryArgs,
} from './lib/dev121-principal-inventory-runner.mjs'
import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'

const revision = 'a'.repeat(40)
const hash = (value) => createHash('sha256').update(value).digest('hex')
const source = {
  pdmUserId: 'pdm-one', companyId: 'company-one', principalId: 'principal-one',
  employeeId: 'employee-one', sourceKind: 'firebase_mapping',
  identityIssuer: 'https://securetoken.google.com/jenfu-platform-prod',
  identitySubject: 'provider-one', mappingVersion: 1,
  publishedAt: '2026-09-25T00:00:00.000Z',
}
const operation = (mode = 'preview') => ({
  schemaVersion: 'ai-pdm.principal-inventory-operation.v1',
  operationId: 'DEV121-INV-ONE', mode, sourceRevision: revision,
  projectId: 'jenfu-platform-prod', region: 'asia-east1', database: 'jenfu_prod',
  applicationId: 'ai-pdm', firebaseProjectId: mode === 'coverage' ? null : 'jenfu-platform-prod',
  sources: mode === 'coverage' ? [] : [source],
  expectedSourceHash: mode === 'register' ? 'b'.repeat(64) : null,
  expectedRowVersion: mode === 'register' ? 0 : null,
})
const environment = {
  OWNER_APPLICATION_ID: 'ai-pdm',
  RELEASE_BUCKET: 'jenfu-platform-prod-aipdm-release',
  GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1',
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  POSTGRES_DATABASE: 'jenfu_prod',
  POSTGRES_IAM_LOGIN: 'aipdm-prod-migrator@jenfu-platform-prod.iam',
  POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  CLOUD_RUN_JOB: 'ai-pdm-prod-dev121-principal-inventory', PDM_SOURCE_REVISION: revision,
}
const inputRef = 'gs://jenfu-platform-prod-aipdm-release/source/migration-bundles/dev121/principal-inventory/one.json'
const outputRef = 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV121-PRINCIPAL-INVENTORY/one.json'

test('operation is source-frozen, exact-target, principal-only and has no email fallback', async () => {
  const bytes = Buffer.from(JSON.stringify(operation()))
  const context = { bytes, operationSha256: hash(bytes), sourceRevision: revision }
  assert.deepEqual(assertInventoryOperation(operation(), context), operation())
  const coverageBytes = Buffer.from(JSON.stringify(operation('coverage')))
  assert.equal(assertInventoryOperation(operation('coverage'), {
    bytes: coverageBytes, operationSha256: hash(coverageBytes), sourceRevision: revision,
  }).mode, 'coverage')
  for (const changed of [
    { ...operation(), email: 'guess@example.com' },
    { ...operation(), projectId: 'other-project' },
    { ...operation(), sources: [{ ...source, identityIssuer: 'https://accounts.google.com' }] },
    { ...operation(), sources: [source, source] },
    { ...operation(), sources: [{ ...source, mappingVersion: 0 }] },
    { ...operation(), sources: [{ ...source, principalId: 'pdm:pdm-one' }] },
    { ...operation(), expectedSourceHash: 'b'.repeat(64) },
  ]) {
    assert.throws(() => assertInventoryOperation(changed, context), /DEV121_/)
  }
  assert.throws(() => assertInventoryOperation(operation(),
    { ...context, operationSha256: 'c'.repeat(64) }), /HASH_MISMATCH/)
  assert.throws(() => parseInventoryArgs(['--operation-ref', inputRef]), /ARGUMENT_INVALID/)
  await assert.rejects(runMain({ argv: ['--operation-ref',
    'gs://jenfu-platform-prod-aipdm-release/source/production-data/dev121/principal-inventory/one.json',
    '--operation-sha256', hash(coverageBytes), '--source-revision', revision,
    '--output-ref', outputRef], environment }), /MIGRATION_GCS_/u)
})

test('adapter keeps named SQL and all repository reads within one RR transaction', async () => {
  const calls = []
  const database = { query: async (input) => {
    calls.push(input)
    return { rows: [{ ok: true }] }
  } }
  const adapter = inventoryDatabaseAdapter(database)
  const result = await adapter.transaction(async (client) => client.queryOne(
    'SELECT :id::text AS id WHERE :id=:other', { id: 'pdm-one', other: 'pdm-two' }),
  { isolationLevel: 'repeatable_read', readOnly: true })
  assert.deepEqual(result, { ok: true })
  assert.equal(calls[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.deepEqual(calls[1], { text: 'SELECT $1::text AS id WHERE $1=$2',
    values: ['pdm-one', 'pdm-two'] })
  assert.equal(calls[2], 'COMMIT')
  await assert.rejects(adapter.transaction(async () => { throw new Error('drift') },
    { isolationLevel: 'repeatable_read', readOnly: false }), /drift/)
  assert.equal(calls.at(-1), 'ROLLBACK')
  await assert.rejects(adapter.query('SELECT :missing'), /SQL_PARAMETER_MISSING/)
})

test('database readback rejects wrong login before owner mutation', async () => {
  const good = { database: 'jenfu_prod', login: environment.POSTGRES_IAM_LOGIN,
    major: 17, migrator_member: true, schema_ready: true }
  const database = { query: async () => ({ rows: [good] }) }
  assert.deepEqual(await assertInventoryDatabaseTarget(database, good.login),
    { database: good.database, login: good.login, major: 17 })
  database.query = async () => ({ rows: [{ ...good, login: 'other' }] })
  await assert.rejects(assertInventoryDatabaseTarget(database, good.login), /DATABASE_TARGET_MISMATCH/)
})

test('register receipt is byte-identical after an unknown-outcome retry', async () => {
  const body = Buffer.from(JSON.stringify(operation('register')))
  const output = { bytes: null, generation: '2' }
  const fetchImpl = async (url, options = {}) => {
    if (url.startsWith('http://metadata.google.internal/')) {
      return new Response(JSON.stringify({ access_token: 'x'.repeat(25), expires_in: 3600 }))
    }
    if (url.startsWith('https://storage.googleapis.com/upload/')) {
      if (output.bytes) return new Response('', { status: 412 })
      output.bytes = Buffer.from(options.body)
      return new Response(JSON.stringify({ generation: output.generation }))
    }
    const readOutput = url.includes('DEV121-PRINCIPAL-INVENTORY')
    const bytes = readOutput ? output.bytes : body
    if (!bytes) return new Response('', { status: 404 })
    if (url.includes('?alt=media')) return new Response(bytes)
    return new Response(JSON.stringify({ generation: readOutput ? output.generation : '1',
      crc32c: crc32cBase64(bytes) }))
  }
  class Client {
    async connect() {}
    async query() { return { rows: [{ database: 'jenfu_prod',
      login: environment.POSTGRES_IAM_LOGIN, major: 17,
      migrator_member: true, schema_ready: true }] } }
    async end() {}
  }
  let calls = 0
  const loadInventory = async () => ({ registerPrincipalInventory: async () => ({
    pdmUserId: source.pdmUserId, principalId: source.principalId,
    status: 'legacy_compatible', sourceHash: 'b'.repeat(64),
    rowVersion: 1, replayed: calls++ > 0,
  }) })
  const argv = ['--operation-ref', inputRef, '--operation-sha256', hash(body),
    '--source-revision', revision, '--output-ref', outputRef]
  const first = await runMain({ argv, environment, fetchImpl, Client, loadInventory })
  const replay = await runMain({ argv, environment, fetchImpl, Client, loadInventory })
  assert.equal(calls, 2)
  assert.equal(first.outputSha256, replay.outputSha256)
  assert.equal(replay.outcome.replayed, undefined)
  assert.equal(JSON.parse(output.bytes).outcome.sourceHash, 'b'.repeat(64))
})

test('coverage mode reads every profile without invoking a registration writer', async () => {
  const body = Buffer.from(JSON.stringify(operation('coverage')))
  let receiptBytes
  const fetchImpl = async (url, options = {}) => {
    if (url.startsWith('http://metadata.google.internal/')) {
      return new Response(JSON.stringify({ access_token: 'x'.repeat(25), expires_in: 3600 }))
    }
    if (url.startsWith('https://storage.googleapis.com/upload/')) {
      receiptBytes = Buffer.from(options.body)
      return new Response(JSON.stringify({ generation: '2' }))
    }
    const isReceipt = url.includes('DEV121-PRINCIPAL-INVENTORY')
    const bytes = isReceipt ? receiptBytes : body
    if (url.includes('?alt=media')) return new Response(bytes)
    return new Response(JSON.stringify({ generation: isReceipt ? '2' : '1',
      crc32c: crc32cBase64(bytes) }))
  }
  class Client {
    async connect() {}
    async query() { return { rows: [{ database: 'jenfu_prod',
      login: environment.POSTGRES_IAM_LOGIN, major: 17,
      migrator_member: true, schema_ready: true }] } }
    async end() {}
  }
  let called = 0
  const argv = ['--operation-ref', inputRef, '--operation-sha256', hash(body),
    '--source-revision', revision, '--output-ref', outputRef]
  const result = await runMain({ argv, environment, fetchImpl, Client,
    loadInventory: () => { throw new Error('unexpected registration path') },
    loadCoverage: async () => ({ previewPrincipalInventoryCoverage: async () => {
      called += 1
      return { schemaVersion: 'ai-pdm.principal-inventory-coverage.v1',
        profiles: [], totalProfiles: 0, activeProfiles: 0,
        activePrincipalProfiles: 0, activeUnresolvedProfiles: 0 }
    } }),
  })
  assert.equal(called, 1)
  assert.equal(result.mode, 'coverage')
  assert.equal(JSON.parse(receiptBytes).outcome.activeUnresolvedProfiles, 0)
})
