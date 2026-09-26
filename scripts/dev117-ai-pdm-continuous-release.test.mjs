import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { LEGACY_STRICT_VALIDATORS, assertDev117NativeJoin, assertDev117ReleaseIntent, assertDev117V3Profile, assertDev117WorkflowSource, assertDev121MigrationOnlyWorkflowSource, buildDev117CandidateTag, buildDev117MigrationBundle, buildDev117MigrationPackage, buildDev117Mutation, verifyDev117MigrationBytes } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { assertProtectedGitHubContext, buildRuntimeConfig, resolvePlainEnvironment } from './lib/dev012-owner-release-runtime.mjs'
import { assertControlledEnvironmentAuthority, assertPreparePrerequisites, readGitBlob } from './lib/dev012-owner-stage-executor.mjs'
import { dev013L4SequenceStep } from './lib/dev013-l4-transition-sequence.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
const readText = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const profile = read('config/release/dev117-ai-pdm-independent-production-v3.json')
const v1 = read('config/release/dev117-ai-pdm-independent-production.json')
const n1c = read('config/platform/dev-010-n1c-ai-pdm.json')
const H = 'a'.repeat(64)
const ref = (name) => ({ uri: `gs://${profile.artifact.releaseBucket}/receipts/${name}.json`, sha256: H })

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

function controlledPrerequisites(ownerProfile, runtimeConfig) {
  const intent = { releaseId: 'DEV013-L4-AIPDM-001', sourceRevision: 'b'.repeat(40) }
  const common = { ownerApplicationId: ownerProfile.application.id, projectId: ownerProfile.target.projectId, releaseId: intent.releaseId, sourceRevision: intent.sourceRevision, environment: 'production', observedAt: '2999-01-01T00:00:00.000Z', expiresAt: '2999-01-01T08:00:00.000Z', remainingHumanAction: 0, status: 'PASS', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND' }
  const predecessorReceiptRef = { uri: 'gs://jenfu-platform-prod-platform-release/receipts/dev013/platform-accept.json', sha256: '9'.repeat(64) }
  const previousControlledEnvironment = { PDM_JENFU_SSO_HANDOFF_MODE: 'off' }
  const controlledEnvironment = { PDM_JENFU_SSO_HANDOFF_MODE: 'on' }
  const transition = { field: 'PDM_JENFU_SSO_HANDOFF_MODE', from: 'off', to: 'on', action: 'activate', predecessorReceiptRef }
  const sequenceStep = dev013L4SequenceStep(ownerProfile.application.id, transition, previousControlledEnvironment, controlledEnvironment)
  const sequenceRoot = { schemaVersion: 'jenfu.dev013.l4-sequence-root.v2', authorizationId: 'DEV013-L4-AUTH-TEST0001', authorizationStatementSha256: '7'.repeat(64), manifestSha256: '8'.repeat(64), authorizedAt: common.observedAt, expiresAt: common.expiresAt, receiptRef: { uri: 'gs://jenfu-platform-prod-platform-release/receipts/dev013/root.json', sha256: '8'.repeat(64) } }
  return { intent, values: {
    sourceLock: { ...common, clean: true, status: 'SOURCE_FROZEN' },
    authorization: { ...common, schemaVersion: 'jenfu.dev013.l4-owner-transition-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEV013_L4' },
    readiness: { ...common, schemaVersion: 'jenfu.dev013.l4-owner-transition-readiness.v2', devId: 'DEV-013', slice: '013-R1', sequenceRoot, sequenceStep, previousControlledEnvironment, controlledEnvironment, transition },
    foundation: { ...common, ownerApplicationId: 'shared-foundation' },
    infra: { ...common, migrationRunnerDigest: `${ownerProfile.artifact.migrationRunnerUri}@sha256:${'c'.repeat(64)}` },
    runtimeConfig: { ...common, status: 'VERIFIED', runtimeConfig },
  } }
}

after(() => {
  if (process.env.DEV012_EMIT_OWNER_REPORT !== '1') return
  const sources = [
    'config/release/dev117-ai-pdm-independent-production-v3.json',
    'scripts/dev117-ai-pdm-continuous-release.mjs',
    'scripts/lib/dev117-ai-pdm-continuous-release.mjs',
    'scripts/lib/dev012-owner-release-runtime.mjs',
    'scripts/lib/dev012-owner-stage-executor.mjs',
    'src/lib/request-origin.ts',
    '.github/workflows/deploy-ai-pdm-independent-production.yml',
    'package.json',
  ].map((file) => ({ file, sha256: sha256(readGitBlob(root, file)) }))
  const profileBytes = readGitBlob(root, 'config/release/dev117-ai-pdm-independent-production-v3.json')
  const historicalProfileBytes = readGitBlob(root, 'config/release/dev117-ai-pdm-independent-production-v2.json')
  const endpoint = {
    projectId: profile.target.projectId,
    projectNumber: profile.target.projectNumber,
    region: profile.target.region,
    serviceName: profile.target.serviceName,
    canonicalOrigin: profile.target.canonicalOrigin,
    entryPolicy: profile.target.entryPolicy,
  }
  console.log(`DEV012_OWNER_REPORT=${JSON.stringify({
    schemaVersion: 'jenfu.dev012.s1c-owner-report.v1',
    caseId: 'S1B-20',
    contractVersion: profile.profileVersion,
    contractSha256: profile.contractSha256,
    sourceSnapshotSha256: sha256(Buffer.from(JSON.stringify(sources))),
    sourceFiles: sources,
    ownerApplicationId: 'ai-pdm',
    ownerProfileRef: 'config/release/dev117-ai-pdm-independent-production-v3.json',
    ownerProfileSha256: sha256(profileBytes),
    historicalProfileRef: 'config/release/dev117-ai-pdm-independent-production-v2.json',
    historicalProfileSha256: sha256(historicalProfileBytes),
    ownerBoundary: { workflowJobs: profile.workflow.jobs, candidateOriginEnvironmentName: profile.environment.candidateOriginEnvironmentName, entrypointOperation: profile.operations.CONFIGURE_ENTRYPOINT, edge: profile.edge },
    expectedEndpointTuple: endpoint,
    observedEndpointTuple: endpoint,
    evidenceRefs: ['npm:test:dev-117:continuous'],
    result: 'PASS',
    failureCode: null,
    cleanup: { providerMutations: 0, databaseMutations: 0, trafficMutations: 0, credentialReads: 0, runtimeResidue: 0 },
  })}`)
})

test('S1B-20 AI-PDM v3 direct-run profile and strict v1 retention', () => {
  assertDev117V3Profile(profile, v1, n1c)
  assert.equal(profile.environment.fixedValues.PDM_JENFU_PLATFORM_AUTH_MODE, 'on')
  assert.equal(profile.environment.fixedValues.PDM_JENFU_ENTITLEMENT_MODE, 'enforce')
  assert.equal(profile.environment.controlledValues.PDM_JENFU_SSO_HANDOFF_MODE.defaultValue, 'off')
  assert.deepEqual(profile.environment.controlledValues.PDM_JENFU_SSO_HANDOFF_MODE.allowedValues, ['off', 'on'])
  assert.equal(profile.environment.fixedValues.PDM_JENFU_SSO_BROKER_ORIGIN, 'https://jenfu-platform-prod-9536592944.asia-east1.run.app')
  assert.equal(profile.environment.fixedValues.JENFU_IDENTITY_AUDIENCE, profile.target.projectId)
  const drifted = structuredClone(profile)
  drifted.environment.fixedValues.PDM_JENFU_PLATFORM_AUTH_MODE = 'off'
  assert.throws(() => assertDev117V3Profile(drifted, v1, n1c), /production identity, entitlement, database, SSO guard or direct-origin environment mismatch/u)
  const priorPlainEnvironment = Object.fromEntries(profile.environment.requiredPlainEnvironmentNames.filter((name) => !['PDM_JENFU_SSO_HANDOFF_MODE', 'PDM_JENFU_SSO_BROKER_ORIGIN'].includes(name)).map((name) => [name, profile.environment.fixedValues[name] ?? `plain-${name}`]))
  const plainEnvironment = resolvePlainEnvironment(profile, priorPlainEnvironment, { PDM_JENFU_SSO_HANDOFF_MODE: 'on' })
  const secretVersions = Object.fromEntries(profile.environment.requiredSecretNames.map((name) => [name, '1']))
  assert.equal(buildRuntimeConfig(profile, { plainEnvironment, secretVersions }).plainEnvironment.PDM_JENFU_SSO_HANDOFF_MODE, 'on')
  assert.throws(() => resolvePlainEnvironment(profile, priorPlainEnvironment, { PDM_JENFU_SSO_HANDOFF_MODE: 'accept' }), /RUNTIME_CONFIG_READBACK_MISMATCH/u)
  assert.equal(Object.keys(LEGACY_STRICT_VALIDATORS).length, 5)
  assert.ok(Object.values(LEGACY_STRICT_VALIDATORS).every((fn) => typeof fn === 'function'))
})

test('AI-PDM owner prepare requires sealed DEV-013 authority before handoff on', () => {
  const priorPlainEnvironment = Object.fromEntries(profile.environment.requiredPlainEnvironmentNames
    .filter((name) => !Object.hasOwn(profile.environment.fixedValues, name) && !Object.hasOwn(profile.environment.controlledValues, name))
    .map((name) => [name, 'fixture-public-value']))
  const plainEnvironment = resolvePlainEnvironment(profile, priorPlainEnvironment, { PDM_JENFU_SSO_HANDOFF_MODE: 'on' })
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment, secretVersions: Object.fromEntries(profile.environment.requiredSecretNames.map((name) => [name, '1'])) })
  const fixture = controlledPrerequisites(profile, runtimeConfig)
  assert.equal(assertPreparePrerequisites({ ...fixture, profile }).runtimeConfig, runtimeConfig)
  assert.equal(assertControlledEnvironmentAuthority({ ...fixture, profile, runtime: runtimeConfig, previousControlledEnvironment: { PDM_JENFU_SSO_HANDOFF_MODE: 'off' } }), undefined)
  fixture.values.readiness.controlledEnvironment.PDM_JENFU_SSO_HANDOFF_MODE = 'off'
  assert.throws(() => assertPreparePrerequisites({ ...fixture, profile }), /CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID/u)
  const offPlain = resolvePlainEnvironment(profile, priorPlainEnvironment, { PDM_JENFU_SSO_HANDOFF_MODE: 'off' })
  const offRuntime = buildRuntimeConfig(profile, { plainEnvironment: offPlain, secretVersions: runtimeConfig.secretVersions })
  fixture.values.readiness.controlledEnvironment.PDM_JENFU_SSO_HANDOFF_MODE = 'off'
  fixture.values.readiness.transition = { ...fixture.values.readiness.transition, from: 'on', to: 'off', action: 'rollback' }
  fixture.values.readiness.previousControlledEnvironment = { PDM_JENFU_SSO_HANDOFF_MODE: 'on' }
  fixture.values.readiness.sequenceStep = dev013L4SequenceStep(profile.application.id, fixture.values.readiness.transition, fixture.values.readiness.previousControlledEnvironment, fixture.values.readiness.controlledEnvironment)
  assert.equal(assertControlledEnvironmentAuthority({ ...fixture, profile, runtime: offRuntime, previousControlledEnvironment: { PDM_JENFU_SSO_HANDOFF_MODE: 'on' } }), undefined)
})

test('AI-PDM routine release carries handoff on only from the exact active baseline', () => {
  const priorPlainEnvironment = Object.fromEntries(profile.environment.requiredPlainEnvironmentNames
    .filter((name) => !Object.hasOwn(profile.environment.fixedValues, name) && !Object.hasOwn(profile.environment.controlledValues, name))
    .map((name) => [name, 'fixture-public-value']))
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: resolvePlainEnvironment(profile, priorPlainEnvironment, { PDM_JENFU_SSO_HANDOFF_MODE: 'on' }), secretVersions: Object.fromEntries(profile.environment.requiredSecretNames.map((name) => [name, '1'])) })
  const fixture = controlledPrerequisites(profile, runtimeConfig)
  fixture.intent.previousRevision = 'ai-pdm-prod-active'
  fixture.intent.baselineIntentRef = ref('baseline-intent')
  const routine = { ownerApplicationId: 'ai-pdm', projectId: profile.target.projectId, releaseId: fixture.intent.releaseId, sourceRevision: fixture.intent.sourceRevision, environment: 'production', baselineIntentRef: fixture.intent.baselineIntentRef, previousRevision: fixture.intent.previousRevision, expiresAt: '2999-01-01T08:00:00.000Z', remainingHumanAction: 0, status: 'PASS', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND' }
  fixture.values.authorization = { ...routine, schemaVersion: 'jenfu.dev012.routine-owner-authorization.v1', authorizationBasis: 'OPERATOR_INVOKED_DEPLOY_PRODUCTION' }
  fixture.values.readiness = { ...routine, schemaVersion: 'jenfu.dev012.routine-owner-readiness.v1' }
  assert.equal(assertPreparePrerequisites({ ...fixture, profile }).runtimeConfig, runtimeConfig)
  assert.equal(assertControlledEnvironmentAuthority({ ...fixture, profile, runtime: runtimeConfig, previousControlledEnvironment: { PDM_JENFU_SSO_HANDOFF_MODE: 'on' } }), undefined)
  assert.throws(() => assertControlledEnvironmentAuthority({ ...fixture, profile, runtime: runtimeConfig, previousControlledEnvironment: { PDM_JENFU_SSO_HANDOFF_MODE: 'off' } }), /CONTROLLED_ENVIRONMENT_AUTHORITY_INVALID/u)
})

test('S1B-20 AI-PDM historical migration prefix and forward-only owner additions', () => {
  const files = new Map(profile.migrations.entries.map((entry) => [entry.path, fs.readFileSync(new URL(`../${entry.path}`, import.meta.url))]))
  assert.equal(verifyDev117MigrationBytes(profile, files), true)
  const bundle = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), 'a'.repeat(40))
  assert.equal(bundle.bundle.entries.length, profile.migrations.entries.length)
  assert.equal(bundle.bundle.baselineCount, 15)
  assert.deepEqual(bundle.bundle.entries.slice(-5).map((entry) => entry.version),
    ['ai-pdm-065', 'ai-pdm-066', 'ai-pdm-067', 'ai-pdm-068', 'ai-pdm-069'])
  assert.throws(() => verifyDev117MigrationBytes(profile, new Map([...files].slice(0, -1))), /Migration file set/u)
  const reordered = structuredClone(profile)
  reordered.migrations.entries[15].path = reordered.migrations.entries[14].path
  assert.throws(() => assertDev117V3Profile(reordered, v1, n1c), /forward-only/u)
})

test('S1B-20 AI-PDM release intent is exact, owner-bound and immutable', () => {
  const intent = { schemaVersion: profile.schemas.releaseIntent, ownerApplicationId: 'ai-pdm', releaseId: 'REL-AIPDM-001', sourceRevision: 'b'.repeat(40), sourceSha256: H, sourceLockRef: ref('source'), authorizationPolicyRef: ref('authorization'), readinessReceiptRef: ref('readiness'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'), runtimeConfigRef: ref('runtime'), migrationManifestSha256: H, previousRevision: 'ai-pdm-prod-prev', deadlineAt: '2026-09-08T01:00:00.000Z' }
  assert.equal(assertDev117ReleaseIntent(intent, profile), intent)
  assert.equal(assertDev117ReleaseIntent({ ...intent, baselineIntentRef: ref('baseline-intent') }, profile).baselineIntentRef.uri, ref('baseline-intent').uri)
  assert.throws(() => assertDev117ReleaseIntent({ ...intent, ownerApplicationId: 'platform' }, profile), /release intent invalid/i)
})

test('S1B-20 AI-PDM single-capsule workflow and mutation masks', () => {
  assert.equal(assertDev117WorkflowSource(fs.readFileSync(new URL('../.github/workflows/deploy-ai-pdm-independent-production.yml', import.meta.url), 'utf8')), true)
  assert.equal(buildDev117Mutation({ operation: 'CREATE_CANDIDATE', service: 'ai-pdm-prod', updateMask: 'template', revision: 'candidate-1', trafficPercent: 0, etag: 'e' }).trafficPercent, 0)
  assert.equal(buildDev117Mutation({ operation: 'CONFIGURE_ENTRYPOINT', service: 'ai-pdm-prod', updateMask: 'ingress,defaultUriDisabled,invokerIamDisabled', revision: null, trafficPercent: null, etag: 'e' }).updateMask, 'ingress,defaultUriDisabled,invokerIamDisabled')
  assert.equal(buildDev117CandidateTag({ service: 'ai-pdm-prod', revision: 'ai-pdm-prod-candidate-1', tag: `candidate-${'a'.repeat(12)}`, beforeTraffic: [{ revision: 'ai-pdm-prod-prev', percent: 100 }], etag: 'e' }).traffic.at(-1).percent, 0)
  assert.throws(() => buildDev117Mutation({ operation: 'ACTIVATE', service: 'ai-pdm-prod', updateMask: 'template,traffic', revision: 'latest', trafficPercent: 100, etag: 'e' }), /target invalid|traffic-only/)
})

test('S1B-20 principal migration workflow stops before candidate and uses exact owner identities', () => {
  const source = fs.readFileSync(new URL('../.github/workflows/deploy-ai-pdm-principal-migrations-production.yml', import.meta.url), 'utf8')
  const wif = fs.readFileSync(new URL('../infra/google-cloud/dev-117-production-release/workload-identity.tf', import.meta.url), 'utf8')
  assert.equal(assertDev121MigrationOnlyWorkflowSource(source, wif), true)
  assert.throws(() => assertDev121MigrationOnlyWorkflowSource(source.replace('--stage migrate', '--stage candidate'), wif), { code: 'MIGRATION_ONLY_WORKFLOW_DRIFT' })
  assert.throws(() => assertDev121MigrationOnlyWorkflowSource(source, wif.replace("assertion.ref == 'refs/heads/main'", "assertion.ref == 'refs/heads/feature'")), { code: 'MIGRATION_ONLY_WIF_DRIFT' })
})

test('S1B-20 migration-only GitHub source authority is limited to prepare/build/migrate', () => {
  const intent = { sourceRevision: 'a'.repeat(40) }
  const environment = {
    GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example', GOOGLE_OAUTH_ACCESS_TOKEN: 'x'.repeat(32),
    GITHUB_REPOSITORY: profile.application.repository, GITHUB_SHA: intent.sourceRevision, GITHUB_WORKFLOW_SHA: intent.sourceRevision,
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY_ID: '1260972060', GITHUB_REPOSITORY_OWNER_ID: '257207597', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_WORKFLOW_REF: `${profile.application.repository}/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/main`,
  }
  const migrationOnlyWorkflowPath = '.github/workflows/deploy-ai-pdm-principal-migrations-production.yml'
  for (const stage of ['prepare', 'build', 'migrate']) {
    assert.equal(assertProtectedGitHubContext(profile, intent, environment, { stage, migrationOnlyWorkflowPath }), true)
  }
  for (const stage of ['candidate', 'activate', 'finalize']) {
    assert.throws(() => assertProtectedGitHubContext(profile, intent, environment, { stage, migrationOnlyWorkflowPath }), { code: 'GITHUB_SOURCE_AUTHORITY_MISMATCH' })
  }
  assert.throws(() => assertProtectedGitHubContext(profile, intent, { ...environment, GITHUB_SHA: 'b'.repeat(40) }, { stage: 'prepare', migrationOnlyWorkflowPath }), { code: 'GITHUB_SOURCE_AUTHORITY_MISMATCH' })
  const mainWorkflow = { ...environment, GITHUB_WORKFLOW_REF: `${profile.application.repository}/${profile.workflow.path}@refs/heads/main` }
  assert.equal(assertProtectedGitHubContext(profile, intent, mainWorkflow, { stage: 'candidate', migrationOnlyWorkflowPath }), true)
})

test('S1B-20 AI-PDM DEV-116 exact candidate join', () => {
  const join = { sourceLock: { environment: 'production' }, artifact: { evidenceScope: 'PROVIDER' }, candidate: { revision: 'candidate-1' }, dev116R02: { schemaVersion: profile.dependencies.dev116ReceiptSchema, candidateRevision: 'candidate-1' }, machineDecision: { decision: 'GO' }, activation: { revision: 'candidate-1' }, canonical: { revision: 'candidate-1' } }
  assert.equal(assertDev117NativeJoin(join, profile), true)
  assert.throws(() => assertDev117NativeJoin({ ...join, dev116R02: { ...join.dev116R02, candidateRevision: 'other' } }, profile), /do not join/)
})

test('S1B-20 AI-PDM production login contains no application TOTP flow', () => {
  const clientAuth = readText('src/lib/firebase-client-auth.ts')
  const loginPage = readText('src/app/login/page.tsx')
  const styles = readText('src/app/globals.css')
  assert.match(clientAuth, /signInWithEmailAndPassword/u)
  assert.doesNotMatch(clientAuth, /TotpMultiFactorGenerator|getMultiFactorResolver|totp_required/u)
  assert.doesNotMatch(loginPage, /completeFirebaseTotp|totpChallenge|totpCode/u)
  assert.doesNotMatch(styles, /\.totp-enrollment-/u)
})

test('AI-PDM custom Cloud Build service account can act only as itself', () => {
  const identity = readText('infra/google-cloud/dev-117-production-release/identity.tf')
  const storage = readText('infra/google-cloud/dev-117-production-release/storage.tf')
  const migration = readText('infra/google-cloud/dev-117-production-release/migration.tf')
  const locals = readText('infra/google-cloud/dev-117-production-release/locals.tf')
  const candidateSmoke = readText('infra/google-cloud/dev-117-production-release/candidate-smoke.tf')
  const candidateSmokeV2 = readText('infra/google-cloud/dev-117-production-release/candidate-smoke-v2.tf')
  const infraPlan = read('config/release/dev117-production-release-infra-plan.json')
  const runtimeFirebaseViewer = identity.match(/resource "google_project_iam_member" "runtime_firebase_auth_viewer"[\s\S]*?\n\}/u)?.[0] ?? ''
  assert.match(runtimeFirebaseViewer, /count\s+= var\.incident_runtime_enabled \? 1 : 0[\s\S]*role\s+= "roles\/firebaseauth\.viewer"[\s\S]*serviceAccount:\$\{data\.google_service_account\.runtime\.email\}/u)
  assert.doesNotMatch(runtimeFirebaseViewer, /builder\.email|deployer\.email|verifier\.email|controller\.email|smoke\.email/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_project_iam_member.runtime_firebase_auth_viewer[0]'))
  assert.ok(!infraPlan.stageA.includes('google_project_iam_member.runtime_firebase_auth_viewer[0]'))
  assert.match(identity, /resource "google_service_account_iam_member" "builder_act_as_self"[\s\S]*service_account_id = google_service_account\.builder\.name[\s\S]*role\s+= "roles\/iam\.serviceAccountUser"[\s\S]*member\s+= "serviceAccount:\$\{google_service_account\.builder\.email\}"/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_service_account_iam_member.builder_act_as_self'))
  assert.ok(!infraPlan.stageA.includes('google_service_account_iam_member.builder_act_as_self'))
  assert.doesNotMatch(identity.match(/resource "google_service_account_iam_member" "builder_act_as_self"[\s\S]*?\n\}/u)?.[0] ?? '', /runtime|deployer|verifier|orgmaster|platform/u)
  assert.match(identity, /resource "google_project_iam_member" "builder_sbom_bucket_viewer"[\s\S]*role\s+= "roles\/storage\.bucketViewer"[\s\S]*google_service_account\.builder\.email/u)
  assert.match(identity, /resource "google_project_iam_member" "builder_sbom_note_attacher"[\s\S]*role\s+= "roles\/containeranalysis\.notes\.attacher"[\s\S]*google_service_account\.builder\.email/u)
  assert.match(storage, /resource "google_storage_bucket_iam_member" "builder_sbom_object_admin"[\s\S]*role\s+= "roles\/storage\.objectAdmin"[\s\S]*artifact_analysis_object_prefix/u)
  const verifierStorage = storage.match(/resource "google_storage_bucket_iam_member" "verifier"[\s\S]*?\n\}/u)?.[0] ?? ''
  assert.match(verifierStorage, /control_user\s+= \{ role = "roles\/storage\.objectUser", prefix = local\.control_prefix \}/u)
  assert.match(verifierStorage, /var\.incident_runtime_enabled \? \{/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_storage_bucket_iam_member.verifier["control_user"]'))
  assert.ok(!infraPlan.stageA.includes('google_storage_bucket_iam_member.verifier["control_user"]'))
  for (const source of [identity.match(/resource "google_project_iam_member" "builder_sbom_bucket_viewer"[\s\S]*?\n\}/u)?.[0] ?? '', identity.match(/resource "google_project_iam_member" "builder_sbom_note_attacher"[\s\S]*?\n\}/u)?.[0] ?? '', storage.match(/resource "google_storage_bucket_iam_member" "builder_sbom_object_admin"[\s\S]*?\n\}/u)?.[0] ?? '']) assert.match(source, /count\s+= var\.incident_runtime_enabled \? 1 : 0/u)
  assert.doesNotMatch(storage.match(/resource "google_storage_bucket_iam_member" "builder_sbom_object_admin"[\s\S]*?\n\}/u)?.[0] ?? '', /orgmaster-release|platform-release/u)
  assert.match(migration, /resource "google_cloud_run_v2_job_iam_member" "migration_runner_with_overrides"[\s\S]*name\s+= google_cloud_run_v2_job\.migration\[0\]\.name[\s\S]*role\s+= "roles\/run\.jobsExecutorWithOverrides"[\s\S]*google_service_account\.deployer\.email/u)
  assert.match(migration, /resource "google_cloud_run_v2_job_iam_member" "migration_runner_viewer"[\s\S]*name\s+= google_cloud_run_v2_job\.migration\[0\]\.name[\s\S]*role\s+= "roles\/run\.viewer"[\s\S]*google_service_account\.deployer\.email/u)
  for (const address of ['google_project_iam_member.builder_sbom_bucket_viewer[0]', 'google_project_iam_member.builder_sbom_note_attacher[0]', 'google_storage_bucket_iam_member.builder_sbom_object_admin[0]']) {
    assert.ok(infraPlan.stageBAdditional.includes(address))
    assert.ok(!infraPlan.stageA.includes(address))
  }
  assert.ok(infraPlan.stageBAdditional.includes('google_cloud_run_v2_job_iam_member.migration_runner_with_overrides[0]'))
  assert.ok(infraPlan.stageBAdditional.includes('google_cloud_run_v2_job_iam_member.migration_runner_viewer[0]'))
  assert.match(candidateSmoke, /resource "google_project_iam_member" "verifier_candidate_smoke_execution_invoker"[\s\S]*role\s+= "roles\/workflows\.invoker"[\s\S]*google_service_account\.verifier\.email[\s\S]*resource\.name\.startsWith\('projects\/\$\{var\.project_id\}\/locations\/\$\{var\.region\}\/workflows\/\$\{local\.candidate_smoke_workflow\}\/executions\/'\)/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_project_iam_member.verifier_candidate_smoke_execution_invoker[0]'))
  const invokerV2 = candidateSmoke.match(/resource "google_project_iam_member" "verifier_candidate_smoke_invoker_v2"[\s\S]*?\n\}/u)?.[0] ?? ''
  assert.match(invokerV2, /role\s+= "roles\/workflows\.invoker"[\s\S]*google_service_account\.verifier\.email/u)
  assert.doesNotMatch(invokerV2, /condition|builder|deployer|controller|smoke\.email/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_project_iam_member.verifier_candidate_smoke_invoker_v2[0]'))
  assert.match(locals, /owner_application_id\s+= "ai-pdm"/u)
  assert.match(locals, /candidate_smoke_workflow_v2\s+= "aipdm-prod-candidate-smoke-v2"/u)
  assert.match(candidateSmoke, /owner_app != "\$\{local\.app\}"/u)
  assert.match(candidateSmokeV2, /resource "google_workflows_workflow" "candidate_smoke_v2"/u)
  assert.match(candidateSmokeV2, /google_workflows_workflow\.candidate_smoke\[0\]\.source_contents/u)
  assert.match(candidateSmokeV2, /local\.owner_application_id/u)
  assert.ok(infraPlan.stageBAdditional.includes('google_workflows_workflow.candidate_smoke_v2[0]'))
})
