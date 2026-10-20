import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { executeFenceOperation } from './dev121-principal-fence-operator.mjs'

const SERVICE = 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
const BUCKET = 'jenfu-platform-prod-aipdm-release'
const sourceRevision = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const oldRevision = 'ai-pdm-prod-oldrevision123'
const recoveryRevision = 'ai-pdm-prod-maintenance123'
const serviceUid = 'd65f379b-a342-4eb3-ba22-109aa5f368c5'
const recoveryImage = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-recovery@sha256:' + 'c'.repeat(64)
const baseTime = Date.parse('2026-10-11T02:00:00.000Z')
const recoveryRef = {
  uri: 'gs://' + BUCKET + '/receipts/releases/DEV121-PRINCIPAL-ONLY-RECOVERY/' + sourceRevision + '.json',
  sha256: 'd'.repeat(64),
}
const profile = {
  application: { id: 'ai-pdm', repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main' },
  target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'ai-pdm-prod' },
  artifact: { releaseBucket: BUCKET },
  runtime: { containerName: 'ai-pdm' },
}
const git = { clean: true, branch: 'main', sourceRevision, remoteRevision: sourceRevision, sourceTree }
const sourceProof = {
  schemaVersion: 'jenfu.dev012.official-merged-source.v1',
  sourceRevision, sourceTree, repository: profile.application.repository, branch: 'main',
  branchProtected: true, rulesetId: 24077878,
  reviewMode: 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED',
  status: 'OFFICIAL_MERGED_PR_VERIFIED', pullRequestNumber: 301,
  // Sealed historical proofs retain the pre-rename Platform gate label.
  requiredChecks: ['DEV-012 Isolated PostgreSQL Cutover', 'Production Slice QC'],
}
const oldTraffic = { revision: oldRevision, percent: 100 }
const operationRoot = 'projects/jenfu-platform-prod/locations/asia-east1/operations/'
const submissionUri = 'gs://' + BUCKET + '/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/' +
  sourceRevision + '/submission-10.json'

function codedError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function copyRecord(record, extra = {}) {
  return { bytes: Buffer.from(record.bytes), ref: { ...record.ref },
    metadata: { ...record.metadata }, ...extra }
}

function makeHarness(options = {}) {
  let monoMs = 0
  let wallMs = baseTime
  let delayedUnknownService
  const calls = {
    readJson: [], readBytes: [], puts: [], serviceReads: 0, revisionReads: [],
    requests: [], patches: [], operationReads: 0, events: [], sleepMs: 0, nowCalls: 0,
  }
  const records = new Map()
  const operations = new Map()
  const initialService = {
    name: SERVICE, uid: serviceUid, etag: 'etag-10', generation: '10', observedGeneration: '10',
    reconciling: false, updateTime: new Date(baseTime - 60_000).toISOString(),
    terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    ...(options.recoveryIsCurrentTemplate
      ? { latestCreatedRevision: recoveryRevision,
          template: { revision: recoveryRevision, timeout: options.templateTimeout ?? '60s',
            containers: [{ name: 'ai-pdm', image: recoveryImage }] } }
      : { template: { timeout: options.templateTimeout ?? '60s', containers: [{ name: 'ai-pdm', image: 'app@sha256:old' }] } }),
    scaling: structuredClone(options.baselineScaling ??
      { scalingMode: 'AUTOMATIC', minInstanceCount: 1, maxInstanceCount: 4 }),
    traffic: [{ ...oldTraffic }], trafficStatuses: [{ ...oldTraffic }],
  }
  let service = structuredClone(initialService)
  const proof = {
    schemaVersion: 'ai-pdm.principal-only-recovery.v1', sourceRevision,
    projectId: 'jenfu-platform-prod', region: 'asia-east1', service: 'ai-pdm-prod',
    serviceUid, oldRevision, recoveryRevision, imageDigest: recoveryImage, status: 'PASS',
  }
  let unknownFenceSeen = false
  let submissionArrivals = 0
  let releaseSubmissionBarrier
  const submissionBarrier = new Promise(resolve => { releaseSubmissionBarrier = resolve })

  function record(uri, bytes) {
    const content = Buffer.from(bytes)
    return { bytes: content, ref: { uri, sha256: sha256(content) },
      metadata: { generation: String(100 + records.size) } }
  }
  function store(uri, bytes) {
    const value = record(uri, bytes)
    records.set(uri, value)
    return value
  }
  if (options.priorSubmission) store(submissionUri, Buffer.from('already durable\n'))

  const now = options.fastWallClock
    ? () => {
      calls.nowCalls += 1
      wallMs += 2_500
      return new Date(wallMs).toISOString()
    }
    : () => {
      calls.nowCalls += 1
      return new Date(baseTime).toISOString()
    }
  const monotonic = () => monoMs
  const sleep = async ms => {
    calls.events.push('sleep:' + ms)
    calls.sleepMs += ms
    monoMs += options.monotonicStepMs ?? ms
  }

  const transport = {
    async readJson(ref, bucket) {
      calls.readJson.push({ ref, bucket })
      return { value: structuredClone(proof) }
    },
    async readBytes(uri, readOptions = {}) {
      calls.readBytes.push({ uri, ...readOptions })
      if (uri === submissionUri && readOptions.expectedSha256 && options.unknownSubmissionReadbackError) {
        throw codedError(options.unknownSubmissionReadbackError)
      }
      const found = records.get(uri)
      if (!found) throw codedError('MISSING')
      return copyRecord(found)
    },
    async putJson(uri, value, writeOptions = {}) {
      calls.puts.push({ uri, value: structuredClone(value), options: { ...writeOptions } })
      if (options.failFenceWrite && uri.includes('/fence-')) throw codedError('FENCE_WRITE_FAILED')
      if (uri === submissionUri && options.unknownSubmissionWrite) {
        store(uri, Buffer.from('another durable claim\n'))
        throw codedError('OUTCOME_UNKNOWN')
      }
      if (options.concurrentClaim && uri === submissionUri) {
        submissionArrivals += 1
        if (submissionArrivals === 2) releaseSubmissionBarrier()
        await submissionBarrier
        const winner = records.get(uri)
        if (winner) return copyRecord(winner, { reused: true })
      }
      const winner = records.get(uri)
      if (winner) return copyRecord(winner, { reused: true })
      const created = store(uri, Buffer.from(canonicalize(value) + '\n'))
      if (options.unknownFenceReceipt && uri.includes('/fence-') && !unknownFenceSeen) {
        unknownFenceSeen = true
        throw codedError('OUTCOME_UNKNOWN')
      }
      return copyRecord(created)
    },
    async getService() {
      calls.serviceReads += 1
      calls.events.push('service:' + calls.serviceReads)
      if (options.adoptionDrift && calls.serviceReads === 2) {
        service = { ...service, etag: 'etag-drift', generation: String(Number(service.generation) + 1),
          observedGeneration: String(Number(service.generation) + 1), updateTime: new Date(baseTime).toISOString() }
      }
      if (options.drainDrift && calls.serviceReads === 4) {
        service = { ...service, traffic: [{ revision: 'ai-pdm-prod-unexpected', percent: 100 }] }
      }
      if (delayedUnknownService && calls.serviceReads >= 4) {
        service = delayedUnknownService
        delayedUnknownService = undefined
      }
      return structuredClone(service)
    },
    async getRevision(_profile, revisionName) {
      calls.revisionReads.push(revisionName)
      if (revisionName === oldRevision) {
        return { name: SERVICE + '/revisions/' + oldRevision, timeout: options.activeTimeout ?? options.templateTimeout ?? '60s',
          conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
      }
      return { name: SERVICE + '/revisions/' + recoveryRevision,
        conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
        containers: [{ name: profile.runtime.containerName, image: recoveryImage }] }
    },
    async request(url, requestOptions = {}) {
      const method = requestOptions.method ?? 'GET'
      calls.requests.push({ url, method })
      if (method === 'PATCH') {
        const body = JSON.parse(requestOptions.body)
        const patchNumber = calls.patches.length + 1
        calls.events.push(options.unknownPatch && patchNumber === 1 ? 'patch:unknown' : 'patch:' + patchNumber)
        calls.patches.push({ url, body, options: requestOptions })
        const operationError = options.operationErrorPatch === patchNumber
        const applyPatch = !(operationError && options.applyPatchOnOperationError === false)
        if (applyPatch) {
          const providerScaling = options.providerOmitsAutomaticBoundsInManual &&
            body.scaling.scalingMode === 'MANUAL'
            ? { scalingMode: 'MANUAL', manualInstanceCount: body.scaling.manualInstanceCount }
            : structuredClone(body.scaling)
          const changed = { ...service, scaling: providerScaling,
            etag: 'etag-' + (10 + patchNumber), generation: String(Number(service.generation) + 1),
            observedGeneration: String(Number(service.generation) + 1),
            updateTime: new Date(baseTime).toISOString(), reconciling: false }
          if (options.unknownPatch && options.delayedUnknownPatch && patchNumber === 1) {
            delayedUnknownService = changed
          } else {
            service = changed
          }
        }
        if (options.unknownPatch && patchNumber === 1) throw codedError('OUTCOME_UNKNOWN')
        const name = operationRoot + 'fence-operation-' + patchNumber
        operations.set(name, operationError
          ? { done: true, error: { code: 'FAILED' } }
          : { done: true })
        return { name }
      }
      calls.operationReads += 1
      calls.events.push('operation:' + calls.operationReads)
      const name = url.replace('https://run.googleapis.com/v2/', '')
      if (calls.operationReads <= (options.operationUnknownReads ?? 0)) throw codedError('OUTCOME_UNKNOWN')
      if (options.operationNeverCompletes) return { done: false }
      return structuredClone(operations.get(name) ?? { done: false })
    },
  }

  return {
    profile: structuredClone(profile), git: { ...git }, sourceProof: structuredClone(sourceProof),
    recoveryRef: { ...recoveryRef }, transport, calls, records, initialService,
    currentService: () => structuredClone(service), clock: () => ({ monoMs, wallMs }),
    now, monotonic, sleep,
  }
}

function input(harness, overrides = {}) {
  return {
    profile: harness.profile, git: harness.git, sourceProof: harness.sourceProof,
    recoveryRef: harness.recoveryRef, transport: harness.transport, acquire: true,
    now: harness.now, sleep: harness.sleep, monotonic: harness.monotonic,
    ...overrides,
  }
}

function providerCallCount(calls) {
  return calls.readJson.length + calls.readBytes.length + calls.serviceReads +
    calls.revisionReads.length + calls.requests.length + calls.puts.length
}

function assertScalingOnly(patch, expectedScaling, expectedEtag) {
  assert.equal(patch.url.split('?')[1], 'updateMask=scaling')
  assert.deepEqual(Object.keys(patch.body).sort(), ['etag', 'name', 'scaling'])
  assert.equal(patch.body.name, SERVICE)
  assert.equal(patch.body.etag, expectedEtag)
  assert.deepEqual(patch.body.scaling, expectedScaling)
}

test('rejects invalid source, target and recovery ref before any provider access', async () => {
  const cases = [
    { code: 'DEV121_FENCE_OPERATOR_SOURCE_INVALID',
      override: h => ({ git: { ...h.git, branch: 'feature' } }) },
    { code: 'DEV121_FENCE_OPERATOR_SOURCE_INVALID',
      override: h => ({ profile: { ...h.profile,
        target: { ...h.profile.target, projectId: 'jenfu-platform-dev' } } }) },
    { code: 'DEV121_FENCE_OPERATOR_RECOVERY_REF_INVALID',
      override: h => ({ recoveryRef: { ...h.recoveryRef, sha256: 'bad' } }) },
  ]
  for (const scenario of cases) {
    const h = makeHarness()
    await assert.rejects(executeFenceOperation(input(h, scenario.override(h))),
      error => error.code === scenario.code)
    assert.equal(providerCallCount(h.calls), 0)
  }
})

test('normal --check proves readiness with zero mutations', async () => {
  const h = makeHarness()
  const result = await executeFenceOperation(input(h, { acquire: false }))
  assert.equal(result.status, 'READINESS_PASS')
  assert.equal(result.mutationCount, 0)
  assert.equal(h.calls.patches.length, 0)
  assert.equal(h.calls.puts.length, 0)
  assert.equal(h.calls.serviceReads > 0, true)
})

test('a 60-second active revision is rejected when the service drain bound is 15 seconds', async () => {
  const h = makeHarness({ templateTimeout: '15s', activeTimeout: '60s' })
  await assert.rejects(executeFenceOperation(input(h)), error =>
    error.code === 'DEV121_FENCE_OPERATOR_ACTIVE_TIMEOUT_INVALID')
  assert.equal(h.calls.patches.length, 0)
  assert.equal(h.calls.puts.length, 0)
})

test('a pre-existing nonzero manual count is rejected without a scaling mutation', async () => {
  const h = makeHarness({ baselineScaling: { scalingMode: 'MANUAL', manualInstanceCount: 1 } })
  await assert.rejects(executeFenceOperation(input(h)), error =>
    error.code === 'DEV121_FENCE_OPERATOR_BASELINE_NOT_AUTOMATIC')
  assert.equal(h.calls.patches.length, 0)
  assert.equal(h.calls.puts.length, 0)
})

test('manual-zero --check admits only the exact current recovery template without mutations', async () => {
  const h = makeHarness({ baselineScaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
    recoveryIsCurrentTemplate: true })
  const result = await executeFenceOperation(input(h, { acquire: false }))
  assert.equal(result.status, 'QUIESCENCE_ADOPTION_READY')
  assert.equal(result.mutationCount, 0)
  assert.equal(h.calls.patches.length, 0)
  assert.equal(h.calls.puts.length, 0)
  assert.equal(h.calls.sleepMs, 0)
})

test('manual-zero acquire waits a fresh drain and publishes a source-bound fence without PATCH', async () => {
  const h = makeHarness({ baselineScaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
    recoveryIsCurrentTemplate: true })
  const result = await executeFenceOperation(input(h))
  assert.equal(result.status, 'QUIESCENCE_ADOPTED')
  assert.equal(result.mutationCount, 0)
  assert.equal(h.calls.patches.length, 0)
  assert.equal(h.calls.sleepMs, 90_000)
  assert.equal(h.calls.puts.length, 1)
  assert.match(h.calls.puts[0].uri, new RegExp('/' + sourceRevision + '/fence-10\\.json$'))
  assert.equal(h.calls.puts[0].value.sourceRevision, sourceRevision)
  assert.equal(h.calls.puts[0].value.beforeGeneration, 9)
  assert.equal(h.calls.puts[0].value.quiescentGeneration, 10)
  assert.deepEqual(result.principalOnlyRecovery.receiptRef, recoveryRef)
})

test('manual-zero adoption rejects a stale recovery template and provider drift without mutation', async () => {
  const stale = makeHarness({ baselineScaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 } })
  await assert.rejects(executeFenceOperation(input(stale)), error =>
    error.code === 'DEV121_FENCE_OPERATOR_RECOVERY_TEMPLATE_NOT_CURRENT')
  assert.equal(stale.calls.patches.length, 0)
  assert.equal(stale.calls.puts.length, 0)

  const drift = makeHarness({ baselineScaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
    recoveryIsCurrentTemplate: true, adoptionDrift: true })
  await assert.rejects(executeFenceOperation(input(drift)), error =>
    error.code === 'DEV121_FENCE_OPERATOR_DRAIN_DRIFT')
  assert.equal(drift.calls.patches.length, 0)
  assert.equal(drift.calls.puts.length, 0)
})

test('quiesce accepts provider manual scaling without automatic bounds and retains the full baseline', async () => {
  const h = makeHarness({ providerOmitsAutomaticBoundsInManual: true })
  const result = await executeFenceOperation(input(h))
  const stoppedScaling = { scalingMode: 'MANUAL', manualInstanceCount: 0 }
  assert.equal(result.status, 'QUIESCED')
  assert.equal(h.calls.patches.length, 1)
  assertScalingOnly(h.calls.patches[0], stoppedScaling, 'etag-10')
  assert.equal(h.calls.sleepMs, 90_000)
  assert.deepEqual(h.currentService().template, h.initialService.template)
  assert.deepEqual(h.currentService().traffic, h.initialService.traffic)
  assert.deepEqual(h.currentService().trafficStatuses, h.initialService.trafficStatuses)
  assert.deepEqual(h.currentService().scaling, stoppedScaling)
  const submission = JSON.parse(h.records.get(submissionUri).bytes.toString('utf8'))
  assert.deepEqual(submission.baseline.scaling, h.initialService.scaling)
})

test('a fast local wall clock cannot shorten the monotonic drain', async () => {
  const h = makeHarness({ fastWallClock: true })
  const result = await executeFenceOperation(input(h))
  assert.equal(result.status, 'QUIESCED')
  assert.equal(h.calls.sleepMs, 90_000)
  assert.equal(h.clock().monoMs, 90_000)
  assert.ok(h.clock().wallMs - baseTime >= 5 * 60_000)
  assert.ok(h.clock().wallMs - baseTime < 10 * 60_000)
})

test('unknown PATCH waits for delayed service readback and is never resubmitted', async () => {
  const h = makeHarness({ unknownPatch: true, delayedUnknownPatch: true })
  const result = await executeFenceOperation(input(h))
  assert.equal(result.status, 'QUIESCED')
  assert.equal(h.calls.patches.length, 1)
  assert.equal(h.calls.sleepMs, 91_000)
  const patchIndex = h.calls.events.indexOf('patch:unknown')
  const afterPatch = h.calls.events.slice(patchIndex + 1)
  assert.match(afterPatch[0], /^service:/u)
  assert.equal(afterPatch[1], 'sleep:1000')
  assert.match(afterPatch[2], /^service:/u)
  assert.equal(afterPatch[3], 'sleep:1000')
})

test('transient unknown LRO reads wait for operation visibility without resubmitting PATCH', async () => {
  const h = makeHarness({ operationUnknownReads: 2 })
  const result = await executeFenceOperation(input(h))
  assert.equal(result.status, 'QUIESCED')
  assert.equal(h.calls.operationReads, 3)
  assert.equal(h.calls.patches.length, 1)
  assert.equal(h.calls.sleepMs, 95_000)
})

test('a persistently unknown LRO uses only three bounded retries', async () => {
  const h = makeHarness({ operationUnknownReads: 99 })
  await assert.rejects(executeFenceOperation(input(h)), error =>
    error.code === 'OUTCOME_UNKNOWN' &&
    error.recoveryDisposition === 'READBACK_REQUIRED_NO_FURTHER_MUTATION')
  assert.equal(h.calls.operationReads, 4)
  assert.equal(h.calls.patches.length, 1)
  assert.equal(h.calls.sleepMs, 7_500)
})

test('done-false LRO expires by monotonic time when wall clock is stopped', async () => {
  const h = makeHarness({ operationNeverCompletes: true, monotonicStepMs: 300_000 })
  await assert.rejects(executeFenceOperation(input(h)), error =>
    error.code === 'DEV121_FENCE_OPERATOR_OPERATION_TIMEOUT' &&
    error.recoveryDisposition === 'READBACK_REQUIRED_NO_FURTHER_MUTATION')
  assert.equal(h.calls.operationReads, 2)
  assert.equal(h.calls.patches.length, 1)
  assert.equal(h.calls.sleepMs, 5_000)
  assert.equal(h.clock().monoMs, 600_000)
})

test('operation error without a changed service remains failed and does not compensate', async () => {
  const h = makeHarness({ operationErrorPatch: 1, applyPatchOnOperationError: false })
  await assert.rejects(executeFenceOperation(input(h)), error =>
    error.code === 'DEV121_FENCE_OPERATOR_OPERATION_FAILED' &&
    error.recoveryDisposition === 'BASELINE_UNCHANGED')
  assert.equal(h.calls.patches.length, 1)
  assert.deepEqual(h.currentService().scaling, h.initialService.scaling)
})

test('operation failure restores the full baseline after provider omits automatic bounds in manual mode', async () => {
  const h = makeHarness({ operationErrorPatch: 1, providerOmitsAutomaticBoundsInManual: true })
  await assert.rejects(executeFenceOperation(input(h)), error =>
    error.code === 'DEV121_FENCE_OPERATOR_OPERATION_FAILED' &&
    error.recoveryDisposition === 'BASELINE_SCALING_RESTORED')
  assert.equal(h.calls.patches.length, 2)
  assertScalingOnly(h.calls.patches[0],
    { scalingMode: 'MANUAL', manualInstanceCount: 0 }, 'etag-10')
  assertScalingOnly(h.calls.patches[1], h.initialService.scaling, 'etag-11')
  assert.deepEqual(h.currentService().scaling, h.initialService.scaling)
  assert.deepEqual(h.currentService().template, h.initialService.template)
  assert.deepEqual(h.currentService().traffic, h.initialService.traffic)
})

test('fence receipt write failure after drain restores the full baseline with provider-omitted manual bounds', async () => {
  const h = makeHarness({ providerOmitsAutomaticBoundsInManual: true, failFenceWrite: true })
  await assert.rejects(executeFenceOperation(input(h)), error =>
    error.code === 'FENCE_WRITE_FAILED' &&
    error.recoveryDisposition === 'BASELINE_SCALING_RESTORED')
  assert.equal(h.calls.sleepMs, 90_000)
  assert.equal(h.calls.patches.length, 2)
  assertScalingOnly(h.calls.patches[0],
    { scalingMode: 'MANUAL', manualInstanceCount: 0 }, 'etag-10')
  assertScalingOnly(h.calls.patches[1], h.initialService.scaling, 'etag-11')
  assert.deepEqual(h.currentService().scaling, h.initialService.scaling)
  assert.deepEqual(h.currentService().scaling, {
    scalingMode: 'AUTOMATIC', minInstanceCount: 1, maxInstanceCount: 4,
  })
})

test('drain drift fails closed and is never rolled back over the changed service', async () => {
  const h = makeHarness({ drainDrift: true, providerOmitsAutomaticBoundsInManual: true })
  await assert.rejects(executeFenceOperation(input(h)), error =>
    error.code === 'DEV121_FENCE_OPERATOR_DRAIN_DRIFT' &&
    error.recoveryDisposition === 'READBACK_REQUIRED_NO_FURTHER_MUTATION')
  assert.equal(h.calls.patches.length, 1)
  assert.deepEqual(h.calls.patches[0].body.scaling,
    { scalingMode: 'MANUAL', manualInstanceCount: 0 })
  assert.equal(h.currentService().traffic[0].revision, 'ai-pdm-prod-unexpected')
})

test('unknown immutable fence receipt is accepted only after same-hash readback', async () => {
  const h = makeHarness({ unknownFenceReceipt: true })
  const result = await executeFenceOperation(input(h))
  assert.equal(result.status, 'QUIESCED')
  const fenceWrite = h.calls.puts.find(row => row.uri.includes('/fence-'))
  assert.ok(fenceWrite)
  assert.equal(h.calls.puts.filter(row => row.uri === fenceWrite.uri).length, 1)
  const expectedHash = sha256(Buffer.from(canonicalize(fenceWrite.value) + '\n'))
  const readback = h.calls.readBytes.find(row => row.uri === fenceWrite.uri && row.expectedSha256)
  assert.equal(readback.expectedSha256, expectedHash)
  assert.equal(result.principalOnlyFenceRef.sha256, expectedHash)
})

test('a durable prior submission claim blocks another scaling PATCH', async () => {
  const h = makeHarness({ priorSubmission: true })
  await assert.rejects(executeFenceOperation(input(h)), error =>
    error.code === 'DEV121_FENCE_OPERATOR_PRIOR_SUBMISSION_REQUIRES_READBACK')
  assert.equal(h.calls.patches.length, 0)
  assert.equal(h.calls.puts.length, 0)
})

test('unknown exclusive claim readback conflicts map to prior submission and never reach writers', async () => {
  for (const readbackError of ['GCS_READBACK_HASH_MISMATCH', 'GCS_IMMUTABILITY_CONFLICT']) {
    const h = makeHarness({ unknownSubmissionWrite: true,
      unknownSubmissionReadbackError: readbackError })
    let sqlWriterCalls = 0
    const database = { query: async () => { sqlWriterCalls += 1; return { rows: [] } } }
    await assert.rejects(executeFenceOperation(input(h, { database })), error =>
      error.code === 'DEV121_FENCE_OPERATOR_PRIOR_SUBMISSION_REQUIRES_READBACK')
    assert.equal(h.calls.patches.length, 0)
    assert.equal(h.calls.requests.filter(row => row.method === 'PATCH').length, 0)
    assert.equal(sqlWriterCalls, 0)
  }
})

test('parallel callers produce one winning durable claim and one PATCH', async () => {
  const h = makeHarness({ concurrentClaim: true })
  const results = await Promise.allSettled([
    executeFenceOperation(input(h)), executeFenceOperation(input(h)),
  ])
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1)
  const rejected = results.find(row => row.status === 'rejected')
  assert.equal(rejected.reason.code, 'DEV121_FENCE_OPERATOR_PRIOR_SUBMISSION_REQUIRES_READBACK')
  assert.equal(h.calls.patches.length, 1)
  assert.equal(h.calls.patches[0].body.scaling.scalingMode, 'MANUAL')
  assert.equal(h.calls.puts.filter(row => row.uri === submissionUri).length, 2)
})

test('CLI terminates on missing bounded inputs without opening a listener', () => {
  const cliPath = fileURLToPath(new URL('../dev121-principal-fence-operator.mjs', import.meta.url))
  const repoRoot = path.resolve(path.dirname(cliPath), '..')
  const env = { ...process.env }
  delete env.GOOGLE_OAUTH_ACCESS_TOKEN
  delete env.GITHUB_TOKEN
  delete env.AIPDM_PRINCIPAL_RECOVERY_REF
  const child = spawnSync(process.execPath, [cliPath, '--check'], {
    cwd: repoRoot, env, encoding: 'utf8', timeout: 5_000, windowsHide: true,
  })
  assert.equal(child.error, undefined)
  assert.equal(child.signal, null)
  assert.equal(child.status, 1)
  assert.match(child.stderr, /DEV121_FENCE_OPERATOR_INPUT_INVALID/u)
  assert.equal(child.stdout, '')
})
