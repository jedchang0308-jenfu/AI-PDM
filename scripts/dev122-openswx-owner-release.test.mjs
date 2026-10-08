import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertRuntimeConfig, buildRuntimeConfig, canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { assertOpenSwxWorkerProfile, assertOpenSwxWorkerRef, assertWorkerDescriptor, assertWorkerJob, normalizeWorkerTemplate, workerReceipt, assertWorkerRuntimeJoin, assertPausedScheduler, assertCurrentReadyScheduler, canonicalWorkerExecution, workerJobName, workerSchedulerName, workerTemplate, workerTemplatePolicy, writeWorkerJson, runWorkerFinite, updateWorkerJob, boundOpenSwxTransport } from './lib/dev122-openswx-owner-release.mjs'
import { assertPausedRepairBaseline, assertPausedRepairCurrentCheck, buildPausedRepairDescriptor, repairSnapshotProjection, assertTerminalExecution, listWorkerExecutions } from './lib/dev122-openswx-owner-release.mjs'

const profileBytes = fs.readFileSync(new URL('../config/release/dev122-openswx-worker.json', import.meta.url))
const profile = JSON.parse(profileBytes)
const appProfile = JSON.parse(fs.readFileSync(new URL('../config/release/dev117-ai-pdm-independent-production-v3.json', import.meta.url)))
const sourceRevision = 'a'.repeat(40), image = `${profile.artifactUri}@sha256:${'b'.repeat(64)}`
const ref = name => ({ uri: `${profile.receiptRoot}/${name}.json`, sha256: 'c'.repeat(64) })
const token = 'projects/9536592944/secrets/aipdm-prod-openswx-reader-token/versions/7'
export function workerDescriptor(purpose = 'build_only') {
  const common = { schemaVersion: 'aipdm.openswx-worker-descriptor.v1', ownerApplicationId: 'ai-pdm', purpose, sourceRevision,
    sourceArchiveSha256: 'd'.repeat(64), workerProfileSha256: sha256(profileBytes), resourcePlanHash: 'e'.repeat(64),
    normalTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'normal'))), selftestTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'selftest'))) }
  for (const key of ['projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'dispatchPolicy', 'bounds', 'receiptRoot']) common[key] = profile[key]
  return { ...common, ...(purpose === 'build_only' ? { resourcePlanRef: ref('approved-plan') } : { workerBuildRef: ref('a-build'), bootstrapRef: ref('bootstrap'), cloudPreflightRef: ref('preflight'), pausedDrainedRef: ref('drained'), tokenSecretVersion: token, registrySecretVersion: 'projects/9536592944/secrets/aipdm-prod-workload-auth-credentials/versions/9' }) }
}
function b23Baseline() {
  const retained = workerDescriptor('full'), sourceLockRef = { uri: `gs://jenfu-platform-prod-aipdm-release/receipts/source-lock.json`, sha256: 'a'.repeat(64) }
  const snapshot = { jobName: workerJobName(), jobEtag: 'provider-etag', jobGeneration: '15', normalTemplateSha256: sha256(canonicalize(workerTemplate(profile, image, token))), image,
    numericCredentials: { token, registry: retained.registrySecretVersion }, secretMetadata: [{ name: token, state: 'ENABLED', etag: 'token-etag' }, { name: retained.registrySecretVersion, state: 'ENABLED', etag: 'registry-etag' }],
    schedulerState: 'PAUSED', schedulerPolicySha256: 'a'.repeat(64), schedulerUserUpdateTime: null, iamSha256: 'b'.repeat(64), executions: [] }
  const releaseRef = name => ({ uri: `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-B23-TEST/${name}.json`, sha256: 'c'.repeat(64) })
  const baseline = { schemaVersion: 'aipdm.openswx-paused-app-repair-baseline.v1', ownerApplicationId: 'ai-pdm', purpose: 'PAUSED_APP_REPAIR', status: 'PASS', evidenceScope: 'PRODUCTION_PROVIDER_READBACK',
    inputRef: ref('input'), source: { sourceRevision, sourceArchiveSha256: retained.sourceArchiveSha256, sourceLockRef, workerProfileSha256: retained.workerProfileSha256, resourcePlanHash: retained.resourcePlanHash },
    priorActivationRef: ref('activation'), retainedWorkerDescriptorRef: ref('retained-full'), predecessorBaselineRef: null,
    servingApp: { capsuleRef: releaseRef('release-intent'), canonicalRef: releaseRef('canonical'), finalizeRef: releaseRef('finalize'), terminalRef: releaseRef('terminal'), runtimeConfigRef: releaseRef('runtime'),
      workerDescriptorRef: ref('retained-full'), sourceRevision, revision: 'ai-pdm-prod-44984e6018dc', artifactDigest: `${appProfile.artifact.uri}@sha256:${'f'.repeat(64)}`, workerStatus: 'READY', serviceEtag: 'service-etag', generalTrafficPercent: 100, tagCount: 0, canonicalOrigin: profile.canonicalOrigin },
    actor: profile.normalActor, observationStartedAt: '2026-10-08T00:00:00Z', observationCompletedAt: '2026-10-08T00:00:55Z', observedAt: '2026-10-08T00:00:55Z', pauseFenceSeconds: 55, before: structuredClone(snapshot), after: structuredClone(snapshot),
    providerReadbackRefs: [{ id: 'job-before', api: 'RUN_JOB', method: 'GET', url: `https://run.googleapis.com/v2/${workerJobName()}`, observedAt: '2026-10-08T00:00:00Z', bodyRef: ref('raw-job') }],
    resourcesUnchanged: true, mutationPerformed: false, providerQuiescenceProven: true, dbAdmissionProof: 'NOT_YET_PROVEN', continuationDepth: 1 }
  return { baseline, retained }
}
test('B23 Job ProtoJSON omission is settled while explicit malformed reconciling is rejected', () => {
  const template = workerTemplate(profile, image, token)
  const job = { name: workerJobName(), generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, template }
  assert.equal(assertWorkerJob(job, template), job)
  assert.equal(assertWorkerJob({ ...job, reconciling: false }, template).reconciling, false)
  for (const reconciling of [null, 'false', 0, 1, true]) assert.throws(() => assertWorkerJob({ ...job, reconciling }, template), /OPENSWX_JOB_READBACK_MISMATCH/u)
})
test('B23 repair descriptor derives full mode and preserved credentials without a fabricated bootstrap', () => {
  const { baseline, retained } = b23Baseline(), baselineRef = ref('paused-baseline'), associationRef = ref('association')
  const association = { ...baseline.source, schemaVersion: 'aipdm.openswx-worker-build-association.v2', resourceBasis: 'PAUSED_APP_REPAIR', resourceAssociation: { readbackRef: baselineRef }, priorActivationRef: baseline.priorActivationRef }
  const value = buildPausedRepairDescriptor({ profile, association, associationRef, baseline, baselineRef, retainedDescriptor: retained, retainedDescriptorRef: baseline.retainedWorkerDescriptorRef })
  assert.equal(value.purpose, 'full'); assert.equal(value.tokenSecretVersion, token); assert.equal(value.releaseVariant, 'PAUSED_APP_REPAIR')
  for (const key of ['bootstrapRef', 'cloudPreflightRef', 'pausedDrainedRef']) assert.equal(Object.hasOwn(value, key), false)
  for (const patch of [{ purpose: 'build_only' }, { releaseVariant: 'DAILY' }, { pausedDrainedRef: ref('forged') }, { bounds: { ...value.bounds, maxExecutionPages: 5 } }, { tokenSecretVersion: token.replace('/7', '/latest') }]) assert.throws(() => assertWorkerDescriptor({ ...value, ...patch }, profile, retained.workerProfileSha256, sourceRevision))
})
test('B23 baseline rejects drift, nested excess, short fences and false database admission', () => {
  const { baseline } = b23Baseline(); assertPausedRepairBaseline(baseline, profile)
  const mutations = [b => b.after.jobEtag = 'changed', b => b.after.secretMetadata[1].etag = 'changed', b => b.after.numericCredentials.extra = 'x', b => b.source.extra = 'x',
    b => b.servingApp.tagCount = 1, b => b.observationCompletedAt = '2026-10-08T00:00:54Z', b => b.dbAdmissionProof = 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN', b => b.continuationDepth = 9,
    b => b.providerReadbackRefs[0].extra = true, b => b.after.executions.push({ name: 'sibling', createTime: baseline.observedAt, completionTime: baseline.observedAt, completedState: 'CONDITION_SUCCEEDED', rawPageRef: ref('raw') })]
  for (const mutate of mutations) { const changed = structuredClone(baseline); mutate(changed); assert.throws(() => assertPausedRepairBaseline(changed, profile)) }
  const execution = { name: `${workerJobName().replace('jenfu-platform-prod', '9536592944')}/executions/test`, createTime: baseline.observationStartedAt, completionTime: baseline.observedAt, completedState: 'CONDITION_FAILED', rawPageRef: ref('before-page') }
  baseline.before.executions = [execution]; baseline.after.executions = [{ ...execution, rawPageRef: ref('after-page') }]
  assertPausedRepairBaseline(baseline, profile); assert.deepEqual(repairSnapshotProjection(baseline.before), repairSnapshotProjection(baseline.after))
})
test('B23 provider terminal inventory permits omitted false and rejects active or malformed explicit values', () => {
  const row = { name: `${workerJobName()}/executions/terminal`, createTime: '2026-10-08T00:00:00Z', completionTime: '2026-10-08T00:00:01Z', conditions: [{ type: 'Completed', state: 'CONDITION_FAILED' }] }
  assertTerminalExecution(row, row.name); assertTerminalExecution({ ...row, reconciling: false }, row.name)
  for (const reconciling of [true, null, 'false', 0]) assert.throws(() => assertTerminalExecution({ ...row, reconciling }, row.name))
  assert.throws(() => assertTerminalExecution({ ...row, conditions: [...row.conditions, ...row.conditions] }, row.name))
})
test('B23 current check cannot promote provider quiescence into database admission', () => {
  const { baseline } = b23Baseline(), check = { schemaVersion: 'aipdm.openswx-paused-app-repair-check.v1', associationRef: ref('association'), pausedBaselineRef: ref('baseline'), actor: profile.normalActor,
    observedAt: baseline.observedAt, phase: 'PRODUCER_REPLAY', providerReadbackRefs: baseline.providerReadbackRefs, jobEtag: baseline.after.jobEtag, jobGeneration: baseline.after.jobGeneration,
    normalTemplateSha256: baseline.after.normalTemplateSha256, schedulerState: 'PAUSED', executions: [], servingRevision: baseline.servingApp.revision, dbAdmissionProof: 'NOT_YET_PROVEN' }
  assertPausedRepairCurrentCheck(check, baseline, profile)
  for (const patch of [{ actor: 'other@example.com' }, { phase: 'ACTIVATE' }, { schedulerState: 'ENABLED' }, { dbAdmissionProof: 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN' }, { jobEtag: 'changed' }, { migrationVerified: true }]) assert.throws(() => assertPausedRepairCurrentCheck({ ...check, ...patch }, baseline, profile))
})
test('B19 fixed ENABLED READY and legacy PAUSED policies remain separate with exact zero retry semantics', () => {
  const ready = { name: workerSchedulerName(), state: 'ENABLED', schedule: profile.bounds.schedule, timeZone: 'Etc/UTC', attemptDeadline: '30s',
    httpTarget: { uri: profile.canonicalOrigin + profile.recoverPath, httpMethod: 'POST', body: 'e30=', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Google-Cloud-Scheduler' }, oidcToken: { serviceAccountEmail: profile.dispatchServiceAccount, audience: profile.canonicalOrigin } } }
  assertCurrentReadyScheduler(ready, profile); assert.throws(() => assertPausedScheduler(ready, profile), { code: 'OPENSWX_SCHEDULER_NOT_PAUSED' })
  const paused = { ...ready, state: 'PAUSED' }; assertPausedScheduler(paused, profile); assert.throws(() => assertCurrentReadyScheduler(paused, profile), { code: 'OPENSWX_SCHEDULER_NOT_CURRENT_READY' })
  for (const retryConfig of [undefined, {}, { retryCount: 0 }, { maxRetryDuration: '0s' }, { retryCount: 0, maxRetryDuration: '0.000000000s' }]) {
    assertCurrentReadyScheduler({ ...ready, retryConfig }, profile); assertPausedScheduler({ ...paused, retryConfig }, profile)
  }
  for (const mutation of [{ state: 'DISABLED' }, { schedule: '* * * * *' }, { timeZone: 'Asia/Taipei' }, { attemptDeadline: '60s' }, { httpTarget: { ...ready.httpTarget, body: 'eA==' } }, { httpTarget: { ...ready.httpTarget, oidcToken: { ...ready.httpTarget.oidcToken, audience: 'https://other' } } }, ...[null, [], { retryCount: '0' }, { retryCount: 1 }, { maxRetryDuration: '0' }, { maxRetryDuration: '1s' }].map(retryConfig => ({ retryConfig }))]) assert.throws(() => assertCurrentReadyScheduler({ ...ready, ...mutation }, profile))
})
test('B19 closed v2 keeps the original purpose/runtime contract; v1 old-source plan is never rebound', () => {
  for (const purpose of ['build_only', 'full']) {
    const d = { ...workerDescriptor(purpose), schemaVersion: 'aipdm.openswx-worker-descriptor.v2', artifactMode: 'REUSE_VERIFIED' }
    if (purpose === 'build_only') { delete d.resourcePlanRef; d.workerBuildRef = ref('association') }
    assertWorkerDescriptor(d, profile, sha256(profileBytes), sourceRevision)
    for (const patch of [{ artifactMode: 'BUILD' }, { purpose: 'reuse' }, { resourcePlanRef: ref('forged-current-approval') }, { command: 'build' }]) assert.throws(() => assertWorkerDescriptor({ ...d, ...patch }, profile, sha256(profileBytes), sourceRevision))
  }
  assertWorkerDescriptor(workerDescriptor(), profile, sha256(profileBytes), sourceRevision)
})
test('fixed profile and descriptor reject arbitrary authority, mutable refs and policy/actual confusion', () => {
  assertOpenSwxWorkerProfile(profile)
  assertWorkerDescriptor(workerDescriptor(), profile, sha256(profileBytes), sourceRevision)
  for (const extra of [{ projectId: 'sibling' }, { secretVersion: 'latest' }, { normalTemplateSha256: 'f'.repeat(64) }, { normalTemplatePolicySha256: '0'.repeat(64) }]) assert.throws(() => assertWorkerDescriptor({ ...workerDescriptor(), ...extra }, profile, sha256(profileBytes), sourceRevision))
  assert.throws(() => assertOpenSwxWorkerRef({ uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/sibling.json', sha256: 'a'.repeat(64) }))
  assert.throws(() => assertWorkerDescriptor(workerDescriptor('full'), profile, 'f'.repeat(64), sourceRevision))
})
test('actual normal/selftest templates expose only the intended singleton numeric credential', () => {
  const normal = workerTemplate(profile, image, token), selftest = workerTemplate(profile, image, null, 'selftest')
  assert.equal(normal.template.containers[0].env[1].name, 'PDM_OPENSWX_READER_TOKEN')
  assert.equal(normal.template.containers[0].env[1].valueSource.secretKeyRef.version, '7')
  assert.deepEqual(selftest.template.containers[0].env, [])
  assert.deepEqual(selftest.template.containers[0].args, ['--isolation-self-test-only'])
  assert.notEqual(sha256(canonicalize(normal)), workerDescriptor().normalTemplatePolicySha256)
  assert.throws(() => workerTemplate(profile, image, token.replace('/7', '/latest')))
  assert.throws(() => workerTemplate(profile, image.replace('docker.pkg.dev', 'dockerXpkgXdev'), token))
})
test('canonical provider names accept only the own named/numeric project equivalence', () => {
  const named = `${workerJobName()}/executions/ai-pdm-prod-openswx-metadata-x`
  assert.equal(canonicalWorkerExecution(named), named.replace('jenfu-platform-prod', '9536592944'))
  for (const wrong of [named.replace('jenfu-platform-prod', 'sibling'), named.replace('asia-east1', 'us-east1'), named.replace('/jobs/ai-pdm-prod-openswx-metadata/', '/jobs/sibling/'), named + '/tasks/1']) assert.throws(() => canonicalWorkerExecution(wrong))
})
test('legacy OFF and fixed B ON require a descriptor/source/profile runtime join', () => {
  const plain = Object.fromEntries(appProfile.environment.requiredPlainEnvironmentNames.map(name => [name, appProfile.environment.fixedValues[name] ?? appProfile.environment.controlledValues[name]?.defaultValue ?? 'test']))
  const secrets = Object.fromEntries(appProfile.environment.requiredSecretNames.map(name => [name, '1']))
  const legacy = buildRuntimeConfig(appProfile, { plainEnvironment: plain, secretVersions: secrets }); assertRuntimeConfig(appProfile, legacy); assertWorkerRuntimeJoin(legacy, { sourceRevision })
  for (const flag of ['1', true, 1, 'true', '2']) assert.throws(() => buildRuntimeConfig(appProfile, { plainEnvironment: { ...plain, PDM_OPENSWX_DISPATCH_ENABLED: flag }, secretVersions: secrets }))
  const descriptor = workerDescriptor('full'), binding = { descriptorRef: ref('b-descriptor'), sourceRevision, workerProfileSha256: descriptor.workerProfileSha256, purpose: 'full' }
  const runtime = buildRuntimeConfig(appProfile, { plainEnvironment: { ...plain, PDM_OPENSWX_DISPATCH_ENABLED: '1' }, secretVersions: secrets, openswxWorker: binding })
  runtime.secretVersions.PDM_WORKLOAD_AUTH_CREDENTIALS = '9'
  const boundRuntime = buildRuntimeConfig(appProfile, { plainEnvironment: runtime.plainEnvironment, secretVersions: runtime.secretVersions, openswxWorker: binding })
  assertRuntimeConfig(appProfile, boundRuntime); assertWorkerRuntimeJoin(boundRuntime, { sourceRevision, openswxWorkerRef: binding.descriptorRef }, descriptor)
  assert.throws(() => assertWorkerRuntimeJoin(runtime, { sourceRevision }))
  assert.throws(() => assertWorkerRuntimeJoin(runtime, { sourceRevision, openswxWorkerRef: ref('wrong') }, descriptor))
  assert.throws(() => assertWorkerRuntimeJoin(runtime, { sourceRevision, openswxWorkerRef: binding.descriptorRef }, { ...descriptor, workerProfileSha256: 'f'.repeat(64) }))
  assert.throws(() => buildRuntimeConfig(appProfile, { plainEnvironment: { ...plain, PDM_OPENSWX_DISPATCH_ENABLED: '1' }, secretVersions: secrets, openswxWorker: { ...binding, purpose: 'build_only' } }))
  assert.throws(() => buildRuntimeConfig(appProfile, { plainEnvironment: { ...plain, OTHER_EXTENSION: '1' }, secretVersions: secrets }))
})
function recordedProvider({ ambiguous = false, wrongTemplate = false } = {}) {
  const objects = new Map(), calls = [], template = workerTemplate(profile, image, token)
  const executionName = `${workerJobName().replace('jenfu-platform-prod', '9536592944')}/executions/ai-pdm-prod-openswx-metadata-x`
  let posted = false
  const job = { name: workerJobName(), etag: 'e1', generation: '1', observedGeneration: '1', reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' }, template }
  const execution = { name: executionName, createTime: '2026-10-05T00:00:01Z', completionTime: '2026-10-05T00:00:02Z', succeededCount: 1, failedCount: 0, template: wrongTemplate ? {} : template.template, conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }] }
  const transport = { now: () => '2026-10-05T00:00:00Z',
    putJson: async (uri, value) => { const bytes = Buffer.from(canonicalize(value)); const row = { value, bytes, ref: { uri, sha256: sha256(bytes) }, metadata: { generation: '1' } }; if (objects.has(uri)) assert.deepEqual(objects.get(uri).value, value); objects.set(uri, row); return { bytes: row.bytes, ref: row.ref, metadata: row.metadata } },
    readBytes: async uri => { if (!objects.has(uri)) throw Object.assign(Error('MISSING'), { code: 'MISSING' }); return objects.get(uri) },
    request: async (url, options = {}) => { calls.push({ url, options });
      if (url.endsWith(':run')) { posted = true; throw Object.assign(Error('lost response'), { code: 'OUTCOME_UNKNOWN' }) }
      if (url.includes('/executions?')) return { executions: posted ? (ambiguous ? [execution, { ...execution, name: executionName + '-other' }] : [execution]) : [] }
      if (url.includes('/executions/')) return execution
      return job
    } }
  return { transport, template, objects, calls, job, executionName }
}

test('B23 malformed execution page token cannot complete a finite pre-run inventory', async () => {
  for (const [index, nextPageToken] of [false, 0, null, 1, [], {}].entries()) {
    const h = recordedProvider(), request = h.transport.request
    h.transport.request = async (url, options) => {
      const result = await request(url, options)
      return url.includes('/executions?') ? { ...result, nextPageToken } : result
    }
    await assert.rejects(runWorkerFinite({ transport: h.transport, descriptor: workerDescriptor('full'), profile, template: h.template,
      receiptUri: ref(`malformed-page-${index}`).uri, actor: 'fixed-wif', deadlineAt: new Date(Date.now() + 120000).toISOString() }), /OPENSWX_EXECUTIONS_PAGE_LIMIT/u)
    assert.equal(h.calls.filter(row => row.url.includes('/executions?')).length, 1)
    assert.equal(h.objects.size, 0, 'rejected inventory cannot publish even the finite request')
    assert.equal(h.calls.filter(row => row.url.endsWith(':run') || row.url.endsWith(':resume') || row.options.method === 'PATCH' || row.options.method === 'POST').length, 0)
  }
})
test('B23 execution inventory permits absent empty and bounded nonempty page tokens', async () => {
  for (const tail of [{}, { nextPageToken: '' }]) {
    let reads = 0
    assert.deepEqual(await listWorkerExecutions({ request: async () => { reads++; return { executions: [], ...tail } } }), [])
    assert.equal(reads, 1)
  }
  const calls = [], rows = ['first', 'second'].map(name => ({ name: `${workerJobName()}/executions/${name}` }))
  const inventory = await listWorkerExecutions({ request: async url => { calls.push(url); return calls.length === 1 ? { executions: [rows[0]], nextPageToken: 'closed-next-page' } : { executions: [rows[1]] } } })
  assert.deepEqual(inventory, rows); assert.equal(calls.length, 2); assert.equal(new URL(calls[1]).searchParams.get('pageToken'), 'closed-next-page')
})
test('finite request clock binds a full or deadline-clamped window to one advancing timestamp', async () => {
  for (const limit of [120_000, 15_000]) {
    const h = recordedProvider(), provider = h.transport.request, started = Date.now() + 1000
    let reads = 0
    h.transport.now = () => new Date(started + reads++ * 17).toISOString()
    h.transport.request = async (url, options) => {
      const value = await provider(url, options)
      const clocked = execution => ({ ...execution, createTime: new Date(started + 1000).toISOString(), completionTime: new Date(started + 2000).toISOString() })
      if (url.includes('/executions?')) return { ...value, executions: value.executions.map(clocked) }
      if (url.includes('/executions/')) return clocked(value)
      return value
    }
    const uri = ref('single-clock-' + limit).uri
    const args = { transport: h.transport, descriptor: workerDescriptor('full'), profile, template: h.template, receiptUri: uri, actor: 'fixed-wif', deadlineAt: new Date(started + limit).toISOString() }
    const first = await runWorkerFinite(args)
    const request = h.objects.get(first.value.facts.requestRef.uri).value
    assert.equal(request.requestStartedAt, new Date(started).toISOString())
    assert.equal(request.requestWindowEndsAt, new Date(started + Math.min(limit, 30_000)).toISOString())
    assert.ok(Date.parse(request.requestWindowEndsAt) - Date.parse(request.requestStartedAt) <= 30_000)
    assert.deepEqual((await runWorkerFinite(args)).ref, first.ref)
    assert.equal(h.calls.filter(row => row.url.endsWith(':run')).length, 1)
  }
})
test('finite request clock rejects invalid or post-deadline timestamps before any write or run', async () => {
  const end = Date.now() + 60_000
  for (const clock of ['not-a-date', new Date(end).toISOString(), new Date(end + 1).toISOString()]) {
    const h = recordedProvider(); h.transport.now = () => clock
    await assert.rejects(runWorkerFinite({ transport: h.transport, descriptor: workerDescriptor('full'), profile, template: h.template, receiptUri: ref('bad-clock').uri, actor: 'fixed-wif', deadlineAt: new Date(end).toISOString() }), { code: 'OPENSWX_EXECUTION_DEADLINE' })
    assert.equal(h.objects.size, 0)
    assert.equal(h.calls.filter(row => row.url.endsWith(':run')).length, 0)
  }
})


test('unknown :run reads exact provider execution; durable replay never executes again or claims 204', async () => {
  const h = recordedProvider(), descriptor = workerDescriptor('full')
  const args = { transport: h.transport, descriptor, profile, template: h.template, receiptUri: ref('finite').uri, actor: 'fixed-wif', deadlineAt: '2999-01-01T00:00:00Z' }
  const first = await runWorkerFinite(args), replay = await runWorkerFinite(args)
  assert.deepEqual(first.ref, replay.ref)
  assert.equal(h.calls.filter(call => call.url.endsWith(':run')).length, 1)
  assert.equal(h.calls.find(call => call.url.endsWith(':run')).options.body, '{}')
  assert.equal(first.value.facts.workerStatus, 'ACTIVATION_PENDING')
  assert.equal(first.value.facts.claimProof, 'PENDING_NORMAL_ACTOR_STDOUT_READBACK')
  assert.ok(h.calls.every(call => !call.url.includes('/operations?') && !call.url.includes('/jobs/-/')))
})
test('ambiguous execution or wrong actual template cannot produce a successful finite receipt', async () => {
  for (const options of [{ ambiguous: true }, { wrongTemplate: true }]) {
    const h = recordedProvider(options)
    await assert.rejects(runWorkerFinite({ transport: h.transport, descriptor: workerDescriptor('full'), profile, template: h.template, receiptUri: ref('finite').uri, actor: 'fixed-wif', deadlineAt: '2999-01-01T00:00:00Z' }))
    assert.ok(!h.objects.has(ref('finite').uri))
  }
})
test('Job update never repeats an unknown PATCH and requires paused scheduler exact target', async () => {
  const h = recordedProvider(), changed = structuredClone(h.template); changed.template.containers[0].args = ['--isolation-self-test-only']
  let patches = 0
  const request = h.transport.request
  h.transport.request = async (url, options) => { if (options?.method === 'PATCH') { patches++; throw Error('unknown') } return request(url, options) }
  await assert.rejects(updateWorkerJob({ transport: h.transport, profile, template: changed, deadlineAt: '2999-01-01T00:00:00Z' }), /OUTCOME_UNKNOWN/); assert.equal(patches, 1)
  assertWorkerJob(h.job, h.template)
  const scheduler = { name: workerSchedulerName(), state: 'PAUSED', schedule: '*/5 * * * *', timeZone: 'Etc/UTC', attemptDeadline: '30s', retryConfig: { retryCount: 0 }, httpTarget: { uri: profile.canonicalOrigin + profile.recoverPath, httpMethod: 'POST', body: 'e30=', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Google-Cloud-Scheduler' }, oidcToken: { serviceAccountEmail: profile.dispatchServiceAccount, audience: profile.canonicalOrigin } } }
  assertPausedScheduler(scheduler, profile)
  assert.throws(() => assertPausedScheduler({ ...scheduler, state: 'ENABLED' }, profile))
})
test('actual Scheduler zero retry limits may be omitted but nonzero, null and invalid limits fail closed', () => {
  const scheduler = { name: workerSchedulerName(), state: 'PAUSED', schedule: '*/5 * * * *', timeZone: 'Etc/UTC', attemptDeadline: '30s', httpTarget: { uri: profile.canonicalOrigin + profile.recoverPath, httpMethod: 'POST', body: 'e30=', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Google-Cloud-Scheduler' }, oidcToken: { serviceAccountEmail: profile.dispatchServiceAccount, audience: profile.canonicalOrigin } } }
  for (const retryConfig of [undefined, {}, { retryCount: 0 }, { maxRetryDuration: '0s' }, { retryCount: 0, maxRetryDuration: '0.000000000s' }]) assertPausedScheduler({ ...scheduler, retryConfig }, profile)
  for (const retryConfig of [null, [], 0, { retryCount: null }, { retryCount: 1 }, { retryCount: -1 }, { retryCount: '0' }, { retryCount: false }, { maxRetryDuration: null }, { maxRetryDuration: 0 }, { maxRetryDuration: '1s' }, { maxRetryDuration: '0.000000001s' }, { maxRetryDuration: '0' }, { maxRetryDuration: '0.0000000000s' }]) assert.throws(() => assertPausedScheduler({ ...scheduler, retryConfig }, profile), /SCHEDULER_NOT_PAUSED/)
})
test('actual Scheduler timezone and target remain exact with omitted zero retry defaults', () => {
  const scheduler = { name: workerSchedulerName(), state: 'PAUSED', schedule: '*/5 * * * *', timeZone: 'Etc/UTC', attemptDeadline: '30s', httpTarget: { uri: profile.canonicalOrigin + profile.recoverPath, httpMethod: 'POST', body: 'e30=', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Google-Cloud-Scheduler' }, oidcToken: { serviceAccountEmail: profile.dispatchServiceAccount, audience: profile.canonicalOrigin } } }
  for (const timeZone of [undefined, null, 'UTC', 'Asia/Taipei']) assert.throws(() => assertPausedScheduler({ ...scheduler, timeZone }, profile), /SCHEDULER_NOT_PAUSED/)
  for (const changed of [{ state: 'ENABLED' }, { schedule: '* * * * *' }, { attemptDeadline: '31s' }, { httpTarget: { ...scheduler.httpTarget, uri: profile.canonicalOrigin + '/other' } }, { httpTarget: { ...scheduler.httpTarget, oidcToken: { ...scheduler.httpTarget.oidcToken, audience: 'https://other.invalid' } } }]) assert.throws(() => assertPausedScheduler({ ...scheduler, ...changed }, profile), /SCHEDULER_NOT_PAUSED/)
})

test('owner request propagates an abort deadline and refuses a late awaited response', async () => {
  let signal
  const transport = boundOpenSwxTransport({ request: async (_url, options) => { signal = options.signal; await new Promise(resolve => setTimeout(resolve, 30)); return {} } }, new Date(Date.now() + 10).toISOString())
  await assert.rejects(transport.request('https://run.googleapis.com/v2/' + workerJobName()), /DEADLINE/)
  assert.ok(signal instanceof AbortSignal)
  assert.throws(() => boundOpenSwxTransport({}, 'not-a-deadline'), /DEADLINE/)
})

test('provider GEN2 and omitted empty env normalize without changing policy or accepting other template drift', () => {
  const expected = workerTemplate(profile, image, null, 'selftest'), observed = structuredClone(expected)
  observed.template.executionEnvironment = 'EXECUTION_ENVIRONMENT_GEN2'; delete observed.template.containers[0].env
  const job = { name: workerJobName(), generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, template: observed }
  assertWorkerJob(job, expected)
  assert.deepEqual(normalizeWorkerTemplate(observed), expected)
  assert.equal(workerReceipt({ descriptor: workerDescriptor(), kind: 'paused-drained', actor: profile.normalActor, image, template: normalizeWorkerTemplate(observed), observedAt: new Date().toISOString() }).templateSha256, sha256(canonicalize(expected)))
  const literalPolicy = workerTemplatePolicy(profile, 'selftest'), policyHash = sha256(canonicalize(literalPolicy))
  assert.equal(policyHash, workerDescriptor().selftestTemplatePolicySha256)
  assert.throws(() => assertWorkerJob(job, observed))
  assert.notEqual(workerReceipt({ descriptor: workerDescriptor(), kind: 'paused-drained', actor: profile.normalActor, image, template: observed, observedAt: new Date().toISOString() }).templateSha256, sha256(canonicalize(expected)))
  assert.equal(sha256(canonicalize(workerTemplatePolicy(profile, 'selftest'))), policyHash)
  for (const mutate of [t => { t.template.executionEnvironment = null }, t => { t.template.executionEnvironment = 'OTHER' }, t => { t.template.containers[0].env = null }, t => { t.template.containers[0].extra = true }, t => { t.template.containers.push(structuredClone(t.template.containers[0])) }, t => { t.template.containers[0].command = ['other'] }, t => { t.template.containers[0].args = [] }, t => { t.template.containers[0].resources.limits.cpu = '2' }, t => { t.template.serviceAccount = 'other' }, t => { t.template.executionEnvironment = 'EXECUTION_ENVIRONMENT_GEN1' }, t => { t.template.containers[0].env = [{ name: 'unexpected', value: 'x' }] }, t => { t.template.containers[0].image = `${profile.artifactUri}@sha256:${'f'.repeat(64)}` }, t => { t.template.timeout = '600s' }, t => { t.template.vpcAccess = {} }]) { const template = structuredClone(observed); mutate(template); assert.throws(() => assertWorkerJob({ ...job, template }, expected)) }
})

test('fixed finite-worker normal omitted args means empty CMD; selftest arguments and literal policies remain strict', () => {
  const expected = workerTemplate(profile, image, 'projects/9536592944/secrets/aipdm-prod-openswx-reader-token/versions/7'), observed = structuredClone(expected)
  delete observed.template.containers[0].args; observed.template.executionEnvironment = 'EXECUTION_ENVIRONMENT_GEN2'
  const policyHash = sha256(canonicalize(workerTemplatePolicy(profile, 'normal'))), desiredHash = sha256(canonicalize(expected))
  const job = { name: workerJobName(), generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, template: observed }
  assertWorkerJob(job, expected); assert.deepEqual(normalizeWorkerTemplate(observed), expected)
  assert.equal(sha256(canonicalize(expected)), desiredHash); assert.equal(sha256(canonicalize(workerTemplatePolicy(profile, 'normal'))), policyHash)
  for (const args of [null, ['--isolation-self-test-only'], ['unexpected', 'order']]) { const template = structuredClone(observed); template.template.containers[0].args = args; assert.throws(() => assertWorkerJob({ ...job, template }, expected)) }
  const wrongImage = structuredClone(observed); wrongImage.template.containers[0].image = `${profile.artifactUri}@sha256:${'f'.repeat(64)}`; assert.throws(() => assertWorkerJob({ ...job, template: wrongImage }, expected))
  const wrongSecret = structuredClone(observed); wrongSecret.template.containers[0].env[1].valueSource.secretKeyRef.version = '8'; assert.throws(() => assertWorkerJob({ ...job, template: wrongSecret }, expected))
  const selftest = workerTemplate(profile, image, null, 'selftest'), omittedSelftest = structuredClone(selftest); delete omittedSelftest.template.containers[0].args; assert.throws(() => assertWorkerJob({ ...job, template: omittedSelftest }, selftest))
})

test('worker JSON write parses verified provider bytes and refuses mismatched digest or value before dependent effects', async () => {
  const h = recordedProvider(), value = { schemaVersion: 'fixture', facts: { status: 'known' } }
  const raw = await h.transport.putJson(ref('shape').uri, value)
  assert.equal(raw.value, undefined)
  assert.deepEqual((await writeWorkerJson(h.transport, ref('shape').uri, value)).value, value)
  for (const corrupt of [row => ({ ...row, ref: { ...row.ref, sha256: 'f'.repeat(64) } }), row => ({ ...row, value, bytes: Buffer.from('{"bad":true}'), ref: { ...row.ref, sha256: sha256(Buffer.from('{"bad":true}')) } })]) {
    await assert.rejects(writeWorkerJson({ putJson: async () => corrupt(raw) }, raw.ref.uri, value), /WRITE_READBACK_INVALID/)
  }
})

test('new finite request semantic join fails before run when expected source drifts during its verified write', async () => {
  const h = recordedProvider(), descriptor = workerDescriptor('full'), putJson = h.transport.putJson
  h.transport.putJson = async (uri, value) => {
    const row = await putJson(uri, value)
    if (value.schemaVersion === 'aipdm.openswx-finite-request.v1') descriptor.sourceRevision = 'f'.repeat(40)
    return row
  }
  await assert.rejects(runWorkerFinite({ transport: h.transport, descriptor, profile, template: h.template, receiptUri: ref('join-before-run').uri, actor: 'fixed-wif', deadlineAt: '2999-01-01T00:00:00Z' }), /REQUEST_JOIN_INVALID/)
  assert.equal(h.calls.filter(row => row.url.endsWith(':run')).length, 0)
  assert.ok(!h.objects.has(ref('join-before-run').uri))
})

test('legal Jobs.patch preserves fresh writable metadata and applied lost responses use one PATCH', async () => {
  for (const lost of [false, true]) {
    const h = recordedProvider(), changed = structuredClone(h.template)
    changed.template.containers[0].args = ['--isolation-self-test-only']
    Object.assign(h.job, { labels: { 'goog-terraform-provisioned': 'true' }, annotations: { own: 'retained' }, client: 'terraform', clientVersion: '7.39.0', launchStage: 'GA', binaryAuthorization: { useDefault: true }, uid: 'output-only', runExecutionToken: 'must-not-run' })
    const metadata = Object.fromEntries(['labels', 'annotations', 'client', 'clientVersion', 'launchStage', 'binaryAuthorization'].map(key => [key, structuredClone(h.job[key])]))
    const original = h.transport.request; let patches = 0
    h.transport.request = async (url, options = {}) => {
      if (options.method === 'PATCH') {
        patches++; assert.equal(url, `https://run.googleapis.com/v2/${workerJobName()}`)
        const body = JSON.parse(options.body)
        assert.deepEqual(body, { name: workerJobName(), etag: 'e1', ...metadata, template: changed })
        Object.assign(h.job, { ...body, etag: 'e2', generation: '2', observedGeneration: '2' })
        if (lost) throw Error('lost applied response')
        return {}
      }
      return original(url, options)
    }
    const result = await updateWorkerJob({ transport: h.transport, profile, template: changed, deadlineAt: '2999-01-01T00:00:00Z' })
    assert.equal(patches, 1); assert.deepEqual(result.template, changed)
    for (const key of Object.keys(metadata)) assert.deepEqual(result[key], metadata[key])
  }
})
test('settled Job metadata drift fails without a second PATCH', async () => {
  for (const key of ['labels', 'annotations', 'binaryAuthorization']) {
    const h = recordedProvider(), changed = structuredClone(h.template); changed.template.containers[0].args = ['--isolation-self-test-only']
    Object.assign(h.job, { labels: { own: 'retained' }, annotations: { own: 'retained' }, binaryAuthorization: { useDefault: true } })
    const original = h.transport.request; let patches = 0
    h.transport.request = async (url, options = {}) => {
      if (options.method === 'PATCH') { patches++; h.job.template = changed; h.job[key] = {}; return {} }
      return original(url, options)
    }
    await assert.rejects(updateWorkerJob({ transport: h.transport, profile, template: changed, deadlineAt: '2999-01-01T00:00:00Z' }), /METADATA_DRIFT/)
    assert.equal(patches, 1)
  }
})
