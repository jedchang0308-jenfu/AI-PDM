import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildInfraReuseReceipt, buildReleaseIntent, buildRoutineAuthority, buildRuntimeConfigReceipt, buildSourceFreeze } from './lib/dev012-owner-prerequisite-producer.mjs'
import { canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { normalizeOwnerChain } from './lib/dev117-owner-chain-preflight.mjs'

const profile = JSON.parse(readFileSync(new URL('../config/release/dev117-ai-pdm-independent-production-v3.json', import.meta.url)))
const SOURCE_REVISION = '937db2bb54e0692495b558f252e20cfbe565af94'
const SOURCE_TREE = '1'.repeat(40)
const RUNNER_REVISION = 'c255b1dfff2ddbfa1f6a331f9e0c1f3ce3d9fade'
const RELEASE_ID = 'DEV122-GOLDEN-CHAIN-20261021'
const OBSERVED_AT = '2026-10-21T00:00:00.000Z'
const DEADLINE_AT = '2999-01-01T00:00:00.000Z'
const H64 = 'a'.repeat(64)
const ref = name => ({ uri: `gs://${profile.artifact.releaseBucket}/receipts/releases/${RELEASE_ID}/${name}.json`, sha256: H64 })

function providerJob(digest, sourceRevision) {
  return {
    name: `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`,
    uid: 'ai-pdm-golden-job', generation: '38', observedGeneration: '38', etag: 'golden-etag', updateTime: OBSERVED_AT,
    terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    template: { taskCount: 1, parallelism: 1, template: {
      serviceAccount: profile.migrations.serviceAccount, maxRetries: 0, timeout: '1800s',
      containers: [{ name: 'migration', image: digest, env: [{ name: 'PDM_SOURCE_REVISION', value: sourceRevision }] }],
    } },
  }
}

function fixture({ infraSchema = 'jenfu.dev012.app-infra-receipt.v1' } = {}) {
  const sourceIdentity = Buffer.from('exact-merged-main-tree-937db2bb54e0692495b558f252e20cfbe565af94')
  const sourceLock = buildSourceFreeze({ profile, releaseId: RELEASE_ID, observedAt: OBSERVED_AT,
    git: { clean: true, branch: 'main', sourceRevision: SOURCE_REVISION, sourceTree: SOURCE_TREE, remoteRevision: SOURCE_REVISION },
    sourceIdentityBytes: sourceIdentity, migrationBundle: { bundle: { manifestSha256: H64 } } })
  const plainEnvironment = {
    ...profile.environment.fixedValues,
    PDM_FIREBASE_API_KEY: 'golden-test-api-key', PDM_FIREBASE_APP_ID: 'golden-test-app-id', PDM_JENFU_SSO_HANDOFF_MODE: 'off',
  }
  const secretVersions = Object.fromEntries(profile.environment.requiredSecretNames.map(name => [name, '7']))
  const runtimeConfig = buildRuntimeConfigReceipt({ profile, releaseId: RELEASE_ID, sourceLock, plainEnvironment, secretVersions, observedAt: OBSERVED_AT })
  const foundation = { ownerApplicationId: 'ai-pdm', projectId: profile.target.projectId, status: 'APPLIED', releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND', foundationManifestSha256: 'b'.repeat(64) }
  const baselineRef = ref('baseline-intent')
  const authority = buildRoutineAuthority({ profile, releaseId: RELEASE_ID, sourceLock, runtimeConfigReceipt: runtimeConfig,
    baselineIntentRef: baselineRef, previousRevision: 'ai-pdm-prod-1be8986b68ce', observedAt: OBSERVED_AT, expiresAt: DEADLINE_AT })
  const migrationRunnerDigest = `${profile.artifact.migrationRunnerUri}@sha256:${'c'.repeat(64)}`
  const controllerImageDigest = `${profile.artifact.uri.slice(0, profile.artifact.uri.lastIndexOf('/'))}/controller@sha256:${'d'.repeat(64)}`
  const existingCore = {
    schemaVersion: infraSchema, ownerApplicationId: 'ai-pdm', projectId: profile.target.projectId, region: profile.target.region,
    sourceRevision: RUNNER_REVISION, reusedSourceRevision: RUNNER_REVISION, foundationManifestSha256: foundation.foundationManifestSha256,
    migrationRunnerDigest, controllerImageDigest, mutationProfile: 'APP_INFRA_REUSE', reuseBasis: 'APPLICATION_SOURCE_ONLY_NO_INFRA_EXECUTABLE_INPUT_CHANGE',
    status: 'APPLIED', releaseAuthority: true, evidenceScope: infraSchema.endsWith('.v2') ? 'PRODUCTION_PROVIDER_REUSE' : 'PRODUCTION_PROVIDER', observedAt: OBSERVED_AT,
  }
  const existingInfra = { ...existingCore, receiptSha256: sha256(canonicalize(existingCore)) }
  const infra = buildInfraReuseReceipt({ profile, releaseId: RELEASE_ID, sourceLock, foundation, existingInfra,
    existingInfraRef: ref('c95-app-infra'), providerJob: providerJob(migrationRunnerDigest, RUNNER_REVISION), observedAt: OBSERVED_AT })
  const input = { sourceLockRef: ref('source-lock'), authorizationPolicyRef: ref('authorization'), readinessReceiptRef: ref('readiness'),
    foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'), runtimeConfigRef: ref('runtime'),
    previousRevision: 'ai-pdm-prod-1be8986b68ce', deadlineAt: DEADLINE_AT, baselineIntentRef: baselineRef }
  const intent = buildReleaseIntent({ profile, releaseId: RELEASE_ID, input, sourceLock,
    prerequisiteValues: { sourceLock, authorization: authority.authorization, readiness: authority.readiness, foundation, infra, runtimeConfig }, validateIntent: () => true })
  const ledgerReadback = { ledger: profile.migrations.ledger, ledgerCount: profile.migrations.entries.length, migration085: 'APPLIED', sourceRevision: RUNNER_REVISION }
  const migration = { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: SOURCE_REVISION,
    manifestSha256: H64, boundaryStatus: 'PASS', status: 'PASS', ledgerReadback,
  }
  migration.ledgerReadback.readbackSha256 = sha256(canonicalize(ledgerReadback))
  const build = { schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: SOURCE_REVISION,
    artifactDigest: `${profile.artifact.uri}@sha256:${'e'.repeat(64)}`, sourceObject: { sha256: 'f'.repeat(64) }, status: 'PASS', deadlineAt: DEADLINE_AT }
  const tag = `candidate-${'1'.repeat(12)}`
  const host = new URL(profile.target.canonicalOrigin).host
  const candidate = { schemaVersion: 'jenfu.dev117.candidate-decision.v1', status: 'READY_FOR_CANDIDATE', sourceRevision: SOURCE_REVISION,
    previousRevision: input.previousRevision, artifactDigest: build.artifactDigest, deadlineAt: DEADLINE_AT, trafficPercent: 0,
    tag, tagUri: `https://${tag}---${host}`, candidateRevision: 'ai-pdm-prod-golden-candidate', providerWriteCount: 0 }
  const activation = { schemaVersion: 'jenfu.dev117.activation-decision.v1', status: 'READY_FOR_ACTIVATE', sourceRevision: SOURCE_REVISION,
    candidateRevision: candidate.candidateRevision, providerWriteCount: 0,
    trafficPlan: [{ revision: candidate.candidateRevision, percent: 100 }, { revision: input.previousRevision, percent: 0 }] }
  const appliedMigrationContinuation = { schemaVersion: 'aipdm.applied-migration-continuation.v1', sourceRevision: RUNNER_REVISION,
    prepareRef: { uri: `gs://${profile.artifact.releaseBucket}/receipts/releases/DEV122-C95/${'2'.repeat(64)}/prepare.json`, sha256: H64 },
    migrateRef: { uri: `gs://${profile.artifact.releaseBucket}/receipts/releases/DEV122-C95/${'2'.repeat(64)}/migrate.json`, sha256: H64 },
    ledgerReadbackResultRef: { uri: `gs://${profile.artifact.releaseBucket}/receipts/releases/DEV122-C95/${'2'.repeat(64)}/ledger-readback-result.json`, sha256: H64 },
  }
  const worker = { descriptorRevision: RUNNER_REVISION, readerRevision: RUNNER_REVISION, readerCanReadRevision: RUNNER_REVISION,
    readerMode: 'historical', readerIsHistorical: false, descriptorDepth: 3, deadlineAt: DEADLINE_AT,
    secretVersionIamContinuation: { sourceRevision: RUNNER_REVISION, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER', payloadAccess: 'NOT_GRANTED',
      permissions: ['secretmanager.versions.get'], resources: [`projects/${profile.target.projectNumber}/secrets/aipdm-prod-openswx-reader-token/versions/7`], resourceScope: 'EXACT_SECRET_VERSION', ref: ref('secret-iam-continuation') } }
  return { profile, intent, values: { sourceLock, authorization: authority.authorization, readiness: authority.readiness, foundation, infra, runtimeConfig },
    infraInput: { existingInfra, existingInfraRef: ref('c95-app-infra'), providerJob: providerJob(migrationRunnerDigest, RUNNER_REVISION) },
    migration, build, candidate, activation, worker, appliedMigrationContinuation, isAncestor: (from, to) => from === RUNNER_REVISION && to === SOURCE_REVISION,
    sourceLock, infra, sourceIdentity, runtimeConfig, baselineRef }
}

test('production-shaped golden chain normalizes v1 reuse, historical reader and applied migration without provider writes', () => {
  const input = fixture()
  const model = normalizeOwnerChain({ ...input, now: OBSERVED_AT })
  assert.equal(input.sourceLock.sourceRevision, SOURCE_REVISION)
  assert.equal(model.status, 'READY_FOR_CANDIDATE')
  assert.equal(model.releaseEvidence.schemaVersion, 'jenfu.dev117.release-evidence.v1')
  assert.equal(model.releaseEvidence.mode, 'full_release')
  assert.equal(model.releaseEvidence.source.migrationRunnerRevision, RUNNER_REVISION)
  assert.equal(model.source.applicationRevision, SOURCE_REVISION)
  assert.equal(model.source.migrationRunnerRevision, RUNNER_REVISION)
  assert.equal(model.worker.validationMode, 'historical')
  assert.equal(model.worker.descriptorDepth, 3)
  assert.equal(model.migration.disposition, 'APPLIED_CONTINUATION_READBACK_ONLY')
  assert.deepEqual(model.decisions, { prepare: 'PASS', build: 'PASS', migrate: 'PASS', candidate: 'READY_FOR_CANDIDATE', activate: 'READY_FOR_ACTIVATE' })
  assert.equal(model.providerWrites, 0)
})

test('the same normalized model accepts a current reader and v2 reuse receipt', () => {
  const input = fixture({ infraSchema: 'jenfu.dev012.app-infra-reuse-receipt.v2' })
  input.worker = { ...input.worker, descriptorRevision: SOURCE_REVISION, readerRevision: SOURCE_REVISION, readerCanReadRevision: SOURCE_REVISION, readerMode: 'current', secretVersionIamContinuation: { ...input.worker.secretVersionIamContinuation, sourceRevision: SOURCE_REVISION } }
  input.appliedMigrationContinuation = null
  input.isAncestor = null
  input.migration.ledgerReadback.sourceRevision = SOURCE_REVISION
  const ledgerReadback = { ...input.migration.ledgerReadback }
  delete ledgerReadback.readbackSha256
  input.migration.ledgerReadback.readbackSha256 = sha256(canonicalize(ledgerReadback))
  const model = normalizeOwnerChain({ ...input, now: OBSERVED_AT })
  assert.equal(model.worker.validationMode, 'current')
  assert.equal(model.migration.disposition, 'FORWARD_MIGRATION_READBACK')
})

test('preflight fails closed for source/hash, deadline, IAM, receipt schema and migration readback drift', () => {
  const cases = [
    ['source hash drift', input => { input.values.sourceLock.sourceSha256 = '0'.repeat(64) }, /CHAIN_SOURCE_HASH_MISMATCH/u],
    ['expired deadline', input => { input.intent.deadlineAt = OBSERVED_AT }, /CHAIN_DEADLINE_EXPIRED/u],
    ['expanded IAM', input => { input.worker.secretVersionIamContinuation.permissions.push('secretmanager.secrets.get') }, /CHAIN_IAM_CONTINUATION_INVALID/u],
    ['unsupported receipt schema', input => { input.infraInput.existingInfra.schemaVersion = 'jenfu.dev012.app-infra-receipt.v9' }, /CHAIN_INFRA_RECEIPT_SCHEMA_UNSUPPORTED/u],
    ['migration readback mismatch', input => { input.migration.ledgerReadback.ledgerCount -= 1; input.migration.ledgerReadback.readbackSha256 = sha256(canonicalize(input.migration.ledgerReadback)) }, /CHAIN_MIGRATION_READBACK_INVALID/u],
  ]
  for (const [name, mutate, expected] of cases) {
    const input = fixture(); mutate(input)
    assert.throws(() => normalizeOwnerChain({ ...input, now: OBSERVED_AT }), expected, name)
  }
})

test('preflight rejects an unadmitted historical source even when the reader is marked current', () => {
  const input = fixture()
  input.worker.readerMode = 'current'
  assert.throws(() => normalizeOwnerChain({ ...input, now: OBSERVED_AT }), /CHAIN_WORKER_SOURCE_JOIN_INVALID/u)
})
