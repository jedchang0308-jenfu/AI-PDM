import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildDev116R02Receipt, canonicalize as canonicalizeDev116 } from './lib/dev116-r02-receipt.mjs'
import {
  assertDev117AppReleaseReceipt,
  assertDev117ArtifactReceipt,
  assertDev117CandidateReceipt,
  assertDev117Config,
  assertDev117CrossAppMutationBoundary,
  assertDev117Level4AccessReceipt,
  assertDev117Level4Join,
  assertDev117PromotionRequest,
  assertDev117RollbackReceipt,
  assertDev117SourceLock,
  buildDev117SourceLock,
  finalizeEvidence,
  inspectDev117Source,
  planDev117Candidate,
  sha256,
} from './lib/dev117-ai-pdm-independent-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'release', 'dev117-ai-pdm-independent-production.json'), 'utf8'))
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy-ai-pdm-independent-production.yml'), 'utf8')
const now = '2026-09-07T01:00:00.000Z'
const expiry = '2026-09-08T01:00:00.000Z'
const sourceRevision = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const digest = `sha256:${'c'.repeat(64)}`
const releaseId = 'REL-117-20260907-001'
const runId = 'DEV117-AIPDM-20260907T010000Z-1234abcd'
const revision = 'ai-pdm-prod-r117-abcdef01'

function rehash(value) {
  const copy = structuredClone(value)
  delete copy.evidenceSha256
  return finalizeEvidence(copy)
}

function resignProfile(value) {
  const copy = structuredClone(value)
  delete copy.profileSha256
  return { ...copy, profileSha256: sha256(copy) }
}

function validSourceLock() {
  const trackedPaths = [...config.source.requiredTrackedFiles]
  const fileContentsByPath = Object.fromEntries(trackedPaths.map((pathname) => [pathname, Buffer.from(`fixture:${pathname}`)]))
  fileContentsByPath['config/release/dev117-ai-pdm-independent-production.json'] = Buffer.from(JSON.stringify(config))
  const inspection = inspectDev117Source({
    config, branch: 'main', headRevision: sourceRevision, headTree: sourceTree, trackedPaths, fileContentsByPath,
    packageScripts: config.source.requiredPackageScripts, packageLockBytes: Buffer.from('fixture:package-lock'),
    workingTree: { isClean: true, staged: [], unstaged: [], untracked: [] },
  })
  return buildDev117SourceLock({ config, releaseId, runId, createdAt: now, sourceInspection: inspection })
}

function validArtifact(sourceLock = validSourceLock()) {
  return finalizeEvidence({
    schemaVersion: 'jenfu.dev117.artifact-receipt.v1', releaseId, sourceLockSha256: sourceLock.evidenceSha256,
    sourceRevision, sourceTree, applicationId: 'ai-pdm', builderIdentity: 'github-wif-deployer',
    registryRepository: config.application.imageRepository, artifactDigest: digest,
    imageUri: `${config.application.imageRepository}@${digest}`, platform: 'linux/amd64',
    sbomRef: 'evidence/dev117/sbom.json', provenanceRef: 'evidence/dev117/provenance.json',
    secretScan: { credentialMaterialPresent: false, findings: 0 }, vulnerabilities: { critical: 0, high: 0 },
    createdAt: now, credentialMaterialPresent: false,
  })
}

function validShared(sourceLock = validSourceLock(), holding = null) {
  return finalizeEvidence({
    schemaVersion: 'jenfu.dev117.shared-gate-receipt.v1', releaseId, sourceLockSha256: sourceLock.evidenceSha256,
    projectId: config.target.projectId, region: config.target.region, connectionName: config.database.connectionName,
    database: config.database.database, schemas: [...config.database.schemas],
    roles: [config.database.migratorRole, config.database.runtimeRole], billingEnabled: true, apisReady: true,
    databaseReady: true, rolesReady: true, migrationReady: true, capacityReady: true,
    runtimeManifestRef: 'evidence/dev010/runtime-manifest.json', providerEvidenceRefs: ['evidence/dev010/foundation.json'],
    holding, createdAt: now, expiresAt: expiry, credentialMaterialPresent: false,
  })
}

function validSecretBindings() {
  return {
    PDM_SESSION_CURRENT_SECRET: { resource: 'aipdm-prod-session-current', version: '3', state: 'ENABLED' },
    PDM_SESSION_PREVIOUS_SECRET: { resource: 'aipdm-prod-session-previous', version: '2', state: 'ENABLED' },
    PDM_WORKBENCH_CONTRACT_SECRET: { resource: 'aipdm-prod-workbench-contract', version: '7', state: 'ENABLED' },
  }
}

function validCandidate(sourceLock = validSourceLock(), artifact = validArtifact(sourceLock), shared = validShared(sourceLock)) {
  return finalizeEvidence({
    schemaVersion: 'jenfu.dev117.candidate-receipt.v1', releaseId, sourceLockSha256: sourceLock.evidenceSha256,
    artifactReceiptSha256: artifact.evidenceSha256, sharedGateReceiptSha256: shared.evidenceSha256,
    projectId: config.target.projectId, region: config.target.region, serviceName: config.target.serviceName,
    containerName: config.target.containerName, runtimeIdentity: config.target.runtimeIdentity, sourceRevision, sourceTree,
    imageDigest: digest, imageUri: `${config.application.imageRepository}@${digest}`, revisionName: revision,
    previousRevision: 'ai-pdm-prod-r116-previous', serviceExistedBefore: true, candidatePercent: 0, tag: null,
    canonicalTrafficBeforeSha256: 'd'.repeat(64), canonicalTrafficAfterSha256: 'd'.repeat(64),
    effectiveRuntime: { cpu: '1', memory: '1Gi', concurrency: 20, timeoutSeconds: 60, port: 8080, minInstances: 0, maxInstances: 1, startupProbePath: '/login' },
    plainEnvironment: structuredClone(config.environment.fixedPlainEnvironment), secretBindings: validSecretBindings(),
    platformMutationCount: 0, databaseMutationCount: 0, buildExecutions: 0, providerReadbackSha256: 'e'.repeat(64),
    progress: { state: 'COMPLETE', outcomeKnown: true, replayAttempted: false }, observedAt: now,
    credentialMaterialPresent: false,
  })
}

function validAccess(candidate = validCandidate()) {
  return finalizeEvidence({
    schemaVersion: 'jenfu.dev117.level4-access-receipt.v1', releaseId,
    candidateReceiptSha256: candidate.evidenceSha256, projectId: config.target.projectId, region: config.target.region,
    serviceName: config.target.serviceName, revisionName: candidate.revisionName, imageDigest: candidate.imageDigest,
    tag: 'candidate', tagHost: 'https://candidate---ai-pdm-prod-abcdef.a.run.app', tagBeforeRevision: null,
    tagAfterRevision: candidate.revisionName, approval: config.workflow.approvals.level4Access,
    identityOwnerReceiptRef: 'evidence/identity/exact-host.json', serverOriginOwnerReceiptRef: 'evidence/origin/exact-host.json',
    wildcardCount: 0, canonicalTrafficBeforeSha256: 'f'.repeat(64), canonicalTrafficAfterSha256: 'f'.repeat(64),
    observedAt: now, expiresAt: expiry, credentialMaterialPresent: false,
  })
}

function validR02(candidate = validCandidate()) {
  return buildDev116R02Receipt({
    releaseId, observedAt: now, sourceLockSha256: candidate.sourceLockSha256,
    candidate: { sourceRevision: candidate.sourceRevision, imageDigest: candidate.imageDigest, cloudRunRevision: candidate.revisionName },
    target: { projectId: config.target.projectId, instance: config.database.instance, database: config.database.database, region: config.target.region, environment: 'production-candidate', trafficPercent: 0, databaseIdentitySha256: '1'.repeat(64) },
    actor: { subjectSha256: '2'.repeat(64), role: 'Engineer', company: { id: 'company-smoke', code: 'SMOKE', kind: 'production_smoke' } },
    flow: { entryRoute: '/numbering/drawings', committedObjectIds: ['root-001', 'part-001', 'drawing-001'], committedCodes: ['R-001', 'P-001', 'D-001'] },
    readback: { api: 'PASS', browserReload: 'PASS', databaseCommit: 'PASS', reloadReadbackSha256: '3'.repeat(64) },
    jenfuInvariant: { beforeSha256: '4'.repeat(64), afterSha256: '4'.repeat(64), zeroLeakCount: 0 },
    sideEffects: { gcsWriter: 'disabled', outboxConsumer: 'disabled', externalNotification: 'disabled' }, result: 'PASS',
  })
}

test('QA-117-001 clean source freeze', () => {
  const sourceLock = validSourceLock()
  assert.equal(assertDev117SourceLock(sourceLock, config).status, 'FROZEN')
  const trackedPaths = [...config.source.requiredTrackedFiles]
  const contents = Object.fromEntries(trackedPaths.map((pathname) => [pathname, Buffer.from(`fixture:${pathname}`)]))
  contents['config/release/dev117-ai-pdm-independent-production.json'] = Buffer.from(JSON.stringify(config))
  const dirty = inspectDev117Source({
    config, branch: 'main', headRevision: sourceRevision, headTree: sourceTree, trackedPaths, fileContentsByPath: contents,
    packageScripts: config.source.requiredPackageScripts, packageLockBytes: Buffer.from('fixture:package-lock'),
    workingTree: { isClean: false, staged: [], unstaged: ['Dockerfile'], untracked: [] },
  })
  assert.equal(buildDev117SourceLock({ config, releaseId, runId, createdAt: now, sourceInspection: dirty }).status, 'INVALIDATED')
})

test('QA-117-002 neutral target exactness and legacy deny', () => {
  assert.equal(assertDev117Config(config).target.projectId, 'jenfu-platform-prod')
  for (const mutate of [
    (value) => { value.target.projectId = 'jenfu-ai-pdm-prod' },
    (value) => { value.target.canonicalOrigin = 'https://jenfu-ai-pdm-prod.web.app' },
    (value) => { value.target.runtimeIdentity = 'pdm-runtime@jenfu-ai-pdm-prod.iam.gserviceaccount.com' },
  ]) {
    const mutant = structuredClone(config)
    mutate(mutant)
    assert.throws(() => assertDev117Config(resignProfile(mutant)), /DEV117_(?:NEUTRAL_TARGET_INVALID|CROSS_APP_COMPONENT_FORBIDDEN)/u)
  }
})

test('QA-117-003 AI_PDM-only immutable artifact', () => {
  const source = validSourceLock()
  const artifact = validArtifact(source)
  assert.equal(assertDev117ArtifactReceipt(artifact, config, source).artifactDigest, digest)
  const mutable = rehash({ ...artifact, imageUri: `${config.application.imageRepository}:latest` })
  assert.throws(() => assertDev117ArtifactReceipt(mutable, config, source), /DEV117_ARTIFACT_RECEIPT_INVALID/u)
  const vulnerable = rehash({ ...artifact, vulnerabilities: { critical: 0, high: 1 } })
  assert.throws(() => assertDev117ArtifactReceipt(vulnerable, config, source), /DEV117_ARTIFACT_SECURITY_INVALID/u)
  const candidateSection = workflow.split('\n  candidate:')[1].split('\n  level4-access:')[0]
  assert.doesNotMatch(candidateSection, /docker\s+build|buildx|gcloud\s+builds/iu)
})

test('QA-117-004 environment Secret and database least privilege', () => {
  const source = validSourceLock()
  const artifact = validArtifact(source)
  const shared = validShared(source)
  const candidate = validCandidate(source, artifact, shared)
  assert.doesNotThrow(() => assertDev117CandidateReceipt(candidate, config, { sourceLock: source, artifactReceipt: artifact, sharedGateReceipt: shared }))
  const latest = structuredClone(candidate)
  latest.secretBindings.PDM_SESSION_CURRENT_SECRET.version = 'latest'
  assert.throws(() => assertDev117CandidateReceipt(rehash(latest), config, { sourceLock: source, artifactReceipt: artifact, sharedGateReceipt: shared }), /DEV117_SECRET_BINDING_INVALID/u)
  const owner = structuredClone(config)
  owner.database.runtimeRole = 'owner'
  assert.throws(() => assertDev117Config(resignProfile(owner)), /DEV117_DATABASE_BOUNDARY_INVALID/u)
  const foreign = structuredClone(config)
  foreign.database.schemas.push('orgmaster_core')
  assert.throws(() => assertDev117Config(resignProfile(foreign)), /DEV117_DATABASE_BOUNDARY_INVALID/u)
})

test('QA-117-005 first-revision holding safety', () => {
  assert.deepEqual(planDev117Candidate({ config, serviceExists: true, sharedGate: null }), { disposition: 'DEPLOY_DIGEST_ONLY_ZERO_TRAFFIC', holdingRequired: false, firstRevisionClaimedZeroTraffic: false })
  assert.equal(planDev117Candidate({ config, serviceExists: false, sharedGate: { holding: null } }).disposition, 'BLOCKED_REQUIRE_DEV010_R1_04F')
  const holding = { schemaVersion: config.dependencies.holdingReceiptSchema, serviceName: config.target.serviceName, status: 'HOLDING_READY', assignedTrafficPercent: 100, reachabilityDenialControl: 'DEFAULT_URL_DISABLED_INTERNAL_INGRESS_PRIVATE_IAM', runtimeRoleBindings: 0, receiptRef: 'evidence/dev010/holding.json' }
  const plan = planDev117Candidate({ config, serviceExists: false, sharedGate: { holding } })
  assert.equal(plan.disposition, 'REQUIRE_PROVIDER_READBACK_AFTER_HOLDING')
  assert.equal(plan.firstRevisionClaimedZeroTraffic, false)
})

test('QA-117-006 digest-only zero-traffic candidate', () => {
  const source = validSourceLock()
  const artifact = validArtifact(source)
  const shared = validShared(source)
  const candidate = validCandidate(source, artifact, shared)
  assert.equal(assertDev117CandidateReceipt(candidate, config, { sourceLock: source, artifactReceipt: artifact, sharedGateReceipt: shared }).candidatePercent, 0)
  for (const mutate of [
    (value) => { value.candidatePercent = 1 },
    (value) => { value.tag = 'candidate' },
    (value) => { value.buildExecutions = 1 },
    (value) => { value.progress = { state: 'READBACK_REQUIRED', outcomeKnown: false, replayAttempted: true } },
  ]) {
    const mutant = structuredClone(candidate)
    mutate(mutant)
    assert.throws(() => assertDev117CandidateReceipt(rehash(mutant), config, { sourceLock: source, artifactReceipt: artifact, sharedGateReceipt: shared }))
  }
})

test('QA-117-007 independent access and same-candidate Production Level 4 join', () => {
  const candidate = validCandidate()
  const access = validAccess(candidate)
  const r02 = validR02(candidate)
  assert.equal(assertDev117Level4Join({ config, candidateReceipt: candidate, accessReceipt: access, dev116Receipt: r02, evaluatedAt: now }).status, 'LEVEL4_VERIFIED')
  const crossCandidate = validR02({ ...candidate, revisionName: 'ai-pdm-prod-r117-otherrev' })
  assert.throws(() => assertDev117Level4Join({ config, candidateReceipt: candidate, accessReceipt: access, dev116Receipt: crossCandidate, evaluatedAt: now }), /DEV117_LEVEL4_JOIN_INVALID/u)
  const expired = rehash({ ...access, expiresAt: now })
  assert.throws(() => assertDev117Level4AccessReceipt(expired, config, candidate, now), /DEV117_LEVEL4_ACCESS_EXPIRED/u)
})

test('QA-117-008 tenant zero-leak and side-effect disabled', () => {
  const candidate = validCandidate()
  const access = validAccess(candidate)
  const valid = validR02(candidate)
  assert.doesNotThrow(() => assertDev117Level4Join({ config, candidateReceipt: candidate, accessReceipt: access, dev116Receipt: valid, evaluatedAt: now }))
  const leak = structuredClone(valid)
  delete leak.evidenceSha256
  leak.jenfuInvariant = { beforeSha256: '4'.repeat(64), afterSha256: '5'.repeat(64), zeroLeakCount: 1 }
  leak.evidenceSha256 = sha256(canonicalizeDev116(leak))
  assert.throws(() => assertDev117Level4Join({ config, candidateReceipt: candidate, accessReceipt: access, dev116Receipt: leak, evaluatedAt: now }), /DEV116_R02_RECEIPT_INVALID/u)
  const effectsCore = structuredClone(valid)
  delete effectsCore.evidenceSha256
  effectsCore.sideEffects.externalNotification = 'enabled'
  effectsCore.evidenceSha256 = sha256(canonicalizeDev116(effectsCore))
  assert.throws(() => assertDev117Level4Join({ config, candidateReceipt: candidate, accessReceipt: access, dev116Receipt: effectsCore, evaluatedAt: now }), /DEV116_R02_RECEIPT_INVALID/u)
})

test('QA-117-009 cross-app mutation boundary', () => {
  const clean = { aiPdmArtifactMutations: 1, aiPdmServiceMutations: 1, aiPdmTrafficChanges: 0, platformArtifactMutations: 0, platformServiceMutations: 0, platformTrafficChanges: 0, orgmasterMutations: 0, databaseMutations: 0 }
  assert.equal(assertDev117CrossAppMutationBoundary(clean).platformServiceMutations, 0)
  assert.throws(() => assertDev117CrossAppMutationBoundary({ ...clean, platformTrafficChanges: 1 }), /DEV117_CROSS_APP_MUTATION_FOUND/u)
  assert.doesNotMatch(workflow, /(?:run\s+deploy|update-traffic)\s+["']?jenfu-platform-prod/iu)
})

test('QA-117-010 separate promotion and canonical entry', () => {
  const candidate = validCandidate()
  const access = validAccess(candidate)
  const r02 = validR02(candidate)
  const request = finalizeEvidence({
    schemaVersion: 'jenfu.dev117.promotion-request.v1', releaseId, candidateReceiptSha256: candidate.evidenceSha256,
    level4AccessReceiptSha256: access.evidenceSha256, dev116ReceiptSha256: r02.evidenceSha256,
    revisionName: candidate.revisionName, imageDigest: candidate.imageDigest, canonicalOrigin: config.target.canonicalOrigin,
    productOwnerDecision: 'GO', approval: config.workflow.approvals.promotion, openP0: 0, openP1: 0,
    rollbackReady: true, requestedAt: now, credentialMaterialPresent: false,
  })
  assert.doesNotThrow(() => assertDev117PromotionRequest(request, config, { candidateReceipt: candidate, accessReceipt: access, dev116Receipt: r02 }))
  assert.match(workflow, /inputs\.stage\s*==\s*'promote'/u)
  assert.match(workflow, /https:\/\/pdm\.jenfu\.com\.tw/u)
  const candidateSection = workflow.split('\n  candidate:')[1].split('\n  level4-access:')[0]
  assert.doesNotMatch(candidateSection, /update-traffic[^\n]*--to-revisions/iu)
})

test('QA-117-011 AI_PDM-only traffic rollback', () => {
  const receipt = finalizeEvidence({
    schemaVersion: 'jenfu.dev117.rollback-receipt.v1', releaseId, projectId: config.target.projectId,
    region: config.target.region, serviceName: config.target.serviceName, failedRevision: revision,
    restoredRevision: 'ai-pdm-prod-r116-previous', failedRevisionPercent: 0, restoredRevisionPercent: 100,
    platformMutationCount: 0, databaseMutationCount: 0, downMigrations: 0, deletedRevisions: 0,
    outcome: 'ROLLED_BACK', providerReadbackSha256: '6'.repeat(64), observedAt: now, credentialMaterialPresent: false,
  })
  assert.doesNotThrow(() => assertDev117RollbackReceipt(receipt, config))
  assert.throws(() => assertDev117RollbackReceipt(rehash({ ...receipt, platformMutationCount: 1 }), config), /DEV117_ROLLBACK_RECEIPT_INVALID/u)
  assert.match(workflow, /DEV117_ROLLBACK_AI_PDM_ONLY NO_DOWN_MIGRATION/u)
})

test('QA-117-012 live receipt and Platform read-only consumption', () => {
  const verifiedAt = now
  const receipt = finalizeEvidence({
    schemaVersion: 'jenfu.app.release-receipt.v1', applicationId: 'ai-pdm', environment: 'production', releaseId,
    sourceRevision, sourceTree, artifactDigest: digest, serviceName: config.target.serviceName, serviceRevision: revision,
    canonicalOrigin: config.target.canonicalOrigin, status: 'LIVE_VERIFIED', verifiedAt, expiresAt: expiry,
    smokeEvidenceRef: 'evidence/dev117/canonical-smoke.json', rollbackEvidenceRef: 'evidence/dev117/rollback-readiness.json',
    credentialMaterialPresent: false,
  })
  const before = structuredClone(receipt)
  const consumed = assertDev117AppReleaseReceipt(receipt, config, now)
  assert.equal(consumed.status, 'LIVE_VERIFIED')
  assert.deepEqual(receipt, before)
  const legacy = rehash({ ...receipt, canonicalOrigin: 'https://jenfu-ai-pdm-prod.web.app' })
  assert.throws(() => assertDev117AppReleaseReceipt(legacy, config, now), /DEV117_APP_RELEASE_RECEIPT_INVALID/u)
  const credential = rehash({ ...receipt, smokeEvidenceRef: 'token=not-allowed-value' })
  assert.throws(() => assertDev117AppReleaseReceipt(credential, config, now), /DEV117_(?:APP_RELEASE_RECEIPT_INVALID|CREDENTIAL_MATERIAL_FOUND)/u)
})
