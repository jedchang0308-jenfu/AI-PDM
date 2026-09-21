import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

export const DEV014_CONFORMANCE_SCHEMA = 'jenfu.dev014.consumer-conformance.v1'
export const DEV014_GUARD_CONTRACT_VERSION = 'jenfu.dev014.guard.v1'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/u
const APP_ID = /^[a-z][a-z0-9-]{1,63}$/u
const KEYS = Object.freeze([
  'schemaVersion', 'appId', 'sourceRevision', 'artifactDigest',
  'guardContractVersion', 'failSeekingEvidenceRef', 'verifiedAt', 'status', 'contentHash',
])

export const DEV014_CONSUMER_BUCKETS = Object.freeze({
  platform: 'jenfu-platform-prod-platform-release',
  orgmaster: 'jenfu-platform-prod-orgmaster-release',
  'ai-pdm': 'jenfu-platform-prod-aipdm-release',
})

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code)
}

function exactKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && canonicalize(Object.keys(value).sort()) === canonicalize([...KEYS].sort())
}

export function buildDev014ConsumerConformance({ appId, sourceRevision, artifactDigest, failSeekingEvidenceRef, verifiedAt }) {
  const core = {
    schemaVersion: DEV014_CONFORMANCE_SCHEMA,
    appId,
    sourceRevision,
    artifactDigest,
    guardContractVersion: DEV014_GUARD_CONTRACT_VERSION,
    failSeekingEvidenceRef,
    verifiedAt,
    status: 'PASS',
  }
  const value = { ...core, contentHash: sha256(canonicalize(core)) }
  return assertDev014ConsumerConformance(value, { expectedAppId: appId, expectedSourceRevision: sourceRevision, expectedArtifactDigest: artifactDigest })
}

export function assertDev014ConsumerConformance(value, { expectedAppId, expectedSourceRevision, expectedArtifactDigest }) {
  if (!exactKeys(value)
    || value.schemaVersion !== DEV014_CONFORMANCE_SCHEMA
    || !APP_ID.test(value.appId ?? '')
    || value.appId !== expectedAppId
    || !H40.test(value.sourceRevision ?? '')
    || value.sourceRevision !== expectedSourceRevision
    || !IMAGE_DIGEST.test(value.artifactDigest ?? '')
    || value.artifactDigest !== expectedArtifactDigest
    || value.guardContractVersion !== DEV014_GUARD_CONTRACT_VERSION
    || typeof value.failSeekingEvidenceRef !== 'string'
    || value.failSeekingEvidenceRef.length < 1
    || value.failSeekingEvidenceRef.length > 512
    || !Number.isFinite(Date.parse(value.verifiedAt))
    || value.status !== 'PASS'
    || !H64.test(value.contentHash ?? '')) fail('DEV014_CONSUMER_CONFORMANCE_INVALID', expectedAppId)
  const core = { ...value }
  delete core.contentHash
  if (sha256(canonicalize(core)) !== value.contentHash) fail('DEV014_CONSUMER_CONFORMANCE_HASH_INVALID', expectedAppId)
  return value
}

export function assertDev014ConsumerEvidenceBytes(consumer, bytes) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== consumer.evidenceSha256) fail('DEV014_CONSUMER_EVIDENCE_OBJECT_HASH_INVALID', consumer.applicationId)
  let value
  try { value = JSON.parse(bytes.toString('utf8')) } catch { fail('DEV014_CONSUMER_EVIDENCE_JSON_INVALID', consumer.applicationId) }
  return assertDev014ConsumerConformance(value, {
    expectedAppId: consumer.applicationId,
    expectedSourceRevision: consumer.sourceRevision,
    expectedArtifactDigest: consumer.artifactDigest,
  })
}
