import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

import { canonicalize, createMigrationBundle } from './dev012-production-migration-runner.mjs'

export const RD_LEDGER_READBACK_SCHEMA = 'aipdm.dev122.rd-permission-ledger-readback-intent.v1'
export const RD_LEDGER_READBACK_RESULT_SCHEMA = 'aipdm.dev122.rd-permission-ledger-readback-result.v1'
export const RD_LEDGER_READBACK_PGOPTIONS = '-c default_transaction_read_only=on'
export const RD_LEDGER_READBACK_RUNNER = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:c4f88763e568554bb2c35b5622f6b5d3f82506ccc20f2b849ce06e0d70aa2d4a'

const BUCKET = 'jenfu-platform-prod-aipdm-release'
const JOB_NAME = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner'
const WORKFLOW_REF = 'jedchang0308-jenfu/AI-PDM/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/main'
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u
const TARGET = Object.freeze({ ownerApplicationId: 'ai-pdm', ledger: 'ai_pdm_core.schema_migrations', baselineCount: 15 })
const INTENT_KEYS = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceTree', 'sourceIdentitySha256', 'profileSha256', 'migrationRunnerDigest', 'jobEtag', 'jobTemplateSha256', 'probes', 'observedAt', 'deadlineAt', 'status', 'receiptSha256']
const REF_KEYS = ['uri', 'sha256']

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

export function rdReadbackSha256(value) {
  return createHash('sha256').update(Buffer.isBuffer(value) ? value : canonicalize(value)).digest('hex')
}

export function rdReadbackProfileSha256(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) fail('RD_READBACK_PROFILE_INVALID')
  return rdReadbackSha256(profile)
}

function exact(value, keys, code) {
  if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize([...keys].sort())) fail(code)
}

function exactRef(value, prefix) {
  exact(value, REF_KEYS, 'RD_READBACK_REF_INVALID')
  if (!H64.test(value.sha256 ?? '') || !new RegExp(`^gs://${BUCKET}/${prefix}/[A-Za-z0-9._/-]+\\.json$`, 'u').test(value.uri ?? '')) fail('RD_READBACK_REF_INVALID')
  return value
}

function bundleRef(bundle) {
  return {
    uri: `gs://${BUCKET}/source/migration-bundles/${bundle.bundle.sourceRevision}/${bundle.bundle.manifestSha256}.json`,
    sha256: bundle.bundleSha256,
  }
}

export function buildRdLedgerProbeBundles(full) {
  if (!full?.bundle || !Buffer.isBuffer(full.bytes) || full.bundleSha256 !== rdReadbackSha256(full.bytes)) fail('RD_READBACK_FULL_BUNDLE_INVALID')
  if (full.bundle.ownerApplicationId !== 'ai-pdm' || full.bundle.sourceRevision == null || full.bundle.entries?.length !== 35 || full.bundle.ledger !== TARGET.ledger || full.bundle.baselineCount !== TARGET.baselineCount || Object.hasOwn(full.bundle, 'unlinkedProfileCleanupRef')) fail('RD_READBACK_FULL_BUNDLE_INVALID')
  const tails = [
    [33, 'ai-pdm-083', 'db/postgres/083_dev121_authorized_first_login_account.sql'],
    [34, 'ai-pdm-084', 'db/postgres/084_dev121_unlinked_legacy_profile_cleanup.sql'],
    [35, 'ai-pdm-085', 'db/postgres/085_dev121_principal_role_catalog_v7.sql'],
  ]
  for (const [count, version, path] of tails) {
    const entry = full.bundle.entries[count - 1]
    if (entry?.order !== count || entry.version !== version || entry.path !== path) fail('RD_READBACK_PROFILE_DRIFT', String(count))
  }
  const values = new Map([[35, full]])
  for (const count of [34, 33]) values.set(count, createMigrationBundle({ target: TARGET, sourceRevision: full.bundle.sourceRevision, entries: structuredClone(full.bundle.entries.slice(0, count)) }))
  return [35, 34, 33].map((ledgerCount) => {
    const value = values.get(ledgerCount)
    return { ledgerCount, terminalVersion: value.bundle.entries.at(-1).version, manifestSha256: value.bundle.manifestSha256, migrationBundleRef: bundleRef(value), bundle: value.bundle, bytes: value.bytes }
  })
}

export function rdReadbackJobEnvironment(profile) {
  const connection = 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'
  return {
    OWNER_APPLICATION_ID: 'ai-pdm',
    RELEASE_BUCKET: BUCKET,
    GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod',
    GOOGLE_CLOUD_REGION: 'asia-east1',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: connection,
    POSTGRES_DATABASE: 'jenfu_prod',
    POSTGRES_IAM_LOGIN: profile.migrations.serviceAccount.replace('.gserviceaccount.com', ''),
    POSTGRES_SOCKET: `/cloudsql/${connection}`,
  }
}

export function rdReadbackJobProjection(job) {
  return { name: job?.name, etag: job?.etag, template: job?.template }
}

export function assertRdReadbackJob(job, profile, intent = null) {
  const task = job?.template?.template
  const container = task?.containers?.[0]
  const expectedEnvironment = rdReadbackJobEnvironment(profile)
  if (job?.name !== JOB_NAME || typeof job.etag !== 'string' || !job.etag || job.template?.taskCount !== 1 || job.template?.parallelism !== 1 || task?.serviceAccount !== profile.migrations.serviceAccount || task?.maxRetries !== 0 || task?.timeout !== '1800s' || task?.containers?.length !== 1 || container?.name !== 'migration' || container?.image !== RD_LEDGER_READBACK_RUNNER || Object.hasOwn(container ?? {}, 'command') || canonicalize(container?.args) !== canonicalize(['--bundle-ref-required'])) fail('RD_READBACK_JOB_MISMATCH')
  if (!Array.isArray(container.env) || container.env.length !== 8 || new Set(container.env.map((row) => row.name)).size !== 8 || canonicalize(Object.fromEntries(container.env.map((row) => [row.name, row.value]))) !== canonicalize(expectedEnvironment)) fail('RD_READBACK_JOB_MISMATCH')
  if (canonicalize(task.volumes) !== canonicalize([{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }]) || canonicalize(container.volumeMounts) !== canonicalize([{ name: 'cloudsql', mountPath: '/cloudsql' }])) fail('RD_READBACK_JOB_MISMATCH')
  if (intent && (job.etag !== intent.jobEtag || rdReadbackSha256(rdReadbackJobProjection(job)) !== intent.jobTemplateSha256 || container.image !== intent.migrationRunnerDigest)) fail('RD_READBACK_JOB_MISMATCH')
  return job
}

export function buildRdLedgerReadbackIntent({ releaseId, sourceRevision, sourceTree, sourceIdentitySha256, profileSha256, probes, job, observedAt, deadlineAt }) {
  const value = {
    schemaVersion: RD_LEDGER_READBACK_SCHEMA,
    ownerApplicationId: 'ai-pdm',
    releaseId,
    sourceRevision,
    sourceTree,
    sourceIdentitySha256,
    profileSha256,
    migrationRunnerDigest: RD_LEDGER_READBACK_RUNNER,
    jobEtag: job.etag,
    jobTemplateSha256: rdReadbackSha256(rdReadbackJobProjection(job)),
    probes: probes.map(({ ledgerCount, terminalVersion, manifestSha256, migrationBundleRef }) => ({ ledgerCount, terminalVersion, manifestSha256, migrationBundleRef })),
    observedAt,
    deadlineAt,
    status: 'READY_FOR_READBACK',
  }
  value.receiptSha256 = rdReadbackSha256(value)
  return assertRdLedgerReadbackIntent(value)
}

export function assertRdLedgerReadbackIntent(value, { profileSha256 = null, probes = null } = {}) {
  exact(value, INTENT_KEYS, 'RD_READBACK_INTENT_INVALID')
  const core = { ...value }; delete core.receiptSha256
  if (value.schemaVersion !== RD_LEDGER_READBACK_SCHEMA || value.ownerApplicationId !== 'ai-pdm' || !RELEASE_ID.test(value.releaseId ?? '') || !H40.test(value.sourceRevision ?? '') || !H40.test(value.sourceTree ?? '') || !H64.test(value.sourceIdentitySha256 ?? '') || !H64.test(value.profileSha256 ?? '') || value.migrationRunnerDigest !== RD_LEDGER_READBACK_RUNNER || typeof value.jobEtag !== 'string' || !value.jobEtag || !H64.test(value.jobTemplateSha256 ?? '') || value.status !== 'READY_FOR_READBACK' || !Number.isFinite(Date.parse(value.observedAt)) || !Number.isFinite(Date.parse(value.deadlineAt)) || Date.parse(value.observedAt) >= Date.parse(value.deadlineAt) || value.receiptSha256 !== rdReadbackSha256(core)) fail('RD_READBACK_INTENT_INVALID')
  if (profileSha256 && value.profileSha256 !== profileSha256) fail('RD_READBACK_PROFILE_DRIFT')
  if (!Array.isArray(value.probes) || canonicalize(value.probes.map((row) => row.ledgerCount)) !== canonicalize([35, 34, 33])) fail('RD_READBACK_PROBE_ORDER_INVALID')
  const terminal = new Map([[35, 'ai-pdm-085'], [34, 'ai-pdm-084'], [33, 'ai-pdm-083']])
  for (const row of value.probes) {
    exact(row, ['ledgerCount', 'terminalVersion', 'manifestSha256', 'migrationBundleRef'], 'RD_READBACK_PROBE_INVALID')
    if (row.terminalVersion !== terminal.get(row.ledgerCount) || !H64.test(row.manifestSha256 ?? '')) fail('RD_READBACK_PROBE_INVALID')
    exactRef(row.migrationBundleRef, 'source/migration-bundles')
    if (row.migrationBundleRef.uri !== `gs://${BUCKET}/source/migration-bundles/${value.sourceRevision}/${row.manifestSha256}.json`) fail('RD_READBACK_PROBE_INVALID')
  }
  if (probes && canonicalize(value.probes) !== canonicalize(probes.map(({ ledgerCount, terminalVersion, manifestSha256, migrationBundleRef }) => ({ ledgerCount, terminalVersion, manifestSha256, migrationBundleRef })))) fail('RD_READBACK_PROFILE_DRIFT')
  return value
}

export function rdReadbackIntentUri(releaseId) {
  if (!RELEASE_ID.test(releaseId ?? '')) fail('RD_READBACK_RELEASE_ID_INVALID')
  return `gs://${BUCKET}/receipts/releases/${releaseId}/rd-permission-ledger-readback-intent.json`
}

export function rdReadbackProbeArguments(intent, probe, outputUri) {
  assertRdLedgerReadbackIntent(intent)
  if (!intent.probes.some((row) => canonicalize(row) === canonicalize(probe)) || !new RegExp(`^gs://${BUCKET}/receipts/releases/${intent.releaseId}/[a-f0-9]{64}/ledger-probe-${probe.ledgerCount}\\.json$`, 'u').test(outputUri ?? '')) fail('RD_READBACK_PROBE_INVALID')
  return ['--bundle-ref', probe.migrationBundleRef.uri, '--bundle-sha256', probe.migrationBundleRef.sha256, '--source-revision', intent.sourceRevision, '--output-ref', outputUri]
}

export function assertRdReadbackGitHubContext(intent, environment, root) {
  assertRdLedgerReadbackIntent(intent)
  if (environment.GITHUB_REPOSITORY !== 'jedchang0308-jenfu/AI-PDM' || environment.GITHUB_SHA !== intent.sourceRevision || environment.GITHUB_WORKFLOW_SHA !== intent.sourceRevision || environment.GITHUB_WORKFLOW_REF !== WORKFLOW_REF || environment.GITHUB_REF !== 'refs/heads/main' || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch') fail('RD_READBACK_SOURCE_AUTHORITY_MISMATCH')
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
    if (result.error || result.status !== 0) fail('RD_READBACK_GIT_INSPECTION_FAILED')
    return result.stdout.trim()
  }
  if (git(['rev-parse', 'HEAD']) !== intent.sourceRevision || git(['rev-parse', 'HEAD^{tree}']) !== intent.sourceTree || git(['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('RD_READBACK_SOURCE_AUTHORITY_MISMATCH')
  return true
}

export function classifyRdReadbackCapsule(value) {
  if (value?.schemaVersion === RD_LEDGER_READBACK_SCHEMA) { assertRdLedgerReadbackIntent(value); return 'rd_readback' }
  if (value?.schemaVersion === 'jenfu.dev117.ai-pdm-release-intent.v2') return 'release'
  fail('RD_READBACK_CAPSULE_TYPE_INVALID')
}

export function assertRdReadbackNativeReceipt(value, { intent, probe, executionName }) {
  exact(value, ['schemaVersion', 'ownerApplicationId', 'sourceRevision', 'database', 'ledger', 'manifestSha256', 'baselineCount', 'minimumLedgerCount', 'ledgerBootstrap', 'ledgerCount', 'applied', 'replayed', 'crossDatabaseDenials', 'boundaryStatus', 'executionName', 'startedAt', 'completedAt', 'status', 'receiptSha256'], 'RD_READBACK_NATIVE_RECEIPT_INVALID')
  const core = { ...value }; delete core.receiptSha256
  if (value?.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceRevision !== intent.sourceRevision || value.database !== 'jenfu_prod' || value.ledger !== 'ai_pdm_core.schema_migrations' || value.manifestSha256 !== probe.manifestSha256 || value.baselineCount !== 15 || value.minimumLedgerCount !== 0 || canonicalize(value.ledgerBootstrap) !== canonicalize({ enabled: true, created: false }) || value.ledgerCount !== probe.ledgerCount || value.applied !== 0 || value.replayed !== probe.ledgerCount || value.boundaryStatus !== 'PASS' || value.status !== 'PASS' || value.executionName !== executionName || value.receiptSha256 !== rdReadbackSha256(core)) fail('RD_READBACK_NATIVE_RECEIPT_INVALID')
  if (canonicalize(value.crossDatabaseDenials) !== canonicalize([{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }]) || !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.completedAt)) || Date.parse(value.startedAt) > Date.parse(value.completedAt)) fail('RD_READBACK_NATIVE_RECEIPT_INVALID')
  return value
}

export function buildRdReadbackResult({ intent, intentRef, jobReadbackRef, attempts, successfulProbe, nativeReceiptRef, observedAt }) {
  exactRef(intentRef, 'receipts')
  exactRef(jobReadbackRef, 'receipts')
  if (!Array.isArray(attempts) || attempts.length < 1 || attempts.length > 3 || !successfulProbe || !intent.probes.some((row) => canonicalize(row) === canonicalize(successfulProbe)) || !Number.isFinite(Date.parse(observedAt))) fail('RD_READBACK_RESULT_INVALID')
  const expectedCounts = intent.probes.slice(0, attempts.length).map((row) => row.ledgerCount)
  if (canonicalize(attempts.map((row) => row.ledgerCount)) !== canonicalize(expectedCounts) || attempts.at(-1)?.status !== 'PASS' || attempts.slice(0, -1).some((row) => row.status !== 'FAILED')) fail('RD_READBACK_RESULT_INVALID')
  for (const [index, attempt] of attempts.entries()) {
    const keys = ['status', 'ledgerCount', 'executionReadbackRef', ...(index === attempts.length - 1 ? ['nativeReceiptRef', 'completedAt'] : [])]
    exact(attempt, keys, 'RD_READBACK_RESULT_INVALID')
    exactRef(attempt.executionReadbackRef, 'receipts')
    if (index === attempts.length - 1) {
      exactRef(attempt.nativeReceiptRef, 'receipts')
      if (!Number.isFinite(Date.parse(attempt.completedAt)) || canonicalize(attempt.nativeReceiptRef) !== canonicalize(nativeReceiptRef) || attempt.completedAt !== observedAt) fail('RD_READBACK_RESULT_INVALID')
    }
  }
  exactRef(nativeReceiptRef, 'receipts')
  const value = {
    schemaVersion: RD_LEDGER_READBACK_RESULT_SCHEMA,
    ownerApplicationId: 'ai-pdm',
    releaseId: intent.releaseId,
    sourceRevision: intent.sourceRevision,
    readbackIntentRef: intentRef,
    jobReadbackRef,
    migrationRunnerDigest: intent.migrationRunnerDigest,
    pgOptions: RD_LEDGER_READBACK_PGOPTIONS,
    ledgerCount: successfulProbe.ledgerCount,
    migration084State: successfulProbe.ledgerCount >= 34 ? 'APPLIED' : 'NOT_APPLIED',
    migration085State: successfulProbe.ledgerCount >= 35 ? 'APPLIED' : 'NOT_APPLIED',
    nativeReceiptRef,
    attempts,
    databaseMutationExpected: false,
    decision: successfulProbe.ledgerCount >= 35 ? 'STOP_085_APPLIED_VERIFY_CATALOG_CONSISTENCY' : 'AUTHORIZED_CONDITION_085_ABSENT',
    observedAt,
    status: 'PASS',
  }
  value.receiptSha256 = rdReadbackSha256(value)
  return value
}

export const RD_LEDGER_READBACK_CONSTANTS = Object.freeze({ bucket: BUCKET, jobName: JOB_NAME, workflowRef: WORKFLOW_REF })
