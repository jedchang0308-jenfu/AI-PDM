import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { assertAppliedContinuationRuntimeBinding, assertAppliedMigrationContinuation, assertAppliedMigrationReadbackSource } from './lib/dev122-applied-migration-continuation.mjs'
import { readAppliedMigrationContinuationHistory } from './lib/dev012-owner-stage-executor.mjs'
import { buildDev117MigrationBundle, buildDev117MigrationPackage } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { canonicalize, sha256, stageReceipt } from './lib/dev012-owner-release-runtime.mjs'
import { createMigrationBundle } from './lib/dev012-production-migration-runner.mjs'
import { assertAiPdmMigrationContent, assertAiPdmRepairMigrationMode } from './lib/dev121-owner-release-proof.mjs'
import { buildRdLedgerProbeBundles, buildRdLedgerReadbackIntent, buildRdReadbackResult, rdReadbackJobEnvironment, rdReadbackJobProjection, rdReadbackProfileSha256, rdReadbackSha256 } from './lib/dev122-rd-permission-ledger-readback.mjs'

const bucket = 'jenfu-platform-prod-aipdm-release'
const appliedSource = 'a'.repeat(40)
const runnerSource = 'b'.repeat(40)
const currentSource = 'c'.repeat(40)
const digest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:${'d'.repeat(64)}`
const read = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
const profile = read('config/release/dev117-ai-pdm-independent-production-v3.json')
const n1c = read('config/platform/dev-010-n1c-ai-pdm.json')
const ref = (uri, value = null) => ({ uri, sha256: value === null ? 'e'.repeat(64) : sha256(Buffer.from(`${canonicalize(value)}\n`)) })
const sealed = value => ({ ...value, receiptSha256: rdReadbackSha256(value) })

test('applied continuation retains runtime identity without reopening worker evidence', () => {
  const descriptorRef = ref(`gs://${bucket}/receipts/dev-122/openswx-worker/retained-descriptor.json`)
  const binding = { descriptorRef, sourceRevision: appliedSource, workerProfileSha256: 'f'.repeat(64), purpose: 'full' }
  const runtime = { plainEnvironment: { PDM_OPENSWX_DISPATCH_ENABLED: '1' },
    secretVersions: { PDM_WORKLOAD_AUTH_CREDENTIALS: '9' }, openswxWorker: binding }
  assert.doesNotThrow(() => assertAppliedContinuationRuntimeBinding(runtime, { openswxWorkerRef: descriptorRef }))
  for (const changed of [
    { runtime, intent: { openswxWorkerRef: ref(`gs://${bucket}/receipts/dev-122/openswx-worker/wrong.json`) } },
    { runtime: { ...runtime, plainEnvironment: { PDM_OPENSWX_DISPATCH_ENABLED: '0' } }, intent: { openswxWorkerRef: descriptorRef } },
    { runtime: { ...runtime, openswxWorker: { ...binding, workerProfileSha256: 'invalid' } }, intent: { openswxWorkerRef: descriptorRef } },
  ]) assert.throws(() => assertAppliedContinuationRuntimeBinding(changed.runtime, changed.intent), /APPLIED_MIGRATION_CONTINUATION_RUNTIME_INVALID/u)
  assert.doesNotThrow(() => assertAppliedContinuationRuntimeBinding({ plainEnvironment: { PDM_OPENSWX_DISPATCH_ENABLED: '0' } }, {}))
})

function providerJob() {
  return {
    name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner',
    etag: 'etag-ledger35', template: { taskCount: 1, parallelism: 1, template: {
      serviceAccount: profile.migrations.serviceAccount, maxRetries: 0, timeout: '1800s',
      volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }],
      containers: [{ name: 'migration', image: digest, args: ['--bundle-ref-required'],
        env: Object.entries(rdReadbackJobEnvironment(profile, runnerSource)).map(([name, value]) => ({ name, value })),
        volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }] }],
    } },
  }
}

function fixture(activeProfile = profile) {
  const historicalProfile = structuredClone(activeProfile)
  historicalProfile.migrations.entries = historicalProfile.migrations.entries.slice(0, 35)
  const full = buildDev117MigrationBundle(historicalProfile, buildDev117MigrationPackage(historicalProfile, n1c), appliedSource)
  const profilePath = 'config/release/dev117-ai-pdm-independent-production-v3.json'
  const files = new Map([[profilePath, Buffer.from(`${canonicalize(historicalProfile)}\n`)],
    ...historicalProfile.migrations.entries.map(row => [row.path, readFileSync(new URL(`../${row.path}`, import.meta.url))])])
  const content = assertAiPdmMigrationContent({ files, bundle: full.bundle, sourceRevision: appliedSource, deadlineAt: '2999-01-01T00:00:00.000Z' })
  const releaseId = 'DEV122-RD-APPLIED-TEST'
  const fenceRef = { uri: `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/${'f'.repeat(40)}/fence-214.json`, sha256: '2'.repeat(64) }
  const recovery = { revision: 'ai-pdm-prod-recovery-fixture', imageDigest: `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-recovery@sha256:${'3'.repeat(64)}`,
    serviceUid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5', receiptRef: { uri: `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-RECOVERY/${'f'.repeat(40)}.json`, sha256: '4'.repeat(64) } }
  const postAbort = { uri: `gs://${bucket}/receipts/releases/DEV122-RD-OLDER/${'5'.repeat(64)}/ledger-readback-result.json`, sha256: '6'.repeat(64) }
  const fence = { ref: fenceRef.uri, sha256: fenceRef.sha256, service: 'ai-pdm-prod', uid: recovery.serviceUid,
    oldRevision: 'ai-pdm-prod-1be8986b68ce', beforeGeneration: 213, generation: 214, requestTimeoutSeconds: 60,
    drainSeconds: 90, fenceSourceRevision: 'f'.repeat(40), ownerWriterSessions: 0 }
  const migrationCore = { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: appliedSource,
    database: 'jenfu_prod', ledger: 'ai_pdm_core.schema_migrations', manifestSha256: full.bundle.manifestSha256,
    baselineCount: 15, minimumLedgerCount: 0, ledgerBootstrap: { enabled: true, created: false }, ledgerCount: 35,
    applied: 2, replayed: 33, crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
    boundaryStatus: 'PASS', executionName: 'ai-pdm-prod-migration-runner-fixture', startedAt: '2026-10-20T22:23:48.000Z',
    completedAt: '2026-10-20T22:23:49.000Z', status: 'PASS', principalOnlyFence: fence }
  const migration = { ...migrationCore, receiptSha256: sha256(canonicalize(migrationCore)) }
  const bundleBytes = Buffer.from(canonicalize(full.bundle))
  const bundleRef = { uri: `gs://${bucket}/source/migration-bundles/${appliedSource}/${full.bundle.manifestSha256}.json`, sha256: sha256(bundleBytes) }
  const sourceLock = { schemaVersion: 'jenfu.dev012.owner-source-lock.v1', ownerApplicationId: 'ai-pdm', repository: profile.application.repository,
    branch: profile.application.branch, releaseId, sourceRevision: appliedSource, sourceTree: '9'.repeat(40), sourceSha256: '8'.repeat(64),
    migrationManifestSha256: full.bundle.manifestSha256, clean: true, remoteRef: `refs/heads/${profile.application.branch}`,
    remoteRevision: appliedSource, status: 'SOURCE_FROZEN', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', observedAt: '2026-10-20T22:20:00.000Z' }
  const sourceLockRef = ref(`gs://${bucket}/receipts/releases/${releaseId}/source-lock.json`, sourceLock)
  const prerequisiteRefs = { sourceLock: sourceLockRef,
    authorization: ref(`gs://${bucket}/receipts/releases/${releaseId}/owner-authorization.json`),
    readiness: ref(`gs://${bucket}/receipts/releases/${releaseId}/owner-readiness.json`),
    foundation: ref(`gs://${bucket}/receipts/releases/DEV121-FOUNDATION/foundation-infra.json`),
    infra: ref(`gs://${bucket}/receipts/releases/${releaseId}/app-infra-reuse.json`),
    runtimeConfig: ref(`gs://${bucket}/receipts/releases/${releaseId}/runtime-config.json`) }
  const historicalIntent = { schemaVersion: profile.schemas.releaseIntent, ownerApplicationId: 'ai-pdm', releaseId, sourceRevision: appliedSource,
    sourceSha256: sourceLock.sourceSha256, sourceLockRef, authorizationPolicyRef: prerequisiteRefs.authorization,
    readinessReceiptRef: prerequisiteRefs.readiness, foundationReceiptRef: prerequisiteRefs.foundation,
    infraReceiptRef: prerequisiteRefs.infra, runtimeConfigRef: prerequisiteRefs.runtimeConfig,
    migrationManifestSha256: full.bundle.manifestSha256, previousRevision: fence.oldRevision, deadlineAt: '2026-10-21T03:37:38.641Z',
    openswxWorkerRef: ref(`gs://${bucket}/receipts/dev-122/openswx-worker/UNREAD-BY-APPLIED-MIGRATION.json`),
    postAbortLedgerReadbackRef: postAbort, principalOnlyFenceRef: fenceRef, principalOnlyRecovery: recovery }
  const intentRef = ref(`gs://${bucket}/receipts/releases/${releaseId}/release-intent.json`, historicalIntent)
  const root = `gs://${bucket}/receipts/releases/${releaseId}/${intentRef.sha256}`
  const prepare = stageReceipt({ profile, intent: historicalIntent, stage: 'prepare', previousReceiptRef: null,
    facts: { prerequisiteRefs }, observedAt: '2026-10-20T22:21:00.000Z' })
  const prepareRef = ref(`${root}/prepare.json`, prepare), migrateRef = ref(`${root}/migrate.json`, migration)
  const deployment = { schemaVersion: profile.schemas.deploymentCapsule, ownerApplicationId: 'ai-pdm', releaseIntentRef: intentRef,
    releaseIntentSha256: intentRef.sha256, sourceRevision: appliedSource, deadlineAt: historicalIntent.deadlineAt,
    migrationBundleRef: bundleRef, migrationRunnerDigest: digest, migrationRunnerSourceRevision: runnerSource }
  const deploymentRef = ref(`${root}/deployment-capsule.json`, deployment)

  const runnerFull = buildDev117MigrationBundle(historicalProfile, buildDev117MigrationPackage(historicalProfile, n1c), runnerSource)
  const probes = buildRdLedgerProbeBundles(runnerFull)
  const job = providerJob()
  const rdIntent = buildRdLedgerReadbackIntent({ releaseId: 'DEV122-RD-APPLIED-LEDGER', workflowSourceRevision: appliedSource,
    workflowSourceTree: '7'.repeat(40), workflowSourceIdentitySha256: '8'.repeat(64), runnerSourceRevision: runnerSource,
    profileSha256: rdReadbackProfileSha256(historicalProfile), probes, job, observedAt: '2026-10-20T22:29:51.000Z', deadlineAt: '2026-10-21T01:29:48.000Z' })
  const rdIntentRef = ref(`gs://${bucket}/receipts/releases/${rdIntent.releaseId}/rd-permission-ledger-readback-intent.json`, rdIntent)
  const rdRoot = `gs://${bucket}/receipts/releases/${rdIntent.releaseId}/${rdIntentRef.sha256}`
  const jobReceipt = sealed({ schemaVersion: 'aipdm.dev122.rd-permission-ledger-job-readback.v2', ownerApplicationId: 'ai-pdm',
    releaseId: rdIntent.releaseId, workflowSourceRevision: appliedSource, runnerSourceRevision: runnerSource,
    readbackIntentRef: rdIntentRef, projection: rdReadbackJobProjection(job), observedAt: '2026-10-20T22:30:00.000Z', status: 'PASS' })
  const jobRef = ref(`${rdRoot}/ledger-job-readback.json`, jobReceipt)
  const executionName = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner/executions/probe-35'
  const execution = sealed({ schemaVersion: 'aipdm.dev122.rd-permission-ledger-probe-execution.v2', ownerApplicationId: 'ai-pdm',
    releaseId: rdIntent.releaseId, workflowSourceRevision: appliedSource, runnerSourceRevision: runnerSource,
    readbackIntentRef: rdIntentRef, ledgerCount: 35, executionName, createTime: '2026-10-20T22:35:00.000Z',
    startTime: '2026-10-20T22:35:01.000Z', completionTime: '2026-10-20T22:36:19.000Z', succeededCount: 1,
    failedCount: 0, completedState: 'CONDITION_SUCCEEDED', templateSha256: 'a'.repeat(64), observedAt: '2026-10-20T22:36:19.000Z', status: 'PASS' })
  const executionRef = ref(`${rdRoot}/ledger-probe-35-execution-readback.json`, execution)
  const nativeCore = { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: runnerSource,
    database: 'jenfu_prod', ledger: 'ai_pdm_core.schema_migrations', manifestSha256: probes[0].manifestSha256,
    baselineCount: 15, minimumLedgerCount: 0, ledgerBootstrap: { enabled: true, created: false }, ledgerCount: 35,
    applied: 0, replayed: 35, crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
    boundaryStatus: 'PASS', executionName: executionName.split('/').at(-1), startedAt: '2026-10-20T22:36:18.000Z', completedAt: '2026-10-20T22:36:18.500Z', status: 'PASS' }
  const native = { ...nativeCore, receiptSha256: rdReadbackSha256(nativeCore) }
  const nativeRef = ref(`${rdRoot}/ledger-probe-35.json`, native)
  const result = buildRdReadbackResult({ intent: rdIntent, intentRef: rdIntentRef, jobReadbackRef: jobRef,
    attempts: [{ status: 'PASS', ledgerCount: 35, executionReadbackRef: executionRef, nativeReceiptRef: nativeRef, completedAt: native.completedAt }],
    successfulProbe: rdIntent.probes[0], nativeReceiptRef: nativeRef, observedAt: native.completedAt })
  const resultRef = ref(`${rdRoot}/ledger-readback-result.json`, result)
  const binding = { schemaVersion: 'aipdm.applied-migration-continuation.v1', sourceRevision: appliedSource,
    prepareRef, migrateRef, ledgerReadbackResultRef: resultRef }
  const currentIntent = { sourceRevision: currentSource, previousRevision: fence.oldRevision, deadlineAt: '2999-01-01T00:00:00.000Z', appliedMigrationContinuation: binding, postAbortLedgerReadbackRef: postAbort,
    principalOnlyFenceRef: fenceRef, principalOnlyRecovery: recovery }
  const objects = new Map([[intentRef.uri, historicalIntent], [sourceLockRef.uri, sourceLock], [prepareRef.uri, prepare],
    [migrateRef.uri, migration], [deploymentRef.uri, deployment], [bundleRef.uri, full.bundle],
    [resultRef.uri, result], [rdIntentRef.uri, rdIntent], [jobRef.uri, jobReceipt], [executionRef.uri, execution], [nativeRef.uri, native]])
  const reads = []
  const transport = {
    async readBytes(uri, { expectedSha256 } = {}) {
      reads.push(uri)
      const value = objects.get(uri)
      if (!value) { const error = new Error('MISSING'); error.code = 'MISSING'; throw error }
      const bytes = uri === bundleRef.uri ? bundleBytes : Buffer.from(`${canonicalize(value)}\n`)
      const actual = sha256(bytes)
      if (expectedSha256 !== null && expectedSha256 !== undefined && actual !== expectedSha256) throw new Error('HASH_MISMATCH')
      return { bytes, ref: { uri, sha256: actual }, generation: '1', crc32c: 'fixture' }
    },
    async readJson(actualRef, actualBucket, prefixes) {
      assert.equal(actualBucket, bucket); assert.deepEqual(prefixes, ['receipts'])
      const value = objects.get(actualRef.uri); if (!value) throw new Error('MISSING'); return { value }
    },
  }
  const readSource = (path, sourceRevision) => {
    assert.equal(sourceRevision, currentSource)
    const value = files.get(path)
    if (!value) throw new Error('MISSING_SOURCE')
    return value
  }
  return { binding, currentIntent, content, transport, readSource, reads, resultRef, objects, runnerFull, executionRef, activeProfile, historicalProfile }
}

test('C96 production-shaped applied migration continuation selects ledger35 and classifies unchanged full35 as no-job reuse', async () => {
  const f = fixture()
  assert.equal(assertAppliedMigrationContinuation(f.binding), f.binding)
  const selected = await readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile: f.historicalProfile, transport: f.transport,
    readSource: f.readSource,
    buildMigrationBundle: async sourceRevision => { assert.equal(sourceRevision, runnerSource); return f.runnerFull },
    ancestorRunner: () => true, compatibilityRunner: () => true })
  assert.equal(selected.sourceRevision, appliedSource)
  assert.equal(assertAiPdmRepairMigrationMode(selected, f.content), 'HISTORICAL_EVIDENCE_REUSED')
  assert.equal(f.reads.some(uri => uri.includes('/openswx-worker/')), false)
})

test('DEV-123 authenticates the installed35 prefix while current38 remains a real forward migration', async () => {
  const f = fixture()
  const current = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), currentSource)
  const runnerCurrent = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), runnerSource)
  const files = new Map([['config/release/dev117-ai-pdm-independent-production-v3.json', Buffer.from(canonicalize(profile))],
    ...profile.migrations.entries.map(row => [row.path, readFileSync(new URL(`../${row.path}`, import.meta.url))])])
  const currentContent = assertAiPdmMigrationContent({ files, bundle: current.bundle, sourceRevision: currentSource, deadlineAt: f.currentIntent.deadlineAt })
  const selected = await readAppliedMigrationContinuationHistory({ intent: { ...f.currentIntent, migrationManifestSha256: current.bundle.manifestSha256 },
    profile, transport: f.transport, readSource: (path, revision) => { assert.equal(revision, currentSource); return files.get(path) },
    buildMigrationBundle: async revision => { assert.equal(revision, runnerSource); return runnerCurrent },
    ancestorRunner: () => true, compatibilityRunner: () => true })
  assert.equal(selected.installed.bundle.entries.length, 35)
  assert.equal(assertAiPdmRepairMigrationMode(selected, currentContent), 'FORWARD_APPLIED')
  assert.equal(f.reads.some(uri => uri.includes('/openswx-worker/')), false)
})

test('both continuation consumers authenticate a current38 profile through the same closed35 readback boundary', () => {
  const f = fixture()
  const result = f.objects.get(f.resultRef.uri)
  const readbackIntent = f.objects.get(result.readbackIntentRef.uri)
  const fullMigration = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), runnerSource)
  const input = { readbackIntent, profile, fullMigration, installedBundle: f.runnerFull.bundle,
    ancestorRunner: () => true, compatibilityRunner: () => true }
  const validated = assertAppliedMigrationReadbackSource(input)
  assert.deepEqual(validated.probes, buildRdLedgerProbeBundles(f.runnerFull))
  assert.equal(fullMigration.bundle.entries.length, 38)
  assert.equal(profile.migrations.entries.length, 38)
  assert.throws(() => assertAppliedMigrationReadbackSource({ ...input, installedBundle: undefined }),
    /APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID/u)
  const changed = structuredClone(profile)
  changed.migrations.entries[34].sha256 = '0'.repeat(64)
  assert.throws(() => assertAppliedMigrationReadbackSource({ ...input, profile: changed }),
    /MIGRATION_HISTORICAL_PREFIX_INVALID/u)
})

test('DEV-123 rejects a changed retained declaration or runner SQL before forward admission', async () => {
  for (const scenario of ['source-declaration', 'runner-sql']) {
    const f = fixture(), declared = structuredClone(profile)
    if (scenario === 'source-declaration') declared.migrations.entries[34].sha256 = '0'.repeat(64)
    const files = new Map([['config/release/dev117-ai-pdm-independent-production-v3.json', Buffer.from(canonicalize(declared))],
      ...profile.migrations.entries.map(row => [row.path, readFileSync(new URL(`../${row.path}`, import.meta.url))])])
    let runnerCurrent = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), runnerSource)
    if (scenario === 'runner-sql') {
      const entries = structuredClone(runnerCurrent.bundle.entries)
      const bytes = Buffer.concat([Buffer.from(entries[34].sqlBase64, 'base64'), Buffer.from('\n-- substituted retained SQL\n')])
      entries[34].sqlBase64 = bytes.toString('base64'); entries[34].appliedSha256 = sha256(bytes)
      runnerCurrent = createMigrationBundle({ target: { ownerApplicationId: 'ai-pdm', ledger: 'ai_pdm_core.schema_migrations', baselineCount: 15 }, sourceRevision: runnerSource, entries })
    }
    await assert.rejects(readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile,
      transport: f.transport, readSource: (path, revision) => { assert.equal(revision, currentSource); return files.get(path) },
      buildMigrationBundle: async () => runnerCurrent, ancestorRunner: () => true, compatibilityRunner: () => true }),
      /MIGRATION_HISTORICAL_PREFIX_INVALID/u, scenario)
    assert.equal(f.reads.some(uri => uri.includes('/openswx-worker/')), false)
  }
})

test('applied migration continuation ignores unrelated current release-profile drift while preserving ledger35 evidence', async () => {
  const activeProfile = structuredClone(profile)
  activeProfile.workflow.jobs = ['preflight', 'build', 'migrate', 'candidate-smoke', 'activate-readback']
  activeProfile.dataCutover.gateMode = 'HISTORICAL_ONLY'
  const f = fixture(activeProfile)
  const selected = await readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile: f.historicalProfile, transport: f.transport,
    readSource: f.readSource,
    buildMigrationBundle: async sourceRevision => { assert.equal(sourceRevision, runnerSource); return f.runnerFull },
    ancestorRunner: () => true, compatibilityRunner: () => true })
  assert.equal(selected.sourceRevision, appliedSource)
  assert.equal(assertAiPdmRepairMigrationMode(selected, f.content), 'HISTORICAL_EVIDENCE_REUSED')
})

test('applied migration continuation still rejects a changed migration probe projection', async () => {
  const f = fixture()
  const changed = buildDev117MigrationBundle(f.historicalProfile, buildDev117MigrationPackage(f.historicalProfile, n1c), currentSource)
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile: f.historicalProfile, transport: f.transport,
    readSource: f.readSource, buildMigrationBundle: async () => changed,
    ancestorRunner: () => true, compatibilityRunner: () => true }), /RD_READBACK_PROFILE_DRIFT/u)
})

test('applied migration continuation rejects a native receipt completed after its provider execution', async () => {
  const f = fixture()
  const execution = f.objects.get(f.executionRef.uri)
  const { receiptSha256: _receiptSha256, ...executionCore } = execution
  f.objects.set(f.executionRef.uri, sealed({ ...executionCore,
    completionTime: '2026-10-20T22:36:18.400Z', observedAt: '2026-10-20T22:36:18.400Z' }))
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile: f.historicalProfile, transport: f.transport,
    readSource: f.readSource, buildMigrationBundle: async () => f.runnerFull,
    ancestorRunner: () => true, compatibilityRunner: () => true }),
  /APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID/u)
})

test('C96 continuation rejects aliases, source divergence, recovery drift and ledger evidence drift before any mutation', async () => {
  const f = fixture()
  for (const mutate of [
    value => { value.prepareRef.uri = value.prepareRef.uri.replace('/prepare.json', '/../prepare.json') },
    value => { value.migrateRef.uri = value.migrateRef.uri.replace('/migrate.json', '/other/migrate.json') },
    value => { value.ledgerReadbackResultRef.uri = value.ledgerReadbackResultRef.uri.replace('ledger-readback-result', 'alias') },
  ]) {
    const changed = structuredClone(f.binding); mutate(changed)
    assert.throws(() => assertAppliedMigrationContinuation(changed), /APPLIED_MIGRATION_CONTINUATION_INVALID/u)
  }
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile: f.historicalProfile, transport: f.transport,
    readSource: f.readSource, buildMigrationBundle: async () => f.runnerFull,
    ancestorRunner: () => false, compatibilityRunner: () => true }),
  /APPLIED_MIGRATION_CONTINUATION_SOURCE_INVALID/u)
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: { ...f.currentIntent,
    principalOnlyRecovery: { ...f.currentIntent.principalOnlyRecovery, revision: 'ai-pdm-prod-recovery-other' } }, profile: f.historicalProfile, transport: f.transport,
    readSource: f.readSource, buildMigrationBundle: async () => f.runnerFull,
    ancestorRunner: () => true, compatibilityRunner: () => true }),
  /APPLIED_MIGRATION_CONTINUATION_RECOVERY_INVALID/u)
  const original = f.objects.get(f.resultRef.uri)
  f.objects.set(f.resultRef.uri, { ...original, migrationRunnerDigest: original.migrationRunnerDigest.replace(/.$/u, '0') })
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile: f.historicalProfile, transport: f.transport,
    readSource: f.readSource, buildMigrationBundle: async () => f.runnerFull,
    ancestorRunner: () => true, compatibilityRunner: () => true }), /RD_READBACK_RESULT_INVALID/u)

  f.objects.set(f.resultRef.uri, original)
  const execution = f.objects.get(f.executionRef.uri)
  const { receiptSha256: _, ...executionCore } = execution
  f.objects.set(f.executionRef.uri, sealed({ ...executionCore, status: 'EXPECTED_READ_ONLY_PROBE_FAILURE',
    completedState: 'CONDITION_FAILED', succeededCount: 0, failedCount: 1 }))
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile: f.historicalProfile, transport: f.transport,
    readSource: f.readSource, buildMigrationBundle: async () => f.runnerFull,
    ancestorRunner: () => true, compatibilityRunner: () => true }), /APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID/u)
})
