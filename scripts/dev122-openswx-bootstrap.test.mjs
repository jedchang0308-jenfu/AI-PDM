import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { canonicalize, sha256, releasePaths } from './lib/dev012-owner-release-runtime.mjs'
import { OPENSWX_TERRAFORM_ADDRESSES, OPENSWX_TERRAFORM_PATHS, assertWorkerTerraformPlan, parseOpenSwxBootstrapArgs, parseWorkerStdoutMarker, readWorkerStdoutProof, appendReaderCredential, addCredentialVersion, verifyExistingReaderCredentials, executeOpenSwxBootstrap, executeOpenSwxResources } from './lib/dev122-openswx-bootstrap.mjs'
import { WORKER_SOURCE_PATHS, workerTemplate, workerTemplatePolicy, workerReceipt, workerJobName, workerSchedulerName, readWorkerFullEvidence, readPriorWorkerActivation, runWorkerFinite } from './lib/dev122-openswx-owner-release.mjs'

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
  const putJson = async (uri, value) => { const bytes = Buffer.from(canonicalize(value)), row = { bytes, value, ref: { uri, sha256: sha256(bytes) }, metadata: { generation: '1' } }; if (objects.has(uri)) assert.deepEqual(objects.get(uri).value, value); objects.set(uri, row); return row }
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
  await provider.transport.request(`https://run.googleapis.com/v2/${workerJobName()}?updateMask=template`, { method: 'PATCH', body: JSON.stringify({ template: workerTemplate(profile, h.args.build.image, null, 'selftest') }) })
  await provider.transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}:pause`, { method: 'POST', body: '{}' })
  provider.calls.length = 0; h.transport.request = provider.transport.request
  const originalRequest = Buffer.from(h.objects.get(ref('resources-test-request').uri).bytes), originalPlan = Buffer.from(h.objects.get(ref('resources-test-plan').uri).bytes)
  const first = await executeOpenSwxResources(h.args)
  await new Promise(resolve => setTimeout(resolve, 5))
  const replay = await executeOpenSwxResources(h.args)
  assert.deepEqual(first.ref, replay.ref); assert.equal(first.value.observedAt, replay.value.observedAt)
  assert.equal(first.value.mutation, 'READBACK_ONLY'); assert.equal(first.value.binaryPlanSha256, 'd'.repeat(64))
  assert.ok(h.objects.get(ref('resources-test-request').uri).bytes.equals(originalRequest)); assert.ok(h.objects.get(ref('resources-test-plan').uri).bytes.equals(originalPlan))
  assert.ok(provider.calls.every(row => !row.options.method || row.options.method === 'GET'))
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
    if (url.includes('cloudscheduler')) { if (url.endsWith(':pause')) state = 'PAUSED'; if (url.endsWith(':resume')) { state = 'ENABLED'; if (controls.resumeUnknown) throw Error('unknown resume') } return { name: workerSchedulerName(), state, schedule: '*/5 * * * *', attemptDeadline: '30s', retryConfig: { retryCount: 0 }, httpTarget: target } }
    if (url.includes('secretmanager')) {
      if (url.endsWith(':access')) { const name = url.includes(profile.tokenSecretId) ? tokenName : registryName; return { name, payload: { data: (name === tokenName ? Buffer.from(token) : Buffer.from(JSON.stringify(registry))).toString('base64') } } }
      if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/secretmanager.secretAccessor', members: [`serviceAccount:${profile.readerServiceAccount}`] }] }
      if (url.includes('/versions/')) return { name: url.includes(profile.tokenSecretId) ? tokenName : registryName, state: 'ENABLED' }
      return { name: `projects/9536592944/secrets/${profile.tokenSecretId}` }
    }
    if (url.includes('/roles/')) { const lifecycle = url.endsWith('aipdmOpenswxJobLifecycle'); return { name: `projects/${profile.projectId}/roles/${lifecycle ? 'aipdmOpenswxJobLifecycle' : 'aipdmOpenswxJobReadback'}`, includedPermissions: lifecycle ? ['run.jobs.get', 'run.jobs.update', 'run.jobs.run', 'run.executions.get', 'run.executions.list', 'run.executions.cancel'] : ['run.jobs.get', 'run.executions.get', 'run.executions.list'] } }
    if (url.includes('iam.googleapis.com')) { if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/iam.serviceAccountUser', members: ['serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com'] }] }; return { email: url.split('/').at(-1) } }
    if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/run.invoker', members: ['serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'] }, { role: 'projects/jenfu-platform-prod/roles/aipdmOpenswxJobReadback', members: ['serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'] }, { role: 'projects/jenfu-platform-prod/roles/aipdmOpenswxJobLifecycle', members: ['serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com'] }] }
    if (url.includes('logging.googleapis.com')) { const execution = executions.at(-1), row = marker(controls.markerState ?? (execution.template.containers[0].args.length ? 'isolation_verified' : 'empty'), execution.name); row.timestamp = execution.completionTime; return { entries: [row] } }
    if (url.endsWith(':run')) { const now = Date.now(); executions.push({ name: executionName + '-' + executions.length, createTime: new Date(now + 10).toISOString(), completionTime: new Date(now + 20).toISOString(), succeededCount: 1, failedCount: 0, conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }], template: structuredClone(job.template.template) }); return { name: 'projects/9536592944/locations/asia-east1/operations/recorded' } }
    if (url.includes('/executions?')) return { executions }
    if (url.includes('/executions/')) return executions.find(row => row.name === url.replace('https://run.googleapis.com/v2/', ''))
    if (options.method === 'PATCH') { job = { ...job, etag: job.etag + 'x', template: JSON.parse(options.body).template }; return {} }
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
  await h.transport.request(`https://run.googleapis.com/v2/${workerJobName()}?updateMask=template`, { method: 'PATCH', body: JSON.stringify({ template }) })
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
