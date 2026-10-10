import { assertProgramOnlyPolicy, assertProgramOnlyExecution, programOnlyNativeUri, PROGRAM_ONLY_DISPOSITION } from './dev117-ai-pdm-program-only-baseline.mjs'
import { assertImmutableRef, canonicalize, migrationSubmissionIntentUri, releasePaths, sha256 } from './dev012-owner-release-runtime.mjs'
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
  if (intent.programOnlyBaseline) return readProgramOnlyAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider })
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

/** One completed readonly abort, immediately anchored to a genuine released app. */
async function readProgramOnlyAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider }) {
  assertProgramOnlyPolicy(intent.programOnlyBaseline, { profile, intent })
  if (terminalFacts.databaseDisposition !== PROGRAM_ONLY_DISPOSITION || terminalFacts.currentDatabaseReadPerformed !== true) fail()
  const [prepare, migration, deployment, rollback, candidate, entry] = await Promise.all([
    read(paths.prepare), read(paths.migrate), read(paths.deployment), read(paths.rollback),
    optionalOrdinaryStage(read, paths.candidate), optionalOrdinaryStage(read, paths.entrypoint),
  ])
  const prepareFacts = seal(prepare, 'prepare'), rollbackFacts = seal(rollback, 'rollback')
  const candidateFacts = candidate ? seal(candidate, 'candidate') : null
  if (prepareFacts.preActivationAbortBasis || prepare.value.previousReceiptRef !== null || prepareFacts.previousRevision !== intent.previousRevision
    || rollbackFacts.result !== 'PRE_ACTIVATION_ABORTED' || rollbackFacts.databaseDisposition !== PROGRAM_ONLY_DISPOSITION
    || rollbackFacts.currentDatabaseReadPerformed !== true || rollbackFacts.previousRevision !== intent.previousRevision
    || !same(terminalFacts.migrationEvidenceRef, migration.ref) || !same(rollbackFacts.migrationEvidenceRef, migration.ref)
    || !same(terminal.value.previousReceiptRef, rollback.ref) || !same(rollback.value.previousReceiptRef, entry?.ref ?? candidate?.ref ?? migration.ref)
    || !same(rollbackFacts.recoveryOrder, ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'])
    || !same(terminalFacts.entrypointRecovery, rollbackFacts.entrypointRecovery)) fail()
  const prerequisiteRefs = Object.fromEntries(Object.entries({ sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }).map(([name, key]) => [name, intent[key]]))
  if (!same(prepareFacts.prerequisiteRefs, prerequisiteRefs)) fail()
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
  const window = closedOwnerWindow(run)
  let previous = window.start
  const stageRefs = { prepare: prepare.ref, migration: migration.ref, deployment: deployment.ref, rollback: rollback.ref, terminal: terminal.ref }
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
  const failed = await transport.readOwnerSourceProof({ profile, sourceRevision: intent.sourceRevision, refs: { prepare: prepare.ref, migrate: migration.ref, terminal: null }, verifyProvider })
  if (failed.proof?.databaseDisposition !== PROGRAM_ONLY_DISPOSITION || failed.proof.currentDatabaseReadPerformed !== true
    || failed.proof.disposition !== 'migration_only' || failed.proof.artifactDigest !== deployment.value.artifactDigest
    || (verifyProvider && failed.provider?.status !== 'BUILD_IMAGE_VERIFIED')) fail()
  const graph = await readAiPdmObservationInputs(failed.proof), binding = graph.programMigration
  if (!binding || !same(graph.intentRef, baselineIntentRef) || !same(graph.chain.deployment.ref, deployment.ref)
    || !same(graph.sourceLock.ref, intent.sourceLockRef) || binding.window.start !== Date.parse(graph.sourceLock.value.observedAt)
    || binding.window.end !== Date.parse(intent.deadlineAt)) fail()
  const releaseWindow = binding.window
  const inventory = async () => {
    const job = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`
    const names = new Set(), tokens = new Set(), rows = []
    let pageToken = '', matched = 0
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
        if (execution.name === binding.execution.value.name) {
          assertProgramOnlyExecution(execution, { profile, deployment: deployment.value, outputUri: programOnlyNativeUri(paths.migrate), submission: binding.submission.value, window: releaseWindow })
          for (const key of ['name', 'createTime', 'completionTime', 'template', 'taskCount', 'parallelism']) if (!same(execution[key], binding.execution.value[key])) fail()
          matched += 1
        } else if (created >= releaseWindow.start || completed >= releaseWindow.start || (execution.startTime !== undefined && Date.parse(execution.startTime) >= releaseWindow.start)
          || execution.template?.containers?.some(container => container.args?.includes(intent.sourceRevision) || container.args?.includes(programOnlyNativeUri(paths.migrate)))) fail()
      }
      pageToken = response.nextPageToken ?? ''
      if (!pageToken) { if (matched !== 1) fail(); return rows.sort((a,b) => a.name.localeCompare(b.name)) }
      if (tokens.has(pageToken)) fail(); tokens.add(pageToken)
    }
    fail()
  }
  const before = await inventory(), after = await inventory()
  if (!same(before, after)) fail()
  const anchor = await transport.readJson(intent.baselineIntentRef, profile.artifact.releaseBucket, ['receipts'])
  const anchorPaths = releasePaths(profile, anchor.value, intent.baselineIntentRef.sha256)
  const [anchorPrepare, anchorMigration, anchorTerminal] = await Promise.all([read(anchorPaths.prepare), read(anchorPaths.migrate), read(anchorPaths.terminal)])
  if (sealOrdinaryStage(anchorTerminal, 'terminal', anchor.value, profile).result !== 'RELEASED') fail()
  const child = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), intent.baselineIntentRef, true)
  const released = await runAiPdmEvidenceContext(child, () => transport.readOwnerSourceProof({ profile, sourceRevision: anchor.value.sourceRevision,
    refs: { prepare: anchorPrepare.ref, migrate: anchorMigration.ref, terminal: anchorTerminal.ref }, verifyProvider }))
  if (released.proof.disposition !== 'released' || released.proof.candidateRevision !== intent.previousRevision
    || (verifyProvider && released.provider?.status !== 'BUILD_IMAGE_VERIFIED')) fail()
  service ??= await transport.getService(profile)
  transport.assertServiceSettled(service, 'DEV121_PREACTIVATION_CONTINUATION_INVALID')
  if (!traffic(service.traffic, intent.previousRevision) || !traffic(service.trafficStatuses, intent.previousRevision)
    || service.scaling?.scalingMode !== 'AUTOMATIC' || Number(service.scaling.maxInstanceCount) !== 1
    || !same(transport.entrypointSnapshot(service), prepareFacts.entrypointBaseline)) fail()
  transport.assertCanonicalEntrypoint(profile, service)
  const retained = await transport.getRevision(profile, intent.previousRevision)
  if (retained?.name !== `${service.name}/revisions/${intent.previousRevision}` || retained.conditions?.find(row => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED'
    || retained.containers?.filter(row => row.name === profile.runtime.containerName).length !== 1
    || retained.containers.find(row => row.name === profile.runtime.containerName).image !== released.proof.artifactDigest) fail()
  return { kind: 'PROGRAM_ONLY_ABORT', currentActiveRevision: intent.previousRevision, result: 'PRE_ACTIVATION_ABORTED',
    authorityBasis: { schemaVersion: 'aipdm.program-only-abort-basis.v1', failedIntentRef: baselineIntentRef, releasedIntentRef: intent.baselineIntentRef,
      failedProof: failed.proof, releasedProof: released.proof, stageRefs, controlSha256, ownerRunRef: control.ownerRunRef,
      previousRevision: intent.previousRevision, inputFingerprint: fingerprint, inventorySha256: sha256(canonicalize(before)) } }
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
    if (intent.openswxWorkerRef) {
      const graph = await readAiPdmObservationInputs(failed.proof)
      if (graph.migrationMode !== 'FORWARD_APPLIED' || !same(graph.intentRef, baselineIntentRef)) fail()
    }
    const binding = currentMigrationBinding({ profile, intent, paths, migration, deployment, run, failed })
    if (prepareFacts.preActivationAbortBasis.schemaVersion === 'ai-pdm.principal-ordinary-abort-basis.v1') {
      return readHistoricalOrdinaryPredecessor({ profile, transport, intent, basis: prepareFacts.preActivationAbortBasis, anchor, read, binding, verifyProvider, consume: consumeAnchor })
    }
    return readHistoricalOrdinaryAnchor({ profile, transport, intent, basis: prepareFacts.preActivationAbortBasis, anchor, read, bindings: [binding], consume: consumeAnchor })
  }
  return consumeAnchor(anchor, intent.baselineIntentRef)
}

// Only a completed prepare followed by a sealed abort before any completed build
// can use this basis. It never promotes an aborted capsule into a released one.
async function readPrebuildAbort({ profile, transport, baselineIntentRef, intent, paths, terminal, terminalFacts, control, service, read, seal, verifyProvider }) {
  const bucket = profile.artifact.releaseBucket
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
  // Only a positive 404 is absence; partial uploads and unknown reads fail closed.
  let provenance = null
  try { provenance = await read(paths.provenance) } catch (error) { if (error.code !== 'MISSING') throw error }
  const absentStages = ['build', ...(provenance ? [] : ['provenance', 'sbom', 'scan']), 'deployment', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']
  await assertAbsentStages(read, paths, absentStages)
  await assertMissing(read, migrationSubmissionIntentUri(profile, paths.migrate))
  const run = await transport.readOwnerRun(profile, control.ownerRunRef)
  if (run.id !== runId || run.status !== 'completed' || run.conclusion !== 'failure'
    || run.event !== 'workflow_dispatch' || run.headSha !== intent.sourceRevision) fail()
  const partial = provenance ? await readUnpublishedBuild({ profile, transport, baselineIntentRef, intent, paths, provenance, read, run }) : null
  if (!partial) await assertZeroBuilds(profile, transport, intent)
  let releasedIntentRef = intent.baselineIntentRef, inheritedBasis = null
  if (partial && prepareFacts.preActivationAbortBasis) {
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
  if (inheritedBasis && (inheritedBasis.serviceUid !== service.uid || inheritedBasis.previousRevision !== intent.previousRevision
    || inheritedBasis.retainedArtifactDigest !== proof.artifactDigest || !same(inheritedBasis.releasedProof, proof)
    || !same(inheritedBasis.entrypoint, entrySnapshot(service)) || !same(inheritedBasis.scaling, service.scaling)
    || inheritedBasis.retainedEnvironmentSha256 !== sha256(canonicalize(retainedEnvironment)))) fail()
  return { kind: 'PRINCIPAL_ORDINARY_ABORT', currentActiveRevision: intent.previousRevision, result: 'PRE_ACTIVATION_ABORTED',
    authorityBasis: { schemaVersion: partial ? 'ai-pdm.principal-unpublished-build-abort-basis.v1' : 'ai-pdm.principal-prebuild-abort-basis.v1', failedIntentRef: baselineIntentRef,
      releasedIntentRef, failedSourceLockRef: failedLock.ref, databaseDisposition: 'NOT_APPLIED', releasedProof: proof,
      absentStages: absentStages.filter(stage => !['sbom', 'scan'].includes(stage)), failedBuildCount: partial ? 1 : 0, ...(partial ? { unpublishedBuild: partial, inheritedBasis } : {}), stageRefs: { prepare: prepare.ref, rollback: rollback.ref, terminal: terminal.ref, runtimeConfig: anchorRuntime.ref },
      controlSha256, inputFingerprint: fingerprint, ownerRunRef: control.ownerRunRef, serviceUid: service.uid,
      previousRevision: intent.previousRevision, retainedArtifactDigest: proof.artifactDigest,
      entrypoint: entrySnapshot(service), scaling: service.scaling, retainedEnvironmentSha256: sha256(canonicalize(retainedEnvironment)) } }
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
    if (prior.openswxWorkerRef) {
      const graph = await readAiPdmObservationInputs(failed.proof)
      if (graph.migrationMode !== 'FORWARD_APPLIED' || !same(graph.intentRef, ref)) fail()
    }
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
  const names = new Set(), tokens = new Set()
  let token = ''
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ pageSize: '100' }); if (token) query.set('pageToken', token)
    const list = await transport.request(`https://run.googleapis.com/v2/${job}/executions?${query}`)
    if (!list || typeof list !== 'object' || Array.isArray(list)
      || Object.keys(list).some(key => !['executions', 'nextPageToken'].includes(key))
      || (Object.hasOwn(list, 'executions') && !Array.isArray(list.executions))
      || (Object.hasOwn(list, 'nextPageToken') && typeof list.nextPageToken !== 'string')) fail()
    for (const execution of list.executions ?? []) {
      const created = Date.parse(execution.createTime)
      if (typeof execution.name !== 'string' || !execution.name.startsWith(`${job}/executions/`)
        || names.has(execution.name) || !Number.isFinite(created) || !execution.completionTime || execution.reconciling === true
        || !execution.conditions?.some(condition => condition.type === 'Completed' && ['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(condition.state))
        || created >= started || execution.template?.containers?.some(container => container.args?.includes(paths.migrate)
          || container.args?.includes(intent.sourceRevision))) fail()
      names.add(execution.name)
    }
    token = list.nextPageToken ?? ''
    if (!token) return
    if (tokens.has(token)) fail(); tokens.add(token)
  }
  fail()
}
