import { gunzipSync } from 'node:zlib'
import { AsyncLocalStorage } from 'node:async_hooks'
import { canonicalize, readGcsObject, sha256, parseGsUri, crc32cBase64 } from './dev012-production-migration-runner.mjs'

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

function fail(code) { throw new Error(`DEV121_OWNER_RELEASE_PROOF_${code}`) }
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
const PROFILE_PATH = 'config/release/dev117-ai-pdm-independent-production-v3.json'
const AI_BUCKET = 'jenfu-platform-prod-aipdm-release'
const authenticatedSources = new WeakMap()
const validatedContents = new WeakMap()
const evidenceScope = new AsyncLocalStorage()
const evidenceHandles = new WeakMap()
const authenticatedObservations = new WeakMap()
const B14_SOURCE = '54d3c4c3fab41abf2045b025c90ca03d575e81f6'
const B14_CAPSULE_SHA = 'd746fbe757f4e828b15bd5dab0fd93d6507d004d1ae9cc2ed8b141ab2251cddb'
const B14_ROOT = `gs://${AI_BUCKET}/receipts/releases/DEV122-OPENSWX-20261007-B14/${B14_CAPSULE_SHA}`
/** These historical identities are evidence pins, never a live deadline or DB claim. */
export function assertAiPdmHistoricalMigration(original) {
  if (!original?.intentRef || !original.migrationRef || !original.bundleRef || !original.migration || !original.content) fail('REPAIR_ORIGINAL_HISTORY_INVALID')
  sameProof(original.intentRef, { uri: `gs://${AI_BUCKET}/receipts/releases/DEV122-OPENSWX-20261007-B14/release-intent.json`, sha256: B14_CAPSULE_SHA })
  sameProof(original.migrationRef, { uri: `${B14_ROOT}/migrate.json`, sha256: '000780d1b9dcbebe609c15f78ee7f034e97d0f2cbdea86a7b2814be85b3c668b' })
  sameProof(original.bundleRef, { uri: `gs://${AI_BUCKET}/source/migration-bundles/${B14_SOURCE}/21327bf92896b0112d3a1fd02815efed461577344347cb6e856564da11c15bd3.json`, sha256: '12e3d0983e89fe11a90597da9a2d4b0b19232a31a29b10745f58f4b709c6bb59' })
  sameProof(original.deploymentRef, { uri: `${B14_ROOT}/deployment-capsule.json`, sha256: '778796767ae7cd592aaacc678d1cd8ce90f3e0967fc01b847f64679ae82fca4c' })
  sameProof(original.candidateRef, { uri: `${B14_ROOT}/candidate.json`, sha256: 'c643dd42e99bc3ac8803aef7b897109c0bbec45ae8828b48aaba78e46a2c027f' })
  if (original.intent.sourceRevision !== B14_SOURCE || original.bundle.entries.length !== 32 || original.bundle.baselineCount !== 15 || !original.candidateRef ||
      original.migration.sourceRevision !== B14_SOURCE || original.migration.ledgerCount !== 32 || original.migration.applied !== 0 || original.migration.replayed !== 32 || original.migration.baselineCount !== 15 ||
      original.migration.minimumLedgerCount !== 0 || canonicalize(original.migration.ledgerBootstrap) !== canonicalize({ enabled: true, created: false }) ||
      original.migration.executionName !== 'ai-pdm-prod-migration-runner-bn4tg' || original.migration.startedAt !== '2026-10-07T12:12:31.055Z' || original.migration.completedAt !== '2026-10-07T12:12:31.247Z' ||
      !validatedContents.has(original.content)) fail('REPAIR_ORIGINAL_HISTORY_INVALID')
  return original
}
function evidenceState(handle) {
  const state = evidenceHandles.get(handle)
  if (!state || state.root.closed) fail('CONTEXT_INVALID')
  const now = Date.now(), monotonic = performance.now()
  if (!Number.isFinite(now) || !Number.isFinite(monotonic) || now < state.root.lastWallMs ||
      now >= state.root.expiresAtMs || monotonic < state.root.startedMonotonicMs ||
      monotonic - state.root.startedMonotonicMs >= 600000) {
    state.root.closed = true; state.root.memo.clear(); state.root.sourceAdmissions.clear()
    fail('OBSERVATION_EXPIRED')
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
export function createAiPdmEvidenceContext() {
  const active = activeEvidence()
  if (active !== undefined) return active
  const now = Date.now(), monotonic = performance.now()
  if (!Number.isFinite(now) || !Number.isFinite(monotonic)) fail('CONTEXT_INVALID')
  const root = { startedAtMs: now, startedMonotonicMs: monotonic, expiresAtMs: now + 600000,
    lastWallMs: now, closed: false, hashes: new Map(), memo: new Map(), sourceAdmissions: new Set() }
  return mintEvidenceHandle({ root, depth: 0, ancestors: new Set(), parent: null })
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
    if (owns) { state.root.closed = true; state.root.memo.clear(); state.root.sourceAdmissions.clear() }
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
  return mintEvidenceHandle({ root: state.root, parent: handle, nodeRef: { ...ref }, depth: state.depth + Number(transition), ancestors: new Set([...state.ancestors, ref.uri]) })
}
export async function readAiPdmEvidenceLeaf({ ref, kind = 'receipt', generation = null, crc32c = null, sourceRevision = null, read }) {
  const parent = activeEvidence()
  if (parent === undefined || typeof read !== 'function') fail('CONTEXT_INVALID')
  const parentState = evidenceState(parent)
  const child = canonicalize(parentState.nodeRef) === canonicalize(ref) ? parent : descendAiPdmEvidenceContext(parent, ref)
  return runAiPdmEvidenceContext(child, async () => {
    const state = evidenceState(child)
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
    state.root.memo.set(key, Buffer.from(bytes))
    return Buffer.from(bytes)
  })
}
export function admitAiPdmEvidenceSource({ bytes, ref }) {
  const handle = activeEvidence()
  if (handle === undefined || !Buffer.isBuffer(bytes) || sha256(bytes) !== ref?.sha256) fail('CONTEXT_SOURCE_INVALID')
  assertAiReleaseRef(ref)
  let value
  try { value = JSON.parse(strictUtf8(bytes)) } catch { fail('CONTEXT_SOURCE_INVALID') }
  assertSourceLock(value, 'ai-pdm', OWNERS['ai-pdm'], value.sourceRevision, value.releaseId)
  evidenceState(handle).root.sourceAdmissions.add(value.sourceRevision)
  return value.sourceRevision
}
function observationDeadline() {
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
        abort = () => reject(new Error('DEV121_OWNER_RELEASE_PROOF_ARCHIVE_DEADLINE'))
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
  const request = async (url, cap, timeout) => {
    archiveDeadline(deadlineAt)
    const signal = AbortSignal.timeout(Math.max(1, Math.min(timeout, Date.parse(deadlineAt) - Date.now())))
    const response = await scopeFetch(fetchImpl)(url, { method: 'GET', headers, redirect: 'error', signal })
    const bytes = await boundedResponse(response, cap, signal)
    archiveDeadline(deadlineAt)
    return bytes
  }
  let metadata
  try { metadata = JSON.parse(strictUtf8(await request(base, 65536, 20000))) }
  catch (error) { if (error.message?.startsWith('DEV121_')) throw error; fail('ARCHIVE_METADATA_INVALID') }
  if (metadata?.bucket !== ref.bucket || metadata.name !== ref.object ||
      String(metadata.generation) !== source.generation || metadata.crc32c !== source.crc32c ||
      !/^[1-9][0-9]*$/u.test(String(metadata.size ?? '')) ||
      !Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size) > ARCHIVE_LIMIT) fail('ARCHIVE_METADATA_INVALID')
  const bytes = await request(`${base}?alt=media&generation=${encodeURIComponent(source.generation)}`, Number(metadata.size), 30000)
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
  const core = { ...bundle }; delete core.manifestSha256
  if (!exactKeys(bundle, keys) || bundle.schemaVersion !== 'jenfu.dev012.migration-bundle.v1' || bundle.ownerApplicationId !== 'ai-pdm' || bundle.sourceRevision !== sourceRevision ||
      bundle.projectId !== PROJECT_ID || bundle.region !== 'asia-east1' || bundle.database !== 'jenfu_prod' || bundle.ledger !== 'ai_pdm_core.schema_migrations' || bundle.baselineCount !== 15 ||
      !H64.test(bundle.manifestSha256 ?? '') || sha256(canonicalize(core)) !== bundle.manifestSha256 || !Array.isArray(bundle.entries) || ![32, 33].includes(bundle.entries.length)) fail('ARCHIVE_BUNDLE_INVALID')
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
  if (bundle.entries.length === 33 && (bundle.entries[32].path !== 'db/postgres/083_dev121_authorized_first_login_account.sql' ||
      bundle.entries[32].sourceSha256 !== 'a99df76b8fc146a916930a05286433568aa432710d2a6eccc1c47f08ba780da9' ||
      bundle.entries[32].version !== 'ai-pdm-083' || bundle.entries[32].name !== 'dev121_authorized_first_login_account' ||
      bundle.entries[32].appliedSha256 !== '8f6ed9bafe7af906bcae7a94df59a07bbb98cab27402e75ea9162b85a3ec9b8a')) fail('ARCHIVE_BUNDLE_INVALID')
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
export function assertAiPdmMigrationEquivalent(original, current) {
  for (const value of [original, current]) {
    const stored = validatedContents.get(value)
    if (!stored || value.orderedEntriesSha256 !== stored.orderedEntriesSha256 || value.profileMigrationsSha256 !== stored.profileMigrationsSha256 || canonicalize(value.migrations) !== stored.migrations ||
        !(value.files instanceof Map) || canonicalize([...value.files].map(([name, bytes]) => [name, sha256(bytes)])) !== stored.files) fail('MIGRATION_INPUT_NOT_EQUIVALENT')
  }
  if (!validatedContents.has(original) || !validatedContents.has(current) || original?.orderedEntriesSha256 !== current?.orderedEntriesSha256 || original?.profileMigrationsSha256 !== current?.profileMigrationsSha256 ||
      canonicalize(original?.migrations) !== canonicalize(current?.migrations)) fail('MIGRATION_INPUT_NOT_EQUIVALENT')
  return { orderedEntriesSha256: current.orderedEntriesSha256, profileMigrationsSha256: current.profileMigrationsSha256 }
}
/** Classify authenticated content only; a repair worker does not imply migration reuse. */
export function assertAiPdmRepairMigrationMode(original, current) {
  // Revalidate both brands and their exposed bytes before considering a prefix.
  assertAiPdmMigrationEquivalent(original, original)
  assertAiPdmMigrationEquivalent(current, current)
  const before = validatedContents.get(original), after = validatedContents.get(current)
  if (before.entries.length !== 32) fail('MIGRATION_HISTORICAL_PREFIX_INVALID')
  if (after.entries.length === 32) {
    assertAiPdmMigrationEquivalent(original, current)
    return 'HISTORICAL_EVIDENCE_REUSED'
  }
  const historicalProfile = { ...original.migrations }; delete historicalProfile.entries
  const currentProfile = { ...current.migrations }; delete currentProfile.entries
  if (after.entries.length !== 33 || canonicalize(after.entries.slice(0, 32)) !== canonicalize(before.entries) ||
      canonicalize(current.migrations.entries.slice(0, 32)) !== canonicalize(original.migrations.entries) ||
      canonicalize(currentProfile) !== canonicalize(historicalProfile)) fail('MIGRATION_HISTORICAL_PREFIX_INVALID')
  return 'FORWARD_APPLIED'
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
const PREREQUISITE_KEYS = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'releaseCapsuleRef', 'sourceLockRef', 'workerDescriptorRef', 'pausedBaselineRef', 'servingCapsuleRef', 'historicalCapsuleRef', 'historicalDeploymentRef', 'historicalCandidateRef', 'historicalMigrationReceiptRef', 'historicalMigrationBundleRef', 'currentMigrationBundleSha256', 'currentMigrationManifestSha256', 'historicalMigrationManifestSha256', 'orderedEntriesSha256', 'profileMigrationsSha256', 'entryCount', 'baselineCount', 'historicalLedgerCount', 'historicalCompletedAt', 'status', 'databaseLiveState', 'migrationExecutionPolicy', 'observedAt', 'deadlineAt', 'receiptSha256', 'actor', 'ownerRunRef']
const MIGRATION_ASSOCIATION_KEYS = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'releaseCapsuleRef', 'deploymentCapsuleRef', 'prerequisiteRef', 'migrationBundleRef', 'historicalMigrationReceiptRef', 'manifestSha256', 'status', 'evidenceScope', 'databaseDisposition', 'migrationJobSubmitted', 'migrationJobSubmissions', 'currentDatabaseReadPerformed', 'databaseLiveState', 'observedAt', 'deadlineAt', 'receiptSha256', 'actor', 'ownerRunRef']
function sameProof(a, b) { if (canonicalize(a) !== canonicalize(b)) fail('REPAIR_JOIN_INVALID') }
function assertAiReleaseRef(ref) {
  assertRef(ref, AI_BUCKET)
  const relative = ref.uri.slice(`gs://${AI_BUCKET}/receipts/`.length)
  if (!/^[A-Za-z0-9._/-]+\.json$/u.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('REPAIR_REF_INVALID')
}
function assertAiWorkerRef(ref) {
  assertAiReleaseRef(ref)
  if (!ref.uri.startsWith(`gs://${AI_BUCKET}/receipts/dev-122/openswx-worker/`)) fail('REPAIR_REF_INVALID')
}
function assertRepairEvidenceBase(value, keys, intent, intentRef, actor) {
  if (!exactKeys(value, keys) || value.ownerApplicationId !== 'ai-pdm' || value.releaseId !== intent.releaseId || value.sourceRevision !== intent.sourceRevision ||
      !H40.test(value.sourceRevision ?? '') || !RELEASE_ID.test(value.releaseId ?? '') || value.deadlineAt !== intent.deadlineAt ||
      !Number.isFinite(Date.parse(value.deadlineAt)) || !Number.isFinite(Date.parse(value.observedAt)) || Date.parse(value.observedAt) > Date.now() || Date.parse(value.observedAt) >= Date.parse(value.deadlineAt) ||
      value.actor !== `${actor}@jenfu-platform-prod.iam.gserviceaccount.com` ||
      !/^https:\/\/api\.github\.com\/repos\/jedchang0308-jenfu\/AI-PDM\/actions\/runs\/[1-9][0-9]*$/u.test(value.ownerRunRef ?? '') ||
      value.receiptSha256 !== receiptHash(value)) fail('REPAIR_EVIDENCE_INVALID')
  assertAiReleaseRef(intentRef); sameProof(value.releaseCapsuleRef, intentRef)
  if (intentRef.uri !== `gs://${AI_BUCKET}/receipts/releases/${intent.releaseId}/release-intent.json` ||
      Object.hasOwn(intent, 'principalOnlyRecovery') || Object.hasOwn(intent, 'principalOnlyFenceRef')) fail('REPAIR_CAPSULE_INVALID')
}
export function assertPausedMigrationPrerequisite(value, { intent, intentRef, descriptor, descriptorRef }) {
  assertRepairEvidenceBase(value, PREREQUISITE_KEYS, intent, intentRef, 'aipdm-prod-verifier')
  if (value.schemaVersion !== 'aipdm.paused-app-repair-migration-prerequisite.v1' || value.status !== 'KNOWN_HISTORICAL_PREREQUISITE' || value.databaseLiveState !== 'UNKNOWN' ||
      value.migrationExecutionPolicy !== 'NO_JOB_SUBMISSION' || value.entryCount !== 32 || value.baselineCount !== 15 || value.historicalLedgerCount !== 32 ||
      !Number.isFinite(Date.parse(value.historicalCompletedAt)) || Date.parse(value.historicalCompletedAt) > Date.parse(value.observedAt) ||
      descriptor?.schemaVersion !== 'aipdm.openswx-worker-descriptor.v3' || descriptor.purpose !== 'full' || descriptor.artifactMode !== 'REUSE_VERIFIED' || descriptor.releaseVariant !== 'PAUSED_APP_REPAIR') fail('REPAIR_PREREQUISITE_INVALID')
  for (const name of ['releaseCapsuleRef', 'sourceLockRef', 'servingCapsuleRef', 'historicalCapsuleRef', 'historicalDeploymentRef', 'historicalCandidateRef', 'historicalMigrationReceiptRef']) assertAiReleaseRef(value[name])
  for (const name of ['workerDescriptorRef', 'pausedBaselineRef']) assertAiWorkerRef(value[name])
  sameProof(value.sourceLockRef, intent.sourceLockRef); sameProof(value.workerDescriptorRef, descriptorRef); sameProof(descriptorRef, intent.openswxWorkerRef)
  sameProof(value.pausedBaselineRef, descriptor.pausedBaselineRef)
  for (const name of ['currentMigrationBundleSha256', 'currentMigrationManifestSha256', 'historicalMigrationManifestSha256', 'orderedEntriesSha256', 'profileMigrationsSha256']) if (!H64.test(value[name] ?? '')) fail('REPAIR_PREREQUISITE_INVALID')
  if (value.currentMigrationManifestSha256 !== intent.migrationManifestSha256 || !exactKeys(value.historicalMigrationBundleRef, ['uri', 'sha256']) ||
      !H64.test(value.historicalMigrationBundleRef.sha256 ?? '') || !new RegExp(`^gs://${AI_BUCKET}/source/migration-bundles/[a-f0-9]{40}/${value.historicalMigrationManifestSha256}\\.json$`, 'u').test(value.historicalMigrationBundleRef.uri ?? '')) fail('REPAIR_PREREQUISITE_INVALID')
  return value
}
export function assertPausedMigrationAssociation(value, { intent, intentRef, prerequisite, prerequisiteRef, deployment, deploymentRef }) {
  assertRepairEvidenceBase(value, MIGRATION_ASSOCIATION_KEYS, intent, intentRef, 'aipdm-prod-deployer')
  if (value.schemaVersion !== 'aipdm.paused-app-repair-migration-association.v1' || value.status !== 'HISTORICAL_EVIDENCE_REUSED' || value.evidenceScope !== 'MIGRATION_INPUT_EQUIVALENT_NO_EXECUTION' ||
      value.databaseDisposition !== 'HISTORICAL_EVIDENCE_REUSED' || value.migrationJobSubmitted !== false || value.migrationJobSubmissions !== 0 || value.currentDatabaseReadPerformed !== false ||
      value.databaseLiveState !== 'UNKNOWN' || value.manifestSha256 !== intent.migrationManifestSha256 || value.manifestSha256 !== prerequisite.currentMigrationManifestSha256 ||
      deployment.sourceRevision !== intent.sourceRevision || deployment.deadlineAt !== intent.deadlineAt || deployment.releaseIntentSha256 !== intentRef.sha256) fail('REPAIR_MIGRATION_ASSOCIATION_INVALID')
  for (const name of ['releaseCapsuleRef', 'deploymentCapsuleRef', 'prerequisiteRef', 'historicalMigrationReceiptRef']) assertAiReleaseRef(value[name])
  sameProof(value.deploymentCapsuleRef, deploymentRef); sameProof(value.prerequisiteRef, prerequisiteRef)
  sameProof(value.historicalMigrationReceiptRef, prerequisite.historicalMigrationReceiptRef); sameProof(value.migrationBundleRef, deployment.migrationBundleRef)
  sameProof(deployment.releaseIntentRef, intentRef)
  if (value.migrationBundleRef?.sha256 !== prerequisite.currentMigrationBundleSha256 ||
      value.migrationBundleRef.uri !== `gs://${AI_BUCKET}/source/migration-bundles/${intent.sourceRevision}/${intent.migrationManifestSha256}.json`) fail('REPAIR_MIGRATION_ASSOCIATION_INVALID')
  return value
}
const REPAIR_DESCRIPTOR_KEYS = ['schemaVersion', 'ownerApplicationId', 'sourceRevision', 'sourceArchiveSha256', 'workerProfileSha256', 'resourcePlanHash', 'purpose', 'artifactMode', 'releaseVariant', 'projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'normalTemplatePolicySha256', 'selftestTemplatePolicySha256', 'dispatchPolicy', 'bounds', 'receiptRoot', 'workerBuildRef', 'pausedBaselineRef', 'priorActivationRef', 'retainedWorkerDescriptorRef', 'tokenSecretVersion', 'registrySecretVersion']
function assertObservationDescriptor(value, intent) {
  const bounds = { cpu: '1', memory: '1Gi', taskCount: 1, parallelism: 1, timeoutSeconds: 300, maxRetries: 0, schedule: '*/5 * * * *', schedulerRetryCount: 0, schedulerAttemptDeadlineSeconds: 30, recoverDeadlineSeconds: 20, ownerDeadlineSeconds: 600, pollMilliseconds: 1000, maxExecutionPages: 4, maxLogPages: 4, maxLogEntries: 100, proofFreshnessSeconds: 60 }
  if (!exactKeys(value, REPAIR_DESCRIPTOR_KEYS) || value.schemaVersion !== 'aipdm.openswx-worker-descriptor.v3' || value.ownerApplicationId !== 'ai-pdm' || value.sourceRevision !== intent.sourceRevision || value.purpose !== 'full' ||
      value.artifactMode !== 'REUSE_VERIFIED' || value.releaseVariant !== 'PAUSED_APP_REPAIR' || value.projectId !== PROJECT_ID || value.location !== 'asia-east1' ||
      value.jobId !== 'ai-pdm-prod-openswx-metadata' || value.readerServiceAccount !== 'aipdm-prod-openswx-reader@jenfu-platform-prod.iam.gserviceaccount.com' ||
      value.schedulerId !== 'aipdm-prod-openswx-dispatch' || value.dispatchServiceAccount !== 'aipdm-prod-openswx-dispatch@jenfu-platform-prod.iam.gserviceaccount.com' || value.dispatchPolicy !== 'scheduler_only.v1' ||
      value.receiptRoot !== `gs://${AI_BUCKET}/receipts/dev-122/openswx-worker` || canonicalize(value.bounds) !== canonicalize(bounds) ||
      !/^projects\/9536592944\/secrets\/aipdm-prod-openswx-reader-token\/versions\/[1-9][0-9]*$/u.test(value.tokenSecretVersion ?? '') ||
      !/^projects\/9536592944\/secrets\/aipdm-prod-workload-auth-credentials\/versions\/[1-9][0-9]*$/u.test(value.registrySecretVersion ?? '')) fail('REPAIR_DESCRIPTOR_INVALID')
  for (const key of ['sourceArchiveSha256', 'workerProfileSha256', 'resourcePlanHash', 'normalTemplatePolicySha256', 'selftestTemplatePolicySha256']) if (!H64.test(value[key] ?? '')) fail('REPAIR_DESCRIPTOR_INVALID')
  for (const key of ['workerBuildRef', 'pausedBaselineRef', 'priorActivationRef', 'retainedWorkerDescriptorRef']) assertAiWorkerRef(value[key])
  const policy = mode => {
    const template = observationTemplate(`asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-openswx-worker@sha256:${'0'.repeat(64)}`, 'projects/9536592944/secrets/aipdm-prod-openswx-reader-token/versions/1', mode === 'selftest')
    template.template.containers[0].image = 'WORKER_IMAGE_DIGEST'
    for (const env of template.template.containers[0].env) if (env.valueSource) env.valueSource.secretKeyRef.version = 'TOKEN_NUMERIC_VERSION'
    return sha256(canonicalize({ schemaVersion: 'aipdm.openswx-template-policy.v1', mode, template }))
  }
  if (value.workerProfileSha256 !== '65d6530a0f1e713c7936bdb0889bb529742334a530b20b6e8bf18ea81a7461dc' || value.normalTemplatePolicySha256 !== policy('normal') || value.selftestTemplatePolicySha256 !== policy('selftest')) fail('REPAIR_DESCRIPTOR_INVALID')
  return value
}
function observationTemplate(image, token, selftest = false) {
  return { taskCount: 1, parallelism: 1, template: { serviceAccount: 'aipdm-prod-openswx-reader@jenfu-platform-prod.iam.gserviceaccount.com', timeout: '300s', maxRetries: 0,
    containers: [{ image, command: ['/usr/local/bin/node', '/worker/scripts/run-openswx-metadata-job.mjs'], args: selftest ? ['--isolation-self-test-only'] : [], env: selftest ? [] : [
      { name: 'PDM_OPENSWX_APP_ORIGIN', value: 'https://ai-pdm-prod-9536592944.asia-east1.run.app' },
      { name: 'PDM_OPENSWX_READER_TOKEN', valueSource: { secretKeyRef: { secret: 'aipdm-prod-openswx-reader-token', version: token.split('/').at(-1) } } }], resources: { limits: { cpu: '1', memory: '1Gi' } } }] } }
}
function assertObservationSnapshot(value, descriptor) {
  const keys = ['jobName', 'jobEtag', 'jobGeneration', 'normalTemplateSha256', 'image', 'numericCredentials', 'secretMetadata', 'schedulerState', 'schedulerPolicySha256', 'schedulerUserUpdateTime', 'iamSha256', 'executions']
  if (!exactKeys(value, keys) || value.jobName !== 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata' || typeof value.jobEtag !== 'string' || !value.jobEtag || !/^[1-9][0-9]*$/u.test(value.jobGeneration ?? '') ||
      value.schedulerState !== 'PAUSED' || !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-openswx-worker@sha256:[a-f0-9]{64}$/u.test(value.image ?? '') ||
      value.normalTemplateSha256 !== sha256(canonicalize(observationTemplate(value.image, descriptor.tokenSecretVersion))) || !H64.test(value.schedulerPolicySha256 ?? '') || !H64.test(value.iamSha256 ?? '') ||
      (value.schedulerUserUpdateTime !== null && !Number.isFinite(Date.parse(value.schedulerUserUpdateTime))) || !Array.isArray(value.secretMetadata) || value.secretMetadata.length !== 2 || !Array.isArray(value.executions) || value.executions.length > 400) fail('REPAIR_BASELINE_INVALID')
  sameProof(value.numericCredentials, { token: descriptor.tokenSecretVersion, registry: descriptor.registrySecretVersion })
  for (const [index, row] of value.secretMetadata.entries()) if (!exactKeys(row, ['name', 'state', 'etag']) || row.name !== [descriptor.tokenSecretVersion, descriptor.registrySecretVersion][index] || row.state !== 'ENABLED' || typeof row.etag !== 'string' || !row.etag) fail('REPAIR_BASELINE_INVALID')
  const names = new Set()
  for (const row of value.executions) {
    if (!exactKeys(row, ['name', 'createTime', 'completionTime', 'completedState', 'rawPageRef']) || !/^projects\/9536592944\/locations\/asia-east1\/jobs\/ai-pdm-prod-openswx-metadata\/executions\/[a-z][a-z0-9-]{0,62}$/u.test(row.name ?? '') || names.has(row.name) ||
        !Number.isFinite(Date.parse(row.createTime)) || !Number.isFinite(Date.parse(row.completionTime)) || Date.parse(row.completionTime) < Date.parse(row.createTime) || !['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(row.completedState)) fail('REPAIR_BASELINE_INVALID')
    names.add(row.name); assertAiWorkerRef(row.rawPageRef)
  }
}
function assertObservationBaseline(value, descriptor, intent) {
  const keys = ['schemaVersion', 'ownerApplicationId', 'purpose', 'status', 'evidenceScope', 'inputRef', 'source', 'priorActivationRef', 'retainedWorkerDescriptorRef', 'predecessorBaselineRef', 'servingApp', 'actor', 'observationStartedAt', 'observationCompletedAt', 'observedAt', 'pauseFenceSeconds', 'before', 'after', 'providerReadbackRefs', 'resourcesUnchanged', 'mutationPerformed', 'providerQuiescenceProven', 'dbAdmissionProof', 'continuationDepth']
  if (!exactKeys(value, keys) || value.schemaVersion !== 'aipdm.openswx-paused-app-repair-baseline.v1' || value.ownerApplicationId !== 'ai-pdm' || value.status !== 'PASS' || value.purpose !== 'PAUSED_APP_REPAIR' || value.evidenceScope !== 'PRODUCTION_PROVIDER_READBACK' ||
      value.actor !== 'jedchang0308@jenfu.com.tw' || value.pauseFenceSeconds !== 55 || value.resourcesUnchanged !== true || value.mutationPerformed !== false || value.providerQuiescenceProven !== true || value.dbAdmissionProof !== 'NOT_YET_PROVEN' ||
      !Number.isInteger(value.continuationDepth) || value.continuationDepth < 1 || value.continuationDepth > 8 || !Number.isFinite(Date.parse(value.observationStartedAt)) || !Number.isFinite(Date.parse(value.observationCompletedAt)) || !Number.isFinite(Date.parse(value.observedAt)) ||
      Date.parse(value.observationCompletedAt) - Date.parse(value.observationStartedAt) < 55000 || Date.parse(value.observedAt) < Date.parse(value.observationCompletedAt) || Date.parse(value.observedAt) - Date.parse(value.observationStartedAt) > 600000) fail('REPAIR_BASELINE_INVALID')
  sameProof(value.source, { sourceRevision: intent.sourceRevision, sourceArchiveSha256: descriptor.sourceArchiveSha256, sourceLockRef: intent.sourceLockRef, workerProfileSha256: descriptor.workerProfileSha256, resourcePlanHash: descriptor.resourcePlanHash })
  assertAiWorkerRef(value.inputRef); sameProof(value.priorActivationRef, descriptor.priorActivationRef); sameProof(value.retainedWorkerDescriptorRef, descriptor.retainedWorkerDescriptorRef)
  if (value.predecessorBaselineRef !== null) assertAiWorkerRef(value.predecessorBaselineRef)
  assertObservationSnapshot(value.before, descriptor); assertObservationSnapshot(value.after, descriptor)
  const projection = snapshot => ({ ...snapshot, executions: snapshot.executions.map(({ rawPageRef: _ref, ...row }) => row).sort((a, b) => a.name.localeCompare(b.name)) })
  sameProof(projection(value.before), projection(value.after))
  const serving = value.servingApp
  if (!exactKeys(serving, ['capsuleRef', 'canonicalRef', 'finalizeRef', 'terminalRef', 'runtimeConfigRef', 'workerDescriptorRef', 'sourceRevision', 'revision', 'artifactDigest', 'workerStatus', 'serviceEtag', 'generalTrafficPercent', 'tagCount', 'canonicalOrigin']) || !H40.test(serving.sourceRevision ?? '') ||
      !/^ai-pdm-prod-[a-f0-9]{12}$/u.test(serving.revision ?? '') || !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm@sha256:[a-f0-9]{64}$/u.test(serving.artifactDigest ?? '') ||
      typeof serving.serviceEtag !== 'string' || !serving.serviceEtag || serving.generalTrafficPercent !== 100 || serving.tagCount !== 0 || serving.canonicalOrigin !== 'https://ai-pdm-prod-9536592944.asia-east1.run.app' ||
      !['READY', 'ACTIVATION_PENDING'].includes(serving.workerStatus) || (serving.workerStatus === 'READY' && (value.predecessorBaselineRef !== null || value.continuationDepth !== 1)) || (serving.workerStatus === 'ACTIVATION_PENDING' && value.predecessorBaselineRef === null)) fail('REPAIR_BASELINE_INVALID')
  for (const key of ['capsuleRef', 'canonicalRef', 'finalizeRef', 'terminalRef', 'runtimeConfigRef']) assertAiReleaseRef(serving[key])
  assertAiWorkerRef(serving.workerDescriptorRef)
  if (!Array.isArray(value.providerReadbackRefs) || !value.providerReadbackRefs.length || value.providerReadbackRefs.length > 64) fail('REPAIR_BASELINE_INVALID')
  const ids = new Set()
  for (const row of value.providerReadbackRefs) {
    if (!exactKeys(row, ['id', 'api', 'method', 'url', 'observedAt', 'bodyRef']) || typeof row.id !== 'string' || !row.id || ids.has(row.id) || !['RUN_JOB', 'RUN_EXECUTIONS_PAGE', 'SCHEDULER_JOB', 'SECRET_TOKEN_VERSION_METADATA', 'SECRET_REGISTRY_VERSION_METADATA', 'OWN_RESOURCE_POLICY', 'APP_SERVICE', 'APP_REVISION'].includes(row.api) ||
        !['GET', 'POST'].includes(row.method) || !/^https:\/\/(?:run|cloudscheduler|secretmanager|iam|cloudresourcemanager)\.googleapis\.com\/v[12]\//u.test(row.url ?? '') || !Number.isFinite(Date.parse(row.observedAt)) || Date.parse(row.observedAt) < Date.parse(value.observationStartedAt) || Date.parse(row.observedAt) > Date.parse(value.observedAt)) fail('REPAIR_BASELINE_INVALID')
    ids.add(row.id); assertAiWorkerRef(row.bodyRef)
  }
}
/** Validate every sealed page and both provider snapshots, including empty inventories. */
export function assertAiPdmPausedRepairReadbacks({ baseline, records }) {
  if (!Array.isArray(records) || records.length !== baseline.providerReadbackRefs.length) fail('REPAIR_BASELINE_RAW_INVALID')
  for (const [index, row] of records.entries()) {
    if (!exactKeys(row, ['record', 'body']) || canonicalize(row.record) !== canonicalize(baseline.providerReadbackRefs[index])) fail('REPAIR_BASELINE_RAW_INVALID')
  }
  const workerRows = records.filter(row => !['APP_SERVICE', 'APP_REVISION'].includes(row.record.api))
  const starts = workerRows.flatMap((row, index) => row.record.api === 'RUN_JOB' && workerRows[index + 1]?.record.api === 'SCHEDULER_JOB' ? [index] : [])
  if (starts.length !== 2 || starts[0] !== 0 || Date.parse(workerRows[starts[1]].record.observedAt) - Date.parse(workerRows[starts[0]].record.observedAt) < 55_000) fail('REPAIR_BASELINE_RAW_INVALID')
  const jobName = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata'
  const normalizeName = name => name?.replace('projects/9536592944/', 'projects/jenfu-platform-prod/')
  const normalizeExecutionName = name => name?.replace('projects/jenfu-platform-prod/', 'projects/9536592944/')
  for (const [index, snapshot] of [baseline.before, baseline.after].entries()) {
    const rows = workerRows.slice(starts[index], starts[index + 1] ?? workerRows.length), byApi = api => rows.filter(row => row.record.api === api)
    if (byApi('RUN_JOB').length !== 2 || byApi('SCHEDULER_JOB').length !== 1 || byApi('SECRET_TOKEN_VERSION_METADATA').length !== 1 || byApi('SECRET_REGISTRY_VERSION_METADATA').length !== 1) fail('REPAIR_BASELINE_RAW_INVALID')
    for (const { record, body: job } of byApi('RUN_JOB')) {
      const template = structuredClone(job.template), task = template?.template
      if (!task) fail('REPAIR_BASELINE_RAW_INVALID')
      if (task.executionEnvironment === 'EXECUTION_ENVIRONMENT_GEN2') delete task.executionEnvironment
      for (const container of task.containers ?? []) { if (container.env === undefined) container.env = []; if (container.args === undefined) container.args = [] }
      if (record.method !== 'GET' || record.url !== `https://run.googleapis.com/v2/${jobName}` || normalizeName(job.name) !== jobName || job.etag !== snapshot.jobEtag
        || String(job.generation) !== snapshot.jobGeneration || String(job.observedGeneration) !== snapshot.jobGeneration || (Object.hasOwn(job, 'reconciling') && job.reconciling !== false)
        || job.terminalCondition?.state !== 'CONDITION_SUCCEEDED' || sha256(canonicalize(template)) !== snapshot.normalTemplateSha256) fail('REPAIR_BASELINE_RAW_INVALID')
    }
    const { record: schedulerRecord, body: scheduler } = byApi('SCHEDULER_JOB')[0]
    const schedulerPolicy = { name: scheduler.name, state: scheduler.state, schedule: scheduler.schedule, timeZone: scheduler.timeZone, attemptDeadline: scheduler.attemptDeadline,
      httpTarget: scheduler.httpTarget, retryConfig: scheduler.retryConfig ?? {}, userUpdateTime: scheduler.userUpdateTime ?? null }
    if (schedulerRecord.method !== 'GET' || schedulerRecord.url !== 'https://cloudscheduler.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/jobs/aipdm-prod-openswx-dispatch'
      || scheduler.state !== 'PAUSED' || schedulerPolicy.userUpdateTime !== snapshot.schedulerUserUpdateTime || sha256(canonicalize(schedulerPolicy)) !== snapshot.schedulerPolicySha256) fail('REPAIR_BASELINE_RAW_INVALID')
    for (const [secretIndex, api] of ['SECRET_TOKEN_VERSION_METADATA', 'SECRET_REGISTRY_VERSION_METADATA'].entries()) {
      const { record, body } = byApi(api)[0], sealed = snapshot.secretMetadata[secretIndex]
      if (record.method !== 'GET' || record.url !== `https://secretmanager.googleapis.com/v1/${sealed.name}` || body.name !== sealed.name || body.state !== sealed.state || body.etag !== sealed.etag) fail('REPAIR_BASELINE_RAW_INVALID')
    }
    const policy = (url, method) => { const matches = byApi('OWN_RESOURCE_POLICY').filter(row => row.record.url === url && row.record.method === method); if (!matches.length || matches.some(row => canonicalize(row.body) !== canonicalize(matches[0].body))) fail('REPAIR_BASELINE_RAW_INVALID'); return matches.at(-1).body }
    const iam = { job: policy(`https://run.googleapis.com/v2/${jobName}:getIamPolicy`, 'GET'),
      readerSecret: policy('https://secretmanager.googleapis.com/v1/projects/jenfu-platform-prod/secrets/aipdm-prod-openswx-reader-token:getIamPolicy', 'GET'),
      readerActAs: policy('https://iam.googleapis.com/v1/projects/jenfu-platform-prod/serviceAccounts/aipdm-prod-openswx-reader@jenfu-platform-prod.iam.gserviceaccount.com:getIamPolicy', 'POST') }
    if (sha256(canonicalize(iam)) !== snapshot.iamSha256) fail('REPAIR_BASELINE_RAW_INVALID')
    const pages = byApi('RUN_EXECUTIONS_PAGE'), inventory = [], seen = new Set(), tokens = new Set(); let expectedToken = ''
    if (!pages.length || pages.length > 4) fail('REPAIR_BASELINE_RAW_INVALID')
    for (const [pageIndex, { record, body }] of pages.entries()) {
      const expectedUrl = `https://run.googleapis.com/v2/${jobName}/executions?${new URLSearchParams({ pageSize: '100', ...(expectedToken ? { pageToken: expectedToken } : {}) })}`
      if (record.method !== 'GET' || record.url !== expectedUrl || !Array.isArray(body.executions ?? []) || (body.executions?.length ?? 0) > 100) fail('REPAIR_BASELINE_RAW_INVALID')
      for (const execution of body.executions ?? []) {
        const name = normalizeExecutionName(execution.name), completed = execution.conditions?.filter(row => row.type === 'Completed')
        if (!new RegExp(`^${jobName.replace('jenfu-platform-prod', '9536592944')}/executions/[a-z0-9-]+$`, 'u').test(name ?? '') || seen.has(name) || !Number.isFinite(Date.parse(execution.createTime)) || !Number.isFinite(Date.parse(execution.completionTime))
          || Date.parse(execution.completionTime) < Date.parse(execution.createTime) || (Object.hasOwn(execution, 'reconciling') && execution.reconciling !== false)
          || completed?.length !== 1 || !['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(completed[0].state)) fail('REPAIR_BASELINE_RAW_INVALID')
        seen.add(name); inventory.push({ name, createTime: execution.createTime, completionTime: execution.completionTime, completedState: completed[0].state, rawPageRef: record.bodyRef })
      }
      expectedToken = body.nextPageToken ?? ''
      if (typeof expectedToken !== 'string' || (expectedToken && tokens.has(expectedToken)) || (pageIndex < pages.length - 1) !== Boolean(expectedToken)) fail('REPAIR_BASELINE_RAW_INVALID')
      tokens.add(expectedToken)
    }
    sameProof(inventory.sort((a, b) => a.name.localeCompare(b.name)), [...snapshot.executions].sort((a, b) => a.name.localeCompare(b.name)))
  }
  for (const api of ['APP_SERVICE', 'APP_REVISION']) if (records.filter(row => row.record.api === api).length !== 1) fail('REPAIR_BASELINE_RAW_INVALID')
  return baseline
}
function assertObservedCapsule(value, ref, sourceRevision) {
  const keys = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceSha256', 'sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef', 'migrationManifestSha256', 'previousRevision', 'deadlineAt']
  for (const optional of ['baselineIntentRef', 'openswxWorkerRef', 'principalOnlyFenceRef', 'principalOnlyRecovery']) if (Object.hasOwn(value ?? {}, optional)) keys.push(optional)
  if (!exactKeys(value, keys) || value.schemaVersion !== 'jenfu.dev117.ai-pdm-release-intent.v2' || value.ownerApplicationId !== 'ai-pdm' || !RELEASE_ID.test(value.releaseId ?? '') ||
      value.sourceRevision !== sourceRevision || !H40.test(sourceRevision ?? '') || !H64.test(value.sourceSha256 ?? '') || !H64.test(value.migrationManifestSha256 ?? '') ||
      !/^ai-pdm-prod-[a-f0-9]{12}$/u.test(value.previousRevision ?? '') || !Number.isFinite(Date.parse(value.deadlineAt)) ||
      ref.uri !== `gs://${AI_BUCKET}/receipts/releases/${value.releaseId}/release-intent.json`) fail('OBSERVED_CAPSULE_INVALID')
  for (const key of ['sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef']) assertAiReleaseRef(value[key])
  if (value.openswxWorkerRef) assertAiWorkerRef(value.openswxWorkerRef)
  return value
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
    return { content, sourceAuthentication: { identity: sourceIdentity(source), sourceRevision: revision, generation: source.generation,
      crc32c: source.crc32c, sha256: sha256(bytes) } }
  })
}
async function readObservedCapsuleGraph({ sourceRevision, refs, token, fetchImpl, preMigration = false }) {
  const config = OWNERS['ai-pdm']
  const { releaseId, root } = assertOwnerReleaseRefSet('ai-pdm', refs, preMigration ? 'pre_migration' : 'post_migration')
  const intentRef = { uri: `gs://${AI_BUCKET}/receipts/releases/${releaseId}/release-intent.json`, sha256: root.split('/').at(-1) }
  const parent = activeEvidence()
  // A semantic predecessor already entered this capsule; retain that complete branch.
  const capsuleContext = canonicalize(evidenceState(parent).nodeRef) === canonicalize(intentRef)
    ? parent : descendAiPdmEvidenceContext(parent, intentRef)
  return runAiPdmEvidenceContext(capsuleContext, async () => {
    const capsule = await readRef(intentRef, AI_BUCKET, token, fetchImpl)
    const intent = assertObservedCapsule(capsule.value, intentRef, sourceRevision)
    const prepare = await readRef(refs.prepare, AI_BUCKET, token, fetchImpl)
    assertStage(prepare.value, 'ai-pdm', sourceRevision, releaseId, 'prepare')
    const prerequisiteRefs = Object.fromEntries(Object.entries({ sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }).map(([name, key]) => [name, intent[key]]))
    if (prepare.value.previousReceiptRef !== null) fail('PREPARE_INVALID')
    sameProof(prepare.value.facts?.prerequisiteRefs, prerequisiteRefs)
    const sourceLock = await readRef(intent.sourceLockRef, AI_BUCKET, token, fetchImpl)
    assertSourceLock(sourceLock.value, 'ai-pdm', config, sourceRevision, releaseId)
    if (sourceLock.value.sourceSha256 !== intent.sourceSha256 || sourceLock.value.migrationManifestSha256 !== intent.migrationManifestSha256) fail('SOURCE_LOCK_INVALID')
    admitAiPdmEvidenceSource({ bytes: sourceLock.bytes, ref: sourceLock.ref })
    const migrate = preMigration ? null : await readRef(refs.migrate, AI_BUCKET, token, fetchImpl)
    const historicalMigrationReuse = migrate?.value?.schemaVersion === 'aipdm.paused-app-repair-migration-association.v1'
    let repair = historicalMigrationReuse
    let descriptor = null, baseline = null, prerequisite = null, historical = null
    if (!preMigration && !repair && intent.openswxWorkerRef) {
      const worker = (await readRef(intent.openswxWorkerRef, AI_BUCKET, token, fetchImpl)).value
      if (worker.schemaVersion === 'aipdm.openswx-worker-descriptor.v3' && worker.releaseVariant === 'PAUSED_APP_REPAIR') {
        descriptor = assertObservationDescriptor(worker, intent)
        repair = true
      }
    }
    const observe = async association => {
      if (repair) {
        const keys = ['schemaVersion', 'ownerApplicationId', 'status', 'evidenceScope', 'sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'workerProfileSha256', 'resourcePlanHash', 'image', 'jobName', 'actor', 'observedAt', 'requestRef', 'priorActivationRef', 'executableProof', 'artifactOrigin', 'resourceAssociation', 'securityEvidence', 'resourceBasis']
        if (!exactKeys(association, keys) || association.schemaVersion !== 'aipdm.openswx-worker-build-association.v2' || association.resourceBasis !== 'PAUSED_APP_REPAIR' || association.ownerApplicationId !== 'ai-pdm' || association.status !== 'PASS' || association.evidenceScope !== 'PRODUCTION_PROVIDER_REUSE' ||
            association.actor !== 'jedchang0308@jenfu.com.tw' || association.image !== baseline.value.after.image || association.jobName !== baseline.value.after.jobName || !Number.isFinite(Date.parse(association.observedAt)) ||
            !exactKeys(association.resourceAssociation, ['infraManifestRef', 'readbackRef', 'originalApprovedResourcePlanRef', 'originalResourceApplyRef', 'resourcePlanHash', 'resourcesUnchanged']) || association.resourceAssociation.resourcesUnchanged !== true) fail('REPAIR_WORKER_ASSOCIATION_INVALID')
        for (const key of ['sourceRevision', 'sourceArchiveSha256', 'workerProfileSha256', 'resourcePlanHash']) sameProof(association[key], descriptor[key])
        sameProof(association.sourceLockRef, intent.sourceLockRef); sameProof(association.priorActivationRef, descriptor.priorActivationRef); sameProof(association.resourceAssociation.readbackRef, descriptor.pausedBaselineRef)
        const executable = association.executableProof, origin = association.artifactOrigin, security = association.securityEvidence
        const ignored = ['SOURCE_REVISION', 'SOURCE_TREE', 'SOURCE_VERSION', 'SOURCE_CREATED_AT', 'SOURCE_STATE']
        if (!exactKeys(executable, ['method', 'originalManifestRef', 'currentManifestRef', 'effectiveRecipeSha256', 'equal', 'target', 'builder', 'effectiveArgs', 'ignoredArgNames', 'originalSubmittedArgs']) ||
            executable.method !== 'aipdm.openswx-finite-worker-inputs.v1' || executable.equal !== true || executable.target !== 'finite-worker' ||
            executable.effectiveRecipeSha256 !== 'fba58398d3cae136ac1f1dfa04a235dd5f0f6463481096ac26fe4f692c4dd2ba' ||
            executable.builder !== 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c' ||
            !exactKeys(executable.originalSubmittedArgs, [...ignored, 'READER_SOURCE']) ||
            Object.values(executable.originalSubmittedArgs).some(value => typeof value !== 'string' || !value || value.length > 128)) fail('REPAIR_WORKER_ASSOCIATION_INVALID')
        sameProof(executable.effectiveArgs, { READER_SOURCE: 'scripts/lib/openswx-reader' }); sameProof(executable.ignoredArgNames, ignored)
        if (!exactKeys(origin, ['priorReadyCapsuleRef', 'priorReadyFullDescriptorRef', 'originalBuildReceiptRef', 'originalBuildOnlyDescriptorRef', 'originalApprovedResourcePlanRef', 'sourceRevision', 'sourceArchiveSha256', 'workerProfileSha256', 'sourceObject', 'buildId', 'buildRequestSha256', 'createTime', 'startTime', 'finishTime', 'image', 'provenance', 'sbom']) ||
            !H40.test(origin.sourceRevision ?? '') || !H64.test(origin.sourceArchiveSha256 ?? '') || !H64.test(origin.workerProfileSha256 ?? '') || !H64.test(origin.buildRequestSha256 ?? '') ||
            !BUILD_ID.test(origin.buildId ?? '') || origin.image !== association.image || origin.sourceObject?.sha256 !== origin.sourceArchiveSha256 ||
            [origin.createTime, origin.startTime, origin.finishTime].some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value))) ||
            Date.parse(origin.createTime) > Date.parse(origin.startTime) || Date.parse(origin.startTime) > Date.parse(origin.finishTime)) fail('REPAIR_WORKER_ASSOCIATION_INVALID')
        sourceIdentity(origin.sourceObject)
        for (const names of [origin.provenance, origin.sbom]) if (!Array.isArray(names) || !names.length || names.length > 100 || names.some(name => !/^projects\/(?:jenfu-platform-prod|9536592944)\/(?:locations\/asia-east1\/)?occurrences\/[A-Za-z0-9-]+$/u.test(name))) fail('REPAIR_WORKER_ASSOCIATION_INVALID')
        const policy = { schemaVersion: 'aipdm.openswx-reuse-security-policy.v1', discovery: 'FINISHED_SUCCESS', continuousAnalysis: 'ACTIVE', archived: false, rawHighOrCriticalVulnerabilityCount: 0, blockingVulnerabilityCount: 0 }
        if (!exactKeys(security, ['readbackRef', 'policySha256', 'observedAt', 'image', 'rawHighOrCriticalVulnerabilityCount', 'blockingVulnerabilityCount']) ||
            security.policySha256 !== sha256(canonicalize(policy)) || security.image !== association.image || security.rawHighOrCriticalVulnerabilityCount !== 0 || security.blockingVulnerabilityCount !== 0 ||
            typeof security.observedAt !== 'string' || !Number.isFinite(Date.parse(security.observedAt)) || association.resourceAssociation.resourcePlanHash !== association.resourcePlanHash) fail('REPAIR_WORKER_ASSOCIATION_INVALID')
        sameProof(association.resourceAssociation.originalApprovedResourcePlanRef, origin.originalApprovedResourcePlanRef)
        for (const ref of [executable.originalManifestRef, executable.currentManifestRef, origin.priorReadyFullDescriptorRef, origin.originalBuildReceiptRef, origin.originalBuildOnlyDescriptorRef, origin.originalApprovedResourcePlanRef,
          association.resourceAssociation.infraManifestRef, association.resourceAssociation.originalResourceApplyRef, security.readbackRef]) {
          assertAiReleaseRef(ref)
          if (!ref.uri.startsWith(`gs://${AI_BUCKET}/receipts/dev-122/openswx-worker/`)) fail('REPAIR_WORKER_ASSOCIATION_INVALID')
        }
        assertAiReleaseRef(origin.priorReadyCapsuleRef)
        const request = (await readRef(association.requestRef, AI_BUCKET, token, fetchImpl)).value
        if (!exactKeys(request, ['schemaVersion', 'inputRef', 'sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'priorActivationRef', 'actor', 'requestedAt']) || request.schemaVersion !== 'aipdm.openswx-worker-reuse-request.v2' || request.actor !== association.actor || !Number.isFinite(Date.parse(request.requestedAt))) fail('REPAIR_WORKER_ASSOCIATION_INVALID')
        sameProof(request.inputRef, baseline.value.inputRef)
        for (const key of ['sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'priorActivationRef']) sameProof(request[key], association[key])
        const input = (await readRef(request.inputRef, AI_BUCKET, token, fetchImpl)).value
        if (!exactKeys(input, ['schemaVersion', 'sourceLockRef', 'currentSourceObjectRef', 'priorActivationRef', 'deadlineAt', 'receiptId', 'servingCapsuleRef', 'predecessorBaselineRef']) || input.schemaVersion !== 'aipdm.openswx-worker-reuse-input.v2' || !Number.isFinite(Date.parse(input.deadlineAt)) ||
            !/^[A-Za-z0-9-]{6,100}$/u.test(input.receiptId ?? '') || Date.parse(request.requestedAt) >= Date.parse(input.deadlineAt)) fail('REPAIR_WORKER_ASSOCIATION_INVALID')
        sameProof(input.sourceLockRef, intent.sourceLockRef); sameProof(input.priorActivationRef, descriptor.priorActivationRef); sameProof(input.servingCapsuleRef, baseline.value.servingApp.capsuleRef); sameProof(input.predecessorBaselineRef, baseline.value.predecessorBaselineRef)
        if (input.currentSourceObjectRef?.sha256 !== descriptor.sourceArchiveSha256) fail('REPAIR_WORKER_ASSOCIATION_INVALID')
        const raw = new Map()
        for (const record of baseline.value.providerReadbackRefs) raw.set(record.bodyRef.uri, (await readRef(record.bodyRef, AI_BUCKET, token, fetchImpl)).value)
        assertAiPdmPausedRepairReadbacks({ baseline: baseline.value, records: baseline.value.providerReadbackRefs.map(record => ({ record, body: raw.get(record.bodyRef.uri) })) })
        for (const snapshot of [baseline.value.before, baseline.value.after]) for (const row of snapshot.executions) {
          const page = raw.get(row.rawPageRef.uri), matches = page?.executions?.filter(execution => execution.name?.replace('projects/jenfu-platform-prod/', 'projects/9536592944/') === row.name)
          const execution = matches?.[0], completed = execution?.conditions?.filter(condition => condition.type === 'Completed')
          if (matches?.length !== 1 || completed?.length !== 1 || completed[0].state !== row.completedState || execution.createTime !== row.createTime || execution.completionTime !== row.completionTime ||
              (Object.hasOwn(execution, 'reconciling') && execution.reconciling !== false)) fail('REPAIR_BASELINE_RAW_INVALID')
        }
        if (historicalMigrationReuse) {
          const prerequisiteRef = prepare.value.facts.migrationReusePrerequisiteRef
          assertAiReleaseRef(prerequisiteRef)
          if (prerequisiteRef.uri !== `${root}/migration-reuse-prerequisite.json`) fail('REPAIR_PREREQUISITE_INVALID')
          prerequisite = await readRef(prerequisiteRef, AI_BUCKET, token, fetchImpl)
          assertPausedMigrationPrerequisite(prerequisite.value, { intent, intentRef, descriptor, descriptorRef: intent.openswxWorkerRef })
          sameProof(prerequisite.value.servingCapsuleRef, baseline.value.servingApp?.capsuleRef)
        } else if (Object.hasOwn(prepare.value.facts, 'migrationReusePrerequisiteRef')) fail('REPAIR_MIGRATION_MODE_INVALID')
        const priorRef = baseline.value.servingApp.capsuleRef
        const child = descendAiPdmEvidenceContext(activeEvidence(), priorRef, true)
        historical = await runAiPdmEvidenceContext(child, async () => {
          const prior = await readRef(priorRef, AI_BUCKET, token, fetchImpl)
          const priorIntent = assertObservedCapsule(prior.value, priorRef, prior.value.sourceRevision)
          const priorRoot = `gs://${AI_BUCKET}/receipts/releases/${priorIntent.releaseId}/${priorRef.sha256}`
          const preparePrior = await readFixedJson(`${priorRoot}/prepare.json`, AI_BUCKET, token, fetchImpl)
          const migratePrior = await readFixedJson(`${priorRoot}/migrate.json`, AI_BUCKET, token, fetchImpl)
          const terminalPrior = await readFixedJson(`${priorRoot}/terminal.json`, AI_BUCKET, token, fetchImpl)
          return readObservedCapsuleGraph({ sourceRevision: priorIntent.sourceRevision, refs: { prepare: preparePrior.ref, migrate: migratePrior.ref, terminal: terminalPrior.ref }, token, fetchImpl })
        })
        if (!historical.terminal) fail('REPAIR_HISTORY_NOT_RELEASED')
        for (const [key, actual] of Object.entries({ capsuleRef: historical.intentRef, canonicalRef: historical.chain.canonical.ref, finalizeRef: historical.chain.finalize.ref, terminalRef: historical.terminal.ref, runtimeConfigRef: historical.intent.runtimeConfigRef, workerDescriptorRef: historical.intent.openswxWorkerRef,
          sourceRevision: historical.intent.sourceRevision, revision: historical.terminal.value.facts.candidateRevision, artifactDigest: historical.chain.deployment.value.artifactDigest })) sameProof(baseline.value.servingApp[key], actual)
        if (baseline.value.servingApp.workerStatus === 'ACTIVATION_PENDING') {
          if (!historical.repair || historical.baseline.value.continuationDepth + 1 !== baseline.value.continuationDepth) fail('REPAIR_HISTORY_INVALID')
          sameProof(baseline.value.predecessorBaselineRef, historical.descriptor.pausedBaselineRef)
          sameProof(descriptor.priorActivationRef, historical.descriptor.priorActivationRef); sameProof(descriptor.retainedWorkerDescriptorRef, historical.descriptor.retainedWorkerDescriptorRef)
          if (descriptor.tokenSecretVersion !== historical.descriptor.tokenSecretVersion || descriptor.registrySecretVersion !== historical.descriptor.registrySecretVersion) fail('REPAIR_HISTORY_INVALID')
        } else {
          const activation = (await readRef(descriptor.priorActivationRef, AI_BUCKET, token, fetchImpl)).value
          if (activation.schemaVersion !== 'aipdm.openswx-owner-receipt.v1' || activation.kind !== 'activation' || activation.ownerApplicationId !== 'ai-pdm' || activation.status !== 'PASS' || activation.actor !== 'jedchang0308@jenfu.com.tw' ||
              activation.sourceRevision !== historical.intent.sourceRevision || activation.image !== baseline.value.after.image || activation.templateSha256 !== baseline.value.after.normalTemplateSha256 || activation.facts?.workerStatus !== 'READY' || activation.facts.schedulerState !== 'ENABLED' ||
              activation.facts.claimProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND' || activation.facts.dbAdmissionProof !== 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN' || !Array.isArray(activation.previousRefs) || activation.previousRefs.length !== 5) fail('REPAIR_HISTORY_INVALID')
          sameProof(activation.previousRefs[0], historical.intentRef); sameProof(activation.previousRefs[2], historical.chain.canonical.ref)
          sameProof(activation.facts.numericCredentials, { token: descriptor.tokenSecretVersion, registry: descriptor.registrySecretVersion })
        }
      }
      if (!historicalMigrationReuse && migrate) {
        assertMigration(migrate.value, 'ai-pdm', config, sourceRevision, intent.migrationManifestSha256)
      }
      let terminal = null, chain
      if (refs.terminal) {
        terminal = await readRef(refs.terminal, AI_BUCKET, token, fetchImpl)
        assertStage(terminal.value, 'ai-pdm', sourceRevision, releaseId, 'terminal')
        if (terminal.value.facts?.result !== 'RELEASED' || terminal.value.facts.databaseDisposition !== (historicalMigrationReuse ? 'HISTORICAL_EVIDENCE_REUSED' : 'FORWARD_APPLIED') || terminal.value.facts.remainingHumanAction !== 0 ||
            (historicalMigrationReuse && canonicalize(terminal.value.facts.migrationEvidenceRef) !== canonicalize(migrate.ref)) ||
            (!historicalMigrationReuse && Object.hasOwn(terminal.value.facts, 'migrationEvidenceRef'))) fail('TERMINAL_INVALID')
        chain = await readReleasedStageChain({ owner: 'ai-pdm', config, revision: sourceRevision, releaseId, root, terminal, prepare, migrate, token, fetchImpl })
      } else {
        const deploymentRef = historicalMigrationReuse ? migrate.value.deploymentCapsuleRef : null
        const deployment = deploymentRef ? await readRef(deploymentRef, AI_BUCKET, token, fetchImpl) : await readFixedJson(`${root}/deployment-capsule.json`, AI_BUCKET, token, fetchImpl)
        chain = await readBuildEvidence({ owner: 'ai-pdm', config, revision: sourceRevision, releaseId, root, prepare, deployment, artifactDigest: deployment.value.artifactDigest, token, fetchImpl })
      }
      const deployment = chain.deployment
      const stageTimes = [prepare.value.observedAt, chain.build.value.observedAt, ...(historicalMigrationReuse ? [migrate.value.observedAt] : []),
        ...['candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize'].filter(name => chain[name]).map(name => chain[name].value.observedAt), ...(terminal ? [terminal.value.observedAt] : [])].map(Date.parse)
      if (stageTimes.some(value => !Number.isFinite(value) || value > Date.parse(intent.deadlineAt)) || stageTimes.some((value, index) => index && value < stageTimes[index - 1])) fail('OBSERVED_CHRONOLOGY_INVALID')
      if (!historicalMigrationReuse && migrate && (Date.parse(migrate.value.startedAt) < Date.parse(chain.build.value.observedAt) || Date.parse(migrate.value.completedAt) > Date.parse(intent.deadlineAt) || (chain.candidate && Date.parse(migrate.value.completedAt) > Date.parse(chain.candidate.value.observedAt)))) fail('OBSERVED_CHRONOLOGY_INVALID')
      if (deployment.value.schemaVersion !== 'jenfu.dev117.ai-pdm-deployment-capsule.v2' || deployment.value.ownerApplicationId !== 'ai-pdm' || deployment.value.deadlineAt !== intent.deadlineAt || deployment.value.releaseIntentSha256 !== intentRef.sha256) fail('DEPLOYMENT_CAPSULE_INVALID')
      sameProof(deployment.value.releaseIntentRef, intentRef)
      sameProof(deployment.value.sourceObject, chain.build.value.facts.sourceObject)
      sameProof(deployment.value.sourceObject, chain.provenance.value.sourceObject)
      sameProof(deployment.value.migrationBundleRef, chain.build.value.facts.migrationBundleRef)
      const bundle = await readObservationBundle({ ref: deployment.value.migrationBundleRef, revision: sourceRevision, token, fetchImpl })
      if (bundle.bundle.manifestSha256 !== intent.migrationManifestSha256) fail('MIGRATION_BUNDLE_MANIFEST_INVALID')
      const archived = await observeArchiveContent({ source: deployment.value.sourceObject, revision: sourceRevision, bundle: bundle.bundle, token, fetchImpl })
      const original = repair ? historical.original : preMigration ? null : { intent, intentRef, deploymentRef: deployment.ref, candidateRef: chain.candidate?.ref ?? null, migrationRef: migrate.ref, migration: migrate.value, bundleRef: bundle.ref, bundle: bundle.bundle, content: archived.content }
      let migrationMode = migrate ? 'FORWARD_APPLIED' : null
      if (repair) {
        assertAiPdmHistoricalMigration(original)
        migrationMode = assertAiPdmRepairMigrationMode(original.content, archived.content)
        if ((migrationMode === 'HISTORICAL_EVIDENCE_REUSED') !== historicalMigrationReuse) fail('REPAIR_MIGRATION_MODE_INVALID')
        if (historicalMigrationReuse) {
        const equivalent = assertAiPdmMigrationEquivalent(original.content, archived.content), p = prerequisite.value
        for (const [key, value] of Object.entries({ historicalCapsuleRef: original.intentRef, historicalDeploymentRef: original.deploymentRef, historicalCandidateRef: original.candidateRef, historicalMigrationReceiptRef: original.migrationRef,
          historicalMigrationBundleRef: original.bundleRef, historicalMigrationManifestSha256: original.bundle.manifestSha256, historicalLedgerCount: original.migration.ledgerCount, historicalCompletedAt: original.migration.completedAt,
          currentMigrationBundleSha256: bundle.ref.sha256, currentMigrationManifestSha256: bundle.bundle.manifestSha256, ...equivalent })) sameProof(p[key], value)
        assertPausedMigrationAssociation(migrate.value, { intent, intentRef, prerequisite: p, prerequisiteRef: prerequisite.ref, deployment: deployment.value, deploymentRef: deployment.ref })
        } else if (migrate.value.ledgerCount !== bundle.bundle.entries.length || migrate.value.baselineCount !== bundle.bundle.baselineCount) fail('REPAIR_FORWARD_MIGRATION_INVALID')
      }
      activeEvidence()
      return { intent, intentRef, prepare, sourceLock, migrate, terminal, chain, descriptor, baseline, prerequisite, bundle, content: archived.content, sourceAuthentication: archived.sourceAuthentication, original, repair, migrationMode }
    }
    if (!repair) return observe(null)
    if (!intent.openswxWorkerRef || Object.hasOwn(intent, 'principalOnlyRecovery') || Object.hasOwn(intent, 'principalOnlyFenceRef')) fail('REPAIR_CAPSULE_INVALID')
    descriptor ??= assertObservationDescriptor((await readRef(intent.openswxWorkerRef, AI_BUCKET, token, fetchImpl)).value, intent)
    const workerChild = descendAiPdmEvidenceContext(activeEvidence(), descriptor.workerBuildRef, true)
    return runAiPdmEvidenceContext(workerChild, async () => {
      const association = (await readRef(descriptor.workerBuildRef, AI_BUCKET, token, fetchImpl)).value
      // Baseline bytes cost no transition, but stay visiting through all semantic joins.
      const baselineChild = descendAiPdmEvidenceContext(activeEvidence(), descriptor.pausedBaselineRef)
      return runAiPdmEvidenceContext(baselineChild, async () => {
        baseline = await readRef(descriptor.pausedBaselineRef, AI_BUCKET, token, fetchImpl)
        assertObservationBaseline(baseline.value, descriptor, intent)
        sameProof(baseline.value.source.sourceLockRef, intent.sourceLockRef)
        return observe(association)
      })
    })
  })
}
/** Fixed AI-PDM readonly source observation; generic v1 proof stays isolated. */
export async function readAiPdmReleaseObservation({ sourceRevision, refs, token, fetchImpl = fetch }) {
  const handle = createAiPdmEvidenceContext()
  return runAiPdmEvidenceContext(handle, async () => {
    const preMigration = refs?.migrate === null && refs?.terminal === null
    const selected = assertOwnerReleaseRefSet('ai-pdm', refs, preMigration ? 'pre_migration' : 'post_migration')
    const migration = preMigration ? null : await readRef(refs.migrate, AI_BUCKET, token, fetchImpl)
    let pausedForward = false
    if (!preMigration && migration?.value?.schemaVersion !== 'aipdm.paused-app-repair-migration-association.v1') {
      const capsuleRef = { uri: `gs://${AI_BUCKET}/receipts/releases/${selected.releaseId}/release-intent.json`, sha256: selected.root.split('/').at(-1) }
      const intent = assertObservedCapsule((await readRef(capsuleRef, AI_BUCKET, token, fetchImpl)).value, capsuleRef, sourceRevision)
      if (intent.openswxWorkerRef) {
        const worker = (await readRef(intent.openswxWorkerRef, AI_BUCKET, token, fetchImpl)).value
        pausedForward = worker.schemaVersion === 'aipdm.openswx-worker-descriptor.v3' && worker.releaseVariant === 'PAUSED_APP_REPAIR'
      }
    }
    if (migration?.value?.schemaVersion !== 'aipdm.paused-app-repair-migration-association.v1' && !pausedForward) {
      // Ordinary v1 keeps the established source/build/recovery contract.
      const proof = await readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision, refs, token, fetchImpl, mode: preMigration ? 'pre_migration' : 'post_migration' })
      const source = proof.providerClaim.sourceObject
      const child = descendAiPdmEvidenceContext(handle, { uri: source.uri, sha256: source.sha256 })
      const authentication = await runAiPdmEvidenceContext(child, async () => {
        const bytes = await readAiPdmEvidenceLeaf({ ref: { uri: source.uri, sha256: source.sha256 }, kind: 'source', generation: source.generation, crc32c: source.crc32c, sourceRevision,
          read: async () => (await readAiPdmSourceArchive({ source, sourceRevision, deadlineAt: observationDeadline(), token, fetchImpl })).bytes })
        return { identity: sourceIdentity(source), sourceRevision, generation: source.generation, crc32c: source.crc32c, sha256: sha256(bytes) }
      })
      authenticatedObservations.set(proof, { root: evidenceState(handle).root, proofSha256: sha256(canonicalize(proof)), sourceAuthentication: authentication,
        input: { sourceRevision, refs: structuredClone(refs), token, fetchImpl, preMigration } })
      activeEvidence()
      return proof
    }
    const graph = await readObservedCapsuleGraph({ sourceRevision, refs, token, fetchImpl })
    const historicalMigrationReuse = graph.migrationMode === 'HISTORICAL_EVIDENCE_REUSED'
    const object = row => ({ ref: row.ref.uri, sha256: row.ref.sha256, generation: row.generation, crc32c: row.crc32c })
    const proof = { owner: 'ai-pdm', sourceRevision, releaseId: graph.intent.releaseId,
      disposition: graph.terminal ? 'released' : historicalMigrationReuse ? 'migration_evidence_only' : 'migration_only',
      migrationManifestSha256: graph.intent.migrationManifestSha256, prepare: object(graph.prepare), sourceLock: object(graph.sourceLock), migrate: object(graph.migrate),
      artifactDigest: graph.chain.deployment.value.artifactDigest, releaseCapsuleRef: graph.intentRef,
      providerClaim: { buildId: graph.chain.provenance.value.cloudBuild.id, sourceObject: graph.chain.provenance.value.sourceObject },
      ...(graph.terminal ? { terminal: object(graph.terminal), candidateRevision: graph.terminal.value.facts.candidateRevision,
        releaseChain: Object.fromEntries(Object.entries(graph.chain).map(([stage, row]) => [stage, object(row)])) } : { buildChain: Object.fromEntries(Object.entries(graph.chain).map(([stage, row]) => [stage, object(row)])) }),
      ...(historicalMigrationReuse ? { releaseAuthority: false, migrationVerified: false, currentDatabaseReadPerformed: false, databaseLiveState: 'UNKNOWN', evidenceScope: 'MIGRATION_INPUT_EQUIVALENT_NO_EXECUTION', databaseDisposition: 'HISTORICAL_EVIDENCE_REUSED', migrationEvidenceRef: graph.migrate.ref } : {}) }
    authenticatedObservations.set(proof, { root: evidenceState(handle).root, proofSha256: sha256(canonicalize(proof)), sourceAuthentication: graph.sourceAuthentication,
      input: { sourceRevision, refs: structuredClone(refs), token, fetchImpl, preMigration: false } })
    activeEvidence()
    return proof
  })
}
/** Only same live observation may expose its derived content to existing stage adapters. */
export async function readAiPdmObservationInputs(proof) {
  const active = activeEvidence(), stored = authenticatedObservations.get(proof)
  if (active === undefined || !stored || stored.root !== evidenceState(active).root || stored.root.closed ||
      stored.proofSha256 !== sha256(canonicalize(proof))) fail('OBSERVATION_IDENTITY_INVALID')
  const graph = await readObservedCapsuleGraph(stored.input)
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
async function readRef(ref, bucket, token, fetchImpl) {
  assertRef(ref, bucket)
  let object
  const load = async () => {
    object = await readGcsObject({ uri: ref.uri, expectedBucket: bucket,
      expectedPrefix: 'receipts', token, fetchImpl: scopeFetch(fetchImpl) })
    activeEvidence()
    return object.bytes
  }
  const bytes = activeEvidence() === undefined ? await load() : await readAiPdmEvidenceLeaf({ ref, read: load })
  if (sha256(bytes) !== ref.sha256) fail('OBJECT_HASH_MISMATCH')
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
  return { value, bytes: object.bytes, ref,
    generation: object.generation, crc32c: object.crc32c }
}
function assertStage(value, owner, revision, releaseId, stage) {
  if (!exactKeys(value, ['schemaVersion', 'ownerApplicationId', 'releaseId',
    'sourceRevision', 'stage', 'previousReceiptRef', 'facts', 'observedAt',
    'status', 'receiptSha256']) ||
    value.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' ||
    value.ownerApplicationId !== owner || value.sourceRevision !== revision ||
    value.releaseId !== releaseId || value.stage !== stage ||
    value.status !== 'PASS' || value.receiptSha256 !== receiptHash(value)) fail('STAGE_INVALID')
}
function assertSourceLock(value, owner, config, revision, releaseId) {
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
export function assertMigration(value, owner, config, revision, manifestSha256) {
  if (typeof config.migrationBootstrap !== 'boolean' ||
      !Number.isInteger(config.principalContractLedgerFloor) ||
      config.principalContractLedgerFloor < 1) fail('MIGRATION_INVALID')
  if (!exactKeys(value, ['schemaVersion', 'ownerApplicationId', 'sourceRevision',
    'database', 'ledger', 'manifestSha256', 'baselineCount', 'minimumLedgerCount',
    ...(config.migrationBootstrap ? ['ledgerBootstrap'] : []),
    'ledgerCount', 'applied', 'replayed', 'crossDatabaseDenials',
    'boundaryStatus', 'executionName', 'startedAt', 'completedAt', 'status',
    'receiptSha256']) ||
    value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' ||
    value.ownerApplicationId !== owner || value.sourceRevision !== revision ||
    value.database !== 'jenfu_prod' || value.ledger !== config.ledger ||
    value.manifestSha256 !== manifestSha256 || value.status !== 'PASS' ||
    value.boundaryStatus !== 'PASS' || value.receiptSha256 !== receiptHash(value) ||
    !Number.isInteger(value.baselineCount) || value.baselineCount < 0 ||
    !Number.isInteger(value.minimumLedgerCount) ||
    value.minimumLedgerCount < 0 ||
    value.minimumLedgerCount > value.baselineCount ||
    !Number.isInteger(value.ledgerCount) ||
    value.ledgerCount < value.baselineCount ||
    value.ledgerCount < value.minimumLedgerCount ||
    value.ledgerCount < config.principalContractLedgerFloor ||
    !Number.isInteger(value.applied) || value.applied < 0 ||
    !Number.isInteger(value.replayed) || value.replayed < 0 ||
    value.applied + value.replayed !== value.ledgerCount ||
    (config.migrationBootstrap &&
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
  terminal, prepare, migrate, token, fetchImpl }) {
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
  if (canonicalize(candidate.value.previousReceiptRef) !==
      canonicalize(migrate.ref) ||
      canonicalize(candidate.value.facts.migrationReceiptRef) !==
      canonicalize(migrate.ref)) fail('STAGE_CHAIN_INVALID')
  const deploymentRef = assertRef(candidate.value.facts.deploymentCapsuleRef,
    config.bucket, `${root}/deployment-capsule.json`)
  const deployment = await readRef(deploymentRef, config.bucket, token, fetchImpl)
  return { ...stages, ...await readBuildEvidence({ owner, config, revision,
    releaseId, root, prepare, deployment, artifactDigest, token, fetchImpl }) }
}

/** Read-only, bucket-pinned owner source evidence; it does not authorize cutover. */
export async function readOwnerReleaseProof({ owner, sourceRevision, refs, token,
  fetchImpl = fetch, mode = 'post_migration' }) {
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
      token, fetchImpl })
    buildEvidence = releaseChain
  } else {
    // A build-only or migration-only observation is not a released application. It
    // still has the immutable owner build/deployment receipts needed to attest
    // the exact image before principal materialization.
    const deployment = await readFixedJson(`${root}/deployment-capsule.json`,
      config.bucket, token, fetchImpl)
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
  const request = async (url) => {
    if (builderReadback !== null && url !== buildUrl && url !== imageUrl) fail('SECONDARY_READBACK_ROUTE_INVALID')
    const response = await scopeFetch(fetchImpl)(url, { method: 'GET', redirect: 'error',
      headers: { authorization: `Bearer ${builderReadback?.token ?? token}` }, signal: AbortSignal.timeout(20_000) })
    if (!response.ok || response.redirected || response.headers.get('location')) fail('PROVIDER_READBACK_FAILED')
    try { const value = await response.json(); activeEvidence(); return value } catch { fail('PROVIDER_READBACK_INVALID') }
  }
  const build = await request(buildUrl)
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
  const image = await request(imageUrl)
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
