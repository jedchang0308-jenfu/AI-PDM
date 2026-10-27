import { assertProgramOnlyPolicy, assertProgramOnlyExecution, assertProgramOnlyStaticJob, assertProgramOnlyNative, assertProgramOnlySubmission, readProgramOnlyBundles, programOnlyNativeUri, readProgramOnlyReleaseWindow, PROGRAM_ONLY_DISPOSITION } from './dev117-ai-pdm-program-only-baseline.mjs'
import { assertDev117ReleaseIntent } from './dev117-ai-pdm-continuous-release.mjs'
import { assertImmutableRef, assertMigrationSubmissionIntent, canonicalize, migrationSubmissionIntentUri, releasePaths, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertHistoricalPrincipalOnlyRecoveryReadback, assertPrincipalOnlyRecoveryBinding, assertRecoveryProofReadback } from './dev121-principal-only-release.mjs'
import { assertMigration, assertStage, createAiPdmEvidenceContext, runAiPdmEvidenceContext, descendAiPdmEvidenceContext, readAiPdmObservationInputs } from './dev121-owner-release-proof.mjs'
import {
  assertRdLedgerReadbackIntent,
  assertRdReadbackExecutionReceipt,
  assertRdReadbackJob,
  assertRdReadbackJobReceipt,
  assertRdReadbackNativeReceipt,
  assertRdReadbackResult,
  assertRdReadbackResultRef,
  rdReadbackIntentUri,
  rdReadbackJobEnvironment,
  rdReadbackProbeArguments,
  rdReadbackSha256,
  RD_LEDGER_READBACK_PGOPTIONS,
} from './dev122-rd-permission-ledger-readback.mjs'
import {
  RD_PERMISSION_STATE_PGOPTIONS,
  RD_PERMISSION_STATE_RECEIPT_PREFIX,
  assertPermissionStateOperation,
  assertPermissionStateReceipt,
  parsePermissionStateArgs,
} from './dev122-rd-permission-state-readback.mjs'
import { assertAppliedMigrationContinuation, readAppliedMigrationReadbackEvidence } from './dev122-applied-migration-continuation.mjs'

const same = (a, b) => canonicalize(a) === canonicalize(b)
const H40 = /^[a-f0-9]{40}$/u
const fail = () => { throw new Error('DEV121_PREACTIVATION_CONTINUATION_INVALID') }
const traffic = (rows, revision) => Array.isArray(rows) && rows.length === 1
  && rows[0].revision === revision && Number(rows[0].percent) === 100 && !rows[0].tag

// A finalized abort is not a successful release or a maintenance rollback.
// Certify the cleaned, still-stopped original traffic before preparing a retry.
export async function readPreActivationAbortContinuation({ profile, transport, baselineIntentRef, service = null, control = null, verifyProvider = false, postAbortLedgerReadbackRef = null, principalOnlyFenceRef = null, principalOnlyRecovery = null, appliedMigrationContinuation = null }) {
  const bucket = profile.artifact.releaseBucket
  const readContinuation = async () => {
  const baseline = await transport.readJson(baselineIntentRef, bucket, ['receipts'])
  const intent = baseline.value
  if (intent?.ownerApplicationId !== profile.application.id || !/^[a-f0-9]{40}$/u.test(intent.sourceRevision ?? '')) fail()
  const paths = releasePaths(profile, intent, baselineIntentRef.sha256)
  const read = async (uri) => {
    const row = await transport.readBytes(uri, { prefixes: ['receipts'] })
    if (row.ref.uri !== uri || row.ref.sha256 !== sha256(row.bytes)) fail()
    return { ...row, value: JSON.parse(row.bytes.toString('utf8')) }
  }
  const seal = (row, stage) => {
    const { receiptSha256, ...core } = row.value ?? {}
    if (receiptSha256 !== sha256(canonicalize(core)) || core.schemaVersion !== 'jenfu.dev012.stage-receipt.v1'
      || core.ownerApplicationId !== profile.application.id || core.releaseId !== intent.releaseId
      || core.sourceRevision !== intent.sourceRevision || core.stage !== stage || core.status !== 'PASS') fail()
    return core.facts
  }
  const terminal = await read(paths.terminal)
  const terminalFacts = seal(terminal, 'terminal')
  if (terminalFacts.result === 'RELEASED') return null
  const appliedRollback = terminalFacts.result === 'ROLLED_BACK'
    && appliedMigrationContinuation && terminalFacts.databaseDisposition === 'HISTORICAL_EVIDENCE_REUSED'
  if (terminalFacts.result === 'ROLLED_BACK' && !appliedRollback) return null
  if (terminalFacts.result !== 'PRE_ACTIVATION_ABORTED' && !appliedRollback) fail()
  if (!control) control = JSON.parse((await transport.readBytes(`gs://${bucket}/control/active.json`, { prefixes: ['control'] })).bytes)
  if (control.result !== terminalFacts.result) fail()
  if (appliedMigrationContinuation && terminalFacts.databaseDisposition === 'NOT_APPLIED') {
    return readAppliedContinuationPreexecutionAbort({ profile, transport, baselineIntentRef, intent, paths, terminal,
      terminalFacts, control, service, read, seal, postAbortLedgerReadbackRef, principalOnlyFenceRef,
      principalOnlyRecovery, appliedMigrationContinuation })
  }
  if (appliedMigrationContinuation && terminalFacts.databaseDisposition === 'HISTORICAL_EVIDENCE_REUSED') {
    return readAppliedContinuationCandidateAbort({ profile, transport, baselineIntentRef, intent, paths, terminal,
      terminalFacts, control, service, read, seal, postAbortLedgerReadbackRef, principalOnlyFenceRef,
      principalOnlyRecovery, appliedMigrationContinuation })
  }
  if (intent.programOnlyBaseline) {
    if (postAbortLedgerReadbackRef || principalOnlyFenceRef || principalOnlyRecovery || appliedMigrationContinuation) fail()
    return readProgramOnlyAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider })
  }
  const binding = assertPrincipalOnlyRecoveryBinding(intent, bucket)
  if (!binding) {
    if (appliedMigrationContinuation) fail()
    return readOrdinaryAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider,
    postAbortLedgerReadbackRef, principalOnlyFenceRef, principalOnlyRecovery })
  }
  // A submitted migration can fail before candidate creation while its database
  // outcome remains unknown. Reconcile that pre-candidate shape through the
  // existing read-only ledger path; the principal recovery binding alone does
  // not prove that migration 085 was applied.
  if (terminalFacts.databaseDisposition === 'UNKNOWN') {
    if (!same(intent.principalOnlyFenceRef, principalOnlyFenceRef)
      || !same(intent.principalOnlyRecovery, principalOnlyRecovery)) fail()
    return readPrebuildAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider,
      postAbortLedgerReadbackRef, principalOnlyFenceRef, principalOnlyRecovery, appliedMigrationContinuation, principalOnlyReconciled: true })
  }
  const [rollback, candidate, deployment, migration, source, proof, revision] = await Promise.all([
    read(paths.rollback), read(paths.candidate), read(paths.deployment), read(paths.migrate),
    transport.readJson(intent.sourceLockRef, bucket, ['receipts']), transport.readJson(binding.receiptRef, bucket, ['receipts']),
    transport.getRevision(profile, binding.revision),
  ])
  const rollbackFacts = seal(rollback, 'rollback'), candidateFacts = seal(candidate, 'candidate')
  if (terminalFacts.result !== 'PRE_ACTIVATION_ABORTED' || rollbackFacts.result !== 'PRE_ACTIVATION_ABORTED'
    || terminalFacts.databaseDisposition !== 'FORWARD_APPLIED' || rollbackFacts.databaseDisposition !== 'FORWARD_APPLIED'
    || terminalFacts.previousRevision !== binding.revision || rollbackFacts.previousRevision !== binding.revision
    || !same(terminal.value.previousReceiptRef, rollback.ref)
    || rollbackFacts.entrypointRecovery?.result !== 'BASELINE_ALREADY_ACTIVE' || rollbackFacts.entrypointRecovery.changed !== false
    || candidateFacts.previousRevision !== intent.previousRevision || !traffic(candidateFacts.beforeTraffic, intent.previousRevision)
    || !same(candidateFacts.deploymentCapsuleRef, deployment.ref) || !same(candidateFacts.migrationReceiptRef, migration.ref)
    || !same(deployment.value.releaseIntentRef, baselineIntentRef) || deployment.value.sourceRevision !== intent.sourceRevision
    || candidateFacts.artifactDigest !== deployment.value.artifactDigest
    || !deployment.value.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`)
    || source.value.status !== 'SOURCE_FROZEN' || source.value.clean !== true || source.value.releaseAuthority !== true
    || source.value.ownerApplicationId !== profile.application.id || source.value.sourceRevision !== intent.sourceRevision
    || source.value.migrationManifestSha256 !== intent.migrationManifestSha256) fail()
  if (migration.value.schemaVersion === 'jenfu.dev012.stage-receipt.v1') {
    const facts = seal(migration, 'migrate')
    if (facts.disposition !== 'UNCHANGED_VERIFIED' || facts.manifestSha256 !== intent.migrationManifestSha256) fail()
  } else if (migration.value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1'
    || migration.value.ownerApplicationId !== profile.application.id || migration.value.sourceRevision !== intent.sourceRevision
    || migration.value.manifestSha256 !== intent.migrationManifestSha256 || migration.value.status !== 'PASS'
    || migration.value.boundaryStatus !== 'PASS') fail()
  const keys = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision',
    'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
  const { controlSha256, ...core } = control
  const prefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = control.ownerRunRef?.startsWith(prefix) ? control.ownerRunRef.slice(prefix.length) : ''
  if (!same(Object.keys(control).sort(), keys.sort()) || controlSha256 !== sha256(canonicalize(core))
    || control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.state !== 'FINALIZED'
    || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName || control.controlBucket !== bucket
    || control.releaseId !== intent.releaseId || control.sourceRevision !== intent.sourceRevision || control.sourceLockSha256 !== intent.sourceLockRef.sha256
    || control.previousRevision !== binding.revision || control.candidateRevision !== candidateFacts.candidateRevision
    || [intent.previousRevision, binding.revision].includes(control.candidateRevision)
    || !/^[a-f0-9]{64}$/u.test(control.inputFingerprint ?? '') || !/^[1-9][0-9]*$/u.test(runId)
    || !Number.isFinite(Date.parse(control.deadlineAt)) || !Number.isFinite(Date.parse(control.leaseExpiresAt))
    || Date.parse(control.leaseExpiresAt) >= Date.now()) fail()
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()
  service ??= await transport.getService(profile)
  if (service.scaling?.scalingMode !== 'MANUAL' || ![0, '0'].includes(service.scaling.manualInstanceCount)
    || !traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)) fail()
  assertRecoveryProofReadback({ sourceRevision: intent.sourceRevision, oldRevision: intent.previousRevision, binding,
    profile, proof: proof.value, service, revision })
  const candidateRevision = await transport.getRevision(profile, candidateFacts.candidateRevision)
  if (candidateRevision.name !== `${service.name}/revisions/${candidateFacts.candidateRevision}`
    || candidateRevision.conditions?.find((row) => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
    || candidateRevision.containers?.find((row) => row.name === profile.runtime.containerName)?.image !== candidateFacts.artifactDigest) fail()
  try { await read(paths.activate); fail() } catch (error) { if (error.code !== 'MISSING') throw error }
  return { currentActiveRevision: intent.previousRevision, terminalRef: terminal.ref, rollbackRef: rollback.ref,
    migrationRef: migration.ref, candidateRef: candidate.ref, result: 'PRE_ACTIVATION_ABORTED' }
  }
  if (profile.application.id !== 'ai-pdm') {
    assertImmutableRef(baselineIntentRef, bucket, ['receipts'])
    return readContinuation()
  }
  const root = createAiPdmEvidenceContext()
  return runAiPdmEvidenceContext(root, async () => {
    assertImmutableRef(baselineIntentRef, bucket, ['receipts'])
    const failedContext = descendAiPdmEvidenceContext(root, baselineIntentRef, true)
    return runAiPdmEvidenceContext(failedContext, readContinuation)
  })
}

// Once the RD catalog migration is sealed as applied, a later release attempt
// can still fail before prepare writes anything.  That retry is governed by the
// current control head, live rollback baseline and the immutable applied-
// migration binding.  Replaying every older abort/cutover/worker branch here
// creates another interpretation of those historical facts and makes a clean
// pre-execution failure impossible to continue from.
async function readAppliedContinuationPreexecutionAbort({ profile, transport, baselineIntentRef, intent, paths, terminal,
  terminalFacts, control, service, read, seal, postAbortLedgerReadbackRef, principalOnlyFenceRef,
  principalOnlyRecovery, appliedMigrationContinuation }) {
  const bucket = profile.artifact.releaseBucket
  try { assertAppliedMigrationContinuation(appliedMigrationContinuation, bucket) } catch { fail() }
  const recovery = assertPrincipalOnlyRecoveryBinding(intent, bucket)
  if (!recovery || !same(intent.appliedMigrationContinuation, appliedMigrationContinuation)
    || !same(intent.postAbortLedgerReadbackRef, postAbortLedgerReadbackRef)
    || !same(intent.principalOnlyFenceRef, principalOnlyFenceRef)
    || !same(intent.principalOnlyRecovery, principalOnlyRecovery)) fail()

  const [rollback, source, proof, recoveryRevision, retainedRevision] = await Promise.all([
    read(paths.rollback), transport.readJson(intent.sourceLockRef, bucket, ['receipts']),
    transport.readJson(recovery.receiptRef, bucket, ['receipts']), transport.getRevision(profile, recovery.revision),
    transport.getRevision(profile, intent.previousRevision),
  ])
  const rollbackFacts = seal(rollback, 'rollback')
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId,
    sourceRevision: intent.sourceRevision, releaseIntentSha256: baselineIntentRef.sha256 }))
  const keys = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision',
    'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
  const { controlSha256, ...controlCore } = control
  const runPrefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = control.ownerRunRef?.startsWith(runPrefix) ? control.ownerRunRef.slice(runPrefix.length) : ''
  const recordedRollbackRevision = control.previousRevision
  const currentWriterRollback = recordedRollbackRevision === intent.previousRevision
  const legacySealedPreexecutionRollback = recordedRollbackRevision === recovery.revision
    && recordedRollbackRevision !== intent.previousRevision
  if (!same(Object.keys(control).sort(), keys.sort()) || controlSha256 !== sha256(canonicalize(controlCore))
    || control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.state !== 'FINALIZED'
    || control.result !== 'PRE_ACTIVATION_ABORTED' || control.inputFingerprint !== fingerprint
    || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName
    || control.controlBucket !== bucket || control.releaseId !== intent.releaseId || control.sourceRevision !== intent.sourceRevision
    || control.sourceLockSha256 !== intent.sourceLockRef.sha256
    || (!currentWriterRollback && !legacySealedPreexecutionRollback)
    || control.candidateRevision !== null || !/^[1-9][0-9]*$/u.test(runId) || control.deadlineAt !== intent.deadlineAt
    || !Number.isFinite(Date.parse(control.deadlineAt)) || !Number.isFinite(Date.parse(control.leaseExpiresAt))
    || Date.parse(control.leaseExpiresAt) >= Date.now() || !same(terminal.value.previousReceiptRef, rollback.ref)
    || terminalFacts.result !== 'PRE_ACTIVATION_ABORTED' || rollbackFacts.result !== 'PRE_ACTIVATION_ABORTED'
    || terminalFacts.previousRevision !== recordedRollbackRevision || rollbackFacts.previousRevision !== recordedRollbackRevision
    || terminalFacts.databaseDisposition !== 'NOT_APPLIED' || rollbackFacts.databaseDisposition !== 'NOT_APPLIED'
    || Object.hasOwn(terminalFacts, 'migrationSubmissionIntentRef') || Object.hasOwn(rollbackFacts, 'migrationSubmissionIntentRef')
    || !same(terminalFacts.entrypointRecovery, { changed: false, result: 'NOT_REQUIRED' })
    || !same(rollbackFacts.entrypointRecovery, terminalFacts.entrypointRecovery)
    || !same(rollbackFacts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])
    || source.ref.sha256 !== intent.sourceLockRef.sha256 || source.value.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1'
    || source.value.ownerApplicationId !== profile.application.id || source.value.releaseId !== intent.releaseId
    || source.value.sourceRevision !== intent.sourceRevision || source.value.sourceSha256 !== intent.sourceSha256
    || source.value.migrationManifestSha256 !== intent.migrationManifestSha256 || source.value.status !== 'SOURCE_FROZEN'
    || source.value.releaseAuthority !== true || source.value.clean !== true) fail()

  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()

  let prepare = null
  try { prepare = await read(paths.prepare) } catch (error) { if (error.code !== 'MISSING') throw error }
  const absentStages = [
    ...(!prepare ? ['prepare'] : []), 'build', 'provenance', 'sbom', 'scan', 'deployment', 'migrate', 'migrationAdmission', 'candidate', 'entrypoint',
    'verify', 'decision', 'activate', 'canonical', 'finalize',
  ]
  await assertAbsentStages(read, paths, absentStages)
  await assertMissing(read, migrationSubmissionIntentUri(profile, paths.migrate))
  let preparedBuild = null
  if (!prepare) {
    await assertZeroBuilds(profile, transport, intent)
  } else {
    const prepareFacts = seal(prepare, 'prepare')
    const prerequisiteRefs = {
      sourceLock: intent.sourceLockRef, authorization: intent.authorizationPolicyRef,
      readiness: intent.readinessReceiptRef, foundation: intent.foundationReceiptRef,
      infra: intent.infraReceiptRef, runtimeConfig: intent.runtimeConfigRef,
    }
    const [authorization, readiness] = await Promise.all([
      transport.readJson(intent.authorizationPolicyRef, bucket, ['receipts']),
      transport.readJson(intent.readinessReceiptRef, bucket, ['receipts']),
    ])
    if (prepare.value.previousReceiptRef !== null || prepareFacts.previousRevision !== intent.previousRevision
      || !same(prepareFacts.prerequisiteRefs, prerequisiteRefs)
      || !same(prepareFacts.preActivationAbortBasis, authorization.value.preActivationAbortBasis)
      || !same(prepareFacts.preActivationAbortBasis, readiness.value.preActivationAbortBasis)
      || !same(terminalFacts.failureSignal, { code: 'ARTIFACT_POLICY_FAILED', family: 'ARTIFACT' })) fail()
    preparedBuild = await readPreparedUnsealedProviderBuild({
      profile, transport, baselineIntentRef, intent, run,
    })
    await assertStableNoMigrationExecution(profile, transport, intent, paths, run)
  }

  service ??= await transport.getService(profile)
  transport.assertServiceSettled(service, 'DEV121_PREACTIVATION_CONTINUATION_INVALID')
  const scalingSafe = (service.scaling?.scalingMode === 'MANUAL' && [0, '0'].includes(service.scaling?.manualInstanceCount))
    || (service.scaling?.scalingMode === 'AUTOMATIC' && Number(service.scaling?.maxInstanceCount) >= 1)
  const retainedApp = retainedRevision?.containers?.filter(row => row.name === profile.runtime.containerName)
  if (!scalingSafe || recovery.serviceUid !== service.uid
    || !traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)
    || retainedRevision?.name !== `${service.name}/revisions/${intent.previousRevision}`
    || retainedRevision.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
    || retainedApp?.length !== 1 || !retainedApp[0].image?.startsWith(`${profile.artifact.uri}@sha256:`)) fail()
  transport.assertCanonicalEntrypoint(profile, service)
  if (prepare && !same(seal(prepare, 'prepare').entrypointBaseline, transport.entrypointSnapshot(service))) fail()
  assertHistoricalPrincipalOnlyRecoveryReadback({ intent, profile, proof: proof.value,
    service, revision: recoveryRevision })

  return { kind: 'APPLIED_MIGRATION_ABORT', currentActiveRevision: intent.previousRevision,
    result: 'PRE_ACTIVATION_ABORTED', authorityBasis: {
      schemaVersion: 'aipdm.applied-migration-abort-basis.v1', failedIntentRef: baselineIntentRef,
      appliedMigrationContinuation, postAbortLedgerReadbackRef, principalOnlyFenceRef, principalOnlyRecovery,
      failedSourceLockRef: source.ref, previousRevision: intent.previousRevision, serviceUid: service.uid,
      retainedArtifactDigest: retainedApp[0].image, controlSha256, ownerRunRef: control.ownerRunRef,
      databaseDisposition: 'NOT_APPLIED', migrationAdmissionRef: null, discardedCandidateRevision: null,
      absentStages, failureSignal: terminalFacts.failureSignal ?? null,
      ...(prepare ? { stageRefs: { prepare: prepare.ref, rollback: rollback.ref, terminal: terminal.ref }, preparedBuild } : {}),
    } }
}

// Once the applied migration is admitted by a later exact-source attempt, a
// candidate or smoke failure must not reopen the raw migration, worker or
// historical descriptor chain. None of those artifacts is reused here. The
// only continuation authority is the immutable applied-migration binding plus
// the provider-proven active baseline after rollback.
async function readAppliedContinuationCandidateAbort({ profile, transport, baselineIntentRef, intent, paths, terminal,
  terminalFacts, control, service, read, seal, postAbortLedgerReadbackRef, principalOnlyFenceRef,
  principalOnlyRecovery, appliedMigrationContinuation }) {
  const bucket = profile.artifact.releaseBucket
  try { assertAppliedMigrationContinuation(appliedMigrationContinuation, bucket) } catch { fail() }
  const recovery = assertPrincipalOnlyRecoveryBinding(intent, bucket)
  if (!recovery || !same(intent.appliedMigrationContinuation, appliedMigrationContinuation)
    || !same(intent.postAbortLedgerReadbackRef, postAbortLedgerReadbackRef)
    || !same(intent.principalOnlyFenceRef, principalOnlyFenceRef)
    || !same(intent.principalOnlyRecovery, principalOnlyRecovery)) fail()

  const [rollback, source, proof, recoveryRevision, retainedRevision, migration, candidate, entrypoint, deployment] = await Promise.all([
    read(paths.rollback), transport.readJson(intent.sourceLockRef, bucket, ['receipts']),
    transport.readJson(recovery.receiptRef, bucket, ['receipts']), transport.getRevision(profile, recovery.revision),
    transport.getRevision(profile, intent.previousRevision), read(paths.migrationAdmission), read(paths.candidate),
    read(paths.entrypoint), read(paths.deployment),
  ])
  const rollbackFacts = seal(rollback, 'rollback'), migrationFacts = seal(migration, 'migrate')
  const candidateFacts = seal(candidate, 'candidate'), entrypointFacts = seal(entrypoint, 'entrypoint')
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId,
    sourceRevision: intent.sourceRevision, releaseIntentSha256: baselineIntentRef.sha256 }))
  const keys = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision',
    'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
  const { controlSha256, ...controlCore } = control
  const runPrefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = control.ownerRunRef?.startsWith(runPrefix) ? control.ownerRunRef.slice(runPrefix.length) : ''
  const recordedRollbackRevision = control.previousRevision
  if (!same(Object.keys(control).sort(), keys.sort()) || controlSha256 !== sha256(canonicalize(controlCore))
    || control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.state !== 'FINALIZED'
    || !['PRE_ACTIVATION_ABORTED', 'ROLLED_BACK'].includes(control.result) || control.inputFingerprint !== fingerprint
    || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName
    || control.controlBucket !== bucket || control.releaseId !== intent.releaseId || control.sourceRevision !== intent.sourceRevision
    || control.sourceLockSha256 !== intent.sourceLockRef.sha256
    || recordedRollbackRevision !== intent.previousRevision
    || !new RegExp(`^${profile.target.serviceName}-[a-z0-9-]+$`, 'u').test(control.candidateRevision ?? '')
    || [intent.previousRevision, recovery.revision].includes(control.candidateRevision) || !/^[1-9][0-9]*$/u.test(runId)
    || control.deadlineAt !== intent.deadlineAt || !Number.isFinite(Date.parse(control.deadlineAt))
    || !Number.isFinite(Date.parse(control.leaseExpiresAt)) || Date.parse(control.leaseExpiresAt) >= Date.now()
    || !same(terminal.value.previousReceiptRef, rollback.ref)
    || terminalFacts.result !== control.result || rollbackFacts.result !== control.result
    || terminalFacts.previousRevision !== recordedRollbackRevision || rollbackFacts.previousRevision !== recordedRollbackRevision
    || terminalFacts.databaseDisposition !== 'HISTORICAL_EVIDENCE_REUSED'
    || rollbackFacts.databaseDisposition !== 'HISTORICAL_EVIDENCE_REUSED'
    || !same(terminalFacts.migrationAdmissionRef, migration.ref) || !same(rollbackFacts.migrationAdmissionRef, migration.ref)
    || !same(terminalFacts.migrationEvidenceRef, appliedMigrationContinuation.migrateRef)
    || !same(rollbackFacts.migrationEvidenceRef, appliedMigrationContinuation.migrateRef)
    || migrationFacts.disposition !== 'HISTORICAL_EVIDENCE_REUSED'
    || migrationFacts.manifestSha256 !== intent.migrationManifestSha256 || migrationFacts.sourceRevision !== intent.sourceRevision
    || !same(migrationFacts.migrationReceiptRef, appliedMigrationContinuation.migrateRef)
    || !same(migration.value.previousReceiptRef, deployment.ref)
    || !same(candidate.value.previousReceiptRef, migration.ref)
    || !same(candidateFacts.migrationAdmissionRef, migration.ref)
    || !same(candidateFacts.migrationReceiptRef, appliedMigrationContinuation.migrateRef)
    || !same(candidateFacts.deploymentCapsuleRef, deployment.ref)
    || candidateFacts.previousRevision !== intent.previousRevision || !traffic(candidateFacts.beforeTraffic, intent.previousRevision)
    || deployment.value.releaseIntentRef?.uri !== baselineIntentRef.uri
    || deployment.value.releaseIntentRef?.sha256 !== baselineIntentRef.sha256
    || deployment.value.sourceRevision !== intent.sourceRevision
    || candidateFacts.artifactDigest !== deployment.value.artifactDigest
    || !same(entrypoint.value.previousReceiptRef, candidate.ref)
    || entrypointFacts.canonicalOrigin !== profile.target.canonicalOrigin
    || !same(rollback.value.previousReceiptRef, entrypoint.ref)
    || source.ref.sha256 !== intent.sourceLockRef.sha256 || source.value.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1'
    || source.value.ownerApplicationId !== profile.application.id || source.value.releaseId !== intent.releaseId
    || source.value.sourceRevision !== intent.sourceRevision || source.value.sourceSha256 !== intent.sourceSha256
    || source.value.migrationManifestSha256 !== intent.migrationManifestSha256 || source.value.status !== 'SOURCE_FROZEN'
    || source.value.releaseAuthority !== true || source.value.clean !== true) fail()

  const verify = await optionalOrdinaryStage(read, paths.verify)
  const decision = await optionalOrdinaryStage(read, paths.decision)
  const activate = await optionalOrdinaryStage(read, paths.activate)
  const canonical = await optionalOrdinaryStage(read, paths.canonical)
  await assertMissing(read, paths.finalize)
  const postCandidate = { verify, decision, activate, canonical }
  if ((decision && !verify) || (activate && !decision) || (canonical && !activate)) fail()
  if (control.result === 'ROLLED_BACK' && (!verify || !decision)) fail()
  if (control.result === 'PRE_ACTIVATION_ABORTED' && (activate || canonical)) fail()
  if (verify) {
    const facts = seal(verify, 'verify')
    if (!same(verify.value.previousReceiptRef, entrypoint.ref) || !same(facts.entrypointReceiptRef, entrypoint.ref)
      || !same(facts.candidateReceiptRef, candidate.ref) || facts.candidateRevision !== candidateFacts.candidateRevision
      || facts.artifactDigest !== candidateFacts.artifactDigest || facts.smoke?.status !== 'PASS') fail()
  }
  if (decision) {
    const facts = seal(decision, 'decision')
    if (!same(decision.value.previousReceiptRef, verify.ref) || !same(facts.verifyReceiptRef, verify.ref)
      || facts.decision !== 'GO' || facts.remainingHumanAction !== 0
      || facts.candidateRevision !== candidateFacts.candidateRevision || facts.artifactDigest !== candidateFacts.artifactDigest) fail()
  }
  if (activate) {
    const facts = seal(activate, 'activate')
    if (!same(activate.value.previousReceiptRef, decision.ref) || !same(facts.decisionReceiptRef, decision.ref)
      || facts.candidateRevision !== candidateFacts.candidateRevision || facts.artifactDigest !== candidateFacts.artifactDigest
      || facts.effectiveRevision !== candidateFacts.candidateRevision) fail()
  }
  if (canonical) {
    const facts = seal(canonical, 'canonical')
    if (!same(canonical.value.previousReceiptRef, activate.ref) || !same(facts.activationReceiptRef, activate.ref)
      || facts.candidateRevision !== candidateFacts.candidateRevision || facts.artifactDigest !== candidateFacts.artifactDigest
      || facts.origin !== profile.target.canonicalOrigin || facts.smoke?.status !== 'PASS') fail()
  }
  const absentStages = ['verify', 'decision', 'activate', 'canonical', 'finalize'].filter(stage => stage === 'finalize' || !postCandidate[stage])
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()

  service ??= await transport.getService(profile)
  transport.assertServiceSettled(service, 'DEV121_PREACTIVATION_CONTINUATION_INVALID')
  const scalingSafe = (service.scaling?.scalingMode === 'MANUAL' && [0, '0'].includes(service.scaling?.manualInstanceCount))
    || (service.scaling?.scalingMode === 'AUTOMATIC' && Number(service.scaling?.maxInstanceCount) >= 1)
  const retainedApp = retainedRevision?.containers?.filter(row => row.name === profile.runtime.containerName)
  if (!scalingSafe || recovery.serviceUid !== service.uid
    || !traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)
    || retainedRevision?.name !== `${service.name}/revisions/${intent.previousRevision}`
    || retainedRevision.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
    || retainedApp?.length !== 1 || !retainedApp[0].image?.startsWith(`${profile.artifact.uri}@sha256:`)) fail()
  transport.assertCanonicalEntrypoint(profile, service)
  assertHistoricalPrincipalOnlyRecoveryReadback({ intent, profile, proof: proof.value,
    service, revision: recoveryRevision })

  return { kind: 'APPLIED_MIGRATION_ABORT', currentActiveRevision: intent.previousRevision,
    result: control.result, authorityBasis: {
      schemaVersion: 'aipdm.applied-migration-abort-basis.v1', failedIntentRef: baselineIntentRef,
      appliedMigrationContinuation, postAbortLedgerReadbackRef, principalOnlyFenceRef, principalOnlyRecovery,
      failedSourceLockRef: source.ref, previousRevision: intent.previousRevision, serviceUid: service.uid,
      retainedArtifactDigest: retainedApp[0].image, controlSha256, ownerRunRef: control.ownerRunRef,
      databaseDisposition: 'HISTORICAL_EVIDENCE_REUSED', migrationAdmissionRef: migration.ref,
      discardedCandidateRevision: control.candidateRevision, absentStages,
      failureSignal: terminalFacts.failureSignal ?? null,
    } }
}

/** One closed program-only abort, immediately anchored to a genuine released app. */
async function readProgramOnlyAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider }) {
  assertProgramOnlyPolicy(intent.programOnlyBaseline, { profile, intent })
  if (terminalFacts.databaseDisposition === 'UNKNOWN' && terminalFacts.currentDatabaseReadPerformed === false) {
    return readProgramOnlyUnassociatedAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider })
  }
  const preExecution = terminalFacts.databaseDisposition === 'NOT_APPLIED' && terminalFacts.currentDatabaseReadPerformed === false
  if (!preExecution && (terminalFacts.databaseDisposition !== PROGRAM_ONLY_DISPOSITION || terminalFacts.currentDatabaseReadPerformed !== true)) fail()
  const [prepare, migration, deployment, rollback, candidate, entry] = await Promise.all([
    read(paths.prepare), preExecution ? optionalOrdinaryStage(read, paths.migrate) : read(paths.migrate), read(paths.deployment), read(paths.rollback),
    optionalOrdinaryStage(read, paths.candidate), optionalOrdinaryStage(read, paths.entrypoint),
  ])
  const prepareFacts = seal(prepare, 'prepare'), rollbackFacts = seal(rollback, 'rollback')
  const candidateFacts = candidate ? seal(candidate, 'candidate') : null
  if ((preExecution && prepareFacts.preActivationAbortBasis) || prepare.value.previousReceiptRef !== null || prepareFacts.previousRevision !== intent.previousRevision
    || rollbackFacts.result !== 'PRE_ACTIVATION_ABORTED' || rollbackFacts.databaseDisposition !== (preExecution ? 'NOT_APPLIED' : PROGRAM_ONLY_DISPOSITION)
    || rollbackFacts.currentDatabaseReadPerformed !== !preExecution || rollbackFacts.previousRevision !== intent.previousRevision
    || (!preExecution && (!same(terminalFacts.migrationEvidenceRef, migration.ref) || !same(rollbackFacts.migrationEvidenceRef, migration.ref)))
    || !same(terminal.value.previousReceiptRef, rollback.ref) || !same(rollback.value.previousReceiptRef, preExecution ? null : entry?.ref ?? candidate?.ref ?? migration.ref)
    || !same(rollbackFacts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])
    || !same(terminalFacts.entrypointRecovery, rollbackFacts.entrypointRecovery)) fail()
  const prerequisiteRefs = Object.fromEntries(Object.entries({ sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }).map(([name, key]) => [name, intent[key]]))
  if (!same(prepareFacts.prerequisiteRefs, prerequisiteRefs)) fail()
  if (preExecution) {
    if (migration || candidate || entry || Object.hasOwn(terminalFacts, 'migrationEvidenceRef') || Object.hasOwn(rollbackFacts, 'migrationEvidenceRef')
      || !same(rollbackFacts.entrypointRecovery, { result: 'NOT_REQUIRED', changed: false })) fail()
    await assertAbsentStages(read, paths, ['migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize'])
    const nativeUri = programOnlyNativeUri(paths.migrate)
    for (const uri of [nativeUri, migrationSubmissionIntentUri(profile, nativeUri), nativeUri.replace(/\.json$/u, '-execution-readback.json'), nativeUri.replace(/\.json$/u, '-job-readback.json')]) await assertMissing(read, uri)
  }
  if (candidate) {
    if (!same(candidate.value.previousReceiptRef, migration.ref) || !same(candidateFacts.migrationReceiptRef, migration.ref)
      || !same(candidateFacts.deploymentCapsuleRef, deployment.ref) || candidateFacts.previousRevision !== intent.previousRevision
      || !traffic(candidateFacts.beforeTraffic, intent.previousRevision) || candidateFacts.artifactDigest !== deployment.value.artifactDigest) fail()
  }
  if (entry) {
    const facts = seal(entry, 'entrypoint')
    if (!candidate || !same(entry.value.previousReceiptRef, candidate.ref) || facts.canonicalOrigin !== profile.target.canonicalOrigin
      || facts.updateMask !== 'ingress,defaultUriDisabled,invokerIamDisabled'
      || facts.templateSha256Before !== facts.templateSha256After || facts.trafficSha256Before !== facts.trafficSha256After) fail()
  }
  await assertAbsentStages(read, paths, ['activate', 'canonical', 'finalize'])
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, releaseIntentSha256: baselineIntentRef.sha256 }))
  const keys = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision', 'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
  const { controlSha256, ...core } = control
  if (!same(Object.keys(control).sort(), keys.sort()) || controlSha256 !== sha256(canonicalize(core))
    || control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.state !== 'FINALIZED' || control.result !== 'PRE_ACTIVATION_ABORTED'
    || control.inputFingerprint !== fingerprint || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName
    || control.controlBucket !== profile.artifact.releaseBucket || control.releaseId !== intent.releaseId || control.sourceRevision !== intent.sourceRevision
    || control.sourceLockSha256 !== intent.sourceLockRef.sha256 || control.previousRevision !== intent.previousRevision
    || control.candidateRevision !== (candidateFacts?.candidateRevision ?? null) || control.deadlineAt !== intent.deadlineAt
    || !Number.isFinite(Date.parse(control.leaseExpiresAt)) || Date.parse(control.leaseExpiresAt) >= Date.now()) fail()
  const run = await readHistoricalOwnerRun(profile, transport, { ownerRunRef: control.ownerRunRef }, intent)
  const window = preExecution ? await readProgramOnlyReleaseWindow({ transport, profile, deployment: deployment.value, deadlineAt: intent.deadlineAt, intent }) : closedOwnerWindow(run)
  let previous = window.start
  const stageRefs = { prepare: prepare.ref, ...(migration ? { migration: migration.ref } : {}), deployment: deployment.ref, rollback: rollback.ref, terminal: terminal.ref }
  if (candidate) stageRefs.candidate = candidate.ref
  if (entry) stageRefs.entrypoint = entry.ref
  for (const row of [prepare, ...(candidate ? [candidate] : []), ...(entry ? [entry] : [])]) {
    const observed = Date.parse(row.value.observedAt)
    if (!Number.isFinite(observed) || observed < previous || observed > window.end) fail()
    previous = observed
  }
  const verify = await optionalOrdinaryStage(read, paths.verify), decision = await optionalOrdinaryStage(read, paths.decision)
  if (verify) {
    const facts = seal(verify, 'verify')
    if (!entry || !same(verify.value.previousReceiptRef, entry.ref) || !same(facts.candidateReceiptRef, candidate.ref)
      || facts.candidateRevision !== candidateFacts.candidateRevision || facts.artifactDigest !== candidateFacts.artifactDigest
      || facts.smoke?.status !== 'PASS' || !same(facts.sideEffects, profile.sideEffects)) fail()
    stageRefs.verify = verify.ref
  }
  if (decision) {
    const facts = seal(decision, 'decision')
    if (!verify || !same(decision.value.previousReceiptRef, verify.ref) || facts.decision !== 'GO' || facts.remainingHumanAction !== 0
      || facts.candidateRevision !== candidateFacts.candidateRevision || facts.artifactDigest !== candidateFacts.artifactDigest) fail()
    stageRefs.decision = decision.ref
  }
  for (const row of [verify, decision, rollback, terminal].filter(Boolean)) {
    const observed = Date.parse(row.value.observedAt)
    if (!Number.isFinite(observed) || observed < previous || observed > window.end) fail()
    previous = observed
  }
  const failed = await transport.readOwnerSourceProof({ profile, sourceRevision: intent.sourceRevision, refs: { prepare: prepare.ref, migrate: migration?.ref ?? null, terminal: null }, verifyProvider })
  if ((preExecution ? failed.proof?.disposition !== 'build_only' || failed.proof.releaseAuthority !== false || failed.proof.migrationVerified !== false
      || Object.hasOwn(failed.proof, 'databaseDisposition') || Object.hasOwn(failed.proof, 'currentDatabaseReadPerformed')
    : failed.proof?.databaseDisposition !== PROGRAM_ONLY_DISPOSITION || failed.proof.currentDatabaseReadPerformed !== true || failed.proof.disposition !== 'migration_only')
    || failed.proof.artifactDigest !== deployment.value.artifactDigest
    || (verifyProvider && failed.provider?.status !== 'BUILD_IMAGE_VERIFIED')) fail()
  const graph = await readAiPdmObservationInputs(failed.proof), binding = graph.programMigration
  if ((preExecution ? binding !== null : !binding) || !same(graph.intentRef, baselineIntentRef) || !same(graph.chain.deployment.ref, deployment.ref)
    || !same(graph.sourceLock.ref, intent.sourceLockRef)) fail()
  const releaseWindow = preExecution ? window : binding.window
  if (releaseWindow.start !== Date.parse(graph.sourceLock.value.observedAt) || releaseWindow.end !== Date.parse(intent.deadlineAt)) fail()
  let releasedIntentRef = intent.baselineIntentRef, historicalReplay = null
  const inheritedUnassociated = prepareFacts.preActivationAbortBasis ?? null
  if (inheritedUnassociated) {
    assertProgramOnlyHistoricalUnassociatedBasis(inheritedUnassociated, intent, profile)
    const [authorization, readiness] = await Promise.all([
      transport.readJson(intent.authorizationPolicyRef, profile.artifact.releaseBucket, ['receipts']),
      transport.readJson(intent.readinessReceiptRef, profile.artifact.releaseBucket, ['receipts']),
    ])
    if (!same(authorization.value.preActivationAbortBasis, inheritedUnassociated)
      || !same(readiness.value.preActivationAbortBasis, inheritedUnassociated)) fail()
    const historicalContext = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), inheritedUnassociated.failedIntentRef, true)
    historicalReplay = await runAiPdmEvidenceContext(historicalContext, async () => {
      const prior = await transport.readJson(inheritedUnassociated.failedIntentRef, profile.artifact.releaseBucket, ['receipts'])
      const priorPaths = releasePaths(profile, prior.value, inheritedUnassociated.failedIntentRef.sha256)
      const priorTerminal = await read(priorPaths.terminal)
      const historicalSeal = (row, stage) => sealOrdinaryStage(row, stage, prior.value, profile)
      return readProgramOnlyUnassociatedAbort({
        profile, transport, baselineIntentRef: inheritedUnassociated.failedIntentRef, intent: prior.value,
        paths: priorPaths, terminal: priorTerminal, terminalFacts: historicalSeal(priorTerminal, 'terminal'),
        control: null, service: null, read, seal: historicalSeal, verifyProvider, historicalBasis: inheritedUnassociated,
      })
    })
    if (historicalReplay.intent.previousRevision !== intent.previousRevision
      || historicalReplay.intent.programOnlyBaseline.migrationRunnerDigest !== deployment.value.migrationRunnerDigest
      || historicalReplay.ownerWindow.end > window.start) fail()
    releasedIntentRef = inheritedUnassociated.releasedIntentRef
  }
  const inventory = async () => {
    const job = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`
    const names = new Set(), tokens = new Set(), rows = []
    let pageToken = '', matched = 0, historicalMatched = 0
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ pageSize: '100' }); if (pageToken) query.set('pageToken', pageToken)
      const response = await transport.request(`https://run.googleapis.com/v2/${job}/executions?${query}`)
      if (!response || typeof response !== 'object' || Array.isArray(response) || Object.keys(response).some(key => !['executions', 'nextPageToken'].includes(key))
        || (Object.hasOwn(response, 'executions') && !Array.isArray(response.executions)) || (Object.hasOwn(response, 'nextPageToken') && typeof response.nextPageToken !== 'string')) fail()
      for (const execution of response.executions ?? []) {
        const created = Date.parse(execution.createTime), completed = Date.parse(execution.completionTime), conditions = execution.conditions?.filter(row => row.type === 'Completed')
        if (!execution.name?.startsWith(`${job}/executions/`) || names.has(execution.name) || !Number.isFinite(created) || !Number.isFinite(completed)
          || (execution.startTime !== undefined && !Number.isFinite(Date.parse(execution.startTime))) || execution.reconciling === true || conditions?.length !== 1
          || !['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(conditions[0].state) || Number(execution.runningCount ?? 0) !== 0) fail()
        names.add(execution.name); rows.push(execution)
        if (!preExecution && execution.name === binding.execution.value.name) {
          assertProgramOnlyExecution(execution, { profile, deployment: deployment.value, outputUri: programOnlyNativeUri(paths.migrate), submission: binding.submission.value, window: releaseWindow, staticJob: binding.job.value })
          for (const key of ['name', 'createTime', 'completionTime', 'template', 'taskCount', 'parallelism']) if (!same(execution[key], binding.execution.value[key])) fail()
          matched += 1
        } else if (historicalReplay && execution.name === historicalReplay.execution.name) {
          if (!same(execution, historicalReplay.execution) || created >= releaseWindow.start || completed >= releaseWindow.start
            || (execution.startTime !== undefined && Date.parse(execution.startTime) >= releaseWindow.start)) fail()
          historicalMatched += 1
        } else if (created >= releaseWindow.start || completed >= releaseWindow.start || (execution.startTime !== undefined && Date.parse(execution.startTime) >= releaseWindow.start)
          || execution.template?.containers?.some(container => container.args?.includes(intent.sourceRevision) || container.args?.includes(programOnlyNativeUri(paths.migrate))
            || (historicalReplay && (container.args?.includes(historicalReplay.intent.sourceRevision) || container.args?.includes(historicalReplay.outputUri))))) fail()
        if (historicalReplay?.ancestor && execution.template?.containers?.some(container => container.args?.includes(historicalReplay.ancestor.intent.sourceRevision)
          || container.args?.includes(historicalReplay.ancestor.outputUri))) fail()
      }
      pageToken = response.nextPageToken ?? ''
      if (!pageToken) {
        if (matched !== (preExecution ? 0 : 1) || historicalMatched !== (historicalReplay ? 1 : 0)) fail()
        return rows.sort((a,b) => a.name.localeCompare(b.name))
      }
      if (tokens.has(pageToken)) fail(); tokens.add(pageToken)
    }
    fail()
  }
  const before = await inventory(), after = await inventory()
  if (!same(before, after)) fail()
  const anchor = await transport.readJson(releasedIntentRef, profile.artifact.releaseBucket, ['receipts'])
  const anchorPaths = releasePaths(profile, anchor.value, releasedIntentRef.sha256)
  const [anchorPrepare, anchorMigration, anchorTerminal] = await Promise.all([read(anchorPaths.prepare), read(anchorPaths.migrate), read(anchorPaths.terminal)])
  if (sealOrdinaryStage(anchorTerminal, 'terminal', anchor.value, profile).result !== 'RELEASED') fail()
  const child = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), releasedIntentRef, true)
  const released = await runAiPdmEvidenceContext(child, async () => {
    const observed = await transport.readOwnerSourceProof({ profile, sourceRevision: anchor.value.sourceRevision,
      refs: { prepare: anchorPrepare.ref, migrate: anchorMigration.ref, terminal: anchorTerminal.ref }, verifyProvider })
    if (preExecution || inheritedUnassociated) {
      const anchorGraph = await readAiPdmObservationInputs(observed.proof)
      const native = anchorGraph.migrate.value
      if (native.status !== 'PASS' || native.boundaryStatus !== 'PASS' || native.ledgerCount !== 33 || native.baselineCount !== 15
        || native.applied + native.replayed !== 33 || native.ledgerBootstrap?.created !== false) fail()
      if (anchor.value.programOnlyBaseline || anchorGraph.bundle.bundle.entries.length !== 33
        || !same(anchorGraph.bundle.bundle.entries, graph.bundle.bundle.entries)
        || anchorGraph.chain.deployment.value.migrationRunnerDigest !== deployment.value.migrationRunnerDigest
        || deployment.value.migrationRunnerDigest !== intent.programOnlyBaseline.migrationRunnerDigest
        || (inheritedUnassociated && !same(observed.proof, inheritedUnassociated.releasedProof))) fail()
    }
    return observed
  })
  if (released.proof.disposition !== 'released' || released.proof.candidateRevision !== intent.previousRevision
    || (verifyProvider && released.provider?.status !== 'BUILD_IMAGE_VERIFIED')) fail()
  service ??= await transport.getService(profile)
  transport.assertServiceSettled(service, 'DEV121_PREACTIVATION_CONTINUATION_INVALID')
  const observedEntrypoint = transport.entrypointSnapshot(service)
  const entrypointMatches = preExecution
    ? same(observedEntrypoint, prepareFacts.entrypointBaseline)
    : same(programOnlyEntrypointSemantics(observedEntrypoint), programOnlyEntrypointSemantics(prepareFacts.entrypointBaseline))
  if (!traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)
    || service.scaling?.scalingMode !== 'AUTOMATIC' || Number(service.scaling.maxInstanceCount) !== 1
    || !entrypointMatches) fail()
  transport.assertCanonicalEntrypoint(profile, service)
  const retained = await transport.getRevision(profile, intent.previousRevision)
  if (retained?.name !== `${service.name}/revisions/${intent.previousRevision}` || retained.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
    || retained.containers?.filter(row => row.name === profile.runtime.containerName).length !== 1
    || retained.containers.find(row => row.name === profile.runtime.containerName).image !== released.proof.artifactDigest) fail()
  return { kind: 'PROGRAM_ONLY_ABORT', currentActiveRevision: intent.previousRevision, result: 'PRE_ACTIVATION_ABORTED',
    authorityBasis: { schemaVersion: preExecution ? 'aipdm.program-only-preexecution-abort-basis.v1' : 'aipdm.program-only-abort-basis.v1',
      ...(preExecution ? { databaseDisposition: 'NOT_APPLIED', currentDatabaseReadPerformed: false, migrationJobSubmitted: false, releaseAuthority: false } : {}), failedIntentRef: baselineIntentRef, releasedIntentRef,
      failedProof: failed.proof, releasedProof: released.proof, stageRefs, controlSha256, ownerRunRef: control.ownerRunRef,
      previousRevision: intent.previousRevision, inputFingerprint: fingerprint, inventorySha256: sha256(canonicalize(before)),
      ...(inheritedUnassociated ? { retainedUnassociatedAncestor: inheritedUnassociated } : {}) } }
}

// Completed associated recovery retains immutable snapshots and compares live entrypoint semantics.
function programOnlyEntrypointSemantics(snapshot) {
  const keys = ['ingress', 'defaultUriDisabled', 'invokerIamDisabled', 'uri', 'urls']
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
    || keys.some(key => !Object.hasOwn(snapshot, key))
    || typeof snapshot.ingress !== 'string' || !snapshot.ingress
    || typeof snapshot.defaultUriDisabled !== 'boolean' || typeof snapshot.invokerIamDisabled !== 'boolean'
    || typeof snapshot.uri !== 'string' || !snapshot.uri
    || !Array.isArray(snapshot.urls) || snapshot.urls.length === 0
    || snapshot.urls.some(url => typeof url !== 'string' || !url)) fail()
  return { ingress: snapshot.ingress, defaultUriDisabled: snapshot.defaultUriDisabled,
    invokerIamDisabled: snapshot.invokerIamDisabled, uri: snapshot.uri, urls: [...snapshot.urls].sort() }
}

// Only one already-sealed unassociated basis may precede an associated abort.
function assertProgramOnlyHistoricalUnassociatedBasis(basis, intent, profile) {
  const keys = ['schemaVersion', 'databaseDisposition', 'currentDatabaseReadPerformed', 'migrationJobSubmitted', 'releaseAuthority',
    'failedIntentRef', 'releasedIntentRef', 'failedProof', 'releasedProof', 'stageRefs', 'controlSha256', 'ownerRunRef',
    'previousRevision', 'inputFingerprint', 'inventorySha256', 'completedNative']
  if (!basis || typeof basis !== 'object' || Array.isArray(basis)) fail()
  if (Object.hasOwn(basis, 'retainedPreexecutionAncestor')) keys.push('retainedPreexecutionAncestor')
  if (!same(Object.keys(basis).sort(), keys.sort()) || basis.schemaVersion !== 'aipdm.program-only-completed-unassociated-abort-basis.v1'
    || basis.databaseDisposition !== 'UNKNOWN' || basis.currentDatabaseReadPerformed !== false || basis.migrationJobSubmitted !== true
    || basis.releaseAuthority !== false || !same(basis.failedIntentRef, intent.baselineIntentRef)
    || basis.previousRevision !== intent.previousRevision) fail()
  for (const key of ['controlSha256', 'inputFingerprint', 'inventorySha256']) if (!/^[a-f0-9]{64}$/u.test(basis[key] ?? '')) fail()
  for (const value of [basis.failedIntentRef, basis.releasedIntentRef]) assertImmutableRef(value, profile.artifact.releaseBucket, ['receipts'])
  const completed = basis.completedNative
  const completedKeys = ['nativeReceiptRef', 'submissionIntentRef', 'executionName', 'jobProjectionSha256', 'executionSha256', 'disposition', 'resubmissionAllowed']
  if (!completed || typeof completed !== 'object' || Array.isArray(completed) || !same(Object.keys(completed).sort(), completedKeys.sort())
    || completed.disposition !== 'OBSERVED_COMPLETED_READONLY_NO_RELEASE_ASSOCIATION' || completed.resubmissionAllowed !== false
    || !/^[a-f0-9]{64}$/u.test(completed.jobProjectionSha256 ?? '') || !/^[a-f0-9]{64}$/u.test(completed.executionSha256 ?? '')) fail()
  for (const value of [completed.nativeReceiptRef, completed.submissionIntentRef]) assertImmutableRef(value, profile.artifact.releaseBucket, ['receipts'])
  if (Object.hasOwn(basis, 'retainedPreexecutionAncestor')
    && (!basis.retainedPreexecutionAncestor || basis.retainedPreexecutionAncestor.schemaVersion !== 'aipdm.program-only-preexecution-abort-basis.v1')) fail()
}

/** A completed native read is observed without rewriting its aborted capsule. */
async function readProgramOnlyUnassociatedAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider, historicalBasis = null }) {
  const bucket = profile.artifact.releaseBucket
  const [prepare, deployment, rollback] = await Promise.all([read(paths.prepare), read(paths.deployment), read(paths.rollback)])
  const prepareFacts = seal(prepare, 'prepare'), rollbackFacts = seal(rollback, 'rollback')
  const prerequisiteRefs = Object.fromEntries(Object.entries({ sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }).map(([name, key]) => [name, intent[key]]))
  if (prepare.value.previousReceiptRef !== null || prepareFacts.previousRevision !== intent.previousRevision
    || !same(prepareFacts.prerequisiteRefs, prerequisiteRefs) || rollback.value.previousReceiptRef !== null
    || !same(terminal.value.previousReceiptRef, rollback.ref)
    || !same(rollbackFacts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])) fail()
  for (const facts of [terminalFacts, rollbackFacts]) {
    if (facts.result !== 'PRE_ACTIVATION_ABORTED' || facts.databaseDisposition !== 'UNKNOWN' || facts.currentDatabaseReadPerformed !== false
      || facts.previousRevision !== intent.previousRevision || Object.hasOwn(facts, 'migrationEvidenceRef')
      || !same(facts.entrypointRecovery, { result: 'NOT_REQUIRED', changed: false })) fail()
  }
  assertProgramOnlyPolicy(intent.programOnlyBaseline, { profile, intent, deployment: deployment.value })
  if (!same(deployment.value.releaseIntentRef, baselineIntentRef)) fail()
  await assertAbsentStages(read, paths, ['migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize'])
  const outputUri = programOnlyNativeUri(paths.migrate), submissionUri = migrationSubmissionIntentUri(profile, outputUri)
  await assertMissing(read, outputUri.replace(/\.json$/u, '-execution-readback.json'))
  await assertMissing(read, outputUri.replace(/\.json$/u, '-job-readback.json'))
  const [native, submission] = await Promise.all([read(outputUri), read(submissionUri)])
  if (!same(terminalFacts.migrationSubmissionIntentRef, submission.ref) || !same(rollbackFacts.migrationSubmissionIntentRef, submission.ref)) fail()
  assertProgramOnlySubmission(submission.value, { profile, deployment: deployment.value, outputUri, deadlineAt: intent.deadlineAt })
  const bundles = await readProgramOnlyBundles({ transport, profile, policy: intent.programOnlyBaseline })
  const window = await readProgramOnlyReleaseWindow({ transport, profile, deployment: deployment.value, deadlineAt: intent.deadlineAt, intent })
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, releaseIntentSha256: baselineIntentRef.sha256 }))
  let controlSha256, ownerRunRef
  if (historicalBasis) {
    // Historical mutable control is unavailable; its hash is retained from the sealed basis.
    if (control !== null || service !== null || !same(historicalBasis.failedIntentRef, baselineIntentRef)
      || historicalBasis.previousRevision !== intent.previousRevision || historicalBasis.inputFingerprint !== fingerprint) fail()
    controlSha256 = historicalBasis.controlSha256
    ownerRunRef = historicalBasis.ownerRunRef
  } else {
    const controlKeys = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision', 'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
    const { controlSha256: sealedControlSha256, ...controlCore } = control
    if (!same(Object.keys(control).sort(), controlKeys.sort()) || sealedControlSha256 !== sha256(canonicalize(controlCore))
      || control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.ownerApplicationId !== profile.application.id
      || control.service !== profile.target.serviceName || control.controlBucket !== bucket || control.releaseId !== intent.releaseId
      || control.sourceRevision !== intent.sourceRevision || control.sourceLockSha256 !== intent.sourceLockRef.sha256
      || control.inputFingerprint !== fingerprint || control.previousRevision !== intent.previousRevision || control.candidateRevision !== null
      || control.state !== 'FINALIZED' || control.result !== 'PRE_ACTIVATION_ABORTED' || control.deadlineAt !== intent.deadlineAt
      || !Number.isFinite(Date.parse(control.leaseExpiresAt)) || Date.parse(control.leaseExpiresAt) >= Date.now()) fail()
    controlSha256 = sealedControlSha256
    ownerRunRef = control.ownerRunRef
  }
  const ownerRun = await readHistoricalOwnerRun(profile, transport, { ownerRunRef }, intent)
  const ownerWindow = closedOwnerWindow(ownerRun)
  for (const row of [prepare, rollback, terminal]) {
    const observed = Date.parse(row.value.observedAt)
    if (!Number.isFinite(observed) || observed < window.start || observed > window.end) fail()
  }
  const failed = await transport.readOwnerSourceProof({ profile, sourceRevision: intent.sourceRevision, refs: { prepare: prepare.ref, migrate: null, terminal: null }, verifyProvider })
  assertOrdinarySourceProof(failed.proof, intent, baselineIntentRef, 'build_only', profile)
  if (failed.proof.releaseAuthority !== false || failed.proof.migrationVerified !== false
    || Object.hasOwn(failed.proof, 'databaseDisposition') || Object.hasOwn(failed.proof, 'currentDatabaseReadPerformed')
    || failed.proof.artifactDigest !== deployment.value.artifactDigest || (verifyProvider && failed.provider?.status !== 'BUILD_IMAGE_VERIFIED')) fail()
  const graph = await readAiPdmObservationInputs(failed.proof)
  if (graph.programMigration !== null || !same(graph.intentRef, baselineIntentRef) || !same(graph.chain.deployment.ref, deployment.ref)) fail()

  let releasedIntentRef = intent.baselineIntentRef, ancestor = null
  const inherited = prepareFacts.preActivationAbortBasis
  if (inherited) {
    const keys = ['schemaVersion', 'databaseDisposition', 'currentDatabaseReadPerformed', 'migrationJobSubmitted', 'releaseAuthority', 'failedIntentRef', 'releasedIntentRef', 'failedProof', 'releasedProof', 'stageRefs', 'controlSha256', 'ownerRunRef', 'previousRevision', 'inputFingerprint', 'inventorySha256']
    if (!same(Object.keys(inherited).sort(), keys.sort()) || inherited.schemaVersion !== 'aipdm.program-only-preexecution-abort-basis.v1'
      || inherited.databaseDisposition !== 'NOT_APPLIED' || inherited.currentDatabaseReadPerformed !== false
      || inherited.migrationJobSubmitted !== false || inherited.releaseAuthority !== false || !same(inherited.failedIntentRef, intent.baselineIntentRef)
      || inherited.previousRevision !== intent.previousRevision || !/^[a-f0-9]{64}$/u.test(inherited.controlSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(inherited.inventorySha256 ?? '')) fail()
    const [authorization, readiness] = await Promise.all([transport.readJson(intent.authorizationPolicyRef, bucket, ['receipts']), transport.readJson(intent.readinessReceiptRef, bucket, ['receipts'])])
    if (!same(authorization.value.preActivationAbortBasis, inherited) || !same(readiness.value.preActivationAbortBasis, inherited)) fail()
    const child = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), inherited.failedIntentRef, true)
    ancestor = await runAiPdmEvidenceContext(child, async () => {
      const prior = await transport.readJson(inherited.failedIntentRef, bucket, ['receipts'])
      const priorPaths = releasePaths(profile, prior.value, inherited.failedIntentRef.sha256)
      const [p, d, r, t] = await Promise.all([read(priorPaths.prepare), read(priorPaths.deployment), read(priorPaths.rollback), read(priorPaths.terminal)])
      const pFacts = sealOrdinaryStage(p, 'prepare', prior.value, profile), rFacts = sealOrdinaryStage(r, 'rollback', prior.value, profile), tFacts = sealOrdinaryStage(t, 'terminal', prior.value, profile)
      assertProgramOnlyPolicy(prior.value.programOnlyBaseline, { profile, intent: prior.value, deployment: d.value })
      const priorPrerequisites = Object.fromEntries(Object.entries({ sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }).map(([name, key]) => [name, prior.value[key]]))
      if (pFacts.preActivationAbortBasis || p.value.previousReceiptRef !== null || pFacts.previousRevision !== intent.previousRevision
        || !same(pFacts.prerequisiteRefs, priorPrerequisites) || !same(d.value.releaseIntentRef, inherited.failedIntentRef)
        || r.value.previousReceiptRef !== null || !same(t.value.previousReceiptRef, r.ref)
        || !same(rFacts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])
        || !same(inherited.stageRefs, { prepare: p.ref, deployment: d.ref, rollback: r.ref, terminal: t.ref })
        || !same(inherited.releasedIntentRef, prior.value.baselineIntentRef)
        || inherited.inputFingerprint !== sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: prior.value.releaseId, sourceRevision: prior.value.sourceRevision, releaseIntentSha256: inherited.failedIntentRef.sha256 }))) fail()
      for (const facts of [rFacts, tFacts]) {
        if (facts.result !== 'PRE_ACTIVATION_ABORTED' || facts.databaseDisposition !== 'NOT_APPLIED' || facts.currentDatabaseReadPerformed !== false
          || facts.previousRevision !== intent.previousRevision || Object.hasOwn(facts, 'migrationEvidenceRef') || Object.hasOwn(facts, 'migrationSubmissionIntentRef')
          || !same(facts.entrypointRecovery, { result: 'NOT_REQUIRED', changed: false })) fail()
      }
      await assertAbsentStages(read, priorPaths, ['migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize'])
      const priorOutput = programOnlyNativeUri(priorPaths.migrate)
      for (const uri of [priorOutput, migrationSubmissionIntentUri(profile, priorOutput), priorOutput.replace(/\.json$/u, '-execution-readback.json'), priorOutput.replace(/\.json$/u, '-job-readback.json')]) await assertMissing(read, uri)
      await readHistoricalOwnerRun(profile, transport, inherited, prior.value)
      const observed = await transport.readOwnerSourceProof({ profile, sourceRevision: prior.value.sourceRevision, refs: { prepare: p.ref, migrate: null, terminal: null }, verifyProvider })
      if (!same(observed.proof, inherited.failedProof) || (verifyProvider && observed.provider?.status !== 'BUILD_IMAGE_VERIFIED')) fail()
      const priorGraph = await readAiPdmObservationInputs(observed.proof)
      if (priorGraph.programMigration !== null || !same(priorGraph.bundle.bundle.entries, bundles.effective.bundle.entries)
        || d.value.migrationRunnerDigest !== deployment.value.migrationRunnerDigest) fail()
      const priorWindow = await readProgramOnlyReleaseWindow({ transport, profile, deployment: d.value, deadlineAt: prior.value.deadlineAt, intent: prior.value })
      for (const row of [p, r, t]) if (!Number.isFinite(Date.parse(row.value.observedAt)) || Date.parse(row.value.observedAt) < priorWindow.start || Date.parse(row.value.observedAt) > priorWindow.end) fail()
      return { intent: prior.value, outputUri: priorOutput, basis: inherited }
    })
    releasedIntentRef = inherited.releasedIntentRef
  }
  const jobName = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`
  const job = await transport.request(`https://run.googleapis.com/v2/${jobName}`)
  assertProgramOnlyStaticJob(job, { profile, deployment: deployment.value })
  if (!/^[a-f0-9-]{36}$/u.test(job.uid ?? '') || !/^[1-9][0-9]*$/u.test(job.generation ?? '') || job.reconciling === true
    || !Number.isFinite(Date.parse(job.updateTime))) fail()
  if (!/^[a-z][a-z0-9-]{0,62}$/u.test(native.value.executionName ?? '')) fail()
  const executionName = `${jobName}/executions/${native.value.executionName}`
  const execution = await transport.request(`https://run.googleapis.com/v2/${executionName}`)
  // Job and Execution timestamps share the Run provider clock; native runner time is bounded separately.
  if (execution.name !== executionName || Date.parse(job.updateTime) > Date.parse(execution.createTime)) fail()
  assertProgramOnlyExecution(execution, { profile, deployment: deployment.value, outputUri, submission: submission.value, window, staticJob: job })
  assertProgramOnlyNative(native.value, { policy: intent.programOnlyBaseline, submission: submission.value, execution, outputUri, deadlineAt: intent.deadlineAt, window })
  const inventory = async () => {
    const rows = [], names = new Set(), tokens = new Set(); let pageToken = '', matched = 0
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ pageSize: '100' }); if (pageToken) query.set('pageToken', pageToken)
      const response = await transport.request(`https://run.googleapis.com/v2/${jobName}/executions?${query}`)
      if (!response || typeof response !== 'object' || Array.isArray(response) || Object.keys(response).some(key => !['executions', 'nextPageToken'].includes(key))
        || (Object.hasOwn(response, 'executions') && !Array.isArray(response.executions)) || (Object.hasOwn(response, 'nextPageToken') && typeof response.nextPageToken !== 'string')) fail()
      for (const row of response.executions ?? []) {
        const created = Date.parse(row.createTime), completed = Date.parse(row.completionTime), condition = row.conditions?.filter(c => c.type === 'Completed')
        if (!row.name?.startsWith(`${jobName}/executions/`) || names.has(row.name) || !Number.isFinite(created) || !Number.isFinite(completed)
          || completed < created || row.reconciling === true || Number(row.runningCount ?? 0) !== 0 || condition?.length !== 1
          || !['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(condition[0].state)
          || (row.startTime !== undefined && !Number.isFinite(Date.parse(row.startTime)))) fail()
        names.add(row.name); rows.push(row)
        if (row.name === executionName) {
          assertProgramOnlyExecution(row, { profile, deployment: deployment.value, outputUri, submission: submission.value, window, staticJob: job })
          if (!same(row, execution)) fail(); matched++
        } else if (created >= window.start || completed >= window.start || (row.startTime !== undefined && Date.parse(row.startTime) >= window.start)
          || row.template?.containers?.some(c => c.args?.includes(intent.sourceRevision) || c.args?.includes(outputUri))) fail()
        if (ancestor && row.template?.containers?.some(c => c.args?.includes(ancestor.intent.sourceRevision) || c.args?.includes(ancestor.outputUri))) fail()
      }
      pageToken = response.nextPageToken ?? ''
      if (!pageToken) { if (matched !== 1) fail(); return rows.sort((a, b) => a.name.localeCompare(b.name)) }
      if (tokens.has(pageToken)) fail(); tokens.add(pageToken)
    }
    fail()
  }
  const before = historicalBasis ? null : await inventory(), after = historicalBasis ? null : await inventory()
  if (!same(before, after)) fail()
  const jobAfter = await transport.request(`https://run.googleapis.com/v2/${jobName}`)
  assertProgramOnlyStaticJob(jobAfter, { profile, deployment: deployment.value })
  const jobProjection = j => ({ name: j.name, uid: j.uid, generation: j.generation, template: j.template, updateTime: j.updateTime })
  if (!same(jobProjection(job), jobProjection(jobAfter))) fail()
  const anchor = await transport.readJson(releasedIntentRef, bucket, ['receipts']), anchorPaths = releasePaths(profile, anchor.value, releasedIntentRef.sha256)
  const [anchorPrepare, anchorMigration, anchorTerminal] = await Promise.all([read(anchorPaths.prepare), read(anchorPaths.migrate), read(anchorPaths.terminal)])
  if (sealOrdinaryStage(anchorTerminal, 'terminal', anchor.value, profile).result !== 'RELEASED') fail()
  const child = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), releasedIntentRef, true)
  const released = await runAiPdmEvidenceContext(child, async () => {
    const observed = await transport.readOwnerSourceProof({ profile, sourceRevision: anchor.value.sourceRevision, refs: { prepare: anchorPrepare.ref, migrate: anchorMigration.ref, terminal: anchorTerminal.ref }, verifyProvider })
    const anchorGraph = await readAiPdmObservationInputs(observed.proof), n = anchorGraph.migrate.value
    if (anchor.value.programOnlyBaseline || n.status !== 'PASS' || n.boundaryStatus !== 'PASS' || n.ledgerCount !== 33 || n.baselineCount !== 15
      || n.applied + n.replayed !== 33 || n.ledgerBootstrap?.created !== false || !same(anchorGraph.bundle.bundle.entries, bundles.effective.bundle.entries)
      || anchorGraph.chain.deployment.value.migrationRunnerDigest !== deployment.value.migrationRunnerDigest
      || (inherited && !same(observed.proof, inherited.releasedProof))) fail()
    return observed
  })
  if (released.proof.disposition !== 'released' || released.proof.candidateRevision !== intent.previousRevision
    || (verifyProvider && released.provider?.status !== 'BUILD_IMAGE_VERIFIED')) fail()
  if (!historicalBasis) {
    service ??= await transport.getService(profile)
    transport.assertServiceSettled(service, 'DEV121_PREACTIVATION_CONTINUATION_INVALID')
    if (!traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)
      || service.scaling?.scalingMode !== 'AUTOMATIC' || Number(service.scaling.maxInstanceCount) !== 1
      || !same(transport.entrypointSnapshot(service), prepareFacts.entrypointBaseline)) fail()
    transport.assertCanonicalEntrypoint(profile, service)
    const retained = await transport.getRevision(profile, intent.previousRevision)
    if (retained?.name !== `${service.name}/revisions/${intent.previousRevision}` || retained.conditions?.find(c => c.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
      || retained.containers?.filter(c => c.name === profile.runtime.containerName).length !== 1
      || retained.containers.find(c => c.name === profile.runtime.containerName).image !== released.proof.artifactDigest) fail()
  }
  const authorityBasis = {
    schemaVersion: 'aipdm.program-only-completed-unassociated-abort-basis.v1', databaseDisposition: 'UNKNOWN', currentDatabaseReadPerformed: false,
    migrationJobSubmitted: true, releaseAuthority: false, failedIntentRef: baselineIntentRef, releasedIntentRef, failedProof: failed.proof, releasedProof: released.proof,
    stageRefs: { prepare: prepare.ref, deployment: deployment.ref, rollback: rollback.ref, terminal: terminal.ref }, controlSha256,
    ownerRunRef, previousRevision: intent.previousRevision, inputFingerprint: fingerprint,
    inventorySha256: historicalBasis ? historicalBasis.inventorySha256 : sha256(canonicalize(before)),
    completedNative: { nativeReceiptRef: native.ref, submissionIntentRef: submission.ref, executionName, jobProjectionSha256: sha256(canonicalize(jobProjection(job))), executionSha256: sha256(canonicalize(execution)), disposition: 'OBSERVED_COMPLETED_READONLY_NO_RELEASE_ASSOCIATION', resubmissionAllowed: false },
    ...(inherited ? { retainedPreexecutionAncestor: inherited } : {})
  }
  if (historicalBasis) {
    if (!same(authorityBasis, historicalBasis)) fail()
    return { execution, intent, outputUri, ancestor, ownerWindow }
  }
  return { kind: 'PROGRAM_ONLY_ABORT', currentActiveRevision: intent.previousRevision, result: 'PRE_ACTIVATION_ABORTED', authorityBasis }
}

// The retained application must already have a complete Principal-only release.
// Its anchor is taken solely from the sealed failed intent, never a caller hint.
function sealOrdinaryStage(row, stage, intent, profile) {
  const { receiptSha256, ...core } = row.value ?? {}
  if (receiptSha256 !== sha256(canonicalize(core)) || core.schemaVersion !== 'jenfu.dev012.stage-receipt.v1'
    || core.ownerApplicationId !== profile.application.id || core.releaseId !== intent.releaseId
    || core.sourceRevision !== intent.sourceRevision || core.stage !== stage || core.status !== 'PASS') fail()
  return core.facts
}
function assertOrdinarySourceProof(proof, sourceIntent, sourceRef, disposition, profile) {
  if (proof?.owner !== profile.application.id || proof.sourceRevision !== sourceIntent.sourceRevision
    || proof.releaseId !== sourceIntent.releaseId || proof.disposition !== disposition
    || proof.sourceLock?.ref !== sourceIntent.sourceLockRef.uri || proof.sourceLock.sha256 !== sourceIntent.sourceLockRef.sha256
    || proof.migrationManifestSha256 !== sourceIntent.migrationManifestSha256
    || !proof.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`)) fail()
  const chain = proof.releaseChain ?? proof.buildChain
  const sourcePaths = releasePaths(profile, sourceIntent, sourceRef.sha256)
  if (chain?.deployment?.ref !== sourcePaths.deployment) fail()
}
async function optionalOrdinaryStage(read, uri) {
  try { return await read(uri) } catch (error) { if (error.code !== 'MISSING') throw error; return null }
}
// The same immutable ordinary stages are checked for the current abort and
// the one allowed historical ordinary predecessor. Control is never an input.
async function readOrdinaryAbortEvidence({ profile, baselineIntentRef, intent, paths, terminal, read }) {
  const [prepare, migration, candidate, deployment, entry, rollback] = await Promise.all([
    read(paths.prepare), read(paths.migrate), read(paths.candidate), read(paths.deployment), read(paths.entrypoint), read(paths.rollback),
  ])
  const prepareFacts = sealOrdinaryStage(prepare, 'prepare', intent, profile)
  const candidateFacts = sealOrdinaryStage(candidate, 'candidate', intent, profile)
  const entryFacts = sealOrdinaryStage(entry, 'entrypoint', intent, profile)
  const rollbackFacts = sealOrdinaryStage(rollback, 'rollback', intent, profile)
  const terminalFacts = sealOrdinaryStage(terminal, 'terminal', intent, profile)
  const repair = migration.value?.schemaVersion === 'aipdm.paused-app-repair-migration-association.v1'
  const databaseDisposition = repair ? 'HISTORICAL_EVIDENCE_REUSED' : 'FORWARD_APPLIED'
  if (terminalFacts.result !== 'PRE_ACTIVATION_ABORTED'
    || (repair && (!same(terminalFacts.migrationEvidenceRef, migration.ref) || !same(rollbackFacts.migrationEvidenceRef, migration.ref)))) fail()
  const refNames = { sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef',
    foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId,
    sourceRevision: intent.sourceRevision, releaseIntentSha256: baselineIntentRef.sha256 }))
  if (prepare.value.previousReceiptRef !== null || prepareFacts.previousRevision !== intent.previousRevision
    || !same(prepareFacts.prerequisiteRefs, Object.fromEntries(Object.entries(refNames).map(([name, field]) => [name, intent[field]])))
    || !same(candidate.value.previousReceiptRef, migration.ref) || !same(candidateFacts.migrationReceiptRef, migration.ref)
    || !same(candidateFacts.deploymentCapsuleRef, deployment.ref) || candidateFacts.previousRevision !== intent.previousRevision
    || !traffic(candidateFacts.beforeTraffic, intent.previousRevision)
    || !same(deployment.value.releaseIntentRef, baselineIntentRef) || deployment.value.releaseIntentSha256 !== baselineIntentRef.sha256
    || deployment.value.ownerApplicationId !== profile.application.id || deployment.value.sourceRevision !== intent.sourceRevision
    || deployment.value.deadlineAt !== intent.deadlineAt || candidateFacts.artifactDigest !== deployment.value.artifactDigest
    || !same(entry.value.previousReceiptRef, candidate.ref) || entryFacts.canonicalOrigin !== profile.target.canonicalOrigin
    || entryFacts.updateMask !== 'ingress,defaultUriDisabled,invokerIamDisabled'
    || entryFacts.templateSha256Before !== entryFacts.templateSha256After || entryFacts.trafficSha256Before !== entryFacts.trafficSha256After
    || !/^[a-f0-9]{64}$/u.test(entryFacts.templateSha256Before ?? '') || !/^[a-f0-9]{64}$/u.test(entryFacts.trafficSha256Before ?? '')
    || !same(rollback.value.previousReceiptRef, entry.ref) || !same(terminal.value.previousReceiptRef, rollback.ref)
    || terminalFacts.previousRevision !== intent.previousRevision || rollbackFacts.previousRevision !== intent.previousRevision
    || terminalFacts.databaseDisposition !== databaseDisposition || rollbackFacts.databaseDisposition !== databaseDisposition
    || rollbackFacts.result !== 'PRE_ACTIVATION_ABORTED'
    || !same(terminalFacts.entrypointRecovery, rollbackFacts.entrypointRecovery)
    || !['BASELINE_ALREADY_ACTIVE', 'BASELINE_RESTORED'].includes(rollbackFacts.entrypointRecovery?.result)
    || rollbackFacts.entrypointRecovery.changed !== (rollbackFacts.entrypointRecovery.result === 'BASELINE_RESTORED')
    || !same(rollbackFacts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])) fail()
  await assertAbsentStages(read, paths, ['activate', 'canonical', 'finalize'])
  const verify = await optionalOrdinaryStage(read, paths.verify)
  const decision = await optionalOrdinaryStage(read, paths.decision)
  const optionalRefs = {}
  if (verify) {
    const facts = sealOrdinaryStage(verify, 'verify', intent, profile), smoke = facts.smoke
    if (!same(verify.value.previousReceiptRef, entry.ref) || !same(facts.entrypointReceiptRef, entry.ref)
      || !same(facts.candidateReceiptRef, candidate.ref) || facts.candidateRevision !== candidateFacts.candidateRevision
      || facts.artifactDigest !== candidateFacts.artifactDigest || facts.tagUri !== candidateFacts.tagUri
      || !same(facts.sideEffects, profile.sideEffects) || Object.values(profile.sideEffects).some(value => !String(value).startsWith('DISABLED'))
      || smoke?.schemaVersion !== 'jenfu.dev121.principal-candidate-smoke.v1' || smoke.ownerApplicationId !== profile.application.id
      || smoke.candidateRevision !== candidateFacts.candidateRevision || smoke.artifactDigest !== candidateFacts.artifactDigest
      || smoke.origin !== facts.tagUri || smoke.status !== 'PASS' || !Array.isArray(smoke.observations)
      || !['auth-mode', 'platform-session', 'target-session', 'authenticated-probe'].every(id => smoke.observations.some(row => row.id === id && row.status === 200))
      || !['sso-start', 'sso-authorize', 'sso-callback'].every(id => smoke.observations.some(row => row.id === id && row.status === 303))
      || !['unauthenticated-probe', 'session-revoked'].every(id => smoke.observations.some(row => row.id === id && row.status === 401))
      || new Set(smoke.observations.map(row => row.id)).size !== smoke.observations.length) fail()
    optionalRefs.verify = verify.ref
  }
  if (decision) {
    const facts = sealOrdinaryStage(decision, 'decision', intent, profile)
    if (!verify || !same(decision.value.previousReceiptRef, verify.ref) || !same(facts.verifyReceiptRef, verify.ref)
      || facts.decision !== 'GO' || facts.remainingHumanAction !== 0
      || facts.candidateRevision !== candidateFacts.candidateRevision || facts.artifactDigest !== candidateFacts.artifactDigest) fail()
    optionalRefs.decision = decision.ref
  }
  return { prepare, migration, candidate, deployment, entry, rollback, terminal, prepareFacts, candidateFacts,
    terminalFacts, repair, databaseDisposition, fingerprint, verify, decision, optionalRefs }
}
function assertOrdinaryOwnerWindow(evidence, run) {
  if (!evidence.verify && !evidence.decision) return
  const window = closedOwnerWindow(run)
  let prior = window.start
  for (const row of [evidence.verify, evidence.decision]) {
    if (!row) continue
    const observed = Date.parse(row.value.observedAt)
    if (!Number.isFinite(observed) || observed < prior || observed > window.end) fail()
    prior = observed
  }
}
async function readOrdinaryAbortObservation({ profile, transport, baselineIntentRef, intent, evidence, verifyProvider }) {
  const failed = await transport.readOwnerSourceProof({ profile, sourceRevision: intent.sourceRevision,
    refs: { prepare: evidence.prepare.ref, migrate: evidence.migration.ref, terminal: null }, verifyProvider })
  assertOrdinarySourceProof(failed.proof, intent, baselineIntentRef, evidence.repair ? 'migration_evidence_only' : 'migration_only', profile)
  if (failed.proof.artifactDigest !== evidence.candidateFacts.artifactDigest
    || failed.proof.prepare?.ref !== evidence.prepare.ref.uri || failed.proof.prepare.sha256 !== evidence.prepare.ref.sha256
    || failed.proof.migrate?.ref !== evidence.migration.ref.uri || failed.proof.migrate.sha256 !== evidence.migration.ref.sha256
    || (verifyProvider && (failed.provider?.status !== 'BUILD_IMAGE_VERIFIED'
      || failed.provider.sourceRevision !== failed.proof.sourceRevision || failed.provider.artifactDigest !== failed.proof.artifactDigest))) fail()
  return failed
}

async function readOrdinaryAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider,
  postAbortLedgerReadbackRef = null, principalOnlyFenceRef = null, principalOnlyRecovery = null }) {
  const bucket = profile.artifact.releaseBucket
  if (profile.application.id !== 'ai-pdm' || bucket !== 'jenfu-platform-prod-aipdm-release'
    || profile.target.projectId !== 'jenfu-platform-prod' || profile.target.region !== 'asia-east1'
    || profile.target.serviceName !== 'ai-pdm-prod'
    || intent.schemaVersion !== profile.schemas.releaseIntent
    || Object.hasOwn(intent, 'principalOnlyRecovery') || Object.hasOwn(intent, 'principalOnlyFenceRef')
    || baselineIntentRef.uri !== `gs://${bucket}/receipts/releases/${intent.releaseId}/release-intent.json`
    || !intent.baselineIntentRef || same(intent.baselineIntentRef, baselineIntentRef)) fail()
  assertImmutableRef(intent.baselineIntentRef, bucket, ['receipts'])
  if (terminalFacts.databaseDisposition === 'NOT_APPLIED' || (terminalFacts.databaseDisposition === 'UNKNOWN' && postAbortLedgerReadbackRef)) {
    return readPrebuildAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider,
      postAbortLedgerReadbackRef, principalOnlyFenceRef, principalOnlyRecovery })
  }
  const evidence = await readOrdinaryAbortEvidence({ profile, baselineIntentRef, intent, paths, terminal, read })
  const { prepare, migration, candidate, deployment, entry, rollback, prepareFacts, candidateFacts, repair, fingerprint, optionalRefs } = evidence
  const anchor = await transport.readJson(intent.baselineIntentRef, bucket, ['receipts'])
  const keys = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision',
    'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
  const { controlSha256, ...controlCore } = control
  const runPrefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = control.ownerRunRef?.startsWith(runPrefix) ? control.ownerRunRef.slice(runPrefix.length) : ''
  if (!same(Object.keys(control).sort(), keys.sort()) || controlSha256 !== sha256(canonicalize(controlCore))
    || control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.state !== 'FINALIZED'
    || control.result !== 'PRE_ACTIVATION_ABORTED' || control.inputFingerprint !== fingerprint
    || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName || control.controlBucket !== bucket
    || control.releaseId !== intent.releaseId || control.sourceRevision !== intent.sourceRevision || control.sourceLockSha256 !== intent.sourceLockRef.sha256
    || control.previousRevision !== intent.previousRevision || control.candidateRevision !== candidateFacts.candidateRevision
    || control.candidateRevision === intent.previousRevision || !/^[1-9][0-9]*$/u.test(runId)
    || control.deadlineAt !== intent.deadlineAt || !Number.isFinite(Date.parse(control.deadlineAt))
    || !Number.isFinite(Date.parse(control.leaseExpiresAt)) || Date.parse(control.leaseExpiresAt) >= Date.now()) fail()
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()
  assertOrdinaryOwnerWindow(evidence, run)
  const failed = await readOrdinaryAbortObservation({ profile, transport, baselineIntentRef, intent, evidence, verifyProvider })
  if ((failed.proof?.databaseDisposition === 'HISTORICAL_EVIDENCE_REUSED') !== repair) fail()
  if (repair) {
    if (failed.proof.migrationVerified !== false || failed.proof.databaseLiveState !== 'UNKNOWN' || failed.proof.currentDatabaseReadPerformed !== false || failed.proof.evidenceScope !== 'MIGRATION_INPUT_EQUIVALENT_NO_EXECUTION') fail()
    const graph = await readAiPdmObservationInputs(failed.proof)
    if (!graph.repair) fail()
  }
  const consumeAnchor = async (anchor, releasedIntentRef, retainedBases = []) => {
    const anchorIntent = anchor.value
    if (anchorIntent?.ownerApplicationId !== profile.application.id || !/^[a-f0-9]{40}$/u.test(anchorIntent.sourceRevision ?? '')
      || anchorIntent.schemaVersion !== profile.schemas.releaseIntent
      || releasedIntentRef.uri !== `gs://${bucket}/receipts/releases/${anchorIntent.releaseId}/release-intent.json`) fail()
    const releasedContext = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), releasedIntentRef, true)
    return runAiPdmEvidenceContext(releasedContext, async () => {
      const anchorPaths = releasePaths(profile, anchorIntent, releasedIntentRef.sha256)
      const anchorRead = async (stage) => read(anchorPaths[stage])
      const [anchorPrepare, anchorMigration, anchorTerminal, anchorRuntime, anchorVerify, anchorCanonical] = await Promise.all([
        anchorRead('prepare'), anchorRead('migrate'), anchorRead('terminal'),
        transport.readJson(anchorIntent.runtimeConfigRef, bucket, ['receipts']), anchorRead('verify'), anchorRead('canonical'),
      ])
      const released = await transport.readOwnerSourceProof({ profile, sourceRevision: anchorIntent.sourceRevision,
        refs: { prepare: anchorPrepare.ref, migrate: anchorMigration.ref, terminal: anchorTerminal.ref }, verifyProvider })
      assertOrdinarySourceProof(released.proof, anchorIntent, releasedIntentRef, 'released', profile)
      const anchorRepair = anchorMigration.value?.schemaVersion === 'aipdm.paused-app-repair-migration-association.v1'
      for (const [observation, expectedRepair] of [[released, anchorRepair]]) {
        if ((observation.proof?.databaseDisposition === 'HISTORICAL_EVIDENCE_REUSED') !== expectedRepair) fail()
      }
      for (const observation of [released]) if (observation.proof?.databaseDisposition === 'HISTORICAL_EVIDENCE_REUSED') {
        if (observation.proof.migrationVerified !== false || observation.proof.databaseLiveState !== 'UNKNOWN' || observation.proof.currentDatabaseReadPerformed !== false || observation.proof.evidenceScope !== 'MIGRATION_INPUT_EQUIVALENT_NO_EXECUTION') fail()
        const graph = await readAiPdmObservationInputs(observation.proof)
        if (!graph.repair) fail()
      }
      if (failed.proof.artifactDigest !== candidateFacts.artifactDigest || released.proof.candidateRevision !== intent.previousRevision
        || (verifyProvider && [failed, released].some(row => row.provider?.status !== 'BUILD_IMAGE_VERIFIED'
          || row.provider.sourceRevision !== row.proof.sourceRevision || row.provider.artifactDigest !== row.proof.artifactDigest))
        || !same(anchorPrepare.value.facts?.prerequisiteRefs?.runtimeConfig, anchorIntent.runtimeConfigRef)
        || anchorRuntime.value.ownerApplicationId !== profile.application.id || anchorRuntime.value.sourceRevision !== anchorIntent.sourceRevision
        || anchorRuntime.value.releaseId !== anchorIntent.releaseId || anchorRuntime.value.status !== 'VERIFIED'
        || anchorRuntime.value.releaseAuthority !== true) fail()
      const [failedLock, anchorLock] = await Promise.all([
        transport.readJson(intent.sourceLockRef, bucket, ['receipts']), transport.readJson(anchorIntent.sourceLockRef, bucket, ['receipts']),
      ])
      if (failedLock.value.sourceSha256 !== intent.sourceSha256 || anchorLock.value.sourceSha256 !== anchorIntent.sourceSha256) fail()
      const runtime = anchorRuntime.value.runtimeConfig ?? anchorRuntime.value
      const principalModes = { PDM_JENFU_PLATFORM_AUTH_MODE: 'on', PDM_JENFU_ENTITLEMENT_MODE: 'enforce', PDM_JENFU_SSO_HANDOFF_MODE: 'on' }
      if (Object.entries(principalModes).some(([name, value]) => runtime.plainEnvironment?.[name] !== value)) fail()
      for (const row of [anchorVerify, anchorCanonical]) {
        const smoke = row.value.facts?.smoke
        const isCandidate = row === anchorVerify
        if ((isCandidate && (smoke?.schemaVersion !== 'jenfu.dev121.principal-candidate-smoke.v1'
            || smoke.ownerApplicationId !== profile.application.id || smoke.artifactDigest !== released.proof.artifactDigest
            || smoke.candidateRevision !== intent.previousRevision))
          || (!isCandidate && (row.value.facts?.origin !== profile.target.canonicalOrigin
            || smoke?.origin !== profile.target.canonicalOrigin))
          || row.value.facts?.artifactDigest !== released.proof.artifactDigest || row.value.facts?.candidateRevision !== intent.previousRevision
          || smoke?.status !== 'PASS'
          || !['auth-mode', 'platform-session', 'target-session', 'authenticated-probe'].every(id => smoke.observations?.some(observation => observation.id === id && observation.status === 200))
          || !['sso-start', 'sso-authorize', 'sso-callback'].every(id => smoke.observations?.some(observation => observation.id === id && observation.status === 303))
          || new Set(smoke.observations?.map(observation => observation.id)).size !== smoke.observations?.length
          || !['unauthenticated-probe', 'session-revoked'].every(id => smoke.observations?.some(observation => observation.id === id && observation.status === 401))) fail()
      }
      service ??= await transport.getService(profile)
      transport.assertServiceSettled(service, 'DEV121_PREACTIVATION_CONTINUATION_INVALID')
      const serviceName = `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`
      if (service.name !== serviceName || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(service.uid ?? '')
        || service.scaling?.scalingMode !== 'AUTOMATIC' || Number(service.scaling.maxInstanceCount) !== 1
        || !traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)) fail()
      const entrySnapshot = value => ({ ingress: value.ingress, defaultUriDisabled: value.defaultUriDisabled === true,
        invokerIamDisabled: value.invokerIamDisabled === true, uri: value.uri, urls: [...(value.urls ?? [])].sort() })
      if (!same(entrySnapshot(service), entrySnapshot(prepareFacts.entrypointBaseline))) fail()
      transport.assertCanonicalEntrypoint(profile, service)
      const [retainedRevision, candidateRevision] = await Promise.all([
        transport.getRevision(profile, intent.previousRevision), transport.getRevision(profile, candidateFacts.candidateRevision),
      ])
      const readyImage = (revision, name, image) => revision?.name === `${service.name}/revisions/${name}`
        && revision.conditions?.find(row => row.type === 'Ready')?.state === 'CONDITION_SUCCEEDED'
        && revision.containers?.filter(row => row.name === profile.runtime.containerName).length === 1
        && revision.containers.find(row => row.name === profile.runtime.containerName).image === image
      if (!readyImage(retainedRevision, intent.previousRevision, released.proof.artifactDigest)
        || !readyImage(candidateRevision, candidateFacts.candidateRevision, failed.proof.artifactDigest)) fail()
      const retainedEnvironment = retainedRevision.containers.find(row => row.name === profile.runtime.containerName).env ?? []
      if (new Set(retainedEnvironment.map(row => row.name)).size !== retainedEnvironment.length
        || Object.entries(principalModes).some(([name, value]) => retainedEnvironment.find(row => row.name === name)?.value !== value)) fail()
      for (const basis of retainedBases) {
        if (!same(basis.releasedProof, released.proof) || !same(basis.stageRefs?.runtimeConfig, anchorRuntime.ref)
          || basis.serviceUid !== service.uid || basis.previousRevision !== intent.previousRevision
          || basis.retainedArtifactDigest !== released.proof.artifactDigest || !same(basis.entrypoint, entrySnapshot(service))
          || !same(basis.scaling, service.scaling) || basis.retainedEnvironmentSha256 !== sha256(canonicalize(retainedEnvironment))) fail()
      }
      return { kind: 'PRINCIPAL_ORDINARY_ABORT', currentActiveRevision: intent.previousRevision, result: 'PRE_ACTIVATION_ABORTED',
        authorityBasis: { schemaVersion: 'ai-pdm.principal-ordinary-abort-basis.v1', failedIntentRef: baselineIntentRef,
          releasedIntentRef, failedProof: failed.proof, releasedProof: released.proof,
          stageRefs: { prepare: prepare.ref, migration: migration.ref, candidate: candidate.ref, deployment: deployment.ref, entrypoint: entry.ref,
            rollback: rollback.ref, terminal: terminal.ref, runtimeConfig: anchorRuntime.ref, ...optionalRefs },
          controlSha256, inputFingerprint: fingerprint, ownerRunRef: control.ownerRunRef, serviceUid: service.uid,
          previousRevision: intent.previousRevision, retainedArtifactDigest: released.proof.artifactDigest,
          entrypoint: entrySnapshot(service), scaling: service.scaling, retainedEnvironmentSha256: sha256(canonicalize(retainedEnvironment)) } }
    })
  }
  if (prepareFacts.preActivationAbortBasis) {
    if (repair || terminalFacts.databaseDisposition !== 'FORWARD_APPLIED') fail()
    const binding = currentMigrationBinding({ profile, intent, paths, migration, deployment, run, failed })
    if (prepareFacts.preActivationAbortBasis.schemaVersion === 'ai-pdm.principal-ordinary-abort-basis.v1') {
      return readHistoricalOrdinaryPredecessor({ profile, transport, intent, basis: prepareFacts.preActivationAbortBasis, anchor, read, binding, verifyProvider, consume: consumeAnchor })
    }
    return readHistoricalOrdinaryAnchor({ profile, transport, intent, basis: prepareFacts.preActivationAbortBasis, anchor, read, bindings: [binding], consume: consumeAnchor })
  }
  return consumeAnchor(anchor, intent.baselineIntentRef)
}

// A NOT_APPLIED abort may stop before Build, after an unsealed provider Build,
// or after the sealed build/deployment pair but before migration submission.
// Every shape remains non-authoritative and must prove that no matching
// migration execution exists.  None promotes the aborted capsule or image into
// a released artifact.
async function readPrebuildAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider,
  postAbortLedgerReadbackRef = null, principalOnlyFenceRef = null, principalOnlyRecovery = null, appliedMigrationContinuation = null, principalOnlyReconciled = false }) {
  const bucket = profile.artifact.releaseBucket
  const reconciled = postAbortLedgerReadbackRef !== null
  const principalRecovery = reconciled && principalOnlyReconciled
  if (appliedMigrationContinuation !== null) {
    try { assertAppliedMigrationContinuation(appliedMigrationContinuation, bucket) } catch { fail() }
    if (!reconciled || !principalRecovery) fail()
  }
  const recovery = reconciled
    ? assertPrincipalOnlyRecoveryBinding({ previousRevision: intent.previousRevision, principalOnlyFenceRef, principalOnlyRecovery }, bucket)
    : null
  if ((terminalFacts.databaseDisposition === 'UNKNOWN') !== reconciled || (principalRecovery && !recovery)
    || (!reconciled && (principalOnlyFenceRef || principalOnlyRecovery))) fail()
  const abortRevision = principalRecovery ? recovery.revision : intent.previousRevision
  let [prepare, rollback, failedLock, anchor] = await Promise.all([
    read(paths.prepare), read(paths.rollback), transport.readJson(intent.sourceLockRef, bucket, ['receipts']),
    transport.readJson(intent.baselineIntentRef, bucket, ['receipts']),
  ])
  const prepareFacts = seal(prepare, 'prepare'), rollbackFacts = seal(rollback, 'rollback')
  const refNames = { sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef',
    foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId,
    sourceRevision: intent.sourceRevision, releaseIntentSha256: baselineIntentRef.sha256 }))
  const keys = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision',
    'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256']
  const { controlSha256, ...controlCore } = control
  const runPrefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = control.ownerRunRef?.startsWith(runPrefix) ? control.ownerRunRef.slice(runPrefix.length) : ''
  if (!same(Object.keys(control).sort(), keys.sort()) || controlSha256 !== sha256(canonicalize(controlCore))
    || control.schemaVersion !== 'jenfu.dev012.owner-control-head.v1' || control.state !== 'FINALIZED'
    || control.result !== 'PRE_ACTIVATION_ABORTED' || control.inputFingerprint !== fingerprint
    || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName || control.controlBucket !== bucket
    || control.releaseId !== intent.releaseId || control.sourceRevision !== intent.sourceRevision || control.sourceLockSha256 !== intent.sourceLockRef.sha256
    || control.previousRevision !== abortRevision || control.candidateRevision !== null || !/^[1-9][0-9]*$/u.test(runId)
    || control.deadlineAt !== intent.deadlineAt || !Number.isFinite(Date.parse(control.deadlineAt))
    || !Number.isFinite(Date.parse(control.leaseExpiresAt)) || Date.parse(control.leaseExpiresAt) >= Date.now()
    || prepare.value.previousReceiptRef !== null || prepareFacts.previousRevision !== intent.previousRevision
    || !same(prepareFacts.prerequisiteRefs, Object.fromEntries(Object.entries(refNames).map(([name, field]) => [name, intent[field]])))
    || rollback.value.previousReceiptRef !== null || !same(terminal.value.previousReceiptRef, rollback.ref)
    || terminalFacts.previousRevision !== abortRevision || rollbackFacts.previousRevision !== abortRevision
    || terminalFacts.databaseDisposition !== (reconciled ? 'UNKNOWN' : 'NOT_APPLIED')
    || rollbackFacts.databaseDisposition !== (reconciled ? 'UNKNOWN' : 'NOT_APPLIED')
    || (reconciled ? !same(terminalFacts.migrationSubmissionIntentRef, rollbackFacts.migrationSubmissionIntentRef)
      : Object.hasOwn(terminalFacts, 'migrationSubmissionIntentRef') || Object.hasOwn(rollbackFacts, 'migrationSubmissionIntentRef'))
    || rollbackFacts.result !== 'PRE_ACTIVATION_ABORTED'
    || !same(terminalFacts.entrypointRecovery, rollbackFacts.entrypointRecovery)
    || !same(rollbackFacts.entrypointRecovery, { changed: false, result: 'NOT_REQUIRED' })
    || !same(rollbackFacts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])
    || failedLock.ref.sha256 !== intent.sourceLockRef.sha256 || failedLock.value.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1'
    || failedLock.value.ownerApplicationId !== profile.application.id || failedLock.value.releaseId !== intent.releaseId
    || failedLock.value.sourceRevision !== intent.sourceRevision || failedLock.value.sourceSha256 !== intent.sourceSha256
    || failedLock.value.migrationManifestSha256 !== intent.migrationManifestSha256
    || failedLock.value.status !== 'SOURCE_FROZEN' || failedLock.value.releaseAuthority !== true || failedLock.value.clean !== true) {
    fail()
  }
  // Only a positive 404 is absence; partial uploads and unknown reads fail closed.
  const optional = async uri => { try { return await read(uri) } catch (error) { if (error.code !== 'MISSING') throw error; return null } }
  const [build, provenance, deployment] = await Promise.all([optional(paths.build), optional(paths.provenance), optional(paths.deployment)])
  if (Boolean(build) !== Boolean(deployment) || ((build || deployment) && !provenance)) fail()
  const absentStages = build
    ? ['migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']
    : ['build', ...(provenance ? [] : ['provenance', 'sbom', 'scan']), 'deployment', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']
  await assertAbsentStages(read, paths, absentStages)
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()
  const reconciliation = reconciled
    ? await readPostAbortLedgerReconciliation({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts,
      rollbackFacts, prepareFacts, build, deployment, control, read, run, ref: postAbortLedgerReadbackRef,
      principalOnlyFenceRef: principalRecovery ? principalOnlyFenceRef : null, principalOnlyRecovery: principalRecovery ? principalOnlyRecovery : null,
      appliedMigrationContinuation })
    : (await assertMissing(read, migrationSubmissionIntentUri(profile, paths.migrate)), null)
  const completed = build ? await readSealedUnsubmittedBuild({ profile, transport, baselineIntentRef, intent, paths, prepare, prepareFacts,
    build, provenance, deployment, read, seal, run, verifyMigrationAbsence: !reconciled }) : null
  const partial = !build && provenance ? await readUnpublishedBuild({ profile, transport, baselineIntentRef, intent, paths, provenance, read, run }) : null
  if (!completed && !partial) await assertZeroBuilds(profile, transport, intent)
  let releasedIntentRef = intent.baselineIntentRef, inheritedBasis = null
  if (completed && prepareFacts.preActivationAbortBasis) {
    inheritedBasis = prepareFacts.preActivationAbortBasis
    if (!['ai-pdm.principal-prebuild-abort-basis.v1', 'ai-pdm.principal-unpublished-build-abort-basis.v1',
      'ai-pdm.principal-postbuild-pre-migration-abort-basis.v1', 'ai-pdm.principal-reconciled-migration-abort-basis.v1'].includes(inheritedBasis.schemaVersion)
      || !same(inheritedBasis.failedIntentRef, intent.baselineIntentRef)
      || inheritedBasis.previousRevision !== intent.previousRevision
      || !/^[a-f0-9]{64}$/u.test(inheritedBasis.controlSha256 ?? '')) fail()
    assertImmutableRef(inheritedBasis.releasedIntentRef, bucket, ['receipts'])
    releasedIntentRef = inheritedBasis.releasedIntentRef
    anchor = await transport.readJson(releasedIntentRef, bucket, ['receipts'])
  } else if (partial && prepareFacts.preActivationAbortBasis) {
    inheritedBasis = prepareFacts.preActivationAbortBasis
    releasedIntentRef = await readInheritedPrebuildAnchor({ profile, transport, intent, inheritedBasis, anchor, read })
    anchor = await transport.readJson(releasedIntentRef, bucket, ['receipts'])
  }
  const anchorIntent = anchor.value
  if (anchorIntent?.ownerApplicationId !== profile.application.id || !/^[a-f0-9]{40}$/u.test(anchorIntent.sourceRevision ?? '')
    || anchorIntent.schemaVersion !== profile.schemas.releaseIntent
    || releasedIntentRef.uri !== `gs://${bucket}/receipts/releases/${anchorIntent.releaseId}/release-intent.json`) fail()
  const anchorPaths = releasePaths(profile, anchorIntent, releasedIntentRef.sha256)
  const [anchorPrepare, anchorMigration, anchorTerminal, anchorRuntime, anchorVerify, anchorCanonical, anchorLock] = await Promise.all([
    read(anchorPaths.prepare), read(anchorPaths.migrate), read(anchorPaths.terminal),
    transport.readJson(anchorIntent.runtimeConfigRef, bucket, ['receipts']), read(anchorPaths.verify), read(anchorPaths.canonical),
    transport.readJson(anchorIntent.sourceLockRef, bucket, ['receipts']),
  ])
  const releasedContext = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), releasedIntentRef, true)
  const released = await runAiPdmEvidenceContext(releasedContext, () => transport.readOwnerSourceProof({ profile, sourceRevision: anchorIntent.sourceRevision,
    refs: { prepare: anchorPrepare.ref, migrate: anchorMigration.ref, terminal: anchorTerminal.ref }, verifyProvider }))
  const proof = released.proof
  if (proof?.owner !== profile.application.id || proof.sourceRevision !== anchorIntent.sourceRevision
    || proof.releaseId !== anchorIntent.releaseId || proof.disposition !== 'released'
    || proof.sourceLock?.ref !== anchorIntent.sourceLockRef.uri || proof.sourceLock.sha256 !== anchorIntent.sourceLockRef.sha256
    || proof.migrationManifestSha256 !== anchorIntent.migrationManifestSha256
    || !proof.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`) || proof.candidateRevision !== intent.previousRevision
    || proof.releaseChain?.deployment?.ref !== anchorPaths.deployment
    || (verifyProvider && (released.provider?.status !== 'BUILD_IMAGE_VERIFIED'
      || released.provider.sourceRevision !== proof.sourceRevision || released.provider.artifactDigest !== proof.artifactDigest))
    || anchorLock.value.sourceSha256 !== anchorIntent.sourceSha256
    || !same(anchorPrepare.value.facts?.prerequisiteRefs?.runtimeConfig, anchorIntent.runtimeConfigRef)
    || anchorRuntime.value.ownerApplicationId !== profile.application.id || anchorRuntime.value.sourceRevision !== anchorIntent.sourceRevision
    || anchorRuntime.value.releaseId !== anchorIntent.releaseId || anchorRuntime.value.status !== 'VERIFIED'
    || anchorRuntime.value.releaseAuthority !== true) fail()
  const principalModes = { PDM_JENFU_PLATFORM_AUTH_MODE: 'on', PDM_JENFU_ENTITLEMENT_MODE: 'enforce', PDM_JENFU_SSO_HANDOFF_MODE: 'on' }
  const runtime = anchorRuntime.value.runtimeConfig ?? anchorRuntime.value
  if (Object.entries(principalModes).some(([name, value]) => runtime.plainEnvironment?.[name] !== value)) fail()
  for (const row of [anchorVerify, anchorCanonical]) {
    const smoke = row.value.facts?.smoke, isCandidate = row === anchorVerify
    if ((isCandidate && (smoke?.schemaVersion !== 'jenfu.dev121.principal-candidate-smoke.v1'
        || smoke.ownerApplicationId !== profile.application.id || smoke.artifactDigest !== proof.artifactDigest
        || smoke.candidateRevision !== intent.previousRevision))
      || (!isCandidate && (row.value.facts?.origin !== profile.target.canonicalOrigin || smoke?.origin !== profile.target.canonicalOrigin))
      || row.value.facts?.artifactDigest !== proof.artifactDigest || row.value.facts?.candidateRevision !== intent.previousRevision
      || smoke?.status !== 'PASS'
      || !['auth-mode', 'platform-session', 'target-session', 'authenticated-probe'].every(id => smoke.observations?.some(observation => observation.id === id && observation.status === 200))
      || !['sso-start', 'sso-authorize', 'sso-callback'].every(id => smoke.observations?.some(observation => observation.id === id && observation.status === 303))
      || new Set(smoke.observations?.map(observation => observation.id)).size !== smoke.observations?.length
      || !['unauthenticated-probe', 'session-revoked'].every(id => smoke.observations?.some(observation => observation.id === id && observation.status === 401))) fail()
  }
  service ??= await transport.getService(profile)
  transport.assertServiceSettled(service, 'DEV121_PREACTIVATION_CONTINUATION_INVALID')
  const serviceName = `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`
  const entrySnapshot = value => ({ ingress: value.ingress, defaultUriDisabled: value.defaultUriDisabled === true,
    invokerIamDisabled: value.invokerIamDisabled === true, uri: value.uri, urls: [...(value.urls ?? [])].sort() })
  if (service.name !== serviceName || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(service.uid ?? '')
    || (reconciled && !principalRecovery
      ? service.scaling?.scalingMode !== 'MANUAL' || ![0, '0'].includes(service.scaling?.manualInstanceCount) || recovery.serviceUid !== service.uid
      : principalRecovery
        ? !((service.scaling?.scalingMode === 'MANUAL' && [0, '0'].includes(service.scaling?.manualInstanceCount))
          || (service.scaling?.scalingMode === 'AUTOMATIC' && Number.isFinite(Number(service.scaling?.maxInstanceCount))
            && Number(service.scaling?.maxInstanceCount) >= 1)) || recovery.serviceUid !== service.uid
      : service.scaling?.scalingMode !== 'AUTOMATIC' || Number(service.scaling.maxInstanceCount) !== 1)
    || !traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)
    || !same(entrySnapshot(service), entrySnapshot(prepareFacts.entrypointBaseline))) fail()
  transport.assertCanonicalEntrypoint(profile, service)
  if (principalRecovery) {
    const [fenceRow, proofRow, recoveryRevision] = await Promise.all([
      read(principalOnlyFenceRef.uri), transport.readJson(recovery.receiptRef, bucket, ['receipts']), transport.getRevision(profile, recovery.revision),
    ])
    const fence = fenceRow.value
    if (!same(fenceRow.ref, principalOnlyFenceRef) || !same(proofRow.ref, recovery.receiptRef)
      || !same(Object.keys(fence).sort(), ['schemaVersion', 'sourceRevision', 'projectId', 'region', 'service', 'serviceUid',
        'oldRevision', 'beforeGeneration', 'quiescentGeneration', 'serviceUpdateTime', 'requestTimeoutSeconds', 'status'].sort())
      || fence.schemaVersion !== 'ai-pdm.principal-only-migration-fence.v1'
      || !/^[a-f0-9]{40}$/u.test(fence.sourceRevision ?? '') || fence.projectId !== profile.target.projectId
      || fence.region !== profile.target.region || fence.service !== profile.target.serviceName
      || fence.serviceUid !== service.uid || fence.oldRevision !== intent.previousRevision
      || !/^[1-9][0-9]*$/u.test(fence.beforeGeneration ?? '') || !/^[1-9][0-9]*$/u.test(fence.quiescentGeneration ?? '')
      || Number(fence.quiescentGeneration) <= Number(fence.beforeGeneration)
      || !Number.isFinite(Date.parse(fence.serviceUpdateTime)) || fence.requestTimeoutSeconds !== 60 || fence.status !== 'QUIESCED') fail()
    assertRecoveryProofReadback({ sourceRevision: intent.sourceRevision, oldRevision: intent.previousRevision,
      binding: recovery, profile, proof: proofRow.value, service, revision: recoveryRevision, activeRevision: intent.previousRevision })
  }
  const retainedRevision = await transport.getRevision(profile, intent.previousRevision)
  const retainedApp = retainedRevision?.containers?.filter(row => row.name === profile.runtime.containerName)
  if (retainedRevision?.name !== `${service.name}/revisions/${intent.previousRevision}`
    || retainedRevision.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
    || retainedApp?.length !== 1 || retainedApp[0].image !== proof.artifactDigest) fail()
  const retainedEnvironment = retainedApp[0].env ?? []
  if (new Set(retainedEnvironment.map(row => row.name)).size !== retainedEnvironment.length
    || Object.entries(principalModes).some(([name, value]) => retainedEnvironment.find(row => row.name === name)?.value !== value)) fail()
  if (inheritedBasis && (inheritedBasis.serviceUid !== service.uid || inheritedBasis.previousRevision !== intent.previousRevision
    || inheritedBasis.retainedArtifactDigest !== proof.artifactDigest || !same(inheritedBasis.releasedProof, proof)
    || !same(inheritedBasis.entrypoint, entrySnapshot(service)) || (!reconciled && !same(inheritedBasis.scaling, service.scaling))
    || inheritedBasis.retainedEnvironmentSha256 !== sha256(canonicalize(retainedEnvironment)))) fail()
  const schemaVersion = reconciled ? 'ai-pdm.principal-reconciled-migration-abort-basis.v1'
    : completed ? 'ai-pdm.principal-postbuild-pre-migration-abort-basis.v1'
    : partial ? 'ai-pdm.principal-unpublished-build-abort-basis.v1' : 'ai-pdm.principal-prebuild-abort-basis.v1'
  return { kind: reconciled ? 'PRINCIPAL_FENCED_ABORT_RECONCILED' : 'PRINCIPAL_ORDINARY_ABORT', currentActiveRevision: intent.previousRevision, result: 'PRE_ACTIVATION_ABORTED',
    authorityBasis: { schemaVersion, failedIntentRef: baselineIntentRef,
      releasedIntentRef, failedSourceLockRef: failedLock.ref, databaseDisposition: 'NOT_APPLIED', releasedProof: proof,
      absentStages: absentStages.filter(stage => !['sbom', 'scan'].includes(stage)), failedBuildCount: completed || partial ? 1 : 0,
      ...(reconciled ? { originalDatabaseDisposition: 'UNKNOWN', reconciliation: reconciliation.basis, sealedBuild: completed, principalOnlyFenceRef, principalOnlyRecovery: recovery }
        : completed ? { sealedBuild: completed, inheritedBasis } : partial ? { unpublishedBuild: partial, inheritedBasis } : {}),
      stageRefs: { prepare: prepare.ref, ...(completed ? { build: build.ref, deployment: deployment.ref } : {}), rollback: rollback.ref, terminal: terminal.ref, runtimeConfig: anchorRuntime.ref },
      controlSha256, inputFingerprint: fingerprint, ownerRunRef: control.ownerRunRef, serviceUid: service.uid,
      previousRevision: intent.previousRevision, retainedArtifactDigest: proof.artifactDigest,
      entrypoint: entrySnapshot(service), scaling: service.scaling, retainedEnvironmentSha256: sha256(canonicalize(retainedEnvironment)) } }
}

function ordinaryMigrationEnvironment(profile, runnerSourceRevision, principalOnlyFenceRef = null) {
  const connection = 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'
  const environment = {
    OWNER_APPLICATION_ID: profile.application.id,
    RELEASE_BUCKET: profile.artifact.releaseBucket,
    GOOGLE_CLOUD_PROJECT: profile.target.projectId,
    GOOGLE_CLOUD_REGION: profile.target.region,
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: connection,
    POSTGRES_DATABASE: 'jenfu_prod',
    POSTGRES_IAM_LOGIN: profile.migrations.serviceAccount.replace('.gserviceaccount.com', ''),
    POSTGRES_SOCKET: `/cloudsql/${connection}`,
    PDM_SOURCE_REVISION: runnerSourceRevision,
  }
  if (principalOnlyFenceRef) {
    environment.DEV121_MIGRATION_FENCE_REF = principalOnlyFenceRef.uri
    environment.DEV121_MIGRATION_FENCE_SHA256 = principalOnlyFenceRef.sha256
  }
  return environment
}

function executionTerminalFacts(execution) {
  const completed = execution?.conditions?.filter(row => row?.type === 'Completed')
  const created = Date.parse(execution?.createTime), finished = Date.parse(execution?.completionTime)
  if (completed?.length !== 1 || !['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(completed[0].state)
    || !Number.isFinite(created) || !Number.isFinite(finished) || finished < created
    || execution.reconciling === true || Number(execution.runningCount ?? 0) !== 0) fail()
  return { created, finished, completedState: completed[0].state }
}

function executionProjection(execution) {
  return {
    name: execution.name,
    createTime: execution.createTime,
    startTime: execution.startTime ?? null,
    completionTime: execution.completionTime,
    succeededCount: Number(execution.succeededCount ?? 0),
    failedCount: Number(execution.failedCount ?? 0),
    cancelledCount: Number(execution.cancelledCount ?? 0),
    runningCount: Number(execution.runningCount ?? 0),
    taskCount: execution.taskCount,
    parallelism: execution.parallelism,
    completedState: execution.conditions.find(row => row?.type === 'Completed')?.state,
    templateSha256: execution.template === undefined ? null : sha256(canonicalize(execution.template)),
  }
}

const CLOUD_SQL_VOLUMES = [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }]
const CLOUD_SQL_MOUNTS = [{ name: 'cloudsql', mountPath: '/cloudsql' }]

function executionCloudSqlFieldsMatch(task, container, staticTask = null) {
  const hasVolumes = Object.hasOwn(task ?? {}, 'volumes')
  const hasMounts = Object.hasOwn(container ?? {}, 'volumeMounts')
  if (hasVolumes !== hasMounts) return false
  if (hasVolumes) return same(task.volumes, CLOUD_SQL_VOLUMES) && same(container.volumeMounts, CLOUD_SQL_MOUNTS)
  const staticContainer = staticTask?.containers?.find(row => row?.name === 'migration')
  return same(staticTask?.volumes, CLOUD_SQL_VOLUMES) && same(staticContainer?.volumeMounts, CLOUD_SQL_MOUNTS)
}

// The Job may be rotated after the sealed execution. Validate current safety here;
// ordinaryExecutionMatches below keeps the historical artifact/source identity.
function currentStaticJobMatches(profile, job, submission) {
  const generation = String(job?.generation ?? '')
  if (!/^[1-9][0-9]*$/u.test(generation)
    || String(job?.observedGeneration ?? '') !== generation
    || (Object.hasOwn(job ?? {}, 'reconciling') && typeof job.reconciling !== 'boolean')
    || job?.reconciling === true
    || job?.terminalCondition?.state !== 'CONDITION_SUCCEEDED') return false
  try { assertRdReadbackJob(job, profile) } catch { return false }
  return job.name === submission.jobName
}

function ordinaryExecutionMatches(profile, execution, submission, deployment, staticJob) {
  const task = execution?.template, containers = task?.containers
  const container = Array.isArray(containers) && containers.length === 1 ? containers[0] : null
  const runnerSourceRevision = deployment.migrationRunnerSourceRevision ?? deployment.sourceRevision
  const environment = Array.isArray(container?.env) && new Set(container.env.map(row => row?.name)).size === container.env.length
    ? Object.fromEntries(container.env.map(row => [row.name, row.value])) : null
  return task?.serviceAccount === profile.migrations.serviceAccount && task.maxRetries === 0 && task.timeout === '1800s'
    && execution.taskCount === 1 && execution.parallelism === 1 && container?.name === 'migration'
    && container.image === submission.migrationRunnerDigest && same(container.args, submission.args)
    && same(environment, ordinaryMigrationEnvironment(profile, runnerSourceRevision, submission.principalOnlyFenceRef))
    && executionCloudSqlFieldsMatch(task, container, staticJob?.template?.template)
}

async function readMigrationExecutionInventory(profile, transport) {
  const job = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`
  const names = new Set(), tokens = new Set(), rows = []
  let token = ''
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ pageSize: '100' }); if (token) query.set('pageToken', token)
    const result = await transport.request(`https://run.googleapis.com/v2/${job}/executions?${query}`)
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).some(key => !['executions', 'nextPageToken'].includes(key))
      || (Object.hasOwn(result, 'executions') && !Array.isArray(result.executions))
      || (Object.hasOwn(result, 'nextPageToken') && typeof result.nextPageToken !== 'string')) fail()
    for (const execution of result.executions ?? []) {
      if (typeof execution.name !== 'string' || !execution.name.startsWith(`${job}/executions/`) || names.has(execution.name)) fail()
      executionTerminalFacts(execution)
      names.add(execution.name); rows.push(execution)
    }
    token = result.nextPageToken ?? ''
    if (!token) break
    if (tokens.has(token) || page === 9) fail(); tokens.add(token)
  }
  return rows
}

async function readSubmittedMigrationExecution({ profile, transport, paths, deployment, submission, run }) {
  const window = closedOwnerWindow(run)
  const staticJob = await transport.request(`https://run.googleapis.com/v2/${submission.jobName}`)
  if (!currentStaticJobMatches(profile, staticJob, submission)) fail()
  const rows = await readMigrationExecutionInventory(profile, transport)
  const argumentMentions = (execution, value) => execution.template?.containers?.some(container => container.args?.some((argument, index, args) =>
    argument === value || argument === `--source-revision=${value}` || argument === `--output-ref=${value}`
    || (['--source-revision', '--output-ref'].includes(argument) && args[index + 1] === value)))
  const matches = rows.filter(execution => ordinaryExecutionMatches(profile, execution, submission, deployment, staticJob))
  if (matches.length !== 1 || rows.some(execution => execution !== matches[0]
    && argumentMentions(execution, paths.migrate))) fail()
  const execution = matches[0], facts = executionTerminalFacts(execution)
  const submitted = Date.parse(submission.observedAt)
  if (!Number.isFinite(submitted) || submitted < window.start || submitted > facts.created
    || facts.created < window.start || facts.finished > window.end || facts.completedState !== 'CONDITION_FAILED'
    || Number(execution.succeededCount ?? 0) !== 0 || Number(execution.failedCount ?? 0) < 1
  ) fail()
  const provider = await transport.request(`https://run.googleapis.com/v2/${execution.name}`)
  if (!ordinaryExecutionMatches(profile, provider, submission, deployment, staticJob)
    || !same(executionProjection(provider), executionProjection(execution))) fail()
  return { execution: provider, projection: executionProjection(provider), staticJob, window, submitted,
    inventory: rows.map(executionProjection).sort((left, right) => left.name.localeCompare(right.name)) }
}

function assertReadbackExecution({ profile, intent, intentRef, probe, attempt, receipt, execution, staticJob }) {
  assertRdReadbackExecutionReceipt(receipt, { intent, intentRef, probe })
  const outputUri = `gs://${profile.artifact.releaseBucket}/receipts/releases/${intent.releaseId}/${intentRef.sha256}/ledger-probe-${probe.ledgerCount}.json`
  const task = execution?.template, container = task?.containers?.[0]
  const expectedEnvironment = { ...rdReadbackJobEnvironment(profile, intent.runnerSourceRevision), PGOPTIONS: RD_LEDGER_READBACK_PGOPTIONS }
  const environment = Array.isArray(container?.env) && new Set(container.env.map(row => row?.name)).size === container.env.length
    ? Object.fromEntries(container.env.map(row => [row.name, row.value])) : null
  const facts = executionTerminalFacts(execution)
  const pass = attempt.status === 'PASS'
  if (execution.name !== receipt.executionName || receipt.templateSha256 !== rdReadbackSha256(execution.template)
    || receipt.createTime !== execution.createTime || receipt.startTime !== (execution.startTime ?? null)
    || receipt.completionTime !== execution.completionTime || receipt.succeededCount !== Number(execution.succeededCount ?? 0)
    || receipt.failedCount !== Number(execution.failedCount ?? 0) || receipt.completedState !== facts.completedState
    || execution.taskCount !== 1 || execution.parallelism !== 1 || task?.serviceAccount !== profile.migrations.serviceAccount
    || task.maxRetries !== 0 || task.timeout !== '1800s' || task.containers?.length !== 1 || container?.name !== 'migration'
    || container.image !== intent.migrationRunnerDigest || !same(container.args, rdReadbackProbeArguments(intent, probe, outputUri))
    || !same(environment, expectedEnvironment)
    || !executionCloudSqlFieldsMatch(task, container, staticJob?.template?.template)
    || (pass ? facts.completedState !== 'CONDITION_SUCCEEDED' : facts.completedState !== 'CONDITION_FAILED')) fail()
  return facts
}

function executionEnvironment(execution) {
  const rows = execution?.template?.containers?.[0]?.env
  if (!Array.isArray(rows) || new Set(rows.map(row => row?.name)).size !== rows.length) fail()
  return Object.fromEntries(rows.map(row => [row.name, row.value]))
}

async function authorizeLedgerDiagnosticExecution({ profile, transport, read, execution, expectedRunnerSourceRevision,
  expectedMigrationRunnerDigest, cache }) {
  const args = execution?.template?.containers?.[0]?.args
  if (!Array.isArray(args)) fail()
  const outputIndex = args.indexOf('--output-ref')
  if (outputIndex < 0 || outputIndex + 1 >= args.length) fail()
  const outputUri = args[outputIndex + 1]
  const pattern = new RegExp(`^gs://${profile.artifact.releaseBucket}/receipts/releases/([A-Z0-9][A-Z0-9-]{5,63})/([a-f0-9]{64})/ledger-probe-(33|34|35)\\.json$`, 'u')
  const match = pattern.exec(outputUri)
  if (!match) fail()
  const [, releaseId, intentSha256, count] = match
  const intentUri = `gs://${profile.artifact.releaseBucket}/receipts/releases/${releaseId}/rd-permission-ledger-readback-intent.json`
  const base = `gs://${profile.artifact.releaseBucket}/receipts/releases/${releaseId}/${intentSha256}`
  let graph = cache.get(base)
  if (!graph) {
    const intentRow = await read(intentUri)
    if (intentRow.ref.sha256 !== intentSha256) fail()
    const intent = assertRdLedgerReadbackIntent(intentRow.value)
    const jobReceipt = await read(`${base}/ledger-job-readback.json`)
    assertRdReadbackJobReceipt(jobReceipt.value, { intent, intentRef: intentRow.ref, profile })
    graph = { intent, intentRef: intentRow.ref, jobReceipt }
    cache.set(base, graph)
  }
  const ledgerCount = Number(count), probe = graph.intent.probes.find(row => row.ledgerCount === ledgerCount)
  if (!probe || !same(args, rdReadbackProbeArguments(graph.intent, probe, outputUri))) fail()
  const executionReceipt = await read(`${base}/ledger-probe-${ledgerCount}-execution-readback.json`)
  const pass = executionReceipt.value?.status === 'PASS'
  if (!pass && executionReceipt.value?.status !== 'EXPECTED_READ_ONLY_PROBE_FAILURE') fail()
  const attempt = { status: pass ? 'PASS' : 'FAILED', ledgerCount, executionReadbackRef: executionReceipt.ref }
  const facts = assertReadbackExecution({ profile, intent: graph.intent, intentRef: graph.intentRef, probe, attempt,
    receipt: executionReceipt.value, execution, staticJob: graph.jobReceipt.value.projection })
  // Later sealed diagnostics may use a rotated runner. Their own immutable
  // intent, execution args/image and read-only receipt are the authority;
  // binding them to the original abort runner rejects valid rotation.
  const sourceIndex = args.indexOf('--source-revision')
  const executionSourceRevision = sourceIndex >= 0 ? args[sourceIndex + 1] : null
  const executionDigest = execution?.template?.containers?.[0]?.image
  if (graph.intent.runnerSourceRevision !== executionSourceRevision || graph.intent.migrationRunnerDigest !== executionDigest) fail()
  const started = Date.parse(graph.intent.observedAt), deadline = Date.parse(graph.intent.deadlineAt)
  if (!Number.isFinite(started) || !Number.isFinite(deadline) || facts.created < started || facts.finished > deadline) fail()
  if (pass) {
    const native = await read(outputUri)
    assertRdReadbackNativeReceipt(native.value, { intent: graph.intent, probe, executionName: execution.name.split('/').at(-1) })
    const nativeStarted = Date.parse(native.value.startedAt), nativeCompleted = Date.parse(native.value.completedAt)
    if (nativeStarted < facts.created || nativeCompleted > facts.finished) fail()
  } else await assertMissing(read, outputUri)
  return execution.name
}

async function authorizePermissionDiagnosticExecution({ profile, transport, read, execution, staticJob,
  expectedRunnerSourceRevision, expectedMigrationRunnerDigest }) {
  const args = execution?.template?.containers?.[0]?.args
  const parsed = parsePermissionStateArgs(args)
  const operationPattern = new RegExp(`^gs://${profile.artifact.releaseBucket}/source/rd-permission-readback/[A-Za-z0-9._-]+\\.json$`, 'u')
  const expectedOutput = `gs://${profile.artifact.releaseBucket}/${RD_PERMISSION_STATE_RECEIPT_PREFIX}/${parsed.operationSha256}/state.json`
  if (!operationPattern.test(parsed.operationRef) || parsed.outputRef !== expectedOutput) fail()
  const operationObject = await transport.readBytes(parsed.operationRef, { prefixes: ['source/rd-permission-readback'], expectedSha256: parsed.operationSha256 })
  let operation
  try { operation = JSON.parse(operationObject.bytes.toString('utf8')) } catch { fail() }
  assertPermissionStateOperation(operation, { bytes: operationObject.bytes, operationSha256: parsed.operationSha256, sourceRevision: parsed.sourceRevision })
  const generation = String(operationObject.metadata?.generation ?? '')
  if (!/^[1-9][0-9]*$/u.test(generation)) fail()
  const operationRef = { uri: parsed.operationRef, sha256: parsed.operationSha256, generation }
  const expectedArgs = ['--permission-operation-ref', parsed.operationRef, '--permission-operation-sha256', parsed.operationSha256,
    '--source-revision', parsed.sourceRevision, '--permission-output-ref', expectedOutput]
  if (!same(args, expectedArgs)) fail()
  const submission = await read(`gs://${profile.artifact.releaseBucket}/${RD_PERMISSION_STATE_RECEIPT_PREFIX}/${parsed.operationSha256}/submission.json`)
  const { receiptSha256, ...submissionCore } = submission.value ?? {}
  const submissionKeys = ['schemaVersion', 'ownerApplicationId', 'workflowSourceRevision', 'sourceRevision', 'operationRef', 'outputRef',
    'operationId', 'migrationRunnerDigest', 'args', 'executionEnvironment', 'observedAt', 'status']
  if (!same(Object.keys(submissionCore).sort(), submissionKeys.sort()) || receiptSha256 !== sha256(canonicalize(submissionCore))
    || submissionCore.schemaVersion !== 'aipdm.dev122.rd-permission-state-readback-submission.v1'
    || submissionCore.ownerApplicationId !== profile.application.id || !/^[a-f0-9]{40}$/u.test(submissionCore.workflowSourceRevision ?? '')
    || submissionCore.sourceRevision !== operation.sourceRevision || !same(submissionCore.operationRef, operationRef)
    || submissionCore.outputRef !== expectedOutput || submissionCore.operationId !== operation.operationId
    || submissionCore.migrationRunnerDigest !== operation.migrationRunnerDigest || !same(submissionCore.args, expectedArgs)
    || !same(submissionCore.executionEnvironment, { PGOPTIONS: RD_PERMISSION_STATE_PGOPTIONS })
    || submissionCore.status !== 'SUBMISSION_INTENT' || !Number.isFinite(Date.parse(submissionCore.observedAt))) fail()
  const task = execution?.template, container = task?.containers?.[0], environment = executionEnvironment(execution)
  const facts = executionTerminalFacts(execution)
  if (execution.taskCount !== 1 || execution.parallelism !== 1 || task?.serviceAccount !== profile.migrations.serviceAccount
    || task.maxRetries !== 0 || task.timeout !== '1800s' || task.containers?.length !== 1 || container?.name !== 'migration'
    || container.image !== operation.migrationRunnerDigest || !same(container.args, expectedArgs)
    || environment.PDM_SOURCE_REVISION !== operation.sourceRevision || environment.PGOPTIONS !== RD_PERMISSION_STATE_PGOPTIONS
    || !executionCloudSqlFieldsMatch(task, container, staticJob?.template?.template)
    || facts.completedState !== 'CONDITION_SUCCEEDED' || Number(execution.succeededCount ?? 0) !== 1 || Number(execution.failedCount ?? 0) !== 0
    || Date.parse(submissionCore.observedAt) > facts.created) fail()
  const output = await read(expectedOutput)
  assertPermissionStateReceipt(output.value, { operation, operationRef, outputRef: expectedOutput })
  const observed = Date.parse(output.value.observedAt)
  if (output.value.state?.transactionMode !== 'REPEATABLE READ READ ONLY' || output.value.state?.databaseMutationExpected !== false
    || !Number.isFinite(observed) || observed < facts.created || observed > facts.finished) fail()
  return execution.name
}

async function authorizeAppliedMigrationExecution({ profile, transport, read, execution, staticJob, binding,
  principalOnlyFenceRef, principalOnlyRecovery, postAbortLedgerReadbackRef }) {
  const bucket = profile.artifact.releaseBucket
  try { assertAppliedMigrationContinuation(binding, bucket) } catch { fail() }
  const args = execution?.template?.containers?.[0]?.args
  if (!Array.isArray(args)) fail()
  const outputIndex = args.indexOf('--output-ref')
  if (outputIndex < 0 || outputIndex + 1 >= args.length) fail()
  const outputUri = args[outputIndex + 1]
  const rootPattern = new RegExp(`^gs://${bucket}/receipts/releases/([A-Z0-9][A-Z0-9-]{5,63})/([a-f0-9]{64})/migrate\\.json$`, 'u')
  const rootMatch = rootPattern.exec(outputUri)
  if (!rootMatch || outputUri !== binding.migrateRef.uri) fail()
  const [, releaseId, rootSha256] = rootMatch
  const intentUri = `gs://${bucket}/receipts/releases/${releaseId}/release-intent.json`
  const intentRow = await read(intentUri)
  if (intentRow.ref.sha256 !== rootSha256) fail()
  let appliedIntent
  try { appliedIntent = assertDev117ReleaseIntent(intentRow.value, profile) } catch { fail() }
  if (appliedIntent.releaseId !== releaseId || appliedIntent.sourceRevision !== binding.sourceRevision
    || !same(appliedIntent.postAbortLedgerReadbackRef, postAbortLedgerReadbackRef)
    || !same(appliedIntent.principalOnlyFenceRef, principalOnlyFenceRef)
    || !same(appliedIntent.principalOnlyRecovery, principalOnlyRecovery)) fail()
  const paths = releasePaths(profile, appliedIntent, rootSha256)
  if (paths.prepare !== binding.prepareRef.uri || paths.migrate !== binding.migrateRef.uri) fail()
  const [prepare, migrate, deployment, submission] = await Promise.all([
    read(paths.prepare), read(paths.migrate), read(paths.deployment), read(migrationSubmissionIntentUri(profile, paths.migrate)),
  ])
  if (!same(prepare.ref, binding.prepareRef) || !same(migrate.ref, binding.migrateRef)) fail()
  try { assertStage(prepare.value, profile.application.id, appliedIntent.sourceRevision, appliedIntent.releaseId, 'prepare') }
  catch { fail() }
  const prepareFacts = prepare.value.facts
  const deploymentValue = deployment.value
  if (deploymentValue?.schemaVersion !== 'jenfu.dev117.ai-pdm-deployment-capsule.v2'
    || deploymentValue.ownerApplicationId !== profile.application.id
    || deploymentValue.sourceRevision !== binding.sourceRevision
    || deploymentValue.releaseIntentSha256 !== rootSha256
    || !same(deploymentValue.releaseIntentRef, intentRow.ref)
    || deploymentValue.migrationRunnerSourceRevision === undefined
    || !H40.test(deploymentValue.migrationRunnerSourceRevision ?? '')
    || !deploymentValue.migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`)
    || !same(prepareFacts.migrationRunnerDigest, deploymentValue.migrationRunnerDigest)
    || !same(prepareFacts.migrationRunnerSourceRevision, deploymentValue.migrationRunnerSourceRevision)) fail()
  try {
    assertMigrationSubmissionIntent(submission.value, { profile, deployment: deploymentValue, outputUri: binding.migrateRef.uri,
      deadlineAt: appliedIntent.deadlineAt, principalOnlyFenceRef })
  } catch { fail() }
  const migration = migrate.value
  try { assertMigration(migration, profile.application.id, profile.migrations, binding.sourceRevision,
    appliedIntent.migrationManifestSha256, undefined, principalOnlyFenceRef) } catch { fail() }
  if (!same(migration.ledgerBootstrap, { enabled: true, created: false }) || migration.ledgerCount !== 35 ||
      migration.applied !== 2 || migration.replayed !== 33) fail()
  const facts = executionTerminalFacts(execution)
  const environment = executionEnvironment(execution)
  const sourceIndex = args.indexOf('--source-revision')
  const executionSourceRevision = sourceIndex >= 0 ? args[sourceIndex + 1] : null
  if (!ordinaryExecutionMatches(profile, execution, submission.value, deploymentValue, staticJob)
    || facts.completedState !== 'CONDITION_SUCCEEDED' || Number(execution.succeededCount ?? 0) !== 1
    || Number(execution.failedCount ?? 0) !== 0 || migration.executionName !== execution.name.split('/').at(-1)
    || executionSourceRevision !== deploymentValue.sourceRevision
    || environment.PDM_SOURCE_REVISION !== deploymentValue.migrationRunnerSourceRevision
    || Date.parse(submission.value.observedAt) > facts.created || facts.finished > Date.parse(submission.value.deadlineAt)) fail()
  await readAppliedMigrationReadbackEvidence({
    binding, profile,
    readJson: async ref => { const row = await read(ref.uri); if (!same(row.ref, ref)) fail(); return row },
    history: { installed: { receipt: migration } },
    deployment: deploymentValue,
    sourceVerification: async readbackIntent => {
      if (readbackIntent.workflowSourceRevision !== binding.sourceRevision
        || readbackIntent.runnerSourceRevision !== deploymentValue.migrationRunnerSourceRevision
        || readbackIntent.migrationRunnerDigest !== deploymentValue.migrationRunnerDigest) fail()
    },
  })
  return execution.name
}

async function authorizeReadOnlyDiagnosticExecution(input) {
  const args = input.execution?.template?.containers?.[0]?.args
  if (!Array.isArray(args)) fail()
  if (args.includes('--permission-operation-ref')) return authorizePermissionDiagnosticExecution(input)
  if (args.includes('--bundle-ref') && args.includes('--output-ref')) {
    const outputIndex = args.indexOf('--output-ref')
    const outputUri = outputIndex >= 0 ? args[outputIndex + 1] : null
    if (/\/ledger-probe-(?:33|34|35)\.json$/u.test(outputUri ?? '')) return authorizeLedgerDiagnosticExecution(input)
    if (/\/migrate\.json$/u.test(outputUri ?? '')) {
      if (!input.appliedMigrationContinuation) fail()
      return authorizeAppliedMigrationExecution(input)
    }
  }
  fail()
}

async function readPostAbortLedgerReconciliation({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts,
  rollbackFacts, prepareFacts, build, deployment, control, read, run, ref, principalOnlyFenceRef = null, principalOnlyRecovery = null,
  appliedMigrationContinuation = null }) {
  const bucket = profile.artifact.releaseBucket
  if (!build || !deployment || prepareFacts.migrationRunnerDigest !== deployment.value.migrationRunnerDigest) fail()
  assertImmutableRef(ref, bucket, ['receipts/releases'])
  const submission = await read(migrationSubmissionIntentUri(profile, paths.migrate))
  if (!same(terminalFacts.migrationSubmissionIntentRef, submission.ref)
    || !same(rollbackFacts.migrationSubmissionIntentRef, submission.ref)) fail()
  assertMigrationSubmissionIntent(submission.value, { profile, deployment: deployment.value, outputUri: paths.migrate,
    deadlineAt: intent.deadlineAt, principalOnlyFenceRef })
  const failed = await readSubmittedMigrationExecution({ profile, transport, paths, deployment: deployment.value,
    submission: submission.value, run })
  const resultRow = await read(ref.uri)
  if (!same(resultRow.ref, ref)) fail()
  const result = resultRow.value
  assertRdReadbackResultRef(resultRow.ref, result)
  const readbackIntentRef = result.readbackIntentRef
  if (readbackIntentRef.uri !== rdReadbackIntentUri(result.releaseId)) fail()
  const readbackIntentRow = await transport.readJson(readbackIntentRef, bucket, ['receipts'])
  if (!same(readbackIntentRow.ref, readbackIntentRef)) fail()
  const readbackIntent = assertRdLedgerReadbackIntent(readbackIntentRow.value)
  assertRdReadbackResult(result, { intent: readbackIntent, intentRef: readbackIntentRef })
  const runnerSourceRevision = deployment.value.migrationRunnerSourceRevision ?? deployment.value.sourceRevision
  if (result.runnerSourceRevision !== runnerSourceRevision
    || result.migrationRunnerDigest !== deployment.value.migrationRunnerDigest || ![33, 34].includes(result.ledgerCount)
    || result.migration085State !== 'NOT_APPLIED' || result.databaseMutationExpected !== false
    || result.decision !== 'AUTHORIZED_CONDITION_085_ABSENT') fail()
  const after = Math.max(failed.projection ? Date.parse(failed.projection.completionTime) : 0,
    Date.parse(terminal.value.observedAt), Date.parse(submission.value.observedAt))
  if (!Number.isFinite(after) || Date.parse(readbackIntent.observedAt) <= after || Date.parse(result.observedAt) <= after) fail()
  const base = `gs://${bucket}/receipts/releases/${result.releaseId}/${readbackIntentRef.sha256}`
  if (result.jobReadbackRef.uri !== `${base}/ledger-job-readback.json`) fail()
  const jobReceipt = await read(result.jobReadbackRef.uri)
  if (!same(jobReceipt.ref, result.jobReadbackRef)) fail()
  assertRdReadbackJobReceipt(jobReceipt.value, { intent: readbackIntent, intentRef: readbackIntentRef, profile })
  const readbackStarted = Date.parse(readbackIntent.observedAt), readbackDeadline = Date.parse(readbackIntent.deadlineAt)
  if (!Number.isFinite(readbackStarted) || !Number.isFinite(readbackDeadline) || readbackStarted <= after || readbackStarted >= readbackDeadline) fail()
  let lastCompletion = after
  const authorizedExecutions = new Set([failed.execution.name])
  for (const attempt of result.attempts) {
    const probe = readbackIntent.probes.find(row => row.ledgerCount === attempt.ledgerCount)
    if (!probe || attempt.executionReadbackRef.uri !== `${base}/ledger-probe-${probe.ledgerCount}-execution-readback.json`) fail()
    const receipt = await read(attempt.executionReadbackRef.uri)
    if (!same(receipt.ref, attempt.executionReadbackRef)) fail()
    const execution = await transport.request(`https://run.googleapis.com/v2/${receipt.value.executionName}`)
    const facts = assertReadbackExecution({ profile, intent: readbackIntent, intentRef: readbackIntentRef, probe, attempt, receipt: receipt.value, execution, staticJob: jobReceipt.value.projection })
    if (facts.created < readbackStarted || facts.finished > readbackDeadline || facts.finished <= lastCompletion) fail()
    authorizedExecutions.add(execution.name)
    lastCompletion = facts.finished
    if (attempt.status === 'PASS') {
      if (attempt.nativeReceiptRef.uri !== `${base}/ledger-probe-${probe.ledgerCount}.json`
        || !same(attempt.nativeReceiptRef, result.nativeReceiptRef)) fail()
      const native = await read(attempt.nativeReceiptRef.uri)
      if (!same(native.ref, attempt.nativeReceiptRef)) fail()
      assertRdReadbackNativeReceipt(native.value, { intent: readbackIntent, probe, executionName: execution.name.split('/').at(-1) })
      const nativeStarted = Date.parse(native.value.startedAt), nativeCompleted = Date.parse(native.value.completedAt)
      if (native.value.completedAt !== result.observedAt || nativeStarted < facts.created || nativeCompleted > facts.finished) fail()
    }
  }
  if (lastCompletion > readbackDeadline) fail()
  const finalInventoryRows = await readMigrationExecutionInventory(profile, transport)
  const finalInventory = finalInventoryRows.map(executionProjection).sort((left, right) => left.name.localeCompare(right.name))
  if (!same(finalInventory, failed.inventory)) fail()
  const diagnosticCache = new Map()
  for (const execution of finalInventoryRows) {
    const facts = executionTerminalFacts(execution)
    if (facts.created >= failed.submitted && !authorizedExecutions.has(execution.name)) {
      const name = await authorizeReadOnlyDiagnosticExecution({ profile, transport, read, execution, staticJob: failed.staticJob,
        expectedRunnerSourceRevision: runnerSourceRevision, expectedMigrationRunnerDigest: deployment.value.migrationRunnerDigest,
        cache: diagnosticCache, appliedMigrationContinuation, binding: appliedMigrationContinuation, principalOnlyFenceRef, principalOnlyRecovery,
        postAbortLedgerReadbackRef: ref })
      authorizedExecutions.add(name)
    }
  }
  return { basis: {
    schemaVersion: 'aipdm.dev122.post-abort-ledger-reconciliation.v1', failedIntentRef: baselineIntentRef,
    failedSubmissionIntentRef: submission.ref, failedExecution: failed.projection,
    readbackIntentRef, readbackResultRef: resultRow.ref, readbackJobReadbackRef: result.jobReadbackRef,
    nativeReceiptRef: result.nativeReceiptRef, workflowSourceRevision: result.workflowSourceRevision,
    runnerSourceRevision: result.runnerSourceRevision, migrationRunnerDigest: result.migrationRunnerDigest,
    ledgerCount: result.ledgerCount, migration084State: result.migration084State, migration085State: result.migration085State,
    databaseMutationExpected: false, decision: result.decision, observedAt: result.observedAt,
    ownerRunRef: control.ownerRunRef,
  } }
}

async function assertMissing(read, uri) {
  try { await read(uri); fail() } catch (error) { if (error.code !== 'MISSING') throw error }
}
async function assertAbsentStages(read, paths, stages) {
  for (const stage of stages) await assertMissing(read, paths[stage])
}
async function readFailedBuilds(profile, transport, intent, pageSize) {
  if (!/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(intent.releaseId ?? '')) fail()
  const list = await transport.request(`https://cloudbuild.googleapis.com/v1/projects/${profile.target.projectId}/locations/${profile.target.region}/builds?filter=${encodeURIComponent(`tags=${intent.releaseId.toLowerCase()}`)}&pageSize=${pageSize}`)
  if (!list || typeof list !== 'object' || Array.isArray(list)
    || Object.keys(list).some(key => !['builds', 'nextPageToken'].includes(key))
    || (Object.hasOwn(list, 'builds') && !Array.isArray(list.builds))
    || (Object.hasOwn(list, 'nextPageToken') && list.nextPageToken !== '')) fail()
  return list.builds ?? []
}
async function assertZeroBuilds(profile, transport, intent) {
  if ((await readFailedBuilds(profile, transport, intent, 1)).length !== 0) fail()
}

// A provider build can complete before artifact policy rejects the image and
// before any release-owned build/provenance receipt is sealed.  This proves
// only a quiescent failed attempt.  The image and scan result never become
// reusable release authority.
async function readPreparedUnsealedProviderBuild({ profile, transport, baselineIntentRef, intent, run }) {
  const first = await readFailedBuilds(profile, transport, intent, 2)
  const second = await readFailedBuilds(profile, transport, intent, 2)
  if (!same(first, second) || first.length !== 1) fail()
  const build = first[0], project = profile.target.projectId, region = profile.target.region
  const sourceUri = `gs://${profile.artifact.releaseBucket}/source/releases/${intent.releaseId}/${baselineIntentRef.sha256}/source.tar.gz`
  const storage = build.source?.storageSource
  if (storage?.bucket !== profile.artifact.releaseBucket
    || storage.object !== sourceUri.slice(`gs://${profile.artifact.releaseBucket}/`.length)
    || !/^[1-9][0-9]*$/u.test(String(storage.generation ?? ''))) fail()
  const source = await transport.readBytes(sourceUri, { prefixes: ['source'], expectedGeneration: String(storage.generation) })
  const sourceObject = { uri: sourceUri, sha256: sha256(source.bytes), generation: String(source.metadata?.generation ?? ''), crc32c: source.metadata?.crc32c }
  const fileHashes = build.sourceProvenance?.fileHashes?.[`${sourceUri}#${sourceObject.generation}`]?.fileHash
  if (source.ref?.uri !== sourceUri || source.ref?.sha256 !== sourceObject.sha256 || sourceObject.generation !== String(storage.generation)
    || typeof sourceObject.crc32c !== 'string' || !sourceObject.crc32c
    || !Array.isArray(fileHashes)
    || fileHashes.filter(row => row?.type === 'SHA256'
      && Buffer.from(row.value ?? '', 'base64').toString('hex') === sourceObject.sha256).length !== 1) fail()

  const tag = `${profile.artifact.uri}:release-${intent.sourceRevision}`
  const expectedArgs = ['build', '--pull=false', '--no-cache', '--file', profile.build?.dockerfile,
    '--target', profile.build?.dockerTarget, '--build-arg', `SOURCE_REVISION=${intent.sourceRevision}`,
    '--build-arg', `SOURCE_TREE=${intent.sourceSha256}`, '--build-arg', 'SOURCE_CREATED_AT=1970-01-01T00:00:00Z',
    '--build-arg', `SOURCE_VERSION=${intent.sourceRevision}`, '--build-arg', 'SOURCE_STATE=frozen', '--tag', tag, '.']
  const expectedStorage = { bucket: storage.bucket, object: storage.object, generation: String(storage.generation) }
  const names = [project, profile.target.projectNumber].map(id => `projects/${id}/locations/${region}/builds/${build.id}`)
  const image = build.results?.images?.filter(row => row?.name === tag)
  const step = build.steps?.[0]
  const stepRecipe = {
    name: step?.name, dir: step?.dir, args: step?.args,
    entrypoint: step?.entrypoint ?? '', env: step?.env ?? [], secretEnv: step?.secretEnv ?? [],
    volumes: step?.volumes ?? [], script: step?.script ?? '', allowFailure: step?.allowFailure ?? false,
    waitFor: step?.waitFor ?? [], id: step?.id ?? '', timeout: step?.timeout ?? null,
    automapSubstitutions: step?.automapSubstitutions ?? false, allowExitCodes: step?.allowExitCodes ?? [],
  }
  const expectedStepRecipe = {
    name: profile.build?.dockerBuilderImage, dir: 'source', args: expectedArgs,
    entrypoint: '', env: [], secretEnv: [], volumes: [], script: '', allowFailure: false,
    waitFor: [], id: '', timeout: null, automapSubstitutions: false, allowExitCodes: [],
  }
  const buildRecipeExtensions = {
    availableSecrets: build.availableSecrets ?? null, secrets: build.secrets ?? [],
    substitutions: build.substitutions ?? {}, artifacts: build.artifacts ?? { images: build.images },
    dependencies: build.dependencies ?? [], gitConfig: build.gitConfig ?? null,
    sourceFetcher: build.sourceFetcher ?? null,
  }
  const window = closedOwnerWindow(run)
  const created = Date.parse(build.createTime), started = Date.parse(build.startTime), finished = Date.parse(build.finishTime)
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(build.id ?? '') || !names.includes(build.name)
    || build.projectId !== project || build.status !== 'SUCCESS'
    || build.serviceAccount !== `projects/${project}/serviceAccounts/${profile.identities.builder}`
    || !same(build.source, { storageSource: expectedStorage }) || !same(build.sourceProvenance?.resolvedStorageSource, expectedStorage)
    || build.steps?.length !== 1 || !same(stepRecipe, expectedStepRecipe)
    || !same(buildRecipeExtensions, { availableSecrets: null, secrets: [], substitutions: {}, artifacts: { images: [tag] },
      dependencies: [], gitConfig: null, sourceFetcher: null })
    || !same(build.images, [tag])
    || build.timeout !== '1800s' || build.queueTtl !== '300s'
    || build.logsBucket !== `gs://${profile.artifact.releaseBucket}/logs/cloud-build`
    || !same(build.options, { logging: 'GCS_ONLY', logStreamingOption: 'STREAM_OFF', pool: {},
      requestedVerifyOption: 'VERIFIED', workerRelease: 'legacy' })
    || !same(build.tags, ['dev-012', profile.application.id, intent.releaseId.toLowerCase()])
    || image?.length !== 1 || !/^sha256:[a-f0-9]{64}$/u.test(image[0].digest ?? '')
    || !Number.isFinite(created) || !Number.isFinite(started) || !Number.isFinite(finished)
    || created < window.start || created > started || started > finished || finished > window.end) fail()
  return {
    evidenceScope: 'QUIESCENT_UNSEALED_PROVIDER_BUILD_NOT_REUSED', releaseAuthority: false,
    artifactPolicyPassed: false, migrationVerified: false, buildId: build.id,
    sourceObject, imageTag: tag, failedArtifactDigest: `${profile.artifact.uri}@${image[0].digest}`,
    finishTime: build.finishTime,
  }
}

async function readSealedUnsubmittedBuild({ profile, transport, baselineIntentRef, intent, paths, prepare, prepareFacts,
  build, provenance, deployment, read, seal, run, verifyMigrationAbsence = true }) {
  const facts = seal(build, 'build')
  const evidence = await readUnpublishedBuildEvidence({ profile, transport, baselineIntentRef, intent, paths, provenance, read })
  const value = deployment.value
  if (!same(build.value.previousReceiptRef, prepare.ref)
    || facts.artifactDigest !== evidence.artifactDigest || !same(facts.sourceObject, evidence.sourceObject)
    || !same(facts.provenanceReceiptRef, evidence.provenanceRef) || !same(facts.sbomReceiptRef, evidence.sbomRef)
    || !same(facts.scanReceiptRef, evidence.scanRef)
    || value?.schemaVersion !== profile.schemas.deploymentCapsule || value.ownerApplicationId !== profile.application.id
    || !same(value.releaseIntentRef, baselineIntentRef) || value.releaseIntentSha256 !== baselineIntentRef.sha256
    || value.sourceRevision !== intent.sourceRevision || value.deadlineAt !== intent.deadlineAt
    || value.artifactDigest !== evidence.artifactDigest || !same(value.sourceObject, evidence.sourceObject)
    || !same(value.buildReceiptRef, build.ref) || !same(value.provenanceReceiptRef, evidence.provenanceRef)
    || !same(value.sbomReceiptRef, evidence.sbomRef) || !same(value.scanReceiptRef, evidence.scanRef)
    || !same(value.migrationBundleRef, facts.migrationBundleRef)
    || value.migrationRunnerDigest !== prepareFacts.migrationRunnerDigest
    || !value.migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`)
    || !/^[a-f0-9]{64}$/u.test(value.migrationRunnerDigest?.split('@sha256:')[1] ?? '')
    || Object.hasOwn(value, 'programOnlyBaseline') || Object.hasOwn(value, 'sourceMigrationBundleRef')
    || (Object.hasOwn(value, 'migrationRunnerSourceRevision') && value.migrationRunnerSourceRevision !== null
      && !/^[a-f0-9]{40}$/u.test(value.migrationRunnerSourceRevision))) fail()
  assertImmutableRef(value.migrationBundleRef, profile.artifact.releaseBucket, [profile.artifact.migrationBundlePrefix])
  const window = closedOwnerWindow(run), finished = Date.parse(provenance.value.cloudBuild.finishTime)
  if (!Number.isFinite(finished) || finished < window.start || finished > window.end) fail()
  if (verifyMigrationAbsence) await assertNoMigrationExecution(profile, transport, intent, paths, run)
  return { ...evidence, evidenceScope: 'QUIESCENT_SEALED_BUILD_NOT_REUSED', buildRef: build.ref,
    deploymentRef: deployment.ref, migrationBundleRef: value.migrationBundleRef }
}

// This is only quiescence/source association evidence for an unpublished build.
// It supplies no image reuse, deployment, migration, or release authority.
async function readUnpublishedBuild(input) {
  const evidence = await readUnpublishedBuildEvidence(input)
  await assertNoMigrationExecution(input.profile, input.transport, input.intent, input.paths, input.run)
  return evidence
}
async function readUnpublishedBuildEvidence({ profile, transport, baselineIntentRef, intent, paths, provenance, read }) {
  const [sbom, scan] = await Promise.all([read(paths.sbom), read(paths.scan)])
  const p = provenance.value, image = p.artifactDigest, source = p.sourceObject, recorded = p.cloudBuild
  const list = await readFailedBuilds(profile, transport, intent, 2)
  const live = list[0], project = profile.target.projectId, region = profile.target.region
  const buildNames = [project, profile.target.projectNumber].map(id => `projects/${id}/locations/${region}/builds/${recorded?.id}`)
  const sourceUri = `gs://${profile.artifact.releaseBucket}/source/releases/${intent.releaseId}/${baselineIntentRef.sha256}/source.tar.gz`
  if (list.length !== 1 || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(recorded?.id ?? '')
    || !image?.startsWith(`${profile.artifact.uri}@sha256:`) || !/^[a-f0-9]{64}$/u.test(image?.split('@sha256:')[1] ?? '')
    || source?.uri !== sourceUri || !/^[a-f0-9]{64}$/u.test(source?.sha256 ?? '') || !/^[1-9][0-9]*$/u.test(source?.generation ?? '')
    || typeof source.crc32c !== 'string' || !source.crc32c || p.artifactRegistry?.uri !== image) fail()
  for (const [row, schema] of [[provenance, 'jenfu.dev012.build-provenance-receipt.v1'], [sbom, 'jenfu.dev012.sbom-receipt.v1'], [scan, 'jenfu.dev012.scan-receipt.v1']]) {
    if (row.value.schemaVersion !== schema || row.value.ownerApplicationId !== profile.application.id
      || row.value.sourceRevision !== intent.sourceRevision || row.value.artifactDigest !== image || row.value.status !== 'PASS') fail()
  }
  const expectedStorage = { bucket: profile.artifact.releaseBucket, object: sourceUri.slice(`gs://${profile.artifact.releaseBucket}/`.length), generation: source.generation }
  for (const build of [recorded, live]) {
    const images = build?.results?.images
    if (build?.id !== recorded.id || !buildNames.includes(build.name) || build.projectId !== project
      || build.status !== 'SUCCESS' || build.serviceAccount !== `projects/${project}/serviceAccounts/${profile.identities.builder}`
      || build.options?.requestedVerifyOption !== 'VERIFIED' || !same(build.sourceProvenance?.resolvedStorageSource, expectedStorage)
      || !Array.isArray(images) || images.length !== 1 || images[0].name !== `${profile.artifact.uri}:release-${intent.sourceRevision}`
      || images[0].digest !== image.split('@')[1] || !Number.isFinite(Date.parse(build.finishTime))) fail()
  }
  if (!live.tags?.includes(intent.releaseId.toLowerCase()) || !same(live.source?.storageSource, expectedStorage)
    || !same(recorded.finishTime, live.finishTime) || sbom.value.resourceUrl !== `https://${image}`
    || scan.value.blockingVulnerabilityCount !== 0 || scan.value.maximumAllowedSeverity !== profile.build.maximumAllowedSeverity) fail()
  return { evidenceScope: 'QUIESCENT_UNPUBLISHED_BUILD_NOT_REUSED', releaseAuthority: false, migrationVerified: false,
    buildId: live.id, artifactDigest: image, sourceObject: source, provenanceRef: provenance.ref, sbomRef: sbom.ref, scanRef: scan.ref }
}

// One sealed zero-build predecessor may lead to the still-serving RELEASED
// anchor. Do not recursively promote an arbitrary aborted lineage.
async function readInheritedPrebuildAnchor({ profile, transport, intent, inheritedBasis: basis, anchor, read }) {
  if (basis.schemaVersion !== 'ai-pdm.principal-prebuild-abort-basis.v1' || basis.databaseDisposition !== 'NOT_APPLIED'
    || basis.failedBuildCount !== 0 || !same(basis.failedIntentRef, intent.baselineIntentRef)
    || basis.previousRevision !== intent.previousRevision || !/^[a-f0-9]{64}$/u.test(basis.controlSha256 ?? '')) fail()
  const prior = anchor.value, ref = anchor.ref, bucket = profile.artifact.releaseBucket
  if (prior.schemaVersion !== profile.schemas.releaseIntent || prior.ownerApplicationId !== profile.application.id
    || !/^[a-f0-9]{40}$/u.test(prior.sourceRevision ?? '') || prior.previousRevision !== intent.previousRevision
    || ref.uri !== `gs://${bucket}/receipts/releases/${prior.releaseId}/release-intent.json`
    || Object.hasOwn(prior, 'principalOnlyRecovery') || Object.hasOwn(prior, 'principalOnlyFenceRef')
    || !same(prior.baselineIntentRef, basis.releasedIntentRef) || same(ref, basis.releasedIntentRef)) fail()
  assertImmutableRef(basis.releasedIntentRef, bucket, ['receipts'])
  const priorPaths = releasePaths(profile, prior, ref.sha256)
  const [prepare, rollback, terminal, lock, authorization, readiness] = await Promise.all([
    read(priorPaths.prepare), read(priorPaths.rollback), read(priorPaths.terminal), transport.readJson(prior.sourceLockRef, bucket, ['receipts']),
    transport.readJson(intent.authorizationPolicyRef, bucket, ['receipts']), transport.readJson(intent.readinessReceiptRef, bucket, ['receipts']),
  ])
  if (!same(authorization.value.preActivationAbortBasis, basis) || !same(readiness.value.preActivationAbortBasis, basis)
    || !same(basis.failedSourceLockRef, lock.ref)
    || !same(basis.stageRefs?.prepare, prepare.ref) || !same(basis.stageRefs?.rollback, rollback.ref) || !same(basis.stageRefs?.terminal, terminal.ref)
    || lock.value.ownerApplicationId !== profile.application.id || lock.value.releaseId !== prior.releaseId
    || lock.value.sourceRevision !== prior.sourceRevision || lock.value.sourceSha256 !== prior.sourceSha256
    || lock.value.migrationManifestSha256 !== prior.migrationManifestSha256 || lock.value.status !== 'SOURCE_FROZEN'
    || lock.value.clean !== true || lock.value.releaseAuthority !== true) fail()
  for (const [row, stage] of [[prepare, 'prepare'], [rollback, 'rollback'], [terminal, 'terminal']]) {
    const { receiptSha256, ...core } = row.value
    if (receiptSha256 !== sha256(canonicalize(core)) || core.schemaVersion !== 'jenfu.dev012.stage-receipt.v1'
      || core.ownerApplicationId !== profile.application.id || core.releaseId !== prior.releaseId || core.sourceRevision !== prior.sourceRevision
      || core.status !== 'PASS' || core.stage !== stage || core.facts.previousRevision !== prior.previousRevision) fail()
    if (stage !== 'prepare' && (core.facts.result !== 'PRE_ACTIVATION_ABORTED' || core.facts.databaseDisposition !== 'NOT_APPLIED'
      || !same(core.facts.entrypointRecovery, { changed: false, result: 'NOT_REQUIRED' })
      || (stage === 'rollback' && !same(core.facts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])))) fail()
  }
  const refs = { sourceLock: prior.sourceLockRef, authorization: prior.authorizationPolicyRef, readiness: prior.readinessReceiptRef,
    foundation: prior.foundationReceiptRef, infra: prior.infraReceiptRef, runtimeConfig: prior.runtimeConfigRef }
  if (prepare.value.previousReceiptRef !== null || rollback.value.previousReceiptRef !== null || !same(terminal.value.previousReceiptRef, rollback.ref)
    || !same(prepare.value.facts.prerequisiteRefs, refs) || prepare.value.facts.preActivationAbortBasis
    || basis.inputFingerprint !== sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: prior.releaseId,
      sourceRevision: prior.sourceRevision, releaseIntentSha256: ref.sha256 }))) fail()
  const stages = ['build', 'provenance', 'deployment', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']
  if (!same(basis.absentStages, stages)) fail()
  await assertAbsentStages(read, priorPaths, [...stages, 'sbom', 'scan'])
  await assertMissing(read, migrationSubmissionIntentUri(profile, priorPaths.migrate))
  await assertZeroBuilds(profile, transport, prior)
  const runPrefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = basis.ownerRunRef?.startsWith(runPrefix) ? basis.ownerRunRef.slice(runPrefix.length) : ''
  if (!/^[1-9][0-9]*$/u.test(runId)) fail()
  const run = await transport.readOwnerRun(profile, basis.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== prior.sourceRevision) fail()
  return basis.releasedIntentRef
}

function closedOwnerWindow(run) {
  const start = Date.parse(run.createdAt), end = Date.parse(run.updatedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end > Date.now()) fail()
  return { start, end }
}
function currentMigrationBinding({ profile, intent, paths, migration, deployment, run, failed }) {
  const { receiptSha256, ...core } = migration.value
  const window = closedOwnerWindow(run), started = Date.parse(core.startedAt), completed = Date.parse(core.completedAt)
  if (profile.migrations?.jobName !== 'ai-pdm-prod-migration-runner'
    || core.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || receiptSha256 !== sha256(canonicalize(core))
    || core.ownerApplicationId !== profile.application.id || core.sourceRevision !== intent.sourceRevision
    || core.manifestSha256 !== intent.migrationManifestSha256 || core.status !== 'PASS' || core.boundaryStatus !== 'PASS'
    || !/^ai-pdm-prod-migration-runner-[a-z0-9]+$/u.test(core.executionName ?? '') || core.executionName.length > 63
    || !Number.isFinite(started) || !Number.isFinite(completed) || started > completed || started < window.start || completed > window.end
    || failed.proof.disposition !== 'migration_only' || failed.proof.migrate?.ref !== paths.migrate
    || failed.proof.migrate.sha256 !== migration.ref.sha256 || failed.proof.artifactDigest !== deployment.value.artifactDigest) fail()
  const d = deployment.value
  assertImmutableRef(d.migrationBundleRef, profile.artifact.releaseBucket, ['source/migration-bundles'])
  if (!d.migrationRunnerDigest?.startsWith(`${profile.artifact.uri}-migration-runner@sha256:`)
    || !/^[a-f0-9]{64}$/u.test(d.migrationRunnerDigest.split('@sha256:')[1] ?? '')) fail()
  const args = ['--bundle-ref', d.migrationBundleRef.uri, '--bundle-sha256', d.migrationBundleRef.sha256,
    '--source-revision', intent.sourceRevision, '--output-ref', paths.migrate]
  if (profile.productionData?.required === true) {
    assertImmutableRef(d.productionDataRef, profile.artifact.releaseBucket, [profile.productionData.dataObjectPrefix])
    assertImmutableRef(d.firstPrincipalBootstrapRef, profile.artifact.releaseBucket, [profile.productionData.bootstrapObjectPrefix])
    args.push('--data-ref', d.productionDataRef.uri, '--data-sha256', d.productionDataRef.sha256,
      '--bootstrap-ref', d.firstPrincipalBootstrapRef.uri, '--bootstrap-sha256', d.firstPrincipalBootstrapRef.sha256)
  }
  return { window, started, completed, args, image: d.migrationRunnerDigest,
    name: `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}/executions/${core.executionName}` }
}
async function readHistoricalOwnerRun(profile, transport, basis, prior) {
  const prefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const id = basis.ownerRunRef?.startsWith(prefix) ? basis.ownerRunRef.slice(prefix.length) : ''
  if (!/^[1-9][0-9]*$/u.test(id)) fail()
  const run = await transport.readOwnerRun(profile, basis.ownerRunRef)
  if (run.id !== id || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== prior.sourceRevision) fail()
  closedOwnerWindow(run)
  return run
}
// Exactly one immutable ordinary predecessor may precede the existing fixed
// unpublished -> zero-build -> released tail. Never read historical control.
async function readHistoricalOrdinaryPredecessor({ profile, transport, intent, basis, anchor, read, binding, verifyProvider, consume }) {
  const bucket = profile.artifact.releaseBucket
  const basisKeys = ['schemaVersion', 'failedIntentRef', 'releasedIntentRef', 'failedProof', 'releasedProof', 'stageRefs',
    'controlSha256', 'inputFingerprint', 'ownerRunRef', 'serviceUid', 'previousRevision', 'retainedArtifactDigest',
    'entrypoint', 'scaling', 'retainedEnvironmentSha256']
  if (basis.schemaVersion !== 'ai-pdm.principal-ordinary-abort-basis.v1'
    || !same(Object.keys(basis).sort(), basisKeys.sort()) || !same(basis.failedIntentRef, intent.baselineIntentRef)
    || basis.previousRevision !== intent.previousRevision || !/^[a-f0-9]{64}$/u.test(basis.controlSha256 ?? '')) fail()
  assertImmutableRef(basis.releasedIntentRef, bucket, ['receipts'])
  const [authorization, readiness] = await Promise.all([
    transport.readJson(intent.authorizationPolicyRef, bucket, ['receipts']), transport.readJson(intent.readinessReceiptRef, bucket, ['receipts']),
  ])
  if (!same(authorization.value.preActivationAbortBasis, basis) || !same(readiness.value.preActivationAbortBasis, basis)) fail()
  const child = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), basis.failedIntentRef, true)
  return runAiPdmEvidenceContext(child, async () => {
    const prior = anchor.value, ref = anchor.ref
    if (prior.schemaVersion !== profile.schemas.releaseIntent || prior.ownerApplicationId !== profile.application.id
      || !/^[a-f0-9]{40}$/u.test(prior.sourceRevision ?? '') || prior.previousRevision !== intent.previousRevision
      || ref.uri !== `gs://${bucket}/receipts/releases/${prior.releaseId}/release-intent.json` || !same(ref, basis.failedIntentRef)
      || Object.hasOwn(prior, 'principalOnlyRecovery') || Object.hasOwn(prior, 'principalOnlyFenceRef')
      || !prior.baselineIntentRef || same(prior.baselineIntentRef, ref)) fail()
    assertImmutableRef(prior.baselineIntentRef, bucket, ['receipts'])
    const paths = releasePaths(profile, prior, ref.sha256)
    const terminal = await read(paths.terminal)
    const evidence = await readOrdinaryAbortEvidence({ profile, baselineIntentRef: ref, intent: prior, paths, terminal, read })
    if (evidence.repair || evidence.terminalFacts.databaseDisposition !== 'FORWARD_APPLIED'
      || basis.inputFingerprint !== evidence.fingerprint) fail()
    const inherited = evidence.prepareFacts.preActivationAbortBasis
    if (inherited?.schemaVersion !== 'ai-pdm.principal-unpublished-build-abort-basis.v1'
      || inherited.inheritedBasis?.schemaVersion !== 'ai-pdm.principal-prebuild-abort-basis.v1'
      || !same(prior.baselineIntentRef, inherited.failedIntentRef) || !same(basis.releasedIntentRef, inherited.releasedIntentRef)) fail()
    const refs = { prepare: evidence.prepare.ref, migration: evidence.migration.ref, candidate: evidence.candidate.ref,
      deployment: evidence.deployment.ref, entrypoint: evidence.entry.ref, rollback: evidence.rollback.ref,
      terminal: terminal.ref, runtimeConfig: basis.stageRefs?.runtimeConfig, ...evidence.optionalRefs }
    assertImmutableRef(refs.runtimeConfig, bucket, ['receipts'])
    if (!same(basis.stageRefs, refs)) fail()
    const run = await readHistoricalOwnerRun(profile, transport, basis, prior), window = closedOwnerWindow(run)
    if (window.end >= binding.window.start) fail()
    assertOrdinaryOwnerWindow(evidence, run)
    const failed = await readOrdinaryAbortObservation({ profile, transport, baselineIntentRef: ref, intent: prior, evidence, verifyProvider })
    if (!same(failed.proof, basis.failedProof)) fail()
    const lock = await transport.readJson(prior.sourceLockRef, bucket, ['receipts'])
    if (lock.value.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1'
      || lock.value.ownerApplicationId !== profile.application.id || lock.value.releaseId !== prior.releaseId
      || lock.value.sourceRevision !== prior.sourceRevision || lock.value.sourceSha256 !== prior.sourceSha256
      || lock.value.migrationManifestSha256 !== prior.migrationManifestSha256
      || lock.value.status !== 'SOURCE_FROZEN' || lock.value.clean !== true || lock.value.releaseAuthority !== true) fail()
    const entrypoint = value => ({ ingress: value.ingress, defaultUriDisabled: value.defaultUriDisabled === true,
      invokerIamDisabled: value.invokerIamDisabled === true, uri: value.uri, urls: [...(value.urls ?? [])].sort() })
    if (!same(basis.entrypoint, entrypoint(evidence.prepareFacts.entrypointBaseline))) fail()
    const candidateRevision = evidence.candidateFacts.candidateRevision
    const revision = await transport.getRevision(profile, candidateRevision)
    const serviceName = `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`
    if (revision?.name !== `${serviceName}/revisions/${candidateRevision}`
      || revision.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
      || revision.containers?.filter(row => row.name === profile.runtime.containerName).length !== 1
      || revision.containers.find(row => row.name === profile.runtime.containerName).image !== failed.proof.artifactDigest) fail()
    const priorBinding = currentMigrationBinding({ profile, intent: prior, paths, migration: evidence.migration,
      deployment: evidence.deployment, run, failed })
    const consumeReleased = (released, releasedRef, retainedBases) => {
      if (retainedBases.length !== 2 || !same(releasedRef, basis.releasedIntentRef)) fail()
      return consume(released, releasedRef, [basis, ...retainedBases])
    }
    return readHistoricalOrdinaryAnchor({ profile, transport, intent: prior, basis: inherited,
      anchor: await transport.readJson(prior.baselineIntentRef, bucket, ['receipts']), read,
      bindings: [priorBinding, binding], consume: consumeReleased })
  })
}

// Fixed unpublished -> zero-build -> released scopes. No historical mutable
// control, synthetic terminal, caller anchor or partial artifact reuse.
async function readHistoricalOrdinaryAnchor({ profile, transport, intent, basis, anchor, read, bindings, consume }) {
  const bucket = profile.artifact.releaseBucket
  if (basis.schemaVersion !== 'ai-pdm.principal-unpublished-build-abort-basis.v1' || basis.databaseDisposition !== 'NOT_APPLIED'
    || basis.failedBuildCount !== 1 || !same(basis.failedIntentRef, intent.baselineIntentRef)
    || basis.previousRevision !== intent.previousRevision || !/^[a-f0-9]{64}$/u.test(basis.controlSha256 ?? '')
    || basis.inheritedBasis?.schemaVersion !== 'ai-pdm.principal-prebuild-abort-basis.v1') fail()
  const [authorization, readiness] = await Promise.all([
    transport.readJson(intent.authorizationPolicyRef, bucket, ['receipts']), transport.readJson(intent.readinessReceiptRef, bucket, ['receipts']),
  ])
  if (!same(authorization.value.preActivationAbortBasis, basis) || !same(readiness.value.preActivationAbortBasis, basis)) fail()
  const child = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), basis.failedIntentRef, true)
  return runAiPdmEvidenceContext(child, async () => {
    const prior = anchor.value, ref = anchor.ref
    if (prior.schemaVersion !== profile.schemas.releaseIntent || prior.ownerApplicationId !== profile.application.id
      || !/^[a-f0-9]{40}$/u.test(prior.sourceRevision ?? '') || prior.previousRevision !== intent.previousRevision
      || ref.uri !== `gs://${bucket}/receipts/releases/${prior.releaseId}/release-intent.json` || !same(ref, basis.failedIntentRef)
      || Object.hasOwn(prior, 'principalOnlyRecovery') || Object.hasOwn(prior, 'principalOnlyFenceRef')
      || !same(prior.baselineIntentRef, basis.inheritedBasis.failedIntentRef)
      || !same(basis.releasedIntentRef, basis.inheritedBasis.releasedIntentRef)) fail()
    const paths = releasePaths(profile, prior, ref.sha256)
    const [prepare, rollback, terminal, lock, provenance] = await Promise.all([
      read(paths.prepare), read(paths.rollback), read(paths.terminal), transport.readJson(prior.sourceLockRef, bucket, ['receipts']), read(paths.provenance),
    ])
    if (!same(basis.failedSourceLockRef, lock.ref) || lock.value.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1'
      || lock.value.ownerApplicationId !== profile.application.id || lock.value.releaseId !== prior.releaseId
      || lock.value.sourceRevision !== prior.sourceRevision || lock.value.sourceSha256 !== prior.sourceSha256
      || lock.value.migrationManifestSha256 !== prior.migrationManifestSha256 || lock.value.status !== 'SOURCE_FROZEN'
      || lock.value.clean !== true || lock.value.releaseAuthority !== true) fail()
    for (const [row, stage] of [[prepare, 'prepare'], [rollback, 'rollback'], [terminal, 'terminal']]) {
      const { receiptSha256, ...core } = row.value
      if (receiptSha256 !== sha256(canonicalize(core)) || core.schemaVersion !== 'jenfu.dev012.stage-receipt.v1'
        || core.ownerApplicationId !== profile.application.id || core.releaseId !== prior.releaseId || core.sourceRevision !== prior.sourceRevision
        || core.status !== 'PASS' || core.stage !== stage || core.facts.previousRevision !== prior.previousRevision
        || !same(basis.stageRefs?.[stage], row.ref)) fail()
      if (stage !== 'prepare' && (core.facts.result !== 'PRE_ACTIVATION_ABORTED' || core.facts.databaseDisposition !== 'NOT_APPLIED'
        || !same(core.facts.entrypointRecovery, { changed: false, result: 'NOT_REQUIRED' })
        || (stage === 'rollback' && !same(core.facts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])))) fail()
    }
    const refs = { sourceLock: prior.sourceLockRef, authorization: prior.authorizationPolicyRef, readiness: prior.readinessReceiptRef,
      foundation: prior.foundationReceiptRef, infra: prior.infraReceiptRef, runtimeConfig: prior.runtimeConfigRef }
    if (prepare.value.previousReceiptRef !== null || rollback.value.previousReceiptRef !== null || !same(terminal.value.previousReceiptRef, rollback.ref)
      || !same(prepare.value.facts.prerequisiteRefs, refs) || !same(prepare.value.facts.preActivationAbortBasis, basis.inheritedBasis)
      || basis.inputFingerprint !== sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: prior.releaseId,
        sourceRevision: prior.sourceRevision, releaseIntentSha256: ref.sha256 }))) fail()
    const stages = ['build', 'deployment', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']
    if (!same(basis.absentStages, stages)) fail()
    await assertAbsentStages(read, paths, stages)
    await assertMissing(read, migrationSubmissionIntentUri(profile, paths.migrate))
    const run = await readHistoricalOwnerRun(profile, transport, basis, prior), window = closedOwnerWindow(run)
    const partial = await readUnpublishedBuildEvidence({ profile, transport, baselineIntentRef: ref, intent: prior, paths, provenance, read })
    const finish = Date.parse(provenance.value.cloudBuild.finishTime)
    if (!same(partial, basis.unpublishedBuild) || finish < window.start || finish > window.end) fail()
    const executions = await assertHistoricalMigrationAbsence(profile, transport, prior, paths, run, bindings)
    const zeroRef = basis.inheritedBasis.failedIntentRef
    assertImmutableRef(zeroRef, bucket, ['receipts'])
    const zeroChild = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), zeroRef, true)
    return runAiPdmEvidenceContext(zeroChild, async () => {
      const zero = await transport.readJson(zeroRef, bucket, ['receipts'])
      const releasedRef = await readInheritedPrebuildAnchor({ profile, transport, intent: prior, inheritedBasis: basis.inheritedBasis, anchor: zero, read })
      const zeroLock = await transport.readJson(zero.value.sourceLockRef, bucket, ['receipts'])
      if (zeroLock.value.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1') fail()
      const zeroRun = await readHistoricalOwnerRun(profile, transport, basis.inheritedBasis, zero.value)
      if (closedOwnerWindow(zeroRun).end >= window.start) fail()
      const zeroExecutions = await assertHistoricalMigrationAbsence(profile, transport, zero.value, releasePaths(profile, zero.value, zeroRef.sha256), zeroRun, bindings)
      if (!same(executions, zeroExecutions) || !same(releasedRef, basis.releasedIntentRef)) fail()
      return consume(await transport.readJson(releasedRef, bucket, ['receipts']), releasedRef, [basis, basis.inheritedBasis])
    })
  })
}
function historicalExecutionArguments(execution) {
  const containers = execution.template?.containers
  if (!Array.isArray(containers) || containers.length !== 1 || containers[0].name !== 'migration'
    || !Array.isArray(containers[0].args) || containers[0].args.length === 0) fail()
  const allowed = new Set(['--bundle-ref', '--bundle-sha256', '--source-revision', '--output-ref',
    '--data-ref', '--data-sha256', '--bootstrap-ref', '--bootstrap-sha256'])
  const values = new Map(), args = containers[0].args
  for (let i = 0; i < args.length; i++) {
    const item = args[i]
    if (typeof item !== 'string') fail()
    const match = /^(--[a-z][a-z0-9-]*)(?:=(.+))?$/u.exec(item)
    if (!match || !allowed.has(match[1]) || values.has(match[1])) fail()
    const value = match[2] ?? args[++i]
    if (typeof value !== 'string' || !value || value.startsWith('--')) fail()
    values.set(match[1], value)
  }
  if (!/^[a-f0-9]{40}$/u.test(values.get('--source-revision') ?? '')
    || !/^gs:\/\/jenfu-platform-prod-aipdm-release\/receipts\/[A-Za-z0-9._/-]+\.json$/u.test(values.get('--output-ref') ?? '')
    || values.get('--output-ref').split('/').slice(3).some(part => !part || part === '.' || part === '..')) fail()
  return { container: containers[0], values }
}
async function assertHistoricalMigrationAbsence(profile, transport, intent, paths, run, bindings) {
  const window = closedOwnerWindow(run)
  // Bindings are constructed only by the fixed current/prior native proof
  // readers above, never by caller input or an arbitrary historical allowlist.
  if (!Array.isArray(bindings) || ![1, 2].includes(bindings.length)
    || new Set(bindings.map(row => row.name)).size !== bindings.length
    || new Set(bindings.map(row => row.args[5])).size !== bindings.length
    || new Set(bindings.map(row => row.args[7])).size !== bindings.length
    || bindings.some(row => window.end >= row.window.start)) fail()
  if (bindings.length === 2 && bindings[0].window.end >= bindings[1].window.start) fail()
  const expected = new Map(bindings.map(row => [row.name, row])), counts = new Map(bindings.map(row => [row.name, 0]))
  const job = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`
  const names = new Set(), tokens = new Set()
  let token = ''
  const inventory = []
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ pageSize: '100' }); if (token) query.set('pageToken', token)
    const list = await transport.request(`https://run.googleapis.com/v2/${job}/executions?${query}`)
    if (!list || typeof list !== 'object' || Array.isArray(list) || Object.keys(list).some(key => !['executions', 'nextPageToken'].includes(key))
      || (Object.hasOwn(list, 'executions') && !Array.isArray(list.executions))
      || (Object.hasOwn(list, 'nextPageToken') && typeof list.nextPageToken !== 'string')) fail()
    for (const execution of list.executions ?? []) {
      const created = Date.parse(execution.createTime), completed = Date.parse(execution.completionTime)
      const terminal = execution.conditions?.filter(row => row.type === 'Completed')
      if (typeof execution.name !== 'string' || !new RegExp(`^${job}/executions/ai-pdm-prod-migration-runner-[a-z0-9]+$`, 'u').test(execution.name)
        || execution.name.split('/').at(-1).length > 63 || names.has(execution.name)
        || !Number.isFinite(created) || !Number.isFinite(completed) || completed < created || completed > Date.now()
        || execution.reconciling === true || (Object.hasOwn(execution, 'reconciling') && execution.reconciling !== false)
        || terminal?.length !== 1 || !['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(terminal[0].state)) fail()
      for (const name of ['succeededCount', 'failedCount', 'cancelledCount', 'runningCount', 'taskCount']) {
        if (!Object.hasOwn(execution, name)) continue
        const count = execution[name]
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || (name === 'runningCount' && count !== 0)) fail()
      }
      names.add(execution.name); inventory.push(execution)
      const { container, values } = historicalExecutionArguments(execution)
      if ((created <= window.end && completed >= window.start) || values.get('--source-revision') === intent.sourceRevision || values.get('--output-ref') === paths.migrate) fail()
      if (created >= window.start) {
        const binding = expected.get(execution.name)
        if (!binding) fail()
        counts.set(binding.name, counts.get(binding.name) + 1)
        if (execution.name !== binding.name || !same(container.args, binding.args) || container.image !== binding.image
          || created < binding.window.start || completed > binding.window.end || created > binding.started || completed < binding.completed
          || terminal[0].state !== 'CONDITION_SUCCEEDED') fail()
        for (const [name, expected] of [['succeededCount', 1], ['failedCount', 0], ['cancelledCount', 0], ['runningCount', 0]]) {
          const count = Object.hasOwn(execution, name) ? execution[name] : 0
          if (typeof count !== 'number' || !Number.isInteger(count) || count !== expected) fail()
        }
        if (Object.hasOwn(execution, 'taskCount') && execution.taskCount !== 1) fail()
      }
    }
    token = list.nextPageToken ?? ''
    if (!token) { if ([...counts.values()].some(count => count !== 1)) fail(); return inventory.sort((a, b) => a.name.localeCompare(b.name)) }
    if (tokens.has(token)) fail(); tokens.add(token)
  }
  fail()
}

async function assertNoMigrationExecution(profile, transport, intent, paths, run) {
  const started = Date.parse(run.createdAt), ended = Date.parse(run.updatedAt)
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started || ended > Date.now()
    || profile.migrations?.jobName !== 'ai-pdm-prod-migration-runner') fail()
  const job = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`
  const names = new Set(), tokens = new Set(), inventory = []
  let token = ''
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ pageSize: '100' }); if (token) query.set('pageToken', token)
    const list = await transport.request(`https://run.googleapis.com/v2/${job}/executions?${query}`)
    if (!list || typeof list !== 'object' || Array.isArray(list)
      || Object.keys(list).some(key => !['executions', 'nextPageToken'].includes(key))
      || (Object.hasOwn(list, 'executions') && !Array.isArray(list.executions))
      || (Object.hasOwn(list, 'nextPageToken') && typeof list.nextPageToken !== 'string')) fail()
    for (const execution of list.executions ?? []) {
      const { created, finished: completed } = executionTerminalFacts(execution)
      const containers = execution.template?.containers
      if (!execution.template || typeof execution.template !== 'object' || Array.isArray(execution.template)
        || !Array.isArray(containers) || containers.length === 0
        || containers.some(container => !container || typeof container !== 'object' || Array.isArray(container)
          || !Array.isArray(container.args) || container.args.some(argument => typeof argument !== 'string'))) fail()
      const argumentsMatch = value => execution.template?.containers?.some(container => container.args?.some((argument, index, args) =>
        argument === value || argument === `--source-revision=${value}` || argument === `--output-ref=${value}`
        || (['--source-revision', '--output-ref'].includes(argument) && args[index + 1] === value)))
      if (typeof execution.name !== 'string' || !execution.name.startsWith(`${job}/executions/`)
        || names.has(execution.name) || completed > Date.now()
        || (created <= ended && completed >= started) || argumentsMatch(paths.migrate) || argumentsMatch(intent.sourceRevision)) fail()
      names.add(execution.name)
      inventory.push(executionProjection(execution))
    }
    token = list.nextPageToken ?? ''
    if (!token) return inventory.sort((left, right) => left.name.localeCompare(right.name))
    if (tokens.has(token)) fail(); tokens.add(token)
  }
  fail()
}

async function assertStableNoMigrationExecution(profile, transport, intent, paths, run) {
  const first = await assertNoMigrationExecution(profile, transport, intent, paths, run)
  const second = await assertNoMigrationExecution(profile, transport, intent, paths, run)
  if (!same(first, second)) fail()
  return first
}
