import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { canonicalize, sha256, releasePaths } from './dev012-owner-release-runtime.mjs'
import { assertDev117ReleaseIntent } from './dev117-ai-pdm-continuous-release.mjs'
import { WORKER_PROFILE_PATH, WORKER_RECEIPT_PREFIX, assertWorkerDescriptor, normalizeWorkerTemplate, assertOpenSwxWorkerRef, assertOpenSwxWorkerProfile, assertNumericSecret, assertWorkerReceipt, assertWorkerJob, assertPausedScheduler, assertCurrentReadyScheduler, assertTerminalExecution, canonicalWorkerExecution, workerJobName, workerSchedulerName, workerTemplate, workerReceipt, readWorkerDescriptor, readWorkerFullEvidence, readBootstrapSupplementalIam, readPriorWorkerActivation, assertPausedDrainReceipt, assertWorkerBuildSource, assertNoActiveExecutions, updateWorkerJob, runWorkerFinite, boundOpenSwxTransport, writeWorkerJson, isPausedAppRepair } from './dev122-openswx-owner-release.mjs'
import { resolveWorkerArtifact } from './dev122-openswx-worker-artifact-reuse.mjs'
import { createAiPdmEvidenceContext, runAiPdmEvidenceContext, readAiPdmObservationInputs } from './dev121-owner-release-proof.mjs'

import { assertReadbackIamReceipt, expectedReadbackJobBindings } from './dev122-openswx-readback-iam.mjs'

const BUCKET = 'jenfu-platform-prod-aipdm-release'
const MARKER = 'aipdm.openswx-finite-terminal.v1'
export const OPENSWX_TERRAFORM_PATHS = Object.freeze(['main.tf', 'backend.tf', 'versions.tf', 'README.md'].map(name => `infra/google-cloud/dev-122-openswx-worker/${name}`))
export const OPENSWX_TERRAFORM_ADDRESSES = Object.freeze([
  'google_service_account.reader', 'google_service_account.dispatch', 'google_secret_manager_secret.reader_token', 'google_secret_manager_secret_iam_member.reader_token_access',
  'google_project_iam_custom_role.app_readback', 'google_project_iam_custom_role.worker_lifecycle', 'google_cloud_run_v2_job.reader',
  'google_cloud_run_v2_job_iam_member.app_run', 'google_cloud_run_v2_job_iam_member.app_readback', 'google_cloud_run_v2_job_iam_member.deployer_lifecycle',
  'google_service_account_iam_member.deployer_reader_act_as', 'google_cloud_scheduler_job.dispatch',
])
function fail(code) { throw Object.assign(new Error(code), { code }) }
function checkDeadline(deadlineAt) { if (!Number.isFinite(Date.parse(deadlineAt)) || Date.now() >= Date.parse(deadlineAt)) fail('OPENSWX_OWNER_DEADLINE') }
export function assertWorkerTerraformPlan(value) {
  if (!Array.isArray(value?.resource_changes) || value.resource_changes.length !== OPENSWX_TERRAFORM_ADDRESSES.length) fail('OPENSWX_TERRAFORM_PLAN_INVALID')
  const observed = new Set()
  for (const row of value.resource_changes) {
    if (!OPENSWX_TERRAFORM_ADDRESSES.includes(row.address) || observed.has(row.address) || row.provider_name !== 'registry.terraform.io/hashicorp/google'
      || !['create', 'no-op'].includes(row.change?.actions?.join(','))) fail('OPENSWX_TERRAFORM_PLAN_INVALID')
    observed.add(row.address)
    if (row.change.after?.project && row.change.after.project !== 'jenfu-platform-prod') fail('OPENSWX_TERRAFORM_PLAN_INVALID')
  }
  return value.resource_changes.map(row => ({ address: row.address, actions: row.change.actions })).sort((a, b) => a.address.localeCompare(b.address))
}
async function collectWorkerResourcePolicy(transport, profile, image, expectedTemplate, supplementalIam) {
  for (const email of [profile.readerServiceAccount, profile.dispatchServiceAccount]) {
    const identity = await transport.request(`https://iam.googleapis.com/v1/projects/${profile.projectId}/serviceAccounts/${email}`)
    if (identity.email !== email || identity.disabled === true) fail('OPENSWX_RESOURCE_READBACK_INVALID')
  }
  const secret = await transport.request(`https://secretmanager.googleapis.com/v1/projects/${profile.projectId}/secrets/${profile.tokenSecretId}`)
  if (secret.name !== `projects/${profile.projectNumber}/secrets/${profile.tokenSecretId}`) fail('OPENSWX_RESOURCE_READBACK_INVALID')
  const roleSpecs = [['aipdmOpenswxJobReadback', ['run.jobs.get', 'run.executions.get', 'run.executions.list']], ['aipdmOpenswxJobLifecycle', ['run.jobs.get', 'run.jobs.update', 'run.jobs.run', 'run.executions.get', 'run.executions.list', 'run.executions.cancel']]]
  for (const [roleId, permissions] of roleSpecs) {
    const role = await transport.request(`https://iam.googleapis.com/v1/projects/${profile.projectId}/roles/${roleId}`)
    if (role.name !== `projects/${profile.projectId}/roles/${roleId}` || role.deleted || canonicalize([...role.includedPermissions].sort()) !== canonicalize(permissions.sort())) fail('OPENSWX_RESOURCE_READBACK_INVALID')
  }
  const bindings = [
    { role: 'roles/run.invoker', members: ['serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'] },
    { role: 'projects/jenfu-platform-prod/roles/aipdmOpenswxJobReadback', members: ['serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'] },
    { role: 'projects/jenfu-platform-prod/roles/aipdmOpenswxJobLifecycle', members: ['serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com'] },
  ]
  if (supplementalIam) {
    await assertReadbackIamReceipt({ transport, ...supplementalIam, normalActor: profile.normalActor })
    bindings.splice(0, bindings.length, ...expectedReadbackJobBindings())
  }
  const policy = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}:getIamPolicy`)
  if (canonicalize((policy.bindings ?? []).sort((a, b) => a.role.localeCompare(b.role))) !== canonicalize(bindings.sort((a, b) => a.role.localeCompare(b.role)))) fail('OPENSWX_RESOURCE_READBACK_INVALID')
  const access = await transport.request(`https://secretmanager.googleapis.com/v1/projects/${profile.projectId}/secrets/${profile.tokenSecretId}:getIamPolicy`)
  if (canonicalize(access.bindings) !== canonicalize([{ role: 'roles/secretmanager.secretAccessor', members: [`serviceAccount:${profile.readerServiceAccount}`] }])) fail('OPENSWX_RESOURCE_READBACK_INVALID')
  const actAs = await transport.request(`https://iam.googleapis.com/v1/projects/${profile.projectId}/serviceAccounts/${profile.readerServiceAccount}:getIamPolicy`, { method: 'POST' })
  if (canonicalize(actAs.bindings) !== canonicalize([{ role: 'roles/iam.serviceAccountUser', members: ['serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com'] }])) fail('OPENSWX_RESOURCE_READBACK_INVALID')
  const job = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
  assertWorkerJob(job, expectedTemplate)
  return { jobName: job.name, etag: job.etag, iamSha256: sha256(canonicalize({ job: policy, readerSecret: access, readerActAs: actAs })), image, providerJob: job }
}
async function readWorkerResources(transport, profile, image, expectedTemplate = workerTemplate(profile, image, null, 'selftest'), supplementalIam = null) {
  const result = await collectWorkerResourcePolicy(transport, profile, image, expectedTemplate, supplementalIam)
  assertPausedScheduler(await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), profile)
  return result
}
/** This observation is ENABLED/normal only. It is never a pause or quiescence lease. */
export async function readCurrentReadyWorkerResources(options) {
  if (!options || Object.keys(options).sort().join(',') !== 'prior,profile,supplementalIam,transport') fail('OPENSWX_READY_INPUT_INVALID')
  const { transport, profile, prior, supplementalIam } = options
  assertOpenSwxWorkerProfile(profile)
  const actor = await verifyNormalActor(transport, profile)
  if (prior?.activation?.facts?.workerStatus !== 'READY' || prior.activation.facts.schedulerState !== 'ENABLED'
    || prior.descriptor?.purpose !== 'full' || prior.activation.image !== prior.build?.image
    || prior.activation.facts.claimProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND'
    || prior.activation.facts.dbAdmissionProof !== 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN') fail('OPENSWX_READY_INPUT_INVALID')
  const credentials = { token: assertNumericSecret(prior.descriptor.tokenSecretVersion, profile.tokenSecretId), registry: assertNumericSecret(prior.descriptor.registrySecretVersion, profile.registrySecretId) }
  const template = workerTemplate(profile, prior.build.image, credentials.token)
  if (canonicalize(prior.template) !== canonicalize(template) || canonicalize(prior.activation.facts.numericCredentials) !== canonicalize(credentials)) fail('OPENSWX_READY_INPUT_INVALID')
  const raw = [], observationStartedAt = transport.now()
  const observed = { ...transport, request: async (url, opts) => {
    const projectPolicyRead = opts?.method === 'POST' && url === `https://cloudresourcemanager.googleapis.com/v1/projects/${profile.projectId}:getIamPolicy`
      && canonicalize(opts.headers ?? {}) === canonicalize({ 'content-type': 'application/json' })
      && opts.body === JSON.stringify({ options: { requestedPolicyVersion: 3 } })
    if (opts?.method && opts.method !== 'GET' && !projectPolicyRead && !(opts.method === 'POST' && url === `https://iam.googleapis.com/v1/projects/${profile.projectId}/serviceAccounts/${profile.readerServiceAccount}:getIamPolicy`)) fail('OPENSWX_READY_MUTATION_DENIED')
    const body = await transport.request(url, opts); raw.push({ url, body: structuredClone(body) }); return body
  } }
  const metadata = async name => {
    const row = await observed.request(`https://secretmanager.googleapis.com/v1/${name}`)
    if (row?.name !== name || row.state !== 'ENABLED' || typeof row.etag !== 'string' || !row.etag) fail('OPENSWX_READY_SECRET_METADATA_INVALID')
    return { name: row.name, state: row.state, etag: row.etag }
  }
  const snapshot = async () => {
    const job = assertWorkerJob(await observed.request(`https://run.googleapis.com/v2/${workerJobName()}`), template)
    if (typeof job.etag !== 'string' || !job.etag || job.generation == null) fail('OPENSWX_READY_JOB_METADATA_INVALID')
    const scheduler = assertCurrentReadyScheduler(await observed.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), profile)
    const secrets = [await metadata(credentials.token), await metadata(credentials.registry)]
    const schedulerPolicy = { name: scheduler.name, state: scheduler.state, schedule: scheduler.schedule, timeZone: scheduler.timeZone, attemptDeadline: scheduler.attemptDeadline, httpTarget: scheduler.httpTarget, retryConfig: scheduler.retryConfig ?? {}, userUpdateTime: scheduler.userUpdateTime ?? null }
    return { jobEtag: job.etag, jobGeneration: String(job.generation), templateSha256: sha256(canonicalize(normalizeWorkerTemplate(job.template))), schedulerPolicy, secrets }
  }
  const before = await snapshot(), resources = await collectWorkerResourcePolicy(observed, profile, prior.build.image, template, supplementalIam), after = await snapshot()
  if (canonicalize(before) !== canonicalize(after) || resources.etag !== before.jobEtag) fail('OPENSWX_READY_RESOURCE_DRIFT')
  return { actor: actor.email, observationStartedAt, observationCompletedAt: transport.now(), image: prior.build.image, numericCredentials: credentials,
    normalTemplateSha256: before.templateSha256, schedulerPolicySha256: sha256(canonicalize(before.schedulerPolicy)), schedulerState: 'ENABLED', jobName: workerJobName(),
    jobEtagBefore: before.jobEtag, jobEtagAfter: after.jobEtag, jobGeneration: before.jobGeneration, schedulerUserUpdateTime: before.schedulerPolicy.userUpdateTime,
    secretMetadata: before.secrets, iamSha256: resources.iamSha256, raw, resourcesUnchanged: true, mutationPerformed: false, quiescenceClaimed: false }
}
/** Fixed normal-actor PAUSED observation. It confers no database admission. */
export async function readPausedRepairCurrentResources({ transport, profile, descriptor, image, supplementalIam }) {
  assertOpenSwxWorkerProfile(profile)
  const raw = []
  const observed = { ...transport, request: async (url, opts) => {
    const method = opts?.method ?? 'GET'
    if (method !== 'GET' && !(method === 'POST' && (url === `https://iam.googleapis.com/v1/projects/${profile.projectId}/serviceAccounts/${profile.readerServiceAccount}:getIamPolicy`
      || (url === `https://cloudresourcemanager.googleapis.com/v1/projects/${profile.projectId}:getIamPolicy` && opts.body === JSON.stringify({ options: { requestedPolicyVersion: 3 } }))))) fail('OPENSWX_REPAIR_MUTATION_DENIED')
    const body = await transport.request(url, opts)
    raw.push({ url, method, observedAt: transport.now(), body: structuredClone(body) })
    return body
  } }
  const numericCredentials = { token: assertNumericSecret(descriptor.tokenSecretVersion, profile.tokenSecretId), registry: assertNumericSecret(descriptor.registrySecretVersion, profile.registrySecretId) }
  const template = workerTemplate(profile, image, numericCredentials.token)
  const metadata = async name => {
    const row = await observed.request(`https://secretmanager.googleapis.com/v1/${name}`)
    if (row?.name !== name || row.state !== 'ENABLED' || typeof row.etag !== 'string' || !row.etag) fail('OPENSWX_REPAIR_SECRET_METADATA_INVALID')
    return { name, state: row.state, etag: row.etag }
  }
  const snapshot = async () => {
    const job = assertWorkerJob(await observed.request(`https://run.googleapis.com/v2/${workerJobName()}`), template)
    if (!job.etag || !/^[1-9][0-9]*$/u.test(String(job.generation))) fail('OPENSWX_REPAIR_JOB_METADATA_INVALID')
    const scheduler = assertPausedScheduler(await observed.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), profile)
    const secretMetadata = [await metadata(numericCredentials.token), await metadata(numericCredentials.registry)]
    const policy = await collectWorkerResourcePolicy(observed, profile, image, template, supplementalIam)
    if (policy.etag !== job.etag) fail('OPENSWX_REPAIR_RESOURCE_DRIFT')
    const executions = [], names = new Set(), tokens = new Set(); let token = ''
    for (let page = 0; page < profile.bounds.maxExecutionPages; page++) {
      const url = `https://run.googleapis.com/v2/${workerJobName()}/executions?${new URLSearchParams({ pageSize: '100', ...(token ? { pageToken: token } : {}) })}`
      const body = await observed.request(url), rawIndex = raw.length - 1
      if (!Array.isArray(body.executions ?? []) || (body.executions?.length ?? 0) > 100) fail('OPENSWX_REPAIR_EXECUTION_INVENTORY_INVALID')
      for (const row of body.executions ?? []) {
        assertTerminalExecution(row, row.name)
        const name = canonicalWorkerExecution(row.name)
        if (names.has(name)) fail('OPENSWX_REPAIR_EXECUTION_INVENTORY_INVALID')
        names.add(name); executions.push({ name, createTime: row.createTime, completionTime: row.completionTime, completedState: row.conditions.find(row => row.type === 'Completed').state, rawIndex })
      }
      if (Object.hasOwn(body, 'nextPageToken') && typeof body.nextPageToken !== 'string') fail('OPENSWX_REPAIR_EXECUTION_INVENTORY_INVALID')
      token = body.nextPageToken ?? ''
      if (!token) break
      if (tokens.has(token)) fail('OPENSWX_REPAIR_EXECUTION_INVENTORY_INVALID')
      tokens.add(token)
      if (page === profile.bounds.maxExecutionPages - 1) fail('OPENSWX_EXECUTIONS_PAGE_LIMIT')
    }
    executions.sort((a, b) => a.name.localeCompare(b.name))
    const schedulerPolicy = { name: scheduler.name, state: scheduler.state, schedule: scheduler.schedule, timeZone: scheduler.timeZone, attemptDeadline: scheduler.attemptDeadline, httpTarget: scheduler.httpTarget, retryConfig: scheduler.retryConfig ?? {}, userUpdateTime: scheduler.userUpdateTime ?? null }
    return { jobName: workerJobName(), jobEtag: job.etag, jobGeneration: String(job.generation), normalTemplateSha256: sha256(canonicalize(template)), image, numericCredentials,
      secretMetadata, schedulerState: 'PAUSED', schedulerPolicySha256: sha256(canonicalize(schedulerPolicy)), schedulerUserUpdateTime: scheduler.userUpdateTime ?? null, iamSha256: policy.iamSha256, executions }
  }
  return { snapshot: await snapshot(), raw }
}
export async function readPausedRepairWorkerResources({ transport, profile, prior, supplementalIam }, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const actor = await verifyNormalActor(transport, profile), raw = []
  const capture = async () => {
    const result = await readPausedRepairCurrentResources({ transport, profile, descriptor: prior.descriptor, image: prior.build.image, supplementalIam })
    const offset = raw.length
    raw.push(...result.raw)
    return { ...result.snapshot, executions: result.snapshot.executions.map(row => ({ ...row, rawIndex: row.rawIndex + offset })) }
  }
  const observationStartedAt = transport.now(), before = await capture()
  await sleep(55_000)
  const after = await capture(), observationCompletedAt = transport.now()
  const projection = value => ({ ...value, executions: value.executions.map(({ rawIndex: _index, ...row }) => row) })
  if (canonicalize(projection(before)) !== canonicalize(projection(after)) || Date.parse(observationCompletedAt) - Date.parse(observationStartedAt) < 55_000
    || Date.parse(observationCompletedAt) - Date.parse(observationStartedAt) > 600_000) fail('OPENSWX_REPAIR_RESOURCE_DRIFT')
  return { actor: actor.email, observationStartedAt, observationCompletedAt, before, after, raw }
}
async function firstResourceBasis({ transport, profile, descriptor, plan, build, priorResourceRequestRef, priorWorkerBuildRef }) {
  for (const ref of [priorResourceRequestRef, priorWorkerBuildRef]) assertOpenSwxWorkerRef(ref)
  const request = await transport.readJson(priorResourceRequestRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  const old = request.value
  const binary = await transport.readJson(old.binaryPlanReceiptRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  const priorDescriptor = await transport.readJson(old.descriptorRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  const d = assertWorkerDescriptor(priorDescriptor.value, profile, descriptor.workerProfileSha256, old.sourceRevision)
  const priorBuild = await transport.readJson(priorWorkerBuildRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  assertWorkerReceipt(priorBuild.value, d, 'build', { image: old.workerImage }); assertWorkerBuildSource(priorBuild.value, d); assertWorkerBuildSource(build, descriptor)
  const approved = await transport.readJson(old.approvedPlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  const binding = { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, receiptUri: priorResourceRequestRef.uri.replace(/-request\.json$/u, '.json'), descriptorRef: priorDescriptor.ref, approvedPlanRef: approved.ref, actor: profile.normalActor, sourceRevision: d.sourceRevision, sourceArchiveSha256: d.sourceArchiveSha256, resourcePlanHash: descriptor.resourcePlanHash, workerImage: priorBuild.value.image }
  for (const [row, schema, extra] of [[old, 'aipdm.openswx-resource-apply-request.v1', ['binaryPlanReceiptRef']], [binary.value, 'aipdm.openswx-resource-binary-plan.v1', []]]) {
    const keys = ['schemaVersion', ...Object.keys(binding), 'binaryPlanSha256', 'changes', 'requestedAt', ...extra].sort().join(',')
    if (Object.keys(row).sort().join(',') !== keys || row.schemaVersion !== schema || Object.entries(binding).some(([k, v]) => canonicalize(row[k]) !== canonicalize(v))
      || !/^[a-f0-9]{64}$/u.test(row.binaryPlanSha256 ?? '') || !Number.isFinite(Date.parse(row.requestedAt))) fail('OPENSWX_FIRST_RESOURCE_JOIN_INVALID')
    if (!Array.isArray(row.changes) || row.changes.some(change => !change || Object.keys(change).sort().join(',') !== 'actions,address')) fail('OPENSWX_FIRST_RESOURCE_JOIN_INVALID')
    assertWorkerTerraformPlan({ resource_changes: row.changes.map(change => ({ address: change.address, provider_name: 'registry.terraform.io/hashicorp/google', change: { actions: change.actions } })) })
  }
  if (!priorResourceRequestRef.uri.endsWith('-request.json') || binary.ref.uri !== binding.receiptUri.replace(/\.json$/u, '-plan.json')
    || ['binaryPlanSha256', 'changes', 'requestedAt'].some(k => canonicalize(old[k]) !== canonicalize(binary.value[k]))
    || d.purpose !== 'build_only' || d.sourceRevision === descriptor.sourceRevision || d.resourcePlanHash !== descriptor.resourcePlanHash
    || canonicalize(d.resourcePlanRef) !== canonicalize(approved.ref) || approved.value.schemaVersion !== 'aipdm.openswx-approved-resource-plan.v1'
    || approved.value.status !== 'APPROVED' || approved.value.releaseAuthority !== true || approved.value.evidenceScope !== 'HUMAN_APPROVED_RESOURCE_PLAN'
    || approved.value.sourceRevision !== d.sourceRevision || approved.value.ownerApplicationId !== 'ai-pdm' || approved.value.resourcePlanHash !== descriptor.resourcePlanHash
    || approved.value.authorizationStatementSha256 !== plan.authorizationStatementSha256 || canonicalize(approved.value.plan) !== canonicalize(plan.plan)
    || [priorBuild.value, build].some(value => value.facts.scan.rawHighOrCriticalVulnerabilityCount !== 0)
    || canonicalize(priorBuild.value.facts.sourceHashes) !== canonicalize(build.facts.sourceHashes)) fail('OPENSWX_FIRST_RESOURCE_JOIN_INVALID')
  return { priorResourceRequestRef: request.ref, priorWorkerBuildRef: priorBuild.ref, priorDescriptorRef: priorDescriptor.ref, priorApprovedPlanRef: approved.ref, priorBinaryPlanReceiptRef: binary.ref, priorSourceRevision: d.sourceRevision, priorImage: priorBuild.value.image, targetImage: build.image }
}
async function assertFirstProviderUnissued(transport, profile, image) {
  const readback = await readWorkerResources(transport, profile, image)
  if ((await assertNoActiveExecutions(transport)).length !== 0) fail('OPENSWX_FIRST_RESOURCE_NOT_EMPTY')
  const versions = await transport.request(`https://secretmanager.googleapis.com/v1/projects/${profile.projectId}/secrets/${profile.tokenSecretId}/versions?pageSize=100`)
  if (versions.nextPageToken || (versions.versions ?? []).length !== 0) fail('OPENSWX_FIRST_RESOURCE_NOT_EMPTY')
  return readback
}

function assertCredentialRequest(value, secretId, payloadSha256 = value?.payloadSha256) {
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'payloadSha256,schemaVersion,secretId,startedAt,windowEnd'
    || value.schemaVersion !== 'aipdm.openswx-credential-request.v1' || value.secretId !== secretId || value.payloadSha256 !== payloadSha256
    || !/^[a-f0-9]{64}$/u.test(payloadSha256 ?? '') || !Number.isFinite(Date.parse(value.startedAt))
    || Date.parse(value.windowEnd) - Date.parse(value.startedAt) !== 30_000) fail('OPENSWX_CREDENTIAL_REQUEST_JOIN_INVALID')
}
/** Adopt only the unique token already issued by the exact incomplete FIRST input. No new authority or Terraform. */
async function readPartialFirstCredentialProof({ transport, profile, descriptor, plan, build, basis, priorBootstrapInputRef, allowCredentialProgress = false, registryAuthority = null }) {
  assertOpenSwxWorkerRef(priorBootstrapInputRef)
  const priorInput = await transport.readJson(priorBootstrapInputRef, BUCKET, [WORKER_RECEIPT_PREFIX]), oldInput = priorInput.value
  if (!oldInput || Array.isArray(oldInput) || Object.keys(oldInput).sort().join(',') !== 'bootstrapKind,currentRegistryVersion,deadlineAt,descriptorRef,receiptId,resourceApplyRef,schemaVersion,workerBuildRef'
    || oldInput.schemaVersion !== 'aipdm.openswx-bootstrap-input.v1' || oldInput.bootstrapKind !== 'FIRST_CREATE'
    || !/^[A-Za-z0-9-]{6,100}$/u.test(oldInput.receiptId ?? '') || !Number.isFinite(Date.parse(oldInput.deadlineAt))) fail('OPENSWX_PARTIAL_FIRST_JOIN_INVALID')
  const oldDescriptorRow = await transport.readJson(oldInput.descriptorRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  const oldDescriptor = assertWorkerDescriptor(oldDescriptorRow.value, profile, descriptor.workerProfileSha256, oldDescriptorRow.value.sourceRevision)
  const oldBuildRow = await transport.readJson(oldInput.workerBuildRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  assertWorkerReceipt(oldBuildRow.value, oldDescriptor, 'build'); assertWorkerBuildSource(oldBuildRow.value, oldDescriptor)
  const oldApply = (await transport.readJson(oldInput.resourceApplyRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const oldPlan = (await transport.readJson(oldDescriptor.resourcePlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const oldBasis = await firstResourceBasis({ transport, profile, descriptor: oldDescriptor, plan: oldPlan, build: oldBuildRow.value, priorResourceRequestRef: basis.priorResourceRequestRef, priorWorkerBuildRef: basis.priorWorkerBuildRef })
  if (oldDescriptor.purpose !== 'build_only' || oldDescriptor.sourceRevision === descriptor.sourceRevision || oldDescriptor.resourcePlanHash !== descriptor.resourcePlanHash
    || canonicalize(oldBuildRow.value.facts.sourceHashes) !== canonicalize(build.facts.sourceHashes) || oldBuildRow.value.facts.scan.rawHighOrCriticalVulnerabilityCount !== 0
    || oldPlan.authorizationStatementSha256 !== plan.authorizationStatementSha256 || canonicalize(oldPlan.plan) !== canonicalize(plan.plan)
    || oldApply.schemaVersion !== 'aipdm.openswx-resource-apply.v1' || oldApply.ownerApplicationId !== 'ai-pdm' || oldApply.actor !== profile.normalActor
    || oldApply.sourceRevision !== oldDescriptor.sourceRevision || oldApply.resourcePlanHash !== descriptor.resourcePlanHash || oldApply.status !== 'APPLIED' || oldApply.evidenceScope !== 'PRODUCTION_PROVIDER'
    || oldApply.mutation !== 'READBACK_ONLY_FIRST_SOURCE_RECONCILIATION' || oldApply.partialFirstBootstrap
    || canonicalize(oldApply.descriptorRef) !== canonicalize(oldDescriptorRow.ref) || canonicalize(oldApply.approvedPlanRef) !== canonicalize(oldDescriptor.resourcePlanRef)
    || canonicalize(oldApply.requestRef) !== canonicalize(basis.priorResourceRequestRef) || canonicalize(oldApply.binaryPlanReceiptRef) !== canonicalize(basis.priorBinaryPlanReceiptRef)
    || canonicalize(oldApply.firstSourceReconciliation) !== canonicalize(oldBasis) || oldApply.readback?.image !== basis.priorImage) fail('OPENSWX_PARTIAL_FIRST_JOIN_INVALID')
  const credentialReceiptRoot = `${profile.receiptRoot}/${oldInput.receiptId}`
  if (await optional(transport, credentialReceiptRoot + '.json')) fail('OPENSWX_PARTIAL_FIRST_ALREADY_COMPLETED')
  const tokenRequest = await optional(transport, credentialReceiptRoot + '-token-version-request.json')
  assertCredentialRequest(tokenRequest?.value, profile.tokenSecretId)
  if (Date.parse(tokenRequest.value.windowEnd) > Date.parse(oldInput.deadlineAt)) fail('OPENSWX_PARTIAL_FIRST_JOIN_INVALID')
  if (!allowCredentialProgress) for (const suffix of ['-token-version.json', '-registry-version.json', '-registry-version-request.json']) {
    if (await optional(transport, credentialReceiptRoot + suffix)) fail('OPENSWX_PARTIAL_FIRST_PROGRESS_UNKNOWN')
  }
  const versions = await transport.request(`https://secretmanager.googleapis.com/v1/projects/${profile.projectId}/secrets/${profile.tokenSecretId}/versions?pageSize=100`)
  if (versions.nextPageToken || !Array.isArray(versions.versions) || versions.versions.length !== 1) fail('OPENSWX_PARTIAL_FIRST_VERSION_UNKNOWN')
  const metadata = versions.versions[0], tokenSecretVersion = assertNumericSecret(metadata.name, profile.tokenSecretId)
  if (tokenSecretVersion !== `projects/${profile.projectNumber}/secrets/${profile.tokenSecretId}/versions/1`) fail('OPENSWX_PARTIAL_FIRST_VERSION_UNKNOWN')
  const created = Date.parse(metadata.createTime)
  if (metadata.state !== 'ENABLED' || !Number.isFinite(created) || created < Date.parse(tokenRequest.value.startedAt) || created > Date.parse(tokenRequest.value.windowEnd)) fail('OPENSWX_PARTIAL_FIRST_VERSION_UNKNOWN')
  const recovered = await readIssuedCredential({ transport, profile, secretId: profile.tokenSecretId, uri: credentialReceiptRoot + '-token-version.json', deadlineAt: new Date(Date.now() + 60_000).toISOString() })
  if (!recovered || recovered.name !== tokenSecretVersion) fail('OPENSWX_PARTIAL_FIRST_VERSION_UNKNOWN')
  const priorRegistryVersion = assertNumericSecret(oldInput.currentRegistryVersion, profile.registrySecretId)
  const registryMetadata = await transport.request(`https://secretmanager.googleapis.com/v1/${priorRegistryVersion}`)
  if (registryMetadata.state !== 'ENABLED' || assertNumericSecret(registryMetadata.name, profile.registrySecretId) !== priorRegistryVersion) fail('OPENSWX_CREDENTIAL_DISABLED')
  if (priorRegistryVersion !== `projects/${profile.projectNumber}/secrets/${profile.registrySecretId}/versions/2`) fail('OPENSWX_PARTIAL_FIRST_VERSION_UNKNOWN')
  const nextRegistry = appendReaderCredential(await readSecretBytes(transport, priorRegistryVersion, profile), profile, recovered.bytes.toString())
  recovered.bytes.fill(0)
  const registryRequest = await optional(transport, credentialReceiptRoot + '-registry-version-request.json')
  const registryReceipt = await optional(transport, credentialReceiptRoot + '-registry-version.json')
  const registryVersions = await transport.request(`https://secretmanager.googleapis.com/v1/projects/${profile.projectId}/secrets/${profile.registrySecretId}/versions?pageSize=100`)
  const expectedNames = [1, 2, ...(registryRequest && allowCredentialProgress ? [3] : [])].map(version => `projects/${profile.projectNumber}/secrets/${profile.registrySecretId}/versions/${version}`)
  if (registryVersions.nextPageToken || !Array.isArray(registryVersions.versions) || registryVersions.versions.length !== expectedNames.length
    || registryVersions.versions.some(row => row.state !== 'ENABLED') || canonicalize(registryVersions.versions.map(row => assertNumericSecret(row.name, profile.registrySecretId)).sort()) !== canonicalize(expectedNames.sort())) fail('OPENSWX_PARTIAL_FIRST_VERSION_UNKNOWN')
  if (registryReceipt && !registryRequest) fail('OPENSWX_PARTIAL_FIRST_PROGRESS_UNKNOWN')
  if (registryRequest) {
    if (!allowCredentialProgress) fail('OPENSWX_PARTIAL_FIRST_PROGRESS_UNKNOWN')
    assertCredentialRequest(registryRequest.value, profile.registrySecretId, sha256(nextRegistry))
    const row = registryVersions.versions.find(row => row.name.endsWith('/3')), created = Date.parse(row.createTime)
    if (!Number.isFinite(created) || created < Date.parse(registryRequest.value.startedAt) || created > Date.parse(registryRequest.value.windowEnd)) fail('OPENSWX_PARTIAL_FIRST_VERSION_UNKNOWN')
    if (registryAuthority && (!Number.isFinite(Date.parse(registryAuthority.deadlineAt))
      || Date.parse(registryRequest.value.windowEnd) > Date.parse(registryAuthority.deadlineAt)
      || (registryAuthority.completedAt != null && (!Number.isFinite(Date.parse(registryAuthority.completedAt))
        || Date.parse(registryRequest.value.startedAt) > Date.parse(registryAuthority.completedAt)
        || created > Date.parse(registryAuthority.completedAt))))) fail('OPENSWX_REGISTRY_CREDENTIAL_AUTHORITY_INVALID')
    const issued = await readIssuedCredential({ transport, profile, secretId: profile.registrySecretId, uri: credentialReceiptRoot + '-registry-version.json', deadlineAt: new Date(Date.now() + 60_000).toISOString() })
    if (!issued || issued.name !== `projects/${profile.projectNumber}/secrets/${profile.registrySecretId}/versions/3` || !issued.bytes.equals(nextRegistry)) fail('OPENSWX_PARTIAL_FIRST_PROGRESS_UNKNOWN')
    issued.bytes.fill(0)
  }
  nextRegistry.fill(0)
  return { partial: { priorBootstrapInputRef: priorInput.ref, tokenRequestRef: tokenRequest.ref, tokenSecretVersion, priorRegistryVersion, credentialReceiptRoot } }
}
async function readPartialFirstBootstrap(args) {
  const proof = await readPartialFirstCredentialProof(args)
  const readback = await readWorkerResources(args.transport, args.profile, args.basis.priorImage)
  if ((await assertNoActiveExecutions(args.transport)).length !== 0) fail('OPENSWX_FIRST_RESOURCE_NOT_EMPTY')
  return { ...proof, readback }
}

async function readCompletedFirstProof({ transport, profile, descriptor, plan, build, basis, completedFirstBootstrapInputRef, completedFirstPauseInputRef, supplementalIamReadbackRef, readSource, ancestors = [] }) {
  // Every successor proves its immutable predecessor; an execution count alone
  // never authorizes an inherited run. Bound the receipt walk and reject cycles.
  if (ancestors.length >= 8 || ancestors.includes(completedFirstBootstrapInputRef?.uri)) fail('OPENSWX_COMPLETED_FIRST_CHAIN_INVALID')
  const chain = [...ancestors, completedFirstBootstrapInputRef?.uri]
  for (const ref of [completedFirstBootstrapInputRef, completedFirstPauseInputRef, supplementalIamReadbackRef]) assertOpenSwxWorkerRef(ref)
  const oldInputRow = await transport.readJson(completedFirstBootstrapInputRef, BUCKET, [WORKER_RECEIPT_PREFIX]), oldInput = oldInputRow.value
  const oldPauseInputRow = await transport.readJson(completedFirstPauseInputRef, BUCKET, [WORKER_RECEIPT_PREFIX]), oldPauseInput = oldPauseInputRow.value
  if (!oldInput || Object.keys(oldInput).sort().join(',') !== 'bootstrapKind,currentRegistryVersion,deadlineAt,descriptorRef,receiptId,resourceApplyRef,schemaVersion,workerBuildRef'
    || oldInput.schemaVersion !== 'aipdm.openswx-bootstrap-input.v1' || oldInput.bootstrapKind !== 'FIRST_CREATE'
    || !oldPauseInput || Object.keys(oldPauseInput).sort().join(',') !== 'deadlineAt,descriptorRef,drainKind,receiptId,resourceApplyRef,schemaVersion,workerBuildRef'
    || oldPauseInput.schemaVersion !== 'aipdm.openswx-pause-input.v1' || oldPauseInput.drainKind !== 'FIRST_PROVIDER_ONLY'
    || [oldInput, oldPauseInput].some(row => !/^[A-Za-z0-9-]{6,100}$/u.test(row.receiptId ?? '') || !Number.isFinite(Date.parse(row.deadlineAt)))
    || ['descriptorRef', 'workerBuildRef', 'resourceApplyRef'].some(key => canonicalize(oldInput[key]) !== canonicalize(oldPauseInput[key]))) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  const oldDescriptorRow = await transport.readJson(oldInput.descriptorRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  const oldDescriptor = assertWorkerDescriptor(oldDescriptorRow.value, profile, descriptor.workerProfileSha256, oldDescriptorRow.value.sourceRevision)
  const oldBuildRow = await transport.readJson(oldInput.workerBuildRef, BUCKET, [WORKER_RECEIPT_PREFIX]), oldBuild = oldBuildRow.value
  assertWorkerReceipt(oldBuild, oldDescriptor, 'build'); assertWorkerBuildSource(oldBuild, oldDescriptor)
  if (oldDescriptor.purpose !== 'build_only' || oldDescriptor.sourceRevision === descriptor.sourceRevision || oldDescriptor.resourcePlanHash !== descriptor.resourcePlanHash
    || canonicalize(oldBuild.facts.sourceHashes) !== canonicalize(build.facts.sourceHashes) || oldBuild.facts.scan.rawHighOrCriticalVulnerabilityCount !== 0) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  const oldPlan = (await transport.readJson(oldDescriptor.resourcePlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const oldBasis = await firstResourceBasis({ transport, profile, descriptor: oldDescriptor, plan: oldPlan, build: oldBuild, priorResourceRequestRef: basis.priorResourceRequestRef, priorWorkerBuildRef: basis.priorWorkerBuildRef })
  const oldApply = (await transport.readJson(oldInput.resourceApplyRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  if (oldApply.schemaVersion !== 'aipdm.openswx-resource-apply.v1' || oldApply.ownerApplicationId !== 'ai-pdm' || oldApply.actor !== profile.normalActor
    || oldApply.status !== 'APPLIED' || oldApply.evidenceScope !== 'PRODUCTION_PROVIDER' || oldApply.sourceRevision !== oldDescriptor.sourceRevision
    || oldApply.resourcePlanHash !== descriptor.resourcePlanHash || !['READBACK_ONLY_FIRST_SOURCE_RECONCILIATION', 'READBACK_ONLY_COMPLETED_FIRST_SOURCE_RECONCILIATION'].includes(oldApply.mutation)
    || canonicalize(oldApply.descriptorRef) !== canonicalize(oldDescriptorRow.ref) || canonicalize(oldApply.approvedPlanRef) !== canonicalize(oldDescriptor.resourcePlanRef)
    || canonicalize(oldApply.requestRef) !== canonicalize(basis.priorResourceRequestRef) || canonicalize(oldApply.binaryPlanReceiptRef) !== canonicalize(basis.priorBinaryPlanReceiptRef)
    || canonicalize(oldApply.firstSourceReconciliation) !== canonicalize(oldBasis)) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  let inherited = null
  if (oldApply.mutation === 'READBACK_ONLY_COMPLETED_FIRST_SOURCE_RECONCILIATION') {
    if (!oldApply.completedFirstBootstrap || oldApply.partialFirstBootstrap
      || canonicalize(oldApply.supplementalIamReadbackRef) !== canonicalize(oldApply.completedFirstBootstrap.supplementalIamReadbackRef)) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
    inherited = await readCompletedFirstProof({ transport, profile, descriptor: oldDescriptor, plan: oldPlan, build: oldBuild, basis: oldBasis,
      ...oldApply.completedFirstBootstrap, readSource, ancestors: chain })
    if (canonicalize(oldApply.completedFirstBootstrap) !== canonicalize(inherited.completed)
      || oldApply.readback?.image !== inherited.completed.priorImage) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  } else if (!oldApply.partialFirstBootstrap || oldApply.completedFirstBootstrap || oldApply.supplementalIamReadbackRef
    || oldApply.readback?.image !== basis.priorImage) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  const partial = inherited?.partial ?? oldApply.partialFirstBootstrap
  // Completed-FIRST consumes an already sealed credential chain. A missing
  // seal must not turn this read-only proof stage into issuance reconciliation.
  const originalInput = (await transport.readJson(partial.priorBootstrapInputRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  if (!/^[A-Za-z0-9-]{6,100}$/u.test(originalInput?.receiptId ?? '')) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  const originalCredentialRoot = `${profile.receiptRoot}/${originalInput.receiptId}`
  for (const suffix of ['-token-version.json', '-registry-version-request.json', '-registry-version.json']) {
    if (!await optional(transport, originalCredentialRoot + suffix)) fail('OPENSWX_COMPLETED_FIRST_PROOF_MISSING')
  }
  const bootstrap = await optional(transport, `${profile.receiptRoot}/${oldInput.receiptId}.json`), paused = await optional(transport, `${profile.receiptRoot}/${oldPauseInput.receiptId}.json`)
  if (!bootstrap || !paused) fail('OPENSWX_COMPLETED_FIRST_PROOF_MISSING')
  assertWorkerReceipt(bootstrap.value, oldDescriptor, 'bootstrap', { actor: profile.normalActor, image: oldBuild.image })
  assertWorkerReceipt(paused.value, oldDescriptor, 'paused-drained', { actor: profile.normalActor, image: oldBuild.image })
  const credentials = inherited ? { partial: inherited.partial } : await readPartialFirstCredentialProof({ transport, profile, descriptor, plan, build, basis, priorBootstrapInputRef: partial.priorBootstrapInputRef,
    allowCredentialProgress: true, registryAuthority: { deadlineAt: oldInput.deadlineAt, completedAt: bootstrap.value.observedAt } })
  if (canonicalize(credentials.partial) !== canonicalize(partial)) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  await assertPausedDrainReceipt(transport, paused.value, oldDescriptor, profile)
  const facts = bootstrap.value.facts, selftest = workerTemplate(profile, oldBuild.image, null, 'selftest')
  if (facts.bootstrapKind !== 'FIRST_CREATE' || canonicalize(facts.resourceApplyRef) !== canonicalize(oldInput.resourceApplyRef)
    || (inherited ? canonicalize(facts.completedFirstBootstrap) !== canonicalize(inherited.completed) || facts.partialFirstBootstrap != null
      : canonicalize(facts.partialFirstBootstrap) !== canonicalize(credentials.partial) || facts.completedFirstBootstrap != null)
    || facts.tokenSecretVersion !== credentials.partial.tokenSecretVersion
    || facts.registrySecretVersion !== `projects/${profile.projectNumber}/secrets/${profile.registrySecretId}/versions/3`
    || facts.priorRegistryVersion !== credentials.partial.priorRegistryVersion || oldInput.currentRegistryVersion !== credentials.partial.priorRegistryVersion
    || facts.normalTemplateSha256 !== sha256(canonicalize(workerTemplate(profile, oldBuild.image, facts.tokenSecretVersion)))
    || facts.selftestTemplateSha256 !== sha256(canonicalize(selftest)) || bootstrap.value.templateSha256 !== facts.selftestTemplateSha256
    || paused.value.templateSha256 !== facts.selftestTemplateSha256 || !Array.isArray(paused.value.previousRefs)
    || canonicalize(paused.value.previousRefs) !== canonicalize([oldPauseInputRow.ref, oldInput.workerBuildRef])) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  const preflight = await transport.readJson(facts.cloudPreflightRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  assertWorkerReceipt(preflight.value, oldDescriptor, 'cloud-preflight', { actor: profile.normalActor, image: oldBuild.image })
  if (preflight.ref.uri !== bootstrap.ref.uri.replace(/\.json$/u, '-preflight.json') || preflight.value.facts.isolationVerified !== true || preflight.value.facts.noCad !== true || preflight.value.templateSha256 !== facts.selftestTemplateSha256
    || preflight.value.facts.selftestTemplateSha256 !== facts.selftestTemplateSha256 || preflight.value.facts.normalTemplateSha256 !== facts.normalTemplateSha256
    || canonicalize(bootstrap.value.previousRefs) !== canonicalize([oldInputRow.ref, oldDescriptorRow.ref, oldBuildRow.ref, preflight.ref])
    || preflight.value.previousRefs?.length !== 1) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  const finite = await transport.readJson(preflight.value.previousRefs[0], BUCKET, [WORKER_RECEIPT_PREFIX])
  assertWorkerReceipt(finite.value, oldDescriptor, 'finite-terminal', { actor: profile.normalActor, image: oldBuild.image })
  const execution = assertTerminalExecution(finite.value.facts.execution, finite.value.facts.executionName, { success: true }), proof = preflight.value.facts.proof
  const executionName = canonicalWorkerExecution(execution.name)
  if ([execution.createTime, execution.completionTime, proof?.marker?.timestamp, paused.value.facts.quiescenceCompletedAt].some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) fail('OPENSWX_COMPLETED_FIRST_EXECUTION_INVALID')
  if (finite.ref.uri !== bootstrap.ref.uri.replace(/\.json$/u, '-selftest.json') || finite.value.templateSha256 !== facts.selftestTemplateSha256 || finite.value.facts.terminalExitZero !== true
    || canonicalize(normalizeWorkerTemplate(execution.template)) !== canonicalize(selftest.template)
    || proof?.claimProof !== 'ISOLATION_ONLY_NO_CAD' || proof.executionName !== executionName || proof.marker?.marker?.state !== 'isolation_verified'
    || proof.marker.marker.executionName !== null || proof.marker.marker.schemaVersion !== MARKER || proof.markerSha256 !== sha256(canonicalize(proof.marker))
    || Date.parse(proof.marker.timestamp) < Date.parse(execution.createTime) || Date.parse(proof.marker.timestamp) > Date.parse(execution.completionTime)
    || Date.parse(execution.completionTime) > Date.parse(paused.value.facts.quiescenceCompletedAt)) fail('OPENSWX_COMPLETED_FIRST_EXECUTION_INVALID')
  assertWorkerJob(paused.value.facts.providerJob, selftest)
  await assertReadbackIamReceipt({ transport, ref: supplementalIamReadbackRef, sourceRevision: descriptor.sourceRevision, readSource, normalActor: profile.normalActor })
  const completed = { completedFirstBootstrapInputRef: oldInputRow.ref, completedFirstPauseInputRef: oldPauseInputRow.ref, bootstrapRef: bootstrap.ref,
    pausedDrainedRef: paused.ref, priorDescriptorRef: oldDescriptorRow.ref, priorWorkerBuildRef: oldBuildRow.ref, cloudPreflightRef: preflight.ref,
    finiteSelftestRef: finite.ref, supplementalIamReadbackRef, partialFirstBootstrap: credentials.partial,
    tokenSecretVersion: facts.tokenSecretVersion, registrySecretVersion: facts.registrySecretVersion, priorImage: oldBuild.image }
  const executions = [...(inherited?.executions ?? []), execution]
  if (new Set(executions.map(row => canonicalWorkerExecution(row.name))).size !== executions.length
    || (inherited && Date.parse(execution.createTime) < Date.parse(inherited.quiescenceCompletedAt))) fail('OPENSWX_COMPLETED_FIRST_EXECUTION_INVALID')
  return { completed, partial: credentials.partial, execution, executions, priorJob: paused.value.facts.providerJob,
    quiescenceCompletedAt: paused.value.facts.quiescenceCompletedAt }
}
function preservedJobMetadata(job) {
  return Object.fromEntries(['labels', 'annotations', 'client', 'clientVersion', 'launchStage', 'binaryAuthorization'].filter(key => Object.hasOwn(job, key)).map(key => [key, job[key]]))
}
async function assertCompletedFirstProvider({ transport, profile, descriptor, proof, readSource, image = proof.completed.priorImage, extraExecution = null }) {
  const readback = await readWorkerResources(transport, profile, image, workerTemplate(profile, image, null, 'selftest'), { ref: proof.completed.supplementalIamReadbackRef, sourceRevision: descriptor.sourceRevision, readSource })
  if (canonicalize(preservedJobMetadata(readback.providerJob)) !== canonicalize(preservedJobMetadata(proof.priorJob))) fail('OPENSWX_JOB_METADATA_DRIFT')
  const expected = [...proof.executions, ...(extraExecution ? [extraExecution] : [])]
  const rows = await assertNoActiveExecutions(transport)
  if (rows.length !== expected.length || new Set(rows.map(row => canonicalWorkerExecution(row.name))).size !== rows.length) fail('OPENSWX_COMPLETED_FIRST_EXECUTION_INVALID')
  for (const row of rows) {
    const match = expected.find(value => canonicalWorkerExecution(value.name) === canonicalWorkerExecution(row.name))
    if (!match) fail('OPENSWX_COMPLETED_FIRST_EXECUTION_INVALID')
    assertTerminalExecution(row, row.name, { success: true })
    if (row.createTime !== match.createTime || row.completionTime !== match.completionTime || canonicalize(row.template) !== canonicalize(match.template)) fail('OPENSWX_COMPLETED_FIRST_EXECUTION_INVALID')
  }
  return readback
}

export async function executeOpenSwxResources({ transport, profile, descriptor, descriptorRef, build, root, readSource, oauthToken, uri, deadlineAt, actor, firstReconciliation = null }) {
  if (descriptor.purpose !== 'build_only' || actor.email !== profile.normalActor || typeof oauthToken !== 'string' || oauthToken.length < 20) fail('OPENSWX_RESOURCE_AUTHORITY_INVALID')
  const plan = (await transport.readJson(descriptor.resourcePlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const sourceHashes = OPENSWX_TERRAFORM_PATHS.map(path => ({ path, sha256: sha256(readSource(path, descriptor.sourceRevision)) }))
  const planned = { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, sourceHashes, resourceAddresses: OPENSWX_TERRAFORM_ADDRESSES, allowedActions: ['create', 'no-op'] }
  if (plan.schemaVersion !== 'aipdm.openswx-approved-resource-plan.v1' || plan.status !== 'APPROVED' || plan.releaseAuthority !== true || plan.evidenceScope !== 'HUMAN_APPROVED_RESOURCE_PLAN'
    || plan.ownerApplicationId !== 'ai-pdm' || plan.sourceRevision !== descriptor.sourceRevision || !/^[a-f0-9]{64}$/u.test(plan.authorizationStatementSha256 ?? '')
    || plan.resourcePlanHash !== descriptor.resourcePlanHash || descriptor.resourcePlanHash !== sha256(canonicalize(planned)) || canonicalize(plan.plan) !== canonicalize(planned)) fail('OPENSWX_RESOURCE_PLAN_NOT_APPROVED')
  assertOpenSwxWorkerRef(plan.capacityGateRef)
  const capacity = (await transport.readJson(plan.capacityGateRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const capacityAge = Date.now() - Date.parse(capacity.observedAt)
  if (capacity.project !== 'AI-PDM' || capacity.sourceRevision !== descriptor.sourceRevision || capacity.status !== 'PASS' || !Number.isFinite(capacityAge) || capacityAge < 0 || capacityAge > 600_000) fail('OPENSWX_RESOURCE_CAPACITY_GATE_REQUIRED')
  if (firstReconciliation) {
    const basis = await firstResourceBasis({ transport, profile, descriptor, plan, build, ...firstReconciliation })
    let recovery = null
    if (firstReconciliation.completedFirstBootstrapInputRef) {
      const proof = await readCompletedFirstProof({ transport, profile, descriptor, plan, build, basis, ...firstReconciliation, readSource })
      recovery = { ...proof, readback: await assertCompletedFirstProvider({ transport, profile, descriptor, proof, readSource }) }
    } else if (firstReconciliation.priorBootstrapInputRef) recovery = await readPartialFirstBootstrap({ transport, profile, descriptor, plan, build, basis, priorBootstrapInputRef: firstReconciliation.priorBootstrapInputRef, allowCredentialProgress: true, registryAuthority: { deadlineAt } })
    const reconciliationMutation = recovery?.completed ? 'READBACK_ONLY_COMPLETED_FIRST_SOURCE_RECONCILIATION' : 'READBACK_ONLY_FIRST_SOURCE_RECONCILIATION'
    const readback = recovery?.readback ?? await assertFirstProviderUnissued(transport, profile, basis.priorImage)
    const previous = await optional(transport, uri)
    if (previous) {
      if (previous.value.schemaVersion !== 'aipdm.openswx-resource-apply.v1' || previous.value.ownerApplicationId !== 'ai-pdm' || previous.value.actor !== actor.email || previous.value.resourcePlanHash !== descriptor.resourcePlanHash
        || previous.value.sourceRevision !== descriptor.sourceRevision || canonicalize(previous.value.descriptorRef) !== canonicalize(descriptorRef) || canonicalize(previous.value.approvedPlanRef) !== canonicalize(descriptor.resourcePlanRef)
        || canonicalize(previous.value.requestRef) !== canonicalize(basis.priorResourceRequestRef) || canonicalize(previous.value.binaryPlanReceiptRef) !== canonicalize(basis.priorBinaryPlanReceiptRef)
        || canonicalize(previous.value.firstSourceReconciliation) !== canonicalize(basis) || previous.value.mutation !== reconciliationMutation || previous.value.readback?.image !== (recovery?.completed ? recovery.completed.priorImage : basis.priorImage)
        || canonicalize(previous.value.partialFirstBootstrap ?? null) !== canonicalize(recovery?.completed ? null : recovery?.partial ?? null)
        || canonicalize(previous.value.completedFirstBootstrap ?? null) !== canonicalize(recovery?.completed ?? null)
        || canonicalize(previous.value.supplementalIamReadbackRef ?? null) !== canonicalize(recovery?.completed?.supplementalIamReadbackRef ?? null)
        || previous.value.status !== 'APPLIED' || previous.value.evidenceScope !== 'PRODUCTION_PROVIDER') fail('OPENSWX_FIRST_RESOURCE_JOIN_INVALID')
      return previous
    }
    return write(transport, uri, { schemaVersion: 'aipdm.openswx-resource-apply.v1', ownerApplicationId: 'ai-pdm', actor: actor.email, resourcePlanHash: descriptor.resourcePlanHash, sourceRevision: descriptor.sourceRevision, descriptorRef, approvedPlanRef: descriptor.resourcePlanRef, requestRef: basis.priorResourceRequestRef, binaryPlanReceiptRef: basis.priorBinaryPlanReceiptRef, observedAt: transport.now(), readback, firstSourceReconciliation: basis, ...(recovery?.completed ? { completedFirstBootstrap: recovery.completed, supplementalIamReadbackRef: recovery.completed.supplementalIamReadbackRef } : recovery ? { partialFirstBootstrap: recovery.partial } : {}), mutation: reconciliationMutation, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER' })
  }

  const requestUri = `${uri.slice(0, -5)}-request.json`, planUri = `${uri.slice(0, -5)}-plan.json`
  let request = await optional(transport, requestUri), binaryPlan = null
  const binding = { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, receiptUri: uri, descriptorRef, approvedPlanRef: descriptor.resourcePlanRef, actor: actor.email, sourceRevision: descriptor.sourceRevision, sourceArchiveSha256: descriptor.sourceArchiveSha256, resourcePlanHash: descriptor.resourcePlanHash, workerImage: build.image }
  const join = (value, schemaVersion, additional = []) => {
    const keys = ['schemaVersion', ...Object.keys(binding), 'binaryPlanSha256', 'changes', 'requestedAt', ...additional].sort().join(',')
    if (!value || Object.keys(value).sort().join(',') !== keys || value.schemaVersion !== schemaVersion
      || Object.entries(binding).some(([key, expected]) => canonicalize(value[key]) !== canonicalize(expected))
      || !/^[a-f0-9]{64}$/u.test(value.binaryPlanSha256 ?? '') || typeof value.requestedAt !== 'string' || !Number.isFinite(Date.parse(value.requestedAt))
      || !Array.isArray(value.changes) || value.changes.length !== OPENSWX_TERRAFORM_ADDRESSES.length
      || value.changes.some(row => !row || Object.keys(row).sort().join(',') !== 'actions,address' || !Array.isArray(row.actions) || row.actions.length !== 1 || !['create', 'no-op'].includes(row.actions[0]))
      || canonicalize(value.changes.map(row => row.address).sort()) !== canonicalize([...OPENSWX_TERRAFORM_ADDRESSES].sort())) fail('OPENSWX_RESOURCE_REQUEST_JOIN_INVALID')
  }
  if (request) {
    join(request.value, 'aipdm.openswx-resource-apply-request.v1', ['binaryPlanReceiptRef'])
    try {
      assertOpenSwxWorkerRef(request.value.binaryPlanReceiptRef)
      if (request.value.binaryPlanReceiptRef.uri !== planUri) fail('OPENSWX_RESOURCE_REQUEST_JOIN_INVALID')
      binaryPlan = await transport.readJson(request.value.binaryPlanReceiptRef, BUCKET, [WORKER_RECEIPT_PREFIX])
      join(binaryPlan.value, 'aipdm.openswx-resource-binary-plan.v1')
      for (const key of ['binaryPlanSha256', 'changes', 'requestedAt']) if (canonicalize(request.value[key]) !== canonicalize(binaryPlan.value[key])) fail('OPENSWX_RESOURCE_REQUEST_JOIN_INVALID')
    } catch { fail('OPENSWX_RESOURCE_REQUEST_JOIN_INVALID') }
  }
  const previous = await optional(transport, uri)
  if (previous) {
    if (!request || previous.value.schemaVersion !== 'aipdm.openswx-resource-apply.v1' || previous.value.status !== 'APPLIED' || previous.value.actor !== actor.email
      || previous.value.ownerApplicationId !== 'ai-pdm' || previous.value.evidenceScope !== 'PRODUCTION_PROVIDER'
      || previous.value.sourceRevision !== descriptor.sourceRevision || previous.value.resourcePlanHash !== descriptor.resourcePlanHash
      || canonicalize(previous.value.descriptorRef) !== canonicalize(descriptorRef) || canonicalize(previous.value.approvedPlanRef) !== canonicalize(descriptor.resourcePlanRef)
      || canonicalize(previous.value.requestRef) !== canonicalize(request.ref) || canonicalize(previous.value.binaryPlanReceiptRef) !== canonicalize(binaryPlan.ref)
      || previous.value.binaryPlanSha256 !== binaryPlan.value.binaryPlanSha256) fail('OPENSWX_RESOURCE_REQUEST_JOIN_INVALID')
    await readWorkerResources(transport, profile, build.image); return previous
  }
  let mutation = 'READBACK_ONLY'
  if (!request) {
    if (await optional(transport, planUri)) fail('OPENSWX_RESOURCE_REQUEST_JOIN_INVALID')
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE || process.env.GOOGLE_CREDENTIALS || process.env.GOOGLE_BACKEND_CREDENTIALS) fail('OPENSWX_ADC_FORBIDDEN')
    const canonicalRoot = await fs.realpath(root)
    for (const entry of sourceHashes) if (sha256(await fs.readFile(path.join(canonicalRoot, entry.path))) !== entry.sha256) fail('OPENSWX_TERRAFORM_SOURCE_NOT_FROZEN')
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'aipdm-dev122-owner-terraform-'))
    try {
      for (const entry of sourceHashes.filter(row => row.path.endsWith('.tf'))) await fs.writeFile(path.join(temporary, path.basename(entry.path)), readSource(entry.path, descriptor.sourceRevision))
      const environment = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: temporary, TMP: temporary, TF_DATA_DIR: path.join(temporary, 'plugins'), TF_IN_AUTOMATION: '1', TF_INPUT: '0', GOOGLE_OAUTH_ACCESS_TOKEN: oauthToken, TF_VAR_worker_image: build.image }
      const run = args => { checkDeadline(deadlineAt); const result = spawnSync('terraform', args, { cwd: temporary, env: environment, windowsHide: true, encoding: 'utf8', timeout: Math.max(1, Date.parse(deadlineAt) - Date.now()), maxBuffer: 16 * 1024 * 1024 }); if (result.error || result.status !== 0) fail('OPENSWX_TERRAFORM_EXECUTION_UNKNOWN'); return result.stdout }
      run(['init', '-input=false', '-no-color'])
      run(['plan', '-input=false', '-no-color', '-out=owned.tfplan'])
      const nativePlan = JSON.parse(run(['show', '-json', 'owned.tfplan'])), changes = assertWorkerTerraformPlan(nativePlan)
      const binarySha256 = sha256(await fs.readFile(path.join(temporary, 'owned.tfplan')))
      const facts = { ...binding, binaryPlanSha256: binarySha256, changes, requestedAt: transport.now() }
      binaryPlan = await write(transport, planUri, { schemaVersion: 'aipdm.openswx-resource-binary-plan.v1', ...facts })
      request = await write(transport, requestUri, { schemaVersion: 'aipdm.openswx-resource-apply-request.v1', ...facts, binaryPlanReceiptRef: binaryPlan.ref })
      try { run(['apply', '-input=false', '-no-color', '-auto-approve', 'owned.tfplan']); mutation = 'APPLY_THEN_READBACK' } catch { mutation = 'UNKNOWN_APPLY_THEN_READBACK' }
    } finally {
      if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('aipdm-dev122-owner-terraform-')) fail('OPENSWX_TERRAFORM_CLEANUP_SCOPE_INVALID')
      await fs.rm(temporary, { recursive: true, force: true })
    }
  }
  const readback = await readWorkerResources(transport, profile, build.image)
  return write(transport, uri, { schemaVersion: 'aipdm.openswx-resource-apply.v1', ownerApplicationId: 'ai-pdm', actor: actor.email, resourcePlanHash: descriptor.resourcePlanHash, sourceRevision: descriptor.sourceRevision, descriptorRef, approvedPlanRef: descriptor.resourcePlanRef, requestRef: request.ref, binaryPlanReceiptRef: binaryPlan.ref, binaryPlanSha256: binaryPlan.value.binaryPlanSha256, observedAt: transport.now(), readback, mutation, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER' })
}
async function optional(transport, uri) { try { const row = await transport.readBytes(uri, { prefixes: [WORKER_RECEIPT_PREFIX] }); return { ...row, value: JSON.parse(row.bytes) } } catch (error) { if (error.code === 'MISSING') return null; throw error } }
const write = writeWorkerJson
export function parseOpenSwxBootstrapArgs(argv) {
  const options = {}
  for (let n = 0; n < argv.length; n += 2) {
    if (!['--stage', '--input-ref', '--input-sha256'].includes(argv[n]) || options[argv[n]] || !argv[n + 1]) fail('OPENSWX_BOOTSTRAP_ARGUMENT_INVALID')
    options[argv[n]] = argv[n + 1]
  }
  if (Object.keys(options).length !== 3 || !['resources', 'bootstrap', 'pause', 'activate'].includes(options['--stage'])) fail('OPENSWX_BOOTSTRAP_ARGUMENT_INVALID')
  const ref = { uri: options['--input-ref'], sha256: options['--input-sha256'] }; assertOpenSwxWorkerRef(ref)
  return { stage: options['--stage'], inputRef: ref }
}
export function parseWorkerStdoutMarker(row, executionName, expectedState = 'empty') {
  const canonical = canonicalWorkerExecution(executionName), executionId = canonical.split('/').at(-1)
  if (row?.resource?.type !== 'cloud_run_job' || row.resource.labels?.project_id !== 'jenfu-platform-prod' || row.resource.labels?.location !== 'asia-east1'
    || row.resource.labels?.job_name !== 'ai-pdm-prod-openswx-metadata' || row.labels?.['run.googleapis.com/execution_name'] !== executionId
    || row.logName !== 'projects/jenfu-platform-prod/logs/run.googleapis.com%2Fstdout' || typeof row.insertId !== 'string' || !row.insertId || !Number.isFinite(Date.parse(row.timestamp))) fail('OPENSWX_STDOUT_SCOPE_INVALID')
  let marker = row.jsonPayload
  if (!marker && typeof row.textPayload === 'string') { try { marker = JSON.parse(row.textPayload) } catch { fail('OPENSWX_STDOUT_MARKER_INVALID') } }
  if (!marker || Object.keys(marker).sort().join(',') !== 'executionName,schemaVersion,state' || marker.schemaVersion !== MARKER || marker.state !== expectedState
    || (expectedState === 'empty' ? marker.executionName !== canonical : expectedState !== 'isolation_verified' || marker.executionName !== null)) fail('OPENSWX_STDOUT_MARKER_INVALID')
  return { insertId: row.insertId, timestamp: row.timestamp, marker }
}
export async function readWorkerStdoutProof({ transport, profile, execution, expectedState = 'empty', deadlineAt }) {
  assertOpenSwxWorkerProfile(profile); checkDeadline(deadlineAt)
  const executionName = canonicalWorkerExecution(execution.name), executionId = executionName.split('/').at(-1)
  if ([execution.createTime, execution.completionTime].some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    || Date.parse(execution.createTime) > Date.parse(execution.completionTime)) fail('OPENSWX_STDOUT_WINDOW_INVALID')
  const filter = [`resource.type="cloud_run_job"`, `resource.labels.project_id="${profile.projectId}"`, `resource.labels.location="${profile.location}"`, `resource.labels.job_name="${profile.jobId}"`, `labels."run.googleapis.com/execution_name"="${executionId}"`, 'logName="projects/jenfu-platform-prod/logs/run.googleapis.com%2Fstdout"', `timestamp>="${execution.createTime}"`, `timestamp<="${execution.completionTime}"`].join(' AND ')
  const markers = new Map(); let pageToken = ''
  for (let page = 0; page < profile.bounds.maxLogPages; page += 1) {
    checkDeadline(deadlineAt)
    const result = await transport.request('https://logging.googleapis.com/v2/entries:list', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resourceNames: [`projects/${profile.projectId}`], filter, pageSize: profile.bounds.maxLogEntries, orderBy: 'timestamp asc', ...(pageToken ? { pageToken } : {}) }) })
    checkDeadline(deadlineAt)
    for (const entry of result.entries ?? []) {
      if (entry.jsonPayload?.schemaVersion !== MARKER && !entry.textPayload?.includes(MARKER)) continue
      const marker = parseWorkerStdoutMarker(entry, executionName, expectedState)
      if (Date.parse(marker.timestamp) < Date.parse(execution.createTime) || Date.parse(marker.timestamp) > Date.parse(execution.completionTime)) fail('OPENSWX_STDOUT_WINDOW_INVALID')
      if (markers.has(marker.insertId) && canonicalize(markers.get(marker.insertId)) !== canonicalize(marker)) fail('OPENSWX_STDOUT_CONFLICT')
      markers.set(marker.insertId, marker)
    }
    pageToken = result.nextPageToken ?? ''; if (!pageToken) break
    if (page + 1 === profile.bounds.maxLogPages) fail('OPENSWX_STDOUT_PAGE_LIMIT')
  }
  if (markers.size !== 1) fail('OPENSWX_STDOUT_NOT_UNIQUE')
  const marker = [...markers.values()][0]
  return { executionName, marker, markerSha256: sha256(canonicalize(marker)), filterSha256: sha256(filter), observedAt: transport.now(), claimProof: expectedState === 'empty' ? 'AUTHENTICATED_204_SOURCE_BOUND' : 'ISOLATION_ONLY_NO_CAD' }
}
export async function verifyNormalActor(transport, profile) {
  const identity = await transport.request('https://openidconnect.googleapis.com/v1/userinfo')
  if (identity?.email !== profile.normalActor || identity.email_verified !== true || typeof identity.sub !== 'string' || !identity.sub) fail('OPENSWX_NORMAL_ACTOR_REQUIRED')
  return { email: identity.email, subject: identity.sub }
}
async function readSecretBytes(transport, name, profile) {
  assertNumericSecret(name, name.includes(`/secrets/${profile.tokenSecretId}/`) ? profile.tokenSecretId : profile.registrySecretId)
  const access = await transport.request(`https://secretmanager.googleapis.com/v1/${name}:access`)
  const canonical = assertNumericSecret(access?.name, name.includes(`/secrets/${profile.tokenSecretId}/`) ? profile.tokenSecretId : profile.registrySecretId)
  if (canonical !== name.replace('projects/jenfu-platform-prod/', 'projects/9536592944/')) fail('OPENSWX_SECRET_READBACK_MISMATCH')
  const bytes = Buffer.from(access.payload?.data ?? '', 'base64')
  if (!bytes.length || bytes.length > 16384) fail('OPENSWX_SECRET_PAYLOAD_BOUND')
  return bytes
}
/** Payload is used only in memory. Durable request/receipt contain hashes/numeric names, never tokens. */
export async function addCredentialVersion({ transport, profile, secretId, bytes, uri, deadlineAt }) {
  if (![profile.tokenSecretId, profile.registrySecretId].includes(secretId) || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 16384) fail('OPENSWX_CREDENTIAL_INVALID')
  const payloadSha256 = sha256(bytes), latchUri = `${uri.slice(0, -5)}-request.json`
  const existing = await optional(transport, uri)
  if (existing) {
    if (existing.value.schemaVersion !== 'aipdm.openswx-credential-version.v1' || existing.value.payloadSha256 !== payloadSha256) fail('OPENSWX_CREDENTIAL_REQUEST_JOIN_INVALID')
    const exact = assertNumericSecret(existing.value.secretVersion, secretId)
    if (sha256(await readSecretBytes(transport, exact, profile)) !== payloadSha256) fail('OPENSWX_CREDENTIAL_READBACK_MISMATCH')
    return exact
  }
  let request = await optional(transport, latchUri), version = null
  if (!request) {
    checkDeadline(deadlineAt)
    const startedAt = transport.now()
    if (Date.parse(startedAt) + 30_000 > Date.parse(deadlineAt)) fail('OPENSWX_CREDENTIAL_REQUEST_DEADLINE')
    request = await write(transport, latchUri, { schemaVersion: 'aipdm.openswx-credential-request.v1', secretId, payloadSha256, startedAt, windowEnd: new Date(Date.parse(startedAt) + 30_000).toISOString() })
    assertCredentialRequest(request.value, secretId, payloadSha256)
    try { version = (await transport.request(`https://secretmanager.googleapis.com/v1/projects/${profile.projectId}/secrets/${secretId}:addVersion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload: { data: bytes.toString('base64') } }) }))?.name } catch { /* exact-secret readback below; never add again */ }
  }
  assertCredentialRequest(request.value, secretId, payloadSha256)
  if (!version) {
    const result = await transport.request(`https://secretmanager.googleapis.com/v1/projects/${profile.projectId}/secrets/${secretId}/versions?pageSize=100`)
    if (result.nextPageToken) fail('OPENSWX_CREDENTIAL_READBACK_BOUND')
    const matches = []
    for (const row of result.versions ?? []) {
      if (!Number.isFinite(Date.parse(row.createTime)) || Date.parse(row.createTime) < Date.parse(request.value.startedAt) || Date.parse(row.createTime) > Date.parse(request.value.windowEnd) || row.state !== 'ENABLED') continue
      const canonical = assertNumericSecret(row.name, secretId), payload = await readSecretBytes(transport, canonical, profile)
      if (sha256(payload) === payloadSha256) matches.push(canonical)
    }
    if (matches.length !== 1) fail('OPENSWX_CREDENTIAL_OUTCOME_UNKNOWN')
    version = matches[0]
  }
  const canonical = assertNumericSecret(version, secretId)
  if (sha256(await readSecretBytes(transport, canonical, profile)) !== payloadSha256) fail('OPENSWX_CREDENTIAL_READBACK_MISMATCH')
  await write(transport, uri, { schemaVersion: 'aipdm.openswx-credential-version.v1', secretVersion: canonical, payloadSha256, requestRef: request.ref, observedAt: transport.now() })
  return canonical
}
/** Recover a lost token issuance from its hash-only latch; never generate a replacement on replay. */
async function readIssuedCredential({ transport, profile, secretId, uri, deadlineAt }) {
  checkDeadline(deadlineAt)
  const saved = await optional(transport, uri), pending = await optional(transport, `${uri.slice(0, -5)}-request.json`)
  if (!saved && !pending) return null
  const digest = saved?.value.payloadSha256 ?? pending?.value.payloadSha256
  assertCredentialRequest(pending?.value, secretId, digest)
  if (saved && (saved.value.schemaVersion !== 'aipdm.openswx-credential-version.v1' || saved.value.payloadSha256 !== digest
    || canonicalize(saved.value.requestRef) !== canonicalize(pending.ref))) fail('OPENSWX_CREDENTIAL_REQUEST_JOIN_INVALID')
  let name = saved?.value.secretVersion
  if (!name) {
    const result = await transport.request(`https://secretmanager.googleapis.com/v1/projects/${profile.projectId}/secrets/${secretId}/versions?pageSize=100`)
    if (result.nextPageToken) fail('OPENSWX_CREDENTIAL_READBACK_BOUND')
    const matches = []
    for (const row of result.versions ?? []) {
      checkDeadline(deadlineAt)
      const created = Date.parse(row.createTime)
      if (!Number.isFinite(created) || created < Date.parse(pending.value.startedAt) || created > Date.parse(pending.value.windowEnd) || row.state !== 'ENABLED') continue
      const canonical = assertNumericSecret(row.name, secretId), bytes = await readSecretBytes(transport, canonical, profile)
      if (sha256(bytes) === digest) matches.push(canonical)
    }
    if (matches.length !== 1) fail('OPENSWX_CREDENTIAL_OUTCOME_UNKNOWN')
    name = matches[0]
  }
  const canonical = assertNumericSecret(name, secretId), bytes = await readSecretBytes(transport, canonical, profile)
  if (sha256(bytes) !== digest) fail('OPENSWX_CREDENTIAL_READBACK_MISMATCH')
  return { name: canonical, bytes }
}
export async function verifyExistingReaderCredentials(transport, profile, descriptor) {
  for (const [name, id] of [[descriptor.tokenSecretVersion, profile.tokenSecretId], [descriptor.registrySecretVersion, profile.registrySecretId]]) {
    const exact = assertNumericSecret(name, id), version = await transport.request(`https://secretmanager.googleapis.com/v1/${exact}`)
    if (assertNumericSecret(version.name, id) !== exact || version.state !== 'ENABLED') fail('OPENSWX_CREDENTIAL_DISABLED')
  }
  const token = await readSecretBytes(transport, descriptor.tokenSecretVersion, profile), registry = validatedRegistry(await readSecretBytes(transport, descriptor.registrySecretVersion, profile), profile)
  const reader = registry.workloads?.filter(row => row.id === profile.readerId)
  if (registry.schemaVersion !== 'ai-pdm.workload-credentials.v1' || reader?.length !== 1 || reader[0].token !== token.toString()
    || canonicalize(reader[0].purposes) !== canonicalize([profile.readerPurpose]) || canonicalize(reader[0].capabilities) !== canonicalize([profile.readerCapability])) fail('OPENSWX_CREDENTIAL_BINDING_DRIFT')
  return { tokenSecretVersion: descriptor.tokenSecretVersion, registrySecretVersion: descriptor.registrySecretVersion }
}
export function appendReaderCredential(registryBytes, profile, token) {
  const registry = validatedRegistry(registryBytes, profile)
  if (registry.workloads.length >= 16 || registry.workloads.some(row => row.id === profile.readerId || row.token === token)
    || !/^[A-Za-z0-9_-]{43}$/u.test(token)) fail('OPENSWX_REGISTRY_INVALID')
  const result = Buffer.from(JSON.stringify({ ...registry, workloads: [...registry.workloads, { id: profile.readerId, token, purposes: [profile.readerPurpose], capabilities: [profile.readerCapability] }] }))
  if (result.length > 16384) fail('OPENSWX_REGISTRY_INVALID')
  return result
}
function validatedRegistry(bytes, profile) {
  const registry = JSON.parse(bytes)
  const purposes = ['preview_jobs', 'preview_heartbeat', 'recognition_jobs', 'recognition_heartbeat', 'settings_secret_probe', 'solidworks_credential', profile.readerPurpose]
  const capabilities = ['solidworks_3d_preview_png', 'solidworks_2d_preview_png', 'solidworks_document_manager', profile.readerCapability]
  if (bytes.length > 16384 || Object.keys(registry).sort().join(',') !== 'schemaVersion,workloads' || registry.schemaVersion !== 'ai-pdm.workload-credentials.v1'
    || !Array.isArray(registry.workloads) || registry.workloads.length < 1 || registry.workloads.length > 16) fail('OPENSWX_REGISTRY_INVALID')
  const ids = new Set(), tokens = new Set()
  for (const row of registry.workloads) {
    if (Object.keys(row).sort().join(',') !== 'capabilities,id,purposes,token' || !/^[A-Za-z0-9._:-]{1,120}$/u.test(row.id ?? '') || !/^[A-Za-z0-9_-]{43}$/u.test(row.token ?? '')
      || ids.has(row.id) || tokens.has(row.token) || !Array.isArray(row.purposes) || !row.purposes.length || new Set(row.purposes).size !== row.purposes.length || row.purposes.some(value => !purposes.includes(value))
      || !Array.isArray(row.capabilities) || new Set(row.capabilities).size !== row.capabilities.length || row.capabilities.some(value => !capabilities.includes(value))) fail('OPENSWX_REGISTRY_INVALID')
    if ((row.purposes.includes(profile.readerPurpose) || row.capabilities.includes(profile.readerCapability)) && (row.id !== profile.readerId || canonicalize(row.purposes) !== canonicalize([profile.readerPurpose]) || canonicalize(row.capabilities) !== canonicalize([profile.readerCapability]))) fail('OPENSWX_REGISTRY_INVALID')
    if (row.purposes.some(value => ['recognition_jobs', 'recognition_heartbeat', 'settings_secret_probe', 'solidworks_credential'].includes(value)) && !row.capabilities.includes('solidworks_document_manager')) fail('OPENSWX_REGISTRY_INVALID')
    if (row.purposes.some(value => ['preview_jobs', 'preview_heartbeat'].includes(value)) && !row.capabilities.some(value => ['solidworks_2d_preview_png', 'solidworks_3d_preview_png'].includes(value))) fail('OPENSWX_REGISTRY_INVALID')
    ids.add(row.id); tokens.add(row.token)
  }
  return registry
}
export async function pauseWorkerScheduler({ transport, profile, deadlineAt }) {
  checkDeadline(deadlineAt)
  const before = await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`)
  const priorState = before.state, targetSha256 = sha256(canonicalize(before.httpTarget))
  if (!['ENABLED', 'PAUSED'].includes(priorState)) fail('OPENSWX_SCHEDULER_STATE_UNKNOWN')
  if (priorState !== 'PAUSED') {
    try { await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}:pause`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }) } catch { /* read back, never blindly repeat */ }
  }
  const after = await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`)
  assertPausedScheduler(after, profile)
  if (sha256(canonicalize(after.httpTarget)) !== targetSha256) fail('OPENSWX_SCHEDULER_TARGET_DRIFT')
  return { priorState, targetSha256, pausedAt: transport.now() }
}
async function activateWorker({ transport, profile, descriptor, descriptorRef, intent, capsuleRef, uri, deadlineAt, actor, appProfile, readSource }) {
  const evidence = await readWorkerFullEvidence(transport, descriptor, profile, readSource)
  const paths = releasePaths(appProfile, intent, capsuleRef.sha256)
  const finalized = await transport.readBytes(paths.finalize, { prefixes: ['receipts'] })
  const finalization = JSON.parse(finalized.bytes)
  const canonical = await transport.readBytes(paths.canonical, { prefixes: ['receipts'] })
  const canonicalValue = JSON.parse(canonical.bytes)
  if (finalization.stage !== 'finalize' || finalization.ownerApplicationId !== 'ai-pdm' || finalization.sourceRevision !== intent.sourceRevision || finalization.facts?.result !== 'RELEASED'
    || finalization.facts.openswxWorker?.status !== 'ACTIVATION_PENDING' || canonicalValue.stage !== 'canonical' || canonicalValue.sourceRevision !== intent.sourceRevision
    || canonicalValue.facts?.origin !== profile.canonicalOrigin || canonicalize(finalization.previousReceiptRef) !== canonicalize(canonical.ref)) fail('OPENSWX_FINALIZATION_JOIN_INVALID')
  if (isPausedAppRepair(descriptor)) {
    const records = await Promise.all([paths.prepare, paths.migrate, paths.terminal].map(path => transport.readBytes(path, { prefixes: ['receipts'] })))
    const observed = await transport.readOwnerSourceProof({ profile: appProfile, sourceRevision: intent.sourceRevision,
      refs: { prepare: records[0].ref, migrate: records[1].ref, terminal: records[2].ref }, verifyProvider: true })
    const graph = await readAiPdmObservationInputs(observed.proof)
    if (!graph.repair || observed.proof.disposition !== 'released' || observed.provider?.status !== 'BUILD_IMAGE_VERIFIED'
      || canonicalize(graph.intentRef) !== canonicalize(capsuleRef) || canonicalize(graph.chain.finalize.ref) !== canonicalize(finalized.ref)
      || canonicalize(graph.chain.canonical.ref) !== canonicalize(canonical.ref) || canonicalize(graph.intent.openswxWorkerRef) !== canonicalize(descriptorRef)) fail('OPENSWX_FINALIZATION_JOIN_INVALID')
  }
  const service = await transport.getService(appProfile)
  transport.assertServiceSettled(service)
  if (transport.effectiveRevision(service) !== canonicalValue.facts.candidateRevision) fail('OPENSWX_CANONICAL_REVISION_DRIFT')
  transport.assertCanonicalEntrypoint(appProfile, service)
  const revision = await transport.getRevision(appProfile, canonicalValue.facts.candidateRevision)
  const runtime = (await transport.readJson(intent.runtimeConfigRef, BUCKET, ['receipts'])).value.runtimeConfig
  if (runtime?.plainEnvironment?.PDM_OPENSWX_DISPATCH_ENABLED !== '1' || runtime.openswxWorker?.descriptorRef?.sha256 !== descriptorRef.sha256
    || runtime.secretVersions?.PDM_WORKLOAD_AUTH_CREDENTIALS !== descriptor.registrySecretVersion.split('/').at(-1)) fail('OPENSWX_RUNTIME_BINDING_INVALID')
  const env = revision.containers?.find(container => container.name === appProfile.runtime.containerName)?.env
  if (!env?.some(row => row.name === 'PDM_OPENSWX_DISPATCH_ENABLED' && row.value === '1') || !env?.some(row => row.name === 'PDM_WORKLOAD_AUTH_CREDENTIALS' && row.valueSource?.secretKeyRef?.secret === profile.registrySecretId && String(row.valueSource.secretKeyRef.version) === descriptor.registrySecretVersion.split('/').at(-1))) fail('OPENSWX_RUNTIME_BINDING_INVALID')
  const template = workerTemplate(profile, evidence.image, descriptor.tokenSecretVersion)
  const before = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
  assertWorkerJob(before, template)
  const existingActivation = await optional(transport, uri)
  if (existingActivation) {
    assertWorkerReceipt(existingActivation.value, descriptor, 'activation', { actor: actor.email, image: evidence.image })
    if (existingActivation.value.facts.workerStatus !== 'READY' || existingActivation.value.facts.claimProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND'
      || canonicalize(existingActivation.value.previousRefs[0]) !== canonicalize(capsuleRef)) fail('OPENSWX_ACTIVATION_REPLAY_INVALID')
    await verifyExistingReaderCredentials(transport, profile, descriptor)
    const scheduler = await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`)
    if (scheduler.state !== 'ENABLED') fail('OPENSWX_ACTIVATION_REPLAY_INVALID')
    assertPausedScheduler({ ...scheduler, state: 'PAUSED' }, profile)
    return existingActivation
  }
  assertPausedScheduler(await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), profile)
  await assertNoActiveExecutions(transport)
  const smoke = await transport.readJson(finalization.facts.openswxWorker.finiteSmokeRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  assertWorkerReceipt(smoke.value, descriptor, 'finite-terminal', { image: evidence.image })
  let finite = smoke
  if (Date.now() - Date.parse(smoke.value.facts.execution.completionTime) > profile.bounds.proofFreshnessSeconds * 1000) {
    finite = await runWorkerFinite({ transport, descriptor, profile, template, receiptUri: `${uri.slice(0, -5)}-fresh-finite.json`, actor: actor.email, deadlineAt })
  }
  const executionName = canonicalWorkerExecution(finite.value.facts.executionName)
  const execution = await transport.request(`https://run.googleapis.com/v2/${executionName}`)
  assertTerminalExecution(execution, executionName, { success: true })
  if (canonicalize(normalizeWorkerTemplate(execution.template)) !== canonicalize(template.template)) fail('OPENSWX_ACTIVATION_FINITE_NOT_PROVEN')
  const proof = await readWorkerStdoutProof({ transport, profile, execution, deadlineAt })
  assertFreshProof(execution, profile)
  await verifyExistingReaderCredentials(transport, profile, descriptor)
  await assertNoActiveExecutions(transport)
  const after = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`); assertWorkerJob(after, template)
  if (before.etag !== after.etag) fail('OPENSWX_JOB_ACTIVATION_DRIFT')
  assertPausedScheduler(await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), profile)
  checkDeadline(deadlineAt)
  const latchUri = `${uri.slice(0, -5)}-enable-request.json`, oldRequest = await optional(transport, latchUri)
  if (oldRequest) {
    await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`)
    await pauseWorkerScheduler({ transport, profile, deadlineAt })
    fail('OPENSWX_ENABLE_REPLAY_REQUIRES_PAUSE_READBACK')
  }
  const latch = await write(transport, latchUri, { schemaVersion: 'aipdm.openswx-enable-request.v1', sourceRevision: intent.sourceRevision, descriptorRef, actor: actor.email, schedulerName: workerSchedulerName(), finiteRef: finite.ref, observedAt: transport.now() })
  try {
    checkDeadline(deadlineAt); assertFreshProof(execution, profile)
    await assertNoActiveExecutions(transport); checkDeadline(deadlineAt); assertFreshProof(execution, profile)
    if (isPausedAppRepair(descriptor)) {
      const currentService = await transport.getService(appProfile)
      transport.assertServiceSettled(currentService); transport.assertCanonicalEntrypoint(appProfile, currentService)
      if (transport.effectiveRevision(currentService) !== canonicalValue.facts.candidateRevision || currentService.etag !== service.etag || (currentService.traffic ?? []).some(row => row.tag)) fail('OPENSWX_CANONICAL_REVISION_DRIFT')
      const currentJob = assertWorkerJob(await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`), template)
      if (currentJob.etag !== after.etag || String(currentJob.generation) !== String(after.generation)) fail('OPENSWX_JOB_ACTIVATION_DRIFT')
      await verifyExistingReaderCredentials(transport, profile, descriptor)
      assertPausedScheduler(await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), profile)
      await assertNoActiveExecutions(transport); checkDeadline(deadlineAt); assertFreshProof(execution, profile)
    }
    await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}:resume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    const enabled = await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`)
    if (enabled.state !== 'ENABLED') fail('OPENSWX_SCHEDULER_ENABLE_UNKNOWN')
    assertPausedScheduler({ ...enabled, state: 'PAUSED' }, profile)
    return await write(transport, uri, workerReceipt({ descriptor, kind: 'activation', actor: actor.email, image: evidence.image, template, observedAt: transport.now(), previousRefs: [capsuleRef, finalized.ref, canonical.ref, finite.ref, latch.ref], facts: { workerStatus: 'READY', claimProof: proof, dbAdmissionProof: 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN', schedulerState: 'ENABLED', sourceEntryRef: evidence.artifact.sourceEntryProof, numericCredentials: { token: descriptor.tokenSecretVersion, registry: descriptor.registrySecretVersion } } }))
  } catch {
    // Unknown enable is read back, then paused. Never auto-resume after failure.
    await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`)
    await pauseWorkerScheduler({ transport, profile, deadlineAt })
    fail('OPENSWX_ACTIVATION_PENDING_RECOVERY_REQUIRED')
  }
}
function assertFreshProof(execution, profile) {
  const age = Date.now() - Date.parse(execution.completionTime)
  if (!Number.isFinite(age) || age < -5000 || age > profile.bounds.proofFreshnessSeconds * 1000) fail('OPENSWX_ACTIVATION_PROOF_EXPIRED')
}
async function verifyPriorCanonicalRuntime({ transport, profile, prior, appProfile }) {
  const intent = assertDev117ReleaseIntent(prior.capsule, appProfile), paths = releasePaths(appProfile, intent, prior.capsuleRef.sha256)
  const canonical = await transport.readBytes(paths.canonical, { prefixes: ['receipts'] }), value = JSON.parse(canonical.bytes)
  if (value.stage !== 'canonical' || value.sourceRevision !== prior.descriptor.sourceRevision || value.facts?.origin !== profile.canonicalOrigin
    || canonicalize(prior.activation.previousRefs[2]) !== canonicalize(canonical.ref)) fail('OPENSWX_PRIOR_CANONICAL_INVALID')
  const service = await transport.getService(appProfile); transport.assertServiceSettled(service); transport.assertCanonicalEntrypoint(appProfile, service)
  if (transport.effectiveRevision(service) !== value.facts.candidateRevision) fail('OPENSWX_PRIOR_CANONICAL_INVALID')
  const revision = await transport.getRevision(appProfile, value.facts.candidateRevision)
  const runtime = (await transport.readJson(intent.runtimeConfigRef, BUCKET, ['receipts'])).value.runtimeConfig
  const env = revision.containers?.find(row => row.name === appProfile.runtime.containerName)?.env
  if (runtime?.openswxWorker?.descriptorRef?.sha256 !== prior.descriptorRef.sha256 || runtime.plainEnvironment?.PDM_OPENSWX_DISPATCH_ENABLED !== '1'
    || runtime.secretVersions?.PDM_WORKLOAD_AUTH_CREDENTIALS !== prior.descriptor.registrySecretVersion.split('/').at(-1)
    || !env?.some(row => row.name === 'PDM_OPENSWX_DISPATCH_ENABLED' && row.value === '1')
    || !env.some(row => row.name === 'PDM_WORKLOAD_AUTH_CREDENTIALS' && row.valueSource?.secretKeyRef?.secret === profile.registrySecretId && String(row.valueSource.secretKeyRef.version) === prior.descriptor.registrySecretVersion.split('/').at(-1))) fail('OPENSWX_PRIOR_RUNTIME_INVALID')
  await verifyExistingReaderCredentials(transport, profile, prior.descriptor)
  return { canonicalRef: canonical.ref, priorRevision: value.facts.candidateRevision }
}
async function verifyPriorLive({ transport, profile, prior, appProfile }) {
  const proof = await verifyPriorCanonicalRuntime({ transport, profile, prior, appProfile })
  assertWorkerJob(await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`), prior.template)
  return proof
}
async function readSuccessfulDailyBootstrapContinuation({ transport, continuation, prior, profile, readSource, priorActivationRef, verificationSourceRevision }) {
  if (!continuation || Object.keys(continuation).sort().join(',') !== 'bootstrapInputRef,bootstrapRef,priorRecoveryRef') fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  for (const ref of Object.values(continuation)) assertOpenSwxWorkerRef(ref)
  const oldInput = (await transport.readJson(continuation.bootstrapInputRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const keys = ['schemaVersion', 'descriptorRef', 'workerBuildRef', 'deadlineAt', 'receiptId', 'bootstrapKind', 'priorActivationRef', 'pausedDrainedRef', ...(oldInput?.prebuildIamContinuationRef ? ['prebuildIamContinuationRef'] : [])]
  if (!oldInput || Object.keys(oldInput).sort().join(',') !== keys.sort().join(',') || oldInput.schemaVersion !== 'aipdm.openswx-bootstrap-input.v1'
    || oldInput.bootstrapKind !== 'DAILY_REFRESH' || !/^[A-Za-z0-9-]{6,100}$/u.test(oldInput.receiptId ?? '') || !Number.isFinite(Date.parse(oldInput.deadlineAt))
    || canonicalize(oldInput.priorActivationRef) !== canonicalize(priorActivationRef)) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const oldUri = `${profile.receiptRoot}/${oldInput.receiptId}.json`
  if (continuation.bootstrapRef.uri !== oldUri || continuation.priorRecoveryRef.uri !== `${oldUri.slice(0, -5)}-prior-recovery.json`) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const raw = (await transport.readJson(oldInput.descriptorRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const old = await readWorkerDescriptor({ transport, ref: oldInput.descriptorRef, profileBytes: readSource(WORKER_PROFILE_PATH, raw.sourceRevision), sourceRevision: raw.sourceRevision })
  if (old.value.purpose !== 'build_only' || canonicalize(old.profile) !== canonicalize(profile)) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const artifact = await resolveWorkerArtifact({ transport, descriptor: old.value, profile, readSource, buildRef: oldInput.workerBuildRef })
  const build = artifact.originBuild
  const bootstrap = (await transport.readJson(continuation.bootstrapRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  assertWorkerReceipt(bootstrap, old.value, 'bootstrap', { actor: profile.normalActor, image: build.image })
  const facts = bootstrap.facts, selftest = workerTemplate(profile, build.image, null, 'selftest')
  if (facts.bootstrapKind !== 'DAILY_REFRESH' || canonicalize(facts.priorActivationRef) !== canonicalize(priorActivationRef)
    || canonicalize(facts.pausedDrainedRef) !== canonicalize(oldInput.pausedDrainedRef)
    || facts.tokenSecretVersion !== prior.descriptor.tokenSecretVersion || facts.registrySecretVersion !== prior.descriptor.registrySecretVersion
    || facts.priorRegistryVersion !== prior.descriptor.registrySecretVersion || facts.resourceProvenance?.resourcesUnchanged !== true
    || canonicalize(facts.resourceProvenance.priorResourceApplyRef) !== canonicalize(prior.bootstrap.facts.resourceApplyRef ?? prior.bootstrap.facts.resourceProvenance?.priorResourceApplyRef)
    || bootstrap.templateSha256 !== sha256(canonicalize(selftest)) || facts.selftestTemplateSha256 !== bootstrap.templateSha256
    || facts.normalTemplateSha256 !== sha256(canonicalize(workerTemplate(profile, build.image, prior.descriptor.tokenSecretVersion)))) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const paused = (await transport.readJson(oldInput.pausedDrainedRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  assertWorkerReceipt(paused, old.value, 'paused-drained')
  await assertPausedDrainReceipt(transport, paused, { ...old.value, workerBuildRef: oldInput.workerBuildRef }, profile, readSource)
  if (canonicalize(paused.facts.priorActivationRef) !== canonicalize(priorActivationRef)) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const captured = (await transport.readJson(continuation.priorRecoveryRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  if (!captured || Object.keys(captured).sort().join(',') !== 'observedAt,priorActivationRef,priorCapsuleRef,priorTemplate,schemaVersion,targetDescriptorRef'
    || captured.schemaVersion !== 'aipdm.openswx-prior-recovery.v1' || canonicalize(captured.priorActivationRef) !== canonicalize(priorActivationRef)
    || canonicalize(captured.priorCapsuleRef) !== canonicalize(prior.capsuleRef) || canonicalize(captured.priorTemplate) !== canonicalize(prior.template)
    || canonicalize(captured.targetDescriptorRef) !== canonicalize(old.ref)) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const preflight = await transport.readJson(facts.cloudPreflightRef, BUCKET, [WORKER_RECEIPT_PREFIX])
  assertWorkerReceipt(preflight.value, old.value, 'cloud-preflight', { actor: profile.normalActor, image: build.image })
  if (preflight.ref.uri !== `${oldUri.slice(0, -5)}-preflight.json` || preflight.value.templateSha256 !== bootstrap.templateSha256
    || canonicalize(bootstrap.previousRefs) !== canonicalize([continuation.bootstrapInputRef, old.ref, oldInput.workerBuildRef, preflight.ref])
    || preflight.value.previousRefs?.length !== 1 || preflight.value.facts.isolationVerified !== true || preflight.value.facts.noCad !== true
    || preflight.value.facts.normalTemplateSha256 !== facts.normalTemplateSha256 || preflight.value.facts.selftestTemplateSha256 !== facts.selftestTemplateSha256) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const finite = await transport.readJson(preflight.value.previousRefs[0], BUCKET, [WORKER_RECEIPT_PREFIX])
  assertWorkerReceipt(finite.value, old.value, 'finite-terminal', { actor: profile.normalActor, image: build.image })
  const execution = assertTerminalExecution(finite.value.facts.execution, finite.value.facts.executionName, { success: true }), proof = preflight.value.facts.proof
  assertOpenSwxWorkerRef(finite.value.facts.requestRef)
  if (finite.value.facts.requestRef.uri !== `${oldUri.slice(0, -5)}-selftest-request.json`
    || canonicalize(finite.value.previousRefs) !== canonicalize([finite.value.facts.requestRef])) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const request = (await transport.readJson(finite.value.facts.requestRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const requestKeys = ['schemaVersion', 'ownerApplicationId', 'sourceRevision', 'sourceArchiveSha256', 'jobName', 'actor', 'templateSha256', 'requestStartedAt', 'requestWindowEndsAt', 'baselineExecutionNames']
  const startedAt = Date.parse(request?.requestStartedAt), windowEnd = Date.parse(request?.requestWindowEndsAt)
  if (!request || Object.keys(request).sort().join(',') !== requestKeys.sort().join(',') || request.schemaVersion !== 'aipdm.openswx-finite-request.v1'
    || request.ownerApplicationId !== 'ai-pdm' || request.sourceRevision !== old.value.sourceRevision || request.sourceArchiveSha256 !== old.value.sourceArchiveSha256
    || request.jobName !== workerJobName() || request.actor !== profile.normalActor || request.templateSha256 !== bootstrap.templateSha256
    || !Number.isFinite(startedAt) || !Number.isFinite(windowEnd) || windowEnd < startedAt || windowEnd - startedAt > 30_000
    || startedAt < Date.parse(captured.observedAt) || windowEnd > Date.parse(oldInput.deadlineAt)
    || Date.parse(execution.createTime) < startedAt || Date.parse(execution.createTime) > windowEnd
    || !Array.isArray(request.baselineExecutionNames) || new Set(request.baselineExecutionNames).size !== request.baselineExecutionNames.length
    || request.baselineExecutionNames.map(canonicalWorkerExecution).includes(canonicalWorkerExecution(execution.name))) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  if (finite.ref.uri !== `${oldUri.slice(0, -5)}-selftest.json` || finite.value.templateSha256 !== bootstrap.templateSha256 || finite.value.facts.terminalExitZero !== true
    || canonicalize(normalizeWorkerTemplate(execution.template)) !== canonicalize(selftest.template)
    || proof?.claimProof !== 'ISOLATION_ONLY_NO_CAD' || proof.executionName !== canonicalWorkerExecution(execution.name)
    || Object.keys(proof.marker?.marker ?? {}).sort().join(',') !== 'executionName,schemaVersion,state'
    || proof.marker.marker.schemaVersion !== MARKER || proof.marker.marker.state !== 'isolation_verified' || proof.marker.marker.executionName !== null
    || proof.markerSha256 !== sha256(canonicalize(proof.marker))) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const clocks = [paused.facts.quiescenceCompletedAt, captured.observedAt, execution.createTime, proof.marker.timestamp, execution.completionTime, preflight.value.observedAt, bootstrap.observedAt, oldInput.deadlineAt].map(Date.parse)
  if (clocks.some(value => !Number.isFinite(value)) || clocks.some((value, index) => index && value < clocks[index - 1])) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const actual = await transport.request(`https://run.googleapis.com/v2/${canonicalWorkerExecution(execution.name)}`)
  assertTerminalExecution(actual, execution.name, { success: true })
  if (actual.createTime !== execution.createTime || actual.completionTime !== execution.completionTime
    || canonicalize(normalizeWorkerTemplate(actual.template)) !== canonicalize(selftest.template)) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
  const iam = await readBootstrapSupplementalIam(transport, bootstrap, old.value, profile, readSource, verificationSourceRevision)
  if (oldInput.prebuildIamContinuationRef && canonicalize(oldInput.prebuildIamContinuationRef) !== canonicalize(iam?.prebuildIamContinuationRef)) fail('OPENSWX_IAM_AUTHORITY_CHAIN_INVALID')
  return { selftest }
}

async function restoreSuccessfulBootstrapContinuation({ transport, input, inputRef, descriptor, buildRef, prior, profile, appProfile, actor, readSource, uri }) {
  const continuation = input.bootstrapContinuation
  const { selftest } = await readSuccessfulDailyBootstrapContinuation({ transport, continuation, prior, profile, readSource, priorActivationRef: input.priorActivationRef, verificationSourceRevision: descriptor.value.sourceRevision })
  await verifyPriorCanonicalRuntime({ transport, profile, prior, appProfile })
  assertPausedScheduler(await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), profile)
  await assertNoActiveExecutions(transport)
  const job = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`), current = normalizeWorkerTemplate(job.template)
  if (![canonicalize(selftest), canonicalize(prior.template)].includes(canonicalize(current))) fail('OPENSWX_CONTINUATION_TEMPLATE_UNKNOWN')
  assertWorkerJob(job, current)
  if (typeof job.etag !== 'string' || !job.etag) fail('OPENSWX_JOB_UPDATE_NOT_READY')
  const requestUri = `${uri.slice(0, -5)}-continuation-request.json`, restoredUri = `${uri.slice(0, -5)}-continuation-restored.json`
  const binding = { ownerApplicationId: 'ai-pdm', sourceRevision: descriptor.value.sourceRevision, sourceArchiveSha256: descriptor.value.sourceArchiveSha256,
    descriptorRef: descriptor.ref, workerBuildRef: buildRef, inputRef, bootstrapContinuation: continuation, actor: actor.email, jobName: workerJobName(),
    priorActivationRef: input.priorActivationRef, priorCapsuleRef: prior.capsuleRef, restoreTemplateSha256: sha256(canonicalize(prior.template)) }
  let request = await optional(transport, requestUri), restored = await optional(transport, restoredUri)
  if (request) {
    const { schemaVersion, beforeTemplateSha256, beforeEtag, requestedAt, ...saved } = request.value
    if (schemaVersion !== 'aipdm.openswx-daily-continuation-request.v1' || canonicalize(saved) !== canonicalize(binding)
      || ![sha256(canonicalize(selftest)), binding.restoreTemplateSha256].includes(beforeTemplateSha256)
      || typeof beforeEtag !== 'string' || !beforeEtag || !Number.isFinite(Date.parse(requestedAt)) || Date.parse(requestedAt) > Date.parse(input.deadlineAt)) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
    // A committed request may represent a lost PATCH response. Only exact
    // normal readback proves restoration; never blindly PATCH it a second time.
    assertWorkerJob(job, prior.template)
  } else {
    if (restored) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
    request = await write(transport, requestUri, { schemaVersion: 'aipdm.openswx-daily-continuation-request.v1', ...binding,
      beforeTemplateSha256: sha256(canonicalize(current)), beforeEtag: job.etag, requestedAt: transport.now() })
    await updateWorkerJob({ transport, profile, template: prior.template, expectedCurrentTemplate: selftest, deadlineAt: input.deadlineAt })
  }
  const after = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
  assertWorkerJob(after, prior.template)
  await verifyPriorLive({ transport, profile, prior, appProfile })
  assertPausedScheduler(await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), profile)
  await assertNoActiveExecutions(transport)
  if (restored) {
    const { schemaVersion, requestRef, observedAt, providerJob, ...saved } = restored.value
    if (schemaVersion !== 'aipdm.openswx-daily-continuation-restored.v1' || canonicalize(saved) !== canonicalize(binding)
      || canonicalize(requestRef) !== canonicalize(request.ref) || !Number.isFinite(Date.parse(observedAt))) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
    assertWorkerJob(providerJob, prior.template)
  } else restored = await write(transport, restoredUri, { schemaVersion: 'aipdm.openswx-daily-continuation-restored.v1', ...binding,
    requestRef: request.ref, observedAt: transport.now(), providerJob: after })
  return { ...continuation, requestRef: request.ref, restoredRef: restored.ref }
}

async function dailySupplementalIam({ transport, profile, prior, descriptor, readSource, prebuildIamContinuationRef }) {
  const authority = await readBootstrapSupplementalIam(transport, prior.bootstrap, prior.bootstrapDescriptor ?? prior.descriptor, profile, readSource, descriptor.sourceRevision)
  if (prebuildIamContinuationRef) {
    assertOpenSwxWorkerRef(prebuildIamContinuationRef)
    if (!authority || (authority.prebuildIamContinuationRef && canonicalize(authority.prebuildIamContinuationRef) !== canonicalize(prebuildIamContinuationRef))) fail('OPENSWX_IAM_AUTHORITY_CHAIN_INVALID')
    return { ...authority, prebuildIamContinuationRef, verificationSourceRevision: descriptor.sourceRevision, readSource }
  }
  return authority ? { ...authority, readSource } : null
}
async function dailyResourceProvenance({ transport, profile, prior, descriptor, descriptorRef, build, readSource, uri, prebuildIamContinuationRef }) {
  const priorResourceApplyRef = prior.bootstrap.facts.resourceApplyRef ?? prior.bootstrap.facts.resourceProvenance?.priorResourceApplyRef
  assertOpenSwxWorkerRef(priorResourceApplyRef)
  const applied = (await transport.readJson(priorResourceApplyRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  if (applied.schemaVersion !== 'aipdm.openswx-resource-apply.v1' || applied.status !== 'APPLIED' || applied.actor !== profile.normalActor || applied.evidenceScope !== 'PRODUCTION_PROVIDER') fail('OPENSWX_RESOURCE_APPLY_REQUIRED')
  const oldPlan = (await transport.readJson(applied.approvedPlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const artifact = descriptor.artifactMode === 'REUSE_VERIFIED' ? await resolveWorkerArtifact({ transport, descriptor, profile, readSource }) : null
  const nextPlan = artifact ? (await transport.readJson(artifact.currentAssociation.resourceAssociation.infraManifestRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
    : (await transport.readJson(descriptor.resourcePlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const sourceHashes = OPENSWX_TERRAFORM_PATHS.map(path => ({ path, sha256: sha256(readSource(path, descriptor.sourceRevision)) }))
  const next = { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, sourceHashes, resourceAddresses: OPENSWX_TERRAFORM_ADDRESSES, allowedActions: ['create', 'no-op'] }
  const { sourceHashes: oldHashes, ...oldResources } = oldPlan.plan ?? {}, { sourceHashes: newHashes, ...newResources } = next
  if (!oldHashes?.length || !newHashes.length || oldPlan.resourcePlanHash !== applied.resourcePlanHash || nextPlan.resourcePlanHash !== descriptor.resourcePlanHash
    || descriptor.resourcePlanHash !== sha256(canonicalize(next)) || canonicalize(nextPlan.plan) !== canonicalize(next)
    || canonicalize(oldResources) !== canonicalize(newResources)) fail('OPENSWX_DAILY_RESOURCE_DELTA')
  // Fixed code/permission sources must also be unchanged, not merely address counts.
  for (const entry of sourceHashes.filter(row => row.path.endsWith('.tf'))) if (oldHashes.find(row => row.path === entry.path)?.sha256 !== entry.sha256) fail('OPENSWX_DAILY_RESOURCE_DELTA')
  const supplementalIam = await dailySupplementalIam({ transport, profile, prior, descriptor, readSource, prebuildIamContinuationRef })
  const readback = await readWorkerResources(transport, profile, prior.build.image, prior.template, supplementalIam)
  const continuation = supplementalIam?.prebuildIamContinuationRef ? { prebuildIamContinuationRef: supplementalIam.prebuildIamContinuationRef } : {}
  const saved = await write(transport, `${uri.slice(0, -5)}-resource-readback.json`, { schemaVersion: 'aipdm.openswx-resource-readback.v1', observedAt: transport.now(), targetDescriptorRef: descriptorRef, targetWorkerBuildRef: build.ref, priorResourceApplyRef, resourcesUnchanged: true, readback, payloadStored: false, ...(supplementalIam ? { supplementalIamReadbackRef: supplementalIam.ref, ...continuation } : {}) })
  return { priorResourceApplyRef, resourceReadbackRef: saved.ref, resourceReadbackSha256: saved.ref.sha256, resourcesUnchanged: true, ...(supplementalIam ? { supplementalIamReadbackRef: supplementalIam.ref, supplementalIamSourceRevision: supplementalIam.sourceRevision, ...continuation } : {}) }
}
export async function executeOpenSwxBootstrap({ stage, inputRef, transport, readSource, appProfile, root, oauthToken, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  return runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
  assertOpenSwxWorkerRef(inputRef)
  const input = (await transport.readJson(inputRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  const base = ['schemaVersion', 'descriptorRef', 'workerBuildRef', 'deadlineAt', 'receiptId']
  const allowed = stage === 'activate' ? ['schemaVersion', 'releaseCapsuleRef', 'deadlineAt', 'receiptId'] : stage === 'resources' ? [...base, ...(input?.priorResourceRequestRef ? ['priorResourceRequestRef', 'priorWorkerBuildRef', ...(input?.priorBootstrapInputRef ? ['priorBootstrapInputRef'] : []), ...(input?.completedFirstBootstrapInputRef ? ['completedFirstBootstrapInputRef', 'completedFirstPauseInputRef', 'supplementalIamReadbackRef'] : [])] : [])]
    : stage === 'pause' ? [...base, 'drainKind', ...(input?.drainKind === 'DAILY_DB_VERIFIED' ? ['priorActivationRef', ...(input.bootstrapContinuation ? ['bootstrapContinuation'] : [])] : ['resourceApplyRef'])]
      : [...base, 'bootstrapKind', ...(input?.bootstrapKind === 'DAILY_REFRESH' ? ['priorActivationRef', 'pausedDrainedRef', ...(input.prebuildIamContinuationRef ? ['prebuildIamContinuationRef'] : [])] : ['resourceApplyRef', 'currentRegistryVersion'])]
  if (!input || (input.priorBootstrapInputRef && input.completedFirstBootstrapInputRef) || Object.keys(input).sort().join(',') !== allowed.sort().join(',') || input.schemaVersion !== `aipdm.openswx-${stage}-input.v1` || !/^[A-Za-z0-9-]{6,100}$/u.test(input.receiptId ?? '')
    || Date.parse(input.deadlineAt) > Date.now() + 600_000) fail('OPENSWX_BOOTSTRAP_INPUT_INVALID')
  checkDeadline(input.deadlineAt)
  transport = boundOpenSwxTransport(transport, input.deadlineAt)
  let intent = null, descriptor
  if (stage === 'activate') {
    const capsule = await transport.readJson(input.releaseCapsuleRef, BUCKET, ['receipts'])
    intent = assertDev117ReleaseIntent(capsule.value, appProfile)
    descriptor = await readWorkerDescriptor({ transport, ref: intent.openswxWorkerRef, profileBytes: readSource(WORKER_PROFILE_PATH, intent.sourceRevision), sourceRevision: intent.sourceRevision })
  } else {
    const raw = (await transport.readJson(input.descriptorRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
    descriptor = await readWorkerDescriptor({ transport, ref: input.descriptorRef, profileBytes: readSource(WORKER_PROFILE_PATH, raw.sourceRevision), sourceRevision: raw.sourceRevision })
  }
  const profile = descriptor.profile, actor = await verifyNormalActor(transport, profile)
  const uri = `${profile.receiptRoot}/${input.receiptId}.json`
  if (stage === 'activate') return activateWorker({ transport, profile, descriptor: descriptor.value, descriptorRef: descriptor.ref, intent, capsuleRef: input.releaseCapsuleRef, uri, deadlineAt: input.deadlineAt, actor, appProfile, readSource })
  if (descriptor.value.artifactMode === 'REUSE_VERIFIED' && (stage === 'resources' || input.bootstrapKind === 'FIRST_CREATE' || input.drainKind === 'FIRST_PROVIDER_ONLY')) fail('OPENSWX_REUSE_DAILY_ONLY')
  const artifact = await resolveWorkerArtifact({ transport, descriptor: descriptor.value, profile, readSource, buildRef: input.workerBuildRef })
  const build = artifact.originBuild, buildRow = { ref: input.workerBuildRef, value: build }
  if (stage === 'resources') return executeOpenSwxResources({ transport, profile, descriptor: descriptor.value, descriptorRef: descriptor.ref, build, root, readSource, oauthToken, uri, deadlineAt: input.deadlineAt, actor, firstReconciliation: input.priorResourceRequestRef ? { priorResourceRequestRef: input.priorResourceRequestRef, priorWorkerBuildRef: input.priorWorkerBuildRef, ...(input.priorBootstrapInputRef ? { priorBootstrapInputRef: input.priorBootstrapInputRef } : {}), ...(input.completedFirstBootstrapInputRef ? { completedFirstBootstrapInputRef: input.completedFirstBootstrapInputRef, completedFirstPauseInputRef: input.completedFirstPauseInputRef, supplementalIamReadbackRef: input.supplementalIamReadbackRef } : {}) } : null })
  let partialFirstBootstrap = null, completedFirstBootstrap = null, supplementalIam = null
  const daily = input.drainKind === 'DAILY_DB_VERIFIED' || input.bootstrapKind === 'DAILY_REFRESH'
  const prior = daily ? await readPriorWorkerActivation(transport, input.priorActivationRef, profile, readSource) : null
  if (daily && artifact.currentAssociation && canonicalize(input.priorActivationRef) !== canonicalize(artifact.currentAssociation.priorActivationRef)) fail('OPENSWX_REUSE_PRIOR_ACTIVATION_JOIN_INVALID')
  if (!daily) {
    const applied = (await transport.readJson(input.resourceApplyRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
    if (applied?.schemaVersion !== 'aipdm.openswx-resource-apply.v1' || applied.actor !== profile.normalActor || applied.resourcePlanHash !== descriptor.value.resourcePlanHash || applied.sourceRevision !== descriptor.value.sourceRevision || applied.status !== 'APPLIED' || applied.evidenceScope !== 'PRODUCTION_PROVIDER') fail('OPENSWX_RESOURCE_APPLY_REQUIRED')
    if (stage === 'bootstrap' && applied.completedFirstBootstrap) {
      const plan = (await transport.readJson(descriptor.value.resourcePlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
      const basis = await firstResourceBasis({ transport, profile, descriptor: descriptor.value, plan, build, ...applied.firstSourceReconciliation })
      const proof = await readCompletedFirstProof({ transport, profile, descriptor: descriptor.value, plan, build, basis, ...applied.completedFirstBootstrap, readSource })
      if (input.bootstrapKind !== 'FIRST_CREATE' || descriptor.value.purpose !== 'build_only' || applied.ownerApplicationId !== 'ai-pdm'
        || canonicalize(applied.descriptorRef) !== canonicalize(descriptor.ref) || canonicalize(applied.approvedPlanRef) !== canonicalize(descriptor.value.resourcePlanRef)
        || canonicalize(applied.requestRef) !== canonicalize(basis.priorResourceRequestRef) || canonicalize(applied.binaryPlanReceiptRef) !== canonicalize(basis.priorBinaryPlanReceiptRef)
        || canonicalize(applied.firstSourceReconciliation) !== canonicalize(basis) || applied.mutation !== 'READBACK_ONLY_COMPLETED_FIRST_SOURCE_RECONCILIATION'
        || canonicalize(applied.completedFirstBootstrap) !== canonicalize(proof.completed) || canonicalize(applied.supplementalIamReadbackRef) !== canonicalize(proof.completed.supplementalIamReadbackRef)
        || input.currentRegistryVersion !== proof.partial.priorRegistryVersion) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
      completedFirstBootstrap = proof.completed; partialFirstBootstrap = proof.partial
      supplementalIam = { ref: proof.completed.supplementalIamReadbackRef, sourceRevision: descriptor.value.sourceRevision, readSource }
      for (const suffix of ['-token-version-request.json', '-token-version.json', '-registry-version-request.json', '-registry-version.json']) if (await optional(transport, uri.slice(0, -5) + suffix)) fail('OPENSWX_COMPLETED_FIRST_NEW_ISSUANCE')
      const existing = await optional(transport, uri)
      if (existing) {
        assertWorkerReceipt(existing.value, descriptor.value, 'bootstrap', { actor: actor.email, image: build.image })
        const facts = existing.value.facts, selftest = workerTemplate(profile, build.image, null, 'selftest')
        if (existing.value.templateSha256 !== sha256(canonicalize(selftest)) || facts.bootstrapKind !== 'FIRST_CREATE' || canonicalize(facts.completedFirstBootstrap) !== canonicalize(proof.completed)
          || canonicalize(facts.resourceApplyRef) !== canonicalize(input.resourceApplyRef) || facts.tokenSecretVersion !== proof.completed.tokenSecretVersion
          || facts.registrySecretVersion !== proof.completed.registrySecretVersion || facts.priorRegistryVersion !== proof.partial.priorRegistryVersion
          || facts.selftestTemplateSha256 !== sha256(canonicalize(workerTemplate(profile, build.image, null, 'selftest')))
          || facts.normalTemplateSha256 !== sha256(canonicalize(workerTemplate(profile, build.image, facts.tokenSecretVersion)))) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
        const preflight = await transport.readJson(facts.cloudPreflightRef, BUCKET, [WORKER_RECEIPT_PREFIX])
        assertWorkerReceipt(preflight.value, descriptor.value, 'cloud-preflight', { actor: actor.email, image: build.image })
        if (facts.cloudPreflightRef.uri !== uri.slice(0, -5) + '-preflight.json'
          || preflight.value.templateSha256 !== facts.selftestTemplateSha256 || preflight.value.facts.selftestTemplateSha256 !== facts.selftestTemplateSha256
          || preflight.value.facts.normalTemplateSha256 !== facts.normalTemplateSha256
          || canonicalize(existing.value.previousRefs) !== canonicalize([inputRef, descriptor.ref, input.workerBuildRef, preflight.ref])
          || preflight.value.facts.isolationVerified !== true || preflight.value.facts.noCad !== true || preflight.value.previousRefs?.length !== 1) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
        const finite = await transport.readJson(preflight.value.previousRefs[0], BUCKET, [WORKER_RECEIPT_PREFIX])
        assertWorkerReceipt(finite.value, descriptor.value, 'finite-terminal', { actor: actor.email, image: build.image })
        const rawExecution = finite.value.facts.execution, storedProof = preflight.value.facts.proof
        if ([rawExecution?.createTime, rawExecution?.completionTime, storedProof?.marker?.timestamp].some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) fail('OPENSWX_COMPLETED_FIRST_EXECUTION_INVALID')
        const execution = assertTerminalExecution(rawExecution, finite.value.facts.executionName, { success: true })
        if (finite.ref.uri !== uri.slice(0, -5) + '-selftest.json' || finite.value.templateSha256 !== facts.selftestTemplateSha256 || finite.value.facts.terminalExitZero !== true
          || canonicalize(normalizeWorkerTemplate(execution.template)) !== canonicalize(selftest.template)
          || storedProof?.claimProof !== 'ISOLATION_ONLY_NO_CAD' || storedProof.executionName !== canonicalWorkerExecution(execution.name)
          || storedProof.marker?.marker?.schemaVersion !== MARKER || storedProof.marker.marker.state !== 'isolation_verified' || storedProof.marker.marker.executionName !== null
          || storedProof.markerSha256 !== sha256(canonicalize(storedProof.marker))
          || Date.parse(storedProof.marker.timestamp) < Date.parse(execution.createTime) || Date.parse(storedProof.marker.timestamp) > Date.parse(execution.completionTime)) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
        await verifyExistingReaderCredentials(transport, profile, facts)
        await assertCompletedFirstProvider({ transport, profile, descriptor: descriptor.value, proof, readSource, image: build.image, extraExecution: finite.value.facts.execution })
        return existing
      }
      const pending = await optional(transport, uri.slice(0, -5) + '-selftest-request.json')
      if (pending) {
        const finite = await runWorkerFinite({ transport, descriptor: descriptor.value, profile, template: workerTemplate(profile, build.image, null, 'selftest'), receiptUri: uri.slice(0, -5) + '-selftest.json', actor: actor.email, deadlineAt: input.deadlineAt })
        await assertCompletedFirstProvider({ transport, profile, descriptor: descriptor.value, proof, readSource, image: build.image, extraExecution: finite.value.facts.execution })
      } else {
        // A crash after a settled PATCH but before the finite-run latch must be
        // reconciled by exact template readback, never another blind PATCH.
        const current = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
        const currentImage = current.template?.template?.containers?.[0]?.image
        if (![proof.completed.priorImage, build.image].includes(currentImage)) fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
        await assertCompletedFirstProvider({ transport, profile, descriptor: descriptor.value, proof, readSource, image: currentImage })
      }
    }
    if (stage === 'bootstrap' && applied.firstSourceReconciliation && !applied.completedFirstBootstrap) {
      const plan = (await transport.readJson(descriptor.value.resourcePlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
      const basis = await firstResourceBasis({ transport, profile, descriptor: descriptor.value, plan, build, priorResourceRequestRef: applied.firstSourceReconciliation.priorResourceRequestRef, priorWorkerBuildRef: applied.firstSourceReconciliation.priorWorkerBuildRef })
      if (input.bootstrapKind !== 'FIRST_CREATE' || descriptor.value.purpose !== 'build_only' || applied.ownerApplicationId !== 'ai-pdm'
        || canonicalize(applied.descriptorRef) !== canonicalize(descriptor.ref) || canonicalize(applied.approvedPlanRef) !== canonicalize(descriptor.value.resourcePlanRef)
        || canonicalize(applied.requestRef) !== canonicalize(basis.priorResourceRequestRef) || canonicalize(applied.binaryPlanReceiptRef) !== canonicalize(basis.priorBinaryPlanReceiptRef)
        || applied.mutation !== 'READBACK_ONLY_FIRST_SOURCE_RECONCILIATION' || canonicalize(basis) !== canonicalize(applied.firstSourceReconciliation) || applied.readback?.image !== basis.priorImage) fail('OPENSWX_FIRST_RESOURCE_JOIN_INVALID')
      const existing = await optional(transport, uri)
      if (existing) {
        assertWorkerReceipt(existing.value, descriptor.value, 'bootstrap', { actor: actor.email, image: build.image })
        const facts = existing.value.facts, selftest = workerTemplate(profile, build.image, null, 'selftest')
        if (facts.bootstrapKind !== 'FIRST_CREATE' || canonicalize(facts.resourceApplyRef) !== canonicalize(input.resourceApplyRef) || canonicalize(facts.partialFirstBootstrap ?? null) !== canonicalize(applied.partialFirstBootstrap ?? null) || existing.value.templateSha256 !== sha256(canonicalize(selftest))
          || facts.selftestTemplateSha256 !== existing.value.templateSha256 || facts.normalTemplateSha256 !== sha256(canonicalize(workerTemplate(profile, build.image, facts.tokenSecretVersion)))) fail('OPENSWX_FIRST_RESOURCE_JOIN_INVALID')
        await verifyExistingReaderCredentials(transport, profile, facts)
        await readWorkerResources(transport, profile, build.image); await assertNoActiveExecutions(transport); return existing
      }
      if (applied.partialFirstBootstrap) {
        const recovery = await readPartialFirstBootstrap({ transport, profile, descriptor: descriptor.value, plan, build, basis, priorBootstrapInputRef: applied.partialFirstBootstrap.priorBootstrapInputRef, allowCredentialProgress: true, registryAuthority: { deadlineAt: input.deadlineAt } })
        if (canonicalize(recovery.partial) !== canonicalize(applied.partialFirstBootstrap) || input.currentRegistryVersion !== recovery.partial.priorRegistryVersion) fail('OPENSWX_PARTIAL_FIRST_JOIN_INVALID')
        partialFirstBootstrap = recovery.partial
      } else await assertFirstProviderUnissued(transport, profile, basis.priorImage)
    } else if (!completedFirstBootstrap) assertWorkerJob(await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`), workerTemplate(profile, build.image, null, 'selftest'))
  }
  const paused = await pauseWorkerScheduler({ transport, profile, deadlineAt: input.deadlineAt })
  await sleep(profile.bounds.recoverDeadlineSeconds * 1000); checkDeadline(input.deadlineAt)
  await assertNoActiveExecutions(transport)
  if (stage === 'pause') {
    let current = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
    let proof = null, bootstrapContinuation = null, existingPause = null
    if (input.bootstrapContinuation) {
      bootstrapContinuation = await restoreSuccessfulBootstrapContinuation({ transport, input, inputRef, descriptor, buildRef: input.workerBuildRef, prior, profile, appProfile, actor, readSource, uri })
      current = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
      existingPause = await optional(transport, uri)
      if (existingPause) {
        assertWorkerReceipt(existingPause.value, descriptor.value, 'paused-drained', { actor: actor.email, image: prior.build.image })
        await assertPausedDrainReceipt(transport, existingPause.value, { ...descriptor.value, workerBuildRef: input.workerBuildRef }, profile, readSource)
        if (canonicalize(existingPause.value.previousRefs) !== canonicalize([inputRef, input.workerBuildRef])
          || canonicalize(existingPause.value.facts.bootstrapContinuation) !== canonicalize(bootstrapContinuation)
          || canonicalize(existingPause.value.facts.priorActivationRef) !== canonicalize(input.priorActivationRef)
          || existingPause.value.facts.drainExecutionRef.uri !== `${uri.slice(0, -5)}-drain-finite.json`) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
      }
    }
    if (input.drainKind === 'FIRST_PROVIDER_ONLY') assertWorkerJob(current, workerTemplate(profile, build.image, null, 'selftest'))
    else if (input.drainKind === 'DAILY_DB_VERIFIED') {
      await verifyPriorLive({ transport, profile, prior, appProfile })
      const terminal = await runWorkerFinite({ transport, descriptor: prior.descriptor, profile, template: prior.template, receiptUri: `${uri.slice(0, -5)}-drain-finite.json`, actor: actor.email, deadlineAt: input.deadlineAt })
      proof = await readWorkerStdoutProof({ transport, profile, execution: terminal.value.facts.execution, deadlineAt: input.deadlineAt })
      assertFreshProof(terminal.value.facts.execution, profile)
      proof.drainExecutionRef = terminal.ref
    } else fail('OPENSWX_DRAIN_KIND_INVALID')
    await assertNoActiveExecutions(transport)
    if (existingPause) {
      if (existingPause.value.facts.dbAdmissionProof.markerSha256 !== proof.markerSha256) fail('OPENSWX_CONTINUATION_JOIN_INVALID')
      return existingPause
    }
    return write(transport, uri, workerReceipt({ descriptor: descriptor.value, kind: 'paused-drained', actor: actor.email, image: prior ? prior.build.image : build.image, template: normalizeWorkerTemplate(current.template), observedAt: transport.now(), previousRefs: [inputRef, input.workerBuildRef], facts: { ...paused, providerJob: current, schedulerPaused: true, noActiveOrUnknown: true, quiescenceCompletedAt: transport.now(), drainKind: input.drainKind, dbAdmissionProof: proof ?? 'NOT_APPLICABLE_FIRST_BOOTSTRAP', ...(bootstrapContinuation ? { bootstrapContinuation } : {}), ...(prior ? { priorActivationRef: input.priorActivationRef, priorWorkerBuildRef: prior.descriptor.workerBuildRef, priorSourceRevision: prior.descriptor.sourceRevision, priorSourceArchiveSha256: prior.descriptor.sourceArchiveSha256, priorImage: prior.build.image, priorNormalTemplateSha256: sha256(canonicalize(prior.template)), drainExecutionRef: proof.drainExecutionRef, targetWorkerBuildRef: input.workerBuildRef } : {}) } }))
  }
  if (!['FIRST_CREATE', 'DAILY_REFRESH'].includes(input.bootstrapKind) || descriptor.value.purpose !== 'build_only') fail('OPENSWX_BOOTSTRAP_MODE_INVALID')
  const existing = await optional(transport, uri)
  if (existing) {
    assertWorkerReceipt(existing.value, descriptor.value, 'bootstrap', { actor: actor.email, image: build.image })
    if (daily) {
      const inherited = await dailySupplementalIam({ transport, profile, prior, descriptor: descriptor.value, readSource, prebuildIamContinuationRef: input.prebuildIamContinuationRef })
      const saved = await readBootstrapSupplementalIam(transport, existing.value, descriptor.value, profile, readSource)
      if (canonicalize(inherited?.prebuildIamContinuationRef ?? null) !== canonicalize(saved?.prebuildIamContinuationRef ?? null)
        || canonicalize(inherited?.ref ?? null) !== canonicalize(saved?.ref ?? null)) fail('OPENSWX_IAM_AUTHORITY_CHAIN_INVALID')
      if (saved) {
        if (existing.value.facts.bootstrapKind !== 'DAILY_REFRESH' || canonicalize(existing.value.facts.priorActivationRef) !== canonicalize(input.priorActivationRef)
          || canonicalize(existing.value.facts.pausedDrainedRef) !== canonicalize(input.pausedDrainedRef)
          || canonicalize(existing.value.previousRefs) !== canonicalize([inputRef, descriptor.ref, input.workerBuildRef, existing.value.facts.cloudPreflightRef])) fail('OPENSWX_IAM_AUTHORITY_CHAIN_INVALID')
        await readWorkerResources(transport, profile, build.image, workerTemplate(profile, build.image, null, 'selftest'), { ...saved, readSource })
      }
    }
    return existing
  }
  let tokenSecretVersion, newRegistryVersion, registryVersion, resourceProvenance = null
  if (daily) {
    const drained = (await transport.readJson(input.pausedDrainedRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
    assertWorkerReceipt(drained, descriptor.value, 'paused-drained')
    await assertPausedDrainReceipt(transport, drained, { ...descriptor.value, workerBuildRef: input.workerBuildRef }, profile, readSource)
    if (canonicalize(drained.facts.priorActivationRef) !== canonicalize(input.priorActivationRef)) fail('OPENSWX_DAILY_DRAIN_INVALID')
    await verifyPriorLive({ transport, profile, prior, appProfile })
    resourceProvenance = await dailyResourceProvenance({ transport, profile, prior, descriptor: descriptor.value, descriptorRef: descriptor.ref, build: buildRow, readSource, uri, prebuildIamContinuationRef: input.prebuildIamContinuationRef })
    if (resourceProvenance.supplementalIamReadbackRef) supplementalIam = { ref: resourceProvenance.supplementalIamReadbackRef, sourceRevision: resourceProvenance.supplementalIamSourceRevision, readSource,
      ...(resourceProvenance.prebuildIamContinuationRef ? { prebuildIamContinuationRef: resourceProvenance.prebuildIamContinuationRef, verificationSourceRevision: descriptor.value.sourceRevision } : {}) }
    tokenSecretVersion = prior.descriptor.tokenSecretVersion; newRegistryVersion = prior.descriptor.registrySecretVersion; registryVersion = newRegistryVersion
  } else if (completedFirstBootstrap) {
    tokenSecretVersion = completedFirstBootstrap.tokenSecretVersion; newRegistryVersion = completedFirstBootstrap.registrySecretVersion; registryVersion = partialFirstBootstrap.priorRegistryVersion
    await verifyExistingReaderCredentials(transport, profile, { tokenSecretVersion, registrySecretVersion: newRegistryVersion })
  } else {
    registryVersion = assertNumericSecret(input.currentRegistryVersion, profile.registrySecretId)
    const registryBytes = await readSecretBytes(transport, registryVersion, profile)
    const credentialRoot = partialFirstBootstrap?.credentialReceiptRoot ?? uri.slice(0, -5)
    const tokenUri = `${credentialRoot}-token-version.json`
    const recovered = await readIssuedCredential({ transport, profile, secretId: profile.tokenSecretId, uri: tokenUri, deadlineAt: input.deadlineAt })
    const token = recovered?.bytes.toString() ?? crypto.randomBytes(32).toString('base64url')
    const registry = appendReaderCredential(registryBytes, profile, token)
    tokenSecretVersion = await addCredentialVersion({ transport, profile, secretId: profile.tokenSecretId, bytes: Buffer.from(token), uri: tokenUri, deadlineAt: input.deadlineAt })
    newRegistryVersion = await addCredentialVersion({ transport, profile, secretId: profile.registrySecretId, bytes: registry, uri: `${credentialRoot}-registry-version.json`, deadlineAt: input.deadlineAt })
  }
  const selftest = workerTemplate(profile, build.image, null, 'selftest'), normal = workerTemplate(profile, build.image, tokenSecretVersion)
  if (prior) await write(transport, `${uri.slice(0, -5)}-prior-recovery.json`, { schemaVersion: 'aipdm.openswx-prior-recovery.v1', priorActivationRef: input.priorActivationRef, priorTemplate: prior.template, priorCapsuleRef: prior.capsuleRef, targetDescriptorRef: descriptor.ref, observedAt: transport.now() })
  try {
  await updateWorkerJob({ transport, profile, template: selftest, deadlineAt: input.deadlineAt })
  const finite = await runWorkerFinite({ transport, descriptor: descriptor.value, profile, template: selftest, receiptUri: `${uri.slice(0, -5)}-selftest.json`, actor: actor.email, deadlineAt: input.deadlineAt })
  const proof = await readWorkerStdoutProof({ transport, profile, execution: finite.value.facts.execution, expectedState: 'isolation_verified', deadlineAt: input.deadlineAt })
  const preflightUri = `${uri.slice(0, -5)}-preflight.json`
  let preflight = completedFirstBootstrap ? await optional(transport, preflightUri) : null
  if (preflight) {
    assertWorkerReceipt(preflight.value, descriptor.value, 'cloud-preflight', { actor: actor.email, image: build.image })
    const saved = preflight.value.facts
    if (preflight.value.templateSha256 !== sha256(canonicalize(selftest)) || canonicalize(preflight.value.previousRefs) !== canonicalize([finite.ref])
      || saved.isolationVerified !== true || saved.noCad !== true || saved.normalTemplateSha256 !== sha256(canonicalize(normal))
      || saved.selftestTemplateSha256 !== sha256(canonicalize(selftest)) || saved.proof?.executionName !== proof.executionName
      || saved.proof.markerSha256 !== proof.markerSha256 || canonicalize(saved.proof.marker) !== canonicalize(proof.marker)
      || saved.proof.claimProof !== 'ISOLATION_ONLY_NO_CAD') fail('OPENSWX_COMPLETED_FIRST_JOIN_INVALID')
  } else preflight = await write(transport, preflightUri, workerReceipt({ descriptor: descriptor.value, kind: 'cloud-preflight', actor: actor.email, image: build.image, template: selftest, observedAt: transport.now(), previousRefs: [finite.ref], facts: { isolationVerified: true, noCad: true, proof, normalTemplateSha256: sha256(canonicalize(normal)), selftestTemplateSha256: sha256(canonicalize(selftest)) } }))
  await assertNoActiveExecutions(transport)
  await readWorkerResources(transport, profile, build.image, selftest, supplementalIam)
  return write(transport, uri, workerReceipt({ descriptor: descriptor.value, kind: 'bootstrap', actor: actor.email, image: build.image, template: selftest, observedAt: transport.now(), previousRefs: [inputRef, descriptor.ref, input.workerBuildRef, preflight.ref], facts: { bootstrapKind: input.bootstrapKind, tokenSecretVersion, registrySecretVersion: newRegistryVersion, priorRegistryVersion: registryVersion, normalTemplateSha256: sha256(canonicalize(normal)), selftestTemplateSha256: sha256(canonicalize(selftest)), cloudPreflightRef: preflight.ref, ...(resourceProvenance ? { resourceProvenance, priorActivationRef: input.priorActivationRef, pausedDrainedRef: input.pausedDrainedRef } : { resourceApplyRef: input.resourceApplyRef, ...(completedFirstBootstrap ? { completedFirstBootstrap } : partialFirstBootstrap ? { partialFirstBootstrap } : {}) }) } }))
  } catch (error) {
    let priorJobRestored = false, priorEmptyProof = null
    if (prior) {
      try {
        checkDeadline(input.deadlineAt)
        assertPausedScheduler(await transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`), profile)
        await assertNoActiveExecutions(transport)
        const current = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}`)
        if (![canonicalize(selftest), canonicalize(prior.template)].includes(canonicalize(normalizeWorkerTemplate(current.template)))) fail('OPENSWX_RECOVERY_TEMPLATE_UNKNOWN')
        await updateWorkerJob({ transport, profile, template: prior.template, deadlineAt: input.deadlineAt }); priorJobRestored = true
        await verifyPriorLive({ transport, profile, prior, appProfile })
        const terminal = await runWorkerFinite({ transport, descriptor: prior.descriptor, profile, template: prior.template, receiptUri: `${uri.slice(0, -5)}-recovery-finite.json`, actor: actor.email, deadlineAt: input.deadlineAt })
        priorEmptyProof = await readWorkerStdoutProof({ transport, profile, execution: terminal.value.facts.execution, deadlineAt: input.deadlineAt })
        assertFreshProof(terminal.value.facts.execution, profile); await assertNoActiveExecutions(transport)
      } catch { /* Pending/unknown execution or authority cannot authorize restoration. */ }
    }
    await write(transport, `${uri.slice(0, -5)}-recovery-required.json`, { schemaVersion: 'aipdm.openswx-bootstrap-recovery.v1', targetDescriptorRef: descriptor.ref, sourceRevision: descriptor.value.sourceRevision, priorActivationRef: input.priorActivationRef ?? null, observedAt: transport.now(), status: 'RECOVERY_REQUIRED', schedulerState: 'PAUSED', durableQueue: 'RETAINED', priorJobRestored, priorEmptyProof, errorCode: error.code ?? 'OPENSWX_BOOTSTRAP_FAILED', schedulerEnabled: false })
    throw error
  }
  })
}
