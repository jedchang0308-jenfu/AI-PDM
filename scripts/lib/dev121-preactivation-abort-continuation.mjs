import { assertImmutableRef, canonicalize, releasePaths, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertPrincipalOnlyRecoveryBinding, assertRecoveryProofReadback } from './dev121-principal-only-release.mjs'
import { createAiPdmEvidenceContext, runAiPdmEvidenceContext, descendAiPdmEvidenceContext, readAiPdmObservationInputs } from './dev121-owner-release-proof.mjs'

const same = (a, b) => canonicalize(a) === canonicalize(b)
const fail = () => { throw new Error('DEV121_PREACTIVATION_CONTINUATION_INVALID') }
const traffic = (rows, revision) => Array.isArray(rows) && rows.length === 1
  && rows[0].revision === revision && Number(rows[0].percent) === 100 && !rows[0].tag

// A finalized abort is not a successful release or a maintenance rollback.
// Certify the cleaned, still-stopped original traffic before preparing a retry.
export async function readPreActivationAbortContinuation({ profile, transport, baselineIntentRef, service = null, control = null, verifyProvider = false }) {
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
  if (['RELEASED', 'ROLLED_BACK'].includes(terminalFacts.result)) return null
  if (terminalFacts.result !== 'PRE_ACTIVATION_ABORTED') fail()
  if (!control) control = JSON.parse((await transport.readBytes(`gs://${bucket}/control/active.json`, { prefixes: ['control'] })).bytes)
  if (control.result !== 'PRE_ACTIVATION_ABORTED') fail()
  const binding = assertPrincipalOnlyRecoveryBinding(intent, bucket)
  if (!binding) return readOrdinaryAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider })
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

// The retained application must already have a complete Principal-only release.
// Its anchor is taken solely from the sealed failed intent, never a caller hint.
async function readOrdinaryAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider }) {
  const bucket = profile.artifact.releaseBucket
  if (profile.application.id !== 'ai-pdm' || bucket !== 'jenfu-platform-prod-aipdm-release'
    || profile.target.projectId !== 'jenfu-platform-prod' || profile.target.region !== 'asia-east1'
    || profile.target.serviceName !== 'ai-pdm-prod'
    || intent.schemaVersion !== profile.schemas.releaseIntent
    || Object.hasOwn(intent, 'principalOnlyRecovery') || Object.hasOwn(intent, 'principalOnlyFenceRef')
    || baselineIntentRef.uri !== `gs://${bucket}/receipts/releases/${intent.releaseId}/release-intent.json`
    || !intent.baselineIntentRef || same(intent.baselineIntentRef, baselineIntentRef)) fail()
  assertImmutableRef(intent.baselineIntentRef, bucket, ['receipts'])
  if (terminalFacts.databaseDisposition === 'NOT_APPLIED') return readPrebuildAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider })
  const [prepare, migration, candidate, deployment, entry, rollback, anchor] = await Promise.all([
    read(paths.prepare), read(paths.migrate), read(paths.candidate), read(paths.deployment), read(paths.entrypoint), read(paths.rollback),
    transport.readJson(intent.baselineIntentRef, bucket, ['receipts']),
  ])
  const prepareFacts = seal(prepare, 'prepare'), candidateFacts = seal(candidate, 'candidate')
  const entryFacts = seal(entry, 'entrypoint'), rollbackFacts = seal(rollback, 'rollback')
  const repair = migration.value?.schemaVersion === 'aipdm.paused-app-repair-migration-association.v1'
  const databaseDisposition = repair ? 'HISTORICAL_EVIDENCE_REUSED' : 'FORWARD_APPLIED'
  if (repair && (!same(terminalFacts.migrationEvidenceRef, migration.ref) || !same(rollbackFacts.migrationEvidenceRef, migration.ref))) fail()
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
    || control.previousRevision !== intent.previousRevision || control.candidateRevision !== candidateFacts.candidateRevision
    || control.candidateRevision === intent.previousRevision || !/^[1-9][0-9]*$/u.test(runId)
    || control.deadlineAt !== intent.deadlineAt || !Number.isFinite(Date.parse(control.deadlineAt))
    || !Number.isFinite(Date.parse(control.leaseExpiresAt)) || Date.parse(control.leaseExpiresAt) >= Date.now()
    || prepare.value.previousReceiptRef !== null || prepareFacts.previousRevision !== intent.previousRevision
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
  for (const stage of ['activate', 'canonical', 'finalize', 'decision']) {
    try { await read(paths[stage]); fail() } catch (error) { if (error.code !== 'MISSING') throw error }
  }
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()
  const anchorIntent = anchor.value
  if (anchorIntent?.ownerApplicationId !== profile.application.id || !/^[a-f0-9]{40}$/u.test(anchorIntent.sourceRevision ?? '')
    || anchorIntent.schemaVersion !== profile.schemas.releaseIntent
    || intent.baselineIntentRef.uri !== `gs://${bucket}/receipts/releases/${anchorIntent.releaseId}/release-intent.json`) fail()
  const anchorPaths = releasePaths(profile, anchorIntent, intent.baselineIntentRef.sha256)
  const anchorRead = async (stage) => read(anchorPaths[stage])
  const [anchorPrepare, anchorMigration, anchorTerminal, anchorRuntime, anchorVerify, anchorCanonical] = await Promise.all([
    anchorRead('prepare'), anchorRead('migrate'), anchorRead('terminal'),
    transport.readJson(anchorIntent.runtimeConfigRef, bucket, ['receipts']), anchorRead('verify'), anchorRead('canonical'),
  ])
  const failed = await transport.readOwnerSourceProof({ profile, sourceRevision: intent.sourceRevision,
    refs: { prepare: prepare.ref, migrate: migration.ref, terminal: null }, verifyProvider })
  const releasedContext = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), intent.baselineIntentRef, true)
  const released = await runAiPdmEvidenceContext(releasedContext, () => transport.readOwnerSourceProof({ profile, sourceRevision: anchorIntent.sourceRevision,
    refs: { prepare: anchorPrepare.ref, migrate: anchorMigration.ref, terminal: anchorTerminal.ref }, verifyProvider }))
  const assertSourceProof = (proof, sourceIntent, sourceRef, disposition) => {
    if (proof?.owner !== profile.application.id || proof.sourceRevision !== sourceIntent.sourceRevision
      || proof.releaseId !== sourceIntent.releaseId || proof.disposition !== disposition
      || proof.sourceLock?.ref !== sourceIntent.sourceLockRef.uri || proof.sourceLock.sha256 !== sourceIntent.sourceLockRef.sha256
      || proof.migrationManifestSha256 !== sourceIntent.migrationManifestSha256
      || !proof.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`)) fail()
    const chain = proof.releaseChain ?? proof.buildChain
    const sourcePaths = releasePaths(profile, sourceIntent, sourceRef.sha256)
    if (chain?.deployment?.ref !== sourcePaths.deployment) fail()
  }
  assertSourceProof(failed.proof, intent, baselineIntentRef, repair ? 'migration_evidence_only' : 'migration_only')
  assertSourceProof(released.proof, anchorIntent, intent.baselineIntentRef, 'released')
  const anchorRepair = anchorMigration.value?.schemaVersion === 'aipdm.paused-app-repair-migration-association.v1'
  for (const [observation, expectedRepair] of [[failed, repair], [released, anchorRepair]]) {
    if ((observation.proof?.databaseDisposition === 'HISTORICAL_EVIDENCE_REUSED') !== expectedRepair) fail()
  }
  for (const observation of [failed, released]) if (observation.proof?.databaseDisposition === 'HISTORICAL_EVIDENCE_REUSED') {
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
  return { kind: 'PRINCIPAL_ORDINARY_ABORT', currentActiveRevision: intent.previousRevision, result: 'PRE_ACTIVATION_ABORTED',
    authorityBasis: { schemaVersion: 'ai-pdm.principal-ordinary-abort-basis.v1', failedIntentRef: baselineIntentRef,
      releasedIntentRef: intent.baselineIntentRef, failedProof: failed.proof, releasedProof: released.proof,
      stageRefs: { prepare: prepare.ref, migration: migration.ref, candidate: candidate.ref, deployment: deployment.ref, entrypoint: entry.ref,
        rollback: rollback.ref, terminal: terminal.ref, runtimeConfig: anchorRuntime.ref },
      controlSha256, inputFingerprint: fingerprint, ownerRunRef: control.ownerRunRef, serviceUid: service.uid,
      previousRevision: intent.previousRevision, retainedArtifactDigest: released.proof.artifactDigest,
      entrypoint: entrySnapshot(service), scaling: service.scaling, retainedEnvironmentSha256: sha256(canonicalize(retainedEnvironment)) } }
}

// Only a completed prepare followed by a sealed abort before any completed build
// can use this basis. It never promotes an aborted capsule into a released one.
async function readPrebuildAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider }) {
  const bucket = profile.artifact.releaseBucket
  const [prepare, rollback, failedLock, anchor] = await Promise.all([
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
    || control.previousRevision !== intent.previousRevision || control.candidateRevision !== null || !/^[1-9][0-9]*$/u.test(runId)
    || control.deadlineAt !== intent.deadlineAt || !Number.isFinite(Date.parse(control.deadlineAt))
    || !Number.isFinite(Date.parse(control.leaseExpiresAt)) || Date.parse(control.leaseExpiresAt) >= Date.now()
    || prepare.value.previousReceiptRef !== null || prepareFacts.previousRevision !== intent.previousRevision
    || !same(prepareFacts.prerequisiteRefs, Object.fromEntries(Object.entries(refNames).map(([name, field]) => [name, intent[field]])))
    || rollback.value.previousReceiptRef !== null || !same(terminal.value.previousReceiptRef, rollback.ref)
    || terminalFacts.previousRevision !== intent.previousRevision || rollbackFacts.previousRevision !== intent.previousRevision
    || terminalFacts.databaseDisposition !== 'NOT_APPLIED' || rollbackFacts.databaseDisposition !== 'NOT_APPLIED'
    || rollbackFacts.result !== 'PRE_ACTIVATION_ABORTED'
    || !same(terminalFacts.entrypointRecovery, rollbackFacts.entrypointRecovery)
    || !same(rollbackFacts.entrypointRecovery, { changed: false, result: 'NOT_REQUIRED' })
    || !same(rollbackFacts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])
    || failedLock.ref.sha256 !== intent.sourceLockRef.sha256 || failedLock.value.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1'
    || failedLock.value.ownerApplicationId !== profile.application.id || failedLock.value.releaseId !== intent.releaseId
    || failedLock.value.sourceRevision !== intent.sourceRevision || failedLock.value.sourceSha256 !== intent.sourceSha256
    || failedLock.value.migrationManifestSha256 !== intent.migrationManifestSha256
    || failedLock.value.status !== 'SOURCE_FROZEN' || failedLock.value.releaseAuthority !== true || failedLock.value.clean !== true) fail()
  // Only a positively missing object is absence. Timeouts, permission and parse
  // failures remain blockers, including when an upload completed without a receipt.
  const absentStages = ['build', 'provenance', 'deployment', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']
  for (const stage of absentStages) {
    try { await read(paths[stage]); fail() } catch (error) { if (error.code !== 'MISSING') throw error }
  }
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()
  if (!/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(intent.releaseId ?? '')) fail()
  // Absence is a live prerequisite on every call, including cold and cached
  // prepare. verifyProvider only controls the released anchor's image proof.
  const builds = await transport.request(`https://cloudbuild.googleapis.com/v1/projects/${profile.target.projectId}/locations/${profile.target.region}/builds?filter=${encodeURIComponent(`tags=${intent.releaseId.toLowerCase()}`)}&pageSize=1`)
  if (!builds || typeof builds !== 'object' || Array.isArray(builds)
    || Object.keys(builds).some(key => !['builds', 'nextPageToken'].includes(key))
    || (Object.hasOwn(builds, 'builds') && (!Array.isArray(builds.builds) || builds.builds.length !== 0))
    || (Object.hasOwn(builds, 'nextPageToken') && builds.nextPageToken !== '')) fail()
  const anchorIntent = anchor.value
  if (anchorIntent?.ownerApplicationId !== profile.application.id || !/^[a-f0-9]{40}$/u.test(anchorIntent.sourceRevision ?? '')
    || anchorIntent.schemaVersion !== profile.schemas.releaseIntent
    || intent.baselineIntentRef.uri !== `gs://${bucket}/receipts/releases/${anchorIntent.releaseId}/release-intent.json`) fail()
  const anchorPaths = releasePaths(profile, anchorIntent, intent.baselineIntentRef.sha256)
  const [anchorPrepare, anchorMigration, anchorTerminal, anchorRuntime, anchorVerify, anchorCanonical, anchorLock] = await Promise.all([
    read(anchorPaths.prepare), read(anchorPaths.migrate), read(anchorPaths.terminal),
    transport.readJson(anchorIntent.runtimeConfigRef, bucket, ['receipts']), read(anchorPaths.verify), read(anchorPaths.canonical),
    transport.readJson(anchorIntent.sourceLockRef, bucket, ['receipts']),
  ])
  const releasedContext = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), intent.baselineIntentRef, true)
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
    || service.scaling?.scalingMode !== 'AUTOMATIC' || Number(service.scaling.maxInstanceCount) !== 1
    || !traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)
    || !same(entrySnapshot(service), entrySnapshot(prepareFacts.entrypointBaseline))) fail()
  transport.assertCanonicalEntrypoint(profile, service)
  const retainedRevision = await transport.getRevision(profile, intent.previousRevision)
  const retainedApp = retainedRevision?.containers?.filter(row => row.name === profile.runtime.containerName)
  if (retainedRevision?.name !== `${service.name}/revisions/${intent.previousRevision}`
    || retainedRevision.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
    || retainedApp?.length !== 1 || retainedApp[0].image !== proof.artifactDigest) fail()
  const retainedEnvironment = retainedApp[0].env ?? []
  if (new Set(retainedEnvironment.map(row => row.name)).size !== retainedEnvironment.length
    || Object.entries(principalModes).some(([name, value]) => retainedEnvironment.find(row => row.name === name)?.value !== value)) fail()
  return { kind: 'PRINCIPAL_ORDINARY_ABORT', currentActiveRevision: intent.previousRevision, result: 'PRE_ACTIVATION_ABORTED',
    authorityBasis: { schemaVersion: 'ai-pdm.principal-prebuild-abort-basis.v1', failedIntentRef: baselineIntentRef,
      releasedIntentRef: intent.baselineIntentRef, failedSourceLockRef: failedLock.ref, databaseDisposition: 'NOT_APPLIED', releasedProof: proof,
      absentStages, failedBuildCount: 0, stageRefs: { prepare: prepare.ref, rollback: rollback.ref, terminal: terminal.ref, runtimeConfig: anchorRuntime.ref },
      controlSha256, inputFingerprint: fingerprint, ownerRunRef: control.ownerRunRef, serviceUid: service.uid,
      previousRevision: intent.previousRevision, retainedArtifactDigest: proof.artifactDigest,
      entrypoint: entrySnapshot(service), scaling: service.scaling, retainedEnvironmentSha256: sha256(canonicalize(retainedEnvironment)) } }
}
