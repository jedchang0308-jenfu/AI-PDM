import assert from 'node:assert/strict'
import test from 'node:test'
import { assertAiPdmQuiescenceReadbacks } from './dev121-ai-pdm-quiescence.mjs'

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
