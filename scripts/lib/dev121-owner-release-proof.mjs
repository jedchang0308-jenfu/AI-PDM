import { assertUnlinkedProfileCleanupBundleBinding, assertUnlinkedProfileCleanupRef, assertUnlinkedProfileCleanupReceipt } from './dev121-unlinked-profile-cleanup.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { AsyncLocalStorage } from 'node:async_hooks'
import { assertStageReceipt, canonicalize, createMigrationBundle, readGcsObject, sha256, parseGsUri, crc32cBase64 } from './dev012-production-migration-runner.mjs'
import { assertReconciledPrincipalAbortBinding } from './dev121-principal-only-release.mjs'
import { assertAppliedMigrationContinuation, assertForwardAppliedMigrationContinuation, assertHistoricalAppliedContinuationRuntimeConfig, assertForwardMigrationAssociation } from './dev122-applied-migration-continuation.mjs'
import { ownerPrivateObjectMediaWindow } from './dev012-private-object-media-window.mjs'
import { fetchProviderRead } from './dev012-read-retry.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const BUILD_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u
const PROJECT_ID = 'jenfu-platform-prod'
const PROJECT_NUMBER = '9536592944'
function expectedBuildName(buildId, project = PROJECT_ID) {
  return `projects/${project}/locations/asia-east1/builds/${buildId}`
}
function isTargetBuildName(name, buildId) {
  return name === expectedBuildName(buildId) ||
    name === expectedBuildName(buildId, PROJECT_NUMBER)
}
const OWNERS = Object.freeze({
  platform: Object.freeze({ bucket: 'jenfu-platform-prod-platform-release',
    repository: 'jedchang0308-jenfu/Jenfu-Platform', branch: 'main',
    ledger: 'platform_core.schema_migrations', migrationBootstrap: true,
    principalContractLedgerFloor: 10,
    artifactRepository: 'platform-release', artifactName: 'platform',
    artifactUri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform',
    builder: 'platform-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' }),
  orgmaster: Object.freeze({ bucket: 'jenfu-platform-prod-orgmaster-release',
    repository: 'jedchang0308-jenfu/OrgMaster', branch: 'master',
    ledger: 'orgmaster_core.schema_migrations', migrationBootstrap: false,
    principalContractLedgerFloor: 27,
    artifactRepository: 'orgmaster-release', artifactName: 'orgmaster',
    artifactUri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster',
    builder: 'orgmaster-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' }),
  'ai-pdm': Object.freeze({ bucket: 'jenfu-platform-prod-aipdm-release',
    repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main',
    ledger: 'ai_pdm_core.schema_migrations', migrationBootstrap: true,
    principalContractLedgerFloor: 20,
    artifactRepository: 'aipdm-release', artifactName: 'ai-pdm',
    artifactUri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm',
    builder: 'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' }),
})

function proofError(code, detail = null) {
  const key = `DEV121_OWNER_RELEASE_PROOF_${code}`
  return Object.assign(new Error(detail === null ? key : `${key}:${detail}`), { code: key })
}
function fail(code, detail = null) { throw proofError(code, detail) }
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    canonicalize(Object.keys(value).sort()) === canonicalize([...keys].sort())
}
function receiptHash(value) {
  const core = { ...value }
  delete core.receiptSha256
  return sha256(canonicalize(core))
}

const ARCHIVE_LIMIT = 268435456
const EVIDENCE_MEMO_LIMIT = 512 * 1024 * 1024
const PROFILE_PATH = 'config/release/dev117-ai-pdm-independent-production-v3.json'
const AI_BUCKET = 'jenfu-platform-prod-aipdm-release'
const authenticatedSources = new WeakMap()
const validatedContents = new WeakMap()
const validatedMigrationHistories = new WeakMap()
const evidenceScope = new AsyncLocalStorage()
const evidenceHandles = new WeakMap()
const authenticatedObservations = new WeakMap()
function evidenceState(handle) {
  const state = evidenceHandles.get(handle)
  if (!state || state.root.closed) fail('CONTEXT_INVALID')
  const now = Date.now(), monotonic = performance.now()
  if (!Number.isFinite(now) || !Number.isFinite(monotonic) || now < state.root.lastWallMs ||
      now >= state.root.expiresAtMs || monotonic < state.root.startedMonotonicMs ||
      monotonic - state.root.startedMonotonicMs >= 600000) {
    const finite = value => Number.isFinite(value) ? value : null
    const observationDiagnostic = {
      reasons: {
        wallNonfinite: !Number.isFinite(now), monotonicNonfinite: !Number.isFinite(monotonic),
        wallRegressed: now < state.root.lastWallMs, wallExpired: now >= state.root.expiresAtMs,
        monotonicRegressed: monotonic < state.root.startedMonotonicMs,
        monotonicExpired: monotonic - state.root.startedMonotonicMs >= 600000,
      },
      wallCurrentMs: finite(now), wallLastMs: finite(state.root.lastWallMs),
      wallStartedMs: finite(state.root.startedAtMs), wallExpiresMs: finite(state.root.expiresAtMs),
      monotonicCurrentMs: finite(monotonic), monotonicStartedMs: finite(state.root.startedMonotonicMs),
      elapsedMonotonicMs: finite(monotonic - state.root.startedMonotonicMs),
    }
    state.root.closed = true; state.root.memo.clear(); state.root.receiptMetadata.clear(); state.root.sourceAdmissions.clear(); state.root.historyBasis = null; state.root.historyCollection = null; state.root.historyObjectMetadata.clear()
    throw Object.assign(proofError('OBSERVATION_EXPIRED'), { observationDiagnostic })
  }
  state.root.lastWallMs = now
  return state
}
function activeEvidence() {
  const handle = evidenceScope.getStore()
  if (handle !== undefined) evidenceState(handle)
  return handle
}
function mintEvidenceHandle(state) {
  const handle = Object.freeze(Object.create(null))
  evidenceHandles.set(handle, state)
  return handle
}
/** Internal source adapter: opaque identity only; no serialized context is admitted. */
function mintAiPdmEvidenceRoot(inheritClockFrom = null) {
  const now = Date.now(), monotonic = performance.now()
  if (!Number.isFinite(now) || !Number.isFinite(monotonic)) fail('CONTEXT_INVALID')
  const timing = inheritClockFrom === null
    ? { startedAtMs: now, startedMonotonicMs: monotonic, expiresAtMs: now + 600000, lastWallMs: now }
    : { startedAtMs: inheritClockFrom.startedAtMs, startedMonotonicMs: inheritClockFrom.startedMonotonicMs,
        expiresAtMs: inheritClockFrom.expiresAtMs, lastWallMs: inheritClockFrom.lastWallMs }
  if (![timing.startedAtMs, timing.startedMonotonicMs, timing.expiresAtMs, timing.lastWallMs].every(Number.isFinite)) fail('CONTEXT_INVALID')
  const root = { ...timing, closed: false, hashes: new Map(), memo: new Map(), memoBytes: 0, receiptMetadata: new Map(), sourceAdmissions: new Set(), historyBasis: null, historyCollection: null, historyObjectMetadata: new Map() }
  return mintEvidenceHandle({ root, depth: 0, ancestors: new Set(), parent: null })
}
export function createAiPdmEvidenceContext() {
  const active = activeEvidence()
  if (active !== undefined) return active
  return mintAiPdmEvidenceRoot()
}
export async function runAiPdmEvidenceContext(handle, callback) {
  const state = evidenceState(handle), active = activeEvidence()
  if (typeof callback !== 'function' || (active === undefined && state.parent !== null) ||
      (active !== undefined && handle !== active && state.parent !== active)) fail('CONTEXT_BRANCH_INVALID')
  if (active !== undefined && evidenceState(active).root !== state.root) fail('CONTEXT_BRANCH_INVALID')
  const owns = active === undefined
  try {
    return await evidenceScope.run(handle, async () => {
      evidenceState(handle)
      const result = await callback()
      evidenceState(handle)
      return result
    })
  } finally {
    if (owns) { state.root.closed = true; state.root.memo.clear(); state.root.receiptMetadata.clear(); state.root.sourceAdmissions.clear(); state.root.historyBasis = null; state.root.historyCollection = null; state.root.historyObjectMetadata.clear() }
  }
}
export function descendAiPdmEvidenceContext(handle, ref, transition = false) {
  const state = evidenceState(handle)
  if (activeEvidence() !== handle || !exactKeys(ref, ['uri', 'sha256']) || typeof ref.uri !== 'string' || !H64.test(ref.sha256 ?? '') ||
      !/^gs:\/\/jenfu-platform-prod-aipdm-release\/(?:receipts|source)\/[A-Za-z0-9._/-]+$/u.test(ref.uri) ||
      ref.uri.split('/').slice(3).some(part => !part || part === '.' || part === '..')) fail('CONTEXT_REF_INVALID')
  if ((state.root.hashes.has(ref.uri) && state.root.hashes.get(ref.uri) !== ref.sha256) || state.ancestors.has(ref.uri)) fail('GRAPH_CYCLE_OR_HASH_CONFLICT')
  if (typeof transition !== 'boolean' || state.depth + Number(transition) > 8) fail('GRAPH_DEPTH_INVALID')
  state.root.hashes.set(ref.uri, ref.sha256)
  recordHistoryObject(state.root, ref)
  return mintEvidenceHandle({ root: state.root, parent: handle, nodeRef: { ...ref }, depth: state.depth + Number(transition), ancestors: new Set([...state.ancestors, ref.uri]) })
}
export async function readAiPdmEvidenceLeaf({ ref, kind = 'receipt', generation = null, crc32c = null, sourceRevision = null, read }) {
  const parent = activeEvidence()
  if (parent === undefined || typeof read !== 'function') fail('CONTEXT_INVALID')
  const parentState = evidenceState(parent)
  const child = canonicalize(parentState.nodeRef) === canonicalize(ref) ? parent : descendAiPdmEvidenceContext(parent, ref)
  return runAiPdmEvidenceContext(child, async () => {
    const state = evidenceState(child)
    recordHistoryObject(state.root, ref, { generation, crc32c, sourceRevision })
    const key = canonicalize([kind, ref.uri, ref.sha256, generation, crc32c, sourceRevision])
    if (state.root.memo.has(key)) {
      const bytes = Buffer.from(state.root.memo.get(key))
      if (sha256(bytes) !== ref.sha256) fail('OBJECT_HASH_MISMATCH')
      evidenceState(child)
      return bytes
    }
    const bytes = await read()
    evidenceState(child)
    if (!Buffer.isBuffer(bytes) || sha256(bytes) !== ref.sha256) fail('OBJECT_HASH_MISMATCH')
    if (!state.root.memo.has(key)) {
      if (bytes.length > EVIDENCE_MEMO_LIMIT - state.root.memoBytes) {
        state.root.closed = true; state.root.memo.clear(); state.root.receiptMetadata.clear(); state.root.sourceAdmissions.clear(); state.root.historyObjectMetadata.clear()
        fail('EVIDENCE_MEMO_LIMIT')
      }
      state.root.memoBytes += bytes.length
      state.root.memo.set(key, Buffer.from(bytes))
    }
    return Buffer.from(bytes)
  })
}export function admitAiPdmEvidenceSource({ bytes, ref }) {
  const handle = activeEvidence()
  if (handle === undefined || !Buffer.isBuffer(bytes) || sha256(bytes) !== ref?.sha256) fail('CONTEXT_SOURCE_INVALID')
  assertAiReleaseRef(ref)
  let value
  try { value = JSON.parse(strictUtf8(bytes)) } catch { fail('CONTEXT_SOURCE_INVALID') }
  assertSourceLock(value, 'ai-pdm', OWNERS['ai-pdm'], value.sourceRevision, value.releaseId)
  evidenceState(handle).root.sourceAdmissions.add(value.sourceRevision)
  return value.sourceRevision
}
function joinedHistoryObjectMetadata(old, row) {
  const joined = { ...row }
  if (old) {
    if (old.sha256 !== joined.sha256) fail('HISTORY_CLOSURE_CONFLICT')
    for (const field of ['generation', 'crc32c', 'sourceRevision']) {
      if (old[field] !== null && joined[field] !== null && old[field] !== joined[field]) fail('HISTORY_CLOSURE_CONFLICT')
      joined[field] ??= old[field]
    }
  }
  return joined
}
function recordHistoryObject(root, ref, metadata = {}) {
  const key = `object:${ref.uri}`, row = { kind: 'object', uri: ref.uri, sha256: ref.sha256,
    generation: metadata.generation == null ? null : String(metadata.generation),
    crc32c: metadata.crc32c ?? null, sourceRevision: metadata.sourceRevision ?? null }
  root.historyObjectMetadata.set(key, joinedHistoryObjectMetadata(root.historyObjectMetadata.get(key), row))
}export function observationDeadline() {
  const handle = activeEvidence()
  if (handle === undefined) fail('CONTEXT_INVALID')
  return new Date(evidenceState(handle).root.expiresAtMs).toISOString()
}
function scopeFetch(fetchImpl) {
  return async (url, options = {}) => {
    const handle = activeEvidence()
    if (handle === undefined) return fetchImpl(url, options)
    const state = evidenceState(handle)
    const signal = AbortSignal.timeout(Math.max(1, Math.ceil(state.root.expiresAtMs - Date.now())))
    const response = await fetchImpl(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, signal]) : signal })
    evidenceState(handle)
    return response
  }
}
function archiveDeadline(deadlineAt) {
  activeEvidence()
  if (!Number.isFinite(Date.parse(deadlineAt)) || Date.now() >= Date.parse(deadlineAt)) fail('ARCHIVE_DEADLINE')
}
function strictUtf8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { fail('ARCHIVE_UTF8_INVALID') }
}
function sourceIdentity(source) {
  if (!exactKeys(source, ['uri', 'sha256', 'generation', 'crc32c']) ||
      !new RegExp(`^gs://${AI_BUCKET}/source/releases/[A-Z0-9][A-Z0-9-]{5,63}/[a-f0-9]{64}/source\\.tar\\.gz$`, 'u').test(source.uri ?? '') ||
      !H64.test(source.sha256 ?? '') || !/^[1-9][0-9]*$/u.test(source.generation ?? '') ||
      !/^[A-Za-z0-9+/]{6}==$/u.test(source.crc32c ?? '')) fail('ARCHIVE_IDENTITY_INVALID')
  return canonicalize(source)
}
function registerLeaf(context, ref) {
  if (!context) return
  const state = evidenceState(context)
  if (activeEvidence() !== context || state.ancestors.has(ref.uri) ||
      (state.root.hashes.has(ref.uri) && state.root.hashes.get(ref.uri) !== ref.sha256)) fail('GRAPH_INVALID')
  state.root.hashes.set(ref.uri, ref.sha256)
  recordHistoryObject(state.root, ref, ref)
}
async function boundedResponse(response, cap, signal) {
  if (!response.ok || !response.body || typeof response.body.getReader !== 'function') fail('ARCHIVE_STREAM_INVALID')
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  const declared = response.headers?.get('content-length')
  try {
    if (declared !== null && declared !== undefined && (!/^[0-9]+$/u.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > cap)) fail('ARCHIVE_STREAM_LIMIT')
    while (true) {
      activeEvidence()
      if (signal.aborted) fail('ARCHIVE_DEADLINE')
      // Abort also interrupts a stalled custom stream, not only native fetch.
      let abort
      const aborted = new Promise((_, reject) => {
        abort = () => reject(proofError('ARCHIVE_DEADLINE'))
        signal.addEventListener('abort', abort, { once: true })
      })
      let part
      try { part = await Promise.race([reader.read(), aborted]) }
      finally { signal.removeEventListener('abort', abort) }
      activeEvidence()
      if (part.done) break
      if (!(part.value instanceof Uint8Array) || length + part.value.byteLength > cap) fail('ARCHIVE_STREAM_LIMIT')
      length += part.value.byteLength
      chunks.push(Buffer.from(part.value))
    }
    return Buffer.concat(chunks, length)
  } catch (error) {
    chunks.length = 0 // A fresh sealed read must never retain or concatenate a partial attempt.
    try { void reader.cancel(error).catch(() => {}) } catch { /* retain original failure */ }
    throw error
  } finally { try { reader.releaseLock() } catch { /* canceled pending stream */ } }
}
/** Fixed app source read: exactly own metadata GET followed by sealed-generation GET. */
export async function readAiPdmSourceArchive({ source, sourceRevision, deadlineAt, token,
  fetchImpl = fetch, context }) {
  const identity = sourceIdentity(source)
  if (!H40.test(sourceRevision ?? '') || typeof token !== 'string' || token.length < 20) fail('ARCHIVE_INPUT_INVALID')
  archiveDeadline(deadlineAt)
  registerLeaf(context, source)
  const ref = parseGsUri(source.uri, AI_BUCKET, 'source/releases')
  const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(ref.bucket)}/o/${encodeURIComponent(ref.object)}`
  const headers = { authorization: `Bearer ${token}` }
  const request = async (url, cap, timeout, attempts = 1) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      archiveDeadline(deadlineAt)
      const signal = AbortSignal.timeout(Math.max(1, Math.min(timeout, Date.parse(deadlineAt) - Date.now())))
      try {
        const response = await scopeFetch(fetchImpl)(url, { method: 'GET', headers, redirect: 'error', signal })
        const bytes = await boundedResponse(response, cap, signal)
        archiveDeadline(deadlineAt)
        return bytes
      } catch (error) {
        // Retry only media transport failures, inside the original live root and
        // deadline. Domain denials, HTTP failures and byte mismatches stay final.
        archiveDeadline(deadlineAt)
        const timedOut = signal.aborted && signal.reason?.name === 'TimeoutError'
          && (error === signal.reason || error.name === 'AbortError' || error.code === 'DEV121_OWNER_RELEASE_PROOF_ARCHIVE_DEADLINE')
        const disconnected = ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'].includes(error.cause?.code ?? error.code)
        if (attempt + 1 >= attempts || (!timedOut && !disconnected)) throw error
      }
    }
  }
  let metadata
  try { metadata = JSON.parse(strictUtf8(await request(base, 65536, 20000))) }
  catch (error) { if (error.message?.startsWith('DEV121_')) throw error; fail('ARCHIVE_METADATA_INVALID') }
  if (metadata?.bucket !== ref.bucket || metadata.name !== ref.object ||
      String(metadata.generation) !== source.generation || metadata.crc32c !== source.crc32c ||
      !/^[1-9][0-9]*$/u.test(String(metadata.size ?? '')) ||
      !Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size) > ARCHIVE_LIMIT) fail('ARCHIVE_METADATA_INVALID')
  const mediaWindow = ownerPrivateObjectMediaWindow(Number(metadata.size))
  const bytes = await request(`${base}?alt=media&generation=${encodeURIComponent(source.generation)}`, Number(metadata.size), mediaWindow.attemptTimeoutMs, 2)
  if (bytes.length !== Number(metadata.size) || crc32cBase64(bytes) !== source.crc32c || sha256(bytes) !== source.sha256) fail('ARCHIVE_SOURCE_MISMATCH')
  const result = { bytes, sourceRevision, source: { ...source }, generation: source.generation, crc32c: source.crc32c }
  authenticatedSources.set(result, { identity, sourceRevision })
  return result
}
function tarString(bytes) {
  const end = bytes.indexOf(0)
  if (end >= 0 && bytes.subarray(end).some((byte) => byte !== 0)) fail('ARCHIVE_HEADER_INVALID')
  return strictUtf8(end < 0 ? bytes : bytes.subarray(0, end))
}
function tarOctal(bytes) {
  const value = bytes.toString('ascii')
  if (bytes.some((byte) => byte > 127) || !/^[0-7]+[\0 ]*$/u.test(value)) fail('ARCHIVE_OCTAL_INVALID')
  const parsed = Number.parseInt(value, 8)
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail('ARCHIVE_OCTAL_INVALID')
  return parsed
}
function paxRecords(bytes, key) {
  if (bytes.length > 65536) fail('ARCHIVE_PAX_LIMIT')
  let offset = 0
  const records = {}
  for (let count = 0; offset < bytes.length; count++) {
    if (count >= 128) fail('ARCHIVE_PAX_LIMIT')
    const space = bytes.indexOf(32, offset)
    if (space < 0) fail('ARCHIVE_PAX_INVALID')
    const textLength = bytes.subarray(offset, space).toString('ascii')
    const length = Number(textLength)
    if (!/^[1-9][0-9]*$/u.test(textLength) || !Number.isSafeInteger(length) ||
        length <= space - offset + 2 || offset + length > bytes.length || bytes[offset + length - 1] !== 10) fail('ARCHIVE_PAX_INVALID')
    const record = strictUtf8(bytes.subarray(space + 1, offset + length - 1))
    const delimiter = record.indexOf('=')
    if (delimiter < 1 || record.indexOf('=', delimiter + 1) !== -1 || /\p{Cc}/u.test(record)) fail('ARCHIVE_PAX_INVALID')
    const name = record.slice(0, delimiter)
    if (name !== key || Object.hasOwn(records, name)) fail('ARCHIVE_PAX_INVALID')
    records[name] = record.slice(delimiter + 1)
    offset += length
  }
  if (!exactKeys(records, [key])) fail('ARCHIVE_PAX_INVALID')
  return records[key]
}
function tarPath(value, directory) {
  if (Buffer.byteLength(value, 'utf8') > 1024 || /[\\:\p{Cc}]/u.test(value) || /%(?:2f|5c)/iu.test(value)) fail('ARCHIVE_PATH_INVALID')
  if (directory && value.endsWith('/')) value = value.slice(0, -1)
  if ((value !== 'source' || !directory) && !value.startsWith('source/')) fail('ARCHIVE_PATH_INVALID')
  if (value.split('/').some((part) => !part || part === '.' || part === '..')) fail('ARCHIVE_PATH_INVALID')
  return value
}
function assertContentBundle(bundle, sourceRevision) {
  const keys = ['schemaVersion', 'ownerApplicationId', 'sourceRevision', 'projectId', 'region', 'database', 'ledger', 'baselineCount', 'entries', 'manifestSha256']
  if (Object.hasOwn(bundle ?? {}, 'unlinkedProfileCleanupRef')) keys.push('unlinkedProfileCleanupRef')
  const core = { ...bundle }; delete core.manifestSha256
  if (!exactKeys(bundle, keys) || bundle.schemaVersion !== 'jenfu.dev012.migration-bundle.v1' || bundle.ownerApplicationId !== 'ai-pdm' || bundle.sourceRevision !== sourceRevision ||
      bundle.projectId !== PROJECT_ID || bundle.region !== 'asia-east1' || bundle.database !== 'jenfu_prod' || bundle.ledger !== 'ai_pdm_core.schema_migrations' || bundle.baselineCount !== 15 ||
      !H64.test(bundle.manifestSha256 ?? '') || sha256(canonicalize(core)) !== bundle.manifestSha256 || !Array.isArray(bundle.entries) || ![32, 33, 34, 35, 38, 39].includes(bundle.entries.length)) fail('ARCHIVE_BUNDLE_INVALID')
  const paths = new Set(), versions = new Set()
  for (const [index, entry] of bundle.entries.entries()) {
    if (!exactKeys(entry, ['order', 'version', 'name', 'path', 'sourceSha256', 'appliedSha256', 'sqlBase64']) || entry.order !== index + 1 ||
        !/^db\/postgres\/[0-9]{3}_[a-z0-9_]+\.sql$/u.test(entry.path ?? '') || paths.has(entry.path) ||
        !/^[a-z0-9][a-z0-9-]{5,95}$/u.test(entry.version ?? '') || versions.has(entry.version) || typeof entry.name !== 'string' || !entry.name ||
        !H64.test(entry.sourceSha256 ?? '') || !H64.test(entry.appliedSha256 ?? '') || typeof entry.sqlBase64 !== 'string') fail('ARCHIVE_BUNDLE_INVALID')
    const sql = Buffer.from(entry.sqlBase64, 'base64')
    if (!sql.length || sql.toString('base64') !== entry.sqlBase64 || sha256(sql) !== entry.appliedSha256) fail('ARCHIVE_BUNDLE_INVALID')
    paths.add(entry.path); versions.add(entry.version)
  }
  if (bundle.entries.length >= 33 && (bundle.entries[32].path !== 'db/postgres/083_dev121_authorized_first_login_account.sql' ||
      bundle.entries[32].sourceSha256 !== 'a99df76b8fc146a916930a05286433568aa432710d2a6eccc1c47f08ba780da9' ||
      bundle.entries[32].version !== 'ai-pdm-083' || bundle.entries[32].name !== 'dev121_authorized_first_login_account' ||
      bundle.entries[32].appliedSha256 !== '8f6ed9bafe7af906bcae7a94df59a07bbb98cab27402e75ea9162b85a3ec9b8a')) fail('ARCHIVE_BUNDLE_INVALID')
  if (bundle.entries.length >= 34 && (bundle.entries[33].path !== 'db/postgres/084_dev121_unlinked_legacy_profile_cleanup.sql' ||
      bundle.entries[33].version !== 'ai-pdm-084' || bundle.entries[33].name !== 'dev121_unlinked_legacy_profile_cleanup' ||
      bundle.entries[33].sourceSha256 !== '6be6eb8cdc4ffb6f83883a17220066d4f91efd0f374b32cee0b50d299eb991e1' ||
      bundle.entries[33].appliedSha256 !== '6be6eb8cdc4ffb6f83883a17220066d4f91efd0f374b32cee0b50d299eb991e1')) fail('ARCHIVE_BUNDLE_INVALID')
  if (bundle.entries.length >= 35 && (bundle.entries[34].path !== 'db/postgres/085_dev121_principal_role_catalog_v7.sql' ||
      bundle.entries[34].version !== 'ai-pdm-085' || bundle.entries[34].name !== 'dev121_principal_role_catalog_v7' ||
      bundle.entries[34].sourceSha256 !== '308fad28b4abfe1bc2106b79c1f410fad2cf2f6c2a0b3559517362f4ba6e7cba' ||
      bundle.entries[34].appliedSha256 !== '80e7085085a3bf8d220917a4790224b52a54cc2af788a0775d7aaedd629ce65b')) fail('ARCHIVE_BUNDLE_INVALID')
  if (bundle.entries.length >= 38) {
    const rolePolicySuffix = [
      ['086_dev123_role_policy_editor_v1', '015749244315fb25e362770fc0a18bdab051655434b29a4d2a7cdc684345359f', '9b7f395c96cbd61699eb0deb1479ca9814fe69ad5a11bc07a0a302d9dc213272'],
      ['087_dev123_role_policy_candidate_validation', 'ce9e3dfd8591e106788faf23bbfdcbcdd6cdf00c4c4aa299e6cfe9f99a9406d6', '3923d099c72df031484da755889d0a89d8e279b70ad9f686c6ea35e211a2a0d4'],
      ['088_dev123_recognition_job_authority', '16f1a1b4655afc493ebdcb724e7a1c3bd239d9f34c581845e2de49b419728f83', '03749e82efb6d808ee54d55534ca35ea5a472d6c44e20cd462eb10c94b6cad9b'],
    ]
    for (const [index, [name, sourceHash, appliedHash]] of rolePolicySuffix.entries()) {
      const entry = bundle.entries[35 + index]
      if (entry.path !== `db/postgres/${name}.sql` || entry.version !== `ai-pdm-${name.slice(0, 3)}` ||
          entry.name !== name.slice(4) || entry.sourceSha256 !== sourceHash || entry.appliedSha256 !== appliedHash) fail('ARCHIVE_BUNDLE_INVALID')
    }
  }
  if (bundle.entries.length === 39) {
    const entry = bundle.entries[38]
    if (entry.path !== 'db/postgres/089_dev125_windows_service_devices.sql' || entry.version !== 'ai-pdm-089' ||
        entry.name !== 'dev125_windows_service_devices' ||
        entry.sourceSha256 !== 'f4fa558338b2478c4f03aed0423f984c77f7aebcb4d6ffd12fd48d6c1080c909' ||
        entry.appliedSha256 !== '8a0ce404904cc0c07015d57d28c1895909f57d90ff0466e31478926a7ce00c07') fail('ARCHIVE_BUNDLE_INVALID')
  }
  assertUnlinkedProfileCleanupBundleBinding(bundle)
  return paths
}
/** Shared content validator for exact Git callback and authenticated archive adapters. */
export function assertAiPdmMigrationContent({ files, bundle, sourceRevision, deadlineAt }) {
  archiveDeadline(deadlineAt)
  const paths = assertContentBundle(bundle, sourceRevision)
  if (!(files instanceof Map) || files.size !== bundle.entries.length + 1 || !files.has(PROFILE_PATH)) fail('ARCHIVE_SELECTED_MISSING')
  let total = 0
  for (const [name, bytes] of files) {
    if ((!paths.has(name) && name !== PROFILE_PATH) || !Buffer.isBuffer(bytes) || bytes.length > 1048576) fail('ARCHIVE_SELECTED_INVALID')
    total += bytes.length
  }
  if (total > 8388608) fail('ARCHIVE_SELECTED_LIMIT')
  let profile
  try { profile = JSON.parse(strictUtf8(files.get(PROFILE_PATH))) } catch { fail('ARCHIVE_PROFILE_INVALID') }
  const migrations = profile?.migrations
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || profile.schemaVersion !== 'jenfu.dev117.ai-pdm-continuous-release.v3' ||
      profile.profileVersion !== 'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP' || profile.application?.id !== 'ai-pdm' ||
      !exactKeys(migrations, ['jobName', 'serviceAccount', 'sourceProfile', 'ledger', 'baselineCount', 'sourceTraceOnly', 'foldedVersions', 'retiredVersions', 'entries']) ||
      migrations.jobName !== 'ai-pdm-prod-migration-runner' || migrations.serviceAccount !== 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com' ||
      migrations.sourceProfile !== 'config/platform/dev-010-n1c-ai-pdm.json' || migrations.ledger !== 'ai_pdm_core.schema_migrations' || migrations.baselineCount !== 15 ||
      migrations.sourceTraceOnly !== 'db/postgres/002_supabase_rls_plan.sql' || migrations.foldedVersions !== '004-041,043-046' ||
      canonicalize(migrations.retiredVersions) !== canonicalize(['054']) || !Array.isArray(migrations.entries) || migrations.entries.length !== bundle.entries.length) fail('ARCHIVE_PROFILE_INVALID')
  for (const [index, entry] of bundle.entries.entries()) {
    const authority = migrations.entries[index]
    if (!exactKeys(authority, ['order', 'path', 'sha256']) || authority.order !== entry.order || authority.path !== entry.path ||
        authority.sha256 !== entry.sourceSha256 || !files.has(entry.path) || sha256(files.get(entry.path)) !== entry.sourceSha256) fail('ARCHIVE_SQL_MISMATCH')
  }
  archiveDeadline(deadlineAt)
  const result = { sourceRevision, files: new Map([...files].map(([name, bytes]) => [name, Buffer.from(bytes)])), migrations,
    orderedEntriesSha256: sha256(canonicalize(bundle.entries)), profileMigrationsSha256: sha256(canonicalize(migrations)) }
  validatedContents.set(result, { orderedEntriesSha256: result.orderedEntriesSha256, profileMigrationsSha256: result.profileMigrationsSha256, migrations: canonicalize(migrations),
    entries: structuredClone(bundle.entries), files: canonicalize([...result.files].map(([name, bytes]) => [name, sha256(bytes)])) })
  return result
}
/** Parse canonical native Git ustar in memory; selected byte copies cannot retain the archive. */
export function parseAiPdmMigrationArchive({ bytes, sourceRevision, bundle, deadlineAt, gzip = false }) {
  archiveDeadline(deadlineAt)
  if (!Buffer.isBuffer(bytes) || bytes.length > ARCHIVE_LIMIT || !H40.test(sourceRevision ?? '')) fail('ARCHIVE_INPUT_INVALID')
  const selected = new Set([PROFILE_PATH, ...assertContentBundle(bundle, sourceRevision)])
  let tar = bytes
  if (gzip) {
    if (bytes[0] !== 31 || bytes[1] !== 139) fail('ARCHIVE_GZIP_INVALID')
    try { tar = gunzipSync(bytes, { maxOutputLength: ARCHIVE_LIMIT }) } catch { fail('ARCHIVE_GZIP_INVALID') }
  }
  if (tar.length > ARCHIVE_LIMIT || tar.length % 512 !== 0) fail('ARCHIVE_TAR_INVALID')
  const files = new Map(), names = new Set()
  let offset = 0, headers = 0, total = 0, globalSeen = false, pendingPath = null, terminated = false
  while (offset < tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.length !== 512) fail('ARCHIVE_TAR_INVALID')
    if (header.every((byte) => byte === 0)) {
      if (pendingPath !== null || offset + 1024 > tar.length || tar.subarray(offset).some((byte) => byte !== 0)) fail('ARCHIVE_TERMINATOR_INVALID')
      terminated = true; break
    }
    if (++headers > 10000 || !header.subarray(257, 263).equals(Buffer.from('ustar\0')) || header.subarray(263, 265).toString('ascii') !== '00') fail('ARCHIVE_HEADER_INVALID')
    const expectedChecksum = tarOctal(header.subarray(148, 156))
    let checksum = 0
    for (let index = 0; index < 512; index++) checksum += index >= 148 && index < 156 ? 32 : header[index]
    if (checksum !== expectedChecksum) fail('ARCHIVE_CHECKSUM_INVALID')
    const mode = tarOctal(header.subarray(100, 108))
    tarOctal(header.subarray(108, 116)); tarOctal(header.subarray(116, 124)); tarOctal(header.subarray(136, 148))
    const size = tarOctal(header.subarray(124, 136))
    const end = offset + 512 + size, next = offset + 512 + Math.ceil(size / 512) * 512
    if (!Number.isSafeInteger(next) || next > tar.length || tar.subarray(end, next).some((byte) => byte !== 0)) fail('ARCHIVE_OFFSET_INVALID')
    const type = header[156], payload = tar.subarray(offset + 512, end)
    if (type === 103) {
      if (headers !== 1 || globalSeen || pendingPath !== null || tarString(header.subarray(0, 100)) !== 'pax_global_header' || paxRecords(payload, 'comment') !== sourceRevision) fail('ARCHIVE_GLOBAL_PAX_INVALID')
      globalSeen = true
    } else if (type === 120) {
      if (!globalSeen || pendingPath !== null) fail('ARCHIVE_LOCAL_PAX_INVALID')
      pendingPath = paxRecords(payload, 'path')
      tarPath(pendingPath, pendingPath.endsWith('/'))
    } else {
      if (!globalSeen || ![0, 48, 53].includes(type) || tarString(header.subarray(157, 257)) !== '') fail('ARCHIVE_TYPE_INVALID')
      const directory = type === 53
      const prefix = tarString(header.subarray(345, 500)), name = tarString(header.subarray(0, 100))
      const logical = tarPath(pendingPath ?? (prefix ? `${prefix}/${name}` : name), directory)
      pendingPath = null
      if (names.has(logical) || (directory && size !== 0)) fail('ARCHIVE_DUPLICATE_INVALID')
      names.add(logical)
      const relative = logical.slice(7)
      if (selected.has(relative)) {
        if (directory || ![0o644, 0o755, 0o664, 0o775].includes(mode) || size > 1048576 || total + size > 8388608) fail('ARCHIVE_SELECTED_INVALID')
        total += size; files.set(relative, Buffer.from(payload))
      }
    }
    offset = next
  }
  if (!terminated || !globalSeen) fail('ARCHIVE_TERMINATOR_INVALID')
  archiveDeadline(deadlineAt)
  return assertAiPdmMigrationContent({ files, bundle, sourceRevision, deadlineAt })
}
function assertMigrationContentBrand(value) {
  const stored = validatedContents.get(value)
  if (!stored || value.orderedEntriesSha256 !== stored.orderedEntriesSha256 || value.profileMigrationsSha256 !== stored.profileMigrationsSha256 || canonicalize(value.migrations) !== stored.migrations ||
      !(value.files instanceof Map) || canonicalize([...value.files].map(([name, bytes]) => [name, sha256(bytes)])) !== stored.files) fail('MIGRATION_INPUT_NOT_EQUIVALENT')
  return stored
}
export function assertAiPdmMigrationEquivalent(original, current) {
  assertMigrationContentBrand(original); assertMigrationContentBrand(current)
  if (original?.orderedEntriesSha256 !== current?.orderedEntriesSha256 || original?.profileMigrationsSha256 !== current?.profileMigrationsSha256 ||
      canonicalize(original?.migrations) !== canonicalize(current?.migrations)) fail('MIGRATION_INPUT_NOT_EQUIVALENT')
  return { orderedEntriesSha256: current.orderedEntriesSha256, profileMigrationsSha256: current.profileMigrationsSha256 }
}

function migrationHistorySnapshot(history) {
  return canonicalize({ sourceRevision: history.sourceRevision, release: history.release,
    installed: { receiptRef: history.installed.receiptRef, receipt: history.installed.receipt,
      bundleRef: history.installed.bundleRef, bundle: history.installed.bundle } })
}
function validateMigrationHistoryShape(history) {
  if (!exactKeys(history, ['sourceRevision', 'release', 'source', 'installed']) || !H40.test(history.sourceRevision ?? '') ||
      !exactKeys(history.release, ['intentRef', 'deploymentRef', 'candidateRef']) || !exactKeys(history.source, ['content']) ||
      !exactKeys(history.installed, ['receiptRef', 'receipt', 'bundleRef', 'bundle'])) fail('MIGRATION_HISTORY_INVALID')
  for (const name of ['intentRef', 'deploymentRef']) assertAiReleaseRef(history.release[name])
  if (history.release.candidateRef !== null) assertAiReleaseRef(history.release.candidateRef)
  assertAiReleaseRef(history.installed.receiptRef)
  const { content } = history.source, contentState = assertMigrationContentBrand(content)
  if (content.sourceRevision !== history.sourceRevision) fail('MIGRATION_HISTORY_INVALID')
  const { bundle, bundleRef, receipt } = history.installed
  assertContentBundle(bundle, history.sourceRevision)
  if (!exactKeys(bundleRef, ['uri', 'sha256']) || bundleRef.uri !== `gs://${AI_BUCKET}/source/migration-bundles/${history.sourceRevision}/${bundle.manifestSha256}.json` || !H64.test(bundleRef.sha256 ?? '')) fail('MIGRATION_HISTORY_INVALID')
  assertMigration(receipt, 'ai-pdm', OWNERS['ai-pdm'], history.sourceRevision, bundle.manifestSha256, bundle.unlinkedProfileCleanupRef)
  if (receipt.ledgerCount !== bundle.entries.length || receipt.baselineCount !== bundle.baselineCount || receipt.ledgerBootstrap?.created !== false ||
      bundle.entries.length > contentState.entries.length || canonicalize(contentState.entries.slice(0, bundle.entries.length)) !== canonicalize(bundle.entries) ||
      canonicalize(content.migrations.entries.slice(0, bundle.entries.length)) !== canonicalize(bundle.entries.map(({ order, path, sourceSha256 }) => ({ order, path, sha256: sourceSha256 })))) fail('MIGRATION_HISTORY_INVALID')
  return { contentState }
}
/** Bind reviewed source separately from the exact migration prefix proven installed. */
export function createAiPdmMigrationHistory({ sourceRevision, intentRef, deploymentRef, candidateRef, content, receiptRef, receipt, bundleRef, bundle, bundleBytes }) {
  assertAiPdmMigrationBundleBytes({ bytes: bundleBytes, bundle, sourceRevision, ref: bundleRef })
  const history = { sourceRevision, release: { intentRef, deploymentRef, candidateRef }, source: { content }, installed: { receiptRef, receipt, bundleRef, bundle } }
  validateMigrationHistoryShape(history)
  validatedMigrationHistories.set(history, { content, snapshot: migrationHistorySnapshot(history) })
  return history
}
export function assertAiPdmMigrationHistory(history) {
  const stored = validatedMigrationHistories.get(history)
  if (!stored || history?.source?.content !== stored.content || migrationHistorySnapshot(history) !== stored.snapshot) fail('MIGRATION_HISTORY_INVALID')
  validateMigrationHistoryShape(history)
  return history
}
/** Classify the current source against the authenticated installed prefix. */
export function assertAiPdmRepairMigrationMode(history, current) {
  assertAiPdmMigrationHistory(history)
  const after = assertMigrationContentBrand(current), before = history.installed.bundle.entries
  if (after.entries.length < before.length || canonicalize(after.entries.slice(0, before.length)) !== canonicalize(before) ||
      canonicalize(current.migrations.entries.slice(0, before.length)) !== canonicalize(history.source.content.migrations.entries.slice(0, before.length))) fail('MIGRATION_HISTORICAL_PREFIX_INVALID')
  const historicalProfile = { ...history.source.content.migrations }; delete historicalProfile.entries
  const currentProfile = { ...current.migrations }; delete currentProfile.entries
  if (canonicalize(currentProfile) !== canonicalize(historicalProfile)) fail('MIGRATION_HISTORICAL_PREFIX_INVALID')
  return after.entries.length === before.length ? 'HISTORICAL_EVIDENCE_REUSED' : 'FORWARD_APPLIED'
}
export function assertAiPdmInstalledMigrationEquivalent(history, current) {
  if (assertAiPdmRepairMigrationMode(history, current) !== 'HISTORICAL_EVIDENCE_REUSED') fail('MIGRATION_INPUT_NOT_EQUIVALENT')
  return { orderedEntriesSha256: current.orderedEntriesSha256, profileMigrationsSha256: current.profileMigrationsSha256 }
}
export function assertAiPdmMigrationBundleBytes({ bytes, bundle, sourceRevision, ref = null }) {
  if (!Buffer.isBuffer(bytes)) fail('MIGRATION_BUNDLE_BYTES_INVALID')
  let actual
  try { actual = JSON.parse(strictUtf8(bytes)) } catch { fail('MIGRATION_BUNDLE_BYTES_INVALID') }
  if (canonicalize(actual) !== canonicalize(bundle)) fail('MIGRATION_BUNDLE_BYTES_INVALID')
  assertContentBundle(bundle, sourceRevision)
  if (ref && (!exactKeys(ref, ['uri', 'sha256']) || ref.sha256 !== sha256(bytes) ||
      ref.uri !== `gs://${AI_BUCKET}/source/migration-bundles/${sourceRevision}/${bundle.manifestSha256}.json`)) fail('MIGRATION_BUNDLE_REF_INVALID')
  return { bundle, bytes, bundleSha256: sha256(bytes) }
}
function sameProof(a, b) { if (canonicalize(a) !== canonicalize(b)) fail('REPAIR_JOIN_INVALID') }
function assertAiReleaseRef(ref) {
  if (!exactKeys(ref, ['uri', 'sha256']) || !H64.test(ref.sha256 ?? '') || typeof ref.uri !== 'string'
    || !ref.uri.startsWith(`gs://${AI_BUCKET}/receipts/`)) fail('REPAIR_REF_INVALID')
  return ref
}
export function assertObservedCapsule(value, ref, sourceRevision) {
  let observed = value
  if (Object.hasOwn(value ?? {}, 'openswxWorkerRef')) {
    const retired = value.openswxWorkerRef
    if (!exactKeys(retired, ['uri', 'sha256']) || !H64.test(retired.sha256 ?? '') ||
        !new RegExp(`^gs://${AI_BUCKET}/receipts/dev-122/openswx-worker/[A-Za-z0-9][A-Za-z0-9._/-]*\\.json$`, 'u').test(retired.uri ?? '') ||
        retired.uri.includes('..')) fail('OBSERVED_CAPSULE_INVALID')
    observed = { ...value }
    delete observed.openswxWorkerRef
  }
  const keys = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceSha256', 'sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef', 'migrationManifestSha256', 'previousRevision', 'deadlineAt']
  for (const optional of ['baselineIntentRef', 'principalOnlyFenceRef', 'principalOnlyRecovery', 'postAbortLedgerReadbackRef', 'unlinkedProfileCleanupRef', 'appliedMigrationContinuation', 'forwardAppliedMigrationContinuation']) if (Object.hasOwn(observed ?? {}, optional)) keys.push(optional)
  if (!exactKeys(observed, keys) || observed.schemaVersion !== 'jenfu.dev117.ai-pdm-release-intent.v2' || observed.ownerApplicationId !== 'ai-pdm' || !RELEASE_ID.test(observed.releaseId ?? '') ||
      observed.sourceRevision !== sourceRevision || !H40.test(sourceRevision ?? '') || !H64.test(observed.sourceSha256 ?? '') || !H64.test(observed.migrationManifestSha256 ?? '') ||
      !/^ai-pdm-prod-[a-f0-9]{12}$/u.test(observed.previousRevision ?? '') || !Number.isFinite(Date.parse(observed.deadlineAt)) ||
      ref.uri !== `gs://${AI_BUCKET}/receipts/releases/${observed.releaseId}/release-intent.json`) fail('OBSERVED_CAPSULE_INVALID')
  for (const key of ['sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef']) assertAiReleaseRef(observed[key])
  if (Object.hasOwn(observed, 'appliedMigrationContinuation')) {
    assertAppliedMigrationContinuation(observed.appliedMigrationContinuation, AI_BUCKET)
    if (!observed.postAbortLedgerReadbackRef || !observed.principalOnlyFenceRef || !observed.principalOnlyRecovery || observed.unlinkedProfileCleanupRef) fail('OBSERVED_CAPSULE_INVALID')
  }
  const reconciledAbort = assertReconciledPrincipalAbortBinding(observed, AI_BUCKET)
  if (Object.hasOwn(observed, 'forwardAppliedMigrationContinuation')) {
    assertForwardAppliedMigrationContinuation(observed.forwardAppliedMigrationContinuation, AI_BUCKET)
    if (!observed.appliedMigrationContinuation) fail('OBSERVED_CAPSULE_INVALID')
  }
  if ((observed.principalOnlyFenceRef || observed.principalOnlyRecovery) && observed.baselineIntentRef && !reconciledAbort) fail('OBSERVED_CAPSULE_INVALID')
  if (Object.hasOwn(observed, 'unlinkedProfileCleanupRef')) {
    assertUnlinkedProfileCleanupRef(observed.unlinkedProfileCleanupRef)
    if (observed.principalOnlyFenceRef || observed.principalOnlyRecovery) fail('OBSERVED_CAPSULE_INVALID')
  }
  return observed
}
async function readObservationBundle({ ref, revision, token, fetchImpl }) {
  if (!exactKeys(ref, ['uri', 'sha256']) || !H64.test(ref.sha256 ?? '') || !new RegExp(`^gs://${AI_BUCKET}/source/migration-bundles/${revision}/[a-f0-9]{64}\\.json$`, 'u').test(ref.uri ?? '')) fail('MIGRATION_BUNDLE_REF_INVALID')
  const bytes = await readAiPdmEvidenceLeaf({ ref, kind: 'bundle', sourceRevision: revision, read: async () =>
    (await readGcsObject({ uri: ref.uri, expectedBucket: AI_BUCKET, expectedPrefix: 'source/migration-bundles', token, fetchImpl: scopeFetch(fetchImpl) })).bytes })
  let bundle
  try { bundle = JSON.parse(strictUtf8(bytes)) } catch { fail('MIGRATION_BUNDLE_BYTES_INVALID') }
  return { ...assertAiPdmMigrationBundleBytes({ bytes, bundle, sourceRevision: revision, ref }), ref }
}
async function observeArchiveContent({ source, revision, bundle, token, fetchImpl }) {
  const child = descendAiPdmEvidenceContext(activeEvidence(), { uri: source.uri, sha256: source.sha256 })
  return runAiPdmEvidenceContext(child, async () => {
    sourceIdentity(source)
    const bytes = await readAiPdmEvidenceLeaf({ ref: { uri: source.uri, sha256: source.sha256 }, kind: 'source', generation: source.generation, crc32c: source.crc32c, sourceRevision: revision,
      read: async () => (await readAiPdmSourceArchive({ source, sourceRevision: revision, deadlineAt: observationDeadline(), token, fetchImpl })).bytes })
    const content = parseAiPdmMigrationArchive({ bytes, sourceRevision: revision,
      bundle, deadlineAt: observationDeadline(), gzip: true })
    activeEvidence()
    return { content, bytes, sourceAuthentication: { identity: sourceIdentity(source), sourceRevision: revision, generation: source.generation,
      crc32c: source.crc32c, sha256: sha256(bytes) } }
  })
}
async function readOrdinaryObservedGraph({ sourceRevision, refs, token, fetchImpl, preMigration = false }) {
  const selected = assertOwnerReleaseRefSet('ai-pdm', refs, preMigration ? 'pre_migration' : 'post_migration')
  const intentRef = { uri: `gs://${AI_BUCKET}/receipts/releases/${selected.releaseId}/release-intent.json`, sha256: selected.root.split('/').at(-1) }
  const intent = assertObservedCapsule((await readRef(intentRef, AI_BUCKET, token, fetchImpl)).value, intentRef, sourceRevision)
  if (intent.appliedMigrationContinuation) fail('APPLIED_MIGRATION_CONTINUATION_PROOF_INVALID')
  const base = await readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision, refs, token, fetchImpl, mode: preMigration ? 'pre_migration' : 'post_migration' })
  const serializedChain = base.releaseChain ?? base.buildChain
  const chain = Object.fromEntries(await Promise.all(Object.entries(serializedChain).map(async ([key, row]) => [key, await readRef({ uri: row.ref, sha256: row.sha256 }, AI_BUCKET, token, fetchImpl)])))
  const prepare = await readRef(refs.prepare, AI_BUCKET, token, fetchImpl)
  const sourceLock = await readRef(intent.sourceLockRef, AI_BUCKET, token, fetchImpl)
  admitAiPdmEvidenceSource({ bytes: sourceLock.bytes, ref: sourceLock.ref })
  const bundle = await readObservationBundle({ ref: chain.deployment.value.migrationBundleRef, revision: sourceRevision, token, fetchImpl })
  const archived = await observeArchiveContent({ source: chain.deployment.value.sourceObject, revision: sourceRevision, bundle: bundle.bundle, token, fetchImpl })
  const migrate = refs.migrate ? await readRef(refs.migrate, AI_BUCKET, token, fetchImpl) : null
  const terminal = refs.terminal ? await readRef(refs.terminal, AI_BUCKET, token, fetchImpl) : null
  return { intent, intentRef, prepare, sourceLock, migrate, terminal, chain, bundle, content: archived.content,
    sourceAuthentication: archived.sourceAuthentication, migrationHistory: null, repairHistory: null, repair: false,
    descriptor: null, baseline: null, prerequisite: null, migrationMode: migrate ? 'FORWARD_APPLIED' : null, appliedMigrationOnly: false }
}
async function readAppliedOnlyObservedGraph({ sourceRevision, refs, token, fetchImpl, readOwnerSourceProof: observeOwnerSource }) {
  if (!exactKeys(refs, ['prepare', 'migrate', 'terminal'])) fail('INPUT_INVALID')
  const selected = assertOwnerReleaseRefSet('ai-pdm', { prepare: refs.prepare, migrate: null, terminal: null }, 'pre_migration')
  const root = selected.root
  const intentRef = { uri: `gs://${AI_BUCKET}/receipts/releases/${selected.releaseId}/release-intent.json`, sha256: root.split('/').at(-1) }
  const intentRow = await readRef(intentRef, AI_BUCKET, token, fetchImpl)
  const historicalIntent = intentRow.value
  const intent = assertObservedCapsule(historicalIntent, intentRef, sourceRevision)
  if (!intent.appliedMigrationContinuation || intent.unlinkedProfileCleanupRef) fail('APPLIED_MIGRATION_CONTINUATION_PROOF_INVALID')
  const prepare = await readRef(refs.prepare, AI_BUCKET, token, fetchImpl)
  sameProof(prepare.value.facts?.prerequisiteRefs, Object.fromEntries(Object.entries({ sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }).map(([name, key]) => [name, intent[key]])))
  const base = await readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision,
    refs: { prepare: refs.prepare, migrate: null, terminal: null }, mode: 'pre_migration', token, fetchImpl })
  let chain = Object.fromEntries(await Promise.all(Object.entries(base.buildChain).map(async ([key, row]) => [key, await readRef({ uri: row.ref, sha256: row.sha256 }, AI_BUCKET, token, fetchImpl)])))
  if (chain.deployment.value.schemaVersion !== 'jenfu.dev117.ai-pdm-deployment-capsule.v2'
    || chain.deployment.value.ownerApplicationId !== 'ai-pdm' || chain.deployment.value.deadlineAt !== intent.deadlineAt
    || chain.deployment.value.releaseIntentSha256 !== intentRef.sha256 || Object.hasOwn(chain.deployment.value, 'openswxWorker')) fail('DEPLOYMENT_CAPSULE_INVALID')
  sameProof(chain.deployment.value.releaseIntentRef, intentRef)
  sameProof(chain.deployment.value.sourceObject, chain.build.value.facts.sourceObject)
  sameProof(chain.deployment.value.sourceObject, chain.provenance.value.sourceObject)
  sameProof(chain.deployment.value.migrationBundleRef, chain.build.value.facts.migrationBundleRef)
  const runtimeRow = await readRef(intent.runtimeConfigRef, AI_BUCKET, token, fetchImpl)
  if (runtimeRow.value.releaseId !== intent.releaseId || runtimeRow.value.sourceRevision !== sourceRevision
    || runtimeRow.value.ownerApplicationId !== 'ai-pdm' || runtimeRow.value.status !== 'VERIFIED') fail('APPLIED_MIGRATION_CONTINUATION_RUNTIME_INVALID')
  const runtime = runtimeRow.value.runtimeConfig ?? runtimeRow.value
  const { assertRuntimeConfig } = await import('./dev012-owner-release-runtime.mjs')
  const sourceLock = await readRef(intent.sourceLockRef, AI_BUCKET, token, fetchImpl)
  if (sourceLock.value.sourceSha256 !== intent.sourceSha256 || sourceLock.value.migrationManifestSha256 !== intent.migrationManifestSha256) fail('SOURCE_LOCK_INVALID')
  admitAiPdmEvidenceSource({ bytes: sourceLock.bytes, ref: sourceLock.ref })
  const bundle = await readObservationBundle({ ref: chain.deployment.value.migrationBundleRef, revision: sourceRevision, token, fetchImpl })
  if (bundle.bundle.manifestSha256 !== intent.migrationManifestSha256) fail('MIGRATION_BUNDLE_MANIFEST_INVALID')
  const archived = await observeArchiveContent({ source: chain.deployment.value.sourceObject, revision: sourceRevision, bundle: bundle.bundle, token, fetchImpl })
  const profile = JSON.parse(strictUtf8(archived.content.files.get(PROFILE_PATH)))
  assertHistoricalAppliedContinuationRuntimeConfig(profile, runtime, historicalIntent, assertRuntimeConfig)
  const transport = {
    async readBytes(uri, { prefixes = ['receipts'], expectedSha256 = null } = {}) {
      if (prefixes.length !== 1 || !['receipts', 'source/migration-bundles'].includes(prefixes[0])) fail('APPLIED_MIGRATION_CONTINUATION_PROOF_INVALID')
      let object
      try { object = await readGcsObject({ uri, expectedBucket: AI_BUCKET, expectedPrefix: prefixes[0], token, fetchImpl: scopeFetch(fetchImpl) }) }
      catch (error) {
        if (error?.code === 'MIGRATION_GCS_METADATA_FAILED' && error.message === '404') throw Object.assign(new Error('MISSING'), { code: 'MISSING' })
        throw error
      }
      const ref = { uri, sha256: expectedSha256 ?? sha256(object.bytes) }
      const bytes = await readAiPdmEvidenceLeaf({ ref, read: async () => object.bytes })
      rememberReceiptMetadata(ref, object)
      return { ...object, bytes, ref }
    },
    readJson: ref => readRef(ref, AI_BUCKET, token, fetchImpl),
    async readOwnerSourceProof(args) {
      if (observeOwnerSource) return observeOwnerSource(args)
      const proof = await readAiPdmReleaseObservation({ sourceRevision: args.sourceRevision, refs: args.refs, token, fetchImpl, readSource: null })
      return { proof, provider: await verifyOwnerProviderReadback({ proof, token, fetchImpl, builderReadback: null }) }
    },
  }
  const stage = await import('./dev012-owner-stage-executor.mjs')
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const readSource = (file, revision) => {
    if (revision !== sourceRevision || (file !== PROFILE_PATH && !bundle.bundle.entries.some(row => row.path === file))) fail('APPLIED_MIGRATION_CONTINUATION_SOURCE_INVALID')
    const bytes = archived.content.files.get(file)
    if (!bytes) fail('APPLIED_MIGRATION_CONTINUATION_SOURCE_INVALID')
    return bytes
  }
  const buildMigrationBundle = async revision => createMigrationBundle({ target: { ownerApplicationId: 'ai-pdm', ledger: profile.migrations.ledger, baselineCount: profile.migrations.baselineCount },
    sourceRevision: revision, entries: structuredClone(bundle.bundle.entries) })
  let migrate = null, terminal = null, history = null, oldHistory = null, migrationMode = null
  if (refs.migrate !== null) {
    oldHistory = await stage.readAppliedMigrationContinuationHistory({ intent, profile, transport, readSource, buildMigrationBundle, repositoryRoot })
    if (intent.forwardAppliedMigrationContinuation) {
      assertOwnerReleaseRefSet('ai-pdm', refs, 'post_migration')
      history = await stage.readForwardAppliedMigrationHistory({ intent, profile, transport, repositoryRoot })
      if (assertAiPdmRepairMigrationMode(oldHistory, history.source.content) !== 'FORWARD_APPLIED') fail('APPLIED_FORWARD_CONTINUATION_PROOF_INVALID')
      assertAiPdmInstalledMigrationEquivalent(history, archived.content)
      migrate = await readRef(refs.migrate, AI_BUCKET, token, fetchImpl)
      assertForwardMigrationAssociation(migrate.value, { intent, deploymentRef: chain.deployment.ref, history })
      await stage.assertNoForwardMigrationSubmission({ transport, profile, outputUri: `${root}/migrate.json` })
      migrationMode = 'HISTORICAL_EVIDENCE_REUSED'
    } else if (canonicalize(refs.migrate) === canonicalize(intent.appliedMigrationContinuation.migrateRef)) {
      if (refs.terminal) assertRef(refs.terminal, AI_BUCKET, `${root}/terminal.json`)
      history = oldHistory
      assertAiPdmInstalledMigrationEquivalent(history, archived.content)
      migrate = await readRef(refs.migrate, AI_BUCKET, token, fetchImpl)
      migrationMode = 'HISTORICAL_EVIDENCE_REUSED'
    } else {
      assertOwnerReleaseRefSet('ai-pdm', refs, 'post_migration')
      const evidence = await stage.readAppliedMigrationEvidence({ binding: { sourceRevision, prepareRef: refs.prepare, migrateRef: refs.migrate }, currentIntent: intent, profile, transport, readSource })
      history = assertAiPdmMigrationHistory(evidence.history)
      migrate = await readRef(refs.migrate, AI_BUCKET, token, fetchImpl)
      if (migrate.value.ledgerCount !== bundle.bundle.entries.length || Date.parse(migrate.value.startedAt) < Date.parse(chain.build.value.observedAt)
        || Date.parse(migrate.value.completedAt) > Date.parse(intent.deadlineAt)) fail('OBSERVED_CHRONOLOGY_INVALID')
      if (assertAiPdmRepairMigrationMode(oldHistory, archived.content) !== 'FORWARD_APPLIED') fail('REPAIR_MIGRATION_MODE_INVALID')
      migrationMode = 'FORWARD_APPLIED'
    }
    const admission = await readFixedJson(`${root}/migration-admission.json`, AI_BUCKET, token, fetchImpl)
    assertStage(admission.value, 'ai-pdm', sourceRevision, intent.releaseId, 'migrate')
    if (canonicalize(admission.value.previousReceiptRef) !== canonicalize(chain.deployment.ref)
      || canonicalize(admission.value.facts?.migrationReceiptRef) !== canonicalize(migrate.ref)
      || admission.value.facts.disposition !== migrationMode || admission.value.facts.sourceRevision !== sourceRevision
      || admission.value.facts.manifestSha256 !== intent.migrationManifestSha256
      || Boolean(intent.forwardAppliedMigrationContinuation) !== (admission.value.facts.schemaStageOnly === true)
      || (!intent.forwardAppliedMigrationContinuation && Object.hasOwn(admission.value.facts, 'schemaStageOnly'))
      || Date.parse(admission.value.observedAt) > Date.parse(intent.deadlineAt)) fail('MIGRATION_ADMISSION_INVALID')
    if (refs.terminal) {
      terminal = await readRef(refs.terminal, AI_BUCKET, token, fetchImpl)
      assertStage(terminal.value, 'ai-pdm', sourceRevision, intent.releaseId, 'terminal')
      if (terminal.value.facts?.result !== 'RELEASED' || terminal.value.facts.databaseDisposition !== migrationMode
        || terminal.value.facts.remainingHumanAction !== 0 || Date.parse(terminal.value.observedAt) > Date.parse(intent.deadlineAt)) fail('TERMINAL_INVALID')
      if (migrationMode === 'HISTORICAL_EVIDENCE_REUSED') sameProof(terminal.value.facts.migrationEvidenceRef, migrate.ref)
      chain = await readReleasedStageChain({ owner: 'ai-pdm', config: OWNERS['ai-pdm'], revision: sourceRevision,
        releaseId: intent.releaseId, root, terminal, prepare, migrate, migrationAdmission: admission,
        migrationManifestSha256: intent.migrationManifestSha256, token, fetchImpl })
    }
  } else if (refs.terminal !== null) fail('OWNER_RELEASE_REF_SET_INVALID')
  const times = [prepare.value.observedAt, chain.build.value.observedAt,
    ...(migrate?.value?.schemaVersion === 'jenfu.dev012.stage-receipt.v1' ? [migrate.value.observedAt] : []),
    ...['candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize'].filter(key => chain[key]).map(key => chain[key].value.observedAt),
    ...(terminal ? [terminal.value.observedAt] : [])].map(Date.parse)
  if (times.some(time => !Number.isFinite(time) || time > Date.parse(intent.deadlineAt))
    || times.some((time, index) => index && time < times[index - 1])
    || (migrationMode === 'FORWARD_APPLIED' && chain.candidate && Date.parse(migrate.value.completedAt) > Date.parse(chain.candidate.value.observedAt))) fail('OBSERVED_CHRONOLOGY_INVALID')
  return { intent, intentRef, prepare, sourceLock, migrate, terminal, chain, bundle, content: archived.content,
    sourceAuthentication: archived.sourceAuthentication, migrationHistory: history, repairHistory: oldHistory, repair: false,
    descriptor: null, baseline: null, prerequisite: null, migrationMode, appliedMigrationOnly: true }
}

/** Fixed AI-PDM readonly source observation; executable legacy worker evidence is not admitted. */
export async function readAiPdmReleaseObservation({ sourceRevision, refs, token, fetchImpl = fetch, readOwnerSourceProof: observeOwnerSource = null }) {
  if (observeOwnerSource !== null && typeof observeOwnerSource !== 'function') fail('OWNER_SOURCE_PROOF_INVALID')
  const handle = createAiPdmEvidenceContext()
  return runAiPdmEvidenceContext(handle, async () => {
    if (!exactKeys(refs, ['prepare', 'migrate', 'terminal'])
      || (refs.migrate === null ? refs.terminal !== null : !exactKeys(refs.migrate, ['uri', 'sha256']))
      || (refs.terminal !== null && !exactKeys(refs.terminal, ['uri', 'sha256']))) fail('INPUT_INVALID')
    const preMigration = refs.migrate === null && refs.terminal === null
    const selected = assertOwnerReleaseRefSet('ai-pdm', { prepare: refs.prepare, migrate: null, terminal: null }, 'pre_migration')
    const intentRef = { uri: `gs://${AI_BUCKET}/receipts/releases/${selected.releaseId}/release-intent.json`, sha256: selected.root.split('/').at(-1) }
    const intent = assertObservedCapsule((await readRef(intentRef, AI_BUCKET, token, fetchImpl)).value, intentRef, sourceRevision)
    const input = { sourceRevision, refs: structuredClone(refs), token, fetchImpl, readOwnerSourceProof: observeOwnerSource }
    const deriveGraph = () => intent.appliedMigrationContinuation ? readAppliedOnlyObservedGraph(input) : readOrdinaryObservedGraph({ ...input, preMigration })
    if (!intent.appliedMigrationContinuation) {
      const proof = await readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision, refs, token, fetchImpl,
        mode: preMigration ? 'pre_migration' : 'post_migration' })
      const source = proof.providerClaim.sourceObject
      const child = descendAiPdmEvidenceContext(handle, { uri: source.uri, sha256: source.sha256 })
      const sourceAuthentication = await runAiPdmEvidenceContext(child, async () => {
        const bytes = await readAiPdmEvidenceLeaf({ ref: { uri: source.uri, sha256: source.sha256 }, kind: 'source',
          generation: source.generation, crc32c: source.crc32c, sourceRevision,
          read: async () => (await readAiPdmSourceArchive({ source, sourceRevision,
            deadlineAt: observationDeadline(), token, fetchImpl })).bytes })
        return { identity: sourceIdentity(source), sourceRevision, generation: source.generation,
          crc32c: source.crc32c, sha256: sha256(bytes) }
      })
      if (Object.hasOwn(proof, 'migrate')) proof.migrate = { ...proof.migrate, generation: null, crc32c: null }
      authenticatedObservations.set(proof, { root: evidenceState(handle).root,
        proofSha256: sha256(canonicalize(proof)), sourceAuthentication, deriveGraph })
      activeEvidence()
      return proof
    }
    const graph = await deriveGraph()
    const historical = graph.migrationMode === 'HISTORICAL_EVIDENCE_REUSED'
    const object = row => ({ ref: row.ref.uri, sha256: row.ref.sha256, generation: row.generation, crc32c: row.crc32c })
    const proof = { owner: 'ai-pdm', sourceRevision, releaseId: graph.intent.releaseId,
      disposition: graph.terminal ? 'released' : preMigration ? 'build_only' : historical ? 'migration_evidence_only' : 'migration_only',
      migrationManifestSha256: graph.intent.migrationManifestSha256, prepare: object(graph.prepare), sourceLock: object(graph.sourceLock),
      artifactDigest: graph.chain.deployment.value.artifactDigest, releaseCapsuleRef: graph.intentRef,
      providerClaim: { buildId: graph.chain.provenance.value.cloudBuild.id, sourceObject: graph.chain.provenance.value.sourceObject },
      ...(preMigration ? { releaseAuthority: false, migrationVerified: false } : { migrate: { ...object(graph.migrate), generation: null, crc32c: null } }),
      ...(graph.terminal ? { terminal: object(graph.terminal), candidateRevision: graph.terminal.value.facts.candidateRevision,
        releaseChain: Object.fromEntries(Object.entries(graph.chain).map(([key, row]) => [key, object(row)])) }
        : { buildChain: Object.fromEntries(Object.entries(graph.chain).map(([key, row]) => [key, object(row)])) }),
      ...(historical ? { releaseAuthority: false, migrationVerified: false, currentDatabaseReadPerformed: false, databaseLiveState: 'UNKNOWN', evidenceScope: 'MIGRATION_INPUT_EQUIVALENT_NO_EXECUTION', databaseDisposition: 'HISTORICAL_EVIDENCE_REUSED', migrationEvidenceRef: graph.migrate.ref } : {}) }
    authenticatedObservations.set(proof, { root: evidenceState(handle).root, proofSha256: sha256(canonicalize(proof)), sourceAuthentication: graph.sourceAuthentication, deriveGraph })
    activeEvidence()
    return proof
  })
}/** Only same live observation may expose its derived content to existing stage adapters. */
export async function readAiPdmObservationInputs(proof) {
  const active = activeEvidence(), stored = authenticatedObservations.get(proof)
  if (active === undefined || !stored || stored.root !== evidenceState(active).root || stored.root.closed ||
      stored.proofSha256 !== sha256(canonicalize(proof))) fail('OBSERVATION_IDENTITY_INVALID')
  const graph = await stored.deriveGraph()
  activeEvidence()
  return graph
}
function assertRef(value, bucket, expectedUri = null) {
  if (!exactKeys(value, ['uri', 'sha256']) ||
      typeof value.uri !== 'string' || !H64.test(value.sha256) ||
      !value.uri.startsWith(`gs://${bucket}/receipts/`) ||
      (expectedUri !== null && value.uri !== expectedUri)) fail('REF_INVALID')
  return value
}
// Provider metadata is private to the same live root, alongside its exact byte key.
// Only a generation-pinned, CRC-checked GCS read may populate this memo.
function receiptMetadataKey(ref) {
  return canonicalize(['receipt', ref.uri, ref.sha256, null, null, null])
}
function rememberReceiptMetadata(ref, object) {
  const handle = activeEvidence()
  if (handle === undefined) return
  if (sha256(object.bytes) !== ref.sha256) fail('OBJECT_HASH_MISMATCH')
  const metadata = Object.freeze({ generation: object.generation, crc32c: object.crc32c })
  const memo = evidenceState(handle).root.receiptMetadata, key = receiptMetadataKey(ref)
  if (memo.has(key) && canonicalize(memo.get(key)) !== canonicalize(metadata)) fail('CONTEXT_RECEIPT_METADATA_CONFLICT')
  memo.set(key, metadata)
  recordHistoryObject(evidenceState(handle).root, ref, metadata)
}
async function readRef(ref, bucket, token, fetchImpl) {
  assertRef(ref, bucket)
  let object
  const load = async () => {
    object = await readGcsObject({ uri: ref.uri, expectedBucket: bucket,
      expectedPrefix: 'receipts', token, fetchImpl: scopeFetch(fetchImpl) })
    activeEvidence()
    rememberReceiptMetadata(ref, object)
    return object.bytes
  }
  const handle = activeEvidence()
  const bytes = handle === undefined ? await load() : await readAiPdmEvidenceLeaf({ ref, read: load })
  if (handle !== undefined && !object) {
    object = evidenceState(handle).root.receiptMetadata.get(receiptMetadataKey(ref))
    if (!object && !(await load()).equals(bytes)) fail('OBJECT_HASH_MISMATCH')
  }
  if (sha256(bytes) !== ref.sha256) fail('OBJECT_HASH_MISMATCH')
  if (handle !== undefined) recordHistoryObject(evidenceState(handle).root, ref, object ?? {})
  let value
  try { value = JSON.parse(strictUtf8(bytes)) }
  catch { fail('JSON_INVALID') }
  activeEvidence()
  return { value, ref, generation: object?.generation ?? null, crc32c: object?.crc32c ?? null, bytes }
}
async function readFixedJson(uri, bucket, token, fetchImpl) {
  const object = await readGcsObject({ uri, expectedBucket: bucket,
    expectedPrefix: 'receipts', token, fetchImpl: scopeFetch(fetchImpl) })
  activeEvidence()
  const ref = { uri, sha256: sha256(object.bytes) }
  if (activeEvidence() !== undefined) await readAiPdmEvidenceLeaf({ ref, read: async () => object.bytes })
  let value
  try { value = JSON.parse(object.bytes.toString('utf8')) }
  catch { fail('JSON_INVALID') }
  rememberReceiptMetadata(ref, object)
  return { value, bytes: object.bytes, ref,
    generation: object.generation, crc32c: object.crc32c }
}
export function assertStage(value, owner, revision, releaseId, stage) {
  try { assertStageReceipt(value, { ownerApplicationId: owner, releaseId, sourceRevision: revision, stage }) }
  catch { fail('STAGE_INVALID') }
}
export function assertSourceLock(value, owner, config, revision, releaseId) {
  if (!exactKeys(value, ['schemaVersion', 'ownerApplicationId', 'repository',
    'branch', 'releaseId', 'sourceRevision', 'sourceTree', 'sourceSha256',
    'migrationManifestSha256', 'clean', 'remoteRef', 'remoteRevision',
    'status', 'releaseAuthority', 'evidenceScope', 'observedAt']) ||
    value.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1' ||
    value.ownerApplicationId !== owner || value.repository !== config.repository ||
    value.branch !== config.branch || value.releaseId !== releaseId ||
    value.sourceRevision !== revision || value.remoteRevision !== revision ||
    value.remoteRef !== `refs/heads/${config.branch}` || value.clean !== true ||
    !H40.test(value.sourceTree) || !H64.test(value.sourceSha256) ||
    !H64.test(value.migrationManifestSha256) ||
    value.status !== 'SOURCE_FROZEN' || value.releaseAuthority !== true ||
    value.evidenceScope !== 'PRODUCTION_BOUND' ||
    !Number.isFinite(Date.parse(value.observedAt))) fail('SOURCE_LOCK_INVALID')
}
function assertPrincipalOnlyFenceSummary(value, expectedRef = null) {
  const keys = ['ref', 'sha256', 'service', 'uid', 'oldRevision',
    'beforeGeneration', 'generation', 'requestTimeoutSeconds', 'drainSeconds',
    'fenceSourceRevision', 'ownerWriterSessions']
  const refMatch = typeof value?.ref === 'string'
    ? value.ref.match(new RegExp(`^gs://${AI_BUCKET}/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/([a-f0-9]{40})/fence-([1-9][0-9]*)\\.json$`, 'u'))
    : null
  if (!exactKeys(value, keys) ||
      !refMatch || refMatch[1] !== value.fenceSourceRevision ||
      Number(refMatch[2]) !== value.generation ||
      !H64.test(value.sha256 ?? '') || value.service !== 'ai-pdm-prod' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value.uid ?? '') ||
      !/^ai-pdm-prod-[a-z0-9]+$/u.test(value.oldRevision ?? '') ||
      !Number.isSafeInteger(value.beforeGeneration) || value.beforeGeneration < 0 ||
      !Number.isSafeInteger(value.generation) || value.generation <= value.beforeGeneration ||
      !Number.isSafeInteger(value.requestTimeoutSeconds) || value.requestTimeoutSeconds < 1 || value.requestTimeoutSeconds > 60 ||
      value.drainSeconds !== value.requestTimeoutSeconds + 30 ||
      !H40.test(value.fenceSourceRevision ?? '') || value.ownerWriterSessions !== 0) fail('MIGRATION_INVALID')
  if (expectedRef !== null &&
      (!exactKeys(expectedRef, ['uri', 'sha256']) || expectedRef.uri !== value.ref || expectedRef.sha256 !== value.sha256)) fail('MIGRATION_INVALID')
}

export function assertMigration(value, owner, config, revision, manifestSha256, unlinkedProfileCleanupRef, principalOnlyFenceRef = null) {
  const ownerPolicy = OWNERS[owner]
  if (!config || typeof config !== 'object' || Array.isArray(config) || !ownerPolicy) fail('MIGRATION_INVALID')
  const receiptConfig = {
    ...config,
    ...(!Object.hasOwn(config, 'migrationBootstrap') ? { migrationBootstrap: ownerPolicy.migrationBootstrap } : {}),
    ...(!Object.hasOwn(config, 'principalContractLedgerFloor') ? { principalContractLedgerFloor: ownerPolicy.principalContractLedgerFloor } : {}),
  }
  if (Object.hasOwn(value ?? {}, 'unlinkedProfileCleanup') || unlinkedProfileCleanupRef !== undefined) {
    if (owner !== 'ai-pdm') fail('MIGRATION_INVALID')
    assertUnlinkedProfileCleanupReceipt(value?.unlinkedProfileCleanup, unlinkedProfileCleanupRef)
  }
  const hasPrincipalOnlyFence = Object.hasOwn(value ?? {}, 'principalOnlyFence')
  if (hasPrincipalOnlyFence || principalOnlyFenceRef !== null) {
    if (owner !== 'ai-pdm' || !hasPrincipalOnlyFence) fail('MIGRATION_INVALID')
    assertPrincipalOnlyFenceSummary(value.principalOnlyFence, principalOnlyFenceRef)
  }
  if (typeof receiptConfig.migrationBootstrap !== 'boolean' ||
      !Number.isInteger(receiptConfig.principalContractLedgerFloor) ||
      receiptConfig.principalContractLedgerFloor < 1) fail('MIGRATION_INVALID')
  if (!exactKeys(value, ['schemaVersion', 'ownerApplicationId', 'sourceRevision',
    'database', 'ledger', 'manifestSha256', 'baselineCount', 'minimumLedgerCount',
    ...(receiptConfig.migrationBootstrap ? ['ledgerBootstrap'] : []),
    ...(owner === 'ai-pdm' && Object.hasOwn(value ?? {}, 'unlinkedProfileCleanup') ? ['unlinkedProfileCleanup'] : []),
    ...(owner === 'ai-pdm' && hasPrincipalOnlyFence ? ['principalOnlyFence'] : []),
    'ledgerCount', 'applied', 'replayed', 'crossDatabaseDenials',
    'boundaryStatus', 'executionName', 'startedAt', 'completedAt', 'status',
    'receiptSha256']) ||
    value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' ||
    value.ownerApplicationId !== owner || value.sourceRevision !== revision ||
    value.database !== 'jenfu_prod' || value.ledger !== receiptConfig.ledger ||
    value.manifestSha256 !== manifestSha256 || value.status !== 'PASS' ||
    value.boundaryStatus !== 'PASS' || value.receiptSha256 !== receiptHash(value) ||
    !Number.isInteger(value.baselineCount) || value.baselineCount < 0 ||
    !Number.isInteger(value.minimumLedgerCount) ||
    value.minimumLedgerCount < 0 ||
    value.minimumLedgerCount > value.baselineCount ||
    !Number.isInteger(value.ledgerCount) ||
    value.ledgerCount < value.baselineCount ||
    value.ledgerCount < value.minimumLedgerCount ||
    value.ledgerCount < receiptConfig.principalContractLedgerFloor ||
    !Number.isInteger(value.applied) || value.applied < 0 ||
    !Number.isInteger(value.replayed) || value.replayed < 0 ||
    value.applied + value.replayed !== value.ledgerCount ||
    (receiptConfig.migrationBootstrap &&
      (!exactKeys(value.ledgerBootstrap, ['enabled', 'created']) ||
        typeof value.ledgerBootstrap.enabled !== 'boolean' ||
        typeof value.ledgerBootstrap.created !== 'boolean' ||
        (value.ledgerBootstrap.created && !value.ledgerBootstrap.enabled))) ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    Date.parse(value.completedAt) < Date.parse(value.startedAt) ||
    canonicalize(value.crossDatabaseDenials) !== canonicalize([
      { database: 'jenfu_dev', denied: true },
      { database: 'jenfu_stg', denied: true },
    ])) fail('MIGRATION_INVALID')
}

async function readBuildEvidence({ owner, config, revision, releaseId, root,
  prepare, deployment, artifactDigest, token, fetchImpl }) {
  const imagePrefix = `${config.artifactUri}@sha256:`
  if (typeof artifactDigest !== 'string' ||
      !artifactDigest.startsWith(imagePrefix) ||
      !H64.test(artifactDigest.slice(imagePrefix.length)) ||
      deployment.value?.sourceRevision !== revision ||
      deployment.value?.artifactDigest !== artifactDigest) fail('STAGE_CHAIN_INVALID')
  const buildRef = assertRef(deployment.value.buildReceiptRef, config.bucket,
    `${root}/build.json`)
  const build = await readRef(buildRef, config.bucket, token, fetchImpl)
  assertStage(build.value, owner, revision, releaseId, 'build')
  if (canonicalize(build.value.previousReceiptRef) !==
      canonicalize(prepare.ref) ||
      build.value.facts?.artifactDigest !== artifactDigest) fail('STAGE_CHAIN_INVALID')
  const provenanceRef = assertRef(build.value.facts.provenanceReceiptRef,
    config.bucket, `${root}/provenance.json`)
  const provenance = await readRef(provenanceRef, config.bucket, token, fetchImpl)
  const sourceObject = build.value.facts.sourceObject
  const sourcePath = root.split('/').at(-1)
  const expectedSourceUri = `gs://${config.bucket}/source/releases/${releaseId}/${sourcePath}/source.tar.gz`
  const buildRecord = provenance.value?.cloudBuild
  const storageSource = buildRecord?.sourceProvenance?.resolvedStorageSource
  const imageTag = `${config.artifactUri}:release-${revision}`
  if (provenance.value?.schemaVersion !== 'jenfu.dev012.build-provenance-receipt.v1' ||
      provenance.value.ownerApplicationId !== owner ||
      provenance.value.sourceRevision !== revision ||
      provenance.value.status !== 'PASS' ||
      provenance.value.artifactDigest !== artifactDigest ||
      canonicalize(provenance.value.sourceObject) !== canonicalize(sourceObject) ||
      !exactKeys(sourceObject, ['uri', 'sha256', 'generation', 'crc32c']) ||
      sourceObject.uri !== expectedSourceUri || !H64.test(sourceObject.sha256) ||
      !/^[1-9][0-9]*$/u.test(sourceObject.generation) ||
      typeof sourceObject.crc32c !== 'string' ||
      !BUILD_ID.test(buildRecord?.id ?? '') ||
      !isTargetBuildName(buildRecord.name, buildRecord.id) ||
      buildRecord?.status !== 'SUCCESS' ||
      buildRecord.projectId !== 'jenfu-platform-prod' ||
      buildRecord.serviceAccount !==
        `projects/jenfu-platform-prod/serviceAccounts/${config.builder}` ||
      buildRecord.options?.requestedVerifyOption !== 'VERIFIED' ||
      storageSource?.bucket !== config.bucket ||
      storageSource?.object !== sourceObject.uri.slice(`gs://${config.bucket}/`.length) ||
      String(storageSource?.generation) !== sourceObject.generation ||
      !buildRecord.results?.images?.some((image) =>
        image.name === imageTag &&
        `${config.artifactUri}@${image.digest}` === artifactDigest) ||
      provenance.value.artifactRegistry?.uri !== artifactDigest) {
    fail('PROVENANCE_INVALID')
  }
  return { deployment, build, provenance }
}

async function readReleasedStageChain({ owner, config, revision, releaseId, root,
  terminal, prepare, migrate, migrationAdmission = null, migrationManifestSha256 = null, token, fetchImpl }) {
  const stages = {}
  let successor = terminal
  const artifactDigest = terminal.value.facts.artifactDigest
  const candidateRevision = terminal.value.facts.candidateRevision
  for (const stage of ['finalize', 'canonical', 'activate', 'decision',
    'verify', 'entrypoint', 'candidate']) {
    const ref = assertRef(successor.value.previousReceiptRef, config.bucket,
      `${root}/${stage}.json`)
    const current = await readRef(ref, config.bucket, token, fetchImpl)
    assertStage(current.value, owner, revision, releaseId, stage)
    if (['finalize', 'canonical', 'activate', 'decision', 'verify',
      'candidate'].includes(stage) &&
      (current.value.facts?.candidateRevision !== candidateRevision ||
        current.value.facts?.artifactDigest !== artifactDigest)) fail('STAGE_CHAIN_INVALID')
    if ((stage === 'finalize' &&
        (current.value.facts?.result !== 'RELEASED' ||
          current.value.facts?.temporaryCandidateTags !== 0)) ||
        (stage === 'decision' && current.value.facts?.decision !== 'GO') ||
        (stage === 'activate' &&
          current.value.facts?.effectiveRevision !== candidateRevision) ||
        (['verify', 'canonical'].includes(stage) &&
          current.value.facts?.smoke?.status !== 'PASS')) fail('STAGE_CHAIN_INVALID')
    stages[stage] = current
    successor = current
  }
  const candidate = stages.candidate
  const deploymentRef = assertRef(candidate.value.facts.deploymentCapsuleRef,
    config.bucket, `${root}/deployment-capsule.json`)
  const deployment = await readRef(deploymentRef, config.bucket, token, fetchImpl)
  if (owner === 'ai-pdm') {
    const admission = migrationAdmission ?? await readFixedJson(`${root}/migration-admission.json`, config.bucket, token, fetchImpl)
    assertStage(admission.value, owner, revision, releaseId, 'migrate')
    if (canonicalize(candidate.value.previousReceiptRef) !== canonicalize(admission.ref)
      || canonicalize(candidate.value.facts.migrationAdmissionRef) !== canonicalize(admission.ref)
      || canonicalize(candidate.value.facts.migrationReceiptRef) !== canonicalize(migrate.ref)
      || canonicalize(admission.value.previousReceiptRef) !== canonicalize(deployment.ref)
      || canonicalize(admission.value.facts?.migrationReceiptRef) !== canonicalize(migrate.ref)
      || admission.value.facts?.disposition !== terminal.value.facts.databaseDisposition
      || admission.value.facts?.sourceRevision !== revision
      || admission.value.facts?.manifestSha256 !== migrationManifestSha256) fail('STAGE_CHAIN_INVALID')
    stages.migrationAdmission = admission
  } else if (canonicalize(candidate.value.previousReceiptRef) !== canonicalize(migrate.ref)
    || canonicalize(candidate.value.facts.migrationReceiptRef) !== canonicalize(migrate.ref)) fail('STAGE_CHAIN_INVALID')
  return { ...stages, ...await readBuildEvidence({ owner, config, revision,
    releaseId, root, prepare, deployment, artifactDigest, token, fetchImpl }) }
}

/** Read-only, bucket-pinned owner source evidence; it does not authorize cutover. */
export async function readOwnerReleaseProof({ owner, sourceRevision, refs, token,
  fetchImpl = fetch, mode = 'post_migration', readSource = null }) {
  const config = OWNERS[owner]
  if (!config || !H40.test(sourceRevision ?? '') ||
      !refs) {
    fail('INPUT_INVALID')
  }
  const { releaseId, root } = assertOwnerReleaseRefSet(owner, refs, mode)
  const prepare = await readRef(refs.prepare, config.bucket, token, fetchImpl)
  assertStage(prepare.value, owner, sourceRevision, releaseId, 'prepare')
  if (prepare.value.previousReceiptRef !== null ||
      !exactKeys(prepare.value.facts?.prerequisiteRefs,
        ['sourceLock', 'authorization', 'readiness', 'foundation', 'infra', 'runtimeConfig'])) {
    fail('PREPARE_INVALID')
  }
  const sourceLockRef = assertRef(prepare.value.facts.prerequisiteRefs.sourceLock,
    config.bucket)
  const sourceLock = await readRef(sourceLockRef, config.bucket, token, fetchImpl)
  assertSourceLock(sourceLock.value, owner, config, sourceRevision, releaseId)
  // Pre-migration mode is source/build observation only, never migration authority.
  const migrate = mode === 'pre_migration' ? null
    : await readRef(refs.migrate, config.bucket, token, fetchImpl)
  if (owner === 'ai-pdm' && migrate?.value?.schemaVersion === 'aipdm.program-only-baseline-association.v1') fail('RETIRED_RELEASE_MODE')
  if (migrate) assertMigration(migrate.value, owner, config, sourceRevision,
    sourceLock.value.migrationManifestSha256)
  let terminal = null
  let releaseChain = null
  let buildEvidence = null
  if (refs.terminal) {
    terminal = await readRef(refs.terminal, config.bucket, token, fetchImpl)
    assertStage(terminal.value, owner, sourceRevision, releaseId, 'terminal')
    if (terminal.value.facts?.result !== 'RELEASED' ||
        terminal.value.facts?.databaseDisposition !== 'FORWARD_APPLIED' ||
        terminal.value.facts?.remainingHumanAction !== 0 ||
        !terminal.value.facts?.candidateRevision ||
        !/^.+@sha256:[a-f0-9]{64}$/u.test(terminal.value.facts?.artifactDigest ?? '') ||
        !exactKeys(terminal.value.previousReceiptRef, ['uri', 'sha256']) ||
        terminal.value.previousReceiptRef.uri !== `${root}/finalize.json`) {
      fail('TERMINAL_INVALID')
    }
    releaseChain = await readReleasedStageChain({ owner, config,
      revision: sourceRevision, releaseId, root, terminal, prepare, migrate,
      migrationManifestSha256: sourceLock.value.migrationManifestSha256, token, fetchImpl })
    buildEvidence = releaseChain
  } else {
    // A build-only or migration-only observation is not a released application. It
    // still has the immutable owner build/deployment receipts needed to attest
    // the exact image before principal materialization.
    const deployment = await readFixedJson(`${root}/deployment-capsule.json`,
      config.bucket, token, fetchImpl)
    if (owner === 'ai-pdm' && Object.hasOwn(deployment.value, 'programOnlyBaseline')) fail('RETIRED_RELEASE_MODE')
    buildEvidence = await readBuildEvidence({ owner, config,
      revision: sourceRevision, releaseId, root, prepare, deployment,
      artifactDigest: deployment.value?.artifactDigest, token, fetchImpl })
  }
  const object = (readback) => ({ ref: readback.ref.uri,
    sha256: readback.ref.sha256, generation: readback.generation,
    crc32c: readback.crc32c })
  return { owner, sourceRevision, releaseId,
    disposition: terminal ? 'released' : migrate ? 'migration_only' : 'build_only',
    ...(migrate ? {} : { releaseAuthority: false, migrationVerified: false }),
    migrationManifestSha256: sourceLock.value.migrationManifestSha256,
    prepare: object(prepare), sourceLock: object(sourceLock),
    ...(migrate ? { migrate: object(migrate) } : {}),
    artifactDigest: buildEvidence.deployment.value.artifactDigest,
    providerClaim: {
      buildId: buildEvidence.provenance.value.cloudBuild.id,
      sourceObject: buildEvidence.provenance.value.sourceObject,
    },
    ...(terminal ? { terminal: object(terminal),
      candidateRevision: terminal.value.facts.candidateRevision,
      releaseChain: Object.fromEntries(Object.entries(releaseChain)
        .map(([stage, receipt]) => [stage, object(receipt)])) } : {
      buildChain: Object.fromEntries(Object.entries(buildEvidence)
        .map(([stage, receipt]) => [stage, object(receipt)])) }) }
}

/** Independent, read-only Cloud Build and Artifact Registry readback. */
export async function verifyOwnerProviderReadback({ proof, token, fetchImpl = fetch, builderReadback = null }) {
  const config = OWNERS[proof?.owner]
  const claim = proof?.providerClaim
  const source = claim?.sourceObject
  const stored = authenticatedObservations.get(proof)
  const historical = proof?.evidenceScope === 'MIGRATION_INPUT_EQUIVALENT_NO_EXECUTION'
  if (!config || !['released', 'migration_only', 'build_only', 'migration_evidence_only'].includes(proof.disposition) ||
      ((historical || proof.disposition === 'migration_evidence_only') &&
        (!stored || proof.owner !== 'ai-pdm' || proof.migrationVerified !== false || proof.currentDatabaseReadPerformed !== false || proof.databaseLiveState !== 'UNKNOWN' ||
          proof.databaseDisposition !== 'HISTORICAL_EVIDENCE_REUSED' || proof.releaseAuthority !== false)) ||
      (proof.disposition === 'build_only' && (proof.releaseAuthority !== false ||
        proof.migrationVerified !== false || Object.hasOwn(proof, 'migrate') || Object.hasOwn(proof, 'terminal'))) ||
      !H40.test(proof.sourceRevision ?? '') ||
      !RELEASE_ID.test(proof.releaseId ?? '') ||
      typeof proof.artifactDigest !== 'string' ||
      !proof.artifactDigest.startsWith(`${config.artifactUri}@sha256:`) ||
      !H64.test(proof.artifactDigest.slice(`${config.artifactUri}@sha256:`.length)) ||
      !BUILD_ID.test(claim?.buildId ?? '') ||
      !exactKeys(source, ['uri', 'sha256', 'generation', 'crc32c']) ||
      typeof source.uri !== 'string' ||
      !new RegExp(`^gs://${config.bucket}/source/releases/${proof.releaseId}/[a-f0-9]{64}/source\\.tar\\.gz$`, 'u').test(source.uri) ||
      !H64.test(source.sha256) || !/^[1-9][0-9]*$/u.test(source.generation) ||
      typeof token !== 'string' || token.length < 20) fail('PROVIDER_INPUT_INVALID')
  let sourceReadback
  if (stored) {
    const handle = activeEvidence()
    if (handle === undefined || stored.root !== evidenceState(handle).root || stored.root.closed ||
        stored.proofSha256 !== sha256(canonicalize(proof)) ||
        stored.sourceAuthentication.identity !== sourceIdentity(source) || stored.sourceAuthentication.sourceRevision !== proof.sourceRevision ||
        stored.sourceAuthentication.generation !== source.generation || stored.sourceAuthentication.crc32c !== source.crc32c || stored.sourceAuthentication.sha256 !== source.sha256) fail('PROVIDER_SOURCE_MISMATCH')
  } else {
    if (proof.owner === 'ai-pdm' && activeEvidence() !== undefined) fail('PROVIDER_SOURCE_MISMATCH')
    try {
      sourceReadback = await readGcsObject({ uri: source.uri,
        expectedBucket: config.bucket, expectedPrefix: 'source/releases',
        token, fetchImpl })
    } catch { fail('PROVIDER_SOURCE_READBACK_FAILED') }
    if (sourceReadback.generation !== source.generation ||
        sourceReadback.crc32c !== source.crc32c ||
        sha256(sourceReadback.bytes) !== source.sha256) fail('PROVIDER_SOURCE_MISMATCH')
  }
  // Secondary authority is private to these two validated GETs. GCS and every
  // generic transport method continue to use the primary verifier token.
  if (builderReadback !== null && (!stored || proof.owner !== 'ai-pdm' ||
      !exactKeys(builderReadback, ['token', 'actor', 'ownerApplicationId', 'projectId', 'region', 'sourceRevision']) ||
      builderReadback.actor !== 'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' ||
      builderReadback.ownerApplicationId !== 'ai-pdm' || builderReadback.projectId !== PROJECT_ID || builderReadback.region !== 'asia-east1' ||
      builderReadback.sourceRevision !== proof.sourceRevision || typeof builderReadback.token !== 'string' || builderReadback.token.length < 20 ||
      /[\r\n]/u.test(builderReadback.token))) fail('SECONDARY_READBACK_BINDING_INVALID')
  const buildName = expectedBuildName(claim.buildId), buildUrl = `https://cloudbuild.googleapis.com/v1/${buildName}`
  const digest = proof.artifactDigest.slice(config.artifactUri.length + 1)
  const imageName = `projects/jenfu-platform-prod/locations/asia-east1/repositories/${config.artifactRepository}/dockerImages/${config.artifactName}@${digest}`
  const imageUrl = `https://artifactregistry.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/repositories/${config.artifactRepository}/dockerImages/${encodeURIComponent(`${config.artifactName}@${digest}`)}`
  const request = async (url, kind) => {
    if (builderReadback !== null && url !== buildUrl && url !== imageUrl) fail('SECONDARY_READBACK_ROUTE_INVALID')
    let response
    try {
      response = await fetchProviderRead(url, { method: 'GET', redirect: 'error',
        headers: { authorization: `Bearer ${builderReadback?.token ?? token}` } },
      { fetchImpl: scopeFetch(fetchImpl), timeoutMs: 20_000 })
    } catch (error) {
      fail('PROVIDER_READBACK_FAILED', `${kind}:${error?.cause?.code ?? error?.code ?? error?.name ?? 'network'}`)
    }
    if (!response.ok || response.redirected || response.headers.get('location')) fail('PROVIDER_READBACK_FAILED', `${kind}:${response.status}`)
    try { const value = await response.json(); activeEvidence(); return value } catch { fail('PROVIDER_READBACK_INVALID') }
  }
  const build = await request(buildUrl, 'build')
  const imageTag = `${config.artifactUri}:release-${proof.sourceRevision}`
  const storageSource = build?.sourceProvenance?.resolvedStorageSource
  if (!isTargetBuildName(build?.name, claim.buildId) ||
      build?.id !== claim.buildId ||
      build?.projectId !== 'jenfu-platform-prod' || build?.status !== 'SUCCESS' ||
      build?.serviceAccount !==
        `projects/jenfu-platform-prod/serviceAccounts/${config.builder}` ||
      build.options?.requestedVerifyOption !== 'VERIFIED' ||
      storageSource?.bucket !== config.bucket ||
      storageSource?.object !== source.uri.slice(`gs://${config.bucket}/`.length) ||
      String(storageSource?.generation) !== source.generation ||
      !build.results?.images?.some((image) =>
        image.name === imageTag && image.digest === digest)) fail('PROVIDER_BUILD_MISMATCH')
  const image = await request(imageUrl, 'image')
  if (image?.name !== imageName || image?.uri !== proof.artifactDigest) {
    fail('PROVIDER_IMAGE_MISMATCH')
  }
  activeEvidence()
  return { owner: proof.owner, sourceRevision: proof.sourceRevision,
    buildName, sourceGeneration: source.generation,
    artifactDigest: proof.artifactDigest, imageName, status: 'BUILD_IMAGE_VERIFIED',
    ...(proof.disposition === 'build_only' ? { disposition: 'build_only',
      releaseAuthority: false, migrationVerified: false } : historical ? {
      disposition: proof.disposition, releaseAuthority: false, migrationVerified: false,
      currentDatabaseReadPerformed: false, databaseLiveState: 'UNKNOWN', evidenceScope: proof.evidenceScope,
      databaseDisposition: 'HISTORICAL_EVIDENCE_REUSED' } : {}) }
}

export function assertOwnerReleaseRefSet(owner, refs, mode = 'post_migration') {
  const config = OWNERS[owner]
  if (!['post_migration','pre_migration'].includes(mode) ||
      (mode === 'pre_migration' && (refs?.migrate !== null || refs?.terminal !== null)) ||
      !config || !exactKeys(refs, ['prepare', 'migrate', 'terminal']) ||
      (refs.terminal !== null && !exactKeys(refs.terminal, ['uri', 'sha256']))) {
    fail('INPUT_INVALID')
  }
  const rootMatch = new RegExp(`^gs://${config.bucket}/receipts/releases/([A-Z0-9][A-Z0-9-]{5,63})/([a-f0-9]{64})/prepare\\.json$`, 'u')
    .exec(refs.prepare?.uri ?? '')
  if (!rootMatch || !RELEASE_ID.test(rootMatch[1]) || !H64.test(rootMatch[2])) fail('REF_INVALID')
  const releaseId = rootMatch[1]
  const root = `gs://${config.bucket}/receipts/releases/${releaseId}/${rootMatch[2]}`
  assertRef(refs.prepare, config.bucket, `${root}/prepare.json`)
  if (mode === 'post_migration') assertRef(refs.migrate, config.bucket, `${root}/migrate.json`)
  if (refs.terminal) assertRef(refs.terminal, config.bucket, `${root}/terminal.json`)
  return { releaseId, root }
}
