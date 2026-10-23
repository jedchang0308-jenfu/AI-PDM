import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { main as rdLedgerReadbackMain, runMain as runRdLedgerReadbackMain } from './dev122-rd-permission-ledger-readback.mjs'
import { buildDev117MigrationBundle, buildDev117MigrationPackage, assertDev117V3Profile } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { canonicalize } from './lib/dev012-production-migration-runner.mjs'
import {
  RD_LEDGER_READBACK_PGOPTIONS,
  RD_LEDGER_READBACK_RUNNER_PREFIX,
  assertRdReadbackExecutionReceipt,
  assertRdReadbackGitHubContext,
  assertRdLedgerReadbackIntent,
  assertRdReadbackJob,
  assertRdReadbackJobReceipt,
  assertRdReadbackNativeReceipt,
  assertRdReadbackResult,
  assertRdReadbackResultRef,
  assertRdReadbackSourceCompatibility,
  buildRdLedgerProbeBundles,
  buildRdLedgerReadbackIntent,
  buildRdReadbackResult,
  classifyRdReadbackCapsule,
  rdReadbackCompatibilityPaths,
  rdReadbackJobEnvironment,
  rdReadbackJobSourceRevision,
  rdReadbackProfileSha256,
  rdReadbackProbeArguments,
  rdReadbackSha256,
} from './lib/dev122-rd-permission-ledger-readback.mjs'
import { assertDev122GitSourceAuthority } from './lib/dev122-source-authority.mjs'

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
const profile = read('config/release/dev117-ai-pdm-independent-production-v3.json')
const v1 = read('config/release/dev117-ai-pdm-independent-production.json')
const n1c = read('config/platform/dev-010-n1c-ai-pdm.json')
assertDev117V3Profile(profile, v1, n1c)
const historicalProfile = structuredClone(profile)
historicalProfile.migrations.entries = historicalProfile.migrations.entries.slice(0, 35)

const workflowSourceRevision = 'a'.repeat(40)
const runnerSourceRevision = 'b'.repeat(40)
const RUNNER_DIGEST = `${RD_LEDGER_READBACK_RUNNER_PREFIX}${'c'.repeat(64)}`
const full = buildDev117MigrationBundle(historicalProfile, buildDev117MigrationPackage(historicalProfile, n1c), runnerSourceRevision)
const probes = buildRdLedgerProbeBundles(full)
const ref = (name) => ({ uri: `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-RD-READBACK-TEST/${name}.json`, sha256: 'b'.repeat(64) })
const seal = (value) => ({ ...value, receiptSha256: rdReadbackSha256(value) })

function job() {
  return {
    name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner',
    etag: 'etag-generation-23',
    template: {
      taskCount: 1,
      parallelism: 1,
      template: {
        serviceAccount: historicalProfile.migrations.serviceAccount,
        maxRetries: 0,
        timeout: '1800s',
        volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }],
        containers: [{ name: 'migration', image: RUNNER_DIGEST, args: ['--bundle-ref-required'], env: Object.entries(rdReadbackJobEnvironment(historicalProfile, runnerSourceRevision)).map(([name, value]) => ({ name, value })), volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }] }],
      },
    },
  }
}

function intent() {
  return buildRdLedgerReadbackIntent({
    releaseId: 'DEV122-RD-READBACK-TEST',
    workflowSourceRevision,
    workflowSourceTree: 'c'.repeat(40),
    workflowSourceIdentitySha256: 'd'.repeat(64),
    runnerSourceRevision,
    profileSha256: 'e'.repeat(64),
    probes,
    job: job(),
    observedAt: '2026-10-16T02:00:00.000Z',
    deadlineAt: '2026-10-16T04:00:00.000Z',
  })
}

test('RD01 derives sealed installed-runner ledger probes in descending 35/34/33 order', () => {
  assert.deepEqual(probes.map((row) => [row.ledgerCount, row.terminalVersion, row.bundle.entries.at(-1).path]), [
    [35, 'ai-pdm-085', 'db/postgres/085_dev121_principal_role_catalog_v7.sql'],
    [34, 'ai-pdm-084', 'db/postgres/084_dev121_unlinked_legacy_profile_cleanup.sql'],
    [33, 'ai-pdm-083', 'db/postgres/083_dev121_authorized_first_login_account.sql'],
  ])
  for (const probe of probes) {
    assert.equal(probe.bundle.entries.length, probe.ledgerCount)
    assert.equal(probe.bundle.sourceRevision, runnerSourceRevision)
    assert.equal(probe.migrationBundleRef.uri, `gs://jenfu-platform-prod-aipdm-release/source/migration-bundles/${runnerSourceRevision}/${probe.manifestSha256}.json`)
    assert.equal(probe.migrationBundleRef.sha256, rdReadbackSha256(probe.bytes))
  }
})

test('RD02 intent binds exact source, provider Job etag/template, runner and three immutable bundles', () => {
  const value = intent()
  const lfProfile = `${JSON.stringify(profile, null, 2)}\n`
  const crlfProfile = lfProfile.replaceAll('\n', '\r\n')
  assert.notEqual(rdReadbackSha256(Buffer.from(lfProfile)), rdReadbackSha256(Buffer.from(crlfProfile)))
  assert.equal(rdReadbackProfileSha256(JSON.parse(lfProfile)), rdReadbackProfileSha256(JSON.parse(crlfProfile)))
  assert.equal(assertRdLedgerReadbackIntent(value), value)
  assert.equal(assertRdReadbackJob(job(), historicalProfile, value).etag, value.jobEtag)
  assert.equal(rdReadbackJobSourceRevision(job()), runnerSourceRevision)
  assert.equal(classifyRdReadbackCapsule(value), 'rd_readback')
  assert.equal(classifyRdReadbackCapsule({ schemaVersion: 'jenfu.dev117.ai-pdm-release-intent.v2' }), 'release')
  assert.equal(classifyRdReadbackCapsule({ schemaVersion: 'jenfu.dev117.ai-pdm-release-intent.v2', appliedMigrationContinuation: {} }), 'applied_release')
  for (const mutate of [
    (row) => { row.workflowSourceRevision = 'f'.repeat(40) },
    (row) => { row.runnerSourceRevision = 'f'.repeat(40) },
    (row) => { row.migrationRunnerDigest = `${RD_LEDGER_READBACK_RUNNER_PREFIX}${'d'.repeat(64)}` },
    (row) => { row.probes.reverse() },
    (row) => { row.probes[0].migrationBundleRef.uri = row.probes[0].migrationBundleRef.uri.replace('source/migration-bundles', 'receipts') },
  ]) {
    const changed = structuredClone(value); mutate(changed)
    assert.throws(() => assertRdLedgerReadbackIntent(changed), /RD_READBACK_/u)
  }
})

test('RD03 readback Job contract rejects target, image, args, environment and template drift', () => {
  const value = intent()
  for (const mutate of [
    (row) => { row.name = row.name.replace('ai-pdm-prod-', 'other-') },
    (row) => { row.template.template.containers[0].image = `${RD_LEDGER_READBACK_RUNNER_PREFIX}${'d'.repeat(64)}` },
    (row) => { row.template.template.containers[0].args = ['--sql', 'SELECT 1'] },
    (row) => { row.template.template.containers[0].env.push({ name: 'PGOPTIONS', value: 'off' }) },
    (row) => { row.template.template.containers[0].env.find((entry) => entry.name === 'PDM_SOURCE_REVISION').value = workflowSourceRevision },
    (row) => { row.template.parallelism = 2 },
  ]) {
    const changed = structuredClone(job()); mutate(changed)
    assert.throws(() => assertRdReadbackJob(changed, historicalProfile, value), { code: 'RD_READBACK_JOB_MISMATCH' })
  }
})

test('RD04 sealed and source-enriched probes produce the same fixed read-only arguments with no caller-selected target, command or SQL', () => {
  const value = intent()
  for (const [index, probe] of value.probes.entries()) {
    const output = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/${value.releaseId}/${value.receiptSha256}/ledger-probe-${probe.ledgerCount}.json`
    const args = rdReadbackProbeArguments(value, probe, output)
    assert.deepEqual(args, ['--bundle-ref', probe.migrationBundleRef.uri, '--bundle-sha256', probe.migrationBundleRef.sha256, '--source-revision', runnerSourceRevision, '--output-ref', output])
    assert.deepEqual(rdReadbackProbeArguments(value, probes[index], output), args)
    assert.ok(!canonicalize(args).match(/--sql|--target|--job|--project|--region/iu))
  }
  assert.equal(RD_LEDGER_READBACK_PGOPTIONS, '-c default_transaction_read_only=on')
})

function native(value, probe, executionName) {
  const core = {
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: value.runnerSourceRevision,
    database: 'jenfu_prod', ledger: 'ai_pdm_core.schema_migrations', manifestSha256: probe.manifestSha256,
    baselineCount: 15, minimumLedgerCount: 0, ledgerBootstrap: { enabled: true, created: false }, ledgerCount: probe.ledgerCount,
    applied: 0, replayed: probe.ledgerCount, crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
    boundaryStatus: 'PASS', executionName, startedAt: '2026-10-16T02:30:00.000Z', completedAt: '2026-10-16T02:30:01.000Z', status: 'PASS',
  }
  return { ...core, receiptSha256: rdReadbackSha256(core) }
}

test('RD05 a native PASS proves exact ledger cardinality; 35 stops while 34/33 authorize the absent-085 branch', () => {
  const value = intent(), intentRef = ref('intent'), jobRef = ref('job')
  for (const [index, probe] of value.probes.entries()) {
    const executionName = `ai-pdm-prod-migration-runner-probe${probe.ledgerCount}`
    assert.equal(assertRdReadbackNativeReceipt(native(value, probe, executionName), { intent: value, probe, executionName }).ledgerCount, probe.ledgerCount)
    const attempts = value.probes.slice(0, index + 1).map((row) => ({ status: row.ledgerCount === probe.ledgerCount ? 'PASS' : 'FAILED', ledgerCount: row.ledgerCount, executionReadbackRef: ref(`execution-${row.ledgerCount}`), ...(row.ledgerCount === probe.ledgerCount ? { nativeReceiptRef: ref(`native-${row.ledgerCount}`), completedAt: '2026-10-16T02:31:00.000Z' } : {}) }))
    const result = buildRdReadbackResult({ intent: value, intentRef, jobReadbackRef: jobRef, attempts, successfulProbe: probe, nativeReceiptRef: ref(`native-${probe.ledgerCount}`), observedAt: '2026-10-16T02:31:00.000Z' })
    assert.equal(result.migration085State, probe.ledgerCount === 35 ? 'APPLIED' : 'NOT_APPLIED')
    assert.equal(result.decision, probe.ledgerCount === 35 ? 'STOP_085_APPLIED_VERIFY_CATALOG_CONSISTENCY' : 'AUTHORIZED_CONDITION_085_ABSENT')
    assert.equal(result.databaseMutationExpected, false)
  }
})

test('RD06 native receipt rejects applied writes, bootstrap, wrong ledger, manifest or execution', () => {
  const value = intent(), probe = value.probes[1], executionName = 'ai-pdm-prod-migration-runner-probe34'
  const good = native(value, probe, executionName)
  for (const mutate of [
    (row) => { row.applied = 1; row.replayed = 33 },
    (row) => { row.ledgerBootstrap.created = true },
    (row) => { row.ledgerCount = 35 },
    (row) => { row.manifestSha256 = 'f'.repeat(64) },
    (row) => { row.executionName = 'other' },
  ]) {
    const changed = structuredClone(good); mutate(changed)
    const core = { ...changed }; delete core.receiptSha256; changed.receiptSha256 = rdReadbackSha256(core)
    assert.throws(() => assertRdReadbackNativeReceipt(changed, { intent: value, probe, executionName }), { code: 'RD_READBACK_NATIVE_RECEIPT_INVALID' })
  }
})

test('RD06a immutable Job, execution and result receipts reject drift and retain canonical joins', () => {
  const value = intent()
  const intentRef = ref('rd-permission-ledger-readback-intent')
  const base = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/${value.releaseId}/${intentRef.sha256}`
  const jobReceipt = seal({
    schemaVersion: 'aipdm.dev122.rd-permission-ledger-job-readback.v2', ownerApplicationId: 'ai-pdm',
    releaseId: value.releaseId, workflowSourceRevision: value.workflowSourceRevision,
    runnerSourceRevision: value.runnerSourceRevision, readbackIntentRef: intentRef,
    projection: job(), observedAt: '2026-10-16T02:01:00.000Z', status: 'PASS',
  })
  assert.equal(assertRdReadbackJobReceipt(jobReceipt, { intent: value, intentRef, profile: historicalProfile }), jobReceipt)

  const receipt = (probe, pass) => seal({
    schemaVersion: 'aipdm.dev122.rd-permission-ledger-probe-execution.v2', ownerApplicationId: 'ai-pdm',
    releaseId: value.releaseId, workflowSourceRevision: value.workflowSourceRevision,
    runnerSourceRevision: value.runnerSourceRevision, readbackIntentRef: intentRef, ledgerCount: probe.ledgerCount,
    executionName: `projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner/executions/probe-${probe.ledgerCount}`,
    createTime: `2026-10-16T02:${pass ? '03' : '02'}:00.000Z`, startTime: `2026-10-16T02:${pass ? '03' : '02'}:01.000Z`,
    completionTime: `2026-10-16T02:${pass ? '03' : '02'}:30.000Z`, succeededCount: pass ? 1 : 0,
    failedCount: pass ? 0 : 1, completedState: pass ? 'CONDITION_SUCCEEDED' : 'CONDITION_FAILED',
    templateSha256: 'a'.repeat(64), observedAt: `2026-10-16T02:${pass ? '03' : '02'}:30.000Z`,
    status: pass ? 'PASS' : 'EXPECTED_READ_ONLY_PROBE_FAILURE',
  })
  const failedReceipt = receipt(value.probes[0], false), passReceipt = receipt(value.probes[1], true)
  assert.equal(assertRdReadbackExecutionReceipt(failedReceipt, { intent: value, intentRef, probe: value.probes[0] }), failedReceipt)
  assert.equal(assertRdReadbackExecutionReceipt(passReceipt, { intent: value, intentRef, probe: value.probes[1] }), passReceipt)

  const jobReadbackRef = { uri: `${base}/ledger-job-readback.json`, sha256: 'c'.repeat(64) }
  const nativeReceiptRef = { uri: `${base}/ledger-probe-34.json`, sha256: 'd'.repeat(64) }
  const attempts = [
    { status: 'FAILED', ledgerCount: 35, executionReadbackRef: { uri: `${base}/ledger-probe-35-execution-readback.json`, sha256: 'e'.repeat(64) } },
    { status: 'PASS', ledgerCount: 34, executionReadbackRef: { uri: `${base}/ledger-probe-34-execution-readback.json`, sha256: 'f'.repeat(64) }, nativeReceiptRef, completedAt: passReceipt.completionTime },
  ]
  const result = buildRdReadbackResult({ intent: value, intentRef, jobReadbackRef, attempts,
    successfulProbe: value.probes[1], nativeReceiptRef, observedAt: passReceipt.completionTime })
  const resultRef = { uri: `${base}/ledger-readback-result.json`, sha256: rdReadbackSha256(Buffer.from(`${canonicalize(result)}\n`, 'utf8')) }
  assert.equal(assertRdReadbackResult(result, { intent: value, intentRef }), result)
  assert.equal(assertRdReadbackResultRef(resultRef, result), resultRef)

  const badJob = structuredClone(jobReceipt)
  badJob.projection.template.template.containers[0].image = `${RD_LEDGER_READBACK_RUNNER_PREFIX}${'d'.repeat(64)}`
  delete badJob.receiptSha256; Object.assign(badJob, seal(badJob))
  assert.throws(() => assertRdReadbackJobReceipt(badJob, { intent: value, intentRef, profile: historicalProfile }), { code: 'RD_READBACK_JOB_RECEIPT_INVALID' })
  const badExecution = structuredClone(passReceipt)
  badExecution.failedCount = 1; delete badExecution.receiptSha256; Object.assign(badExecution, seal(badExecution))
  assert.throws(() => assertRdReadbackExecutionReceipt(badExecution, { intent: value, intentRef, probe: value.probes[1] }), { code: 'RD_READBACK_EXECUTION_RECEIPT_INVALID' })
  const badResult = structuredClone(result)
  badResult.migration085State = 'APPLIED'; delete badResult.receiptSha256; Object.assign(badResult, seal(badResult))
  assert.throws(() => assertRdReadbackResult(badResult, { intent: value, intentRef }), { code: 'RD_READBACK_RESULT_INVALID' })
  assert.throws(() => assertRdReadbackResultRef({ ...resultRef, uri: resultRef.uri.replace('ledger-readback-result', 'alias') }, result), { code: 'RD_READBACK_RESULT_REF_INVALID' })
})

test('RD07 readback stays read-only while the same protected workflow confines service stages to applied continuation', () => {
  assert.equal(typeof rdLedgerReadbackMain, 'function')
  const source = fs.readFileSync(new URL('./dev122-rd-permission-ledger-readback.mjs', import.meta.url), 'utf8')
  const workflow = fs.readFileSync(new URL('../.github/workflows/deploy-ai-pdm-principal-migrations-production.yml', import.meta.url), 'utf8')
  assert.equal(source.split('RD_LEDGER_READBACK_CONSTANTS.jobName}:run').length - 1, 1)
  assert.match(source, /if \(!matches\.length && priorSubmission\) fail\('RD_READBACK_SUBMISSION_OUTCOME_UNKNOWN'\)/u)
  assert.match(source, /if \(error\?\.code !== 'OUTCOME_UNKNOWN'\) throw error/u)
  assert.match(source, /inventory = await listExecutions\(transport\)[\s\S]*matches = inventory\.filter\(match\)/u)
  assert.doesNotMatch(source, /createCandidate|configureEntrypoint|setTraffic|activatePrincipalOnly|restoreEntrypoint|worker|scheduler|secretmanager|iam\.googleapis/iu)
  assert.deepEqual([...workflow.matchAll(/--stage (prepare|build|migrate|candidate|entrypoint|verify|decision|activate|canonical|finalize|rollback) --capsule-ref/gmu)].map((row) => row[1]),
    ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize', 'rollback'])
  assert.match(workflow, /name: Execute RD ledger readback\r?\n        if: \$\{\{ steps\.classify\.outputs\.kind == 'rd_readback' \}\}/u)
  for (const stage of ['candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']) {
    assert.match(workflow, new RegExp(`name: Execute ${stage}\\r?\\n        if: \\$\\{\\{ steps\\.classify\\.outputs\\.kind == 'applied_release' && steps\\.migrate\\.outputs\\.migration_disposition == 'HISTORICAL_EVIDENCE_REUSED' && steps\\.migrate\\.outputs\\.schema_stage_only != 'true' \\}\\}`, 'u'))
  }
  assert.match(workflow, /name: Recover applied-continuation release failure\r?\n        if: \$\{\{ failure\(\) && steps\.classify\.outputs\.kind == 'applied_release'/u)
  assert.equal((workflow.match(/releaseCapsuleRef:/gu) ?? []).length, 1)
  assert.doesNotMatch(workflow, /--stage publish|--release-id|--deadline-at/iu)
})

test('RD08 accepts a workflow-file commit that is an ancestor of exact protected-main source', () => {
  const head = 'a'.repeat(40), parent = 'b'.repeat(40), tree = 'c'.repeat(40)
  const workflowRef = 'jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/main'
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'jedchang0308-jenfu/AI-PDM', GITHUB_SHA: head, GITHUB_WORKFLOW_SHA: parent, GITHUB_WORKFLOW_REF: workflowRef, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch' }
  const gitRunner = (args) => args.join(' ') === 'rev-parse HEAD' ? head : args.join(' ') === 'rev-parse HEAD^{tree}' ? tree : ''
  const ancestorRunner = (workflowSha, sourceSha) => workflowSha === parent && sourceSha === head
  assert.equal(assertDev122GitSourceAuthority({ environment, sourceRevision: head, sourceTree: tree, workflowRef, root: '.', code: 'TEST_SOURCE_AUTHORITY', gitRunner, ancestorRunner }), true)
  assert.throws(() => assertDev122GitSourceAuthority({ environment: { ...environment, GITHUB_WORKFLOW_SHA: 'f'.repeat(40) }, sourceRevision: head, sourceTree: tree, workflowRef, root: '.', code: 'TEST_SOURCE_AUTHORITY', gitRunner, ancestorRunner }), { code: 'TEST_SOURCE_AUTHORITY' })
})

test('RD09 permits only production-slice evidence residue after the gate', () => {
  const head = 'a'.repeat(40), parent = 'b'.repeat(40), tree = 'c'.repeat(40)
  const workflowRef = 'jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/main'
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'jedchang0308-jenfu/AI-PDM', GITHUB_SHA: head, GITHUB_WORKFLOW_SHA: parent, GITHUB_WORKFLOW_REF: workflowRef, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch' }
  const status = '?? output/qa/release-efficiency/checkpoints/run.json'
  const gitRunner = (args) => args.join(' ') === 'rev-parse HEAD' ? head : args.join(' ') === 'rev-parse HEAD^{tree}' ? tree : args[0] === 'status' ? status : ''
  const ancestorRunner = (workflowSha, sourceSha) => workflowSha === parent && sourceSha === head
  assert.equal(assertDev122GitSourceAuthority({ environment, sourceRevision: head, sourceTree: tree, workflowRef, root: '.', code: 'TEST_SOURCE_AUTHORITY', gitRunner, ancestorRunner }), true)
  assert.throws(() => assertDev122GitSourceAuthority({ environment, sourceRevision: head, sourceTree: tree, workflowRef, root: '.', code: 'TEST_SOURCE_AUTHORITY', gitRunner: (args) => args[0] === 'status' ? '?? scripts/tampered.mjs' : gitRunner(args), ancestorRunner }), { code: 'TEST_SOURCE_AUTHORITY' })
})

test('RD10 production-shaped source binding keeps exact workflow source separate from the installed runner source', () => {
  const value = intent()
  const paths = rdReadbackCompatibilityPaths(historicalProfile)
  assert.equal(paths.length, 41)
  assert.ok(paths.includes('db/postgres/085_dev121_principal_role_catalog_v7.sql'))
  assert.ok(paths.includes('infra/google-cloud/dev-117-production-release/migration-runner.Dockerfile'))

  const seen = []
  const compatible = assertRdReadbackSourceCompatibility({
    profile: historicalProfile,
    root: '.',
    workflowSourceRevision,
    runnerSourceRevision,
    ancestorRunner: (ancestor, descendant) => { seen.push(['ancestor', ancestor, descendant]); return ancestor === runnerSourceRevision && descendant === workflowSourceRevision },
    compatibilityRunner: (ancestor, descendant, inputPaths) => { seen.push(['inputs', ancestor, descendant, inputPaths]); return canonicalize(inputPaths) === canonicalize(paths) },
  })
  assert.deepEqual({ workflowSourceRevision: compatible.workflowSourceRevision, runnerSourceRevision: compatible.runnerSourceRevision }, { workflowSourceRevision, runnerSourceRevision })
  assert.equal(seen.length, 2)

  const workflowRef = 'jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/main'
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'jedchang0308-jenfu/AI-PDM', GITHUB_SHA: workflowSourceRevision, GITHUB_WORKFLOW_SHA: 'e'.repeat(40), GITHUB_WORKFLOW_REF: workflowRef, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch' }
  const gitRunner = (args) => args.join(' ') === 'rev-parse HEAD' ? workflowSourceRevision : args.join(' ') === 'rev-parse HEAD^{tree}' ? value.workflowSourceTree : ''
  const bound = assertRdReadbackGitHubContext(value, environment, '.', historicalProfile, {
    gitRunner,
    workflowAncestorRunner: () => true,
    runnerAncestorRunner: (ancestor, descendant) => ancestor === runnerSourceRevision && descendant === workflowSourceRevision,
    compatibilityRunner: () => true,
  })
  assert.equal(bound.runnerSourceRevision, runnerSourceRevision)

  for (const mutation of [
    { runnerAncestorRunner: () => false, compatibilityRunner: () => true },
    { runnerAncestorRunner: () => true, compatibilityRunner: () => false },
  ]) {
    assert.throws(() => assertRdReadbackGitHubContext(value, environment, '.', historicalProfile, { gitRunner, workflowAncestorRunner: () => true, ...mutation }), { code: 'RD_READBACK_SOURCE_AUTHORITY_MISMATCH' })
  }
})

test('RD11 publish entrypoint builds the immutable probe capsule from the installed Job source', async () => {
  const saved = new Map()
  const transport = {
    request: async (url) => {
      assert.equal(url, 'https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner')
      return job()
    },
    putBytes: async (uri, bytes) => ({ ref: { uri, sha256: rdReadbackSha256(bytes) } }),
    putJson: async (uri, value) => {
      saved.set(uri, value)
      return { ref: { uri, sha256: rdReadbackSha256(Buffer.from(`${canonicalize(value)}\n`, 'utf8')) } }
    },
  }
  const releaseId = 'DEV122-RD-READBACK-PUBLISH-TEST'
  const deadlineAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const compatibilityCalls = []
  const result = await runRdLedgerReadbackMain({
    argv: ['--stage', 'publish', '--release-id', releaseId, '--deadline-at', deadlineAt],
    environment: { GOOGLE_OAUTH_ACCESS_TOKEN: 'test-only' },
    transport,
    publishOptions: {
      authorityReader: () => ({ sourceRevision: workflowSourceRevision, sourceTree: 'c'.repeat(40), branch: 'main', remoteRevision: workflowSourceRevision, clean: true }),
      identityReader: async () => Buffer.from('workflow-source-identity', 'utf8'),
      configurationReader: async () => ({ profile: historicalProfile, n1c, profileSha256: rdReadbackProfileSha256(historicalProfile) }),
      compatibilityVerifier: (input) => {
        compatibilityCalls.push(input)
        assert.equal(input.workflowSourceRevision, workflowSourceRevision)
        assert.equal(input.runnerSourceRevision, runnerSourceRevision)
        return { workflowSourceRevision, runnerSourceRevision }
      },
    },
  })
  assert.equal(result.workflowSourceRevision, workflowSourceRevision)
  assert.equal(result.runnerSourceRevision, runnerSourceRevision)
  assert.equal(compatibilityCalls.length, 1)
  const published = saved.get(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${releaseId}/rd-permission-ledger-readback-intent.json`)
  assert.equal(published.workflowSourceRevision, workflowSourceRevision)
  assert.equal(published.runnerSourceRevision, runnerSourceRevision)
  assert.deepEqual(published.probes.map((probe) => probe.migrationBundleRef.uri.split('/').at(-2)), [runnerSourceRevision, runnerSourceRevision, runnerSourceRevision])
})

test('RD11 default current38 configuration rejects the closed35 probe before publication or Job submission', async () => {
  let requests = 0
  let puts = 0
  const transport = {
    request: async (url) => {
      requests++
      assert.equal(url, 'https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner')
      return job()
    },
    putBytes: async () => {
      puts++
      throw new Error('UNEXPECTED_PUBLICATION')
    },
    putJson: async () => {
      puts++
      throw new Error('UNEXPECTED_PUBLICATION')
    },
  }
  const deadlineAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  await assert.rejects(runRdLedgerReadbackMain({
    argv: ['--stage', 'publish', '--release-id', 'DEV122-RD-READBACK-DEFAULT38-TEST', '--deadline-at', deadlineAt],
    environment: { GOOGLE_OAUTH_ACCESS_TOKEN: 'test-only' },
    transport,
    publishOptions: {
      authorityReader: () => ({ sourceRevision: workflowSourceRevision, sourceTree: 'c'.repeat(40), branch: 'main', remoteRevision: workflowSourceRevision, clean: true }),
      identityReader: async () => Buffer.from('workflow-source-identity', 'utf8'),
      compatibilityVerifier: () => ({ workflowSourceRevision, runnerSourceRevision }),
    },
  }), { code: 'RD_READBACK_FULL_BUNDLE_INVALID' })
  assert.deepEqual({ requests, puts }, { requests: 1, puts: 0 })
})
