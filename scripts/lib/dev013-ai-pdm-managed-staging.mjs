import { createHash } from 'node:crypto'

const H40 = /^[0-9a-f]{40}$/u
const H64 = /^[0-9a-f]{64}$/u
const UNIQUE_ID = /^[0-9]{8,32}$/u
const RUN_IMAGE = /^asia-east1-docker[.]pkg[.]dev\/jenfu-platform-nonprod\/dev013-ai-pdm-staging\/ai-pdm@sha256:[0-9a-f]{64}$/u

export class Dev013AiPdmStagingError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}

function fail(code, detail = '') { throw new Dev013AiPdmStagingError(code, detail) }
function object(value, code, detail = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, detail)
  return value
}

export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function sha256(value) { return createHash('sha256').update(value).digest('hex') }
function selfHash(value, field = 'receiptSha256') {
  const core = structuredClone(value)
  delete core[field]
  return sha256(canonicalize(core))
}

function assertRunAppOrigin(value, serviceName, region = 'asia-east1') {
  let url
  try { url = new URL(value) } catch { fail('DEV013_AIPDM_ORIGIN_INVALID', serviceName) }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.hostname.startsWith(`${serviceName}-`) || !url.hostname.endsWith(`.${region}.run.app`)) fail('DEV013_AIPDM_ORIGIN_INVALID', `${serviceName}:${value}`)
  return url.origin
}

function exactEntryPolicy(value, expected) {
  return value?.ingress === expected.ingress && value?.defaultUriDisabled === expected.defaultUriDisabled && value?.invokerIamDisabled === expected.invokerIamDisabled
}

function contractHash(profile) {
  const core = structuredClone(profile)
  delete core.contractSha256
  return sha256(canonicalize(core))
}

export function assertDev013AiPdmStagingProfile(profile, platformManifest, contractLock) {
  object(profile, 'DEV013_AIPDM_PROFILE_INVALID')
  if (profile.schemaVersion !== 'jenfu.dev013.ai-pdm-managed-staging-release.v1' || profile.profileVersion !== 'OWNER_NATIVE_SHARED_STAGING_V1' || profile.contractSha256 !== contractHash(profile)) fail('DEV013_AIPDM_PROFILE_HASH_INVALID')
  if (profile.authorities?.platformManifestSha256 !== '7538ab12e02566eb9de107c592d6cbb43045f4a00bc94a969a84eae8a424d96c' || profile.authorities?.handoffContractSha256 !== 'e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483') fail('DEV013_AIPDM_AUTHORITY_HASH_INVALID')
  if (contractLock?.contractVersion !== 'jenfu.sso-handoff.v1' || contractLock?.manifestSha256 !== profile.authorities.handoffContractSha256) fail('DEV013_AIPDM_HANDOFF_LOCK_INVALID')
  const manifestApp = platformManifest?.applications?.['ai-pdm']
  if (platformManifest?.schemaVersion !== 'jenfu.dev013.l3-managed-staging.v1' || platformManifest?.contractStatus !== 'CONTRACT_FROZEN_READY_FOR_OWNER_WORK' || !manifestApp) fail('DEV013_AIPDM_PLATFORM_MANIFEST_INVALID')
  const target = profile.target
  if (target.projectId !== platformManifest.target.projectId || target.region !== platformManifest.target.region || target.serviceName !== manifestApp.serviceName || target.database !== platformManifest.target.database || target.connectionName !== platformManifest.target.connectionName || target.runtimeServiceAccount !== manifestApp.runtimeServiceAccount || canonicalize(target.requiredLabels) !== canonicalize(manifestApp.requiredLabels) || !exactEntryPolicy(target.entryPolicy, platformManifest.platformRelease.entryPolicy)) fail('DEV013_AIPDM_TARGET_DRIFT')
  if (profile.artifact.repository !== manifestApp.artifact.repository || profile.state.bucket !== manifestApp.state.bucket || profile.state.prefix !== manifestApp.state.prefix || profile.evidence.bucket !== manifestApp.evidence.bucket || profile.evidence.prefix !== manifestApp.evidence.prefix || profile.boundaries.secretId !== manifestApp.secret.id) fail('DEV013_AIPDM_OWNER_BOUNDARY_DRIFT')
  if (profile.target.projectId === 'jenfu-ai-pdm-stg-361825' || !profile.excludedTargets.projects.includes('jenfu-ai-pdm-stg-361825') || !profile.excludedTargets.projects.includes('jenfu-platform-prod')) fail('DEV013_AIPDM_EXCLUDED_TARGET_ACTIVE')
  if (profile.environment.initialHandoffMode !== 'off' || profile.environment.fixed.PDM_JENFU_PLATFORM_AUTH_MODE !== 'on' || profile.rollout.serviceUpdateMask !== 'labels,template' || profile.rollout.activationUpdateMask !== 'traffic' || profile.rollback.updateMask !== 'traffic' || profile.boundaries.terraformApply !== false || profile.boundaries.databaseMigrations !== 0 || profile.boundaries.secretValuesRead !== false) fail('DEV013_AIPDM_RELEASE_BOUNDARY_INVALID')
  if (canonicalize(profile.rollback.securityFloor) !== canonicalize(['auth-state-v2', 'assurance', 'original-auth-time']) || profile.rollback.preDev013ArtifactAllowed !== false) fail('DEV013_AIPDM_ROLLBACK_FLOOR_INVALID')
  return profile
}

export function createSourceFreeze({ profile, branch, sourceRevision, sourceTree, clean, sourceIdentityBytes, observedAt = new Date().toISOString() }) {
  if (!profile.application.allowedBranches.includes(branch) || !H40.test(sourceRevision ?? '') || !H40.test(sourceTree ?? '') || clean !== true || !Buffer.isBuffer(sourceIdentityBytes) || sourceIdentityBytes.length === 0) fail('DEV013_AIPDM_SOURCE_NOT_FROZEN')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-source-freeze.v1',
    ownerApplicationId: 'ai-pdm',
    branch,
    sourceRevision,
    sourceTree,
    sourceIdentitySha256: sha256(sourceIdentityBytes),
    profileContractSha256: profile.contractSha256,
    platformManifestSha256: profile.authorities.platformManifestSha256,
    handoffContractSha256: profile.authorities.handoffContractSha256,
    buildInput: {
      dockerfile: profile.artifact.dockerfile,
      dockerTarget: profile.artifact.dockerTarget,
      platform: profile.artifact.platform,
      expectedImageUri: `${profile.artifact.uri}@sha256:<provider-build-digest>`,
    },
    clean: true,
    status: 'SOURCE_FROZEN',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function assertSourceFreeze(value, profile) {
  if (value?.schemaVersion !== 'jenfu.dev013.ai-pdm-source-freeze.v1' || value.ownerApplicationId !== 'ai-pdm' || !profile.application.allowedBranches.includes(value.branch) || !H40.test(value.sourceRevision ?? '') || !H40.test(value.sourceTree ?? '') || !H64.test(value.sourceIdentitySha256 ?? '') || value.profileContractSha256 !== profile.contractSha256 || value.platformManifestSha256 !== profile.authorities.platformManifestSha256 || value.handoffContractSha256 !== profile.authorities.handoffContractSha256 || value.clean !== true || value.status !== 'SOURCE_FROZEN' || value.releaseAuthority !== false || value.receiptSha256 !== selfHash(value)) fail('DEV013_AIPDM_SOURCE_FREEZE_INVALID')
  return value
}

function serviceName(value) { return value?.name?.split('/').at(-1) ?? value?.metadata?.name ?? null }
function serviceOrigin(value) {
  return value?.uri ?? value?.status?.uri ?? value?.status?.url ?? value?.status?.address?.url ?? value?.urls?.[0] ?? null
}
function serviceAccount(value) { return value?.template?.serviceAccount ?? value?.spec?.template?.spec?.serviceAccountName ?? value?.spec?.template?.serviceAccount ?? null }
function serviceLabels(value) { return value?.labels ?? value?.metadata?.labels ?? {} }
function serviceEntryPolicy(value) {
  return {
    ingress: value?.ingress ?? value?.spec?.ingress ?? null,
    defaultUriDisabled: value?.defaultUriDisabled ?? value?.default_uri_disabled ?? false,
    invokerIamDisabled: value?.invokerIamDisabled ?? value?.invoker_iam_disabled ?? false,
  }
}
function serviceTemplate(value) { return value?.template ?? value?.spec?.template ?? null }
function serviceTraffic(value) { return value?.traffic ?? value?.spec?.traffic ?? [] }

function appContainer(template, profile) {
  const containers = template?.containers ?? template?.spec?.containers ?? []
  const container = containers.find((item) => item.name === profile.runtime.applicationContainer)
  if (!container) fail('DEV013_AIPDM_APP_CONTAINER_MISSING')
  return container
}

function proxyContainer(template, profile) {
  const containers = template?.containers ?? template?.spec?.containers ?? []
  const container = containers.find((item) => item.name === profile.runtime.cloudSqlProxyContainer)
  if (!container) fail('DEV013_AIPDM_PROXY_CONTAINER_MISSING')
  return container
}

function environmentEntries(container) { return container?.env ?? [] }
function environmentMap(container) {
  return Object.fromEntries(environmentEntries(container).filter((item) => Object.hasOwn(item, 'value')).map((item) => [item.name, String(item.value)]))
}
function secretRef(entry) { return entry?.valueSource?.secretKeyRef ?? entry?.value_source?.secret_key_ref ?? null }
function secretRefs(container, profile) {
  return Object.fromEntries(profile.runtime.secretEnvironmentNames.map((name) => {
    const entry = environmentEntries(container).find((item) => item.name === name)
    const ref = secretRef(entry)
    if (!ref || Object.hasOwn(entry ?? {}, 'value') || ref.secret !== profile.boundaries.secretId || !/^[1-9][0-9]*$/u.test(String(ref.version))) fail('DEV013_AIPDM_SECRET_REFERENCE_INVALID', name)
    return [name, { secret: ref.secret, version: String(ref.version) }]
  }))
}

function normalizedTraffic(value) {
  const traffic = serviceTraffic(value).map((item) => ({ revision: item.revision ?? item.revisionName ?? null, percent: Number(item.percent ?? 0), tag: item.tag ?? null, latestRevision: item.latestRevision === true || item.type === 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST' }))
  if (!traffic.length || traffic.some((item) => !item.revision || item.latestRevision || !Number.isInteger(item.percent) || item.percent < 0) || traffic.reduce((total, item) => total + item.percent, 0) !== 100) fail('DEV013_AIPDM_TRAFFIC_NOT_REVISION_PINNED')
  return traffic
}

function vpc(value) { return value?.vpcAccess ?? value?.vpc_access ?? value?.spec?.vpcAccess ?? value?.spec?.vpc_access ?? null }
function scaling(value) { return value?.scaling ?? value?.spec?.scaling ?? null }
function probe(container) { return container?.startupProbe ?? container?.startup_probe ?? null }

export function normalizeServiceReadback(value, profile, role = 'target') {
  object(value, 'DEV013_AIPDM_SERVICE_READBACK_INVALID', role)
  const expectedName = role === 'platform' ? profile.platformBroker.serviceName : profile.target.serviceName
  const name = serviceName(value)
  const origin = assertRunAppOrigin(serviceOrigin(value), expectedName, profile.target.region)
  if (name !== expectedName || typeof value.etag !== 'string' || value.etag.trim().length < 4) fail('DEV013_AIPDM_SERVICE_READBACK_INVALID', role)
  return {
    name,
    origin,
    etag: value.etag,
    uid: value.uid ?? value.metadata?.uid ?? null,
    labels: serviceLabels(value),
    entryPolicy: serviceEntryPolicy(value),
    deletionProtection: value.deletionProtection ?? value.deletion_protection ?? null,
    template: serviceTemplate(value),
    traffic: role === 'target' ? normalizedTraffic(value) : serviceTraffic(value),
    latestCreatedRevision: value.latestCreatedRevision ?? value.latest_created_revision ?? null,
    latestReadyRevision: value.latestReadyRevision ?? value.latest_ready_revision ?? null,
  }
}

export function normalizeServiceAccountReadback(value, profile) {
  const email = value?.email ?? null
  const uniqueId = String(value?.uniqueId ?? value?.unique_id ?? '')
  if (email !== profile.target.runtimeServiceAccount || value?.name !== `projects/${profile.target.projectId}/serviceAccounts/${email}` || !UNIQUE_ID.test(uniqueId) || value.disabled === true) fail('DEV013_AIPDM_RUNTIME_IDENTITY_INVALID')
  return { email, uniqueId, name: value.name, disabled: false }
}

function assertTemplateBoundary(readback, identity, profile) {
  const template = readback.template
  const app = appContainer(template, profile)
  const proxy = proxyContainer(template, profile)
  const env = environmentMap(app)
  if (!exactEntryPolicy(readback.entryPolicy, profile.target.entryPolicy) || readback.deletionProtection !== true || serviceAccount({ template }) !== profile.target.runtimeServiceAccount || identity.email !== profile.target.runtimeServiceAccount) fail('DEV013_AIPDM_RUNTIME_BOUNDARY_INVALID')
  if (proxy.image !== profile.runtime.cloudSqlProxyImage || !canonicalize(proxy.args ?? []).includes(profile.target.connectionName)) fail('DEV013_AIPDM_PROXY_BOUNDARY_INVALID')
  for (const [name, value] of Object.entries(profile.runtime.requiredDatabaseEnvironment)) if (env[name] !== value) fail('DEV013_AIPDM_DATABASE_BOUNDARY_INVALID', name)
  const templateScaling = scaling(template) ?? {}
  const max = templateScaling.maxInstanceCount ?? templateScaling.max_instance_count
  const min = templateScaling.minInstanceCount ?? templateScaling.min_instance_count
  if (Number(max) !== profile.runtime.maxInstancesPerRevision || Number(min) !== profile.runtime.minInstances) fail('DEV013_AIPDM_CAPACITY_BOUNDARY_INVALID')
  const concurrency = template?.maxInstanceRequestConcurrency ?? template?.max_instance_request_concurrency
  if (Number(concurrency) !== profile.runtime.containerConcurrency) fail('DEV013_AIPDM_CONCURRENCY_BOUNDARY_INVALID')
  const network = canonicalize(vpc(template))
  if (!network.includes(profile.runtime.network) || !network.includes(profile.runtime.subnetwork)) fail('DEV013_AIPDM_NETWORK_BOUNDARY_INVALID')
  const startup = canonicalize(probe(app))
  if (!startup.includes(profile.runtime.startupProbePath)) fail('DEV013_AIPDM_STARTUP_PROBE_INVALID')
  return { app, proxy, env, template }
}

function preservedBoundary(readback, identity, profile) {
  const { app, proxy, env, template } = assertTemplateBoundary(readback, identity, profile)
  const plain = Object.fromEntries(profile.runtime.preservedPlainEnvironmentNames.map((name) => {
    if (typeof env[name] !== 'string' || env[name].length === 0) fail('DEV013_AIPDM_PRESERVED_ENVIRONMENT_MISSING', name)
    return [name, env[name]]
  }))
  const core = {
    entryPolicy: readback.entryPolicy,
    deletionProtection: readback.deletionProtection,
    runtimeServiceAccount: identity,
    vpcAccess: vpc(template),
    scaling: scaling(template),
    startupProbe: probe(app),
    secretRefs: secretRefs(app, profile),
    preservedPlainEnvironment: plain,
    databaseEnvironment: Object.fromEntries(Object.keys(profile.runtime.requiredDatabaseEnvironment).map((name) => [name, env[name]])),
    proxy: { image: proxy.image, args: proxy.args ?? [], resources: proxy.resources ?? null, startupProbe: probe(proxy) },
    traffic: readback.traffic,
  }
  return { ...core, sha256: sha256(canonicalize(core)) }
}

function protectedBoundarySha256(boundary) {
  const core = structuredClone(boundary)
  delete core.sha256
  delete core.traffic
  return sha256(canonicalize(core))
}

export function buildTargetBootstrapReceipt({ profile, targetService, targetIdentity, observedAt = new Date().toISOString() }) {
  const target = normalizeServiceReadback(targetService, profile, 'target')
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const { env } = assertTemplateBoundary(target, identity, profile)
  const labelsMatch = Object.entries(profile.target.requiredLabels).every(([key, value]) => target.labels[key] === value)
  const active = target.traffic[0]
  if (!labelsMatch || env.PDM_JENFU_SSO_HANDOFF_MODE !== 'off' || target.latestReadyRevision !== active.revision || target.latestCreatedRevision !== active.revision) fail('DEV013_AIPDM_TARGET_BOOTSTRAP_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.l3-target-bootstrap-receipt.v1',
    ownerApplicationId: 'ai-pdm',
    platformManifestSha256: profile.authorities.platformManifestSha256,
    target: {
      projectId: profile.target.projectId,
      region: profile.target.region,
      serviceName: profile.target.serviceName,
      canonicalOrigin: target.origin,
      labels: profile.target.requiredLabels,
      runtimeServiceAccount: { email: identity.email, uniqueId: identity.uniqueId },
      entryPolicy: profile.target.entryPolicy,
      deletionProtection: true,
      minInstances: profile.runtime.minInstances,
    },
    runtime: { ssoHandoffMode: 'off' },
    bootstrap: { providerReadback: true, providerEtag: target.etag, activeRevision: active.revision, trafficPercent: active.percent },
    boundaries: { stateBucket: profile.state.bucket, statePrefix: profile.state.prefix, artifactRepository: profile.artifact.repository, secretId: profile.boundaries.secretId, evidenceBucket: profile.evidence.bucket, evidencePrefix: profile.evidence.prefix, secretValueRead: false },
    status: 'TARGET_BOOTSTRAP_READY',
    releaseAuthority: false,
    productionMutations: 0,
    siblingMutations: 0,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

function setPlainEnvironment(container, values) {
  const names = new Set(Object.keys(values))
  container.env = environmentEntries(container).filter((entry) => !names.has(entry.name))
  for (const [name, value] of Object.entries(values)) container.env.push({ name, value: String(value) })
}

function expectedRevision(profile, sourceRevision, mode) { return `${profile.target.serviceName}-dev013${sourceRevision.slice(0, 8)}-${mode}` }

export function buildRevisionPlan({ profile, sourceFreeze, platformService, targetService, targetIdentity, artifactDigest, mode = 'off', rollbackFloor = null, observedAt = new Date().toISOString() }) {
  assertSourceFreeze(sourceFreeze, profile)
  if (!['off', 'on'].includes(mode) || !RUN_IMAGE.test(artifactDigest ?? '') || !artifactDigest.startsWith(`${profile.artifact.uri}@`)) fail('DEV013_AIPDM_REVISION_INPUT_INVALID')
  const platform = normalizeServiceReadback(platformService, profile, 'platform')
  const target = normalizeServiceReadback(targetService, profile, 'target')
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const baseline = preservedBoundary(target, identity, profile)
  if (mode === 'on') assertRollbackFloor(rollbackFloor, { profile, sourceFreeze, artifactDigest })
  const template = structuredClone(target.template)
  template.revision = expectedRevision(profile, sourceFreeze.sourceRevision, mode)
  const app = appContainer(template, profile)
  app.image = artifactDigest
  const derived = {
    ...profile.environment.fixed,
    ...profile.runtime.requiredDatabaseEnvironment,
    PDM_BUILD_COMMIT: sourceFreeze.sourceRevision,
    DEV013_L3_SOURCE_REVISION: sourceFreeze.sourceRevision,
    DEV013_L3_SOURCE_TREE: sourceFreeze.sourceTree,
    DEV013_L3_SOURCE_IDENTITY_SHA256: sourceFreeze.sourceIdentitySha256,
    DEV013_L3_CONTRACT_SHA256: profile.authorities.handoffContractSha256,
    PDM_PUBLIC_BASE_URL: target.origin,
    PDM_SESSION_ISSUER: target.origin,
    PDM_JENFU_SSO_BROKER_ORIGIN: platform.origin,
    PDM_JENFU_SSO_HANDOFF_MODE: mode,
  }
  setPlainEnvironment(app, derived)
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-revision-plan.v1',
    ownerApplicationId: 'ai-pdm',
    stage: mode === 'off' ? profile.rollout.initialStage : profile.rollout.enabledStage,
    sourceRevision: sourceFreeze.sourceRevision,
    sourceTree: sourceFreeze.sourceTree,
    sourceIdentitySha256: sourceFreeze.sourceIdentitySha256,
    artifactDigest,
    target: { projectId: profile.target.projectId, region: profile.target.region, serviceName: profile.target.serviceName, canonicalOrigin: target.origin },
    platformBrokerOrigin: platform.origin,
    callback: `${target.origin}${profile.target.callbackPath}`,
    runtimeServiceAccount: identity,
    handoffMode: mode,
    before: { etag: target.etag, stateSha256: baseline.sha256, preservedBoundary: baseline },
    mutation: {
      operation: 'PATCH_EXISTING_SERVICE_REVISION',
      updateMask: profile.rollout.serviceUpdateMask,
      projectId: profile.target.projectId,
      region: profile.target.region,
      serviceName: profile.target.serviceName,
      etag: target.etag,
      labels: { ...target.labels, ...profile.target.requiredLabels },
      template,
      trafficChanges: 0,
      terraformApply: false,
    },
    rollbackFloorReceiptSha256: rollbackFloor?.receiptSha256 ?? null,
    status: 'READY_FOR_NONPROD_APPLY',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, planSha256: sha256(canonicalize(core)) }
}

export function assertRevisionPlan(plan, profile) {
  if (plan?.schemaVersion !== 'jenfu.dev013.ai-pdm-revision-plan.v1' || !H40.test(plan.sourceRevision ?? '') || !H40.test(plan.sourceTree ?? '') || !H64.test(plan.sourceIdentitySha256 ?? '') || !RUN_IMAGE.test(plan.artifactDigest ?? '') || !['off', 'on'].includes(plan.handoffMode) || plan.target?.projectId !== profile.target.projectId || plan.target?.region !== profile.target.region || plan.target?.serviceName !== profile.target.serviceName || plan.mutation?.updateMask !== 'labels,template' || plan.mutation?.trafficChanges !== 0 || plan.mutation?.terraformApply !== false || plan.status !== 'READY_FOR_NONPROD_APPLY' || plan.releaseAuthority !== false || plan.planSha256 !== selfHash(plan, 'planSha256')) fail('DEV013_AIPDM_REVISION_PLAN_INVALID')
  const targetOrigin = assertRunAppOrigin(plan.target.canonicalOrigin, profile.target.serviceName, profile.target.region)
  const brokerOrigin = assertRunAppOrigin(plan.platformBrokerOrigin, profile.platformBroker.serviceName, profile.target.region)
  const env = environmentMap(appContainer(plan.mutation.template, profile))
  const labelsMatch = Object.entries(profile.target.requiredLabels).every(([key, value]) => plan.mutation.labels?.[key] === value)
  const expectedStage = plan.handoffMode === 'off' ? profile.rollout.initialStage : profile.rollout.enabledStage
  if (plan.stage !== expectedStage || plan.callback !== `${targetOrigin}${profile.target.callbackPath}` || plan.mutation.projectId !== profile.target.projectId || plan.mutation.region !== profile.target.region || plan.mutation.serviceName !== profile.target.serviceName || plan.mutation.etag !== plan.before?.etag || !H64.test(plan.before?.stateSha256 ?? '') || !labelsMatch || plan.mutation.template?.revision !== expectedRevision(profile, plan.sourceRevision, plan.handoffMode) || appContainer(plan.mutation.template, profile).image !== plan.artifactDigest || plan.runtimeServiceAccount?.email !== profile.target.runtimeServiceAccount || !UNIQUE_ID.test(plan.runtimeServiceAccount?.uniqueId ?? '')) fail('DEV013_AIPDM_REVISION_PLAN_INVALID')
  const expectedEnv = { PDM_BUILD_COMMIT: plan.sourceRevision, DEV013_L3_SOURCE_REVISION: plan.sourceRevision, DEV013_L3_SOURCE_TREE: plan.sourceTree, DEV013_L3_SOURCE_IDENTITY_SHA256: plan.sourceIdentitySha256, DEV013_L3_CONTRACT_SHA256: profile.authorities.handoffContractSha256, PDM_JENFU_PLATFORM_AUTH_MODE: 'on', PDM_JENFU_SSO_HANDOFF_MODE: plan.handoffMode, PDM_JENFU_SSO_BROKER_ORIGIN: brokerOrigin, PDM_PUBLIC_BASE_URL: targetOrigin, PDM_SESSION_ISSUER: targetOrigin }
  if (Object.entries(expectedEnv).some(([name, value]) => env[name] !== value)) fail('DEV013_AIPDM_REVISION_PLAN_INVALID')
  return plan
}

function afterEnvironment(readback, profile) { return environmentMap(appContainer(readback.template, profile)) }

export function hardJoinRevision({ profile, plan, platformService, targetService, targetIdentity, observedAt = new Date().toISOString() }) {
  assertRevisionPlan(plan, profile)
  const platform = normalizeServiceReadback(platformService, profile, 'platform')
  const target = normalizeServiceReadback(targetService, profile, 'target')
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const afterBoundary = preservedBoundary(target, identity, profile)
  const env = afterEnvironment(target, profile)
  const app = appContainer(target.template, profile)
  const revision = expectedRevision(profile, plan.sourceRevision, plan.handoffMode)
  const labelsMatch = Object.entries(profile.target.requiredLabels).every(([key, value]) => target.labels[key] === value)
  if (target.etag === plan.before.etag || target.origin !== plan.target.canonicalOrigin || platform.origin !== plan.platformBrokerOrigin || identity.uniqueId !== plan.runtimeServiceAccount.uniqueId || target.template?.revision !== revision || target.latestCreatedRevision !== revision || app.image !== plan.artifactDigest || afterBoundary.sha256 !== plan.before.stateSha256 || !labelsMatch) fail('DEV013_AIPDM_PROVIDER_HARD_JOIN_INVALID', 'provider-state')
  const expectedEnv = {
    PDM_BUILD_COMMIT: plan.sourceRevision,
    DEV013_L3_SOURCE_REVISION: plan.sourceRevision,
    DEV013_L3_SOURCE_TREE: plan.sourceTree,
    DEV013_L3_SOURCE_IDENTITY_SHA256: plan.sourceIdentitySha256,
    DEV013_L3_CONTRACT_SHA256: profile.authorities.handoffContractSha256,
    PDM_JENFU_PLATFORM_AUTH_MODE: 'on',
    PDM_JENFU_SSO_HANDOFF_MODE: plan.handoffMode,
    PDM_JENFU_SSO_BROKER_ORIGIN: plan.platformBrokerOrigin,
    PDM_PUBLIC_BASE_URL: plan.target.canonicalOrigin,
    PDM_SESSION_ISSUER: plan.target.canonicalOrigin,
  }
  if (Object.entries(expectedEnv).some(([name, value]) => env[name] !== value) || `${env.PDM_PUBLIC_BASE_URL}${profile.target.callbackPath}` !== plan.callback) fail('DEV013_AIPDM_PROVIDER_HARD_JOIN_INVALID', 'environment')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-provider-hard-join.v1',
    ownerApplicationId: 'ai-pdm',
    sourceRevision: plan.sourceRevision,
    sourceTree: plan.sourceTree,
    sourceIdentitySha256: plan.sourceIdentitySha256,
    artifactDigest: plan.artifactDigest,
    revision,
    providerEtag: target.etag,
    existingStateSha256: plan.before.stateSha256,
    protectedStateSha256: protectedBoundarySha256(afterBoundary),
    canonicalOrigin: target.origin,
    brokerOrigin: platform.origin,
    callback: plan.callback,
    runtimeServiceAccount: identity,
    handoffMode: plan.handoffMode,
    trafficSha256: sha256(canonicalize(target.traffic)),
    securityFloor: { authStateV2: true, assurance: true, originalAuthTime: true },
    rollbackFloorReceiptSha256: plan.rollbackFloorReceiptSha256,
    status: plan.handoffMode === 'off' ? 'SECURITY_FLOOR_READY' : 'ENABLED_REVISION_READY',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function assertRollbackFloor(value, { profile, sourceFreeze, artifactDigest }) {
  if (value?.schemaVersion !== 'jenfu.dev013.ai-pdm-provider-hard-join.v1' || value.ownerApplicationId !== 'ai-pdm' || value.status !== 'SECURITY_FLOOR_READY' || value.handoffMode !== 'off' || value.sourceRevision !== sourceFreeze.sourceRevision || value.sourceTree !== sourceFreeze.sourceTree || value.sourceIdentitySha256 !== sourceFreeze.sourceIdentitySha256 || value.artifactDigest !== artifactDigest || value.securityFloor?.authStateV2 !== true || value.securityFloor?.assurance !== true || value.securityFloor?.originalAuthTime !== true || value.releaseAuthority !== false || value.receiptSha256 !== selfHash(value) || !value.revision?.startsWith(`${profile.target.serviceName}-dev013`)) fail('DEV013_AIPDM_ROLLBACK_FLOOR_INVALID')
  return value
}

export function buildRollbackPlan({ profile, enabledReceipt, rollbackFloor, currentService, observedAt = new Date().toISOString() }) {
  const current = normalizeServiceReadback(currentService, profile, 'target')
  if (enabledReceipt?.schemaVersion !== 'jenfu.dev013.ai-pdm-active-hard-join.v1' || enabledReceipt.status !== 'OWNER_READY_FOR_L3_BROWSER' || enabledReceipt.handoffMode !== 'on' || enabledReceipt.receiptSha256 !== selfHash(enabledReceipt)) fail('DEV013_AIPDM_ENABLED_RECEIPT_INVALID')
  assertRollbackFloor(rollbackFloor, { profile, sourceFreeze: enabledReceipt, artifactDigest: enabledReceipt.artifactDigest })
  if (rollbackFloor.sourceRevision !== enabledReceipt.sourceRevision || rollbackFloor.artifactDigest !== enabledReceipt.artifactDigest || enabledReceipt.rollbackFloorReceiptSha256 !== rollbackFloor.receiptSha256 || current.latestCreatedRevision !== enabledReceipt.revision || current.etag !== enabledReceipt.providerEtag || current.traffic.length !== 1 || current.traffic[0].revision !== enabledReceipt.revision || current.traffic[0].percent !== 100) fail('DEV013_AIPDM_ROLLBACK_JOIN_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-rollback-plan.v1',
    ownerApplicationId: 'ai-pdm',
    sourceRevision: enabledReceipt.sourceRevision,
    artifactDigest: enabledReceipt.artifactDigest,
    fromRevision: enabledReceipt.revision,
    toRevision: rollbackFloor.revision,
    securityFloorReceiptSha256: rollbackFloor.receiptSha256,
    mutation: {
      operation: 'ROLLBACK_TRAFFIC_TO_OFF_SECURITY_FLOOR',
      updateMask: 'traffic',
      projectId: profile.target.projectId,
      region: profile.target.region,
      serviceName: profile.target.serviceName,
      etag: current.etag,
      traffic: [{ revision: rollbackFloor.revision, percent: 100, tag: null }],
      templateChanges: 0,
      siblingMutations: 0,
    },
    status: 'ROLLBACK_READY',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function buildOwnerReceipt({ profile, enabledReceipt, observedAt = new Date().toISOString() }) {
  if (enabledReceipt?.schemaVersion !== 'jenfu.dev013.ai-pdm-active-hard-join.v1' || enabledReceipt.status !== 'OWNER_READY_FOR_L3_BROWSER' || enabledReceipt.handoffMode !== 'on' || enabledReceipt.receiptSha256 !== selfHash(enabledReceipt)) fail('DEV013_AIPDM_ENABLED_RECEIPT_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.l3-owner-receipt.v1',
    ownerApplicationId: 'ai-pdm',
    sourceRevision: enabledReceipt.sourceRevision,
    sourceTree: enabledReceipt.sourceTree,
    sourceIdentitySha256: enabledReceipt.sourceIdentitySha256,
    artifactDigest: enabledReceipt.artifactDigest,
    target: {
      projectId: profile.target.projectId,
      region: profile.target.region,
      serviceName: profile.target.serviceName,
      canonicalOrigin: enabledReceipt.canonicalOrigin,
      labels: profile.target.requiredLabels,
      runtimeServiceAccount: { email: enabledReceipt.runtimeServiceAccount.email, uniqueId: enabledReceipt.runtimeServiceAccount.uniqueId },
      entryPolicy: profile.target.entryPolicy,
      deletionProtection: true,
      minInstances: 0,
    },
    runtime: { ssoHandoffMode: 'on' },
    hardJoin: {
      providerReadback: true,
      providerEtag: enabledReceipt.providerEtag,
      activeRevision: enabledReceipt.revision,
      trafficPercent: 100,
      brokerOrigin: enabledReceipt.brokerOrigin,
      callback: enabledReceipt.callback,
      handoffMode: enabledReceipt.handoffMode,
      existingStateSha256: enabledReceipt.existingStateSha256,
    },
    boundaries: {
      stateBucket: profile.state.bucket,
      statePrefix: profile.state.prefix,
      artifactRepository: profile.artifact.repository,
      secretId: profile.boundaries.secretId,
      evidenceBucket: profile.evidence.bucket,
      evidencePrefix: profile.evidence.prefix,
      secretValueRead: false,
    },
    rollback: { status: 'READY', siblingMutations: 0, securityFloor: enabledReceipt.securityFloor, securityFloorReceiptSha256: enabledReceipt.rollbackFloorReceiptSha256 },
    capacity: { databasePoolMax: profile.runtime.databasePoolMax, maxInstancesPerRevision: profile.runtime.maxInstancesPerRevision },
    status: 'OWNER_READY_FOR_L3_BROWSER',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function buildActivationPlan({ profile, enabledRevisionReceipt, currentService, observedAt = new Date().toISOString() }) {
  const current = normalizeServiceReadback(currentService, profile, 'target')
  if (enabledRevisionReceipt?.schemaVersion !== 'jenfu.dev013.ai-pdm-provider-hard-join.v1' || enabledRevisionReceipt.status !== 'ENABLED_REVISION_READY' || enabledRevisionReceipt.handoffMode !== 'on' || !H64.test(enabledRevisionReceipt.protectedStateSha256 ?? '') || !H64.test(enabledRevisionReceipt.rollbackFloorReceiptSha256 ?? '') || enabledRevisionReceipt.receiptSha256 !== selfHash(enabledRevisionReceipt)) fail('DEV013_AIPDM_ENABLED_REVISION_RECEIPT_INVALID')
  if (current.etag !== enabledRevisionReceipt.providerEtag || current.latestCreatedRevision !== enabledRevisionReceipt.revision || current.origin !== enabledRevisionReceipt.canonicalOrigin) fail('DEV013_AIPDM_ACTIVATION_JOIN_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-activation-plan.v1',
    ownerApplicationId: 'ai-pdm',
    sourceRevision: enabledRevisionReceipt.sourceRevision,
    sourceTree: enabledRevisionReceipt.sourceTree,
    sourceIdentitySha256: enabledRevisionReceipt.sourceIdentitySha256,
    artifactDigest: enabledRevisionReceipt.artifactDigest,
    revision: enabledRevisionReceipt.revision,
    brokerOrigin: enabledRevisionReceipt.brokerOrigin,
    callback: enabledRevisionReceipt.callback,
    runtimeServiceAccount: enabledRevisionReceipt.runtimeServiceAccount,
    existingStateSha256: enabledRevisionReceipt.existingStateSha256,
    protectedStateSha256: enabledRevisionReceipt.protectedStateSha256,
    securityFloor: enabledRevisionReceipt.securityFloor,
    rollbackFloorReceiptSha256: enabledRevisionReceipt.rollbackFloorReceiptSha256,
    mutation: {
      operation: 'ACTIVATE_ENABLED_REVISION',
      updateMask: 'traffic',
      projectId: profile.target.projectId,
      region: profile.target.region,
      serviceName: profile.target.serviceName,
      etag: current.etag,
      traffic: [{ revision: enabledRevisionReceipt.revision, percent: 100, tag: null }],
      templateChanges: 0,
      siblingMutations: 0,
    },
    status: 'READY_FOR_NONPROD_ACTIVATION',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, planSha256: sha256(canonicalize(core)) }
}

export function hardJoinActivation({ profile, activationPlan, platformService, targetService, targetIdentity, observedAt = new Date().toISOString() }) {
  if (activationPlan?.schemaVersion !== 'jenfu.dev013.ai-pdm-activation-plan.v1' || activationPlan.status !== 'READY_FOR_NONPROD_ACTIVATION' || activationPlan.releaseAuthority !== false || activationPlan.planSha256 !== selfHash(activationPlan, 'planSha256')) fail('DEV013_AIPDM_ACTIVATION_PLAN_INVALID')
  const platform = normalizeServiceReadback(platformService, profile, 'platform')
  const target = normalizeServiceReadback(targetService, profile, 'target')
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const boundary = preservedBoundary(target, identity, profile)
  const app = appContainer(target.template, profile)
  const env = afterEnvironment(target, profile)
  const traffic = target.traffic
  if (target.etag === activationPlan.mutation.etag || target.latestCreatedRevision !== activationPlan.revision || target.latestReadyRevision !== activationPlan.revision || target.origin !== activationPlan.callback.slice(0, -profile.target.callbackPath.length) || platform.origin !== activationPlan.brokerOrigin || identity.uniqueId !== activationPlan.runtimeServiceAccount.uniqueId || app.image !== activationPlan.artifactDigest || protectedBoundarySha256(boundary) !== activationPlan.protectedStateSha256 || traffic.length !== 1 || traffic[0].revision !== activationPlan.revision || traffic[0].percent !== 100 || traffic[0].tag !== null || traffic[0].latestRevision) fail('DEV013_AIPDM_ACTIVE_HARD_JOIN_INVALID', 'provider-state')
  if (env.PDM_BUILD_COMMIT !== activationPlan.sourceRevision || env.DEV013_L3_SOURCE_TREE !== activationPlan.sourceTree || env.DEV013_L3_SOURCE_IDENTITY_SHA256 !== activationPlan.sourceIdentitySha256 || env.PDM_JENFU_PLATFORM_AUTH_MODE !== 'on' || env.PDM_JENFU_SSO_HANDOFF_MODE !== 'on' || env.PDM_JENFU_SSO_BROKER_ORIGIN !== activationPlan.brokerOrigin || env.PDM_PUBLIC_BASE_URL !== target.origin || env.PDM_SESSION_ISSUER !== target.origin) fail('DEV013_AIPDM_ACTIVE_HARD_JOIN_INVALID', 'environment')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-active-hard-join.v1',
    ownerApplicationId: 'ai-pdm',
    sourceRevision: activationPlan.sourceRevision,
    sourceTree: activationPlan.sourceTree,
    sourceIdentitySha256: activationPlan.sourceIdentitySha256,
    artifactDigest: activationPlan.artifactDigest,
    revision: activationPlan.revision,
    providerEtag: target.etag,
    existingStateSha256: activationPlan.existingStateSha256,
    protectedStateSha256: activationPlan.protectedStateSha256,
    canonicalOrigin: target.origin,
    brokerOrigin: platform.origin,
    callback: activationPlan.callback,
    runtimeServiceAccount: identity,
    handoffMode: 'on',
    trafficSha256: sha256(canonicalize(traffic)),
    securityFloor: activationPlan.securityFloor,
    rollbackFloorReceiptSha256: activationPlan.rollbackFloorReceiptSha256,
    status: 'OWNER_READY_FOR_L3_BROWSER',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export const constants = Object.freeze({ H40, H64, RUN_IMAGE, UNIQUE_ID })
