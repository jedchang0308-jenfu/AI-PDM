import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { assertDev013PredecessorReceipt, buildDev013TransitionAuthority, buildInfraReuseReceipt, buildReleaseIntent, buildRoutineAuthority, buildRuntimeConfigReceipt, buildSourceFreeze, parsePrerequisiteProducerArgs, resolveOwnerInputPath, resolveProtectedReleaseRef } from './lib/dev012-owner-prerequisite-producer.mjs'
import { canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { DEV013_L4_FORWARD_STEPS, dev013L4SequenceStep } from './lib/dev013-l4-transition-sequence.mjs'

const H40 = 'a'.repeat(40)
const H64 = 'b'.repeat(64)
const NOW = '2026-09-08T00:00:00.000Z'
const profile = {
  application: { id: 'platform', repository: 'owner/platform', branch: 'main' },
  target: { projectId: 'project', runtimeServiceAccount: 'runtime@project.iam.gserviceaccount.com', region: 'region' },
  artifact: { releaseBucket: 'owner-bucket', uri: 'region.pkg.dev/project/repo/app', migrationRunnerUri: 'region.pkg.dev/project/repo/migration' },
  schemas: { releaseIntent: 'owner.intent.v2' },
  runtime: { containerName: 'app', cloudSqlProxyContainer: 'proxy', cloudSqlProxyImage: 'proxy@sha256:' + 'c'.repeat(64), port: 8080, cloudSqlProxyPort: 5432, concurrency: 20, timeoutSeconds: 60, maxInstances: 1, network: 'vpc', subnet: 'subnet', cpu: '1', memory: '512Mi', startupProbePath: '/ready', cloudSqlProxyMaximumConnections: 24, cloudSqlConnectionName: 'project:region:instance' },
  environment: { requiredPlainEnvironmentNames: ['NODE_ENV'], requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'session-secret' } },
}
const ref = (name) => ({ uri: `gs://owner-bucket/receipts/releases/REL-001/${name}.json`, sha256: H64 })
const sourceLock = buildSourceFreeze({ profile, releaseId: 'REL-001', observedAt: NOW, git: { clean: true, branch: 'main', sourceRevision: H40, sourceTree: 'c'.repeat(40), remoteRevision: H40 }, sourceIdentityBytes: Buffer.from('tree-manifest'), migrationBundle: { bundle: { manifestSha256: H64 } } })

test('source freeze accepts a clean detached checkout only at the exact protected remote ref', () => {
  const input = { localBranch: 'main', protectedBranch: 'main', sourceRevision: H40, remoteRevision: H40 }
  assert.equal(resolveProtectedReleaseRef(input), 'main')
  assert.equal(resolveProtectedReleaseRef({ ...input, localBranch: '' }), 'main')
  for (const changed of [
    { localBranch: 'feature/unreviewed' },
    { remoteRevision: 'c'.repeat(40) },
    { sourceRevision: 'invalid' },
  ]) assert.throws(() => resolveProtectedReleaseRef({ ...input, ...changed }), /SOURCE_NOT_FROZEN_AT_OFFICIAL_REMOTE/u)
})

test('source freeze binds clean official remote revision, canonical tree identity and migration manifest', () => {
  assert.equal(sourceLock.status, 'SOURCE_FROZEN')
  assert.equal(sourceLock.releaseAuthority, true)
  assert.equal(sourceLock.sourceSha256, sha256(Buffer.from('tree-manifest')))
  assert.throws(() => buildSourceFreeze({ profile, releaseId: 'REL-001', observedAt: NOW, git: { ...sourceLock, clean: false }, sourceIdentityBytes: Buffer.from('tree-manifest'), migrationBundle: { bundle: { manifestSha256: H64 } } }), /SOURCE_FREEZE_INPUT_INVALID/)
})

test('runtime receipt contains a complete immutable two-container template without secret bytes', () => {
  const receipt = buildRuntimeConfigReceipt({ profile, releaseId: 'REL-001', sourceLock, plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '7' }, observedAt: NOW })
  assert.equal(receipt.runtimeConfig.template.containers.length, 2)
  assert.equal(receipt.runtimeConfig.template.containers[0].env[1].valueSource.secretKeyRef.version, '7')
  assert.equal(JSON.stringify(receipt).includes('secret-value'), false)
})

test('release intent accepts only owner refs and release-authority prerequisites', () => {
  const input = { sourceLockRef: ref('source-lock'), authorizationPolicyRef: ref('authorization'), readinessReceiptRef: ref('readiness'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'), runtimeConfigRef: ref('runtime'), previousRevision: 'platform-00001-old', deadlineAt: '2999-01-01T00:00:00.000Z' }
  const runtime = buildRuntimeConfigReceipt({ profile, releaseId: 'REL-001', sourceLock, plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '7' }, observedAt: NOW })
  const common = { releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', status: 'PASS', projectId: 'project' }
  const values = { sourceLock, authorization: { ...common, environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' }, readiness: { ...common, environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' }, foundation: { ...common, ownerApplicationId: 'shared-foundation', sourceRevision: 'f'.repeat(40) }, infra: { ...common, migrationRunnerDigest: profile.artifact.migrationRunnerUri + '@sha256:' + 'd'.repeat(64) }, runtimeConfig: runtime }
  const intent = buildReleaseIntent({ profile, releaseId: 'REL-001', input, sourceLock, prerequisiteValues: values, validateIntent: () => true })
  assert.equal(intent.sourceRevision, H40)
  assert.throws(() => buildReleaseIntent({ profile, releaseId: 'REL-001', input, sourceLock, prerequisiteValues: { ...values, runtimeConfig: { ...values.runtimeConfig, ownerApplicationId: 'sibling' } }, validateIntent: () => true }), /PREREQUISITE_OWNER_MISMATCH/)
  assert.throws(() => buildReleaseIntent({ profile, releaseId: 'REL-001', input, sourceLock, prerequisiteValues: { ...values, infra: { ...values.infra, sourceRevision: 'f'.repeat(40) } }, validateIntent: () => true }), /PREREQUISITE_SOURCE_MISMATCH/)
  assert.throws(() => buildReleaseIntent({ profile, releaseId: 'REL-001', input: { ...input, foundationReceiptRef: { ...ref('foundation'), uri: 'gs://sibling/receipts/foundation.json' } }, sourceLock, prerequisiteValues: values, validateIntent: () => true }), /PREREQUISITE_REF_INVALID/)
})

test('release intent consumes source-bound infra reuse and rejects a tampered receipt', () => {
  const input = { sourceLockRef: ref('source-lock'), authorizationPolicyRef: ref('authorization'), readinessReceiptRef: ref('readiness'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra-reuse'), runtimeConfigRef: ref('runtime'), previousRevision: 'platform-00001-old', deadlineAt: '2999-01-01T00:00:00.000Z' }
  const foundation = { projectId: 'project', releaseAuthority: true, status: 'APPLIED', foundationManifestSha256: 'e'.repeat(64) }
  const common = { ownerApplicationId: 'platform', projectId: 'project', releaseAuthority: true, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' }
  const core = {
    schemaVersion: 'jenfu.dev012.app-infra-reuse-receipt.v1', ownerApplicationId: 'platform', projectId: 'project', region: 'region',
    releaseId: 'REL-001', sourceRevision: H40, foundationManifestSha256: foundation.foundationManifestSha256,
    reusedInfraReceiptRef: ref('infra-original'), reusedSourceRevision: 'f'.repeat(40),
    migrationRunnerDigest: profile.artifact.migrationRunnerUri + '@sha256:' + 'd'.repeat(64),
    controllerImageDigest: 'region.pkg.dev/project/repo/controller@sha256:' + 'c'.repeat(64),
    mutationProfile: 'APP_INFRA_REUSE', reuseBasis: 'APPLICATION_SOURCE_ONLY_NO_INFRA_EXECUTABLE_INPUT_CHANGE',
    status: 'APPLIED', releaseAuthority: true, evidenceScope: 'PRODUCTION_PROVIDER_REUSE', observedAt: NOW,
  }
  const infra = { ...core, receiptSha256: sha256(canonicalize(core)) }
  const values = { sourceLock, authorization: common, readiness: common, foundation, infra, runtimeConfig: buildRuntimeConfigReceipt({ profile, releaseId: 'REL-001', sourceLock, plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '7' }, observedAt: NOW }) }
  assert.equal(buildReleaseIntent({ profile, releaseId: 'REL-001', input, sourceLock, prerequisiteValues: values, validateIntent: () => true }).infraReceiptRef.uri, input.infraReceiptRef.uri)
  assert.throws(() => buildReleaseIntent({ profile, releaseId: 'REL-001', input, sourceLock, prerequisiteValues: { ...values, infra: { ...infra, receiptSha256: '0'.repeat(64) } }, validateIntent: () => true }), /APP_INFRA_REUSE_RECEIPT_INVALID/u)
})

test('source-bound infra reuse accepts only the exact provider receipt and unchanged digests', () => {
  const foundation = { foundationManifestSha256: 'e'.repeat(64) }
  const core = {
    schemaVersion: 'jenfu.dev012.app-infra-receipt.v1', ownerApplicationId: 'platform', projectId: 'project', region: 'region',
    sourceRevision: 'f'.repeat(40), foundationManifestSha256: foundation.foundationManifestSha256,
    migrationRunnerDigest: profile.artifact.migrationRunnerUri + '@sha256:' + 'd'.repeat(64),
    controllerImageDigest: 'region.pkg.dev/project/repo/controller@sha256:' + 'c'.repeat(64),
    status: 'APPLIED', releaseAuthority: true, evidenceScope: 'PRODUCTION_PROVIDER',
  }
  const original = { ...core, receiptSha256: sha256(canonicalize(core)) }
  const receipt = buildInfraReuseReceipt({ profile, releaseId: 'REL-001', sourceLock, foundation, existingInfra: original, existingInfraRef: ref('original-infra'), observedAt: NOW })
  assert.equal(receipt.sourceRevision, sourceLock.sourceRevision)
  assert.equal(receipt.reusedSourceRevision, core.sourceRevision)
  assert.equal(receipt.receiptSha256, sha256(canonicalize(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'receiptSha256')))))
  assert.throws(() => buildInfraReuseReceipt({ profile, releaseId: 'REL-001', sourceLock, foundation, existingInfra: { ...original, controllerImageDigest: 'other@sha256:' + 'c'.repeat(64) }, existingInfraRef: ref('original-infra'), observedAt: NOW }), /INFRA_REUSE_INPUT_INVALID/u)
})

test('AI-PDM WIF reuse requires the exact migration-only workflow binding', () => {
  const aiProfile = { ...profile, application: { id: 'ai-pdm', repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main' } }
  const aiSourceLock = { ...sourceLock, ownerApplicationId: 'ai-pdm' }
  const foundation = { foundationManifestSha256: 'e'.repeat(64) }
  const workflowRef = 'jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/main'
  const core = {
    schemaVersion: 'jenfu.dev012.app-infra-receipt.v1', ownerApplicationId: 'ai-pdm', projectId: 'project', region: 'region',
    sourceRevision: 'f'.repeat(40), foundationManifestSha256: foundation.foundationManifestSha256,
    migrationRunnerDigest: profile.artifact.migrationRunnerUri + '@sha256:' + 'd'.repeat(64),
    controllerImageDigest: 'region.pkg.dev/project/repo/controller@sha256:' + 'c'.repeat(64),
    mutationProfile: 'APP_INFRA_AIPDM_PRINCIPAL_MIGRATION_WIF', allowedWorkflowRefs: [workflowRef],
    status: 'APPLIED', releaseAuthority: true, evidenceScope: 'PRODUCTION_PROVIDER',
  }
  const original = { ...core, receiptSha256: sha256(canonicalize(core)) }
  assert.equal(buildInfraReuseReceipt({ profile: aiProfile, releaseId: 'REL-001', sourceLock: aiSourceLock, foundation, existingInfra: original, existingInfraRef: ref('wif-infra'), observedAt: NOW }).reusedSourceRevision, core.sourceRevision)
  const missing = { ...core, allowedWorkflowRefs: [] }
  assert.throws(() => buildInfraReuseReceipt({ profile: aiProfile, releaseId: 'REL-001', sourceLock: aiSourceLock, foundation, existingInfra: { ...missing, receiptSha256: sha256(canonicalize(missing)) }, existingInfraRef: ref('wif-infra'), observedAt: NOW }), /INFRA_REUSE_INPUT_INVALID/u)
})

test('routine authority binds a fresh source to the exact active baseline without inventing a controlled transition', () => {
  const runtime = buildRuntimeConfigReceipt({ profile, releaseId: 'REL-001', sourceLock, plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '7' }, observedAt: NOW })
  const dataCutoverCompletionRef = ref('data-cutover-completion')
  const result = buildRoutineAuthority({ profile, releaseId: 'REL-001', sourceLock, runtimeConfigReceipt: runtime, baselineIntentRef: ref('baseline-intent'), dataCutoverCompletionRef, previousRevision: 'ai-pdm-prod-00001-old', observedAt: NOW, expiresAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.authorization.schemaVersion, 'jenfu.dev012.routine-owner-authorization.v1')
  assert.equal(result.authorization.authorizationBasis, 'OPERATOR_INVOKED_DEPLOY_PRODUCTION')
  assert.deepEqual(result.readiness.baselineIntentRef, ref('baseline-intent'))
  assert.deepEqual(result.readiness.dataCutoverCompletionRef, dataCutoverCompletionRef)
  assert.equal(result.readiness.previousRevision, 'ai-pdm-prod-00001-old')
  assert.throws(() => buildRoutineAuthority({ profile, releaseId: 'REL-001', sourceLock, runtimeConfigReceipt: runtime, baselineIntentRef: ref('baseline-intent'), dataCutoverCompletionRef: { ...dataCutoverCompletionRef, uri: 'gs://sibling/receipts/completion.json' }, previousRevision: 'ai-pdm-prod-00001-old', observedAt: NOW, expiresAt: '2999-01-01T00:00:00.000Z' }), /PREREQUISITE_REF_INVALID/)
})

test('DEV-013 transition authority binds provider baseline, desired runtime and verified predecessor', () => {
  const transitionProfile = structuredClone(profile)
  transitionProfile.application.id = 'ai-pdm'
  transitionProfile.target.projectId = 'jenfu-platform-prod'
  transitionProfile.target.region = 'asia-east1'
  transitionProfile.environment.requiredPlainEnvironmentNames = ['NODE_ENV', 'PDM_JENFU_SSO_HANDOFF_MODE']
  transitionProfile.environment.controlledValues = { PDM_JENFU_SSO_HANDOFF_MODE: { defaultValue: 'off', allowedValues: ['off', 'on'] } }
  const aiSourceLock = buildSourceFreeze({ profile: transitionProfile, releaseId: 'REL-001', observedAt: NOW, git: { clean: true, branch: 'main', sourceRevision: H40, sourceTree: 'c'.repeat(40), remoteRevision: H40 }, sourceIdentityBytes: Buffer.from('tree-manifest'), migrationBundle: { bundle: { manifestSha256: H64 } } })
  const previousControlledEnvironment = { PDM_JENFU_SSO_HANDOFF_MODE: null }
  const controlledEnvironment = { PDM_JENFU_SSO_HANDOFF_MODE: 'off' }
  const predecessorRef = { uri: 'gs://jenfu-platform-prod-orgmaster-release/receipts/dev013/g2.json', sha256: H64 }
  const transition = { field: 'PDM_JENFU_SSO_HANDOFF_MODE', from: null, to: 'off', action: 'guard', predecessorReceiptRef: predecessorRef }
  const currentStep = dev013L4SequenceStep('ai-pdm', transition, previousControlledEnvironment, controlledEnvironment)
  const sequenceRoot = { schemaVersion: 'jenfu.dev013.l4-sequence-root.v2', authorizationId: 'DEV013-L4-AUTH-TEST0001', authorizationStatementSha256: '1'.repeat(64), manifestSha256: '2'.repeat(64), authorizedAt: NOW, expiresAt: '2026-09-08T08:00:00.000Z', receiptRef: { uri: 'gs://jenfu-platform-prod-platform-release/receipts/dev013/root.json', sha256: 'e'.repeat(64) } }
  const terminalCore = { schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'orgmaster', releaseId: 'REL-G2', sourceRevision: 'c'.repeat(40), stage: 'terminal', previousReceiptRef: null, facts: { result: 'RELEASED', remainingHumanAction: 0, dev013Transition: { schemaVersion: 'jenfu.dev013.l4-terminal-transition.v2', sequenceRoot, sequenceStep: DEV013_L4_FORWARD_STEPS[1], predecessorReceiptRef: sequenceRoot.receiptRef } }, observedAt: NOW, status: 'PASS' }
  const terminalReceipt = { ...terminalCore, receiptSha256: sha256(canonicalize(terminalCore)) }
  const predecessorEvidence = { ...assertDev013PredecessorReceipt(terminalReceipt, predecessorRef, transitionProfile, NOW, currentStep), currentStep }
  const runtime = buildRuntimeConfigReceipt({ profile: transitionProfile, releaseId: 'REL-001', sourceLock: aiSourceLock, plainEnvironment: { NODE_ENV: 'production', ...controlledEnvironment }, secretVersions: { SESSION_SECRET: '7' }, observedAt: NOW })
  const result = buildDev013TransitionAuthority({ profile: transitionProfile, releaseId: 'REL-001', sourceLock: aiSourceLock, runtimeConfigReceipt: runtime, previousRevision: 'service-00001-old', previousControlledEnvironment, transition, predecessorEvidence, observedAt: NOW, expiresAt: '2026-09-08T08:00:00.000Z' })
  assert.equal(result.authorization.authorizationBasis, 'OPERATOR_INVOKED_DEV013_L4')
  assert.deepEqual(result.readiness.controlledEnvironment, controlledEnvironment)
  assert.equal(result.readiness.sequenceStep.stepId, 'G3_AI_PDM_GUARD')
  assert.equal(result.readiness.previousRevision, 'service-00001-old')
  assert.throws(() => buildDev013TransitionAuthority({ profile: transitionProfile, releaseId: 'REL-001', sourceLock: aiSourceLock, runtimeConfigReceipt: runtime, previousRevision: 'service-00001-old', previousControlledEnvironment: controlledEnvironment, transition, predecessorEvidence, observedAt: NOW, expiresAt: '2026-09-08T08:00:00.000Z' }), /DEV013_TRANSITION_NOOP_DENIED/)
})

test('CLI exposes the guarded DEV-013 transition authority stage', () => {
  assert.deepEqual(parsePrerequisiteProducerArgs(['--stage', 'source-freeze', '--release-id', 'REL-001']), { stage: 'source-freeze', releaseId: 'REL-001', inputPath: null })
  assert.deepEqual(parsePrerequisiteProducerArgs(['--stage', 'dev013-transition-authority', '--release-id', 'REL-001', '--input', 'output/dev-013/l4/inputs/transition.json']), { stage: 'dev013-transition-authority', releaseId: 'REL-001', inputPath: 'output/dev-013/l4/inputs/transition.json' })
  assert.deepEqual(parsePrerequisiteProducerArgs(['--stage', 'routine-authority', '--release-id', 'REL-001', '--input', 'output/dev-012/inputs/routine.json']), { stage: 'routine-authority', releaseId: 'REL-001', inputPath: 'output/dev-012/inputs/routine.json' })
  assert.throws(() => parsePrerequisiteProducerArgs(['--stage', 'release-intent', '--release-id', 'REL-001']), /INVALID_ARGUMENTS/)
  assert.equal(resolveOwnerInputPath('/owner', 'output/dev-012/inputs/runtime.json').endsWith(['owner', 'output', 'dev-012', 'inputs', 'runtime.json'].join(path.sep)), true)
  assert.equal(resolveOwnerInputPath('/owner', 'output/dev-013/l4/inputs/transition.json').endsWith(['owner', 'output', 'dev-013', 'l4', 'inputs', 'transition.json'].join(path.sep)), true)
  assert.throws(() => resolveOwnerInputPath('/owner', '../sibling/secret.json'), /INPUT_PATH_OUT_OF_SCOPE/)
})
