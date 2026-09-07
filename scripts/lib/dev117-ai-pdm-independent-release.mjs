import crypto from 'node:crypto'
import path from 'node:path'

import { assertDev116R02Receipt } from './dev116-r02-receipt.mjs'

const SHA40 = /^[0-9a-f]{40}$/u
const SHA64 = /^[0-9a-f]{64}$/u
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/u
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
const RELEASE_ID = /^REL-117-[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u
const RUN_ID = /^DEV117-AIPDM-\d{8}T\d{6}Z-[0-9a-f]{8}$/u
const REVISION = /^ai-pdm-prod-[a-z0-9-]{3,48}$/u
const NUMERIC_SECRET_VERSION = /^[1-9][0-9]*$/u
const SENSITIVE = /-----BEGIN|(?:bearer|authorization):\s*\S+|(?:password|passwd|token)\s*=\s*[^\s,}]+|postgres(?:ql)?:\/\/|(?:ghp|github_pat|sk)-?[A-Za-z0-9_-]{12,}/iu

const PROFILE_KEYS = [
  'schemaVersion', 'devId', 'slice', 'application', 'source', 'target', 'database', 'runtime', 'environment',
  'workflow', 'dependencies', 'evidence', 'executionBoundary', 'forbiddenLegacy', 'profileSha256',
]
const SOURCE_LOCK_KEYS = [
  'schemaVersion', 'releaseId', 'runId', 'devId', 'slice', 'status', 'createdAt', 'repository', 'branch',
  'headRevision', 'headTree', 'packageLockSha256', 'profileSha256', 'workflowSha256', 'requiredFileResults',
  'requiredCommandResults', 'dirtyRequiredSourceCount', 'untrackedRequiredSourceCount', 'workingTree', 'blockers',
  'providerCalls', 'cloudMutations', 'databaseWrites', 'trafficChanges', 'credentialAccesses', 'evidenceSha256',
]
const ARTIFACT_KEYS = [
  'schemaVersion', 'releaseId', 'sourceLockSha256', 'sourceRevision', 'sourceTree', 'applicationId',
  'builderIdentity', 'registryRepository', 'artifactDigest', 'imageUri', 'platform', 'sbomRef', 'provenanceRef',
  'secretScan', 'vulnerabilities', 'createdAt', 'credentialMaterialPresent', 'evidenceSha256',
]
const SHARED_GATE_KEYS = [
  'schemaVersion', 'releaseId', 'sourceLockSha256', 'projectId', 'region', 'connectionName', 'database', 'schemas',
  'roles', 'billingEnabled', 'apisReady', 'databaseReady', 'rolesReady', 'migrationReady', 'capacityReady',
  'runtimeManifestRef', 'providerEvidenceRefs', 'holding', 'createdAt', 'expiresAt', 'credentialMaterialPresent',
  'evidenceSha256',
]
const CANDIDATE_KEYS = [
  'schemaVersion', 'releaseId', 'sourceLockSha256', 'artifactReceiptSha256', 'sharedGateReceiptSha256',
  'projectId', 'region', 'serviceName', 'containerName', 'runtimeIdentity', 'sourceRevision', 'sourceTree',
  'imageDigest', 'imageUri', 'revisionName', 'previousRevision', 'serviceExistedBefore', 'candidatePercent', 'tag',
  'canonicalTrafficBeforeSha256', 'canonicalTrafficAfterSha256', 'effectiveRuntime', 'plainEnvironment',
  'secretBindings', 'platformMutationCount', 'databaseMutationCount', 'buildExecutions', 'providerReadbackSha256',
  'progress', 'observedAt', 'credentialMaterialPresent', 'evidenceSha256',
]
const LEVEL4_ACCESS_KEYS = [
  'schemaVersion', 'releaseId', 'candidateReceiptSha256', 'projectId', 'region', 'serviceName', 'revisionName',
  'imageDigest', 'tag', 'tagHost', 'tagBeforeRevision', 'tagAfterRevision', 'approval', 'identityOwnerReceiptRef',
  'serverOriginOwnerReceiptRef', 'wildcardCount', 'canonicalTrafficBeforeSha256', 'canonicalTrafficAfterSha256',
  'observedAt', 'expiresAt', 'credentialMaterialPresent', 'evidenceSha256',
]
const PROMOTION_KEYS = [
  'schemaVersion', 'releaseId', 'candidateReceiptSha256', 'level4AccessReceiptSha256', 'dev116ReceiptSha256',
  'revisionName', 'imageDigest', 'canonicalOrigin', 'productOwnerDecision', 'approval', 'openP0', 'openP1',
  'rollbackReady', 'requestedAt', 'credentialMaterialPresent', 'evidenceSha256',
]
const ROLLBACK_KEYS = [
  'schemaVersion', 'releaseId', 'projectId', 'region', 'serviceName', 'failedRevision', 'restoredRevision',
  'failedRevisionPercent', 'restoredRevisionPercent', 'platformMutationCount', 'databaseMutationCount',
  'downMigrations', 'deletedRevisions', 'outcome', 'providerReadbackSha256', 'observedAt',
  'credentialMaterialPresent', 'evidenceSha256',
]
const APP_RECEIPT_KEYS = [
  'schemaVersion', 'applicationId', 'environment', 'releaseId', 'sourceRevision', 'sourceTree', 'artifactDigest',
  'serviceName', 'serviceRevision', 'canonicalOrigin', 'status', 'verifiedAt', 'expiresAt', 'smokeEvidenceRef',
  'rollbackEvidenceRef', 'credentialMaterialPresent', 'evidenceSha256',
]
const PREFLIGHT_KEYS = [
  'schemaVersion', 'releaseId', 'runId', 'devId', 'slice', 'status', 'observedAt', 'sourceLockSha256',
  'profileSha256', 'workflowContract', 'environmentContract', 'separationChecks', 'blockers', 'providerCalls',
  'cloudMutations', 'databaseWrites', 'trafficChanges', 'credentialAccesses', 'siblingRepositoryReads',
  'credentialMaterialPresent', 'evidenceSha256',
]

const STATE_TRANSITIONS = Object.freeze({
  UNASSESSED: ['SOURCE_FROZEN', 'BLOCKED'],
  SOURCE_FROZEN: ['CI_VERIFIED', 'BLOCKED', 'INVALIDATED'],
  CI_VERIFIED: ['ARTIFACT_READY', 'BLOCKED', 'INVALIDATED'],
  ARTIFACT_READY: ['SHARED_GATE_VERIFIED', 'BLOCKED', 'INVALIDATED', 'FAILED'],
  SHARED_GATE_VERIFIED: ['CANDIDATE_READY', 'BLOCKED', 'INVALIDATED', 'FAILED'],
  CANDIDATE_READY: ['LEVEL4_ACCESS_READY', 'BLOCKED', 'INVALIDATED', 'FAILED'],
  LEVEL4_ACCESS_READY: ['LEVEL4_VERIFIED', 'BLOCKED', 'INVALIDATED', 'FAILED'],
  LEVEL4_VERIFIED: ['PROMOTION_PENDING', 'BLOCKED', 'INVALIDATED', 'FAILED'],
  PROMOTION_PENDING: ['ACTIVATING', 'BLOCKED', 'INVALIDATED'],
  ACTIVATING: ['LIVE_VERIFIED', 'ROLLED_BACK', 'FAILED', 'BLOCKED'],
  LIVE_VERIFIED: ['ROLLED_BACK', 'FAILED', 'INVALIDATED'],
  BLOCKED: [], INVALIDATED: [], FAILED: [], ROLLED_BACK: [],
})

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

function object(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, label)
  return value
}

function exactKeys(value, expected, code, label) {
  object(value, code, label)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code, `${label}.keys`)
}

function string(value, code, label) {
  if (typeof value !== 'string' || value.length === 0) fail(code, label)
  return value
}

function boolean(value, code, label) {
  if (typeof value !== 'boolean') fail(code, label)
  return value
}

function integer(value, code, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) fail(code, label)
  return value
}

function strings(value, code, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0) || new Set(value).size !== value.length) fail(code, label)
  return value
}

function timestamp(value, code, label) {
  if (!ISO_INSTANT.test(value ?? '') || !Number.isFinite(Date.parse(value))) fail(code, label)
  return value
}

function hash(value, code, label) {
  if (!SHA64.test(value ?? '')) fail(code, label)
  return value
}

function digest(value, code, label) {
  if (!IMAGE_DIGEST.test(value ?? '')) fail(code, label)
  return value
}

function releaseId(value, code) {
  if (!RELEASE_ID.test(value ?? '')) fail(code, 'releaseId')
}

function origin(value, expected, code, label) {
  let parsed
  try { parsed = new URL(value) } catch { fail(code, label) }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.origin !== expected) fail(code, label)
}

function safeEvidenceRef(value, code, label) {
  string(value, code, label)
  if (value.includes('..') || value.includes('\\') || SENSITIVE.test(value)) fail(code, label)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,511}$/u.test(value)) fail(code, label)
  return value
}

function assertNoSensitive(value, code = 'DEV117_CREDENTIAL_MATERIAL_FOUND') {
  if (SENSITIVE.test(JSON.stringify(value))) fail(code)
}

function assertSelfHash(value, keys, code, label) {
  exactKeys(value, keys, code, label)
  hash(value.evidenceSha256, code, `${label}.evidenceSha256`)
  const { evidenceSha256, ...core } = value
  if (sha256(core) !== evidenceSha256) fail(`${code}_HASH_MISMATCH`, label)
  assertNoSensitive(value)
  return value
}

function blockers(value, code) {
  if (!Array.isArray(value)) fail(code, 'blockers')
  for (const row of value) {
    exactKeys(row, ['code', 'detail'], code, 'blocker')
    string(row.code, code, 'blocker.code')
    string(row.detail, code, 'blocker.detail')
  }
  return value
}

function zero(value, code, label) {
  integer(value, code, label)
  if (value !== 0) fail(code, label)
}

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}

export function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalize(value)).digest('hex')
}

export function finalizeEvidence(core) {
  return { ...core, evidenceSha256: sha256(core) }
}

export function assertDev117Config(config) {
  const code = 'DEV117_PROFILE_INVALID'
  exactKeys(config, PROFILE_KEYS, code, 'profile')
  if (config.schemaVersion !== 'jenfu.ai-pdm.independent-release-profile.v1' || config.devId !== 'DEV-117' || config.slice !== '117-S1') fail(code, 'identity')
  exactKeys(config.application, ['id', 'repository', 'expectedBranch', 'dockerfile', 'dockerTarget', 'imageRepository'], code, 'application')
  if (config.application.id !== 'ai-pdm' || config.application.repository !== 'jedchang0308-jenfu/AI-PDM' || config.application.expectedBranch !== 'main'
    || config.application.dockerfile !== 'Dockerfile' || config.application.dockerTarget !== 'runner'
    || config.application.imageRepository !== 'asia-east1-docker.pkg.dev/jenfu-platform-prod/dev010-r1/ai-pdm') fail('DEV117_CROSS_APP_COMPONENT_FORBIDDEN', 'application')
  exactKeys(config.source, ['hashAlgorithm', 'cleanSourceRequired', 'approval', 'requiredTrackedFiles', 'requiredPackageScripts'], code, 'source')
  if (config.source.hashAlgorithm !== 'sha256' || config.source.cleanSourceRequired !== true || config.source.approval !== 'DEV-117-117-S1-AI-PDM-LOCAL-PREFLIGHT-APPROVED') fail(code, 'source')
  strings(config.source.requiredTrackedFiles, code, 'source.requiredTrackedFiles')
  for (const required of ['config/release/dev117-ai-pdm-independent-production.json', '.github/workflows/deploy-ai-pdm-independent-production.yml', 'scripts/lib/dev117-ai-pdm-independent-release.mjs']) {
    if (!config.source.requiredTrackedFiles.includes(required)) fail(code, `source.requiredTrackedFiles.${required}`)
  }
  exactKeys(config.source.requiredPackageScripts, ['build:isolated', 'check:db-boundary', 'dev-117:release', 'qc:dev-117:release-adapter', 'qc:production-deployment-pipeline', 'test:dev-117:release-adapter', 'typecheck:app'], code, 'source.requiredPackageScripts')
  for (const value of Object.values(config.source.requiredPackageScripts)) string(value, code, 'source.requiredPackageScripts.value')

  exactKeys(config.target, ['provider', 'projectId', 'region', 'serviceName', 'containerName', 'runtimeIdentity', 'deploymentIdentityVariable', 'workloadIdentityProviderVariable', 'canonicalOrigin', 'network', 'subnet'], code, 'target')
  if (config.target.provider !== 'GOOGLE_CLOUD' || config.target.projectId !== 'jenfu-platform-prod' || config.target.region !== 'asia-east1'
    || config.target.serviceName !== 'ai-pdm-prod' || config.target.containerName !== 'ai-pdm'
    || config.target.runtimeIdentity !== 'aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'
    || config.target.deploymentIdentityVariable !== 'AI_PDM_PRODUCTION_DEPLOYER_SERVICE_ACCOUNT'
    || config.target.workloadIdentityProviderVariable !== 'GCP_WORKLOAD_IDENTITY_PROVIDER'
    || config.target.network !== 'jenfu-platform-prod-vpc' || config.target.subnet !== 'jenfu-platform-prod-runtime') fail('DEV117_NEUTRAL_TARGET_INVALID', 'target')
  origin(config.target.canonicalOrigin, 'https://pdm.jenfu.com.tw', 'DEV117_NEUTRAL_TARGET_INVALID', 'target.canonicalOrigin')

  exactKeys(config.database, ['connectionName', 'instance', 'database', 'iamDatabaseUser', 'schemas', 'runtimeRole', 'migratorRole'], code, 'database')
  if (config.database.connectionName !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' || config.database.instance !== 'jenfu-platform-prod-pg'
    || config.database.database !== 'jenfu_prod' || config.database.iamDatabaseUser !== 'aipdm-prod-runtime@jenfu-platform-prod.iam'
    || canonicalize(config.database.schemas) !== canonicalize(['ai_pdm_core', 'ai_pdm_contract'])
    || config.database.runtimeRole !== 'jenfu_ai_pdm_runtime' || config.database.migratorRole !== 'jenfu_ai_pdm_migrator') fail('DEV117_DATABASE_BOUNDARY_INVALID', 'database')

  exactKeys(config.runtime, ['cpu', 'memory', 'concurrency', 'timeoutSeconds', 'port', 'minInstances', 'maxInstances', 'startupProbePath', 'cloudSqlProxyContainer', 'cloudSqlProxyImage'], code, 'runtime')
  if (config.runtime.cpu !== '1' || config.runtime.memory !== '1Gi' || config.runtime.concurrency !== 20 || config.runtime.timeoutSeconds !== 60
    || config.runtime.port !== 8080 || config.runtime.minInstances !== 0 || config.runtime.maxInstances !== 1 || config.runtime.startupProbePath !== '/login'
    || config.runtime.cloudSqlProxyContainer !== 'cloud-sql-proxy' || !config.runtime.cloudSqlProxyImage.includes('@sha256:')) fail(code, 'runtime')

  exactKeys(config.environment, ['requiredPlainEnvironmentNames', 'fixedPlainEnvironment', 'requiredSecretEnvironmentNames', 'allowedSecretReferences', 'secretVersionPolicy'], code, 'environment')
  strings(config.environment.requiredPlainEnvironmentNames, code, 'environment.requiredPlainEnvironmentNames')
  strings(config.environment.requiredSecretEnvironmentNames, code, 'environment.requiredSecretEnvironmentNames')
  exactKeys(config.environment.allowedSecretReferences, config.environment.requiredSecretEnvironmentNames, code, 'environment.allowedSecretReferences')
  if (config.environment.secretVersionPolicy !== 'NUMERIC_ENABLED_ONLY') fail('DEV117_SECRET_BINDING_INVALID', 'secretVersionPolicy')
  const fixed = config.environment.fixedPlainEnvironment
  object(fixed, code, 'fixedPlainEnvironment')
  const expectedFixed = {
    NODE_ENV: 'production', PDM_AUTH_MODE: 'firebase_bff', PDM_PRODUCTION_SLICE_MODE: 'official-numbering-draft',
    PDM_NUMBER_STATE_FLOW_V1: 'true', PDM_NUMBER_LIFECYCLE_V2: 'true', PDM_UNIFIED_DRAWING_WORKBENCH_V1: 'true',
    PDM_DRAWING_RECOGNITION_V1: 'true', PDM_REVIEW_PACKAGE_V2_WRITE: 'true', PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: 'true',
    PDM_UNIFIED_ENTITY_DETAIL_V1: 'true', PDM_DRAWING_REVISION_LIFECYCLE_MODE: 'enforced', PDM_SMOKE_GCS_WRITER: 'disabled',
    PDM_SMOKE_OUTBOX_CONSUMER: 'disabled', PDM_SMOKE_EXTERNAL_NOTIFICATION: 'disabled', PDM_DB_PROVIDER: 'cloud_sql_postgres',
    DEV010_N2_DATABASE_BOUNDARY: 'required', PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: config.database.connectionName,
    PDM_CLOUD_SQL_HOST: '127.0.0.1', PDM_CLOUD_SQL_PORT: '5432', PDM_CLOUD_SQL_DATABASE: config.database.database,
    PDM_CLOUD_SQL_USER: config.database.iamDatabaseUser, PDM_CLOUD_SQL_POOL_MAX: '8', PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS: '10000',
    PDM_CLOUD_SQL_IDLE_TIMEOUT_MS: '600000', PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS: '30000', PDM_CLOUD_SQL_QUERY_TIMEOUT_MS: '35000',
    PDM_PUBLIC_BASE_URL: config.target.canonicalOrigin, PDM_CANDIDATE_CLOUD_RUN_SERVICE: config.target.serviceName,
    PDM_CANDIDATE_CLOUD_RUN_TAG: 'candidate', PDM_COOKIE_SECURE: 'true', PDM_TRUST_GOOGLE_WORKSPACE_MFA: 'false',
    PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED: 'false',
  }
  if (canonicalize(fixed) !== canonicalize(expectedFixed)) fail('DEV117_ENVIRONMENT_CONTRACT_INVALID', 'fixedPlainEnvironment')
  for (const key of Object.keys(fixed)) if (!config.environment.requiredPlainEnvironmentNames.includes(key)) fail(code, `requiredPlainEnvironmentNames.${key}`)
  if (canonicalize(config.environment.allowedSecretReferences) !== canonicalize({
    PDM_SESSION_CURRENT_SECRET: 'aipdm-prod-session-current',
    PDM_SESSION_PREVIOUS_SECRET: 'aipdm-prod-session-previous',
    PDM_WORKBENCH_CONTRACT_SECRET: 'aipdm-prod-workbench-contract',
  })) fail('DEV117_SECRET_BINDING_INVALID', 'allowedSecretReferences')

  exactKeys(config.workflow, ['path', 'stages', 'candidateTrafficPercent', 'candidateTagCreatedDuringCandidate', 'level4AccessTag', 'approvals'], code, 'workflow')
  if (config.workflow.path !== '.github/workflows/deploy-ai-pdm-independent-production.yml'
    || canonicalize(config.workflow.stages) !== canonicalize(['prepare', 'candidate', 'level4-access', 'promote', 'rollback', 'finalize'])
    || config.workflow.candidateTrafficPercent !== 0 || config.workflow.candidateTagCreatedDuringCandidate !== false || config.workflow.level4AccessTag !== 'candidate') fail(code, 'workflow')
  exactKeys(config.workflow.approvals, ['candidate', 'level4Access', 'promotion', 'rollback'], code, 'workflow.approvals')
  if (new Set(Object.values(config.workflow.approvals)).size !== 4 || Object.values(config.workflow.approvals).some((value) => !value.startsWith('DEV-117-NEUTRAL-'))) fail(code, 'workflow.approvals')

  exactKeys(config.dependencies, ['sharedGateSchema', 'holdingReceiptSchema', 'dev116ReceiptSchema', 'appReleaseReceiptSchema', 'forbiddenSiblingApplicationIds', 'forbiddenSiblingServiceNames'], code, 'dependencies')
  if (config.dependencies.sharedGateSchema !== 'jenfu.dev117.shared-gate-receipt.v1'
    || config.dependencies.holdingReceiptSchema !== 'jenfu.dev010.r1.r04-service-foundation-receipt.v1'
    || config.dependencies.dev116ReceiptSchema !== 'jenfu.dev116.r02.production-candidate-receipt.v1'
    || config.dependencies.appReleaseReceiptSchema !== 'jenfu.app.release-receipt.v1'
    || canonicalize(config.dependencies.forbiddenSiblingApplicationIds) !== canonicalize(['platform', 'orgmaster'])
    || canonicalize(config.dependencies.forbiddenSiblingServiceNames) !== canonicalize(['jenfu-platform-prod', 'orgmaster-prod'])) fail('DEV117_CROSS_APP_COMPONENT_FORBIDDEN', 'dependencies')

  exactKeys(config.evidence, ['outputRoot', 'allowedFiles', 'sourceLockSchema', 'preflightReportSchema', 'aggregateSchema'], code, 'evidence')
  if (config.evidence.outputRoot !== 'output/dev-117/release-adapter' || canonicalize(config.evidence.allowedFiles) !== canonicalize(['source-lock.json', 'preflight-report.json'])
    || config.evidence.sourceLockSchema !== 'jenfu.dev117.source-lock-receipt.v1' || config.evidence.preflightReportSchema !== 'jenfu.dev117.preflight-report.v1'
    || config.evidence.aggregateSchema !== 'jenfu.dev117.qa-aggregate.v1') fail(code, 'evidence')
  exactKeys(config.executionBoundary, ['localPreflightAllowProviderCalls', 'localPreflightAllowCloudMutations', 'localPreflightAllowDatabaseWrites', 'localPreflightAllowTrafficChanges', 'localPreflightAllowCredentialAccess', 'localPreflightAllowSiblingRepositoryReads', 'candidateBuildAllowed', 'candidateTagAllowed', 'candidateCanonicalTrafficAllowed', 'databaseMigrationAllowed', 'platformMutationAllowed'], code, 'executionBoundary')
  if (Object.values(config.executionBoundary).some((value) => value !== false)) fail('DEV117_PROVIDER_CAPABILITY_FORBIDDEN', 'executionBoundary')
  exactKeys(config.forbiddenLegacy, ['projectIds', 'canonicalOrigins', 'runtimeIdentities', 'secretVersions'], code, 'forbiddenLegacy')
  if (!config.forbiddenLegacy.projectIds.includes('jenfu-ai-pdm-prod') || !config.forbiddenLegacy.canonicalOrigins.includes('https://jenfu-ai-pdm-prod.web.app')
    || !config.forbiddenLegacy.runtimeIdentities.includes('pdm-runtime@jenfu-ai-pdm-prod.iam.gserviceaccount.com') || !config.forbiddenLegacy.secretVersions.includes('latest')) fail(code, 'forbiddenLegacy')
  hash(config.profileSha256, code, 'profileSha256')
  const { profileSha256, ...core } = config
  if (sha256(core) !== profileSha256) fail('DEV117_PROFILE_HASH_MISMATCH')
  assertNoSensitive(config)
  return config
}

export function inspectDev117Source({ config, branch, headRevision, headTree, trackedPaths, fileContentsByPath, packageScripts, packageLockBytes, workingTree }) {
  assertDev117Config(config)
  const code = 'DEV117_SOURCE_INSPECTION_INVALID'
  if (!SHA40.test(headRevision ?? '') || !SHA40.test(headTree ?? '')) fail(code, 'git identity')
  strings(trackedPaths, code, 'trackedPaths')
  object(fileContentsByPath, code, 'fileContentsByPath')
  object(packageScripts, code, 'packageScripts')
  exactKeys(workingTree, ['isClean', 'staged', 'unstaged', 'untracked'], code, 'workingTree')
  boolean(workingTree.isClean, code, 'workingTree.isClean')
  for (const key of ['staged', 'unstaged', 'untracked']) strings(workingTree[key], code, `workingTree.${key}`)
  const clean = workingTree.staged.length === 0 && workingTree.unstaged.length === 0 && workingTree.untracked.length === 0
  if (clean !== workingTree.isClean) fail(code, 'workingTree.consistency')
  const tracked = new Set(trackedPaths)
  const requiredFileResults = config.source.requiredTrackedFiles.map((pathname) => {
    const bytes = fileContentsByPath[pathname]
    return { path: pathname, trackedAtHead: tracked.has(pathname) && bytes != null, sha256: bytes == null ? null : sha256(bytes) }
  })
  const requiredCommandResults = Object.entries(config.source.requiredPackageScripts).map(([name, expected]) => ({ name, expected, actual: packageScripts[name] ?? null, matches: packageScripts[name] === expected }))
  const requiredSet = new Set(config.source.requiredTrackedFiles)
  const dirtyRequiredSourceCount = new Set([...workingTree.staged, ...workingTree.unstaged].filter((pathname) => requiredSet.has(pathname))).size
  const untrackedRequiredSourceCount = workingTree.untracked.filter((pathname) => requiredSet.has(pathname)).length
  const foundWorkflow = requiredFileResults.find((row) => row.path === config.workflow.path)
  const foundPackageLock = requiredFileResults.find((row) => row.path === 'package-lock.json')
  const foundProfile = requiredFileResults.find((row) => row.path === 'config/release/dev117-ai-pdm-independent-production.json')
  const observedProfileSha = fileContentsByPath['config/release/dev117-ai-pdm-independent-production.json'] == null
    ? null
    : (() => { const parsed = JSON.parse(Buffer.from(fileContentsByPath['config/release/dev117-ai-pdm-independent-production.json']).toString('utf8')); delete parsed.profileSha256; return sha256(parsed) })()
  const inspectionBlockers = []
  if (branch !== config.application.expectedBranch) inspectionBlockers.push({ code: 'DEV117_SOURCE_BRANCH_INVALID', detail: `${branch} != ${config.application.expectedBranch}` })
  if (!workingTree.isClean) inspectionBlockers.push({ code: 'DEV117_SOURCE_DIRTY', detail: 'working tree is not clean' })
  if (requiredFileResults.some((row) => !row.trackedAtHead)) inspectionBlockers.push({ code: 'DEV117_SOURCE_REQUIRED_FILE_MISSING', detail: 'required source is not tracked at HEAD' })
  if (requiredCommandResults.some((row) => !row.matches)) inspectionBlockers.push({ code: 'DEV117_SOURCE_COMMAND_DRIFT', detail: 'required package script mismatch' })
  if (dirtyRequiredSourceCount > 0 || untrackedRequiredSourceCount > 0) inspectionBlockers.push({ code: 'DEV117_REQUIRED_SOURCE_DRIFT', detail: 'required source differs from HEAD' })
  if (observedProfileSha !== config.profileSha256 || foundProfile?.sha256 == null) inspectionBlockers.push({ code: 'DEV117_PROFILE_HASH_MISMATCH', detail: 'profile source mismatch' })
  return {
    branch, headRevision, headTree, packageLockSha256: packageLockBytes == null ? foundPackageLock?.sha256 ?? null : sha256(packageLockBytes),
    workflowSha256: foundWorkflow?.sha256 ?? null, profileSha256: config.profileSha256, requiredFileResults,
    requiredCommandResults, dirtyRequiredSourceCount, untrackedRequiredSourceCount, workingTree: structuredClone(workingTree), blockers: inspectionBlockers,
  }
}

export function buildDev117SourceLock({ config, releaseId: release, runId, createdAt, sourceInspection }) {
  assertDev117Config(config)
  releaseId(release, 'DEV117_SOURCE_LOCK_INVALID')
  if (!RUN_ID.test(runId ?? '')) fail('DEV117_SOURCE_LOCK_INVALID', 'runId')
  timestamp(createdAt, 'DEV117_SOURCE_LOCK_INVALID', 'createdAt')
  object(sourceInspection, 'DEV117_SOURCE_LOCK_INVALID', 'sourceInspection')
  const status = sourceInspection.blockers.length === 0 ? 'FROZEN' : 'INVALIDATED'
  return finalizeEvidence({
    schemaVersion: config.evidence.sourceLockSchema, releaseId: release, runId, devId: config.devId, slice: config.slice,
    status, createdAt, repository: config.application.repository, branch: sourceInspection.branch,
    headRevision: sourceInspection.headRevision, headTree: sourceInspection.headTree,
    packageLockSha256: sourceInspection.packageLockSha256, profileSha256: sourceInspection.profileSha256,
    workflowSha256: sourceInspection.workflowSha256, requiredFileResults: sourceInspection.requiredFileResults,
    requiredCommandResults: sourceInspection.requiredCommandResults, dirtyRequiredSourceCount: sourceInspection.dirtyRequiredSourceCount,
    untrackedRequiredSourceCount: sourceInspection.untrackedRequiredSourceCount, workingTree: sourceInspection.workingTree,
    blockers: sourceInspection.blockers, providerCalls: 0, cloudMutations: 0, databaseWrites: 0, trafficChanges: 0, credentialAccesses: 0,
  })
}

export function assertDev117SourceLock(value, config) {
  assertDev117Config(config)
  const code = 'DEV117_SOURCE_LOCK_INVALID'
  assertSelfHash(value, SOURCE_LOCK_KEYS, code, 'sourceLock')
  releaseId(value.releaseId, code)
  if (value.schemaVersion !== config.evidence.sourceLockSchema || value.devId !== 'DEV-117' || value.slice !== '117-S1' || !RUN_ID.test(value.runId ?? '')
    || !['FROZEN', 'INVALIDATED'].includes(value.status) || value.repository !== config.application.repository || !SHA40.test(value.headRevision ?? '') || !SHA40.test(value.headTree ?? '')) fail(code, 'identity')
  timestamp(value.createdAt, code, 'createdAt')
  for (const key of ['packageLockSha256', 'profileSha256', 'workflowSha256']) {
    if (value[key] !== null) hash(value[key], code, key)
  }
  if (value.profileSha256 !== config.profileSha256) fail('DEV117_PROFILE_HASH_MISMATCH')
  if (!Array.isArray(value.requiredFileResults) || value.requiredFileResults.length !== config.source.requiredTrackedFiles.length) fail(code, 'requiredFileResults')
  if (!Array.isArray(value.requiredCommandResults) || value.requiredCommandResults.length !== Object.keys(config.source.requiredPackageScripts).length) fail(code, 'requiredCommandResults')
  integer(value.dirtyRequiredSourceCount, code, 'dirtyRequiredSourceCount')
  integer(value.untrackedRequiredSourceCount, code, 'untrackedRequiredSourceCount')
  blockers(value.blockers, code)
  for (const key of ['providerCalls', 'cloudMutations', 'databaseWrites', 'trafficChanges', 'credentialAccesses']) zero(value[key], 'DEV117_PROVIDER_CAPABILITY_FORBIDDEN', key)
  const freezeReady = value.branch === config.application.expectedBranch && value.workingTree.isClean && value.dirtyRequiredSourceCount === 0
    && value.untrackedRequiredSourceCount === 0 && value.requiredFileResults.every((row) => row.trackedAtHead === true && SHA64.test(row.sha256 ?? ''))
    && value.requiredCommandResults.every((row) => row.matches === true) && value.blockers.length === 0
  if ((value.status === 'FROZEN') !== freezeReady) fail(code, 'status')
  return value
}

export function assertDev117ArtifactReceipt(value, config, sourceLock) {
  assertDev117Config(config)
  assertDev117SourceLock(sourceLock, config)
  const code = 'DEV117_ARTIFACT_RECEIPT_INVALID'
  assertSelfHash(value, ARTIFACT_KEYS, code, 'artifactReceipt')
  releaseId(value.releaseId, code)
  if (value.releaseId !== sourceLock.releaseId || value.sourceLockSha256 !== sourceLock.evidenceSha256 || value.sourceRevision !== sourceLock.headRevision
    || value.sourceTree !== sourceLock.headTree || value.applicationId !== 'ai-pdm' || value.registryRepository !== config.application.imageRepository
    || value.platform !== 'linux/amd64' || !SHA40.test(value.sourceRevision ?? '') || !SHA40.test(value.sourceTree ?? '')) fail(code, 'identity')
  string(value.builderIdentity, code, 'builderIdentity')
  digest(value.artifactDigest, code, 'artifactDigest')
  if (value.imageUri !== `${config.application.imageRepository}@${value.artifactDigest}`) fail(code, 'imageUri')
  safeEvidenceRef(value.sbomRef, code, 'sbomRef')
  safeEvidenceRef(value.provenanceRef, code, 'provenanceRef')
  exactKeys(value.secretScan, ['credentialMaterialPresent', 'findings'], code, 'secretScan')
  if (value.secretScan.credentialMaterialPresent !== false || value.secretScan.findings !== 0) fail('DEV117_ARTIFACT_SECURITY_INVALID', 'secretScan')
  exactKeys(value.vulnerabilities, ['critical', 'high'], code, 'vulnerabilities')
  if (value.vulnerabilities.critical !== 0 || value.vulnerabilities.high !== 0) fail('DEV117_ARTIFACT_SECURITY_INVALID', 'vulnerabilities')
  timestamp(value.createdAt, code, 'createdAt')
  if (value.credentialMaterialPresent !== false) fail('DEV117_CREDENTIAL_MATERIAL_FOUND')
  return value
}

export function assertDev117SharedGateReceipt(value, config, sourceLock, evaluatedAt) {
  assertDev117Config(config)
  assertDev117SourceLock(sourceLock, config)
  const code = 'DEV117_SHARED_GATE_RECEIPT_INVALID'
  assertSelfHash(value, SHARED_GATE_KEYS, code, 'sharedGateReceipt')
  releaseId(value.releaseId, code)
  if (value.releaseId !== sourceLock.releaseId || value.sourceLockSha256 !== sourceLock.evidenceSha256 || value.projectId !== config.target.projectId
    || value.region !== config.target.region || value.connectionName !== config.database.connectionName || value.database !== config.database.database
    || canonicalize(value.schemas) !== canonicalize(config.database.schemas)
    || canonicalize(value.roles) !== canonicalize([config.database.migratorRole, config.database.runtimeRole])) fail(code, 'identity')
  for (const key of ['billingEnabled', 'apisReady', 'databaseReady', 'rolesReady', 'migrationReady', 'capacityReady']) if (value[key] !== true) fail('DEV117_SHARED_GATE_NOT_READY', key)
  safeEvidenceRef(value.runtimeManifestRef, code, 'runtimeManifestRef')
  strings(value.providerEvidenceRefs, code, 'providerEvidenceRefs')
  value.providerEvidenceRefs.forEach((ref, index) => safeEvidenceRef(ref, code, `providerEvidenceRefs[${index}]`))
  if (value.holding !== null) {
    exactKeys(value.holding, ['schemaVersion', 'serviceName', 'status', 'assignedTrafficPercent', 'reachabilityDenialControl', 'runtimeRoleBindings', 'receiptRef'], code, 'holding')
    if (value.holding.schemaVersion !== config.dependencies.holdingReceiptSchema || value.holding.serviceName !== config.target.serviceName || value.holding.status !== 'HOLDING_READY'
      || value.holding.assignedTrafficPercent !== 100 || value.holding.reachabilityDenialControl !== 'DEFAULT_URL_DISABLED_INTERNAL_INGRESS_PRIVATE_IAM'
      || value.holding.runtimeRoleBindings !== 0) fail(code, 'holding')
    safeEvidenceRef(value.holding.receiptRef, code, 'holding.receiptRef')
  }
  timestamp(value.createdAt, code, 'createdAt')
  timestamp(value.expiresAt, code, 'expiresAt')
  if (Date.parse(value.createdAt) >= Date.parse(value.expiresAt) || Date.parse(evaluatedAt) >= Date.parse(value.expiresAt)) fail('DEV117_SHARED_GATE_EXPIRED')
  if (value.credentialMaterialPresent !== false) fail('DEV117_CREDENTIAL_MATERIAL_FOUND')
  return value
}

export function planDev117Candidate({ config, serviceExists, sharedGate }) {
  assertDev117Config(config)
  boolean(serviceExists, 'DEV117_CANDIDATE_PLAN_INVALID', 'serviceExists')
  if (serviceExists) return { disposition: 'DEPLOY_DIGEST_ONLY_ZERO_TRAFFIC', holdingRequired: false, firstRevisionClaimedZeroTraffic: false }
  if (sharedGate?.holding == null) return { disposition: 'BLOCKED_REQUIRE_DEV010_R1_04F', holdingRequired: true, firstRevisionClaimedZeroTraffic: false }
  if (sharedGate.holding.serviceName !== config.target.serviceName || sharedGate.holding.status !== 'HOLDING_READY'
    || sharedGate.holding.assignedTrafficPercent !== 100 || sharedGate.holding.runtimeRoleBindings !== 0) fail('DEV117_HOLDING_RECEIPT_INVALID')
  return { disposition: 'REQUIRE_PROVIDER_READBACK_AFTER_HOLDING', holdingRequired: true, firstRevisionClaimedZeroTraffic: false }
}

function assertRuntimeProjection(value, config, code) {
  exactKeys(value, ['cpu', 'memory', 'concurrency', 'timeoutSeconds', 'port', 'minInstances', 'maxInstances', 'startupProbePath'], code, 'effectiveRuntime')
  const expected = { cpu: config.runtime.cpu, memory: config.runtime.memory, concurrency: config.runtime.concurrency, timeoutSeconds: config.runtime.timeoutSeconds, port: config.runtime.port, minInstances: config.runtime.minInstances, maxInstances: config.runtime.maxInstances, startupProbePath: config.runtime.startupProbePath }
  if (canonicalize(value) !== canonicalize(expected)) fail(code, 'effectiveRuntime')
}

function assertSecretBindings(value, config, code) {
  exactKeys(value, config.environment.requiredSecretEnvironmentNames, code, 'secretBindings')
  for (const [name, row] of Object.entries(value)) {
    exactKeys(row, ['resource', 'version', 'state'], code, `secretBindings.${name}`)
    if (row.resource !== config.environment.allowedSecretReferences[name] || !NUMERIC_SECRET_VERSION.test(String(row.version)) || row.state !== 'ENABLED') fail('DEV117_SECRET_BINDING_INVALID', name)
  }
}

export function assertDev117CandidateReceipt(value, config, { sourceLock, artifactReceipt, sharedGateReceipt }) {
  assertDev117Config(config)
  assertDev117SourceLock(sourceLock, config)
  assertDev117ArtifactReceipt(artifactReceipt, config, sourceLock)
  assertDev117SharedGateReceipt(sharedGateReceipt, config, sourceLock, value.observedAt)
  const code = 'DEV117_CANDIDATE_RECEIPT_INVALID'
  assertSelfHash(value, CANDIDATE_KEYS, code, 'candidateReceipt')
  releaseId(value.releaseId, code)
  if (value.releaseId !== sourceLock.releaseId || value.sourceLockSha256 !== sourceLock.evidenceSha256
    || value.artifactReceiptSha256 !== artifactReceipt.evidenceSha256 || value.sharedGateReceiptSha256 !== sharedGateReceipt.evidenceSha256
    || value.projectId !== config.target.projectId || value.region !== config.target.region || value.serviceName !== config.target.serviceName
    || value.containerName !== config.target.containerName || value.runtimeIdentity !== config.target.runtimeIdentity
    || value.sourceRevision !== sourceLock.headRevision || value.sourceTree !== sourceLock.headTree
    || value.imageDigest !== artifactReceipt.artifactDigest || value.imageUri !== artifactReceipt.imageUri
    || !REVISION.test(value.revisionName ?? '') || (value.previousRevision !== null && !REVISION.test(value.previousRevision))
    || value.candidatePercent !== 0 || value.tag !== null || value.canonicalTrafficBeforeSha256 !== value.canonicalTrafficAfterSha256) fail(code, 'identity')
  boolean(value.serviceExistedBefore, code, 'serviceExistedBefore')
  if (!value.serviceExistedBefore && sharedGateReceipt.holding == null) fail('DEV117_HOLDING_RECEIPT_REQUIRED')
  assertRuntimeProjection(value.effectiveRuntime, config, code)
  if (canonicalize(value.plainEnvironment) !== canonicalize(config.environment.fixedPlainEnvironment)) fail('DEV117_ENVIRONMENT_CONTRACT_INVALID', 'plainEnvironment')
  assertSecretBindings(value.secretBindings, config, code)
  zero(value.platformMutationCount, 'DEV117_CROSS_APP_MUTATION_FOUND', 'platformMutationCount')
  zero(value.databaseMutationCount, 'DEV117_DATABASE_MUTATION_FORBIDDEN', 'databaseMutationCount')
  zero(value.buildExecutions, 'DEV117_CANDIDATE_REBUILD_FORBIDDEN', 'buildExecutions')
  hash(value.providerReadbackSha256, code, 'providerReadbackSha256')
  exactKeys(value.progress, ['state', 'outcomeKnown', 'replayAttempted'], code, 'progress')
  if (value.progress.state !== 'COMPLETE' || value.progress.outcomeKnown !== true || value.progress.replayAttempted !== false) fail('DEV117_PROVIDER_OUTCOME_UNRESOLVED', 'progress')
  timestamp(value.observedAt, code, 'observedAt')
  if (value.credentialMaterialPresent !== false) fail('DEV117_CREDENTIAL_MATERIAL_FOUND')
  return value
}

export function assertDev117Level4AccessReceipt(value, config, candidateReceipt, evaluatedAt) {
  assertDev117Config(config)
  const code = 'DEV117_LEVEL4_ACCESS_RECEIPT_INVALID'
  assertSelfHash(value, LEVEL4_ACCESS_KEYS, code, 'level4AccessReceipt')
  releaseId(value.releaseId, code)
  if (value.releaseId !== candidateReceipt.releaseId || value.candidateReceiptSha256 !== candidateReceipt.evidenceSha256
    || value.projectId !== config.target.projectId || value.region !== config.target.region || value.serviceName !== config.target.serviceName
    || value.revisionName !== candidateReceipt.revisionName || value.imageDigest !== candidateReceipt.imageDigest
    || value.tag !== config.workflow.level4AccessTag || value.tagAfterRevision !== candidateReceipt.revisionName
    || value.tagBeforeRevision === candidateReceipt.revisionName || value.approval !== config.workflow.approvals.level4Access
    || value.wildcardCount !== 0 || value.canonicalTrafficBeforeSha256 !== value.canonicalTrafficAfterSha256) fail(code, 'identity')
  origin(value.tagHost, value.tagHost, code, 'tagHost')
  if (!new URL(value.tagHost).hostname.includes('ai-pdm-prod') || new URL(value.tagHost).hostname.includes('*')) fail(code, 'tagHost')
  safeEvidenceRef(value.identityOwnerReceiptRef, code, 'identityOwnerReceiptRef')
  safeEvidenceRef(value.serverOriginOwnerReceiptRef, code, 'serverOriginOwnerReceiptRef')
  timestamp(value.observedAt, code, 'observedAt')
  timestamp(value.expiresAt, code, 'expiresAt')
  if (Date.parse(value.observedAt) >= Date.parse(value.expiresAt) || Date.parse(evaluatedAt) >= Date.parse(value.expiresAt)) fail('DEV117_LEVEL4_ACCESS_EXPIRED')
  if (value.credentialMaterialPresent !== false) fail('DEV117_CREDENTIAL_MATERIAL_FOUND')
  return value
}

export function assertDev117Level4Join({ config, candidateReceipt, accessReceipt, dev116Receipt, evaluatedAt }) {
  assertDev117Config(config)
  assertDev117Level4AccessReceipt(accessReceipt, config, candidateReceipt, evaluatedAt)
  assertDev116R02Receipt(dev116Receipt)
  if (dev116Receipt.schemaVersion !== config.dependencies.dev116ReceiptSchema || dev116Receipt.releaseId !== candidateReceipt.releaseId
    || dev116Receipt.sourceLockSha256 !== candidateReceipt.sourceLockSha256
    || dev116Receipt.candidate.sourceRevision !== candidateReceipt.sourceRevision
    || dev116Receipt.candidate.imageDigest !== candidateReceipt.imageDigest
    || dev116Receipt.candidate.cloudRunRevision !== candidateReceipt.revisionName
    || dev116Receipt.target.projectId !== config.target.projectId || dev116Receipt.target.instance !== config.database.instance
    || dev116Receipt.target.database !== config.database.database || dev116Receipt.target.region !== config.target.region
    || dev116Receipt.target.environment !== 'production-candidate' || dev116Receipt.target.trafficPercent !== 0) fail('DEV117_LEVEL4_JOIN_INVALID')
  return { status: 'LEVEL4_VERIFIED', releaseId: candidateReceipt.releaseId, candidateReceiptSha256: candidateReceipt.evidenceSha256, level4AccessReceiptSha256: accessReceipt.evidenceSha256, dev116ReceiptSha256: dev116Receipt.evidenceSha256 }
}

export function assertDev117CrossAppMutationBoundary(value) {
  const code = 'DEV117_CROSS_APP_MUTATION_FOUND'
  exactKeys(value, ['aiPdmArtifactMutations', 'aiPdmServiceMutations', 'aiPdmTrafficChanges', 'platformArtifactMutations', 'platformServiceMutations', 'platformTrafficChanges', 'orgmasterMutations', 'databaseMutations'], code, 'mutationBoundary')
  for (const [key, count] of Object.entries(value)) integer(count, code, key)
  if (value.platformArtifactMutations !== 0 || value.platformServiceMutations !== 0 || value.platformTrafficChanges !== 0 || value.orgmasterMutations !== 0 || value.databaseMutations !== 0) fail(code)
  return value
}

export function assertDev117PromotionRequest(value, config, { candidateReceipt, accessReceipt, dev116Receipt }) {
  assertDev117Config(config)
  const code = 'DEV117_PROMOTION_REQUEST_INVALID'
  assertSelfHash(value, PROMOTION_KEYS, code, 'promotionRequest')
  if (value.releaseId !== candidateReceipt.releaseId || value.candidateReceiptSha256 !== candidateReceipt.evidenceSha256
    || value.level4AccessReceiptSha256 !== accessReceipt.evidenceSha256 || value.dev116ReceiptSha256 !== dev116Receipt.evidenceSha256
    || value.revisionName !== candidateReceipt.revisionName || value.imageDigest !== candidateReceipt.imageDigest
    || value.canonicalOrigin !== config.target.canonicalOrigin || value.productOwnerDecision !== 'GO'
    || value.approval !== config.workflow.approvals.promotion || value.openP0 !== 0 || value.openP1 !== 0 || value.rollbackReady !== true) fail(code, 'gate')
  timestamp(value.requestedAt, code, 'requestedAt')
  if (value.credentialMaterialPresent !== false) fail('DEV117_CREDENTIAL_MATERIAL_FOUND')
  return value
}

export function assertDev117RollbackReceipt(value, config) {
  assertDev117Config(config)
  const code = 'DEV117_ROLLBACK_RECEIPT_INVALID'
  assertSelfHash(value, ROLLBACK_KEYS, code, 'rollbackReceipt')
  if (value.projectId !== config.target.projectId || value.region !== config.target.region || value.serviceName !== config.target.serviceName
    || !REVISION.test(value.failedRevision ?? '') || !REVISION.test(value.restoredRevision ?? '') || value.failedRevision === value.restoredRevision
    || value.failedRevisionPercent !== 0 || value.restoredRevisionPercent !== 100 || value.platformMutationCount !== 0
    || value.databaseMutationCount !== 0 || value.downMigrations !== 0 || value.deletedRevisions !== 0 || value.outcome !== 'ROLLED_BACK') fail(code, 'boundary')
  releaseId(value.releaseId, code)
  hash(value.providerReadbackSha256, code, 'providerReadbackSha256')
  timestamp(value.observedAt, code, 'observedAt')
  if (value.credentialMaterialPresent !== false) fail('DEV117_CREDENTIAL_MATERIAL_FOUND')
  return value
}

export function assertDev117AppReleaseReceipt(value, config, evaluatedAt) {
  assertDev117Config(config)
  const code = 'DEV117_APP_RELEASE_RECEIPT_INVALID'
  assertSelfHash(value, APP_RECEIPT_KEYS, code, 'appReceipt')
  releaseId(value.releaseId, code)
  if (value.schemaVersion !== config.dependencies.appReleaseReceiptSchema || value.applicationId !== 'ai-pdm' || value.environment !== 'production'
    || !SHA40.test(value.sourceRevision ?? '') || !SHA40.test(value.sourceTree ?? '') || !IMAGE_DIGEST.test(value.artifactDigest ?? '')
    || value.serviceName !== config.target.serviceName || !REVISION.test(value.serviceRevision ?? '') || value.status !== 'LIVE_VERIFIED'
    || value.canonicalOrigin !== config.target.canonicalOrigin || value.credentialMaterialPresent !== false) fail(code, 'identity')
  origin(value.canonicalOrigin, config.target.canonicalOrigin, code, 'canonicalOrigin')
  timestamp(value.verifiedAt, code, 'verifiedAt')
  timestamp(value.expiresAt, code, 'expiresAt')
  if (Date.parse(value.verifiedAt) >= Date.parse(value.expiresAt) || Date.parse(evaluatedAt) >= Date.parse(value.expiresAt)) fail('DEV117_APP_RELEASE_RECEIPT_EXPIRED')
  safeEvidenceRef(value.smokeEvidenceRef, code, 'smokeEvidenceRef')
  safeEvidenceRef(value.rollbackEvidenceRef, code, 'rollbackEvidenceRef')
  return value
}

export function buildDev117PreflightReport({ config, releaseId: release, runId, observedAt, sourceLock, workflowContract, environmentContract, separationChecks, blockers: inputBlockers = [] }) {
  assertDev117Config(config)
  assertDev117SourceLock(sourceLock, config)
  releaseId(release, 'DEV117_PREFLIGHT_REPORT_INVALID')
  if (release !== sourceLock.releaseId || !RUN_ID.test(runId ?? '') || runId !== sourceLock.runId) fail('DEV117_PREFLIGHT_REPORT_INVALID', 'identity')
  timestamp(observedAt, 'DEV117_PREFLIGHT_REPORT_INVALID', 'observedAt')
  exactKeys(workflowContract, ['path', 'stages', 'candidateBuildAllowed', 'candidateTagAllowed', 'candidateTrafficPercent', 'promotionSeparateDispatch', 'rollbackAiPdmOnly'], 'DEV117_PREFLIGHT_REPORT_INVALID', 'workflowContract')
  exactKeys(environmentContract, ['fixedPlainEnvironment', 'requiredPlainEnvironmentNames', 'secretReferences', 'secretVersionPolicy', 'credentialMaterialPresent'], 'DEV117_PREFLIGHT_REPORT_INVALID', 'environmentContract')
  exactKeys(separationChecks, ['aiPdmOnlyArtifact', 'legacyWorkflowUntouched', 'neutralTargetExact', 'platformMutationCapabilityAbsent', 'providerCapabilitiesDisabledLocally'], 'DEV117_PREFLIGHT_REPORT_INVALID', 'separationChecks')
  blockers(inputBlockers, 'DEV117_PREFLIGHT_REPORT_INVALID')
  const ready = sourceLock.status === 'FROZEN' && Object.values(separationChecks).every(Boolean) && inputBlockers.length === 0
  return finalizeEvidence({
    schemaVersion: config.evidence.preflightReportSchema, releaseId: release, runId, devId: config.devId, slice: config.slice,
    status: ready ? 'CI_VERIFIED' : 'BLOCKED', observedAt, sourceLockSha256: sourceLock.evidenceSha256,
    profileSha256: config.profileSha256, workflowContract, environmentContract, separationChecks, blockers: inputBlockers,
    providerCalls: 0, cloudMutations: 0, databaseWrites: 0, trafficChanges: 0, credentialAccesses: 0,
    siblingRepositoryReads: 0, credentialMaterialPresent: false,
  })
}

export function assertDev117PreflightReport(value, config) {
  assertDev117Config(config)
  const code = 'DEV117_PREFLIGHT_REPORT_INVALID'
  assertSelfHash(value, PREFLIGHT_KEYS, code, 'preflightReport')
  releaseId(value.releaseId, code)
  if (value.schemaVersion !== config.evidence.preflightReportSchema || value.devId !== 'DEV-117' || value.slice !== '117-S1'
    || !RUN_ID.test(value.runId ?? '') || !['CI_VERIFIED', 'BLOCKED'].includes(value.status) || value.profileSha256 !== config.profileSha256) fail(code, 'identity')
  timestamp(value.observedAt, code, 'observedAt')
  hash(value.sourceLockSha256, code, 'sourceLockSha256')
  blockers(value.blockers, code)
  for (const key of ['providerCalls', 'cloudMutations', 'databaseWrites', 'trafficChanges', 'credentialAccesses', 'siblingRepositoryReads']) zero(value[key], 'DEV117_PROVIDER_CAPABILITY_FORBIDDEN', key)
  if (value.credentialMaterialPresent !== false) fail('DEV117_CREDENTIAL_MATERIAL_FOUND')
  if (value.status === 'CI_VERIFIED' && (value.blockers.length > 0 || Object.values(value.separationChecks).some((row) => row !== true))) fail(code, 'CI_VERIFIED prerequisites')
  return value
}

export function assertDev117StateTransition(from, to) {
  if (!(from in STATE_TRANSITIONS) || !STATE_TRANSITIONS[from].includes(to)) fail('DEV117_STATE_TRANSITION_INVALID', `${from}->${to}`)
  return { from, to }
}

export function assertDev117OutputPath(candidatePath, outputRoot, allowedFiles = ['source-lock.json', 'preflight-report.json']) {
  const root = path.resolve(outputRoot)
  const candidate = path.resolve(candidatePath)
  const relative = path.relative(root, candidate)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.dirname(candidate) !== root || !allowedFiles.includes(path.basename(candidate))) fail('DEV117_OUTPUT_OUT_OF_SCOPE', candidatePath)
  return candidate
}
