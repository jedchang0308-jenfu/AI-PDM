import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRuntimeConfig, canonicalize, releasePaths, sha256, stageReceipt } from './dev012-owner-release-runtime.mjs'
import { readPrincipalOnlyRepairBaseline } from './dev121-principal-forward-repair.mjs'
import { readPreActivationAbortContinuation } from './dev121-preactivation-abort-continuation.mjs'

function fixture() {
  const bucket = 'jenfu-platform-prod-aipdm-release'
  const serviceName = 'ai-pdm-prod'
  const prefix = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release`
  const profile = { application: { id: 'ai-pdm', repository: 'jedchang0308-jenfu/AI-PDM' },
    artifact: { releaseBucket: bucket, uri: `${prefix}/ai-pdm` },
    target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName, runtimeServiceAccount: 'runtime@jenfu-platform-prod.iam.gserviceaccount.com' },
    runtime: { containerName: 'ai-pdm', cloudSqlProxyContainer: 'proxy', cloudSqlProxyImage: 'proxy@sha256:' + 'c'.repeat(64), port: 8080, cloudSqlProxyPort: 5432, concurrency: 20, timeoutSeconds: 60, maxInstances: 1, poolMax: 4 },
    environment: { requiredPlainEnvironmentNames: ['NODE_ENV', 'AUTH_MODE'], fixedValues: { NODE_ENV: 'production' },
      controlledValues: { AUTH_MODE: { defaultValue: 'principal', allowedValues: ['principal'] } },
      requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'own-secret' } } }
  const runtime = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production', AUTH_MODE: 'principal' }, secretVersions: { SESSION_SECRET: '7' } })
  const source = 'a'.repeat(40), old = `${serviceName}-previous`, recovery = `${serviceName}-recovery`, candidate = `${serviceName}-candidate`
  const uid = 'd65f379b-a342-4eb3-ba22-109aa5f368c5'
  const image = `${prefix}/ai-pdm-recovery@sha256:${'d'.repeat(64)}`
  const objects = new Map()
  const put = (uri, value) => {
    const bytes = Buffer.from(canonicalize(value) + '\n')
    const row = { ref: { uri, sha256: sha256(bytes) }, bytes, value }
    objects.set(uri, row); return row
  }
  const proof = put(`gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-RECOVERY/${source}.json`, {
    schemaVersion: 'ai-pdm.principal-only-recovery.v1', sourceRevision: source, projectId: 'jenfu-platform-prod',
    region: 'asia-east1', service: serviceName, serviceUid: uid, oldRevision: old, recoveryRevision: recovery, imageDigest: image, status: 'PASS',
  })
  const runtimeRow = put(`gs://${bucket}/receipts/runtime.json`, { runtimeConfig: runtime })
  const sourceLock = put(`gs://${bucket}/receipts/source-lock.json`, { ownerApplicationId: profile.application.id, sourceRevision: source,
    migrationManifestSha256: 'f'.repeat(64), status: 'SOURCE_FROZEN', releaseAuthority: true, clean: true })
  const intent = { ownerApplicationId: profile.application.id, releaseId: 'DEV121-FAILED-RELEASE', sourceRevision: source, previousRevision: old,
    sourceLockRef: sourceLock.ref,
    runtimeConfigRef: runtimeRow.ref, migrationManifestSha256: 'f'.repeat(64),
    principalOnlyRecovery: { revision: recovery, imageDigest: image, serviceUid: uid, receiptRef: proof.ref },
    principalOnlyFenceRef: { uri: `gs://${bucket}/receipts/releases/DEV121-MANUAL-ZERO-FENCE/proof.json`, sha256: '2'.repeat(64) },
  }
  const baseline = put(`gs://${bucket}/receipts/releases/${intent.releaseId}/release-intent.json`, intent)
  const paths = releasePaths(profile, intent, baseline.ref.sha256)
  const seal = (stage, facts, previousReceiptRef = null) => put(paths[stage], stageReceipt({ profile, intent, stage,
    facts, previousReceiptRef, observedAt: '2026-09-30T00:00:00Z' }))
  const deployment = put(paths.deployment, { sourceRevision: source, releaseIntentRef: baseline.ref, artifactDigest: `${profile.artifact.uri}@sha256:${'1'.repeat(64)}` })
  const migration = seal('migrate', { disposition: 'UNCHANGED_VERIFIED', manifestSha256: intent.migrationManifestSha256 })
  seal('candidate', { candidateRevision: candidate, artifactDigest: deployment.value.artifactDigest,
    deploymentCapsuleRef: deployment.ref, migrationReceiptRef: migration.ref })
  const rollback = seal('rollback', { result: 'ROLLED_BACK', previousRevision: recovery, databaseDisposition: 'FORWARD_APPLIED' })
  seal('terminal', { result: 'ROLLED_BACK', previousRevision: recovery, databaseDisposition: 'FORWARD_APPLIED' }, rollback.ref)
  const controlCore = { inputFingerprint: '3'.repeat(64), leaseExpiresAt: '2026-09-30T00:02:00Z', deadlineAt: '2026-09-30T04:00:00Z', schemaVersion: 'jenfu.dev012.owner-control-head.v1', state: 'FINALIZED', result: 'ROLLED_BACK',
    ownerApplicationId: profile.application.id, service: serviceName, controlBucket: bucket, releaseId: intent.releaseId,
    sourceRevision: source, sourceLockSha256: intent.sourceLockRef.sha256, previousRevision: recovery, candidateRevision: candidate,
    ownerRunRef: `https://api.github.com/repos/${profile.application.repository}/actions/runs/42` }
  const control = { ...controlCore, controlSha256: sha256(canonicalize(controlCore)) }
  put(paths.control, control)
  const service = { name: `projects/jenfu-platform-prod/locations/asia-east1/services/${serviceName}`,
    uid, generation: '2', observedGeneration: '2', reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    traffic: [{ revision: recovery, percent: 100 }], trafficStatuses: [{ revision: recovery, percent: 100 }] }
  const revision = { name: `${service.name}/revisions/${recovery}`, containers: [{ name: profile.runtime.containerName, image }],
    conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
  const run = { id: '42', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: source }
  const calls = []
  const transport = {
    async readBytes(uri) { if (!objects.has(uri)) throw Object.assign(new Error('MISSING'), { code: 'MISSING' }); return objects.get(uri) },
    async readJson(ref) { const row = await this.readBytes(ref.uri); assert.deepEqual(ref, row.ref); return row },
    async getService() { return service }, async getRevision(_profile, name) { calls.push(name); assert.equal(name, recovery); return revision },
    async readOwnerRun() { return run },
  }
  return { input: { profile, transport, baselineIntentRef: baseline.ref }, objects, put, seal, paths,
    runtime, service, revision, run, intent, recovery, old, calls, controlCore }
}

test('sealed maintenance rollback provides the application runtime baseline without invoking the old revision', async () => {
  const h = fixture()
  const result = await readPrincipalOnlyRepairBaseline(h.input)
  assert.equal(result.activeRevision, h.recovery)
  assert.deepEqual(result.runtimeConfig, h.runtime)
  assert.equal(result.rollbackRef.uri, h.paths.rollback)
  assert.deepEqual(h.calls, [h.recovery])
})

test('forward repair rejects legacy traffic, tagged traffic, altered images, sidecars and replacement service identity', async () => {
  for (const mutate of [
    h => { h.service.traffic = [{ revision: h.old, percent: 100 }] },
    h => { h.service.trafficStatuses.push({ revision: h.old, percent: 0, tag: 'legacy' }) },
    h => { h.service.uid = 'replacement' },
    h => { h.revision.containers[0].image = h.input.profile.artifact.uri + '@sha256:' + '0'.repeat(64) },
    h => { h.revision.containers.push({ name: 'database-proxy', image: 'proxy' }) },
    h => { h.revision.containers[0].env = [{ name: 'DATABASE_URL', value: 'injected' }] },
  ]) {
    const h = fixture(); mutate(h)
    await assert.rejects(() => readPrincipalOnlyRepairBaseline(h.input), /PRINCIPAL_/)
  }
})

test('forward repair rejects missing, unsealed or unrelated rollback evidence and unfinished owner runs', async () => {
  for (const mutate of [
    h => { h.objects.delete(h.paths.rollback) },
    h => { const row = h.objects.get(h.paths.terminal); h.put(h.paths.terminal, { ...row.value, facts: { ...row.value.facts, previousRevision: h.old } }) },
    h => { h.seal('terminal', { result: 'ROLLED_BACK', previousRevision: h.recovery, databaseDisposition: 'FORWARD_APPLIED' }, h.intent.runtimeConfigRef) },
    h => { h.run.status = 'in_progress' },
    h => { h.run.headSha = '9'.repeat(40) },
    h => { const core = { ...h.controlCore, candidateRevision: h.old }; h.put(h.paths.control, { ...core, controlSha256: sha256(canonicalize(core)) }) },
  ]) {
    const h = fixture(); mutate(h)
    await assert.rejects(() => readPrincipalOnlyRepairBaseline(h.input), /MISSING|PRINCIPAL_/)
  }
})

test('successful or pre-activation terminal receipts never become maintenance repair authority', async () => {
  for (const result of ['RELEASED', 'PRE_ACTIVATION_ABORTED']) {
    const h = fixture(); h.seal('terminal', { result })
    assert.equal(await readPrincipalOnlyRepairBaseline(h.input), null)
  }
})

function abortFixture() {
  const h = fixture()
  h.service.scaling = { scalingMode: 'MANUAL', manualInstanceCount: 0 }
  h.service.traffic = [{ revision: h.old, percent: 100 }]
  h.service.trafficStatuses = [{ revision: h.old, percent: 100 }]
  const previousCandidate = h.objects.get(h.paths.candidate).value.facts
  h.seal('candidate', { ...previousCandidate, previousRevision: h.old, beforeTraffic: h.service.traffic })
  const facts = { result: 'PRE_ACTIVATION_ABORTED', previousRevision: h.recovery, databaseDisposition: 'FORWARD_APPLIED',
    entrypointRecovery: { result: 'BASELINE_ALREADY_ACTIVE', changed: false } }
  const rollback = h.seal('rollback', facts)
  h.seal('terminal', facts, rollback.ref)
  h.controlCore.result = 'PRE_ACTIVATION_ABORTED'
  h.put(h.paths.control, { ...h.controlCore, controlSha256: sha256(canonicalize(h.controlCore)) })
  h.input.transport.getRevision = async (_profile, name) => {
    h.calls.push(name)
    if (name === h.recovery) return h.revision
    assert.equal(name, previousCandidate.candidateRevision)
    return { name: `${h.service.name}/revisions/${name}`, conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
      containers: [{ name: h.input.profile.runtime.containerName, image: previousCandidate.artifactDigest }] }
  }
  return h
}

test('cleaned pre-activation abort certifies the stopped original traffic, without calling it a rollback', async () => {
  const h = abortFixture()
  const result = await readPreActivationAbortContinuation(h.input)
  assert.equal(result.result, 'PRE_ACTIVATION_ABORTED')
  assert.equal(result.currentActiveRevision, h.old)
  assert.equal(result.candidateRef.uri, h.paths.candidate)
  assert.equal(await readPrincipalOnlyRepairBaseline(h.input), null)
})

test('abort continuation rejects activation, live or tagged traffic, incomplete receipts, source drift and unfinished runs', async () => {
  for (const mutate of [
    h => { h.put(h.paths.activate, { result: 'ACTIVATED' }) },
    h => { h.service.scaling = { scalingMode: 'AUTOMATIC' } },
    h => { h.service.traffic = [{ revision: h.recovery, percent: 100 }] },
    h => { h.service.trafficStatuses.push({ revision: h.controlCore.candidateRevision, percent: 0, tag: 'candidate' }) },
    h => { h.objects.delete(h.paths.migrate) },
    h => { h.objects.delete(h.intent.sourceLockRef.uri) },
    h => { const row = h.objects.get(h.paths.candidate); h.put(h.paths.candidate, { ...row.value, facts: { ...row.value.facts, previousRevision: h.recovery } }) },
    h => { h.run.status = 'in_progress' },
    h => { const core = { ...h.controlCore, candidateRevision: 'other-candidate' }; h.put(h.paths.control, { ...core, controlSha256: sha256(canonicalize(core)) }) },
    h => { const core = { ...h.controlCore, result: 'RELEASED' }; h.put(h.paths.control, { ...core, controlSha256: sha256(canonicalize(core)) }) },
  ]) { const h = abortFixture(); mutate(h); await assert.rejects(() => readPreActivationAbortContinuation(h.input), /MISSING|CONTINUATION|PRINCIPAL_/) }
})
