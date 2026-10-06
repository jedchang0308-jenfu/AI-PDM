import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { READBACK_IAM_PATHS, READBACK_IAM_ADDRESSES, READBACK_IAM_SPECS, READBACK_JOB_ROLE, READBACK_SCHEDULER_ROLE,
  assertReadbackIamTerraformPlan, readbackIamPlan, expectedReadbackJobBindings,
  readReadbackIamReceipt, assertReadbackIamReceipt, executeReleaseReadbackIam } from './lib/dev122-openswx-readback-iam.mjs'
import { canonicalize, sha256, releasePaths } from './lib/dev012-owner-release-runtime.mjs'
import { OPENSWX_TERRAFORM_ADDRESSES, OPENSWX_TERRAFORM_PATHS, assertWorkerTerraformPlan, parseOpenSwxBootstrapArgs, parseWorkerStdoutMarker, readWorkerStdoutProof, appendReaderCredential, addCredentialVersion, verifyExistingReaderCredentials, executeOpenSwxBootstrap, executeOpenSwxResources } from './lib/dev122-openswx-bootstrap.mjs'
import { WORKER_PROFILE_PATH, WORKER_SOURCE_PATHS, normalizeWorkerTemplate, workerTemplate, workerTemplatePolicy, workerReceipt, workerJobName, workerSchedulerName, readWorkerFullEvidence, readPriorWorkerActivation, runWorkerFinite } from './lib/dev122-openswx-owner-release.mjs'

import { assertDev117ReleaseIntent } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { buildSourceFreeze, executePrerequisiteProducer } from './lib/dev012-owner-prerequisite-producer.mjs'

// Recorded provider control tests: no real Principal, OAuth, Cloud, Terraform or CAD proof.
const profileBytes = fs.readFileSync(new URL('../config/release/dev122-openswx-worker.json', import.meta.url)), profile = JSON.parse(profileBytes)
const appProfile = JSON.parse(fs.readFileSync(new URL('../config/release/dev117-ai-pdm-independent-production-v3.json', import.meta.url)))
const readSource = path => fs.readFileSync(new URL(`../${path}`, import.meta.url))
const tokenName = `projects/9536592944/secrets/${profile.tokenSecretId}/versions/7`, registryName = `projects/9536592944/secrets/${profile.registrySecretId}/versions/9`
const token = 'T'.repeat(43), registry = { schemaVersion: 'ai-pdm.workload-credentials.v1', workloads: [{ id: profile.readerId, token, purposes: [profile.readerPurpose], capabilities: [profile.readerCapability] }] }
const executionName = `${workerJobName().replace(profile.projectId, profile.projectNumber)}/executions/fixture-execution`
const deadline = () => new Date(Date.now() + 120_000).toISOString()
const ref = name => ({ uri: `${profile.receiptRoot}/${name}.json`, sha256: 'a'.repeat(64) })
function marker(state = 'empty', name = executionName) {
  return { resource: { type: 'cloud_run_job', labels: { project_id: profile.projectId, location: profile.location, job_name: profile.jobId } }, labels: { 'run.googleapis.com/execution_name': name.split('/').at(-1) }, logName: `projects/${profile.projectId}/logs/run.googleapis.com%2Fstdout`, insertId: 'unique-id', timestamp: new Date().toISOString(), jsonPayload: { schemaVersion: 'aipdm.openswx-finite-terminal.v1', state, executionName: state === 'isolation_verified' ? null : name } }
}
function memory() {
  const objects = new Map(), calls = []
  const putJson = async (uri, value) => { const bytes = Buffer.from(canonicalize(value)), row = { bytes, value, ref: { uri, sha256: sha256(bytes) }, metadata: { generation: '1' } }; if (objects.has(uri)) assert.deepEqual(objects.get(uri).value, value); objects.set(uri, row); return { bytes: row.bytes, ref: row.ref, metadata: row.metadata } }
  const readBytes = async uri => { if (!objects.has(uri)) throw Object.assign(Error('MISSING'), { code: 'MISSING' }); return objects.get(uri) }
  const readJson = async reference => { const row = await readBytes(reference.uri); assert.equal(row.ref.sha256, reference.sha256); return row }
  return { objects, calls, transport: { putJson, readBytes, readJson, now: () => new Date().toISOString() }, put: async (name, value) => (await putJson(ref(name).uri, value)).ref }
}
test('CLI admits only closed stages and immutable own refs', () => {
  assert.equal(parseOpenSwxBootstrapArgs(['--stage', 'resources', '--input-ref', ref('input').uri, '--input-sha256', ref('input').sha256]).stage, 'resources')
  for (const argv of [['--stage', 'apply'], ['--stage', 'activate', '--input-ref', ref('input').uri, '--input-sha256', ref('input').sha256, '--command', 'anything'], ['--stage', 'bootstrap', '--input-ref', 'gs://sibling/receipts/x.json', '--input-sha256', 'a'.repeat(64)]]) assert.throws(() => parseOpenSwxBootstrapArgs(argv))
})
test('native Terraform plan rejects delete/update/foreign address/project/provider and Secret versions', () => {
  const plan = () => ({ resource_changes: OPENSWX_TERRAFORM_ADDRESSES.map(address => ({ address, provider_name: 'registry.terraform.io/hashicorp/google', change: { actions: ['create'], after: { project: profile.projectId } } })) })
  assert.equal(assertWorkerTerraformPlan(plan()).length, 12)
  for (const change of [row => { row.change.actions = ['delete', 'create'] }, row => { row.change.actions = ['update'] }, row => { row.address = 'google_secret_manager_secret_version.forbidden' }, row => { row.change.after.project = 'sibling' }, row => { row.provider_name = 'evil/provider' }]) { const value = plan(); change(value.resource_changes[0]); assert.throws(() => assertWorkerTerraformPlan(value)) }
  const duplicate = plan(); duplicate.resource_changes[0] = duplicate.resource_changes[1]; assert.throws(() => assertWorkerTerraformPlan(duplicate))
  for (const file of ['main.tf', 'backend.tf', 'versions.tf']) { const source = readSource(`infra/google-cloud/dev-122-openswx-worker/${file}`).toString(); assert.doesNotMatch(source, /google_secret_manager_secret_version|latest|GOOGLE_CREDENTIALS|credentials\s*=/u) }
})
async function resourceReplayHarness(mutate = () => {}) {
    const h = memory(), d = descriptor('a'.repeat(40)), uri = ref('resources-test').uri, descriptorRef = ref('resources-descriptor'), image = `${profile.artifactUri}@sha256:${'b'.repeat(64)}`
    const capacityGateRef = await h.put('capacity', { project: 'AI-PDM', sourceRevision: d.value.sourceRevision, status: 'PASS', observedAt: h.transport.now() })
    d.value.resourcePlanRef = await h.put('approved-resources', { schemaVersion: 'aipdm.openswx-approved-resource-plan.v1', ownerApplicationId: 'ai-pdm', sourceRevision: d.value.sourceRevision, status: 'APPROVED', releaseAuthority: true, evidenceScope: 'HUMAN_APPROVED_RESOURCE_PLAN', authorizationStatementSha256: 'c'.repeat(64), resourcePlanHash: d.value.resourcePlanHash, capacityGateRef, plan: d.plan })
    const common = { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, receiptUri: uri, descriptorRef, approvedPlanRef: d.value.resourcePlanRef, actor: profile.normalActor, sourceRevision: d.value.sourceRevision, sourceArchiveSha256: d.value.sourceArchiveSha256, resourcePlanHash: d.value.resourcePlanHash, workerImage: image, binaryPlanSha256: 'd'.repeat(64), changes: OPENSWX_TERRAFORM_ADDRESSES.map(address => ({ address, actions: ['create'] })).sort((a, b) => a.address.localeCompare(b.address)), requestedAt: h.transport.now() }
    const binaryPlanReceiptRef = await h.put('resources-test-plan', { schemaVersion: 'aipdm.openswx-resource-binary-plan.v1', ...common })
    const request = structuredClone({ schemaVersion: 'aipdm.openswx-resource-apply-request.v1', ...common, binaryPlanReceiptRef }); mutate(request)
    await h.put('resources-test-request', request)
    return { ...h, args: { transport: h.transport, profile, descriptor: d.value, descriptorRef, build: { image }, readSource, oauthToken: 'recorded-memory-only-token', uri, deadlineAt: deadline(), actor: { email: profile.normalActor } } }
}
test('resource latch replay rejects stale or tampered complete plan binding before provider readback or sealing', async () => {
  const mutations = [value => { value.schemaVersion = 'unknown' }, value => { value.descriptorRef = ref('other-descriptor') }, value => { value.approvedPlanRef = ref('other-approval') }, value => { value.actor = 'other@jenfu.com.tw' }, value => { value.binaryPlanSha256 = 'f'.repeat(64) }, value => { value.changes[0].actions = ['delete'] }, value => { value.changes[0].actions = ['no-op'] }, value => { value.changes[0] = null }, value => { value.projectId = 'sibling' }, value => { value.backendPrefix = 'sibling' }, value => { value.binaryPlanReceiptRef = ref('other-binary-plan') }, value => { value.binaryPlanReceiptRef.sha256 = 'e'.repeat(64) }, value => { value.requestedAt = 'bad' }, value => { value.unknown = true }, value => { delete value.binaryPlanReceiptRef }]
  for (const mutate of mutations) {
    const h = await resourceReplayHarness(mutate)
    h.transport.request = async url => { h.calls.push(url); throw Error('UNEXPECTED_PROVIDER_READBACK') }
    await assert.rejects(executeOpenSwxResources(h.args), { code: 'OPENSWX_RESOURCE_REQUEST_JOIN_INVALID' })
    assert.equal(h.calls.length, 0); assert.ok(!h.objects.has(h.args.uri))
  }
})
test('valid resource proof replay reads provider only and preserves original plan/request/receipt timestamps', async () => {
  const h = await resourceReplayHarness(), provider = await dailyHarness()
  await provider.transport.request(`https://run.googleapis.com/v2/${workerJobName()}`, { method: 'PATCH', body: JSON.stringify({ template: workerTemplate(profile, h.args.build.image, null, 'selftest') }) })
  await provider.transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}:pause`, { method: 'POST', body: '{}' })
  provider.calls.length = 0; h.transport.request = provider.transport.request
  const originalRequest = Buffer.from(h.objects.get(ref('resources-test-request').uri).bytes), originalPlan = Buffer.from(h.objects.get(ref('resources-test-plan').uri).bytes)
  const first = await executeOpenSwxResources(h.args)
  await new Promise(resolve => setTimeout(resolve, 5))
  const replay = await executeOpenSwxResources(h.args)
  assert.deepEqual(first.ref, replay.ref); assert.equal(first.value.observedAt, replay.value.observedAt)
  assert.equal(first.value.mutation, 'READBACK_ONLY'); assert.equal(first.value.binaryPlanSha256, 'd'.repeat(64))
  assert.ok(h.objects.get(ref('resources-test-request').uri).bytes.equals(originalRequest)); assert.ok(h.objects.get(ref('resources-test-plan').uri).bytes.equals(originalPlan))
  assert.ok(provider.calls.every(row => !row.options.method || row.options.method === 'GET' || (row.options.method === 'POST' && row.url === `https://iam.googleapis.com/v1/projects/${profile.projectId}/serviceAccounts/${profile.readerServiceAccount}:getIamPolicy`)))
  const policyReads = provider.calls.filter(row => row.url.includes('iam.googleapis.com') && row.url.endsWith(':getIamPolicy'))
  assert.equal(policyReads.length, 2)
  assert.ok(policyReads.every(row => row.options.method === 'POST' && row.options.body === undefined))
})
test('stdout empty proof rejects completed/selftest/null/wrong execution/extra fields/foreign log scope', () => {
  assert.equal(parseWorkerStdoutMarker(marker(), executionName).marker.state, 'empty')
  const text = marker(); text.textPayload = JSON.stringify(text.jsonPayload); delete text.jsonPayload; parseWorkerStdoutMarker(text, executionName)
  parseWorkerStdoutMarker(marker('isolation_verified'), executionName, 'isolation_verified')
  for (const row of [marker('completed'), marker('isolation_verified'), { ...marker(), jsonPayload: { ...marker().jsonPayload, executionName: null } }, { ...marker(), jsonPayload: { ...marker().jsonPayload, executionName: executionName + '-other' } }, { ...marker(), jsonPayload: { ...marker().jsonPayload, token: 'private' } }, { ...marker(), logName: 'projects/sibling/logs/run.googleapis.com%2Fstdout' }]) assert.throws(() => parseWorkerStdoutMarker(row, executionName))
})
test('exact scoped logs deduplicate identical insertId and reject ambiguity, missing marker and page overflow', async () => {
  const row = marker(), execution = { name: executionName, createTime: new Date(Date.now() - 5000).toISOString(), completionTime: new Date(Date.now() + 5000).toISOString() }
  let body
  const transport = { now: () => new Date().toISOString(), request: async (_url, options) => { body = JSON.parse(options.body); return { entries: [row, row] } } }
  const args = { transport, profile, execution, deadlineAt: deadline() }
  assert.equal((await readWorkerStdoutProof(args)).claimProof, 'AUTHENTICATED_204_SOURCE_BOUND')
  assert.deepEqual(body.resourceNames, [`projects/${profile.projectId}`]); assert.match(body.filter, /execution_name/); assert.match(body.filter, /stdout/); assert.doesNotMatch(body.filter, /jobs\/\*|region/)
  for (const result of [{ entries: [] }, { entries: [row, { ...row, insertId: 'second' }] }, { entries: [row, { ...row, jsonPayload: { ...row.jsonPayload, state: 'completed' } }] }, { entries: [row], nextPageToken: 'keep-going' }]) await assert.rejects(readWorkerStdoutProof({ ...args, transport: { ...transport, request: async () => result } }))
})
test('reader append preserves existing registry entries and has one exact purpose/capability', () => {
  const old = { schemaVersion: registry.schemaVersion, workloads: [{ id: 'legacy-worker', token: 'L'.repeat(43), purposes: ['recognition_jobs'], capabilities: ['solidworks_document_manager'] }] }
  const updated = JSON.parse(appendReaderCredential(Buffer.from(JSON.stringify(old)), profile, token))
  assert.deepEqual(updated.workloads[0], old.workloads[0]); assert.deepEqual(updated.workloads[1], registry.workloads[0])
  assert.throws(() => appendReaderCredential(Buffer.from(JSON.stringify(updated)), profile, token)); assert.throws(() => appendReaderCredential(Buffer.from(JSON.stringify(old)), profile, 'bad'))
})
test('lost numeric credential response reads exact secret hash once; replay never adds a version or persists payload', async () => {
  const h = memory(), started = h.transport.now(); let additions = 0
  h.transport.request = async url => { h.calls.push(url); if (url.endsWith(':addVersion')) { additions++; throw Error('unknown') } if (url.includes('/versions?')) return { versions: [{ name: tokenName, state: 'ENABLED', createTime: new Date(Date.parse(started) + 100).toISOString() }] }; if (url.endsWith(':access')) return { name: tokenName, payload: { data: Buffer.from(token).toString('base64') } }; throw Error(url) }
  const args = { transport: h.transport, profile, secretId: profile.tokenSecretId, bytes: Buffer.from(token), uri: ref('token-recovery').uri, deadlineAt: deadline() }
  assert.equal(await addCredentialVersion(args), tokenName); assert.equal(await addCredentialVersion(args), tokenName); assert.equal(additions, 1)
  assert.ok([...h.objects.values()].every(row => !row.bytes.includes(token) && !row.bytes.includes(Buffer.from(token).toString('base64'))))
})
function descriptor(sourceRevision, purpose = 'build_only') {
  const plan = { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, sourceHashes: OPENSWX_TERRAFORM_PATHS.map(path => ({ path, sha256: sha256(readSource(path)) })), resourceAddresses: OPENSWX_TERRAFORM_ADDRESSES, allowedActions: ['create', 'no-op'] }
  const value = { schemaVersion: 'aipdm.openswx-worker-descriptor.v1', ownerApplicationId: 'ai-pdm', purpose, sourceRevision, sourceArchiveSha256: sha256(sourceRevision), workerProfileSha256: sha256(profileBytes), resourcePlanHash: sha256(canonicalize(plan)), normalTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'normal'))), selftestTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'selftest'))) }
  for (const key of ['projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'dispatchPolicy', 'bounds', 'receiptRoot']) value[key] = profile[key]
  return { value, plan }
}
async function dailyHarness({ markerState = null, wrongPriorImage = false } = {}) {
  const controls = { markerState, resumeUnknown: false }
  const h = memory(), priorSource = 'a'.repeat(40), nextSource = 'b'.repeat(40), priorImage = `${profile.artifactUri}@sha256:${'a'.repeat(64)}`, nextImage = `${profile.artifactUri}@sha256:${'b'.repeat(64)}`
  const p = descriptor(priorSource, 'full'), n = descriptor(nextSource)
  const oldPlan = await h.put('approved-old-plan', { resourcePlanHash: p.value.resourcePlanHash, plan: p.plan })
  const newPlan = await h.put('approved-new-plan', { resourcePlanHash: n.value.resourcePlanHash, plan: n.plan })
  const applied = await h.put('resource-apply', { schemaVersion: 'aipdm.openswx-resource-apply.v1', actor: profile.normalActor, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER', approvedPlanRef: oldPlan, sourceRevision: priorSource, resourcePlanHash: p.value.resourcePlanHash })
  const sourceHashes = [...WORKER_SOURCE_PATHS.map(path => ({ path, sha256: sha256(readSource(path)) })), ...Array.from({ length: 19 }, (_, i) => ({ path: `scripts/lib/openswx-reader/vendor/fixture-${i}`, sha256: 'c'.repeat(64) }))]
  const build = async (name, d, image) => h.put(name, workerReceipt({ descriptor: d, kind: 'build', actor: appProfile.identities.builder, image, template: workerTemplate(profile, image, null, 'selftest'), observedAt: h.transport.now(), facts: { sourceObject: { sha256: d.sourceArchiveSha256, generation: '1' }, sourceHashes, scan: { status: 'PASS', blockingVulnerabilityCount: 0 }, provenance: ['recorded-provenance'], sbom: ['recorded-sbom'] } }))
  p.value.workerBuildRef = await build('prior-build', p.value, priorImage); p.value.tokenSecretVersion = tokenName; p.value.registrySecretVersion = registryName
  const actual = { tokenSecretVersion: tokenName, registrySecretVersion: registryName, resourceApplyRef: applied, normalTemplateSha256: sha256(canonicalize(workerTemplate(profile, priorImage, tokenName))), selftestTemplateSha256: sha256(canonicalize(workerTemplate(profile, priorImage, null, 'selftest'))) }
  p.value.bootstrapRef = await h.put('prior-bootstrap', workerReceipt({ descriptor: p.value, kind: 'bootstrap', actor: profile.normalActor, image: priorImage, template: workerTemplate(profile, priorImage, null, 'selftest'), observedAt: h.transport.now(), facts: actual })); p.value.cloudPreflightRef = ref('unused-preflight'); p.value.pausedDrainedRef = ref('unused-drain')
  const priorDescriptorRef = await h.put('prior-descriptor', p.value)
  const runtimeRef = await h.put('prior-runtime', { runtimeConfig: { plainEnvironment: { PDM_OPENSWX_DISPATCH_ENABLED: '1' }, secretVersions: { PDM_WORKLOAD_AUTH_CREDENTIALS: '9' }, openswxWorker: { descriptorRef: priorDescriptorRef } } })
  const capsule = { schemaVersion: appProfile.schemas.releaseIntent, ownerApplicationId: 'ai-pdm', releaseId: 'DEV122-PRIOR-001', sourceRevision: priorSource, sourceSha256: 'd'.repeat(64), migrationManifestSha256: 'd'.repeat(64), previousRevision: 'ai-pdm-prod-previous', deadlineAt: deadline(), sourceLockRef: ref('lock'), authorizationPolicyRef: ref('auth'), readinessReceiptRef: ref('ready'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'), runtimeConfigRef: runtimeRef, openswxWorkerRef: priorDescriptorRef }
  const capsuleRef = await h.put('prior-capsule', capsule), paths = releasePaths(appProfile, capsule, capsuleRef.sha256)
  const canonical = await h.transport.putJson(paths.canonical, { stage: 'canonical', sourceRevision: priorSource, facts: { origin: profile.canonicalOrigin, candidateRevision: 'ai-pdm-prod-prior' } })
  const priorTemplate = workerTemplate(profile, priorImage, tokenName)
  const activationRef = await h.put('prior-activation', workerReceipt({ descriptor: p.value, kind: 'activation', actor: profile.normalActor, image: priorImage, template: priorTemplate, observedAt: h.transport.now(), previousRefs: [capsuleRef, ref('final'), canonical.ref], facts: { workerStatus: 'READY', schedulerState: 'ENABLED', dbAdmissionProof: 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN', claimProof: { claimProof: 'AUTHENTICATED_204_SOURCE_BOUND' }, sourceEntryRef: sourceHashes.find(row => row.path === 'scripts/run-openswx-metadata-job.mjs'), numericCredentials: { token: tokenName, registry: registryName } } }))
  n.value.resourcePlanRef = newPlan; const nextDescriptorRef = await h.put('next-descriptor', n.value), nextBuildRef = await build('next-build', n.value, nextImage)
  let job = { name: workerJobName(), etag: 'e1', generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, template: wrongPriorImage ? workerTemplate(profile, nextImage, tokenName) : priorTemplate }, state = 'ENABLED', executions = []
  const target = { uri: profile.canonicalOrigin + profile.recoverPath, httpMethod: 'POST', body: 'e30=', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Google-Cloud-Scheduler' }, oidcToken: { serviceAccountEmail: profile.dispatchServiceAccount, audience: profile.canonicalOrigin } }
  h.transport.getService = async () => ({}); h.transport.assertServiceSettled = () => {}; h.transport.assertCanonicalEntrypoint = () => {}; h.transport.effectiveRevision = () => 'ai-pdm-prod-prior'; h.transport.getRevision = async () => ({ containers: [{ name: appProfile.runtime.containerName, env: [{ name: 'PDM_OPENSWX_DISPATCH_ENABLED', value: '1' }, { name: 'PDM_WORKLOAD_AUTH_CREDENTIALS', valueSource: { secretKeyRef: { secret: profile.registrySecretId, version: '9' } } }] }] })
  h.transport.request = async (url, options = {}) => {
    h.calls.push({ url, options })
    if (url.endsWith('/userinfo')) return { email: profile.normalActor, email_verified: true, sub: 'recorded-subject' }
    if (url.includes('cloudscheduler')) { if (url.endsWith(':pause')) state = 'PAUSED'; if (url.endsWith(':resume')) { state = 'ENABLED'; if (controls.resumeUnknown) throw Error('unknown resume') } return { name: workerSchedulerName(), state, schedule: '*/5 * * * *', timeZone: 'Etc/UTC', attemptDeadline: '30s', retryConfig: { retryCount: 0 }, httpTarget: target } }
    if (url.includes('secretmanager')) {
      if (url.endsWith(':access')) { const name = url.includes(profile.tokenSecretId) ? tokenName : registryName; return { name, payload: { data: (name === tokenName ? Buffer.from(token) : Buffer.from(JSON.stringify(registry))).toString('base64') } } }
      if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/secretmanager.secretAccessor', members: [`serviceAccount:${profile.readerServiceAccount}`] }] }
      if (url.includes('/versions/')) return { name: url.includes(profile.tokenSecretId) ? tokenName : registryName, state: 'ENABLED' }
      return { name: `projects/9536592944/secrets/${profile.tokenSecretId}` }
    }
    if (url.includes('/roles/')) { const lifecycle = url.endsWith('aipdmOpenswxJobLifecycle'); return { name: `projects/${profile.projectId}/roles/${lifecycle ? 'aipdmOpenswxJobLifecycle' : 'aipdmOpenswxJobReadback'}`, includedPermissions: lifecycle ? ['run.jobs.get', 'run.jobs.update', 'run.jobs.run', 'run.executions.get', 'run.executions.list', 'run.executions.cancel'] : ['run.jobs.get', 'run.executions.get', 'run.executions.list'] } }
    if (url.includes('iam.googleapis.com')) { if (url.endsWith(':getIamPolicy')) { assert.equal(options.method, 'POST'); assert.equal(options.body, undefined); return { bindings: [{ role: 'roles/iam.serviceAccountUser', members: ['serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com'] }] } }; return { email: url.split('/').at(-1) } }
    if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/run.invoker', members: ['serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'] }, { role: 'projects/jenfu-platform-prod/roles/aipdmOpenswxJobReadback', members: ['serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'] }, { role: 'projects/jenfu-platform-prod/roles/aipdmOpenswxJobLifecycle', members: ['serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com'] }] }
    if (url.includes('logging.googleapis.com')) { const execution = executions.at(-1), row = marker(controls.markerState ?? (execution.template.containers[0].args.length ? 'isolation_verified' : 'empty'), execution.name); row.timestamp = execution.completionTime; return { entries: [row] } }
    if (url.endsWith(':run')) { const now = Date.now(); executions.push({ name: executionName + '-' + executions.length, createTime: new Date(now + 10).toISOString(), completionTime: new Date(now + 20).toISOString(), succeededCount: 1, failedCount: 0, conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }], template: structuredClone(job.template.template) }); return { name: 'projects/9536592944/locations/asia-east1/operations/recorded' } }
    if (url.includes('/executions?')) return { executions }
    if (url.includes('/executions/')) return executions.find(row => row.name === url.replace('https://run.googleapis.com/v2/', ''))
    if (options.method === 'PATCH') { assert.equal(url, `https://run.googleapis.com/v2/${workerJobName()}`); job = { ...job, etag: job.etag + 'x', template: JSON.parse(options.body).template }; return {} }
    return job
  }
  const invoke = async (stage, extra, name) => { const inputRef = await h.put(name + '-input', { schemaVersion: `aipdm.openswx-${stage}-input.v1`, descriptorRef: nextDescriptorRef, workerBuildRef: nextBuildRef, deadlineAt: deadline(), receiptId: name, ...extra }); return executeOpenSwxBootstrap({ stage, inputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} }) }
  return { ...h, invoke, controls, priorCapsule: capsule, prior: p.value, next: n.value, nextDescriptorRef, nextBuildRef, activationRef, priorImage, nextImage }
}
test('daily target-linked drain retains prior actual image; new source bootstrap reuses numeric credentials with zero issuance/apply', async () => {
  const h = await dailyHarness(), drained = await h.invoke('pause', { drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: h.activationRef }, 'daily-drain')
  assert.equal(drained.value.image, h.priorImage); assert.equal(drained.value.facts.targetWorkerBuildRef.sha256, h.nextBuildRef.sha256)
  const bootstrap = await h.invoke('bootstrap', { bootstrapKind: 'DAILY_REFRESH', priorActivationRef: h.activationRef, pausedDrainedRef: drained.ref }, 'daily-bootstrap')
  assert.equal(bootstrap.value.image, h.nextImage); assert.equal(bootstrap.value.facts.tokenSecretVersion, tokenName); assert.equal(bootstrap.value.facts.registrySecretVersion, registryName); assert.equal(bootstrap.value.facts.resourceProvenance.resourcesUnchanged, true)
  assert.ok(h.calls.every(row => !/:addVersion|terraform|:resume/u.test(row.url)))
  const full = { ...h.next, purpose: 'full', workerBuildRef: h.nextBuildRef, bootstrapRef: bootstrap.ref, cloudPreflightRef: bootstrap.value.facts.cloudPreflightRef, pausedDrainedRef: drained.ref, tokenSecretVersion: tokenName, registrySecretVersion: registryName }; delete full.resourcePlanRef
  assert.equal((await readWorkerFullEvidence(h.transport, full, profile)).image, h.nextImage)
  const old = await h.transport.readJson(h.prior.bootstrapRef)
  await assert.rejects(readWorkerFullEvidence(h.transport, { ...full, bootstrapRef: old.ref }, profile), /JOIN/)
  const forged = await h.put('forged-new-image-drain', { ...drained.value, image: h.nextImage })
  await assert.rejects(readWorkerFullEvidence(h.transport, { ...full, pausedDrainedRef: forged }, profile), /DAILY_DRAIN/)
})
test('wrong prior source/image or non-empty marker stops daily drain before any Job update', async () => {
  for (const options of [{ wrongPriorImage: true }, { markerState: 'completed' }]) { const h = await dailyHarness(options); await assert.rejects(h.invoke('pause', { drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: h.activationRef }, 'daily-denied')); assert.ok(h.calls.every(row => row.options.method !== 'PATCH' && !row.url.endsWith(':addVersion'))) }
})
test('existing normal job cannot use FIRST exemption; missing prior READY and disabled/broken credential reject', async () => {
  const h = await dailyHarness()
  await assert.rejects(h.invoke('pause', { drainKind: 'FIRST_PROVIDER_ONLY', resourceApplyRef: ref('resource-apply') }, 'first-denied'))
  await assert.rejects(readPriorWorkerActivation(h.transport, ref('missing'), profile))
  const transport = { request: async url => url.endsWith(':access') ? { name: tokenName, payload: { data: Buffer.from(token).toString('base64') } } : { name: tokenName, state: 'DISABLED' } }
  await assert.rejects(verifyExistingReaderCredentials(transport, profile, h.prior), /DISABLED/)
})
test('daily selftest failure restores only a terminal verified prior normal Job and never enables Scheduler', async () => {
  const h = await dailyHarness(), drained = await h.invoke('pause', { drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: h.activationRef }, 'daily-drain')
  h.controls.markerState = 'completed'
  await assert.rejects(h.invoke('bootstrap', { bootstrapKind: 'DAILY_REFRESH', priorActivationRef: h.activationRef, pausedDrainedRef: drained.ref }, 'failed-bootstrap'), /MARKER/)
  const recovery = await h.transport.readBytes(ref('failed-bootstrap-recovery-required').uri)
  assert.equal(recovery.value.status, 'RECOVERY_REQUIRED'); assert.equal(recovery.value.priorJobRestored, true); assert.equal(recovery.value.schedulerEnabled, false)
  assert.ok(h.calls.every(row => !row.url.endsWith(':resume') && !row.url.endsWith(':addVersion')))
})
async function activationHarness() {
  const h = await dailyHarness(), drained = await h.invoke('pause', { drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: h.activationRef }, 'daily-drain')
  const bootstrap = await h.invoke('bootstrap', { bootstrapKind: 'DAILY_REFRESH', priorActivationRef: h.activationRef, pausedDrainedRef: drained.ref }, 'daily-bootstrap')
  const full = { ...h.next, purpose: 'full', workerBuildRef: h.nextBuildRef, bootstrapRef: bootstrap.ref, cloudPreflightRef: bootstrap.value.facts.cloudPreflightRef, pausedDrainedRef: drained.ref, tokenSecretVersion: tokenName, registrySecretVersion: registryName }; delete full.resourcePlanRef
  const descriptorRef = await h.put('full-descriptor', full)
  const runtimeRef = await h.put('full-runtime', { runtimeConfig: { plainEnvironment: { PDM_OPENSWX_DISPATCH_ENABLED: '1' }, secretVersions: { PDM_WORKLOAD_AUTH_CREDENTIALS: '9' }, openswxWorker: { descriptorRef } } })
  const capsule = { ...h.priorCapsule, releaseId: 'DEV122-NEXT-001', sourceRevision: full.sourceRevision, runtimeConfigRef: runtimeRef, openswxWorkerRef: descriptorRef }, capsuleRef = await h.put('full-capsule', capsule), paths = releasePaths(appProfile, capsule, capsuleRef.sha256)
  const canonical = await h.transport.putJson(paths.canonical, { stage: 'canonical', sourceRevision: full.sourceRevision, facts: { origin: profile.canonicalOrigin, candidateRevision: 'ai-pdm-prod-new' } })
  const template = workerTemplate(profile, h.nextImage, tokenName)
  await h.transport.request(`https://run.googleapis.com/v2/${workerJobName()}`, { method: 'PATCH', body: JSON.stringify({ template }) })
  const smoke = await runWorkerFinite({ transport: h.transport, descriptor: full, profile, template, receiptUri: ref('wif-finite').uri, actor: 'aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com', deadlineAt: deadline() })
  await h.transport.putJson(paths.finalize, { stage: 'finalize', ownerApplicationId: 'ai-pdm', sourceRevision: full.sourceRevision, previousReceiptRef: canonical.ref, facts: { result: 'RELEASED', openswxWorker: { status: 'ACTIVATION_PENDING', finiteSmokeRef: smoke.ref } } })
  h.transport.effectiveRevision = () => 'ai-pdm-prod-new'
  const inputRef = await h.put('activation-input', { schemaVersion: 'aipdm.openswx-activate-input.v1', releaseCapsuleRef: capsuleRef, receiptId: 'normal-activation', deadlineAt: deadline() })
  return { ...h, activate: () => executeOpenSwxBootstrap({ stage: 'activate', inputRef, transport: h.transport, readSource, appProfile }) }
}
test('WIF terminal stays pending; normal actor requires exact empty stdout source proof before immutable READY', async () => {
  const h = await activationHarness(), result = await h.activate(), replay = await h.activate()
  assert.equal(result.value.facts.workerStatus, 'READY'); assert.equal(result.value.facts.claimProof.claimProof, 'AUTHENTICATED_204_SOURCE_BOUND'); assert.deepEqual(result.ref, replay.ref)
  assert.equal(h.calls.filter(row => row.url.endsWith(':resume')).length, 1)
  const wif = await h.transport.readBytes(ref('wif-finite').uri); assert.equal(wif.value.facts.workerStatus, 'ACTIVATION_PENDING'); assert.equal(wif.value.facts.claimProof, 'PENDING_NORMAL_ACTOR_STDOUT_READBACK')
})
test('completed marker blocks activation; unknown resume reads back then pauses without repeating enable', async () => {
  const bad = await activationHarness(); bad.controls.markerState = 'completed'; await assert.rejects(bad.activate(), /MARKER/); assert.ok(bad.calls.every(row => !row.url.endsWith(':resume')))
  const unknown = await activationHarness(); unknown.controls.resumeUnknown = true; await assert.rejects(unknown.activate(), /RECOVERY_REQUIRED/)
  assert.equal(unknown.calls.filter(row => row.url.endsWith(':resume')).length, 1)
  const scheduler = await unknown.transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`); assert.equal(scheduler.state, 'PAUSED')
  assert.ok(!unknown.objects.has(ref('normal-activation').uri))
})

async function firstReconciliationHarness() {
  const h = memory(), prior = descriptor('a'.repeat(40)), target = descriptor('b'.repeat(40))
  const capacity = await h.put('first-capacity', { project: 'AI-PDM', sourceRevision: target.value.sourceRevision, status: 'PASS', observedAt: h.transport.now() })
  const approved = d => ({ schemaVersion: 'aipdm.openswx-approved-resource-plan.v1', ownerApplicationId: 'ai-pdm', sourceRevision: d.value.sourceRevision, status: 'APPROVED', releaseAuthority: true, evidenceScope: 'HUMAN_APPROVED_RESOURCE_PLAN', authorizationStatementSha256: 'c'.repeat(64), resourcePlanHash: d.value.resourcePlanHash, capacityGateRef: capacity, plan: d.plan })
  prior.value.resourcePlanRef = await h.put('first-old-approved', approved(prior)); target.value.resourcePlanRef = await h.put('first-next-approved', approved(target))
  const priorDescriptorRef = await h.put('first-old-descriptor', prior.value), descriptorRef = await h.put('first-next-descriptor', target.value)
  const sourceHashes = [...WORKER_SOURCE_PATHS.map(path => ({ path, sha256: sha256(readSource(path)) })), ...Array.from({ length: 19 }, (_, i) => ({ path: `scripts/lib/openswx-reader/vendor/fixture-${i}`, sha256: 'c'.repeat(64) }))]
  const image = letter => `${profile.artifactUri}@sha256:${letter.repeat(64)}`
  const built = (d, letter) => workerReceipt({ descriptor: d.value, kind: 'build', actor: appProfile.identities.builder, image: image(letter), template: workerTemplate(profile, image(letter), null, 'selftest'), observedAt: h.transport.now(), facts: { sourceObject: { sha256: d.value.sourceArchiveSha256, generation: '1' }, sourceHashes: structuredClone(sourceHashes), scan: { status: 'PASS', blockingVulnerabilityCount: 0, rawHighOrCriticalVulnerabilityCount: 0 }, provenance: ['recorded-provenance'], sbom: ['recorded-sbom'] } })
  const priorWorkerBuildRef = await h.put('first-old-build', built(prior, 'a')), workerBuildRef = await h.put('first-next-build', built(target, 'b'))
  const binding = { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, receiptUri: ref('first-old-resource').uri, descriptorRef: priorDescriptorRef, approvedPlanRef: prior.value.resourcePlanRef, actor: profile.normalActor, sourceRevision: prior.value.sourceRevision, sourceArchiveSha256: prior.value.sourceArchiveSha256, resourcePlanHash: prior.value.resourcePlanHash, workerImage: image('a'), binaryPlanSha256: 'd'.repeat(64), changes: OPENSWX_TERRAFORM_ADDRESSES.map(address => ({ address, actions: ['create'] })), requestedAt: h.transport.now() }
  const binaryPlanReceiptRef = await h.put('first-old-resource-plan', { schemaVersion: 'aipdm.openswx-resource-binary-plan.v1', ...binding })
  const priorResourceRequestRef = await h.put('first-old-resource-request', { schemaVersion: 'aipdm.openswx-resource-apply-request.v1', ...binding, binaryPlanReceiptRef })
  const provider = await dailyHarness()
  await provider.transport.request(`https://run.googleapis.com/v2/${workerJobName()}`, { method: 'PATCH', body: JSON.stringify({ template: workerTemplate(profile, image('a'), null, 'selftest') }) })
  await provider.transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}:pause`, { method: 'POST', body: '{}' }); provider.calls.length = 0
  const request = provider.transport.request
  h.transport.request = async (url, options = {}) => { if (url.includes(profile.tokenSecretId + '/versions?')) { provider.calls.push({ url, options }); return { versions: [] } }; return request(url, options) }
  const args = { transport: h.transport, profile, descriptor: target.value, descriptorRef, build: h.objects.get(workerBuildRef.uri).value, readSource, oauthToken: 'recorded-memory-only-token', root: '/INVALID_NO_TERRAFORM_ALLOWED', uri: ref('first-new-resource').uri, deadlineAt: deadline(), actor: { email: profile.normalActor }, firstReconciliation: { priorResourceRequestRef, priorWorkerBuildRef } }
  return { ...h, args, provider, request, priorResourceRequestRef, priorWorkerBuildRef, workerBuildRef, binaryPlanReceiptRef, priorDescriptorRef, priorPlanRef: prior.value.resourcePlanRef }
}
test('FIRST source reconciliation reads existing twelve resources only, preserves R01 and replays proof without Terraform or issuance', async () => {
  const h = await firstReconciliationHarness(), original = Buffer.from(h.objects.get(h.priorResourceRequestRef.uri).bytes)
  const request = h.transport.request
  h.transport.request = async (url, options) => { const result = await request(url, options); if (url === `https://run.googleapis.com/v2/${workerJobName()}`) { const raw = structuredClone(result); raw.template.template.executionEnvironment = 'EXECUTION_ENVIRONMENT_GEN2'; delete raw.template.template.containers[0].env; return raw }; return result }
  const first = await executeOpenSwxResources(h.args), replay = await executeOpenSwxResources(h.args)
  assert.equal(first.value.mutation, 'READBACK_ONLY_FIRST_SOURCE_RECONCILIATION'); assert.deepEqual(first.ref, replay.ref)
  assert.equal(first.value.readback.image, h.objects.get(h.priorWorkerBuildRef.uri).value.image)
  assert.equal(first.value.firstSourceReconciliation.targetImage, h.args.build.image)
  assert.equal(first.value.readback.providerJob.template.template.executionEnvironment, 'EXECUTION_ENVIRONMENT_GEN2')
  assert.equal(first.value.readback.providerJob.template.template.containers[0].env, undefined)
  assert.deepEqual(normalizeWorkerTemplate(first.value.readback.providerJob.template), workerTemplate(profile, first.value.readback.image, null, 'selftest'))
  assert.ok(h.objects.get(h.priorResourceRequestRef.uri).bytes.equals(original))
  assert.ok(h.provider.calls.every(row => !row.options.method || row.options.method === 'GET' || (row.options.method === 'POST' && row.url.endsWith(':getIamPolicy'))))
  assert.ok(!h.objects.has(ref('first-new-resource-request').uri))
})
test('FIRST source reconciliation rejects foreign/tampered joins, plan/profile/source/scan drift before provider readback', async () => {
  for (const mutate of [h => { h.objects.get(h.priorResourceRequestRef.uri).value.actor = 'other' }, h => { h.objects.get(h.priorResourceRequestRef.uri).value.projectId = 'sibling' }, h => { h.objects.get(h.priorResourceRequestRef.uri).value.receiptUri = ref('wrong').uri }, h => { h.objects.get(h.binaryPlanReceiptRef.uri).value.binaryPlanSha256 = 'e'.repeat(64) }, h => { h.objects.get(h.binaryPlanReceiptRef.uri).value.changes[0].actions = ['delete'] }, h => { h.objects.get(h.priorPlanRef.uri).value.authorizationStatementSha256 = 'f'.repeat(64) }, h => { h.objects.get(h.priorPlanRef.uri).value.plan.sourceHashes[0].sha256 = 'f'.repeat(64) }, h => { h.objects.get(h.priorDescriptorRef.uri).value.workerProfileSha256 = 'f'.repeat(64) }, h => { h.objects.get(h.priorWorkerBuildRef.uri).value.facts.sourceHashes[0].sha256 = 'f'.repeat(64) }, h => { h.args.build.facts.scan.rawHighOrCriticalVulnerabilityCount = 1 }, h => { h.objects.get(h.priorWorkerBuildRef.uri).value.facts.scan.rawHighOrCriticalVulnerabilityCount = 1 }, h => { h.objects.get(h.priorWorkerBuildRef.uri).value.facts.sbom = [] }]) {
    const h = await firstReconciliationHarness(); mutate(h)
    await assert.rejects(executeOpenSwxResources(h.args)); assert.equal(h.provider.calls.length, 0); assert.ok(!h.objects.has(h.args.uri))
  }
})
test('FIRST source reconciliation rejects normal Job, enabled Scheduler, missing/extra IAM, execution or issued Secret', async () => {
  for (const scenario of ['normal', 'enabled', 'missing', 'extra-iam', 'execution', 'issued']) {
    const h = await firstReconciliationHarness(), original = h.transport.request
    h.transport.request = async (url, options) => {
      if (scenario === 'missing' && url.includes('/roles/')) throw Object.assign(Error('MISSING'), { code: 'MISSING' })
      const result = await original(url, options)
      if (scenario === 'normal' && url === `https://run.googleapis.com/v2/${workerJobName()}`) result.template = workerTemplate(profile, h.objects.get(h.priorWorkerBuildRef.uri).value.image, tokenName)
      if (scenario === 'enabled' && url.includes('cloudscheduler')) result.state = 'ENABLED'
      if (scenario === 'extra-iam' && url.includes('iam.googleapis.com') && url.endsWith(':getIamPolicy')) result.bindings[0].members.push('serviceAccount:other@jenfu-platform-prod.iam.gserviceaccount.com')
      if (scenario === 'execution' && url.includes('/executions?')) result.executions = [{ name: executionName }]
      if (scenario === 'issued' && url.includes(profile.tokenSecretId + '/versions?')) result.versions = [{ name: tokenName }]
      return result
    }
    await assert.rejects(executeOpenSwxResources(h.args)); assert.ok(!h.objects.has(h.args.uri))
    assert.ok(h.provider.calls.every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
  }
})

async function firstConsumerHarness() {
  const h = await firstReconciliationHarness(), applied = await executeOpenSwxResources(h.args)
  const legacyRegistry = { schemaVersion: registry.schemaVersion, workloads: [{ id: 'legacy-worker', token: 'L'.repeat(43), purposes: ['recognition_jobs'], capabilities: ['solidworks_document_manager'] }] }
  const initialRegistryName = `projects/9536592944/secrets/${profile.registrySecretId}/versions/2`
  const payloads = new Map([[initialRegistryName, Buffer.from(JSON.stringify(legacyRegistry))]])
  const original = h.transport.request
  h.transport.request = async (url, options = {}) => {
    if (url.endsWith(':addVersion')) {
      h.provider.calls.push({ url, options })
      const name = url.includes(profile.tokenSecretId) ? tokenName : registryName
      assert.ok(!payloads.has(name)); payloads.set(name, Buffer.from(JSON.parse(options.body).payload.data, 'base64'))
      return { name }
    }
    if (url.endsWith(':access')) {
      const name = url.replace('https://secretmanager.googleapis.com/v1/', '').replace(':access', '')
      if (payloads.has(name)) { h.provider.calls.push({ url, options }); return { name, payload: { data: payloads.get(name).toString('base64') } } }
    }
    const result = await original(url, options)
    if (url === `https://run.googleapis.com/v2/${workerJobName()}`) { const raw = structuredClone(result); raw.template.template.executionEnvironment = 'EXECUTION_ENVIRONMENT_GEN2'; if (raw.template.template.containers[0].env.length === 0) delete raw.template.template.containers[0].env; if (raw.template.template.containers[0].args.length === 0) delete raw.template.template.containers[0].args; return raw }
    return result
  }
  const inputRef = await h.put('first-consumer-input', { schemaVersion: 'aipdm.openswx-bootstrap-input.v1', descriptorRef: h.args.descriptorRef, workerBuildRef: h.workerBuildRef, deadlineAt: deadline(), receiptId: 'first-consumer-proof', bootstrapKind: 'FIRST_CREATE', resourceApplyRef: applied.ref, currentRegistryVersion: initialRegistryName })
  const invoke = () => executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} })
  h.provider.calls.length = 0
  return { ...h, invoke, applied, inputRef, payloads, legacyRegistry }
}
test('FIRST_CREATE consumes exact bridge, updates new selftest once, issues two versions preserving registry, and replays without mutations', async () => {
  const h = await firstConsumerHarness(), first = await h.invoke()
  assert.equal(first.value.image, h.args.build.image)
  assert.deepEqual(first.value.facts.resourceApplyRef, h.applied.ref)
  assert.equal(first.value.facts.bootstrapKind, 'FIRST_CREATE')
  assert.equal(h.provider.calls.filter(row => row.url.endsWith(':addVersion')).length, 2)
  assert.equal(h.provider.calls.filter(row => row.options.method === 'PATCH').length, 1)
  assert.equal(h.provider.calls.filter(row => row.url.endsWith(':run')).length, 1)
  const updated = JSON.parse(h.payloads.get(registryName))
  assert.deepEqual(updated.workloads[0], h.legacyRegistry.workloads[0]); assert.equal(updated.workloads[1].id, profile.readerId)
  assert.equal(updated.workloads[1].token, h.payloads.get(tokenName).toString())
  h.provider.calls.length = 0
  assert.deepEqual((await h.invoke()).ref, first.ref)
  assert.ok(h.provider.calls.every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
  assert.ok([...h.objects.values()].every(row => !row.bytes.includes(updated.workloads[1].token)))
  const pauseInput = await h.put('first-consumer-pause-input', { schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef: h.args.descriptorRef, workerBuildRef: h.workerBuildRef, deadlineAt: deadline(), receiptId: 'first-consumer-pause-proof', drainKind: 'FIRST_PROVIDER_ONLY', resourceApplyRef: h.applied.ref })
  const paused = await executeOpenSwxBootstrap({ stage: 'pause', inputRef: pauseInput, transport: h.transport, readSource, appProfile, sleep: async () => {} })
  assert.equal(paused.value.facts.providerJob.template.template.executionEnvironment, 'EXECUTION_ENVIRONMENT_GEN2'); assert.equal(paused.value.facts.providerJob.template.template.containers[0].env, undefined)
  assert.equal(paused.value.templateSha256, sha256(canonicalize(normalizeWorkerTemplate(paused.value.facts.providerJob.template))))
})
test('FIRST consumer rejects stale bridge, provider drift, preissued Secret or altered completed receipt before issuance', async () => {
  for (const scenario of ['mutation', 'descriptor', 'approved', 'normal', 'enabled', 'issued', 'replay-resource', 'replay-template', 'replay-basis']) {
    const h = await firstConsumerHarness()
    if (scenario.startsWith('replay-')) {
      const done = await h.invoke()
      if (scenario === 'replay-resource') done.value.facts.resourceApplyRef = ref('other')
      if (scenario === 'replay-template') done.value.templateSha256 = 'f'.repeat(64)
      if (scenario === 'replay-basis') h.applied.value.firstSourceReconciliation.priorImage = h.args.build.image
      h.objects.get(done.ref.uri).bytes = Buffer.from(canonicalize(done.value))
    } else if (scenario === 'mutation') h.applied.value.mutation = 'OTHER'
    else if (scenario === 'descriptor') h.applied.value.descriptorRef = ref('wrong')
    else if (scenario === 'approved') h.applied.value.approvedPlanRef = ref('wrong')
    else {
      const original = h.transport.request
      h.transport.request = async (url, options) => {
        const result = await original(url, options)
        if (scenario === 'normal' && url === `https://run.googleapis.com/v2/${workerJobName()}`) result.template = workerTemplate(profile, h.args.build.image, tokenName)
        if (scenario === 'enabled' && url.includes('cloudscheduler')) result.state = 'ENABLED'
        if (scenario === 'issued' && url.includes(profile.tokenSecretId + '/versions?')) result.versions = [{ name: tokenName, state: 'DISABLED' }]
        return result
      }
    }
    // writeWorkerJson now returns an independently parsed provider value; synchronize the intentionally corrupted fixture.
    h.objects.get(h.applied.ref.uri).value = h.applied.value
    h.objects.get(h.applied.ref.uri).bytes = Buffer.from(canonicalize(h.applied.value))
    h.provider.calls.length = 0
    await assert.rejects(h.invoke(), undefined, scenario)
    assert.ok(h.provider.calls.every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
  }
})

async function partialFirstHarness() {
  const h = await firstConsumerHarness(), target = descriptor('c'.repeat(40))
  const oldInput = h.objects.get(h.inputRef.uri).value, root = `${profile.receiptRoot}/${oldInput.receiptId}`
  const tokenVersion = `projects/${profile.projectNumber}/secrets/${profile.tokenSecretId}/versions/1`
  const registryVersion = `projects/${profile.projectNumber}/secrets/${profile.registrySecretId}/versions/3`
  const startedAt = h.transport.now(), createdAt = new Date(Date.parse(startedAt) + 10).toISOString()
  const tokenRequest = await h.transport.putJson(root + '-token-version-request.json', { schemaVersion: 'aipdm.openswx-credential-request.v1', secretId: profile.tokenSecretId, payloadSha256: sha256(Buffer.from(token)), startedAt, windowEnd: new Date(Date.parse(startedAt) + 30_000).toISOString() })
  h.payloads.set(tokenVersion, Buffer.from(token))
  const capacity = await h.put('partial-capacity', { project: 'AI-PDM', sourceRevision: target.value.sourceRevision, status: 'PASS', observedAt: h.transport.now() })
  target.value.resourcePlanRef = await h.put('partial-approved', { ...h.objects.get(h.args.descriptor.resourcePlanRef.uri).value, sourceRevision: target.value.sourceRevision, capacityGateRef: capacity })
  const descriptorRef = await h.put('partial-descriptor', target.value), image = `${profile.artifactUri}@sha256:${'c'.repeat(64)}`
  const oldBuild = h.objects.get(h.workerBuildRef.uri).value
  const build = workerReceipt({ descriptor: target.value, kind: 'build', actor: appProfile.identities.builder, image, template: workerTemplate(profile, image, null, 'selftest'), observedAt: h.transport.now(), facts: { ...structuredClone(oldBuild.facts), sourceObject: { sha256: target.value.sourceArchiveSha256, generation: '2' } } })
  const workerBuildRef = await h.put('partial-build', build), original = h.transport.request
  let registryCreatedAt = null
  h.transport.request = async (url, options = {}) => {
    if (url.endsWith(':addVersion')) {
      assert.ok(url.includes(profile.registrySecretId), 'partial FIRST must not reissue reader token')
      h.provider.calls.push({ url, options }); h.payloads.set(registryVersion, Buffer.from(JSON.parse(options.body).payload.data, 'base64')); registryCreatedAt = h.transport.now(); return { name: registryVersion }
    }
    if (url.includes('secretmanager') && url.includes('/versions?')) {
      h.provider.calls.push({ url, options })
      return { versions: url.includes(profile.tokenSecretId) ? [{ name: tokenVersion, state: 'ENABLED', createTime: createdAt }] : [1, 2, ...(h.payloads.has(registryVersion) ? [3] : [])].map(version => ({ name: `projects/${profile.projectNumber}/secrets/${profile.registrySecretId}/versions/${version}`, state: 'ENABLED', createTime: version === 3 ? registryCreatedAt : startedAt })) }
    }
    if (url.includes('secretmanager') && url.endsWith(':access')) {
      const name = url.replace('https://secretmanager.googleapis.com/v1/', '').replace(':access', '')
      if (h.payloads.has(name)) { h.provider.calls.push({ url, options }); return { name, payload: { data: h.payloads.get(name).toString('base64') } } }
    }
    if (url.includes('secretmanager') && url.includes('/versions/')) { h.provider.calls.push({ url, options }); return { name: url.replace('https://secretmanager.googleapis.com/v1/', ''), state: 'ENABLED' } }
    return original(url, options)
  }
  const args = { ...h.args, descriptor: target.value, descriptorRef, build, uri: ref('partial-resources').uri, firstReconciliation: { ...h.args.firstReconciliation, priorBootstrapInputRef: h.inputRef } }
  const resource = () => executeOpenSwxResources(args)
  let nextInputRef = null
  const bootstrap = async applied => {
    const inputRef = nextInputRef ?? await h.put('partial-bootstrap-input', { ...oldInput, descriptorRef, workerBuildRef, resourceApplyRef: applied.ref, receiptId: 'partial-new-proof', deadlineAt: deadline() })
    nextInputRef = inputRef
    return executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} })
  }
  h.provider.calls.length = 0
  return { ...h, args, resource, bootstrap, tokenVersion, registryVersion, tokenRequest, root }
}
test('partial FIRST bridges exact token-only issuance to new source; original token is sealed without reissue and registry preserved', async () => {
  const h = await partialFirstHarness(), applied = await h.resource()
  assert.equal(applied.value.partialFirstBootstrap.tokenSecretVersion, h.tokenVersion)
  assert.deepEqual(applied.value.partialFirstBootstrap.tokenRequestRef, h.tokenRequest.ref)
  assert.ok(h.provider.calls.every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
  const first = await h.bootstrap(applied)
  assert.equal(first.value.facts.tokenSecretVersion, h.tokenVersion); assert.equal(first.value.facts.registrySecretVersion, h.registryVersion)
  assert.equal(h.provider.calls.filter(row => row.url.endsWith(':addVersion')).length, 1)
  assert.ok(h.objects.has(h.root + '-token-version.json')); assert.ok(h.objects.has(h.root + '-registry-version.json'))
  assert.ok(!h.objects.has(ref('partial-new-proof-token-version-request').uri))
  const updated = JSON.parse(h.payloads.get(h.registryVersion)); assert.deepEqual(updated.workloads[0], h.legacyRegistry.workloads[0]); assert.equal(updated.workloads[1].token, token)
  h.provider.calls.length = 0; assert.deepEqual((await h.bootstrap(applied)).ref, first.ref)
  assert.ok(h.provider.calls.every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
})
test('partial FIRST rejects drifted immutable chain, latch schema/window/hash, extra/disabled versions, registry progress, Job or Scheduler before writes', async () => {
  for (const scenario of ['old-input', 'old-apply', 'latch-window', 'latch-secret', 'latch-hash', 'extra-token', 'disabled-token', 'extra-registry', 'registry-progress', 'normal-job', 'enabled-scheduler']) {
    const h = await partialFirstHarness(), original = h.transport.request
    if (scenario === 'old-input') h.objects.get(h.inputRef.uri).value.bootstrapKind = 'DAILY_REFRESH'
    if (scenario === 'old-apply') h.objects.get(h.applied.ref.uri).value.actor = 'other'
    if (scenario.startsWith('latch-')) { const row = h.objects.get(h.tokenRequest.ref.uri); if (scenario === 'latch-window') row.value.windowEnd = 'bad'; if (scenario === 'latch-secret') row.value.secretId = 'sibling'; if (scenario === 'latch-hash') row.value.payloadSha256 = 'f'.repeat(64); row.bytes = Buffer.from(canonicalize(row.value)) }
    if (scenario === 'registry-progress') await h.put('first-consumer-proof-registry-version-request', {})
    h.transport.request = async (url, options) => {
      const value = await original(url, options)
      if (scenario === 'extra-token' && url.includes(profile.tokenSecretId + '/versions?')) value.versions.push({ ...value.versions[0], name: h.tokenVersion.replace('/1', '/2') })
      if (scenario === 'disabled-token' && url.includes(profile.tokenSecretId + '/versions?')) value.versions[0].state = 'DISABLED'
      if (scenario === 'extra-registry' && url.includes(profile.registrySecretId + '/versions?')) value.versions.push({ name: h.registryVersion, state: 'ENABLED' })
      if (scenario === 'normal-job' && url === `https://run.googleapis.com/v2/${workerJobName()}`) value.template = workerTemplate(profile, h.objects.get(h.priorWorkerBuildRef.uri).value.image, h.tokenVersion)
      if (scenario === 'enabled-scheduler' && url.includes('cloudscheduler')) value.state = 'ENABLED'
      return value
    }
    await assert.rejects(h.resource(), undefined, scenario); assert.ok(!h.objects.has(h.args.uri))
    assert.ok(h.provider.calls.every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
  }
})

test('partial FIRST recovers already sealed original registry progress after an unknown Job update without adding credentials again', async () => {
  const h = await partialFirstHarness(), applied = await h.resource(), original = h.transport.request
  h.transport.request = async (url, options) => {
    if (options?.method === 'PATCH') { h.provider.calls.push({ url, options }); throw Object.assign(Error('unknown update'), { code: 'OUTCOME_UNKNOWN' }) }
    return original(url, options)
  }
  await assert.rejects(h.bootstrap(applied), /OUTCOME_UNKNOWN/)
  assert.equal(h.provider.calls.filter(row => row.url.endsWith(':addVersion')).length, 1)
  h.transport.request = original; h.provider.calls.length = 0
  const resumed = await h.bootstrap(applied)
  assert.equal(resumed.value.facts.tokenSecretVersion, h.tokenVersion); assert.equal(resumed.value.facts.registrySecretVersion, h.registryVersion)
  assert.ok(h.provider.calls.every(row => !row.url.endsWith(':addVersion')))
})

async function registryProgressHarness() {
  const h = await partialFirstHarness(), applied = await h.resource(), original = h.transport.request
  h.transport.request = async (url, options = {}) => {
    if (options.method === 'PATCH') { h.provider.calls.push({ url, options }); throw Error('lost update before apply') }
    return original(url, options)
  }
  await assert.rejects(h.bootstrap(applied), /OUTCOME_UNKNOWN/)
  h.transport.request = original
  const next = structuredClone(h.args.descriptor); next.sourceRevision = 'd'.repeat(40)
  const plan = h.objects.get(next.resourcePlanRef.uri).value
  const capacityGateRef = await h.put('progress-capacity', { project: 'AI-PDM', sourceRevision: next.sourceRevision, status: 'PASS', observedAt: h.transport.now() })
  next.resourcePlanRef = await h.put('progress-approved', { ...plan, sourceRevision: next.sourceRevision, capacityGateRef })
  const descriptorRef = await h.put('progress-descriptor', next)
  const build = { ...structuredClone(h.args.build), sourceRevision: next.sourceRevision, image: `${profile.artifactUri}@sha256:${'d'.repeat(64)}` }
  const workerBuildRef = await h.put('progress-build', build)
  const args = { ...h.args, descriptor: next, descriptorRef, build, uri: ref('progress-resources').uri }
  h.provider.calls.length = 0
  return { ...h, args, next, descriptorRef, workerBuildRef }
}
test('new official source FIRST resources bridge sealed v1/v3 without issuance and bootstrap reuses original credential root', async () => {
  const h = await registryProgressHarness(), applied = await executeOpenSwxResources(h.args)
  assert.equal(applied.value.mutation, 'READBACK_ONLY_FIRST_SOURCE_RECONCILIATION')
  assert.equal(applied.value.partialFirstBootstrap.credentialReceiptRoot, h.root)
  assert.ok(h.provider.calls.every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
  const oldInput = h.objects.get(h.inputRef.uri).value
  const inputRef = await h.put('progress-bootstrap-input', { ...oldInput, descriptorRef: h.descriptorRef, workerBuildRef: h.workerBuildRef, resourceApplyRef: applied.ref, receiptId: 'progress-next-proof', deadlineAt: deadline() })
  h.provider.calls.length = 0
  const result = await executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} })
  assert.equal(result.value.facts.tokenSecretVersion, h.tokenVersion); assert.equal(result.value.facts.registrySecretVersion, h.registryVersion)
  assert.ok(h.provider.calls.every(row => !row.url.endsWith(':addVersion')))
  assert.equal(h.provider.calls.filter(row => row.options.method === 'PATCH').length, 1)
  assert.ok(!h.objects.has(ref('progress-next-proof-token-version-request').uri))
  assert.ok(!h.objects.has(ref('progress-next-proof-registry-version-request').uri))
})
test('cross-source registry progress rejects hash/window/requestRef or provider version drift before resource seal', async () => {
  for (const scenario of ['hash', 'window', 'requestRef', 'extra-version', 'disabled-version']) {
    const h = await registryProgressHarness(), request = h.objects.get(h.root + '-registry-version-request.json'), receipt = h.objects.get(h.root + '-registry-version.json')
    if (scenario === 'hash') request.value.payloadSha256 = 'f'.repeat(64)
    if (scenario === 'window') request.value.windowEnd = request.value.startedAt
    if (scenario === 'requestRef') receipt.value.requestRef = ref('foreign-request')
    request.bytes = Buffer.from(canonicalize(request.value)); receipt.bytes = Buffer.from(canonicalize(receipt.value))
    const original = h.transport.request
    h.transport.request = async (url, options = {}) => {
      const row = await original(url, options)
      if (url.includes(profile.registrySecretId + '/versions?')) {
        if (scenario === 'extra-version') row.versions.push({ name: h.registryVersion.replace('/3', '/4'), state: 'ENABLED' })
        if (scenario === 'disabled-version') row.versions.find(v => v.name === h.registryVersion).state = 'DISABLED'
      }
      return row
    }
    await assert.rejects(executeOpenSwxResources(h.args), undefined, scenario)
    assert.ok(!h.objects.has(h.args.uri))
    assert.ok(h.provider.calls.every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
  }
})

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

function installReadbackIamProvider(h, { jobBindings = expectedReadbackJobBindings(), projectBindings = readbackIamProjectPolicy(), roleLookup } = {}) {
  const calls = [], original = h.transport.request
  h.transport.request = async (url, options = {}) => {
    if (url === 'https://iam.googleapis.com/v1/' + READBACK_JOB_ROLE || url === 'https://iam.googleapis.com/v1/' + READBACK_SCHEDULER_ROLE) {
      calls.push({ url, options })
      if (roleLookup) return roleLookup(url)
      return { name: url.slice('https://iam.googleapis.com/v1/'.length), deleted: false, stage: 'GA',
        includedPermissions: url.endsWith('aipdmOpenswxVerifierJobReadback') ? ['run.jobs.get', 'run.executions.list'] : ['cloudscheduler.jobs.get'] }
    }
    if (url === READBACK_IAM_JOB_POLICY_URL) { calls.push({ url, options }); return { bindings: structuredClone(jobBindings) } }
    if (url === READBACK_IAM_PROJECT_POLICY_URL) {
      calls.push({ url, options })
      assert.equal(options.method, 'POST')
      assert.equal(options.body, JSON.stringify({ options: { requestedPolicyVersion: 3 } }))
      return { bindings: structuredClone(typeof projectBindings === 'function' ? projectBindings() : projectBindings) }
    }
    if (!original) throw Error('UNEXPECTED_PROVIDER_API ' + url)
    return original(url, options)
  }
  return calls
}

test('readback IAM Terraform gate requires exactly five scoped create/no-op resources and tolerates only unrelated computed outputs', () => {
  const value = readbackIamPlanFixture(address => address.endsWith('deployer_scheduler_readback') ? ['no-op'] : ['create'])
  assert.equal(assertReadbackIamTerraformPlan(value).length, 5)
  for (const row of value.resource_changes) if (row.change.after.permissions) row.change.after_unknown.permissions = row.change.after.permissions.map(() => false)
  assert.equal(assertReadbackIamTerraformPlan(value).length, 5)
  const allNoOp = readbackIamPlanFixture(() => ['no-op'])
  assert.equal(assertReadbackIamTerraformPlan(allNoOp).length, 5)
  for (const mutate of [
    plan => { plan.resource_changes.pop() },
    plan => { plan.resource_changes.push(structuredClone(plan.resource_changes[0])) },
    plan => { plan.resource_changes[1] = structuredClone(plan.resource_changes[0]) },
    plan => { plan.resource_changes.find(row => row.address.endsWith('verifier_job_readback')).change.after.deleted = true },
    plan => { plan.resource_changes.find(row => row.address.endsWith('verifier_job_readback')).change.after.stage = 'DISABLED' },
    plan => { plan.resource_changes[0].address = 'google_project_iam_member.foreign' },
    plan => { plan.resource_changes[0].change.actions = ['update'] },
    plan => { plan.resource_changes[0].change.actions = ['delete', 'create'] },
    plan => { plan.resource_changes.find(row => row.address.endsWith('verifier_job_readback')).change.after.permissions.push('run.jobs.run') },
    plan => { plan.resource_changes.find(row => row.address.endsWith('verifier_readback')).change.after.member = 'serviceAccount:other@jenfu-platform-prod.iam.gserviceaccount.com' },
    plan => { plan.resource_changes.find(row => row.address.endsWith('verifier_scheduler_readback')).change.after.project = 'sibling-project' },
    plan => { plan.resource_changes.find(row => row.address.endsWith('verifier_job_readback')).change.after_unknown.permissions = [true] },
    plan => { plan.resource_changes[0].change.after_unknown = [] },
    plan => { plan.resource_changes.find(row => row.address.endsWith('verifier_scheduler_readback')).change.after.condition = [{ title: 'broad' }] },
  ]) { const bad = readbackIamPlanFixture(); mutate(bad); assert.throws(() => assertReadbackIamTerraformPlan(bad)) }
})

function recordedReadbackIamNoOpPlanFixture() {
  return JSON.parse(fs.readFileSync(new URL('./dev122-openswx-readback-iam-provider-noop.fixture.json', import.meta.url))).plan
}

test('readback IAM gate accepts the recorded provider no-op plan with the exact full Job name', () => {
  const plan = recordedReadbackIamNoOpPlanFixture()
  assert.deepEqual(assertReadbackIamTerraformPlan(plan), [...READBACK_IAM_ADDRESSES].sort().map(address => ({ address, actions: ['no-op'] })))
  const job = plan.resource_changes.find(row => row.address === 'google_cloud_run_v2_job_iam_member.verifier_readback')
  assert.equal(job.change.after.name, workerJobName())
  assert.deepEqual(job.change.after_unknown, {})
  job.change.after.name = READBACK_IAM_SPECS[job.address].name
  assert.equal(assertReadbackIamTerraformPlan(plan).length, 5)
})

test('readback IAM gate rejects canonical Job name scope, unknown, actor and action drift', () => {
  const mutations = [
    ['foreign project', row => { row.change.after.name = workerJobName().replace('jenfu-platform-prod', 'sibling-project') }],
    ['project number alias', row => { row.change.after.name = workerJobName().replace('jenfu-platform-prod', '9536592944') }],
    ['foreign location', row => { row.change.after.name = workerJobName().replace('asia-east1', 'us-central1') }],
    ['foreign Job', row => { row.change.after.name = workerJobName() + '-other' }],
    ['suffix match', row => { row.change.after.name = 'foreign/' + workerJobName() }],
    ['URL form', row => { row.change.after.name = 'https://run.googleapis.com/v2/' + workerJobName() }],
    ['trailing slash', row => { row.change.after.name = workerJobName() + '/' }],
    ['foreign resource kind', row => { row.change.after.name = workerJobName().replace('/jobs/', '/services/') }],
    ['missing name', row => { delete row.change.after.name }],
    ['non-string name', row => { row.change.after.name = 123 }],
    ['encoded path', row => { row.change.after.name = workerJobName().replace('/jobs/', '%2Fjobs%2F') }],
    ['unknown location', row => { row.change.after_unknown.location = true }],
    ['unknown name', row => { row.change.after_unknown.name = true }],
    ['unknown project', row => { row.change.after_unknown.project = true }],
    ['project drift', row => { row.change.after.project = 'sibling-project' }],
    ['location drift', row => { row.change.after.location = 'us-central1' }],
    ['actor drift', row => { row.change.after.member = READBACK_IAM_DEPLOYER }],
    ['role drift', row => { row.change.after.role = 'roles/run.admin' }],
    ['condition', row => { row.change.after.condition = [{ title: 'other' }] }],
    ['update', row => { row.change.actions = ['update'] }],
    ['import', row => { row.change.importing = { id: 'foreign' } }],
  ]
  for (const [name, mutate] of mutations) {
    const plan = recordedReadbackIamNoOpPlanFixture()
    mutate(plan.resource_changes.find(row => row.address === 'google_cloud_run_v2_job_iam_member.verifier_readback'))
    assert.throws(() => assertReadbackIamTerraformPlan(plan), { code: 'OPENSWX_IAM_PLAN_INVALID' }, name)
  }
})

test('readback IAM receipt source proof is GCS-only; fresh provider seal requires exact bindings and unchanged unrelated project policy', async () => {
  const h = await firstReconciliationHarness()
  const buildRef = h.workerBuildRef, d = h.args.descriptor
  const proof = await seedReadbackIamReceipt(h, { descriptorValue: d, descriptorRef: h.args.descriptorRef, workerBuildRef: buildRef, receiptId: 'iam-proof-gcs-only' })
  let apiCalls = 0
  const gcsOnly = { ...h.transport, request: async () => { apiCalls++; throw Error('IAM_API_FORBIDDEN_IN_PURE_RECEIPT_JOIN') } }
  const joined = await readReadbackIamReceipt({ transport: gcsOnly, ref: proof.receiptRef, sourceRevision: d.sourceRevision, readSource, normalActor: profile.normalActor })
  assert.deepEqual(joined.ref, proof.receiptRef)
  assert.equal(apiCalls, 0)

  let policy = readbackIamProjectPolicy()
  const providerCalls = installReadbackIamProvider(h, { projectBindings: () => policy })
  const verify = () => assertReadbackIamReceipt({ transport: h.transport, ref: proof.receiptRef, sourceRevision: d.sourceRevision, readSource, normalActor: profile.normalActor })
  await verify()
  assert.ok(providerCalls.some(row => row.url === READBACK_IAM_PROJECT_POLICY_URL && row.options.method === 'POST'))
  policy = [...policy, { role: 'roles/jenfu-fixture-unrelated-added-after-seal', members: ['user:unexpected@example.com'] }]
  await assert.rejects(verify(), { code: 'OPENSWX_IAM_READBACK_DRIFT' })
})

async function completedFirstHarness() {
  const h = await partialFirstHarness()
  const oldApplied = await h.resource()
  const oldBootstrap = await h.bootstrap(oldApplied)
  const oldBootstrapInputRow = h.objects.get(ref('partial-bootstrap-input').uri)
  const oldBootstrapInputRef = oldBootstrapInputRow.ref
  const oldBootstrapInput = oldBootstrapInputRow.value
  await new Promise(resolve => setTimeout(resolve, 30))
  const oldPauseInputRef = await h.put('completed-first-pause-input', {
    schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef: h.args.descriptorRef,
    workerBuildRef: oldBootstrapInput.workerBuildRef, deadlineAt: deadline(), receiptId: 'completed-first-pause',
    drainKind: 'FIRST_PROVIDER_ONLY', resourceApplyRef: oldApplied.ref,
  })
  const oldPause = await executeOpenSwxBootstrap({ stage: 'pause', inputRef: oldPauseInputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} })
  assert.equal(oldBootstrap.value.facts.bootstrapKind, 'FIRST_CREATE')
  assert.equal(oldPause.value.facts.schedulerPaused, true)
  assert.equal(oldPause.value.facts.providerJob.name, workerJobName())

  const next = descriptor('e'.repeat(40))
  const capacityGateRef = await h.put('completed-next-capacity', { project: 'AI-PDM', sourceRevision: next.value.sourceRevision, status: 'PASS', observedAt: h.transport.now() })
  const oldApproved = h.objects.get(h.args.descriptor.resourcePlanRef.uri).value
  const approved = await h.put('completed-next-worker-approved', { ...oldApproved, sourceRevision: next.value.sourceRevision, capacityGateRef, plan: next.plan })
  next.value.resourcePlanRef = approved
  const nextDescriptorRef = await h.put('completed-next-descriptor', next.value)
  const nextImage = profile.artifactUri + '@sha256:' + 'e'.repeat(64)
  const nextBuildValue = workerReceipt({ descriptor: next.value, kind: 'build', actor: appProfile.identities.builder, image: nextImage,
    template: workerTemplate(profile, nextImage, null, 'selftest'), observedAt: h.transport.now(),
    facts: { ...structuredClone(h.args.build.facts), sourceObject: { sha256: next.value.sourceArchiveSha256, generation: '4' },
      scan: { ...structuredClone(h.args.build.facts.scan), rawHighOrCriticalVulnerabilityCount: 0 } } })
  const nextBuildRef = await h.put('completed-next-build', nextBuildValue)
  const iam = await seedReadbackIamReceipt(h, { descriptorValue: next.value, descriptorRef: nextDescriptorRef, workerBuildRef: nextBuildRef, receiptId: 'completed-next-iam' })
  const { priorBootstrapInputRef: _partialInput, ...oldBasis } = h.args.firstReconciliation
  const nextArgs = { ...h.args, descriptor: next.value, descriptorRef: nextDescriptorRef, build: nextBuildValue,
    uri: ref('completed-next-resource').uri,
    firstReconciliation: { ...oldBasis, completedFirstBootstrapInputRef: oldBootstrapInputRef,
      completedFirstPauseInputRef: oldPauseInputRef, supplementalIamReadbackRef: iam.receiptRef } }
  const iamCalls = installReadbackIamProvider(h)
  const allCalls = () => [...h.provider.calls, ...iamCalls]
  return { ...h, nextArgs, next, nextDescriptorRef, nextBuildRef, oldBootstrap, oldPause, oldApplied, iam, iamCalls, allCalls }
}
test('completed FIRST bridge accepts sealed selftest/pause and replays before update; bootstrap reuses credentials once', async () => {
  const h = await completedFirstHarness(), { nextArgs, next, nextDescriptorRef, nextBuildRef, iam, allCalls } = h
  h.provider.calls.length = 0
  const resources = await executeOpenSwxResources(nextArgs)
  const resourcesBytes = Buffer.from(h.objects.get(resources.ref.uri).bytes)
  assert.equal(resources.value.mutation, 'READBACK_ONLY_COMPLETED_FIRST_SOURCE_RECONCILIATION')
  assert.deepEqual(resources.value.completedFirstBootstrap.supplementalIamReadbackRef, iam.receiptRef)
  assert.equal(allCalls().filter(row => row.url.endsWith(':addVersion')).length, 0)
  assert.ok(allCalls().every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
  assert.ok(!allCalls().some(row => row.url.includes('terraform') || row.url.endsWith(':run') || row.options.method === 'PATCH'))

  const resourceReplay = await executeOpenSwxResources(nextArgs)
  assert.deepEqual(resourceReplay.ref, resources.ref)
  assert.ok(h.objects.get(resources.ref.uri).bytes.equals(resourcesBytes))
  const bootstrapInputRef = await h.put('completed-next-bootstrap-input', {
    schemaVersion: 'aipdm.openswx-bootstrap-input.v1', descriptorRef: nextDescriptorRef, workerBuildRef: nextBuildRef,
    deadlineAt: deadline(), receiptId: 'completed-next-bootstrap', bootstrapKind: 'FIRST_CREATE',
    resourceApplyRef: resources.ref, currentRegistryVersion: resources.value.completedFirstBootstrap.partialFirstBootstrap.priorRegistryVersion,
  })
  h.provider.calls.length = 0
  const completed = await executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef: bootstrapInputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} })
  assert.equal(allCalls().filter(row => row.url.endsWith(':addVersion')).length, 0)
  assert.equal(allCalls().filter(row => row.options.method === 'PATCH').length, 1)
  assert.equal(allCalls().filter(row => row.url.endsWith(':run')).length, 1)
  const replayCallsStart = allCalls().length
  const replay = await executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef: bootstrapInputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} })
  assert.deepEqual(replay.ref, completed.ref)
  assert.equal(allCalls().slice(replayCallsStart).filter(row => row.url.endsWith(':addVersion') || row.url.endsWith(':run') || row.options.method === 'PATCH').length, 0)
  await assert.rejects(executeOpenSwxResources(nextArgs), /OPENSWX_/u)
  await new Promise(resolve => setTimeout(resolve, 30))
  const pauseInputRef = await h.put('completed-next-owner-pause-input', { schemaVersion: 'aipdm.openswx-pause-input.v1',
    descriptorRef: nextDescriptorRef, workerBuildRef: nextBuildRef, deadlineAt: deadline(), receiptId: 'completed-next-owner-pause',
    drainKind: 'FIRST_PROVIDER_ONLY', resourceApplyRef: resources.ref })
  const paused = await executeOpenSwxBootstrap({ stage: 'pause', inputRef: pauseInputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} })
  const full = { ...next.value, purpose: 'full', workerBuildRef: nextBuildRef, bootstrapRef: completed.ref,
    cloudPreflightRef: completed.value.facts.cloudPreflightRef, pausedDrainedRef: paused.ref, tokenSecretVersion: h.tokenVersion, registrySecretVersion: h.registryVersion }
  delete full.resourcePlanRef
  for (const actor of ['builder', 'verifier', 'deployer']) {
    let apiCalls = 0
    const owner = { ...h.transport, request: async () => { apiCalls++; throw Error(actor + ' MUST_NOT_USE_IAM_API_FOR_PROOF') } }
    const evidence = await readWorkerFullEvidence(owner, full, profile, readSource)
    assert.deepEqual(evidence.supplementalIam, { ref: iam.receiptRef, sourceRevision: next.value.sourceRevision })
    assert.equal(apiCalls, 0)
  }
})

test('readback IAM injected Terraform handles create and recorded no-op once; saved proofs replay read-only', async () => {
  for (const [noOp, lostApplyResponse] of [[false, false], [false, true], [true, false], [true, true]]) {
  const h = await firstReconciliationHarness(), d = h.args.descriptor, receiptId = 'iam-runner-replay-' + String(noOp) + '-' + String(lostApplyResponse)
  const approved = await seedReadbackIamApproval(h, { descriptorValue: d, descriptorRef: h.args.descriptorRef, workerBuildRef: h.workerBuildRef, receiptId })
  const readbackPlan = noOp ? recordedReadbackIamNoOpPlanFixture() : readbackIamPlanFixture(), calls = [], state = { applied: noOp }; let ownedTemp = null
  const projectBefore = readbackIamProjectPolicy().filter(row => row.role !== READBACK_SCHEDULER_ROLE)
  const projectAfter = [...projectBefore, { role: READBACK_SCHEDULER_ROLE, members: [READBACK_IAM_DEPLOYER, READBACK_IAM_VERIFIER].sort() }]
  const iamCalls = installReadbackIamProvider(h, {
    projectBindings: () => state.applied ? projectAfter : projectBefore,
    roleLookup: url => {
      if (!state.applied) throw Object.assign(Error('MISSING'), { code: 'MISSING' })
      return { name: url.slice('https://iam.googleapis.com/v1/'.length), deleted: false, stage: 'GA',
        includedPermissions: url.endsWith('aipdmOpenswxVerifierJobReadback') ? ['run.jobs.get', 'run.executions.list'] : ['cloudscheduler.jobs.get'] }
    },
  })
  const terraformRunner = (args, options) => {
    calls.push(args[0]); ownedTemp = options.cwd
    if (args[0] === 'plan') fs.writeFileSync(path.join(options.cwd, 'owned.tfplan'), Buffer.from('recorded-plan-binary'))
    if (args[0] === 'show') return { status: 0, stdout: JSON.stringify(readbackPlan) }
    if (args[0] === 'apply') {
      assert.deepEqual(args, ['apply', '-input=false', '-no-color', '-auto-approve', 'owned.tfplan'])
      assert.ok(h.objects.has(ref(receiptId + '-request').uri)); assert.ok(h.objects.has(ref(receiptId + '-plan').uri))
      state.applied = true
      if (lostApplyResponse) return { status: 1, stdout: '' }
    }
    return { status: 0, stdout: '' }
  }
  const invoke = () => executeReleaseReadbackIam({ inputRef: approved.inputRef, transport: h.transport, readSource,
    root: fileURLToPath(new URL('../', import.meta.url)), oauthToken: 'recorded-memory-only-token',
    verifyActor: async () => ({ email: 'jedchang0308@jenfu.com.tw' }), terraformRunner })
  const first = await invoke()
  assert.equal(first.value.status, 'APPLIED')
  assert.deepEqual(calls, ['init', 'plan', 'show', 'apply'])
  const savedRequest = h.objects.get(ref(receiptId + '-request').uri).value
  assert.ok(savedRequest.changes.every(row => row.actions[0] === (noOp ? 'no-op' : 'create')))
  if (noOp) assert.equal(first.value.readback.unrelatedProjectBindingsSha256, readbackIamUnrelatedHash(projectAfter))
  assert.equal(first.value.mutation, lostApplyResponse ? 'UNKNOWN_APPLY_THEN_READBACK' : 'APPLY_THEN_READBACK')
  assert.equal(fs.existsSync(ownedTemp), false)
  assert.equal(calls.filter(command => command === 'apply').length, 1)
  assert.ok(h.objects.has(ref(receiptId + '-request').uri)); assert.ok(h.objects.has(ref(receiptId + '-plan').uri))
  const beforeReplay = calls.length, replay = await invoke()
  assert.deepEqual(replay.ref, first.ref)
  assert.equal(calls.length, beforeReplay)
  assert.equal(calls.filter(command => command === 'apply').length, 1)
  assert.ok(iamCalls.every(row => row.options.method !== 'PATCH'))
  }
})


test('completed FIRST missing or mismatched sealed proof and live drift fail before credential or Job writes', async () => {
  for (const scenario of ['missing-token-seal', 'wrong-bootstrap', 'wrong-pause', 'wrong-finite', 'wrong-iam-source', 'enabled-scheduler', 'job-metadata', 'extra-execution', 'extra-scheduler-member', 'extra-role-permission', 'registry-deadline', 'registry-start-after-completion', 'registry-created-after-completion']) {
    const h = await completedFirstHarness(), original = h.transport.request
    const corrupt = (uri, change) => { const row = h.objects.get(uri); change(row.value); row.bytes = Buffer.from(canonicalize(row.value)) }
    if (scenario === 'missing-token-seal') h.objects.delete(h.root + '-token-version.json')
    if (scenario === 'wrong-bootstrap') corrupt(h.oldBootstrap.ref.uri, row => { row.facts.partialFirstBootstrap.tokenSecretVersion = registryName })
    if (scenario === 'wrong-pause') corrupt(h.oldPause.ref.uri, row => { row.facts.drainKind = 'OTHER' })
    if (scenario === 'wrong-finite') { const preflight = h.objects.get(h.oldBootstrap.value.facts.cloudPreflightRef.uri).value; corrupt(preflight.previousRefs[0].uri, row => { row.facts.terminalExitZero = false }) }
    if (scenario === 'wrong-iam-source') corrupt(h.iam.receiptRef.uri, row => { row.sourceRevision = 'f'.repeat(40) })
    const registryRequest = h.objects.get(h.root + '-registry-version-request.json').value
    if (scenario === 'registry-deadline') corrupt(ref('partial-bootstrap-input').uri, row => { row.deadlineAt = new Date(Date.parse(registryRequest.windowEnd) - 1).toISOString() })
    if (scenario === 'registry-start-after-completion') corrupt(h.oldBootstrap.ref.uri, row => { row.observedAt = new Date(Date.parse(registryRequest.startedAt) - 1).toISOString() })
    h.transport.request = async (url, options) => {
      const row = structuredClone(await original(url, options))
      if (scenario === 'enabled-scheduler' && url.includes('cloudscheduler')) row.state = 'ENABLED'
      if (scenario === 'job-metadata' && url === `https://run.googleapis.com/v2/${workerJobName()}`) row.labels = { unapproved: 'drift' }
      if (scenario === 'extra-execution' && url.includes('/executions?')) row.executions.push({ ...structuredClone(row.executions[0]), name: row.executions[0].name + '-extra' })
      if (scenario === 'extra-scheduler-member' && url === READBACK_IAM_PROJECT_POLICY_URL) row.bindings.find(binding => binding.role === READBACK_SCHEDULER_ROLE).members.push('user:unexpected@example.com')
      if (scenario === 'extra-role-permission' && url.endsWith('aipdmOpenswxSchedulerReadback')) row.includedPermissions.push('cloudscheduler.jobs.run')
      if (scenario === 'registry-created-after-completion' && url.includes(profile.registrySecretId + '/versions?')) row.versions.find(version => version.name.endsWith('/3')).createTime = new Date(Date.parse(registryRequest.startedAt) + 20_000).toISOString()
      return row
    }
    h.provider.calls.length = 0; h.iamCalls.length = 0
    const before = [...h.objects.keys()].sort()
    await assert.rejects(executeOpenSwxResources(h.nextArgs), undefined, scenario)
    assert.deepEqual([...h.objects.keys()].sort(), before, scenario + ' must remain read-only')
    assert.ok(h.allCalls().every(row => !row.url.endsWith(':addVersion') && !row.url.endsWith(':run') && row.options.method !== 'PATCH'))
  }
})

test('completed FIRST recovers after a preflight seal interruption without a second PATCH or execution', async () => {
  const h = await completedFirstHarness(), applied = await executeOpenSwxResources(h.nextArgs)
  const inputRef = await h.put('completed-interrupted-input', { schemaVersion: 'aipdm.openswx-bootstrap-input.v1', descriptorRef: h.nextDescriptorRef, workerBuildRef: h.nextBuildRef,
    deadlineAt: deadline(), receiptId: 'completed-interrupted', bootstrapKind: 'FIRST_CREATE', resourceApplyRef: applied.ref,
    currentRegistryVersion: applied.value.completedFirstBootstrap.partialFirstBootstrap.priorRegistryVersion })
  const invoke = () => executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} })
  const original = h.transport.putJson, uri = ref('completed-interrupted').uri
  h.transport.putJson = async (target, value, ...rest) => { if (target === uri) throw Object.assign(Error('response interrupted before final seal'), { code: 'OUTCOME_UNKNOWN' }); return original(target, value, ...rest) }
  h.provider.calls.length = 0; h.iamCalls.length = 0
  await assert.rejects(invoke(), { code: 'OUTCOME_UNKNOWN' })
  const preflight = h.objects.get(ref('completed-interrupted-preflight').uri), savedBytes = Buffer.from(preflight.bytes)
  assert.equal(h.allCalls().filter(row => row.options.method === 'PATCH').length, 1)
  assert.equal(h.allCalls().filter(row => row.url.endsWith(':run')).length, 1)
  h.transport.putJson = original; h.provider.calls.length = 0; h.iamCalls.length = 0
  const done = await invoke()
  assert.equal(done.value.facts.tokenSecretVersion, h.tokenVersion)
  assert.ok(h.objects.get(preflight.ref.uri).bytes.equals(savedBytes))
  assert.equal(h.allCalls().filter(row => row.options.method === 'PATCH' || row.url.endsWith(':run') || row.url.endsWith(':addVersion')).length, 0)
})


test('credential issuance refuses a thirty-second request window beyond the fresh deadline before any write', async () => {
  const h = memory(), ownUri = ref('short-credential-deadline').uri
  h.transport.request = async () => { throw Error('NO_PROVIDER_CALL_AUTHORIZED') }
  await assert.rejects(addCredentialVersion({ transport: h.transport, profile, secretId: profile.tokenSecretId,
    bytes: Buffer.from(token), uri: ownUri, deadlineAt: new Date(Date.now() + 1000).toISOString() }), { code: 'OPENSWX_CREDENTIAL_REQUEST_DEADLINE' })
  assert.equal(h.objects.size, 0)
})


test('incomplete registry progress is limited by each fixed fresh recovery input and cannot derive completed IAM authority', async () => {
  for (const stage of ['resources', 'bootstrap']) {
    const h = await registryProgressHarness()
    let invoke
    if (stage === 'resources') {
      h.args.deadlineAt = new Date(Date.now() + 1000).toISOString()
      invoke = () => executeOpenSwxResources(h.args)
    } else {
      const applied = await executeOpenSwxResources(h.args), oldInput = h.objects.get(h.inputRef.uri).value
      assert.equal(applied.value.completedFirstBootstrap, undefined)
      assert.equal(applied.value.supplementalIamReadbackRef, undefined)
      const inputRef = await h.put('partial-short-deadline-input', { ...oldInput, descriptorRef: h.descriptorRef, workerBuildRef: h.workerBuildRef,
        resourceApplyRef: applied.ref, receiptId: 'partial-short-deadline', deadlineAt: new Date(Date.now() + 1000).toISOString() })
      invoke = () => executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef, transport: h.transport, readSource, appProfile, sleep: async () => {} })
    }
    h.provider.calls.length = 0
    const before = [...h.objects.keys()].sort()
    await assert.rejects(invoke(), { code: 'OPENSWX_REGISTRY_CREDENTIAL_AUTHORITY_INVALID' })
    assert.deepEqual([...h.objects.keys()].sort(), before)
    assert.ok(h.provider.calls.every(row => !row.url.endsWith(':addVersion') && !row.url.endsWith(':run') && row.options.method !== 'PATCH'))
  }
})


const producerReleaseId = 'DEV122-QA-SOURCE-READER'

async function completedR06ProducerFixture() {
  const h = await completedFirstHarness()
  const resources = await executeOpenSwxResources(h.nextArgs)
  const bootstrapInputRef = await h.put('producer-r06-bootstrap-input', {
    schemaVersion: 'aipdm.openswx-bootstrap-input.v1', descriptorRef: h.nextDescriptorRef,
    workerBuildRef: h.nextBuildRef, deadlineAt: deadline(), receiptId: 'producer-r06-bootstrap',
    bootstrapKind: 'FIRST_CREATE', resourceApplyRef: resources.ref,
    currentRegistryVersion: resources.value.completedFirstBootstrap.partialFirstBootstrap.priorRegistryVersion,
  })
  const bootstrap = await executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef: bootstrapInputRef,
    transport: h.transport, readSource, appProfile, sleep: async () => {} })
  await new Promise(resolve => setTimeout(resolve, 30))
  const pauseInputRef = await h.put('producer-r06-pause-input', {
    schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef: h.nextDescriptorRef,
    workerBuildRef: h.nextBuildRef, deadlineAt: deadline(), receiptId: 'producer-r06-pause',
    drainKind: 'FIRST_PROVIDER_ONLY', resourceApplyRef: resources.ref,
  })
  const paused = await executeOpenSwxBootstrap({ stage: 'pause', inputRef: pauseInputRef,
    transport: h.transport, readSource, appProfile, sleep: async () => {} })
  const full = { ...h.next.value, purpose: 'full', workerBuildRef: h.nextBuildRef,
    bootstrapRef: bootstrap.ref, cloudPreflightRef: bootstrap.value.facts.cloudPreflightRef,
    pausedDrainedRef: paused.ref, tokenSecretVersion: h.tokenVersion, registrySecretVersion: h.registryVersion }
  delete full.resourcePlanRef
  const fullDescriptorRef = await h.put('producer-r06-full-descriptor', full)
  const sourceLock = buildSourceFreeze({ profile: appProfile, releaseId: producerReleaseId,
    observedAt: h.transport.now(), git: { clean: true, branch: appProfile.application.branch,
      sourceRevision: full.sourceRevision, sourceTree: 'f'.repeat(40), remoteRevision: full.sourceRevision },
    sourceIdentityBytes: Buffer.from('producer source-reader test fixture'),
    migrationBundle: { bundle: { manifestSha256: 'd'.repeat(64) } } })
  const sourceLockRef = await h.put('producer-r06-source-lock', sourceLock)
  const fixed = appProfile.environment.fixedValues
  const controlled = appProfile.environment.controlledValues
  const plainEnvironment = Object.fromEntries(appProfile.environment.requiredPlainEnvironmentNames.map(name => [
    name, fixed[name] ?? controlled[name]?.defaultValue ?? (name === 'PDM_FIREBASE_API_KEY' ? 'fixture-api-key' : 'fixture-app-id'),
  ]))
  const secretVersions = Object.fromEntries(appProfile.environment.requiredSecretNames.map(name => [
    name, name === 'PDM_WORKLOAD_AUTH_CREDENTIALS' ? h.registryVersion.split('/').at(-1) : '1',
  ]))
  const readWorkerSource = (repositoryPath, revision) => {
    assert.equal(revision, full.sourceRevision)
    return repositoryPath === WORKER_PROFILE_PATH ? profileBytes : readSource(repositoryPath)
  }
  const readWorkerSourceFailsAtSupplementalIam = (repositoryPath, revision) => {
    assert.equal(revision, full.sourceRevision)
    if (repositoryPath === WORKER_PROFILE_PATH) return profileBytes
    if (READBACK_IAM_PATHS.includes(repositoryPath)) {
      throw Object.assign(new Error('bounded fixture source read failure'), { code: 'PRODUCER_TEST_SOURCE_UNAVAILABLE' })
    }
    return readSource(repositoryPath)
  }
  const runtimeInput = { sourceLockRef, openswxWorkerRef: fullDescriptorRef,
    plainEnvironment, secretVersions }
  return { h, resources, bootstrap, paused, full, fullDescriptorRef, sourceLock, sourceLockRef,
    readWorkerSource, readWorkerSourceFailsAtSupplementalIam, runtimeInput, plainEnvironment, secretVersions }
}

function producerOutputUri(stage) {
  return 'gs://' + appProfile.artifact.releaseBucket + '/receipts/releases/' + producerReleaseId + '/' + stage + '.json'
}

async function seedReleaseIntentProducerInputs(fx, runtimeConfigRef) {
  const expiresAt = deadline()
  const common = { ownerApplicationId: 'ai-pdm', projectId: appProfile.target.projectId,
    releaseId: producerReleaseId, sourceRevision: fx.full.sourceRevision, releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND', status: 'PASS', environment: 'production',
    remainingHumanAction: 0, expiresAt }
  const authorizationPolicyRef = await fx.h.put('producer-release-authorization', common)
  const readinessReceiptRef = await fx.h.put('producer-release-readiness', common)
  const foundationReceiptRef = await fx.h.put('producer-release-foundation', {
    ...common, ownerApplicationId: 'shared-foundation', status: 'APPLIED',
    evidenceScope: 'PRODUCTION_PROVIDER', foundationManifestSha256: 'e'.repeat(64),
  })
  const infraReceiptRef = await fx.h.put('producer-release-infra', {
    schemaVersion: 'jenfu.dev012.app-infra-receipt.v1', ...common, status: 'APPLIED',
    evidenceScope: 'PRODUCTION_PROVIDER', region: appProfile.target.region,
    migrationRunnerDigest: appProfile.artifact.migrationRunnerUri + '@sha256:' + 'a'.repeat(64),
    controllerImageDigest: appProfile.artifact.uri + '@sha256:' + 'b'.repeat(64),
    foundationManifestSha256: 'e'.repeat(64),
  })
  return { sourceLockRef: fx.sourceLockRef, authorizationPolicyRef, readinessReceiptRef,
    foundationReceiptRef, infraReceiptRef, runtimeConfigRef,
    openswxWorkerRef: fx.fullDescriptorRef, previousRevision: 'ai-pdm-prod-producer-fixture-old',
    deadlineAt: deadline() }
}

test('runtime-config producer forwards the frozen source reader for completed full worker evidence', async () => {
  const fx = await completedR06ProducerFixture()
  fx.h.provider.calls.length = 0
  fx.h.iamCalls.length = 0
  const make = readWorkerSource => executePrerequisiteProducer({ stage: 'runtime-config',
    releaseId: producerReleaseId, input: fx.runtimeInput, profile: appProfile,
    root: '/', transport: fx.h.transport, readWorkerSource, observedAt: fx.h.transport.now() })
  const result = await make(fx.readWorkerSource)
  const runtimeValue = fx.h.objects.get(result.ref.uri).value
  assert.equal(runtimeValue.status, 'VERIFIED')
  assert.equal(runtimeValue.runtimeConfig.plainEnvironment.PDM_OPENSWX_DISPATCH_ENABLED, '1')
  assert.deepEqual(runtimeValue.runtimeConfig.openswxWorker, {
    descriptorRef: fx.fullDescriptorRef, sourceRevision: fx.full.sourceRevision,
    workerProfileSha256: fx.full.workerProfileSha256, purpose: 'full',
  })
  assert.equal(runtimeValue.runtimeConfig.secretVersions.PDM_WORKLOAD_AUTH_CREDENTIALS,
    fx.full.registrySecretVersion.split('/').at(-1))
  assert.equal(result.ref.uri, producerOutputUri('runtime-config'))
  assert.equal(fx.h.provider.calls.length, 0)
  assert.equal(fx.h.iamCalls.length, 0)

  const absent = await completedR06ProducerFixture()
  await assert.rejects(executePrerequisiteProducer({ stage: 'runtime-config', releaseId: producerReleaseId,
    input: absent.runtimeInput, profile: appProfile, root: '/', transport: absent.h.transport,
    readWorkerSource: undefined, observedAt: absent.h.transport.now() }), { code: 'OPENSWX_FROZEN_SOURCE_READER_REQUIRED' })
  assert.equal(absent.h.objects.has(producerOutputUri('runtime-config')), false)

  const bad = await completedR06ProducerFixture()
  bad.h.provider.calls.length = 0; bad.h.iamCalls.length = 0
  await assert.rejects(executePrerequisiteProducer({ stage: 'runtime-config', releaseId: producerReleaseId,
    input: bad.runtimeInput, profile: appProfile, root: '/', transport: bad.h.transport,
    readWorkerSource: bad.readWorkerSourceFailsAtSupplementalIam,
    observedAt: bad.h.transport.now() }), { code: 'PRODUCER_TEST_SOURCE_UNAVAILABLE' })
  assert.equal(bad.h.objects.has(producerOutputUri('runtime-config')), false)
  assert.equal(bad.h.provider.calls.length, 0)
})

test('release-intent producer forwards the frozen source reader for completed full worker evidence', async () => {
  const fx = await completedR06ProducerFixture()
  const runtime = await executePrerequisiteProducer({ stage: 'runtime-config', releaseId: producerReleaseId,
    input: fx.runtimeInput, profile: appProfile, root: '/', transport: fx.h.transport,
    readWorkerSource: fx.readWorkerSource, observedAt: fx.h.transport.now() })
  const input = await seedReleaseIntentProducerInputs(fx, runtime.ref)
  fx.h.provider.calls.length = 0
  fx.h.iamCalls.length = 0
  const make = readWorkerSource => executePrerequisiteProducer({ stage: 'release-intent',
    releaseId: producerReleaseId, input, profile: appProfile, root: '/', transport: fx.h.transport,
    readWorkerSource, validateIntent: assertDev117ReleaseIntent, observedAt: fx.h.transport.now() })
  const result = await make(fx.readWorkerSource)
  const intentValue = fx.h.objects.get(result.ref.uri).value
  assert.equal(intentValue.ownerApplicationId, 'ai-pdm')
  assert.equal(intentValue.sourceRevision, fx.full.sourceRevision)
  assert.deepEqual(intentValue.openswxWorkerRef, fx.fullDescriptorRef)
  assert.deepEqual(intentValue.runtimeConfigRef, runtime.ref)
  assert.deepEqual(intentValue.sourceLockRef, fx.sourceLockRef)
  assert.equal(result.ref.uri, producerOutputUri('release-intent'))
  assert.equal(fx.h.provider.calls.length, 0)
  assert.equal(fx.h.iamCalls.length, 0)

  for (const [label, callback, expectedCode] of [
    ['missing', undefined, 'OPENSWX_FROZEN_SOURCE_READER_REQUIRED'],
    ['unavailable', fx.readWorkerSourceFailsAtSupplementalIam, 'PRODUCER_TEST_SOURCE_UNAVAILABLE'],
  ]) {
    const bad = await completedR06ProducerFixture()
    const badRuntime = await executePrerequisiteProducer({ stage: 'runtime-config', releaseId: producerReleaseId,
      input: bad.runtimeInput, profile: appProfile, root: '/', transport: bad.h.transport,
      readWorkerSource: bad.readWorkerSource, observedAt: bad.h.transport.now() })
    const badInput = await seedReleaseIntentProducerInputs(bad, badRuntime.ref)
    await assert.rejects(executePrerequisiteProducer({ stage: 'release-intent', releaseId: producerReleaseId,
      input: badInput, profile: appProfile, root: '/', transport: bad.h.transport,
      readWorkerSource: callback, validateIntent: assertDev117ReleaseIntent,
      observedAt: bad.h.transport.now() }), { code: expectedCode }, label)
    assert.equal(bad.h.objects.has(producerOutputUri('release-intent')), false)
  }
})

async function completeSourceSuccessor(h, args, descriptorRef, buildRef, label) {
  const resources = await executeOpenSwxResources(args)
  const bootstrapInputRef = await h.put(label + '-bootstrap-input', {
    schemaVersion: 'aipdm.openswx-bootstrap-input.v1', descriptorRef, workerBuildRef: buildRef,
    deadlineAt: deadline(), receiptId: label + '-bootstrap', bootstrapKind: 'FIRST_CREATE',
    resourceApplyRef: resources.ref, currentRegistryVersion: resources.value.completedFirstBootstrap.partialFirstBootstrap.priorRegistryVersion,
  })
  const bootstrap = await executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef: bootstrapInputRef,
    transport: h.transport, readSource, appProfile, sleep: async () => {} })
  await new Promise(resolve => setTimeout(resolve, 30))
  const pauseInputRef = await h.put(label + '-pause-input', {
    schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef, workerBuildRef: buildRef,
    deadlineAt: deadline(), receiptId: label + '-pause', drainKind: 'FIRST_PROVIDER_ONLY', resourceApplyRef: resources.ref,
  })
  const paused = await executeOpenSwxBootstrap({ stage: 'pause', inputRef: pauseInputRef,
    transport: h.transport, readSource, appProfile, sleep: async () => {} })
  return { args, descriptorRef, buildRef, resources, bootstrapInputRef, bootstrap, pauseInputRef, paused }
}
async function prepareNextSourceSuccessor(h, previous, ordinal) {
  const label = 'nested-successor-' + ordinal, d = descriptor(ordinal.toString(16).padStart(40, '0'))
  const capacityGateRef = await h.put(label + '-capacity', { project: 'AI-PDM', sourceRevision: d.value.sourceRevision, status: 'PASS', observedAt: h.transport.now() })
  const oldPlan = h.objects.get(previous.args.descriptor.resourcePlanRef.uri).value
  d.value.resourcePlanRef = await h.put(label + '-approved', { ...oldPlan, sourceRevision: d.value.sourceRevision,
    resourcePlanHash: d.value.resourcePlanHash, capacityGateRef, plan: d.plan })
  const descriptorRef = await h.put(label + '-descriptor', d.value), image = profile.artifactUri + '@sha256:' + ordinal.toString(16).padStart(64, '0')
  const build = workerReceipt({ descriptor: d.value, kind: 'build', actor: appProfile.identities.builder, image,
    template: workerTemplate(profile, image, null, 'selftest'), observedAt: h.transport.now(),
    facts: { ...structuredClone(previous.args.build.facts), sourceObject: { sha256: d.value.sourceArchiveSha256, generation: String(ordinal) } } })
  const buildRef = await h.put(label + '-build', build)
  const iam = await seedReadbackIamReceipt(h, { descriptorValue: d.value, descriptorRef, workerBuildRef: buildRef, receiptId: label + '-iam' })
  return { descriptorRef, buildRef, label, args: { ...h.nextArgs, descriptor: d.value, descriptorRef, build, uri: ref(label + '-resource').uri,
    firstReconciliation: { ...h.nextArgs.firstReconciliation, completedFirstBootstrapInputRef: previous.bootstrapInputRef,
      completedFirstPauseInputRef: previous.pauseInputRef, supplementalIamReadbackRef: iam.receiptRef } } }
}
function assertNoSuccessorProviderWrites(h) {
  assert.ok(h.allCalls().every(row => row.options.method !== 'PATCH' && !row.url.endsWith(':run') && !row.url.endsWith(':addVersion')))
}
test('third source completed-FIRST proves both predecessor executions, reuses sealed credentials and replays without mutation', async () => {
  const h = await completedFirstHarness()
  const r6 = await completeSourceSuccessor(h, h.nextArgs, h.nextDescriptorRef, h.nextBuildRef, 'nested-r06')
  const r7 = await prepareNextSourceSuccessor(h, r6, 7)
  h.provider.calls.length = 0; h.iamCalls.length = 0
  const resource = await executeOpenSwxResources(r7.args), savedBytes = Buffer.from(h.objects.get(resource.ref.uri).bytes)
  assert.equal(resource.value.mutation, 'READBACK_ONLY_COMPLETED_FIRST_SOURCE_RECONCILIATION')
  assert.deepEqual(Object.keys(resource.value.completedFirstBootstrap).sort(), Object.keys(r6.resources.value.completedFirstBootstrap).sort())
  assert.deepEqual(resource.value.completedFirstBootstrap.bootstrapRef, r6.bootstrap.ref)
  assert.equal(resource.value.completedFirstBootstrap.tokenSecretVersion, h.tokenVersion)
  assert.equal(resource.value.completedFirstBootstrap.registrySecretVersion, h.registryVersion)
  assertNoSuccessorProviderWrites(h)
  assert.deepEqual((await executeOpenSwxResources(r7.args)).ref, resource.ref)
  assert.ok(h.objects.get(resource.ref.uri).bytes.equals(savedBytes)); assertNoSuccessorProviderWrites(h)
  h.provider.calls.length = 0; h.iamCalls.length = 0
  const completed = await completeSourceSuccessor(h, r7.args, r7.descriptorRef, r7.buildRef, r7.label)
  assert.equal(completed.bootstrap.value.facts.tokenSecretVersion, h.tokenVersion)
  assert.equal(completed.bootstrap.value.facts.registrySecretVersion, h.registryVersion)
  assert.equal(h.allCalls().filter(row => row.options.method === 'PATCH').length, 1)
  assert.equal(h.allCalls().filter(row => row.url.endsWith(':run')).length, 1)
  assert.equal(h.allCalls().filter(row => row.url.endsWith(':addVersion')).length, 0)
  const executions = await h.transport.request(`https://run.googleapis.com/v2/${workerJobName()}/executions?pageSize=100`)
  assert.equal(executions.executions.length, 3)
  assert.equal(new Set(executions.executions.map(row => row.name)).size, 3)
  assert.ok(executions.executions.every(row => row.conditions[0].state === 'CONDITION_SUCCEEDED'))
  h.provider.calls.length = 0; h.iamCalls.length = 0
  assert.deepEqual((await executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef: completed.bootstrapInputRef,
    transport: h.transport, readSource, appProfile, sleep: async () => {} })).ref, completed.bootstrap.ref)
  assertNoSuccessorProviderWrites(h)
})
test('third source rejects missing or extra inherited execution, nested receipt drift and malformed finite clocks before writes', async () => {
  for (const scenario of ['missing-execution', 'extra-execution', 'nested-proof', 'wrong-iam-source', 'missing-create', 'invalid-create', 'numeric-completion', 'invalid-marker']) {
    const h = await completedFirstHarness(), r6 = await completeSourceSuccessor(h, h.nextArgs, h.nextDescriptorRef, h.nextBuildRef, 'negative-r06')
    const r7 = await prepareNextSourceSuccessor(h, r6, 7), original = h.transport.request
    const corrupt = (reference, mutate) => { const row = h.objects.get(reference.uri); mutate(row.value); row.bytes = Buffer.from(canonicalize(row.value)) }
    if (scenario === 'nested-proof') corrupt(r6.resources.ref, value => { value.completedFirstBootstrap.tokenSecretVersion = registryName })
    if (scenario === 'wrong-iam-source') corrupt(r7.args.firstReconciliation.supplementalIamReadbackRef, value => { value.sourceRevision = 'f'.repeat(40) })
    const preflight = h.objects.get(h.oldBootstrap.value.facts.cloudPreflightRef.uri).value
    if (scenario === 'missing-create') corrupt(preflight.previousRefs[0], value => { delete value.facts.execution.createTime })
    if (scenario === 'invalid-create') corrupt(preflight.previousRefs[0], value => { value.facts.execution.createTime = 'invalid' })
    if (scenario === 'numeric-completion') corrupt(preflight.previousRefs[0], value => { value.facts.execution.completionTime = 2026 })
    if (scenario === 'invalid-marker') corrupt(h.oldBootstrap.value.facts.cloudPreflightRef, value => { value.facts.proof.marker.timestamp = 'invalid'; value.facts.proof.markerSha256 = sha256(canonicalize(value.facts.proof.marker)) })
    h.transport.request = async (url, options) => {
      const value = structuredClone(await original(url, options))
      if (url.includes('/executions?')) {
        if (scenario === 'missing-execution') value.executions.shift()
        if (scenario === 'extra-execution') value.executions.push({ ...structuredClone(value.executions[0]), name: value.executions[0].name + '-extra' })
      }
      return value
    }
    h.provider.calls.length = 0; h.iamCalls.length = 0
    const before = [...h.objects.keys()].sort()
    await assert.rejects(executeOpenSwxResources(r7.args), /OPENSWX_/u, scenario)
    assert.deepEqual([...h.objects.keys()].sort(), before); assertNoSuccessorProviderWrites(h)
  }
})
test('completed-FIRST recursive proof rejects a cycle and stops at eight immutable predecessor inputs', async () => {
  const h = await completedFirstHarness()
  let prior = await completeSourceSuccessor(h, h.nextArgs, h.nextDescriptorRef, h.nextBuildRef, 'bounded-r06')
  const r7 = await prepareNextSourceSuccessor(h, prior, 7), row = h.objects.get(prior.resources.ref.uri)
  const saved = structuredClone(row.value)
  row.value.completedFirstBootstrap.completedFirstBootstrapInputRef = prior.bootstrapInputRef
  row.bytes = Buffer.from(canonicalize(row.value))
  h.provider.calls.length = 0; h.iamCalls.length = 0
  await assert.rejects(executeOpenSwxResources(r7.args), { code: 'OPENSWX_COMPLETED_FIRST_CHAIN_INVALID' }); assertNoSuccessorProviderWrites(h)
  row.value = saved; row.bytes = Buffer.from(canonicalize(saved))
  // The base anchor plus seven completed successors is the final admissible walk.
  for (let ordinal = 7; ordinal <= 13; ordinal++) {
    const next = ordinal === 7 ? r7 : await prepareNextSourceSuccessor(h, prior, ordinal)
    prior = await completeSourceSuccessor(h, next.args, next.descriptorRef, next.buildRef, next.label)
  }
  const refused = await prepareNextSourceSuccessor(h, prior, 14)
  h.provider.calls.length = 0; h.iamCalls.length = 0
  const before = [...h.objects.keys()].sort()
  await assert.rejects(executeOpenSwxResources(refused.args), { code: 'OPENSWX_COMPLETED_FIRST_CHAIN_INVALID' })
  assert.deepEqual([...h.objects.keys()].sort(), before); assertNoSuccessorProviderWrites(h)
})


test('stdout proof refuses malformed or inverted execution windows before a logging request', async () => {
  for (const clocks of [{ createTime: undefined, completionTime: new Date().toISOString() },
    { createTime: 'invalid', completionTime: new Date().toISOString() },
    { createTime: new Date().toISOString(), completionTime: 'invalid' },
    { createTime: '2026-01-01T00:00:00Z', completionTime: 2026 },
    { createTime: '2026-10-06T00:00:02Z', completionTime: '2026-10-06T00:00:01Z' }]) {
    let calls = 0
    await assert.rejects(readWorkerStdoutProof({ transport: { request: async () => { calls++; throw Error('UNAUTHORIZED_LOG_QUERY') } },
      profile, execution: { name: executionName, ...clocks }, deadlineAt: deadline() }), { code: 'OPENSWX_STDOUT_WINDOW_INVALID' })
    assert.equal(calls, 0)
  }
})
test('same completed-FIRST bootstrap replay refuses malformed create and marker timestamps without writes', async () => {
  for (const scenario of ['missing-create', 'invalid-create', 'numeric-completion', 'invalid-marker']) {
    const h = await completedFirstHarness()
    const r6 = await completeSourceSuccessor(h, h.nextArgs, h.nextDescriptorRef, h.nextBuildRef, 'clock-replay-r06')
    const preflightRow = h.objects.get(r6.bootstrap.value.facts.cloudPreflightRef.uri)
    const finiteRow = h.objects.get(preflightRow.value.previousRefs[0].uri)
    if (scenario === 'missing-create') delete finiteRow.value.facts.execution.createTime
    if (scenario === 'invalid-create') finiteRow.value.facts.execution.createTime = 'invalid'
    if (scenario === 'numeric-completion') finiteRow.value.facts.execution.completionTime = 2026
    if (scenario === 'invalid-marker') {
      preflightRow.value.facts.proof.marker.timestamp = 'invalid'
      preflightRow.value.facts.proof.markerSha256 = sha256(canonicalize(preflightRow.value.facts.proof.marker))
    }
    finiteRow.bytes = Buffer.from(canonicalize(finiteRow.value)); preflightRow.bytes = Buffer.from(canonicalize(preflightRow.value))
    h.provider.calls.length = 0; h.iamCalls.length = 0
    const before = [...h.objects.keys()].sort()
    await assert.rejects(executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef: r6.bootstrapInputRef,
      transport: h.transport, readSource, appProfile, sleep: async () => {} }), { code: 'OPENSWX_COMPLETED_FIRST_EXECUTION_INVALID' })
    assert.deepEqual([...h.objects.keys()].sort(), before); assertNoSuccessorProviderWrites(h)
  }
})
test('both full-worker producer stages reject mismatched supplemental IAM source bytes before output writes', async () => {
  for (const stage of ['runtime-config', 'release-intent']) {
    const fx = await completedR06ProducerFixture()
    let input = fx.runtimeInput
    if (stage === 'release-intent') {
      const runtime = await executePrerequisiteProducer({ stage: 'runtime-config', releaseId: producerReleaseId,
        input, profile: appProfile, transport: fx.h.transport, readWorkerSource: fx.readWorkerSource })
      input = await seedReleaseIntentProducerInputs(fx, runtime.ref)
    }
    const driftedSource = (p, revision) => {
      const bytes = fx.readWorkerSource(p, revision)
      return READBACK_IAM_PATHS.includes(p) ? Buffer.concat([bytes, Buffer.from('unexpected source drift')]) : bytes
    }
    fx.h.provider.calls.length = 0; fx.h.iamCalls.length = 0
    const before = [...fx.h.objects.keys()].sort()
    await assert.rejects(executePrerequisiteProducer({ stage, releaseId: producerReleaseId, input,
      profile: appProfile, transport: fx.h.transport, readWorkerSource: driftedSource,
      validateIntent: assertDev117ReleaseIntent }), { code: 'OPENSWX_IAM_SOURCE_DRIFT' })
    assert.deepEqual([...fx.h.objects.keys()].sort(), before); assert.equal(fx.h.provider.calls.length, 0); assert.equal(fx.h.iamCalls.length, 0)
  }
})
