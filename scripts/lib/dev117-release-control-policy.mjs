const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u

export const RELEASE_MODES = Object.freeze([
  'full_release',
  'build_only',
  'one_time_cutover',
  'special_recovery',
  'program_only',
  'principal_only',
])

const SPECIAL_INTENT_FIELDS = Object.freeze([
  'principalOnlyFenceRef',
  'principalOnlyRecovery',
  'postAbortLedgerReadbackRef',
  'appliedMigrationContinuation',
  'programOnlyBaseline',
  'unlinkedProfileCleanupRef',
])

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

export function classifyReleaseMode({ intent = {}, executionMode = 'full_release', cutover = false } = {}) {
  if (intent.programOnlyBaseline) return 'program_only'
  // An applied-migration continuation is a routine forward release that
  // reuses an already provider-verified database result.  Its retained
  // principal-only fields describe the safe rollback revision; they do not
  // turn this attempt back into the one-time migration-073 operation.
  if (intent.appliedMigrationContinuation) return 'special_recovery'
  if (intent.principalOnlyRecovery || intent.principalOnlyFenceRef) return 'principal_only'
  // baselineIntentRef is ordinary provenance for the currently serving
  // revision; only continuation/abort/cleanup bindings are special paths.
  if (intent.appliedMigrationContinuation || intent.postAbortLedgerReadbackRef || intent.unlinkedProfileCleanupRef) return 'special_recovery'
  if (cutover === true) return 'one_time_cutover'
  if (executionMode === 'build_only') return 'build_only'
  if (executionMode !== 'full_release') fail('RELEASE_EXECUTION_MODE_INVALID')
  return 'full_release'
}

export function requiresPrincipalOnlyMigrationFence(intent = {}) {
  return Boolean(intent.principalOnlyRecovery || intent.principalOnlyFenceRef) &&
    !Object.hasOwn(intent, 'appliedMigrationContinuation')
}

export function requiresPrincipalOnlyRuntimeAuthority(intent = {}) {
  return Boolean(intent.principalOnlyRecovery) &&
    !Object.hasOwn(intent, 'appliedMigrationContinuation')
}

export function assertDailyReleaseMode({ mode, workflowRef = '', requiredWorkflowRef = null } = {}) {
  if (requiredWorkflowRef !== null && workflowRef !== requiredWorkflowRef) fail('DAILY_RELEASE_WORKFLOW_CONTEXT_INVALID')
  const dailyWorkflow = requiredWorkflowRef !== null || /\/deploy-ai-pdm-independent-production\.yml@refs\/heads\/main$/u.test(String(workflowRef))
  if (dailyWorkflow && !['full_release', 'build_only'].includes(mode)) fail('SPECIAL_RELEASE_MODE_OUTSIDE_DAILY_PATH', mode)
  return true
}

export function profileForReleaseMode(profile, mode) {
  if (!profile || mode === 'one_time_cutover' || profile.dataCutover?.gateMode !== 'CUTOVER_OR_LIVE_AUTHORITY') return profile
  return { ...profile, dataCutover: { ...profile.dataCutover, gateMode: 'HISTORICAL_ONLY' } }
}

function assertHash(value, code) {
  if (!H64.test(value ?? '')) fail(code)
}

function assertDate(value, code) {
  if (!Number.isFinite(Date.parse(value ?? ''))) fail(code)
  return Date.parse(value)
}

/**
 * The only normalized release evidence model consumed by the offline chain.
 * Raw receipts are accepted at this boundary and are not returned to later
 * consumers; source lineage, scope, deadline and migration disposition are
 * represented once here.
 */
export function normalizeReleaseEvidence({ intent, source, receipts = {}, migration = null, runtimeConfig = null, readiness = null, executionMode = 'full_release', workflowRef = '', requiredWorkflowRef = null, cutover = false, now } = {}) {
  const mode = classifyReleaseMode({ intent, executionMode, cutover })
  if (requiredWorkflowRef !== null) assertDailyReleaseMode({ mode, workflowRef, requiredWorkflowRef })
  if (!intent || !H40.test(intent.sourceRevision ?? '') || !H64.test(intent.sourceSha256 ?? '')) fail('RELEASE_EVIDENCE_SOURCE_INVALID')
  if (!source || source.sourceRevision !== intent.sourceRevision || source.sourceSha256 !== intent.sourceSha256) fail('RELEASE_EVIDENCE_SOURCE_JOIN_INVALID')
  assertHash(source.sourceSha256, 'RELEASE_EVIDENCE_SOURCE_INVALID')
  const observedAt = now ?? new Date().toISOString()
  const observedMs = assertDate(observedAt, 'RELEASE_EVIDENCE_CLOCK_INVALID')
  const deadlineMs = assertDate(intent.deadlineAt, 'RELEASE_EVIDENCE_DEADLINE_INVALID')
  if (deadlineMs <= observedMs) fail('RELEASE_EVIDENCE_DEADLINE_EXPIRED')

  // PROVIDER is retained for the shared executor's non-AI-PDM harnesses. The
  // AI-PDM producer still emits the production-specific scopes above.
  const scopes = new Set(['PROVIDER', 'PRODUCTION_BOUND', 'PRODUCTION_PROVIDER', 'PRODUCTION_PROVIDER_REUSE'])
  if (requiredWorkflowRef === null) scopes.add('LOCAL_TEST')
  const normalizedReceipts = {}
  for (const [name, value] of Object.entries(receipts)) {
    if (!value || typeof value !== 'object') fail('RELEASE_EVIDENCE_RECEIPT_INVALID', name)
    if (!scopes.has(value.evidenceScope) || value.releaseAuthority !== true) fail('RELEASE_EVIDENCE_SCOPE_INVALID', name)
    const authorityExpiresAt = value.expiresAt ?? intent.deadlineAt
    const expiresMs = assertDate(authorityExpiresAt, 'RELEASE_EVIDENCE_DEADLINE_INVALID')
    if (expiresMs <= observedMs) fail('RELEASE_EVIDENCE_DEADLINE_INVALID', name)
    const expiresAt = new Date(Math.min(expiresMs, deadlineMs)).toISOString()
    normalizedReceipts[name] = {
      schemaVersion: value.schemaVersion ?? null,
      evidenceScope: value.evidenceScope,
      status: value.status ?? null,
      expiresAt,
      authorityExpiresAt,
    }
  }

  let migrationModel = null
  if (migration) {
    if (typeof migration !== 'object' || !['PASS', 'HISTORICAL_EVIDENCE_REUSED'].includes(migration.status)) fail('RELEASE_EVIDENCE_MIGRATION_INVALID')
    if (migration.sourceRevision !== intent.sourceRevision && migration.sourceRevision !== source.migrationRunnerRevision) fail('RELEASE_EVIDENCE_MIGRATION_SOURCE_JOIN_INVALID')
    migrationModel = {
      status: migration.status,
      sourceRevision: migration.sourceRevision,
      manifestSha256: migration.manifestSha256 ?? intent.migrationManifestSha256 ?? null,
      databaseLiveState: migration.databaseLiveState ?? (migration.status === 'PASS' ? 'READBACK_VERIFIED' : 'UNKNOWN'),
    }
  }

  return structuredClone({
    schemaVersion: 'jenfu.dev117.release-evidence.v1',
    mode,
    source: {
      applicationRevision: intent.sourceRevision,
      applicationSha256: intent.sourceSha256,
      migrationRunnerRevision: source.migrationRunnerRevision ?? null,
      migrationManifestSha256: intent.migrationManifestSha256 ?? source.migrationManifestSha256 ?? null,
    },
    deadlineAt: intent.deadlineAt,
    observedAt,
    receipts: normalizedReceipts,
    runtimeConfig: runtimeConfig ? structuredClone(runtimeConfig) : null,
    readiness: readiness ? structuredClone(readiness) : null,
    migration: migrationModel,
    specialIntentFields: SPECIAL_INTENT_FIELDS.filter(name => Object.hasOwn(intent, name)),
  })
}

const FAILURE_FAMILIES = Object.freeze([
  ['SOURCE_LINEAGE', /(?:SOURCE|HASH|JOIN|REVISION|TREE)/u],
  ['RECEIPT_SCHEMA', /(?:RECEIPT|SCHEMA|CONTRACT)/u],
  ['DEADLINE', /(?:DEADLINE|CLOCK|TIME|EXPIR)/u],
  ['IAM_CONTINUATION', /(?:IAM|SECRET|WIF|AUTH)/u],
  ['MIGRATION_STATE', /(?:MIGRATION|LEDGER|DATABASE)/u],
  ['WORKER_ARTIFACT', /(?:WORKER|OPENSWX|DESCRIPTOR|PROFILE)/u],
])

export function classifyFailureFamily(code) {
  const normalized = String(code ?? 'UNKNOWN_FAILURE').toUpperCase()
  return FAILURE_FAMILIES.find(([, pattern]) => pattern.test(normalized))?.[0] ?? normalized.split('_')[0]
}

export function evaluateRepeatedFailure(history = [], currentCode) {
  const family = classifyFailureFamily(currentCode)
  const prior = Array.isArray(history) ? history.filter(row => classifyFailureFamily(row?.code) === family) : []
  const occurrences = prior.length + 1
  return {
    family,
    occurrences,
    limit: 2,
    action: occurrences >= 2 ? 'TRIGGER_AI_COO_REVIEW' : 'CONTINUE',
  }
}

export function specialIntentFields() {
  return [...SPECIAL_INTENT_FIELDS]
}
