import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertRuntimeConfig, buildRuntimeConfig, canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { assertOpenSwxWorkerProfile, assertOpenSwxWorkerRef, assertWorkerDescriptor, assertWorkerJob, normalizeWorkerTemplate, workerReceipt, assertWorkerRuntimeJoin, assertPausedScheduler, canonicalWorkerExecution, workerJobName, workerSchedulerName, workerTemplate, workerTemplatePolicy, runWorkerFinite, updateWorkerJob, boundOpenSwxTransport } from './lib/dev122-openswx-owner-release.mjs'

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
    putJson: async (uri, value) => { const bytes = Buffer.from(canonicalize(value)); const row = { value, bytes, ref: { uri, sha256: sha256(bytes) }, metadata: { generation: '1' } }; if (objects.has(uri)) assert.deepEqual(objects.get(uri).value, value); objects.set(uri, row); return row },
    readBytes: async uri => { if (!objects.has(uri)) throw Object.assign(Error('MISSING'), { code: 'MISSING' }); return objects.get(uri) },
    request: async (url, options = {}) => { calls.push({ url, options });
      if (url.endsWith(':run')) { posted = true; throw Object.assign(Error('lost response'), { code: 'OUTCOME_UNKNOWN' }) }
      if (url.includes('/executions?')) return { executions: posted ? (ambiguous ? [execution, { ...execution, name: executionName + '-other' }] : [execution]) : [] }
      if (url.includes('/executions/')) return execution
      return job
    } }
  return { transport, template, objects, calls, job, executionName }
}
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
