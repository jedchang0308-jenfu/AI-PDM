import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildDev117MigrationBundle, buildDev117MigrationPackage } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { crc32cBase64, canonicalize, executeProductionMigration } from './lib/dev012-production-migration-runner.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { TARGET } from './dev117-production-migration-runner.mjs'
import {
  deriveProgramOnlyBundles, buildProgramOnlyPolicy, assertProgramOnlyPolicy, programOnlyHash, sealProgramOnlyEvidence,
  programOnlyNativeUri, programOnlyMigrationArguments, programOnlyStaticEnvironment, programOnlyExecutionEnvironment,
  readProgramOnlyAssociation, assertProgramOnlyExecution, PROGRAM_ONLY_DISPOSITION,
} from './lib/dev117-ai-pdm-program-only-baseline.mjs'

// LOCAL_TEST: actual repository SQL bytes, recorded HTTP, and isolated in-memory ledger.
// These tests make no production readback, credential, or native PostgreSQL claim.
const currentProfile = JSON.parse(fs.readFileSync(new URL('../config/release/dev117-ai-pdm-independent-production-v3.json', import.meta.url)))
// Preserve the closed B35 historical34 policy fixture; future migrations remain denied.
const profile = structuredClone(currentProfile); profile.migrations.entries = profile.migrations.entries.slice(0, 34)
const n1c = JSON.parse(fs.readFileSync(new URL('../config/platform/dev-010-n1c-ai-pdm.json', import.meta.url)))
const revision = 'b'.repeat(40), bucket = profile.artifact.releaseBucket
const base = `gs://${bucket}/receipts/releases/DEV122-PROGRAM-LOCAL`
const workerBase = `gs://${bucket}/receipts/dev-122/openswx-worker`
const reference = (name, prefix = base) => ({ uri: `${prefix}/${name}.json`, sha256: 'c'.repeat(64) })
const full = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), revision)
const bundles = deriveProgramOnlyBundles({ profile, full })
const seal = sealProgramOnlyEvidence
const json = (value, status = 200) => Response.json(value, { status })

function fixture({ preExistingExecution = false, unknownPost = false, unreadableExecution = false, executionClockOffset = 0, nativeClockOffset = 0, jobMutate = () => {}, executionMutate = () => {} } = {}) {
  const observedAt = new Date().toISOString(), deadlineAt = new Date(Date.now() + 120_000).toISOString()
  const sourceLock = { schemaVersion: 'jenfu.dev012.owner-source-lock.v1', ownerApplicationId: 'ai-pdm', repository: profile.application.repository, branch: 'main', releaseId: 'DEV122-PROGRAM-LOCAL', sourceRevision: revision, sourceTree: 'e'.repeat(40), sourceSha256: 'd'.repeat(64), migrationManifestSha256: full.bundle.manifestSha256, clean: true, remoteRef: 'refs/heads/main', remoteRevision: revision, status: 'SOURCE_FROZEN', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', observedAt: new Date(Date.now() - 60_000).toISOString() }
  const retainedWorker = Object.fromEntries(['descriptorRef', 'priorActivationRef', 'currentAssociationRef', 'readyResourceReadbackRef'].map(name => [name, reference(name, workerBase)]))
  const runner = `${profile.artifact.migrationRunnerUri}@sha256:${'e'.repeat(64)}`
  const policy = buildProgramOnlyPolicy({ profile, sourceLock, bundles, baselineIntentRef: reference('prior-release-intent'), baselineEntries: bundles.effective.bundle.entries, migrationRunnerDigest: runner, retainedWorker })
  const intent = { ...sourceLock, sourceLockRef: reference('source-lock'), baselineIntentRef: policy.baselineIntentRef, openswxWorkerRef: retainedWorker.descriptorRef, programOnlyBaseline: policy, deadlineAt }
  const intentRef = reference('release-intent'), deploymentRef = reference('deployment-capsule')
  const deployment = { sourceRevision: revision, releaseIntentRef: intentRef, programOnlyBaseline: policy, migrationRunnerDigest: runner, sourceMigrationBundleRef: bundles.sourceMigrationBundleRef, migrationBundleRef: bundles.effectiveMigrationBundleRef }
  let associationUri = `${base}/${intentRef.sha256}/migrate.json`, outputUri = programOnlyNativeUri(associationUri)
  const jobName = `projects/jenfu-platform-prod/locations/asia-east1/jobs/${profile.migrations.jobName}`
  const task = { serviceAccount: profile.migrations.serviceAccount, maxRetries: 0, timeout: '1800s',
    containers: [{ name: 'migration', image: runner, args: ['--bundle-ref-required'], env: Object.entries(programOnlyStaticEnvironment(profile)).map(([name, value]) => ({ name, value })), volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }] }],
    volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }] }
  const job = { name: jobName, etag: 'LOCAL_JOB_ETAG', template: { taskCount: 1, parallelism: 1, template: task } }; jobMutate(job)
  const execution = { name: `${jobName}/executions/program-local-1`, taskCount: 1, parallelism: 1, template: structuredClone(task),
    createTime: observedAt, completionTime: observedAt, succeededCount: 1, conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }] }
  execution.template.containers[0].args = programOnlyMigrationArguments(deployment, outputUri)
  execution.template.containers[0].env = Object.entries(programOnlyExecutionEnvironment(profile)).map(([name, value]) => ({ name, value }))
  const objects = new Map(), calls = []; let posts = 0, polls = 0
  const objectName = uri => uri.slice(`gs://${bucket}/`.length)
  const seed = (uri, bytes) => { const row = { bytes, generation: '17', crc32c: crc32cBase64(bytes), ref: { uri, sha256: programOnlyHash(bytes) } }; objects.set(objectName(uri), row); return row }
  const seedJson = (uri, value) => seed(uri, Buffer.from(`${canonicalize(value)}\n`))
  seed(bundles.sourceMigrationBundleRef.uri, full.bytes); seed(bundles.effectiveMigrationBundleRef.uri, bundles.effective.bytes)
  intent.sourceLockRef = seedJson(intent.sourceLockRef.uri, sourceLock).ref
  Object.assign(intentRef, seedJson(intentRef.uri, intent).ref)
  associationUri = `${base}/${intentRef.sha256}/migrate.json`; outputUri = programOnlyNativeUri(associationUri)
  execution.template.containers[0].args = programOnlyMigrationArguments(deployment, outputUri)
  executionMutate(execution)
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url); calls.push({ url, method: options.method ?? 'GET' })
    if (target.hostname === 'storage.googleapis.com') {
      if (target.pathname.startsWith('/upload/')) {
        assert.equal(target.searchParams.get('ifGenerationMatch'), '0'); const name = target.searchParams.get('name')
        if (objects.has(name)) return json({}, 412)
        const row = seed(`gs://${bucket}/${name}`, Buffer.from(options.body)); return json({ generation: row.generation })
      }
      const row = objects.get(decodeURIComponent(target.pathname.split('/o/')[1])); if (!row) return json({}, 404)
      return target.searchParams.get('alt') === 'media' ? new Response(row.bytes) : json({ generation: row.generation, crc32c: row.crc32c })
    }
    assert.equal(target.hostname, 'run.googleapis.com')
    if (url.endsWith(':run')) {
      posts++; assert.equal(posts, 1, 'unknown outcomes must never resubmit')
      const body = JSON.parse(options.body)
      assert.equal(body.etag, job.etag)
      assert.deepEqual(body.overrides, { containerOverrides: [{ name: 'migration', args: programOnlyMigrationArguments(deployment, outputUri), env: [{ name: 'PGOPTIONS', value: '-c default_transaction_read_only=on' }] }] })
      const time = new Date(Date.now() + executionClockOffset).toISOString(); execution.createTime = time; execution.completionTime = time
      if (unknownPost) throw Error('LOCAL_APPLIED_RESPONSE_LOST')
      return json({ name: 'projects/jenfu-platform-prod/locations/asia-east1/operations/local' })
    }
    assert.equal(options.method ?? 'GET', 'GET')
    if (target.pathname.endsWith('/executions')) {
      if (posts && unreadableExecution) throw Error('LOCAL_READBACK_UNAVAILABLE')
      return json({ executions: posts || preExistingExecution ? [execution] : [] })
    }
    if (url.endsWith(execution.name)) return json(execution)
    assert.ok(url.endsWith(jobName)); return json(job)
  }
  const transport = createOwnerTransport({ token: 'LOCAL_RECORDED_TOKEN_NOT_A_CREDENTIAL', fetchImpl, sleep: async () => { assert.ok(++polls < 3) }, now: () => new Date().toISOString() })
  const run = () => transport.runMigrationJob({ profile, deployment, outputUri, deadlineAt })
  const receipt = async () => {
    await run()
    const native = seal({ schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: revision,
      database: 'jenfu_prod', ledger: TARGET.ledger, manifestSha256: bundles.effective.bundle.manifestSha256, baselineCount: 15, minimumLedgerCount: 0,
      ledgerBootstrap: { enabled: true, created: false }, ledgerCount: 33, applied: 0, replayed: 33,
      crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }], boundaryStatus: 'PASS', executionName: 'program-local-1',
      startedAt: new Date(Date.now() + nativeClockOffset).toISOString(), completedAt: new Date(Date.now() + nativeClockOffset).toISOString(), status: 'PASS' })
    seedJson(outputUri, native)
    const refs = Object.fromEntries([['nativeReceiptRef', outputUri], ['submissionIntentRef', outputUri.replace(/\.json$/u, '-submission-intent.json')], ['executionReadbackRef', outputUri.replace(/\.json$/u, '-execution-readback.json')], ['jobReadbackRef', outputUri.replace(/\.json$/u, '-job-readback.json')]].map(([key, uri]) => [key, objects.get(objectName(uri)).ref]))
    const association = seal({ schemaVersion: 'aipdm.program-only-baseline-association.v1', ownerApplicationId: 'ai-pdm', releaseId: intent.releaseId, sourceRevision: revision,
      releaseCapsuleRef: intentRef, deploymentCapsuleRef: deploymentRef, policySha256: programOnlyHash(policy), sourceMigrationBundleRef: bundles.sourceMigrationBundleRef,
      effectiveMigrationBundleRef: bundles.effectiveMigrationBundleRef, ...refs, executionName: 'program-local-1', status: 'PASS', databaseDisposition: PROGRAM_ONLY_DISPOSITION,
      migrationJobSubmitted: true, migrationJobSubmissions: 1, currentDatabaseReadPerformed: true, observedAt: new Date().toISOString(), deadlineAt })
    const row = seedJson(associationUri, association)
    return { ...row, value: association }
  }
  const read = row => readProgramOnlyAssociation({ transport, profile, intent, intentRef, deployment, deploymentRef, receipt: row, associationUri })
  return { policy, intent, intentRef, deployment, deploymentRef, job, execution, objects, calls, seedJson, objectName, transport, run, receipt, read, outputUri, associationUri, counts: () => ({ posts, polls }) }
}

test('P01 program-only sends one etag-bound read-only Job, seals native joins, and replays without resubmission', async () => {
  const h = fixture(), row = await h.receipt(), result = await h.read(row)
  assert.equal(result.native.value.ledgerCount, 33); assert.equal(result.native.value.applied, 0)
  const originalBytes = h.objects.get(h.objectName(result.job.ref.uri)).bytes
  h.job.latestCreatedExecution = { name: h.execution.name }; h.job.etag = 'ADVANCED_METADATA_ETAG'
  await h.run(); await h.read(row)
  assert.equal(h.counts().posts, 1); assert.ok(h.objects.get(h.objectName(result.job.ref.uri)).bytes.equals(originalBytes))
  assert.ok(h.calls.filter(row => row.method !== 'GET').every(row => row.url.startsWith('https://storage.googleapis.com/upload/') || row.url.endsWith('/jobs/ai-pdm-prod-migration-runner:run')))
})

test('P03 missing etag, static env, image, command, args, duplicate env, retry and sibling target fail before POST', async () => {
  for (const mutate of [j => delete j.etag, j => j.template.template.containers[0].image += 'wrong', j => j.template.template.containers[0].command = ['sh'],
    j => j.template.template.containers[0].env.push({ name: 'PGOPTIONS', value: 'off' }), j => j.template.template.containers[0].args = ['--sql', 'WRITE'],
    j => j.template.template.containers[0].env[0].value = 'sibling', j => j.template.template.maxRetries = 1]) {
    const h = fixture({ jobMutate: mutate }); await assert.rejects(h.run()); assert.equal(h.counts().posts, 0)
  }
})

test('P03 unknown POST adopts its one strict matching execution; unreadable outcome remains UNKNOWN on retry', async () => {
  const h = fixture({ unknownPost: true }); await h.run(); await h.run(); assert.equal(h.counts().posts, 1)
  const unknown = fixture({ unknownPost: true, unreadableExecution: true }); await assert.rejects(unknown.run(), /OUTCOME_UNKNOWN/u)
  await assert.rejects(unknown.run()); assert.equal(unknown.counts().posts, 1)
})

test('P03 provider execution must retain read-only env, fixed args and one successful task', async () => {
  for (const mutate of [e => e.template.containers[0].env.pop(), e => e.template.containers[0].env.at(-1).value = '-c default_transaction_read_only=off',
    e => e.template.containers[0].args[1] = bundles.sourceMigrationBundleRef.uri, e => e.template.containers[0].image += 'wrong',
    e => e.template.serviceAccount = 'wrong', e => e.failedCount = 1, e => e.cancelledCount = 1, e => e.runningCount = 1]) {
    const h = fixture({ executionMutate: mutate }); await assert.rejects(h.run()); assert.equal(h.counts().posts, 1)
  }
})

test('P04 association rejects resealed source, capsule, policy, child-ref, timestamp, native applied or ledger drift', async () => {
  for (const mutate of [r => r.sourceRevision = 'a'.repeat(40), r => r.releaseCapsuleRef.sha256 = 'f'.repeat(64), r => r.policySha256 = 'f'.repeat(64),
    r => r.nativeReceiptRef.uri += '.json', r => r.currentDatabaseReadPerformed = false, r => r.migrationJobSubmissions = 0,
    r => r.observedAt = '2000-01-01T00:00:00Z', r => r.extra = true]) {
    const h = fixture(), row = await h.receipt(), changed = structuredClone(row.value); mutate(changed)
    const seeded = h.seedJson(h.associationUri, seal(changed)); await assert.rejects(h.read({ ...seeded, value: seal(changed) }))
  }
  for (const mutate of [n => n.applied = 1, n => n.ledgerCount = 34, n => n.ledgerBootstrap.created = true, n => n.executionName = 'other', n => n.startedAt = '2000-01-01T00:00:00Z']) {
    const h = fixture(), row = await h.receipt(), child = JSON.parse(h.objects.get(h.objectName(h.outputUri)).bytes); mutate(child)
    const seeded = h.seedJson(h.outputUri, seal(child)); const value = seal({ ...row.value, nativeReceiptRef: seeded.ref })
    const parent = h.seedJson(h.associationUri, value); await assert.rejects(h.read({ ...parent, value }))
  }
})

test('P04 association rejects a transport returning mismatched bytes, URI, or parsed value', async () => {
  for (const mode of ['uri', 'bytes', 'parsed']) {
    const h = fixture(), row = await h.receipt(), reader = h.transport.readJson
    h.transport.readJson = async (...args) => { const result = await reader(...args); if (mode === 'uri') result.ref = { ...result.ref, uri: result.ref.uri + '.json' }; if (mode === 'bytes') result.bytes = Buffer.from('{}'); if (mode === 'parsed') result.value.status = 'FORGED'; return result }
    await assert.rejects(h.read(row))
  }
})

test('P05 default source remains 34; program-only accepts precisely the unmodified 33-entry prefix', () => {
  assert.equal(full.bundle.entries.length, 34); assert.equal(bundles.effective.bundle.entries.length, 33)
  assert.equal(full.bundle.entries.at(-1).version, 'ai-pdm-084'); assert.equal(bundles.effective.bundle.entries.at(-1).version, 'ai-pdm-083')
  const h = fixture()
  for (const mutate of [p => p.expectedLedgerCount = 32, p => p.pgOptions += ' -c transaction_read_only=off', p => p.deferredMigration.order = 33,
    p => p.sourceMigrationBundleRef = p.effectiveMigrationBundleRef, p => p.retainedWorker.mode = 'PAUSED', p => p.extra = true]) {
    const changed = structuredClone(h.policy); mutate(changed); assert.throws(() => assertProgramOnlyPolicy(changed, { profile }))
  }
  const installed = structuredClone(bundles.effective.bundle.entries); installed[0].appliedSha256 = '0'.repeat(64)
  assert.throws(() => buildProgramOnlyPolicy({ profile, sourceLock: h.intent, bundles, baselineIntentRef: h.policy.baselineIntentRef, baselineEntries: installed, migrationRunnerDigest: h.policy.migrationRunnerDigest, retainedWorker: h.policy.retainedWorker }))
})

test('P02 runner with a complete 33-entry ledger issues no SQL from the bundle', async () => {
  const ledger = bundles.effective.bundle.entries.map(e => ({ version: e.version, name: e.name, checksum_sha256: e.appliedSha256, source_revision: 'historical-source' })), statements = []
  const database = { async query(sql) { statements.push(sql)
    if (sql.startsWith('SELECT current_database')) return { rows: [{ database: 'jenfu_prod', user: TARGET.login, postgresMajor: 17, migratorMember: true, runtimeCanCreateCore: false }] }
    if (sql.includes('unnest(')) return { rows: TARGET.siblingCoreSchemas.map(schema_name => ({ schema_name, can_use: false })) }
    if (sql.includes('FROM pg_catalog.pg_class')) return { rows: [{ exists: true }] }
    if (sql.includes('ORDER BY applied_at')) return { rows: ledger }
    return { rows: [] }
  } }
  const result = await executeProductionMigration({ bundle: bundles.effective.bundle, database, target: TARGET, sourceRevision: revision, denyDatabaseConnect: async () => true })
  assert.equal(result.applied, 0); assert.equal(result.replayed, 33); assert.equal(result.ledgerBootstrap.created, false)
  assert.ok(!statements.some(sql => /^(?:CREATE|INSERT|UPDATE|DELETE|BEGIN)/u.test(sql)))
})


test('P03A separate provider/native clocks may interleave within the sealed source window; replay remains zero POST', async () => {
  const h = fixture({ executionClockOffset: -500, nativeClockOffset: 100 })
  const row = await h.receipt(), result = await h.read(row)
  assert.ok(Date.parse(result.execution.value.createTime) < Date.parse(result.submission.value.observedAt))
  assert.ok(Date.parse(result.native.value.completedAt) > Date.parse(result.execution.value.completionTime))
  await h.run(); await h.read(row); assert.equal(h.counts().posts, 1)
})

test('P03A malformed or out-of-window provider/native timestamps and reversed native clock fail closed', async () => {
  for (const offset of [-120_000, 180_000]) {
    const h = fixture({ executionClockOffset: offset }); await assert.rejects(h.run()); assert.equal(h.counts().posts, 1)
  }
  for (const mutate of [n => n.startedAt = 'invalid', n => n.completedAt = '2000-01-01T00:00:00Z', n => n.startedAt = new Date(Date.parse(n.completedAt) + 100).toISOString()]) {
    const h = fixture(), row = await h.receipt(), child = JSON.parse(h.objects.get(h.objectName(h.outputUri)).bytes); mutate(child)
    const nativeRow = h.seedJson(h.outputUri, seal(child)), association = seal({ ...row.value, nativeReceiptRef: nativeRow.ref })
    const parent = h.seedJson(h.associationUri, association); await assert.rejects(h.read({ ...parent, value: association }))
  }
})

test('P03 pre-existing matching execution without sealed prior submission cannot acquire owner provenance', async () => {
  const h = fixture({ preExistingExecution: true })
  await assert.rejects(h.run(), /MIGRATION_SUBMISSION_UNKNOWN/u)
  assert.equal(h.counts().posts, 0)
  assert.ok(h.calls.every(row => row.method === 'GET'))
  assert.ok(![...h.objects.keys()].some(name => name.endsWith('-submission-intent.json')))
})

test('current v7 source with migration085 cannot enter the closed program-only baseline path', () => {
  const currentFull = buildDev117MigrationBundle(currentProfile, buildDev117MigrationPackage(currentProfile, n1c), revision)
  assert.equal(currentFull.bundle.entries.length, 35)
  assert.throws(() => deriveProgramOnlyBundles({ profile: currentProfile, full: currentFull }), /PROGRAM_ONLY/u)
})
