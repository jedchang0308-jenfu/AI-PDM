import { readReadbackIamReceipt, readbackIamPlan, readPrebuildIamContinuation } from './dev122-openswx-readback-iam.mjs'
import { assertImmutableRef, canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { resolveWorkerArtifact, verifyWorkerArtifactReuse, createWorkerEvidenceContext } from './dev122-openswx-worker-artifact-reuse.mjs'
import { runAiPdmEvidenceContext, descendAiPdmEvidenceContext } from './dev121-owner-release-proof.mjs'

export const WORKER_PROFILE_PATH = 'config/release/dev122-openswx-worker.json'
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const BUCKET = 'jenfu-platform-prod-aipdm-release'
export const WORKER_RECEIPT_PREFIX = 'receipts/dev-122/openswx-worker'
const PROJECT = 'jenfu-platform-prod'
const NUMBER = '9536592944'
const REGION = 'asia-east1'
const JOB = 'ai-pdm-prod-openswx-metadata'
export const WORKER_SOURCE_PATHS = Object.freeze([
  WORKER_PROFILE_PATH, 'scripts/run-openswx-metadata-job.mjs',
  ...['Dockerfile', 'CMakeLists.txt', 'reader.cc', 'process.mjs', 'normalize.mjs', 'auxiliary-job.mjs', 'source-manifest.json', 'zlib-component.spdx.json'].map(name => `scripts/lib/openswx-reader/${name}`),
])
function fail(code) { const error = new Error(code); error.code = code; throw error }
function exact(value, keys, code) {
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(code)
}
export function boundOpenSwxTransport(transport, deadlineAt) {
  const limit = Math.min(Date.parse(deadlineAt), Date.now() + 600_000)
  if (!Number.isFinite(limit) || Date.now() >= limit) fail('OPENSWX_OWNER_DEADLINE')
  const check = () => { if (Date.now() >= limit) fail('OPENSWX_OWNER_DEADLINE') }
  const bounded = { ...transport }
  for (const method of ['request', 'readJson', 'readBytes', 'putJson', 'readOwnerSourceProof']) {
    if (typeof transport[method] !== 'function') continue
    bounded[method] = async (...args) => {
      check()
      if (method === 'request') args[1] = { ...(args[1] ?? {}), signal: AbortSignal.timeout(Math.max(1, Math.min(30_000, limit - Date.now()))) }
      const result = await transport[method](...args); check(); return result
    }
  }
  return bounded
}
/** putJson returns verified provider bytes, not a parsed value. Parse before any dependent mutation. */
export async function writeWorkerJson(transport, uri, value) {
  const row = await transport.putJson(uri, value, { bucket: BUCKET, prefix: WORKER_RECEIPT_PREFIX })
  assertOpenSwxWorkerRef(row.ref)
  if (row.ref.uri !== uri || !Buffer.isBuffer(row.bytes) || sha256(row.bytes) !== row.ref.sha256) fail('OPENSWX_JSON_WRITE_READBACK_INVALID')
  const actual = JSON.parse(row.bytes)
  if (canonicalize(actual) !== canonicalize(value)) fail('OPENSWX_JSON_WRITE_READBACK_INVALID')
  return { ...row, value: actual }
}
export function assertOpenSwxWorkerRef(ref) {
  assertImmutableRef(ref, BUCKET, [WORKER_RECEIPT_PREFIX])
  const name = ref.uri.slice(`gs://${BUCKET}/`.length)
  if (!/^[A-Za-z0-9._/-]+\.json$/u.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) fail('IMMUTABLE_REF_INVALID')
  return ref
}
export function assertOpenSwxWorkerProfile(value) {
  const fixed = {
    schemaVersion: 'aipdm.openswx-worker-profile.v1', ownerApplicationId: 'ai-pdm',
    projectId: PROJECT, projectNumber: NUMBER, location: REGION, jobId: JOB,
    readerServiceAccount: `aipdm-prod-openswx-reader@${PROJECT}.iam.gserviceaccount.com`,
    schedulerId: 'aipdm-prod-openswx-dispatch', dispatchServiceAccount: `aipdm-prod-openswx-dispatch@${PROJECT}.iam.gserviceaccount.com`,
    normalActor: 'jedchang0308@jenfu.com.tw', canonicalOrigin: `https://ai-pdm-prod-${NUMBER}.${REGION}.run.app`,
    recoverPath: '/api/openswx-metadata-dispatch/recover', readerId: 'openswx-metadata-reader',
    readerCommit: '30bd63845d3532cdecfdf2654e9cc0871229c45a', readerPurpose: 'openswx_metadata_jobs', readerCapability: 'openswx_metadata',
    tokenSecretId: 'aipdm-prod-openswx-reader-token', registrySecretId: 'aipdm-prod-workload-auth-credentials',
    artifactUri: `asia-east1-docker.pkg.dev/${PROJECT}/aipdm-release/ai-pdm-openswx-worker`,
    receiptRoot: `gs://${BUCKET}/${WORKER_RECEIPT_PREFIX}`, backendBucket: 'tfstate-jenfu-platform-prod', backendPrefix: 'dev-122/openswx-worker',
    dockerfile: 'scripts/lib/openswx-reader/Dockerfile', dockerTarget: 'finite-worker', readerSource: 'scripts/lib/openswx-reader',
    dispatchPolicy: 'scheduler_only.v1',
    bounds: { cpu: '1', memory: '1Gi', taskCount: 1, parallelism: 1, timeoutSeconds: 300, maxRetries: 0, schedule: '*/5 * * * *', schedulerRetryCount: 0, schedulerAttemptDeadlineSeconds: 30, recoverDeadlineSeconds: 20, ownerDeadlineSeconds: 600, pollMilliseconds: 1000, maxExecutionPages: 4, maxLogPages: 4, maxLogEntries: 100, proofFreshnessSeconds: 60 },
  }
  if (canonicalize(value) !== canonicalize(fixed)) fail('OPENSWX_WORKER_PROFILE_INVALID')
  return value
}
export function canonicalWorkerExecution(name) {
  const match = /^projects\/(jenfu-platform-prod|9536592944)\/locations\/asia-east1\/jobs\/ai-pdm-prod-openswx-metadata\/executions\/([a-z][a-z0-9-]{0,62})$/u.exec(name ?? '')
  if (!match) fail('OPENSWX_EXECUTION_SCOPE_INVALID')
  return `projects/${NUMBER}/locations/${REGION}/jobs/${JOB}/executions/${match[2]}`
}
export function workerJobName() { return `projects/${PROJECT}/locations/${REGION}/jobs/${JOB}` }
export function workerSchedulerName() { return `projects/${PROJECT}/locations/${REGION}/jobs/aipdm-prod-openswx-dispatch` }
export function assertNumericSecret(name, secretId) {
  if (!new RegExp(`^projects/(?:${PROJECT}|${NUMBER})/secrets/${secretId}/versions/[1-9][0-9]*$`, 'u').test(name ?? '')) fail('OPENSWX_NUMERIC_SECRET_INVALID')
  return name.replace(`projects/${PROJECT}/`, `projects/${NUMBER}/`)
}
export function workerTemplate(profile, image, tokenVersion, mode = 'normal') {
  assertOpenSwxWorkerProfile(profile)
  if (!image?.startsWith(`${profile.artifactUri}@sha256:`) || !H64.test(image.split('@sha256:')[1] ?? '') || !['normal', 'selftest'].includes(mode)) fail('OPENSWX_TEMPLATE_INVALID')
  const secret = mode === 'normal' ? assertNumericSecret(tokenVersion, profile.tokenSecretId) : null
  const env = mode === 'normal' ? [
    { name: 'PDM_OPENSWX_APP_ORIGIN', value: profile.canonicalOrigin },
    { name: 'PDM_OPENSWX_READER_TOKEN', valueSource: { secretKeyRef: { secret: profile.tokenSecretId, version: secret.split('/').at(-1) } } },
  ] : []
  return { taskCount: 1, parallelism: 1, template: { serviceAccount: profile.readerServiceAccount, timeout: '300s', maxRetries: 0,
    containers: [{ image, command: ['/usr/local/bin/node', '/worker/scripts/run-openswx-metadata-job.mjs'], args: mode === 'selftest' ? ['--isolation-self-test-only'] : [], env, resources: { limits: { cpu: '1', memory: '1Gi' } } }] } }
}
// Policy hashes have a separate schema and literal placeholders. They never
// certify an actual provider template, image or credential version.
export function workerTemplatePolicy(profile, mode) {
  const template = workerTemplate(profile, `${profile.artifactUri}@sha256:${'0'.repeat(64)}`, `projects/${NUMBER}/secrets/${profile.tokenSecretId}/versions/1`, mode)
  template.template.containers[0].image = 'WORKER_IMAGE_DIGEST'
  for (const env of template.template.containers[0].env) if (env.valueSource) env.valueSource.secretKeyRef.version = 'TOKEN_NUMERIC_VERSION'
  return { schemaVersion: 'aipdm.openswx-template-policy.v1', mode, template }
}
export function assertWorkerDescriptor(value, profile, profileSha256, sourceRevision) {
  assertOpenSwxWorkerProfile(profile)
  const common = ['schemaVersion', 'ownerApplicationId', 'purpose', 'sourceRevision', 'sourceArchiveSha256', 'workerProfileSha256', 'projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'resourcePlanHash', 'normalTemplatePolicySha256', 'selftestTemplatePolicySha256', 'dispatchPolicy', 'bounds', 'receiptRoot']
  const repair = value?.schemaVersion === 'aipdm.openswx-worker-descriptor.v3'
  const reuse = repair || value?.schemaVersion === 'aipdm.openswx-worker-descriptor.v2'
  const additional = repair ? ['workerBuildRef', 'pausedBaselineRef', 'priorActivationRef', 'retainedWorkerDescriptorRef', 'releaseVariant', 'tokenSecretVersion', 'registrySecretVersion'] : value?.purpose === 'build_only' ? [reuse ? 'workerBuildRef' : 'resourcePlanRef'] : ['workerBuildRef', 'bootstrapRef', 'cloudPreflightRef', 'pausedDrainedRef', 'tokenSecretVersion', 'registrySecretVersion']
  if (reuse) additional.push('artifactMode')
  exact(value, [...common, ...additional], 'OPENSWX_DESCRIPTOR_INVALID')
  if ((!reuse && value.schemaVersion !== 'aipdm.openswx-worker-descriptor.v1') || (reuse && value.artifactMode !== 'REUSE_VERIFIED') || value.ownerApplicationId !== 'ai-pdm' || !['build_only', 'full'].includes(value.purpose)
    || (repair && (value.purpose !== 'full' || value.releaseVariant !== 'PAUSED_APP_REPAIR'))
    || !H40.test(sourceRevision ?? '') || value.sourceRevision !== sourceRevision || value.workerProfileSha256 !== profileSha256
    || !H64.test(profileSha256 ?? '') || ['sourceArchiveSha256', 'resourcePlanHash'].some(key => !H64.test(value[key] ?? ''))
    || value.normalTemplatePolicySha256 !== sha256(canonicalize(workerTemplatePolicy(profile, 'normal')))
    || value.selftestTemplatePolicySha256 !== sha256(canonicalize(workerTemplatePolicy(profile, 'selftest')))) fail('OPENSWX_DESCRIPTOR_INVALID')
  for (const key of ['projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'dispatchPolicy', 'bounds', 'receiptRoot']) if (canonicalize(value[key]) !== canonicalize(profile[key])) fail('OPENSWX_DESCRIPTOR_INVALID')
  for (const key of additional.filter(key => key.endsWith('Ref'))) assertOpenSwxWorkerRef(value[key])
  if (value.purpose === 'full') { assertNumericSecret(value.tokenSecretVersion, profile.tokenSecretId); assertNumericSecret(value.registrySecretVersion, profile.registrySecretId) }
  return value
}
export function isPausedAppRepair(descriptor) {
  return descriptor?.schemaVersion === 'aipdm.openswx-worker-descriptor.v3' && descriptor.purpose === 'full' && descriptor.artifactMode === 'REUSE_VERIFIED' && descriptor.releaseVariant === 'PAUSED_APP_REPAIR'
}
const SOURCE_BINDING_KEYS = ['sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'workerProfileSha256', 'resourcePlanHash']
const SNAPSHOT_KEYS = ['jobName', 'jobEtag', 'jobGeneration', 'normalTemplateSha256', 'image', 'numericCredentials', 'secretMetadata', 'schedulerState', 'schedulerPolicySha256', 'schedulerUserUpdateTime', 'iamSha256', 'executions']
const SERVING_KEYS = ['capsuleRef', 'canonicalRef', 'finalizeRef', 'terminalRef', 'runtimeConfigRef', 'workerDescriptorRef', 'sourceRevision', 'revision', 'artifactDigest', 'workerStatus', 'serviceEtag', 'generalTrafficPercent', 'tagCount', 'canonicalOrigin']
const BASELINE_KEYS = ['schemaVersion', 'ownerApplicationId', 'purpose', 'status', 'evidenceScope', 'inputRef', 'source', 'priorActivationRef', 'retainedWorkerDescriptorRef', 'predecessorBaselineRef', 'servingApp', 'actor', 'observationStartedAt', 'observationCompletedAt', 'observedAt', 'pauseFenceSeconds', 'before', 'after', 'providerReadbackRefs', 'resourcesUnchanged', 'mutationPerformed', 'providerQuiescenceProven', 'dbAdmissionProof', 'continuationDepth']
function repairTime(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('OPENSWX_REPAIR_TIME_INVALID')
  return Date.parse(value)
}
function nonempty(value) { return typeof value === 'string' && value.length > 0 }
function assertRepairReleaseRef(ref) {
  assertImmutableRef(ref, BUCKET, ['receipts'])
  const name = ref.uri.slice(`gs://${BUCKET}/`.length)
  if (!/^[A-Za-z0-9._/-]+\.json$/u.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) fail('OPENSWX_REPAIR_REF_INVALID')
  return ref
}
function assertRepairSource(value) {
  exact(value, SOURCE_BINDING_KEYS, 'OPENSWX_REPAIR_SOURCE_INVALID')
  if (!H40.test(value.sourceRevision) || ['sourceArchiveSha256', 'workerProfileSha256', 'resourcePlanHash'].some(key => !H64.test(value[key]))) fail('OPENSWX_REPAIR_SOURCE_INVALID')
  assertRepairReleaseRef(value.sourceLockRef)
}
export function assertRepairSnapshot(value, profile) {
  exact(value, SNAPSHOT_KEYS, 'OPENSWX_REPAIR_SNAPSHOT_INVALID')
  exact(value.numericCredentials, ['token', 'registry'], 'OPENSWX_REPAIR_SNAPSHOT_INVALID')
  const token = assertNumericSecret(value.numericCredentials.token, profile.tokenSecretId), registry = assertNumericSecret(value.numericCredentials.registry, profile.registrySecretId)
  if (token !== value.numericCredentials.token || registry !== value.numericCredentials.registry || value.jobName !== workerJobName() || !nonempty(value.jobEtag) || !/^[1-9][0-9]*$/u.test(value.jobGeneration)
    || value.schedulerState !== 'PAUSED' || ['normalTemplateSha256', 'schedulerPolicySha256', 'iamSha256'].some(key => !H64.test(value[key]))
    || value.normalTemplateSha256 !== sha256(canonicalize(workerTemplate(profile, value.image, token)))) fail('OPENSWX_REPAIR_SNAPSHOT_INVALID')
  if (value.schedulerUserUpdateTime !== null) repairTime(value.schedulerUserUpdateTime)
  if (!Array.isArray(value.secretMetadata) || value.secretMetadata.length !== 2) fail('OPENSWX_REPAIR_SNAPSHOT_INVALID')
  for (const [index, row] of value.secretMetadata.entries()) {
    exact(row, ['name', 'state', 'etag'], 'OPENSWX_REPAIR_SNAPSHOT_INVALID')
    if (row.name !== [token, registry][index] || row.state !== 'ENABLED' || !nonempty(row.etag)) fail('OPENSWX_REPAIR_SNAPSHOT_INVALID')
  }
  if (!Array.isArray(value.executions) || value.executions.length > 400) fail('OPENSWX_REPAIR_SNAPSHOT_INVALID')
  const names = new Set()
  for (const row of value.executions) {
    exact(row, ['name', 'createTime', 'completionTime', 'completedState', 'rawPageRef'], 'OPENSWX_REPAIR_SNAPSHOT_INVALID')
    if (canonicalWorkerExecution(row.name) !== row.name || names.has(row.name) || repairTime(row.completionTime) < repairTime(row.createTime) || !['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(row.completedState)) fail('OPENSWX_REPAIR_SNAPSHOT_INVALID')
    names.add(row.name); assertOpenSwxWorkerRef(row.rawPageRef)
  }
  return value
}
export function repairSnapshotProjection(value) {
  return { ...value, executions: value.executions.map(({ rawPageRef: _ref, ...row }) => row).sort((a, b) => a.name.localeCompare(b.name)) }
}
export function assertPausedRepairBaseline(value, profile) {
  exact(value, BASELINE_KEYS, 'OPENSWX_REPAIR_BASELINE_INVALID')
  if (value.schemaVersion !== 'aipdm.openswx-paused-app-repair-baseline.v1' || value.ownerApplicationId !== 'ai-pdm' || value.purpose !== 'PAUSED_APP_REPAIR' || value.status !== 'PASS'
    || value.evidenceScope !== 'PRODUCTION_PROVIDER_READBACK' || value.actor !== profile.normalActor || value.pauseFenceSeconds !== 55 || value.resourcesUnchanged !== true || value.mutationPerformed !== false
    || value.providerQuiescenceProven !== true || value.dbAdmissionProof !== 'NOT_YET_PROVEN' || !Number.isInteger(value.continuationDepth) || value.continuationDepth < 1 || value.continuationDepth > 8) fail('OPENSWX_REPAIR_BASELINE_INVALID')
  for (const key of ['inputRef', 'priorActivationRef', 'retainedWorkerDescriptorRef']) assertOpenSwxWorkerRef(value[key])
  if (value.predecessorBaselineRef !== null) assertOpenSwxWorkerRef(value.predecessorBaselineRef)
  assertRepairSource(value.source)
  exact(value.servingApp, SERVING_KEYS, 'OPENSWX_REPAIR_SERVING_INVALID')
  for (const key of ['capsuleRef', 'canonicalRef', 'finalizeRef', 'terminalRef', 'runtimeConfigRef']) assertRepairReleaseRef(value.servingApp[key])
  assertOpenSwxWorkerRef(value.servingApp.workerDescriptorRef)
  if (!H40.test(value.servingApp.sourceRevision) || !/^ai-pdm-prod-[a-f0-9]{12}$/u.test(value.servingApp.revision) || !new RegExp(`^asia-east1-docker\\.pkg\\.dev/${PROJECT}/aipdm-release/ai-pdm@sha256:[a-f0-9]{64}$`, 'u').test(value.servingApp.artifactDigest)
    || !['READY', 'ACTIVATION_PENDING'].includes(value.servingApp.workerStatus) || !nonempty(value.servingApp.serviceEtag) || value.servingApp.generalTrafficPercent !== 100 || value.servingApp.tagCount !== 0 || value.servingApp.canonicalOrigin !== profile.canonicalOrigin
    || (value.servingApp.workerStatus === 'READY' ? value.predecessorBaselineRef !== null || value.continuationDepth !== 1 : value.predecessorBaselineRef === null)) fail('OPENSWX_REPAIR_SERVING_INVALID')
  const started = repairTime(value.observationStartedAt), completed = repairTime(value.observationCompletedAt), observed = repairTime(value.observedAt)
  if (completed - started < 55_000 || completed - started > 600_000 || observed < completed || observed - started > 600_000) fail('OPENSWX_REPAIR_FENCE_INVALID')
  assertRepairSnapshot(value.before, profile); assertRepairSnapshot(value.after, profile)
  if (canonicalize(repairSnapshotProjection(value.before)) !== canonicalize(repairSnapshotProjection(value.after))) fail('OPENSWX_REPAIR_RESOURCE_DRIFT')
  if (!Array.isArray(value.providerReadbackRefs) || !value.providerReadbackRefs.length || value.providerReadbackRefs.length > 64) fail('OPENSWX_REPAIR_BASELINE_INVALID')
  const ids = new Set()
  for (const row of value.providerReadbackRefs) {
    exact(row, ['id', 'api', 'method', 'url', 'observedAt', 'bodyRef'], 'OPENSWX_REPAIR_READBACK_INVALID')
    if (!nonempty(row.id) || ids.has(row.id) || !['RUN_JOB', 'RUN_EXECUTIONS_PAGE', 'SCHEDULER_JOB', 'SECRET_TOKEN_VERSION_METADATA', 'SECRET_REGISTRY_VERSION_METADATA', 'OWN_RESOURCE_POLICY', 'APP_SERVICE', 'APP_REVISION'].includes(row.api)
      || !['GET', 'POST'].includes(row.method) || !nonempty(row.url) || repairTime(row.observedAt) < started || repairTime(row.observedAt) > observed) fail('OPENSWX_REPAIR_READBACK_INVALID')
    ids.add(row.id); assertOpenSwxWorkerRef(row.bodyRef)
  }
  return value
}
export function assertPausedRepairCurrentCheck(value, baseline, profile) {
  exact(value, ['schemaVersion', 'associationRef', 'pausedBaselineRef', 'actor', 'observedAt', 'phase', 'providerReadbackRefs', 'jobEtag', 'jobGeneration', 'normalTemplateSha256', 'schedulerState', 'executions', 'servingRevision', 'dbAdmissionProof'], 'OPENSWX_REPAIR_CURRENT_CHECK_INVALID')
  if (value.schemaVersion !== 'aipdm.openswx-paused-app-repair-check.v1' || ![profile.normalActor, `aipdm-prod-verifier@${PROJECT}.iam.gserviceaccount.com`, `aipdm-prod-builder@${PROJECT}.iam.gserviceaccount.com`, `aipdm-prod-deployer@${PROJECT}.iam.gserviceaccount.com`].includes(value.actor)
    || !['PRODUCER_REPLAY', 'PREPARE', 'CANDIDATE', 'PRETRAFFIC', 'FINALIZE', 'RECOVERY'].includes(value.phase) || value.schedulerState !== 'PAUSED' || value.dbAdmissionProof !== 'NOT_YET_PROVEN'
    || value.jobEtag !== baseline.after.jobEtag || value.jobGeneration !== baseline.after.jobGeneration || value.normalTemplateSha256 !== baseline.after.normalTemplateSha256 || !nonempty(value.servingRevision)) fail('OPENSWX_REPAIR_CURRENT_CHECK_INVALID')
  assertOpenSwxWorkerRef(value.associationRef); assertOpenSwxWorkerRef(value.pausedBaselineRef); repairTime(value.observedAt)
  assertRepairSnapshot({ ...baseline.after, executions: value.executions }, profile)
  if (!Array.isArray(value.providerReadbackRefs) || value.providerReadbackRefs.length < 1 || value.providerReadbackRefs.length > 64) fail('OPENSWX_REPAIR_CURRENT_CHECK_INVALID')
  for (const row of value.providerReadbackRefs) {
    exact(row, ['id', 'api', 'method', 'url', 'observedAt', 'bodyRef'], 'OPENSWX_REPAIR_CURRENT_CHECK_INVALID')
    if (!nonempty(row.id) || !['RUN_JOB', 'RUN_EXECUTIONS_PAGE', 'SCHEDULER_JOB', 'SECRET_TOKEN_VERSION_METADATA', 'SECRET_REGISTRY_VERSION_METADATA', 'OWN_RESOURCE_POLICY', 'APP_SERVICE', 'APP_REVISION'].includes(row.api)
      || !['GET', 'POST'].includes(row.method) || !nonempty(row.url) || repairTime(row.observedAt) > repairTime(value.observedAt)) fail('OPENSWX_REPAIR_CURRENT_CHECK_INVALID')
    assertOpenSwxWorkerRef(row.bodyRef)
  }
  return value
}
export function buildPausedRepairDescriptor({ profile, association, associationRef, baseline, baselineRef, retainedDescriptor, retainedDescriptorRef }) {
  assertPausedRepairBaseline(baseline, profile)
  assertWorkerDescriptor(retainedDescriptor, profile, retainedDescriptor.workerProfileSha256, retainedDescriptor.sourceRevision)
  if (isPausedAppRepair(retainedDescriptor) || retainedDescriptor.purpose !== 'full' || canonicalize(retainedDescriptorRef) !== canonicalize(baseline.retainedWorkerDescriptorRef)
    || association.schemaVersion !== 'aipdm.openswx-worker-build-association.v2' || association.resourceBasis !== 'PAUSED_APP_REPAIR' || canonicalize(association.resourceAssociation.readbackRef) !== canonicalize(baselineRef)
    || SOURCE_BINDING_KEYS.some(key => canonicalize(association[key]) !== canonicalize(baseline.source[key])) || canonicalize(association.priorActivationRef) !== canonicalize(baseline.priorActivationRef)) fail('OPENSWX_REPAIR_DESCRIPTOR_JOIN_INVALID')
  const value = { schemaVersion: 'aipdm.openswx-worker-descriptor.v3', ownerApplicationId: 'ai-pdm', purpose: 'full', artifactMode: 'REUSE_VERIFIED', releaseVariant: 'PAUSED_APP_REPAIR',
    ...Object.fromEntries(['sourceRevision', 'sourceArchiveSha256', 'workerProfileSha256', 'resourcePlanHash'].map(key => [key, baseline.source[key]])),
    ...Object.fromEntries(['projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'dispatchPolicy', 'bounds', 'receiptRoot'].map(key => [key, profile[key]])),
    normalTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'normal'))), selftestTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'selftest'))),
    workerBuildRef: associationRef, pausedBaselineRef: baselineRef, priorActivationRef: baseline.priorActivationRef, retainedWorkerDescriptorRef: retainedDescriptorRef,
    tokenSecretVersion: baseline.after.numericCredentials.token, registrySecretVersion: baseline.after.numericCredentials.registry }
  return assertWorkerDescriptor(value, profile, value.workerProfileSha256, value.sourceRevision)
}
export async function readWorkerDescriptor({ transport, ref, profileBytes, sourceRevision }) {
  assertOpenSwxWorkerRef(ref)
  const profile = assertOpenSwxWorkerProfile(JSON.parse(profileBytes))
  const result = await transport.readJson(ref, BUCKET, [WORKER_RECEIPT_PREFIX])
  assertWorkerDescriptor(result.value, profile, sha256(profileBytes), sourceRevision)
  return { ...result, profile }
}
export function assertWorkerRuntimeJoin(runtimeConfig, intent, descriptor = null) {
  const flag = runtimeConfig?.plainEnvironment?.PDM_OPENSWX_DISPATCH_ENABLED ?? '0';
  if (!intent.openswxWorkerRef) {
    if (flag !== '0' || runtimeConfig?.openswxWorker) fail('OPENSWX_RUNTIME_BINDING_INVALID')
    return
  }
  const binding = runtimeConfig?.openswxWorker
  if (!descriptor || flag !== (descriptor.purpose === 'full' ? '1' : '0') || !binding || binding.purpose !== descriptor.purpose
    || binding.sourceRevision !== intent.sourceRevision || binding.workerProfileSha256 !== descriptor.workerProfileSha256
    || canonicalize(binding.descriptorRef) !== canonicalize(intent.openswxWorkerRef)) fail('OPENSWX_RUNTIME_BINDING_INVALID')
  if (descriptor.purpose === 'full' && runtimeConfig.secretVersions?.PDM_WORKLOAD_AUTH_CREDENTIALS !== descriptor.registrySecretVersion.split('/').at(-1)) fail('OPENSWX_RUNTIME_BINDING_INVALID')
}
export function assertWorkerReceipt(value, descriptor, kind, { actor, image } = {}) {
  if (value?.schemaVersion !== 'aipdm.openswx-owner-receipt.v1' || value.kind !== kind || value.status !== 'PASS' || value.evidenceScope !== 'PRODUCTION_PROVIDER'
    || value.ownerApplicationId !== 'ai-pdm' || value.sourceRevision !== descriptor.sourceRevision || value.sourceArchiveSha256 !== descriptor.sourceArchiveSha256
    || value.workerProfileSha256 !== descriptor.workerProfileSha256 || value.resourcePlanHash !== descriptor.resourcePlanHash
    || !Number.isFinite(Date.parse(value.observedAt)) || !H64.test(value.templateSha256 ?? '') || !value.image?.startsWith(`asia-east1-docker.pkg.dev/${PROJECT}/aipdm-release/ai-pdm-openswx-worker@sha256:`) || !H64.test(value.image.split('@sha256:')[1] ?? '')
    || (actor && value.actor !== actor) || (image && value.image !== image) || value.jobName !== workerJobName()) fail('OPENSWX_RECEIPT_JOIN_INVALID')
  return value
}
// Cloud Run v2 omits empty env and reports the fixed Jobs GEN2 environment.
// Normalize only these observed defaults; all other fields remain exact.
export function normalizeWorkerTemplate(template) {
  const value = structuredClone(template), task = value.template ?? value
  if (task.executionEnvironment === 'EXECUTION_ENVIRONMENT_GEN2') delete task.executionEnvironment
  for (const container of task.containers ?? []) {
    if (container.env === undefined) container.env = []
    // This exact finite-worker sets ENTRYPOINT and has an empty image CMD.
    if (container.args === undefined) container.args = []
  }
  return value
}
export function assertWorkerJob(job, expectedTemplate) {
  if (![workerJobName(), workerJobName().replace(PROJECT, NUMBER)].includes(job?.name)
    || (Object.hasOwn(job ?? {}, 'reconciling') && typeof job.reconciling !== 'boolean')
    || job.reconciling === true || String(job.generation) !== String(job.observedGeneration)
    || job.terminalCondition?.state !== 'CONDITION_SUCCEEDED' || canonicalize(normalizeWorkerTemplate(job.template)) !== canonicalize(expectedTemplate)) fail('OPENSWX_JOB_READBACK_MISMATCH')
  return job
}
function schedulerPolicyMatches(value, profile) {
  const expected = { uri: profile.canonicalOrigin + profile.recoverPath, httpMethod: 'POST', body: 'e30=', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Google-Cloud-Scheduler' }, oidcToken: { serviceAccountEmail: profile.dispatchServiceAccount, audience: profile.canonicalOrigin } }
  // Scheduler/ProtoJSON may omit the two zero retry limits. Both must be
  // zero: a positive maxRetryDuration can retry even when retryCount is zero.
  const retry = value?.retryConfig
  const noRetries = retry === undefined || (retry !== null && typeof retry === 'object' && !Array.isArray(retry)
    && (retry.retryCount === undefined || retry.retryCount === 0)
    && (retry.maxRetryDuration === undefined || (typeof retry.maxRetryDuration === 'string' && /^0(?:\.0{1,9})?s$/u.test(retry.maxRetryDuration))))
  return value?.name === workerSchedulerName() && value.schedule === profile.bounds.schedule && value.timeZone === 'Etc/UTC' && value.attemptDeadline === '30s' && noRetries
    && canonicalize(value.httpTarget) === canonicalize(expected)
}
export function assertPausedScheduler(value, profile) {
  if (value?.state !== 'PAUSED' || !schedulerPolicyMatches(value, profile)) fail('OPENSWX_SCHEDULER_NOT_PAUSED')
  return value
}
export function assertCurrentReadyScheduler(value, profile) {
  if (value?.state !== 'ENABLED' || !schedulerPolicyMatches(value, profile)) fail('OPENSWX_SCHEDULER_NOT_CURRENT_READY')
  return value
}
export async function listWorkerExecutions(transport) {
  const rows = [], names = new Set(), tokens = new Set(); let token = ''
  for (let page = 0; page < 4; page += 1) {
    const query = new URLSearchParams({ pageSize: '100', ...(token ? { pageToken: token } : {}) })
    const result = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}/executions?${query}`)
    if (!Array.isArray(result.executions ?? []) || (result.executions?.length ?? 0) > 100) fail('OPENSWX_REPAIR_EXECUTION_INVENTORY_INVALID')
    for (const row of result.executions ?? []) { const name = canonicalWorkerExecution(row.name); if (names.has(name)) fail('OPENSWX_REPAIR_EXECUTION_INVENTORY_INVALID'); names.add(name); rows.push(row) }
    if (Object.hasOwn(result, 'nextPageToken') && typeof result.nextPageToken !== 'string') fail('OPENSWX_EXECUTIONS_PAGE_LIMIT')
    token = Object.hasOwn(result, 'nextPageToken') ? result.nextPageToken : ''; if (token === '') return rows
    if (typeof token !== 'string' || tokens.has(token)) fail('OPENSWX_EXECUTIONS_PAGE_LIMIT')
    tokens.add(token)
  }
  fail('OPENSWX_EXECUTIONS_PAGE_LIMIT')
}
export function assertTerminalExecution(value, executionName, { success = false } = {}) {
  if (canonicalWorkerExecution(value?.name) !== canonicalWorkerExecution(executionName) || (Object.hasOwn(value, 'reconciling') && (typeof value.reconciling !== 'boolean' || value.reconciling)) || !Number.isFinite(Date.parse(value.createTime)) || !value.completionTime || !Number.isFinite(Date.parse(value.completionTime)) || Date.parse(value.completionTime) < Date.parse(value.createTime)) fail('OPENSWX_EXECUTION_NOT_TERMINAL')
  const condition = value.conditions?.filter(row => row.type === 'Completed') ?? []
  if (condition.length !== 1 || !['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(condition[0].state)) fail('OPENSWX_EXECUTION_NOT_TERMINAL')
  if (success && (condition[0].state !== 'CONDITION_SUCCEEDED' || Number(value.succeededCount) !== 1 || Number(value.failedCount ?? 0) !== 0)) fail('OPENSWX_EXECUTION_FAILED')
  return value
}
export async function assertNoActiveExecutions(transport) {
  const executions = await listWorkerExecutions(transport)
  for (const row of executions) assertTerminalExecution(row, row.name)
  return executions
}
function assertFiniteRequest(value, descriptor, template, actor, deadlineAt) {
  exact(value, ['schemaVersion', 'ownerApplicationId', 'sourceRevision', 'sourceArchiveSha256', 'jobName', 'actor', 'templateSha256', 'requestStartedAt', 'requestWindowEndsAt', 'baselineExecutionNames'], 'OPENSWX_EXECUTION_REQUEST_JOIN_INVALID')
  const start = Date.parse(value.requestStartedAt), end = Date.parse(value.requestWindowEndsAt)
  if (value.schemaVersion !== 'aipdm.openswx-finite-request.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceRevision !== descriptor.sourceRevision
    || value.sourceArchiveSha256 !== descriptor.sourceArchiveSha256 || value.jobName !== workerJobName() || value.actor !== actor || value.templateSha256 !== sha256(canonicalize(template))
    || !Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 30_000 || end > Date.parse(deadlineAt)
    || !Array.isArray(value.baselineExecutionNames) || value.baselineExecutionNames.length > 400 || new Set(value.baselineExecutionNames).size !== value.baselineExecutionNames.length) fail('OPENSWX_EXECUTION_REQUEST_JOIN_INVALID')
  for (const name of value.baselineExecutionNames) if (canonicalWorkerExecution(name) !== name) fail('OPENSWX_EXECUTION_REQUEST_JOIN_INVALID')
  return value
}
function sameFiniteBaseline(actual, expected) {
  if (canonicalize([...actual].sort()) !== canonicalize([...expected].sort())) fail('OPENSWX_EXECUTION_REQUEST_JOIN_INVALID')
}
export function workerReceipt({ descriptor, kind, actor, image, template, observedAt, previousRefs = [], facts = {} }) {
  return { schemaVersion: 'aipdm.openswx-owner-receipt.v1', kind, ownerApplicationId: 'ai-pdm', sourceRevision: descriptor.sourceRevision,
    sourceArchiveSha256: descriptor.sourceArchiveSha256, workerProfileSha256: descriptor.workerProfileSha256, resourcePlanHash: descriptor.resourcePlanHash,
    actor, image, templateSha256: sha256(canonicalize(template)), jobName: workerJobName(), observedAt, previousRefs, facts, status: 'PASS', evidenceScope: 'PRODUCTION_PROVIDER' }
}

// Jobs.patch has no updateMask. Round-trip only existing writable metadata;
// never send output-only fields or execution tokens with this template update.
function workerJobMetadata(job) {
  return Object.fromEntries(['labels', 'annotations', 'client', 'clientVersion', 'launchStage', 'binaryAuthorization']
    .filter(key => Object.hasOwn(job, key)).map(key => [key, structuredClone(job[key])]))
}
export async function updateWorkerJob({ transport, profile, template, expectedCurrentTemplate = null, deadlineAt }) {
  assertOpenSwxWorkerProfile(profile)
  const before = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
  if (!before.etag || before.reconciling || Date.now() >= Date.parse(deadlineAt)) fail('OPENSWX_JOB_UPDATE_NOT_READY')
  if (expectedCurrentTemplate) {
    const current = normalizeWorkerTemplate(before.template)
    if (![canonicalize(expectedCurrentTemplate), canonicalize(template)].includes(canonicalize(current))) fail('OPENSWX_JOB_RECOVERY_SOURCE_DRIFT')
    assertWorkerJob(before, current)
  }
  await assertNoActiveExecutions(transport)
  if (canonicalize(normalizeWorkerTemplate(before.template)) === canonicalize(template)) return assertWorkerJob(before, template)
  const metadata = workerJobMetadata(before)
  try {
    await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: workerJobName(), etag: before.etag, ...metadata, template }),
    })
  } catch {
    // A lost response never permits a second PATCH. Read the exact resource.
    const current = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
    if (canonicalize(normalizeWorkerTemplate(current.template)) !== canonicalize(template)) fail('OPENSWX_JOB_UPDATE_OUTCOME_UNKNOWN')
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (Date.now() >= Date.parse(deadlineAt)) fail('OPENSWX_JOB_UPDATE_OUTCOME_UNKNOWN')
    const current = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
    if (!current.reconciling) {
      assertWorkerJob(current, template)
      if (canonicalize(workerJobMetadata(current)) !== canonicalize(metadata)) fail('OPENSWX_JOB_METADATA_DRIFT')
      return current
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  fail('OPENSWX_JOB_UPDATE_OUTCOME_UNKNOWN')
}
/** Durable request window is committed BEFORE :run. Replay only reads provider state. */
export async function runWorkerFinite({ transport, descriptor, profile, template, receiptUri, actor, deadlineAt }) {
  assertOpenSwxWorkerProfile(profile)
  deadlineAt = new Date(Math.min(Date.parse(deadlineAt), Date.now() + profile.bounds.ownerDeadlineSeconds * 1000)).toISOString()
  transport = boundOpenSwxTransport(transport, deadlineAt)
  const write = (uri, value) => writeWorkerJson(transport, uri, value)
  const terminal = await optionalReceipt(transport, receiptUri)
  if (terminal) {
    assertWorkerReceipt(terminal.value, descriptor, 'finite-terminal', { actor, image: template.template.containers[0].image })
    const exactName = canonicalWorkerExecution(terminal.value.facts.executionName)
    assertTerminalExecution(await transport.request(`https://run.googleapis.com/v2/${exactName}`), exactName, { success: true })
    assertWorkerJob(await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`), template)
    return terminal
  }
  assertWorkerJob(await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`), template)
  const assertRequestJoin = request => assertFiniteRequest(request.value, descriptor, template, actor, deadlineAt)
  let request = await optionalReceipt(transport, `${receiptUri.slice(0, -5)}-request.json`)
  if (!request) {
    const baseline = await assertNoActiveExecutions(transport)
    if (Date.now() >= Date.parse(deadlineAt)) fail('OPENSWX_EXECUTION_DEADLINE')
    const requestStartedAt = transport.now(), requestStartedAtMs = Date.parse(requestStartedAt), deadlineMs = Date.parse(deadlineAt)
    if (!Number.isFinite(requestStartedAtMs) || !Number.isFinite(deadlineMs) || requestStartedAtMs >= deadlineMs) fail('OPENSWX_EXECUTION_DEADLINE')
    request = await write(`${receiptUri.slice(0, -5)}-request.json`, {
      schemaVersion: 'aipdm.openswx-finite-request.v1', ownerApplicationId: 'ai-pdm', sourceRevision: descriptor.sourceRevision,
      sourceArchiveSha256: descriptor.sourceArchiveSha256, jobName: workerJobName(), actor,
      templateSha256: sha256(canonicalize(template)), requestStartedAt,
      requestWindowEndsAt: new Date(Math.min(deadlineMs, requestStartedAtMs + 30_000)).toISOString(),
      baselineExecutionNames: baseline.map(row => canonicalWorkerExecution(row.name)).sort(),
    })
    assertRequestJoin(request)
    if (Date.now() >= Date.parse(deadlineAt)) fail('OPENSWX_EXECUTION_DEADLINE')
    try {
      const operation = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}:run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!new RegExp(`^projects/(?:${PROJECT}|${NUMBER})/locations/${REGION}/operations/[^/]+$`, 'u').test(operation?.name ?? '')) fail('OPENSWX_OPERATION_SCOPE_INVALID')
      await write(`${receiptUri.slice(0, -5)}-operation.json`, { schemaVersion: 'aipdm.openswx-finite-operation.v1', requestRef: request.ref, providerOperationName: operation.name })
    } catch { /* Reconcile exact Job executions even after an unknown POST response. */ }
  }
  assertRequestJoin(request)
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (Date.now() >= Date.parse(deadlineAt)) fail('OPENSWX_EXECUTION_OUTCOME_UNKNOWN')
    const executions = await listWorkerExecutions(transport)
    const candidates = executions.filter(row => !request.value.baselineExecutionNames.includes(canonicalWorkerExecution(row.name))
      && Date.parse(row.createTime) >= Date.parse(request.value.requestStartedAt) && Date.parse(row.createTime) <= Date.parse(request.value.requestWindowEndsAt))
    if (candidates.length > 1) fail('OPENSWX_EXECUTION_AMBIGUOUS')
    if (candidates.length === 1) {
      const executionName = canonicalWorkerExecution(candidates[0].name)
      const execution = await transport.request(`https://run.googleapis.com/v2/${executionName}`)
      if (execution.completionTime) {
        assertTerminalExecution(execution, executionName, { success: true })
        if (canonicalize(normalizeWorkerTemplate(execution.template)) !== canonicalize(template.template)) fail('OPENSWX_EXECUTION_TEMPLATE_MISMATCH')
        assertWorkerJob(await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`), template)
        const receipt = workerReceipt({ descriptor, kind: 'finite-terminal', actor, image: template.template.containers[0].image, template, observedAt: transport.now(), previousRefs: [request.ref],
          facts: { executionName, execution, requestRef: request.ref, terminalExitZero: true, claimProof: 'PENDING_NORMAL_ACTOR_STDOUT_READBACK', workerStatus: 'ACTIVATION_PENDING' } })
        return write(receiptUri, receipt)
      }
    }
    // Zero rows is ambiguity, never evidence that the provider rejected :run.
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  fail('OPENSWX_EXECUTION_OUTCOME_UNKNOWN')
}

async function optionalReceipt(transport, uri) {
  try {
    const row = await transport.readBytes(uri, { prefixes: [WORKER_RECEIPT_PREFIX] })
    return { ...row, value: JSON.parse(row.bytes) }
  } catch (error) { if (error.code === 'MISSING') return null; throw error }
}
function workerArtifactProfile(appProfile, workerProfile) {
  return { ...appProfile, artifact: { ...appProfile.artifact, uri: workerProfile.artifactUri },
    build: { ...appProfile.build, dockerfile: workerProfile.dockerfile, dockerTarget: workerProfile.dockerTarget, openswxStrictScan: true } }
}
export function assertWorkerBuildSource(build, descriptor) {
  const object = build.facts?.sourceObject, hashes = build.facts?.sourceHashes
  if (object?.sha256 !== descriptor.sourceArchiveSha256 || !/^[1-9][0-9]*$/u.test(object.generation ?? '') || !Array.isArray(hashes)
    || new Set(hashes.map(row => row.path)).size !== hashes.length || hashes.length !== WORKER_SOURCE_PATHS.length + 19
    || hashes.some(row => !H64.test(row.sha256 ?? '')) || WORKER_SOURCE_PATHS.some(path => !hashes.some(row => row.path === path))
    || hashes.filter(row => row.path.startsWith('scripts/lib/openswx-reader/vendor/')).length !== 19
    || build.facts.scan?.status !== 'PASS' || build.facts.scan.blockingVulnerabilityCount !== 0 || !build.facts.provenance?.length || !build.facts.sbom?.length) fail('OPENSWX_BUILD_SOURCE_INVALID')
  return hashes.find(row => row.path === 'scripts/run-openswx-metadata-job.mjs')
}
/** A READY receipt binds its prior capsule and actual source, never the caller's current template. */
export async function readPriorWorkerActivation(transport, ref, profile, readSource, ctx = createWorkerEvidenceContext()) {
  return runAiPdmEvidenceContext(ctx, async () => {
  assertOpenSwxWorkerRef(ref)
  const saved = await transport.readJson(ref, BUCKET, [WORKER_RECEIPT_PREFIX]), activation = saved.value
  if (activation?.kind !== 'activation' || activation.facts?.workerStatus !== 'READY' || activation.facts.schedulerState !== 'ENABLED'
    || activation.facts.claimProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND'
    || activation.facts.dbAdmissionProof !== 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN') fail('OPENSWX_PRIOR_ACTIVATION_INVALID')
  const capsuleRef = activation.previousRefs?.[0]
  assertImmutableRef(capsuleRef, BUCKET, ['receipts'])
  const capsule = await transport.readJson(capsuleRef, BUCKET, ['receipts'])
  const descriptorRef = capsule.value.openswxWorkerRef; assertOpenSwxWorkerRef(descriptorRef)
  const descriptor = (await transport.readJson(descriptorRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  assertWorkerDescriptor(descriptor, profile, activation.workerProfileSha256, capsule.value.sourceRevision)
  assertWorkerReceipt(activation, descriptor, 'activation', { actor: profile.normalActor })
  const artifact = await resolveWorkerArtifact({ transport, descriptor, profile, readSource, ctx })
  const build = artifact.originBuild, entry = artifact.sourceEntryProof
  if (artifact.image !== activation.image) fail('OPENSWX_PRIOR_ACTIVATION_INVALID')
  const bootstrapDescriptor = isPausedAppRepair(descriptor) ? artifact.bootstrapDescriptor : descriptor
  const bootstrapDescriptorRef = isPausedAppRepair(descriptor) ? artifact.bootstrapDescriptorRef : descriptorRef
  const bootstrap = (await transport.readJson(bootstrapDescriptor.bootstrapRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  assertWorkerReceipt(bootstrap, bootstrapDescriptor, 'bootstrap', { actor: profile.normalActor, image: build.image })
  const template = workerTemplate(profile, build.image, descriptor.tokenSecretVersion)
  if (activation.templateSha256 !== sha256(canonicalize(template)) || canonicalize(activation.facts.sourceEntryRef) !== canonicalize(entry)
    || canonicalize(activation.facts.numericCredentials) !== canonicalize({ token: descriptor.tokenSecretVersion, registry: descriptor.registrySecretVersion })
    || bootstrap.facts.tokenSecretVersion !== descriptor.tokenSecretVersion || bootstrap.facts.registrySecretVersion !== descriptor.registrySecretVersion) fail('OPENSWX_PRIOR_ACTIVATION_INVALID')
  return { activation, activationRef: saved.ref, descriptor, descriptorRef, bootstrapDescriptor, bootstrapDescriptorRef, capsule: capsule.value, capsuleRef, build, artifact, bootstrap, template, entry, graphContext: artifact.graphContext ?? ctx }
  })
}
export async function assertPausedDrainReceipt(transport, paused, descriptor, profile, readSource, ctx = createWorkerEvidenceContext()) {
  return runAiPdmEvidenceContext(ctx, async () => {
  if (paused.actor !== profile.normalActor || paused.facts?.noActiveOrUnknown !== true || paused.facts.schedulerPaused !== true
    || !Number.isFinite(Date.parse(paused.facts.quiescenceCompletedAt))) fail('OPENSWX_RECEIPT_JOIN_INVALID')
  if (paused.facts.drainKind === 'FIRST_PROVIDER_ONLY') {
    if (paused.facts.dbAdmissionProof !== 'NOT_APPLICABLE_FIRST_BOOTSTRAP' || paused.facts.priorActivationRef) fail('OPENSWX_FIRST_DRAIN_INVALID')
  } else if (paused.facts.drainKind === 'DAILY_DB_VERIFIED') {
    const prior = await readPriorWorkerActivation(transport, paused.facts.priorActivationRef, profile, readSource, ctx)
    if (canonicalize(paused.facts.targetWorkerBuildRef) !== canonicalize(descriptor.workerBuildRef)
      || canonicalize(paused.facts.priorWorkerBuildRef) !== canonicalize(prior.descriptor.workerBuildRef)
      || paused.facts.priorSourceRevision !== prior.descriptor.sourceRevision || paused.facts.priorSourceArchiveSha256 !== prior.descriptor.sourceArchiveSha256
      || paused.image !== prior.build.image || paused.facts.priorImage !== prior.build.image || paused.templateSha256 !== sha256(canonicalize(prior.template))
      || paused.facts.priorNormalTemplateSha256 !== paused.templateSha256 || paused.facts.dbAdmissionProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND') fail('OPENSWX_DAILY_DRAIN_INVALID')
    const terminal = (await transport.readJson(paused.facts.drainExecutionRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
    assertWorkerReceipt(terminal, prior.descriptor, 'finite-terminal', { image: prior.build.image, actor: profile.normalActor })
    if (terminal.templateSha256 !== paused.templateSha256 || terminal.facts.executionName !== paused.facts.dbAdmissionProof.executionName) fail('OPENSWX_DAILY_DRAIN_INVALID')
  } else fail('OPENSWX_DRAIN_KIND_INVALID')
  })
}
export async function readBootstrapSupplementalIam(transport, bootstrap, descriptor, profile, readSource, verificationSourceRevision = descriptor.sourceRevision) {
  let ref = null, prebuildIamContinuationRef = null
  if (bootstrap.facts.completedFirstBootstrap) {
    const applied = (await transport.readJson(bootstrap.facts.resourceApplyRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
    if (applied.schemaVersion !== 'aipdm.openswx-resource-apply.v1' || applied.ownerApplicationId !== 'ai-pdm' || applied.actor !== profile.normalActor
      || applied.sourceRevision !== descriptor.sourceRevision || applied.resourcePlanHash !== descriptor.resourcePlanHash || applied.status !== 'APPLIED' || applied.evidenceScope !== 'PRODUCTION_PROVIDER'
      || applied.mutation !== 'READBACK_ONLY_COMPLETED_FIRST_SOURCE_RECONCILIATION'
      || canonicalize(applied.completedFirstBootstrap) !== canonicalize(bootstrap.facts.completedFirstBootstrap)
      || canonicalize(applied.supplementalIamReadbackRef) !== canonicalize(applied.completedFirstBootstrap.supplementalIamReadbackRef)) fail('OPENSWX_IAM_AUTHORITY_CHAIN_INVALID')
    ref = applied.supplementalIamReadbackRef
  } else if (bootstrap.facts.resourceProvenance?.supplementalIamReadbackRef) {
    const row = await transport.readJson(bootstrap.facts.resourceProvenance.resourceReadbackRef, BUCKET, [WORKER_RECEIPT_PREFIX])
    if (row.ref.sha256 !== bootstrap.facts.resourceProvenance.resourceReadbackSha256 || row.value.resourcesUnchanged !== true
      || canonicalize(row.value.supplementalIamReadbackRef) !== canonicalize(bootstrap.facts.resourceProvenance.supplementalIamReadbackRef)
      || canonicalize(row.value.prebuildIamContinuationRef ?? null) !== canonicalize(bootstrap.facts.resourceProvenance.prebuildIamContinuationRef ?? null)) fail('OPENSWX_IAM_AUTHORITY_CHAIN_INVALID')
    ref = row.value.supplementalIamReadbackRef
    prebuildIamContinuationRef = row.value.prebuildIamContinuationRef ?? null
  }
  if (bootstrap.facts.resourceProvenance?.prebuildIamContinuationRef && (!ref || bootstrap.facts.bootstrapKind !== 'DAILY_REFRESH')) fail('OPENSWX_IAM_AUTHORITY_CHAIN_INVALID')
  if (!ref) return null
  if (typeof readSource !== 'function') fail('OPENSWX_IAM_SOURCE_READER_REQUIRED')
  assertOpenSwxWorkerRef(ref)
  const receipt = (await transport.readJson(ref, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  // Subsequent DAILY releases may retain the exact unchanged IAM source package.
  if (receipt.planSha256 !== sha256(canonicalize(readbackIamPlan(readSource, descriptor.sourceRevision)))
    || receipt.planSha256 !== sha256(canonicalize(readbackIamPlan(readSource, verificationSourceRevision)))) fail('OPENSWX_IAM_SOURCE_DRIFT')
  if (bootstrap.facts.completedFirstBootstrap && receipt.sourceRevision !== descriptor.sourceRevision) fail('OPENSWX_IAM_AUTHORITY_CHAIN_INVALID')
  await readReadbackIamReceipt({ transport, ref, sourceRevision: receipt.sourceRevision, readSource, normalActor: profile.normalActor })
  if (prebuildIamContinuationRef) await readPrebuildIamContinuation({ transport, ref: prebuildIamContinuationRef, supplementalIamReadbackRef: ref,
    sourceRevision: verificationSourceRevision, readSource, normalActor: profile.normalActor })
  return { ref, sourceRevision: receipt.sourceRevision, ...(prebuildIamContinuationRef ? { prebuildIamContinuationRef, verificationSourceRevision } : {}) }
}
export async function readWorkerFullEvidence(transport, descriptor, profile, readSource, ctx = createWorkerEvidenceContext()) {
  return runAiPdmEvidenceContext(ctx, async () => {
  if (descriptor.purpose !== 'full') fail('OPENSWX_FULL_DESCRIPTOR_REQUIRED')
  const results = {};
  const artifact = await resolveWorkerArtifact({ transport, descriptor, profile, readSource, ctx })
  if (isPausedAppRepair(descriptor)) {
    const owner = artifact.bootstrapDescriptor
    if (!owner || isPausedAppRepair(owner) || owner.purpose !== 'full' || canonicalize(artifact.bootstrapDescriptorRef) !== canonicalize(descriptor.retainedWorkerDescriptorRef)) fail('OPENSWX_REPAIR_BOOTSTRAP_OWNER_INVALID')
    const retained = await runAiPdmEvidenceContext(artifact.graphContext, () =>
      readWorkerFullEvidence(transport, owner, profile, readSource, descendAiPdmEvidenceContext(artifact.graphContext, artifact.bootstrapDescriptorRef, true)))
    const supplementalIam = await readBootstrapSupplementalIam(transport, retained.receipts.bootstrapRef, owner, profile, readSource, descriptor.sourceRevision)
    return { image: artifact.image, receipts: retained.receipts, artifact, bootstrapDescriptor: owner, bootstrapDescriptorRef: artifact.bootstrapDescriptorRef, pausedBaseline: artifact.pausedBaseline,
      ...(supplementalIam ? { supplementalIam } : {}) }
  }
  results.workerBuildRef = artifact.originBuild
  for (const [field, kind] of [['bootstrapRef', 'bootstrap'], ['cloudPreflightRef', 'cloud-preflight'], ['pausedDrainedRef', 'paused-drained']]) {
    const row = await transport.readJson(descriptor[field], BUCKET, [WORKER_RECEIPT_PREFIX])
    results[field] = assertWorkerReceipt(row.value, descriptor, kind)
  }
  const image = results.workerBuildRef.image
  for (const field of ['bootstrapRef', 'cloudPreflightRef']) {
    if (results[field].image !== image || results[field].actor !== profile.normalActor) fail('OPENSWX_RECEIPT_JOIN_INVALID')
  }
  if (results.bootstrapRef.facts.tokenSecretVersion !== assertNumericSecret(descriptor.tokenSecretVersion, profile.tokenSecretId)
    || results.bootstrapRef.facts.registrySecretVersion !== assertNumericSecret(descriptor.registrySecretVersion, profile.registrySecretId)
    || results.cloudPreflightRef.facts.isolationVerified !== true || results.cloudPreflightRef.facts.noCad !== true) fail('OPENSWX_RECEIPT_JOIN_INVALID')
  for (const field of ['bootstrapRef', 'cloudPreflightRef']) {
    if (results[field].facts.normalTemplateSha256 !== sha256(canonicalize(workerTemplate(profile, image, descriptor.tokenSecretVersion)))
      || results[field].facts.selftestTemplateSha256 !== sha256(canonicalize(workerTemplate(profile, image, null, 'selftest')))) fail('OPENSWX_ACTUAL_TEMPLATE_JOIN_INVALID')
  }
  await assertPausedDrainReceipt(transport, results.pausedDrainedRef, descriptor, profile, readSource, artifact.graphContext ?? ctx)
  if (results.bootstrapRef.facts.bootstrapKind !== (results.pausedDrainedRef.facts.drainKind === 'FIRST_PROVIDER_ONLY' ? 'FIRST_CREATE' : 'DAILY_REFRESH')) fail('OPENSWX_BOOTSTRAP_DRAIN_JOIN_INVALID')
  if (results.pausedDrainedRef.facts.drainKind === 'DAILY_DB_VERIFIED') {
    const provenance = results.bootstrapRef.facts.resourceProvenance
    if (provenance?.resourcesUnchanged !== true || provenance.resourceReadbackSha256 !== provenance.resourceReadbackRef?.sha256
      || canonicalize(results.bootstrapRef.facts.priorActivationRef) !== canonicalize(results.pausedDrainedRef.facts.priorActivationRef)
      || canonicalize(results.bootstrapRef.facts.pausedDrainedRef) !== canonicalize(descriptor.pausedDrainedRef)) fail('OPENSWX_DAILY_RESOURCE_DELTA')
    assertOpenSwxWorkerRef(provenance.priorResourceApplyRef)
    const readback = (await transport.readJson(provenance.resourceReadbackRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
    if (readback.resourcesUnchanged !== true || canonicalize(readback.targetWorkerBuildRef) !== canonicalize(descriptor.workerBuildRef)) fail('OPENSWX_DAILY_RESOURCE_DELTA')
  }
  if (results.pausedDrainedRef.facts.drainKind === 'FIRST_PROVIDER_ONLY' && results.pausedDrainedRef.image !== image) fail('OPENSWX_RECEIPT_JOIN_INVALID')
  const supplementalIam = await readBootstrapSupplementalIam(transport, results.bootstrapRef, descriptor, profile, readSource)
  return { image, receipts: results, artifact, ...(supplementalIam ? { supplementalIam } : {}) }
  })
}
/** Default implementation uses only the existing verified owner transport and frozen Git blobs. */
export function createOpenSwxOwnerRelease({ transport, readSource, environment }) {
  async function resolve(intent, appProfile) {
    if (!intent.openswxWorkerRef) return null
    transport = boundOpenSwxTransport(transport, intent.deadlineAt)
    if (appProfile.application.id !== 'ai-pdm' || environment.GITHUB_WORKFLOW_REF !== `${appProfile.application.repository}/${appProfile.workflow.path}@refs/heads/main`) fail('OPENSWX_FULL_WORKFLOW_REQUIRED')
    const descriptor = await readWorkerDescriptor({ transport, ref: intent.openswxWorkerRef, profileBytes: readSource(WORKER_PROFILE_PATH, intent.sourceRevision), sourceRevision: intent.sourceRevision })
    if ((environment.OWNER_EXECUTION_MODE === 'build_only' ? 'build_only' : environment.OWNER_EXECUTION_MODE === 'full_release' ? 'full' : '') !== descriptor.value.purpose) fail('OPENSWX_EXECUTION_MODE_MISMATCH')
    return descriptor
  }
  const write = (uri, value) => writeWorkerJson(transport, uri, value)
  const rootFor = intent => `${intent.openswxWorkerRef.uri.slice(0, -5)}-execution`
  async function pausedAndDrained(descriptor, { intent = null, appProfile = null, phase = 'PREPARE', canonical = null } = {}) {
    if (isPausedAppRepair(descriptor.value)) return repairCurrentGuard(descriptor, intent, appProfile, phase, canonical)
    const scheduler = await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`)
    assertPausedScheduler(scheduler, descriptor.profile)
    const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource)
    const executions = await assertNoActiveExecutions(transport)
    const preflight = evidence.receipts.cloudPreflightRef.facts.proof
    const allowed = [preflight?.executionName]
    const smoke = await optionalReceipt(transport, `${descriptor.ref.uri.slice(0, -5)}-execution/finite-smoke.json`)
    if (smoke) { assertWorkerReceipt(smoke.value, descriptor.value, 'finite-terminal', { image: evidence.image }); allowed.push(smoke.value.facts.executionName) }
    const cutoff = Date.parse(evidence.receipts.pausedDrainedRef.facts.quiescenceCompletedAt)
    for (const row of executions) {
      if (!Number.isFinite(Date.parse(row.createTime))) fail('OPENSWX_DRAIN_EXECUTION_UNKNOWN')
      if (Date.parse(row.createTime) > cutoff && !allowed.includes(canonicalWorkerExecution(row.name))) fail('OPENSWX_DRAIN_EXECUTION_UNKNOWN')
    }
    const job = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
    const normal = workerTemplate(descriptor.profile, evidence.image, descriptor.value.tokenSecretVersion), selftest = workerTemplate(descriptor.profile, evidence.image, null, 'selftest')
    if (![canonicalize(normal), canonicalize(selftest)].includes(canonicalize(normalizeWorkerTemplate(job.template)))) fail('OPENSWX_DRAIN_JOB_DRIFT')
    assertWorkerJob(job, normalizeWorkerTemplate(job.template))
    return scheduler
  }
  async function repairCurrentGuard(descriptor, intent, appProfile, phase, canonical, actor = null) {
    if (!intent || !appProfile) fail('OPENSWX_REPAIR_CURRENT_INTENT_REQUIRED')
    const started = Date.parse(transport.now())
    const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource), baseline = evidence.pausedBaseline
    const raw = []
    const observed = { ...transport, request: async (url, options) => {
      if ((options?.method ?? 'GET') !== 'GET') fail('OPENSWX_REPAIR_MUTATION_DENIED')
      const body = await transport.request(url, options)
      raw.push({ url, method: 'GET', observedAt: transport.now(), body: structuredClone(body) })
      return body
    } }
    const scheduler = assertPausedScheduler(await observed.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), descriptor.profile)
    const schedulerPolicy = { name: scheduler.name, state: scheduler.state, schedule: scheduler.schedule, timeZone: scheduler.timeZone, attemptDeadline: scheduler.attemptDeadline, httpTarget: scheduler.httpTarget, retryConfig: scheduler.retryConfig ?? {}, userUpdateTime: scheduler.userUpdateTime ?? null }
    if (sha256(canonicalize(schedulerPolicy)) !== baseline.after.schedulerPolicySha256) fail('OPENSWX_REPAIR_RESOURCE_DRIFT')
    const expected = workerTemplate(descriptor.profile, evidence.image, descriptor.value.tokenSecretVersion)
    const job = assertWorkerJob(await observed.request(`https://run.googleapis.com/v2/${workerJobName()}`), expected)
    if (job.etag !== baseline.after.jobEtag || String(job.generation) !== baseline.after.jobGeneration || sha256(canonicalize(expected)) !== baseline.after.normalTemplateSha256) fail('OPENSWX_REPAIR_RESOURCE_DRIFT')
    const executions = await assertNoActiveExecutions(observed), previous = new Map(baseline.after.executions.map(row => [row.name, row]))
    const finite = await optionalReceipt(transport, `${rootFor(intent)}/finite-smoke.json`)
    const finiteRequest = await optionalReceipt(transport, `${rootFor(intent)}/finite-smoke-request.json`)
    if (finiteRequest) assertFiniteRequest(finiteRequest.value, descriptor.value, expected, appProfile.identities.deployer, intent.deadlineAt)
    if (finite) {
      assertWorkerReceipt(finite.value, descriptor.value, 'finite-terminal', { actor: appProfile.identities.deployer, image: evidence.image })
      const request = finiteRequest
      const value = request?.value, name = canonicalWorkerExecution(finite.value.facts.executionName)
      if (!value || value.schemaVersion !== 'aipdm.openswx-finite-request.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceRevision !== intent.sourceRevision
        || value.sourceArchiveSha256 !== descriptor.value.sourceArchiveSha256 || value.jobName !== workerJobName() || value.actor !== appProfile.identities.deployer
        || value.templateSha256 !== sha256(canonicalize(expected)) || !Array.isArray(value.baselineExecutionNames)
        || value.baselineExecutionNames.includes(name) || canonicalize(finite.value.facts.requestRef) !== canonicalize(request.ref)
        || finite.value.facts.terminalExitZero !== true || Date.parse(value.requestWindowEndsAt) - Date.parse(value.requestStartedAt) < 0
        || Date.parse(value.requestWindowEndsAt) - Date.parse(value.requestStartedAt) > 30_000 || Date.parse(value.requestWindowEndsAt) > Date.parse(intent.deadlineAt)) fail('OPENSWX_EXECUTION_REQUEST_JOIN_INVALID')
      const execution = assertTerminalExecution(await observed.request(`https://run.googleapis.com/v2/${name}`), name, { success: true })
      if (Date.parse(execution.createTime) < Date.parse(value.requestStartedAt) || Date.parse(execution.createTime) > Date.parse(value.requestWindowEndsAt)
        || canonicalize(normalizeWorkerTemplate(execution.template)) !== canonicalize(expected.template)
        || canonicalize(finite.value.facts.execution) !== canonicalize(execution)) fail('OPENSWX_EXECUTION_REQUEST_JOIN_INVALID')
    }
    let allowed = finite?.value.facts?.executionName
    if (!finite && phase === 'RECOVERY' && finiteRequest) {
      sameFiniteBaseline(finiteRequest.value.baselineExecutionNames, baseline.after.executions.map(row => row.name))
      const own = executions.filter(row => !finiteRequest.value.baselineExecutionNames.includes(canonicalWorkerExecution(row.name))
        && Date.parse(row.createTime) >= Date.parse(finiteRequest.value.requestStartedAt) && Date.parse(row.createTime) <= Date.parse(finiteRequest.value.requestWindowEndsAt))
      if (own.length !== 1 || canonicalize(normalizeWorkerTemplate(own[0].template)) !== canonicalize(expected.template)) fail('OPENSWX_EXECUTION_OUTCOME_UNKNOWN')
      allowed = canonicalWorkerExecution(own[0].name)
    }
    if (new Set(executions.map(row => canonicalWorkerExecution(row.name))).size !== executions.length) fail('OPENSWX_DRAIN_EXECUTION_UNKNOWN')
    for (const row of executions) {
      const name = canonicalWorkerExecution(row.name), old = previous.get(name)
      if (old) {
        if (old.createTime !== row.createTime || old.completionTime !== row.completionTime || old.completedState !== row.conditions.find(row => row.type === 'Completed').state) fail('OPENSWX_DRAIN_EXECUTION_UNKNOWN')
        previous.delete(name)
      } else if (name !== allowed) fail('OPENSWX_DRAIN_EXECUTION_UNKNOWN')
    }
    if (previous.size) fail('OPENSWX_DRAIN_EXECUTION_UNKNOWN')
    const service = await transport.getService(appProfile)
    raw.push({ api: 'APP_SERVICE', url: `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/services/ai-pdm-prod`, method: 'GET', observedAt: transport.now(), body: structuredClone(service) })
    transport.assertServiceSettled(service); transport.assertCanonicalEntrypoint(appProfile, service)
    let expectedRevision = baseline.servingApp.revision
    if (phase === 'FINALIZE') {
      if (!canonical || canonical.value.stage !== 'canonical' || canonical.value.sourceRevision !== intent.sourceRevision || canonical.value.facts.origin !== descriptor.profile.canonicalOrigin) fail('OPENSWX_REPAIR_CURRENT_APP_INVALID')
      expectedRevision = canonical.value.facts.candidateRevision
    }
    if (phase === 'RECOVERY' && transport.effectiveRevision(service) !== expectedRevision) {
      if (!canonical || canonical.value.stage !== 'candidate' || canonical.value.sourceRevision !== intent.sourceRevision || canonical.value.ownerApplicationId !== 'ai-pdm'
        || !/^ai-pdm-prod-[a-f0-9]{12}$/u.test(canonical.value.facts.candidateRevision ?? '')) fail('OPENSWX_REPAIR_CURRENT_APP_INVALID')
      expectedRevision = canonical.value.facts.candidateRevision
    }
    if (transport.effectiveRevision(service) !== expectedRevision || (!['FINALIZE', 'RECOVERY'].includes(phase) && intent.previousRevision !== expectedRevision)
      || !service.etag || Date.parse(transport.now()) - started > 60_000 || Date.parse(transport.now()) < started) fail('OPENSWX_REPAIR_CURRENT_APP_INVALID')
    // A second exact read immediately fences the next stage mutation.
    const fresh = assertWorkerJob(await observed.request(`https://run.googleapis.com/v2/${workerJobName()}`), expected)
    const freshScheduler = assertPausedScheduler(await observed.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), descriptor.profile)
    if (fresh.etag !== job.etag || String(fresh.generation) !== String(job.generation)) fail('OPENSWX_REPAIR_RESOURCE_DRIFT')
    const freshPolicy = { name: freshScheduler.name, state: freshScheduler.state, schedule: freshScheduler.schedule, timeZone: freshScheduler.timeZone, attemptDeadline: freshScheduler.attemptDeadline, httpTarget: freshScheduler.httpTarget, retryConfig: freshScheduler.retryConfig ?? {}, userUpdateTime: freshScheduler.userUpdateTime ?? null }
    if (sha256(canonicalize(freshPolicy)) !== baseline.after.schedulerPolicySha256 || Date.parse(transport.now()) - started > 60_000) fail('OPENSWX_REPAIR_RESOURCE_DRIFT')
    const providerReadbackRefs = []
    for (const [index, row] of raw.entries()) {
      const bodyRef = (await write(`${rootFor(intent)}/paused-${phase.toLowerCase()}-body-${index}-${sha256(canonicalize(row.body)).slice(0, 24)}.json`, row.body)).ref
      providerReadbackRefs.push({ id: `body-${index}`, api: row.api ?? (row.url.includes('/executions?') ? 'RUN_EXECUTIONS_PAGE' : row.url.startsWith('https://cloudscheduler.googleapis.com/') ? 'SCHEDULER_JOB' : 'RUN_JOB'), method: row.method, url: row.url, observedAt: row.observedAt, bodyRef })
    }
    const sealedExecutions = executions.map(row => {
      const name = canonicalWorkerExecution(row.name), pageIndex = raw.findIndex(value => value.url.includes('/executions?') && value.body.executions?.some(execution => canonicalWorkerExecution(execution.name) === name))
      if (pageIndex < 0) fail('OPENSWX_REPAIR_READBACK_INVALID')
      return { name, createTime: row.createTime, completionTime: row.completionTime, completedState: row.conditions.find(condition => condition.type === 'Completed').state, rawPageRef: providerReadbackRefs[pageIndex].bodyRef }
    })
    const check = { schemaVersion: 'aipdm.openswx-paused-app-repair-check.v1', associationRef: descriptor.value.workerBuildRef, pausedBaselineRef: descriptor.value.pausedBaselineRef,
      actor: actor ?? (phase === 'PREPARE' ? appProfile.identities.verifier : appProfile.identities.deployer), observedAt: transport.now(), phase, providerReadbackRefs,
      jobEtag: job.etag, jobGeneration: String(job.generation), normalTemplateSha256: sha256(canonicalize(expected)), schedulerState: 'PAUSED', executions: sealedExecutions, servingRevision: expectedRevision, dbAdmissionProof: 'NOT_YET_PROVEN' }
    assertPausedRepairCurrentCheck(check, baseline, descriptor.profile)
    await write(`${rootFor(intent)}/paused-${phase.toLowerCase()}-check-${sha256(canonicalize(check)).slice(0, 24)}.json`, check)
    if (Date.parse(transport.now()) - started > 60_000) fail('OPENSWX_REPAIR_RESOURCE_DRIFT')
    return scheduler
  }
  async function prepare({ intent, profile, runtimeConfig }) {
    const descriptor = await resolve(intent, profile); if (!descriptor) return null
    assertWorkerRuntimeJoin(runtimeConfig, intent, descriptor.value)
    if (descriptor.value.purpose === 'build_only') {
      if (descriptor.value.artifactMode === 'REUSE_VERIFIED') {
        const artifact = await resolveWorkerArtifact({ transport, descriptor: descriptor.value, profile: descriptor.profile, readSource })
        if (canonicalize(artifact.currentAssociation.sourceLockRef) !== canonicalize(intent.sourceLockRef)) fail('OPENSWX_REUSE_SOURCE_LOCK_JOIN_INVALID')
        return { descriptorRef: descriptor.ref, purpose: 'build_only' }
      }
      const plan = (await transport.readJson(descriptor.value.resourcePlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
      if (plan?.schemaVersion !== 'aipdm.openswx-approved-resource-plan.v1' || plan.ownerApplicationId !== 'ai-pdm' || plan.sourceRevision !== intent.sourceRevision
        || plan.resourcePlanHash !== descriptor.value.resourcePlanHash || plan.status !== 'APPROVED' || plan.releaseAuthority !== true || plan.evidenceScope !== 'HUMAN_APPROVED_RESOURCE_PLAN'
        || !H64.test(plan.authorizationStatementSha256 ?? '')) fail('OPENSWX_RESOURCE_PLAN_NOT_APPROVED')
      return { descriptorRef: descriptor.ref, purpose: 'build_only' }
    }
    const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource)
    if (evidence.artifact.currentAssociation && canonicalize(evidence.artifact.currentAssociation.sourceLockRef) !== canonicalize(intent.sourceLockRef)) fail('OPENSWX_REUSE_SOURCE_LOCK_JOIN_INVALID')
    await pausedAndDrained(descriptor, { intent, appProfile: profile, phase: 'PREPARE' })
    return { descriptorRef: descriptor.ref, purpose: 'full' }
  }
  async function build({ intent, profile, sourceObject }) {
    const descriptor = await resolve(intent, profile); if (!descriptor) return null
    if (sourceObject.ref.sha256 !== descriptor.value.sourceArchiveSha256) fail('OPENSWX_ARCHIVE_JOIN_INVALID')
    if (descriptor.value.artifactMode === 'REUSE_VERIFIED') {
      const artifact = descriptor.value.purpose === 'full' ? (await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource)).artifact
        : await resolveWorkerArtifact({ transport, descriptor: descriptor.value, profile: descriptor.profile, readSource })
      if (canonicalize(artifact.currentAssociation.sourceLockRef) !== canonicalize(intent.sourceLockRef)) fail('OPENSWX_REUSE_SOURCE_LOCK_JOIN_INVALID')
      await verifyWorkerArtifactReuse({ transport, artifact, profile: descriptor.profile, readSource, deadlineAt: intent.deadlineAt })
      return { descriptorRef: descriptor.ref, workerBuildRef: descriptor.value.workerBuildRef, image: artifact.image }
    }
    if (descriptor.value.purpose === 'full') {
      const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource)
      return { descriptorRef: descriptor.ref, workerBuildRef: descriptor.value.workerBuildRef, image: evidence.image }
    }
    const uri = `${rootFor(intent)}/build.json`, existing = await optionalReceipt(transport, uri)
    if (existing) { assertWorkerReceipt(existing.value, descriptor.value, 'build'); return { descriptorRef: descriptor.ref, workerBuildRef: existing.ref, image: existing.value.image } }
    const sourceHashes = WORKER_SOURCE_PATHS.map(path => ({ path, sha256: sha256(readSource(path, intent.sourceRevision)) }))
    const vendor = JSON.parse(readSource('scripts/lib/openswx-reader/source-manifest.json', intent.sourceRevision))
    if (vendor.sourceCommit !== descriptor.profile.readerCommit || vendor.files?.length !== 19) fail('OPENSWX_VENDOR_SOURCE_MISMATCH')
    for (const file of vendor.files) {
      const path = `scripts/lib/openswx-reader/vendor/${file.path}`
      if (sha256(readSource(path, intent.sourceRevision)) !== file.sha256) fail('OPENSWX_VENDOR_SOURCE_MISMATCH')
      sourceHashes.push({ path, sha256: file.sha256 })
    }
    const artifactProfile = workerArtifactProfile(profile, descriptor.profile)
    const deadlineAt = new Date(Math.min(Date.parse(intent.deadlineAt), Date.now() + descriptor.profile.bounds.ownerDeadlineSeconds * 1000)).toISOString()
    const built = await transport.createBuild({ profile: artifactProfile, intent, sourceObject, deadlineAt, openswxWorker: true })
    const artifact = await transport.readArtifactImage(artifactProfile, built.artifactDigest)
    const analysis = await transport.waitArtifactEvidence({ profile: artifactProfile, sourceRevision: intent.sourceRevision, artifactDigest: built.artifactDigest, deadlineAt })
    if (analysis.status !== 'PASS' || analysis.blockingVulnerabilityCount !== 0 || (analysis.rawHighOrCriticalVulnerabilityCount ?? 0) !== 0) fail('OPENSWX_ARTIFACT_POLICY_FAILED')
    const template = workerTemplate(descriptor.profile, built.artifactDigest, null, 'selftest')
    const receipt = workerReceipt({ descriptor: descriptor.value, kind: 'build', actor: profile.identities.builder, image: built.artifactDigest, template, observedAt: transport.now(), previousRefs: [descriptor.ref],
      facts: { sourceObject: { ...sourceObject.ref, generation: String(sourceObject.metadata.generation), crc32c: sourceObject.metadata.crc32c }, sourceHashes, cloudBuild: built.build, artifactRegistry: artifact, provenance: analysis.buildOccurrenceNames, sbom: analysis.sbomOccurrenceNames, scan: analysis } })
    const saved = await write(uri, receipt)
    return { descriptorRef: descriptor.ref, workerBuildRef: saved.ref, image: built.artifactDigest }
  }
  async function candidate({ intent, profile, deployment }) {
    const descriptor = await resolve(intent, profile); if (!descriptor) return null
    const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource)
    if (deployment.sourceObject.sha256 !== descriptor.value.sourceArchiveSha256 || deployment.openswxWorker?.image !== evidence.image) fail('OPENSWX_ARCHIVE_JOIN_INVALID')
    await pausedAndDrained(descriptor, { intent, appProfile: profile, phase: 'CANDIDATE' })
    const uri = `${rootFor(intent)}/normal-job.json`, existing = await optionalReceipt(transport, uri)
    const template = workerTemplate(descriptor.profile, evidence.image, descriptor.value.tokenSecretVersion)
    if (existing) { assertWorkerReceipt(existing.value, descriptor.value, 'normal-job', { image: evidence.image }); assertWorkerJob(await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`), template); return existing.ref }
    if (isPausedAppRepair(descriptor.value)) {
      await pausedAndDrained(descriptor, { intent, appProfile: profile, phase: 'CANDIDATE' })
      return (await write(uri, workerReceipt({ descriptor: descriptor.value, kind: 'normal-job', actor: profile.identities.deployer, image: evidence.image, template, observedAt: transport.now(),
        previousRefs: [descriptor.ref, descriptor.value.pausedBaselineRef], facts: { tokenSecretVersion: descriptor.value.tokenSecretVersion, workerJobMutationPerformed: false, pausedBaselineRef: descriptor.value.pausedBaselineRef } }))).ref
    }
    const before = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
    if (!before?.template) fail('OPENSWX_PRIOR_JOB_MISSING')
    const priorRestoreTemplate = normalizeWorkerTemplate(before.template)
    if (![canonicalize(template), canonicalize(workerTemplate(descriptor.profile, evidence.image, null, 'selftest'))].includes(canonicalize(priorRestoreTemplate))) fail('OPENSWX_PRIOR_JOB_MISSING')
    assertWorkerJob(before, priorRestoreTemplate)
    const prior = await write(`${rootFor(intent)}/prior-job.json`, workerReceipt({ descriptor: descriptor.value, kind: 'prior-job', actor: 'aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com', image: evidence.image, template: priorRestoreTemplate, observedAt: transport.now(), previousRefs: [descriptor.ref], facts: { priorJob: before, priorRestoreTemplate } }))
    await pausedAndDrained(descriptor)
    await updateWorkerJob({ transport, profile: descriptor.profile, template, deadlineAt: intent.deadlineAt })
    const saved = await write(uri, workerReceipt({ descriptor: descriptor.value, kind: 'normal-job', actor: 'aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com', image: evidence.image, template, observedAt: transport.now(), previousRefs: [prior.ref, descriptor.value.pausedDrainedRef], facts: { tokenSecretVersion: assertNumericSecret(descriptor.value.tokenSecretVersion, descriptor.profile.tokenSecretId), priorJobRef: prior.ref } }))
    return saved.ref
  }
  async function finalize({ intent, profile, canonical }) {
    const descriptor = await resolve(intent, profile); if (!descriptor) return null
    const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource)
    await pausedAndDrained(descriptor, { intent, appProfile: profile, phase: 'FINALIZE', canonical })
    const template = workerTemplate(descriptor.profile, evidence.image, descriptor.value.tokenSecretVersion)
    const terminal = await runWorkerFinite({ transport, descriptor: descriptor.value, profile: descriptor.profile, template, receiptUri: `${rootFor(intent)}/finite-smoke.json`, actor: 'aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com', deadlineAt: intent.deadlineAt })
    return { finiteSmokeRef: terminal.ref, status: 'ACTIVATION_PENDING', claimProof: 'PENDING_NORMAL_ACTOR_STDOUT_READBACK', descriptorRef: descriptor.ref, workerBuildRef: descriptor.value.workerBuildRef, image: evidence.image, normalTemplateSha256: sha256(canonicalize(template)), sourceEntryRef: evidence.artifact.sourceEntryProof }
  }
  async function recover({ intent, profile, candidate = null }) {
    const descriptor = await resolve(intent, profile); if (!descriptor) return null
    try {
      assertPausedScheduler(await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), descriptor.profile)
      const request = await optionalReceipt(transport, `${rootFor(intent)}/finite-smoke-request.json`)
      if (request) {
        const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource)
        const template = workerTemplate(descriptor.profile, evidence.image, descriptor.value.tokenSecretVersion)
        assertFiniteRequest(request.value, descriptor.value, template, profile.identities.deployer, intent.deadlineAt)
        const rows = await listWorkerExecutions(transport)
        const own = rows.filter(row => !request.value.baselineExecutionNames.includes(canonicalWorkerExecution(row.name)) && Date.parse(row.createTime) >= Date.parse(request.value.requestStartedAt) && Date.parse(row.createTime) <= Date.parse(request.value.requestWindowEndsAt))
        if (own.length !== 1) fail('OPENSWX_EXECUTION_OUTCOME_UNKNOWN')
        const name = canonicalWorkerExecution(own[0].name)
        if (!own[0].completionTime) await transport.request(`https://run.googleapis.com/v2/${name}:cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        const execution = assertTerminalExecution(await transport.request(`https://run.googleapis.com/v2/${name}`), name)
        if (canonicalize(normalizeWorkerTemplate(execution.template)) !== canonicalize(template.template)) fail('OPENSWX_EXECUTION_TEMPLATE_MISMATCH')
      }
      await assertNoActiveExecutions(transport)
      if (isPausedAppRepair(descriptor.value)) {
        await pausedAndDrained(descriptor, { intent, appProfile: profile, phase: 'RECOVERY', canonical: candidate })
        return { status: 'PAUSED_RECOVERED', durableQueue: 'RETAINED', schedulerEnabled: false, workerJobMutationPerformed: false }
      }
      const prior = await optionalReceipt(transport, `${rootFor(intent)}/prior-job.json`)
      if (prior) {
        const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource)
        assertWorkerReceipt(prior.value, descriptor.value, 'prior-job')
        const restore = prior.value.facts.priorRestoreTemplate
        if (canonicalize(restore) !== canonicalize(normalizeWorkerTemplate(prior.value.facts.priorJob.template)) || prior.value.templateSha256 !== sha256(canonicalize(restore))
          || ![workerTemplate(descriptor.profile, evidence.image, descriptor.value.tokenSecretVersion), workerTemplate(descriptor.profile, evidence.image, null, 'selftest')].some(template => canonicalize(template) === canonicalize(restore))) fail('OPENSWX_PRIOR_JOB_MISSING')
        await updateWorkerJob({ transport, profile: descriptor.profile, template: restore, deadlineAt: intent.deadlineAt })
      }
      return { status: 'PAUSED_RECOVERED', durableQueue: 'RETAINED', schedulerEnabled: false }
    } catch { return { status: 'RECOVERY_REQUIRED', durableQueue: 'RETAINED', schedulerEnabled: false } }
  }
  async function beforeActivate({ intent, profile }) {
    const descriptor = await resolve(intent, profile)
    if (descriptor && isPausedAppRepair(descriptor.value)) await pausedAndDrained(descriptor, { intent, appProfile: profile, phase: 'PRETRAFFIC' })
  }
  async function beforeBuild({ intent, profile }) {
    const descriptor = await resolve(intent, profile)
    if (descriptor && isPausedAppRepair(descriptor.value)) await repairCurrentGuard(descriptor, intent, profile, 'PREPARE', null, profile.identities.builder)
  }
  const scoped = callback => (...args) => runAiPdmEvidenceContext(createWorkerEvidenceContext(), () => callback(...args))
  return { prepare: scoped(prepare), beforeBuild: scoped(beforeBuild), build: scoped(build), candidate: scoped(candidate), beforeActivate: scoped(beforeActivate), finalize: scoped(finalize), recover: scoped(recover), resolve: scoped(resolve), pausedAndDrained, write, rootFor }
}
