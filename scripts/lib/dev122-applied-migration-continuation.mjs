import { assertMigrationBundle, canonicalize, createMigrationBundle } from './dev012-production-migration-runner.mjs'
import {
  assertRdLedgerReadbackIntent,
  assertRdReadbackExecutionReceipt,
  assertRdReadbackJobReceipt,
  assertRdReadbackNativeReceipt,
  assertRdReadbackResult,
  assertRdReadbackResultRef,
  assertRdReadbackSourceCompatibility,
  buildRdLedgerProbeBundles,
} from './dev122-rd-permission-ledger-readback.mjs'

const DEFAULT_BUCKET = 'jenfu-platform-prod-aipdm-release'
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
}

function exactRef(value) {
  exact(value, ['uri', 'sha256'])
  if (!H64.test(value.sha256 ?? '')) fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
  return value
}

/**
 * A release attempt may finish its database write before its owner failure
 * handler can publish terminal/control state. Keep that installed database
 * fact separate from the still-active service baseline and bind only exact,
 * immutable receipts. Semantic/provider validation remains in the owner stage
 * executor before any later stage is allowed to mutate production.
 */
export function assertAppliedMigrationContinuation(value, bucket = DEFAULT_BUCKET) {
  exact(value, ['schemaVersion', 'sourceRevision', 'prepareRef', 'migrateRef', 'ledgerReadbackResultRef'])
  if (value.schemaVersion !== 'aipdm.applied-migration-continuation.v1' || !H40.test(value.sourceRevision ?? '') ||
      typeof bucket !== 'string' || !bucket) fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
  exactRef(value.prepareRef); exactRef(value.migrateRef); exactRef(value.ledgerReadbackResultRef)
  const root = new RegExp(`^gs://${bucket}/receipts/releases/([A-Z0-9][A-Z0-9-]{5,63})/([a-f0-9]{64})/prepare\\.json$`, 'u')
    .exec(value.prepareRef.uri ?? '')
  if (!root || !RELEASE_ID.test(root[1]) || value.migrateRef.uri !==
      `gs://${bucket}/receipts/releases/${root[1]}/${root[2]}/migrate.json` ||
      !new RegExp(`^gs://${bucket}/receipts/releases/[A-Z0-9][A-Z0-9-]{5,63}/[a-f0-9]{64}/ledger-readback-result\\.json$`, 'u')
        .test(value.ledgerReadbackResultRef.uri ?? '')) fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
  return value
}

// An applied-migration continuation preserves the already sealed application
// runtime while deliberately excluding worker evidence from the RD release
// decision. Only the retained runtime/ref join remains in this authority;
// worker profile, artifact and Secret semantics belong to the worker release.
export function assertAppliedContinuationRuntimeBinding(runtimeConfig, intent) {
  const flag = runtimeConfig?.plainEnvironment?.PDM_OPENSWX_DISPATCH_ENABLED ?? '0'
  if (!intent.openswxWorkerRef) {
    if (flag !== '0' || runtimeConfig?.openswxWorker) fail('APPLIED_MIGRATION_CONTINUATION_RUNTIME_INVALID')
    return
  }
  const binding = runtimeConfig?.openswxWorker
  if (flag !== '1' || !binding || binding.purpose !== 'full'
    || !H40.test(binding.sourceRevision ?? '') || !H64.test(binding.workerProfileSha256 ?? '')
    || canonicalize(binding.descriptorRef) !== canonicalize(intent.openswxWorkerRef)) fail('APPLIED_MIGRATION_CONTINUATION_RUNTIME_INVALID')
}

// Candidate identity and artifact digest are already proven by the provider
// readback sealed in the candidate receipt. HTTP probes verify only the RD
// slice's observable behaviour; they must not create a second source of truth
// by requiring the application to echo provider provenance headers.
// Positive/negative RD authorization is verified after activation with the
// dedicated RD test actor. A generic principal refresh token is neither that
// actor nor evidence about catalog, grant or permission enforcement, so it
// must not gate this continuation.
export function appliedRdPermissionSmokeSuite() {
  return {
    probes: [
      { id: 'rd-candidate-ready', method: 'GET', path: '/api/health/ready', expectedStatus: 200, requireProvenance: false },
      { id: 'rd-permission-unauthenticated-denied', method: 'GET', path: '/api/numbering/permissions', expectedStatus: 401, requireProvenance: false },
    ],
  }
}

export function assertAppliedMigrationSource(binding, currentSourceRevision, isAncestor) {
  assertAppliedMigrationContinuation(binding)
  if (!H40.test(currentSourceRevision ?? '') || typeof isAncestor !== 'function' ||
      !isAncestor(binding.sourceRevision, currentSourceRevision)) fail('APPLIED_MIGRATION_CONTINUATION_SOURCE_INVALID')
  return binding
}

export function assertAppliedMigrationReadbackSource({ readbackIntent, profile, fullMigration, installedBundle, root, ancestorRunner = null, compatibilityRunner = null }) {
  assertRdReadbackSourceCompatibility({ profile, root,
    workflowSourceRevision: readbackIntent?.workflowSourceRevision,
    runnerSourceRevision: readbackIntent?.runnerSourceRevision,
    ancestorRunner, compatibilityRunner })
  // The sealed readback proves only the installed35 prefix. Newly reviewed
  // migrations must run through the normal forward migrator, never that probe.
  if (installedBundle?.entries?.length !== 35) fail('APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID')
  const target = { ownerApplicationId: installedBundle.ownerApplicationId, ledger: installedBundle.ledger, baselineCount: installedBundle.baselineCount }
  assertMigrationBundle(fullMigration?.bundle, { target, sourceRevision: fullMigration?.bundle?.sourceRevision,
    bytes: fullMigration?.bytes, bundleSha256: fullMigration?.bundleSha256 })
  if (canonicalize(fullMigration.bundle.entries.slice(0, 35)) !== canonicalize(installedBundle.entries)) fail('MIGRATION_HISTORICAL_PREFIX_INVALID')
  const historical = createMigrationBundle({ target, sourceRevision: fullMigration.bundle.sourceRevision, entries: structuredClone(installedBundle.entries) })
  const probes = buildRdLedgerProbeBundles(historical)
  // The readback intent already seals the exact historical profile used by its
  // producer. A later release may change unrelated runtime or workflow fields;
  // those fields are not evidence about whether migrations 083-085 are
  // installed. Re-validate only the current migration projection here. The
  // provider Job, runner digest and immutable receipt chain are checked by the
  // readback consumer below.
  assertRdLedgerReadbackIntent(readbackIntent, { probes })
  return { probes }
}

export async function readAppliedMigrationReadbackEvidence({ binding, profile, readJson, history, deployment, sourceVerification }) {
  assertAppliedMigrationContinuation(binding, profile?.artifact?.releaseBucket)
  if (typeof readJson !== 'function' || !history?.installed?.receipt || !deployment ||
      typeof sourceVerification !== 'function') fail('APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID')
  const resultRow = await readJson(binding.ledgerReadbackResultRef)
  const result = assertRdReadbackResult(resultRow.value)
  assertRdReadbackResultRef(binding.ledgerReadbackResultRef, result)
  const readbackIntentRow = await readJson(result.readbackIntentRef)
  const readbackIntent = assertRdLedgerReadbackIntent(readbackIntentRow.value)
  assertRdReadbackResult(result, { intent: readbackIntent, intentRef: result.readbackIntentRef })
  await sourceVerification(readbackIntent)
  const jobRow = await readJson(result.jobReadbackRef)
  assertRdReadbackJobReceipt(jobRow.value, { intent: readbackIntent, intentRef: result.readbackIntentRef, profile })
  let successfulExecution = null
  for (const attempt of result.attempts) {
    const executionRow = await readJson(attempt.executionReadbackRef)
    const probe = readbackIntent.probes.find(row => row.ledgerCount === attempt.ledgerCount)
    const execution = assertRdReadbackExecutionReceipt(executionRow.value, { intent: readbackIntent, intentRef: result.readbackIntentRef, probe })
    const expectedStatus = attempt.status === 'PASS' ? 'PASS' : 'EXPECTED_READ_ONLY_PROBE_FAILURE'
    if (execution.status !== expectedStatus || (attempt.status === 'PASS' &&
        canonicalize(attempt.nativeReceiptRef) !== canonicalize(result.nativeReceiptRef))) {
      fail('APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID')
    }
    if (attempt.status === 'PASS') successfulExecution = execution
  }
  if (!successfulExecution) fail('APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID')
  const nativeRow = await readJson(result.nativeReceiptRef)
  const successfulProbe = readbackIntent.probes.find(row => row.ledgerCount === result.ledgerCount)
  const native = assertRdReadbackNativeReceipt(nativeRow.value, {
    intent: readbackIntent, probe: successfulProbe, executionName: successfulExecution.executionName.split('/').at(-1),
  })
  const successfulAttempt = result.attempts.at(-1)
  if (result.ledgerCount !== 35 || result.migration085State !== 'APPLIED' || result.databaseMutationExpected !== false ||
      result.workflowSourceRevision !== binding.sourceRevision || result.runnerSourceRevision !== deployment.migrationRunnerSourceRevision ||
      result.migrationRunnerDigest !== deployment.migrationRunnerDigest || history.installed.receipt.ledgerCount !== result.ledgerCount ||
      successfulAttempt.completedAt !== native.completedAt || Date.parse(native.startedAt) < Date.parse(successfulExecution.createTime) ||
      Date.parse(native.completedAt) > Date.parse(successfulExecution.completionTime) ||
      Date.parse(result.observedAt) < Date.parse(history.installed.receipt.completedAt) || Date.parse(native.completedAt) < Date.parse(history.installed.receipt.completedAt) ||
      canonicalize(result.nativeReceiptRef) !== canonicalize(successfulAttempt.nativeReceiptRef)) fail('APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID')
  return { result, readbackIntent, native, successfulExecution }
}
