import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  UNLINKED_PROFILE_CLEANUP_PREFIX, UNLINKED_PROFILE_CLEANUP_PATH,
  assertUnlinkedProfileCleanupRef, assertUnlinkedProfileCleanupEntry,
  assertUnlinkedProfileCleanupBundleBinding, assertUnlinkedProfileCleanupOperation,
  verifyUnlinkedProfileCleanupReadback, readUnlinkedProfileCleanupOperation,
  executeUnlinkedProfileCleanup, assertUnlinkedProfileCleanupResult,
  unlinkedProfileCleanupReceipt, assertUnlinkedProfileCleanupReceipt,
} from './dev121-unlinked-profile-cleanup.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceRevision = 'a'.repeat(40)
const migrationSourceSha256 = 'b'.repeat(64)
const operationId = '11111111-1111-4111-8111-111111111111'
const value = { schemaVersion: 'ai-pdm.unlinked-profile-cleanup-operation.v1', ownerApplicationId: 'ai-pdm',
  sourceRevision, migrationSourceSha256, operationId, targetProfileId: 'synthetic-unused-profile', targetCompanyId: 'synthetic-company' }
const bytes = Buffer.from(JSON.stringify(value))
const ref = { uri: `gs://jenfu-platform-prod-aipdm-release/${UNLINKED_PROFILE_CLEANUP_PREFIX}/${operationId}.json`, generation: '123456789', sha256: hash(bytes) }
const entry = { order: 34, version: 'ai-pdm-084', name: 'dev121_unlinked_legacy_profile_cleanup', path: UNLINKED_PROFILE_CLEANUP_PATH, sourceSha256: migrationSourceSha256 }
const binding = { ownerApplicationId: 'ai-pdm', sourceRevision, entries: [entry], unlinkedProfileCleanupRef: ref }
const result = { status: 'DELETED', auditId: `dev121-unlinked-profile-cleanup-v2-${'c'.repeat(64)}`, priorRowSha256: 'd'.repeat(64) }

// This process uses synthetic in-memory fixtures only: no server, ports, data or
// repository runtime directory, provider writes, credential reads or account edits.
test('private cleanup binding accepts exactly one reviewed migration and no extra selectors', () => {
  assert.equal(assertUnlinkedProfileCleanupRef(ref), ref)
  assert.equal(assertUnlinkedProfileCleanupEntry([entry]), entry)
  assert.equal(assertUnlinkedProfileCleanupBundleBinding(binding, ref), entry)
  assert.equal(assertUnlinkedProfileCleanupBundleBinding({ ownerApplicationId: 'ai-pdm' }), null)
  for (const wrong of [ { ...ref, uri: ref.uri.replace('aipdm-release', 'platform-release') },
    { ...ref, uri: ref.uri.replace(UNLINKED_PROFILE_CLEANUP_PREFIX, 'receipts') },
    { ...ref, generation: 123 }, { ...ref, generation: '0' }, { ...ref, extra: true }, { ...ref, sha256: [ref.sha256] },
    { ...ref, uri: ref.uri.replace('.json', '/../op.json') }, { ...ref, sha256: 'g'.repeat(64) } ]) {
    assert.throws(() => assertUnlinkedProfileCleanupRef(wrong), { code: 'UNLINKED_PROFILE_CLEANUP_REF_INVALID' })
  }
  for (const wrong of [{ ...entry, order: 33 }, { ...entry, path: 'db/postgres/085_another.sql' },
    { ...entry, version: 'ai-pdm-085' }, { ...entry, name: 'other' }, { ...entry, sourceSha256: '' }]) {
    assert.throws(() => assertUnlinkedProfileCleanupEntry([wrong]), { code: 'UNLINKED_PROFILE_CLEANUP_ENTRY_INVALID' })
  }
  assert.throws(() => assertUnlinkedProfileCleanupEntry([entry, entry]), { code: 'UNLINKED_PROFILE_CLEANUP_ENTRY_INVALID' })
  for (const wrong of [{ ...binding, ownerApplicationId: 'platform' }, { ...binding, unlinkedProfileCleanupRef: { ...ref, generation: '2' } }]) {
    assert.throws(() => assertUnlinkedProfileCleanupBundleBinding(wrong, ref), /UNLINKED_PROFILE_CLEANUP_BUNDLE_MISMATCH/u)
  }
  assert.throws(() => assertUnlinkedProfileCleanupBundleBinding({ ownerApplicationId: 'ai-pdm' }, ref), /BUNDLE_MISMATCH/u)
  assert.throws(() => assertUnlinkedProfileCleanupBundleBinding(binding, undefined), /REF_INVALID/u)
})

test('private operation exact schema preserves source/hash boundaries and refuses list or command inputs', () => {
  assert.equal(assertUnlinkedProfileCleanupOperation(value, { sourceRevision, migrationSourceSha256 }), value)
  const mutations = [ { extra: true }, { ownerApplicationId: 'platform' }, { sourceRevision: 'e'.repeat(40) },
    { migrationSourceSha256: 'f'.repeat(64) }, { operationId: 'not-a-uuid' }, { operationId: [operationId] }, { operationId: operationId.toUpperCase().replace('1111', 'ABCD') },
    { targetProfileId: ['synthetic-unused-profile'] }, { targetProfileId: '' }, { targetProfileId: '   ' },
    { targetProfileId: 'x'.repeat(513) }, { targetProfileId: 'synthetic\u0000profile' }, { targetProfileId: 'synthetic\nprofile' },
    { targetCompanyId: null }, { targetCompanyId: 'synthetic\u0085company' }, { targetCompanyId: {} },
    { sql: 'SELECT 1' }, { schema: 'other_schema' }, { targetProfiles: ['one', 'two'] }, { userId: 'synthetic' } ]
  for (const mutation of mutations) assert.throws(() => assertUnlinkedProfileCleanupOperation({ ...value, ...mutation }, { sourceRevision, migrationSourceSha256 }), { code: 'UNLINKED_PROFILE_CLEANUP_OPERATION_INVALID' })
  assert.throws(() => assertUnlinkedProfileCleanupOperation([], { sourceRevision, migrationSourceSha256 }), /OPERATION_INVALID/u)
})

test('private operation verifies bytes, exact immutable generation, bounded payload and redacted read errors', async () => {
  const operation = verifyUnlinkedProfileCleanupReadback({ ref, bytes, generation: ref.generation, sourceRevision, migrationSourceSha256 })
  assert.deepEqual(operation.value, value)
  for (const bad of [ { generation: '987' }, { bytes: Buffer.from('changed') }, { bytes: Buffer.alloc(8193) }, { bytes: 'untrusted text' } ]) {
    assert.throws(() => verifyUnlinkedProfileCleanupReadback({ ref, bytes, generation: ref.generation, sourceRevision, migrationSourceSha256, ...bad }), { code: 'UNLINKED_PROFILE_CLEANUP_READBACK_INVALID' })
  }
  const invalid = Buffer.from('{')
  assert.throws(() => verifyUnlinkedProfileCleanupReadback({ ref: { ...ref, sha256: hash(invalid) }, bytes: invalid, generation: ref.generation, sourceRevision, migrationSourceSha256 }), /OPERATION_INVALID/u)
  await assert.rejects(readUnlinkedProfileCleanupOperation({ ref, sourceRevision, migrationSourceSha256,
    readObject: async () => { throw Error('synthetic-private-payload-must-not-escape') } }), { code: 'UNLINKED_PROFILE_CLEANUP_READ_FAILED', message: 'UNLINKED_PROFILE_CLEANUP_READ_FAILED' })
})

test('parameterized native operation never interpolates selectors and returns no prior profile', async () => {
  const operation = { ref, value: { ...value, targetProfileId: "synthetic'; SELECT 2; --" } }
  const queries = []
  const database = { query: async (sql, parameters) => { queries.push({ sql, parameters }); return { rows: [{ result }] } } }
  const output = await executeUnlinkedProfileCleanup({ database, operation })
  assert.deepEqual(output, result)
  assert.equal(queries.length, 5)
  assert.deepEqual(queries.slice(0, 4).map(row => row.sql), ['SET LOCAL ROLE jenfu_ai_pdm_migrator',
    "SET LOCAL lock_timeout = '2s'", "SET LOCAL statement_timeout = '15s'", "SET LOCAL idle_in_transaction_session_timeout = '30s'"])
  const call = queries.at(-1)
  assert.equal(call.sql, 'SELECT ai_pdm_core.delete_unlinked_legacy_profile_v1($1::text,$2::text,$3::text,$4::jsonb) AS result')
  assert.equal(call.parameters[0], operation.value.targetProfileId)
  assert.equal(call.sql.includes(operation.value.targetProfileId), false)
  assert.deepEqual(JSON.parse(call.parameters[3]), { sourceRevision, inputSha256: ref.sha256 })
  const receipt = unlinkedProfileCleanupReceipt(operation, output)
  assert.deepEqual(Object.keys(receipt).sort(), ['operationRef', 'result'])
  assert.equal(JSON.stringify(receipt).includes(operation.value.targetProfileId), false)
  assert.equal(assertUnlinkedProfileCleanupReceipt(receipt, ref), receipt)
  assert.equal(assertUnlinkedProfileCleanupReceipt(undefined, undefined), null)
  assert.throws(() => assertUnlinkedProfileCleanupReceipt(receipt, undefined), /RECEIPT_INVALID/u)
  assert.throws(() => assertUnlinkedProfileCleanupReceipt(receipt, { ...ref, generation: '2' }), /RECEIPT_INVALID/u)
})

test('native cleanup refuses extra or malformed result data and masks dependency errors', async () => {
  for (const mutation of [{ priorRow: { email: 'synthetic@example.invalid' } }, { status: 'SUCCESS' },
    { auditId: 'unbounded-private-id' }, { auditId: [result.auditId] }, { priorRowSha256: [result.priorRowSha256] }, { priorRowSha256: null }, { priorRowSha256: 'not-a-hash' }]) {
    assert.throws(() => assertUnlinkedProfileCleanupResult({ ...result, ...mutation }), /RESULT_INVALID/u)
  }
  assert.deepEqual(assertUnlinkedProfileCleanupResult({ ...result, status: 'REPLAYED' }), { ...result, status: 'REPLAYED' })
  assert.deepEqual(assertUnlinkedProfileCleanupResult({ ...result, status: 'ABSENT', priorRowSha256: null }), { ...result, status: 'ABSENT', priorRowSha256: null })
  await assert.rejects(executeUnlinkedProfileCleanup({ database: { query: async () => { throw Error('synthetic-private-sql-error') } }, operation: { ref, value } }),
    { code: 'UNLINKED_PROFILE_CLEANUP_EXECUTION_FAILED', message: 'UNLINKED_PROFILE_CLEANUP_EXECUTION_FAILED' })
})

test('migration image closure contains the new helper and its imports use only bundled node modules', () => {
  for (const name of ['migration-runner.Dockerfile', 'principal-inventory.Dockerfile', 'principal-cutover-preview.Dockerfile', 'role-catalog-publisher.Dockerfile']) {
    const docker = readFileSync(new URL(`../../infra/google-cloud/dev-117-production-release/${name}`, import.meta.url), 'utf8')
    assert.match(docker, /^COPY scripts\/lib\/dev121-unlinked-profile-cleanup\.mjs scripts\/lib\/dev121-unlinked-profile-cleanup\.mjs$/mu, name)
  }
  const helper = readFileSync(new URL('./dev121-unlinked-profile-cleanup.mjs', import.meta.url), 'utf8')
  const imports = [...helper.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/gu)].map(row => row[1])
  assert.deepEqual(imports, ['node:crypto'])
})
