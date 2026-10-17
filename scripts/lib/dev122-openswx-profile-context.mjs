import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { isHistoricalReaderFor } from './dev122-historical-reader.mjs'

export const WORKER_PROFILE_PATH = 'config/release/dev122-openswx-worker.json'
export const OWNER_DEADLINE_SECONDS = 1_200
const PROJECT = 'jenfu-platform-prod'
const NUMBER = '9536592944'
const REGION = 'asia-east1'
const JOB = 'ai-pdm-prod-openswx-metadata'
const historicalReaderCache = new WeakMap()
const PROFILE_SHAPE_KEYS = ['projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'dispatchPolicy', 'bounds', 'receiptRoot']

function fail(code) {
  throw Object.assign(Error(code), { code })
}

function fixedOpenSwxWorkerProfile(ownerDeadlineSeconds) {
  return {
    schemaVersion: 'aipdm.openswx-worker-profile.v1', ownerApplicationId: 'ai-pdm',
    projectId: PROJECT, projectNumber: NUMBER, location: REGION, jobId: JOB,
    readerServiceAccount: `aipdm-prod-openswx-reader@${PROJECT}.iam.gserviceaccount.com`,
    schedulerId: 'aipdm-prod-openswx-dispatch', dispatchServiceAccount: `aipdm-prod-openswx-dispatch@${PROJECT}.iam.gserviceaccount.com`,
    normalActor: 'jedchang0308@jenfu.com.tw', canonicalOrigin: `https://ai-pdm-prod-${NUMBER}.${REGION}.run.app`,
    recoverPath: '/api/openswx-metadata-dispatch/recover', readerId: 'openswx-metadata-reader',
    readerCommit: '30bd63845d3532cdecfdf2654e9cc0871229c45a', readerPurpose: 'openswx_metadata_jobs', readerCapability: 'openswx_metadata',
    tokenSecretId: 'aipdm-prod-openswx-reader-token', registrySecretId: 'aipdm-prod-workload-auth-credentials',
    artifactUri: `asia-east1-docker.pkg.dev/${PROJECT}/aipdm-release/ai-pdm-openswx-worker`,
    receiptRoot: 'gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker', backendBucket: 'tfstate-jenfu-platform-prod', backendPrefix: 'dev-122/openswx-worker',
    dockerfile: 'scripts/lib/openswx-reader/Dockerfile', dockerTarget: 'finite-worker', readerSource: 'scripts/lib/openswx-reader',
    dispatchPolicy: 'scheduler_only.v1',
    bounds: { cpu: '1', memory: '1Gi', taskCount: 1, parallelism: 1, timeoutSeconds: 300, maxRetries: 0, schedule: '*/5 * * * *', schedulerRetryCount: 0, schedulerAttemptDeadlineSeconds: 30, recoverDeadlineSeconds: 20, ownerDeadlineSeconds, pollMilliseconds: 1000, maxExecutionPages: 4, maxLogPages: 4, maxLogEntries: 100, proofFreshnessSeconds: 60 },
  }
}

export function assertOpenSwxWorkerProfile(value) {
  if (canonicalize(value) !== canonicalize(fixedOpenSwxWorkerProfile(OWNER_DEADLINE_SECONDS))) fail('OPENSWX_WORKER_PROFILE_INVALID')
  return value
}

export function assertHistoricalOpenSwxWorkerProfile(value) {
  const accepted = [OWNER_DEADLINE_SECONDS, 600].map(fixedOpenSwxWorkerProfile)
  if (!accepted.some(profile => canonicalize(value) === canonicalize(profile))) fail('OPENSWX_WORKER_PROFILE_INVALID')
  return value
}

export function historicalProfileOptions(readSource, revision = null, currentReadSource = null) {
  return { historicalProfile: isHistoricalReaderFor(readSource, revision, currentReadSource) }
}

export function assertHistoricalProfileCompatibility(currentProfile, historicalProfile) {
  const normalize = value => {
    const copy = structuredClone(value)
    copy.bounds = { ...copy.bounds, ownerDeadlineSeconds: null }
    return copy
  }
  if (canonicalize(normalize(historicalProfile)) !== canonicalize(normalize(currentProfile))) fail('OPENSWX_REUSE_HISTORICAL_PROFILE_DRIFT')
}

export function workerProfileValidationMode({ descriptor, currentProfile, readSource, sourceRevision, historicalProfile = false }) {
  const shapeMismatch = PROFILE_SHAPE_KEYS.some(key => canonicalize(descriptor?.[key]) !== canonicalize(currentProfile?.[key]))
  const admittedHistoricalSource = readSource?.isHistorical === true
    || readSource?.readerRevisionMode === 'historical'
    || (typeof readSource?.sourceRevision === 'string' && readSource.sourceRevision !== sourceRevision)
    || readSource?.supportsAdmittedHistoricalRevisions === true
  // An explicit caller decision is authoritative even when the historical
  // profile happens to have the same provider shape as the current profile.
  return historicalProfile || (shapeMismatch && admittedHistoricalSource) ? 'historical' : 'current'
}

function historicalReaderView(readSource, revision, { historical = true, sourceHistorical = historical } = {}) {
  if (typeof readSource !== 'function') fail('OPENSWX_HISTORY_SOURCE_REQUIRED')
  const view = (name, sourceRevision) => readSource(name, sourceRevision)
  Object.assign(view, readSource)
  view.sourceRevision = revision
  view.isHistorical = sourceHistorical
  if (historical) view.readerRevisionMode = 'historical'
  view.historicalReadRevisions = new Set([...(readSource.historicalReadRevisions ?? []), revision])
  for (const name of ['authorizeOrigin', 'readTree', 'readTreeId']) {
    if (typeof readSource[name] === 'function') view[name] = (...args) => readSource[name](...args)
  }
  if (typeof readSource.readImmutableArchive === 'function') {
    view.readImmutableArchive = revisionValue => readSource.readImmutableArchive(revisionValue)
    view.readArchive = revisionValue => readSource.readImmutableArchive(revisionValue)
  } else if (typeof readSource.readArchive === 'function') {
    view.readArchive = revisionValue => readSource.readArchive(revisionValue)
  }
  if (typeof readSource.createHistoricalReader === 'function') {
    view.createHistoricalReader = revisionValue => {
      readSource.authorizeOrigin?.(revisionValue)
      return sourceReaderForRevision(readSource.createHistoricalReader(revisionValue), revisionValue, { forceHistorical: true })
    }
  }
  return view
}

export function sourceReaderForRevision(readSource, revision, { forceHistorical = false } = {}) {
  if (readSource?.sourceRevision === revision && !forceHistorical) return readSource
  if (typeof readSource !== 'function') fail('OPENSWX_HISTORY_SOURCE_REQUIRED')
  if (readSource?.sourceRevision === revision) return historicalReaderView(readSource, revision)
  const cached = historicalReaderCache.get(readSource)?.get(revision)
  if (cached) return cached

  const explicitlyHistorical = readSource.isHistorical === true || readSource.readerRevisionMode === 'historical'
  if (explicitlyHistorical && readSource.historicalReadRevisions instanceof Set && readSource.historicalReadRevisions.has(revision)) {
    return historicalReaderView(readSource, revision)
  }
  const admittedByCapability = !explicitlyHistorical && readSource.supportsAdmittedHistoricalRevisions === true
  let admitted = admittedByCapability
  if (!admitted && !explicitlyHistorical && typeof readSource.readArchive === 'function') {
    try { readSource.readArchive(revision); admitted = true } catch { admitted = false }
  }
  if (admitted) {
    const historical = historicalReaderView(readSource, revision, { historical: true, sourceHistorical: false })
    const byRevision = historicalReaderCache.get(readSource) ?? new Map()
    byRevision.set(revision, historical)
    historicalReaderCache.set(readSource, byRevision)
    return historical
  }
  readSource.authorizeOrigin?.(revision)
  if (typeof readSource.createHistoricalReader !== 'function') fail('OPENSWX_HISTORY_SOURCE_REQUIRED')
  const historical = readSource.createHistoricalReader(revision)
  if (typeof historical !== 'function') fail('OPENSWX_HISTORY_SOURCE_REQUIRED')
  const normalized = historicalReaderView(historical, revision)
  const byRevision = historicalReaderCache.get(readSource) ?? new Map()
  byRevision.set(revision, normalized)
  historicalReaderCache.set(readSource, byRevision)
  return normalized
}

export function readHistoricalWorkerProfile(readSource, sourceRevision) {
  const bytes = readSource(WORKER_PROFILE_PATH, sourceRevision)
  let profile
  try { profile = assertHistoricalOpenSwxWorkerProfile(JSON.parse(bytes)) }
  catch (error) { if (error?.code) throw error; fail('OPENSWX_WORKER_PROFILE_INVALID') }
  return { bytes, profile }
}

export function resolveWorkerProfileContext({
  readSource,
  sourceRevision,
  currentProfile,
  currentReadSource = readSource,
  currentSourceRevision = currentReadSource?.sourceRevision ?? null,
  forceHistorical = false,
  validationMode = 'auto',
  profileRevision = sourceRevision,
  expectedProfileSha256 = null,
  requireCompatibility = true,
} = {}) {
  if (typeof readSource !== 'function' || typeof sourceRevision !== 'string') fail('OPENSWX_HISTORY_SOURCE_REQUIRED')
  if (!['auto', 'current', 'historical'].includes(validationMode)) fail('OPENSWX_WORKER_PROFILE_MODE_INVALID')
  const legacyUnversionedCurrent = readSource === currentReadSource
    && currentSourceRevision === sourceRevision
    && typeof readSource.sourceRevision !== 'string'
    && readSource.isHistorical !== true
    && readSource.readerRevisionMode !== 'historical'
    && readSource.supportsAdmittedHistoricalRevisions !== true
    && !readSource.historicalReadRevisions?.has?.(sourceRevision)
  const historical = validationMode === 'historical' || (validationMode === 'auto'
    && (forceHistorical || sourceRevision !== currentSourceRevision
      || (!legacyUnversionedCurrent && isHistoricalReaderFor(readSource, sourceRevision, currentReadSource))))
  let directHistoricalProfile = null
  if (historical && typeof expectedProfileSha256 === 'string') {
    try {
      const candidate = readHistoricalWorkerProfile(readSource, profileRevision)
      if (sha256(candidate.bytes) === expectedProfileSha256) directHistoricalProfile = candidate
    } catch { /* fall through to the admitted historical-reader capability gate */ }
  }
  // Current readers in older closed fixtures do not always expose a
  // sourceRevision property. A non-historical decision must retain that exact
  // reader instead of manufacturing a historical capability requirement.
  const source = historical
    ? (directHistoricalProfile ? readSource : sourceReaderForRevision(readSource, profileRevision, { forceHistorical: true }))
    : readSource
  const bytes = directHistoricalProfile?.bytes ?? source(WORKER_PROFILE_PATH, profileRevision)
  let profile
  try { profile = directHistoricalProfile?.profile ?? (historical ? assertHistoricalOpenSwxWorkerProfile(JSON.parse(bytes)) : assertOpenSwxWorkerProfile(JSON.parse(bytes))) }
  catch (error) { if (error?.code) throw error; fail('OPENSWX_WORKER_PROFILE_INVALID') }
  if (historical && requireCompatibility && currentProfile) assertHistoricalProfileCompatibility(currentProfile, profile)
  return {
    source,
    sourceRevision,
    bytes,
    profile,
    profileSha256: sha256(bytes),
    historical,
    descriptorOptions: { historicalProfile: historical },
  }
}

export function programOnlyHistoricalProfileRequired({ intentSourceRevision, descriptorSourceRevision, currentProfile, descriptorProfile, currentProfileValid = true }) {
  return !currentProfileValid || descriptorSourceRevision !== intentSourceRevision || canonicalize(currentProfile) !== canonicalize(descriptorProfile)
}
