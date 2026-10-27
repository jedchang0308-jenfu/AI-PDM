import assert from 'node:assert/strict'
import test from 'node:test'

import {
  executionMatches,
  jobMatches,
  parseArgs,
  readProviderRuntimeState,
  submitRuntimeReadbackOnce,
} from '../dev122-preview-openswx-runtime-readback.mjs'
import {
  RUNTIME_STATE_PGOPTIONS,
  RUNTIME_STATE_SELECTORS,
  RUNTIME_STATE_TARGET,
  assertRuntimeDatabaseReceipt,
  assertRuntimeStateOperation,
  assertRuntimeStateTarget,
  assessPreviewBindings,
  buildRuntimeDatabaseReceipt,
  buildRuntimeStateOperation,
  buildRuntimeStateReceipt,
  parseRuntimeStateArgs,
  readRuntimeDatabaseState,
} from './dev122-preview-openswx-runtime-readback.mjs'
import { runMain as runMigrationRunner } from '../dev117-production-migration-runner.mjs'
import { canonicalize, crc32cBase64, sha256 } from './dev012-production-migration-runner.mjs'

const sourceRevision = 'a'.repeat(40)
const runner = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:${'b'.repeat(64)}`
const built = buildRuntimeStateOperation({ operationId: 'DEV122-RUNTIME-READBACK', sourceRevision, migrationRunnerDigest: runner })
const operationRef = { uri: 'gs://jenfu-platform-prod-aipdm-release/source/openswx-dispatch-recovery/dev125-preview-runtime-readback/state.json', sha256: built.sha256, generation: '17' }
const databaseOutputRef = `gs://jenfu-platform-prod-aipdm-release/receipts/diagnostics/DEV122-PREVIEW-OPENSWX-RUNTIME/${built.sha256}/database.json`
const finalOutputRef = `gs://jenfu-platform-prod-aipdm-release/receipts/diagnostics/DEV122-PREVIEW-OPENSWX-RUNTIME/${built.sha256}/state.json`

const environment = {
  OWNER_APPLICATION_ID: 'ai-pdm',
  RELEASE_BUCKET: 'jenfu-platform-prod-aipdm-release',
  GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod',
  GOOGLE_CLOUD_REGION: 'asia-east1',
  POSTGRES_DATABASE: 'jenfu_prod',
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  PGOPTIONS: RUNTIME_STATE_PGOPTIONS,
}

test('runtime-state operation and CLIs accept only the fixed target and selectors', () => {
  assert.equal(assertRuntimeStateOperation(built.value, { bytes: built.bytes, operationSha256: built.sha256, sourceRevision }).operationId, 'DEV122-RUNTIME-READBACK')
  const drift = structuredClone(built.value)
  drift.selectors.drawingNumber = 'A0002-M01'
  assert.throws(() => assertRuntimeStateOperation(drift, { bytes: built.bytes, operationSha256: built.sha256, sourceRevision }), /OPERATION_INVALID/u)
  assertRuntimeStateTarget(environment)
  assert.throws(() => assertRuntimeStateTarget({ ...environment, PGOPTIONS: '' }), /TARGET_INVALID/u)
  const runnerArgs = ['--runtime-operation-ref', operationRef.uri, '--runtime-operation-sha256', built.sha256, '--source-revision', sourceRevision, '--runtime-database-output-ref', databaseOutputRef]
  assert.equal(parseRuntimeStateArgs(runnerArgs).databaseOutputRef, databaseOutputRef)
  assert.throws(() => parseRuntimeStateArgs([...runnerArgs.slice(0, 6), '--sql', 'select 1']), /ARGUMENTS_INVALID/u)
  const workflowArgs = ['--stage', 'readback', '--runtime-operation-ref', operationRef.uri, '--runtime-operation-sha256', built.sha256, '--source-revision', sourceRevision, '--runtime-output-ref', finalOutputRef]
  assert.equal(parseArgs(workflowArgs).outputRef, finalOutputRef)
  assert.throws(() => parseArgs([...workflowArgs.slice(0, 8), '--runtime-database-output-ref', finalOutputRef]), /ARGUMENTS_INVALID/u)
})

test('preview binding assessment distinguishes complete, missing, removed and ambiguous files', () => {
  const active3d = { file_name: 'D-0007-MA1.SLDPRT', asset_deleted_at: null, binding_removed_at: null }
  const removedPdf = { file_name: 'D-0007-MA1.pdf', asset_deleted_at: null, binding_removed_at: '2026-10-27T00:00:00.000Z' }
  assert.deepEqual(assessPreviewBindings([active3d, removedPdf]).map(row => row.status), ['BOUND', 'MISSING'])
  assert.deepEqual(assessPreviewBindings([active3d, { ...active3d }]).map(row => row.status), ['AMBIGUOUS', 'MISSING'])
})

test('runtime-state database read uses one repeatable readonly snapshot and fixed projections', async () => {
  const statements = []
  const database = { async query(input) {
    const text = typeof input === 'string' ? input : input.text
    const values = typeof input === 'string' ? undefined : input.values
    statements.push({ text, values })
    if (text.startsWith('BEGIN') || text === 'COMMIT') return { rows: [] }
    if (text.includes('current_database()')) return { rows: [{ database: 'jenfu_prod', login: 'aipdm-prod-migrator@jenfu-platform-prod.iam', major: 17, migrator_member: true, runtime_can_create_core: false }] }
    if (text.includes('FROM ai_pdm_core.drawings')) return { rows: [
      { drawing_number: 'A0001-M01', data_layer: 'drawing_production', revision_id: 'revision-1', revision_label: '研發版 0.1', lifecycle_state: 'released', binding_id: 'binding-3d', role: 'model', asset_id: 'asset-3d', file_name: 'D-0007-MA1.SLDPRT', file_extension: 'sldprt', mime_type: 'application/octet-stream', file_size: '1024', content_hash: 'c'.repeat(64), storage_provider: 'gcs', storage_generation: '21', document_category: 'model', asset_deleted_at: null, binding_removed_at: null },
      { drawing_number: 'A0001-M01', data_layer: 'drawing_production', revision_id: 'revision-1', revision_label: '研發版 0.1', lifecycle_state: 'released', binding_id: 'binding-pdf', role: 'drawing', asset_id: 'asset-pdf', file_name: 'D-0007-MA1.pdf', file_extension: 'pdf', mime_type: 'application/pdf', file_size: '2048', content_hash: 'd'.repeat(64), storage_provider: 'gcs', storage_generation: '22', document_category: 'drawing', asset_deleted_at: null, binding_removed_at: null },
    ] }
    if (text.includes('FROM ai_pdm_core.preview_jobs')) return { rows: [{ id: 'job-3d', source_file_asset_id: 'asset-3d', source_content_hash: 'c'.repeat(64), requested_kind: 'native_thumbnail_png', source_extension: 'sldprt', status: 'failed', attempt_count: 1, locked_by: null, locked_at: null, error_code: 'renderer_unavailable', generator_profile: 'windows-shell', created_at: '2026-10-27T00:00:00.000Z', updated_at: '2026-10-27T00:01:00.000Z', completed_at: '2026-10-27T00:01:00.000Z' }] }
    if (text.includes('FROM ai_pdm_core.file_derivatives')) return { rows: [{ id: 'derivative-pdf', source_file_asset_id: 'asset-pdf', source_content_hash: 'd'.repeat(64), derivative_kind: 'drawing_pdf', storage_provider: 'gcs', storage_generation: '23', file_name: 'D-0007-MA1.pdf', mime_type: 'application/pdf', file_size: '2048', content_hash: 'd'.repeat(64), width: null, height: null, page_count: 1, generator_profile: 'source-pdf', generator_version: '1', preview_job_id: null, status: 'ready', created_by_worker: null, created_at: '2026-10-27T00:00:00.000Z' }] }
    if (text.includes('worker_capability_heartbeats')) return { rows: RUNTIME_STATE_SELECTORS.workers.map(worker => ({ expected_worker_id: worker.workerId, expected_capability_code: worker.capabilityCode, worker_id: worker.workerId, worker_kind: 'preview', capability_code: worker.capabilityCode, status: 'ready', reader_version: '1', issue_code: null, last_applied_at: null, last_seen_at: '2026-10-27T00:02:00.000Z', updated_at: '2026-10-27T00:02:00.000Z', age_seconds: 1, fresh: true })) }
    if (text.includes('GROUP BY status,dispatch_state')) return { rows: [{ status: 'queued', dispatch_state: 'due', row_count: 1 }, { status: 'succeeded', dispatch_state: 'completed', row_count: 8 }] }
    if (text.includes('FROM ai_pdm_core.openswx_metadata_jobs')) return { rows: [{ status: 'queued', attempt_count: 0, dispatch_state: 'due', dispatch_generation: 1, dispatch_requested_at: null, dispatch_request_window_end: null, dispatch_lease_expires_at: null, provider_operation: null, execution_name: null, lease_expires_at: null, heartbeat_at: null, created_at: '2026-10-27T00:00:00.000Z', updated_at: '2026-10-27T00:00:00.000Z' }] }
    throw new Error(`unexpected query: ${text}`)
  } }
  const state = await readRuntimeDatabaseState(database, built.value)
  assert.equal(state.preview.assetRowCount, 2)
  assert.equal(state.preview.bindingStatus, 'COMPLETE')
  assert.equal(state.preview.assets[0].storage_key, undefined)
  assert.equal(state.preview.jobs[0].error_summary, undefined)
  assert.equal(state.openswx.pendingCount, 1)
  assert.equal(state.databaseMutationExpected, false)
  assert.equal(statements[0].text, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.equal(statements.at(-1).text, 'COMMIT')
  assert.match(statements.find(({ text }) => text.includes('worker_capability_heartbeats')).text, /heartbeat\.worker_id=target\.worker_id AND heartbeat\.capability_code=target\.capability_code/u)
  assert.match(statements.find(({ text }) => text.includes('FROM ai_pdm_core.preview_jobs')).text, /source_content_hash=target\.source_hash[\s\S]*requested_kind=target\.requested_kind[\s\S]*updated_at DESC/u)
  assert.deepEqual(statements.filter(({ text }) => /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/iu.test(text)), [])
  const receipt = buildRuntimeDatabaseReceipt({ operation: built.value, operationRef, outputRef: databaseOutputRef, observedAt: '2026-10-27T00:03:00.000Z', state })
  assert.equal(assertRuntimeDatabaseReceipt(receipt, { operation: built.value, operationRef, outputRef: databaseOutputRef }).state.openswx.pendingCount, 1)
  const final = buildRuntimeStateReceipt({ operation: built.value, operationRef, outputRef: finalOutputRef, databaseReceipt: receipt, observedAt: '2026-10-27T00:04:00.000Z', provider: {
    observedAt: '2026-10-27T00:04:00.000Z', service: { name: RUNTIME_STATE_TARGET.applicationService, generation: '256', latestReadyRevision: `${RUNTIME_STATE_TARGET.applicationService}/revisions/ai-pdm-prod-revision`, traffic: [{ revision: `${RUNTIME_STATE_TARGET.applicationService}/revisions/ai-pdm-prod-revision`, percent: 100 }] }, revision: { name: `${RUNTIME_STATE_TARGET.applicationService}/revisions/ai-pdm-prod-revision`, image: `image@sha256:${'e'.repeat(64)}`, trafficPercent: 100, sourceRevision: null, sourceRevisionStatus: 'NOT_READ_BY_THIS_DIAGNOSTIC' }, openswxDispatch: { configured: false, value: '0', enabled: false },
  } })
  assert.equal(final.openswxReadbackStatus, 'DRAIN_OR_ENTRY_SHUTDOWN_REQUIRED')
  assert.equal(final.providerInventoryComplete, false)
  assert.equal(final.diagnosticStatus, 'READBACK_COMPLETE')
  assert.equal(final.diagnosticExecutionCreated, true)
  const clearReceipt = structuredClone(receipt)
  clearReceipt.state.openswx.pendingCount = 0
  const clearFinal = buildRuntimeStateReceipt({ operation: built.value, operationRef, outputRef: finalOutputRef, databaseReceipt: clearReceipt, observedAt: '2026-10-27T00:05:00.000Z', provider: {
    observedAt: '2026-10-27T00:05:00.000Z', service: { name: RUNTIME_STATE_TARGET.applicationService, generation: '256', latestReadyRevision: `${RUNTIME_STATE_TARGET.applicationService}/revisions/ai-pdm-prod-revision`, traffic: [{ revision: `${RUNTIME_STATE_TARGET.applicationService}/revisions/ai-pdm-prod-revision`, percent: 100 }] }, revision: { name: `${RUNTIME_STATE_TARGET.applicationService}/revisions/ai-pdm-prod-revision`, image: `image@sha256:${'e'.repeat(64)}`, trafficPercent: 100, sourceRevision: null, sourceRevisionStatus: 'NOT_READ_BY_THIS_DIAGNOSTIC' }, openswxDispatch: { configured: false, value: '0', enabled: false },
  } })
  assert.equal(clearFinal.openswxReadbackStatus, 'DB_AND_APP_ENTRY_CLEAR_PROVIDER_INVENTORY_REQUIRED')
  assert.equal(clearFinal.providerInventoryComplete, false)
})

test('provider readback exposes only the exact non-secret dispatch flag', async () => {
  const serviceName = RUNTIME_STATE_TARGET.applicationService
  const revisionName = `${serviceName}/revisions/ai-pdm-prod-abc123`
  const requests = []
  const transport = { async request(url) {
    requests.push(url)
    if (url.endsWith('/services/ai-pdm-prod')) return { name: serviceName, generation: '256', latestReadyRevision: revisionName, trafficStatuses: [{ revision: 'ai-pdm-prod-abc123', percent: 100 }] }
    if (url.endsWith('/revisions/ai-pdm-prod-abc123')) return { name: revisionName, containers: [
      { name: 'ai-pdm', image: `asia-east1-docker.pkg.dev/p/r/i@sha256:${'e'.repeat(64)}`, env: [{ name: 'SECRET_TOKEN', valueSource: { secretKeyRef: { secret: 'hidden' } } }, { name: 'PDM_OPENSWX_DISPATCH_ENABLED', value: '1' }] },
      { name: 'cloud-sql-proxy', image: `gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:${'f'.repeat(64)}`, env: [] },
    ] }
    throw new Error('unexpected URL')
  } }
  const state = await readProviderRuntimeState(transport, () => '2026-10-27T00:00:00.000Z')
  assert.deepEqual(state.openswxDispatch, { configured: true, value: '1', enabled: true })
  assert.equal(JSON.stringify(state).includes('SECRET_TOKEN'), false)
  assert.equal(requests.length, 2)
})

test('provider readback rejects a missing or duplicate named application container', async () => {
  const serviceName = RUNTIME_STATE_TARGET.applicationService
  const revisionName = `${serviceName}/revisions/ai-pdm-prod-abc123`
  for (const containers of [
    [{ name: 'cloud-sql-proxy', image: `proxy@sha256:${'f'.repeat(64)}` }],
    [
      { name: 'ai-pdm', image: `app@sha256:${'e'.repeat(64)}` },
      { name: 'ai-pdm', image: `app@sha256:${'e'.repeat(64)}` },
    ],
  ]) {
    const transport = { async request(url) {
      if (url.endsWith('/services/ai-pdm-prod')) return { name: serviceName, generation: '256', latestReadyRevision: revisionName, trafficStatuses: [{ revision: 'ai-pdm-prod-abc123', percent: 100 }] }
      return { name: revisionName, containers }
    } }
    await assert.rejects(readProviderRuntimeState(transport), /REVISION_INVALID/u)
  }
})

test('provider readback rejects empty or split serving traffic before reading revision env', async () => {
  for (const trafficStatuses of [[], [{ revision: 'ai-pdm-prod-a', percent: 50 }, { revision: 'ai-pdm-prod-b', percent: 50 }]]) {
    let calls = 0
    const transport = { async request() { calls++; return { name: RUNTIME_STATE_TARGET.applicationService, generation: '1', latestReadyRevision: `${RUNTIME_STATE_TARGET.applicationService}/revisions/ai-pdm-prod-a`, trafficStatuses } } }
    await assert.rejects(readProviderRuntimeState(transport), /SERVICE_INVALID/u)
    assert.equal(calls, 1)
  }
})

test('migration runner rejects a runtime database receipt path not bound to the operation hash before provider access', async () => {
  const argv = ['--runtime-operation-ref', operationRef.uri, '--runtime-operation-sha256', built.sha256, '--source-revision', sourceRevision, '--runtime-database-output-ref', 'gs://jenfu-platform-prod-aipdm-release/receipts/diagnostics/DEV122-PREVIEW-OPENSWX-RUNTIME/other/database.json']
  let fetchCalls = 0
  await assert.rejects(runMigrationRunner({ argv, environment: { ...environment, POSTGRES_IAM_LOGIN: 'aipdm-prod-migrator@jenfu-platform-prod.iam', CLOUD_RUN_JOB: 'ai-pdm-prod-migration-runner', PDM_SOURCE_REVISION: sourceRevision }, fetchImpl: async () => { fetchCalls++; throw new Error('unexpected') } }), /DATABASE_OUTPUT_REF_INVALID/u)
  assert.equal(fetchCalls, 0)
})

test('migration runner dispatch executes the fixed runtime-state branch and publishes only its hash-bound database receipt', async () => {
  const objects = new Map([[operationRef.uri, { bytes: built.bytes, generation: operationRef.generation }]])
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET' })
    if (url.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'synthetic-opaque-token-for-runtime-test', expires_in: 3600 })
    const parsed = new URL(url)
    const upload = parsed.pathname.includes('/upload/')
    const match = (upload ? /\/b\/([^/]+)\/o$/u : /\/b\/([^/]+)\/o\/(.+)$/u).exec(parsed.pathname)
    assert.ok(match)
    const objectName = parsed.searchParams.get('name') ?? decodeURIComponent(match[2])
    const uri = `gs://${decodeURIComponent(match[1])}/${objectName}`
    if (options.method === 'POST') {
      assert.equal(uri, databaseOutputRef)
      objects.set(uri, { bytes: Buffer.from(options.body), generation: '99' })
      return Response.json({ generation: '99' })
    }
    const object = objects.get(uri)
    if (!object) return new Response('', { status: 404 })
    return parsed.searchParams.get('alt') === 'media'
      ? new Response(object.bytes)
      : Response.json({ generation: object.generation, crc32c: crc32cBase64(object.bytes) })
  }
  const statements = []
  class Client {
    async connect() {}
    async end() {}
    async query(input) {
      const text = typeof input === 'string' ? input : input.text
      statements.push(text)
      if (text.startsWith('BEGIN') || text === 'COMMIT') return { rows: [] }
      if (text.includes('current_database()')) return { rows: [{ database: 'jenfu_prod', login: 'aipdm-prod-migrator@jenfu-platform-prod.iam', major: 17, migrator_member: true, runtime_can_create_core: false }] }
      if (text.includes('FROM ai_pdm_core.drawings') || text.includes('FROM ai_pdm_core.preview_jobs') || text.includes('FROM ai_pdm_core.file_derivatives') || text.includes('FROM ai_pdm_core.openswx_metadata_jobs') || text.includes('GROUP BY status,dispatch_state')) return { rows: [] }
      if (text.includes('worker_capability_heartbeats')) return { rows: RUNTIME_STATE_SELECTORS.workers.map(worker => ({ expected_worker_id: worker.workerId, expected_capability_code: worker.capabilityCode, worker_id: null, worker_kind: null, capability_code: null, status: null, reader_version: null, issue_code: null, last_applied_at: null, last_seen_at: null, updated_at: null, age_seconds: null, fresh: false })) }
      throw new Error(`unexpected query: ${text}`)
    }
  }
  const argv = ['--runtime-operation-ref', operationRef.uri, '--runtime-operation-sha256', built.sha256, '--source-revision', sourceRevision, '--runtime-database-output-ref', databaseOutputRef]
  const result = await runMigrationRunner({ argv, environment: { ...environment, POSTGRES_IAM_LOGIN: 'aipdm-prod-migrator@jenfu-platform-prod.iam', CLOUD_RUN_JOB: 'ai-pdm-prod-migration-runner', PDM_SOURCE_REVISION: sourceRevision }, fetchImpl, Client })
  assert.equal(result.state.preview.bindingStatus, 'INCOMPLETE')
  assert.equal(result.state.preview.processStatus, 'unknown')
  assert.equal(statements[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.equal(statements.at(-1), 'COMMIT')
  assert.equal(calls.filter(call => call.method === 'POST').length, 1)
  assert.ok(objects.has(databaseOutputRef))
})

test('runtime-state wrapper binds one exact migration job execution and create-only submission', async () => {
  const args = ['--runtime-operation-ref', operationRef.uri, '--runtime-operation-sha256', built.sha256, '--source-revision', sourceRevision, '--runtime-database-output-ref', databaseOutputRef]
  const job = { name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner', etag: 'etag-1', template: { taskCount: 1, parallelism: 1, template: { serviceAccount: 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com', maxRetries: 0, timeout: '1800s', containers: [{ name: 'migration', image: runner, env: [{ name: 'PDM_SOURCE_REVISION', value: sourceRevision }] }] } } }
  assert.equal(jobMatches(job, built.value), true)
  const execution = { name: `${job.name}/executions/exec-1`, taskCount: 1, parallelism: 1, template: { serviceAccount: job.template.template.serviceAccount, containers: [{ name: 'migration', image: runner, args, env: [{ name: 'PDM_SOURCE_REVISION', value: sourceRevision }, { name: 'PGOPTIONS', value: RUNTIME_STATE_PGOPTIONS }] }] } }
  assert.equal(executionMatches(execution, args, built.value), true)
  const puts = []; const calls = []
  const transport = {
    async readBytes() { const error = new Error('missing'); error.code = 'MISSING'; throw error },
    async putJson(uri, value, options) { puts.push({ uri, value, options }) },
    async request(url, options) { calls.push({ url, options }); return {} },
  }
  const submission = { schemaVersion: 'aipdm.dev122.preview-openswx-runtime-readback-submission.v1', observedAt: '2026-10-27T00:00:00.000Z', args }
  assert.deepEqual(await submitRuntimeReadbackOnce({ transport, submissionRef: 'gs://bucket/submission.json', submission, job }), { resumed: false })
  assert.equal(puts.length, 1)
  assert.equal(puts[0].options.ifGenerationMatch, '0')
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /ai-pdm-prod-migration-runner:run$/u)

  const priorCore = { ...submission, workflowSourceRevision: 'a'.repeat(40) }
  const prior = { ...priorCore, receiptSha256: sha256(Buffer.from(canonicalize(priorCore))) }
  const resumedTransport = { async readBytes() { return { bytes: Buffer.from(JSON.stringify(prior)), metadata: { generation: '7' } } } }
  const advanced = { ...submission, workflowSourceRevision: 'b'.repeat(40) }
  assert.deepEqual(await submitRuntimeReadbackOnce({ transport: resumedTransport, submissionRef: 'gs://bucket/submission.json', submission: advanced, job }), { resumed: true })
  await assert.rejects(submitRuntimeReadbackOnce({ transport: resumedTransport, submissionRef: 'gs://bucket/submission.json', submission: { ...advanced, args: [...args, 'drift'] }, job }), /RUNTIME_STATE_SUBMISSION_INVALID/u)
})
