import assert from 'node:assert/strict'
import test from 'node:test'

import { createWifAppliedContinuationRefreshTransport } from './dev122-applied-continuation-capsule-refresh.mjs'

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
    openswxWorkerRef: { uri: `gs://${BUCKET}/receipts/dev-122/openswx-worker/c110-descriptor.json`, sha256: HASH },
    postAbortLedgerReadbackRef: ref('ledger'),
    principalOnlyFenceRef: ref('fence'),
    principalOnlyRecovery: { revision: 'ai-pdm-prod-recovery', serviceUid: 'service-uid', imageDigest: `image@sha256:${HASH}`, receiptRef: ref('recovery') },
    appliedMigrationContinuation: { schemaVersion: 'aipdm.applied-migration-continuation.v1', sourceRevision: OLD, prepareRef: ref('prepare'), migrateRef: ref('migrate'), ledgerReadbackResultRef: ref('ledger-result') },
    ...overrides,
  }
}

function fixture(template = appliedTemplate(), capsuleRef = templateRef, stageHook = null) {
  const runtime = { runtimeConfig: { plainEnvironment: { NODE_ENV: 'production', PDM_OPENSWX_DISPATCH_ENABLED: '1' }, secretVersions: { SESSION_SECRET: '7', PDM_WORKLOAD_AUTH_CREDENTIALS: '9' } } }
  const reads = []
  const transport = {
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
    'routine-authority': { refs: { authorizationPolicyRef: ref('new-authorization'), readinessReceiptRef: ref('new-readiness') }, previousRevision: 'ai-pdm-prod-old' },
    'release-intent': { ref: { uri: `gs://${BUCKET}/receipts/releases/DEV122-RD-WIF-123456-2/release-intent.json`, sha256: HASH } },
  }
  const producePrerequisite = async value => {
    await stageHook?.(value)
    stages.push({ stage: value.stage, releaseId: value.releaseId, input: structuredClone(value.input) })
    return stageResult[value.stage]
  }
  const readWorkerSource = () => Buffer.from('unused')
  readWorkerSource.isAncestor = (ancestor, descendant) => ancestor === OLD && descendant === CURRENT
  return { transport, reads, stages, producePrerequisite, readWorkerSource }
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
})

test('WIF transport routes its complete contract through one role map', async () => {
  const calls = []
  const role = name => new Proxy({}, { get: (_target, method) => (...args) => { calls.push([name, method, args]); return `${name}:${String(method)}` } })
  const transport = createAppliedContinuationRefreshTransport({ verifier: role('verifier'), builder: role('builder'), deployer: role('deployer') })
  assert.deepEqual(Object.keys(transport), Object.keys(APPLIED_CONTINUATION_REFRESH_TRANSPORT_ROUTES))
  for (const [method, expectedRole] of Object.entries(APPLIED_CONTINUATION_REFRESH_TRANSPORT_ROUTES)) {
    assert.equal(transport[method]('production-shaped-input'), `${expectedRole}:${method}`)
  }
  assert.deepEqual(calls.map(([roleName, method]) => [roleName, method]), Object.entries(APPLIED_CONTINUATION_REFRESH_TRANSPORT_ROUTES).map(([method, roleName]) => [roleName, method]))
  assert.throws(() => createAppliedContinuationRefreshTransport({ verifier: {}, builder: role('builder'), deployer: role('deployer') }), /APPLIED_CONTINUATION_REFRESH_TRANSPORT_INVALID/u)
})

test('WIF assembly gives exact provider proof GETs the builder token without widening other transports', () => {
  const created = []
  const createTransport = options => {
    const role = created.length === 0 ? 'verifier' : created.length === 1 ? 'builder' : 'deployer'
    created.push({ role, options })
    return new Proxy({}, { get: (_target, method) => (...args) => ({ role, method, args }) })
  }
  const transport = createWifAppliedContinuationRefreshTransport({
    verifierToken: 'verifier-token',
    builderToken: 'builder-token',
    deployerToken: 'deployer-token',
    createTransport,
  })

  assert.deepEqual(created, [
    { role: 'verifier', options: { token: 'verifier-token', builderReadbackToken: 'builder-token' } },
    { role: 'builder', options: { token: 'builder-token', builderReadbackToken: null } },
    { role: 'deployer', options: { token: 'deployer-token', builderReadbackToken: null } },
  ])
  assert.equal(transport.readOwnerSourceProof('proof').role, 'verifier')
  assert.equal(transport.readOwnerRun('run').role, 'verifier')
  assert.equal(transport.putJson('receipt').role, 'builder')
  assert.equal(transport.request('provider').role, 'deployer')
})

test('expired applied continuation is normalized once into a fresh exact-main capsule without rebuilding its worker', async () => {
  const f = fixture()
  const now = new Date('2026-10-22T02:00:00.000Z')
  const result = await refreshAppliedContinuationCapsule({
    templateRef, profile, root: 'C:/fixture', transport: f.transport, environment,
    validateIntent: value => value,
    gitReader: () => ({ sourceRevision: CURRENT }),
    readWorkerSource: f.readWorkerSource,
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
  assert.deepEqual(f.stages[1].input.openswxWorkerRef, appliedTemplate().openswxWorkerRef)
  assert.deepEqual(f.stages[4].input.appliedMigrationContinuation, appliedTemplate().appliedMigrationContinuation)
  assert.equal(f.stages.some(row => /worker|build/u.test(row.stage)), false)
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
    readOwnerRun: async (_profile, actualRef) => {
      assert.equal(actualRef, ownerRunRef)
      events.push('verifier-read-owner-run')
      return { id: '39723589561', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: OLD }
    },
  }, { get: (target, method) => target[method] ?? (() => undefined) })
  const inert = new Proxy({}, { get: () => () => undefined })
  const transport = createAppliedContinuationRefreshTransport({ verifier, builder: inert, deployer: inert })
  const result = await refreshAppliedContinuationCapsule({
    templateRef, profile, root: 'C:/fixture', transport, environment,
    validateIntent: value => value, gitReader: () => ({ sourceRevision: CURRENT }), readWorkerSource: f.readWorkerSource,
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
    validateIntent: value => value, gitReader: () => ({ sourceRevision: CURRENT }), readWorkerSource: f.readWorkerSource,
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
    f.readWorkerSource.isAncestor = () => ancestor
    await assert.rejects(refreshAppliedContinuationCapsule({ templateRef, profile, root: 'C:/fixture', transport: f.transport, environment,
      validateIntent: value => value, gitReader: () => ({ sourceRevision: CURRENT }), readWorkerSource: f.readWorkerSource,
      producePrerequisite: f.producePrerequisite, now: () => new Date('2026-10-22T02:00:00.000Z') }), new RegExp(code, 'u'))
    assert.equal(f.stages.length, 0)
  }
})
