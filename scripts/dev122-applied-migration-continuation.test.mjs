import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { assertAppliedMigrationContinuation } from './lib/dev122-applied-migration-continuation.mjs'
import { readAppliedMigrationContinuationHistory } from './lib/dev012-owner-stage-executor.mjs'
import { buildDev117MigrationBundle, buildDev117MigrationPackage } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { assertAiPdmMigrationContent, assertAiPdmRepairMigrationMode, createAiPdmMigrationHistory } from './lib/dev121-owner-release-proof.mjs'
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

function fixture() {
  const full = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), appliedSource)
  const profilePath = 'config/release/dev117-ai-pdm-independent-production-v3.json'
  const files = new Map([[profilePath, Buffer.from(`${canonicalize(profile)}\n`)],
    ...profile.migrations.entries.map(row => [row.path, readFileSync(new URL(`../${row.path}`, import.meta.url))])])
  const content = assertAiPdmMigrationContent({ files, bundle: full.bundle, sourceRevision: appliedSource, deadlineAt: '2999-01-01T00:00:00.000Z' })
  const releaseId = 'DEV122-RD-APPLIED-TEST'
  const rootHash = '1'.repeat(64)
  const root = `gs://${bucket}/receipts/releases/${releaseId}/${rootHash}`
  const prepareRef = ref(`${root}/prepare.json`), migrateRef = ref(`${root}/migrate.json`)
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
  const intentRef = ref(`gs://${bucket}/receipts/releases/${releaseId}/release-intent.json`)
  const deploymentRef = ref(`${root}/deployment-capsule.json`)
  const history = createAiPdmMigrationHistory({ sourceRevision: appliedSource, intentRef, deploymentRef, candidateRef: null, content,
    receiptRef: migrateRef, receipt: migration, bundleRef, bundle: full.bundle, bundleBytes })
  const appliedIntent = { sourceRevision: appliedSource, previousRevision: fence.oldRevision, postAbortLedgerReadbackRef: postAbort, principalOnlyFenceRef: fenceRef,
    principalOnlyRecovery: recovery }
  const graph = { terminal: null, migrate: { ref: migrateRef, value: migration }, prepare: { ref: prepareRef }, migrationMode: 'FORWARD_APPLIED',
    migrationHistory: history, intent: appliedIntent, chain: { deployment: { ref: deploymentRef, value: {
      migrationRunnerDigest: digest, migrationRunnerSourceRevision: runnerSource,
    } } } }

  const runnerFull = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), runnerSource)
  const probes = buildRdLedgerProbeBundles(runnerFull)
  const job = providerJob()
  const rdIntent = buildRdLedgerReadbackIntent({ releaseId: 'DEV122-RD-APPLIED-LEDGER', workflowSourceRevision: appliedSource,
    workflowSourceTree: '7'.repeat(40), workflowSourceIdentitySha256: '8'.repeat(64), runnerSourceRevision: runnerSource,
    profileSha256: rdReadbackProfileSha256(profile), probes, job, observedAt: '2026-10-20T22:29:51.000Z', deadlineAt: '2026-10-21T01:29:48.000Z' })
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
    attempts: [{ status: 'PASS', ledgerCount: 35, executionReadbackRef: executionRef, nativeReceiptRef: nativeRef, completedAt: execution.completionTime }],
    successfulProbe: rdIntent.probes[0], nativeReceiptRef: nativeRef, observedAt: execution.completionTime })
  const resultRef = ref(`${rdRoot}/ledger-readback-result.json`, result)
  const binding = { schemaVersion: 'aipdm.applied-migration-continuation.v1', sourceRevision: appliedSource,
    prepareRef, migrateRef, ledgerReadbackResultRef: resultRef }
  const currentIntent = { sourceRevision: currentSource, previousRevision: fence.oldRevision, appliedMigrationContinuation: binding, postAbortLedgerReadbackRef: postAbort,
    principalOnlyFenceRef: fenceRef, principalOnlyRecovery: recovery }
  const objects = new Map([[resultRef.uri, result], [rdIntentRef.uri, rdIntent], [jobRef.uri, jobReceipt],
    [executionRef.uri, execution], [nativeRef.uri, native]])
  const proof = { disposition: 'migration_only', sourceRevision: appliedSource }
  const transport = {
    async readOwnerSourceProof(args) {
      assert.equal(args.profile, profile); assert.equal(args.sourceRevision, appliedSource); assert.equal(args.verifyProvider, true)
      assert.deepEqual(args.refs, { prepare: prepareRef, migrate: migrateRef, terminal: null })
      return { proof, provider: { status: 'BUILD_IMAGE_VERIFIED' } }
    },
    async readJson(actualRef, actualBucket, prefixes) {
      assert.equal(actualBucket, bucket); assert.deepEqual(prefixes, ['receipts'])
      const value = objects.get(actualRef.uri); if (!value) throw new Error('MISSING'); return { value }
    },
  }
  return { binding, currentIntent, graph, history, content, transport, proof, resultRef, objects, runnerFull, executionRef }
}

test('C96 production-shaped applied migration continuation selects ledger35 and classifies unchanged full35 as no-job reuse', async () => {
  const f = fixture()
  assert.equal(assertAppliedMigrationContinuation(f.binding), f.binding)
  const selected = await readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile, transport: f.transport,
    readObservationInputs: async proof => { assert.equal(proof, f.proof); return f.graph },
    buildMigrationBundle: async sourceRevision => { assert.equal(sourceRevision, runnerSource); return f.runnerFull },
    ancestorRunner: () => true, compatibilityRunner: () => true })
  assert.equal(selected, f.history)
  assert.equal(assertAiPdmRepairMigrationMode(selected, f.content), 'HISTORICAL_EVIDENCE_REUSED')
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
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile, transport: f.transport,
    readObservationInputs: async () => f.graph, buildMigrationBundle: async () => f.runnerFull,
    ancestorRunner: () => false, compatibilityRunner: () => true }),
  /APPLIED_MIGRATION_CONTINUATION_SOURCE_INVALID/u)
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: { ...f.currentIntent,
    principalOnlyRecovery: { ...f.currentIntent.principalOnlyRecovery, revision: 'ai-pdm-prod-recovery-other' } }, profile, transport: f.transport,
    readObservationInputs: async () => f.graph, buildMigrationBundle: async () => f.runnerFull,
    ancestorRunner: () => true, compatibilityRunner: () => true }),
  /APPLIED_MIGRATION_CONTINUATION_RECOVERY_INVALID/u)
  const original = f.objects.get(f.resultRef.uri)
  f.objects.set(f.resultRef.uri, { ...original, migrationRunnerDigest: original.migrationRunnerDigest.replace(/.$/u, '0') })
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile, transport: f.transport,
    readObservationInputs: async () => f.graph, buildMigrationBundle: async () => f.runnerFull,
    ancestorRunner: () => true, compatibilityRunner: () => true }), /RD_READBACK_RESULT_INVALID/u)

  f.objects.set(f.resultRef.uri, original)
  const execution = f.objects.get(f.executionRef.uri)
  const { receiptSha256: _, ...executionCore } = execution
  f.objects.set(f.executionRef.uri, sealed({ ...executionCore, status: 'EXPECTED_READ_ONLY_PROBE_FAILURE',
    completedState: 'CONDITION_FAILED', succeededCount: 0, failedCount: 1 }))
  await assert.rejects(readAppliedMigrationContinuationHistory({ intent: f.currentIntent, profile, transport: f.transport,
    readObservationInputs: async () => f.graph, buildMigrationBundle: async () => f.runnerFull,
    ancestorRunner: () => true, compatibilityRunner: () => true }), /APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID/u)
})
