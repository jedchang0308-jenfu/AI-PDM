import { createHash } from 'node:crypto'
import { assertMigrationBundle, canonicalize, createMigrationBundle } from './dev012-production-migration-runner.mjs'

const H64 = /^[a-f0-9]{64}$/u
const H40 = /^[a-f0-9]{40}$/u
const BUCKET = 'jenfu-platform-prod-aipdm-release'
export const PROGRAM_ONLY_PGOPTIONS = '-c default_transaction_read_only=on'
export const PROGRAM_ONLY_DISPOSITION = 'READ_ONLY_BASELINE_VERIFIED'
export const PROGRAM_ONLY_PREFIX_COUNT = 33
const TARGET = Object.freeze({ ownerApplicationId: 'ai-pdm', ledger: 'ai_pdm_core.schema_migrations', baselineCount: 15 })
const DEFERRED = Object.freeze({ order: 34, version: 'ai-pdm-084', name: 'dev121_unlinked_legacy_profile_cleanup', path: 'db/postgres/084_dev121_unlinked_legacy_profile_cleanup.sql', sourceSha256: '6be6eb8cdc4ffb6f83883a17220066d4f91efd0f374b32cee0b50d299eb991e1', appliedSha256: '6be6eb8cdc4ffb6f83883a17220066d4f91efd0f374b32cee0b50d299eb991e1' })
const POLICY_KEYS = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'sourceSha256', 'sourceManifestSha256', 'effectiveManifestSha256', 'sourceMigrationBundleRef', 'effectiveMigrationBundleRef', 'orderedPrefixSha256', 'expectedLedgerCount', 'deferredMigration', 'migrationRunnerDigest', 'pgOptions', 'baselineIntentRef', 'retainedWorker']
const ASSOCIATION_KEYS = ['schemaVersion', 'ownerApplicationId', 'releaseId', 'sourceRevision', 'releaseCapsuleRef', 'deploymentCapsuleRef', 'policySha256', 'sourceMigrationBundleRef', 'effectiveMigrationBundleRef', 'nativeReceiptRef', 'submissionIntentRef', 'executionReadbackRef', 'jobReadbackRef', 'executionName', 'status', 'databaseDisposition', 'migrationJobSubmitted', 'migrationJobSubmissions', 'currentDatabaseReadPerformed', 'observedAt', 'deadlineAt', 'receiptSha256']
function fail(detail = '') { throw Object.assign(new Error(`PROGRAM_ONLY_BASELINE_INVALID${detail ? ':' + detail : ''}`), { code: 'PROGRAM_ONLY_BASELINE_INVALID' }) }
function same(a, b, detail) { if (canonicalize(a) !== canonicalize(b)) fail(detail) }
function exact(v, keys, detail) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(detail); same(Object.keys(v).sort(), [...keys].sort(), detail) }
export function programOnlyHash(value) { return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalize(value)).digest('hex') }
export function sealProgramOnlyEvidence(value) { const core = { ...value }; delete core.receiptSha256; return { ...core, receiptSha256: programOnlyHash(core) } }
function ref(value, prefix = 'receipts') {
  exact(value, ['uri', 'sha256'], 'ref')
  if (!H64.test(value.sha256 ?? '') || !value.uri?.startsWith(`gs://${BUCKET}/${prefix}/`) || !/^[A-Za-z0-9._/-]+\.json$/u.test(value.uri.slice(`gs://${BUCKET}/`.length)) || value.uri.split('/').some(part => part === '..' || part === '.')) fail('ref')
  return value
}
function assertProfile(profile) {
  if (profile.application?.id !== 'ai-pdm' || profile.target?.projectId !== 'jenfu-platform-prod' || profile.target?.region !== 'asia-east1' || profile.target?.serviceName !== 'ai-pdm-prod' || profile.artifact?.releaseBucket !== BUCKET || profile.migrations?.jobName !== 'ai-pdm-prod-migration-runner' || profile.migrations?.ledger !== TARGET.ledger || profile.migrations?.baselineCount !== 15 || profile.migrations?.entries?.length !== 34 || profile.productionData?.required === true) fail('profile')
  const last = profile.migrations.entries.at(-1)
  if (last.order !== DEFERRED.order || last.path !== DEFERRED.path || last.sha256 !== DEFERRED.sourceSha256) fail('deferred-profile')
}
function bundleRef(bundle, bytes) { return { uri: `gs://${BUCKET}/source/migration-bundles/${bundle.sourceRevision}/${bundle.manifestSha256}.json`, sha256: programOnlyHash(bytes) } }
export function deriveProgramOnlyBundles({ profile, full }) {
  assertProfile(profile)
  if (!full?.bundle || !Buffer.isBuffer(full.bytes) || full.bundleSha256 !== programOnlyHash(full.bytes)) fail('full-bytes')
  assertMigrationBundle(full.bundle, { target: TARGET, sourceRevision: full.bundle.sourceRevision, bundleSha256: full.bundleSha256, bytes: full.bytes })
  if (full.bundle.entries.length !== 34 || Object.hasOwn(full.bundle, 'unlinkedProfileCleanupRef')) fail('full-shape')
  for (let i = 0; i < 34; i += 1) {
    const entry = full.bundle.entries[i], authority = profile.migrations.entries[i]
    if (entry.order !== authority.order || entry.path !== authority.path || entry.sourceSha256 !== authority.sha256) fail('full-profile')
  }
  const { sqlBase64: ignored, ...last } = full.bundle.entries.at(-1)
  same(last, DEFERRED, 'deferred')
  const end = full.bundle.entries[32]
  if (end.version !== 'ai-pdm-083' || end.path !== 'db/postgres/083_dev121_authorized_first_login_account.sql' || end.sourceSha256 !== 'a99df76b8fc146a916930a05286433568aa432710d2a6eccc1c47f08ba780da9' || end.appliedSha256 !== '8f6ed9bafe7af906bcae7a94df59a07bbb98cab27402e75ea9162b85a3ec9b8a') fail('prefix-end')
  const effective = createMigrationBundle({ target: TARGET, sourceRevision: full.bundle.sourceRevision, entries: structuredClone(full.bundle.entries.slice(0, PROGRAM_ONLY_PREFIX_COUNT)) })
  return { full, effective, sourceMigrationBundleRef: bundleRef(full.bundle, full.bytes), effectiveMigrationBundleRef: bundleRef(effective.bundle, effective.bytes), orderedPrefixSha256: programOnlyHash(effective.bundle.entries) }
}
export function assertProgramOnlyPolicy(policy, { profile, intent = null, sourceLock = null, deployment = null, bundles = null } = {}) {
  assertProfile(profile); exact(policy, POLICY_KEYS, 'policy-keys')
  if (policy.schemaVersion !== 'aipdm.program-only-baseline-policy.v1' || policy.ownerApplicationId !== 'ai-pdm' || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(policy.releaseId ?? '') || !H40.test(policy.sourceRevision ?? '') || policy.expectedLedgerCount !== 33 || policy.pgOptions !== PROGRAM_ONLY_PGOPTIONS || !policy.migrationRunnerDigest?.startsWith(`${profile.artifact.migrationRunnerUri}@sha256:`) || !H64.test(policy.migrationRunnerDigest.split('@sha256:')[1] ?? '')) fail('policy')
  for (const field of ['sourceSha256', 'sourceManifestSha256', 'effectiveManifestSha256', 'orderedPrefixSha256']) if (!H64.test(policy[field] ?? '')) fail(field)
  same(policy.deferredMigration, DEFERRED, 'deferred')
  ref(policy.baselineIntentRef)
  for (const [field, manifest] of [['sourceMigrationBundleRef', policy.sourceManifestSha256], ['effectiveMigrationBundleRef', policy.effectiveManifestSha256]]) {
    ref(policy[field], 'source/migration-bundles')
    if (policy[field].uri !== `gs://${BUCKET}/source/migration-bundles/${policy.sourceRevision}/${manifest}.json`) fail('bundle-uri')
  }
  if (policy.sourceManifestSha256 === policy.effectiveManifestSha256) fail('manifest-separation')
  exact(policy.retainedWorker, ['descriptorRef', 'priorActivationRef', 'currentAssociationRef', 'readyResourceReadbackRef'], 'worker-keys')
  for (const value of Object.values(policy.retainedWorker)) ref(value, 'receipts/dev-122/openswx-worker')
  if (intent) {
    for (const field of ['releaseId', 'sourceRevision', 'sourceSha256']) same(policy[field], intent[field], 'intent')
    same(policy.sourceManifestSha256, intent.migrationManifestSha256, 'intent-manifest')
    same(policy.baselineIntentRef, intent.baselineIntentRef, 'intent-baseline')
    same(policy.retainedWorker.descriptorRef, intent.openswxWorkerRef, 'intent-worker')
    for (const field of ['unlinkedProfileCleanupRef', 'principalOnlyFenceRef', 'principalOnlyRecovery']) if (Object.hasOwn(intent, field)) fail('incompatible-intent')
  }
  if (sourceLock) {
    for (const field of ['releaseId', 'sourceRevision', 'sourceSha256']) same(policy[field], sourceLock[field], 'source-lock')
    same(policy.sourceManifestSha256, sourceLock.migrationManifestSha256, 'source-lock-manifest')
  }
  if (deployment) {
    same(policy, deployment.programOnlyBaseline, 'deployment-policy')
    same(policy.sourceRevision, deployment.sourceRevision, 'deployment-source')
    same(policy.effectiveMigrationBundleRef, deployment.migrationBundleRef, 'deployment-bundle')
    same(policy.sourceMigrationBundleRef, deployment.sourceMigrationBundleRef, 'deployment-source-bundle')
    same(policy.migrationRunnerDigest, deployment.migrationRunnerDigest, 'deployment-runner')
  }
  if (bundles) {
    same(policy.sourceMigrationBundleRef, bundles.sourceMigrationBundleRef, 'full-ref')
    same(policy.effectiveMigrationBundleRef, bundles.effectiveMigrationBundleRef, 'effective-ref')
    same(policy.sourceManifestSha256, bundles.full.bundle.manifestSha256, 'full-manifest')
    same(policy.effectiveManifestSha256, bundles.effective.bundle.manifestSha256, 'effective-manifest')
    same(policy.orderedPrefixSha256, bundles.orderedPrefixSha256, 'prefix')
  }
  return policy
}
export function buildProgramOnlyPolicy({ profile, sourceLock, bundles, baselineIntentRef, baselineEntries, migrationRunnerDigest, retainedWorker }) {
  if (!Array.isArray(baselineEntries) || baselineEntries.length !== 33) fail('baseline-count')
  same(baselineEntries, bundles.effective.bundle.entries, 'installed-prefix')
  const value = { schemaVersion: 'aipdm.program-only-baseline-policy.v1', ownerApplicationId: 'ai-pdm', releaseId: sourceLock.releaseId, sourceRevision: sourceLock.sourceRevision, sourceSha256: sourceLock.sourceSha256, sourceManifestSha256: bundles.full.bundle.manifestSha256, effectiveManifestSha256: bundles.effective.bundle.manifestSha256, sourceMigrationBundleRef: bundles.sourceMigrationBundleRef, effectiveMigrationBundleRef: bundles.effectiveMigrationBundleRef, orderedPrefixSha256: bundles.orderedPrefixSha256, expectedLedgerCount: 33, deferredMigration: DEFERRED, migrationRunnerDigest, pgOptions: PROGRAM_ONLY_PGOPTIONS, baselineIntentRef, retainedWorker }
  return assertProgramOnlyPolicy(value, { profile, sourceLock, bundles })
}
export function programOnlyNativeUri(associationUri) {
  ref({ uri: associationUri, sha256: '0'.repeat(64) })
  if (!associationUri.endsWith('/migrate.json')) fail('association-uri')
  return `${associationUri.slice(0, -'migrate.json'.length)}migration-readonly-native.json`
}
export function programOnlyMigrationArguments(deployment, outputUri) {
  return ['--bundle-ref', deployment.migrationBundleRef.uri, '--bundle-sha256', deployment.migrationBundleRef.sha256, '--source-revision', deployment.sourceRevision, '--output-ref', outputUri]
}
export function programOnlyStaticEnvironment(profile) {
  return { OWNER_APPLICATION_ID: 'ai-pdm', RELEASE_BUCKET: BUCKET, GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1', CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', POSTGRES_DATABASE: 'jenfu_prod', POSTGRES_IAM_LOGIN: profile.migrations.serviceAccount.replace('.gserviceaccount.com', ''), POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' }
}
export function programOnlyExecutionEnvironment(profile) { return { ...programOnlyStaticEnvironment(profile), PGOPTIONS: PROGRAM_ONLY_PGOPTIONS } }
/** Fixed source-lock window, never a caller-selected tolerance. */
export async function readProgramOnlyReleaseWindow({ transport, profile, deployment, deadlineAt, intent = null }) {
  const read = async expected => {
    ref(expected)
    const row = await transport.readJson(expected, BUCKET, ['receipts'])
    same(row.ref, expected, 'window-ref')
    if (!Buffer.isBuffer(row.bytes) || programOnlyHash(row.bytes) !== expected.sha256 || canonicalize(JSON.parse(row.bytes.toString('utf8'))) !== canonicalize(row.value)) fail('window-bytes')
    return row.value
  }
  const capsule = await read(deployment.releaseIntentRef)
  if (intent) same(capsule, intent, 'window-capsule')
  if (capsule.deadlineAt !== deadlineAt) fail('window-deadline')
  const sourceLock = await read(capsule.sourceLockRef)
  exact(sourceLock, ['schemaVersion','ownerApplicationId','repository','branch','releaseId','sourceRevision','sourceTree','sourceSha256','migrationManifestSha256','clean','remoteRef','remoteRevision','status','releaseAuthority','evidenceScope','observedAt'], 'window-source-lock')
  if (sourceLock.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1' || sourceLock.repository !== profile.application.repository || sourceLock.branch !== 'main'
    || sourceLock.remoteRef !== 'refs/heads/main' || sourceLock.remoteRevision !== sourceLock.sourceRevision || !H40.test(sourceLock.sourceTree ?? '')
    || sourceLock.ownerApplicationId !== 'ai-pdm' || sourceLock.clean !== true || sourceLock.status !== 'SOURCE_FROZEN' || sourceLock.releaseAuthority !== true || sourceLock.evidenceScope !== 'PRODUCTION_BOUND') fail('window-source-lock')
  assertProgramOnlyPolicy(deployment.programOnlyBaseline, { profile, deployment, intent: capsule, sourceLock })
  const start = Date.parse(sourceLock.observedAt), end = Date.parse(deadlineAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) fail('window-bounds')
  return { start, end }
}
function withinWindow(window, timestamps) {
  if (!window || !Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start >= window.end) fail('window-bounds')
  for (const timestamp of timestamps) { const time = Date.parse(timestamp); if (!Number.isFinite(time) || time < window.start || time > window.end) fail('window-timestamp') }
}
export function assertProgramOnlyNative(value, { policy, submission, execution, outputUri, deadlineAt, window }) {
  const nativeKeys = ['schemaVersion', 'ownerApplicationId', 'sourceRevision', 'database', 'ledger', 'manifestSha256', 'baselineCount', 'minimumLedgerCount', 'ledgerBootstrap', 'ledgerCount', 'applied', 'replayed', 'crossDatabaseDenials', 'boundaryStatus', 'executionName', 'startedAt', 'completedAt', 'status', 'receiptSha256']
  exact(value, nativeKeys, 'native-keys')
  const core = { ...value }; delete core.receiptSha256
  if (value.schemaVersion !== 'jenfu.dev012.migration-receipt.v1' || value.ownerApplicationId !== 'ai-pdm' || value.sourceRevision !== policy.sourceRevision || value.database !== 'jenfu_prod' || value.ledger !== TARGET.ledger || value.manifestSha256 !== policy.effectiveManifestSha256 || value.baselineCount !== 15 || value.minimumLedgerCount !== 0 || value.ledgerCount !== 33 || value.applied !== 0 || value.replayed !== 33 || value.status !== 'PASS' || value.boundaryStatus !== 'PASS' || value.receiptSha256 !== programOnlyHash(core)) fail('native')
  same(value.ledgerBootstrap, { enabled: true, created: false }, 'bootstrap')
  same(value.crossDatabaseDenials, [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }], 'boundary')
  withinWindow(window, [submission.observedAt, value.startedAt, value.completedAt, execution.createTime, execution.completionTime, ...(execution.startTime === undefined ? [] : [execution.startTime])])
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt) || window.end !== Date.parse(deadlineAt) || submission.outputUri !== outputUri || !execution.name?.endsWith(`/executions/${value.executionName}`)) fail('native-window')
  return value
}
export function assertProgramOnlyStaticJob(job, { profile, deployment }) {
  const policy = assertProgramOnlyPolicy(deployment.programOnlyBaseline, { profile, deployment })
  const task = job?.template?.template, container = task?.containers?.[0]
  if (typeof job?.etag !== 'string' || !job.etag || job?.name !== `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`
    || job.template.taskCount !== 1 || job.template.parallelism !== 1 || task?.serviceAccount !== profile.migrations.serviceAccount
    || task.maxRetries !== 0 || task.timeout !== '1800s' || task.containers?.length !== 1 || container.name !== 'migration'
    || container.image !== policy.migrationRunnerDigest || Object.hasOwn(container, 'command')) fail('job')
  same(container.args, ['--bundle-ref-required'], 'job-args')
  if (!Array.isArray(container.env) || container.env.length !== 8 || new Set(container.env.map(row => row.name)).size !== 8
    || container.env.some(row => Object.keys(row).sort().join(',') !== 'name,value')) fail('job-env')
  same(Object.fromEntries(container.env.map(row => [row.name, row.value])), programOnlyStaticEnvironment(profile), 'job-env')
  same(task.volumes, [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }], 'job-volume')
  same(container.volumeMounts, [{ name: 'cloudsql', mountPath: '/cloudsql' }], 'job-mount')
  return job
}
export function assertProgramOnlyExecutionTemplate(execution, { profile, deployment, outputUri }) {
  const policy = assertProgramOnlyPolicy(deployment.programOnlyBaseline, { profile, deployment })
  const prefix = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}/executions/`
  if (!execution?.name?.startsWith(prefix) || !/^[a-z][a-z0-9-]{0,62}$/u.test(execution.name.slice(prefix.length))) fail('execution-name')
  const template = execution.template
  if (execution.taskCount !== 1 || execution.parallelism !== 1 || template?.serviceAccount !== profile.migrations.serviceAccount || template?.maxRetries !== 0 || template?.timeout !== '1800s' || template?.containers?.length !== 1) fail('execution-template')
  const container = template.containers[0]
  if (container.name !== 'migration' || container.image !== policy.migrationRunnerDigest || Object.hasOwn(container, 'command')) fail('execution-image')
  same(template.volumes, [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }], 'execution-volume')
  same(container.volumeMounts, [{ name: 'cloudsql', mountPath: '/cloudsql' }], 'execution-mount')
  same(container.args, programOnlyMigrationArguments(deployment, outputUri), 'execution-args')
  const environment = container.env
  if (!Array.isArray(environment) || environment.length !== 9 || new Set(environment.map(row => row.name)).size !== 9 || environment.some(row => Object.keys(row).sort().join(',') !== 'name,value')) fail('execution-env')
  same(Object.fromEntries(environment.map(row => [row.name, row.value])), programOnlyExecutionEnvironment(profile), 'execution-env')
  return execution
}
export function assertProgramOnlyExecution(execution, { profile, deployment, outputUri, submission, window }) {
  assertProgramOnlyExecutionTemplate(execution, { profile, deployment, outputUri })
  if (execution.reconciling === true || Number(execution.failedCount ?? 0) !== 0 || Number(execution.succeededCount) !== 1 || Number(execution.cancelledCount ?? 0) !== 0 || Number(execution.runningCount ?? 0) !== 0 || !execution.completionTime || execution.conditions?.filter(row => row.type === 'Completed').length !== 1 || execution.conditions.find(row => row.type === 'Completed').state !== 'CONDITION_SUCCEEDED') fail('execution-terminal')
  withinWindow(window, [submission.observedAt, execution.createTime, execution.completionTime, ...(execution.startTime === undefined ? [] : [execution.startTime])])
  if (window.end !== Date.parse(submission.deadlineAt)) fail('execution-window')
  return execution
}
export function assertProgramOnlyAssociation(value, { profile, intent, intentRef, deployment, deploymentRef, native, submission, execution, job, associationUri, window }) {
  const policy = assertProgramOnlyPolicy(intent.programOnlyBaseline, { profile, intent, deployment })
  exact(value, ASSOCIATION_KEYS, 'association-keys')
  const core = { ...value }; delete core.receiptSha256
  if (value.schemaVersion !== 'aipdm.program-only-baseline-association.v1' || value.ownerApplicationId !== 'ai-pdm' || value.releaseId !== intent.releaseId || value.sourceRevision !== intent.sourceRevision || value.policySha256 !== programOnlyHash(policy) || value.receiptSha256 !== programOnlyHash(core) || value.status !== 'PASS' || value.databaseDisposition !== PROGRAM_ONLY_DISPOSITION || value.currentDatabaseReadPerformed !== true || value.migrationJobSubmitted !== true || value.migrationJobSubmissions !== 1 || value.deadlineAt !== intent.deadlineAt) fail('association')
  same(value.releaseCapsuleRef, intentRef, 'capsule-ref'); same(value.deploymentCapsuleRef, deploymentRef, 'deployment-ref')
  same(value.sourceMigrationBundleRef, policy.sourceMigrationBundleRef, 'full-ref'); same(value.effectiveMigrationBundleRef, policy.effectiveMigrationBundleRef, 'effective-ref')
  const outputUri = programOnlyNativeUri(associationUri)
  for (const field of ['nativeReceiptRef', 'submissionIntentRef', 'executionReadbackRef', 'jobReadbackRef']) ref(value[field])
  if (value.nativeReceiptRef.uri !== outputUri || value.submissionIntentRef.uri !== `${outputUri.slice(0, -5)}-submission-intent.json` || value.executionReadbackRef.uri !== `${outputUri.slice(0, -5)}-execution-readback.json` || value.jobReadbackRef.uri !== `${outputUri.slice(0, -5)}-job-readback.json`) fail('association-ref-path')
  assertProgramOnlyExecution(execution, { profile, deployment, outputUri, submission, window })
  assertProgramOnlyNative(native, { policy, submission, execution, outputUri, deadlineAt: intent.deadlineAt, window })
  withinWindow(window, [value.observedAt])
  if (value.executionName !== native.executionName || Date.parse(value.observedAt) < Date.parse(submission.observedAt)) fail('association-window')
  assertProgramOnlyStaticJob(job, { profile, deployment })
  return value
}

export function programOnlySubmissionFields(profile, deployment) {
  if (!deployment.programOnlyBaseline) return {}
  const policy = assertProgramOnlyPolicy(deployment.programOnlyBaseline, { profile, deployment })
  return { programOnlyPolicySha256: programOnlyHash(policy), releaseCapsuleRef: deployment.releaseIntentRef,
    sourceMigrationBundleRef: policy.sourceMigrationBundleRef, effectiveManifestSha256: policy.effectiveManifestSha256,
    executionEnvironment: programOnlyExecutionEnvironment(profile) }
}
export function assertProgramOnlySubmission(value, { profile, deployment, outputUri, deadlineAt }) {
  const expected = { schemaVersion: 'jenfu.dev012.migration-submission-intent.v1', ownerApplicationId: 'ai-pdm', sourceRevision: deployment.sourceRevision,
    jobName: `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`,
    migrationRunnerDigest: deployment.migrationRunnerDigest, migrationBundleRef: deployment.migrationBundleRef,
    outputUri, args: programOnlyMigrationArguments(deployment, outputUri), principalOnlyFenceRef: null, deadlineAt,
    status: 'SUBMISSION_INTENT', ...programOnlySubmissionFields(profile, deployment) }
  exact(value, [...Object.keys(expected), 'observedAt', 'receiptSha256'], 'submission-keys')
  for (const [key, actual] of Object.entries(expected)) same(value[key], actual, `submission-${key}`)
  const core = { ...value }; delete core.receiptSha256
  if (value.receiptSha256 !== programOnlyHash(core) || !Number.isFinite(Date.parse(value.observedAt)) || Date.parse(value.observedAt) > Date.parse(deadlineAt)) fail('submission-seal')
  return value
}
export async function readProgramOnlyBundles({ transport, profile, policy }) {
  assertProgramOnlyPolicy(policy, { profile })
  const read = async value => {
    const row = await transport.readBytes(value.uri, { prefixes: ['source/migration-bundles'], expectedSha256: value.sha256 })
    if (!Buffer.isBuffer(row.bytes) || programOnlyHash(row.bytes) !== value.sha256) fail('bundle-readback')
    return { bundle: JSON.parse(row.bytes.toString('utf8')), bytes: row.bytes, bundleSha256: value.sha256 }
  }
  const [full, effective] = await Promise.all([read(policy.sourceMigrationBundleRef), read(policy.effectiveMigrationBundleRef)])
  const bundles = deriveProgramOnlyBundles({ profile, full })
  if (!effective.bytes.equals(bundles.effective.bytes)) fail('effective-bytes')
  assertProgramOnlyPolicy(policy, { profile, bundles })
  return bundles
}
export async function readProgramOnlyAssociation({ transport, profile, intent, intentRef, deployment, deploymentRef, receipt, associationUri }) {
  const policy = assertProgramOnlyPolicy(intent.programOnlyBaseline, { profile, intent, deployment })
  await readProgramOnlyBundles({ transport, profile, policy })
  const window = await readProgramOnlyReleaseWindow({ transport, profile, deployment, deadlineAt: intent.deadlineAt, intent })
  const read = async value => {
    ref(value)
    const row = await transport.readJson(value, BUCKET, ['receipts'])
    same(row.ref, value, 'association-child-ref')
    if (!Buffer.isBuffer(row.bytes) || programOnlyHash(row.bytes) !== value.sha256 || canonicalize(JSON.parse(row.bytes.toString('utf8'))) !== canonicalize(row.value)) fail('association-child-bytes')
    return row
  }
  ref(receipt.ref)
  if (receipt.ref.uri !== associationUri || !Buffer.isBuffer(receipt.bytes) || programOnlyHash(receipt.bytes) !== receipt.ref.sha256 || canonicalize(JSON.parse(receipt.bytes.toString('utf8'))) !== canonicalize(receipt.value)) fail('association-parent-ref')
  exact(receipt.value, ASSOCIATION_KEYS, 'association-keys')
  const [native, submission, execution, job] = await Promise.all(['nativeReceiptRef', 'submissionIntentRef', 'executionReadbackRef', 'jobReadbackRef'].map(key => read(receipt.value[key])))
  assertProgramOnlySubmission(submission.value, { profile, deployment, outputUri: programOnlyNativeUri(associationUri), deadlineAt: intent.deadlineAt })
  assertProgramOnlyAssociation(receipt.value, { profile, intent, intentRef, deployment, deploymentRef, native: native.value,
    submission: submission.value, execution: execution.value, job: job.value, associationUri, window })
  return { receipt, native, submission, execution, job, policy, window }
}


/** Genuine released source graph, not a caller-provided ledger count. */
export async function readProgramOnlyReleasedBaseline({ transport, profile, baselineIntentRef, previousRevision, bundles }) {
  const { createAiPdmEvidenceContext, runAiPdmEvidenceContext, readAiPdmObservationInputs } = await import('./dev121-owner-release-proof.mjs')
  const { releasePaths } = await import('./dev012-owner-release-runtime.mjs')
  return runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    ref(baselineIntentRef)
    let releasedIntentRef = baselineIntentRef
    let row = await transport.readJson(releasedIntentRef, BUCKET, ['receipts'])
    let paths = releasePaths(profile, row.value, releasedIntentRef.sha256)
    const named = async uri => {
      const result = await transport.readBytes(uri, { prefixes: ['receipts'] })
      if (result.ref.uri !== uri || programOnlyHash(result.bytes) !== result.ref.sha256) fail('baseline-ref')
      return { ...result, value: JSON.parse(result.bytes.toString('utf8')) }
    }
    let terminal = await named(paths.terminal)
    if (terminal.value.facts?.result === 'PRE_ACTIVATION_ABORTED') {
      const { readPreActivationAbortContinuation } = await import('./dev121-preactivation-abort-continuation.mjs')
      const continuation = await readPreActivationAbortContinuation({ profile, transport, baselineIntentRef, verifyProvider: true })
      if (continuation?.kind !== 'PROGRAM_ONLY_ABORT') fail('baseline-not-released')
      releasedIntentRef = continuation.authorityBasis.releasedIntentRef
      row = await transport.readJson(releasedIntentRef, BUCKET, ['receipts'])
      if (row.value.programOnlyBaseline?.baselineIntentRef?.uri === baselineIntentRef.uri) fail('baseline-cycle')
      paths = releasePaths(profile, row.value, releasedIntentRef.sha256)
      terminal = await named(paths.terminal)
    }
    if (terminal.value.facts?.result !== 'RELEASED') fail('baseline-not-released')
    const [prepare, migration] = await Promise.all([named(paths.prepare), named(paths.migrate)])
    const observed = await transport.readOwnerSourceProof({ profile, sourceRevision: row.value.sourceRevision,
      refs: { prepare: prepare.ref, migrate: migration.ref, terminal: terminal.ref }, verifyProvider: true })
    if (observed.proof?.disposition !== 'released' || observed.proof.candidateRevision !== previousRevision
      || observed.provider?.status !== 'BUILD_IMAGE_VERIFIED') fail('baseline-proof')
    const graph = await readAiPdmObservationInputs(observed.proof)
    same(graph.intentRef, releasedIntentRef, 'baseline-capsule')
    if (graph.bundle.bundle.entries.length !== 33 || graph.chain.deployment.value.sourceRevision !== row.value.sourceRevision) fail('baseline-count')
    const native = graph.programMigration?.native.value ?? graph.migrate.value
    if (native.status !== 'PASS' || native.boundaryStatus !== 'PASS' || native.ledgerCount !== 33 || native.baselineCount !== 15
      || native.applied + native.replayed !== 33 || native.ledgerBootstrap?.created !== false) fail('baseline-native')
    same(graph.bundle.bundle.entries, bundles.effective.bundle.entries, 'installed-prefix')
    return { graph, observed, releasedIntentRef, baselineEntries: graph.bundle.bundle.entries,
      migrationRunnerDigest: graph.chain.deployment.value.migrationRunnerDigest }
  })
}
