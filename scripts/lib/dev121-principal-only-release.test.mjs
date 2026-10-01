import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertPrincipalOnlyRecoveryBinding,
  assertPrincipalOnlyRecoveryReadback,
  assertRecoveryProofReadback,
  assertPrincipalOnlyActivationReadback,
  principalOnlyActivationRequest,
  principalOnlyRollbackRevision,
} from './dev121-principal-only-release.mjs'

const serviceName = 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
const old = 'ai-pdm-prod-legacy'
const recovery = 'ai-pdm-prod-recovery'
const candidate = 'ai-pdm-prod-abcdef123456'
const tag = 'candidate-abcdef123456'
const image = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-recovery@sha256:${'a'.repeat(64)}`
const bucket = 'jenfu-platform-prod-aipdm-release'
const intent = {
  sourceRevision: 'b'.repeat(40), previousRevision: old,
  principalOnlyFenceRef: { uri: `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/fence.json`, sha256: 'c'.repeat(64) },
  principalOnlyRecovery: {
    revision: recovery, imageDigest: image, serviceUid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5',
    receiptRef: { uri: `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-RECOVERY/proof.json`, sha256: 'd'.repeat(64) },
  },
}
const profile = { artifact: { releaseBucket: bucket }, target: {
  projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'ai-pdm-prod',
}, runtime: { containerName: 'ai-pdm' } }
const oldTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: old, percent: 100 }
const candidateTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidate, percent: 0, tag }
const base = {
  name: serviceName, uid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5', etag: 'etag-one', generation: '91',
  observedGeneration: '91', reconciling: false,
  terminalCondition: { state: 'CONDITION_SUCCEEDED' },
  scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
  traffic: [oldTraffic, candidateTraffic], trafficStatuses: [oldTraffic, candidateTraffic],
}
const proof = {
  schemaVersion: 'ai-pdm.principal-only-recovery.v1',
  sourceRevision: intent.sourceRevision, projectId: 'jenfu-platform-prod',
  region: 'asia-east1', service: 'ai-pdm-prod', serviceUid: base.uid,
  oldRevision: old, recoveryRevision: recovery, imageDigest: image, status: 'PASS',
}
const revision = {
  name: `${serviceName}/revisions/${recovery}`,
  conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
  containers: [{ name: 'ai-pdm', image }],
}

test('Principal-only recovery is source-bound and distinct from the old security revision', () => {
  assert.equal(assertPrincipalOnlyRecoveryBinding(intent, bucket).revision, recovery)
  assert.equal(principalOnlyRollbackRevision(intent), recovery)
  assert.equal(principalOnlyRollbackRevision({ previousRevision: old }), old)
  for (const broken of [
    { ...intent, principalOnlyFenceRef: undefined },
    { ...intent, principalOnlyRecovery: undefined },
    { ...intent, principalOnlyRecovery: { ...intent.principalOnlyRecovery, revision: old } },
    { ...intent, principalOnlyRecovery: { ...intent.principalOnlyRecovery, imageDigest: image.replace('ai-pdm-recovery', 'ai-pdm') } },
    { ...intent, principalOnlyRecovery: { ...intent.principalOnlyRecovery,
      receiptRef: { ...intent.principalOnlyRecovery.receiptRef, uri: `gs://${bucket}/receipts/other.json` } } },
  ]) assert.throws(() => assertPrincipalOnlyRecoveryBinding(broken, bucket), /DEV121_PRINCIPAL_RECOVERY_INVALID/u)
})

test('recovery proof joins the exact service, source, ready revision and immutable image', () => {
  const service = { ...base, traffic: [oldTraffic], trafficStatuses: [oldTraffic] }
  assert.equal(assertPrincipalOnlyRecoveryReadback({ intent, profile, proof, service, revision }).revision, recovery)
  assert.equal(assertRecoveryProofReadback({ sourceRevision: intent.sourceRevision,
    oldRevision: old, binding: intent.principalOnlyRecovery, profile, proof,
    service, revision }).revision, recovery)
  for (const changed of [
    { proof: { ...proof, sourceRevision: 'f'.repeat(40) } },
    { proof: { ...proof, imageDigest: image.replace('ai-pdm-recovery', 'ai-pdm') } },
    { service: { ...service, traffic: [oldTraffic, candidateTraffic] } },
    { service: { ...service, uid: 'replacement-service' } },
    { revision: { ...revision, containers: [{ name: 'ai-pdm', image: image.replace(/a{64}$/u, 'e'.repeat(64)) }] } },
  ]) assert.throws(() => assertPrincipalOnlyRecoveryReadback({ intent, profile, proof, service, revision, ...changed }), /DEV121_PRINCIPAL_RECOVERY_INVALID/u)
})

test('activation request atomically replaces old default traffic while leaving the candidate tag', () => {
  const request = principalOnlyActivationRequest({ service: base, oldRevision: old,
    candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery })
  assert.deepEqual(Object.keys(request).sort(), ['etag', 'name', 'scaling', 'traffic'])
  assert.deepEqual(request.scaling, { scalingMode: 'AUTOMATIC', manualInstanceCount: null,
    maxInstanceCount: 1 })
  assert.deepEqual(request.traffic.map((row) => [row.revision, row.percent]), [[candidate, 100], [candidate, 0]])
  assert.equal(request.traffic.some((row) => row.revision === old || row.revision === recovery), false)
  for (const changed of [
    { scaling: { scalingMode: 'AUTOMATIC' } },
    { scaling: { scalingMode: 'MANUAL' } },
    { traffic: [oldTraffic, { ...candidateTraffic, tag: 'unknown' }] },
    { trafficStatuses: [oldTraffic] },
  ]) assert.throws(() => principalOnlyActivationRequest({ service: { ...base, ...changed },
    oldRevision: old, candidateRevision: candidate, candidateTag: tag,
    recoveryRevision: recovery }), /DEV121_PRINCIPAL_RECOVERY_INVALID/u)
})

test('activation accepts Cloud Run zero-percent tags omitted from configured and observed traffic', () => {
  const providerZeroTag = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION',
    revision: candidate, tag, uri: 'https://candidate.example.invalid' }
  const providerBefore = { ...base,
    traffic: [oldTraffic, { revision: candidate, tag }],
    trafficStatuses: [oldTraffic, providerZeroTag] }
  const request = principalOnlyActivationRequest({ service: providerBefore,
    oldRevision: old, candidateRevision: candidate, candidateTag: tag,
    recoveryRevision: recovery })
  assert.equal(request.traffic[0].revision, candidate)
  const providerAfter = { ...providerBefore, etag: 'etag-two', generation: '92',
    observedGeneration: '92', scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
    traffic: [{ revision: candidate, percent: 100 }, { revision: candidate, tag }],
    trafficStatuses: [{ revision: candidate, percent: 100, tag,
      uri: 'https://candidate.example.invalid' }] }
  assert.equal(assertPrincipalOnlyActivationReadback({ before: providerBefore,
    after: providerAfter, candidateRevision: candidate, candidateTag: tag,
    recoveryRevision: recovery }), providerAfter)
  for (const traffic of [
    [oldTraffic, providerZeroTag],
    [{ revision: candidate, percent: 100 }, { revision: candidate, tag, percent: 50 }],
  ]) assert.throws(() => assertPrincipalOnlyActivationReadback({ before: providerBefore,
    after: { ...providerAfter, traffic }, candidateRevision: candidate,
    candidateTag: tag, recoveryRevision: recovery }), /DEV121_PRINCIPAL_RECOVERY_INVALID/u)
})

test('activation readback rejects any legacy traffic and any incomplete resume', () => {
  const request = principalOnlyActivationRequest({ service: base, oldRevision: old,
    candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery })
  const after = { ...base, etag: 'etag-two', generation: '92', observedGeneration: '92',
    scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 }, traffic: request.traffic,
    trafficStatuses: request.traffic }
  assert.equal(assertPrincipalOnlyActivationReadback({ before: base, after,
    candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery }), after)
  for (const changed of [
    { scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 } },
    { scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 100 } },
    { traffic: [oldTraffic, candidateTraffic] },
    { trafficStatuses: [oldTraffic, candidateTraffic] },
    { uid: 'replacement-service' },
    { generation: '91' },
  ]) assert.throws(() => assertPrincipalOnlyActivationReadback({ before: base,
    after: { ...after, ...changed }, candidateRevision: candidate,
    candidateTag: tag, recoveryRevision: recovery }), /DEV121_PRINCIPAL_RECOVERY_INVALID/u)
})

test('activation matches exact traffic identities independently of provider row order', () => {
  for (const configured of [base.traffic, [...base.traffic].reverse()]) {
    for (const observed of [base.trafficStatuses, [...base.trafficStatuses].reverse()]) {
      const before = { ...base, traffic: configured, trafficStatuses: observed }
      const request = principalOnlyActivationRequest({ service: before, oldRevision: old,
        candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery })
      const after = { ...before, etag: 'etag-two', generation: '92', observedGeneration: '92',
        scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
        traffic: [...request.traffic].reverse(), trafficStatuses: [...request.traffic].reverse() }
      assert.equal(assertPrincipalOnlyActivationReadback({ before, after,
        candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery }), after)
    }
  }
  for (const rows of [
    [oldTraffic, oldTraffic], [candidateTraffic, candidateTraffic],
    [oldTraffic, { ...candidateTraffic, tag: 'candidate-ffffffffffff' }],
    [oldTraffic, { ...candidateTraffic, revision: recovery }],
    [oldTraffic, { ...candidateTraffic, percent: 50 }],
    [oldTraffic, candidateTraffic, candidateTraffic],
  ]) assert.throws(() => principalOnlyActivationRequest({
    service: { ...base, trafficStatuses: rows }, oldRevision: old,
    candidateRevision: candidate, candidateTag: tag, recoveryRevision: recovery }),
    /PRINCIPAL_RECOVERY_INVALID/u)
})
