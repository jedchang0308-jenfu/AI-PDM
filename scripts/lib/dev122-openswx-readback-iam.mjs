import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
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
      if (containsUnknown(unknown[key]) || !(key === 'permissions' ? Array.isArray(after[key]) && same(sorted(after[key]), sorted(expected)) : same(after[key], expected))) fail('OPENSWX_IAM_PLAN_INVALID')
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
export async function readbackReleaseIam(transport) {
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
  return { roles, jobBindings: expectedReadbackJobBindings(), schedulerBinding: { role: READBACK_SCHEDULER_ROLE, members: sorted([VERIFIER, DEPLOYER]), effectiveScope: 'PROJECT_WIDE_GET' }, unrelatedProjectBindingsSha256: sha256(canonicalize(unrelated)) }
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
  const row = await readReadbackIamReceipt(args), current = await readbackReleaseIam(args.transport)
  for (const key of ['roles', 'jobBindings', 'schedulerBinding', 'unrelatedProjectBindingsSha256']) if (!same(row.value.readback[key], current[key])) fail('OPENSWX_IAM_READBACK_DRIFT')
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
