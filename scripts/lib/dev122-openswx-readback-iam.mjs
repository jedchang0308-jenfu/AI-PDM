import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { assertImmutableRef, canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertOpenSwxWorkerRef, workerJobName, WORKER_RECEIPT_PREFIX, WORKER_PROFILE_PATH, writeWorkerJson, boundOpenSwxTransport, readWorkerDescriptor, assertWorkerReceipt, assertWorkerBuildSource } from './dev122-openswx-owner-release.mjs'

const PROJECT = 'jenfu-platform-prod'
const BUCKET = 'jenfu-platform-prod-aipdm-release'
const ROOT = 'infra/google-cloud/dev-122-openswx-release-readback'
const ROLE_ROOT = `projects/${PROJECT}/roles/`
const VERIFIER = `serviceAccount:aipdm-prod-verifier@${PROJECT}.iam.gserviceaccount.com`
const DEPLOYER = `serviceAccount:aipdm-prod-deployer@${PROJECT}.iam.gserviceaccount.com`
export const READBACK_JOB_ROLE = `${ROLE_ROOT}aipdmOpenswxVerifierJobReadback`
export const READBACK_SCHEDULER_ROLE = `${ROLE_ROOT}aipdmOpenswxSchedulerReadback`
export const READBACK_IAM_PATHS = Object.freeze(['main.tf', 'backend.tf', 'versions.tf', 'README.md'].map(name => `${ROOT}/${name}`))
export const READBACK_IAM_SPECS = Object.freeze({
  'google_project_iam_custom_role.verifier_job_readback': { project: PROJECT, role_id: 'aipdmOpenswxVerifierJobReadback', permissions: ['run.jobs.get', 'run.executions.list'] },
  'google_cloud_run_v2_job_iam_member.verifier_readback': { project: PROJECT, location: 'asia-east1', name: 'ai-pdm-prod-openswx-metadata', role: READBACK_JOB_ROLE, member: VERIFIER },
  'google_project_iam_custom_role.release_scheduler_readback': { project: PROJECT, role_id: 'aipdmOpenswxSchedulerReadback', permissions: ['cloudscheduler.jobs.get'] },
  'google_project_iam_member.verifier_scheduler_readback': { project: PROJECT, role: READBACK_SCHEDULER_ROLE, member: VERIFIER },
  'google_project_iam_member.deployer_scheduler_readback': { project: PROJECT, role: READBACK_SCHEDULER_ROLE, member: DEPLOYER },
})
export const READBACK_IAM_ADDRESSES = Object.freeze(Object.keys(READBACK_IAM_SPECS))
export const PREBUILD_IAM_ROLE = `${ROLE_ROOT}aipdmDev122PrebuildList`
export const PREBUILD_IAM_PERMISSIONS = Object.freeze(['cloudbuild.builds.list', 'serviceusage.services.use'])
export const PREBUILD_IAM_SOURCE_PATH = `${ROOT}/prebuild-list-readback.tf`
export const PREBUILD_IAM_HUMAN_APPROVAL_SHA256 = '6227c9b14d3af84d45b2dbedf17ceed76002a18ced61f4237725ed656eeb33b8'
export const PREBUILD_IAM_SPECS = Object.freeze({
  'google_project_iam_custom_role.prebuild_list_readback': { project: PROJECT, role_id: 'aipdmDev122PrebuildList', permissions: PREBUILD_IAM_PERMISSIONS },
  'google_project_iam_member.verifier_prebuild_list_readback': { project: PROJECT, role: PREBUILD_IAM_ROLE, member: VERIFIER },
})
export const PREBUILD_IAM_ADDRESSES = Object.freeze(Object.keys(PREBUILD_IAM_SPECS))
function fail(code) { throw Object.assign(Error(code), { code }) }
const same = (a, b) => canonicalize(a) === canonicalize(b)
const sorted = rows => [...rows].sort()
const INPUT_KEYS = ['approvedPlanRef', 'deadlineAt', 'descriptorRef', 'receiptId', 'schemaVersion', 'sourceRevision', 'workerBuildRef']
const containsUnknown = value => value === true || (Array.isArray(value) ? value.some(containsUnknown) : value && typeof value === 'object' ? Object.values(value).some(containsUnknown) : value != null && value !== false)
function deadline(value) { if (!Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.now()) fail('OPENSWX_IAM_DEADLINE') }

export function assertReadbackIamTerraformPlan(value) {
  if (!Array.isArray(value?.resource_changes) || value.resource_changes.length !== 5) fail('OPENSWX_IAM_PLAN_INVALID')
  const observed = new Set()
  for (const row of value.resource_changes) {
    const spec = READBACK_IAM_SPECS[row.address], after = row.change?.after, unknown = row.change?.after_unknown ?? {}
    if (!spec || observed.has(row.address) || row.mode !== 'managed' || row.provider_name !== 'registry.terraform.io/hashicorp/google'
      || !['create', 'no-op'].includes(row.change?.actions?.join(',')) || !after || row.change.importing
      || !unknown || typeof unknown !== 'object' || Array.isArray(unknown)
      || (after.condition != null && (!Array.isArray(after.condition) || after.condition.length !== 0)) || after.deleted === true || (after.stage && after.stage !== 'GA')) fail('OPENSWX_IAM_PLAN_INVALID')
    for (const [key, expected] of Object.entries(spec)) {
      // An applied Job IAM state uses the exact full resource name for the same Job.
      const equivalentJobName = row.address === 'google_cloud_run_v2_job_iam_member.verifier_readback' && key === 'name'
        && same(after[key], `projects/${spec.project}/locations/${spec.location}/jobs/${expected}`)
      if (containsUnknown(unknown[key]) || !(key === 'permissions' ? Array.isArray(after[key]) && same(sorted(after[key]), sorted(expected)) : same(after[key], expected) || equivalentJobName)) fail('OPENSWX_IAM_PLAN_INVALID')
    }
    // deleted/name/id are provider-computed outputs on create. Actual readback
    // still rejects a deleted role; identity, scope and permissions must be known.
    if (containsUnknown(unknown.condition) || containsUnknown(unknown.stage)) fail('OPENSWX_IAM_PLAN_INVALID')
    observed.add(row.address)
  }
  return value.resource_changes.map(row => ({ address: row.address, actions: row.change.actions })).sort((a, b) => a.address.localeCompare(b.address))
}
export function readbackIamPlan(readSource, sourceRevision) {
  return { ownerApplicationId: 'ai-pdm', projectId: PROJECT, backendBucket: 'tfstate-jenfu-platform-prod', backendPrefix: 'dev-122/openswx-release-readback',
    sourceHashes: READBACK_IAM_PATHS.map(repositoryPath => ({ path: repositoryPath, sha256: sha256(readSource(repositoryPath, sourceRevision)) })),
    resourceAddresses: READBACK_IAM_ADDRESSES, resourceSpecs: READBACK_IAM_SPECS, allowedActions: ['create', 'no-op'], schedulerScope: 'PROJECT_WIDE_GET' }
}
export function expectedReadbackJobBindings() {
  return [
    { role: 'roles/run.invoker', members: [`serviceAccount:aipdm-prod-runtime@${PROJECT}.iam.gserviceaccount.com`] },
    { role: `${ROLE_ROOT}aipdmOpenswxJobReadback`, members: [`serviceAccount:aipdm-prod-runtime@${PROJECT}.iam.gserviceaccount.com`] },
    { role: `${ROLE_ROOT}aipdmOpenswxJobLifecycle`, members: [DEPLOYER] },
    { role: READBACK_JOB_ROLE, members: [VERIFIER] },
  ].sort((a, b) => a.role.localeCompare(b.role))
}
export async function readbackReleaseIam(transport, { prebuildIamContinuation = false } = {}) {
  const roleSpecs = [[READBACK_JOB_ROLE, ['run.jobs.get', 'run.executions.list']], [READBACK_SCHEDULER_ROLE, ['cloudscheduler.jobs.get']]]
  const roles = []
  for (const [name, permissions] of roleSpecs) {
    const role = await transport.request(`https://iam.googleapis.com/v1/${name}`)
    if (role.name !== name || role.deleted || role.stage !== 'GA' || !Array.isArray(role.includedPermissions) || !same(sorted(role.includedPermissions), sorted(permissions))) fail('OPENSWX_IAM_READBACK_INVALID')
    roles.push({ name, permissions: sorted(role.includedPermissions) })
  }
  const job = await transport.request(`https://run.googleapis.com/v2/${workerJobName()}:getIamPolicy`)
  if (!same((job.bindings ?? []).map(row => ({ ...row, members: sorted(row.members ?? []) })).sort((a, b) => a.role.localeCompare(b.role)), expectedReadbackJobBindings())) fail('OPENSWX_IAM_READBACK_INVALID')
  const policy = await transport.request(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) })
  const own = (policy.bindings ?? []).filter(row => row.role === READBACK_SCHEDULER_ROLE)
  if (own.length !== 1 || !same(Object.keys(own[0]).sort(), ['members', 'role']) || !same(sorted(own[0].members ?? []), sorted([VERIFIER, DEPLOYER]))) fail('OPENSWX_IAM_READBACK_INVALID')
  const unrelated = (policy.bindings ?? []).filter(row => row.role !== READBACK_SCHEDULER_ROLE).map(row => ({ ...row, members: sorted(row.members ?? []) })).sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
  const readback = { roles, jobBindings: expectedReadbackJobBindings(), schedulerBinding: { role: READBACK_SCHEDULER_ROLE, members: sorted([VERIFIER, DEPLOYER]), effectiveScope: 'PROJECT_WIDE_GET' }, unrelatedProjectBindingsSha256: sha256(canonicalize(unrelated)) }
  if (prebuildIamContinuation) {
    assertPrebuildProjectPolicy(policy, true)
    const role = await transport.request(`https://iam.googleapis.com/v1/${PREBUILD_IAM_ROLE}`)
    assertPrebuildRole(role)
    readback.prebuildIamReadback = { role: { name: role.name, permissions: sorted(role.includedPermissions) }, unrelatedProjectBindingsWithoutPrebuildSha256: projectBindingsHash(policy, true) }
  }
  return readback
}
async function optional(transport, uri) {
  try { const row = await transport.readBytes(uri, { prefixes: [WORKER_RECEIPT_PREFIX] }); return { ...row, value: JSON.parse(row.bytes) } }
  catch (error) { if (error.code === 'MISSING') return null; throw error }
}
export async function readReadbackIamReceipt({ transport, ref, sourceRevision, readSource, normalActor }) {
  assertOpenSwxWorkerRef(ref)
  const row = await transport.readJson(ref, BUCKET, [WORKER_RECEIPT_PREFIX]), value = row.value
  const plan = readbackIamPlan(readSource, sourceRevision)
  if (value?.schemaVersion !== 'aipdm.openswx-release-readback-iam.v1' || value.status !== 'APPLIED' || value.evidenceScope !== 'PRODUCTION_PROVIDER'
    || value.ownerApplicationId !== 'ai-pdm' || value.actor !== normalActor || value.sourceRevision !== sourceRevision || value.planSha256 !== sha256(canonicalize(plan))
    || !/^[a-f0-9]{64}$/u.test(value.sourceArchiveSha256 ?? '')) fail('OPENSWX_IAM_RECEIPT_INVALID')
  const sourceBinding = await readIamSourceBinding(transport, value, readSource)
  const approved = (await transport.readJson(value.approvedPlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  assertApprovedPlan(approved, plan, sourceRevision, sourceBinding)
  assertOpenSwxWorkerRef(value.inputRef)
  const input = (await transport.readJson(value.inputRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  if (!input || !same(Object.keys(input).sort(), INPUT_KEYS)
    || input.schemaVersion !== 'aipdm.openswx-release-readback-iam-input.v1' || input.sourceRevision !== sourceRevision || !same(input.approvedPlanRef, value.approvedPlanRef)
    || ref.uri !== `gs://${BUCKET}/${WORKER_RECEIPT_PREFIX}/${input.receiptId}.json` || !Number.isFinite(Date.parse(input.deadlineAt))) fail('OPENSWX_IAM_RECEIPT_INVALID')
  for (const field of ['descriptorRef', 'workerBuildRef']) if (!same(input[field], value[field])) fail('OPENSWX_IAM_RECEIPT_INVALID')
  const binding = { ownerApplicationId: 'ai-pdm', actor: normalActor, sourceRevision, ...sourceBinding, approvedPlanRef: value.approvedPlanRef, planSha256: value.planSha256, receiptUri: ref.uri }
  const proofRows = []
  for (const [field, suffix, schema] of [['requestRef', '-request.json', 'aipdm.openswx-release-readback-iam-request.v1'], ['binaryPlanReceiptRef', '-plan.json', 'aipdm.openswx-release-readback-iam-plan-binary.v1']]) {
    assertOpenSwxWorkerRef(value[field])
    if (value[field].uri !== ref.uri.replace(/\.json$/u, suffix)) fail('OPENSWX_IAM_REQUEST_INVALID')
    const proof = (await transport.readJson(value[field], BUCKET, [WORKER_RECEIPT_PREFIX])).value
    assertApplyProof(proof, schema, binding)
    if (proof.binaryPlanSha256 !== value.binaryPlanSha256 || Date.parse(proof.requestedAt) >= Date.parse(input.deadlineAt)) fail('OPENSWX_IAM_REQUEST_INVALID')
    proofRows.push(proof)
  }
  if (!same({ ...proofRows[0], schemaVersion: proofRows[1].schemaVersion }, proofRows[1]) || value.readback?.unrelatedProjectBindingsSha256 !== proofRows[0].unrelatedProjectBindingsBeforeSha256) fail('OPENSWX_IAM_REQUEST_INVALID')
  const expectedRoles = [[READBACK_JOB_ROLE, ['run.jobs.get', 'run.executions.list']], [READBACK_SCHEDULER_ROLE, ['cloudscheduler.jobs.get']]].map(([name, permissions]) => ({ name, permissions: sorted(permissions) }))
  if (!same(value.readback?.roles, expectedRoles) || !same(value.readback?.jobBindings, expectedReadbackJobBindings())
    || !same(value.readback?.schedulerBinding, { role: READBACK_SCHEDULER_ROLE, members: sorted([VERIFIER, DEPLOYER]), effectiveScope: 'PROJECT_WIDE_GET' })
    || !/^[a-f0-9]{64}$/u.test(value.readback?.unrelatedProjectBindingsSha256 ?? '')) fail('OPENSWX_IAM_RECEIPT_INVALID')
  return row
}
/** Only the normal human resources/bootstrap path performs IAM policy GETs. */
export async function assertReadbackIamReceipt(args) {
  const row = await readReadbackIamReceipt(args)
  if (args.prebuildIamContinuationRef) await readPrebuildIamContinuation({ transport: args.transport, ref: args.prebuildIamContinuationRef,
    supplementalIamReadbackRef: args.ref, sourceRevision: args.verificationSourceRevision, readSource: args.readSource, normalActor: args.normalActor })
  const current = await readbackReleaseIam(args.transport, { prebuildIamContinuation: Boolean(args.prebuildIamContinuationRef) })
  for (const key of ['roles', 'jobBindings', 'schedulerBinding']) if (!same(row.value.readback[key], current[key])) fail('OPENSWX_IAM_READBACK_DRIFT')
  const currentHash = args.prebuildIamContinuationRef ? current.prebuildIamReadback.unrelatedProjectBindingsWithoutPrebuildSha256 : current.unrelatedProjectBindingsSha256
  if (row.value.readback.unrelatedProjectBindingsSha256 !== currentHash) fail('OPENSWX_IAM_READBACK_DRIFT')
  return row
}
const PREBUILD_INVALID = 'OPENSWX_PREBUILD_IAM_CONTINUATION_INVALID'
const hash64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort())
const prebuildBinding = () => ({ role: PREBUILD_IAM_ROLE, members: [VERIFIER] })
function assertPrebuildRole(value) {
  if (!value || value.name !== PREBUILD_IAM_ROLE || (Object.hasOwn(value, 'deleted') && value.deleted !== false) || value.stage !== 'GA'
    || !Array.isArray(value.includedPermissions) || !same(sorted(value.includedPermissions), PREBUILD_IAM_PERMISSIONS)) fail(PREBUILD_INVALID)
}
function assertPrebuildProjectPolicy(policy, applied) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || !Array.isArray(policy.bindings)
    || policy.bindings.some(row => !row || typeof row !== 'object' || Array.isArray(row) || typeof row.role !== 'string' || !Array.isArray(row.members))) fail(PREBUILD_INVALID)
  const scheduler = policy.bindings.filter(row => row.role === READBACK_SCHEDULER_ROLE)
  if (scheduler.length !== 1 || !exactKeys(scheduler[0], ['role', 'members']) || !same(sorted(scheduler[0].members), sorted([VERIFIER, DEPLOYER]))) fail(PREBUILD_INVALID)
  const own = policy.bindings.filter(row => row.role === PREBUILD_IAM_ROLE)
  if (applied ? own.length !== 1 || !same(own[0], prebuildBinding()) : own.length !== 0) fail(PREBUILD_INVALID)
}
function projectBindingsHash(policy, withoutPrebuild = false) {
  const rows = policy.bindings.filter(row => row.role !== READBACK_SCHEDULER_ROLE && (!withoutPrebuild || row.role !== PREBUILD_IAM_ROLE))
    .map(row => ({ ...row, members: sorted(row.members) })).sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
  return sha256(canonicalize(rows))
}
export function prebuildIamContinuationPlan(readSource, sourceRevision) {
  const retained = readbackIamPlan(readSource, sourceRevision)
  return { ...retained,
    sourceHashes: [...retained.sourceHashes, { path: PREBUILD_IAM_SOURCE_PATH, sha256: sha256(readSource(PREBUILD_IAM_SOURCE_PATH, sourceRevision)) }],
    resourceAddresses: [...READBACK_IAM_ADDRESSES, ...PREBUILD_IAM_ADDRESSES], resourceSpecs: { ...READBACK_IAM_SPECS, ...PREBUILD_IAM_SPECS },
    retainedResourceAddresses: READBACK_IAM_ADDRESSES, additiveResourceAddresses: PREBUILD_IAM_ADDRESSES }
}
/** The old five must be no-ops; this is separate from their historical executor. */
export function assertPrebuildIamTerraformPlan(value) {
  if (!Array.isArray(value?.resource_changes) || value.resource_changes.length !== 7) fail(PREBUILD_INVALID)
  const retained = value.resource_changes.filter(row => READBACK_IAM_ADDRESSES.includes(row?.address))
  assertReadbackIamTerraformPlan({ resource_changes: retained })
  if (retained.some(row => !same(row.change.actions, ['no-op']))) fail(PREBUILD_INVALID)
  const added = value.resource_changes.filter(row => PREBUILD_IAM_ADDRESSES.includes(row?.address))
  if (added.length !== 2 || new Set(added.map(row => row.address)).size !== 2) fail(PREBUILD_INVALID)
  for (const row of added) {
    const after = row.change?.after, unknown = row.change?.after_unknown ?? {}, spec = PREBUILD_IAM_SPECS[row.address]
    if (row.mode !== 'managed' || row.provider_name !== 'registry.terraform.io/hashicorp/google' || !after || row.change.importing
      || !['create', 'no-op'].includes(row.change?.actions?.join(',')) || typeof unknown !== 'object' || Array.isArray(unknown) || unknown === null
      || (after.condition != null && (!Array.isArray(after.condition) || after.condition.length !== 0))
      || after.deleted === true || (after.stage && after.stage !== 'GA') || containsUnknown(unknown.condition) || containsUnknown(unknown.stage)) fail(PREBUILD_INVALID)
    for (const [key, expected] of Object.entries(spec)) if (containsUnknown(unknown[key])
      || !(key === 'permissions' ? Array.isArray(after[key]) && same(sorted(after[key]), expected) : same(after[key], expected))) fail(PREBUILD_INVALID)
  }
  return value.resource_changes.map(row => ({ address: row.address, actions: row.change.actions })).sort((a, b) => a.address.localeCompare(b.address))
}
/** Immutable historical joins only. Live role/policy checks stay on the normal actor path. */
export async function readPrebuildIamContinuation({ transport, ref, supplementalIamReadbackRef, sourceRevision, readSource, normalActor }) {
  assertOpenSwxWorkerRef(ref); assertOpenSwxWorkerRef(supplementalIamReadbackRef)
  const row = await transport.readJson(ref, BUCKET, [WORKER_RECEIPT_PREFIX]), value = row.value
  const bindingKeys = ['ownerApplicationId', 'actor', 'sourceRevision', 'sourceTree', 'sourceSha256', 'sourceProofRef', 'supplementalIamReadbackRef', 'humanApprovalRef', 'approvedPlanRef', 'planSha256', 'receiptUri']
  const resultKeys = ['schemaVersion', ...bindingKeys, 'status', 'evidenceScope', 'requestRef', 'binaryPlanReceiptRef', 'binaryPlanSha256', 'beforeReadbackRef', 'afterReadbackRef', 'unrelatedProjectBindingsBeforeSha256', 'unrelatedProjectBindingsAfterSha256', 'observedAt', 'mutation']
  if (!exactKeys(value, resultKeys) || value.schemaVersion !== 'aipdm.openswx-prebuild-readback-iam-continuation.v1'
    || value.ownerApplicationId !== 'ai-pdm' || value.actor !== normalActor || normalActor !== 'jedchang0308@jenfu.com.tw'
    || !/^[a-f0-9]{40}$/u.test(value.sourceRevision ?? '') || !/^[a-f0-9]{40}$/u.test(value.sourceTree ?? '') || !hash64(value.sourceSha256)
    || value.status !== 'APPLIED' || value.evidenceScope !== 'PRODUCTION_PROVIDER' || value.receiptUri !== ref.uri
    || !same(value.supplementalIamReadbackRef, supplementalIamReadbackRef) || !hash64(value.binaryPlanSha256)
    || !['APPLY_THEN_READBACK', 'UNKNOWN_APPLY_THEN_READBACK', 'READBACK_ONLY'].includes(value.mutation)
    || typeof readSource !== 'function' || !/^[a-f0-9]{40}$/u.test(sourceRevision ?? '')) fail(PREBUILD_INVALID)
  const read = async reference => { assertOpenSwxWorkerRef(reference); return transport.readJson(reference, BUCKET, [WORKER_RECEIPT_PREFIX]) }
  const old = (await read(supplementalIamReadbackRef)).value
  await readReadbackIamReceipt({ transport, ref: supplementalIamReadbackRef, sourceRevision: old?.sourceRevision, readSource, normalActor })
  if (old.planSha256 !== sha256(canonicalize(readbackIamPlan(readSource, sourceRevision)))) fail('OPENSWX_IAM_SOURCE_DRIFT')
  assertOpenSwxWorkerRef(value.humanApprovalRef)
  if (value.humanApprovalRef.sha256 !== PREBUILD_IAM_HUMAN_APPROVAL_SHA256) fail(PREBUILD_INVALID)
  const approvalRow = await transport.readBytes(value.humanApprovalRef.uri, { prefixes: [WORKER_RECEIPT_PREFIX] })
  if (sha256(approvalRow.bytes) !== PREBUILD_IAM_HUMAN_APPROVAL_SHA256) fail(PREBUILD_INVALID)
  const human = JSON.parse(approvalRow.bytes)
  if (human.schemaVersion !== 'aipdm.dev122.b15-human-iam-approval.v1' || human.project !== 'AI-PDM' || human.status !== 'APPROVED'
    || human.authorizationSource !== 'HUMAN_USER_MESSAGE_IN_CURRENT_THREAD' || human.environment !== 'PRODUCTION' || human.projectId !== PROJECT
    || human.projectNumber !== '9536592944' || human.principal !== VERIFIER || human.roleId !== 'aipdmDev122PrebuildList'
    || !same(human.permissions, PREBUILD_IAM_PERMISSIONS) || !same(human.resources, PREBUILD_IAM_ADDRESSES)) fail(PREBUILD_INVALID)
  assertImmutableRef(value.sourceProofRef, BUCKET, ['receipts/releases'])
  const source = (await transport.readJson(value.sourceProofRef, BUCKET, ['receipts/releases'])).value
  const sourceKeys = ['schemaVersion', 'ownerApplicationId', 'repository', 'branch', 'releaseId', 'sourceRevision', 'sourceTree', 'sourceSha256', 'migrationManifestSha256', 'clean', 'remoteRef', 'remoteRevision', 'status', 'releaseAuthority', 'evidenceScope', 'observedAt']
  if (!exactKeys(source, sourceKeys) || source.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1' || source.ownerApplicationId !== 'ai-pdm'
    || source.repository !== 'jedchang0308-jenfu/AI-PDM' || source.branch !== 'main' || source.remoteRef !== 'refs/heads/main'
    || source.sourceRevision !== value.sourceRevision || source.remoteRevision !== value.sourceRevision || source.sourceTree !== value.sourceTree
    || source.sourceSha256 !== value.sourceSha256 || !hash64(source.migrationManifestSha256) || source.clean !== true
    || source.status !== 'SOURCE_FROZEN' || source.releaseAuthority !== true || source.evidenceScope !== 'PRODUCTION_BOUND'
    || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(source.releaseId ?? '')
    || value.sourceProofRef.uri !== `gs://${BUCKET}/receipts/releases/${source.releaseId}/source-lock.json`) fail(PREBUILD_INVALID)
  const plan = prebuildIamContinuationPlan(readSource, sourceRevision), planSha256 = sha256(canonicalize(plan))
  const approved = (await read(value.approvedPlanRef)).value
  const planBindingKeys = ['ownerApplicationId', 'sourceRevision', 'sourceTree', 'sourceSha256', 'sourceProofRef', 'supplementalIamReadbackRef', 'humanApprovalRef']
  if (!exactKeys(approved, ['schemaVersion', ...planBindingKeys, 'status', 'releaseAuthority', 'evidenceScope', 'planSha256', 'plan'])
    || approved.schemaVersion !== 'aipdm.openswx-approved-prebuild-readback-iam-plan.v1' || approved.status !== 'APPROVED' || approved.releaseAuthority !== true
    || approved.evidenceScope !== 'HUMAN_APPROVED_PREBUILD_READBACK_IAM_PLAN' || approved.planSha256 !== planSha256 || value.planSha256 !== planSha256
    || !same(approved.plan, plan) || planBindingKeys.some(key => !same(approved[key], value[key]))) fail(PREBUILD_INVALID)
  const binding = Object.fromEntries(bindingKeys.map(key => [key, value[key]])), proofs = []
  const requestKeys = ['schemaVersion', ...bindingKeys, 'binaryPlanRef', 'binaryPlanSha256', 'terraformPlanRef', 'changes', 'requestedAt', 'deadlineAt', 'beforeReadbackRef']
  for (const [key, suffix, schema] of [['requestRef', '-request.json', 'aipdm.openswx-prebuild-readback-iam-request.v1'], ['binaryPlanReceiptRef', '-plan.json', 'aipdm.openswx-prebuild-readback-iam-plan-binary.v1']]) {
    if (value[key]?.uri !== ref.uri.replace(/\.json$/u, suffix)) fail(PREBUILD_INVALID)
    const proof = (await read(value[key])).value
    if (!exactKeys(proof, requestKeys) || proof.schemaVersion !== schema || Object.entries(binding).some(([key, expected]) => !same(proof[key], expected))
      || proof.binaryPlanSha256 !== value.binaryPlanSha256 || !same(proof.beforeReadbackRef, value.beforeReadbackRef)) fail(PREBUILD_INVALID)
    proofs.push(proof)
  }
  if (!same({ ...proofs[0], schemaVersion: proofs[1].schemaVersion }, proofs[1])) fail(PREBUILD_INVALID)
  const request = proofs[0], requestedAt = Date.parse(request.requestedAt), deadlineAt = Date.parse(request.deadlineAt)
  if (![requestedAt, deadlineAt, Date.parse(source.observedAt)].every(Number.isFinite) || deadlineAt <= requestedAt || deadlineAt - requestedAt > 600_000
    || Date.parse(source.observedAt) > requestedAt || requestedAt - Date.parse(source.observedAt) > 600_000) fail(PREBUILD_INVALID)
  assertOpenSwxWorkerRef(request.binaryPlanRef)
  if (request.binaryPlanRef.uri !== ref.uri.replace(/\.json$/u, '-plan.tfplan') || request.binaryPlanRef.sha256 !== value.binaryPlanSha256
    || request.terraformPlanRef?.uri !== ref.uri.replace(/\.json$/u, '-terraform-plan.json')) fail(PREBUILD_INVALID)
  const binary = await transport.readBytes(request.binaryPlanRef.uri, { prefixes: [WORKER_RECEIPT_PREFIX] })
  if (sha256(binary.bytes) !== value.binaryPlanSha256) fail(PREBUILD_INVALID)
  const changes = assertPrebuildIamTerraformPlan((await read(request.terraformPlanRef)).value)
  if (!same(request.changes, changes)) fail(PREBUILD_INVALID)
  const policies = []
  for (const [key, phase, suffix] of [['beforeReadbackRef', 'BEFORE', '-before.json'], ['afterReadbackRef', 'AFTER', '-after.json']]) {
    if (value[key]?.uri !== ref.uri.replace(/\.json$/u, suffix)) fail(PREBUILD_INVALID)
    const policy = (await read(value[key])).value
    if (!exactKeys(policy, ['schemaVersion', 'ownerApplicationId', 'projectId', 'actor', 'phase', 'observedAt', 'projectPolicy', 'prebuildRole'])
      || policy.schemaVersion !== 'aipdm.openswx-prebuild-readback-iam-policy.v1' || policy.ownerApplicationId !== 'ai-pdm' || policy.projectId !== PROJECT
      || policy.actor !== normalActor || policy.phase !== phase || !Number.isFinite(Date.parse(policy.observedAt))) fail(PREBUILD_INVALID)
    assertPrebuildProjectPolicy(policy.projectPolicy, phase === 'AFTER')
    if (phase === 'BEFORE') { if (policy.prebuildRole !== null) fail(PREBUILD_INVALID) } else assertPrebuildRole(policy.prebuildRole)
    policies.push(policy)
  }
  const [before, after] = policies, beforeAt = Date.parse(before.observedAt), afterAt = Date.parse(after.observedAt), observedAt = Date.parse(value.observedAt)
  if (!Number.isFinite(observedAt) || beforeAt > requestedAt || requestedAt - beforeAt > 600_000 || afterAt < requestedAt || afterAt > deadlineAt
    || observedAt < afterAt || observedAt > deadlineAt || projectBindingsHash(before.projectPolicy) !== old.readback.unrelatedProjectBindingsSha256
    || projectBindingsHash(after.projectPolicy, true) !== old.readback.unrelatedProjectBindingsSha256
    || value.unrelatedProjectBindingsBeforeSha256 !== projectBindingsHash(before.projectPolicy)
    || value.unrelatedProjectBindingsAfterSha256 !== projectBindingsHash(after.projectPolicy)) fail(PREBUILD_INVALID)
  return row
}
function assertApplyProof(value, schema, binding) {
  if (!value || value.schemaVersion !== schema || !same(Object.keys(value).sort(), ['schemaVersion', ...Object.keys(binding), 'binaryPlanSha256', 'changes', 'requestedAt', 'unrelatedProjectBindingsBeforeSha256'].sort())
    || Object.entries(binding).some(([key, expected]) => !same(value[key], expected)) || !/^[a-f0-9]{64}$/u.test(value.binaryPlanSha256 ?? '')
    || !/^[a-f0-9]{64}$/u.test(value.unrelatedProjectBindingsBeforeSha256 ?? '') || !Number.isFinite(Date.parse(value.requestedAt))
    || !Array.isArray(value.changes) || !same(value.changes.map(row => row.address).sort(), sorted(READBACK_IAM_ADDRESSES))
    || value.changes.some(row => !same(Object.keys(row).sort(), ['actions', 'address']) || !['create', 'no-op'].includes(row.actions?.join(',')))) fail('OPENSWX_IAM_REQUEST_INVALID')
}
async function readIamSourceBinding(transport, input, readSource) {
  for (const ref of [input.descriptorRef, input.workerBuildRef]) assertOpenSwxWorkerRef(ref)
  const descriptor = await readWorkerDescriptor({ transport, ref: input.descriptorRef, sourceRevision: input.sourceRevision, profileBytes: readSource(WORKER_PROFILE_PATH, input.sourceRevision) })
  if (descriptor.value.purpose !== 'build_only') fail('OPENSWX_IAM_SOURCE_INVALID')
  const build = (await transport.readJson(input.workerBuildRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  assertWorkerReceipt(build, descriptor.value, 'build', { actor: `aipdm-prod-builder@${PROJECT}.iam.gserviceaccount.com` })
  assertWorkerBuildSource(build, descriptor.value)
  if (build.facts.scan.rawHighOrCriticalVulnerabilityCount !== 0) fail('OPENSWX_IAM_SOURCE_INVALID')
  const binding = { descriptorRef: input.descriptorRef, workerBuildRef: input.workerBuildRef, sourceArchiveSha256: descriptor.value.sourceArchiveSha256 }
  if (input.sourceArchiveSha256 && input.sourceArchiveSha256 !== binding.sourceArchiveSha256) fail('OPENSWX_IAM_SOURCE_INVALID')
  return binding
}
function assertApprovedPlan(value, plan, sourceRevision, sourceBinding) {
  if (value?.schemaVersion !== 'aipdm.openswx-approved-readback-iam-plan.v1' || value.ownerApplicationId !== 'ai-pdm' || value.status !== 'APPROVED' || value.releaseAuthority !== true
    || value.evidenceScope !== 'HUMAN_APPROVED_READBACK_IAM_PLAN' || value.sourceRevision !== sourceRevision || !/^[a-f0-9]{64}$/u.test(value.authorizationStatementSha256 ?? '')
    || value.planSha256 !== sha256(canonicalize(plan)) || !same(value.plan, plan)
    || Object.entries(sourceBinding).some(([key, expected]) => !same(value[key], expected))) fail('OPENSWX_IAM_PLAN_NOT_APPROVED')
}
export async function executeReleaseReadbackIam({ inputRef, transport, readSource, root, oauthToken, verifyActor, terraformRunner }) {
  assertOpenSwxWorkerRef(inputRef)
  const input = (await transport.readJson(inputRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  if (!input || !same(Object.keys(input).sort(), INPUT_KEYS)
    || input.schemaVersion !== 'aipdm.openswx-release-readback-iam-input.v1' || !/^[a-f0-9]{40}$/u.test(input.sourceRevision ?? '')
    || !/^[A-Za-z0-9-]{6,100}$/u.test(input.receiptId ?? '') || Date.parse(input.deadlineAt) > Date.now() + 600_000) fail('OPENSWX_IAM_INPUT_INVALID')
  deadline(input.deadlineAt)
  transport = boundOpenSwxTransport(transport, input.deadlineAt)
  const actor = await verifyActor(transport), sourceRevision = input.sourceRevision
  if (actor.email !== 'jedchang0308@jenfu.com.tw' || typeof oauthToken !== 'string' || oauthToken.length < 20) fail('OPENSWX_IAM_ACTOR_INVALID')
  const plan = readbackIamPlan(readSource, sourceRevision)
  const sourceBinding = await readIamSourceBinding(transport, input, readSource)
  assertOpenSwxWorkerRef(input.approvedPlanRef)
  const approved = (await transport.readJson(input.approvedPlanRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value
  assertApprovedPlan(approved, plan, sourceRevision, sourceBinding)
  assertOpenSwxWorkerRef(approved.capacityGateRef)
  const capacity = (await transport.readJson(approved.capacityGateRef, BUCKET, [WORKER_RECEIPT_PREFIX])).value, age = Date.now() - Date.parse(capacity.observedAt)
  if (capacity.project !== 'AI-PDM' || capacity.sourceRevision !== sourceRevision || capacity.status !== 'PASS' || !Number.isFinite(age) || age < 0 || age > 600_000) fail('OPENSWX_IAM_CAPACITY_REQUIRED')
  const uri = `gs://${BUCKET}/${WORKER_RECEIPT_PREFIX}/${input.receiptId}.json`, requestUri = uri.replace(/\.json$/u, '-request.json'), binaryUri = uri.replace(/\.json$/u, '-plan.json')
  const binding = { ownerApplicationId: 'ai-pdm', actor: actor.email, sourceRevision, ...sourceBinding, approvedPlanRef: input.approvedPlanRef, planSha256: approved.planSha256, receiptUri: uri }
  const join = (value, schema) => assertApplyProof(value, schema, binding)
  let request = await optional(transport, requestUri), binary = await optional(transport, binaryUri), mutation = 'READBACK_ONLY'
  if (Boolean(request) !== Boolean(binary)) fail('OPENSWX_IAM_REQUEST_INVALID')
  if (request) { join(request.value, 'aipdm.openswx-release-readback-iam-request.v1'); join(binary.value, 'aipdm.openswx-release-readback-iam-plan-binary.v1'); if (!same({ ...request.value, schemaVersion: binary.value.schemaVersion }, binary.value)) fail('OPENSWX_IAM_REQUEST_INVALID') }
  const previous = await optional(transport, uri)
  if (previous) { if (!request) fail('OPENSWX_IAM_REQUEST_INVALID'); return assertReadbackIamReceipt({ transport, ref: previous.ref, sourceRevision, readSource, normalActor: actor.email }) }
  if (!request) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE || process.env.GOOGLE_CREDENTIALS || process.env.GOOGLE_BACKEND_CREDENTIALS) fail('OPENSWX_ADC_FORBIDDEN')
    const canonicalRoot = await fs.realpath(root)
    for (const row of plan.sourceHashes) if (sha256(await fs.readFile(path.join(canonicalRoot, row.path))) !== row.sha256) fail('OPENSWX_IAM_SOURCE_NOT_FROZEN')
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'aipdm-dev122-readback-iam-'))
    try {
      for (const row of plan.sourceHashes.filter(row => row.path.endsWith('.tf'))) await fs.writeFile(path.join(temporary, path.basename(row.path)), readSource(row.path, sourceRevision))
      const environment = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: temporary, TMP: temporary, TF_DATA_DIR: path.join(temporary, 'plugins'), TF_IN_AUTOMATION: '1', TF_INPUT: '0', GOOGLE_OAUTH_ACCESS_TOKEN: oauthToken }
      const run = args => { deadline(input.deadlineAt); const options = { cwd: temporary, env: environment, windowsHide: true, encoding: 'utf8', timeout: Math.max(1, Date.parse(input.deadlineAt) - Date.now()), maxBuffer: 8 * 1024 * 1024 }; const result = terraformRunner ? terraformRunner(args, options) : spawnSync('terraform', args, options); if (result.error || result.status !== 0) fail('OPENSWX_IAM_TERRAFORM_UNKNOWN'); return result.stdout }
      run(['init', '-input=false', '-no-color'])
      run(['plan', '-input=false', '-no-color', '-out=owned.tfplan'])
      const changes = assertReadbackIamTerraformPlan(JSON.parse(run(['show', '-json', 'owned.tfplan'])))
      for (const [roleName, address] of [[READBACK_JOB_ROLE, 'google_project_iam_custom_role.verifier_job_readback'], [READBACK_SCHEDULER_ROLE, 'google_project_iam_custom_role.release_scheduler_readback']]) {
        const action = changes.find(row => row.address === address).actions[0]
        try { const role = await transport.request(`https://iam.googleapis.com/v1/${roleName}`); if (action === 'create' || role.deleted) fail('OPENSWX_IAM_ROLE_ALREADY_EXISTS') }
        catch (error) { if (error.code !== 'MISSING' || action !== 'create') throw error }
      }
      const beforePolicy = await transport.request(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) })
      const unrelated = (beforePolicy.bindings ?? []).filter(row => row.role !== READBACK_SCHEDULER_ROLE).map(row => ({ ...row, members: sorted(row.members ?? []) })).sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
      const facts = { ...binding, binaryPlanSha256: sha256(await fs.readFile(path.join(temporary, 'owned.tfplan'))), changes, requestedAt: transport.now(), unrelatedProjectBindingsBeforeSha256: sha256(canonicalize(unrelated)) }
      binary = await writeWorkerJson(transport, binaryUri, { schemaVersion: 'aipdm.openswx-release-readback-iam-plan-binary.v1', ...facts })
      request = await writeWorkerJson(transport, requestUri, { schemaVersion: 'aipdm.openswx-release-readback-iam-request.v1', ...facts })
      try { run(['apply', '-input=false', '-no-color', '-auto-approve', 'owned.tfplan']); mutation = 'APPLY_THEN_READBACK' } catch { mutation = 'UNKNOWN_APPLY_THEN_READBACK' }
    } finally {
      if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('aipdm-dev122-readback-iam-')) fail('OPENSWX_IAM_TEMP_SCOPE_INVALID')
      await fs.rm(temporary, { recursive: true, force: true })
    }
  }
  const readback = await readbackReleaseIam(transport)
  if (readback.unrelatedProjectBindingsSha256 !== request.value.unrelatedProjectBindingsBeforeSha256) fail('OPENSWX_IAM_UNRELATED_POLICY_DRIFT')
  return writeWorkerJson(transport, uri, { schemaVersion: 'aipdm.openswx-release-readback-iam.v1', ...binding, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER',
    inputRef, requestRef: request.ref, binaryPlanReceiptRef: binary.ref, binaryPlanSha256: binary.value.binaryPlanSha256, readback, mutation, observedAt: transport.now() })
}
