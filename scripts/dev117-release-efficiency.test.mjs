import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { fetchProviderBytes, fetchProviderRead } from './lib/dev012-read-retry.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { canonicalize, sha256 } from './lib/dev012-production-migration-runner.mjs'
import { buildPermissionStateOperation } from './lib/dev122-rd-permission-state-readback.mjs'
import { bindDiagnosticRef, readServiceDiagnostic, runMain as runProductionDiagnosticMain } from './dev117-production-diagnostics.mjs'
import { checkEnvironmentFingerprint, fullContinuousGroups, localCheckContext, runCheckpointedGroups } from './lib/production-slice-checkpoints.mjs'
import { createProductionSlicePlanFromGit } from './lib/production-slice-plan.mjs'
import { bindPermissionReadbackSources, executionMatches as permissionExecutionMatches, jobMatches as permissionJobMatches, sourceAuthority as assertPermissionReadbackSourceAuthority, submitPermissionReadbackOnce } from './dev122-rd-permission-state-readback.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const noWait = async () => {}
const networkError = () => Object.assign(new Error('network reset'), { code: 'ECONNRESET' })
const token = 'synthetic-test-token-not-a-credential'

test('shared provider GET retries transient failures, bounded to three attempts', async () => {
  for (const first of [networkError(), new Response('', { status: 503 }), new Response('', { status: 429, headers: { 'retry-after': '1' } })]) {
    let calls = 0
    const response = await fetchProviderRead('https://example.invalid/read', {}, { sleep: noWait, fetchImpl: async () => { if (++calls === 1) { if (first instanceof Error) throw first; return first } return new Response('{}') } })
    assert.equal(response.ok, true); assert.equal(calls, 2)
  }
  let calls = 0
  await assert.rejects(fetchProviderRead('https://example.invalid/read', {}, { sleep: noWait, fetchImpl: async () => { calls++; throw networkError() } }), /network reset/u)
  assert.equal(calls, 3)
})

test('auth, denial, conflict, unknown rate limit and caller cancellation never spin', async () => {
  for (const status of [401, 403, 404, 409, 412, 429]) {
    let calls = 0
    const result = await fetchProviderRead('https://example.invalid/read', {}, { sleep: noWait, fetchImpl: async () => { calls++; return new Response('', { status }) } })
    assert.equal(result.status, status); assert.equal(calls, 1)
  }
  let calls = 0
  await assert.rejects(fetchProviderRead('https://example.invalid/read', { signal: AbortSignal.abort() }, { fetchImpl: async () => { calls++ } }), /abort/iu)
  assert.equal(calls, 0)
  await assert.rejects(fetchProviderRead('https://example.invalid/write', { method: 'POST' }), /READ_ONLY_REQUIRED/u)
})

test('read deadline covers backoff; long Retry-After is not ignored', async () => {
  let calls = 0, clock = 0
  const result = await fetchProviderRead('https://example.invalid/read', {}, { now: () => clock, timeoutMs: 1000, sleep: async delay => { clock += delay }, fetchImpl: async () => { calls++; return new Response('', { status: 503 }) } })
  assert.equal(result.status, 503); assert.equal(calls, 2)
  calls = 0
  await fetchProviderRead('https://example.invalid/read', {}, { sleep: noWait, fetchImpl: async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '60' } }) } })
  assert.equal(calls, 1)
})

async function withControlledReadTimeouts(run) {
  const original = AbortSignal.timeout, rows = []
  AbortSignal.timeout = milliseconds => {
    const controller = new AbortController(); rows.push({ milliseconds, controller }); return controller.signal
  }
  try { return await run(rows) } finally { AbortSignal.timeout = original }
}

function partialBodyResponse(controller, counters, failure = 'timeout') {
  let reads = 0
  return { ok: true, status: 200, headers: new Headers(), body: { getReader: () => ({
    read: async () => {
      if (++reads === 1) return { done: false, value: Buffer.from('discard-partial-attempt') }
      if (failure === 'network') throw Object.assign(new TypeError('stream disconnected'), { cause: { code: 'UND_ERR_SOCKET' } })
      queueMicrotask(() => controller.abort(new DOMException('media attempt timed out', 'TimeoutError')))
      return new Promise(() => {})
    },
    cancel: async () => { counters.cancels++ },
    releaseLock: () => { counters.releases++ },
  }) } }
}

test('complete-body provider GET discards a timed-out partial stream and retries one fresh sealed read', async () => {
  await withControlledReadTimeouts(async signals => {
    const complete = Buffer.from('complete sealed provider object'), counters = { calls: 0, cancels: 0, releases: 0 }
    const result = await fetchProviderBytes('https://example.invalid/media', {}, {
      sleep: noWait, timeoutMs: 120_000, attemptTimeoutMs: 60_000, maxBytes: 1024,
      fetchImpl: async () => ++counters.calls === 1 ? partialBodyResponse(signals[0].controller, counters) : new Response(complete),
    })
    assert.equal(result.bytes.equals(complete), true)
    assert.deepEqual(counters, { calls: 2, cancels: 1, releases: 1 })
    assert.deepEqual(signals.map(row => row.milliseconds), [60_000, 60_000])
  })
})

test('complete-body provider GET bounds repeated partial timeouts and never retries caller cancellation', async () => {
  await withControlledReadTimeouts(async signals => {
    const counters = { calls: 0, cancels: 0, releases: 0 }
    await assert.rejects(fetchProviderBytes('https://example.invalid/media', {}, {
      sleep: noWait, timeoutMs: 120_000, attemptTimeoutMs: 60_000, maxBytes: 1024,
      fetchImpl: async () => partialBodyResponse(signals[counters.calls++].controller, counters),
    }), { name: 'TimeoutError' })
    assert.deepEqual(counters, { calls: 2, cancels: 2, releases: 2 })
  })
  const controller = new AbortController(), counters = { calls: 0, cancels: 0, releases: 0 }
  await assert.rejects(fetchProviderBytes('https://example.invalid/media', { signal: controller.signal }, {
    sleep: noWait, maxBytes: 1024,
    fetchImpl: async () => { counters.calls++; controller.abort(); return partialBodyResponse(new AbortController(), counters) },
  }), /abort/iu)
  assert.equal(counters.calls, 1)
})

test('owner shared entry retries GET but never repeats POST/PATCH/DELETE or upload', async () => {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    let calls = 0
    const transport = createOwnerTransport({ token, sleep: noWait, fetchImpl: async () => { calls++; return new Response('{}', { status: calls === 1 ? 503 : 200 }) } })
    if (method === 'GET') await transport.request('https://example.invalid/provider', { method })
    else await assert.rejects(transport.request('https://example.invalid/provider', { method }), /OUTCOME_UNKNOWN/u)
    assert.equal(calls, method === 'GET' ? 2 : 1)
  }
  let writes = 0
  const transport = createOwnerTransport({ token, sleep: noWait, fetchImpl: async () => { writes++; throw networkError() } })
  await assert.rejects(transport.putJson('gs://test-bucket/receipts/test.json', {}, { bucket: 'test-bucket', prefix: 'receipts' }), /OUTCOME_UNKNOWN/u)
  assert.equal(writes, 1)
})

test('RD submission resumes hours later with original receipt and zero duplicate Job submission', async () => {
  let stored, writes = 0, submissions = 0
  const transport = {
    async readBytes() { if (!stored) throw Object.assign(new Error('MISSING'), { code: 'MISSING' }); return { bytes: Buffer.from(canonicalize(stored)) } },
    async putJson(uri, value) { writes++; stored = structuredClone(value) },
    async request(url, options) { assert.equal(options.method, 'POST'); submissions++; throw Object.assign(new Error('lost response'), { code: 'OUTCOME_UNKNOWN' }) },
  }
  const submission = { operationId: 'TEST-RESUME', args: ['bound-args'], sourceRevision: 'a'.repeat(40), observedAt: '2026-10-18T00:00:00.000Z' }
  const input = { transport, submissionRef: 'gs://jenfu-platform-prod-aipdm-release/receipts/test.json', submission, job: { etag: 'test-etag' } }
  assert.equal((await submitPermissionReadbackOnce(input)).resumed, false)
  const original = canonicalize(stored)
  assert.equal((await submitPermissionReadbackOnce({ ...input, submission: { ...submission, observedAt: '2026-10-18T03:00:00.000Z' } })).resumed, true)
  assert.equal(canonicalize(stored), original)
  assert.equal(writes, 1); assert.equal(submissions, 1)
  await assert.rejects(submitPermissionReadbackOnce({ ...input, submission: { ...submission, sourceRevision: 'b'.repeat(40) } }), /SUBMISSION_INVALID/u)
  stored.receiptSha256 = '0'.repeat(64)
  await assert.rejects(submitPermissionReadbackOnce(input), /SUBMISSION_INVALID/u)
  assert.equal(submissions, 1)
})

function diagnosticFixture({ workflowSourceRevision = 'a'.repeat(40), operationSourceRevision = 'a'.repeat(40), operationAncestor = true } = {}) {
  const operation = { schemaVersion: 'aipdm.production-diagnostic-operation.v1', kind: 'service-state', operationId: 'TEST-SERVICE-STATE', sourceRevision: operationSourceRevision }
  const bytes = Buffer.from(canonicalize(operation))
  const binding = bindDiagnosticRef(`gs://jenfu-platform-prod-aipdm-release/source/production-diagnostics/service.json#sha256=${sha256(bytes)}`)
  const service = 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
  const calls = [], reports = []
  const transport = {
    async readBytes() { return { bytes } },
    async request(url, options) { calls.push({ url, options }); return { name: service, generation: '5', latestReadyRevision: `${service}/revisions/ai-pdm-prod-001`, latestCreatedRevision: `${service}/revisions/ai-pdm-prod-001`, trafficStatuses: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'ai-pdm-prod-001', percent: 100 }], template: { env: { SECRET: 'must-not-leak' } } } },
    async putJson(uri, value, options) { reports.push({ uri, value, options }) },
  }
  const environment = {
    GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'jedchang0308-jenfu/AI-PDM', GITHUB_SHA: workflowSourceRevision,
    GITHUB_WORKFLOW_SHA: workflowSourceRevision,
    GITHUB_WORKFLOW_REF: 'jedchang0308-jenfu/AI-PDM/.github/workflows/read-ai-pdm-rd-permission-state-production.yml@refs/heads/main',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  }
  const sourceAuthorityOptions = { gitRunner: args => args[0] === 'rev-parse' ? workflowSourceRevision : '', workflowAncestorRunner: () => true,
    operationAncestorRunner: (ancestor, descendant) => operationAncestor && ancestor === operationSourceRevision && descendant === workflowSourceRevision }
  return { binding, workflowSourceRevision, environment, sourceAuthorityOptions, transport, calls, reports }
}

test('stable diagnostic entry performs one fixed service GET and immutable sanitized evidence only', async () => {
  const input = diagnosticFixture()
  const result = await readServiceDiagnostic(input)
  assert.equal(result.status, 'READBACK_COMPLETE'); assert.equal(result.releaseAuthority, false)
  assert.equal(input.calls.length, 1); assert.equal(input.calls[0].options.method, 'GET')
  assert.match(input.calls[0].url, /\/services\/ai-pdm-prod$/u)
  assert.equal(input.reports[0].options.ifGenerationMatch, '0')
  assert.equal(input.reports[0].value.service.traffic[0].revision, 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod/revisions/ai-pdm-prod-001')
  assert.doesNotMatch(JSON.stringify(input.reports), /must-not-leak|SECRET|template/u)
})

test('service diagnostic reuses an immutable admitted ancestor operation under the exact current protected workflow', async () => {
  const input = diagnosticFixture({ workflowSourceRevision: 'b'.repeat(40), operationSourceRevision: 'a'.repeat(40) })
  const environment = { ...input.environment, OPERATION_REF: `${input.binding.operation_uri}#sha256=${input.binding.operation_sha256}` }
  const result = await runProductionDiagnosticMain({ argv: ['--service-state'], environment, transport: input.transport,
    sourceAuthorityOptions: input.sourceAuthorityOptions })
  assert.equal(result.status, 'READBACK_COMPLETE')
  assert.equal(result.sourceRevision, 'b'.repeat(40))
  assert.equal(result.operationSourceRevision, 'a'.repeat(40))
  assert.equal(input.reports[0].value.sourceRevision, 'b'.repeat(40))
  assert.equal(input.reports[0].value.operationSourceRevision, 'a'.repeat(40))
  assert.equal(input.calls.length, 1)
  assert.equal(input.reports.length, 1)
})

test('service diagnostic rejects a divergent or unknown operation source before provider service reads', async () => {
  const input = diagnosticFixture({ workflowSourceRevision: 'b'.repeat(40), operationSourceRevision: 'a'.repeat(40), operationAncestor: false })
  await assert.rejects(readServiceDiagnostic(input), /PRODUCTION_DIAGNOSTIC_SOURCE_AUTHORITY_MISMATCH/u)
  assert.equal(input.calls.length, 0); assert.equal(input.reports.length, 0)
})

test('permission diagnostic separates current reviewed workflow source from installed runner ancestor', () => {
  const workflowSource = 'b'.repeat(40)
  const installedSource = 'a'.repeat(40)
  const environment = {
    GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'jedchang0308-jenfu/AI-PDM', GITHUB_SHA: workflowSource,
    GITHUB_WORKFLOW_SHA: workflowSource,
    GITHUB_WORKFLOW_REF: 'jedchang0308-jenfu/AI-PDM/.github/workflows/read-ai-pdm-rd-permission-state-production.yml@refs/heads/main',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  }
  const gitRunner = args => args[0] === 'rev-parse' ? workflowSource : ''
  const input = { gitRunner, workflowAncestorRunner: () => true, operationAncestorRunner: (ancestor, descendant) => ancestor === installedSource && descendant === workflowSource }
  assert.deepEqual(assertPermissionReadbackSourceAuthority(environment, workflowSource, installedSource, input), { workflowSourceRevision: workflowSource, operationSourceRevision: installedSource })
  assert.throws(() => assertPermissionReadbackSourceAuthority(environment, 'd'.repeat(40), installedSource, input), /RD_PERMISSION_STATE_SOURCE_AUTHORITY_MISMATCH/u)
  assert.throws(() => assertPermissionReadbackSourceAuthority(environment, workflowSource, 'c'.repeat(40), input), /RD_PERMISSION_STATE_SOURCE_AUTHORITY_MISMATCH/u)
  const built = buildPermissionStateOperation({ operationId: 'DEV122-RD-SOURCE-WIRE-TEST', sourceRevision: installedSource,
    migrationRunnerDigest: `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:${'e'.repeat(64)}`,
    actor: { principalIdSha256: '1'.repeat(64), employeeIdSha256: '2'.repeat(64), identityIssuer: 'https://securetoken.google.com/jenfu-platform-prod', identitySubjectSha256: '3'.repeat(64) } })
  assert.deepEqual(bindPermissionReadbackSources({ environment, workflowSourceRevision: workflowSource, operation: built.value,
    operationBytes: built.bytes, operationSha256: built.sha256 }, input), { workflowSourceRevision: workflowSource, operationSourceRevision: installedSource })
})

test('permission diagnostic binds the provider Job and execution to the installed runner source', () => {
  const sourceRevision = 'a'.repeat(40)
  const image = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:${'b'.repeat(64)}`
  const operation = { sourceRevision, migrationRunnerDigest: image }
  const container = { name: 'migration', image, env: [{ name: 'PDM_SOURCE_REVISION', value: sourceRevision }] }
  const job = { name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner', etag: 'etag', template: { taskCount: 1, parallelism: 1, template: { serviceAccount: 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com', maxRetries: 0, timeout: '1800s', containers: [container] } } }
  const args = ['--permission-operation-ref', 'bound']
  const execution = { name: `${job.name}/executions/exact`, taskCount: 1, parallelism: 1, template: { serviceAccount: job.template.template.serviceAccount, containers: [{ ...container, args, env: [...container.env, { name: 'PGOPTIONS', value: '-c default_transaction_read_only=on' }] }] } }
  assert.equal(permissionJobMatches(job, operation), true)
  assert.equal(permissionExecutionMatches(execution, args, operation), true)
  job.template.template.containers[0].env[0].value = 'c'.repeat(40)
  execution.template.containers[0].env[0].value = 'c'.repeat(40)
  assert.equal(permissionJobMatches(job, operation), false)
  assert.equal(permissionExecutionMatches(execution, args, operation), false)
})

test('diagnostic refuses arbitrary targets, namespace, source and content hash before provider service reads', async () => {
  for (const ref of ['https://example.invalid', 'gs://other/source/production-diagnostics/x.json', `gs://jenfu-platform-prod-aipdm-release/source/production-diagnostics/../bad.json#sha256=${'a'.repeat(64)}`]) assert.throws(() => bindDiagnosticRef(ref), /REF_INVALID/u)
  for (const change of ['source', 'hash', 'kind', 'target']) {
    const input = diagnosticFixture()
    if (change === 'source') input.sourceAuthorityOptions.operationAncestorRunner = () => false
    if (change === 'hash') input.binding.operation_sha256 = '0'.repeat(64)
    if (change === 'kind') input.binding.kind = 'arbitrary-command'
    if (change === 'target') {
      const original = await input.transport.readBytes()
      const bytes = Buffer.from(canonicalize({ ...JSON.parse(original.bytes), target: 'sibling-service' }))
      input.transport.readBytes = async () => ({ bytes })
      input.binding.operation_sha256 = sha256(bytes)
    }
    await assert.rejects(readServiceDiagnostic(input))
    assert.equal(input.calls.length, 0); assert.equal(input.reports.length, 0)
  }
})

test('stable diagnostic binder rejects the retired OpenSWX recovery namespace', () => {
  assert.throws(() => bindDiagnosticRef(`gs://jenfu-platform-prod-aipdm-release/source/openswx-dispatch-recovery/recovery.json#sha256=${'a'.repeat(64)}`),
    /DIAGNOSTIC_REF_INVALID/u)
})

test('stable diagnostic binder routes the fixed preview and OpenSWX runtime namespace', () => {
  const binding = bindDiagnosticRef(`gs://jenfu-platform-prod-aipdm-release/source/preview-openswx-runtime-readback/state.json#sha256=${'b'.repeat(64)}`)
  assert.deepEqual(binding, { operation_uri: 'gs://jenfu-platform-prod-aipdm-release/source/preview-openswx-runtime-readback/state.json', operation_sha256: 'b'.repeat(64), kind: 'preview-openswx-runtime-state' })
})

test('stable workflow keeps readonly diagnostics approval-free and contains no retired recovery job', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/read-ai-pdm-rd-permission-state-production.yml'), 'utf8')
  assert.match(workflow, /WIF_PROVIDER: projects\/9536592944\/locations\/global\/workloadIdentityPools\/jenfu-prod-release\/providers\/aipdm-github/u)
  assert.doesNotMatch(workflow, /vars\.AIPDM_PROD_WIF_PROVIDER/u)
  assert.match(workflow, /id: verifier_auth\s+if: steps.bind.outputs.kind == 'service-state'/u)
  assert.match(workflow, /id: deployer_auth\s+if: steps.bind.outputs.kind == 'rd-permission-state' \|\| steps.bind.outputs.kind == 'preview-openswx-runtime-state'/u)
  assert.match(workflow, /service_account: aipdm-prod-verifier@/u)
  assert.match(workflow, /dev122-rd-permission-state-readback.mjs --stage readback/u)
  assert.match(workflow, /dev117-production-diagnostics.mjs --service-state/u)
  assert.match(workflow, /dev122-preview-openswx-runtime-readback.mjs --stage readback/u)
  assert.doesNotMatch(workflow, /dev122-openswx-dispatch-recovery|\n  recovery:/iu)
  assert.equal((workflow.match(/environment: production/gu) ?? []).length, 0)
  assert.match(workflow, /permissions: \{ contents: read, checks: read, id-token: write \}/u)
  assert.match(workflow, /Verify exact merged source and required CI results/u)
})

function checkpointFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aipdm-efficiency-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  let clock = 1000
  return { directory, now: () => ++clock, context: () => ({ revision: 'same-source', environmentSha256: 'same-environment' }) }
}

test('tool tracing changes do not invalidate identical checks; execution inputs still do', () => {
  const first = { CODEX_TOOL_CALL_ID: 'first-invocation', PDM_DATA_DIR: 'isolated-one', LOCALAPPDATA: 'environment-one' }
  const key = checkEnvironmentFingerprint(first)
  assert.equal(checkEnvironmentFingerprint({ ...first, CODEX_TOOL_CALL_ID: 'resumed-invocation' }), key)
  assert.notEqual(checkEnvironmentFingerprint({ ...first, PDM_DATA_DIR: 'isolated-two' }), key)
  assert.notEqual(checkEnvironmentFingerprint({ ...first, LOCALAPPDATA: 'environment-two' }), key)
})

test('interrupted groups persist first failure and resume only unfinished checks', t => {
  const fixture = checkpointFixture(t)
  const groups = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
  const first = runCheckpointedGroups({ ...fixture, groups, execute: group => ({ status: group.name === 'B' ? 'FAIL' : 'PASS' }) })
  assert.deepEqual(first.map(row => row.status), ['PASS', 'FAIL'])
  const failureBytes = fs.readFileSync(first[1].evidence, 'utf8')
  const called = []
  const second = runCheckpointedGroups({ ...fixture, groups, execute: group => { called.push(group.name); return { status: 'PASS' } } })
  assert.deepEqual(second.map(row => row.status), ['REUSED', 'PASS', 'PASS'])
  assert.deepEqual(called, ['B', 'C'])
  assert.equal(fs.readFileSync(first[1].evidence, 'utf8'), failureBytes)
})

test('changed context, dirty tree, forced fresh, expiry and corruption invalidate local reuse', t => {
  for (const variant of ['context', 'dirty', 'fresh', 'expired', 'corrupt']) {
    const fixture = checkpointFixture(t), groups = [{ name: variant }]
    const first = runCheckpointedGroups({ ...fixture, groups, execute: () => ({ status: 'PASS' }) })
    const options = { ...fixture, groups, execute: () => ({ status: 'PASS' }) }
    if (variant === 'context') options.context = () => ({ revision: 'new-source' })
    if (variant === 'dirty') options.context = () => null
    if (variant === 'fresh') options.reuse = false
    if (variant === 'expired') options.now = () => 1000 + 25 * 60 * 60 * 1000
    if (variant === 'corrupt') fs.writeFileSync(first[0].evidence, '{}')
    assert.equal(runCheckpointedGroups(options)[0].status, 'PASS', variant)
  }
  assert.equal(localCheckContext(root, { CI: 'true' }), null)
  assert.equal(localCheckContext(root, { GITHUB_ACTIONS: 'true' }), null)
})

test('a later failed check prevents fallback to an older PASS', t => {
  for (const sameTimestamp of [false, true]) {
    const fixture = checkpointFixture(t), groups = [{ name: 'A' }]
    if (sameTimestamp) fixture.now = () => 1000
    runCheckpointedGroups({ ...fixture, groups, execute: () => ({ status: 'PASS' }) })
    runCheckpointedGroups({ ...fixture, groups, reuse: false, execute: () => ({ status: 'FAIL' }) })
    assert.equal(runCheckpointedGroups({ ...fixture, groups, execute: () => ({ status: 'PASS' }) })[0].status, 'PASS')
  }
})

test('full gate expands every existing test without npm shell injection or omission', () => {
  const script = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts['test:dev-117:continuous']
  assert.ok(script.startsWith('node scripts/dev117-test-environment.mjs && node --test '))
  const manifest = script.split(' && ')[1].slice('node --test '.length).split(' ')
  assert.deepEqual(fullContinuousGroups(script).flatMap(group => group.tests), manifest)
  assert.throws(() => fullContinuousGroups('node --test scripts/x.test.mjs; echo unsafe'), /COMMAND_INVALID/u)
  assert.throws(() => fullContinuousGroups('node scripts/dev117-test-environment.mjs || node --test scripts/x.test.mjs'), /COMMAND_INVALID/u)
  assert.throws(() => fullContinuousGroups(script + ' && echo unsafe'), /COMMAND_INVALID/u)
})

test('deleted/renamed release inputs retain their classified release-control gate', t => {
  const { directory } = checkpointFixture(t)
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true })
  git('init', '--quiet')
  fs.mkdirSync(path.join(directory, 'scripts'))
  fs.writeFileSync(path.join(directory, 'scripts/dev012-example.mjs'), 'original\n')
  fs.writeFileSync(path.join(directory, 'README.md'), 'docs\n')
  git('add', '.')
  git('-c', 'user.name=Local Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture')
  const base = git('rev-parse', 'HEAD').trim()
  fs.renameSync(path.join(directory, 'scripts/dev012-example.mjs'), path.join(directory, 'example.md'))
  const previousHead = process.env.PDM_SLICE_HEAD_SHA
  let plan
  try {
    // This fixture intentionally exercises the working-tree rename path. A
    // provider CI head ref belongs to the real checkout and must not leak into
    // the disposable fixture repository.
    delete process.env.PDM_SLICE_HEAD_SHA
    plan = createProductionSlicePlanFromGit({ root: directory, base })
  } finally {
    if (previousHead === undefined) delete process.env.PDM_SLICE_HEAD_SHA
    else process.env.PDM_SLICE_HEAD_SHA = previousHead
  }
  assert.equal(plan.classification, 'AFFECTED_SLICES')
  assert.equal(plan.gates.releaseCore, true)
  assert.equal(plan.gates.application, false)
  assert.ok(plan.files.includes('scripts/dev012-example.mjs'))
})
