import { createHash } from 'node:crypto'

const H40 = /^[0-9a-f]{40}$/u
const H64 = /^[0-9a-f]{64}$/u
const NUMERIC_VERSION = /^[1-9][0-9]*$/u
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

function assertRunAppOrigin(value, serviceName, region = 'asia-east1', projectNumber = null) {
  let url
  try { url = new URL(value) } catch { fail('DEV013_AIPDM_ORIGIN_INVALID', serviceName) }
  const exactOrigin = projectNumber == null ? null : `https://${serviceName}-${projectNumber}.${region}.run.app`
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (exactOrigin ? url.origin !== exactOrigin : !url.hostname.startsWith(`${serviceName}-`) || !url.hostname.endsWith(`.${region}.run.app`))) fail('DEV013_AIPDM_ORIGIN_INVALID', `${serviceName}:${value}`)
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
  if (profile.schemaVersion !== 'jenfu.dev013.ai-pdm-managed-staging-release.v2' || profile.profileVersion !== 'OWNER_NATIVE_SHARED_STAGING_V2' || profile.contractSha256 !== contractHash(profile)) fail('DEV013_AIPDM_PROFILE_HASH_INVALID')
  if (profile.authorities?.platformManifestSha256 !== 'bc51a29b28a34a6316f41e3a2cfb0bc399c07befc8fc61334014f24627bae30d' || profile.authorities?.handoffContractSha256 !== 'e6307a6a1ab9ddfc15f918992d640b625fcd70a688c52e8ce712489d9ff86483') fail('DEV013_AIPDM_AUTHORITY_HASH_INVALID')
  if (contractLock?.contractVersion !== 'jenfu.sso-handoff.v1' || contractLock?.manifestSha256 !== profile.authorities.handoffContractSha256) fail('DEV013_AIPDM_HANDOFF_LOCK_INVALID')
  const manifestApp = platformManifest?.applications?.['ai-pdm']
  if (platformManifest?.schemaVersion !== 'jenfu.dev013.l3-managed-staging.v2' || platformManifest?.contractStatus !== 'CONTRACT_FROZEN_READY_FOR_OWNER_WORK' || !manifestApp) fail('DEV013_AIPDM_PLATFORM_MANIFEST_INVALID')
  const target = profile.target
  if (target.projectId !== platformManifest.target.projectId || target.projectNumber !== platformManifest.target.projectNumber || target.region !== platformManifest.target.region || target.serviceName !== manifestApp.serviceName || target.database !== platformManifest.target.database || target.connectionName !== platformManifest.target.connectionName || target.runtimeServiceAccount !== manifestApp.runtimeServiceAccount || canonicalize(target.requiredLabels) !== canonicalize(manifestApp.requiredLabels) || !exactEntryPolicy(target.entryPolicy, platformManifest.platformRelease.entryPolicy)) fail('DEV013_AIPDM_TARGET_DRIFT')
  if (profile.artifact.repository !== manifestApp.artifact.repository || profile.state.bucket !== manifestApp.state.bucket || profile.state.prefix !== manifestApp.state.prefix || profile.evidence.bucket !== manifestApp.evidence.bucket || profile.evidence.prefix !== manifestApp.evidence.prefix || canonicalize(profile.boundaries.secretReferences) !== canonicalize(manifestApp.secret.references) || canonicalize(profile.boundaries.versionBootstrap) !== canonicalize(manifestApp.secret.versionBootstrap) || manifestApp.secret.numericVersionRequired !== true || manifestApp.secret.payloadMayAppearInEvidence !== false) fail('DEV013_AIPDM_OWNER_BOUNDARY_DRIFT')
  if (profile.target.projectId === 'jenfu-ai-pdm-stg-361825' || !profile.excludedTargets.projects.includes('jenfu-ai-pdm-stg-361825') || !profile.excludedTargets.projects.includes('jenfu-platform-prod')) fail('DEV013_AIPDM_EXCLUDED_TARGET_ACTIVE')
  if (profile.runtime.deletionProtection !== false || profile.runtime.deletionGuardAuthority !== 'OWNER_WORKFLOW_POLICY' || profile.environment.initialHandoffMode !== 'off' || profile.environment.fixed.PDM_JENFU_PLATFORM_AUTH_MODE !== 'on' || profile.rollout.baselineTrafficPinStage !== 'PIN_CURRENT_READY_REVISION_TRAFFIC' || canonicalize(profile.rollout.baselineTrafficPinAllowedUpdateMasks) !== canonicalize(['traffic']) || profile.rollout.providerDeletionProtectionAvailable !== false || profile.rollout.deleteMutationsAllowed !== 0 || profile.rollout.serviceUpdateMask !== 'labels,template' || profile.rollout.activationUpdateMask !== 'traffic' || profile.rollback.updateMask !== 'traffic' || profile.boundaries.infraBootstrapTerraform !== true || profile.boundaries.serviceTerraformApply !== false || profile.boundaries.databaseMigrations !== 0 || profile.boundaries.secretValuesRead !== false) fail('DEV013_AIPDM_RELEASE_BOUNDARY_INVALID')
  const terraformAddresses = [...(profile.terraform?.dataAddresses ?? []), ...(profile.terraform?.resourceAddresses ?? [])]
  if (profile.terraform?.root !== 'infra/google-cloud/dev-013-l3-ai-pdm' || profile.terraform?.iacServiceAccount !== 'dev010-n1b-iac@jenfu-platform-nonprod.iam.gserviceaccount.com' || profile.terraform?.qcServiceAccount !== 'dev010-n1c-qc@jenfu-platform-nonprod.iam.gserviceaccount.com' || terraformAddresses.length !== 8 || new Set(terraformAddresses).size !== 8 || canonicalize(profile.terraform.allowedActions) !== canonicalize(['create', 'read', 'no-op'])) fail('DEV013_AIPDM_TERRAFORM_BOUNDARY_INVALID')
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

function terraformAddressSet(profile) {
  return [...profile.terraform.dataAddresses, ...profile.terraform.resourceAddresses].sort()
}

function assertEvidenceReference(value, code) {
  if (!value || typeof value.uri !== 'string' || !value.uri.startsWith('gs://') || !H64.test(value.sha256 ?? '') || canonicalize(Object.keys(value).sort()) !== canonicalize(['sha256', 'uri'])) fail(code)
  return value
}

export function foundationReceiptReference(bytes, explicitUri = null) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail('DEV013_AIPDM_FOUNDATION_RECEIPT_FILE_INVALID')
  let value
  try { value = JSON.parse(bytes.toString('utf8')) } catch { fail('DEV013_AIPDM_FOUNDATION_RECEIPT_FILE_INVALID') }
  const embeddedUri = value?.evidenceRef?.uri ?? value?.uri ?? null
  if (explicitUri && embeddedUri && explicitUri !== embeddedUri) fail('DEV013_AIPDM_FOUNDATION_RECEIPT_REF_INVALID')
  const uri = explicitUri ?? embeddedUri
  if (!/^gs:\/\//u.test(uri ?? '')) fail('DEV013_AIPDM_FOUNDATION_RECEIPT_REF_INVALID')
  return { uri, sha256: sha256(bytes) }
}

export function createInfraSourceFreeze({ profile, sourceFreeze, foundationReceiptBytes, foundationReceiptUri = null, observedAt = new Date().toISOString() }) {
  assertSourceFreeze(sourceFreeze, profile)
  const foundationReceipt = foundationReceiptReference(foundationReceiptBytes, foundationReceiptUri)
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-infra-source-freeze.v1',
    ownerApplicationId: 'ai-pdm',
    stage: 'OWNER_INFRA_A',
    sourceRevision: sourceFreeze.sourceRevision,
    sourceTree: sourceFreeze.sourceTree,
    sourceIdentitySha256: sourceFreeze.sourceIdentitySha256,
    profileContractSha256: profile.contractSha256,
    platformManifestSha256: profile.authorities.platformManifestSha256,
    handoffContractSha256: profile.authorities.handoffContractSha256,
    foundationReceipt,
    terraformRoot: profile.terraform.root,
    terraformAddressSetSha256: sha256(canonicalize(terraformAddressSet(profile))),
    status: 'READY_FOR_OWNER_INFRA_A_PLAN',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function assertInfraSourceFreeze(value, profile) {
  if (value?.schemaVersion !== 'jenfu.dev013.ai-pdm-infra-source-freeze.v1' || value.ownerApplicationId !== 'ai-pdm' || value.stage !== 'OWNER_INFRA_A' || !H40.test(value.sourceRevision ?? '') || !H40.test(value.sourceTree ?? '') || !H64.test(value.sourceIdentitySha256 ?? '') || value.profileContractSha256 !== profile.contractSha256 || value.platformManifestSha256 !== profile.authorities.platformManifestSha256 || value.handoffContractSha256 !== profile.authorities.handoffContractSha256 || value.terraformRoot !== profile.terraform.root || value.terraformAddressSetSha256 !== sha256(canonicalize(terraformAddressSet(profile))) || value.status !== 'READY_FOR_OWNER_INFRA_A_PLAN' || value.releaseAuthority !== false || value.receiptSha256 !== selfHash(value)) fail('DEV013_AIPDM_INFRA_SOURCE_FREEZE_INVALID')
  assertEvidenceReference(value.foundationReceipt, 'DEV013_AIPDM_FOUNDATION_RECEIPT_INVALID')
  return value
}

function planVariable(plan, name) {
  const entry = plan?.variables?.[name]
  return entry && Object.hasOwn(entry, 'value') ? entry.value : undefined
}

function planAction(change) {
  const actions = change?.change?.actions
  return Array.isArray(actions) && actions.length === 1 ? actions[0] : 'replace'
}

function assertPlanFields(after, expected, address) {
  object(after, 'DEV013_AIPDM_INFRA_PLAN_OBJECT_INVALID', address)
  for (const [name, value] of Object.entries(expected)) {
    const matches = name === 'location'
      ? String(after[name]).toLowerCase() === String(value).toLowerCase()
      : name === 'repository'
        ? after[name] === value || after[name] === `projects/${after.project}/locations/${after.location}/repositories/${value}`
      : name === 'bucket'
        ? after[name] === value || after[name] === `b/${value}`
      : canonicalize(after[name]) === canonicalize(value)
    if (!matches) fail('DEV013_AIPDM_INFRA_PLAN_OBJECT_INVALID', `${address}:${name}`)
  }
}

function terraformResources(module, rows = []) {
  if (!module || typeof module !== 'object') return rows
  for (const resource of module.resources ?? []) rows.push(resource)
  for (const child of module.child_modules ?? []) terraformResources(child, rows)
  return rows
}

function unindexedAddress(address) {
  return String(address).replace(/\[[^\]]+\]$/u, '')
}

function completePlanChanges(plan) {
  const changes = Array.isArray(plan.resource_changes) ? [...plan.resource_changes] : []
  const seen = new Set(changes.map((change) => change.address))
  const configuredData = new Set(terraformResources(plan?.configuration?.root_module).filter((row) => row.mode === 'data').map((row) => row.address))
  const stateData = terraformResources(plan?.prior_state?.values?.root_module).filter((row) => row.mode === 'data')
  for (const resource of stateData) {
    if (!seen.has(resource.address) && configuredData.has(unindexedAddress(resource.address))) {
      changes.push({ address: resource.address, change: { actions: ['read'], after: resource.values } })
      seen.add(resource.address)
    }
  }
  return changes
}

function assertInfraPlanObjects(changes, profile) {
  const byAddress = new Map(changes.map((change) => [change.address, change]))
  const get = (address) => byAddress.get(address)
  const expectedLabels = profile.target.requiredLabels
  const iacEmail = profile.terraform.iacServiceAccount
  const qcEmail = profile.terraform.qcServiceAccount
  const project = profile.target.projectId
  const region = profile.target.region
  const repository = profile.artifact.repository
  const bucket = profile.evidence.bucket
  for (const address of profile.terraform.dataAddresses) if (!['read', 'no-op'].includes(planAction(get(address)))) fail('DEV013_AIPDM_INFRA_PLAN_ACTION_DENIED', `${address}:${planAction(get(address))}`)
  for (const address of profile.terraform.resourceAddresses) if (!['create', 'no-op'].includes(planAction(get(address)))) fail('DEV013_AIPDM_INFRA_PLAN_ACTION_DENIED', `${address}:${planAction(get(address))}`)
  assertPlanFields(get('data.google_project.target')?.change?.after, { project_id: project }, 'data.google_project.target')
  assertPlanFields(get('data.google_service_account.iac')?.change?.after, { project, account_id: iacEmail.split('@')[0] }, 'data.google_service_account.iac')
  assertPlanFields(get('data.google_service_account.qc')?.change?.after, { project, account_id: qcEmail.split('@')[0] }, 'data.google_service_account.qc')
  assertPlanFields(get('google_artifact_registry_repository.ai_pdm')?.change?.after, { project, location: region, repository_id: repository, format: 'DOCKER', description: 'DEV-013 AI-PDM managed staging immutable runtime images', labels: expectedLabels }, 'google_artifact_registry_repository.ai_pdm')
  assertPlanFields(get('google_artifact_registry_repository_iam_member.iac_writer')?.change?.after, { project, location: region, repository, role: 'roles/artifactregistry.writer', member: `serviceAccount:${iacEmail}` }, 'google_artifact_registry_repository_iam_member.iac_writer')
  const bucketAfter = get('google_storage_bucket.evidence')?.change?.after
  assertPlanFields(bucketAfter, { project, name: bucket, location: region, storage_class: 'STANDARD', uniform_bucket_level_access: true, public_access_prevention: 'enforced', force_destroy: false, labels: expectedLabels }, 'google_storage_bucket.evidence')
  if (!Array.isArray(bucketAfter.retention_policy) || bucketAfter.retention_policy.length !== 1 || bucketAfter.retention_policy[0]?.is_locked !== false || Number(bucketAfter.retention_policy[0]?.retention_period) !== 2592000) fail('DEV013_AIPDM_INFRA_PLAN_OBJECT_INVALID', 'google_storage_bucket.evidence:retention_policy')
  assertPlanFields(get('google_storage_bucket_iam_member.iac_writer')?.change?.after, { bucket, role: 'roles/storage.objectCreator', member: `serviceAccount:${iacEmail}` }, 'google_storage_bucket_iam_member.iac_writer')
  assertPlanFields(get('google_storage_bucket_iam_member.qc_reader')?.change?.after, { bucket, role: 'roles/storage.objectViewer', member: `serviceAccount:${qcEmail}` }, 'google_storage_bucket_iam_member.qc_reader')
}

export function assertInfraTerraformPlan(plan, freeze, profile) {
  assertInfraSourceFreeze(freeze, profile)
  object(plan, 'DEV013_AIPDM_INFRA_PLAN_INVALID', 'plan')
  const expectedAddresses = terraformAddressSet(profile)
  const changes = completePlanChanges(plan)
  const actualAddresses = changes.map((change) => change.address).sort()
  if (canonicalize(actualAddresses) !== canonicalize(expectedAddresses)) fail('DEV013_AIPDM_INFRA_PLAN_ADDRESS_SET_MISMATCH')
  const allowed = new Set(profile.terraform.allowedActions)
  for (const change of changes) if (!allowed.has(planAction(change))) fail('DEV013_AIPDM_INFRA_PLAN_ACTION_DENIED', `${change.address}:${planAction(change)}`)
  assertInfraPlanObjects(changes, profile)
  const expectedVariables = {
    project_id: profile.target.projectId,
    region: profile.target.region,
    source_revision: freeze.sourceRevision,
    source_tree: freeze.sourceTree,
    platform_manifest_sha256: freeze.platformManifestSha256,
    canonical_contract_sha256: freeze.handoffContractSha256,
    foundation_manifest_sha256: freeze.foundationReceipt.sha256,
  }
  for (const [name, expected] of Object.entries(expectedVariables)) if (planVariable(plan, name) !== expected) fail('DEV013_AIPDM_INFRA_PLAN_VARIABLE_MISMATCH', name)
  return { status: 'PASS', stage: freeze.stage, sourceRevision: freeze.sourceRevision, addressCount: actualAddresses.length, releaseAuthority: false }
}

function serviceName(value) { return value?.name?.split('/').at(-1) ?? value?.metadata?.name ?? null }
function serviceOrigins(value) {
  let annotated = []
  const raw = value?.metadata?.annotations?.['run.googleapis.com/urls'] ?? value?.annotations?.['run.googleapis.com/urls']
  if (typeof raw === 'string') {
    try { annotated = JSON.parse(raw) } catch { fail('DEV013_AIPDM_SERVICE_URLS_INVALID') }
  }
  return [...new Set([...(value?.urls ?? []), ...annotated, value?.uri, value?.status?.uri, value?.status?.url, value?.status?.address?.url].filter(Boolean))]
}
function serviceOrigin(value, serviceName, profile) {
  const expected = `https://${serviceName}-${profile.target.projectNumber}.${profile.target.region}.run.app`
  return serviceOrigins(value).find((candidate) => candidate === expected) ?? null
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
function baselinePlainEnvironment(container, profile) {
  const defaults = object(profile.runtime.baselinePlainEnvironmentDefaults, 'DEV013_AIPDM_BASELINE_ENVIRONMENT_DEFAULTS_INVALID')
  const preserved = new Set(profile.runtime.preservedPlainEnvironmentNames)
  for (const [name, value] of Object.entries(defaults)) {
    if (!preserved.has(name) || typeof value !== 'string' || value.length === 0) fail('DEV013_AIPDM_BASELINE_ENVIRONMENT_DEFAULTS_INVALID', name)
  }
  const env = environmentMap(container)
  return Object.fromEntries(profile.runtime.preservedPlainEnvironmentNames.map((name) => {
    const value = env[name] ?? defaults[name]
    if (typeof value !== 'string' || value.length === 0) fail('DEV013_AIPDM_PRESERVED_ENVIRONMENT_MISSING', name)
    return [name, value]
  }))
}
function applyBaselinePlainEnvironmentDefaults(container, profile) {
  const defaults = profile.runtime.baselinePlainEnvironmentDefaults
  const entries = environmentEntries(container)
  for (const [name, value] of Object.entries(defaults)) {
    const existing = entries.find((item) => item.name === name)
    if (existing) {
      if (!Object.hasOwn(existing, 'value')) fail('DEV013_AIPDM_BASELINE_ENVIRONMENT_DEFAULT_CONFLICT', name)
      continue
    }
    entries.push({ name, value })
  }
}
function secretRef(entry) { return entry?.valueSource?.secretKeyRef ?? entry?.value_source?.secret_key_ref ?? null }
function readbackSecretIdentity(value, projectNumber) {
  const match = /^projects\/([^/]+)\/secrets\/([^/]+)\/versions\/([1-9][0-9]*)$/u.exec(value?.name ?? '')
  if (!match || value?.state !== 'ENABLED') return null
  if (match[1] !== projectNumber) return null
  return { secretId: match[2], version: match[3] }
}

function secretRefs(container, profile, { allowBaselineAliases = false, versionReadbacks = null } = {}) {
  const expectedNames = Object.keys(profile.boundaries.secretReferences).sort()
  if (canonicalize([...profile.runtime.secretEnvironmentNames].sort()) !== canonicalize(expectedNames)) fail('DEV013_AIPDM_SECRET_PROFILE_INVALID')
  if (versionReadbacks != null && canonicalize(Object.keys(object(versionReadbacks, 'DEV013_AIPDM_SECRET_VERSION_READBACK_INVALID')).sort()) !== canonicalize(expectedNames)) fail('DEV013_AIPDM_SECRET_VERSION_READBACK_INVALID')
  return Object.fromEntries(expectedNames.map((name) => {
    const entry = environmentEntries(container).find((item) => item.name === name)
    const ref = secretRef(entry)
    const expectedSecretId = profile.boundaries.secretReferences[name]
    const observedVersion = String(ref?.version ?? '')
    if (!ref || Object.hasOwn(entry ?? {}, 'value') || ref.secret !== expectedSecretId) fail('DEV013_AIPDM_SECRET_REFERENCE_INVALID', name)
    if (versionReadbacks == null) {
      if (!NUMERIC_VERSION.test(observedVersion)) fail('DEV013_AIPDM_SECRET_REFERENCE_INVALID', name)
      return [name, { secretId: expectedSecretId, version: observedVersion }]
    }
    const resolved = readbackSecretIdentity(versionReadbacks[name], profile.target.projectNumber)
    if (!resolved || resolved.secretId !== expectedSecretId) fail('DEV013_AIPDM_SECRET_VERSION_READBACK_INVALID', name)
    const aliasAllowed = allowBaselineAliases && profile.boundaries.versionBootstrap.allowedBaselineAliases.includes(observedVersion)
    if ((!NUMERIC_VERSION.test(observedVersion) && !aliasAllowed) || (NUMERIC_VERSION.test(observedVersion) && observedVersion !== resolved.version)) fail('DEV013_AIPDM_SECRET_VERSION_READBACK_INVALID', name)
    return [name, resolved]
  }))
}

function pinSecretReferences(container, resolved) {
  for (const [name, value] of Object.entries(resolved)) {
    const entry = environmentEntries(container).find((item) => item.name === name)
    const ref = secretRef(entry)
    ref.secret = value.secretId
    ref.version = value.version
  }
}

function assertExactSecretReferences(value, profile) {
  object(value, 'DEV013_AIPDM_SECRET_REFERENCES_INVALID')
  const names = Object.keys(profile.boundaries.secretReferences).sort()
  if (canonicalize(Object.keys(value).sort()) !== canonicalize(names)) fail('DEV013_AIPDM_SECRET_REFERENCES_INVALID')
  for (const name of names) {
    const reference = value[name]
    if (reference?.secretId !== profile.boundaries.secretReferences[name] || !NUMERIC_VERSION.test(String(reference?.version ?? ''))) fail('DEV013_AIPDM_SECRET_REFERENCES_INVALID', name)
  }
  return value
}

function revisionName(value) { return typeof value === 'string' && value.length > 0 ? value.split('/').at(-1) : null }
function normalizedTraffic(value, { allowLatest = false } = {}) {
  const traffic = serviceTraffic(value).map((item) => ({ revision: revisionName(item.revision ?? item.revisionName), percent: Number(item.percent ?? 0), tag: item.tag ?? null, latestRevision: item.latestRevision === true || item.type === 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST' }))
  const latestBaseline = allowLatest && traffic.length === 1 && traffic[0].latestRevision && traffic[0].revision == null && traffic[0].percent === 100 && traffic[0].tag === null
  if (!latestBaseline && (!traffic.length || traffic.some((item) => !item.revision || item.latestRevision || !Number.isInteger(item.percent) || item.percent < 0) || traffic.reduce((total, item) => total + item.percent, 0) !== 100)) fail('DEV013_AIPDM_TRAFFIC_NOT_REVISION_PINNED')
  return traffic
}

function vpc(value) { return value?.vpcAccess ?? value?.vpc_access ?? value?.spec?.vpcAccess ?? value?.spec?.vpc_access ?? null }
function scaling(value) { return value?.scaling ?? value?.spec?.scaling ?? null }
function probe(container) { return container?.startupProbe ?? container?.startup_probe ?? null }

export function normalizeServiceReadback(value, profile, role = 'target', options = {}) {
  object(value, 'DEV013_AIPDM_SERVICE_READBACK_INVALID', role)
  const expectedName = role === 'platform' ? profile.platformBroker.serviceName : profile.target.serviceName
  const name = serviceName(value)
  const origin = assertRunAppOrigin(serviceOrigin(value, expectedName, profile), expectedName, profile.target.region, profile.target.projectNumber)
  if (name !== expectedName || typeof value.etag !== 'string' || value.etag.trim().length < 4) fail('DEV013_AIPDM_SERVICE_READBACK_INVALID', role)
  return {
    name,
    origin,
    etag: value.etag,
    uid: value.uid ?? value.metadata?.uid ?? null,
    labels: serviceLabels(value),
    entryPolicy: serviceEntryPolicy(value),
    deletionProtection: value.deletionProtection ?? value.deletion_protection ?? false,
    template: serviceTemplate(value),
    traffic: role === 'target' ? normalizedTraffic(value, options) : serviceTraffic(value),
    latestCreatedRevision: revisionName(value.latestCreatedRevision ?? value.latest_created_revision),
    latestReadyRevision: revisionName(value.latestReadyRevision ?? value.latest_ready_revision),
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
  if (!exactEntryPolicy(readback.entryPolicy, profile.target.entryPolicy)) fail('DEV013_AIPDM_RUNTIME_BOUNDARY_INVALID', 'entry-policy')
  if (readback.deletionProtection !== profile.runtime.deletionProtection) fail('DEV013_AIPDM_RUNTIME_BOUNDARY_INVALID', 'deletion-protection')
  if (serviceAccount({ template }) !== profile.target.runtimeServiceAccount || identity.email !== profile.target.runtimeServiceAccount) fail('DEV013_AIPDM_RUNTIME_BOUNDARY_INVALID', 'runtime-service-account')
  if (proxy.image !== profile.runtime.cloudSqlProxyImage || !canonicalize(proxy.args ?? []).includes(profile.target.connectionName)) fail('DEV013_AIPDM_PROXY_BOUNDARY_INVALID')
  for (const [name, value] of Object.entries(profile.runtime.requiredDatabaseEnvironment)) if (env[name] !== value) fail('DEV013_AIPDM_DATABASE_BOUNDARY_INVALID', name)
  const templateScaling = scaling(template) ?? {}
  const max = templateScaling.maxInstanceCount ?? templateScaling.max_instance_count
  const min = templateScaling.minInstanceCount ?? templateScaling.min_instance_count ?? 0
  if (Number(max) !== profile.runtime.maxInstancesPerRevision || Number(min) !== profile.runtime.minInstances) fail('DEV013_AIPDM_CAPACITY_BOUNDARY_INVALID')
  const concurrency = template?.maxInstanceRequestConcurrency ?? template?.max_instance_request_concurrency
  if (Number(concurrency) !== profile.runtime.containerConcurrency) fail('DEV013_AIPDM_CONCURRENCY_BOUNDARY_INVALID')
  const network = canonicalize(vpc(template))
  if (!network.includes(profile.runtime.network) || !network.includes(profile.runtime.subnetwork)) fail('DEV013_AIPDM_NETWORK_BOUNDARY_INVALID')
  const startup = canonicalize(probe(app))
  if (!startup.includes(profile.runtime.startupProbePath)) fail('DEV013_AIPDM_STARTUP_PROBE_INVALID')
  return { app, proxy, env, template }
}

function preservedBoundary(readback, identity, profile, secretOptions = undefined) {
  const { app, proxy, env, template } = assertTemplateBoundary(readback, identity, profile)
  const plain = baselinePlainEnvironment(app, profile)
  const core = {
    entryPolicy: readback.entryPolicy,
    deletionProtection: readback.deletionProtection,
    runtimeServiceAccount: identity,
    vpcAccess: vpc(template),
    scaling: scaling(template),
    startupProbe: probe(app),
    secretRefs: secretRefs(app, profile, secretOptions),
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

function baselineTrafficProtectedState(target, identity, profile) {
  assertTemplateBoundary(target, identity, profile)
  const core = {
    canonicalOrigin: target.origin,
    labels: target.labels,
    entryPolicy: target.entryPolicy,
    runtimeServiceAccount: identity,
    template: target.template,
    latestCreatedRevision: target.latestCreatedRevision,
    latestReadyRevision: target.latestReadyRevision,
  }
  return { ...core, sha256: sha256(canonicalize(core)) }
}

export function buildBaselineTrafficPinningPlan({ profile, targetService, targetIdentity, observedAt = new Date().toISOString() }) {
  const target = normalizeServiceReadback(targetService, profile, 'target', { allowLatest: true })
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const protectedState = baselineTrafficProtectedState(target, identity, profile)
  const traffic = target.traffic
  if (traffic.length !== 1 || !traffic[0].latestRevision || traffic[0].revision !== null || traffic[0].percent !== 100 || traffic[0].tag !== null || !target.latestReadyRevision || target.latestCreatedRevision !== target.latestReadyRevision) fail('DEV013_AIPDM_BASELINE_TRAFFIC_PIN_INPUT_INVALID')
  const updateMask = 'traffic'
  if (!profile.rollout.baselineTrafficPinAllowedUpdateMasks.includes(updateMask)) fail('DEV013_AIPDM_BASELINE_TRAFFIC_PIN_INPUT_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-baseline-traffic-pin-plan.v2',
    ownerApplicationId: 'ai-pdm',
    target: { projectId: profile.target.projectId, region: profile.target.region, serviceName: profile.target.serviceName, canonicalOrigin: target.origin },
    runtimeServiceAccount: identity,
    before: { etag: target.etag, providerDeletionProtectionSupported: false, protectedStateSha256: protectedState.sha256, trafficSha256: sha256(canonicalize(traffic)) },
    mutation: {
      operation: 'PIN_EXISTING_LATEST_TRAFFIC_TO_READY_REVISION',
      updateMask,
      projectId: profile.target.projectId,
      region: profile.target.region,
      serviceName: profile.target.serviceName,
      etag: target.etag,
      providerDeletionProtectionChanges: 0,
      deleteMutationsAllowed: 0,
      traffic: [{ revision: target.latestReadyRevision, percent: 100, tag: null, type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION' }],
      templateChanges: 0,
      labelChanges: 0,
      serviceBoundaryChanges: 0,
      siblingMutations: 0,
    },
    status: 'READY_FOR_EXPLICIT_NONPROD_BASELINE_TRAFFIC_PIN',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, planSha256: sha256(canonicalize(core)) }
}

export function assertBaselineTrafficPinningPlan(plan, profile) {
  const expectedUpdateMask = 'traffic'
  const expectedOperation = 'PIN_EXISTING_LATEST_TRAFFIC_TO_READY_REVISION'
  const expectedOrigin = `https://${profile.target.serviceName}-${profile.target.projectNumber}.${profile.target.region}.run.app`
  const traffic = plan?.mutation?.traffic
  if (plan?.schemaVersion !== 'jenfu.dev013.ai-pdm-baseline-traffic-pin-plan.v2' || plan.ownerApplicationId !== 'ai-pdm' || plan.status !== 'READY_FOR_EXPLICIT_NONPROD_BASELINE_TRAFFIC_PIN' || plan.releaseAuthority !== false || plan.planSha256 !== selfHash(plan, 'planSha256')) fail('DEV013_AIPDM_BASELINE_TRAFFIC_PIN_PLAN_INVALID')
  if (plan.target?.projectId !== profile.target.projectId || plan.target?.region !== profile.target.region || plan.target?.serviceName !== profile.target.serviceName || plan.target?.canonicalOrigin !== expectedOrigin || assertRunAppOrigin(plan.target.canonicalOrigin, profile.target.serviceName, profile.target.region, profile.target.projectNumber) !== expectedOrigin) fail('DEV013_AIPDM_BASELINE_TRAFFIC_PIN_PLAN_INVALID')
  if (plan.runtimeServiceAccount?.email !== profile.target.runtimeServiceAccount || plan.runtimeServiceAccount?.name !== `projects/${profile.target.projectId}/serviceAccounts/${profile.target.runtimeServiceAccount}` || !UNIQUE_ID.test(String(plan.runtimeServiceAccount?.uniqueId ?? '')) || plan.runtimeServiceAccount?.disabled !== false) fail('DEV013_AIPDM_BASELINE_TRAFFIC_PIN_PLAN_INVALID')
  if (typeof plan.before?.etag !== 'string' || plan.before.etag.length < 4 || plan.before?.providerDeletionProtectionSupported !== false || !H64.test(plan.before?.protectedStateSha256 ?? '') || !H64.test(plan.before?.trafficSha256 ?? '') || !profile.rollout.baselineTrafficPinAllowedUpdateMasks.includes(expectedUpdateMask)) fail('DEV013_AIPDM_BASELINE_TRAFFIC_PIN_PLAN_INVALID')
  if (plan.mutation?.operation !== expectedOperation || plan.mutation?.updateMask !== expectedUpdateMask || plan.mutation?.projectId !== profile.target.projectId || plan.mutation?.region !== profile.target.region || plan.mutation?.serviceName !== profile.target.serviceName || plan.mutation?.etag !== plan.before.etag || plan.mutation?.providerDeletionProtectionChanges !== 0 || plan.mutation?.deleteMutationsAllowed !== 0 || plan.mutation?.templateChanges !== 0 || plan.mutation?.labelChanges !== 0 || plan.mutation?.serviceBoundaryChanges !== 0 || plan.mutation?.siblingMutations !== 0 || !Array.isArray(traffic) || traffic.length !== 1 || !String(traffic[0]?.revision ?? '').startsWith(`${profile.target.serviceName}-`) || traffic[0]?.percent !== 100 || traffic[0]?.tag !== null || traffic[0]?.type !== 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION') fail('DEV013_AIPDM_BASELINE_TRAFFIC_PIN_PLAN_INVALID')
  return plan
}

export function hardJoinBaselineTrafficPinning({ profile, plan, targetService, targetIdentity, observedAt = new Date().toISOString() }) {
  assertBaselineTrafficPinningPlan(plan, profile)
  const target = normalizeServiceReadback(targetService, profile, 'target')
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const protectedState = baselineTrafficProtectedState(target, identity, profile)
  const expectedRevision = plan.mutation?.traffic?.[0]?.revision
  const traffic = target.traffic
  if (plan.mutation?.serviceBoundaryChanges !== 0 || target.deletionProtection !== false || target.etag === plan.before?.etag || target.origin !== plan.target?.canonicalOrigin || identity.uniqueId !== plan.runtimeServiceAccount?.uniqueId || protectedState.sha256 !== plan.before?.protectedStateSha256 || target.latestCreatedRevision !== expectedRevision || target.latestReadyRevision !== expectedRevision || traffic.length !== 1 || traffic[0].revision !== expectedRevision || traffic[0].percent !== 100 || traffic[0].tag !== null || traffic[0].latestRevision) fail('DEV013_AIPDM_BASELINE_TRAFFIC_PIN_HARD_JOIN_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-baseline-traffic-pin-receipt.v2',
    ownerApplicationId: 'ai-pdm',
    revision: expectedRevision,
    providerEtag: target.etag,
    canonicalOrigin: target.origin,
    runtimeServiceAccount: identity,
    protectedStateSha256: protectedState.sha256,
    trafficSha256: sha256(canonicalize(traffic)),
    deletionGuardAuthority: profile.runtime.deletionGuardAuthority,
    providerDeletionProtectionSupported: false,
    status: 'BASELINE_TRAFFIC_PINNED',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function buildTargetBootstrapReceipt({ profile, targetService, targetIdentity, secretVersionReadbacks, observedAt = new Date().toISOString() }) {
  const target = normalizeServiceReadback(targetService, profile, 'target')
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const { env } = assertTemplateBoundary(target, identity, profile)
  if (!secretVersionReadbacks) fail('DEV013_AIPDM_SECRET_VERSION_READBACK_REQUIRED')
  const resolvedSecretReferences = secretRefs(appContainer(target.template, profile), profile, { versionReadbacks: secretVersionReadbacks })
  const labelsMatch = Object.entries(profile.target.requiredLabels).every(([key, value]) => target.labels[key] === value)
  const active = target.traffic[0]
  if (!labelsMatch || (env.PDM_JENFU_SSO_HANDOFF_MODE ?? profile.environment.initialHandoffMode) !== 'off' || target.latestReadyRevision !== active.revision || target.latestCreatedRevision !== active.revision) fail('DEV013_AIPDM_TARGET_BOOTSTRAP_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.l3-target-bootstrap-receipt.v2',
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
      deletionProtection: false,
      deletionGuardAuthority: profile.runtime.deletionGuardAuthority,
      minInstances: profile.runtime.minInstances,
    },
    runtime: { ssoHandoffMode: 'off' },
    bootstrap: { providerReadback: true, providerEtag: target.etag, activeRevision: active.revision, trafficPercent: active.percent },
    boundaries: { stateBucket: profile.state.bucket, statePrefix: profile.state.prefix, artifactRepository: profile.artifact.repository, secretReferences: resolvedSecretReferences, evidenceBucket: profile.evidence.bucket, evidencePrefix: profile.evidence.prefix, secretValueRead: false },
    status: 'TARGET_BOOTSTRAP_READY',
    releaseAuthority: false,
    productionMutations: 0,
    siblingMutations: 0,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

function expectedSecretPinRevision(profile, secretReferences) {
  return `${profile.target.serviceName}-d13sp-${sha256(canonicalize(secretReferences)).slice(0, 8)}`
}

export function buildSecretPinningPlan({ profile, targetService, targetIdentity, secretVersionReadbacks, observedAt = new Date().toISOString() }) {
  if (!secretVersionReadbacks) fail('DEV013_AIPDM_SECRET_VERSION_READBACK_REQUIRED')
  const target = normalizeServiceReadback(targetService, profile, 'target')
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const baseline = preservedBoundary(target, identity, profile, { allowBaselineAliases: true, versionReadbacks: secretVersionReadbacks })
  if ((environmentMap(appContainer(target.template, profile)).PDM_JENFU_SSO_HANDOFF_MODE ?? profile.environment.initialHandoffMode) !== 'off') fail('DEV013_AIPDM_SECRET_PIN_BASELINE_MODE_INVALID')
  const template = structuredClone(target.template)
  const app = appContainer(template, profile)
  if (typeof app.image !== 'string' || !/@sha256:[0-9a-f]{64}$/u.test(app.image)) fail('DEV013_AIPDM_SECRET_PIN_IMAGE_NOT_IMMUTABLE')
  template.revision = expectedSecretPinRevision(profile, baseline.secretRefs)
  applyBaselinePlainEnvironmentDefaults(app, profile)
  pinSecretReferences(app, baseline.secretRefs)
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-secret-pinning-plan.v1',
    ownerApplicationId: 'ai-pdm',
    target: { projectId: profile.target.projectId, region: profile.target.region, serviceName: profile.target.serviceName, canonicalOrigin: target.origin },
    runtimeServiceAccount: identity,
    applicationImage: app.image,
    secretReferences: baseline.secretRefs,
    before: { etag: target.etag, stateSha256: baseline.sha256, trafficSha256: sha256(canonicalize(target.traffic)) },
    mutation: {
      operation: 'PIN_EXISTING_SECRET_ALIASES_TO_NUMERIC_REVISION',
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
    status: 'READY_FOR_EXPLICIT_NONPROD_SECRET_PINNING',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, planSha256: sha256(canonicalize(core)) }
}

function assertRetiredReadyRevision(value, profile, revision) {
  const expectedName = `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}/revisions/${revision}`
  const conditions = Array.isArray(value?.conditions) ? value.conditions : []
  const ready = conditions.find((item) => item.type === 'Ready')
  const containerReady = conditions.find((item) => item.type === 'ContainerReady')
  const active = conditions.find((item) => item.type === 'Active')
  if (value?.name !== expectedName || typeof value?.etag !== 'string' || value.etag.length < 4 || ready?.state !== 'CONDITION_SUCCEEDED' || containerReady?.state !== 'CONDITION_SUCCEEDED' || active?.state !== 'CONDITION_FAILED' || active?.revisionReason !== 'RETIRED') fail('DEV013_AIPDM_SECRET_PIN_REVISION_READBACK_INVALID')
  return { name: expectedName, etag: value.etag, readyState: ready.state, containerReadyState: containerReady.state, activeState: active.state, activeReason: active.revisionReason }
}

export function hardJoinSecretPinningRevision({ profile, plan, targetService, targetIdentity, targetRevision, observedAt = new Date().toISOString() }) {
  if (plan?.schemaVersion !== 'jenfu.dev013.ai-pdm-secret-pinning-plan.v1' || plan.status !== 'READY_FOR_EXPLICIT_NONPROD_SECRET_PINNING' || plan.releaseAuthority !== false || plan.planSha256 !== selfHash(plan, 'planSha256')) fail('DEV013_AIPDM_SECRET_PIN_PLAN_INVALID')
  const target = normalizeServiceReadback(targetService, profile, 'target')
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const boundary = preservedBoundary(target, identity, profile)
  const revision = expectedSecretPinRevision(profile, plan.secretReferences)
  const revisionReadback = assertRetiredReadyRevision(targetRevision, profile, revision)
  const env = environmentMap(appContainer(target.template, profile))
  const labelsMatch = Object.entries(profile.target.requiredLabels).every(([key, value]) => target.labels[key] === value)
  if (plan.mutation?.updateMask !== 'labels,template' || plan.mutation?.trafficChanges !== 0 || target.etag === plan.before?.etag || target.origin !== plan.target?.canonicalOrigin || identity.uniqueId !== plan.runtimeServiceAccount?.uniqueId || target.template?.revision !== revision || target.latestCreatedRevision !== revision || target.latestReadyRevision === revision || appContainer(target.template, profile).image !== plan.applicationImage || (env.PDM_JENFU_SSO_HANDOFF_MODE ?? profile.environment.initialHandoffMode) !== 'off' || boundary.sha256 !== plan.before?.stateSha256 || sha256(canonicalize(target.traffic)) !== plan.before?.trafficSha256 || canonicalize(boundary.secretRefs) !== canonicalize(assertExactSecretReferences(plan.secretReferences, profile)) || !labelsMatch) fail('DEV013_AIPDM_SECRET_PIN_HARD_JOIN_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-secret-pinning-revision.v1',
    ownerApplicationId: 'ai-pdm',
    revision,
    providerEtag: target.etag,
    canonicalOrigin: target.origin,
    runtimeServiceAccount: identity,
    revisionReadback,
    secretReferences: boundary.secretRefs,
    protectedStateSha256: protectedBoundarySha256(boundary),
    trafficSha256: sha256(canonicalize(target.traffic)),
    status: 'SECRET_PINNING_REVISION_READY',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function buildSecretPinningActivationPlan({ profile, secretPinningRevision, currentService, observedAt = new Date().toISOString() }) {
  const current = normalizeServiceReadback(currentService, profile, 'target')
  if (secretPinningRevision?.schemaVersion !== 'jenfu.dev013.ai-pdm-secret-pinning-revision.v1' || secretPinningRevision.status !== 'SECRET_PINNING_REVISION_READY' || secretPinningRevision.releaseAuthority !== false || secretPinningRevision.receiptSha256 !== selfHash(secretPinningRevision)) fail('DEV013_AIPDM_SECRET_PIN_RECEIPT_INVALID')
  if (current.etag !== secretPinningRevision.providerEtag || current.latestCreatedRevision !== secretPinningRevision.revision || current.latestReadyRevision === secretPinningRevision.revision || current.origin !== secretPinningRevision.canonicalOrigin || secretPinningRevision.revisionReadback?.readyState !== 'CONDITION_SUCCEEDED' || secretPinningRevision.revisionReadback?.containerReadyState !== 'CONDITION_SUCCEEDED' || secretPinningRevision.revisionReadback?.activeReason !== 'RETIRED' || sha256(canonicalize(current.traffic)) !== secretPinningRevision.trafficSha256) fail('DEV013_AIPDM_SECRET_PIN_ACTIVATION_JOIN_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-secret-pinning-activation-plan.v1',
    ownerApplicationId: 'ai-pdm',
    revision: secretPinningRevision.revision,
    secretReferences: secretPinningRevision.secretReferences,
    protectedStateSha256: secretPinningRevision.protectedStateSha256,
    mutation: {
      operation: 'ACTIVATE_NUMERIC_SECRET_REVISION',
      updateMask: 'traffic',
      projectId: profile.target.projectId,
      region: profile.target.region,
      serviceName: profile.target.serviceName,
      etag: current.etag,
      traffic: [{ revision: secretPinningRevision.revision, percent: 100, tag: null, type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION' }],
      templateChanges: 0,
      siblingMutations: 0,
    },
    status: 'READY_FOR_EXPLICIT_NONPROD_SECRET_PINNING_ACTIVATION',
    releaseAuthority: false,
    observedAt,
  }
  return { ...core, planSha256: sha256(canonicalize(core)) }
}

export function hardJoinSecretPinningActivation({ profile, activationPlan, targetService, targetIdentity, observedAt = new Date().toISOString() }) {
  if (activationPlan?.schemaVersion !== 'jenfu.dev013.ai-pdm-secret-pinning-activation-plan.v1' || activationPlan.status !== 'READY_FOR_EXPLICIT_NONPROD_SECRET_PINNING_ACTIVATION' || activationPlan.releaseAuthority !== false || activationPlan.planSha256 !== selfHash(activationPlan, 'planSha256')) fail('DEV013_AIPDM_SECRET_PIN_ACTIVATION_PLAN_INVALID')
  const target = normalizeServiceReadback(targetService, profile, 'target')
  const identity = normalizeServiceAccountReadback(targetIdentity, profile)
  const boundary = preservedBoundary(target, identity, profile)
  const traffic = target.traffic
  if (target.etag === activationPlan.mutation?.etag || target.template?.revision !== activationPlan.revision || target.latestCreatedRevision !== activationPlan.revision || target.latestReadyRevision !== activationPlan.revision || protectedBoundarySha256(boundary) !== activationPlan.protectedStateSha256 || canonicalize(boundary.secretRefs) !== canonicalize(assertExactSecretReferences(activationPlan.secretReferences, profile)) || traffic.length !== 1 || traffic[0].revision !== activationPlan.revision || traffic[0].percent !== 100 || traffic[0].tag !== null || traffic[0].latestRevision) fail('DEV013_AIPDM_SECRET_PIN_ACTIVE_HARD_JOIN_INVALID')
  const core = {
    schemaVersion: 'jenfu.dev013.ai-pdm-secret-pinning-active.v1',
    ownerApplicationId: 'ai-pdm',
    revision: activationPlan.revision,
    providerEtag: target.etag,
    canonicalOrigin: target.origin,
    runtimeServiceAccount: identity,
    secretReferences: boundary.secretRefs,
    protectedStateSha256: activationPlan.protectedStateSha256,
    trafficSha256: sha256(canonicalize(traffic)),
    status: 'NUMERIC_SECRET_REVISION_ACTIVE',
    releaseAuthority: false,
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
  pinSecretReferences(app, baseline.secretRefs)
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
      secretReferencesPinned: true,
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
  const targetOrigin = assertRunAppOrigin(plan.target.canonicalOrigin, profile.target.serviceName, profile.target.region, profile.target.projectNumber)
  const brokerOrigin = assertRunAppOrigin(plan.platformBrokerOrigin, profile.platformBroker.serviceName, profile.target.region, profile.target.projectNumber)
  const plannedApp = appContainer(plan.mutation.template, profile)
  const env = environmentMap(plannedApp)
  const labelsMatch = Object.entries(profile.target.requiredLabels).every(([key, value]) => plan.mutation.labels?.[key] === value)
  const expectedStage = plan.handoffMode === 'off' ? profile.rollout.initialStage : profile.rollout.enabledStage
  if (plan.stage !== expectedStage || plan.callback !== `${targetOrigin}${profile.target.callbackPath}` || plan.mutation.projectId !== profile.target.projectId || plan.mutation.region !== profile.target.region || plan.mutation.serviceName !== profile.target.serviceName || plan.mutation.etag !== plan.before?.etag || !H64.test(plan.before?.stateSha256 ?? '') || !labelsMatch || plan.mutation.template?.revision !== expectedRevision(profile, plan.sourceRevision, plan.handoffMode) || plannedApp.image !== plan.artifactDigest || plan.runtimeServiceAccount?.email !== profile.target.runtimeServiceAccount || !UNIQUE_ID.test(plan.runtimeServiceAccount?.uniqueId ?? '') || plan.mutation.secretReferencesPinned !== true || canonicalize(secretRefs(plannedApp, profile)) !== canonicalize(assertExactSecretReferences(plan.before?.preservedBoundary?.secretRefs, profile))) fail('DEV013_AIPDM_REVISION_PLAN_INVALID')
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
    secretReferences: afterBoundary.secretRefs,
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
      traffic: [{ revision: rollbackFloor.revision, percent: 100, tag: null, type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION' }],
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
  assertExactSecretReferences(enabledReceipt.secretReferences, profile)
  const core = {
    schemaVersion: 'jenfu.dev013.l3-owner-receipt.v2',
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
      deletionProtection: false,
      deletionGuardAuthority: profile.runtime.deletionGuardAuthority,
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
      secretReferences: enabledReceipt.secretReferences,
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
    secretReferences: assertExactSecretReferences(enabledRevisionReceipt.secretReferences, profile),
    securityFloor: enabledRevisionReceipt.securityFloor,
    rollbackFloorReceiptSha256: enabledRevisionReceipt.rollbackFloorReceiptSha256,
    mutation: {
      operation: 'ACTIVATE_ENABLED_REVISION',
      updateMask: 'traffic',
      projectId: profile.target.projectId,
      region: profile.target.region,
      serviceName: profile.target.serviceName,
      etag: current.etag,
      traffic: [{ revision: enabledRevisionReceipt.revision, percent: 100, tag: null, type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION' }],
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
  if (target.etag === activationPlan.mutation.etag || target.latestCreatedRevision !== activationPlan.revision || target.latestReadyRevision !== activationPlan.revision || target.origin !== activationPlan.callback.slice(0, -profile.target.callbackPath.length) || platform.origin !== activationPlan.brokerOrigin || identity.uniqueId !== activationPlan.runtimeServiceAccount.uniqueId || app.image !== activationPlan.artifactDigest || protectedBoundarySha256(boundary) !== activationPlan.protectedStateSha256 || canonicalize(boundary.secretRefs) !== canonicalize(assertExactSecretReferences(activationPlan.secretReferences, profile)) || traffic.length !== 1 || traffic[0].revision !== activationPlan.revision || traffic[0].percent !== 100 || traffic[0].tag !== null || traffic[0].latestRevision) fail('DEV013_AIPDM_ACTIVE_HARD_JOIN_INVALID', 'provider-state')
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
    secretReferences: boundary.secretRefs,
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
