import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { readGitBlob } from '../../../scripts/lib/dev012-owner-stage-executor.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { READBACK_IAM_PATHS, READBACK_IAM_ADDRESSES, READBACK_IAM_SPECS, READBACK_JOB_ROLE, READBACK_SCHEDULER_ROLE,
  assertReadbackIamTerraformPlan, readbackIamPlan, expectedReadbackJobBindings,
  readReadbackIamReceipt, assertReadbackIamReceipt, executeReleaseReadbackIam,
  PREBUILD_IAM_ROLE, PREBUILD_IAM_PERMISSIONS, PREBUILD_IAM_SOURCE_PATH, PREBUILD_IAM_HUMAN_APPROVAL_SHA256, PREBUILD_IAM_SPECS, PREBUILD_IAM_ADDRESSES,
  prebuildIamContinuationPlan, assertPrebuildIamTerraformPlan, readPrebuildIamContinuation } from '../../../scripts/lib/dev122-openswx-readback-iam.mjs'
import { canonicalize, sha256, releasePaths } from '../../../scripts/lib/dev012-owner-release-runtime.mjs'
import { OPENSWX_TERRAFORM_ADDRESSES, OPENSWX_TERRAFORM_PATHS, assertWorkerTerraformPlan, parseOpenSwxBootstrapArgs, parseWorkerStdoutMarker, readWorkerStdoutProof, appendReaderCredential, addCredentialVersion, verifyExistingReaderCredentials, executeOpenSwxBootstrap, executeOpenSwxResources, readCurrentReadyWorkerResources, readPausedRepairWorkerResources } from '../../../scripts/lib/dev122-openswx-bootstrap.mjs'
import { WORKER_PROFILE_PATH, WORKER_SOURCE_PATHS, normalizeWorkerTemplate, workerTemplate, workerTemplatePolicy, workerReceipt, workerJobName, workerSchedulerName, readWorkerFullEvidence, readPriorWorkerActivation, runWorkerFinite, readBootstrapSupplementalIam } from '../../../scripts/lib/dev122-openswx-owner-release.mjs'

import { assertDev117ReleaseIntent } from '../../../scripts/lib/dev117-ai-pdm-continuous-release.mjs'
import { buildSourceFreeze, executePrerequisiteProducer } from '../../../scripts/lib/dev012-owner-prerequisite-producer.mjs'
const profileBytes = fs.readFileSync(new URL('../../../config/release/dev122-openswx-worker.json', import.meta.url)), profile = JSON.parse(profileBytes)
const appProfile = JSON.parse(fs.readFileSync(new URL('../../../config/release/dev117-ai-pdm-independent-production-v3.json', import.meta.url)))
const readSource = path => fs.readFileSync(new URL(`../../../${path}`, import.meta.url))
const tokenName = `projects/9536592944/secrets/${profile.tokenSecretId}/versions/7`, registryName = `projects/9536592944/secrets/${profile.registrySecretId}/versions/9`
const token = 'T'.repeat(43), registry = { schemaVersion: 'ai-pdm.workload-credentials.v1', workloads: [{ id: profile.readerId, token, purposes: [profile.readerPurpose], capabilities: [profile.readerCapability] }] }
const executionName = `${workerJobName().replace(profile.projectId, profile.projectNumber)}/executions/fixture-execution`
const deadline = () => new Date(Date.now() + 120_000).toISOString()
const ref = name => ({ uri: `${profile.receiptRoot}/${name}.json`, sha256: 'a'.repeat(64) })
function memory() {
  const objects = new Map(), calls = []
  const putJson = async (uri, value) => { const bytes = Buffer.from(canonicalize(value)), row = { bytes, value, ref: { uri, sha256: sha256(bytes) }, metadata: { generation: '1' } }; if (objects.has(uri)) assert.deepEqual(objects.get(uri).value, value); objects.set(uri, row); return { bytes: row.bytes, ref: row.ref, metadata: row.metadata } }
  const readBytes = async uri => { if (!objects.has(uri)) throw Object.assign(Error('MISSING'), { code: 'MISSING' }); return objects.get(uri) }
  const readJson = async reference => { const row = await readBytes(reference.uri); assert.equal(row.ref.sha256, reference.sha256); return row }
  return { objects, calls, transport: { putJson, readBytes, readJson, now: () => new Date().toISOString() }, put: async (name, value) => (await putJson(ref(name).uri, value)).ref }
}
function descriptor(sourceRevision, purpose = 'build_only') {
  const plan = { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, sourceHashes: OPENSWX_TERRAFORM_PATHS.map(path => ({ path, sha256: sha256(readSource(path)) })), resourceAddresses: OPENSWX_TERRAFORM_ADDRESSES, allowedActions: ['create', 'no-op'] }
  const value = { schemaVersion: 'aipdm.openswx-worker-descriptor.v1', ownerApplicationId: 'ai-pdm', purpose, sourceRevision, sourceArchiveSha256: sha256(sourceRevision), workerProfileSha256: sha256(profileBytes), resourcePlanHash: sha256(canonicalize(plan)), normalTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'normal'))), selftestTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'selftest'))) }
  for (const key of ['projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'dispatchPolicy', 'bounds', 'receiptRoot']) value[key] = profile[key]
  return { value, plan }
}
const READBACK_IAM_PROJECT = 'jenfu-platform-prod'
const READBACK_IAM_VERIFIER = 'serviceAccount:aipdm-prod-verifier@jenfu-platform-prod.iam.gserviceaccount.com'
const READBACK_IAM_DEPLOYER = 'serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com'
const READBACK_IAM_JOB_POLICY_URL = 'https://run.googleapis.com/v2/' + workerJobName() + ':getIamPolicy'
const READBACK_IAM_PROJECT_POLICY_URL = 'https://cloudresourcemanager.googleapis.com/v1/projects/' + READBACK_IAM_PROJECT + ':getIamPolicy'

function readbackIamPlanFixture(actionFor = () => ['create']) {
  return { resource_changes: READBACK_IAM_ADDRESSES.map(address => {
    const spec = structuredClone(READBACK_IAM_SPECS[address])
    const afterUnknown = { id: true }
    if (address.startsWith('google_project_iam_custom_role.')) { spec.stage = 'GA'; spec.deleted = false; afterUnknown.name = [true] }
    return { address, mode: 'managed', provider_name: 'registry.terraform.io/hashicorp/google',
      change: { actions: actionFor(address), after: spec, after_unknown: afterUnknown } }
  }) }
}

function readbackIamRoles() {
  return [
    { name: READBACK_JOB_ROLE, permissions: ['run.executions.list', 'run.jobs.get'] },
    { name: READBACK_SCHEDULER_ROLE, permissions: ['cloudscheduler.jobs.get'] },
  ]
}
function readbackIamProjectPolicy() {
  return [
    { role: READBACK_SCHEDULER_ROLE, members: [READBACK_IAM_DEPLOYER, READBACK_IAM_VERIFIER].sort() },
    { role: 'roles/jenfu-fixture-existing-reader', members: ['serviceAccount:existing-reader@jenfu-platform-prod.iam.gserviceaccount.com'] },
  ]
}
function readbackIamUnrelatedHash(bindings) {
  const unrelated = bindings.filter(row => row.role !== READBACK_SCHEDULER_ROLE)
    .map(row => ({ ...row, members: [...(row.members ?? [])].sort() }))
    .sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
  return sha256(canonicalize(unrelated))
}
function readbackIamReadback(bindings = readbackIamProjectPolicy()) {
  return {
    roles: readbackIamRoles(),
    jobBindings: expectedReadbackJobBindings(),
    schedulerBinding: { role: READBACK_SCHEDULER_ROLE, members: [READBACK_IAM_DEPLOYER, READBACK_IAM_VERIFIER].sort(), effectiveScope: 'PROJECT_WIDE_GET' },
    unrelatedProjectBindingsSha256: readbackIamUnrelatedHash(bindings),
  }
}

async function seedReadbackIamApproval(h, { descriptorValue, descriptorRef, workerBuildRef, receiptId }) {
  const plan = readbackIamPlan(readSource, descriptorValue.sourceRevision)
  const capacityGateRef = await h.put('readback-capacity-' + receiptId, {
    project: 'AI-PDM', sourceRevision: descriptorValue.sourceRevision, status: 'PASS', observedAt: h.transport.now(),
  })
  const sourceBinding = { descriptorRef, workerBuildRef, sourceArchiveSha256: descriptorValue.sourceArchiveSha256 }
  const approvedPlanRef = await h.put('readback-approved-' + receiptId, {
    schemaVersion: 'aipdm.openswx-approved-readback-iam-plan.v1', ownerApplicationId: 'ai-pdm', status: 'APPROVED',
    releaseAuthority: true, evidenceScope: 'HUMAN_APPROVED_READBACK_IAM_PLAN', sourceRevision: descriptorValue.sourceRevision,
    authorizationStatementSha256: 'c'.repeat(64), planSha256: sha256(canonicalize(plan)), plan, ...sourceBinding, capacityGateRef,
  })
  const inputRef = await h.put('readback-input-' + receiptId, {
    schemaVersion: 'aipdm.openswx-release-readback-iam-input.v1', sourceRevision: descriptorValue.sourceRevision,
    approvedPlanRef, descriptorRef, workerBuildRef, receiptId, deadlineAt: deadline(),
  })
  return { plan, sourceBinding, approvedPlanRef, inputRef, receiptId }
}

async function seedReadbackIamReceipt(h, args) {
  const base = await seedReadbackIamApproval(h, args)
  const receiptUri = ref(base.receiptId).uri
  const binding = {
    ownerApplicationId: 'ai-pdm', actor: profile.normalActor, sourceRevision: args.descriptorValue.sourceRevision,
    ...base.sourceBinding, approvedPlanRef: base.approvedPlanRef, planSha256: sha256(canonicalize(base.plan)), receiptUri,
  }
  const binaryPlanSha256 = 'd'.repeat(64), unrelatedProjectBindingsBeforeSha256 = readbackIamUnrelatedHash(readbackIamProjectPolicy())
  const changes = [...READBACK_IAM_ADDRESSES].sort().map(address => ({ address, actions: ['create'] }))
  const commonProof = { ...binding, binaryPlanSha256, changes, requestedAt: h.transport.now(), unrelatedProjectBindingsBeforeSha256 }
  const requestRef = await h.put(base.receiptId + '-request', {
    schemaVersion: 'aipdm.openswx-release-readback-iam-request.v1', ...commonProof,
  })
  const binaryPlanReceiptRef = await h.put(base.receiptId + '-plan', {
    schemaVersion: 'aipdm.openswx-release-readback-iam-plan-binary.v1', ...commonProof,
  })
  const receiptRef = await h.put(base.receiptId, {
    schemaVersion: 'aipdm.openswx-release-readback-iam.v1', ...binding, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER',
    inputRef: base.inputRef, requestRef, binaryPlanReceiptRef, binaryPlanSha256,
    sourceArchiveSha256: args.descriptorValue.sourceArchiveSha256,
    readback: readbackIamReadback(),
    mutation: 'APPLY_THEN_READBACK', observedAt: h.transport.now(),
  })
  return { ...base, receiptRef, requestRef, binaryPlanReceiptRef }
}

const prebuildHumanApprovalBytes = Buffer.from('ew0KICAic2NoZW1hVmVyc2lvbiI6ICJhaXBkbS5kZXYxMjIuYjE1LWh1bWFuLWlhbS1hcHByb3ZhbC52MSIsDQogICJwcm9qZWN0IjogIkFJLVBETSIsDQogICJhdXRob3JpemF0aW9uU291cmNlIjogIkhVTUFOX1VTRVJfTUVTU0FHRV9JTl9DVVJSRU5UX1RIUkVBRCIsDQogICJ1c2VyVGV4dCI6ICLmoLjlh4YgMiDpoIXoo5zmrIrvvIznubznuozkuIrnt5osIOS9v+eUqOePvuacieWAi+a4rOippuW4s+iZnyIsDQogICJzdGF0dXMiOiAiQVBQUk9WRUQiLA0KICAiZW52aXJvbm1lbnQiOiAiUFJPRFVDVElPTiIsDQogICJwcm9qZWN0SWQiOiAiamVuZnUtcGxhdGZvcm0tcHJvZCIsDQogICJwcm9qZWN0TnVtYmVyIjogIjk1MzY1OTI5NDQiLA0KICAicHJpbmNpcGFsIjogInNlcnZpY2VBY2NvdW50OmFpcGRtLXByb2QtdmVyaWZpZXJAamVuZnUtcGxhdGZvcm0tcHJvZC5pYW0uZ3NlcnZpY2VhY2NvdW50LmNvbSIsDQogICJyb2xlSWQiOiAiYWlwZG1EZXYxMjJQcmVidWlsZExpc3QiLA0KICAicGVybWlzc2lvbnMiOiBbDQogICAgImNsb3VkYnVpbGQuYnVpbGRzLmxpc3QiLA0KICAgICJzZXJ2aWNldXNhZ2Uuc2VydmljZXMudXNlIg0KICBdLA0KICAicmVzb3VyY2VzIjogWw0KICAgICJnb29nbGVfcHJvamVjdF9pYW1fY3VzdG9tX3JvbGUucHJlYnVpbGRfbGlzdF9yZWFkYmFjayIsDQogICAgImdvb2dsZV9wcm9qZWN0X2lhbV9tZW1iZXIudmVyaWZpZXJfcHJlYnVpbGRfbGlzdF9yZWFkYmFjayINCiAgXSwNCiAgInZpc2liaWxpdHkiOiAiUFJPSkVDVF9XSURFX0JVSUxEX0xJU1RfTUVUQURBVEE7UVVFUllfRklMVEVSX05PVF9JQU1fQk9VTkRBUlkiLA0KICAib3JpZ2luYWxQcm9wb3NhbEZyZWV6ZVNoYTI1NiI6ICI4ZjUzMGUyNzg0NzIxOTBlYTBlNjEyMDQ1MWZjN2I5MDk1YzcxNDY2ZDZmMzgwZDY0NGU4MGNmYWYwZWJjMDEyIiwNCiAgIm9yaWdpbmFsUHJvcG9zYWxRY1NoYTI1NiI6ICIxY2Q2YzdlNTMxNjBjNmZkYmJjOGM4ZWFhNjQ0MGNhMzA2ZTY3M2VlYzg0YThiNGYwOTNmOGViZTZiMDI3NDc3IiwNCiAgInN0YW5kaW5nU2NvcGUiOiAiQUktUERNIHByb2R1Y3Rpb24gc291cmNlL1BSL0NJL2J1aWxkL2Jvb3RzdHJhcC9mdWxsIHJlbGVhc2UgYW5kIHZlcmlmaWNhdGlvbjsgb3JpZ2luYWwxMi9vcmlnaW5hbDUgdW5jaGFuZ2VkOyBubyBjcm9zcy1wcm9qZWN0IGRldmVsb3BtZW50IiwNCiAgInRlc3RBY2NvdW50UmV1c2UiOiAiRVhJU1RJTkdfVEVTVF9BQ0NPVU5UU19PTkxZO05PX0FDQ09VTlRfQ1JFQVRJT05fT1JfQ0FQQUJJTElUWV9DSEFOR0UiLA0KICAibmF0aXZlRjAxRiI6ICJVU0VSX1BST0RVQ1RJT05fVkFMSURBVElPTl9QRU5ESU5HIiwNCiAgIm9ic2VydmVkQXQiOiAiMjAyNi0xMC0wN1QwNjoyNjoyMS41NDkzMTkrMDA6MDAiDQp9DQo=', 'base64')
function prebuildTerraformFixture() {
  return { resource_changes: [...readbackIamPlanFixture(() => ['no-op']).resource_changes,
    ...PREBUILD_IAM_ADDRESSES.map(address => ({ address, mode: 'managed', provider_name: 'registry.terraform.io/hashicorp/google',
      change: { actions: ['create'], after: structuredClone(PREBUILD_IAM_SPECS[address]), after_unknown: { id: true } } }))] }
}
async function seedPrebuildIamContinuation(h, supplementalIamReadbackRef, name = 'prebuild-iam-continuation') {
  assert.equal(sha256(prebuildHumanApprovalBytes), PREBUILD_IAM_HUMAN_APPROVAL_SHA256)
  const receiptUri = ref(name).uri, times = Date.now(), at = delta => new Date(times + delta).toISOString()
  const humanApprovalRef = { uri: ref(name + '-human').uri, sha256: PREBUILD_IAM_HUMAN_APPROVAL_SHA256 }
  h.objects.set(humanApprovalRef.uri, { bytes: prebuildHumanApprovalBytes, value: JSON.parse(prebuildHumanApprovalBytes), ref: humanApprovalRef, metadata: { generation: '1' } })
  const sourceRevision = 'f'.repeat(40), sourceTree = '1'.repeat(40), sourceSha256 = '2'.repeat(64)
  const source = { schemaVersion: 'jenfu.dev012.owner-source-lock.v1', ownerApplicationId: 'ai-pdm', repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main',
    releaseId: 'DEV122-PREBUILD-IAM-001', sourceRevision, sourceTree, sourceSha256, migrationManifestSha256: '3'.repeat(64), clean: true,
    remoteRef: 'refs/heads/main', remoteRevision: sourceRevision, status: 'SOURCE_FROZEN', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', observedAt: at(-1500) }
  const sourceProofRef = (await h.transport.putJson(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${source.releaseId}/source-lock.json`, source)).ref
  const plan = prebuildIamContinuationPlan(readSource, sourceRevision), planSha256 = sha256(canonicalize(plan))
  const planBinding = { ownerApplicationId: 'ai-pdm', sourceRevision, sourceTree, sourceSha256, sourceProofRef, supplementalIamReadbackRef, humanApprovalRef }
  const approvedPlanRef = await h.put(name + '-approved', { schemaVersion: 'aipdm.openswx-approved-prebuild-readback-iam-plan.v1', ...planBinding,
    status: 'APPROVED', releaseAuthority: true, evidenceScope: 'HUMAN_APPROVED_PREBUILD_READBACK_IAM_PLAN', planSha256, plan })
  const beforePolicy = { bindings: readbackIamProjectPolicy(), etag: 'recorded-before', version: 3 }
  const afterPolicy = { bindings: [...readbackIamProjectPolicy(), { role: PREBUILD_IAM_ROLE, members: [READBACK_IAM_VERIFIER] }], etag: 'recorded-after', version: 3 }
  const role = { name: PREBUILD_IAM_ROLE, stage: 'GA', includedPermissions: [...PREBUILD_IAM_PERMISSIONS] }
  const policy = (phase, projectPolicy, prebuildRole, observedAt) => ({ schemaVersion: 'aipdm.openswx-prebuild-readback-iam-policy.v1', ownerApplicationId: 'ai-pdm', projectId: READBACK_IAM_PROJECT,
    actor: profile.normalActor, phase, observedAt, projectPolicy, prebuildRole })
  const beforeReadbackRef = await h.put(name + '-before', policy('BEFORE', beforePolicy, null, at(-1000)))
  const afterReadbackRef = await h.put(name + '-after', policy('AFTER', afterPolicy, role, at(-250)))
  const binaryBytes = Buffer.from('RECORDED_FROZEN_TERRAFORM_BINARY_FIXTURE_NOT_A_PRODUCTION_PLAN'), binaryPlanSha256 = sha256(binaryBytes)
  const binaryPlanRef = { uri: receiptUri.replace(/\.json$/u, '-plan.tfplan'), sha256: binaryPlanSha256 }
  h.objects.set(binaryPlanRef.uri, { bytes: binaryBytes, ref: binaryPlanRef, metadata: { generation: '1' } })
  const terraformPlanRef = await h.put(name + '-terraform-plan', prebuildTerraformFixture())
  const binding = { ...planBinding, actor: profile.normalActor, approvedPlanRef, planSha256, receiptUri }
  const request = { ...binding, binaryPlanRef, binaryPlanSha256, terraformPlanRef, changes: assertPrebuildIamTerraformPlan(prebuildTerraformFixture()),
    requestedAt: at(-500), deadlineAt: at(120000), beforeReadbackRef }
  const requestRef = await h.put(name + '-request', { schemaVersion: 'aipdm.openswx-prebuild-readback-iam-request.v1', ...request })
  const binaryPlanReceiptRef = await h.put(name + '-plan', { schemaVersion: 'aipdm.openswx-prebuild-readback-iam-plan-binary.v1', ...request })
  const continuationRef = await h.put(name, { schemaVersion: 'aipdm.openswx-prebuild-readback-iam-continuation.v1', ...binding, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER',
    requestRef, binaryPlanReceiptRef, binaryPlanSha256, beforeReadbackRef, afterReadbackRef,
    unrelatedProjectBindingsBeforeSha256: readbackIamUnrelatedHash(beforePolicy.bindings), unrelatedProjectBindingsAfterSha256: readbackIamUnrelatedHash(afterPolicy.bindings),
    observedAt: at(-100), mutation: 'UNKNOWN_APPLY_THEN_READBACK' })
  return { continuationRef, sourceProofRef, approvedPlanRef, requestRef, binaryPlanReceiptRef, beforeReadbackRef, afterReadbackRef, binaryPlanRef, terraformPlanRef, role, afterPolicy }
}
import { SECRET_VERSION_IAM_ROLE, SECRET_VERSION_IAM_MEMBERS, SECRET_VERSION_IAM_SECRETS, SECRET_VERSION_IAM_HUMAN_APPROVAL_PATH,
  SECRET_VERSION_IAM_ADDRESSES, SECRET_VERSION_IAM_SPECS, secretVersionIamContinuationPlan, assertSecretVersionIamTerraformPlan, assertSecretVersionIamPolicyPair } from '../../../scripts/lib/dev122-openswx-secret-version-iam.mjs'
const secretSchema = name => `aipdm.openswx-secret-version-iam-${name}.v1`
export function secretVersionTerraformFixture() {
  return { resource_changes: [...prebuildTerraformFixture().resource_changes.map(row => ({ ...row, change: { ...row.change, actions: ['no-op'] } })),
    ...SECRET_VERSION_IAM_ADDRESSES.map(address => ({ address, mode: 'managed', provider_name: 'registry.terraform.io/hashicorp/google', change: { actions: ['create'], after: structuredClone(SECRET_VERSION_IAM_SPECS[address]), after_unknown: { id: true } } }))] }
}
/** Test-only authentic joins; no provider, credentials, payloads, or production claims. */
export async function seedSecretVersionIamContinuation(h, { sourceRevision = 'f'.repeat(40), sourceLockRef, supplementalIamReadbackRef, prebuildIamContinuationRef, reader = readSource, name = 'secret-version-iam', secretPolicies = null } = {}) {
  const t = Date.now(), at = delta => new Date(t + delta).toISOString()
  const source = sourceLockRef ? (await h.transport.readJson(sourceLockRef)).value : { schemaVersion: 'jenfu.dev012.owner-source-lock.v1', ownerApplicationId: 'ai-pdm', repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main', releaseId: 'DEV122-SECRET-VERSION-IAM-001', sourceRevision, sourceTree: '1'.repeat(40), sourceSha256: '2'.repeat(64), migrationManifestSha256: '3'.repeat(64), clean: true, remoteRef: 'refs/heads/main', remoteRevision: sourceRevision, status: 'SOURCE_FROZEN', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', observedAt: at(-1200) }
  sourceLockRef ??= (await h.transport.putJson(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${source.releaseId}/source-lock.json`, source)).ref
  const historical = (await h.transport.readJson(prebuildIamContinuationRef)).value
  const priorPolicy = (await h.transport.readJson(historical.afterReadbackRef)).value.projectPolicy
  const humanBytes = reader(SECRET_VERSION_IAM_HUMAN_APPROVAL_PATH, sourceRevision), humanApprovalRef = { uri: ref(name + '-human').uri, sha256: sha256(humanBytes) }
  h.objects.set(humanApprovalRef.uri, { bytes: humanBytes, value: JSON.parse(humanBytes), ref: humanApprovalRef })
  const capacityGateRef = await h.put(name + '-capacity', { project: 'AI-PDM', sourceRevision, status: 'PASS', observedAt: at(-1200) })
  const plan = secretVersionIamContinuationPlan(reader, sourceRevision), planSha256 = sha256(canonicalize(plan))
  const core = { ownerApplicationId: 'ai-pdm', sourceRevision, sourceTree: source.sourceTree, sourceSha256: source.sourceSha256, sourceProofRef: sourceLockRef, supplementalIamReadbackRef, prebuildIamContinuationRef, humanApprovalRef, capacityGateRef, planSha256 }
  const approvedPlanRef = await h.put(name + '-approved', { schemaVersion: secretSchema('approved-plan'), ...core, status: 'APPROVED', releaseAuthority: true, evidenceScope: 'HUMAN_APPROVED_SECRET_VERSION_IAM_PLAN', plan })
  const input = { schemaVersion: secretSchema('input'), sourceRevision, sourceProofRef: sourceLockRef, supplementalIamReadbackRef, prebuildIamContinuationRef, humanApprovalRef, capacityGateRef, approvedPlanRef, receiptId: name, deadlineAt: at(120000) }
  const inputRef = await h.put(name + '-input', input)
  const binding = { ...core, actor: profile.normalActor, approvedPlanRef, inputRef, receiptUri: ref(name).uri }
  const unrelated = { role: 'roles/secretmanager.secretAccessor', members: ['serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'], condition: { title: 'preserved', expression: 'true' } }
  const role = { name: SECRET_VERSION_IAM_ROLE, stage: 'GA', includedPermissions: ['secretmanager.versions.get'] }
  const before = { projectPolicy: structuredClone(priorPolicy), secretVersionRole: null, secretPolicies: Object.fromEntries(SECRET_VERSION_IAM_SECRETS.map(secret => [secret, { version: 3, bindings: structuredClone(secretPolicies?.[secret]?.bindings ?? [unrelated]) }])) }
  const after = { projectPolicy: structuredClone(priorPolicy), secretVersionRole: role, secretPolicies: Object.fromEntries(SECRET_VERSION_IAM_SECRETS.map(secret => [secret, { version: 3, bindings: [...structuredClone(secretPolicies?.[secret]?.bindings ?? [unrelated]), { role: SECRET_VERSION_IAM_ROLE, members: [...SECRET_VERSION_IAM_MEMBERS] }] }])) }
  const policy = (phase, value, time) => ({ schemaVersion: secretSchema('policy'), ownerApplicationId: 'ai-pdm', projectId: profile.projectId, actor: profile.normalActor, phase, observedAt: at(time), ...value })
  const beforeReadbackRef = await h.put(name + '-before', policy('BEFORE', before, -900)), afterReadbackRef = await h.put(name + '-after', policy('AFTER', after, -100))
  const bytes = Buffer.from('MODELLED_BINARY_PLAN_NOT_PROVIDER_EVIDENCE'), binaryPlanSha256 = sha256(bytes), binaryPlanRef = { uri: ref(name).uri.replace(/\.json$/u, '-plan.tfplan'), sha256: binaryPlanSha256 }
  h.objects.set(binaryPlanRef.uri, { bytes, ref: binaryPlanRef })
  const terraformPlanRef = await h.put(name + '-terraform-plan', secretVersionTerraformFixture())
  const request = { schemaVersion: secretSchema('request'), ...binding, binaryPlanRef, binaryPlanSha256, terraformPlanRef, changes: assertSecretVersionIamTerraformPlan(secretVersionTerraformFixture()), requestedAt: at(-500), deadlineAt: input.deadlineAt, beforeReadbackRef, beforeApplied: false }
  const requestRef = await h.put(name + '-request', request), binaryPlanReceiptRef = await h.put(name + '-plan', { ...request, schemaVersion: secretSchema('plan-binary') })
  const continuationRef = await h.put(name, { schemaVersion: secretSchema('continuation'), ...binding, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER', requestRef, binaryPlanReceiptRef, binaryPlanSha256, beforeReadbackRef, afterReadbackRef, policyHashes: assertSecretVersionIamPolicyPair(before, after), observedAt: at(-50), mutation: 'UNKNOWN_APPLY_THEN_READBACK' })
  return { continuationRef, inputRef, sourceLockRef, sourceProofRef: sourceLockRef, approvedPlanRef, requestRef, binaryPlanReceiptRef, binaryPlanRef, terraformPlanRef, beforeReadbackRef, afterReadbackRef, capacityGateRef, humanApprovalRef, before, after, binding, request }
}
export async function secretVersionIamHarness() {
  const h = memory(), d = descriptor('a'.repeat(40)), image = `${profile.artifactUri}@sha256:${'a'.repeat(64)}`
  d.value.resourcePlanRef = await h.put('historical-resources', { resourcePlanHash: d.value.resourcePlanHash, plan: d.plan })
  const descriptorRef = await h.put('historical-descriptor', d.value)
  const sourceHashes = [...WORKER_SOURCE_PATHS.map(path => ({ path, sha256: sha256(readSource(path)) })), ...Array.from({ length: 19 }, (_, i) => ({ path: `scripts/lib/openswx-reader/vendor/fixture-${i}`, sha256: 'c'.repeat(64) }))]
  const workerBuildRef = await h.put('historical-build', workerReceipt({ descriptor: d.value, kind: 'build', actor: appProfile.identities.builder, image, template: workerTemplate(profile, image, null, 'selftest'), observedAt: h.transport.now(), facts: { sourceObject: { sha256: d.value.sourceArchiveSha256, generation: '1' }, sourceHashes, scan: { status: 'PASS', blockingVulnerabilityCount: 0, rawHighOrCriticalVulnerabilityCount: 0 }, provenance: ['recorded'], sbom: ['recorded'] } }))
  const old = await seedReadbackIamReceipt(h, { descriptorValue: d.value, descriptorRef, workerBuildRef, receiptId: 'historical-iam' })
  const prebuild = await seedPrebuildIamContinuation(h, old.receiptRef)
  const proof = await seedSecretVersionIamContinuation(h, { supplementalIamReadbackRef: old.receiptRef, prebuildIamContinuationRef: prebuild.continuationRef })
  const args = { transport: h.transport, ref: proof.continuationRef, sourceRevision: 'f'.repeat(40), sourceLockRef: proof.sourceLockRef, supplementalIamReadbackRef: old.receiptRef, prebuildIamContinuationRef: prebuild.continuationRef, readSource, normalActor: profile.normalActor }
  h.transport.putBytes = async (uri, bytes) => { assert.ok(!h.objects.has(uri)); const row = { bytes, value: (() => { try { return JSON.parse(bytes) } catch { return undefined } })(), ref: { uri, sha256: sha256(bytes) } }; h.objects.set(uri, row); return row }
  h.transport.request = async (url, options = {}) => {
    h.calls.push({ url, options })
    if (url === 'https://iam.googleapis.com/v1/' + SECRET_VERSION_IAM_ROLE) return structuredClone(proof.after.secretVersionRole)
    if (url === READBACK_IAM_PROJECT_POLICY_URL) { assert.equal(options.body, JSON.stringify({ options: { requestedPolicyVersion: 3 } })); return structuredClone(proof.after.projectPolicy) }
    for (const secret of SECRET_VERSION_IAM_SECRETS) if (url === `https://secretmanager.googleapis.com/v1/projects/jenfu-platform-prod/secrets/${secret}:getIamPolicy?options.requestedPolicyVersion=3`) return structuredClone(proof.after.secretPolicies[secret])
    if (url === 'https://iam.googleapis.com/v1/' + PREBUILD_IAM_ROLE) return structuredClone(prebuild.role)
    for (const item of readbackIamRoles()) if (url === 'https://iam.googleapis.com/v1/' + item.name) return { name: item.name, includedPermissions: item.permissions, stage: 'GA' }
    if (url === READBACK_IAM_JOB_POLICY_URL) return { bindings: expectedReadbackJobBindings() }
    throw Error('UNEXPECTED_PROVIDER_API ' + url)
  }
  return { ...h, old, prebuild, proof, args }
}
export { readSource as secretVersionFixtureReadSource }
