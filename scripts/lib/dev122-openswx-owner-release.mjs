import { readReadbackIamReceipt, readbackIamPlan, readPrebuildIamContinuation } from './dev122-openswx-readback-iam.mjs'
import { assertImmutableRef, canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { resolveWorkerArtifact, verifyWorkerArtifactReuse } from './dev122-openswx-worker-artifact-reuse.mjs'

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
  for (const method of ['request', 'readJson', 'readBytes', 'putJson']) {
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
  return assertImmutableRef(ref, BUCKET, [WORKER_RECEIPT_PREFIX])
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
  const reuse = value?.schemaVersion === 'aipdm.openswx-worker-descriptor.v2'
  const additional = value?.purpose === 'build_only' ? [reuse ? 'workerBuildRef' : 'resourcePlanRef'] : ['workerBuildRef', 'bootstrapRef', 'cloudPreflightRef', 'pausedDrainedRef', 'tokenSecretVersion', 'registrySecretVersion']
  if (reuse) additional.push('artifactMode')
  exact(value, [...common, ...additional], 'OPENSWX_DESCRIPTOR_INVALID')
  if ((!reuse && value.schemaVersion !== 'aipdm.openswx-worker-descriptor.v1') || (reuse && value.artifactMode !== 'REUSE_VERIFIED') || value.ownerApplicationId !== 'ai-pdm' || !['build_only', 'full'].includes(value.purpose)
    || !H40.test(sourceRevision ?? '') || value.sourceRevision !== sourceRevision || value.workerProfileSha256 !== profileSha256
    || !H64.test(profileSha256 ?? '') || ['sourceArchiveSha256', 'resourcePlanHash'].some(key => !H64.test(value[key] ?? ''))
    || value.normalTemplatePolicySha256 !== sha256(canonicalize(workerTemplatePolicy(profile, 'normal')))
    || value.selftestTemplatePolicySha256 !== sha256(canonicalize(workerTemplatePolicy(profile, 'selftest')))) fail('OPENSWX_DESCRIPTOR_INVALID')
  for (const key of ['projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'dispatchPolicy', 'bounds', 'receiptRoot']) if (canonicalize(value[key]) !== canonicalize(profile[key])) fail('OPENSWX_DESCRIPTOR_INVALID')
  for (const key of additional.filter(key => key.endsWith('Ref'))) assertOpenSwxWorkerRef(value[key])
  if (value.purpose === 'full') { assertNumericSecret(value.tokenSecretVersion, profile.tokenSecretId); assertNumericSecret(value.registrySecretVersion, profile.registrySecretId) }
  return value
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
  if (![workerJobName(), workerJobName().replace(PROJECT, NUMBER)].includes(job?.name) || job.reconciling === true || String(job.generation) !== String(job.observedGeneration)
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
  const rows = []; let token = ''
  for (let page = 0; page < 4; page += 1) {
    const query = new URLSearchParams({ pageSize: '100', ...(token ? { pageToken: token } : {}) })
    const result = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}/executions?${query}`)
    for (const row of result.executions ?? []) { canonicalWorkerExecution(row.name); rows.push(row) }
    token = result.nextPageToken ?? ''; if (!token) return rows
  }
  fail('OPENSWX_EXECUTIONS_PAGE_LIMIT')
}
export function assertTerminalExecution(value, executionName, { success = false } = {}) {
  if (canonicalWorkerExecution(value?.name) !== canonicalWorkerExecution(executionName) || !value.completionTime || !Number.isFinite(Date.parse(value.completionTime))) fail('OPENSWX_EXECUTION_NOT_TERMINAL')
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
  const assertRequestJoin = request => {
  if (request.value?.schemaVersion !== 'aipdm.openswx-finite-request.v1' || request.value.sourceRevision !== descriptor.sourceRevision
    || request.value.sourceArchiveSha256 !== descriptor.sourceArchiveSha256 || request.value.jobName !== workerJobName() || request.value.actor !== actor
    || request.value.templateSha256 !== sha256(canonicalize(template))) fail('OPENSWX_EXECUTION_REQUEST_JOIN_INVALID')
  }
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
export async function readPriorWorkerActivation(transport, ref, profile, readSource) {
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
  const artifact = await resolveWorkerArtifact({ transport, descriptor, profile, readSource })
  const build = artifact.originBuild, entry = artifact.sourceEntryProof
  if (artifact.image !== activation.image) fail('OPENSWX_PRIOR_ACTIVATION_INVALID')
  const bootstrap = (await transport.readJson(descriptor.bootstrapRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  assertWorkerReceipt(bootstrap, descriptor, 'bootstrap', { actor: profile.normalActor, image: build.image })
  const template = workerTemplate(profile, build.image, descriptor.tokenSecretVersion)
  if (activation.templateSha256 !== sha256(canonicalize(template)) || canonicalize(activation.facts.sourceEntryRef) !== canonicalize(entry)
    || canonicalize(activation.facts.numericCredentials) !== canonicalize({ token: descriptor.tokenSecretVersion, registry: descriptor.registrySecretVersion })
    || bootstrap.facts.tokenSecretVersion !== descriptor.tokenSecretVersion || bootstrap.facts.registrySecretVersion !== descriptor.registrySecretVersion) fail('OPENSWX_PRIOR_ACTIVATION_INVALID')
  return { activation, activationRef: saved.ref, descriptor, descriptorRef, capsule: capsule.value, capsuleRef, build, artifact, bootstrap, template, entry }
}
export async function assertPausedDrainReceipt(transport, paused, descriptor, profile, readSource) {
  if (paused.actor !== profile.normalActor || paused.facts?.noActiveOrUnknown !== true || paused.facts.schedulerPaused !== true
    || !Number.isFinite(Date.parse(paused.facts.quiescenceCompletedAt))) fail('OPENSWX_RECEIPT_JOIN_INVALID')
  if (paused.facts.drainKind === 'FIRST_PROVIDER_ONLY') {
    if (paused.facts.dbAdmissionProof !== 'NOT_APPLICABLE_FIRST_BOOTSTRAP' || paused.facts.priorActivationRef) fail('OPENSWX_FIRST_DRAIN_INVALID')
  } else if (paused.facts.drainKind === 'DAILY_DB_VERIFIED') {
    const prior = await readPriorWorkerActivation(transport, paused.facts.priorActivationRef, profile, readSource)
    if (canonicalize(paused.facts.targetWorkerBuildRef) !== canonicalize(descriptor.workerBuildRef)
      || canonicalize(paused.facts.priorWorkerBuildRef) !== canonicalize(prior.descriptor.workerBuildRef)
      || paused.facts.priorSourceRevision !== prior.descriptor.sourceRevision || paused.facts.priorSourceArchiveSha256 !== prior.descriptor.sourceArchiveSha256
      || paused.image !== prior.build.image || paused.facts.priorImage !== prior.build.image || paused.templateSha256 !== sha256(canonicalize(prior.template))
      || paused.facts.priorNormalTemplateSha256 !== paused.templateSha256 || paused.facts.dbAdmissionProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND') fail('OPENSWX_DAILY_DRAIN_INVALID')
    const terminal = (await transport.readJson(paused.facts.drainExecutionRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
    assertWorkerReceipt(terminal, prior.descriptor, 'finite-terminal', { image: prior.build.image, actor: profile.normalActor })
    if (terminal.templateSha256 !== paused.templateSha256 || terminal.facts.executionName !== paused.facts.dbAdmissionProof.executionName) fail('OPENSWX_DAILY_DRAIN_INVALID')
  } else fail('OPENSWX_DRAIN_KIND_INVALID')
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
  if (receipt.planSha256 !== sha256(canonicalize(readbackIamPlan(readSource, descriptor.sourceRevision)))) fail('OPENSWX_IAM_SOURCE_DRIFT')
  if (bootstrap.facts.completedFirstBootstrap && receipt.sourceRevision !== descriptor.sourceRevision) fail('OPENSWX_IAM_AUTHORITY_CHAIN_INVALID')
  await readReadbackIamReceipt({ transport, ref, sourceRevision: receipt.sourceRevision, readSource, normalActor: profile.normalActor })
  if (prebuildIamContinuationRef) await readPrebuildIamContinuation({ transport, ref: prebuildIamContinuationRef, supplementalIamReadbackRef: ref,
    sourceRevision: verificationSourceRevision, readSource, normalActor: profile.normalActor })
  return { ref, sourceRevision: receipt.sourceRevision, ...(prebuildIamContinuationRef ? { prebuildIamContinuationRef, verificationSourceRevision } : {}) }
}
export async function readWorkerFullEvidence(transport, descriptor, profile, readSource) {
  if (descriptor.purpose !== 'full') fail('OPENSWX_FULL_DESCRIPTOR_REQUIRED')
  const results = {};
  const artifact = await resolveWorkerArtifact({ transport, descriptor, profile, readSource })
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
  await assertPausedDrainReceipt(transport, results.pausedDrainedRef, descriptor, profile, readSource)
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
  async function pausedAndDrained(descriptor) {
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
    await pausedAndDrained(descriptor)
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
    await pausedAndDrained(descriptor)
    const uri = `${rootFor(intent)}/normal-job.json`, existing = await optionalReceipt(transport, uri)
    const template = workerTemplate(descriptor.profile, evidence.image, descriptor.value.tokenSecretVersion)
    if (existing) { assertWorkerReceipt(existing.value, descriptor.value, 'normal-job', { image: evidence.image }); assertWorkerJob(await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`), template); return existing.ref }
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
  async function finalize({ intent, profile }) {
    const descriptor = await resolve(intent, profile); if (!descriptor) return null
    const evidence = await readWorkerFullEvidence(transport, descriptor.value, descriptor.profile, readSource)
    await pausedAndDrained(descriptor)
    const template = workerTemplate(descriptor.profile, evidence.image, descriptor.value.tokenSecretVersion)
    const terminal = await runWorkerFinite({ transport, descriptor: descriptor.value, profile: descriptor.profile, template, receiptUri: `${rootFor(intent)}/finite-smoke.json`, actor: 'aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com', deadlineAt: intent.deadlineAt })
    return { finiteSmokeRef: terminal.ref, status: 'ACTIVATION_PENDING', claimProof: 'PENDING_NORMAL_ACTOR_STDOUT_READBACK', descriptorRef: descriptor.ref, workerBuildRef: descriptor.value.workerBuildRef, image: evidence.image, normalTemplateSha256: sha256(canonicalize(template)), sourceEntryRef: evidence.artifact.sourceEntryProof }
  }
  async function recover({ intent, profile }) {
    const descriptor = await resolve(intent, profile); if (!descriptor) return null
    try {
      assertPausedScheduler(await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), descriptor.profile)
      const request = await optionalReceipt(transport, `${rootFor(intent)}/finite-smoke-request.json`)
      if (request) {
        const rows = await listWorkerExecutions(transport)
        const own = rows.filter(row => !request.value.baselineExecutionNames.includes(canonicalWorkerExecution(row.name)) && Date.parse(row.createTime) >= Date.parse(request.value.requestStartedAt) && Date.parse(row.createTime) <= Date.parse(request.value.requestWindowEndsAt))
        if (own.length !== 1) fail('OPENSWX_EXECUTION_OUTCOME_UNKNOWN')
        const name = canonicalWorkerExecution(own[0].name)
        if (!own[0].completionTime) await transport.request(`https://run.googleapis.com/v2/${name}:cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        assertTerminalExecution(await transport.request(`https://run.googleapis.com/v2/${name}`), name)
      }
      await assertNoActiveExecutions(transport)
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
  return { prepare, build, candidate, finalize, recover, resolve, pausedAndDrained, write, rootFor }
}
