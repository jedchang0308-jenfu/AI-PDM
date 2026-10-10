import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { assertImmutableRef, canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertOpenSwxWorkerRef } from './dev122-openswx-owner-release.mjs'
import { PREBUILD_IAM_ADDRESSES, READBACK_IAM_ADDRESSES, assertPrebuildIamTerraformPlan, prebuildIamContinuationPlan, readPrebuildIamContinuation, readbackReleaseIam } from './dev122-openswx-readback-iam.mjs'

const PROJECT = 'jenfu-platform-prod', NUMBER = '9536592944', BUCKET = 'jenfu-platform-prod-aipdm-release'
const ACTOR = 'jedchang0308@jenfu.com.tw'
const PREFIX = 'receipts/dev-122/openswx-worker'
const INVALID = 'OPENSWX_SECRET_VERSION_IAM_INVALID'
export const SECRET_VERSION_IAM_ROLE = `projects/${PROJECT}/roles/aipdmOpenswxSecretVersionReadback`
export const SECRET_VERSION_IAM_SOURCE_PATH = 'infra/google-cloud/dev-122-openswx-release-readback/secret-version-readback.tf'
export const SECRET_VERSION_IAM_HUMAN_APPROVAL_PATH = '.ai-doc/qa/DEV-122-B35-secret-version-iam-human-approval-2026-10-10.json'
export const SECRET_VERSION_IAM_EXECUTION_PATHS = Object.freeze(['scripts/lib/dev122-openswx-secret-version-iam.mjs', 'scripts/dev122-openswx-secret-version-iam.mjs'])
export const SECRET_VERSION_IAM_SECRETS = Object.freeze(['aipdm-prod-openswx-reader-token', 'aipdm-prod-workload-auth-credentials'])
export const SECRET_VERSION_IAM_MEMBERS = Object.freeze(['verifier', 'deployer'].map(name => `serviceAccount:aipdm-prod-${name}@${PROJECT}.iam.gserviceaccount.com`))
export const SECRET_VERSION_IAM_SPECS = Object.freeze({
  'google_project_iam_custom_role.release_secret_version_readback': { project: PROJECT, role_id: 'aipdmOpenswxSecretVersionReadback', permissions: ['secretmanager.versions.get'] },
  ...Object.fromEntries(['reader_token', 'workload_credentials'].flatMap((name, index) => ['verifier', 'deployer'].map((principal, p) =>
    [`google_secret_manager_secret_iam_member.${principal}_${name}_version_readback`, { project: PROJECT, secret_id: SECRET_VERSION_IAM_SECRETS[index], role: SECRET_VERSION_IAM_ROLE, member: SECRET_VERSION_IAM_MEMBERS[p] }]))),
})
export const SECRET_VERSION_IAM_ADDRESSES = Object.freeze(Object.keys(SECRET_VERSION_IAM_SPECS))
const same = (a, b) => canonicalize(a) === canonicalize(b)
const sorted = rows => [...rows].sort()
function fail(code = INVALID) { throw Object.assign(Error(code), { code }) }
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
const revision = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value)
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(), sorted(keys))
const unknown = value => value === true || (Array.isArray(value) ? value.some(unknown) : value && typeof value === 'object' ? Object.values(value).some(unknown) : value != null && value !== false)
const canonicalSecret = secret => `projects/${PROJECT}/secrets/${secret}`
function secretEquals(value, expected) { return [expected, canonicalSecret(expected), `projects/${NUMBER}/secrets/${expected}`].includes(value) }
export function assertSecretVersionIamTerraformPlan(value) {
  if (!Array.isArray(value?.resource_changes) || value.resource_changes.length !== 12 || value.resource_changes.some(row => row.change?.importing || row.previous_address)
    || value.deferred_changes?.length || value.resource_drift?.length) fail()
  const retained = value.resource_changes.filter(row => [...READBACK_IAM_ADDRESSES, ...PREBUILD_IAM_ADDRESSES].includes(row.address))
  assertPrebuildIamTerraformPlan({ resource_changes: retained })
  if (retained.some(row => !same(row.change.actions, ['no-op']))) fail()
  const additions = value.resource_changes.filter(row => SECRET_VERSION_IAM_ADDRESSES.includes(row.address))
  if (additions.length !== 5 || new Set(additions.map(row => row.address)).size !== 5) fail()
  for (const row of additions) {
    const spec = SECRET_VERSION_IAM_SPECS[row.address], after = row.change?.after, computed = row.change?.after_unknown ?? {}
    if (row.mode !== 'managed' || row.provider_name !== 'registry.terraform.io/hashicorp/google' || !after
      || !['create', 'no-op'].includes(row.change?.actions?.join(',')) || !exact(computed, Object.keys(computed))
      || after.deleted === true || after.stage && after.stage !== 'GA'
      || after.condition != null && (!Array.isArray(after.condition) || after.condition.length)
      || unknown(computed.condition) || unknown(computed.stage)) fail()
    for (const [key, expected] of Object.entries(spec)) if (unknown(computed[key]) || !(key === 'secret_id' ? secretEquals(after[key], expected)
      : key === 'permissions' ? Array.isArray(after[key]) && same(sorted(after[key]), sorted(expected)) : same(after[key], expected))) fail()
  }
  return value.resource_changes.map(row => ({ address: row.address, actions: row.change.actions })).sort((a, b) => a.address.localeCompare(b.address))
}
export function secretVersionIamContinuationPlan(readSource, sourceRevision) {
  const old = prebuildIamContinuationPlan(readSource, sourceRevision)
  return { ...old, sourceHashes: [...old.sourceHashes, ...[SECRET_VERSION_IAM_SOURCE_PATH, SECRET_VERSION_IAM_HUMAN_APPROVAL_PATH, ...SECRET_VERSION_IAM_EXECUTION_PATHS].map(p => ({ path: p, sha256: sha256(readSource(p, sourceRevision)) }))],
    resourceAddresses: [...old.resourceAddresses, ...SECRET_VERSION_IAM_ADDRESSES], resourceSpecs: { ...old.resourceSpecs, ...SECRET_VERSION_IAM_SPECS },
    retainedResourceAddresses: old.resourceAddresses, additiveResourceAddresses: SECRET_VERSION_IAM_ADDRESSES,
    secretScope: SECRET_VERSION_IAM_SECRETS.map(canonicalSecret), requestedPolicyVersion: 3 }
}
function normalizedBindings(policy) {
  if (!policy || !Array.isArray(policy.bindings) || policy.bindings.some(row => !row || typeof row.role !== 'string' || !Array.isArray(row.members) || row.members.some(member => typeof member !== 'string'))) fail()
  return policy.bindings.map(row => ({ ...row, members: sorted(row.members) })).sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
}
function assertRole(role) {
  if (!role || role.name !== SECRET_VERSION_IAM_ROLE || role.deleted != null && role.deleted !== false || role.stage !== 'GA'
    || !Array.isArray(role.includedPermissions) || !same(role.includedPermissions, ['secretmanager.versions.get'])) fail()
}
function strippedSecret(policy, applied) {
  const rows = normalizedBindings(policy), own = rows.filter(row => row.role === SECRET_VERSION_IAM_ROLE)
  if (applied === 'partial') {
    if (own.length > 1 || own.some(row => !exact(row, ['role', 'members']) || !row.members.length || new Set(row.members).size !== row.members.length || row.members.some(member => !SECRET_VERSION_IAM_MEMBERS.includes(member)))) fail()
  } else if (applied ? own.length !== 1 || !exact(own[0], ['role', 'members']) || !same(own[0].members, sorted(SECRET_VERSION_IAM_MEMBERS)) : own.length !== 0) fail()
  return rows.filter(row => row.role !== SECRET_VERSION_IAM_ROLE)
}
/** Preserve every unrelated binding, including conditions, and all project bindings. */
export function assertSecretVersionIamPolicyPair(before, after, { beforeApplied = false } = {}) {
  if (!exact(before?.secretPolicies, SECRET_VERSION_IAM_SECRETS) || !exact(after?.secretPolicies, SECRET_VERSION_IAM_SECRETS)) fail()
  if (beforeApplied) assertRole(before.secretVersionRole)
  else if (before.secretVersionRole !== null) fail()
  assertRole(after.secretVersionRole)
  if (!same(normalizedBindings(before.projectPolicy), normalizedBindings(after.projectPolicy))) fail('OPENSWX_SECRET_VERSION_IAM_PROJECT_POLICY_DRIFT')
  for (const secret of SECRET_VERSION_IAM_SECRETS) if (!same(strippedSecret(before.secretPolicies[secret], beforeApplied ? 'partial' : false), strippedSecret(after.secretPolicies[secret], true))) fail('OPENSWX_SECRET_VERSION_IAM_SECRET_POLICY_DRIFT')
  return { projectBindingsSha256: sha256(canonicalize(normalizedBindings(after.projectPolicy))),
    unrelatedSecretBindingsSha256: Object.fromEntries(SECRET_VERSION_IAM_SECRETS.map(secret => [secret, sha256(canonicalize(strippedSecret(after.secretPolicies[secret], true)))])) }
}
/** Normal actor GETs only; never Secret payload access or policy writes. */
export async function readSecretVersionIamLivePolicy(transport, { applied = true, allowPartial = false } = {}) {
  let role = null
  try { role = await transport.request(`https://iam.googleapis.com/v1/${SECRET_VERSION_IAM_ROLE}`) }
  catch (error) { if (error.code !== 'MISSING' || applied) throw error }
  if (applied) assertRole(role); else if (role !== null) fail()
  const projectPolicy = await transport.request(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) })
  normalizedBindings(projectPolicy)
  const secretPolicies = {}
  for (const secret of SECRET_VERSION_IAM_SECRETS) {
    const policy = await transport.request(`https://secretmanager.googleapis.com/v1/${canonicalSecret(secret)}:getIamPolicy?options.requestedPolicyVersion=3`)
    strippedSecret(policy, applied && allowPartial ? 'partial' : applied); secretPolicies[secret] = policy
  }
  return { projectPolicy, secretPolicies, secretVersionRole: role }
}
const BINDING = ['ownerApplicationId', 'actor', 'sourceRevision', 'sourceTree', 'sourceSha256', 'sourceProofRef', 'supplementalIamReadbackRef', 'prebuildIamContinuationRef', 'humanApprovalRef', 'capacityGateRef', 'approvedPlanRef', 'planSha256', 'inputRef', 'receiptUri']
const INPUT = ['schemaVersion', 'sourceRevision', 'sourceProofRef', 'supplementalIamReadbackRef', 'prebuildIamContinuationRef', 'humanApprovalRef', 'capacityGateRef', 'approvedPlanRef', 'receiptId', 'deadlineAt']
const PROOF = ['schemaVersion', ...BINDING, 'binaryPlanRef', 'binaryPlanSha256', 'terraformPlanRef', 'changes', 'requestedAt', 'deadlineAt', 'beforeReadbackRef', 'beforeApplied']
const RESULT = ['schemaVersion', ...BINDING, 'status', 'evidenceScope', 'requestRef', 'binaryPlanReceiptRef', 'binaryPlanSha256', 'beforeReadbackRef', 'afterReadbackRef', 'policyHashes', 'observedAt', 'mutation']
const schema = name => `aipdm.openswx-secret-version-iam-${name}.v1`
async function read(transport, ref) { assertOpenSwxWorkerRef(ref); return transport.readJson(ref, BUCKET, [PREFIX]) }
async function validateInputs({ transport, inputRef, readSource, normalActor }) {
  if (normalActor !== ACTOR || typeof readSource !== 'function') fail()
  const input = (await read(transport, inputRef)).value
  if (!exact(input, INPUT) || input.schemaVersion !== schema('input') || !revision(input.sourceRevision)
    || !/^[A-Za-z0-9-]{6,100}$/u.test(input.receiptId ?? '') || !Number.isFinite(Date.parse(input.deadlineAt))) fail()
  assertImmutableRef(input.sourceProofRef, BUCKET, ['receipts/releases'])
  const source = (await transport.readJson(input.sourceProofRef, BUCKET, ['receipts/releases'])).value
  if (source.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1' || source.ownerApplicationId !== 'ai-pdm'
    || source.repository !== 'jedchang0308-jenfu/AI-PDM' || source.branch !== 'main' || source.remoteRef !== 'refs/heads/main'
    || source.sourceRevision !== input.sourceRevision || source.remoteRevision !== input.sourceRevision || !revision(source.sourceTree)
    || !hash(source.sourceSha256) || !hash(source.migrationManifestSha256) || source.clean !== true || source.status !== 'SOURCE_FROZEN'
    || source.releaseAuthority !== true || source.evidenceScope !== 'PRODUCTION_BOUND'
    || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(source.releaseId ?? '') || input.sourceProofRef.uri !== `gs://${BUCKET}/receipts/releases/${source.releaseId}/source-lock.json`) fail()
  await readPrebuildIamContinuation({ transport, ref: input.prebuildIamContinuationRef, supplementalIamReadbackRef: input.supplementalIamReadbackRef,
    sourceRevision: input.sourceRevision, readSource, normalActor })
  const approval = await read(transport, input.humanApprovalRef), officialHuman = readSource(SECRET_VERSION_IAM_HUMAN_APPROVAL_PATH, input.sourceRevision)
  if (sha256(officialHuman) !== input.humanApprovalRef.sha256 || !same(approval.value, JSON.parse(officialHuman))) fail()
  const human = approval.value
  if (human.schemaVersion !== 'aipdm.dev122.b35-human-secret-version-iam-approval.v1' || human.project !== 'AI-PDM' || human.status !== 'APPROVED'
    || human.authorizationSource !== 'HUMAN_USER_MESSAGE_IN_CURRENT_THREAD' || human.environment !== 'PRODUCTION' || human.projectId !== PROJECT
    || human.projectNumber !== NUMBER || human.roleId !== 'aipdmOpenswxSecretVersionReadback' || !same(human.permissions, ['secretmanager.versions.get'])
    || !same(sorted(human.principals ?? []), sorted(SECRET_VERSION_IAM_MEMBERS)) || !same(sorted(human.secrets ?? []), sorted(SECRET_VERSION_IAM_SECRETS))
    || !same(sorted(human.resources ?? []), sorted(SECRET_VERSION_IAM_ADDRESSES)) || human.scope !== 'ONE_CUSTOM_ROLE_AND_FOUR_EXACT_SECRET_LEVEL_BINDINGS'
    || human.migration084 !== 'FORBIDDEN' || human.secretPayloadAccess !== 'NOT_GRANTED' || human.otherIam !== 'NOT_AUTHORIZED') fail()
  const plan = secretVersionIamContinuationPlan(readSource, input.sourceRevision), planSha256 = sha256(canonicalize(plan))
  const binding = { ownerApplicationId: 'ai-pdm', actor: normalActor, sourceRevision: input.sourceRevision, sourceTree: source.sourceTree, sourceSha256: source.sourceSha256,
    ...Object.fromEntries(['sourceProofRef', 'supplementalIamReadbackRef', 'prebuildIamContinuationRef', 'humanApprovalRef', 'capacityGateRef', 'approvedPlanRef'].map(key => [key, input[key]])),
    planSha256, inputRef, receiptUri: `gs://${BUCKET}/${PREFIX}/${input.receiptId}.json` }
  const approved = (await read(transport, input.approvedPlanRef)).value
  const approvedBinding = BINDING.filter(key => !['actor', 'approvedPlanRef', 'inputRef', 'receiptUri'].includes(key))
  if (!exact(approved, ['schemaVersion', ...approvedBinding, 'status', 'releaseAuthority', 'evidenceScope', 'plan']) || approved.schemaVersion !== schema('approved-plan')
    || approved.status !== 'APPROVED' || approved.releaseAuthority !== true || approved.evidenceScope !== 'HUMAN_APPROVED_SECRET_VERSION_IAM_PLAN'
    || !same(approved.plan, plan) || approvedBinding.some(key => !same(approved[key], binding[key]))) fail()
  const capacity = (await read(transport, input.capacityGateRef)).value
  if (capacity.project !== 'AI-PDM' || capacity.sourceRevision !== input.sourceRevision || capacity.status !== 'PASS' || !Number.isFinite(Date.parse(capacity.observedAt))) fail()
  return { input, source, binding, plan, capacity }
}
async function validateRequest(transport, request, binary, context) {
  const { binding, input, source, capacity } = context
  for (const [row, name] of [[request, 'request'], [binary, 'plan-binary']]) if (!exact(row, PROOF) || row.schemaVersion !== schema(name)
    || BINDING.some(key => !same(row[key], binding[key])) || !hash(row.binaryPlanSha256) || typeof row.beforeApplied !== 'boolean'
    || row.deadlineAt !== input.deadlineAt) fail()
  if (!same({ ...request, schemaVersion: binary.schemaVersion }, binary)) fail()
  const requested = Date.parse(request.requestedAt), end = Date.parse(request.deadlineAt)
  if (!Number.isFinite(requested) || end <= requested || end - requested > 600000
    || [source.observedAt, capacity.observedAt].some(at => !Number.isFinite(Date.parse(at)) || requested < Date.parse(at) || requested - Date.parse(at) > 600000)) fail()
  for (const [key, suffix] of [['binaryPlanRef', '-plan.tfplan'], ['terraformPlanRef', '-terraform-plan.json'], ['beforeReadbackRef', '-before.json']]) {
    assertImmutableRef(request[key], BUCKET, [PREFIX]); if (request[key].uri !== binding.receiptUri.replace(/\.json$/u, suffix)) fail()
  }
  const bytes = await transport.readBytes(request.binaryPlanRef.uri, { prefixes: [PREFIX], expectedSha256: request.binaryPlanRef.sha256 })
  if (sha256(bytes.bytes) !== request.binaryPlanSha256 || request.binaryPlanRef.sha256 !== request.binaryPlanSha256) fail()
  const changes = assertSecretVersionIamTerraformPlan((await read(transport, request.terraformPlanRef)).value)
  if (!same(changes, request.changes) || request.beforeApplied !== same(changes.find(row => row.address === SECRET_VERSION_IAM_ADDRESSES[0]).actions, ['no-op'])) fail()
  return request
}
function assertPolicyReceipt(row, phase, actor) {
  if (!exact(row, ['schemaVersion', 'ownerApplicationId', 'projectId', 'actor', 'phase', 'observedAt', 'projectPolicy', 'secretPolicies', 'secretVersionRole'])
    || row.schemaVersion !== schema('policy') || row.ownerApplicationId !== 'ai-pdm' || row.projectId !== PROJECT || row.actor !== actor || row.phase !== phase
    || !Number.isFinite(Date.parse(row.observedAt))) fail()
}
/** Immutable receipt joins only: safe for producer/resolver reuse without IAM GET capability. */
export async function readSecretVersionIamContinuation({ transport, ref, sourceRevision, sourceLockRef, readSource, normalActor, supplementalIamReadbackRef, prebuildIamContinuationRef }) {
  const result = await read(transport, ref), value = result.value
  if (!exact(value, RESULT) || value.schemaVersion !== schema('continuation') || value.status !== 'APPLIED' || value.evidenceScope !== 'PRODUCTION_PROVIDER'
    || !['APPLY_THEN_READBACK', 'UNKNOWN_APPLY_THEN_READBACK', 'READBACK_ONLY'].includes(value.mutation)) fail()
  const context = await validateInputs({ transport, inputRef: value.inputRef, readSource, normalActor })
  if (sourceRevision !== context.input.sourceRevision || value.receiptUri !== ref.uri || BINDING.some(key => !same(value[key], context.binding[key]))
    || sourceLockRef && !same(value.sourceProofRef, sourceLockRef)
    || supplementalIamReadbackRef && !same(value.supplementalIamReadbackRef, supplementalIamReadbackRef)
    || prebuildIamContinuationRef && !same(value.prebuildIamContinuationRef, prebuildIamContinuationRef)) fail()
  for (const [key, suffix] of [['requestRef', '-request.json'], ['binaryPlanReceiptRef', '-plan.json'], ['beforeReadbackRef', '-before.json'], ['afterReadbackRef', '-after.json']])
    if (value[key]?.uri !== ref.uri.replace(/\.json$/u, suffix)) fail()
  const request = await validateRequest(transport, (await read(transport, value.requestRef)).value, (await read(transport, value.binaryPlanReceiptRef)).value, context)
  if (value.binaryPlanSha256 !== request.binaryPlanSha256 || !same(value.beforeReadbackRef, request.beforeReadbackRef)) fail()
  const before = (await read(transport, value.beforeReadbackRef)).value, after = (await read(transport, value.afterReadbackRef)).value
  assertPolicyReceipt(before, 'BEFORE', normalActor); assertPolicyReceipt(after, 'AFTER', normalActor)
  const requested = Date.parse(request.requestedAt), end = Date.parse(request.deadlineAt), b = Date.parse(before.observedAt), a = Date.parse(after.observedAt), observed = Date.parse(value.observedAt)
  if (![observed, b, a].every(Number.isFinite) || b > requested || requested - b > 600000 || a < requested || a > end || observed < a || observed > end) fail()
  const policies = assertSecretVersionIamPolicyPair(before, after, { beforeApplied: request.beforeApplied })
  if (!same(value.policyHashes, policies)) fail()
  const historical = (await read(transport, value.prebuildIamContinuationRef)).value
  const retained = await readbackPolicyRetained(transport, before, historical, value.supplementalIamReadbackRef, false)
  if (!retained) fail()
  return result
}
async function readbackPolicyRetained(transport, policy, historical, supplementalRef, live) {
  const project = normalizedBindings(policy.projectPolicy)
  const scheduler = 'projects/jenfu-platform-prod/roles/aipdmOpenswxSchedulerReadback'
  if (sha256(canonicalize(project.filter(row => row.role !== scheduler))) !== historical.unrelatedProjectBindingsAfterSha256) fail()
  if (live) {
    const old = (await read(transport, supplementalRef)).value
    const current = await readbackReleaseIam(transport, { prebuildIamContinuation: true })
    for (const key of ['roles', 'jobBindings', 'schedulerBinding']) if (!same(current[key], old.readback[key])) fail()
    if (current.unrelatedProjectBindingsSha256 !== historical.unrelatedProjectBindingsAfterSha256) fail()
  }
  return true
}
export async function assertSecretVersionIamContinuation(args) {
  const row = await readSecretVersionIamContinuation(args)
  const before = (await read(args.transport, row.value.beforeReadbackRef)).value
  const current = await readSecretVersionIamLivePolicy(args.transport)
  assertSecretVersionIamPolicyPair(before, current, { beforeApplied: (await read(args.transport, row.value.requestRef)).value.beforeApplied })
  await readbackPolicyRetained(args.transport, current, (await read(args.transport, row.value.prebuildIamContinuationRef)).value, row.value.supplementalIamReadbackRef, true)
  return row
}
async function optional(transport, uri) {
  try { const row = await transport.readBytes(uri, { prefixes: [PREFIX] }); return { ...row, value: JSON.parse(row.bytes) } }
  catch (error) { if (error.code === 'MISSING') return null; throw error }
}
async function put(transport, uri, bytes, contentType) {
  let row
  try { row = await transport.putBytes(uri, bytes, { bucket: BUCKET, prefix: PREFIX, contentType }) }
  catch (error) { try { row = await transport.readBytes(uri, { prefixes: [PREFIX], expectedSha256: sha256(bytes) }) } catch { throw error } }
  assertImmutableRef(row.ref, BUCKET, [PREFIX])
  if (row.ref.uri !== uri || sha256(row.bytes) !== sha256(bytes) || row.ref.sha256 !== sha256(bytes)) fail()
  return row
}
const putJson = async (transport, uri, value) => { const row = await put(transport, uri, Buffer.from(canonicalize(value) + '\n'), 'application/json'); return { ...row, value: JSON.parse(row.bytes) } }
function checkDeadline(input) { if (Date.now() > Date.parse(input.deadlineAt)) fail('OPENSWX_SECRET_VERSION_IAM_DEADLINE') }
/** Fixed source-owned executor: fresh saved binary once; existing request always readback only. */
export async function executeSecretVersionIamContinuation({ inputRef, transport, readSource, root, oauthToken, verifyActor, terraformRunner }) {
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'GOOGLE_CREDENTIALS', 'GOOGLE_BACKEND_CREDENTIALS']) if (process.env[key]) fail('OPENSWX_ADC_FORBIDDEN')
  if (typeof oauthToken !== 'string' || oauthToken.length < 20 || (await verifyActor(transport)).email !== ACTOR) fail()
  const context = await validateInputs({ transport, inputRef, readSource, normalActor: ACTOR }), { input, binding, plan } = context
  const uri = suffix => binding.receiptUri.replace(/\.json$/u, suffix)
  let request = await optional(transport, uri('-request.json')), binary = await optional(transport, uri('-plan.json'))
  const terminal = await optional(transport, binding.receiptUri)
  if (Boolean(request) !== Boolean(binary)) fail()
  if (request) await validateRequest(transport, request.value, binary.value, context)
  if (terminal) { if (!request) fail(); return assertSecretVersionIamContinuation({ transport, ref: terminal.ref, sourceRevision: input.sourceRevision, readSource, normalActor: ACTOR }) }
  let mutation = 'READBACK_ONLY'
  if (!request) {
    checkDeadline(input)
    if (Date.parse(input.deadlineAt) - Date.now() > 600000) fail()
    const canonicalRoot = await fs.realpath(root)
    for (const row of plan.sourceHashes) if (sha256(await fs.readFile(path.join(canonicalRoot, row.path))) !== row.sha256) fail('OPENSWX_SECRET_VERSION_IAM_SOURCE_NOT_FROZEN')
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'aipdm-dev122-secret-version-iam-'))
    try {
      for (const row of plan.sourceHashes.filter(row => row.path.endsWith('.tf'))) await fs.writeFile(path.join(temporary, path.basename(row.path)), readSource(row.path, input.sourceRevision))
      const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: temporary, TMP: temporary, TF_DATA_DIR: path.join(temporary, 'plugins'), TF_IN_AUTOMATION: '1', TF_INPUT: '0', GOOGLE_OAUTH_ACCESS_TOKEN: oauthToken }
      const run = args => { checkDeadline(input); const result = (terraformRunner ?? ((a, options) => spawnSync('terraform', a, options)))(args,
        { cwd: temporary, env, windowsHide: true, encoding: 'utf8', timeout: Math.max(1, Date.parse(input.deadlineAt) - Date.now()), maxBuffer: 8 * 1024 * 1024 });
        if (result.error || result.status !== 0) fail('OPENSWX_SECRET_VERSION_IAM_TERRAFORM_UNKNOWN'); return result.stdout }
      run(['init', '-input=false', '-no-color']); run(['validate', '-json']); run(['plan', '-input=false', '-no-color', '-out=owned.tfplan'])
      const planBytes = Buffer.from(run(['show', '-json', 'owned.tfplan'])), changes = assertSecretVersionIamTerraformPlan(JSON.parse(planBytes))
      const beforeApplied = same(changes.find(row => row.address === SECRET_VERSION_IAM_ADDRESSES[0]).actions, ['no-op'])
      const before = await readSecretVersionIamLivePolicy(transport, { applied: beforeApplied, allowPartial: true })
      await readbackPolicyRetained(transport, before, (await read(transport, input.prebuildIamContinuationRef)).value, input.supplementalIamReadbackRef, true)
      const policy = { schemaVersion: schema('policy'), ownerApplicationId: 'ai-pdm', projectId: PROJECT, actor: ACTOR, phase: 'BEFORE', observedAt: transport.now(), ...before }
      const beforeReadbackRef = (await putJson(transport, uri('-before.json'), policy)).ref
      const binaryBytes = await fs.readFile(path.join(temporary, 'owned.tfplan'))
      const binaryPlanRef = (await put(transport, uri('-plan.tfplan'), binaryBytes, 'application/octet-stream')).ref
      const terraformPlanRef = (await put(transport, uri('-terraform-plan.json'), planBytes, 'application/json')).ref
      const proof = { schemaVersion: schema('request'), ...binding, binaryPlanRef, binaryPlanSha256: sha256(binaryBytes), terraformPlanRef, changes, requestedAt: transport.now(), deadlineAt: input.deadlineAt, beforeReadbackRef, beforeApplied }
      await validateRequest(transport, proof, { ...proof, schemaVersion: schema('plan-binary') }, context)
      binary = await putJson(transport, uri('-plan.json'), { ...proof, schemaVersion: schema('plan-binary') })
      request = await putJson(transport, uri('-request.json'), proof)
      if (sha256(await fs.readFile(path.join(temporary, 'owned.tfplan'))) !== proof.binaryPlanSha256) fail()
      checkDeadline(input)
      try { run(['apply', '-input=false', '-no-color', '-auto-approve', 'owned.tfplan']); mutation = 'APPLY_THEN_READBACK' }
      catch { mutation = 'UNKNOWN_APPLY_THEN_READBACK' }
    } finally {
      if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('aipdm-dev122-secret-version-iam-')) fail()
      await fs.rm(temporary, { recursive: true, force: true })
    }
  }
  const before = (await read(transport, request.value.beforeReadbackRef)).value, after = await readSecretVersionIamLivePolicy(transport)
  const policyHashes = assertSecretVersionIamPolicyPair(before, after, { beforeApplied: request.value.beforeApplied })
  await readbackPolicyRetained(transport, after, (await read(transport, input.prebuildIamContinuationRef)).value, input.supplementalIamReadbackRef, true)
  checkDeadline(input)
  const captured = await optional(transport, uri('-after.json'))
  let afterRef
  if (captured) {
    assertPolicyReceipt(captured.value, 'AFTER', ACTOR)
    if (!same(assertSecretVersionIamPolicyPair(before, captured.value, { beforeApplied: request.value.beforeApplied }), policyHashes)) fail()
    afterRef = captured.ref
  } else afterRef = (await putJson(transport, uri('-after.json'), { schemaVersion: schema('policy'), ownerApplicationId: 'ai-pdm', projectId: PROJECT, actor: ACTOR, phase: 'AFTER', observedAt: transport.now(), ...after })).ref
  const result = await putJson(transport, binding.receiptUri, { schemaVersion: schema('continuation'), ...binding, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER',
    requestRef: request.ref, binaryPlanReceiptRef: binary.ref, binaryPlanSha256: request.value.binaryPlanSha256, beforeReadbackRef: request.value.beforeReadbackRef, afterReadbackRef: afterRef,
    policyHashes, observedAt: transport.now(), mutation })
  return readSecretVersionIamContinuation({ transport, ref: result.ref, sourceRevision: input.sourceRevision, readSource, normalActor: ACTOR })
}
