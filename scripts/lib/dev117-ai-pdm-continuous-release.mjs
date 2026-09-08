import { createHash } from 'node:crypto'
import {
  assertDev117ArtifactReceipt,
  assertDev117CandidateReceipt,
  assertDev117Level4Join,
  assertDev117AppReleaseReceipt
} from './dev117-ai-pdm-independent-release.mjs'
import { assertDev116R02Receipt } from './dev116-r02-receipt.mjs'
import { createMigrationBundle } from './dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/
const H64 = /^[a-f0-9]{64}$/
export const LEGACY_STRICT_VALIDATORS = Object.freeze({ assertDev117ArtifactReceipt, assertDev117CandidateReceipt, assertDev117Level4Join, assertDev117AppReleaseReceipt, assertDev116R02Receipt })
function fail(code, message) { const error = new Error(message); error.code = code; throw error }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

export function assertDev117ReleaseIntent(value, profile) {
  const expected = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceSha256', 'sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef', 'migrationManifestSha256', 'previousRevision', 'deadlineAt'].sort()
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected) || value.schemaVersion !== profile.schemas.releaseIntent || value.ownerApplicationId !== 'ai-pdm' || !/^[A-Z0-9][A-Z0-9-]{5,63}$/.test(value.releaseId ?? '') || !H40.test(value.sourceRevision ?? '') || !H64.test(value.sourceSha256 ?? '') || !H64.test(value.migrationManifestSha256 ?? '') || !value.previousRevision || value.previousRevision === 'latest' || !Number.isFinite(Date.parse(value.deadlineAt))) fail('RELEASE_INTENT_INVALID', 'AI-PDM release intent invalid')
  for (const name of ['sourceLockRef', 'authorizationPolicyRef', 'readinessReceiptRef', 'foundationReceiptRef', 'infraReceiptRef', 'runtimeConfigRef']) if (!new RegExp(`^gs://${profile.artifact.releaseBucket}/receipts/[A-Za-z0-9._/-]+\\.json$`).test(value[name]?.uri ?? '') || !H64.test(value[name]?.sha256 ?? '') || JSON.stringify(Object.keys(value[name] ?? {}).sort()) !== JSON.stringify(['sha256', 'uri'])) fail('RELEASE_INTENT_REF_INVALID', name)
  return value
}

export function assertDev117ContinuousProfile(profile, v1, n1c) {
  if (profile?.schemaVersion !== 'jenfu.dev117.ai-pdm-continuous-release.v2' || profile.profileVersion !== 'CONTINUOUS_NO_DWELL_V2') fail('UNSUPPORTED_PROFILE', 'Continuous v2 profile mismatch')
  if (profile.application?.id !== 'ai-pdm' || profile.application?.repository !== 'jedchang0308-jenfu/AI-PDM' || profile.application?.branch !== 'main') fail('SOURCE_SCOPE_MISMATCH', 'AI-PDM source scope mismatch')
  const target = profile.target || {}
  if (target.projectId !== 'jenfu-platform-prod' || target.region !== 'asia-east1' || target.serviceName !== 'ai-pdm-prod' || target.canonicalOrigin !== 'https://pdm.jenfu.com.tw' || target.database !== 'jenfu_prod') fail('TARGET_MISMATCH', 'AI-PDM target mismatch')
  if (profile.runtime?.poolMax !== 8 || profile.runtime?.maxInstances !== 1 || profile.artifact?.releaseBucket !== 'jenfu-platform-prod-aipdm-release' || profile.state?.backendKey !== 'dev-117/production-release/default.tfstate') fail('RUNTIME_OR_STATE_MISMATCH', 'AI-PDM runtime or state mismatch')
  if (profile.schemas?.releaseIntent !== 'jenfu.dev117.ai-pdm-release-intent.v2' || profile.schemas?.deploymentCapsule !== 'jenfu.dev117.ai-pdm-deployment-capsule.v2') fail('SCHEMA_PROFILE_MISMATCH', 'AI-PDM release/deployment capsule schema mismatch')
  if (profile.workflow?.onlyInput !== 'releaseCapsuleRef' || profile.workflow?.concurrency !== 'production-release-ai-pdm-prod') fail('WORKFLOW_CONTRACT_MISMATCH', 'AI-PDM workflow is not single-capsule')
  if (JSON.stringify(profile.workflow.jobs) !== JSON.stringify(['prepare', 'build', 'migrate', 'candidate', 'verify', 'decision', 'activate', 'canonical', 'finalize'])) fail('WORKFLOW_CONTRACT_MISMATCH', 'AI-PDM workflow stage order mismatch')
  if (profile.artifact?.migrationRunnerUri !== 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner' || profile.artifact?.migrationBundlePrefix !== 'source/migration-bundles') fail('MIGRATION_ARTIFACT_MISMATCH', 'AI-PDM migration runner/bundle mismatch')
  if (profile.build?.dockerBuilderImage !== 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c' || profile.build?.dockerfile !== 'Dockerfile' || profile.build?.dockerTarget !== 'runner' || profile.build?.sourceArchiveFormat !== 'tar.gz' || profile.build?.requestedVerifyOption !== 'VERIFIED' || profile.build?.maximumAllowedSeverity !== 'MEDIUM' || !Number.isFinite(Date.parse(profile.build?.builderDigestObservedAt))) fail('BUILD_PROFILE_MISMATCH', 'AI-PDM build provenance profile mismatch')
  if (profile.verification?.refreshTokenEnvironmentName !== 'DEV012_AIPDM_FIREBASE_REFRESH_TOKEN' || profile.verification?.firebaseApiKeyEnvironmentName !== 'DEV012_AIPDM_FIREBASE_API_KEY' || profile.verification?.authModePath !== '/api/auth/mode' || profile.verification?.sessionPath !== '/api/auth/firebase/session' || profile.verification?.mePath !== '/api/auth/me' || profile.verification?.logoutPath !== '/api/auth/logout' || profile.verification?.authenticatedProbes?.length !== 1 || profile.verification?.negativeProbes?.length !== 1) fail('VERIFICATION_PROFILE_MISMATCH', 'AI-PDM automated normal-entry profile mismatch')
  if (profile.verification?.candidateSmokeMode !== 'WORKFLOWS_INTERNAL_OIDC_V1' || profile.verification?.candidateWorkflowName !== 'aipdm-prod-candidate-smoke' || profile.verification?.candidateRefreshTokenSecretId !== 'aipdm-prod-smoke-firebase-refresh-token') fail('VERIFICATION_PROFILE_MISMATCH', 'AI-PDM internal candidate-smoke profile mismatch')
  if (profile.incidentRuntime?.controllerAudience !== 'https://release-controller.jenfu.internal/aipdm' || profile.incidentRuntime?.githubReadTokenSecretId !== 'aipdm-prod-controller-github-read-token' || profile.incidentRuntime?.numericSecretVersionRequired !== true || profile.incidentRuntime?.activeControlObject !== 'control/active.json') fail('INCIDENT_RUNTIME_PROFILE_MISMATCH', 'AI-PDM abort controller profile mismatch')
  if (profile.migrations?.jobName !== 'ai-pdm-prod-migration-runner' || profile.migrations?.serviceAccount !== 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com' || profile.migrations?.baselineCount !== 14) fail('MIGRATION_JOB_MISMATCH', 'AI-PDM migration job mismatch')
  if (JSON.stringify([...profile.environment.requiredPlainEnvironmentNames].sort()) !== JSON.stringify([...v1.environment.requiredPlainEnvironmentNames].sort()) || JSON.stringify([...profile.environment.requiredSecretNames].sort()) !== JSON.stringify([...v1.environment.requiredSecretEnvironmentNames].sort())) fail('ENVIRONMENT_SET_DRIFT', 'V2 environment set must equal v1')
  const order = profile.migrations?.entries?.map((entry) => entry.path)
  if (JSON.stringify(order) !== JSON.stringify(n1c.migration.order) || order.length !== 14 || profile.migrations.sourceTraceOnly !== n1c.migration.sourceTraceOnly || profile.migrations.foldedVersions !== n1c.migration.foldedVersions || JSON.stringify(profile.migrations.retiredVersions) !== JSON.stringify(n1c.migration.retiredVersions) || profile.migrations.ledger !== n1c.migration.ledger) fail('MIGRATION_MANIFEST_DRIFT', 'AI-PDM migration classifications drifted from N1C')
  if (profile.migrations.entries.some((entry, index) => entry.order !== index + 1 || !H64.test(entry.sha256))) fail('MIGRATION_MANIFEST_DRIFT', 'AI-PDM migration order/checksum invalid')
  if (Object.values(profile.sideEffects).some((value) => value !== 'DISABLED')) fail('SIDE_EFFECT_ENABLED', 'Side effects must remain disabled before authorization')
  return profile
}

export function verifyDev117MigrationBytes(profile, files) {
  if (files.size !== 14) fail('MIGRATION_SET_DRIFT', 'Exactly 14 migration files are required')
  for (const entry of profile.migrations.entries) if (!files.has(entry.path) || sha256(files.get(entry.path)) !== entry.sha256) fail('MIGRATION_CHECKSUM_MISMATCH', entry.path)
  return true
}

export function buildDev117MigrationBundle(profile, packageValue, sourceRevision) {
  if (!Array.isArray(packageValue?.entries) || packageValue.entries.length !== profile.migrations.entries.length) fail('MIGRATION_PACKAGE_INVALID', 'AI-PDM package entries invalid')
  const entries = profile.migrations.entries.map((authority, index) => {
    const item = packageValue.entries[index]
    if (item.sourcePath !== authority.path || item.sourceSha256 !== authority.sha256 || !H64.test(item.outputSha256 ?? '') || typeof item.sql !== 'string' || sha256(item.sql) !== item.outputSha256) fail('MIGRATION_PACKAGE_INVALID', authority.path)
    return { order: authority.order, version: item.version, name: item.name, path: authority.path, sourceSha256: item.sourceSha256, appliedSha256: item.outputSha256, sqlBase64: Buffer.from(item.sql, 'utf8').toString('base64') }
  })
  return createMigrationBundle({ target: { ownerApplicationId: 'ai-pdm', ledger: profile.migrations.ledger, baselineCount: profile.migrations.baselineCount }, sourceRevision, entries })
}

export function assertDev117WorkflowSource(source) {
  const inputBlock = source.match(/workflow_dispatch:[^\S\r\n]*\r?\n\s*inputs:[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\s*concurrency:/)?.[1] || ''
  const keys = [...inputBlock.matchAll(/^\s{6}([A-Za-z0-9_-]+):/gm)].map((match) => match[1])
  if (JSON.stringify(keys) !== JSON.stringify(['releaseCapsuleRef'])) fail('WORKFLOW_INPUT_DRIFT', 'Workflow must expose only releaseCapsuleRef')
  for (const forbidden of ['product_owner_decision:', 'artifact_receipt_ref:', 'candidate_receipt_ref:', 'level4_receipt_ref:', 'stage:']) if (source.includes(forbidden)) fail('HISTORICAL_INPUT_ACTIVE', `Forbidden v1 workflow input ${forbidden}`)
  if (!source.includes('group: production-release-ai-pdm-prod')) fail('WORKFLOW_CONCURRENCY_DRIFT', 'Concurrency must be service-wide')
  for (const job of ['prepare:', 'build:', 'migrate:', 'candidate:', 'verify:', 'decision:', 'activate:', 'canonical:', 'finalize:', 'failure:']) if (!source.includes(`\n  ${job}`)) fail('WORKFLOW_JOB_MISSING', job)
  if (/CAPSULE_PROVIDER_FETCH_REQUIRED|run:\s*echo\s/iu.test(source)) fail('PROVIDER_PLACEHOLDER_ACTIVE', 'Workflow contains a provider placeholder')
  if ((source.match(/^    environment: production$/gmu) ?? []).length !== 10 || (source.match(/DEV012_AIPDM_FIREBASE_REFRESH_TOKEN:/gu) ?? []).length !== 1 || (source.match(/DEV012_AIPDM_FIREBASE_API_KEY:/gu) ?? []).length !== 2 || source.includes('DEV012_AIPDM_FIREBASE_ID_TOKEN')) fail('WORKFLOW_AUTH_PREFLIGHT_DRIFT', 'Protected environment or candidate/canonical smoke binding drifted')
  for (const block of source.split(/^  (?=[a-z][a-z-]+:)/gmu).filter((value) => value.includes('google-github-actions/auth@v3'))) if (block.indexOf('actions/checkout@v4') < 0 || block.indexOf('actions/checkout@v4') > block.indexOf('google-github-actions/auth@v3')) fail('WORKFLOW_AUTH_ORDER_DRIFT', 'Checkout must precede WIF authentication')
  if (/\.\.\/Jenfu-Platform|\.\.\/OrgMaster|checkout[^\n]+repository:/i.test(source)) fail('SIBLING_CHECKOUT_DENIED', 'Workflow references sibling source')
  return true
}

export function buildDev117Mutation({ operation, service, updateMask, revision, trafficPercent, etag }) {
  if (service !== 'ai-pdm-prod' || !etag || revision === 'latest') fail('TARGET_MISMATCH', 'AI-PDM mutation target invalid')
  if (operation === 'CREATE_CANDIDATE' && (updateMask !== 'template' || trafficPercent !== 0)) fail('MIXED_MUTATION_MASK', 'Candidate must be template-only and zero traffic')
  if (['ACTIVATE', 'ROLLBACK'].includes(operation) && updateMask !== 'traffic') fail('MIXED_MUTATION_MASK', 'Activation/rollback must be traffic-only')
  return { operation, service, updateMask, revision, trafficPercent, etag }
}

export function buildDev117CandidateTag({ service, revision, tag, beforeTraffic, etag }) {
  if (service !== 'ai-pdm-prod' || !/^ai-pdm-prod-[a-z0-9-]+$/.test(revision || '') || !/^candidate-[a-f0-9]{12}$/.test(tag || '') || !etag || !Array.isArray(beforeTraffic) || beforeTraffic.some((row) => row.latestRevision === true || row.tag)) fail('CANDIDATE_TAG_INVALID', 'AI-PDM candidate tag invalid')
  return { operation: 'TAG_CANDIDATE', service, updateMask: 'traffic', etag, traffic: [...beforeTraffic, { revision, percent: 0, tag, type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION' }] }
}

export function assertDev117NativeJoin(value, profile) {
  const exact = ['sourceLock', 'artifact', 'candidate', 'dev116R02', 'machineDecision', 'activation', 'canonical']
  if (!value || JSON.stringify(Object.keys(value)) !== JSON.stringify(exact)) fail('NATIVE_JOIN_KEYS', 'Native join keys/order mismatch')
  if (value.dev116R02.schemaVersion !== profile.dependencies.dev116ReceiptSchema || value.candidate.revision !== value.dev116R02.candidateRevision || value.activation.revision !== value.candidate.revision || value.canonical.revision !== value.candidate.revision) fail('NATIVE_JOIN_MISMATCH', 'DEV-116/candidate/activation/canonical do not join')
  if (value.sourceLock.environment !== 'production' || value.artifact.evidenceScope === 'LOCAL_SYNTHETIC') fail('UNTRUSTED_EVIDENCE', 'Synthetic evidence cannot pass native join')
  return true
}
