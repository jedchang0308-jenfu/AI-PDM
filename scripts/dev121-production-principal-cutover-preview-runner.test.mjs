import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { runMain } from './dev121-production-principal-cutover-preview-runner.mjs'
import {
  assertCutoverPreviewOperation, summarizeCutoverPreview,
} from './lib/dev121-principal-cutover-preview-runner.mjs'
import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'

const revision = 'a'.repeat(40)
const digest = (value) => createHash('sha256').update(value).digest('hex')
const source = {
  pdmUserId: 'pdm-one', companyId: 'company-jenfu', principalId: 'principal-one',
  employeeId: 'employee-one', sourceKind: 'firebase_mapping',
  identityIssuer: 'https://securetoken.google.com/jenfu-platform-prod',
  identitySubject: 'uid-one', mappingVersion: 1,
  publishedAt: '2026-09-25T00:00:00.000Z',
}
const operation = () => ({
  schemaVersion: 'ai-pdm.principal-cutover-preview-operation.v1',
  operationId: 'DEV121-CUTOVER-PREVIEW-ONE', sourceRevision: revision,
  projectId: 'jenfu-platform-prod', region: 'asia-east1',
  database: 'jenfu_prod', applicationId: 'ai-pdm',
  firebaseProjectId: 'jenfu-platform-prod', sourceSets: [[source]],
  sourceRevisions: { platform: 'b'.repeat(40), orgmaster: 'c'.repeat(40), aiPdm: revision },
  contractManifestHashes: { platform: 'd'.repeat(64), orgmaster: 'e'.repeat(64), aiPdm: 'f'.repeat(64) },
})
const environment = {
  OWNER_APPLICATION_ID: 'ai-pdm',
  RELEASE_BUCKET: 'jenfu-platform-prod-aipdm-release',
  GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1',
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  POSTGRES_DATABASE: 'jenfu_prod',
  POSTGRES_IAM_LOGIN: 'aipdm-prod-migrator@jenfu-platform-prod.iam',
  POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  CLOUD_RUN_JOB: 'ai-pdm-prod-dev121-principal-cutover-preview', PDM_SOURCE_REVISION: revision,
}
const inputRef = 'gs://jenfu-platform-prod-aipdm-release/source/production-data/dev121/principal-cutover-preview/one.json'
const outputRef = 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV121-PRINCIPAL-CUTOVER-PREVIEW/one.json'

test('preview operation binds exact owner target and rejects alias or source ambiguity', () => {
  const bytes = Buffer.from(JSON.stringify(operation()))
  const context = { bytes, operationSha256: digest(bytes), sourceRevision: revision }
  assert.deepEqual(assertCutoverPreviewOperation(operation(), context), operation())
  for (const changed of [
    { ...operation(), email: 'guess@example.com' },
    { ...operation(), projectId: 'unrelated-project' },
    { ...operation(), sourceRevisions: { ...operation().sourceRevisions, aiPdm: '9'.repeat(40) } },
    { ...operation(), sourceSets: [[source], [source]] },
    { ...operation(), sourceSets: [[source, source]] },
    { ...operation(), sourceSets: [[{ ...source, principalId: 'pdm:one' }]] },
    { ...operation(), sourceSets: [[{ ...source, identityIssuer: 'https://accounts.google.com' }]] },
    { ...operation(), sourceSets: [[{ ...source, mappingVersion: 0 }]] },
  ]) {
    assert.throws(() => assertCutoverPreviewOperation(changed, context),
      /DEV121_CUTOVER_PREVIEW_/)
  }
  assert.throws(() => assertCutoverPreviewOperation(operation(), {
    ...context, operationSha256: '0'.repeat(64),
  }), /HASH_MISMATCH/)
})

test('summary cannot claim apply authority and requires complete source hashes', () => {
  const envelope = {
    cutoverAt: '2026-09-25T04:00:00.000Z', cohort: [{ pdmUserId: 'pdm-one',
      principalId: 'principal-one', sourceCount: 1 }],
    cohortHash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), inputHash: 'c'.repeat(64),
    localSourceHash: 'd'.repeat(64), producerSourceHash: 'e'.repeat(64),
    graphCheck: { graphHash: 'f'.repeat(64) },
    workspaceShadow: { shadowHash: '1'.repeat(64), status: 'requires_resource_adapter' },
    plan: { planHash: '2'.repeat(64) },
  }
  assert.deepEqual(summarizeCutoverPreview(envelope), {
    cutoverAt: envelope.cutoverAt, cohort: envelope.cohort,
    cohortHash: envelope.cohortHash, sourceHash: envelope.sourceHash,
    inputHash: envelope.inputHash, localSourceHash: envelope.localSourceHash,
    producerSourceHash: envelope.producerSourceHash, graphHash: envelope.graphCheck.graphHash,
    workspaceShadow: envelope.workspaceShadow, planHash: envelope.plan.planHash,
    sourceBindingsAttested: false, applyAllowed: false,
  })
  assert.throws(() => summarizeCutoverPreview({ ...envelope, producerSourceHash: null }),
    /OUTCOME_INVALID/)
  assert.throws(() => summarizeCutoverPreview({ ...envelope, plan: { planHash: null } }),
    /OUTCOME_INVALID/)
  assert.throws(() => summarizeCutoverPreview({ ...envelope,
    workspaceShadow: { ...envelope.workspaceShadow, status: 'unknown' } }),
  /OUTCOME_INVALID/)
})

test('owner job previews in one read-only RR transaction and publishes non-apply receipt', async () => {
  const body = Buffer.from(JSON.stringify(operation()))
  let receiptBytes
  const fetchImpl = async (url, options = {}) => {
    if (url.startsWith('http://metadata.google.internal/')) {
      return new Response(JSON.stringify({ access_token: 'x'.repeat(25), expires_in: 3600 }))
    }
    const isReceipt = url.includes('DEV121-PRINCIPAL-CUTOVER-PREVIEW')
    if (isReceipt && !receiptBytes && options.method !== 'POST') {
      return new Response('', { status: 404 })
    }
    if (url.startsWith('https://storage.googleapis.com/upload/')) {
      receiptBytes = Buffer.from(options.body)
      return new Response(JSON.stringify({ generation: '2' }))
    }
    const bytes = isReceipt ? receiptBytes : body
    if (url.includes('?alt=media')) return new Response(bytes)
    return new Response(JSON.stringify({ generation: isReceipt ? '2' : '1',
      crc32c: crc32cBase64(bytes) }))
  }
  const queries = []
  class Client {
    async connect() {}
    async query(query) {
      queries.push(query)
      if (typeof query === 'string' && query.includes('current_database()')) {
        return { rows: [{ database: 'jenfu_prod', login: environment.POSTGRES_IAM_LOGIN,
          major: 17, migrator_member: true, schema_ready: true }] }
      }
      if (typeof query === 'object' && query.text.includes('transaction_timestamp()')) {
        return { rows: [{ cutover_at: '2026-09-25T04:00:00.000Z' }] }
      }
      return { rows: [] }
    }
    async end() {}
  }
  let calls = 0
  const loadPreview = async () => ({ previewPrincipalCutoverSourceEnvelopeInSnapshot:
    async (_snapshot, input) => {
      calls += 1
      assert.equal(input.cutoverAt, '2026-09-25T04:00:00.000Z')
      assert.deepEqual(input.sourceSets, [[source]])
      return {
        cutoverAt: input.cutoverAt, cohort: [{ pdmUserId: 'pdm-one',
          principalId: 'principal-one', sourceCount: 1 }],
        cohortHash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), inputHash: 'c'.repeat(64),
        localSourceHash: 'd'.repeat(64), producerSourceHash: 'e'.repeat(64),
        graphCheck: { graphHash: 'f'.repeat(64) },
        workspaceShadow: { shadowHash: '1'.repeat(64), status: 'pass' },
        plan: { planHash: '2'.repeat(64) },
      }
    } })
  const result = await runMain({
    argv: ['--operation-ref', inputRef, '--operation-sha256', digest(body),
      '--source-revision', revision, '--output-ref', outputRef],
    environment, fetchImpl, Client, loadPreview,
  })
  assert.equal(calls, 1)
  assert.equal(result.status, 'READ_ONLY_PREVIEW')
  assert.equal(result.outcome.applyAllowed, false)
  assert.equal(result.reused, false)
  assert.equal(JSON.parse(receiptBytes).outcome.sourceBindingsAttested, false)
  assert.equal(queries.filter((query) => query === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length, 1)
  assert.ok(queries.includes('COMMIT'))
  assert.ok(!queries.some((query) => /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/iu.test(
    typeof query === 'string' ? query : query.text)))
  const replay = await runMain({
    argv: ['--operation-ref', inputRef, '--operation-sha256', digest(body),
      '--source-revision', revision, '--output-ref', outputRef],
    environment, fetchImpl, Client, loadPreview,
  })
  assert.equal(replay.reused, true)
  assert.equal(replay.outputSha256, result.outputSha256)
  assert.equal(calls, 1)
  assert.equal(queries.filter((query) => query === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length, 1)
  receiptBytes = Buffer.from(JSON.stringify({ ...JSON.parse(receiptBytes),
    operationId: 'DEV121-CUTOVER-PREVIEW-OTHER' }))
  await assert.rejects(runMain({
    argv: ['--operation-ref', inputRef, '--operation-sha256', digest(body),
      '--source-revision', revision, '--output-ref', outputRef],
    environment, fetchImpl, Client, loadPreview,
  }), /DEV121_CUTOVER_PREVIEW_RECEIPT_CONFLICT/)
  assert.equal(calls, 1)
})
