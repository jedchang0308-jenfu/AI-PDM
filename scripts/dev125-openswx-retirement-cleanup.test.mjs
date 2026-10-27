import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'

import { bindDiagnosticRef } from './dev117-production-diagnostics.mjs'
import { runMain as runMigrationRunner } from './dev117-production-migration-runner.mjs'
import {
  assertRuntimeReadback,
  listCleanupExecutions,
  submitCleanupOnce,
  summarizeProviderState,
} from './dev125-openswx-retirement-cleanup.mjs'
import {
  assertCleanupOperation,
  buildCleanupOperation,
  executeCleanup,
} from './lib/dev125-openswx-retirement-cleanup.mjs'
import { RUNTIME_STATE_RECEIPT_SCHEMA } from './lib/dev122-preview-openswx-runtime-readback.mjs'
import { canonicalize, crc32cBase64, sha256 } from './lib/dev012-production-migration-runner.mjs'
import { assertObservedCapsule } from './lib/dev121-owner-release-proof.mjs'

const sourceRevision = 'a'.repeat(40)
const migrationRunnerDigest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:${'b'.repeat(64)}`
const runtimeReadbackRef = `gs://jenfu-platform-prod-aipdm-release/receipts/diagnostics/DEV122-PREVIEW-OPENSWX-RUNTIME/${'c'.repeat(64)}/state.json`

function hashValue(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex')
}

function activeRow(overrides = {}) {
  return {
    id: 'job-1', company_id: 'company-1', status: 'running', attempt_count: 1, dispatch_state: 'dispatched', dispatch_generation: 2,
    dispatch_requested_at: '2026-10-27 00:00:00+00', dispatch_request_window_end: null, dispatch_lease_expires_at: null,
    provider_operation: 'operations/run-1', execution_name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata/executions/run-1',
    lease_expires_at: '2026-10-27 00:05:00+00', heartbeat_at: '2026-10-27 00:01:00+00',
    created_at: '2026-10-27 00:00:00+00', updated_at: '2026-10-27 00:01:00+00', ...overrides,
  }
}

function project(row) {
  const { id: _id, company_id: _companyId, ...value } = row
  return value
}

function operationFor(rows) {
  return buildCleanupOperation({ operationId: 'DEV125-RETIRE-CLEANUP', sourceRevision, migrationRunnerDigest, basis: {
    runtimeReadbackRef,
    runtimeReadbackSha256: 'd'.repeat(64),
    pendingCount: rows.length,
    activeRowsSha256: hashValue(rows.map(project)),
  } })
}

class Database {
  constructor(rows = []) { this.rows = structuredClone(rows); this.commands = []; this.rolledBack = false }
  async query(text, values = []) {
    this.commands.push({ text, values })
    if (text === 'ROLLBACK') { this.rolledBack = true; return { rows: [] } }
    if (text.includes('current_database()')) return { rows: [{ database: 'jenfu_prod', login: 'aipdm-prod-migrator@jenfu-platform-prod.iam', major: 17, migrator_member: true, runtime_can_create_core: false }] }
    if (text.includes('to_regclass')) return { rows: [{ relation: 'ai_pdm_core.openswx_metadata_jobs' }] }
    if (text.includes('count(*)::integer AS pending_count')) return { rows: [{ pending_count: this.rows.filter(row => ['queued', 'running'].includes(row.status) || ['due', 'requested', 'dispatched', 'dispatch_unknown'].includes(row.dispatch_state)).length }] }
    if (text.includes('FROM ai_pdm_core.openswx_metadata_jobs') && text.includes('ORDER BY created_at,id')) {
      return { rows: this.rows.filter(row => ['queued', 'running'].includes(row.status) || ['due', 'requested', 'dispatched', 'dispatch_unknown'].includes(row.dispatch_state)).slice(0, 20) }
    }
    if (text.includes('UPDATE ai_pdm_core.openswx_metadata_jobs')) {
      const [id, companyId, status, dispatchState, dispatchGeneration, attemptCount, updatedAt] = values
      const row = this.rows.find(candidate => candidate.id === id && candidate.company_id === companyId && candidate.status === status &&
        candidate.dispatch_state === dispatchState && candidate.dispatch_generation === dispatchGeneration && candidate.attempt_count === attemptCount && candidate.updated_at === updatedAt)
      if (!row) return { rowCount: 0, rows: [] }
      Object.assign(row, { status: 'cancelled', dispatch_state: 'terminal', locked_by: null, lease_expires_at: null, heartbeat_at: null,
        dispatch_lease_expires_at: null, dispatch_request_window_end: null, updated_at: '2026-10-27 01:00:00+00' })
      return { rowCount: 1, rows: [] }
    }
    return { rows: [], rowCount: 0 }
  }
}

test('fixed diagnostic namespace admits only the DEV-125 cleanup path', () => {
  const ref = `gs://jenfu-platform-prod-aipdm-release/source/openswx-dispatch-recovery/dev125-retirement-cleanup/cleanup.json#sha256=${'e'.repeat(64)}`
  assert.deepEqual(bindDiagnosticRef(ref), { operation_uri: ref.split('#')[0], operation_sha256: 'e'.repeat(64), kind: 'openswx-retirement-cleanup' })
  assert.throws(() => bindDiagnosticRef(`gs://jenfu-platform-prod-aipdm-release/source/openswx-recovery/old.json#sha256=${'e'.repeat(64)}`), /REF_INVALID/u)
  const workflow = fs.readFileSync(new URL('../.github/workflows/read-ai-pdm-rd-permission-state-production.yml', import.meta.url), 'utf8')
  assert.match(workflow, /kind == 'openswx-retirement-cleanup'/u)
  assert.match(workflow, /dev125-openswx-retirement-cleanup\.mjs/u)
})

test('cleanup operation is bounded to one exact readback receipt and at most 20 rows', () => {
  const built = operationFor([activeRow()])
  assert.equal(assertCleanupOperation(built.value, { bytes: built.bytes, operationSha256: built.sha256, sourceRevision }).basis.pendingCount, 1)
  assert.throws(() => buildCleanupOperation({ operationId: 'DEV125-RETIRE-CLEANUP', sourceRevision, migrationRunnerDigest,
    basis: { ...built.value.basis, pendingCount: 21 } }), /OPERATION_INVALID/u)
  assert.throws(() => buildCleanupOperation({ operationId: 'DEV125-RETIRE-CLEANUP', sourceRevision, migrationRunnerDigest,
    basis: { ...built.value.basis, sql: 'DELETE FROM anything' } }), /OPERATION_INVALID/u)
})

test('cleanup retires exact sealed rows, preserves provider history, and permits a sealed zero-row no-op', async () => {
  const row = activeRow()
  const database = new Database([row])
  const result = await executeCleanup(database, operationFor([row]).value)
  assert.equal(result.mutatedRowCount, 1)
  assert.equal(result.remainingActiveRowCount, 0)
  assert.equal(database.rows[0].status, 'cancelled')
  assert.equal(database.rows[0].dispatch_state, 'terminal')
  assert.equal(database.rows[0].provider_operation, row.provider_operation)
  assert.equal(database.rows[0].execution_name, row.execution_name)
  assert.equal(database.commands.at(-1).text, 'COMMIT')

  const empty = new Database([])
  const noOp = await executeCleanup(empty, operationFor([]).value)
  assert.equal(noOp.mutatedRowCount, 0)
  assert.equal(noOp.remainingActiveRowCount, 0)
})

test('basis drift is detected before update and rolled back', async () => {
  const sealed = activeRow()
  const database = new Database([activeRow({ dispatch_generation: 3 })])
  await assert.rejects(() => executeCleanup(database, operationFor([sealed]).value), /BASIS_DRIFT/u)
  assert.equal(database.commands.some(row => row.text.includes('UPDATE ai_pdm_core')), false)
  assert.equal(database.rolledBack, true)
})

test('readback binding and provider inventory refuse truncation, enabled dispatch, and active executions', () => {
  const rows = [project(activeRow())]
  const operation = operationFor([activeRow()]).value
  const core = {
    schemaVersion: RUNTIME_STATE_RECEIPT_SCHEMA,
    sourceRevision,
    outputRef: runtimeReadbackRef,
    businessDataMutation: false,
    serviceConfigurationMutation: false,
    provider: { openswxDispatch: { enabled: false } },
    databaseReceipt: { state: { openswx: { pendingCount: 1, activeRowsSha256: hashValue(rows), activeRows: rows, activeRowsTruncated: false } } },
  }
  const receipt = { ...core, receiptSha256: sha256(Buffer.from(canonicalize(core))) }
  assert.equal(assertRuntimeReadback(receipt, operation).databaseReceipt.state.openswx.pendingCount, 1)
  const enabled = structuredClone(core); enabled.provider.openswxDispatch.enabled = true
  enabled.receiptSha256 = sha256(Buffer.from(canonicalize(enabled)))
  assert.throws(() => assertRuntimeReadback(enabled, operation), /READBACK_INVALID/u)

  const scheduler = { name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/aipdm-prod-openswx-dispatch', state: 'PAUSED' }
  const job = { name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata' }
  const terminal = { executions: [{ conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }], succeededCount: 1 }] }
  assert.equal(summarizeProviderState(scheduler, job, terminal, () => '2026-10-27T00:00:00.000Z').activeExecutionCount, 0)
  assert.throws(() => summarizeProviderState({ ...scheduler, state: 'ENABLED' }, job, terminal), /NOT_PAUSED/u)
  assert.throws(() => summarizeProviderState(scheduler, job, { ...terminal, nextPageToken: 'more' }), /INVENTORY_INVALID/u)
  assert.throws(() => summarizeProviderState(scheduler, job, { executions: [{}] }), /EXECUTIONS_ACTIVE/u)
})

test('cleanup replay preserves the sealed workflow source while rejecting immutable drift', async () => {
  const submission = {
    schemaVersion: 'aipdm.dev125.openswx-retirement-cleanup-submission.v1',
    workflowSourceRevision: 'b'.repeat(40),
    sourceRevision,
    observedAt: '2026-10-27T00:00:00.000Z',
    args: ['fixed'],
  }
  const priorCore = { ...submission, workflowSourceRevision: 'a'.repeat(40) }
  const prior = { ...priorCore, receiptSha256: sha256(Buffer.from(canonicalize(priorCore))) }
  const transport = { async readBytes() { return { bytes: Buffer.from(JSON.stringify(prior)), metadata: { generation: '7' } } } }
  assert.deepEqual(await submitCleanupOnce({ transport, submissionRef: 'gs://bucket/submission.json', submission, job: {}, providerStateBase64: 'fixed' }), { resumed: true })
  await assert.rejects(submitCleanupOnce({ transport, submissionRef: 'gs://bucket/submission.json', submission: { ...submission, args: ['drift'] }, job: {}, providerStateBase64: 'fixed' }), /DEV125_CLEANUP_SUBMISSION_INVALID/u)
})

test('cleanup execution discovery follows bounded unique provider pages', async () => {
  const requests = []
  const transport = { async request(url) {
    requests.push(url)
    if (requests.length === 1) return { executions: [{ name: 'old' }], nextPageToken: 'next page' }
    return { executions: [{ name: 'match' }] }
  } }
  assert.deepEqual(await listCleanupExecutions(transport), [{ name: 'old' }, { name: 'match' }])
  assert.match(requests[1], /pageToken=next%20page$/u)

  let calls = 0
  const repeated = { async request() { calls += 1; return { executions: [], nextPageToken: 'same' } } }
  await assert.rejects(listCleanupExecutions(repeated), /DEV125_CLEANUP_EXECUTIONS_TRUNCATED/u)
  assert.equal(calls, 2)
})

test('migration runner executes only the fixed hash-bound cleanup branch and publishes its receipt', async () => {
  const built = operationFor([])
  const operationRef = 'gs://jenfu-platform-prod-aipdm-release/source/openswx-dispatch-recovery/dev125-retirement-cleanup/cleanup.json'
  const outputRef = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV125-OPENSWX-RETIREMENT/${built.sha256}/cleanup.json`
  const providerState = {
    observedAt: '2026-10-27T00:00:00.000Z',
    schedulerName: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/aipdm-prod-openswx-dispatch', schedulerState: 'PAUSED',
    retiredJobName: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata', executionCount: 0,
    activeExecutionCount: 0, terminalSucceededCount: 0, terminalFailedCount: 0,
  }
  const objects = new Map([[operationRef, { bytes: built.bytes, generation: '7' }]])
  const fetchImpl = async (url, options = {}) => {
    if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'synthetic-cleanup-token', expires_in: 3600 })
    const parsed = new URL(url)
    const upload = parsed.pathname.includes('/upload/')
    const match = (upload ? /\/b\/([^/]+)\/o$/u : /\/b\/([^/]+)\/o\/(.+)$/u).exec(parsed.pathname)
    assert.ok(match)
    const objectName = parsed.searchParams.get('name') ?? decodeURIComponent(match[2])
    const uri = `gs://${decodeURIComponent(match[1])}/${objectName}`
    if (options.method === 'POST') {
      assert.equal(uri, outputRef)
      objects.set(uri, { bytes: Buffer.from(options.body), generation: '8' })
      return Response.json({ generation: '8' })
    }
    const object = objects.get(uri)
    if (!object) return new Response('', { status: 404 })
    return parsed.searchParams.get('alt') === 'media'
      ? new Response(object.bytes)
      : Response.json({ generation: object.generation, crc32c: crc32cBase64(object.bytes) })
  }
  class Client {
    async connect() {}
    async end() {}
    async query(text) {
      if (text.includes('current_database()')) return { rows: [{ database: 'jenfu_prod', login: 'aipdm-prod-migrator@jenfu-platform-prod.iam', major: 17, migrator_member: true, runtime_can_create_core: false }] }
      if (text.includes('to_regclass')) return { rows: [{ relation: 'ai_pdm_core.openswx_metadata_jobs' }] }
      if (text.includes('count(*)::integer AS pending_count')) return { rows: [{ pending_count: 0 }] }
      return { rows: [], rowCount: 0 }
    }
  }
  const environment = {
    OWNER_APPLICATION_ID: 'ai-pdm', RELEASE_BUCKET: 'jenfu-platform-prod-aipdm-release', GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod',
    GOOGLE_CLOUD_REGION: 'asia-east1', POSTGRES_DATABASE: 'jenfu_prod', CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', POSTGRES_IAM_LOGIN: 'aipdm-prod-migrator@jenfu-platform-prod.iam',
    CLOUD_RUN_JOB: 'ai-pdm-prod-migration-runner', PDM_SOURCE_REVISION: sourceRevision, PGOPTIONS: '-c default_transaction_read_only=off',
    DEV125_OPENSWX_PROVIDER_STATE_BASE64: Buffer.from(canonicalize(providerState)).toString('base64'),
  }
  const argv = ['--dev125-openswx-retirement-operation-ref', operationRef, '--operation-sha256', built.sha256, '--source-revision', sourceRevision, '--output-ref', outputRef]
  const receipt = await runMigrationRunner({ argv, environment, fetchImpl, Client })
  assert.equal(receipt.status, 'RETIREMENT_COMPLETE')
  assert.equal(receipt.databaseState.mutatedRowCount, 0)
  assert.ok(objects.has(outputRef))
})

test('aborted-release observation validates then scrubs the retired OpenSWX baseline binding', () => {
  const releaseId = 'DEV125-HISTORICAL-BASELINE'
  const ref = { uri: `gs://jenfu-platform-prod-aipdm-release/receipts/releases/${releaseId}/release-intent.json`, sha256: 'f'.repeat(64) }
  const receipt = name => ({ uri: `gs://jenfu-platform-prod-aipdm-release/receipts/releases/HISTORICAL/${name}.json`, sha256: 'e'.repeat(64) })
  const intent = {
    schemaVersion: 'jenfu.dev117.ai-pdm-release-intent.v2', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision,
    sourceSha256: 'd'.repeat(64), sourceLockRef: receipt('source-lock'), authorizationPolicyRef: receipt('authorization'),
    readinessReceiptRef: receipt('readiness'), foundationReceiptRef: receipt('foundation'), infraReceiptRef: receipt('infra'),
    runtimeConfigRef: receipt('runtime'), migrationManifestSha256: 'c'.repeat(64), previousRevision: `ai-pdm-prod-${'b'.repeat(12)}`,
    deadlineAt: '2026-10-27T10:00:00.000Z',
    openswxWorkerRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/historical.json', sha256: 'a'.repeat(64) },
  }
  const normalized = assertObservedCapsule(intent, ref, sourceRevision)
  assert.equal(Object.hasOwn(normalized, 'openswxWorkerRef'), false)
  assert.equal(Object.hasOwn(intent, 'openswxWorkerRef'), true)
  assert.throws(() => assertObservedCapsule({ ...intent, openswxWorkerRef: { ...intent.openswxWorkerRef,
    uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/arbitrary.json' } }, ref, sourceRevision), /OBSERVED_CAPSULE_INVALID/u)
})
