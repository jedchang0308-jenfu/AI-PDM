import { spawnSync } from 'node:child_process'
import { assertImmutableRef, assertProtectedGitHubContext, assertRuntimeConfig, canonicalize, releasePaths, sha256, stageReceipt } from './dev012-owner-release-runtime.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const STAGES = new Set(['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize', 'rollback'])

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
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
  const bytes = run(['archive', '--format=tar.gz', '--prefix=source/', sourceRevision], null)
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail('SOURCE_ARCHIVE_FAILED')
  return bytes
}

function assertIntentBase(intent, profile, intentRef, intentSha256) {
  const exact = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceSha256', 'sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef', 'migrationManifestSha256', 'previousRevision', 'deadlineAt'].sort()
  if (!intent || JSON.stringify(Object.keys(intent).sort()) !== JSON.stringify(exact) || intent.schemaVersion !== profile.schemas.releaseIntent || intent.ownerApplicationId !== profile.application.id || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(intent.releaseId ?? '') || !H40.test(intent.sourceRevision ?? '') || !H64.test(intent.sourceSha256 ?? '') || !H64.test(intent.migrationManifestSha256 ?? '') || !intent.previousRevision || intent.previousRevision === 'latest' || !Number.isFinite(Date.parse(intent.deadlineAt)) || Date.parse(intent.deadlineAt) <= Date.now()) fail('RELEASE_INTENT_INVALID')
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
  const runtime = values.runtimeConfig.runtimeConfig ?? values.runtimeConfig
  assertRuntimeConfig(profile, runtime)
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

function assertDeployment(value, profile, intent, intentRef, intentSha256) {
  if (value?.schemaVersion !== profile.schemas.deploymentCapsule || value.ownerApplicationId !== profile.application.id || value.releaseIntentRef?.uri !== intentRef.uri || value.releaseIntentRef?.sha256 !== intentRef.sha256 || value.releaseIntentSha256 !== intentSha256 || value.sourceRevision !== intent.sourceRevision || value.deadlineAt !== intent.deadlineAt) fail('DEPLOYMENT_CAPSULE_JOIN_INVALID')
  if (!value.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`) || !value.migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`)) fail('DEPLOYMENT_ARTIFACT_INVALID')
  if (!H64.test(value.sourceObject?.sha256 ?? '') || !/^[1-9][0-9]*$/u.test(String(value.sourceObject?.generation ?? '')) || typeof value.sourceObject?.crc32c !== 'string') fail('DEPLOYMENT_SOURCE_INVALID')
  for (const name of ['migrationBundleRef', 'buildReceiptRef', 'provenanceReceiptRef', 'sbomReceiptRef', 'scanReceiptRef']) if (!value[name]?.uri || !H64.test(value[name]?.sha256 ?? '')) fail('DEPLOYMENT_EVIDENCE_REF_INVALID', name)
  if (profile.productionData?.required === true) {
    assertImmutableRef(value.productionDataRef, profile.artifact.releaseBucket, [profile.productionData.dataObjectPrefix])
    assertImmutableRef(value.firstPrincipalBootstrapRef, profile.artifact.releaseBucket, [profile.productionData.bootstrapObjectPrefix])
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

async function writeControl({ transport, paths, profile, intent, fingerprint, candidate, state, result = null, environment }) {
  const current = await optionalNamedJson(transport, paths.control, profile, ['control'])
  if (current && current.value.inputFingerprint !== fingerprint && current.value.state !== 'FINALIZED') fail('CONTROL_HEAD_FINGERPRINT_MISMATCH')
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
    previousRevision: intent.previousRevision, ownerRunRef: `https://api.github.com/repos/${profile.application.repository}/actions/runs/${environment.GITHUB_RUN_ID}`,
    leaseExpiresAt: expires, deadlineAt: intent.deadlineAt, state, result,
  }
  const value = { ...core, controlSha256: sha256(canonicalize(core)) }
  return transport.putJson(paths.control, value, { bucket: profile.artifact.releaseBucket, prefix: 'control', ifGenerationMatch: current ? String(current.metadata.generation) : '0' })
}

function publicBuildReceipt(build) {
  return { name: build.name, id: build.id, projectId: build.projectId, status: build.status, serviceAccount: build.serviceAccount, createTime: build.createTime, startTime: build.startTime, finishTime: build.finishTime, sourceProvenance: build.sourceProvenance, results: build.results, options: build.options }
}

export async function executeOwnerStage({ stage, capsuleRef, capsuleSha256, profile, profileSha256 = profile?.contractSha256, transport, environment = process.env, validateIntent, createSourceArchive, buildMigrationBundle }) {
  if (!STAGES.has(stage)) fail('STAGE_DENIED')
  const { intent, intentRef, paths } = await readIntentAndPaths({ transport, profile, capsuleRef, capsuleSha256, validateIntent })
  const fingerprint = sha256(canonicalize({ ownerApplicationId: profile.application.id, releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, releaseIntentSha256: capsuleSha256 }))

  if (stage !== 'rollback') {
    assertProtectedGitHubContext(profile, intent, environment)
  }

  if (stage === 'prepare') {
    const names = { sourceLock: 'sourceLockRef', authorization: 'authorizationPolicyRef', readiness: 'readinessReceiptRef', foundation: 'foundationReceiptRef', infra: 'infraReceiptRef', runtimeConfig: 'runtimeConfigRef' }
    const entries = await Promise.all(Object.entries(names).map(async ([name, field]) => [name, (await transport.readJson(intent[field], profile.artifact.releaseBucket, ['receipts'])).value]))
    const values = Object.fromEntries(entries)
    const derived = assertPreparePrerequisites({ intent, profile, values })
    const service = await transport.getService(profile)
    transport.assertServiceSettled(service, 'PREPARE_BASELINE_MISMATCH')
    if (transport.effectiveRevision(service) !== intent.previousRevision) fail('PREPARE_BASELINE_MISMATCH')
    return writeStage(transport, paths, profile, intent, 'prepare', null, { prerequisiteRefs: Object.fromEntries(Object.entries(names).map(([name, field]) => [name, intent[field]])), previousRevision: intent.previousRevision, runtimeServiceAccount: derived.runtimeConfig.runtimeServiceAccount, migrationRunnerDigest: derived.migrationRunnerDigest, ...(derived.productionData ?? {}), entrypointBaseline: transport.entrypointSnapshot(service), remainingHumanAction: 0 })
  }

  if (stage === 'build') {
    const prepare = await readStage(transport, paths, profile, intent, 'prepare')
    const sourceBytes = await createSourceArchive(intent.sourceRevision)
    if (!Buffer.isBuffer(sourceBytes) || sha256(sourceBytes) !== intent.sourceSha256) fail('SOURCE_ARCHIVE_HASH_MISMATCH')
    const sourceUri = `gs://${profile.artifact.releaseBucket}/source/releases/${intent.releaseId}/${capsuleSha256}/source.tar.gz`
    const source = await transport.putBytes(sourceUri, sourceBytes, { bucket: profile.artifact.releaseBucket, prefix: 'source', contentType: 'application/gzip' })
    const migration = await buildMigrationBundle(intent.sourceRevision)
    if (migration.bundle?.manifestSha256 !== intent.migrationManifestSha256 || sha256(migration.bytes) !== migration.bundleSha256) fail('MIGRATION_MANIFEST_MISMATCH')
    const bundleUri = `gs://${profile.artifact.releaseBucket}/${profile.artifact.migrationBundlePrefix}/${intent.sourceRevision}/${migration.bundle.manifestSha256}.json`
    const bundle = await transport.putBytes(bundleUri, migration.bytes, { bucket: profile.artifact.releaseBucket, prefix: profile.artifact.migrationBundlePrefix, contentType: 'application/json' })
    const build = await transport.createBuild({ profile, intent, sourceObject: source, deadlineAt: intent.deadlineAt })
    const artifact = await transport.readArtifactImage(profile, build.artifactDigest)
    const analysis = await transport.waitArtifactEvidence({ profile, artifactDigest: build.artifactDigest, deadlineAt: intent.deadlineAt })
    const provenance = await transport.putJson(paths.provenance, { schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: intent.sourceRevision, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c }, artifactDigest: build.artifactDigest, cloudBuild: publicBuildReceipt(build.build), artifactRegistry: artifact, status: 'PASS' }, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const sbom = await transport.putJson(paths.sbom, { schemaVersion: 'jenfu.dev012.sbom-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: intent.sourceRevision, artifactDigest: build.artifactDigest, ...analysis.sbomExport, occurrenceNames: analysis.sbomOccurrenceNames, status: 'PASS' }, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const scan = await transport.putJson(paths.scan, { schemaVersion: 'jenfu.dev012.scan-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: intent.sourceRevision, artifactDigest: build.artifactDigest, buildOccurrenceNames: analysis.buildOccurrenceNames, discoveryOccurrenceNames: analysis.discoveryOccurrenceNames, vulnerabilityCount: analysis.vulnerabilityCount, blockingVulnerabilityCount: analysis.blockingVulnerabilityCount, maximumAllowedSeverity: profile.build.maximumAllowedSeverity, observedAt: analysis.observedAt, status: 'PASS' }, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    const buildStage = await writeStage(transport, paths, profile, intent, 'build', prepare.ref, { artifactDigest: build.artifactDigest, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c }, migrationBundleRef: bundle.ref, provenanceReceiptRef: provenance.ref, sbomReceiptRef: sbom.ref, scanReceiptRef: scan.ref })
    const deployment = { schemaVersion: profile.schemas.deploymentCapsule, ownerApplicationId: profile.application.id, releaseIntentRef: intentRef, releaseIntentSha256: capsuleSha256, sourceRevision: intent.sourceRevision, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c }, artifactDigest: build.artifactDigest, migrationBundleRef: bundle.ref, migrationRunnerDigest: prepare.value.facts.migrationRunnerDigest, ...(profile.productionData?.required === true ? { productionDataRef: prepare.value.facts.productionDataRef, firstPrincipalBootstrapRef: prepare.value.facts.firstPrincipalBootstrapRef } : {}), buildReceiptRef: buildStage.ref, provenanceReceiptRef: provenance.ref, sbomReceiptRef: sbom.ref, scanReceiptRef: scan.ref, deadlineAt: intent.deadlineAt }
    assertDeployment(deployment, profile, intent, intentRef, capsuleSha256)
    return transport.putJson(paths.deployment, deployment, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  }

  if (stage === 'migrate') {
    const deployment = await readDeployment(transport, paths, profile, intent, intentRef, capsuleSha256)
    const existing = await optionalNamedJson(transport, paths.migrate, profile)
    if (!existing) await transport.runMigrationJob({ profile, deployment: deployment.value, outputUri: paths.migrate, deadlineAt: intent.deadlineAt })
    const receipt = existing ?? await readNamedJson(transport, paths.migrate, profile)
    if (receipt.value?.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || receipt.value.ownerApplicationId !== profile.application.id || receipt.value.sourceRevision !== intent.sourceRevision || receipt.value.manifestSha256 !== intent.migrationManifestSha256 || receipt.value.status !== 'PASS' || receipt.value.boundaryStatus !== 'PASS' || (profile.productionData?.required === true && receipt.value.productionData?.status !== 'PASS')) fail('MIGRATION_RECEIPT_INVALID')
    return receipt
  }

  if (stage === 'candidate') {
    const deployment = await readDeployment(transport, paths, profile, intent, intentRef, capsuleSha256)
    const migration = await readNamedJson(transport, paths.migrate, profile)
    if (migration.value?.status !== 'PASS' || migration.value?.sourceRevision !== intent.sourceRevision) fail('MIGRATION_RECEIPT_INVALID')
    const runtimeReceipt = await transport.readJson(intent.runtimeConfigRef, profile.artifact.releaseBucket, ['receipts'])
    const runtimeConfig = runtimeReceipt.value.runtimeConfig ?? runtimeReceipt.value
    const candidate = await transport.createCandidate({ profile, artifactDigest: deployment.value.artifactDigest, runtimeConfig, fingerprint, deadlineAt: intent.deadlineAt })
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
    const entrypoint = await readStage(transport, paths, profile, intent, 'entrypoint')
    if (entrypoint.value.previousReceiptRef?.uri !== candidate.ref.uri || entrypoint.value.previousReceiptRef?.sha256 !== candidate.ref.sha256 || entrypoint.value.facts.profileSha256 !== profileSha256) fail('ENTRYPOINT_RECEIPT_JOIN_INVALID')
    const service = await transport.getService(profile)
    transport.assertCanonicalEntrypoint(profile, service)
    const tag = service.trafficStatuses?.find((row) => row.tag === candidate.value.facts.tag)
    if (tag?.revision !== candidate.value.facts.candidateRevision || Number(tag.percent) !== 0 || tag.uri !== candidate.value.facts.tagUri || transport.effectiveRevision(service) !== intent.previousRevision) fail('CANDIDATE_TAG_READBACK_MISMATCH')
    const revision = await transport.getRevision(profile, candidate.value.facts.candidateRevision)
    transport.assertRevisionReady(profile, revision, candidate.value.facts.artifactDigest)
    const smoke = await transport.runInternalCandidateSmoke({ profile, origin: candidate.value.facts.tagUri, candidateTag: candidate.value.facts.tag, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, deadlineAt: intent.deadlineAt, environment })
    const result = await writeStage(transport, paths, profile, intent, 'verify', entrypoint.ref, { candidateReceiptRef: candidate.ref, entrypointReceiptRef: entrypoint.ref, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, tagUri: candidate.value.facts.tagUri, smoke, sideEffects: profile.sideEffects })
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
    const service = await transport.setTraffic({ profile, revision: candidate.value.facts.candidateRevision, candidateTag: candidate.value.facts.tag, deadlineAt: intent.deadlineAt })
    transport.assertCanonicalEntrypoint(profile, service)
    const result = await writeStage(transport, paths, profile, intent, 'activate', decision.ref, { decisionReceiptRef: decision.ref, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, effectiveRevision: transport.effectiveRevision(service), serviceEtag: service.etag, canonicalOrigin: profile.target.canonicalOrigin, ingress: service.ingress, defaultUriDisabled: service.defaultUriDisabled, invokerIamDisabled: service.invokerIamDisabled })
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
    try { transport.assertRevisionReady(profile, revision, candidate.value.facts.artifactDigest) } catch { fail('CANONICAL_ARTIFACT_MISMATCH') }
    const smoke = await transport.runAuthenticatedSmoke({ profile, origin: profile.target.canonicalOrigin, environment })
    const result = await writeStage(transport, paths, profile, intent, 'canonical', activate.ref, { activationReceiptRef: activate.ref, origin: profile.target.canonicalOrigin, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, smoke })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'CANONICAL_VERIFIED', environment })
    return result
  }

  if (stage === 'finalize') {
    const canonical = await readStage(transport, paths, profile, intent, 'canonical')
    const candidate = await readStage(transport, paths, profile, intent, 'candidate')
    await transport.removeCandidateTag({ profile, tag: candidate.value.facts.tag, candidateRevision: candidate.value.facts.candidateRevision, expectedActiveRevision: candidate.value.facts.candidateRevision, deadlineAt: intent.deadlineAt })
    const finalized = await writeStage(transport, paths, profile, intent, 'finalize', canonical.ref, { canonicalReceiptRef: canonical.ref, candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, temporaryCandidateTags: 0, result: 'RELEASED' })
    const terminal = stageReceipt({ profile, intent, stage: 'terminal', previousReceiptRef: finalized.ref, facts: { result: 'RELEASED', candidateRevision: candidate.value.facts.candidateRevision, artifactDigest: candidate.value.facts.artifactDigest, databaseDisposition: 'FORWARD_APPLIED', remainingHumanAction: 0 }, observedAt: transport.now() })
    const terminalResult = await transport.putJson(paths.terminal, terminal, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
    await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate.value.facts, state: 'FINALIZED', result: 'RELEASED', environment })
    return terminalResult
  }

  const candidate = await optionalNamedJson(transport, paths.candidate, profile)
  const entrypoint = await optionalNamedJson(transport, paths.entrypoint, profile)
  const prepare = await optionalNamedJson(transport, paths.prepare, profile)
  let disposition = 'PRE_ACTIVATION_ABORTED'
  let entrypointRecovery = { changed: false, result: 'NOT_REQUIRED' }
  if (candidate) {
    assertStage(candidate.value, profile, intent, 'candidate')
    const facts = candidate.value.facts
    let service = await transport.getService(profile)
    if (transport.effectiveRevision(service) === facts.candidateRevision) {
      service = await transport.setTraffic({ profile, revision: intent.previousRevision, candidateTag: facts.tag, deadlineAt: intent.deadlineAt })
      disposition = 'ROLLED_BACK'
    }
    await transport.removeCandidateTag({ profile, tag: facts.tag, candidateRevision: facts.candidateRevision, expectedActiveRevision: intent.previousRevision, deadlineAt: intent.deadlineAt })
    if (!prepare) fail('PREPARE_RECEIPT_MISSING')
    assertStage(prepare.value, profile, intent, 'prepare')
    if (entrypoint) assertStage(entrypoint.value, profile, intent, 'entrypoint')
    const restored = await transport.restoreEntrypoint({ profile, baseline: prepare.value.facts.entrypointBaseline, deadlineAt: intent.deadlineAt })
    entrypointRecovery = { changed: restored.changed, result: restored.changed ? 'BASELINE_RESTORED' : 'BASELINE_ALREADY_ACTIVE', providerOperationRef: restored.providerOperationRef }
  }
  const rollback = await writeStage(transport, paths, profile, intent, 'rollback', entrypoint?.ref ?? candidate?.ref ?? null, { result: disposition, previousRevision: intent.previousRevision, recoveryOrder: ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'], entrypointRecovery, databaseDisposition: 'DATABASE_FORWARD_APPLIED' })
  const terminal = stageReceipt({ profile, intent, stage: 'terminal', previousReceiptRef: rollback.ref, facts: { result: disposition, previousRevision: intent.previousRevision, entrypointRecovery, databaseDisposition: 'DATABASE_FORWARD_APPLIED' }, observedAt: transport.now() })
  const terminalResult = await transport.putJson(paths.terminal, terminal, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  await transport.publishIncident(profile, { correlationId: `${intent.releaseId}-${environment.GITHUB_RUN_ATTEMPT ?? '1'}`, ownerApplicationId: profile.application.id, sourceLockSha256: intent.sourceLockRef.sha256, eventRef: terminalResult.ref, occurredAt: transport.now() })
  await writeControl({ transport, paths, profile, intent, fingerprint, candidate: candidate?.value?.facts ?? null, state: 'FINALIZED', result: disposition, environment })
  return terminalResult
}
