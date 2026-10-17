import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OWNER_DEADLINE_SECONDS,
  WORKER_PROFILE_PATH,
  assertHistoricalProfileCompatibility,
  assertOpenSwxWorkerProfile,
  programOnlyHistoricalProfileRequired,
  resolveWorkerProfileContext,
  workerProfileValidationMode,
} from './dev122-openswx-profile-context.mjs'

const currentRevision = 'a'.repeat(40)
const historicalRevision = 'b'.repeat(40)
const currentProfile = assertOpenSwxWorkerProfile(JSON.parse(await (async () => {
  const fs = await import('node:fs')
  return fs.readFileSync(new URL('../../config/release/dev122-openswx-worker.json', import.meta.url), 'utf8')
})()))
const historicalProfile = structuredClone(currentProfile)
historicalProfile.bounds.ownerDeadlineSeconds = 600

function readerFor(profiles) {
  const reader = (name, revision) => {
    if (name !== WORKER_PROFILE_PATH || !profiles.has(revision)) throw Object.assign(Error('NOT_FOUND'), { code: 'NOT_FOUND' })
    return JSON.stringify(profiles.get(revision))
  }
  reader.sourceRevision = currentRevision
  reader.supportsAdmittedHistoricalRevisions = true
  reader.historicalReadRevisions = new Set([historicalRevision])
  return reader
}

test('current profile context stays current', () => {
  const reader = readerFor(new Map([[currentRevision, currentProfile]]))
  const context = resolveWorkerProfileContext({ readSource: reader, sourceRevision: currentRevision, currentProfile })
  assert.equal(context.historical, false)
  assert.equal(context.profile.bounds.ownerDeadlineSeconds, OWNER_DEADLINE_SECONDS)
})

test('legacy current reader without revision metadata stays current when the caller binds the current revision', () => {
  const readSource = (name, revision) => {
    assert.equal(name, WORKER_PROFILE_PATH)
    assert.equal(revision, currentRevision)
    return JSON.stringify(currentProfile)
  }
  const context = resolveWorkerProfileContext({ readSource, sourceRevision: currentRevision, currentSourceRevision: currentRevision, currentProfile })
  assert.equal(context.source, readSource)
  assert.equal(context.historical, false)
  assert.equal(context.profile.bounds.ownerDeadlineSeconds, OWNER_DEADLINE_SECONDS)
})

test('same profile shape keeps prior descriptors on current validation while deadline drift selects historical validation', () => {
  const currentDescriptor = Object.fromEntries(['projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'dispatchPolicy', 'bounds', 'receiptRoot'].map(key => [key, currentProfile[key]]))
  assert.equal(workerProfileValidationMode({ descriptor: currentDescriptor, currentProfile, readSource: { sourceRevision: currentRevision }, sourceRevision: historicalRevision }), 'current')
  assert.equal(workerProfileValidationMode({ descriptor: currentDescriptor, currentProfile, readSource: { sourceRevision: currentRevision }, sourceRevision: historicalRevision, historicalProfile: true }), 'historical')
  const historicalDescriptor = { ...currentDescriptor, bounds: historicalProfile.bounds }
  assert.equal(workerProfileValidationMode({ descriptor: historicalDescriptor, currentProfile, readSource: { sourceRevision: currentRevision }, sourceRevision: historicalRevision }), 'historical')
})

test('historical profile context binds the descriptor revision and accepts deadline-only drift', () => {
  const reader = readerFor(new Map([[currentRevision, currentProfile], [historicalRevision, historicalProfile]]))
  const context = resolveWorkerProfileContext({ readSource: reader, sourceRevision: historicalRevision, currentProfile })
  assert.equal(context.historical, true)
  assert.equal(context.source.sourceRevision, historicalRevision)
  assert.equal(context.profile.bounds.ownerDeadlineSeconds, 600)
  assert.doesNotThrow(() => assertHistoricalProfileCompatibility(currentProfile, historicalProfile))
})

test('historical profile rejects executable or policy drift outside the admitted deadline field', () => {
  const drifted = structuredClone(historicalProfile)
  drifted.jobId = 'different-worker'
  assert.throws(() => assertHistoricalProfileCompatibility(currentProfile, drifted), { code: 'OPENSWX_REUSE_HISTORICAL_PROFILE_DRIFT' })
})

test('program-only mode selects historical validation from source and profile identity', () => {
  assert.equal(programOnlyHistoricalProfileRequired({ intentSourceRevision: currentRevision, descriptorSourceRevision: historicalRevision, currentProfile, descriptorProfile: historicalProfile }), true)
  assert.equal(programOnlyHistoricalProfileRequired({ intentSourceRevision: currentRevision, descriptorSourceRevision: currentRevision, currentProfile, descriptorProfile: currentProfile }), false)
})
