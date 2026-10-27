import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { createWifAppliedContinuationRefreshTransport } from './dev122-applied-continuation-capsule-refresh.mjs'
import { canonicalize, createOwnerTransport, sha256, stageReceipt } from './lib/dev012-owner-release-runtime.mjs'

import {
  APPLIED_CONTINUATION_REFRESH_TRANSPORT_ROUTES,
  assertAppliedContinuationRefreshEnvironment,
  bindAppliedContinuationTemplateRef,
  createAppliedContinuationRefreshTransport,
  refreshAppliedContinuationCapsule,
} from './lib/dev122-applied-continuation-capsule-refresh.mjs'

const OLD = 'a'.repeat(40)
const CURRENT = 'b'.repeat(40)
const HASH = 'c'.repeat(64)
const BUCKET = 'jenfu-platform-prod-aipdm-release'
const templateRef = { uri: `gs://${BUCKET}/receipts/releases/DEV122-RD-FULL35-C110/release-intent.json`, sha256: HASH }
const ref = name => ({ uri: `gs://${BUCKET}/receipts/releases/DEV122-RD-FULL35-C110/${name}.json`, sha256: HASH })
const profile = { schemas: { releaseIntent: 'jenfu.dev117.ai-pdm-release-intent.v2' }, artifact: { releaseBucket: BUCKET } }
const workflow = fs.readFileSync(new URL('../.github/workflows/deploy-ai-pdm-principal-migrations-production.yml', import.meta.url), 'utf8')
const environment = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'jedchang0308-jenfu/AI-PDM',
  GITHUB_WORKFLOW_REF: 'jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/main',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_SHA: CURRENT,
  GITHUB_RUN_ID: '123456',
  GITHUB_RUN_ATTEMPT: '2',
  PDM_APPLIED_MIGRATION_CONTINUATION_RELEASE: 'true',
}

function appliedTemplate(overrides = {}) {
  return {
    schemaVersion: profile.schemas.releaseIntent,
    releaseId: 'DEV122-RD-FULL35-C110',
    sourceRevision: OLD,
    deadlineAt: '2026-10-22T00:00:00.000Z',
    runtimeConfigRef: ref('runtime-config'),
    foundationReceiptRef: ref('foundation'),
    infraReceiptRef: ref('infra'),
    baselineIntentRef: ref('baseline'),
    postAbortLedgerReadbackRef: ref('ledger'),
    principalOnlyFenceRef: ref('fence'),
    principalOnlyRecovery: { revision: 'ai-pdm-prod-recovery', serviceUid: 'service-uid', imageDigest: `image@sha256:${HASH}`, receiptRef: ref('recovery') },
    appliedMigrationContinuation: { schemaVersion: 'aipdm.applied-migration-continuation.v1', sourceRevision: OLD, prepareRef: ref('prepare'), migrateRef: ref('migrate'), ledgerReadbackResultRef: ref('ledger-result') },
    ...overrides,
  }
}

function fixture(template = appliedTemplate(), capsuleRef = templateRef, stageHook = null) {
  const runtimeConfig = { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '7' } }
  if (template.openswxWorkerRef) runtimeConfig.openswxWorker = {
    descriptorRef: template.openswxWorkerRef, purpose: 'full', sourceRevision: OLD, workerProfileSha256: HASH,
  }
  if (template.openswxWorkerRef) runtimeConfig.plainEnvironment.PDM_OPENSWX_DISPATCH_ENABLED = '1'
  if (template.openswxWorkerRef) runtimeConfig.secretVersions.PDM_WORKLOAD_AUTH_CREDENTIALS = '9'
  const runtime = { runtimeConfig }
  const reads = []
  const transport = {
    async readBytes() { throw Object.assign(new Error('MISSING'), { code: 'MISSING' }) },
    async readJson(actual) {
      reads.push(actual)
      if (actual.uri === capsuleRef.uri) return { ref: capsuleRef, value: template }
      if (actual.uri === template.runtimeConfigRef?.uri) return { ref: template.runtimeConfigRef, value: runtime }
      throw new Error(`unexpected read ${actual.uri}`)
    },
  }
  const stages = []
  const stageResult = {
    'source-freeze': { ref: ref('new-source-lock') },
    'runtime-config': { ref: ref('new-runtime') },
    'infra-reuse': { ref: ref('new-infra') },
    'routine-authority': { refs: { authorizationPolicyRef: ref('new-authorization'), readinessReceiptRef: ref('new-readiness') }, previousRevision: 'ai-pdm-prod-old', baselineIntentRef: ref('current-control-baseline') },
    'release-intent': { ref: { uri: `gs://${BUCKET}/receipts/releases/DEV122-RD-WIF-123456-2/release-intent.json`, sha256: HASH } },
  }
  const producePrerequisite = async value => {
    await stageHook?.(value)
    stages.push({ stage: value.stage, releaseId: value.releaseId, input: structuredClone(value.input) })
    return stageResult[value.stage]
  }
  const readSource = () => Buffer.from('unused')
  readSource.isAncestor = (ancestor, descendant) => ancestor === OLD && descendant === CURRENT
  return { transport, reads, stages, producePrerequisite, readSource }
}

test('template ref and workflow identity are exact and traversal-safe', () => {
  assert.deepEqual(bindAppliedContinuationTemplateRef(`${templateRef.uri}#sha256=${HASH}`), templateRef)
  assert.equal(assertAppliedContinuationRefreshEnvironment(environment, CURRENT), 'DEV122-RD-WIF-123456-2')
  for (const value of [
    `gs://${BUCKET}/receipts/../secret.json#sha256=${HASH}`,
    `gs://${BUCKET}/receipts//secret.json#sha256=${HASH}`,
    `${templateRef.uri}#sha256=latest`,
  ]) assert.throws(() => bindAppliedContinuationTemplateRef(value), /APPLIED_CONTINUATION_TEMPLATE_REF_INVALID/u)
  assert.throws(() => assertAppliedContinuationRefreshEnvironment({ ...environment, GITHUB_REF: 'refs/heads/feature' }, CURRENT), /APPLIED_CONTINUATION_REFRESH_WORKFLOW_REQUIRED/u)
  assert.match(workflow, /permissions: \{ actions: read, contents: read, pull-requests: read, checks: read, id-token: write \}/u)
  assert.match(workflow, /- id: capsule[\s\S]*?env:\s+GITHUB_TOKEN: "\$\{\{ github\.token \}\}"\s+GOOGLE_OAUTH_ACCESS_TOKEN:/u)
})

test('WIF transport routes its complete contract through one role map', async () => {
  const calls = []
  const role = name => new Proxy({}, { get: (_target, method) => (...args) => { calls.push([name, method, args]); return `${name}:${String(method)}` } })
  const transport = createAppliedContinuationRefreshTransport({ verifier: role('verifier'), builder: role('builder') })
  assert.deepEqual(Object.keys(transport), Object.keys(APPLIED_CONTINUATION_REFRESH_TRANSPORT_ROUTES))
  for (const [method, expectedRole] of Object.entries(APPLIED_CONTINUATION_REFRESH_TRANSPORT_ROUTES)) {
    const input = method === 'request'
      ? 'https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds?filter=tags%3Ddev122-rd-full35-c110&pageSize=2'
      : 'production-shaped-input'
    assert.equal(transport[method](input), `${expectedRole}:${method}`)
  }
  assert.deepEqual(calls.map(([roleName, method]) => [roleName, method]), Object.entries(APPLIED_CONTINUATION_REFRESH_TRANSPORT_ROUTES).map(([method, roleName]) => [roleName, method]))
  assert.throws(() => createAppliedContinuationRefreshTransport({ verifier: {}, builder: role('builder') }), /APPLIED_CONTINUATION_REFRESH_TRANSPORT_INVALID/u)
})

test('WIF assembly reuses the verifier-primary provider routing contract without a redundant deployer transport', () => {
  const created = []
  const createTransport = options => {
    const role = created.length === 0 ? 'verifier' : 'builder'
    created.push({ role, options })
    return new Proxy({}, { get: (_target, method) => (...args) => ({ role, method, args }) })
  }
  const transport = createWifAppliedContinuationRefreshTransport({
    verifierToken: 'verifier-token',
    builderToken: 'builder-token',
    deployerToken: 'deployer-token',
    githubToken: 'github-token-00000000000000',
    createTransport,
  })

  assert.deepEqual(created, [
    { role: 'verifier', options: { token: 'verifier-token', githubToken: 'github-token-00000000000000', builderReadbackToken: 'builder-token', migrationExecutionReadbackToken: 'deployer-token' } },
    { role: 'builder', options: { token: 'builder-token', builderReadbackToken: null } },
  ])
  assert.equal(transport.readOwnerSourceProof('proof').role, 'verifier')
  assert.equal(transport.readOwnerRun('run').role, 'verifier')
  assert.equal(transport.entrypointSnapshot('service').role, 'verifier')
  assert.equal(transport.putJson('receipt').role, 'builder')
  assert.equal(transport.request('https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds?filter=tags%3Ddev122-rd-full35-c110&pageSize=2').role, 'verifier')
})

test('production-shaped refresh reads use verifier and exact migration identities without a Google bearer on GitHub', async () => {
  const verifierToken = 'verifier-token-000000000000'
  const builderToken = 'builder-token-0000000000000'
  const deployerToken = 'deployer-token-000000000000'
  const githubToken = 'github-token-00000000000000'
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, authorization: options.headers?.authorization ?? null })
    if (url.startsWith('https://api.github.com/')) {
      return new Response(JSON.stringify({ id: 39723589561, status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', head_sha: OLD,
        created_at: '2026-10-22T00:00:00.000Z', updated_at: '2026-10-22T00:01:00.000Z' }), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  }
  const createTransport = options => createOwnerTransport({ ...options, fetchImpl, sleep: async () => {} })
  const transport = createWifAppliedContinuationRefreshTransport({ verifierToken, builderToken, deployerToken, githubToken, createTransport })
  const buildList = 'https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds?filter=tags%3Ddev122-rd-full35-c110&pageSize=2'
  const migrationJob = 'https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner'
  const migrationList = `${migrationJob}/executions?pageSize=100`
  const migrationExecution = `${migrationJob}/executions/ai-pdm-prod-migration-runner-c110`
  await transport.request(buildList)
  await transport.request(migrationJob)
  await transport.request(migrationList)
  await transport.request(migrationExecution)
  await transport.readOwnerRun({ application: { repository: 'jedchang0308-jenfu/AI-PDM' } }, 'https://api.github.com/repos/jedchang0308-jenfu/AI-PDM/actions/runs/39723589561')
  assert.deepEqual(calls.map(({ url, authorization }) => [url, authorization]), [
    [buildList, `Bearer ${verifierToken}`],
    [migrationJob, `Bearer ${deployerToken}`],
    [migrationList, `Bearer ${deployerToken}`],
    [migrationExecution, `Bearer ${deployerToken}`],
    ['https://api.github.com/repos/jedchang0308-jenfu/AI-PDM/actions/runs/39723589561', `Bearer ${githubToken}`],
  ])
})

test('expired applied continuation refreshes without a retired worker binding', async () => {
  const f = fixture()
  const now = new Date('2026-10-22T02:00:00.000Z')
  const result = await refreshAppliedContinuationCapsule({
    templateRef, profile, root: 'C:/fixture', transport: f.transport, environment,
    validateIntent: value => value,
    gitReader: () => ({ sourceRevision: CURRENT }),
    readSource: f.readSource,
    createSourceIdentity: async () => Buffer.from('source'),
    buildMigrationBundle: async () => ({ bundle: { manifestSha256: HASH } }),
    producePrerequisite: f.producePrerequisite,
    now: () => now,
  })
  assert.equal(result.refreshed, true)
  assert.equal(result.sourceRevision, CURRENT)
  assert.equal(result.releaseId, 'DEV122-RD-WIF-123456-2')
  assert.equal(result.releaseDeadlineAt, '2026-10-22T04:00:00.000Z')
  assert.deepEqual(f.stages.map(row => row.stage), ['source-freeze', 'runtime-config', 'infra-reuse', 'routine-authority', 'release-intent'])
  assert.deepEqual(f.stages[4].input.appliedMigrationContinuation, appliedTemplate().appliedMigrationContinuation)
  assert.deepEqual(f.stages[4].input.baselineIntentRef, ref('current-control-baseline'))
  assert.equal(f.stages.some(row => /worker|build/u.test(row.stage)), false)
  assert.equal(f.reads.some(row => row.uri?.includes('/openswx-worker/')), false)
  assert.equal(Object.hasOwn(result, 'retainedWorkerDescriptorRef'), false)
})

test('legacy template worker fields are scrubbed instead of becoming a current gate', async () => {
  const template = appliedTemplate({ openswxWorkerRef: { uri: `gs://${BUCKET}/receipts/dev-122/openswx-worker/c110-descriptor.json`, sha256: HASH } })
  const f = fixture(template)
  const result = await refreshAppliedContinuationCapsule({
    templateRef, profile, root: 'C:/fixture', transport: f.transport, environment,
    validateIntent: value => value, gitReader: () => ({ sourceRevision: CURRENT }), readSource: f.readSource,
    createSourceIdentity: async () => Buffer.from('source'), buildMigrationBundle: async () => ({ bundle: { manifestSha256: HASH } }),
    producePrerequisite: f.producePrerequisite, now: () => new Date('2026-10-22T02:00:00.000Z'),
  })
  assert.equal(result.refreshed, true)
  assert.equal(Object.hasOwn(result, 'retainedWorkerDescriptorRef'), false)
  assert.equal(Object.hasOwn(f.stages[1].input, 'openswxWorkerRef'), false)
  assert.equal(Object.hasOwn(f.stages[1].input, 'retainedOpenswxWorker'), false)
  assert.equal(Object.hasOwn(f.stages[4].input, 'openswxWorkerRef'), false)
  assert.equal(f.reads.some(row => row.uri?.includes('/openswx-worker/')), false)
})

test('native38 refresh indexes the sealed prior admission and carries the same index through authority and intent', async () => {
  const template = appliedTemplate()
  const f = fixture(template)
  const root = `gs://${BUCKET}/receipts/releases/${template.releaseId}/${templateRef.sha256}`
  const nativeRef = { uri: `${root}/migrate.json`, sha256: HASH }
  const admission = stageReceipt({ profile: { application: { id: 'ai-pdm' } }, intent: template, stage: 'migrate',
    facts: { disposition: 'FORWARD_APPLIED', migrationReceiptRef: nativeRef }, observedAt: '2026-10-21T23:00:00.000Z' })
  const admissionBytes = Buffer.from(`${canonicalize(admission)}\n`)
  const admissionRef = { uri: `${root}/migration-admission.json`, sha256: sha256(admissionBytes) }
  const prepareRef = { uri: `${root}/prepare.json`, sha256: HASH }
  f.transport.readBytes = async uri => {
    if (uri === admissionRef.uri) return { bytes: admissionBytes, ref: admissionRef }
    assert.equal(uri, prepareRef.uri)
    return { bytes: Buffer.from('sealed prepare'), ref: prepareRef }
  }
  const readJson = f.transport.readJson
  f.transport.readJson = actual => actual.uri === nativeRef.uri
    ? { value: { ledgerCount: 38 }, ref: nativeRef } : readJson(actual)
  await refreshAppliedContinuationCapsule({ templateRef, profile, root: 'C:/fixture', transport: f.transport, environment,
    validateIntent: value => value, gitReader: () => ({ sourceRevision: CURRENT }), readSource: f.readSource,
    producePrerequisite: f.producePrerequisite, now: () => new Date('2026-10-22T02:00:00.000Z') })
  const expected = { schemaVersion: 'aipdm.forward-applied-migration-continuation.v1', priorIntentRef: templateRef,
    priorPrepareRef: prepareRef, priorMigrationAdmissionRef: admissionRef }
  for (const row of f.stages.filter(row => ['routine-authority', 'release-intent'].includes(row.stage))) {
    assert.deepEqual(row.input.forwardAppliedMigrationContinuation, expected)
    assert.deepEqual(row.input.appliedMigrationContinuation, template.appliedMigrationContinuation)
  }
  assert.equal(f.stages.some(row => /migrate|worker|build/u.test(row.stage)), false)
})

test('unreadable optional native admission stops refresh before receipt publication', async () => {
  const f = fixture()
  f.transport.readBytes = async () => { throw Object.assign(new Error('ACCESS_DENIED'), { code: 'ACCESS_DENIED' }) }
  await assert.rejects(() => refreshAppliedContinuationCapsule({ templateRef, profile, root: 'C:/fixture', transport: f.transport, environment,
    validateIntent: value => value, gitReader: () => ({ sourceRevision: CURRENT }), readSource: f.readSource,
    producePrerequisite: f.producePrerequisite, now: () => new Date('2026-10-22T02:00:00.000Z') }), /ACCESS_DENIED/u)
  assert.equal(f.stages.length, 0)
})

test('C110-shaped refresh routes the exact pre-activation owner run through verifier before authority publication', async () => {
  const ownerRunRef = 'https://api.github.com/repos/jedchang0308-jenfu/AI-PDM/actions/runs/39723589561'
  const events = []
  let f
  f = fixture(appliedTemplate(), templateRef, async value => {
    if (value.stage !== 'routine-authority') return
    assert.equal(f.stages.some(row => row.stage === 'routine-authority'), false)
    const run = await value.transport.readOwnerRun(profile, ownerRunRef)
    assert.deepEqual(run, { id: '39723589561', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: OLD })
    events.push('routine-authority-owner-run-verified')
  })
  const verifier = new Proxy({
    readJson: (...args) => f.transport.readJson(...args),
    readBytes: (...args) => f.transport.readBytes(...args),
    readOwnerRun: async (_profile, actualRef) => {
      assert.equal(actualRef, ownerRunRef)
      events.push('verifier-read-owner-run')
      return { id: '39723589561', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: OLD }
    },
  }, { get: (target, method) => target[method] ?? (() => undefined) })
  const inert = new Proxy({}, { get: () => () => undefined })
  const transport = createAppliedContinuationRefreshTransport({ verifier, builder: inert })
  const result = await refreshAppliedContinuationCapsule({
    templateRef, profile, root: 'C:/fixture', transport, environment,
    validateIntent: value => value, gitReader: () => ({ sourceRevision: CURRENT }), readSource: f.readSource,
    createSourceIdentity: async () => Buffer.from('source'), buildMigrationBundle: async () => ({ bundle: { manifestSha256: HASH } }),
    producePrerequisite: f.producePrerequisite, now: () => new Date('2026-10-22T02:00:00.000Z'),
  })
  assert.equal(result.refreshed, true)
  assert.deepEqual(events, ['verifier-read-owner-run', 'routine-authority-owner-run-verified'])
  assert.deepEqual(f.stages.map(row => row.stage), ['source-freeze', 'runtime-config', 'infra-reuse', 'routine-authority', 'release-intent'])
})

test('fresh exact-source capsules and non-release diagnostics are reused without writes', async () => {
  const fresh = appliedTemplate({ sourceRevision: CURRENT, deadlineAt: '2026-10-22T03:00:00.000Z' })
  const f = fixture(fresh)
  const result = await refreshAppliedContinuationCapsule({ templateRef, profile, root: 'C:/fixture', transport: f.transport, environment,
    validateIntent: value => value, gitReader: () => ({ sourceRevision: CURRENT }), readSource: f.readSource,
    producePrerequisite: f.producePrerequisite, now: () => new Date('2026-10-22T02:00:00.000Z') })
  assert.equal(result.refreshed, false)
  assert.equal(f.stages.length, 0)

  const diagnosticRef = { uri: `gs://${BUCKET}/receipts/dev-122/rd-permission-state/operation.json`, sha256: HASH }
  const diagnostic = fixture({ schemaVersion: 'aipdm.rd-permission-state-operation.v1' }, diagnosticRef)
  const passthrough = await refreshAppliedContinuationCapsule({ templateRef: diagnosticRef, profile, root: 'C:/fixture', transport: diagnostic.transport,
    environment: {}, validateIntent: () => { throw new Error('must not validate diagnostics') } })
  assert.deepEqual(passthrough.ref, diagnosticRef)
  assert.equal(diagnostic.stages.length, 0)
})

test('divergent source and incomplete applied continuation fail closed before publishing receipts', async () => {
  for (const [template, ancestor, code] of [
    [appliedTemplate(), false, 'APPLIED_CONTINUATION_REFRESH_SOURCE_DIVERGED'],
    [appliedTemplate({ appliedMigrationContinuation: undefined }), true, 'APPLIED_CONTINUATION_REFRESH_TEMPLATE_INVALID'],
  ]) {
    const f = fixture(template)
    f.readSource.isAncestor = () => ancestor
    await assert.rejects(refreshAppliedContinuationCapsule({ templateRef, profile, root: 'C:/fixture', transport: f.transport, environment,
      validateIntent: value => value, gitReader: () => ({ sourceRevision: CURRENT }), readSource: f.readSource,
      producePrerequisite: f.producePrerequisite, now: () => new Date('2026-10-22T02:00:00.000Z') }), new RegExp(code, 'u'))
    assert.equal(f.stages.length, 0)
  }
})
