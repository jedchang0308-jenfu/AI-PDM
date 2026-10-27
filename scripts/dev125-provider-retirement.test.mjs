import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { canonicalize, sha256 } from './lib/dev012-production-migration-runner.mjs'
import {
  DEV125_PROVIDER_RETIREMENT_ROOTS,
  assertProviderRetirementClaim,
  assertProviderRetirementOperation,
  assertProviderRetirementPrerequisite,
  assertProviderRetirementReplayEvidence,
  assertProviderRetirementReceipt,
  assertStateSnapshot,
  assertUnprotectPlans,
  buildProviderRetirementOperation,
  buildProviderRetirementClaim,
  buildProviderRetirementReceipt,
  schedulerPaused,
  stateAddresses,
  workerDeletionProtection,
} from './lib/dev125-provider-retirement.mjs'
import { bindOperationRef, parseArgs, readProviderInventory, sanitizedTerraformEnvironment } from './dev125-provider-retirement.mjs'

const sourceRevision = 'a'.repeat(40)
const createdAt = '2026-10-27T12:00:00.000Z'
const expiresAt = '2026-10-27T13:00:00.000Z'
const workerImage = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-openswx-worker@sha256:${'b'.repeat(64)}`
const cleanupReceiptRef = { uri: `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV125-OPENSWX-RETIREMENT/${'c'.repeat(64)}/cleanup.json`, sha256: 'd'.repeat(64), generation: '17' }
const runtimeReceiptRef = { uri: `gs://jenfu-platform-prod-aipdm-release/receipts/diagnostics/DEV122-PREVIEW-OPENSWX-RUNTIME/${'e'.repeat(64)}/state.json`, sha256: 'f'.repeat(64), generation: '18' }

function resource(address, attributes = {}) {
  const match = /^([^.]+)\.([^[]+)$/u.exec(address)
  assert.ok(match)
  return { mode: 'managed', type: match[1], name: match[2], instances: [{ attributes }] }
}

function state(root, { serial = 4, deletionProtection = true, paused = true } = {}) {
  const value = {
    lineage: root.id === 'worker' ? 'c0d4a392-6333-a452-a390-6eb88a09e91f' : 'e23b4b1d-ccce-1d26-e962-7a73ddfeb83a',
    serial,
    resources: root.addresses.map((address) => resource(address,
      address === 'google_cloud_run_v2_job.reader' ? { deletion_protection: deletionProtection } :
        address === 'google_cloud_scheduler_job.dispatch' ? { paused } : {})),
  }
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  return { value, bytes, basis: { id: root.id, uri: root.stateUri, generation: root.id === 'worker' ? '21' : '22',
    sha256: sha256(bytes), lineage: value.lineage, serial, addresses: [...root.addresses] } }
}

const workerState = state(DEV125_PROVIDER_RETIREMENT_ROOTS.worker)
const readbackState = state(DEV125_PROVIDER_RETIREMENT_ROOTS.readback)
const built = buildProviderRetirementOperation({ operationId: 'DEV125-PROVIDER-UNPROTECT-R1', sourceRevision, createdAt, expiresAt, workerImage,
  cleanupReceiptRef, runtimeReceiptRef, stateBasis: { worker: workerState.basis, readback: readbackState.basis } })

function row(address, actions, before = {}, after = before) {
  return { address, change: { actions, before, after } }
}

function plans({ jobActions = ['update'], schedulerActions = ['no-op'], extra = false } = {}) {
  const worker = DEV125_PROVIDER_RETIREMENT_ROOTS.worker.addresses.map((address) => {
    if (address === 'google_cloud_run_v2_job.reader') return row(address, jobActions,
      { deletion_protection: jobActions[0] === 'update', name: 'ai-pdm-prod-openswx-metadata' },
      { deletion_protection: false, name: 'ai-pdm-prod-openswx-metadata' })
    if (address === 'google_cloud_scheduler_job.dispatch') return row(address, schedulerActions)
    return row(address, ['no-op'])
  })
  if (extra) worker.push(row('google_project_iam_member.outside', ['delete']))
  return {
    workerPlan: { format_version: '1.2', terraform_version: '1.14.5', complete: true, errored: false, resource_changes: worker },
    readbackPlan: { format_version: '1.2', terraform_version: '1.14.5', complete: true, errored: false,
      resource_changes: DEV125_PROVIDER_RETIREMENT_ROOTS.readback.addresses.map((address) => row(address, ['no-op'])) },
  }
}

function seal(value) {
  const core = { ...value }
  delete core.receiptSha256
  return { ...core, receiptSha256: sha256(Buffer.from(canonicalize(core))) }
}

function basisRecord(value) {
  return { uri: value.uri, generation: value.generation, sha256: value.sha256, lineage: value.lineage,
    serial: value.serial, addresses: value.addresses }
}

function actionDigest(value) {
  return sha256(Buffer.from(canonicalize(value)))
}

test('DEV-125 provider operation binds exact target, evidence and both remote states', () => {
  assert.equal(assertProviderRetirementOperation(built.value, { bytes: built.bytes, operationSha256: built.sha256, sourceRevision, now: '2026-10-27T12:15:00.000Z' }).mode, 'UNPROTECT')
  for (const patch of [{ projectId: 'other' }, { mode: 'ABSENT' }, { workerImage: workerImage.replace('sha256:', 'latest:') }]) {
    const value = { ...built.value, ...patch }
    const bytes = Buffer.from(`${canonicalize(value)}\n`)
    assert.throws(() => assertProviderRetirementOperation(value, { bytes, operationSha256: sha256(bytes), sourceRevision, now: '2026-10-27T12:15:00.000Z' }), /OPERATION_INVALID/u)
  }
  assert.throws(() => assertProviderRetirementOperation(built.value, { bytes: built.bytes, operationSha256: built.sha256,
    sourceRevision, now: '2026-10-27T13:00:00.000Z' }), /OPERATION_INVALID/u)
})

test('DEV-125 unprotect plan admits only the one Job flag update and preserves prebuild resources', () => {
  const summary = assertUnprotectPlans(plans())
  assert.deepEqual(summary, { workerAddressCount: 12, readbackAddressCount: 12, mutationCount: 1, mutationAddress: 'google_cloud_run_v2_job.reader' })
  assert.ok(DEV125_PROVIDER_RETIREMENT_ROOTS.readback.addresses.includes('google_project_iam_custom_role.prebuild_list_readback'))
  assert.ok(DEV125_PROVIDER_RETIREMENT_ROOTS.readback.addresses.includes('google_project_iam_member.verifier_prebuild_list_readback'))
  assert.throws(() => assertUnprotectPlans(plans({ schedulerActions: ['update'] })), /PLAN_ACTION_INVALID/u)
  assert.throws(() => assertUnprotectPlans(plans({ jobActions: ['delete'] })), /PLAN_ACTION_INVALID/u)
  assert.throws(() => assertUnprotectPlans(plans({ extra: true })), /PLAN_ADDRESS_INVALID/u)
  assert.deepEqual(assertUnprotectPlans({ ...plans({ jobActions: ['no-op'] }), recovery: true }),
    { workerAddressCount: 12, readbackAddressCount: 12, mutationCount: 0, mutationAddress: null })
  const unsafeRecovery = plans({ jobActions: ['no-op'] })
  const job = unsafeRecovery.workerPlan.resource_changes.find((row) => row.address === 'google_cloud_run_v2_job.reader')
  job.change.before.deletion_protection = true
  assert.throws(() => assertUnprotectPlans({ ...unsafeRecovery, recovery: true }), /PLAN_JOB_UPDATE_INVALID/u)
})

test('DEV-125 state checks retain exact address universe and prove Job/Scheduler state', () => {
  assert.deepEqual(stateAddresses(workerState.value), [...DEV125_PROVIDER_RETIREMENT_ROOTS.worker.addresses].sort())
  assert.equal(assertStateSnapshot(workerState.value, workerState.bytes, workerState.basis, DEV125_PROVIDER_RETIREMENT_ROOTS.worker).serial, 4)
  assert.equal(workerDeletionProtection(workerState.value), true)
  assert.equal(schedulerPaused(workerState.value), true)
  const advanced = state(DEV125_PROVIDER_RETIREMENT_ROOTS.worker, { serial: 5, deletionProtection: false })
  assert.equal(assertStateSnapshot(advanced.value, advanced.bytes, workerState.basis, DEV125_PROVIDER_RETIREMENT_ROOTS.worker, { allowAdvanced: true }).serial, 5)
  assert.equal(workerDeletionProtection(advanced.value), false)
  assert.throws(() => assertStateSnapshot({ ...workerState.value, resources: workerState.value.resources.slice(1) }, workerState.bytes,
    workerState.basis, DEV125_PROVIDER_RETIREMENT_ROOTS.worker), /STATE_BASIS_INVALID/u)
})

test('DEV-125 prerequisite receipts require terminal cleanup and zero pending current state', () => {
  const cleanup = seal({ schemaVersion: 'aipdm.dev125.openswx-retirement-cleanup-receipt.v1', status: 'RETIREMENT_COMPLETE',
    sourceRevision: '1'.repeat(40), observedAt: '2026-10-27T12:05:00.000Z',
    providerState: { schedulerState: 'PAUSED', activeExecutionCount: 0 }, databaseState: { remainingActiveRowCount: 0 } })
  const cleanupBytes = Buffer.from(JSON.stringify(cleanup))
  assert.equal(assertProviderRetirementPrerequisite(cleanup, cleanupBytes, { ...cleanupReceiptRef, sha256: sha256(cleanupBytes) }, 'cleanup',
    { operation: built.value, now: '2026-10-27T12:15:00.000Z' }).status, 'RETIREMENT_COMPLETE')
  const runtime = seal({ schemaVersion: 'aipdm.dev122.preview-openswx-runtime-readback-receipt.v1',
    sourceRevision: '2'.repeat(40), observedAt: '2026-10-27T12:04:00.000Z',
    openswxReadbackStatus: 'DB_AND_APP_ENTRY_CLEAR_PROVIDER_INVENTORY_REQUIRED',
    databaseReceipt: { state: { openswx: { pendingCount: 0, activeRowCount: 0 } } },
    provider: { openswxDispatch: { enabled: false }, revision: { trafficPercent: 100 } },
    businessDataMutation: false, serviceConfigurationMutation: false })
  const runtimeBytes = Buffer.from(JSON.stringify(runtime))
  assert.equal(assertProviderRetirementPrerequisite(runtime, runtimeBytes, { ...runtimeReceiptRef, sha256: sha256(runtimeBytes) }, 'runtime',
    { operation: built.value, now: '2026-10-27T12:15:00.000Z' }).databaseReceipt.state.openswx.pendingCount, 0)
  const unsafe = seal({ ...runtime, databaseReceipt: { state: { openswx: { pendingCount: 1, activeRowCount: 1 } } } })
  const unsafeBytes = Buffer.from(JSON.stringify(unsafe))
  assert.throws(() => assertProviderRetirementPrerequisite(unsafe, unsafeBytes, { ...runtimeReceiptRef, sha256: sha256(unsafeBytes) }, 'runtime',
    { operation: built.value, now: '2026-10-27T12:15:00.000Z' }), /PREREQUISITE_INVALID/u)
  const stale = seal({ ...cleanup, observedAt: '2026-10-27T09:00:00.000Z' })
  const staleBytes = Buffer.from(JSON.stringify(stale))
  assert.throws(() => assertProviderRetirementPrerequisite(stale, staleBytes, { ...cleanupReceiptRef, sha256: sha256(staleBytes) }, 'cleanup',
    { operation: built.value, now: '2026-10-27T12:15:00.000Z' }), /PREREQUISITE_INVALID/u)
  const postdated = seal({ ...cleanup, observedAt: '2026-10-27T12:06:00.000Z' })
  const postdatedBytes = Buffer.from(JSON.stringify(postdated))
  assert.throws(() => assertProviderRetirementPrerequisite(postdated, postdatedBytes,
    { ...cleanupReceiptRef, sha256: sha256(postdatedBytes) }, 'cleanup',
    { operation: built.value, now: '2026-10-27T12:15:00.000Z' }), /PREREQUISITE_INVALID/u)
})

test('DEV-125 Terraform environment fixes default workspace and removes override channels', () => {
  const environment = sanitizedTerraformEnvironment({ PATH: '/usr/bin', HOME: '/tmp/home', GOOGLE_OAUTH_ACCESS_TOKEN: 'token-value',
    GOOGLE_APPLICATION_CREDENTIALS: '/tmp/other.json', TF_WORKSPACE: 'other', TF_CLI_ARGS_plan: '-destroy',
    TF_DATA_DIR: '/tmp/foreign', TERRAFORM_CONFIG: '/tmp/foreign.rc' })
  assert.deepEqual(environment, { PATH: '/usr/bin', HOME: '/tmp/home', GOOGLE_OAUTH_ACCESS_TOKEN: 'token-value',
    TF_IN_AUTOMATION: '1', TF_INPUT: '0', TF_WORKSPACE: 'default' })
})

test('DEV-125 provider receipt is operation-bound and replay-verifiable', () => {
  const operationRef = { uri: `gs://jenfu-platform-prod-aipdm-release/source/openswx-dispatch-recovery/dev125-provider-retirement/op.json`, sha256: built.sha256, generation: '31' }
  const outputRef = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV125-OPENSWX-PROVIDER-RETIREMENT/${built.sha256}/UNPROTECT.json`
  const authorizedSummary = { mode: 'UNPROTECT', workerAddressCount: 12, readbackAddressCount: 12,
    mutationCount: 1, mutationAddress: 'google_cloud_run_v2_job.reader' }
  const authorizedPlan = { workerSha256: actionDigest({ root: 'worker', summary: authorizedSummary }),
    readbackSha256: actionDigest({ root: 'readback', addressCount: 12, mutationCount: 0 }) }
  const stateBefore = { worker: basisRecord(workerState.basis), readback: basisRecord(readbackState.basis) }
  const claim = buildProviderRetirementClaim({ operation: built.value, operationRef, plan: authorizedPlan, stateBefore,
    observedAt: '2026-10-27T11:59:00.000Z' })
  assert.equal(assertProviderRetirementClaim(claim, { operation: built.value, operationRef }).mode, 'UNPROTECT')
  const executedPlan = { workerActionsSha256: actionDigest({ root: 'worker', summary: authorizedSummary }),
    readbackActionsSha256: authorizedPlan.readbackSha256, workerBinarySha256: '2'.repeat(64), readbackBinarySha256: '3'.repeat(64) }
  const receipt = buildProviderRetirementReceipt({ operation: built.value, operationRef, outputRef,
    claimRef: { uri: outputRef.replace('UNPROTECT.json', 'claim.json'), sha256: '1'.repeat(64), generation: '32' },
    plan: executedPlan, stateBefore,
    stateAfter: { worker: { ...basisRecord(workerState.basis), generation: '33', sha256: '4'.repeat(64), serial: 5 },
      readback: basisRecord(readbackState.basis) },
    providerReadback: { jobDeletionProtection: false, schedulerState: 'PAUSED', executionCount: 46, activeExecutionCount: 0, executionPageCount: 2 },
    observedAt: '2026-10-27T12:00:00.000Z', recovered: false })
  assert.equal(assertProviderRetirementReceipt(receipt, { operation: built.value, operationRef, outputRef }).status, 'UNPROTECT_COMPLETE')
  const claimBytes = Buffer.from(`${canonicalize(claim)}\n`)
  const providerReadback = { jobDeletionProtection: false, schedulerState: 'PAUSED', executionCount: 46, activeExecutionCount: 0, executionPageCount: 2 }
  const replay = { receipt, claim, claimBytes, claimGeneration: '32',
    workerSnapshot: { uri: workerState.basis.uri, generation: '33', bytes: Buffer.from(`${JSON.stringify({ ...workerState.value, serial: 5,
      resources: workerState.value.resources.map((entry) => entry.type === 'google_cloud_run_v2_job'
        ? { ...entry, instances: [{ attributes: { deletion_protection: false } }] } : entry) })}\n`) },
    readbackSnapshot: { uri: readbackState.basis.uri, generation: readbackState.basis.generation, bytes: readbackState.bytes,
      value: readbackState.value }, providerReadback }
  replay.workerSnapshot.value = JSON.parse(replay.workerSnapshot.bytes)
  receipt.claimRef.sha256 = sha256(claimBytes)
  receipt.stateAfter.worker.sha256 = sha256(replay.workerSnapshot.bytes)
  receipt.receiptSha256 = seal(receipt).receiptSha256
  assert.equal(assertProviderRetirementReplayEvidence(replay, { operation: built.value, operationRef, outputRef }).status, 'UNPROTECT_COMPLETE')
  assert.throws(() => assertProviderRetirementReplayEvidence({ ...replay, claimBytes: Buffer.from('{}') },
    { operation: built.value, operationRef, outputRef }), /REPLAY_INVALID/u)
  const tampered = seal({ ...receipt, status: 'PASS' })
  assert.throws(() => assertProviderRetirementReceipt(tampered, { operation: built.value, operationRef, outputRef }), /RECEIPT_INVALID/u)
  const substitutedClaim = seal({ ...receipt, claimRef: { ...receipt.claimRef, uri: receipt.claimRef.uri.replace('claim.json', 'other.json') } })
  assert.throws(() => assertProviderRetirementReceipt(substitutedClaim, { operation: built.value, operationRef, outputRef }), /RECEIPT_INVALID/u)
})

test('DEV-125 provider inventory paginates all terminal executions and rejects active or repeated pages', async () => {
  const job = { name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata', deletionProtection: true }
  const scheduler = { name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/aipdm-prod-openswx-dispatch', state: 'PAUSED' }
  const terminal = (name) => ({ name: `${job.name}/executions/${name}`, conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }] })
  const urls = []
  const transport = { async request(url) {
    urls.push(url)
    if (url.includes('cloudscheduler')) return scheduler
    if (!url.includes('/executions')) return job
    if (!url.includes('pageToken=')) return { executions: [terminal('one')], nextPageToken: 'two' }
    return { executions: [terminal('two')] }
  } }
  assert.deepEqual(await readProviderInventory(transport), { jobDeletionProtection: true, schedulerState: 'PAUSED', executionCount: 2, activeExecutionCount: 0, executionPageCount: 2 })
  assert.equal(urls.filter((url) => url.includes('/executions')).length, 2)
  const activeTransport = { async request(url) {
    if (url.includes('cloudscheduler')) return scheduler
    if (!url.includes('/executions')) return job
    return { executions: [{ name: `${job.name}/executions/active`, conditions: [{ type: 'Completed', state: 'CONDITION_PENDING' }] }] }
  } }
  await assert.rejects(() => readProviderInventory(activeTransport), /EXECUTION_ACTIVE/u)
  const repeated = { async request(url) {
    if (url.includes('cloudscheduler')) return scheduler
    if (!url.includes('/executions')) return job
    return { executions: [terminal('same')], nextPageToken: 'again' }
  } }
  await assert.rejects(() => readProviderInventory(repeated), /PROVIDER_INVENTORY_INVALID/u)
})

test('DEV-125 workflow binding accepts only its immutable operation namespace', () => {
  const ref = `gs://jenfu-platform-prod-aipdm-release/source/openswx-dispatch-recovery/dev125-provider-retirement/op.json#sha256=${'a'.repeat(64)}`
  assert.deepEqual(bindOperationRef(ref), { operationUri: ref.split('#')[0], operationSha256: 'a'.repeat(64) })
  assert.throws(() => bindOperationRef(ref.replace('dev125-provider-retirement', '../other')), /REF_INVALID/u)
  const output = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV125-OPENSWX-PROVIDER-RETIREMENT/${'a'.repeat(64)}/UNPROTECT.json`
  assert.equal(parseArgs(['--stage', 'unprotect', '--operation-ref', ref.split('#')[0], '--operation-sha256', 'a'.repeat(64), '--source-revision', sourceRevision, '--output-ref', output]).outputRef, output)
})

test('DEV-125 provider workflow is fixed to main, production concurrency and deployer identity', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/read-ai-pdm-rd-permission-state-production.yml', import.meta.url), 'utf8')
  assert.match(workflow, /group: production-release-ai-pdm-prod/u)
  assert.match(workflow, /WIF_PROVIDER: projects\/9536592944\/locations\/global\/workloadIdentityPools\/jenfu-prod-release\/providers\/aipdm-github/u)
  assert.match(workflow, /service_account: aipdm-prod-deployer@jenfu-platform-prod\.iam\.gserviceaccount\.com/u)
  assert.match(workflow, /terraform_version: "1\.14\.5"/u)
  assert.match(workflow, /dev012-verify-official-source\.mjs/u)
  assert.match(workflow, /dev125-provider-retirement\.mjs --stage unprotect/u)
  assert.doesNotMatch(workflow, /terraform\s+(?:apply|destroy)|--target|gcloud\s+(?:projects|iam|secrets|run)\s/u)
})
