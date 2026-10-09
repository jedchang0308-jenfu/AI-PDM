import { createHash } from 'node:crypto'

export const UNLINKED_PROFILE_CLEANUP_PREFIX = 'source/migration-bundles/dev121/unlinked-profile-cleanup'
export const UNLINKED_PROFILE_CLEANUP_PATH = 'db/postgres/084_dev121_unlinked_legacy_profile_cleanup.sql'
const OWNER = 'ai-pdm'
const BUCKET = 'jenfu-platform-prod-aipdm-release'
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === keys.sort().join(',')
const fail = code => { const error = new Error(code); error.code = code; throw error }
const scalar = value => typeof value === 'string' && value.length > 0 && value.length <= 512
  && value.trim().length > 0 && !CONTROL.test(value)

// Only immutable, private operation objects can select the single profile. The
// workflow and runner command lines retain their existing capsule/bundle inputs.
export function assertUnlinkedProfileCleanupRef(ref, bucket = BUCKET) {
  if (bucket !== BUCKET || !exact(ref, ['uri', 'generation', 'sha256'])
    || typeof ref.generation !== 'string' || !/^[1-9][0-9]{0,31}$/u.test(ref.generation)
    || typeof ref.sha256 !== 'string' || !H64.test(ref.sha256) || typeof ref.uri !== 'string' || ref.uri.length > 2048
    || !ref.uri.startsWith(`gs://${bucket}/${UNLINKED_PROFILE_CLEANUP_PREFIX}/`)
    || !/^[A-Za-z0-9._/-]+\.json$/u.test(ref.uri.slice(`gs://${bucket}/`.length))
    || ref.uri.includes('..') || ref.uri.includes('//', 5)) fail('UNLINKED_PROFILE_CLEANUP_REF_INVALID')
  return ref
}

export function assertUnlinkedProfileCleanupEntry(entries) {
  const matches = Array.isArray(entries) ? entries.filter(row => row?.path === UNLINKED_PROFILE_CLEANUP_PATH) : []
  const entry = matches[0]
  if (matches.length !== 1 || entry.order !== 34 || entry.version !== 'ai-pdm-084'
    || entry.name !== 'dev121_unlinked_legacy_profile_cleanup'
    || typeof entry.sourceSha256 !== 'string' || !H64.test(entry.sourceSha256)) fail('UNLINKED_PROFILE_CLEANUP_ENTRY_INVALID')
  return entry
}

export function assertUnlinkedProfileCleanupBundleBinding(bundle, expectedRef) {
  // A one-argument runner check validates its own binding. An explicit second
  // argument also requires presence to agree with the authoritative intent.
  if (arguments.length < 2) expectedRef = bundle?.unlinkedProfileCleanupRef
  if (!Object.hasOwn(bundle ?? {}, 'unlinkedProfileCleanupRef')) {
    if (expectedRef !== undefined && expectedRef !== null) fail('UNLINKED_PROFILE_CLEANUP_BUNDLE_MISMATCH')
    return null
  }
  if (bundle.ownerApplicationId !== OWNER || !H40.test(bundle.sourceRevision ?? '')) fail('UNLINKED_PROFILE_CLEANUP_BUNDLE_MISMATCH')
  const ref = assertUnlinkedProfileCleanupRef(bundle.unlinkedProfileCleanupRef)
  const expected = assertUnlinkedProfileCleanupRef(expectedRef)
  if (ref.uri !== expected.uri || ref.generation !== expected.generation || ref.sha256 !== expected.sha256) fail('UNLINKED_PROFILE_CLEANUP_BUNDLE_MISMATCH')
  return assertUnlinkedProfileCleanupEntry(bundle.entries)
}

export function assertUnlinkedProfileCleanupOperation(value, { sourceRevision, migrationSourceSha256 }) {
  if (!exact(value, ['schemaVersion', 'ownerApplicationId', 'sourceRevision', 'migrationSourceSha256', 'operationId', 'targetProfileId', 'targetCompanyId'])
    || value.schemaVersion !== 'ai-pdm.unlinked-profile-cleanup-operation.v1'
    || value.ownerApplicationId !== OWNER || !H40.test(sourceRevision ?? '') || value.sourceRevision !== sourceRevision
    || !H64.test(migrationSourceSha256 ?? '') || value.migrationSourceSha256 !== migrationSourceSha256
    || typeof value.operationId !== 'string' || !UUID.test(value.operationId) || !scalar(value.targetProfileId) || !scalar(value.targetCompanyId)) fail('UNLINKED_PROFILE_CLEANUP_OPERATION_INVALID')
  return value
}

export function verifyUnlinkedProfileCleanupReadback({ ref, bytes, generation, sourceRevision, migrationSourceSha256 }) {
  assertUnlinkedProfileCleanupRef(ref)
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 8192 || hash(bytes) !== ref.sha256
    || typeof generation !== 'string' || generation !== ref.generation) fail('UNLINKED_PROFILE_CLEANUP_READBACK_INVALID')
  let value
  try { value = JSON.parse(bytes.toString('utf8')) } catch { fail('UNLINKED_PROFILE_CLEANUP_OPERATION_INVALID') }
  return { ref, value: assertUnlinkedProfileCleanupOperation(value, { sourceRevision, migrationSourceSha256 }) }
}

export async function readUnlinkedProfileCleanupOperation({ ref, sourceRevision, migrationSourceSha256, readObject }) {
  assertUnlinkedProfileCleanupRef(ref)
  let object
  try { object = await readObject(ref) } catch { fail('UNLINKED_PROFILE_CLEANUP_READ_FAILED') }
  return verifyUnlinkedProfileCleanupReadback({ ref, sourceRevision, migrationSourceSha256,
    bytes: object?.bytes, generation: String(object?.generation ?? object?.metadata?.generation ?? '') })
}

export function assertUnlinkedProfileCleanupResult(result) {
  if (!exact(result, ['status', 'auditId', 'priorRowSha256'])
    || !['DELETED', 'REPLAYED', 'ABSENT'].includes(result.status)
    || typeof result.auditId !== 'string' || !/^dev121-unlinked-profile-cleanup-v2-[a-f0-9]{64}$/u.test(result.auditId)
    || (result.status === 'ABSENT' ? result.priorRowSha256 !== null : typeof result.priorRowSha256 !== 'string' || !H64.test(result.priorRowSha256))) fail('UNLINKED_PROFILE_CLEANUP_RESULT_INVALID')
  return result
}

export async function executeUnlinkedProfileCleanup({ database, operation }) {
  assertUnlinkedProfileCleanupOperation(operation?.value, {
    sourceRevision: operation?.value?.sourceRevision,
    migrationSourceSha256: operation?.value?.migrationSourceSha256,
  })
  assertUnlinkedProfileCleanupRef(operation.ref)
  try {
    await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
    await database.query("SET LOCAL lock_timeout = '2s'")
    await database.query("SET LOCAL statement_timeout = '15s'")
    await database.query("SET LOCAL idle_in_transaction_session_timeout = '30s'")
    const result = await database.query(
      'SELECT ai_pdm_core.delete_unlinked_legacy_profile_v1($1::text,$2::text,$3::text,$4::jsonb) AS result',
      [operation.value.targetProfileId, operation.value.targetCompanyId, operation.value.operationId,
        JSON.stringify({ sourceRevision: operation.value.sourceRevision, inputSha256: operation.ref.sha256 })])
    if (!Array.isArray(result?.rows) || result.rows.length !== 1) fail('UNLINKED_PROFILE_CLEANUP_RESULT_INVALID')
    return assertUnlinkedProfileCleanupResult(result.rows[0].result)
  } catch { fail('UNLINKED_PROFILE_CLEANUP_EXECUTION_FAILED') }
}

export function unlinkedProfileCleanupReceipt(operation, result) {
  assertUnlinkedProfileCleanupRef(operation?.ref)
  return { operationRef: operation.ref, result: assertUnlinkedProfileCleanupResult(result) }
}

export function assertUnlinkedProfileCleanupReceipt(receipt, expectedRef) {
  if (expectedRef === undefined || expectedRef === null) {
    if (receipt !== undefined) fail('UNLINKED_PROFILE_CLEANUP_RECEIPT_INVALID')
    return null
  }
  assertUnlinkedProfileCleanupRef(expectedRef)
  if (!exact(receipt, ['operationRef', 'result'])) fail('UNLINKED_PROFILE_CLEANUP_RECEIPT_INVALID')
  const ref = assertUnlinkedProfileCleanupRef(receipt.operationRef)
  if (ref.uri !== expectedRef.uri || ref.generation !== expectedRef.generation || ref.sha256 !== expectedRef.sha256) fail('UNLINKED_PROFILE_CLEANUP_RECEIPT_INVALID')
  assertUnlinkedProfileCleanupResult(receipt.result)
  return receipt
}
