import { canonicalize } from './dev012-production-migration-runner.mjs'
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

export function assertAppliedMigrationSource(binding, currentSourceRevision, isAncestor) {
  assertAppliedMigrationContinuation(binding)
  if (!H40.test(currentSourceRevision ?? '') || typeof isAncestor !== 'function' ||
      !isAncestor(binding.sourceRevision, currentSourceRevision)) fail('APPLIED_MIGRATION_CONTINUATION_SOURCE_INVALID')
  return binding
}

export function assertAppliedMigrationReadbackSource({ readbackIntent, profile, fullMigration, root, ancestorRunner = null, compatibilityRunner = null }) {
  assertRdReadbackSourceCompatibility({ profile, root,
    workflowSourceRevision: readbackIntent?.workflowSourceRevision,
    runnerSourceRevision: readbackIntent?.runnerSourceRevision,
    ancestorRunner, compatibilityRunner })
  const probes = buildRdLedgerProbeBundles(fullMigration)
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
