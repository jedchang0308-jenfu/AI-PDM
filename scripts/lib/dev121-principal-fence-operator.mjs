import { randomUUID } from 'node:crypto'
import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import { assertRecoveryProofReadback } from './dev121-principal-only-release.mjs'
import { assertPrincipalOnlyMigrationFence } from './dev121-migration-fence.mjs'

const NAME = 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
const URL = 'https://run.googleapis.com/v2/' + NAME
const BUCKET = 'jenfu-platform-prod-aipdm-release'
const PREFIX = 'gs://' + BUCKET + '/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/'
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const metadataFields = new Set(['etag', 'generation', 'observedGeneration',
  'reconciling', 'updateTime', 'terminalCondition', 'conditions', 'trafficStatuses', 'scaling'])

function fail(code) {
  const error = new Error('DEV121_FENCE_OPERATOR_' + code)
  error.code = error.message
  throw error
}
function stable(value) { return canonicalize(value) }
function invariant(service) {
  return stable(Object.fromEntries(Object.entries(service)
    .filter(([key]) => !metadataFields.has(key))))
}
function settled(service) {
  if (service?.name !== NAME || !service.uid || !service.etag ||
    !/^[1-9][0-9]*$/u.test(String(service.generation ?? '')) ||
    service.reconciling === true ||
    service.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
    String(service.observedGeneration) !== String(service.generation)) fail('SERVICE_INVALID')
}
function oldOnly(service, oldRevision) {
  for (const rows of [service.traffic, service.trafficStatuses]) {
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].revision !== oldRevision ||
      Number(rows[0].percent) !== 100 || rows[0].tag !== undefined ||
      rows[0].latestRevision === true) fail('TRAFFIC_INVALID')
  }
}
function requestTimeout(value) {
  const match = /^([1-9][0-9]?)s$/u.exec(value ?? '')
  const seconds = Number(match?.[1])
  if (!match || seconds > 60) fail('TIMEOUT_INVALID')
  return seconds
}
function recoveryTemplateIsCurrent(service, recovery, profile) {
  const fullRevision = NAME + '/revisions/' + recovery.revision
  const container = service?.template?.containers?.find(row => row.name === profile.runtime.containerName)
  return [recovery.revision, fullRevision].includes(service?.latestCreatedRevision) &&
    service?.template?.revision === recovery.revision &&
    container?.image === recovery.imageDigest
}
function assertSource(profile, git, sourceProof) {
  if (profile?.application?.id !== 'ai-pdm' ||
    profile.application.repository !== 'jedchang0308-jenfu/AI-PDM' ||
    profile.application.branch !== 'main' ||
    profile.target?.projectId !== 'jenfu-platform-prod' ||
    profile.target.region !== 'asia-east1' || profile.target.serviceName !== 'ai-pdm-prod' ||
    profile.artifact?.releaseBucket !== BUCKET || git?.clean !== true ||
    git.branch !== 'main' || !H40.test(git.sourceRevision ?? '') ||
    git.remoteRevision !== git.sourceRevision || !H40.test(git.sourceTree ?? '') ||
    sourceProof?.schemaVersion !== 'jenfu.dev012.official-merged-source.v1' ||
    sourceProof.sourceRevision !== git.sourceRevision ||
    sourceProof.sourceTree !== git.sourceTree ||
    sourceProof.repository !== profile.application.repository ||
    sourceProof.branch !== 'main' || sourceProof.branchProtected !== true ||
    sourceProof.rulesetId !== 24077878 ||
    sourceProof.reviewMode !== 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED' ||
    sourceProof.status !== 'OFFICIAL_MERGED_PR_VERIFIED' ||
    !Number.isInteger(sourceProof.pullRequestNumber) || sourceProof.pullRequestNumber < 1 ||
    !['DEV-012 Isolated PostgreSQL Cutover', 'Production Slice QC'].every(name =>
      sourceProof.requiredChecks?.includes(name))) fail('SOURCE_INVALID')
}
async function optional(transport, uri) {
  try { return await transport.readBytes(uri, { prefixes: ['receipts'] }) }
  catch (error) { if (error?.code === 'MISSING') return null; throw error }
}
async function immutableWrite(transport, uri, value, { exclusive = false } = {}) {
  const bytes = Buffer.from(stable(value) + '\n')
  const expectedSha256 = sha256(bytes)
  let result
  try { result = await transport.putJson(uri, value, { bucket: BUCKET, prefix: 'receipts' }) }
  catch (error) {
    if (exclusive && ['GCS_READBACK_HASH_MISMATCH', 'GCS_IMMUTABILITY_CONFLICT'].includes(error?.code)) {
      fail('PRIOR_SUBMISSION_REQUIRES_READBACK')
    }
    if (error?.code !== 'OUTCOME_UNKNOWN') throw error
    // Exactly one readback; never retry a possibly accepted POST.
    try {
      result = await transport.readBytes(uri, { prefixes: ['receipts'], expectedSha256 })
    } catch (readbackError) {
      if (exclusive && ['GCS_READBACK_HASH_MISMATCH', 'GCS_IMMUTABILITY_CONFLICT'].includes(readbackError?.code)) {
        fail('PRIOR_SUBMISSION_REQUIRES_READBACK')
      }
      throw readbackError
    }
  }
  // Reusing a create-only object is allowed for receipts, never for a
  // submission claim. Refuse it before interpreting another owner's bytes.
  if (exclusive && result?.reused === true) fail('PRIOR_SUBMISSION_REQUIRES_READBACK')
  if (!result?.bytes?.equals(bytes) || result.ref?.uri !== uri ||
    result.ref.sha256 !== expectedSha256 ||
    !/^[1-9][0-9]*$/u.test(String(result.metadata?.generation ?? ''))) fail('RECEIPT_READBACK_INVALID')
  return result
}
async function scalingPatch({ transport, profile, before, scaling, deadline, deadlineTick, now, sleep, monotonic }) {
  const body = { name: NAME, etag: before.etag, scaling }
  let operation
  try {
    operation = await transport.request(URL + '?updateMask=scaling', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
  } catch (error) {
    if (error?.code !== 'OUTCOME_UNKNOWN') throw error
    // A lost LRO response can precede visible Service changes. Observe only;
    // an unchanged first GET is never proof that PATCH was not accepted.
    try {
      for (;;) {
        const after = await transport.getService(profile)
        if (after.uid !== before.uid || invariant(after) !== invariant(before)) fail('PATCH_OUTCOME_UNRESOLVED')
        if (after.reconciling !== true &&
          String(after.observedGeneration) === String(after.generation) &&
          Number(after.generation) > Number(before.generation) &&
          stable(after.scaling ?? {}) === stable(scaling)) {
          settled(after)
          return after
        }
        if (!Number.isFinite(Date.parse(now())) || Date.parse(now()) >= deadline ||
          monotonic() >= deadlineTick) fail('PATCH_OUTCOME_UNRESOLVED')
        await sleep(1000)
      }
    } catch (readbackError) {
      readbackError.unresolvedScalingMutation = true
      throw readbackError
    }
  }
  if (!/^projects\/jenfu-platform-prod\/locations\/asia-east1\/operations\/[a-zA-Z0-9-]+$/u
    .test(operation?.name ?? '')) {
    const error = new Error('DEV121_FENCE_OPERATOR_OPERATION_INVALID')
    error.unresolvedScalingMutation = true
    throw error
  }
  let transientReads = 0
  for (;;) {
    let result
    try {
      if (!Number.isFinite(Date.parse(now())) || Date.parse(now()) >= deadline ||
        monotonic() >= deadlineTick) fail('OPERATION_TIMEOUT')
      result = await transport.request('https://run.googleapis.com/v2/' + operation.name)
    } catch (error) {
      if (['OUTCOME_UNKNOWN', 'QUOTA_OR_RATE_LIMIT'].includes(error?.code) && transientReads++ < 3 &&
        monotonic() < deadlineTick && Date.parse(now()) < deadline) {
        await sleep(2500)
        continue
      }
      error.unresolvedScalingMutation = true
      throw error
    }
    if (result.done) {
      if (result.error) fail('OPERATION_FAILED')
      break
    }
    await sleep(2500)
  }
  for (;;) {
    const after = await transport.getService(profile)
    if (after.uid !== before.uid || invariant(after) !== invariant(before)) fail('SERVICE_DRIFT')
    if (after.reconciling !== true &&
      String(after.observedGeneration) === String(after.generation) &&
      Number(after.generation) > Number(before.generation) &&
      stable(after.scaling ?? {}) === stable(scaling)) {
      settled(after)
      return after
    }
    if (!Number.isFinite(Date.parse(now())) || Date.parse(now()) >= deadline || monotonic() >= deadlineTick) fail('OPERATION_TIMEOUT')
    await sleep(1000)
  }
}

export async function executeFenceOperation({ profile, git, sourceProof, recoveryRef,
  transport, acquire = false, now = () => transport.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  monotonic = () => performance.now() }) {
  assertSource(profile, git, sourceProof)
  const sourceRevision = git.sourceRevision
  if (!recoveryRef || Object.keys(recoveryRef).sort().join(',') !== 'sha256,uri' ||
    recoveryRef.uri !== 'gs://' + BUCKET +
      '/receipts/releases/DEV121-PRINCIPAL-ONLY-RECOVERY/' + sourceRevision + '.json' ||
    !H64.test(recoveryRef.sha256 ?? '')) fail('RECOVERY_REF_INVALID')
  const recovery = await transport.readJson(recoveryRef, BUCKET)
  const proof = recovery.value
  const baseline = await transport.getService(profile)
  settled(baseline)
  const oldRevision = proof.oldRevision
  oldOnly(baseline, oldRevision)
  const binding = { revision: proof.recoveryRevision, imageDigest: proof.imageDigest,
    serviceUid: proof.serviceUid, receiptRef: recoveryRef }
  const [revision, active] = await Promise.all([
    transport.getRevision(profile, binding.revision),
    transport.getRevision(profile, oldRevision),
  ])
  assertRecoveryProofReadback({ sourceRevision, oldRevision, binding, profile,
    proof, service: baseline, revision })
  const timeout = requestTimeout(baseline.template?.timeout)
  if (active.name !== NAME + '/revisions/' + oldRevision ||
    active.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED' ||
    requestTimeout(active.timeout) > timeout) fail('ACTIVE_TIMEOUT_INVALID')
  const automaticBaseline = [undefined, 'AUTOMATIC'].includes(baseline.scaling?.scalingMode) &&
    baseline.scaling?.manualInstanceCount == null
  const stoppedBaseline = baseline.scaling?.scalingMode === 'MANUAL' &&
    [0, '0'].includes(baseline.scaling?.manualInstanceCount)
  if (!automaticBaseline && !stoppedBaseline) fail('BASELINE_NOT_AUTOMATIC')
  if (stoppedBaseline && !recoveryTemplateIsCurrent(baseline, binding, profile)) {
    fail('RECOVERY_TEMPLATE_NOT_CURRENT')
  }
  const submissionUri = PREFIX + sourceRevision + '/submission-' + baseline.generation + '.json'
  if (!acquire) return { status: stoppedBaseline ? 'QUIESCENCE_ADOPTION_READY' : 'READINESS_PASS', sourceRevision,
    previousRevision: oldRevision, requestTimeoutSeconds: timeout,
    principalOnlyRecovery: binding, mutationCount: 0 }
  const deadline = Date.parse(now()) + 10 * 60_000
  const deadlineTick = monotonic() + 10 * 60_000
  if (!Number.isFinite(deadline) || !Number.isFinite(deadlineTick)) fail('CLOCK_INVALID')
  if (stoppedBaseline) {
    const providerUpdatedAt = Date.parse(baseline.updateTime)
    const readbackTick = monotonic()
    if (!Number.isFinite(providerUpdatedAt) || !Number.isFinite(readbackTick)) fail('PROVIDER_TIME_INVALID')
    const drainMilliseconds = (timeout + 30) * 1000
    // A stopped service can outlive the source that first fenced it.  Rebind
    // only the already-zero state: wait a fresh full drain interval, require
    // the exact recovery template, traffic and etag to remain unchanged, and
    // publish a source-bound fence without another Service mutation.
    while (monotonic() - readbackTick < drainMilliseconds) {
      if (!Number.isFinite(Date.parse(now())) || Date.parse(now()) >= deadline ||
        monotonic() >= deadlineTick || monotonic() < readbackTick) fail('DRAIN_TIMEOUT')
      await sleep(Math.min(1000, drainMilliseconds - (monotonic() - readbackTick)))
    }
    const observedAt = new Date(providerUpdatedAt + Math.floor(monotonic() - readbackTick)).toISOString()
    const service = await transport.getService(profile)
    if (stable(service) !== stable(baseline)) fail('DRAIN_DRIFT')
    const generation = Number(service.generation)
    if (!Number.isSafeInteger(generation) || generation < 1) fail('SERVICE_INVALID')
    const fence = { schemaVersion: 'ai-pdm.principal-only-migration-fence.v1',
      sourceRevision, projectId: 'jenfu-platform-prod', region: 'asia-east1',
      service: 'ai-pdm-prod', serviceUid: service.uid, oldRevision,
      beforeGeneration: generation - 1, quiescentGeneration: generation,
      serviceUpdateTime: service.updateTime, requestTimeoutSeconds: timeout, status: 'QUIESCED' }
    const bytes = Buffer.from(stable(fence) + '\n')
    assertPrincipalOnlyMigrationFence({ proof: fence, bytes, expectedSha256: sha256(bytes),
      sourceRevision, service, observedAt })
    const receipt = await immutableWrite(transport,
      PREFIX + sourceRevision + '/fence-' + service.generation + '.json', fence)
    return { status: 'QUIESCENCE_ADOPTED', sourceRevision, previousRevision: oldRevision,
      principalOnlyFenceRef: receipt.ref, principalOnlyRecovery: binding, mutationCount: 0 }
  }
  if (await optional(transport, submissionUri)) fail('PRIOR_SUBMISSION_REQUIRES_READBACK')
  // Manual mode has its own count; Cloud Run omits automatic min/max fields.
  // Keep the exact automatic baseline in the submission for recovery.
  const stoppedScaling = { scalingMode: 'MANUAL', manualInstanceCount: 0 }
  const submission = { schemaVersion: 'ai-pdm.principal-only-fence-submission.v1',
    sourceRevision, claimId: randomUUID(), serviceUid: baseline.uid, beforeGeneration: baseline.generation,
    previousRevision: oldRevision, recoveryRef, baseline, stoppedScaling }
  // Durable create-only fence precedes the one allowed scaling PATCH.
  const claim = await immutableWrite(transport, submissionUri, submission, { exclusive: true })
  if (claim.reused === true) fail('PRIOR_SUBMISSION_REQUIRES_READBACK')
  let changed = false
  try {
    // Re-read immediately before using etag: a new source/runtime cannot enter this window.
    const fresh = await transport.getService(profile)
    if (stable(fresh) !== stable(baseline)) fail('BASELINE_DRIFT')
    changed = true
    const stopped = await scalingPatch({ transport, profile, before: fresh,
      scaling: stoppedScaling, deadline, deadlineTick, now, sleep, monotonic })
    const providerUpdatedAt = Date.parse(stopped.updateTime)
    const readbackTick = monotonic()
    if (!Number.isFinite(providerUpdatedAt) || !Number.isFinite(readbackTick)) fail('PROVIDER_TIME_INVALID')
    const drainMilliseconds = (timeout + 30) * 1000
    // Elapsed monotonic time after the stopped provider response is conservative:
    // the actual update preceded that response. A fast local wall clock cannot
    // shorten this wait or establish a false observedAt for the consumer.
    while (monotonic() - readbackTick < drainMilliseconds) {
      if (!Number.isFinite(Date.parse(now())) || Date.parse(now()) >= deadline || monotonic() >= deadlineTick || monotonic() < readbackTick) fail('DRAIN_TIMEOUT')
      await sleep(Math.min(1000, drainMilliseconds - (monotonic() - readbackTick)))
    }
    const observedAt = new Date(providerUpdatedAt + Math.floor(monotonic() - readbackTick)).toISOString()
    const service = await transport.getService(profile)
    if (invariant(service) !== invariant(baseline) ||
      stable(service.scaling) !== stable(stoppedScaling) ||
      service.uid !== stopped.uid || service.generation !== stopped.generation ||
      service.updateTime !== stopped.updateTime) fail('DRAIN_DRIFT')
    const fence = { schemaVersion: 'ai-pdm.principal-only-migration-fence.v1',
      sourceRevision, projectId: 'jenfu-platform-prod', region: 'asia-east1',
      service: 'ai-pdm-prod', serviceUid: service.uid, oldRevision,
      beforeGeneration: Number(baseline.generation), quiescentGeneration: Number(service.generation),
      serviceUpdateTime: service.updateTime, requestTimeoutSeconds: timeout, status: 'QUIESCED' }
    const bytes = Buffer.from(stable(fence) + '\n')
    assertPrincipalOnlyMigrationFence({ proof: fence, bytes, expectedSha256: sha256(bytes),
      sourceRevision, service, observedAt })
    const receipt = await immutableWrite(transport,
      PREFIX + sourceRevision + '/fence-' + service.generation + '.json', fence)
    return { status: 'QUIESCED', sourceRevision, previousRevision: oldRevision,
      principalOnlyFenceRef: receipt.ref, principalOnlyRecovery: binding,
      submissionRef: { uri: submissionUri, sha256: sha256(Buffer.from(stable(submission) + '\n')) } }
  } catch (error) {
    if (error.unresolvedScalingMutation === true) {
      error.recoveryDisposition = 'READBACK_REQUIRED_NO_FURTHER_MUTATION'
      throw error
    }
    if (changed) {
      try {
        const current = await transport.getService(profile)
        settled(current)
        if (current.uid !== baseline.uid || invariant(current) !== invariant(baseline)) fail('RESTORE_DRIFT')
        if (stable(current.scaling ?? {}) === stable(stoppedScaling)) {
          const restored = await scalingPatch({ transport, profile, before: current,
            scaling: baseline.scaling ?? {}, deadline: Date.parse(now()) + 120_000,
            deadlineTick: monotonic() + 120_000, now, sleep, monotonic })
          oldOnly(restored, oldRevision)
          error.recoveryDisposition = 'BASELINE_SCALING_RESTORED'
        } else if (stable(current.scaling ?? {}) === stable(baseline.scaling ?? {})) {
          error.recoveryDisposition = 'BASELINE_UNCHANGED'
        } else fail('RESTORE_DRIFT')
      } catch {
        error.recoveryDisposition = 'READBACK_REQUIRED_NO_FURTHER_MUTATION'
      }
    }
    throw error
  }
}
