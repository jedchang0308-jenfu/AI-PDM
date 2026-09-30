import assert from 'node:assert/strict'
import test from 'node:test'
import { assertAiPdmQuiescenceReadbacks,
  assertAiPdmQuiescentV2Service } from './dev121-ai-pdm-quiescence.mjs'

const revision = 'ai-pdm-prod-f5ee2af2d7ec'
function service(generation, annotations = {}) {
  return {
    metadata: { name: 'ai-pdm-prod', namespace: '9536592944',
      uid: 'service-uid', generation, annotations },
    spec: { traffic: [{ revisionName: revision, percent: 100 }],
      template: { spec: { timeoutSeconds: 60,
        containers: [{ image: 'example.invalid/immutable@sha256:abc' }] } } },
    status: { observedGeneration: generation, latestReadyRevisionName: revision,
      traffic: [{ revisionName: revision, percent: 100 }] },
  }
}
function input() {
  return { before: service(64),
    after: service(65, { 'run.googleapis.com/scalingMode': 'manual',
      'run.googleapis.com/manualInstanceCount': '0' }),
    oldRevision: revision,
    disabledCompletedAt: '2026-09-28T16:00:00.000Z',
    observedAt: '2026-09-28T16:01:30.000Z' }
}

test('accepts exact service-wide zero scaling after the request drain', () => {
  assert.deepEqual(assertAiPdmQuiescenceReadbacks(input()), {
    service: 'ai-pdm-prod', uid: 'service-uid', oldRevision: revision,
    beforeGeneration: 64, quiescentGeneration: 65,
    requestTimeoutSeconds: 60, drainSeconds: 90 })
})

test('allows a prepared candidate as latest ready while old default traffic is drained', () => {
  const value = input()
  value.before.status.latestReadyRevisionName = 'ai-pdm-prod-candidate'
  value.after.status.latestReadyRevisionName = 'ai-pdm-prod-candidate'
  assert.equal(assertAiPdmQuiescenceReadbacks(value).oldRevision, revision)
})

test('rejects traffic tags, including a zero-percent tag reachable during manual scaling', () => {
  for (const side of ['before', 'after']) {
    for (const traffic of ['spec', 'status']) {
      const value = input()
      value[side][traffic].traffic.push({ revisionName: revision, percent: 0,
        tag: 'old-revision' })
      assert.throws(() => assertAiPdmQuiescenceReadbacks(value),
        /DEV121_AIPDM_QUIESCENCE_READBACK_INVALID/u)
    }
  }
})

test('rejects wrong service, unchanged generation, drifting template and early readback', () => {
  const mutations = [
    (value) => { value.after.metadata.namespace = 'other-project' },
    (value) => { value.after.metadata.uid = 'replacement' },
    (value) => { value.before.metadata.generation = null;
      value.before.status.observedGeneration = null },
    (value) => { value.after.metadata.generation = 64;
      value.after.status.observedGeneration = 64 },
    (value) => { value.after.metadata.annotations['run.googleapis.com/manualInstanceCount'] = '1' },
    (value) => { value.after.spec.template.spec.containers[0].image = 'other-image' },
    (value) => { value.observedAt = '2026-09-28T16:01:29.999Z' },
  ]
  for (const mutate of mutations) {
    const value = input()
    mutate(value)
    assert.throws(() => assertAiPdmQuiescenceReadbacks(value),
      /DEV121_AIPDM_QUIESCENCE_READBACK_INVALID/u)
  }
})

function v2Service() {
  return { name: 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',
    uid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5', generation: '65',
    observedGeneration: '65', reconciling: false,
    terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
    traffic: [{ revision, percent: 100 }],
    trafficStatuses: [{ revision, percent: 100 }] }
}
function v2Input() {
  return { service: v2Service(), oldRevision: revision,
    expectedUid: v2Service().uid, beforeGeneration: '64',
    disabledCompletedAt: '2026-09-30T00:00:00.000Z',
    observedAt: '2026-09-30T00:01:30.000Z',
    requestTimeoutSeconds: 60 }
}

test('live v2 readback requires zero instances and the full request drain', () => {
  assert.deepEqual(assertAiPdmQuiescentV2Service(v2Input()), {
    service: 'ai-pdm-prod', uid: v2Service().uid, oldRevision: revision,
    beforeGeneration: 64, generation: 65,
    requestTimeoutSeconds: 60, drainSeconds: 90 })
  for (const mutate of [
    (value) => { value.service.scaling.scalingMode = 'AUTOMATIC' },
    (value) => { value.service.scaling.manualInstanceCount = 1 },
    (value) => { value.service.traffic.push({ revision, percent: 0,
      tag: 'candidate' }) },
    (value) => { value.service.trafficStatuses[0].revision = 'other-revision' },
    (value) => { value.service.observedGeneration = '64' },
    (value) => { value.service.generation = '64';
      value.service.observedGeneration = '64' },
    (value) => { value.service.uid = '' },
    (value) => { value.observedAt = '2026-09-30T00:01:29.999Z' },
  ]) {
    const value = v2Input()
    mutate(value)
    assert.throws(() => assertAiPdmQuiescentV2Service(value),
      /DEV121_AIPDM_QUIESCENCE_READBACK_INVALID/u)
  }
})
