import { assertUnlinkedProfileCleanupRef, assertUnlinkedProfileCleanupBundleBinding, readUnlinkedProfileCleanupOperation } from './dev121-unlinked-profile-cleanup.mjs'
import { readPrincipalOnlyRepairBaseline } from './dev121-principal-forward-repair.mjs'
import { readPreActivationAbortContinuation } from './dev121-preactivation-abort-continuation.mjs'
import { assertPrincipalOnlyRecoveryBinding, assertReconciledPrincipalAbortBinding } from './dev121-principal-only-release.mjs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { assertRuntimeConfig, buildRuntimeConfig, canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertControlledEnvironmentAuthority, assertPreparePrerequisites } from './dev012-owner-stage-executor.mjs'
import { assertDev013L4Predecessor, dev013L4SequenceStep } from './dev013-l4-transition-sequence.mjs'
import { assertAppliedContinuationRuntimeBinding, assertAppliedMigrationContinuation, assertForwardAppliedMigrationContinuation } from './dev122-applied-migration-continuation.mjs'
import { assertMigrationRunnerSourceCompatibility } from './dev117-migration-runner-source.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u
const STAGES = new Set(['source-freeze', 'runtime-config', 'infra-reuse', 'routine-authority', 'dev013-transition-authority', 'release-intent'])
const ROUTINE_ABORT_CONTINUATIONS = new Set(['PRINCIPAL_ORDINARY_ABORT', 'PROGRAM_ONLY_ABORT', 'PRINCIPAL_FENCED_ABORT_RECONCILED', 'APPLIED_MIGRATION_ABORT'])

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

function exactRef(value, profile) {
  if (!value || Object.keys(value).sort().join(',') !== 'sha256,uri' || !H64.test(value.sha256 ?? '')) fail('PREREQUISITE_REF_INVALID')
  const prefix = `gs://${profile.artifact.releaseBucket}/receipts/`
  if (!value.uri?.startsWith(prefix) || value.uri.includes('..')) fail('PREREQUISITE_REF_INVALID')
  return value
}

export function validateHistoricalBaselineIntent(value, profile, validateIntent) {
  try {
    return validateIntent(value, profile)
  } catch (error) {
    if (error?.code === 'RELEASE_INTENT_INVALID'
      && profile.application?.id === 'ai-pdm'
      && value?.openswxWorkerRef) {
      const ref = value.openswxWorkerRef
      const prefix = `gs://${profile.artifact.releaseBucket}/receipts/dev-122/openswx-worker/`
      if (Object.keys(ref).sort().join(',') !== 'sha256,uri'
        || !H64.test(ref.sha256 ?? '')
        || !ref.uri?.startsWith(prefix)
        || !ref.uri.endsWith('.json')
        || ref.uri.includes('..')) throw error
      const currentShape = structuredClone(value)
      delete currentShape.openswxWorkerRef
      validateIntent(currentShape, profile)
      return value
    }
    const entries = profile.migrations?.entries
    const currentHasDeferred085 = [35, 38, 39].includes(entries?.length)
      && entries[34]?.order === 35
      && entries[34]?.path === 'db/postgres/085_dev121_principal_role_catalog_v7.sql'
      && (entries.length === 35 || [
        '086_dev123_role_policy_editor_v1.sql',
        '087_dev123_role_policy_candidate_validation.sql',
        '088_dev123_recognition_job_authority.sql',
      ].every((name, index) => entries[35 + index]?.order === 36 + index && entries[35 + index]?.path === `db/postgres/${name}`)
        && (entries.length === 38 || (entries[38]?.order === 39 &&
          entries[38]?.path === 'db/postgres/089_dev125_windows_service_devices.sql')))
    if (error?.code !== 'PROGRAM_ONLY_BASELINE_INVALID'
      || profile.application?.id !== 'ai-pdm'
      || !value?.programOnlyBaseline
      || !currentHasDeferred085) throw error
    const historicalProfile = structuredClone(profile)
    historicalProfile.migrations.entries = entries.slice(0, 34)
    return validateIntent(value, historicalProfile)
  }
}

function runGit(root, args, encoding = 'utf8') {
  const result = spawnSync('git', args, { cwd: root, encoding, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  if (result.error || result.status !== 0) fail('SOURCE_GIT_READ_FAILED', args.join(' '))
  return result.stdout
}

function repositorySlug(remote) {
  const match = /(?:github\.com[/:])([^/]+\/[^/]+?)(?:\.git)?$/iu.exec(remote.trim())
  return match?.[1] ?? null
}

export function resolveProtectedReleaseRef({ localBranch, protectedBranch, sourceRevision, remoteRevision }) {
  if ((localBranch !== '' && localBranch !== protectedBranch) ||
      remoteRevision !== sourceRevision || !H40.test(sourceRevision ?? '')) {
    fail('SOURCE_NOT_FROZEN_AT_OFFICIAL_REMOTE')
  }
  return protectedBranch
}

export function readGitAuthority(root, profile) {
  const sourceRevision = String(runGit(root, ['rev-parse', 'HEAD'])).trim()
  const sourceTree = String(runGit(root, ['rev-parse', 'HEAD^{tree}'])).trim()
  const localBranch = String(runGit(root, ['branch', '--show-current'])).trim()
  const status = String(runGit(root, ['status', '--porcelain=v1', '--untracked-files=all'])).trim()
  const remote = String(runGit(root, ['remote', 'get-url', 'origin'])).trim()
  const remoteRows = String(runGit(root, ['ls-remote', '--heads', 'origin', `refs/heads/${profile.application.branch}`])).trim().split(/\s+/u)
  const remoteRevision = remoteRows[0] ?? ''
  // A detached clean checkout of the exact protected remote commit is as
  // reviewable as a local branch named after that ref. Other named branches
  // remain ineligible even when they happen to point at the same commit.
  if (!H40.test(sourceTree) || status !== '' ||
      repositorySlug(remote)?.toLowerCase() !== profile.application.repository.toLowerCase()) {
    fail('SOURCE_NOT_FROZEN_AT_OFFICIAL_REMOTE')
  }
  const branch = resolveProtectedReleaseRef({ localBranch,
    protectedBranch: profile.application.branch, sourceRevision, remoteRevision })
  return { sourceRevision, sourceTree, branch, remoteRevision, clean: true }
}

export function buildSourceFreeze({ profile, releaseId, observedAt, git, sourceIdentityBytes, migrationBundle }) {
  if (!RELEASE_ID.test(releaseId ?? '') || !Number.isFinite(Date.parse(observedAt)) || !git?.clean || git.branch !== profile.application.branch || git.remoteRevision !== git.sourceRevision || !H40.test(git.sourceRevision ?? '') || !H40.test(git.sourceTree ?? '') || !Buffer.isBuffer(sourceIdentityBytes) || sourceIdentityBytes.length === 0 || !H64.test(migrationBundle?.bundle?.manifestSha256 ?? '')) fail('SOURCE_FREEZE_INPUT_INVALID')
  return {
    schemaVersion: 'jenfu.dev012.owner-source-lock.v1',
    ownerApplicationId: profile.application.id,
    repository: profile.application.repository,
    branch: git.branch,
    releaseId,
    sourceRevision: git.sourceRevision,
    sourceTree: git.sourceTree,
    sourceSha256: sha256(sourceIdentityBytes),
    migrationManifestSha256: migrationBundle.bundle.manifestSha256,
    clean: true,
    remoteRef: `refs/heads/${profile.application.branch}`,
    remoteRevision: git.remoteRevision,
    status: 'SOURCE_FROZEN',
    releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND',
    observedAt,
  }
}

export function buildRuntimeConfigReceipt({ profile, releaseId, sourceLock, plainEnvironment, secretVersions, observedAt }) {
  if (!RELEASE_ID.test(releaseId ?? '') || sourceLock?.releaseId !== releaseId || sourceLock?.ownerApplicationId !== profile.application.id || sourceLock?.status !== 'SOURCE_FROZEN' || sourceLock?.releaseAuthority !== true || !sourceLock.clean || !Number.isFinite(Date.parse(observedAt))) fail('SOURCE_LOCK_NOT_RELEASE_AUTHORITY')
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment, secretVersions })
  assertRuntimeConfig(profile, runtimeConfig)
  return {
    schemaVersion: 'jenfu.dev012.owner-runtime-config-receipt.v1',
    ownerApplicationId: profile.application.id,
    projectId: profile.target.projectId,
    releaseId,
    sourceRevision: sourceLock.sourceRevision,
    runtimeConfig,
    status: 'VERIFIED',
    releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND',
    observedAt,
  }
}

function infraRunnerSourceRevision(existingInfra) {
  if (existingInfra?.schemaVersion === 'jenfu.dev012.app-infra-receipt.v1') {
    const revision = existingInfra.reusedSourceRevision ?? existingInfra.sourceRevision
    return H40.test(revision ?? '') ? revision : null
  }
  if (existingInfra?.schemaVersion === 'jenfu.dev012.app-infra-reuse-receipt.v2') {
    return H40.test(existingInfra.reusedSourceRevision ?? '') ? existingInfra.reusedSourceRevision : null
  }
  return null
}

export function assertInfraReuseProviderJob({ profile, existingInfra, job }) {
  const jobName = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations?.jobName}`
  const task = job?.template?.template
  const containers = task?.containers
  const container = Array.isArray(containers) ? containers.find((row) => row?.name === 'migration') : null
  const environmentRows = container?.env
  const environment = Array.isArray(environmentRows) && new Set(environmentRows.map((row) => row?.name)).size === environmentRows.length
    ? Object.fromEntries(environmentRows.map((row) => [row.name, row.value])) : null
  const runnerSourceRevision = infraRunnerSourceRevision(existingInfra)
  if (!profile.migrations?.jobName || !profile.migrations?.serviceAccount || !runnerSourceRevision
    || job?.name !== jobName || !job.uid || !job.etag || job.generation == null || job.observedGeneration == null
    || !Number.isFinite(Date.parse(job.updateTime)) || job.reconciling === true
    || job.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
    || String(job.generation) !== String(job.observedGeneration)
    || job.template?.taskCount !== 1 || job.template?.parallelism !== 1
    || task?.serviceAccount !== profile.migrations.serviceAccount || task?.maxRetries !== 0 || task?.timeout !== '1800s'
    || containers?.length !== 1 || !container || container.image !== existingInfra?.migrationRunnerDigest
    || environment?.PDM_SOURCE_REVISION !== runnerSourceRevision) fail('INFRA_REUSE_PROVIDER_JOB_MISMATCH')
  return {
    name: job.name,
    uid: job.uid,
    generation: String(job.generation),
    etag: job.etag,
    updateTime: job.updateTime,
    migrationRunnerDigest: container.image,
    sourceRevision: environment.PDM_SOURCE_REVISION,
    status: 'READY',
  }
}

export function buildInfraReuseReceipt({ profile, releaseId, sourceLock, foundation, existingInfra, existingInfraRef, providerJob, observedAt }) {
  exactRef(existingInfraRef, profile)
  const core = existingInfra && { ...existingInfra }
  if (core) delete core.receiptSha256
  const ownerPrefix = `${profile.artifact.migrationRunnerUri}@sha256:`
  const controllerPrefix = `${profile.artifact.uri.slice(0, profile.artifact.uri.lastIndexOf('/'))}/`
  const migrationWorkflowRef = `${profile.application.repository}/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/${profile.application.branch}`
  const runnerSourceRevision = infraRunnerSourceRevision(existingInfra)
  if (!RELEASE_ID.test(releaseId ?? '') || sourceLock?.releaseId !== releaseId || sourceLock?.ownerApplicationId !== profile.application.id || sourceLock?.status !== 'SOURCE_FROZEN' || sourceLock.releaseAuthority !== true || !H40.test(sourceLock.sourceRevision ?? '')
    || !['jenfu.dev012.app-infra-receipt.v1', 'jenfu.dev012.app-infra-reuse-receipt.v2'].includes(existingInfra?.schemaVersion) || existingInfra.ownerApplicationId !== profile.application.id || existingInfra.projectId !== profile.target.projectId || existingInfra.region !== profile.target.region
    || existingInfra.status !== 'APPLIED' || existingInfra.releaseAuthority !== true || !['PRODUCTION_PROVIDER', 'PRODUCTION_PROVIDER_REUSE'].includes(existingInfra.evidenceScope) || existingInfra.receiptSha256 !== sha256(canonicalize(core))
    || existingInfra.sourceRevision === sourceLock.sourceRevision || !H40.test(existingInfra.sourceRevision ?? '') || !runnerSourceRevision
    || existingInfra.foundationManifestSha256 !== foundation?.foundationManifestSha256
    || !existingInfra.migrationRunnerDigest?.startsWith(ownerPrefix) || !existingInfra.controllerImageDigest?.startsWith(controllerPrefix) || !existingInfra.controllerImageDigest?.includes('@sha256:')
    || (profile.application.id === 'ai-pdm' && existingInfra.mutationProfile === 'APP_INFRA_AIPDM_PRINCIPAL_MIGRATION_WIF' && !existingInfra.allowedWorkflowRefs?.includes(migrationWorkflowRef))
    || !Number.isFinite(Date.parse(observedAt))) fail('INFRA_REUSE_INPUT_INVALID')
  const providerJobReadback = assertInfraReuseProviderJob({ profile, existingInfra, job: providerJob })
  const value = {
    schemaVersion: 'jenfu.dev012.app-infra-reuse-receipt.v2', ownerApplicationId: profile.application.id,
    projectId: profile.target.projectId, region: profile.target.region, releaseId,
    sourceRevision: sourceLock.sourceRevision, foundationManifestSha256: foundation.foundationManifestSha256,
    reusedInfraReceiptRef: existingInfraRef, reusedSourceRevision: runnerSourceRevision,
    migrationRunnerDigest: existingInfra.migrationRunnerDigest, controllerImageDigest: existingInfra.controllerImageDigest,
    providerJobReadback,
    mutationProfile: 'APP_INFRA_REUSE', reuseBasis: 'APPLICATION_SOURCE_ONLY_NO_INFRA_EXECUTABLE_INPUT_CHANGE',
    status: 'APPLIED', releaseAuthority: true, evidenceScope: 'PRODUCTION_PROVIDER_REUSE', observedAt,
  }
  return { ...value, receiptSha256: sha256(canonicalize(value)) }
}

export function buildRoutineAuthority({ profile, releaseId, sourceLock, runtimeConfigReceipt, baselineIntentRef, dataCutoverCompletionRef = null, previousRevision, observedAt, expiresAt }) {
  if (!RELEASE_ID.test(releaseId ?? '')
    || sourceLock?.releaseId !== releaseId || sourceLock?.ownerApplicationId !== profile.application.id
    || sourceLock?.status !== 'SOURCE_FROZEN' || sourceLock.releaseAuthority !== true || sourceLock.clean !== true
    || runtimeConfigReceipt?.releaseId !== releaseId || runtimeConfigReceipt?.ownerApplicationId !== profile.application.id
    || runtimeConfigReceipt?.sourceRevision !== sourceLock.sourceRevision || runtimeConfigReceipt?.status !== 'VERIFIED'
    || runtimeConfigReceipt?.releaseAuthority !== true || typeof previousRevision !== 'string' || previousRevision.length < 3
    || !Number.isFinite(Date.parse(observedAt)) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(observedAt)) fail('ROUTINE_AUTHORITY_INPUT_INVALID')
  const exactBaseline = exactRef(baselineIntentRef, profile)
  const common = {
    ownerApplicationId: profile.application.id,
    projectId: profile.target.projectId,
    sourceRevision: sourceLock.sourceRevision,
    releaseId,
    environment: 'production',
    baselineIntentRef: exactBaseline,
    previousRevision,
    expiresAt,
    observedAt,
    status: 'PASS',
    releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND',
    remainingHumanAction: 0,
  }
  const readiness = { ...common, schemaVersion: 'jenfu.dev012.routine-owner-readiness.v1' }
  if (dataCutoverCompletionRef != null) readiness.dataCutoverCompletionRef = exactRef(dataCutoverCompletionRef, profile)
  return {
    authorization: { ...common, schemaVersion: 'jenfu.dev012.routine-owner-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION' },
    readiness,
  }
}

function revisionControlledEnvironment(profile, revision) {
  const app = revision?.containers?.find((row) => row.name === profile.runtime.containerName)
  const plain = Object.fromEntries((app?.env ?? []).filter((row) => typeof row.value === 'string').map((row) => [row.name, row.value]))
  return Object.fromEntries(Object.keys(profile.environment?.controlledValues ?? {}).sort().map((name) => [name, plain[name] ?? null]))
}

export function assertDev013PredecessorReceipt(value, ref, profile, observedAt, currentStep) {
  return assertDev013L4Predecessor({ value, ref, profile, observedAt, currentStep })
}

export function buildDev013TransitionAuthority({ profile, releaseId, sourceLock, runtimeConfigReceipt, previousRevision, previousControlledEnvironment, transition, predecessorEvidence, observedAt, expiresAt }) {
  const rules = profile.environment?.controlledValues ?? {}
  const ruleNames = Object.keys(rules).sort()
  const runtime = runtimeConfigReceipt?.runtimeConfig ?? runtimeConfigReceipt
  if (!RELEASE_ID.test(releaseId ?? '') || sourceLock?.releaseId !== releaseId || sourceLock?.ownerApplicationId !== profile.application.id || sourceLock?.status !== 'SOURCE_FROZEN' || sourceLock.releaseAuthority !== true || sourceLock.clean !== true || !H40.test(sourceLock.sourceRevision ?? '')
    || runtimeConfigReceipt?.releaseId !== releaseId || runtimeConfigReceipt?.ownerApplicationId !== profile.application.id || runtimeConfigReceipt?.sourceRevision !== sourceLock.sourceRevision || runtimeConfigReceipt?.projectId !== profile.target.projectId || runtimeConfigReceipt?.status !== 'VERIFIED' || runtimeConfigReceipt?.releaseAuthority !== true
    || typeof previousRevision !== 'string' || previousRevision.length < 3 || canonicalize(Object.keys(previousControlledEnvironment ?? {}).sort()) !== canonicalize(ruleNames)
    || !Number.isFinite(Date.parse(observedAt)) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(observedAt) || Date.parse(expiresAt) > Date.parse(predecessorEvidence?.sequenceRoot?.expiresAt)
    || !predecessorEvidence?.schemaVersion || predecessorEvidence.sequenceRoot?.schemaVersion !== 'jenfu.dev013.l4-sequence-root.v2' || ruleNames.length === 0) fail('DEV013_TRANSITION_AUTHORITY_INPUT_INVALID')
  assertRuntimeConfig(profile, runtime)
  const controlledEnvironment = Object.fromEntries(ruleNames.map((name) => [name, runtime.plainEnvironment[name]]))
  if (!ruleNames.some((name) => previousControlledEnvironment[name] !== controlledEnvironment[name])) fail('DEV013_TRANSITION_NOOP_DENIED')
  const sequenceStep = dev013L4SequenceStep(profile.application.id, transition, previousControlledEnvironment, controlledEnvironment)
  if (canonicalize(predecessorEvidence.currentStep) !== canonicalize(sequenceStep)) fail('DEV013_TRANSITION_SEQUENCE_MISMATCH')
  const common = { ownerApplicationId: profile.application.id, projectId: profile.target.projectId, sourceRevision: sourceLock.sourceRevision, releaseId, environment: 'production', previousRevision, expiresAt, observedAt, status: 'PASS', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', remainingHumanAction: 0, predecessorEvidence }
  const authorization = { ...common, schemaVersion: 'jenfu.dev013.l4-owner-transition-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEV013_L4' }
  const readiness = { ...common, schemaVersion: 'jenfu.dev013.l4-owner-transition-readiness.v2', devId: 'DEV-013', slice: '013-R1', sequenceRoot: predecessorEvidence.sequenceRoot, sequenceStep, previousControlledEnvironment, controlledEnvironment, transition }
  assertControlledEnvironmentAuthority({ intent: { releaseId, sourceRevision: sourceLock.sourceRevision }, profile, values: { authorization, readiness }, runtime, previousControlledEnvironment })
  return { authorization, readiness }
}

export function buildReleaseIntent({ profile, releaseId, input, sourceLock, prerequisiteValues, validateIntent, cleanupMigrationBundle = null }) {
  if (!RELEASE_ID.test(releaseId ?? '') || sourceLock?.releaseId !== releaseId || sourceLock?.ownerApplicationId !== profile.application.id) fail('RELEASE_INTENT_INPUT_INVALID')
  if (input?.openswxWorkerRef || input?.retainedOpenswxWorker || input?.programOnlyBaseline) fail('RETIRED_WORKER_BINDING_REJECTED')
  if (Object.hasOwn(input ?? {}, 'appliedMigrationContinuation') &&
      (!Object.hasOwn(input, 'postAbortLedgerReadbackRef') || !Object.hasOwn(input, 'principalOnlyFenceRef') || !Object.hasOwn(input, 'principalOnlyRecovery'))) {
    fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
  }
  const intent = {
    schemaVersion: profile.schemas.releaseIntent,
    ownerApplicationId: profile.application.id,
    releaseId,
    sourceRevision: sourceLock.sourceRevision,
    sourceSha256: sourceLock.sourceSha256,
    sourceLockRef: exactRef(input.sourceLockRef, profile),
    authorizationPolicyRef: exactRef(input.authorizationPolicyRef, profile),
    readinessReceiptRef: exactRef(input.readinessReceiptRef, profile),
    foundationReceiptRef: exactRef(input.foundationReceiptRef, profile),
    infraReceiptRef: exactRef(input.infraReceiptRef, profile),
    runtimeConfigRef: exactRef(input.runtimeConfigRef, profile),
    migrationManifestSha256: sourceLock.migrationManifestSha256,
    previousRevision: input.previousRevision,
    deadlineAt: input.deadlineAt,
  }
  if (Object.hasOwn(input, 'unlinkedProfileCleanupRef')) {
    assertUnlinkedProfileCleanupRef(input.unlinkedProfileCleanupRef, profile.artifact.releaseBucket)
    const entry = assertUnlinkedProfileCleanupBundleBinding(cleanupMigrationBundle, input.unlinkedProfileCleanupRef)
    if (!entry || cleanupMigrationBundle.sourceRevision !== sourceLock.sourceRevision) fail('CLEANUP_SOURCE_LOCK_MISMATCH')
    const core = { ...cleanupMigrationBundle }; delete core.manifestSha256; delete core.unlinkedProfileCleanupRef
    if (sha256(canonicalize(core)) !== sourceLock.migrationManifestSha256 || sha256(canonicalize({ ...core, unlinkedProfileCleanupRef: input.unlinkedProfileCleanupRef })) !== cleanupMigrationBundle.manifestSha256) fail('CLEANUP_SOURCE_LOCK_MISMATCH')
    intent.unlinkedProfileCleanupRef = input.unlinkedProfileCleanupRef
    intent.migrationManifestSha256 = cleanupMigrationBundle.manifestSha256
  } else if (cleanupMigrationBundle !== null) fail('CLEANUP_SOURCE_LOCK_MISMATCH')
  if (input.baselineIntentRef) intent.baselineIntentRef = exactRef(input.baselineIntentRef, profile)
  if (Object.hasOwn(input, 'principalOnlyFenceRef') || Object.hasOwn(input, 'principalOnlyRecovery')) {
    intent.principalOnlyFenceRef = exactRef(input.principalOnlyFenceRef, profile)
    intent.principalOnlyRecovery = structuredClone(input.principalOnlyRecovery)
    assertPrincipalOnlyRecoveryBinding(intent, profile.artifact.releaseBucket)
  }
  if (Object.hasOwn(input, 'postAbortLedgerReadbackRef')) {
    intent.postAbortLedgerReadbackRef = exactRef(input.postAbortLedgerReadbackRef, profile)
    if (!/^gs:\/\/jenfu-platform-prod-aipdm-release\/receipts\/releases\/[A-Z0-9][A-Z0-9-]{5,63}\/[a-f0-9]{64}\/ledger-readback-result\.json$/u.test(intent.postAbortLedgerReadbackRef.uri)
      || !intent.principalOnlyFenceRef || !intent.principalOnlyRecovery) fail('POST_ABORT_LEDGER_READBACK_INVALID')
  }
  if (Object.hasOwn(input, 'appliedMigrationContinuation')) {
    if (input.unlinkedProfileCleanupRef) fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
    intent.appliedMigrationContinuation = structuredClone(assertAppliedMigrationContinuation(input.appliedMigrationContinuation, profile.artifact.releaseBucket))
  }
  const reconciledAbort = assertReconciledPrincipalAbortBinding(intent, profile.artifact.releaseBucket)
  if (Object.hasOwn(input, 'forwardAppliedMigrationContinuation')) {
    if (!intent.appliedMigrationContinuation) fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
    intent.forwardAppliedMigrationContinuation = structuredClone(assertForwardAppliedMigrationContinuation(input.forwardAppliedMigrationContinuation, profile.artifact.releaseBucket))
  }
  if (Object.hasOwn(intent, 'appliedMigrationContinuation') && !reconciledAbort) fail('APPLIED_MIGRATION_CONTINUATION_INVALID')
  if (intent.postAbortLedgerReadbackRef && intent.unlinkedProfileCleanupRef) fail('POST_ABORT_LEDGER_READBACK_INVALID')
  if (!intent.previousRevision || intent.previousRevision === 'latest' || !Number.isFinite(Date.parse(intent.deadlineAt)) || Date.parse(intent.deadlineAt) <= Date.now()) fail('RELEASE_INTENT_INPUT_INVALID')
  for (const [name, value] of Object.entries(prerequisiteValues)) {
    if (name !== 'foundation' && value?.ownerApplicationId && value.ownerApplicationId !== profile.application.id) fail('PREREQUISITE_OWNER_MISMATCH', name)
    if (name !== 'foundation' && !(name === 'infra' && value?.schemaVersion === 'jenfu.dev012.app-infra-reuse-receipt.v1') && value?.sourceRevision && value.sourceRevision !== sourceLock.sourceRevision) fail('PREREQUISITE_SOURCE_MISMATCH', name)
  }
  assertPreparePrerequisites({ intent, profile, values: prerequisiteValues })
  const runtime = prerequisiteValues.runtimeConfig.runtimeConfig ?? prerequisiteValues.runtimeConfig
  if (Object.hasOwn(intent, 'appliedMigrationContinuation')) assertAppliedContinuationRuntimeBinding(runtime, intent)
  else assertRuntimeConfig(profile, runtime)
  validateIntent(intent, profile)
  return intent
}

export function parsePrerequisiteProducerArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!['--stage', '--release-id', '--input'].includes(key) || !value || values[key]) fail('INVALID_ARGUMENTS')
    values[key] = value
  }
  if (!STAGES.has(values['--stage']) || !RELEASE_ID.test(values['--release-id'] ?? '') || (values['--stage'] === 'source-freeze' ? values['--input'] != null : !values['--input'])) fail('INVALID_ARGUMENTS')
  return { stage: values['--stage'], releaseId: values['--release-id'], inputPath: values['--input'] ?? null }
}

export function resolveOwnerInputPath(root, inputPath) {
  if (typeof inputPath !== 'string' || path.isAbsolute(inputPath)) fail('INPUT_PATH_OUT_OF_SCOPE')
  const normalized = inputPath.replace(/\\\\/gu, '/').replace(/^\.\//u, '')
  if ((!normalized.startsWith('output/dev-012/inputs/') && !normalized.startsWith('output/dev-013/l4/inputs/')) || normalized.includes('/../') || normalized.endsWith('/..')) fail('INPUT_PATH_OUT_OF_SCOPE')
  const resolvedRoot = path.resolve(root)
  const candidate = path.resolve(resolvedRoot, ...normalized.split('/'))
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) fail('INPUT_PATH_OUT_OF_SCOPE')
  return candidate
}

async function readRef(transport, ref, profile) {
  exactRef(ref, profile)
  return (await transport.readJson(ref, profile.artifact.releaseBucket, ['receipts'])).value
}

export async function executePrerequisiteProducer({ stage, releaseId, input, profile, root, transport, createSourceIdentity, buildMigrationBundle, validateIntent, observedAt = new Date().toISOString(), gitReader = readGitAuthority, migrationRunnerCompatibilityVerifier = assertMigrationRunnerSourceCompatibility }) {
  const uri = (name) => `gs://${profile.artifact.releaseBucket}/receipts/releases/${releaseId}/${name}.json`
  if (stage === 'source-freeze') {
    const git = gitReader(root, profile)
    const [sourceIdentityBytes, migrationBundle] = await Promise.all([createSourceIdentity(git.sourceRevision), buildMigrationBundle(git.sourceRevision)])
    const value = buildSourceFreeze({ profile, releaseId, observedAt, git, sourceIdentityBytes, migrationBundle })
    return transport.putJson(uri('source-lock'), value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }
  if (stage === 'runtime-config') {
    const sourceLock = await readRef(transport, input.sourceLockRef, profile)
    if (input.retainedOpenswxWorker || input.openswxWorkerRef || input.plainEnvironment?.PDM_OPENSWX_DISPATCH_ENABLED != null) fail('RETIRED_WORKER_BINDING_REJECTED')
    const value = buildRuntimeConfigReceipt({ profile, releaseId, sourceLock, plainEnvironment: input.plainEnvironment, secretVersions: input.secretVersions, observedAt })
    return transport.putJson(uri('runtime-config'), value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }
  if (stage === 'infra-reuse') {
    if (input?.schemaVersion !== 'jenfu.dev012.app-infra-reuse-input.v1') fail('INFRA_REUSE_INPUT_INVALID')
    const [sourceLockResult, foundationResult, existingInfraResult] = await Promise.all([
      transport.readJson(exactRef(input.sourceLockRef, profile), profile.artifact.releaseBucket, ['receipts']),
      transport.readJson(exactRef(input.foundationReceiptRef, profile), profile.artifact.releaseBucket, ['receipts']),
      transport.readJson(exactRef(input.existingInfraReceiptRef, profile), profile.artifact.releaseBucket, ['receipts']),
    ])
    const runnerSourceRevision = infraRunnerSourceRevision(existingInfraResult.value)
    if (!runnerSourceRevision) fail('INFRA_REUSE_INPUT_INVALID')
    if (profile.application.id === 'ai-pdm') {
      migrationRunnerCompatibilityVerifier({
        root,
        currentSourceRevision: sourceLockResult.value.sourceRevision,
        runnerSourceRevision,
      })
    }
    const providerJob = await transport.request(`https://run.googleapis.com/v2/projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations?.jobName}`)
    const value = buildInfraReuseReceipt({ profile, releaseId, sourceLock: sourceLockResult.value, foundation: foundationResult.value, existingInfra: existingInfraResult.value, existingInfraRef: input.existingInfraReceiptRef, providerJob, observedAt })
    return transport.putJson(uri('app-infra-reuse'), value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }
  if (stage === 'routine-authority') {
    if (input?.schemaVersion !== 'jenfu.dev012.routine-owner-authority-input.v1') fail('ROUTINE_AUTHORITY_INPUT_INVALID')
    const [sourceLockResult, runtimeConfigResult] = await Promise.all([
      transport.readJson(exactRef(input.sourceLockRef, profile), profile.artifact.releaseBucket, ['receipts']),
      transport.readJson(exactRef(input.runtimeConfigRef, profile), profile.artifact.releaseBucket, ['receipts']),
    ])
    const service = await transport.getService(profile)
    transport.assertServiceSettled(service, 'ROUTINE_BASELINE_UNSETTLED')
    const previousRevision = transport.effectiveRevision(service)
    const controlResult = await transport.readBytes(`gs://${profile.artifact.releaseBucket}/control/active.json`, { prefixes: ['control'] })
    let control
    try { control = JSON.parse(controlResult.bytes.toString('utf8')) } catch { fail('ROUTINE_CONTROL_INVALID') }
    if (!RELEASE_ID.test(control?.releaseId ?? '')) fail('ROUTINE_CONTROL_INVALID')
    const expectedBaselineUri = `gs://${profile.artifact.releaseBucket}/receipts/releases/${control.releaseId}/release-intent.json`
    const baselineBytes = await transport.readBytes(expectedBaselineUri, { prefixes: ['receipts'] })
    let baselineIntent
    try { baselineIntent = JSON.parse(baselineBytes.bytes.toString('utf8')) } catch { fail('ROUTINE_CONTROL_INVALID') }
    if (baselineBytes.ref?.uri !== expectedBaselineUri || baselineBytes.ref.sha256 !== sha256(baselineBytes.bytes)) fail('ROUTINE_CONTROL_INVALID')
    const activeBaselineRef = baselineBytes.ref
    validateHistoricalBaselineIntent(baselineIntent, profile, validateIntent)
    const appliedRollback = control?.result === 'ROLLED_BACK'
      && Object.hasOwn(baselineIntent ?? {}, 'appliedMigrationContinuation')
    const continuation = control?.result === 'PRE_ACTIVATION_ABORTED' || appliedRollback
      ? await readPreActivationAbortContinuation({ profile, transport, baselineIntentRef: activeBaselineRef, service, control, verifyProvider: true,
        postAbortLedgerReadbackRef: input.postAbortLedgerReadbackRef ?? null,
        principalOnlyFenceRef: input.principalOnlyFenceRef ?? null,
        principalOnlyRecovery: input.principalOnlyRecovery ?? null,
        appliedMigrationContinuation: input.appliedMigrationContinuation ?? null }) : null
    if ((control?.result === 'PRE_ACTIVATION_ABORTED' || appliedRollback)
      && (!continuation || continuation.currentActiveRevision !== previousRevision)) fail('ROUTINE_CONTROL_INVALID')
    const { controlSha256, ...controlCore } = control ?? {}
    if (controlSha256 !== sha256(canonicalize(controlCore)) || control.state !== 'FINALIZED' || !['RELEASED', 'ROLLED_BACK', 'PRE_ACTIVATION_ABORTED'].includes(control.result)
      || control.ownerApplicationId !== profile.application.id || control.service !== profile.target.serviceName
      || control.releaseId !== baselineIntent.releaseId || control.sourceRevision !== baselineIntent.sourceRevision
      || (control.result === 'RELEASED' && control.candidateRevision !== previousRevision)) fail('ROUTINE_CONTROL_INVALID')
    if (control.result === 'ROLLED_BACK' && !appliedRollback) {
      const repair = await readPrincipalOnlyRepairBaseline({ profile, transport, baselineIntentRef: activeBaselineRef, service, control })
      if (!repair || repair.activeRevision !== previousRevision) fail('ROUTINE_CONTROL_INVALID')
    }
    const values = buildRoutineAuthority({ profile, releaseId, sourceLock: sourceLockResult.value, runtimeConfigReceipt: runtimeConfigResult.value, baselineIntentRef: activeBaselineRef, dataCutoverCompletionRef: input.dataCutoverCompletionRef ?? null, previousRevision, observedAt, expiresAt: input.expiresAt })
    if (ROUTINE_ABORT_CONTINUATIONS.has(continuation?.kind)) {
      values.authorization.preActivationAbortBasis = continuation.authorityBasis
      values.readiness.preActivationAbortBasis = continuation.authorityBasis
    }
    const authorization = await transport.putJson(uri('owner-authorization'), values.authorization, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const readiness = await transport.putJson(uri('owner-readiness'), values.readiness, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    return { ...readiness, refs: { authorizationPolicyRef: authorization.ref, readinessReceiptRef: readiness.ref }, previousRevision, baselineIntentRef: activeBaselineRef }
  }
  if (stage === 'dev013-transition-authority') {
    if (input?.schemaVersion !== 'jenfu.dev013.l4-owner-transition-input.v1') fail('DEV013_TRANSITION_INPUT_INVALID')
    const [sourceLockResult, runtimeConfigResult] = await Promise.all([
      transport.readJson(exactRef(input.sourceLockRef, profile), profile.artifact.releaseBucket, ['receipts']),
      transport.readJson(exactRef(input.runtimeConfigRef, profile), profile.artifact.releaseBucket, ['receipts']),
    ])
    const service = await transport.getService(profile)
    transport.assertServiceSettled(service, 'DEV013_TRANSITION_BASELINE_UNSETTLED')
    const previousRevision = transport.effectiveRevision(service)
    if (!previousRevision || input.previousRevision !== previousRevision) fail('DEV013_TRANSITION_BASELINE_MISMATCH')
    const revision = await transport.getRevision(profile, previousRevision)
    const previousControlledEnvironment = revisionControlledEnvironment(profile, revision)
    const predecessorResult = await transport.readBytes(input.transition?.predecessorReceiptRef?.uri, { prefixes: ['receipts'], expectedSha256: input.transition?.predecessorReceiptRef?.sha256 })
    let predecessorValue
    try { predecessorValue = JSON.parse(predecessorResult.bytes.toString('utf8')) } catch { fail('DEV013_PREDECESSOR_RECEIPT_INVALID') }
    const runtime = runtimeConfigResult.value.runtimeConfig ?? runtimeConfigResult.value
    const controlledEnvironment = Object.fromEntries(Object.keys(profile.environment?.controlledValues ?? {}).sort().map((name) => [name, runtime.plainEnvironment[name]]))
    const currentStep = dev013L4SequenceStep(profile.application.id, input.transition, previousControlledEnvironment, controlledEnvironment)
    const predecessorEvidence = { ...assertDev013PredecessorReceipt(predecessorValue, input.transition.predecessorReceiptRef, profile, observedAt, currentStep), currentStep }
    const values = buildDev013TransitionAuthority({ profile, releaseId, sourceLock: sourceLockResult.value, runtimeConfigReceipt: runtimeConfigResult.value, previousRevision, previousControlledEnvironment, transition: input.transition, predecessorEvidence, observedAt, expiresAt: input.expiresAt })
    const authorization = await transport.putJson(uri('owner-authorization'), values.authorization, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const readiness = await transport.putJson(uri('owner-readiness'), values.readiness, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    return { ...readiness, refs: { authorizationPolicyRef: authorization.ref, readinessReceiptRef: readiness.ref }, previousRevision, previousControlledEnvironment }
  }
  if (stage === 'release-intent') {
    const fields = { sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }
    const rows = await Promise.all(Object.entries(fields).map(async ([name, field]) => [name, await readRef(transport, input[field], profile)]))
    const prerequisiteValues = Object.fromEntries(rows)
    if (input.openswxWorkerRef || input.retainedOpenswxWorker || input.programOnlyBaseline) fail('RETIRED_WORKER_BINDING_REJECTED')
    let cleanupMigrationBundle = null
    if (Object.hasOwn(input, 'unlinkedProfileCleanupRef')) {
      assertUnlinkedProfileCleanupRef(input.unlinkedProfileCleanupRef, profile.artifact.releaseBucket)
      if (profile.application.id !== 'ai-pdm' || input.principalOnlyFenceRef || input.principalOnlyRecovery) fail('CLEANUP_SOURCE_LOCK_MISMATCH')
      const sourceRevision = prerequisiteValues.sourceLock.sourceRevision
      const baseline = await buildMigrationBundle(sourceRevision)
      if (baseline.bundle.manifestSha256 !== prerequisiteValues.sourceLock.migrationManifestSha256) fail('CLEANUP_SOURCE_LOCK_MISMATCH')
      const bound = await buildMigrationBundle(sourceRevision, { unlinkedProfileCleanupRef: input.unlinkedProfileCleanupRef })
      const entry = assertUnlinkedProfileCleanupBundleBinding(bound.bundle, input.unlinkedProfileCleanupRef)
      await readUnlinkedProfileCleanupOperation({ ref: input.unlinkedProfileCleanupRef, sourceRevision,
        migrationSourceSha256: entry.sourceSha256,
        readObject: ref => transport.readBytes(ref.uri, { prefixes: ['source/migration-bundles/dev121/unlinked-profile-cleanup'], expectedSha256: ref.sha256, expectedGeneration: ref.generation }) })
      cleanupMigrationBundle = bound.bundle
    }
    const value = buildReleaseIntent({ profile, releaseId, input, sourceLock: prerequisiteValues.sourceLock, prerequisiteValues, validateIntent, cleanupMigrationBundle })
    return transport.putJson(uri('release-intent'), value, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }
  fail('STAGE_DENIED')
}

export function sourceFreezeFingerprint(value) {
  return sha256(canonicalize(value))
}
