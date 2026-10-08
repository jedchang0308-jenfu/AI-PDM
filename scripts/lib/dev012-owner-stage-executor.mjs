import { readPrincipalOnlyRepairBaseline } from './dev121-principal-forward-repair.mjs'
import { readPreActivationAbortContinuation } from './dev121-preactivation-abort-continuation.mjs'
import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { assertImmutableRef, assertProtectedGitHubContext, assertRuntimeConfig, candidateTagUriMatches, canonicalize, releasePaths, sha256, stageReceipt } from './dev012-owner-release-runtime.mjs'
import { assertDataCutoverExportReceipt, assertDataCutoverFenceReceipt, assertDataCutoverHandoff, assertDataCutoverImportReceipt, assertDataCutoverTeardownReceipt } from './dev012-production-data-cutover.mjs'
import { assertOwnerTerminalReceipt, assertPostLiveCleanupReceipt, executeProviderStage } from './dev012-production-data-cutover-provider.mjs'
import { dev013L4SequenceStep, dev013TerminalTransitionFact } from './dev013-l4-transition-sequence.mjs'
import { buildDev014ConsumerConformance } from './dev014-consumer-conformance.mjs'
import { assertPrincipalOnlyRecoveryBinding, assertPrincipalOnlyRecoveryReadback, principalOnlyRollbackRevision } from './dev121-principal-only-release.mjs'
import { assertOpenSwxWorkerRef, assertWorkerRuntimeJoin, createOpenSwxOwnerRelease, isPausedAppRepair, readWorkerFullEvidence } from './dev122-openswx-owner-release.mjs'
import { createAiPdmEvidenceContext, runAiPdmEvidenceContext, assertAiPdmHistoricalMigration, assertAiPdmMigrationContent, assertAiPdmMigrationEquivalent, assertAiPdmRepairMigrationMode, assertAiPdmMigrationBundleBytes, assertMigration, parseAiPdmMigrationArchive, assertPausedMigrationPrerequisite, assertPausedMigrationAssociation, readAiPdmObservationInputs } from './dev121-owner-release-proof.mjs'

export { candidateTagUriMatches } from './dev012-owner-release-runtime.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const STAGES = new Set(['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize', 'rollback'])
const CONTROL_STATES = new Set(['CANDIDATE_CREATED', 'ENTRYPOINT_CONFIGURED', 'CANDIDATE_VERIFIED', 'GO', 'ACTIVE', 'CANONICAL_VERIFIED', 'ABORT_REQUESTED', 'FINALIZED'])

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

export function readGitBlob(root, repositoryPath, revision = 'HEAD') {
  if ((!H40.test(revision) && revision !== 'HEAD') || !/^[A-Za-z0-9._/-]+$/u.test(repositoryPath ?? '') || repositoryPath.startsWith('/') || repositoryPath.includes('../')) fail('GIT_BLOB_REF_INVALID')
  const result = spawnSync('git', ['show', `${revision}:${repositoryPath}`], { cwd: root, encoding: null, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) fail('GIT_SOURCE_INSPECTION_FAILED', repositoryPath)
  return result.stdout
}

export function parseOwnerStageArgs(argv, expectedBucket) {
  const value = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!['--stage', '--capsule-ref', '--capsule-sha256'].includes(key) || !argv[index + 1]) fail('INVALID_ARGUMENTS', key)
    value[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = argv[index + 1]
  }
  if (Object.keys(value).length !== 3 || !STAGES.has(value.stage) || !new RegExp(`^gs://${expectedBucket}/receipts/[A-Za-z0-9._/-]+\\.json$`, 'u').test(value.capsuleRef ?? '') || !H64.test(value.capsuleSha256 ?? '')) fail('INVALID_ARGUMENTS')
  return value
}

export function createGitArchive(root, sourceRevision) {
  if (!H40.test(sourceRevision ?? '')) fail('SOURCE_REVISION_INVALID')
  const run = (args, encoding = 'utf8') => {
    const result = spawnSync('git', args, { cwd: root, encoding, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
    if (result.error || result.status !== 0) fail('GIT_SOURCE_INSPECTION_FAILED', args.join(' '))
    return result.stdout
  }
  if (String(run(['rev-parse', 'HEAD'])).trim() !== sourceRevision || String(run(['status', '--porcelain=v1', '--untracked-files=all'])).trim() !== '') fail('SOURCE_CHECKOUT_NOT_FROZEN')
  const bytes = run(['archive', '--format=tar', '--prefix=source/', sourceRevision], null)
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail('SOURCE_ARCHIVE_FAILED')
  return bytes
}

export function createGitSourceIdentity(root, sourceRevision) {
  if (!H40.test(sourceRevision ?? '')) fail('SOURCE_REVISION_INVALID')
  const run = (args, encoding = 'utf8') => {
    const result = spawnSync('git', args, { cwd: root, encoding, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
    if (result.error || result.status !== 0) fail('GIT_SOURCE_INSPECTION_FAILED', args.join(' '))
    return result.stdout
  }
  if (String(run(['rev-parse', 'HEAD'])).trim() !== sourceRevision || String(run(['status', '--porcelain=v1', '--untracked-files=all'])).trim() !== '') fail('SOURCE_CHECKOUT_NOT_FROZEN')
  const bytes = run(['ls-tree', '-r', '-z', '--full-tree', sourceRevision], null)
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail('SOURCE_IDENTITY_FAILED')
  return bytes
}

function assertIntentBase(intent, profile, intentRef, intentSha256) {
  const exact = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceSha256', 'sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef', 'migrationManifestSha256', 'previousRevision', 'deadlineAt'].sort()
  if (intent?.baselineIntentRef) { exact.push('baselineIntentRef'); exact.sort(); assertImmutableRef(intent.baselineIntentRef, profile.artifact.releaseBucket, ['receipts']) }
  if (intent?.principalOnlyFenceRef) {
    exact.push('principalOnlyFenceRef')
    exact.sort()
    assertImmutableRef(intent.principalOnlyFenceRef, profile.artifact.releaseBucket,
      ['receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE'])
  }
  if (intent?.principalOnlyRecovery) { exact.push('principalOnlyRecovery'); exact.sort() }
  if (Object.hasOwn(intent ?? {}, 'openswxWorkerRef')) {
    if (profile.application.id !== 'ai-pdm') fail('OPENSWX_OWNER_MISMATCH')
    exact.push('openswxWorkerRef'); exact.sort(); assertOpenSwxWorkerRef(intent.openswxWorkerRef)
  }
  if (!intent || JSON.stringify(Object.keys(intent).sort()) !== JSON.stringify(exact) || intent.schemaVersion !== profile.schemas.releaseIntent || intent.ownerApplicationId !== profile.application.id || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(intent.releaseId ?? '') || !H40.test(intent.sourceRevision ?? '') || !H64.test(intent.sourceSha256 ?? '') || !H64.test(intent.migrationManifestSha256 ?? '') || !intent.previousRevision || intent.previousRevision === 'latest' || !Number.isFinite(Date.parse(intent.deadlineAt)) || Date.parse(intent.deadlineAt) <= Date.now()) fail('RELEASE_INTENT_INVALID')
  assertPrincipalOnlyRecoveryBinding(intent, profile.artifact.releaseBucket)
  if (intentRef.uri.split('/')[2] !== profile.artifact.releaseBucket || intentRef.sha256 !== intentSha256) fail('RELEASE_INTENT_REF_INVALID')
  for (const name of ['sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef']) {
    const ref = intent[name]
    if (!ref || ref.uri?.split('/')[2] !== profile.artifact.releaseBucket || !ref.uri?.startsWith(`gs://${profile.artifact.releaseBucket}/receipts/`) || !H64.test(ref.sha256 ?? '')) fail('RELEASE_INTENT_REF_INVALID', name)
  }
  return intent
}

function acceptedStatus(value, statuses) {
  return value && statuses.includes(value.status) && value.releaseAuthority === true && value.evidenceScope !== 'LOCAL_SYNTHETIC'
}

function assertInfraEvidence(value, profile, sourceRevision, foundation) {
  if (value?.schemaVersion === 'jenfu.dev012.app-infra-reuse-receipt.v1') {
    const core = { ...value }
    delete core.receiptSha256
    if (value.ownerApplicationId !== profile.application.id || value.projectId !== profile.target.projectId || value.region !== profile.target.region
      || value.sourceRevision !== sourceRevision || value.status !== 'APPLIED' || value.releaseAuthority !== true || value.evidenceScope !== 'PRODUCTION_PROVIDER_REUSE'
      || value.mutationProfile !== 'APP_INFRA_REUSE' || value.reuseBasis !== 'APPLICATION_SOURCE_ONLY_NO_INFRA_EXECUTABLE_INPUT_CHANGE'
      || value.foundationManifestSha256 !== foundation?.foundationManifestSha256
      || !H40.test(value.reusedSourceRevision ?? '') || value.reusedSourceRevision === sourceRevision
      || value.receiptSha256 !== sha256(canonicalize(core))
      || !value.reusedInfraReceiptRef?.uri?.startsWith(`gs://${profile.artifact.releaseBucket}/receipts/`)
      || !H64.test(value.reusedInfraReceiptRef.sha256 ?? '')
      || !value.migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`)
      || !value.controllerImageDigest?.includes('@sha256:')) fail('APP_INFRA_REUSE_RECEIPT_INVALID')
  } else if (value?.sourceRevision && value.sourceRevision !== sourceRevision) fail('PREREQUISITE_SOURCE_MISMATCH', 'infra')
  return value
}

export function assertControlledEnvironmentAuthority({ intent, profile, values, runtime, previousControlledEnvironment = null }) {
  const rules = profile.environment?.controlledValues ?? {}
  const controlledEnvironment = Object.fromEntries(Object.keys(rules).sort().map((name) => [name, runtime.plainEnvironment?.[name]]))
  const sequencePreviousEnvironment = previousControlledEnvironment ?? values.readiness?.previousControlledEnvironment ?? null
  const changedNames = sequencePreviousEnvironment
    ? Object.keys(rules).filter((name) => sequencePreviousEnvironment[name] !== controlledEnvironment[name])
    : Object.entries(rules).filter(([name, rule]) => controlledEnvironment[name] !== rule.defaultValue).map(([name]) => name)
  const routine = values.readiness?.schemaVersion === 'jenfu.dev012.routine-owner-readiness.v1'
  if (routine) {
    if (!intent.baselineIntentRef
      || values.authorization?.schemaVersion !== 'jenfu.dev012.routine-owner-authorization.v1'
      || values.authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEPLOY_PRODUCTION'
      || values.authorization.ownerApplicationId !== profile.application.id || values.readiness.ownerApplicationId !== profile.application.id
      || values.authorization.sourceRevision !== intent.sourceRevision || values.readiness.sourceRevision !== intent.sourceRevision
      || values.authorization.releaseId !== intent.releaseId || values.readiness.releaseId !== intent.releaseId
      || canonicalize(values.authorization.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)
      || canonicalize(values.readiness.baselineIntentRef) !== canonicalize(intent.baselineIntentRef)
      || values.authorization.previousRevision !== intent.previousRevision || values.readiness.previousRevision !== intent.previousRevision
      || (previousControlledEnvironment && changedNames.length !== 0)) fail('CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID')
    return
  }
  if (changedNames.length === 0) return
  const transition = values.readiness?.transition
  const predecessor = transition?.predecessorReceiptRef
  let expectedSequenceStep = null
  try { expectedSequenceStep = dev013L4SequenceStep(profile.application.id, transition, sequencePreviousEnvironment, controlledEnvironment) } catch {}
  if (values.authorization?.schemaVersion !== 'jenfu.dev013.l4-owner-transition-authorization.v1' || values.authorization.authorizationBasis !== 'OPERATOR_INVOKED_DEV013_L4'
    || values.readiness?.schemaVersion !== 'jenfu.dev013.l4-owner-transition-readiness.v2' || values.readiness.devId !== 'DEV-013' || values.readiness.slice !== '013-R1'
    || values.authorization.ownerApplicationId !== profile.application.id || values.readiness.ownerApplicationId !== profile.application.id
    || values.authorization.sourceRevision !== intent.sourceRevision || values.readiness.sourceRevision !== intent.sourceRevision || values.authorization.releaseId !== intent.releaseId || values.readiness.releaseId !== intent.releaseId
    || canonicalize(values.readiness.controlledEnvironment) !== canonicalize(controlledEnvironment)
    || canonicalize(values.readiness.sequenceStep) !== canonicalize(expectedSequenceStep)
    || values.readiness.sequenceRoot?.schemaVersion !== 'jenfu.dev013.l4-sequence-root.v2'
    || !Object.hasOwn(rules, transition?.field) || transition.to !== controlledEnvironment[transition.field] || (transition.from !== null && !rules[transition.field].allowedValues.includes(transition.from)) || !rules[transition.field].allowedValues.includes(transition.to) || transition.from === transition.to
    || !['guard', 'activate', 'advance', 'rollback'].includes(transition.action)
    || (sequencePreviousEnvironment && (changedNames.length !== 1 || transition.field !== changedNames[0] || transition.from !== sequencePreviousEnvironment[transition.field]))
    || (transition.action === 'guard' && (transition.from !== null || transition.to !== rules[transition.field].defaultValue))
    || !predecessor || canonicalize(Object.keys(predecessor).sort()) !== canonicalize(['sha256', 'uri']) || typeof predecessor.uri !== 'string' || predecessor.uri.length < 8 || !H64.test(predecessor.sha256 ?? '')) fail('CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID')
}

function revisionControlledEnvironment(profile, revision) {
  const app = revision?.containers?.find((row) => row.name === profile.runtime.containerName)
  const plain = Object.fromEntries((app?.env ?? []).filter((row) => typeof row.value === 'string').map((row) => [row.name, row.value]))
  return Object.fromEntries(Object.keys(profile.environment?.controlledValues ?? {}).sort().map((name) => [name, plain[name] ?? null]))
}

export function assertPreparePrerequisites({ intent, profile, values }) {
  const revision = values.sourceLock.sourceRevision ?? values.sourceLock.headRevision ?? values.sourceLock.head
  const clean = values.sourceLock.clean ?? values.sourceLock.workingTree?.isClean
  if (!acceptedStatus(values.sourceLock, ['PASS', 'SOURCE_FROZEN']) || revision !== intent.sourceRevision || clean !== true) fail('SOURCE_LOCK_NOT_RELEASE_AUTHORITY')
  for (const name of ['authorization', 'readiness']) {
    const value = values[name]
    if (!acceptedStatus(value, ['PASS', 'READY']) || value.environment !== 'production' || value.remainingHumanAction !== 0 || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) fail('PREPARE_PREREQUISITE_INVALID', name)
  }
  for (const name of ['foundation', 'infra', 'runtimeConfig']) if (!acceptedStatus(values[name], ['PASS', 'APPLIED', 'VERIFIED'])) fail('PREPARE_PREREQUISITE_INVALID', name)
  const project = (value) => value.projectId ?? value.targetProjectId
  if ([values.readiness, values.foundation, values.infra, values.runtimeConfig].some((value) => project(value) !== profile.target.projectId)) fail('PREPARE_TARGET_MISMATCH')
  assertInfraEvidence(values.infra, profile, intent.sourceRevision, values.foundation)
  const runtime = values.runtimeConfig.runtimeConfig ?? values.runtimeConfig
  assertRuntimeConfig(profile, runtime)
  assertControlledEnvironmentAuthority({ intent, profile, values, runtime })
  const migrationRunnerDigest = values.infra.migrationRunnerDigest ?? values.infra.artifacts?.migrationRunnerDigest
  if (!migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`)) fail('MIGRATION_RUNNER_PROVENANCE_MISSING')
  let productionData = null
  if (profile.productionData?.required === true) {
    productionData = {
      productionDataRef: assertImmutableRef(values.readiness.productionDataRef, profile.artifact.releaseBucket, [profile.productionData.dataObjectPrefix]),
      firstPrincipalBootstrapRef: assertImmutableRef(values.readiness.firstPrincipalBootstrapRef, profile.artifact.releaseBucket, [profile.productionData.bootstrapObjectPrefix]),
    }
  }
  return { runtimeConfig: runtime, migrationRunnerDigest, productionData }
}

function assertStage(value, profile, intent, stage) {
  if (value?.schemaVersion !== 'jenfu.dev012.stage-receipt.v1' || value.ownerApplicationId !== profile.application.id || value.sourceRevision !== intent.sourceRevision || value.stage !== stage || value.status !== 'PASS') fail('STAGE_RECEIPT_INVALID', stage)
  const core = { ...value }
  delete core.receiptSha256
  if (value.receiptSha256 !== sha256(canonicalize(core))) fail('STAGE_RECEIPT_HASH_INVALID', stage)
  return value
}

async function readNamedJson(transport, uri, profile, expectedSha256 = null, prefixes = ['receipts']) {
  const readback = await transport.readBytes(uri, { prefixes, expectedSha256 })
  let value
  try { value = JSON.parse(readback.bytes.toString('utf8')) } catch { fail('GCS_JSON_INVALID') }
  if (readback.ref.uri.split('/')[2] !== profile.artifact.releaseBucket) fail('OWNER_BUCKET_MISMATCH')
  return { ...readback, value }
}

async function optionalNamedJson(transport, uri, profile, prefixes = ['receipts']) {
  try { return await readNamedJson(transport, uri, profile, null, prefixes) } catch (error) { if (error?.code === 'MISSING') return null; throw error }
}

async function readStage(transport, paths, profile, intent, stage) {
  const result = await readNamedJson(transport, paths[stage], profile)
  assertStage(result.value, profile, intent, stage)
  return result
}

async function writeStage(transport, paths, profile, intent, stage, previousReceiptRef, facts) {
  const value = stageReceipt({ profile, intent, stage, previousReceiptRef, facts, observedAt: transport.now() })
  const result = await transport.putJson(paths[stage], value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  return { ...result, value }
}

function dataCutoverCleanupTransport(transport, profile) {
  const missing = (error) => {
    if (error?.code !== 'MISSING') throw error
    const translated = new Error('MIGRATION_GCS_METADATA_FAILED:404')
    translated.code = 'MIGRATION_GCS_METADATA_FAILED'
    throw translated
  }
  return {
    now: transport.now,
    readJsonByUri: async (uri, _config, prefix) => {
      try { return await readNamedJson(transport, uri, profile, null, [prefix]) } catch (error) { return missing(error) }
    },
    readJson: (reference, _config, prefix) => readNamedJson(transport, reference.uri, profile, reference.sha256, [prefix]),
    readRawObject: async (uri, _config, prefix) => {
      try {
        const result = await transport.readBytes(uri, { prefixes: [prefix] })
        return { bytes: result.bytes, generation: String(result.metadata.generation) }
      } catch (error) { return missing(error) }
    },
    deleteGcsObject: ({ uri, expectedBucket, expectedPrefix, expectedGeneration }) => transport.deleteBytes(uri, { bucket: expectedBucket, prefix: expectedPrefix, expectedGeneration }),
    publishJson: async (uri, _config, prefix, value) => {
      const result = await transport.putJson(uri, value, { bucket: profile.artifact.releaseBucket, prefix })
      return { ...result, value }
    },
  }
}

function dataCutoverGateEnabled(profile) {
  return profile.dataCutover?.gateMode === 'CUTOVER_OR_LIVE_AUTHORITY'
}

export async function readDataCutoverEvidence({ transport, profile, intent, readiness, dataCutoverConfig }) {
  if (!dataCutoverGateEnabled(profile)) return null
  if (!dataCutoverConfig) fail('DATA_CUTOVER_CONFIG_REQUIRED')
  const handoffInput = readiness?.dataCutoverHandoffRef ?? null
  const completionInput = readiness?.dataCutoverCompletionRef ?? null
  if (Boolean(handoffInput) === Boolean(completionInput)) fail('DATA_CUTOVER_AUTHORITY_REF_INVALID')
  if (completionInput) {
    const completionRef = assertImmutableRef(completionInput, profile.artifact.releaseBucket, ['receipts'])
    const completionResult = await readNamedJson(transport, completionRef.uri, profile, completionRef.sha256, ['receipts'])
    const completion = assertPostLiveCleanupReceipt(completionResult.value, dataCutoverConfig)
    const completedIntent = { releaseId: completion.releaseId, sourceRevision: completion.sourceRevision }
    const [completedHandoff, terminalResult] = await Promise.all([
      readDataCutoverEvidence({ transport, profile: { ...profile, dataCutover: { ...profile.dataCutover, gateMode: 'CUTOVER_OR_LIVE_AUTHORITY' } }, intent: completedIntent, readiness: { dataCutoverHandoffRef: completion.handoffReceiptRef }, dataCutoverConfig }),
      readNamedJson(transport, completion.terminalReceiptRef.uri, profile, completion.terminalReceiptRef.sha256, ['receipts']),
    ])
    const terminal = assertOwnerTerminalReceipt(terminalResult.value, completedIntent)
    if (completion.handoffReceiptSha256 !== completedHandoff.handoffSha256 || completion.terminalReceiptSha256 !== terminal.receiptSha256) fail('DATA_CUTOVER_COMPLETION_JOIN_INVALID')
    return { completionReceiptRef: completionResult.ref, handoffReceiptRef: completedHandoff.handoffReceiptRef, sourceCatalogSha256: completedHandoff.sourceCatalogSha256, targetReconciliationSha256: completedHandoff.targetReconciliationSha256, tableCount: completedHandoff.tableCount, expectedRowCount: completedHandoff.expectedRowCount, taskResourcesRemoved: true, rawBundleDeleted: true, legacyAccessFenced: true, status: 'NEUTRAL_AUTHORITY_LIVE' }
  }
  const handoffRef = assertImmutableRef(handoffInput, profile.artifact.releaseBucket, ['receipts'])
  const handoffResult = await readNamedJson(transport, handoffRef.uri, profile, handoffRef.sha256, ['receipts'])
  const handoff = assertDataCutoverHandoff(handoffResult.value, dataCutoverConfig, { releaseId: intent.releaseId, sourceRevision: intent.sourceRevision })
  const [exportResult, importResult, fenceResult, teardownResult] = await Promise.all([
    readNamedJson(transport, handoff.exportReceiptRef.uri, profile, handoff.exportReceiptRef.sha256, ['source/migration-bundles']),
    readNamedJson(transport, handoff.importReceiptRef.uri, profile, handoff.importReceiptRef.sha256, ['receipts']),
    readNamedJson(transport, handoff.fenceReceiptRef.uri, profile, handoff.fenceReceiptRef.sha256, ['receipts']),
    readNamedJson(transport, handoff.teardownReceiptRef.uri, profile, handoff.teardownReceiptRef.sha256, ['receipts']),
  ])
  const exported = assertDataCutoverExportReceipt(exportResult.value, dataCutoverConfig, { releaseId: intent.releaseId, sourceRevision: intent.sourceRevision })
  const imported = assertDataCutoverImportReceipt(importResult.value, dataCutoverConfig, { releaseId: intent.releaseId, sourceRevision: intent.sourceRevision })
  assertDataCutoverFenceReceipt(fenceResult.value, dataCutoverConfig, { releaseId: intent.releaseId, sourceRevision: intent.sourceRevision })
  const teardown = assertDataCutoverTeardownReceipt(teardownResult.value, dataCutoverConfig, { releaseId: intent.releaseId, sourceRevision: intent.sourceRevision })
  if (handoff.sourceCatalogSha256 !== exported.sourceCatalogSha256 || handoff.bundleSha256 !== exported.bundleSha256 || exported.bundleSha256 !== imported.bundleSha256 || handoff.sourceCatalogSha256 !== imported.sourceCatalogSha256 || handoff.migrationPlanSha256 !== imported.migrationPlanSha256 || handoff.targetReconciliationSha256 !== sha256(canonicalize(imported.tableReceipts)) || handoff.tableCount !== imported.tableCount || handoff.expectedRowCount !== imported.expectedRowCount || exported.sourceRowCount !== imported.expectedRowCount || handoff.teardownReceiptSha256 !== teardown.receiptSha256) fail('DATA_CUTOVER_HANDOFF_JOIN_INVALID')
  return { handoffReceiptRef: handoffResult.ref, handoffSha256: handoff.handoffSha256, exportReceiptRef: exportResult.ref, importReceiptRef: importResult.ref, fenceReceiptRef: fenceResult.ref, teardownReceiptRef: teardownResult.ref, sourceCatalogSha256: handoff.sourceCatalogSha256, targetReconciliationSha256: handoff.targetReconciliationSha256, tableCount: handoff.tableCount, expectedRowCount: handoff.expectedRowCount, taskResourcesRemoved: true, legacyAccessFenced: true, status: handoff.status }
}

function assertDeployment(value, profile, intent, intentRef, intentSha256) {
  if (value?.schemaVersion !== profile.schemas.deploymentCapsule || value.ownerApplicationId !== profile.application.id || value.releaseIntentRef?.uri !== intentRef.uri || value.releaseIntentRef?.sha256 !== intentRef.sha256 || value.releaseIntentSha256 !== intentSha256 || value.sourceRevision !== intent.sourceRevision || value.deadlineAt !== intent.deadlineAt) fail('DEPLOYMENT_CAPSULE_JOIN_INVALID')
  if (!value.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`) || !value.migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`)) fail('DEPLOYMENT_ARTIFACT_INVALID')
  if (!H64.test(value.sourceObject?.sha256 ?? '') || !/^[1-9][0-9]*$/u.test(String(value.sourceObject?.generation ?? '')) || typeof value.sourceObject?.crc32c !== 'string') fail('DEPLOYMENT_SOURCE_INVALID')
  for (const name of ['migrationBundleRef', 'buildReceiptRef', 'provenanceReceiptRef', 'sbomReceiptRef', 'scanReceiptRef']) if (!value[name]?.uri || !H64.test(value[name]?.sha256 ?? '')) fail('DEPLOYMENT_EVIDENCE_REF_INVALID', name)
  if (intent.openswxWorkerRef) {
    if (canonicalize(value.openswxWorker?.descriptorRef) !== canonicalize(intent.openswxWorkerRef)
      || !/^asia-east1-docker.pkg.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-openswx-worker@sha256:[a-f0-9]{64}$/u.test(value.openswxWorker?.image ?? '')) fail('OPENSWX_DEPLOYMENT_JOIN_INVALID')
    assertOpenSwxWorkerRef(value.openswxWorker.workerBuildRef)
  } else if (value.openswxWorker) fail('OPENSWX_DEPLOYMENT_JOIN_INVALID')
  if (profile.productionData?.required === true) {
    assertImmutableRef(value.productionDataRef, profile.artifact.releaseBucket, [profile.productionData.dataObjectPrefix])
    assertImmutableRef(value.firstPrincipalBootstrapRef, profile.artifact.releaseBucket, [profile.productionData.bootstrapObjectPrefix])
  }
  if (dataCutoverGateEnabled(profile)) {
    const refs = [value.dataCutoverHandoffRef, value.dataCutoverCompletionRef].filter(Boolean)
    if (refs.length !== 1) fail('DATA_CUTOVER_DEPLOYMENT_AUTHORITY_INVALID')
    assertImmutableRef(refs[0], profile.artifact.releaseBucket, ['receipts'])
  }
  return value
}

async function readDeployment(transport, paths, profile, intent, intentRef, intentSha256) {
  const result = await readNamedJson(transport, paths.deployment, profile)
  assertDeployment(result.value, profile, intent, intentRef, intentSha256)
  return result
}

async function readIntentAndPaths({ transport, profile, capsuleRef, capsuleSha256, validateIntent }) {
  const intentRef = { uri: capsuleRef, sha256: capsuleSha256 }
  const result = await transport.readJson(intentRef, profile.artifact.releaseBucket, ['receipts'])
  if (validateIntent) validateIntent(result.value, profile)
  const intent = assertIntentBase(result.value, profile, intentRef, capsuleSha256)
  return { intent, intentRef, intentReadback: result, paths: releasePaths(profile, intent, capsuleSha256) }
}

export function assertStaleControlSafeToSupersede({ current, profile, intent, ownerRun, service, activeRevision, now, candidate = null, nextState = null }) {
  const expected = ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision', 'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256'].sort()
  if (!current || JSON.stringify(Object.keys(current).sort()) !== JSON.stringify(expected)) fail('CONTROL_HEAD_INVALID')
  const { controlSha256, ...core } = current
  const runPrefix = `https://api.github.com/repos/${profile.application.repository}/actions/runs/`
  const runId = current.ownerRunRef?.startsWith(runPrefix) ? current.ownerRunRef.slice(runPrefix.length) : ''
  if (controlSha256 !== sha256(canonicalize(core)) || current.schemaVersion !== 'jenfu.dev012.owner-control-head.v1'
    || current.ownerApplicationId !== profile.application.id || current.service !== profile.target.serviceName
    || current.controlBucket !== profile.artifact.releaseBucket || !H64.test(current.inputFingerprint ?? '')
    || !H40.test(current.sourceRevision ?? '') || !H64.test(current.sourceLockSha256 ?? '')
    || !CONTROL_STATES.has(current.state) || !/^[1-9][0-9]*$/u.test(runId)
    || !Number.isFinite(Date.parse(current.leaseExpiresAt)) || !Number.isFinite(Date.parse(now))) fail('CONTROL_HEAD_INVALID')
  if (Date.parse(current.leaseExpiresAt) >= Date.parse(now)
    || ownerRun?.id !== runId || ownerRun.status !== 'completed' || !ownerRun.conclusion
    || ownerRun.event !== 'workflow_dispatch' || ownerRun.headSha !== current.sourceRevision
    || current.previousRevision !== principalOnlyRollbackRevision(intent) || activeRevision !== intent.previousRevision) fail('CONTROL_HEAD_TAKEOVER_UNSAFE')
  const configuredTags = (service?.traffic ?? []).filter((row) => row?.tag)
  const observedTags = (service?.trafficStatuses ?? []).filter((row) => row?.tag)
  if (nextState === 'CANDIDATE_CREATED') {
    const matches = (row) => row.tag === candidate?.tag && row.revision === candidate?.candidateRevision && Number(row.percent ?? 0) === 0
    if (!candidate?.tag || !candidate?.candidateRevision || configuredTags.length !== 1 || observedTags.length !== 1
      || !configuredTags.every(matches) || !observedTags.every(matches)) fail('CONTROL_HEAD_TAKEOVER_UNSAFE')
  } else if (configuredTags.length !== 0 || observedTags.length !== 0) fail('CONTROL_HEAD_TAKEOVER_UNSAFE')
  return true
}

async function writeControl({ transport, paths, profile, intent, fingerprint, candidate, state, result = null, environment }) {
  const current = await optionalNamedJson(transport, paths.control, profile, ['control'])
  if (current && current.value.inputFingerprint !== fingerprint && current.value.state !== 'FINALIZED') {
    const [ownerRun, service] = await Promise.all([
      transport.readOwnerRun(profile, current.value.ownerRunRef),
      transport.getService(profile),
    ])
    transport.assertServiceSettled(service, 'CONTROL_HEAD_TAKEOVER_UNSAFE')
    assertStaleControlSafeToSupersede({ current: current.value, profile, intent, ownerRun, service, activeRevision: transport.effectiveRevision(service), now: transport.now(), candidate, nextState: state })
  }
  if (current?.value.inputFingerprint === fingerprint) {
    const transitions = {
      CANDIDATE_CREATED: ['ENTRYPOINT_CONFIGURED', 'FINALIZED'],
      ENTRYPOINT_CONFIGURED: ['CANDIDATE_VERIFIED', 'FINALIZED'],
      CANDIDATE_VERIFIED: ['GO', 'FINALIZED'],
      GO: ['ACTIVE', 'FINALIZED'],
      ACTIVE: ['CANONICAL_VERIFIED', 'FINALIZED'],
      CANONICAL_VERIFIED: ['FINALIZED'],
      ABORT_REQUESTED: ['FINALIZED'],
      FINALIZED: [],
    }
    if (current.value.state === state && current.value.result === result) return current
    if (!(transitions[current.value.state] ?? []).includes(state)) fail('CONTROL_HEAD_TRANSITION_DENIED', `${current.value.state}->${state}`)
  }
  const expires = new Date(Math.min(Date.parse(intent.deadlineAt), Date.now() + 120_000)).toISOString()
  const core = {
    schemaVersion: 'jenfu.dev012.owner-control-head.v1', inputFingerprint: fingerprint, ownerApplicationId: profile.application.id,
    service: profile.target.serviceName, controlBucket: profile.artifact.releaseBucket, releaseId: intent.releaseId,
    sourceRevision: intent.sourceRevision, sourceLockSha256: intent.sourceLockRef.sha256, candidateRevision: candidate?.candidateRevision ?? null,
    previousRevision: principalOnlyRollbackRevision(intent), ownerRunRef: `https://api.github.com/repos/${profile.application.repository}/actions/runs/${environment.GITHUB_RUN_ID}`,
    leaseExpiresAt: expires, deadlineAt: intent.deadlineAt, state, result,
  }
  const value = { ...core, controlSha256: sha256(canonicalize(core)) }
  return transport.putJson(paths.control, value, { bucket: profile.artifact.releaseBucket, prefix: 'control', ifGenerationMatch: current ? String(current.metadata.generation) : '0' })
}

function publicBuildReceipt(build) {
  return { name: build.name, id: build.id, projectId: build.projectId, status: build.status, serviceAccount: build.serviceAccount, createTime: build.createTime, startTime: build.startTime, finishTime: build.finishTime, sourceProvenance: build.sourceProvenance, results: build.results, options: build.options }
}
function currentExecutionDeadline(intent) {
  if (!Number.isFinite(Date.parse(intent.deadlineAt)) || Date.now() >= Date.parse(intent.deadlineAt)) fail('OWNER_DEADLINE')
}
function sealRepairEvidence(value) { return { ...value, receiptSha256: sha256(canonicalize(value)) } }
async function publishRepairEvidence({ transport, uri, value, profile, intent }) {
  const bytes = Buffer.from(`${canonicalize(value)}\n`)
  const verify = row => {
    if (!Buffer.isBuffer(row?.bytes) || !row.bytes.equals(bytes) || row.ref?.uri !== uri || row.ref?.sha256 !== sha256(bytes)
      || !/^[1-9][0-9]*$/u.test(String(row.metadata?.generation ?? ''))) fail('REPAIR_PUBLICATION_CONFLICT')
    return { ...row, value: JSON.parse(row.bytes.toString('utf8')) }
  }
  currentExecutionDeadline(intent)
  try { return verify(await transport.putJson(uri, value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts', ifGenerationMatch: '0' })) }
  catch (error) {
    if (!['OUTCOME_UNKNOWN', 'GCS_WRITE_READBACK_MISMATCH'].includes(error.code)) throw error
    for (let attempt = 0; attempt < 3; attempt++) {
      currentExecutionDeadline(intent)
      try { return verify(await transport.readBytes(uri, { prefixes: ['receipts'], expectedSha256: sha256(bytes) })) }
      catch (readError) { if (['REPAIR_PUBLICATION_CONFLICT', 'GCS_READBACK_HASH_MISMATCH'].includes(readError.code)) throw readError }
    }
    fail('REPAIR_PUBLICATION_RECOVERY_REQUIRED')
  }
}
async function readRepairStageBasis({ worker, intent, intentRef, profile, transport, readWorkerSource, buildMigrationBundle, environment, currentDeployment = null, currentPrepare = null }) {
  currentExecutionDeadline(intent)
  const result = await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    const descriptor = worker ? await worker.resolve(intent, profile) : null
    if (!descriptor || !isPausedAppRepair(descriptor.value)) return null
    if (profile.application.id !== 'ai-pdm' || intent.principalOnlyRecovery || intent.principalOnlyFenceRef || typeof buildMigrationBundle !== 'function') fail('REPAIR_CAPSULE_INVALID')
    const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readWorkerSource)
    const original = assertAiPdmHistoricalMigration(evidence.artifact.servingGraph.original)
    const current = await buildMigrationBundle(intent.sourceRevision)
    const checked = assertAiPdmMigrationBundleBytes({ bytes: current.bytes, bundle: current.bundle, sourceRevision: intent.sourceRevision })
    if (checked.bundleSha256 !== current.bundleSha256 || current.bundle.manifestSha256 !== intent.migrationManifestSha256) fail('MIGRATION_MANIFEST_MISMATCH')
    const profilePath = 'config/release/dev117-ai-pdm-independent-production-v3.json'
    const files = new Map([[profilePath, readWorkerSource(profilePath, intent.sourceRevision)], ...current.bundle.entries.map(row => [row.path, readWorkerSource(row.path, intent.sourceRevision)])])
    const content = assertAiPdmMigrationContent({ files, bundle: current.bundle, sourceRevision: intent.sourceRevision, deadlineAt: intent.deadlineAt })
    const frozenProfile = JSON.parse(files.get(profilePath).toString('utf8'))
    if (canonicalize(frozenProfile.migrations) !== canonicalize(profile.migrations)) fail('REPAIR_PROFILE_MISMATCH')
    const migrationMode = assertAiPdmRepairMigrationMode(original.content, content)
    const equivalent = migrationMode === 'HISTORICAL_EVIDENCE_REUSED' ? assertAiPdmMigrationEquivalent(original.content, content) : null
    if (currentDeployment) {
      if (!currentPrepare) fail('REPAIR_PREBUILD_PREPARE_REQUIRED')
      if (migrationMode === 'FORWARD_APPLIED' && Object.hasOwn(currentPrepare.value.facts, 'migrationReusePrerequisiteRef')) fail('REPAIR_PREREQUISITE_MISMATCH')
      const observed = await transport.readOwnerSourceProof({ profile, sourceRevision: intent.sourceRevision, refs: { prepare: currentPrepare.ref, migrate: null, terminal: null }, verifyProvider: true })
      if (observed.proof.disposition !== 'build_only' || observed.proof.releaseAuthority !== false || observed.proof.migrationVerified !== false || observed.provider?.status !== 'BUILD_IMAGE_VERIFIED'
        || Object.hasOwn(observed.proof, 'migrate') || Object.hasOwn(observed.proof, 'terminal')) fail('REPAIR_PREBUILD_SOURCE_INVALID')
      const graph = await readAiPdmObservationInputs(observed.proof)
      if (graph.migrate !== null || graph.terminal !== null || graph.original !== null || graph.repair || canonicalize(graph.intentRef) !== canonicalize(intentRef) || canonicalize(graph.chain.deployment.ref) !== canonicalize(currentDeployment.ref)) fail('REPAIR_PREBUILD_SOURCE_INVALID')
      assertAiPdmMigrationEquivalent(content, graph.content)
      if (assertAiPdmRepairMigrationMode(original.content, graph.content) !== migrationMode) fail('REPAIR_PREBUILD_BUNDLE_INVALID')
      if (graph.bundle.ref.sha256 !== current.bundleSha256 || canonicalize(graph.bundle.ref) !== canonicalize(currentDeployment.value.migrationBundleRef)) fail('REPAIR_PREBUILD_BUNDLE_INVALID')
    }
    currentExecutionDeadline(intent)
    return { descriptor, baseline: evidence.pausedBaseline, original, current, content, equivalent, migrationMode,
      prerequisite: equivalent ? sealRepairEvidence({ schemaVersion: 'aipdm.paused-app-repair-migration-prerequisite.v1', ownerApplicationId: 'ai-pdm', releaseId: intent.releaseId, sourceRevision: intent.sourceRevision,
        releaseCapsuleRef: intentRef, sourceLockRef: intent.sourceLockRef, workerDescriptorRef: intent.openswxWorkerRef, pausedBaselineRef: descriptor.value.pausedBaselineRef,
        servingCapsuleRef: evidence.pausedBaseline.servingApp.capsuleRef, historicalCapsuleRef: original.intentRef, historicalDeploymentRef: original.deploymentRef, historicalCandidateRef: original.candidateRef,
        historicalMigrationReceiptRef: original.migrationRef, historicalMigrationBundleRef: original.bundleRef, currentMigrationBundleSha256: current.bundleSha256,
        currentMigrationManifestSha256: current.bundle.manifestSha256, historicalMigrationManifestSha256: original.bundle.manifestSha256, ...equivalent, entryCount: 32, baselineCount: 15,
        historicalLedgerCount: original.migration.ledgerCount, historicalCompletedAt: original.migration.completedAt, status: 'KNOWN_HISTORICAL_PREREQUISITE', databaseLiveState: 'UNKNOWN', migrationExecutionPolicy: 'NO_JOB_SUBMISSION',
        observedAt: transport.now(), deadlineAt: intent.deadlineAt, actor: profile.identities.verifier, ownerRunRef: `https://api.github.com/repos/${profile.application.repository}/actions/runs/${environment.GITHUB_RUN_ID}` }) : null }
  })
  currentExecutionDeadline(intent)
  return result
}
async function repairPrerequisite({ basis, transport, paths, profile, intent, intentRef, publish = false }) {
  if (!basis || basis.migrationMode === 'FORWARD_APPLIED') return null
  const uri = `gs://${profile.artifact.releaseBucket}/${paths.root}/migration-reuse-prerequisite.json`
  let row = await optionalNamedJson(transport, uri, profile)
  if (!row && publish) {
    currentExecutionDeadline(intent)
    row = await publishRepairEvidence({ transport, uri, value: basis.prerequisite, profile, intent })
  }
  if (!row) fail('REPAIR_PREREQUISITE_REQUIRED')
  assertPausedMigrationPrerequisite(row.value, { intent, intentRef, descriptor: basis.descriptor.value, descriptorRef: intent.openswxWorkerRef })
  const dynamic = new Set(['observedAt', 'ownerRunRef', 'receiptSha256'])
  for (const key of Object.keys(basis.prerequisite)) if (!dynamic.has(key) && canonicalize(row.value[key]) !== canonicalize(basis.prerequisite[key])) fail('REPAIR_PREREQUISITE_MISMATCH')
  currentExecutionDeadline(intent)
  return row
}
async function validateRepairMigration({ basis, transport, paths, profile, intent, intentRef, deployment, receipt }) {
  if (basis.migrationMode === 'FORWARD_APPLIED') {
    assertMigration(receipt.value, 'ai-pdm', { ledger: profile.migrations.ledger, migrationBootstrap: true, principalContractLedgerFloor: 20 }, intent.sourceRevision, intent.migrationManifestSha256)
    if (receipt.value.ledgerCount !== basis.current.bundle.entries.length || receipt.value.baselineCount !== basis.current.bundle.baselineCount ||
        Date.parse(receipt.value.completedAt) > Date.parse(intent.deadlineAt)) fail('MIGRATION_RECEIPT_INVALID')
    const bundle = await transport.readBytes(deployment.value.migrationBundleRef.uri, { prefixes: ['source/migration-bundles'], expectedSha256: deployment.value.migrationBundleRef.sha256 })
    assertAiPdmMigrationBundleBytes({ bytes: bundle.bytes, bundle: basis.current.bundle, sourceRevision: intent.sourceRevision, ref: deployment.value.migrationBundleRef })
    currentExecutionDeadline(intent)
    return receipt
  }
  const prerequisite = await repairPrerequisite({ basis, transport, paths, profile, intent, intentRef })
  assertPausedMigrationAssociation(receipt.value, { intent, intentRef, prerequisite: prerequisite.value, prerequisiteRef: prerequisite.ref, deployment: deployment.value, deploymentRef: deployment.ref })
  currentExecutionDeadline(intent)
  return receipt
}

export async function executeOwnerStage({ stage, capsuleRef, capsuleSha256, profile, profileSha256 = profile?.contractSha256, transport, environment = process.env, validateIntent, createSourceIdentity, createSourceArchive, buildMigrationBundle, readWorkerSource, dataCutoverConfig = null, migrationOnlyWorkflowPath = null }) {
  if (!STAGES.has(stage)) fail('STAGE_DENIED')
  const { intent, intentRef, paths } = await readIntentAndPaths({ transport, profile, capsuleRef, capsuleSha256, validateIntent })
  if (profile.application.id === 'ai-pdm') {
    const originalTransport = transport
    const asyncMethods = ['readJson', 'readBytes', 'readOwnerSourceProof', 'readOwnerRun', 'getService', 'getRevision', 'request', 'putJson', 'putBytes', 'createBuild', 'readArtifactImage', 'waitArtifactEvidence', 'runMigrationJob', 'createCandidate', 'configureEntrypoint', 'runAuthenticatedSmoke', 'setTraffic', 'activatePrincipalOnly', 'removeCandidateTag', 'rollbackTraffic', 'restoreEntrypoint', 'prepareProductionStorage']
    const reads = new Set(['readJson', 'readBytes', 'readOwnerSourceProof', 'readOwnerRun', 'getService', 'getRevision'])
    transport = { ...originalTransport }
    for (const name of asyncMethods) if (typeof originalTransport[name] === 'function') transport[name] = async (...args) => {
      currentExecutionDeadline(intent)
      const result = reads.has(name) ? await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), () => originalTransport[name](...args)) : await originalTransport[name](...args)
      currentExecutionDeadline(intent)
      return result
    }
  }
  const worker = intent.openswxWorkerRef ? createOpenSwxOwnerRelease({ transport, readSource: readWorkerSource, environment }) : null
  if (worker && typeof readWorkerSource !== 'function') fail('OPENSWX_FROZEN_SOURCE_READER_REQUIRED')
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, releaseIntentSha256: capsuleSha256 }))

  if (stage !== 'rollback') {
    assertProtectedGitHubContext(profile, intent, environment, { stage, migrationOnlyWorkflowPath })
    // An aborted capsule is terminal even while its original deadline is valid.
    // Reject before candidate/entry/traffic mutations; rollback remains available.
    const completed = await optionalNamedJson(transport, paths.terminal, profile)
    if (completed) {
      assertStage(completed.value, profile, intent, 'terminal')
      if (completed.value.releaseId !== intent.releaseId) fail('STAGE_RECEIPT_INVALID', 'terminal')
      if (completed.value.facts?.result === 'PRE_ACTIVATION_ABORTED') fail('RELEASE_ALREADY_PREACTIVATION_ABORTED')
    }
  }

  if (stage === 'prepare') {
    const service = await transport.getService(profile)
    transport.assertServiceSettled(service, 'PREPARE_BASELINE_MISMATCH')
    if (transport.effectiveRevision(service) !== intent.previousRevision) fail('PREPARE_BASELINE_MISMATCH')
    // A cached prepare receipt cannot certify a stopped conversion or ordinary abort.
    const continuation = intent.baselineIntentRef
      ? await readPreActivationAbortContinuation({ profile, transport, baselineIntentRef: intent.baselineIntentRef, service }) : null
    if (continuation && ((continuation.kind !== 'PRINCIPAL_ORDINARY_ABORT' && !assertPrincipalOnlyRecoveryBinding(intent, profile.artifact.releaseBucket))
      || continuation.currentActiveRevision !== intent.previousRevision)) fail('PREPARE_BASELINE_MISMATCH')
    const existing = await optionalNamedJson(transport, paths.prepare, profile)
    if (existing) {
      assertStage(existing.value, profile, intent, 'prepare')
      if (dataCutoverGateEnabled(profile) && !['DATA_READY_FOR_CANDIDATE', 'NEUTRAL_AUTHORITY_LIVE'].includes(existing.value.facts?.dataCutover?.status)) fail('DATA_CUTOVER_PREPARE_RECEIPT_INVALID')
    }
    const names = { sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }
    const entries = await Promise.all(Object.entries(names).map(async ([name, field]) => [name, (await transport.readJson(intent[field], profile.artifact.releaseBucket, ['receipts'])).value]))
    const values = Object.fromEntries(entries)
    if (continuation?.kind === 'PRINCIPAL_ORDINARY_ABORT') {
      if (Object.hasOwn(intent, 'principalOnlyRecovery') || Object.hasOwn(intent, 'principalOnlyFenceRef')
        || canonicalize(values.authorization.preActivationAbortBasis) !== canonicalize(continuation.authorityBasis)
        || canonicalize(values.readiness.preActivationAbortBasis) !== canonicalize(continuation.authorityBasis)
        || (existing && canonicalize(existing.value.facts.preActivationAbortBasis) !== canonicalize(continuation.authorityBasis))) fail('PREPARE_BASELINE_MISMATCH')
    } else if (values.authorization.preActivationAbortBasis || values.readiness.preActivationAbortBasis) fail('PREPARE_BASELINE_MISMATCH')
    const derived = assertPreparePrerequisites({ intent, profile, values })
    if (worker) await worker.prepare({ intent, profile, runtimeConfig: derived.runtimeConfig })
    else assertWorkerRuntimeJoin(derived.runtimeConfig, intent)
    const dataCutover = await readDataCutoverEvidence({ transport, profile, intent, readiness: values.readiness, dataCutoverConfig })
    const repair = await readRepairStageBasis({ worker, intent, intentRef, profile, transport, readWorkerSource, buildMigrationBundle, environment })
    if (repair && dataCutover?.status !== 'NEUTRAL_AUTHORITY_LIVE') fail('REPAIR_DATA_CUTOVER_BASIS_INVALID')
    const recovery = assertPrincipalOnlyRecoveryBinding(intent, profile.artifact.releaseBucket)
    if (recovery) {
      const [proof, revision] = await Promise.all([
        transport.readJson(recovery.receiptRef, profile.artifact.releaseBucket, ['receipts']),
        transport.getRevision(profile, recovery.revision),
      ])
      assertPrincipalOnlyRecoveryReadback({ intent, profile, proof: proof.value, service, revision })
    }
    if (Object.keys(profile.environment?.controlledValues ?? {}).length > 0) {
      const repair = intent.baselineIntentRef
        ? await readPrincipalOnlyRepairBaseline({ profile, transport, baselineIntentRef: intent.baselineIntentRef, service }) : null
      if (repair && (!recovery || repair.activeRevision !== intent.previousRevision
        || service.scaling?.scalingMode !== 'MANUAL' || ![0, '0'].includes(service.scaling?.manualInstanceCount)
        || canonicalize(repair.runtimeConfig) !== canonicalize(derived.runtimeConfig))) fail('PRINCIPAL_ONLY_FORWARD_REPAIR_MISMATCH')
      const previousControlledEnvironment = repair
        ? Object.fromEntries(Object.keys(profile.environment.controlledValues).map((name) => [name, repair.runtimeConfig.plainEnvironment[name]]))
        : revisionControlledEnvironment(profile, await transport.getRevision(profile, intent.previousRevision))
      assertControlledEnvironmentAuthority({ intent, profile, values, runtime: derived.runtimeConfig, previousControlledEnvironment })
    }
    const prerequisite = await repairPrerequisite({ basis: repair, transport, paths, profile, intent, intentRef, publish: true })
    if (existing) {
      // A build-only run can pause before storage provisioning. Revalidate
      // prerequisites and the live baseline before reusing its prepare receipt.
      if (canonicalize(existing.value.facts.entrypointBaseline) !== canonicalize(transport.entrypointSnapshot(service))) fail('PREPARE_BASELINE_MISMATCH')
      if (prerequisite && canonicalize(existing.value.facts.migrationReusePrerequisiteRef) !== canonicalize(prerequisite.ref)) fail('REPAIR_PREREQUISITE_MISMATCH')
      if (repair?.migrationMode === 'FORWARD_APPLIED' && Object.hasOwn(existing.value.facts, 'migrationReusePrerequisiteRef')) fail('REPAIR_PREREQUISITE_MISMATCH')
      return existing
    }
    return writeStage(transport, paths, profile, intent, 'prepare', null, { prerequisiteRefs: Object.fromEntries(Object.entries(names).map(([name, field]) => [name, intent[field]])), previousRevision: intent.previousRevision, ...(continuation?.kind === 'PRINCIPAL_ORDINARY_ABORT' ? { preActivationAbortBasis: continuation.authorityBasis } : {}), ...(recovery ? { principalOnlyRecovery: recovery } : {}), ...(prerequisite ? { migrationReusePrerequisiteRef: prerequisite.ref } : {}), runtimeServiceAccount: derived.runtimeConfig.runtimeServiceAccount, migrationRunnerDigest: derived.migrationRunnerDigest, ...(derived.productionData ?? {}), ...(dataCutover ? { dataCutover } : {}), entrypointBaseline: transport.entrypointSnapshot(service), remainingHumanAction: 0 })
  }

  if (stage === 'build') {
    const prepare = await readStage(transport, paths, profile, intent, 'prepare')
    const existing = await optionalNamedJson(transport, paths.deployment, profile)
    if (existing) assertDeployment(existing.value, profile, intent, intentRef, capsuleSha256)
    const repair = await readRepairStageBasis({ worker, intent, intentRef, profile, transport, readWorkerSource, buildMigrationBundle, environment, currentDeployment: existing, currentPrepare: prepare })
    if (repair && prepare.value.facts.dataCutover?.status !== 'NEUTRAL_AUTHORITY_LIVE') fail('REPAIR_DATA_CUTOVER_BASIS_INVALID')
    const prerequisite = await repairPrerequisite({ basis: repair, transport, paths, profile, intent, intentRef })
    if (prerequisite && canonicalize(prepare.value.facts.migrationReusePrerequisiteRef) !== canonicalize(prerequisite.ref)) fail('REPAIR_PREREQUISITE_MISMATCH')
    if (repair?.migrationMode === 'FORWARD_APPLIED' && Object.hasOwn(prepare.value.facts, 'migrationReusePrerequisiteRef')) fail('REPAIR_PREREQUISITE_MISMATCH')
    if (existing) {
      assertDeployment(existing.value, profile, intent, intentRef, capsuleSha256)
      await readStage(transport, paths, profile, intent, 'build')
      if (worker) {
        const frozen = await worker.build({ intent, profile, sourceObject: { ref: existing.value.sourceObject } })
        if (canonicalize(frozen) !== canonicalize(existing.value.openswxWorker)) fail('OPENSWX_DEPLOYMENT_JOIN_INVALID')
      }
      if (repair) await worker.beforeBuild({ intent, profile })
      return existing
    }
    const sourceIdentityBytes = await createSourceIdentity(intent.sourceRevision)
    if (!Buffer.isBuffer(sourceIdentityBytes) || sha256(sourceIdentityBytes) !== intent.sourceSha256) fail('SOURCE_IDENTITY_HASH_MISMATCH')
    const sourceBytes = await createSourceArchive(intent.sourceRevision)
    if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0) fail('SOURCE_ARCHIVE_FAILED')
    if (repair) {
      const archived = parseAiPdmMigrationArchive({ bytes: sourceBytes, sourceRevision: intent.sourceRevision, bundle: repair.current.bundle, deadlineAt: intent.deadlineAt })
      assertAiPdmMigrationEquivalent(repair.content, archived)
      if (assertAiPdmRepairMigrationMode(repair.original.content, archived) !== repair.migrationMode) fail('REPAIR_PREBUILD_BUNDLE_INVALID')
    }
    const sourceUri = `gs://${profile.artifact.releaseBucket}/source/releases/${intent.releaseId}/${capsuleSha256}/source.tar.gz`
    const sourceArchive = gzipSync(sourceBytes, { level: 9 })
    const source = await transport.putBytes(sourceUri, sourceArchive, { bucket: profile.artifact.releaseBucket, prefix: 'source', contentType: 'application/gzip' })
    const migration = repair?.current ?? await buildMigrationBundle(intent.sourceRevision)
    if (migration.bundle?.manifestSha256 !== intent.migrationManifestSha256 || sha256(migration.bytes) !== migration.bundleSha256) fail('MIGRATION_MANIFEST_MISMATCH')
    const bundleUri = `gs://${profile.artifact.releaseBucket}/${profile.artifact.migrationBundlePrefix}/${intent.sourceRevision}/${migration.bundle.manifestSha256}.json`
    const bundle = await transport.putBytes(bundleUri, migration.bytes, { bucket: profile.artifact.releaseBucket, prefix: profile.artifact.migrationBundlePrefix, contentType: 'application/json' })
    if (repair) await worker.beforeBuild({ intent, profile })
    const build = await transport.createBuild({ profile, intent, sourceObject: source, deadlineAt: intent.deadlineAt })
    const artifact = await transport.readArtifactImage(profile, build.artifactDigest)
    const analysis = await transport.waitArtifactEvidence({ profile, sourceRevision: intent.sourceRevision, artifactDigest: build.artifactDigest, deadlineAt: intent.deadlineAt })
    const provenance = await transport.putJson(paths.provenance, { schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: intent.sourceRevision, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c }, artifactDigest: build.artifactDigest, cloudBuild: publicBuildReceipt(build.build), artifactRegistry: artifact, status: 'PASS' }, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const sbom = await transport.putJson(paths.sbom, { schemaVersion: 'jenfu.dev012.sbom-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: intent.sourceRevision, artifactDigest: build.artifactDigest, ...analysis.sbomExport, occurrenceNames: analysis.sbomOccurrenceNames, status: 'PASS' }, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const scan = await transport.putJson(paths.scan, { schemaVersion: 'jenfu.dev012.scan-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: intent.sourceRevision, artifactDigest: build.artifactDigest, buildOccurrenceNames: analysis.buildOccurrenceNames, discoveryOccurrenceNames: analysis.discoveryOccurrenceNames, vulnerabilityCount: analysis.vulnerabilityCount, blockingVulnerabilityCount: analysis.blockingVulnerabilityCount, ...(analysis.rawHighOrCriticalVulnerabilityCount !== undefined ? { rawHighOrCriticalVulnerabilityCount: analysis.rawHighOrCriticalVulnerabilityCount, notAffectedAssessments: analysis.notAffectedAssessments } : {}), maximumAllowedSeverity: profile.build.maximumAllowedSeverity, observedAt: analysis.observedAt, status: 'PASS' }, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const workerBuild = worker ? await worker.build({ intent, profile, sourceObject: source }) : null
    const buildStage = await writeStage(transport, paths, profile, intent, 'build', prepare.ref, { artifactDigest: build.artifactDigest, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c }, migrationBundleRef: bundle.ref, provenanceReceiptRef: provenance.ref, sbomReceiptRef: sbom.ref, scanReceiptRef: scan.ref })
    const cutoverDeploymentAuthority = !dataCutoverGateEnabled(profile) ? {} : prepare.value.facts.dataCutover.status === 'DATA_READY_FOR_CANDIDATE' ? { dataCutoverHandoffRef: prepare.value.facts.dataCutover.handoffReceiptRef } : { dataCutoverCompletionRef: prepare.value.facts.dataCutover.completionReceiptRef }
    const deployment = { schemaVersion: profile.schemas.deploymentCapsule, ownerApplicationId: profile.application.id, releaseIntentRef: intentRef, releaseIntentSha256: capsuleSha256, sourceRevision: intent.sourceRevision, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c }, artifactDigest: build.artifactDigest, migrationBundleRef: bundle.ref, migrationRunnerDigest: prepare.value.facts.migrationRunnerDigest, ...(profile.productionData?.required === true ? { productionDataRef: prepare.value.facts.productionDataRef, firstPrincipalBootstrapRef: prepare.value.facts.firstPrincipalBootstrapRef } : {}), ...cutoverDeploymentAuthority, buildReceiptRef: buildStage.ref, provenanceReceiptRef: provenance.ref, sbomReceiptRef: sbom.ref, scanReceiptRef: scan.ref, deadlineAt: intent.deadlineAt }
    if (workerBuild) deployment.openswxWorker = workerBuild
    assertDeployment(deployment, profile, intent, intentRef, capsuleSha256)
    return transport.putJson(paths.deployment, deployment, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }

  if (stage === 'migrate') {
    const deployment = await readDeployment(transport, paths, profile, intent, intentRef, capsuleSha256)
    const repair = await readRepairStageBasis({ worker, intent, intentRef, profile, transport, readWorkerSource, buildMigrationBundle, environment })
    const existing = await optionalNamedJson(transport, paths.migrate, profile)
    if (repair?.migrationMode === 'HISTORICAL_EVIDENCE_REUSED') {
      const prerequisite = await repairPrerequisite({ basis: repair, transport, paths, profile, intent, intentRef })
      const bundle = await transport.readBytes(deployment.value.migrationBundleRef.uri, { prefixes: ['source/migration-bundles'], expectedSha256: deployment.value.migrationBundleRef.sha256 })
      assertAiPdmMigrationBundleBytes({ bytes: bundle.bytes, bundle: repair.current.bundle, sourceRevision: intent.sourceRevision, ref: deployment.value.migrationBundleRef })
      let receipt = existing
      if (!receipt) {
        currentExecutionDeadline(intent)
        const value = sealRepairEvidence({ schemaVersion: 'aipdm.paused-app-repair-migration-association.v1', ownerApplicationId: 'ai-pdm', releaseId: intent.releaseId, sourceRevision: intent.sourceRevision,
          releaseCapsuleRef: intentRef, deploymentCapsuleRef: deployment.ref, prerequisiteRef: prerequisite.ref, migrationBundleRef: deployment.value.migrationBundleRef, historicalMigrationReceiptRef: prerequisite.value.historicalMigrationReceiptRef,
          manifestSha256: intent.migrationManifestSha256, status: 'HISTORICAL_EVIDENCE_REUSED', evidenceScope: 'MIGRATION_INPUT_EQUIVALENT_NO_EXECUTION', databaseDisposition: 'HISTORICAL_EVIDENCE_REUSED',
          migrationJobSubmitted: false, migrationJobSubmissions: 0, currentDatabaseReadPerformed: false, databaseLiveState: 'UNKNOWN', observedAt: transport.now(), deadlineAt: intent.deadlineAt,
          actor: profile.identities.deployer, ownerRunRef: `https://api.github.com/repos/${profile.application.repository}/actions/runs/${environment.GITHUB_RUN_ID}` })
        assertPausedMigrationAssociation(value, { intent, intentRef, prerequisite: prerequisite.value, prerequisiteRef: prerequisite.ref, deployment: deployment.value, deploymentRef: deployment.ref })
        receipt = await publishRepairEvidence({ transport, uri: paths.migrate, value, profile, intent })
      }
      return validateRepairMigration({ basis: repair, transport, paths, profile, intent, intentRef, deployment, receipt })
    }
    if (repair) {
      const prepare = await readStage(transport, paths, profile, intent, 'prepare')
      if (Object.hasOwn(prepare.value.facts, 'migrationReusePrerequisiteRef')) fail('REPAIR_PREREQUISITE_MISMATCH')
      const bundle = await transport.readBytes(deployment.value.migrationBundleRef.uri, { prefixes: ['source/migration-bundles'], expectedSha256: deployment.value.migrationBundleRef.sha256 })
      assertAiPdmMigrationBundleBytes({ bytes: bundle.bytes, bundle: repair.current.bundle, sourceRevision: intent.sourceRevision, ref: deployment.value.migrationBundleRef })
    }
    if (!existing) await transport.runMigrationJob({ profile, deployment: deployment.value,
      principalOnlyFenceRef: intent.principalOnlyFenceRef ?? null,
      outputUri: paths.migrate, deadlineAt: intent.deadlineAt })
    const receipt = existing ?? await readNamedJson(transport, paths.migrate, profile)
    if (repair) return validateRepairMigration({ basis: repair, transport, paths, profile, intent, intentRef, deployment, receipt })
    if (receipt.value?.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || receipt.value.ownerApplicationId !== profile.application.id || receipt.value.sourceRevision !== intent.sourceRevision || receipt.value.manifestSha256 !== intent.migrationManifestSha256 || receipt.value.status !== 'PASS' || receipt.value.boundaryStatus !== 'PASS' || (profile.productionData?.required === true && receipt.value.productionData?.status !== 'PASS')) fail('MIGRATION_RECEIPT_INVALID')
    return receipt
  }

  if (stage === 'candidate') {
    const deployment = await readDeployment(transport, paths, profile, intent, intentRef, capsuleSha256)
    const migration = await readNamedJson(transport, paths.migrate, profile)
    const repair = await readRepairStageBasis({ worker, intent, intentRef, profile, transport, readWorkerSource, buildMigrationBundle, environment })
    if (repair) await validateRepairMigration({ basis: repair, transport, paths, profile, intent, intentRef, deployment, receipt: migration })
    else if (migration.value?.status !== 'PASS' || migration.value?.sourceRevision !== intent.sourceRevision) fail('MIGRATION_RECEIPT_INVALID')
    const runtimeReceipt = await transport.readJson(intent.runtimeConfigRef, profile.artifact.releaseBucket, ['receipts'])
    const runtimeConfig = runtimeReceipt.value.runtimeConfig ?? runtimeReceipt.value
    if (worker) assertWorkerRuntimeJoin(runtimeConfig, intent, (await worker.resolve(intent, profile)).value)
    else assertWorkerRuntimeJoin(runtimeConfig, intent)
    if (worker) await worker.candidate({ intent, profile, deployment: deployment.value })
    const candidate = await transport.createCandidate({ profile, artifactDigest: deployment.value.artifactDigest, runtimeConfig, fingerprint, deadlineAt: intent.deadlineAt, principalOnly: Boolean(intent.principalOnlyRecovery) })
    if (candidate.previousRevision !== intent.previousRevision) fail('CANDIDATE_BASELINE_MISMATCH')
    const result = await writeStage(transport, paths, profile, intent, 'candidate', migration.ref, { deploymentCapsuleRef: deployment.ref, migrationReceiptRef: migration.ref, ...candidate })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate, state: 'CANDIDATE_CREATED', environment })
    return result
  }

  if (stage === 'entrypoint') {
    if (!H64.test(profileSha256 ?? '')) fail('OWNER_PROFILE_SHA256_INVALID')
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    const entrypoint = await transport.configureEntrypoint({ profile, candidate: candidate.value.facts, previousRevision: intent.previousRevision, deadlineAt: intent.deadlineAt })
    const result = await writeStage(transport, paths, profile, intent, 'entrypoint', candidate.ref, { profileSha256, canonicalOrigin: profile.target.canonicalOrigin, ...entrypoint })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'ENTRYPOINT_CONFIGURED', environment })
    return result
  }

  if (stage === 'verify') {
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    const repair = await readRepairStageBasis({ worker, intent, intentRef, profile, transport, readWorkerSource, buildMigrationBundle, environment })
    if (repair) await validateRepairMigration({ basis: repair, transport, paths, profile, intent, intentRef,
      deployment: await readDeployment(transport, paths, profile, intent, intentRef, capsuleSha256), receipt: await readNamedJson(transport, paths.migrate, profile) })
    const entrypoint = await readStage(transport, paths, profile, intent, 'entrypoint')
    if (entrypoint.value.previousReceiptRef?.uri !== candidate.ref.uri || entrypoint.value.previousReceiptRef?.sha256 !== candidate.ref.sha256 || entrypoint.value.facts.profileSha256 !== profileSha256) fail('ENTRYPOINT_RECEIPT_JOIN_INVALID')
    const service = await transport.getService(profile)
    transport.assertCanonicalEntrypoint(profile, service)
    if (intent.principalOnlyRecovery && (service.scaling?.scalingMode !== 'MANUAL' || ![0, '0'].includes(service.scaling?.manualInstanceCount))) fail('PRINCIPAL_ONLY_QUIESCENCE_LOST')
    const tag = service.trafficStatuses?.find((row) => row.tag === candidate.value.facts.tag)
    if (tag?.revision !== candidate.value.facts.candidateRevision || Number(tag.percent ?? 0) !== 0 || !candidateTagUriMatches(service, candidate.value.facts, tag.uri) || transport.effectiveRevision(service) !== intent.previousRevision) fail('CANDIDATE_TAG_READBACK_MISMATCH')
    const revision = await transport.getRevision(profile, candidate.value.facts.candidateRevision)
    const runtimeReceipt = await transport.readJson(intent.runtimeConfigRef, profile.artifact.releaseBucket, ['receipts'])
    const runtimeConfig = runtimeReceipt.value.runtimeConfig ?? runtimeReceipt.value
    transport.assertRevisionReady(profile, revision, candidate.value.facts.artifactDigest, candidate.value.facts.cloudSqlProxyResolvedImage, { runtimeConfig, origin: candidate.value.facts.tagUri })
    const readiness = await readNamedJson(transport, intent.readinessReceiptRef.uri, profile, intent.readinessReceiptRef.sha256, ['receipts'])
    const dataCutover = await readDataCutoverEvidence({ transport, profile, intent, readiness: readiness.value, dataCutoverConfig })
    const smoke = await transport.runInternalCandidateSmoke({ profile, origin: candidate.value.facts.tagUri, candidateTag: candidate.value.facts.tag, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, deadlineAt: intent.deadlineAt, environment })
    const result = await writeStage(transport, paths, profile, intent, 'verify', entrypoint.ref, { candidateReceiptRef: candidate.ref, entrypointReceiptRef: entrypoint.ref, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, tagUri: candidate.value.facts.tagUri, providerTagUri: tag.uri, ...(dataCutover ? { dataCutover } : {}), smoke, sideEffects: profile.sideEffects })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'CANDIDATE_VERIFIED', environment })
    return result
  }

  if (stage === 'decision') {
    const verify = await readStage(transport, paths, profile, intent, 'verify')
    if (verify.value.facts.smoke?.status !== 'PASS' || Object.values(profile.sideEffects).some((value) => !String(value).startsWith('DISABLED'))) fail('MACHINE_DECISION_NO_GO')
    const result = await writeStage(transport, paths, profile, intent, 'decision', verify.ref, { decision: 'GO', candidateRevision: verify.value.facts.candidateRevision, artifactDigest: verify.value.facts.artifactDigest, verifyReceiptRef: verify.ref, remainingHumanAction: 0 })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: verify.value.facts, state: 'GO', environment })
    return result
  }

  if (stage === 'activate') {
    const decision = await readStage(transport, paths, profile, intent, 'decision')
    if (decision.value.facts.decision !== 'GO') fail('MACHINE_DECISION_NO_GO')
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    if (worker) await worker.beforeActivate({ intent, profile })
    const service = intent.principalOnlyRecovery
      ? await transport.activatePrincipalOnly({ profile, oldRevision: intent.previousRevision,
        recovery: intent.principalOnlyRecovery, candidateRevision: candidate.value.facts.candidateRevision,
        candidateTag: candidate.value.facts.tag, deadlineAt: intent.deadlineAt })
      : await transport.setTraffic({ profile, revision: candidate.value.facts.candidateRevision, candidateTag: candidate.value.facts.tag, deadlineAt: intent.deadlineAt })
    transport.assertCanonicalEntrypoint(profile, service)
    const result = await writeStage(transport, paths, profile, intent, 'activate', decision.ref, { decisionReceiptRef: decision.ref, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, effectiveRevision: transport.effectiveRevision(service), serviceEtag: service.etag, canonicalOrigin: profile.target.canonicalOrigin, ingress: service.ingress, defaultUriDisabled: service.defaultUriDisabled === true, invokerIamDisabled: service.invokerIamDisabled === true })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'ACTIVE', environment })
    return result
  }

  if (stage === 'canonical') {
    const activate = await readStage(transport, paths, profile, intent, 'activate')
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    const service = await transport.getService(profile)
    if (transport.effectiveRevision(service) !== candidate.value.facts.candidateRevision) fail('CANONICAL_REVISION_MISMATCH')
    transport.assertCanonicalEntrypoint(profile, service)
    const revision = await transport.getRevision(profile, candidate.value.facts.candidateRevision)
    const runtimeReceipt = await transport.readJson(intent.runtimeConfigRef, profile.artifact.releaseBucket, ['receipts'])
    const runtimeConfig = runtimeReceipt.value.runtimeConfig ?? runtimeReceipt.value
    try { transport.assertRevisionReady(profile, revision, candidate.value.facts.artifactDigest, candidate.value.facts.cloudSqlProxyResolvedImage, { runtimeConfig, origin: candidate.value.facts.tagUri }) } catch { fail('CANONICAL_ARTIFACT_MISMATCH') }
    const smoke = await transport.runAuthenticatedSmoke({ profile, origin: profile.target.canonicalOrigin, environment })
    const result = await writeStage(transport, paths, profile, intent, 'canonical', activate.ref, { activationReceiptRef: activate.ref, origin: profile.target.canonicalOrigin, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, smoke })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'CANONICAL_VERIFIED', environment })
    return result
  }

  if (stage === 'finalize') {
    const canonical = await readStage(transport, paths, profile, intent, 'canonical')
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    const repair = await readRepairStageBasis({ worker, intent, intentRef, profile, transport, readWorkerSource, buildMigrationBundle, environment })
    const migration = repair ? await readNamedJson(transport, paths.migrate, profile) : null
    if (repair) await validateRepairMigration({ basis: repair, transport, paths, profile, intent, intentRef, deployment: await readDeployment(transport, paths, profile, intent, intentRef, capsuleSha256), receipt: migration })
    const workerFinalization = worker ? await worker.finalize({ intent, profile, canonical, migrationMode: repair?.migrationMode ?? null }) : null
    await transport.removeCandidateTag({ profile, tag: candidate.value.facts.tag, candidateRevision: candidate.value.facts.candidateRevision, expectedActiveRevision: candidate.value.facts.candidateRevision, deadlineAt: intent.deadlineAt })
    const finalized = await writeStage(transport, paths, profile, intent, 'finalize', canonical.ref, { canonicalReceiptRef: canonical.ref, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, temporaryCandidateTags: 0, result: 'RELEASED', ...(workerFinalization ? { openswxWorker: workerFinalization } : {}) })
    const conformance = buildDev014ConsumerConformance({ appId: profile.application.id, sourceRevision: intent.sourceRevision, artifactDigest: candidate.value.facts.artifactDigest.split('@').at(-1), failSeekingEvidenceRef: canonical.ref.uri, verifiedAt: transport.now() })
    const conformanceResult = await transport.putJson(`gs://${profile.artifact.releaseBucket}/${paths.root}/dev014-consumer-conformance.json`, conformance, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const readiness = await readNamedJson(transport, intent.readinessReceiptRef.uri, profile, intent.readinessReceiptRef.sha256, ['receipts'])
    const dev013Transition = dev013TerminalTransitionFact(readiness.value, intent)
    const terminal = stageReceipt({ profile, intent, stage: 'terminal', previousReceiptRef: finalized.ref, facts: { result: 'RELEASED', candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, databaseDisposition: repair?.migrationMode ?? 'FORWARD_APPLIED', ...(repair?.migrationMode === 'HISTORICAL_EVIDENCE_REUSED' ? { migrationEvidenceRef: migration.ref } : {}), remainingHumanAction: 0, dev014ConsumerConformanceRef: conformanceResult.ref, ...(workerFinalization ? { openswxWorker: workerFinalization } : {}), ...(dev013Transition ? { dev013Transition } : {}) }, observedAt: transport.now() })
    const terminalResult = await transport.putJson(paths.terminal, terminal, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const prepare = await readStage(transport, paths, profile, intent, 'prepare')
    if (profile.dataCutover?.postLiveCleanupRequired === true && prepare.value.facts?.dataCutover?.status === 'DATA_READY_FOR_CANDIDATE') {
      if (!dataCutoverConfig) fail('DATA_CUTOVER_CONFIG_REQUIRED')
      const cleanup = await executeProviderStage({
        stage: 'post-live-cleanup', config: dataCutoverConfig, releaseId: intent.releaseId, sourceRevision: intent.sourceRevision,
        input: { handoffReceiptRef: prepare.value.facts?.dataCutover?.handoffReceiptRef, terminalReceiptRef: terminalResult.ref },
        transport: dataCutoverCleanupTransport(transport, profile),
      })
      assertPostLiveCleanupReceipt(cleanup.value, dataCutoverConfig, { releaseId: intent.releaseId, sourceRevision: intent.sourceRevision })
    }
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'FINALIZED', result: 'RELEASED', environment })
    return terminalResult
  }

  const candidate = await optionalNamedJson(transport, paths.candidate, profile)
  const entrypoint = await optionalNamedJson(transport, paths.entrypoint, profile)
  const prepare = await optionalNamedJson(transport, paths.prepare, profile)
  const migration = await optionalNamedJson(transport, paths.migrate, profile)
  const repair = await readRepairStageBasis({ worker, intent, intentRef, profile, transport, readWorkerSource, buildMigrationBundle, environment })
  if (migration && repair) await validateRepairMigration({ basis: repair, transport, paths, profile, intent, intentRef, deployment: await readDeployment(transport, paths, profile, intent, intentRef, capsuleSha256), receipt: migration })
  else if (migration && (migration.value?.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || migration.value.ownerApplicationId !== profile.application.id || migration.value.sourceRevision !== intent.sourceRevision || migration.value.manifestSha256 !== intent.migrationManifestSha256 || migration.value.status !== 'PASS' || migration.value.boundaryStatus !== 'PASS' || (profile.productionData?.required === true && migration.value.productionData?.status !== 'PASS'))) fail('MIGRATION_RECEIPT_INVALID')
  const databaseDisposition = migration ? repair?.migrationMode ?? 'FORWARD_APPLIED' : 'NOT_APPLIED'
  const migrationEvidence = migration && repair?.migrationMode === 'HISTORICAL_EVIDENCE_REUSED' ? { migrationEvidenceRef: migration.ref } : {}
  if (candidate) assertStage(candidate.value, profile, intent, 'candidate')
  const workerRecovery = worker ? await worker.recover({ intent, profile, candidate }) : null
  const rollbackRevision = principalOnlyRollbackRevision(intent)
  let disposition = 'PRE_ACTIVATION_ABORTED'
  let entrypointRecovery = { changed: false, result: 'NOT_REQUIRED' }
  if (candidate) {
    assertStage(candidate.value, profile, intent, 'candidate')
    const facts = candidate.value.facts
    let service = await transport.getService(profile)
    if (transport.effectiveRevision(service) === facts.candidateRevision) {
      service = await transport.setTraffic({ profile, revision: rollbackRevision, deadlineAt: intent.deadlineAt })
      disposition = 'ROLLED_BACK'
    }
    const activeRevision = transport.effectiveRevision(service)
    // The abort controller may have restored maintenance before this workflow.
    if (intent.principalOnlyRecovery && activeRevision === rollbackRevision) disposition = 'ROLLED_BACK'
    if (![intent.previousRevision, rollbackRevision].includes(activeRevision)) fail('PRINCIPAL_ONLY_ROLLBACK_BASELINE_INVALID')
    await transport.removeCandidateTag({ profile, tag: facts.tag, candidateRevision: facts.candidateRevision, expectedActiveRevision: activeRevision, deadlineAt: intent.deadlineAt })
    if (!prepare) fail('PREPARE_RECEIPT_MISSING')
    assertStage(prepare.value, profile, intent, 'prepare')
    if (entrypoint) assertStage(entrypoint.value, profile, intent, 'entrypoint')
    const restored = await transport.restoreEntrypoint({ profile, baseline: prepare.value.facts.entrypointBaseline, deadlineAt: intent.deadlineAt })
    entrypointRecovery = { changed: restored.changed, result: restored.changed ? 'BASELINE_RESTORED' : 'BASELINE_ALREADY_ACTIVE', providerOperationRef: restored.providerOperationRef }
  } else {
    const deterministicRevision = `${profile.target.serviceName}-${fingerprint.slice(0, 12)}`
    const deterministicTag = `candidate-${fingerprint.slice(0, 12)}`
    const service = await transport.getService(profile)
    const tagged = service.trafficStatuses?.find((row) => row.tag === deterministicTag)
    if (tagged) {
      const activeRevision = transport.effectiveRevision(service)
      if (![intent.previousRevision, rollbackRevision].includes(activeRevision)) fail('PRINCIPAL_ONLY_ROLLBACK_BASELINE_INVALID')
      await transport.removeCandidateTag({ profile, tag: deterministicTag, candidateRevision: deterministicRevision, expectedActiveRevision: activeRevision, deadlineAt: intent.deadlineAt })
    }
  }
  const rollback = await writeStage(transport, paths, profile, intent, 'rollback', entrypoint?.ref ?? candidate?.ref ?? migration?.ref ?? null, { result: disposition, previousRevision: rollbackRevision, recoveryOrder: ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'], entrypointRecovery, databaseDisposition, ...migrationEvidence, ...(workerRecovery ? { openswxWorker: workerRecovery } : {}) })
  const terminal = stageReceipt({ profile, intent, stage: 'terminal', previousReceiptRef: rollback.ref, facts: { result: disposition, previousRevision: rollbackRevision, entrypointRecovery, databaseDisposition, ...migrationEvidence, ...(workerRecovery ? { openswxWorker: workerRecovery } : {}) }, observedAt: transport.now() })
  const terminalResult = await transport.putJson(paths.terminal, terminal, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  await transport.publishIncident(profile, { correlationId: `${intent.releaseId}-${environment.GITHUB_RUN_ATTEMPT ?? '1'}`, ownerApplicationId: profile.application.id, sourceLockSha256: intent.sourceLockRef.sha256, eventRef: terminalResult.ref, occurredAt: transport.now() })
  await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate?.value?.facts ?? null, state: 'FINALIZED', result: disposition, environment })
  return terminalResult
}
