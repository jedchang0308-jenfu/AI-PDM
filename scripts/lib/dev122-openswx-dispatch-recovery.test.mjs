import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { parseArgs as parseHostArgs } from '../dev122-openswx-dispatch-recovery.mjs'
import { TARGET, runMain as runMigrationRunner } from '../dev117-production-migration-runner.mjs'
import {
  OPENSWX_DISPATCH_RECOVERY_SCHEMA,
  assertOpenSwxDispatchProviderReadback,
  assertOpenSwxDispatchRecoveryOperation,
  assertOpenSwxDispatchRecoveryReceipt,
  buildOpenSwxDispatchRecoveryReceipt,
  executeOpenSwxDispatchRecovery,
} from './dev122-openswx-dispatch-recovery.mjs'
import { canonicalize, crc32cBase64, sha256 } from './dev012-production-migration-runner.mjs'

const sourceRevision = 'a'.repeat(40)
const operationName = 'projects/9536592944/locations/asia-east1/operations/test-operation'
const executionName = 'projects/9536592944/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata/executions/test-execution'
const operation = {
  schemaVersion: OPENSWX_DISPATCH_RECOVERY_SCHEMA,
  operationId: 'DEV122-OPENSWX-RECOVERY-TEST',
  sourceRevision,
  projectId: 'jenfu-platform-prod',
  region: 'asia-east1',
  database: 'jenfu_prod',
  migrationRunnerDigest: `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:${'d'.repeat(64)}`,
  dispatch: {
    status: 'queued', attemptCount: 0, dispatchState: 'dispatch_unknown', dispatchGeneration: 1,
    dispatchRequestedAt: '2026-10-16 15:15:07.441+00', dispatchRequestWindowEnd: '2026-10-16 15:15:37.441+00',
    dispatchLeaseExpiresAt: '2026-10-16 15:15:37.441+00', providerOperation: operationName, executionName: null,
  },
  provider: {
    operationName, done: true, errorCode: 10, executionName,
    createTime: '2026-10-16T15:15:08.198809Z', completionTime: '2026-10-16T15:15:27.462938Z', completedState: 'CONDITION_FAILED',
  },
}

function bytes() { return Buffer.from(canonicalize(operation)) }
function after() { return { ...operation.dispatch, attemptCount: 1, dispatchState: 'due', status: 'queued' } }

test('OpenSWX recovery binds exact operation bytes, fixed target, provider operation and failed execution', () => {
  const raw = bytes()
  assert.equal(assertOpenSwxDispatchRecoveryOperation(operation, { bytes: raw, operationSha256: sha256(raw), sourceRevision }).operationId, operation.operationId)
  const executionV1 = { apiVersion: 'run.googleapis.com/v1', kind: 'Execution', metadata: { name: 'test-execution', namespace: '9536592944', creationTimestamp: operation.provider.createTime, annotations: { 'run.googleapis.com/operation-id': 'test-operation' } }, status: { completionTime: operation.provider.completionTime, conditions: [{ type: 'Completed', status: 'False' }] } }
  const execution = { name: executionName, createTime: operation.provider.createTime, completionTime: operation.provider.completionTime, conditions: [{ type: 'Completed', state: 'CONDITION_FAILED' }] }
  assert.equal(assertOpenSwxDispatchProviderReadback(operation, executionV1, execution).errorCode, 10)
  assert.throws(() => assertOpenSwxDispatchProviderReadback(operation, executionV1, { ...execution, completionTime: '2026-10-16T15:15:28Z' }), /PROVIDER_READBACK_INVALID/u)
  assert.throws(() => assertOpenSwxDispatchProviderReadback(operation, { ...executionV1, metadata: { ...executionV1.metadata, annotations: { 'run.googleapis.com/operation-id': 'other-operation' } } }, execution), /PROVIDER_READBACK_INVALID/u)
  assert.throws(() => assertOpenSwxDispatchRecoveryOperation({ ...operation, database: 'other' }, { bytes: raw, operationSha256: sha256(raw), sourceRevision }), /OPERATION_INVALID/u)
})

test('OpenSWX recovery reuses the existing execution-get authority and does not require generic operation-get IAM', () => {
  const host = readFileSync(new URL('../dev122-openswx-dispatch-recovery.mjs', import.meta.url), 'utf8')
  assert.match(host, /asia-east1-run\.googleapis\.com\/apis\/run\.googleapis\.com\/v1\/namespaces\/9536592944\/executions/u)
  assert.doesNotMatch(host, /run\.googleapis\.com\/v2\/\$\{operation\.provider\.operationName\}/u)
})

test('OpenSWX recovery host accepts only the fixed stage and eight bound arguments', () => {
  const outputRef = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-OPENSWX-DISPATCH-RECOVERY/${'b'.repeat(64)}/recovery.json`
  const argv = ['--stage', 'recovery', '--openswx-dispatch-recovery-operation-ref', 'gs://jenfu-platform-prod-aipdm-release/source/openswx-dispatch-recovery/test.json', '--openswx-dispatch-recovery-operation-sha256', 'b'.repeat(64), '--source-revision', sourceRevision, '--openswx-dispatch-recovery-output-ref', outputRef]
  assert.equal(parseHostArgs(argv).stage, 'recovery')
  assert.throws(() => parseHostArgs(argv.slice(0, -2)), /ARGUMENTS_INVALID/u)
  assert.throws(() => parseHostArgs(['--stage', 'recovery', ...argv.slice(2, -2), '--sql', 'UPDATE anything']), /ARGUMENTS_INVALID/u)
})

function databaseFixture(current = structuredClone(operation.dispatch)) {
  const state = { current, statements: [], begins: 0, commits: 0, rollbacks: 0 }
  const database = { async query(sql, parameters = []) {
    state.statements.push({ sql, parameters })
    if (sql.startsWith('BEGIN')) { state.begins++; return { rows: [] } }
    if (sql === 'COMMIT') { state.commits++; return { rows: [] } }
    if (sql === 'ROLLBACK') { state.rollbacks++; return { rows: [] } }
    if (sql.includes('current_database()')) return { rows: [{ database: 'jenfu_prod', login: 'aipdm-prod-migrator@jenfu-platform-prod.iam', major: 17, migrator_member: true, runtime_can_create_core: false }] }
    if (sql.includes('SELECT id,company_id')) return { rows: [{ id: 'job-1', company_id: 'company-1', status: state.current.status, attempt_count: state.current.attemptCount,
      dispatch_state: state.current.dispatchState, dispatch_generation: state.current.dispatchGeneration,
      dispatch_requested_at: state.current.dispatchRequestedAt, dispatch_request_window_end: state.current.dispatchRequestWindowEnd,
      dispatch_lease_expires_at: state.current.dispatchLeaseExpiresAt, provider_operation: state.current.providerOperation, execution_name: state.current.executionName }] }
    if (sql.startsWith('UPDATE ai_pdm_core.openswx_metadata_jobs')) {
      assert.deepEqual(parameters.slice(4), ['job-1', 'company-1', 1, operationName, 0])
      state.current = after()
      return { rows: [{ status: state.current.status, attempt_count: state.current.attemptCount, dispatch_state: state.current.dispatchState,
        dispatch_generation: state.current.dispatchGeneration, dispatch_requested_at: state.current.dispatchRequestedAt,
        dispatch_request_window_end: state.current.dispatchRequestWindowEnd, dispatch_lease_expires_at: state.current.dispatchLeaseExpiresAt,
        provider_operation: state.current.providerOperation, execution_name: state.current.executionName }] }
    }
    throw new Error(`unexpected query: ${sql}`)
  } }
  return { database, state }
}

test('OpenSWX recovery performs one serializable exact-row CAS and replays without a second mutation', async () => {
  const fresh = databaseFixture()
  const result = await executeOpenSwxDispatchRecovery(fresh.database, operation, '2026-10-18T08:00:00.000Z')
  assert.deepEqual(result.before, operation.dispatch)
  assert.deepEqual(result.after, after())
  assert.equal(result.databaseMutationApplied, true)
  assert.equal(fresh.state.statements.filter(row => row.sql.startsWith('UPDATE ')).length, 1)
  assert.equal(fresh.state.commits, 1)

  const replay = databaseFixture(after())
  const replayed = await executeOpenSwxDispatchRecovery(replay.database, operation, '2026-10-18T08:01:00.000Z')
  assert.equal(replayed.reused, true)
  assert.equal(replayed.databaseMutationApplied, false)
  assert.equal(replay.state.statements.some(row => row.sql.startsWith('UPDATE ')), false)
})

test('OpenSWX recovery rejects row drift and seals a bounded replay-verifiable receipt', async () => {
  const drift = databaseFixture({ ...operation.dispatch, attemptCount: 1 })
  await assert.rejects(executeOpenSwxDispatchRecovery(drift.database, operation, '2026-10-18T08:00:00.000Z'), /ROW_MISMATCH/u)
  assert.equal(drift.state.rollbacks, 1)
  assert.equal(drift.state.statements.some(row => row.sql.startsWith('UPDATE ')), false)

  const operationRef = { uri: 'gs://jenfu-platform-prod-aipdm-release/source/openswx-dispatch-recovery/test.json', sha256: sha256(bytes()), generation: '17' }
  const outputRef = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-OPENSWX-DISPATCH-RECOVERY/${operationRef.sha256}/recovery.json`
  const result = { before: operation.dispatch, after: after(), reused: false, databaseMutationApplied: true, providerExecutionName: executionName }
  const receipt = buildOpenSwxDispatchRecoveryReceipt({ operation, operationRef, outputRef, observedAt: '2026-10-18T08:00:00.000Z', result })
  assert.equal(assertOpenSwxDispatchRecoveryReceipt(receipt, { operation, operationRef, outputRef }).receiptSha256, receipt.receiptSha256)
  assert.throws(() => assertOpenSwxDispatchRecoveryReceipt({ ...receipt, result: { ...result, databaseMutationApplied: false } }, { operation, operationRef, outputRef }), /RECEIPT_INVALID/u)
})

test('production migration runner dispatches only the source-bound OpenSWX recovery mode and publishes create-only evidence', async () => {
  const operationBytes = bytes(), operationSha256 = sha256(operationBytes)
  const operationRef = 'gs://jenfu-platform-prod-aipdm-release/source/openswx-dispatch-recovery/test.json'
  const outputRef = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-OPENSWX-DISPATCH-RECOVERY/${operationSha256}/recovery.json`
  const objects = new Map([[operationRef, { bytes: operationBytes, generation: '17' }]])
  const fetchImpl = async (url, options = {}) => {
    if (url === 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token') return Response.json({ access_token: 'fixture-opaque-token-value', expires_in: 3600 })
    const parsed = new URL(url), upload = parsed.pathname.includes('/upload/')
    const match = (upload ? /\/b\/([^/]+)\/o$/u : /\/b\/([^/]+)\/o\/(.+)$/u).exec(parsed.pathname)
    assert.ok(match)
    const objectName = parsed.searchParams.get('name') ?? decodeURIComponent(match[2])
    const uri = `gs://${decodeURIComponent(match[1])}/${objectName}`
    if (options.method === 'POST') {
      assert.equal(parsed.searchParams.get('ifGenerationMatch'), '0')
      objects.set(uri, { bytes: Buffer.from(options.body), generation: '18' })
      return Response.json({ generation: '18' })
    }
    const object = objects.get(uri)
    if (!object) return new Response('', { status: 404 })
    return parsed.searchParams.get('alt') === 'media' ? new Response(object.bytes) : Response.json({ generation: object.generation, crc32c: crc32cBase64(object.bytes) })
  }
  const db = databaseFixture()
  class Client {
    async connect() {}
    async end() {}
    async query(sql, parameters) { return db.database.query(sql, parameters) }
  }
  const environment = {
    OWNER_APPLICATION_ID: TARGET.ownerApplicationId, RELEASE_BUCKET: TARGET.releaseBucket,
    GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', POSTGRES_DATABASE: 'jenfu_prod',
    POSTGRES_IAM_LOGIN: TARGET.login, POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
    CLOUD_RUN_JOB: TARGET.job, PDM_SOURCE_REVISION: sourceRevision,
  }
  const argv = ['--openswx-dispatch-recovery-operation-ref', operationRef, '--openswx-dispatch-recovery-operation-sha256', operationSha256, '--source-revision', sourceRevision, '--openswx-dispatch-recovery-output-ref', outputRef]
  const result = await runMigrationRunner({ argv, environment, fetchImpl, Client })
  assert.equal(result.result.databaseMutationApplied, true)
  assert.equal(JSON.parse(objects.get(outputRef).bytes).schemaVersion, 'aipdm.dev122.openswx-dispatch-recovery-receipt.v1')
})
