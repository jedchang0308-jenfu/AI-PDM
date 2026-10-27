import { assertMigrationBundle, assertStageReceipt, canonicalize, createMigrationBundle, sha256 } from './dev012-production-migration-runner.mjs'
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

// The old ledger35 continuation remains unchanged. This separate binding indexes
// the native38 result of the subsequent schema-only attempt; it never makes the
// old ledger probe evidence about the current database.
export function assertForwardAppliedMigrationContinuation(value, bucket = DEFAULT_BUCKET) {
  exact(value, ['schemaVersion', 'priorIntentRef', 'priorPrepareRef', 'priorMigrationAdmissionRef'])
  if (value.schemaVersion !== 'aipdm.forward-applied-migration-continuation.v1') fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
  for (const key of ['priorIntentRef', 'priorPrepareRef', 'priorMigrationAdmissionRef']) exactRef(value[key])
  const match = new RegExp(`^gs://${bucket}/receipts/releases/([A-Z0-9][A-Z0-9-]{5,63})/release-intent\\.json$`, 'u').exec(value.priorIntentRef.uri)
  const root = match && `gs://${bucket}/receipts/releases/${match[1]}/${value.priorIntentRef.sha256}`
  if (!root || value.priorPrepareRef.uri !== `${root}/prepare.json`
    || value.priorMigrationAdmissionRef.uri !== `${root}/migration-admission.json`) fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
  return value
}

export function forwardAppliedMigrationProofRefs(binding, prior, admission, bucket = DEFAULT_BUCKET) {
  assertForwardAppliedMigrationContinuation(binding, bucket)
  if (canonicalize(admission?.ref) !== canonicalize(binding.priorMigrationAdmissionRef)) fail('APPLIED_FORWARD_CONTINUATION_PROOF_INVALID')
  assertStageReceipt(admission.value, { ownerApplicationId: 'ai-pdm', releaseId: prior.releaseId, sourceRevision: prior.sourceRevision, stage: 'migrate' })
  const migrate = admission.value.facts?.migrationReceiptRef
  exactRef(migrate)
  if (admission.value.facts.disposition !== 'FORWARD_APPLIED' || Object.hasOwn(admission.value.facts, 'schemaStageOnly')
    || migrate.uri !== binding.priorPrepareRef.uri.replace(/prepare\.json$/u, 'migrate.json')) fail('APPLIED_FORWARD_CONTINUATION_PROOF_INVALID')
  return { prepare: binding.priorPrepareRef, migrate, terminal: null }
}

export function assertForwardAppliedMigrationGraph({ binding, currentIntent, observed, graph, admission, profile, isAncestor }) {
  assertForwardAppliedMigrationContinuation(binding, profile.artifact.releaseBucket)
  const prior = graph?.intent, history = graph?.migrationHistory
  const same = (left, right) => canonicalize(left) === canonicalize(right)
  if (!prior || canonicalize(currentIntent.forwardAppliedMigrationContinuation) !== canonicalize(binding)
    || prior.releaseId === currentIntent.releaseId || Object.hasOwn(prior, 'forwardAppliedMigrationContinuation')
    || prior.appliedMigrationContinuation?.schemaVersion !== 'aipdm.applied-migration-continuation.v1'
    || !same(currentIntent.appliedMigrationContinuation, prior.appliedMigrationContinuation)
    || typeof isAncestor !== 'function' || !isAncestor(prior.sourceRevision, currentIntent.sourceRevision)
    || observed?.proof?.disposition !== 'migration_only' || observed.proof.sourceRevision !== prior.sourceRevision
    || Object.hasOwn(observed.proof, 'terminal') || observed.provider?.status !== 'BUILD_IMAGE_VERIFIED'
    || !same(graph.intentRef, binding.priorIntentRef) || !same(graph.prepare?.ref, binding.priorPrepareRef)
    || graph.terminal !== null || graph.migrationMode !== 'FORWARD_APPLIED'
    || graph.appliedMigrationOnly !== true || !history || history.installed?.bundle?.entries?.length !== 38
    || history.installed.receipt?.ledgerCount !== 38 || !same(history.installed.receiptRef, graph.migrate?.ref)
    || !same(admission?.ref, binding.priorMigrationAdmissionRef)) fail('APPLIED_FORWARD_CONTINUATION_PROOF_INVALID')
  forwardAppliedMigrationProofRefs(binding, prior, admission, profile.artifact.releaseBucket)
  const facts = admission.value.facts
  if (facts?.disposition !== 'FORWARD_APPLIED' || facts.sourceRevision !== prior.sourceRevision
    || facts.manifestSha256 !== prior.migrationManifestSha256
    || !same(admission.value.previousReceiptRef, graph.chain?.deployment?.ref)
    || !same(facts.migrationReceiptRef, graph.migrate.ref)) fail('APPLIED_FORWARD_CONTINUATION_PROOF_INVALID')
  return history
}

export function assertForwardMigrationAssociation(value, { intent, deploymentRef, history }) {
  assertStageReceipt(value, { ownerApplicationId: 'ai-pdm', releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, stage: 'migrate' })
  const facts = value.facts
  exact(facts, ['disposition', 'sourceRevision', 'manifestSha256', 'migrationReceiptRef', 'forwardAppliedMigrationContinuation', 'migrationJobSubmitted', 'migrationJobSubmissions', 'currentDatabaseReadPerformed', 'databaseLiveState'])
  if (!intent.forwardAppliedMigrationContinuation || facts.disposition !== 'HISTORICAL_EVIDENCE_REUSED'
    || facts.sourceRevision !== intent.sourceRevision || facts.manifestSha256 !== intent.migrationManifestSha256
    || canonicalize(value.previousReceiptRef) !== canonicalize(deploymentRef)
    || canonicalize(facts.forwardAppliedMigrationContinuation) !== canonicalize(intent.forwardAppliedMigrationContinuation)
    || canonicalize(facts.migrationReceiptRef) !== canonicalize(history.installed.receiptRef)
    || facts.migrationJobSubmitted !== false || facts.migrationJobSubmissions !== 0 || facts.currentDatabaseReadPerformed !== false
    || facts.databaseLiveState !== 'UNKNOWN') fail('APPLIED_FORWARD_CONTINUATION_PROOF_INVALID')
  return value
}

// An applied-migration continuation preserves the already sealed application
// runtime. DEV-125 retired the legacy worker runtime binding; a continuation
// may therefore carry neither its environment flag nor descriptor.
export function assertAppliedContinuationRuntimeBinding(runtimeConfig, intent) {
  if (Object.hasOwn(runtimeConfig?.plainEnvironment ?? {}, 'PDM_OPENSWX_DISPATCH_ENABLED')
    || Object.hasOwn(runtimeConfig ?? {}, 'openswxWorker')
    || Object.hasOwn(intent ?? {}, 'openswxWorkerRef')) fail('APPLIED_MIGRATION_CONTINUATION_RUNTIME_INVALID')
}

// Historical applied-migration evidence may predate DEV-125 and therefore
// retain the sealed DEV-122 worker binding. Validate that closed shape exactly;
// callers must keep using assertAppliedContinuationRuntimeBinding for every
// newly produced runtime and release intent.
export function assertHistoricalAppliedContinuationRuntimeBinding(runtimeConfig, intent, bucket = DEFAULT_BUCKET) {
  const worker = runtimeConfig?.openswxWorker
  const ref = intent?.openswxWorkerRef
  const hasRetired = worker != null || ref != null ||
    Object.hasOwn(runtimeConfig?.plainEnvironment ?? {}, 'PDM_OPENSWX_DISPATCH_ENABLED') ||
    Object.hasOwn(runtimeConfig?.secretVersions ?? {}, 'PDM_WORKLOAD_AUTH_CREDENTIALS')
  if (!hasRetired) return assertAppliedContinuationRuntimeBinding(runtimeConfig, intent)
  const workerKeys = ['descriptorRef', 'purpose', 'sourceRevision', 'workerProfileSha256']
  if (!worker || !ref || JSON.stringify(Object.keys(worker).sort()) !== JSON.stringify(workerKeys.sort()) ||
      canonicalize(worker.descriptorRef) !== canonicalize(ref) || worker.purpose !== 'full' ||
      !H40.test(worker.sourceRevision ?? '') || !H64.test(worker.workerProfileSha256 ?? '') ||
      runtimeConfig.plainEnvironment?.PDM_OPENSWX_DISPATCH_ENABLED !== '1' ||
      !/^[1-9][0-9]*$/u.test(runtimeConfig.secretVersions?.PDM_WORKLOAD_AUTH_CREDENTIALS ?? '') ||
      !H64.test(ref.sha256 ?? '') || !new RegExp(`^gs://${bucket}/receipts/dev-122/openswx-worker/[A-Za-z0-9][A-Za-z0-9._/-]*\\.json$`, 'u').test(ref.uri ?? '') ||
      ref.uri.includes('..')) fail('APPLIED_MIGRATION_CONTINUATION_RUNTIME_INVALID')
  return { retainedHistoricalBinding: true }
}

export function assertHistoricalAppliedContinuationRuntimeConfig(profile, runtimeConfig, intent, assertRuntimeConfig) {
  if (typeof assertRuntimeConfig !== 'function') fail('APPLIED_MIGRATION_CONTINUATION_RUNTIME_INVALID')
  const result = assertHistoricalAppliedContinuationRuntimeBinding(runtimeConfig, intent, profile?.artifact?.releaseBucket ?? DEFAULT_BUCKET)
  if (!result?.retainedHistoricalBinding) return assertRuntimeConfig(profile, runtimeConfig)
  const normalizedProfile = structuredClone(profile)
  const normalizedRuntime = structuredClone(runtimeConfig)
  const environment = normalizedProfile.environment ?? {}
  for (const name of ['requiredPlainEnvironmentNames', 'requiredNames', 'requiredSecretNames']) {
    if (Array.isArray(environment[name])) environment[name] = environment[name].filter(value =>
      value !== 'PDM_OPENSWX_DISPATCH_ENABLED' && value !== 'PDM_WORKLOAD_AUTH_CREDENTIALS')
  }
  for (const name of ['fixedValues', 'controlledValues', 'allowedSecretIds', 'secretIds']) {
    if (environment[name] && typeof environment[name] === 'object' && !Array.isArray(environment[name])) {
      delete environment[name].PDM_OPENSWX_DISPATCH_ENABLED
      delete environment[name].PDM_WORKLOAD_AUTH_CREDENTIALS
    }
  }
  if (environment.optionalExtensions && typeof environment.optionalExtensions === 'object') delete environment.optionalExtensions.openswxDispatch
  delete normalizedRuntime.openswxWorker
  delete normalizedRuntime.plainEnvironment.PDM_OPENSWX_DISPATCH_ENABLED
  delete normalizedRuntime.secretVersions.PDM_WORKLOAD_AUTH_CREDENTIALS
  for (const container of normalizedRuntime.template?.containers ?? []) {
    if (Array.isArray(container.env)) container.env = container.env.filter(row =>
      row?.name !== 'PDM_OPENSWX_DISPATCH_ENABLED' && row?.name !== 'PDM_WORKLOAD_AUTH_CREDENTIALS')
  }
  normalizedRuntime.serviceTemplateSha256 = sha256(canonicalize(normalizedRuntime.template))
  return assertRuntimeConfig(normalizedProfile, normalizedRuntime)
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
  // The sealed readback proves only the installed35 prefix. Newly reviewed
  // migrations must run through the normal forward migrator, never that probe.
  if (installedBundle?.entries?.length !== 35) fail('APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID')
  const retainedDeclarations = installedBundle.entries.map(({ order, path, sourceSha256 }) => ({ order, path, sha256: sourceSha256 }))
  const declaredEntries = profile?.migrations?.entries
  if (!Array.isArray(declaredEntries) || canonicalize(declaredEntries.slice(0, 35)) !== canonicalize(retainedDeclarations)) fail('MIGRATION_HISTORICAL_PREFIX_INVALID')
  const historicalProfile = { ...profile, migrations: { ...profile.migrations, entries: declaredEntries.slice(0, 35) } }
  assertRdReadbackSourceCompatibility({ profile: historicalProfile, root,
    workflowSourceRevision: readbackIntent?.workflowSourceRevision,
    runnerSourceRevision: readbackIntent?.runnerSourceRevision,
    ancestorRunner, compatibilityRunner })
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
