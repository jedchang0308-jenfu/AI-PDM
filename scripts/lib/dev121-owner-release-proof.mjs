import { canonicalize, readGcsObject, sha256 } from './dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u
const OWNERS = Object.freeze({
  platform: Object.freeze({ bucket: 'jenfu-platform-prod-platform-release',
    repository: 'jedchang0308-jenfu/Jenfu-Platform', branch: 'main',
    ledger: 'platform_core.schema_migrations' }),
  orgmaster: Object.freeze({ bucket: 'jenfu-platform-prod-orgmaster-release',
    repository: 'jedchang0308-jenfu/OrgMaster', branch: 'master',
    ledger: 'orgmaster_core.schema_migrations' }),
  'ai-pdm': Object.freeze({ bucket: 'jenfu-platform-prod-aipdm-release',
    repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main',
    ledger: 'ai_pdm_core.schema_migrations' }),
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
function assertRef(value, bucket, expectedUri = null) {
  if (!exactKeys(value, ['uri', 'sha256']) ||
      typeof value.uri !== 'string' || !H64.test(value.sha256) ||
      !value.uri.startsWith(`gs://${bucket}/receipts/`) ||
      (expectedUri !== null && value.uri !== expectedUri)) fail('REF_INVALID')
  return value
}
async function readRef(ref, bucket, token, fetchImpl) {
  assertRef(ref, bucket)
  const object = await readGcsObject({ uri: ref.uri, expectedBucket: bucket,
    expectedPrefix: 'receipts', token, fetchImpl })
  if (sha256(object.bytes) !== ref.sha256) fail('OBJECT_HASH_MISMATCH')
  let value
  try { value = JSON.parse(object.bytes.toString('utf8')) }
  catch { fail('JSON_INVALID') }
  return { value, ref, generation: object.generation, crc32c: object.crc32c }
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
function assertMigration(value, owner, config, revision, manifestSha256) {
  if (!exactKeys(value, ['schemaVersion', 'ownerApplicationId', 'sourceRevision',
    'database', 'ledger', 'manifestSha256', 'baselineCount', 'minimumLedgerCount',
    'ledgerBootstrap', 'ledgerCount', 'applied', 'replayed', 'crossDatabaseDenials',
    'boundaryStatus', 'executionName', 'startedAt', 'completedAt', 'status',
    'receiptSha256']) ||
    value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' ||
    value.ownerApplicationId !== owner || value.sourceRevision !== revision ||
    value.database !== 'jenfu_prod' || value.ledger !== config.ledger ||
    value.manifestSha256 !== manifestSha256 || value.status !== 'PASS' ||
    value.boundaryStatus !== 'PASS' || value.receiptSha256 !== receiptHash(value) ||
    !Number.isInteger(value.ledgerCount) || value.ledgerCount < 1 ||
    !Number.isInteger(value.applied) || value.applied < 0 ||
    !Number.isInteger(value.replayed) || value.replayed < 0 ||
    canonicalize(value.crossDatabaseDenials) !== canonicalize([
      { database: 'jenfu_dev', denied: true },
      { database: 'jenfu_stg', denied: true },
    ])) fail('MIGRATION_INVALID')
}

/** Read-only, bucket-pinned owner source evidence; it does not authorize cutover. */
export async function readOwnerReleaseProof({ owner, sourceRevision, refs, token,
  fetchImpl = fetch }) {
  const config = OWNERS[owner]
  if (!config || !H40.test(sourceRevision ?? '') ||
      !refs) {
    fail('INPUT_INVALID')
  }
  const { releaseId, root } = assertOwnerReleaseRefSet(owner, refs)
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
  const migrate = await readRef(refs.migrate, config.bucket, token, fetchImpl)
  assertMigration(migrate.value, owner, config, sourceRevision,
    sourceLock.value.migrationManifestSha256)
  let terminal = null
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
  }
  const object = (readback) => ({ ref: readback.ref.uri,
    sha256: readback.ref.sha256, generation: readback.generation,
    crc32c: readback.crc32c })
  return { owner, sourceRevision, releaseId,
    disposition: terminal ? 'released' : 'migration_only',
    migrationManifestSha256: sourceLock.value.migrationManifestSha256,
    prepare: object(prepare), sourceLock: object(sourceLock),
    migrate: object(migrate), ...(terminal ? { terminal: object(terminal),
      candidateRevision: terminal.value.facts.candidateRevision,
      artifactDigest: terminal.value.facts.artifactDigest } : {}) }
}

export function assertOwnerReleaseRefSet(owner, refs) {
  const config = OWNERS[owner]
  if (!config || !exactKeys(refs, ['prepare', 'migrate', 'terminal']) ||
      (refs.terminal !== null && !exactKeys(refs.terminal, ['uri', 'sha256']))) {
    fail('INPUT_INVALID')
  }
  const rootMatch = new RegExp(`^gs://${config.bucket}/receipts/releases/([A-Z0-9][A-Z0-9-]{5,63})/([a-f0-9]{64})/prepare\\.json$`, 'u')
    .exec(refs.prepare?.uri ?? '')
  if (!rootMatch || !RELEASE_ID.test(rootMatch[1]) || !H64.test(rootMatch[2])) fail('REF_INVALID')
  const releaseId = rootMatch[1]
  const root = `gs://${config.bucket}/receipts/releases/${releaseId}/${rootMatch[2]}`
  assertRef(refs.prepare, config.bucket, `${root}/prepare.json`)
  assertRef(refs.migrate, config.bucket, `${root}/migrate.json`)
  if (refs.terminal) assertRef(refs.terminal, config.bucket, `${root}/terminal.json`)
  return { releaseId, root }
}
