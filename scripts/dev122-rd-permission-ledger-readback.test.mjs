import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { main as rdLedgerReadbackMain } from './dev122-rd-permission-ledger-readback.mjs'
import { buildDev117MigrationBundle, buildDev117MigrationPackage, assertDev117V3Profile } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { canonicalize } from './lib/dev012-production-migration-runner.mjs'
import {
  RD_LEDGER_READBACK_PGOPTIONS,
  RD_LEDGER_READBACK_RUNNER_PREFIX,
  assertRdLedgerReadbackIntent,
  assertRdReadbackJob,
  assertRdReadbackNativeReceipt,
  buildRdLedgerProbeBundles,
  buildRdLedgerReadbackIntent,
  buildRdReadbackResult,
  classifyRdReadbackCapsule,
  rdReadbackJobEnvironment,
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

const sourceRevision = 'a'.repeat(40)
const RUNNER_DIGEST = `${RD_LEDGER_READBACK_RUNNER_PREFIX}${'c'.repeat(64)}`
const full = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), sourceRevision)
const probes = buildRdLedgerProbeBundles(full)
const ref = (name) => ({ uri: `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-RD-READBACK-TEST/${name}.json`, sha256: 'b'.repeat(64) })

function job() {
  return {
    name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner',
    etag: 'etag-generation-23',
    template: {
      taskCount: 1,
      parallelism: 1,
      template: {
        serviceAccount: profile.migrations.serviceAccount,
        maxRetries: 0,
        timeout: '1800s',
        volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }],
        containers: [{ name: 'migration', image: RUNNER_DIGEST, args: ['--bundle-ref-required'], env: Object.entries(rdReadbackJobEnvironment(profile)).map(([name, value]) => ({ name, value })), volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }] }],
      },
    },
  }
}

function intent() {
  return buildRdLedgerReadbackIntent({
    releaseId: 'DEV122-RD-READBACK-TEST',
    sourceRevision,
    sourceTree: 'c'.repeat(40),
    sourceIdentitySha256: 'd'.repeat(64),
    profileSha256: 'e'.repeat(64),
    probes,
    job: job(),
    observedAt: '2026-10-16T02:00:00.000Z',
    deadlineAt: '2026-10-16T04:00:00.000Z',
  })
}

test('RD01 derives sealed current-main ledger probes in descending 35/34/33 order', () => {
  assert.deepEqual(probes.map((row) => [row.ledgerCount, row.terminalVersion, row.bundle.entries.at(-1).path]), [
    [35, 'ai-pdm-085', 'db/postgres/085_dev121_principal_role_catalog_v7.sql'],
    [34, 'ai-pdm-084', 'db/postgres/084_dev121_unlinked_legacy_profile_cleanup.sql'],
    [33, 'ai-pdm-083', 'db/postgres/083_dev121_authorized_first_login_account.sql'],
  ])
  for (const probe of probes) {
    assert.equal(probe.bundle.entries.length, probe.ledgerCount)
    assert.equal(probe.bundle.sourceRevision, sourceRevision)
    assert.equal(probe.migrationBundleRef.uri, `gs://jenfu-platform-prod-aipdm-release/source/migration-bundles/${sourceRevision}/${probe.manifestSha256}.json`)
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
  assert.equal(assertRdReadbackJob(job(), profile, value).etag, value.jobEtag)
  assert.equal(classifyRdReadbackCapsule(value), 'rd_readback')
  assert.equal(classifyRdReadbackCapsule({ schemaVersion: 'jenfu.dev117.ai-pdm-release-intent.v2' }), 'release')
  for (const mutate of [
    (row) => { row.sourceRevision = 'f'.repeat(40) },
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
    (row) => { row.template.parallelism = 2 },
  ]) {
    const changed = structuredClone(job()); mutate(changed)
    assert.throws(() => assertRdReadbackJob(changed, profile, value), { code: 'RD_READBACK_JOB_MISMATCH' })
  }
})

test('RD04 sealed and source-enriched probes produce the same fixed read-only arguments with no caller-selected target, command or SQL', () => {
  const value = intent()
  for (const [index, probe] of value.probes.entries()) {
    const output = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/${value.releaseId}/${value.receiptSha256}/ledger-probe-${probe.ledgerCount}.json`
    const args = rdReadbackProbeArguments(value, probe, output)
    assert.deepEqual(args, ['--bundle-ref', probe.migrationBundleRef.uri, '--bundle-sha256', probe.migrationBundleRef.sha256, '--source-revision', sourceRevision, '--output-ref', output])
    assert.deepEqual(rdReadbackProbeArguments(value, probes[index], output), args)
    assert.ok(!canonicalize(args).match(/--sql|--target|--job|--project|--region/iu))
  }
  assert.equal(RD_LEDGER_READBACK_PGOPTIONS, '-c default_transaction_read_only=on')
})

function native(value, probe, executionName) {
  const core = {
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: value.sourceRevision,
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

test('RD07 owner path reads back unknown submissions and cannot reach service, traffic, IAM, Secret, worker or Scheduler mutations', () => {
  assert.equal(typeof rdLedgerReadbackMain, 'function')
  const source = fs.readFileSync(new URL('./dev122-rd-permission-ledger-readback.mjs', import.meta.url), 'utf8')
  const workflow = fs.readFileSync(new URL('../.github/workflows/deploy-ai-pdm-principal-migrations-production.yml', import.meta.url), 'utf8')
  assert.equal(source.split('RD_LEDGER_READBACK_CONSTANTS.jobName}:run').length - 1, 1)
  assert.match(source, /if \(!matches\.length && priorSubmission\) fail\('RD_READBACK_SUBMISSION_OUTCOME_UNKNOWN'\)/u)
  assert.match(source, /if \(error\?\.code !== 'OUTCOME_UNKNOWN'\) throw error/u)
  assert.match(source, /inventory = await listExecutions\(transport\)[\s\S]*matches = inventory\.filter\(match\)/u)
  assert.doesNotMatch(source, /createCandidate|configureEntrypoint|setTraffic|activatePrincipalOnly|restoreEntrypoint|worker|scheduler|secretmanager|iam\.googleapis/iu)
  assert.deepEqual([...workflow.matchAll(/^      - name: Execute (prepare|build|migrate|RD ledger readback)$/gmu)].map((row) => row[1]), ['prepare', 'build', 'migrate', 'RD ledger readback'])
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
