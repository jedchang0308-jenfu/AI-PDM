import { createContinuousReleaseSourceReader } from './dev117-ai-pdm-continuous-release.mjs'
import { createPrerequisiteSourceReader } from './dev117-ai-pdm-prerequisite-producer.mjs'
import { createBootstrapSourceReader } from './dev122-openswx-bootstrap.mjs'
import { buildReleaseIntent, buildRuntimeConfigReceipt, executePrerequisiteProducer } from './lib/dev012-owner-prerequisite-producer.mjs'
import { executeOwnerStage } from './lib/dev012-owner-stage-executor.mjs'
import { assertDev117ReleaseIntent } from './lib/dev117-ai-pdm-continuous-release.mjs'

import { readFileSync } from 'node:fs'
import { seedSecretVersionIamContinuation } from '../qa/dev-122/fixtures/secret-version-iam-fixture.mjs'
import { SECRET_VERSION_IAM_SOURCE_PATH, SECRET_VERSION_IAM_HUMAN_APPROVAL_PATH, SECRET_VERSION_IAM_ROLE, SECRET_VERSION_IAM_SECRETS } from './lib/dev122-openswx-secret-version-iam.mjs'
import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { canonicalize, sha256, releasePaths, createOwnerTransport, buildRuntimeConfig } from './lib/dev012-owner-release-runtime.mjs'
import { WORKER_PROFILE_PATH, WORKER_SOURCE_PATHS, workerReceipt, workerTemplate, normalizeWorkerTemplate, workerTemplatePolicy, workerJobName, workerSchedulerName, assertWorkerDescriptor, readWorkerFullEvidence, createOpenSwxOwnerRelease, readBootstrapSupplementalIam } from './lib/dev122-openswx-owner-release.mjs'
import { OPENSWX_TERRAFORM_PATHS, OPENSWX_TERRAFORM_ADDRESSES, executeOpenSwxBootstrap, assertFailedDailyFullJoin, readPartialFailedDailyPause, readCompletedFailedDailyCheckpoint } from './lib/dev122-openswx-bootstrap.mjs'
import { qualifyAiPdmNativeHistoryBasis, deriveAiPdmNativeHistoryBasis, ensureAiPdmNativeHistoryBasis, ensureAiPdmNestedCheckpointHistoryBasis, readAiPdmQualifiedHistoryProjection, recordAiPdmHistoryObject } from './lib/dev121-owner-release-proof.mjs'
import { buildDailyReuseWorkerDescriptor, assertOpenSwxHistoryBasisInput, assertOpenSwxHistoryBasis, executeOpenSwxHistoryBasis, assertReuseSourceLock, assertWorkerArchive, assertWorkerReuseInput, createWorkerGitReader, createWorkerReceiptReadTransport, executeWorkerArtifactReuse, parseWorkerArtifactReuseArgs, publishWorkerReuseJson, resolveWorkerArtifact, verifyWorkerArtifactReuse, workerInputManifest } from './lib/dev122-openswx-worker-artifact-reuse.mjs'
import { READBACK_IAM_PATHS, READBACK_IAM_ADDRESSES, READBACK_IAM_SPECS, READBACK_JOB_ROLE, READBACK_SCHEDULER_ROLE, readbackIamPlan, expectedReadbackJobBindings,
  PREBUILD_IAM_ROLE, PREBUILD_IAM_PERMISSIONS, PREBUILD_IAM_SOURCE_PATH, PREBUILD_IAM_HUMAN_APPROVAL_SHA256, PREBUILD_IAM_SPECS, PREBUILD_IAM_ADDRESSES,
  prebuildIamContinuationPlan, assertPrebuildIamTerraformPlan } from './lib/dev122-openswx-readback-iam.mjs'

// LOCAL_TEST recorded transports. No provider/production/efficiency claim.
// Git reads use raw canonical blobs, never Windows CRLF normalization.
// Synthetic observation time advances with the monotonic timer, independently of
// host wall-clock corrections. Each serial test owns and automatically restores its clock;
// production clock refusal is exercised separately in owner-release-proof tests.
let syntheticClock
beforeEach(context => {
  const wallStarted = Date.now(), monotonicStarted = performance.now()
  let offset = 0, heldAt = null
  const advancingNow = () => wallStarted + Math.floor(performance.now() - monotonicStarted) + offset
  syntheticClock = {
    hold() { assert.equal(heldAt, null); heldAt = advancingNow() },
    expireAfter(deadlineAt) {
      assert.notEqual(heldAt, null)
      assert.ok(Number.isFinite(Date.parse(deadlineAt)))
      offset += Math.max(0, Date.parse(deadlineAt) + 1 - advancingNow())
      heldAt = null
    },
  }
  // Node's mock.method retains an Error stack for every call. Native traversal
  // performs many clock checks; this fixture needs a clock, not a call history.
  const originalNow = Date.now
  let clockCalls = 0
  Date.now = () => { clockCalls++; return heldAt ?? advancingNow() }
  context.after(() => {
    Date.now = originalNow
    if (clockCalls > 100000) console.log('LOCAL_TEST_SYNTHETIC_CLOCK_CALLS '+clockCalls)
  })
})
const root = fileURLToPath(new URL('..', import.meta.url)), oldRevision = 'a'.repeat(40), currentRevision = 'b'.repeat(40)
function git(args) { const row = spawnSync('git', args, { cwd: root, encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }); assert.equal(row.status, 0); return row.stdout }
const actualTree = git(['ls-tree', '-r', '-z', '--full-tree', 'HEAD']), cache = new Map()
function canonicalSource(name) { if (!cache.has(name)) cache.set(name, git(['show', `HEAD:${name}`])); return cache.get(name) }
const profileBytes = canonicalSource(WORKER_PROFILE_PATH), profile = JSON.parse(profileBytes)
const currentAppProfile = JSON.parse(canonicalSource('config/release/dev117-ai-pdm-independent-production-v3.json'))
const appProfile = currentAppProfile
const image = `${profile.artifactUri}@sha256:${'c'.repeat(64)}`, token = `projects/9536592944/secrets/${profile.tokenSecretId}/versions/7`, registry = `projects/9536592944/secrets/${profile.registrySecretId}/versions/9`
const sourceReader = name => canonicalSource(name)
const manifest = workerInputManifest(actualTree, sourceReader, oldRevision)
function tar(entries, extra = []) {
  const parts = []
  for (const row of [...entries.map(row => ({ ...row, bytes: row.bytes ?? canonicalSource(row.path) })), ...extra]) {
    const header = Buffer.alloc(512), name = `source/${row.path}`
    const slash = name.lastIndexOf('/'), prefix = Buffer.byteLength(name) < 100 ? '' : name.slice(0, slash), leaf = prefix ? name.slice(slash + 1) : name
    assert.ok(Buffer.byteLength(leaf) < 100 && Buffer.byteLength(prefix) < 155)
    header.write(leaf, 0); header.write(prefix, 345); header.write((row.mode === '100755' ? '0000755' : '0000644') + '\0', 100)
    header.write('0000000\0', 108); header.write('0000000\0', 116)
    header.write(row.bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136)
    header.fill(32, 148, 156); header.write('0', 156); header.write('ustar\0', 257); header.write('00', 263)
    const sum = [...header].reduce((a, b) => a + b, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
    parts.push(header, row.bytes, Buffer.alloc((512 - row.bytes.length % 512) % 512))
  }
  return Buffer.concat([...parts, Buffer.alloc(1024)])
}
const oldTar = tar(manifest.entries), currentTar = tar(manifest.entries, [{ path: 'src/app/b19-app-only.txt', mode: '100644', bytes: Buffer.from('new application input\n') }])
const currentTree = Buffer.concat([actualTree, Buffer.from(`100644 blob ${'f'.repeat(40)}\tsrc/app/b19-app-only.txt\0`)])
const now = '2026-10-07T15:00:00.000Z'
const deadline = () => new Date(Date.now() + 120_000).toISOString()
test('B23 closed repair input retains the four-argument CLI and pins serving/predecessor refs', () => {
  const workerRef = name => ({ uri: `${profile.receiptRoot}/${name}.json`, sha256: 'a'.repeat(64) })
  const releaseRef = { uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-B23-LOCAL/release-intent.json', sha256: 'b'.repeat(64) }
  const input = { schemaVersion: 'aipdm.openswx-worker-reuse-input.v2', sourceLockRef: { ...releaseRef, uri: releaseRef.uri.replace('release-intent', 'source-lock') },
    currentSourceObjectRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/source/releases/DEV122-B23-LOCAL/source.tar.gz', sha256: 'c'.repeat(64) }, priorActivationRef: workerRef('last-ready'),
    servingCapsuleRef: releaseRef, predecessorBaselineRef: null, deadlineAt: deadline(), receiptId: 'DEV122-B23-LOCAL' }
  assertWorkerReuseInput(input)
  assert.deepEqual(parseWorkerArtifactReuseArgs(['--input-ref', workerRef('input').uri, '--input-sha256', workerRef('input').sha256]), { inputRef: workerRef('input') })
  for (const mutation of [row => row.purpose = 'build_only', row => row.releaseVariant = 'DAILY', row => row.servingCapsuleRef.extra = true, row => row.predecessorBaselineRef = { ...workerRef('prior'), uri: workerRef('prior').uri + '?x=1' }, row => delete row.servingCapsuleRef,
    row => row.deadlineAt = new Date(Date.now() + 601_000).toISOString(), row => row.deadlineAt = new Date(Date.now() - 1).toISOString()]) {
    const changed = structuredClone(input); mutation(changed); assert.throws(() => assertWorkerReuseInput(changed))
  }
  for (const flag of ['--release-variant', '--mode', '--target', '--purpose']) assert.throws(() => parseWorkerArtifactReuseArgs(['--input-ref', workerRef('input').uri, '--input-sha256', workerRef('input').sha256, flag, 'repair']))
})
test('nested checkpoint reader propagates through repeated transport wrappers', async () => {
  const bucket = 'jenfu-platform-prod-aipdm-release'
  const prefix = 'receipts/dev-122/openswx-worker'
  const basisRef = { uri: `gs://${bucket}/${prefix}/nested-basis.json`, sha256: 'b'.repeat(64) }
  const value = { schemaVersion: 'aipdm.openswx-worker-descriptor.v4', purpose: 'full', artifactMode: 'REUSE_VERIFIED', sourceRevision: 'a'.repeat(40), historyBasisRef: basisRef }
  const bytes = Buffer.from(canonicalize(value))
  const ref = { uri: `gs://${bucket}/${prefix}/nested-checkpoint.json`, sha256: sha256(bytes) }
  const row = { bytes, ref, value, metadata: { generation: '1', crc32c: 'LOCAL_TEST_CRC' } }
  const recursion = () => { throw Object.assign(new Error('DEV121_OWNER_RELEASE_PROOF_HISTORY_BASIS_RECURSION'), { code: 'DEV121_OWNER_RELEASE_PROOF_HISTORY_BASIS_RECURSION' }) }
  const base = { readJson: async () => recursion(), readJsonForNestedCheckpointDescriptor: async () => row }
  const transport = createWorkerReceiptReadTransport(createWorkerReceiptReadTransport(base))
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    const actual = await transport.readJsonForNestedCheckpointDescriptor(ref, bucket, [prefix])
    assert.deepEqual(actual.value, value)
  })
})
function sourceLock(revision, tree, releaseId) { return { schemaVersion: 'jenfu.dev012.owner-source-lock.v1', ownerApplicationId: 'ai-pdm', repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main', releaseId, sourceRevision: revision, sourceTree: 'e'.repeat(40), sourceSha256: sha256(tree), migrationManifestSha256: 'd'.repeat(64), clean: true, remoteRef: 'refs/heads/main', remoteRevision: revision, status: 'SOURCE_FROZEN', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', observedAt: now } }
async function harness({ buildMutate = () => {}, lockMutate = () => {}, currentArchive = null, proofMetadata = false, releasedBaseline = false } = {}) {
  const objects = new Map(), calls = [], puts = [], controls = {}, prefix = profile.receiptRoot
  const uri = name => `${prefix}/local-test-${name}.json`
  const seedBytes = (location, bytes) => { const row = { bytes, ref: { uri: location, sha256: sha256(bytes) }, metadata: { generation: '17', crc32c: proofMetadata ? crc32cBase64(bytes) : 'LOCAL_TEST_CRC' } }; objects.set(location, row); return row.ref }
  const seed = (name, value) => seedBytes(uri(name), Buffer.from(canonicalize(value)))
  const readBytes = async location => { if (!objects.has(location)) throw Object.assign(Error('MISSING'), { code: 'MISSING' }); return objects.get(location) }
  const readJson = async reference => { const row = await readBytes(reference.uri); assert.equal(row.ref.sha256, reference.sha256); return { ...row, value: JSON.parse(row.bytes.toString('utf8')) } }
  const transport = { now: () => now, readBytes, readJson,
    putJson: async (location, value) => { puts.push(location); const bytes = Buffer.from(`${canonicalize(value)}\n`); if (objects.has(location)) { assert.ok(objects.get(location).bytes.equals(bytes), 'create-only conflicting bytes'); return objects.get(location) }; const ref = seedBytes(location, bytes); return objects.get(ref.uri) },
    createBuild: async () => { throw Error('FORBIDDEN_BUILD') }, exportSbom: async () => { throw Error('FORBIDDEN_EXPORT') } }
  const oldSourceRef = seedBytes(`gs://jenfu-platform-prod-aipdm-release/source/releases/DEV122-LOCAL-BUILD/${proofMetadata ? 'f'.repeat(64) : 'frozen'}/source.tar.gz`, gzipSync(oldTar, { level: 9 }))
  const currentSourceRef = seedBytes('gs://jenfu-platform-prod-aipdm-release/source/releases/DEV122-LOCAL-CURRENT/frozen/source.tar.gz', gzipSync(currentArchive ?? currentTar, { level: 9 }))
  const oldLock = sourceLock(oldRevision, actualTree, 'DEV122-LOCAL-READY'), lock = sourceLock(currentRevision, currentTree, 'DEV122-LOCAL-CURRENT'); lockMutate(lock)
  if(releasedBaseline) oldLock.migrationManifestSha256=b35HistoricalBundle.bundle.manifestSha256
  const oldLockRef = seed('origin-lock', oldLock), sourceLockRef = seed('current-lock', lock)
  const sourceHashes = OPENSWX_TERRAFORM_PATHS.map(path => ({ path, sha256: sha256(canonicalSource(path)) }))
  const plan = { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, sourceHashes, resourceAddresses: OPENSWX_TERRAFORM_ADDRESSES, allowedActions: ['create', 'no-op'] }, resourcePlanHash = sha256(canonicalize(plan))
  const capacityRef = seed('historical-capacity', { observedAt: '2026-10-01T00:00:00Z', status: 'PASS', qualifiedHistorical: true })
  const approvedRef = seed('original-approved', { schemaVersion: 'aipdm.openswx-approved-resource-plan.v1', ownerApplicationId: 'ai-pdm', sourceRevision: oldRevision, resourcePlanHash, status: 'APPROVED', releaseAuthority: true, evidenceScope: 'HUMAN_APPROVED_RESOURCE_PLAN', authorizationStatementSha256: 'a'.repeat(64), capacityGateRef: capacityRef, plan })
  const common = { schemaVersion: 'aipdm.openswx-worker-descriptor.v1', ownerApplicationId: 'ai-pdm', sourceRevision: oldRevision, sourceArchiveSha256: oldSourceRef.sha256, workerProfileSha256: sha256(profileBytes), resourcePlanHash,
    normalTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'normal'))), selftestTemplatePolicySha256: sha256(canonicalize(workerTemplatePolicy(profile, 'selftest'))) }
  for (const key of ['projectId', 'location', 'jobId', 'readerServiceAccount', 'schedulerId', 'dispatchServiceAccount', 'dispatchPolicy', 'bounds', 'receiptRoot']) common[key] = profile[key]
  const buildOnly = { ...common, purpose: 'build_only', resourcePlanRef: approvedRef }, buildOnlyRef = seed('build-only', buildOnly)
  const dummy = { uri: uri('unused'), sha256: 'a'.repeat(64) }
  const wrongFullRef = seed('wrong-full', { ...common, purpose: 'full', workerBuildRef: dummy, bootstrapRef: dummy, cloudPreflightRef: dummy, pausedDrainedRef: dummy, tokenSecretVersion: token, registrySecretVersion: registry })
  const tag = `${profile.artifactUri}:release-${oldRevision}`, builder = 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c'
  const submittedArgs = ['build', '--pull=false', '--no-cache', '--file', 'scripts/lib/openswx-reader/Dockerfile', '--target', 'finite-worker', '--build-arg', `SOURCE_REVISION=${oldRevision}`, '--build-arg', `SOURCE_TREE=${oldLock.sourceSha256}`, '--build-arg', 'SOURCE_CREATED_AT=1970-01-01T00:00:00Z', '--build-arg', 'SOURCE_VERSION=DEV122-LOCAL-BUILD', '--build-arg', 'SOURCE_STATE=frozen', '--tag', tag, '--build-arg', 'READER_SOURCE=scripts/lib/openswx-reader', '.']
  const storage = { bucket: 'jenfu-platform-prod-aipdm-release', object: oldSourceRef.uri.split('/').slice(3).join('/'), generation: '17' }
  const providerBuild = { id: '11111111-1111-1111-1111-111111111111', projectId: profile.projectId, status: 'SUCCESS', serviceAccount: `projects/${profile.projectId}/serviceAccounts/${appProfile.identities.builder}`, createTime: '2026-10-01T01:00:00Z', startTime: '2026-10-01T01:01:00Z', finishTime: '2026-10-01T01:02:00Z', source: { storageSource: storage }, sourceProvenance: { resolvedStorageSource: storage, fileHashes: { [`${oldSourceRef.uri}#17`]: { fileHash: [{ type: 'SHA256', value: Buffer.from(oldSourceRef.sha256, 'hex').toString('base64') }] } } }, steps: [{ name: builder, dir: 'source', args: submittedArgs }], images: [tag], results: { images: [{ name: tag, digest: image.split('@')[1] }] }, options: { logging: 'GCS_ONLY', logStreamingOption: 'STREAM_OFF', requestedVerifyOption: 'VERIFIED' }, timeout: '1800s', queueTtl: '300s', logsBucket: 'gs://jenfu-platform-prod-aipdm-release/logs/cloud-build', tags: ['dev-012', 'ai-pdm', 'dev122-local-build'] }
  const provenance = ['projects/jenfu-platform-prod/occurrences/build-local'], sbom = ['projects/jenfu-platform-prod/occurrences/sbom-local']
  const build = workerReceipt({ descriptor: buildOnly, kind: 'build', actor: appProfile.identities.builder, image, template: workerTemplate(profile, image, null, 'selftest'), observedAt: '2026-10-01T01:03:00Z', previousRefs: [buildOnlyRef], facts: { sourceObject: { ...oldSourceRef, generation: '17', crc32c: objects.get(oldSourceRef.uri).metadata.crc32c }, sourceHashes: manifest.entries.filter(row => WORKER_SOURCE_PATHS.includes(row.path) || row.path.startsWith('scripts/lib/openswx-reader/vendor/')).map(({ path, sha256 }) => ({ path, sha256 })), cloudBuild: providerBuild, scan: { status: 'PASS', blockingVulnerabilityCount: 0 }, provenance, sbom } })
  buildMutate(build, { buildOnlyRef, wrongFullRef }); const buildRef = seed('original-build', build)
  const applyRef = seed('original-apply', { schemaVersion: 'aipdm.openswx-resource-apply.v1', ownerApplicationId: 'ai-pdm', actor: profile.normalActor, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER', approvedPlanRef: approvedRef, resourcePlanHash, sourceRevision: oldRevision })
  const normalSha = sha256(canonicalize(workerTemplate(profile, image, token))), selftestSha = sha256(canonicalize(workerTemplate(profile, image, null, 'selftest')))
  const bootstrapRef = seed('prior-bootstrap', workerReceipt({ descriptor: common, kind: 'bootstrap', actor: profile.normalActor, image, template: workerTemplate(profile, image, null, 'selftest'), observedAt: now, facts: { bootstrapKind: 'FIRST_CREATE', resourceApplyRef: applyRef, tokenSecretVersion: token, registrySecretVersion: registry, normalTemplateSha256: normalSha, selftestTemplateSha256: selftestSha } }))
  const preflightRef = seed('prior-preflight', workerReceipt({ descriptor: common, kind: 'cloud-preflight', actor: profile.normalActor, image, template: workerTemplate(profile, image, null, 'selftest'), observedAt: now, facts: { isolationVerified: true, noCad: true, normalTemplateSha256: normalSha, selftestTemplateSha256: selftestSha } }))
  const pausedRef = seed('prior-drained', workerReceipt({ descriptor: common, kind: 'paused-drained', actor: profile.normalActor, image, template: workerTemplate(profile, image, null, 'selftest'), observedAt: now, facts: { schedulerPaused: true, noActiveOrUnknown: true, quiescenceCompletedAt: now, drainKind: 'FIRST_PROVIDER_ONLY', dbAdmissionProof: 'NOT_APPLICABLE_FIRST_BOOTSTRAP' } }))
  const full = { ...common, purpose: 'full', workerBuildRef: buildRef, bootstrapRef, cloudPreflightRef: preflightRef, pausedDrainedRef: pausedRef, tokenSecretVersion: token, registrySecretVersion: registry }, fullRef = seed('prior-full', full)
  const runtimeRef = seed('prior-runtime', { runtimeConfig: { openswxWorker: { descriptorRef: fullRef }, plainEnvironment: { PDM_OPENSWX_DISPATCH_ENABLED: '1' }, secretVersions: { PDM_WORKLOAD_AUTH_CREDENTIALS: '9' } } })
  const capsule = { schemaVersion: appProfile.schemas.releaseIntent, ownerApplicationId: 'ai-pdm', releaseId: oldLock.releaseId, sourceRevision: oldRevision, sourceSha256: oldLock.sourceSha256, sourceLockRef: oldLockRef, authorizationPolicyRef: dummy, readinessReceiptRef: dummy, foundationReceiptRef: dummy, infraReceiptRef: dummy, runtimeConfigRef: runtimeRef, migrationManifestSha256: oldLock.migrationManifestSha256, previousRevision: releasedBaseline ? 'ai-pdm-prod-'+'4'.repeat(12) : 'ai-pdm-prod-local-prior', deadlineAt: '2026-10-07T15:00:00Z', openswxWorkerRef: fullRef }, capsuleRef = seedBytes(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${capsule.releaseId}/release-intent.json`, Buffer.from(`${canonicalize(capsule)}\n`))
  const modeledReleasedAnchor=releasedBaseline?b35ReleasedAnchor({capsule,capsuleRef,seedBytes}):null
  const canonicalRef = modeledReleasedAnchor?.canonical ?? seedBytes(releasePaths(appProfile, capsule, capsuleRef.sha256).canonical, Buffer.from(canonicalize({ stage: 'canonical', sourceRevision: oldRevision, facts: { origin: profile.canonicalOrigin, candidateRevision: 'ai-pdm-prod-local-prior' } })))
  const priorActivationRef = seed('prior-activation', workerReceipt({ descriptor: full, kind: 'activation', actor: profile.normalActor, image, template: workerTemplate(profile, image, token), observedAt: now, previousRefs: [capsuleRef, dummy, canonicalRef, dummy, dummy], facts: { workerStatus: 'READY', schedulerState: 'ENABLED', claimProof: { claimProof: 'AUTHENTICATED_204_SOURCE_BOUND' }, dbAdmissionProof: 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN', sourceEntryRef: build.facts.sourceHashes.find(row => row.path === 'scripts/run-openswx-metadata-job.mjs'), numericCredentials: { token, registry } } }))
  const input = { schemaVersion: 'aipdm.openswx-worker-reuse-input.v1', sourceLockRef, currentSourceObjectRef: currentSourceRef, priorActivationRef, deadlineAt: deadline(), receiptId: 'LOCAL-B19-REUSE' }, inputRef = seed('input', input)
  const sourceInputs = new Map([[oldRevision, { tree: actualTree, archive: oldTar }], [currentRevision, { tree: currentTree, archive: currentArchive ?? currentTar }]])
  const permitted = new Set([currentRevision]); let frozenRevision = currentRevision
  const readSource = (name, revision) => {
    if (!permitted.has(revision) && name !== WORKER_PROFILE_PATH) throw Object.assign(Error('unvalidated historical source'), { code: 'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID' })
    if (controls.inputDrift === name && revision === frozenRevision) return Buffer.concat([canonicalSource(name), Buffer.from('\nchanged\n')]); return canonicalSource(name)
  }
  readSource.readTree = revision => { assert.ok(permitted.has(revision)); return sourceInputs.get(revision).tree }
  readSource.readTreeId = revision => { assert.ok(permitted.has(revision)); return 'e'.repeat(40) }
  readSource.assertCurrentFrozen = () => assert.ok(sourceInputs.has(frozenRevision))
  readSource.readArchive = revision => { assert.equal(revision, frozenRevision); return sourceInputs.get(revision).archive }
  readSource.readImmutableArchive = revision => { assert.ok(permitted.has(revision)); return sourceInputs.get(revision).archive }
  readSource.createHistoricalReader = () => readSource
  readSource.authorizeOrigin = revision => { assert.ok(sourceInputs.has(revision), 'source must come from a registered immutable fixture'); permitted.add(revision) }
  const occurrences = [{ name: provenance[0], kind: 'BUILD', resourceUri: `https://${image}` }, { name: sbom[0], kind: 'SBOM_REFERENCE', resourceUri: `https://${image}` }, { name: 'projects/jenfu-platform-prod/occurrences/discovery-local', kind: 'DISCOVERY', resourceUri: `https://${image}`, discovery: { analysisStatus: 'FINISHED_SUCCESS', continuousAnalysis: 'ACTIVE', lastScanTime: '2026-10-07T14:59:00Z' } }]
  const job = { name: workerJobName(), etag: 'opaque-job-etag', generation: '15', observedGeneration: '15', reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' }, template: workerTemplate(profile, image, token) }
  const scheduler = { name: workerSchedulerName(), state: 'ENABLED', schedule: '*/5 * * * *', timeZone: 'Etc/UTC', attemptDeadline: '30s', userUpdateTime: '2026-10-01T00:00:00Z', httpTarget: { uri: profile.canonicalOrigin + profile.recoverPath, httpMethod: 'POST', body: 'e30=', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Google-Cloud-Scheduler' }, oidcToken: { serviceAccountEmail: profile.dispatchServiceAccount, audience: profile.canonicalOrigin } } }
  let jobReads = 0, schedulerReads = 0, logicalNow = Date.now(); const executions = []
  const lifecycle = () => { controls.lifecycle = true; transport.now = () => { logicalNow = Math.max(logicalNow, Date.now()); return new Date(logicalNow).toISOString() } }
  const observeTerminal = rows => {
    for (const row of rows) if (row?.completionTime) logicalNow = Math.max(logicalNow, Date.parse(row.completionTime))
    return structuredClone(rows)
  }
  transport.getService = async () => ({ generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true })
  transport.assertServiceSettled = value => { assert.equal(value.generation, value.observedGeneration); assert.equal(value.terminalCondition.state, 'CONDITION_SUCCEEDED') }
  transport.assertCanonicalEntrypoint = (_profile, value) => { assert.equal(value.ingress, 'INGRESS_TRAFFIC_ALL'); assert.equal(value.invokerIamDisabled, true) }
  transport.effectiveRevision = () => 'ai-pdm-prod-local-prior'
  transport.getRevision = async () => ({ containers: [{ name: appProfile.runtime.containerName, env: [{ name: 'PDM_OPENSWX_DISPATCH_ENABLED', value: '1' }, { name: 'PDM_WORKLOAD_AUTH_CREDENTIALS', valueSource: { secretKeyRef: { secret: profile.registrySecretId, version: '9' } } }] }] })
  transport.request = async (url, options = {}) => {
    calls.push({ url, options }); assert.ok(controls.lifecycle || !options.method || options.method === 'GET' || (options.method === 'POST' && url.endsWith(':getIamPolicy')), 'readonly producer provider call')
    if (controls.denied?.(url)) throw Object.assign(Error('FORBIDDEN'), { code: 'FORBIDDEN' })
    if (url.endsWith('/userinfo')) return { email: controls.actor ?? profile.normalActor, email_verified: true, sub: 'LOCAL_TEST_SUB' }
    if (url.includes('cloudbuild.googleapis.com')) return structuredClone(controls.providerBuild ?? providerBuild)
    if (url.includes('artifactregistry.googleapis.com')) return { uri: controls.image ?? image, name: `projects/${profile.projectId}/locations/${profile.location}/repositories/aipdm-release/dockerImages/ai-pdm-openswx-worker@${image.split('@')[1]}` }
    if (url.includes('containeranalysis.googleapis.com')) { const kind = /kind="([A-Z_]+)"/u.exec(new URL(url).searchParams.get('filter'))[1]; return { occurrences: (controls.occurrences ?? occurrences).filter(row => row.kind === kind), ...(controls.pageToken ? { nextPageToken: controls.pageToken } : {}) } }
    if (url.includes('cloudscheduler.googleapis.com')) { if (url.endsWith(':pause')) scheduler.state = 'PAUSED'; if (url.endsWith(':resume')) scheduler.state = 'ENABLED'; schedulerReads++; return { ...structuredClone(scheduler), ...(controls.scheduler ?? {}), scheduleTime: `dynamic-${schedulerReads}`, ...(controls.schedulerDrift && schedulerReads > 1 ? { userUpdateTime: '2026-10-02T00:00:00Z' } : {}) } }
    if (url.includes('secretmanager.googleapis.com')) {
      if (url.endsWith(':access')) {
        const name = url.includes(profile.tokenSecretId) ? token : registry, tokenValue = 'L'.repeat(43)
        const bytes = name === token ? Buffer.from(tokenValue) : Buffer.from(JSON.stringify({ schemaVersion: 'ai-pdm.workload-credentials.v1', workloads: [{ id: profile.readerId, token: tokenValue, purposes: [profile.readerPurpose], capabilities: [profile.readerCapability] }] }))
        return { name, payload: { data: bytes.toString('base64') } }
      }
      if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/secretmanager.secretAccessor', members: [`serviceAccount:${profile.readerServiceAccount}`] }] }
      if (url.includes('/versions/')) return { name: url.slice('https://secretmanager.googleapis.com/v1/'.length), state: controls.secretState ?? 'ENABLED', etag: 'opaque-secret-etag' }
      return { name: `projects/${profile.projectNumber}/secrets/${profile.tokenSecretId}` }
    }
    if (url.includes('/roles/')) { const lifecycle = url.endsWith('aipdmOpenswxJobLifecycle'); return { name: url.slice('https://iam.googleapis.com/v1/'.length), includedPermissions: controls.rolePermissions ?? (lifecycle ? ['run.jobs.get', 'run.jobs.update', 'run.jobs.run', 'run.executions.get', 'run.executions.list', 'run.executions.cancel'] : ['run.jobs.get', 'run.executions.get', 'run.executions.list']) } }
    if (url.includes('iam.googleapis.com')) { if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/iam.serviceAccountUser', members: [`serviceAccount:aipdm-prod-deployer@${profile.projectId}.iam.gserviceaccount.com`] }] }; return { email: url.split('/').at(-1) } }
    if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/run.invoker', members: [`serviceAccount:aipdm-prod-runtime@${profile.projectId}.iam.gserviceaccount.com`] }, { role: 'projects/jenfu-platform-prod/roles/aipdmOpenswxJobReadback', members: [`serviceAccount:aipdm-prod-runtime@${profile.projectId}.iam.gserviceaccount.com`] }, { role: 'projects/jenfu-platform-prod/roles/aipdmOpenswxJobLifecycle', members: [`serviceAccount:aipdm-prod-deployer@${profile.projectId}.iam.gserviceaccount.com`] }] }
    if (url.endsWith(':run')) {
      assert.ok(controls.lifecycle); const date = Date.parse(transport.now()), name = `${workerJobName().replace(profile.projectId, profile.projectNumber)}/executions/local-${executions.length}`
      executions.push({ name, uid: 'local-execution-'+executions.length, creator: profile.normalActor, createTime: new Date(date + 10).toISOString(), completionTime: new Date(date + 20).toISOString(), succeededCount: 1, failedCount: 0, conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }], template: structuredClone(job.template.template) })
      return { name: 'projects/9536592944/locations/asia-east1/operations/local-op-'+executions.length, metadata: { '@type':'type.googleapis.com/google.cloud.run.v2.Execution', ...structuredClone(executions.at(-1)) } }
    }
    if (url.includes('/executions?')) return { executions: observeTerminal(executions) }
    if (url.includes('/executions/')) return observeTerminal([executions.find(row => row.name === url.replace('https://run.googleapis.com/v2/', ''))])[0]
    if (url.includes('logging.googleapis.com')) {
      const body = JSON.parse(options.body), execution = executions.findLast(row => body.filter.includes(row.name.split('/').at(-1))), executionId = execution.name.split('/').at(-1)
      return { entries: [{ resource: { type: 'cloud_run_job', labels: { project_id: profile.projectId, location: profile.location, job_name: profile.jobId } }, labels: { 'run.googleapis.com/execution_name': executionId }, logName: `projects/${profile.projectId}/logs/run.googleapis.com%2Fstdout`, insertId: `local-${executionId}`, timestamp: execution.completionTime, jsonPayload: { schemaVersion: 'aipdm.openswx-finite-terminal.v1', state: execution.template.containers[0].args.length ? 'isolation_verified' : 'empty', executionName: execution.template.containers[0].args.length ? null : execution.name } }] }
    }
    if (url === `https://run.googleapis.com/v2/${workerJobName()}`) { if (options.method === 'PATCH') { job.template = JSON.parse(options.body).template; job.etag += '-next' }; jobReads++; return { ...structuredClone(job), ...(controls.job ?? {}), executionCount: jobReads, ...(controls.jobDrift && jobReads > 1 ? { etag: 'changed-etag' } : {}) } }
    throw Error('UNEXPECTED_READ:' + url)
  }
  const v2 = associationRef => { const d = { ...buildOnly, schemaVersion: 'aipdm.openswx-worker-descriptor.v2', artifactMode: 'REUSE_VERIFIED', sourceRevision: currentRevision, sourceArchiveSha256: currentSourceRef.sha256, workerBuildRef: associationRef }; delete d.resourcePlanRef; return d }
  const nextAttempt = (index, priorRef) => {
    const revision = sha256(`LOCAL_TEST_SOURCE_${index}`).slice(0, 40), tree = Buffer.concat([actualTree, Buffer.from(`100644 blob ${sha256(`app-${index}`).slice(0, 40)}\tsrc/app/b19-app-only.txt\0`)]), archive = tar(manifest.entries, [{ path: 'src/app/b19-app-only.txt', mode: '100644', bytes: Buffer.from(`application ${index}\n`) }])
    sourceInputs.set(revision, { tree, archive }); frozenRevision = revision; permitted.clear(); permitted.add(revision)
    const lock = sourceLock(revision, tree, `DEV122-LOCAL-REPEAT-${index}`), lockRef = seed(`repeat-${index}-lock`, lock)
    const objectRef = seedBytes(`gs://jenfu-platform-prod-aipdm-release/source/releases/${lock.releaseId}/frozen/source.tar.gz`, gzipSync(archive, { level: 9 }))
    const input = { ...inputRef, schemaVersion: 'aipdm.openswx-worker-reuse-input.v1', sourceLockRef: lockRef, currentSourceObjectRef: objectRef, priorActivationRef: priorRef, deadlineAt: deadline(), receiptId: `LOCAL-B19-REPEAT-${index}` }; delete input.uri; delete input.sha256
    return { input, inputRef: seed(`repeat-${index}-input`, input), lock, objectRef }
  }
  const advanceReady = (saved, index) => {
    const association = saved.value, d = { ...v2(saved.ref), sourceRevision: association.sourceRevision, sourceArchiveSha256: association.sourceArchiveSha256, purpose: 'full', tokenSecretVersion: token, registrySecretVersion: registry }
    const source = JSON.parse(objects.get(association.sourceLockRef.uri).bytes)
    const templateFacts = { normalTemplateSha256: normalSha, selftestTemplateSha256: selftestSha }
    d.pausedDrainedRef = seed(`repeat-${index}-drained`, workerReceipt({ descriptor: d, kind: 'paused-drained', actor: profile.normalActor, image, template: workerTemplate(profile, image, token), observedAt: now, facts: { schedulerPaused: true, noActiveOrUnknown: true, quiescenceCompletedAt: now, drainKind: 'DAILY_DB_VERIFIED', dbAdmissionProof: { claimProof: 'AUTHENTICATED_204_SOURCE_BOUND' }, priorActivationRef: association.priorActivationRef, targetWorkerBuildRef: saved.ref } }))
    const readbackRef = seed(`repeat-${index}-resource-readback`, { schemaVersion: 'aipdm.openswx-resource-readback.v1', resourcesUnchanged: true, priorResourceApplyRef: applyRef, targetWorkerBuildRef: saved.ref })
    d.bootstrapRef = seed(`repeat-${index}-bootstrap`, workerReceipt({ descriptor: d, kind: 'bootstrap', actor: profile.normalActor, image, template: workerTemplate(profile, image, null, 'selftest'), observedAt: now, facts: { ...templateFacts, bootstrapKind: 'DAILY_REFRESH', resourceProvenance: { priorResourceApplyRef: applyRef, resourceReadbackRef: readbackRef, resourceReadbackSha256: readbackRef.sha256, resourcesUnchanged: true }, priorActivationRef: association.priorActivationRef, pausedDrainedRef: d.pausedDrainedRef, tokenSecretVersion: token, registrySecretVersion: registry } }))
    d.cloudPreflightRef = seed(`repeat-${index}-preflight`, workerReceipt({ descriptor: d, kind: 'cloud-preflight', actor: profile.normalActor, image, template: workerTemplate(profile, image, null, 'selftest'), observedAt: now, facts: { ...templateFacts, isolationVerified: true, noCad: true } }))
    const descriptorRef = seed(`repeat-${index}-full`, d), envelope = { ...capsule, sourceRevision: d.sourceRevision, releaseId: source.releaseId, sourceSha256: source.sourceSha256, sourceLockRef: association.sourceLockRef, openswxWorkerRef: descriptorRef }, capsuleRef = seedBytes(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${envelope.releaseId}/release-intent.json`, Buffer.from(`${canonicalize(envelope)}\n`))
    const activationRef = seed(`repeat-${index}-activation`, workerReceipt({ descriptor: d, kind: 'activation', actor: profile.normalActor, image, template: workerTemplate(profile, image, token), observedAt: now, previousRefs: [capsuleRef, dummy, dummy, dummy, dummy], facts: { workerStatus: 'READY', schedulerState: 'ENABLED', claimProof: { claimProof: 'AUTHENTICATED_204_SOURCE_BOUND' }, dbAdmissionProof: 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN', sourceEntryRef: build.facts.sourceHashes.find(row => row.path === 'scripts/run-openswx-metadata-job.mjs'), numericCredentials: { token, registry } } }))
    return { descriptorRef, capsuleRef, activationRef }
  }
  return { modeledReleasedAnchor, transport, objects, calls, puts, controls, seed, seedBytes, uri, input, inputRef, sourceLockRef, lock, readSource, currentSourceRef, oldSourceRef, providerBuild, occurrences, build, buildRef, buildOnlyRef, approvedRef, fullRef, full, capsuleRef, priorActivationRef, v2, lifecycle, nextAttempt, advanceReady, invoke: () => executeWorkerArtifactReuse({ transport, inputRef, readSource }) }
}
function noMutation(h) { assert.ok(h.calls.every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy'))); assert.ok(!h.calls.some(row => /:run|:pause|:resume|:addVersion|:access|:exportSBOM/u.test(row.url))) }

async function b22ReuseIamFixture(options={}) {
  const h = await harness(options), iamRevision = 'd'.repeat(40), prebuildRevision = 'f'.repeat(40), sourceCalls = []
  const readSource = (repositoryPath, revision) => {
    sourceCalls.push({ path: repositoryPath, revision })
    if (revision === iamRevision || revision === prebuildRevision) {
      assert.ok([...READBACK_IAM_PATHS, PREBUILD_IAM_SOURCE_PATH, WORKER_PROFILE_PATH, ...WORKER_SOURCE_PATHS].includes(repositoryPath), 'historical fixture reads stay in the IAM closure')
      return canonicalSource(repositoryPath)
    }
    return h.readSource(repositoryPath, revision)
  }
  Object.assign(readSource, h.readSource)
  const ref = name => ({ uri: `${profile.receiptRoot}/${name}.json`, sha256: 'a'.repeat(64) })
  h.put = async (name, value) => h.seedBytes(ref(name).uri, Buffer.from(`${canonicalize(value)}\n`))
const READBACK_IAM_PROJECT = 'jenfu-platform-prod'
const READBACK_IAM_VERIFIER = 'serviceAccount:aipdm-prod-verifier@jenfu-platform-prod.iam.gserviceaccount.com'
const READBACK_IAM_DEPLOYER = 'serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com'
const READBACK_IAM_JOB_POLICY_URL = 'https://run.googleapis.com/v2/' + workerJobName() + ':getIamPolicy'
const READBACK_IAM_PROJECT_POLICY_URL = 'https://cloudresourcemanager.googleapis.com/v1/projects/' + READBACK_IAM_PROJECT + ':getIamPolicy'

function readbackIamPlanFixture(actionFor = () => ['create']) {
  return { resource_changes: READBACK_IAM_ADDRESSES.map(address => {
    const spec = structuredClone(READBACK_IAM_SPECS[address])
    const afterUnknown = { id: true }
    if (address.startsWith('google_project_iam_custom_role.')) { spec.stage = 'GA'; spec.deleted = false; afterUnknown.name = [true] }
    return { address, mode: 'managed', provider_name: 'registry.terraform.io/hashicorp/google',
      change: { actions: actionFor(address), after: spec, after_unknown: afterUnknown } }
  }) }
}

function readbackIamRoles() {
  return [
    { name: READBACK_JOB_ROLE, permissions: ['run.executions.list', 'run.jobs.get'] },
    { name: READBACK_SCHEDULER_ROLE, permissions: ['cloudscheduler.jobs.get'] },
  ]
}
function readbackIamProjectPolicy() {
  return [
    { role: READBACK_SCHEDULER_ROLE, members: [READBACK_IAM_DEPLOYER, READBACK_IAM_VERIFIER].sort() },
    { role: 'roles/jenfu-fixture-existing-reader', members: ['serviceAccount:existing-reader@jenfu-platform-prod.iam.gserviceaccount.com'] },
  ]
}
function readbackIamUnrelatedHash(bindings) {
  const unrelated = bindings.filter(row => row.role !== READBACK_SCHEDULER_ROLE)
    .map(row => ({ ...row, members: [...(row.members ?? [])].sort() }))
    .sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
  return sha256(canonicalize(unrelated))
}
function readbackIamReadback(bindings = readbackIamProjectPolicy()) {
  return {
    roles: readbackIamRoles(),
    jobBindings: expectedReadbackJobBindings(),
    schedulerBinding: { role: READBACK_SCHEDULER_ROLE, members: [READBACK_IAM_DEPLOYER, READBACK_IAM_VERIFIER].sort(), effectiveScope: 'PROJECT_WIDE_GET' },
    unrelatedProjectBindingsSha256: readbackIamUnrelatedHash(bindings),
  }
}

async function seedReadbackIamApproval(h, { descriptorValue, descriptorRef, workerBuildRef, receiptId }) {
  const plan = readbackIamPlan(readSource, descriptorValue.sourceRevision)
  const capacityGateRef = await h.put('readback-capacity-' + receiptId, {
    project: 'AI-PDM', sourceRevision: descriptorValue.sourceRevision, status: 'PASS', observedAt: h.transport.now(),
  })
  const sourceBinding = { descriptorRef, workerBuildRef, sourceArchiveSha256: descriptorValue.sourceArchiveSha256 }
  const approvedPlanRef = await h.put('readback-approved-' + receiptId, {
    schemaVersion: 'aipdm.openswx-approved-readback-iam-plan.v1', ownerApplicationId: 'ai-pdm', status: 'APPROVED',
    releaseAuthority: true, evidenceScope: 'HUMAN_APPROVED_READBACK_IAM_PLAN', sourceRevision: descriptorValue.sourceRevision,
    authorizationStatementSha256: 'c'.repeat(64), planSha256: sha256(canonicalize(plan)), plan, ...sourceBinding, capacityGateRef,
  })
  const inputRef = await h.put('readback-input-' + receiptId, {
    schemaVersion: 'aipdm.openswx-release-readback-iam-input.v1', sourceRevision: descriptorValue.sourceRevision,
    approvedPlanRef, descriptorRef, workerBuildRef, receiptId, deadlineAt: deadline(),
  })
  return { plan, sourceBinding, approvedPlanRef, inputRef, receiptId }
}

async function seedReadbackIamReceipt(h, args) {
  const base = await seedReadbackIamApproval(h, args)
  const receiptUri = ref(base.receiptId).uri
  const binding = {
    ownerApplicationId: 'ai-pdm', actor: profile.normalActor, sourceRevision: args.descriptorValue.sourceRevision,
    ...base.sourceBinding, approvedPlanRef: base.approvedPlanRef, planSha256: sha256(canonicalize(base.plan)), receiptUri,
  }
  const binaryPlanSha256 = 'd'.repeat(64), unrelatedProjectBindingsBeforeSha256 = readbackIamUnrelatedHash(readbackIamProjectPolicy())
  const changes = [...READBACK_IAM_ADDRESSES].sort().map(address => ({ address, actions: ['create'] }))
  const commonProof = { ...binding, binaryPlanSha256, changes, requestedAt: h.transport.now(), unrelatedProjectBindingsBeforeSha256 }
  const requestRef = await h.put(base.receiptId + '-request', {
    schemaVersion: 'aipdm.openswx-release-readback-iam-request.v1', ...commonProof,
  })
  const binaryPlanReceiptRef = await h.put(base.receiptId + '-plan', {
    schemaVersion: 'aipdm.openswx-release-readback-iam-plan-binary.v1', ...commonProof,
  })
  const receiptRef = await h.put(base.receiptId, {
    schemaVersion: 'aipdm.openswx-release-readback-iam.v1', ...binding, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER',
    inputRef: base.inputRef, requestRef, binaryPlanReceiptRef, binaryPlanSha256,
    sourceArchiveSha256: args.descriptorValue.sourceArchiveSha256,
    readback: readbackIamReadback(),
    mutation: 'APPLY_THEN_READBACK', observedAt: h.transport.now(),
  })
  return { ...base, receiptRef, requestRef, binaryPlanReceiptRef }
}

const prebuildHumanApprovalBytes = Buffer.from('ew0KICAic2NoZW1hVmVyc2lvbiI6ICJhaXBkbS5kZXYxMjIuYjE1LWh1bWFuLWlhbS1hcHByb3ZhbC52MSIsDQogICJwcm9qZWN0IjogIkFJLVBETSIsDQogICJhdXRob3JpemF0aW9uU291cmNlIjogIkhVTUFOX1VTRVJfTUVTU0FHRV9JTl9DVVJSRU5UX1RIUkVBRCIsDQogICJ1c2VyVGV4dCI6ICLmoLjlh4YgMiDpoIXoo5zmrIrvvIznubznuozkuIrnt5osIOS9v+eUqOePvuacieWAi+a4rOippuW4s+iZnyIsDQogICJzdGF0dXMiOiAiQVBQUk9WRUQiLA0KICAiZW52aXJvbm1lbnQiOiAiUFJPRFVDVElPTiIsDQogICJwcm9qZWN0SWQiOiAiamVuZnUtcGxhdGZvcm0tcHJvZCIsDQogICJwcm9qZWN0TnVtYmVyIjogIjk1MzY1OTI5NDQiLA0KICAicHJpbmNpcGFsIjogInNlcnZpY2VBY2NvdW50OmFpcGRtLXByb2QtdmVyaWZpZXJAamVuZnUtcGxhdGZvcm0tcHJvZC5pYW0uZ3NlcnZpY2VhY2NvdW50LmNvbSIsDQogICJyb2xlSWQiOiAiYWlwZG1EZXYxMjJQcmVidWlsZExpc3QiLA0KICAicGVybWlzc2lvbnMiOiBbDQogICAgImNsb3VkYnVpbGQuYnVpbGRzLmxpc3QiLA0KICAgICJzZXJ2aWNldXNhZ2Uuc2VydmljZXMudXNlIg0KICBdLA0KICAicmVzb3VyY2VzIjogWw0KICAgICJnb29nbGVfcHJvamVjdF9pYW1fY3VzdG9tX3JvbGUucHJlYnVpbGRfbGlzdF9yZWFkYmFjayIsDQogICAgImdvb2dsZV9wcm9qZWN0X2lhbV9tZW1iZXIudmVyaWZpZXJfcHJlYnVpbGRfbGlzdF9yZWFkYmFjayINCiAgXSwNCiAgInZpc2liaWxpdHkiOiAiUFJPSkVDVF9XSURFX0JVSUxEX0xJU1RfTUVUQURBVEE7UVVFUllfRklMVEVSX05PVF9JQU1fQk9VTkRBUlkiLA0KICAib3JpZ2luYWxQcm9wb3NhbEZyZWV6ZVNoYTI1NiI6ICI4ZjUzMGUyNzg0NzIxOTBlYTBlNjEyMDQ1MWZjN2I5MDk1YzcxNDY2ZDZmMzgwZDY0NGU4MGNmYWYwZWJjMDEyIiwNCiAgIm9yaWdpbmFsUHJvcG9zYWxRY1NoYTI1NiI6ICIxY2Q2YzdlNTMxNjBjNmZkYmJjOGM4ZWFhNjQ0MGNhMzA2ZTY3M2VlYzg0YThiNGYwOTNmOGViZTZiMDI3NDc3IiwNCiAgInN0YW5kaW5nU2NvcGUiOiAiQUktUERNIHByb2R1Y3Rpb24gc291cmNlL1BSL0NJL2J1aWxkL2Jvb3RzdHJhcC9mdWxsIHJlbGVhc2UgYW5kIHZlcmlmaWNhdGlvbjsgb3JpZ2luYWwxMi9vcmlnaW5hbDUgdW5jaGFuZ2VkOyBubyBjcm9zcy1wcm9qZWN0IGRldmVsb3BtZW50IiwNCiAgInRlc3RBY2NvdW50UmV1c2UiOiAiRVhJU1RJTkdfVEVTVF9BQ0NPVU5UU19PTkxZO05PX0FDQ09VTlRfQ1JFQVRJT05fT1JfQ0FQQUJJTElUWV9DSEFOR0UiLA0KICAibmF0aXZlRjAxRiI6ICJVU0VSX1BST0RVQ1RJT05fVkFMSURBVElPTl9QRU5ESU5HIiwNCiAgIm9ic2VydmVkQXQiOiAiMjAyNi0xMC0wN1QwNjoyNjoyMS41NDkzMTkrMDA6MDAiDQp9DQo=', 'base64')
function prebuildTerraformFixture() {
  return { resource_changes: [...readbackIamPlanFixture(() => ['no-op']).resource_changes,
    ...PREBUILD_IAM_ADDRESSES.map(address => ({ address, mode: 'managed', provider_name: 'registry.terraform.io/hashicorp/google',
      change: { actions: ['create'], after: structuredClone(PREBUILD_IAM_SPECS[address]), after_unknown: { id: true } } }))] }
}
async function seedPrebuildIamContinuation(h, supplementalIamReadbackRef, name = 'prebuild-iam-continuation') {
  assert.equal(sha256(prebuildHumanApprovalBytes), PREBUILD_IAM_HUMAN_APPROVAL_SHA256)
  const receiptUri = ref(name).uri, times = Date.now(), at = delta => new Date(times + delta).toISOString()
  const humanApprovalRef = { uri: ref(name + '-human').uri, sha256: PREBUILD_IAM_HUMAN_APPROVAL_SHA256 }
  h.objects.set(humanApprovalRef.uri, { bytes: prebuildHumanApprovalBytes, value: JSON.parse(prebuildHumanApprovalBytes), ref: humanApprovalRef, metadata: { generation: '1' } })
  const sourceRevision = 'f'.repeat(40), sourceTree = '1'.repeat(40), sourceSha256 = '2'.repeat(64)
  const source = { schemaVersion: 'jenfu.dev012.owner-source-lock.v1', ownerApplicationId: 'ai-pdm', repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main',
    releaseId: 'DEV122-PREBUILD-IAM-001', sourceRevision, sourceTree, sourceSha256, migrationManifestSha256: '3'.repeat(64), clean: true,
    remoteRef: 'refs/heads/main', remoteRevision: sourceRevision, status: 'SOURCE_FROZEN', releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', observedAt: at(-1500) }
  const sourceProofRef = (await h.transport.putJson(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${source.releaseId}/source-lock.json`, source)).ref
  const plan = prebuildIamContinuationPlan(readSource, sourceRevision), planSha256 = sha256(canonicalize(plan))
  const planBinding = { ownerApplicationId: 'ai-pdm', sourceRevision, sourceTree, sourceSha256, sourceProofRef, supplementalIamReadbackRef, humanApprovalRef }
  const approvedPlanRef = await h.put(name + '-approved', { schemaVersion: 'aipdm.openswx-approved-prebuild-readback-iam-plan.v1', ...planBinding,
    status: 'APPROVED', releaseAuthority: true, evidenceScope: 'HUMAN_APPROVED_PREBUILD_READBACK_IAM_PLAN', planSha256, plan })
  const beforePolicy = { bindings: readbackIamProjectPolicy(), etag: 'recorded-before', version: 3 }
  const afterPolicy = { bindings: [...readbackIamProjectPolicy(), { role: PREBUILD_IAM_ROLE, members: [READBACK_IAM_VERIFIER] }], etag: 'recorded-after', version: 3 }
  const role = { name: PREBUILD_IAM_ROLE, stage: 'GA', includedPermissions: [...PREBUILD_IAM_PERMISSIONS] }
  const policy = (phase, projectPolicy, prebuildRole, observedAt) => ({ schemaVersion: 'aipdm.openswx-prebuild-readback-iam-policy.v1', ownerApplicationId: 'ai-pdm', projectId: READBACK_IAM_PROJECT,
    actor: profile.normalActor, phase, observedAt, projectPolicy, prebuildRole })
  const beforeReadbackRef = await h.put(name + '-before', policy('BEFORE', beforePolicy, null, at(-1000)))
  const afterReadbackRef = await h.put(name + '-after', policy('AFTER', afterPolicy, role, at(-250)))
  const binaryBytes = Buffer.from('RECORDED_FROZEN_TERRAFORM_BINARY_FIXTURE_NOT_A_PRODUCTION_PLAN'), binaryPlanSha256 = sha256(binaryBytes)
  const binaryPlanRef = { uri: receiptUri.replace(/\.json$/u, '-plan.tfplan'), sha256: binaryPlanSha256 }
  h.objects.set(binaryPlanRef.uri, { bytes: binaryBytes, ref: binaryPlanRef, metadata: { generation: '1' } })
  const terraformPlanRef = await h.put(name + '-terraform-plan', prebuildTerraformFixture())
  const binding = { ...planBinding, actor: profile.normalActor, approvedPlanRef, planSha256, receiptUri }
  const request = { ...binding, binaryPlanRef, binaryPlanSha256, terraformPlanRef, changes: assertPrebuildIamTerraformPlan(prebuildTerraformFixture()),
    requestedAt: at(-500), deadlineAt: at(120000), beforeReadbackRef }
  const requestRef = await h.put(name + '-request', { schemaVersion: 'aipdm.openswx-prebuild-readback-iam-request.v1', ...request })
  const binaryPlanReceiptRef = await h.put(name + '-plan', { schemaVersion: 'aipdm.openswx-prebuild-readback-iam-plan-binary.v1', ...request })
  const continuationRef = await h.put(name, { schemaVersion: 'aipdm.openswx-prebuild-readback-iam-continuation.v1', ...binding, status: 'APPLIED', evidenceScope: 'PRODUCTION_PROVIDER',
    requestRef, binaryPlanReceiptRef, binaryPlanSha256, beforeReadbackRef, afterReadbackRef,
    unrelatedProjectBindingsBeforeSha256: readbackIamUnrelatedHash(beforePolicy.bindings), unrelatedProjectBindingsAfterSha256: readbackIamUnrelatedHash(afterPolicy.bindings),
    observedAt: at(-100), mutation: 'UNKNOWN_APPLY_THEN_READBACK' })
  return { continuationRef, sourceProofRef, approvedPlanRef, requestRef, binaryPlanReceiptRef, beforeReadbackRef, afterReadbackRef, binaryPlanRef, terraformPlanRef, role, afterPolicy }
}
  const descriptorValue = { ...JSON.parse(h.objects.get(h.buildOnlyRef.uri).bytes), sourceRevision: iamRevision }
  const descriptorRef = await h.put('b22-original-iam-descriptor', descriptorValue)
  const build = { ...structuredClone(h.build), sourceRevision: iamRevision, previousRefs: [descriptorRef] }
  build.facts.scan.rawHighOrCriticalVulnerabilityCount = 0
  const workerBuildRef = await h.put('b22-original-iam-build', build)
  const iam = await seedReadbackIamReceipt(h, { descriptorValue, descriptorRef, workerBuildRef, receiptId: 'b22-original-iam' })
  const proof = await seedPrebuildIamContinuation(h, iam.receiptRef, 'b22-prebuild-iam')
  assert.equal(JSON.parse(h.objects.get(proof.continuationRef.uri).bytes).sourceRevision, prebuildRevision)
  const resourceReadbackRef = await h.put('b22-prior-resource-readback', { resourcesUnchanged: true, supplementalIamReadbackRef: iam.receiptRef, prebuildIamContinuationRef: proof.continuationRef })
  const priorBootstrap = JSON.parse(h.objects.get(h.full.bootstrapRef.uri).bytes)
  priorBootstrap.facts.bootstrapKind = 'DAILY_REFRESH'
  priorBootstrap.facts.resourceProvenance = { priorResourceApplyRef: priorBootstrap.facts.resourceApplyRef, resourceReadbackRef, resourceReadbackSha256: resourceReadbackRef.sha256,
    resourcesUnchanged: true, supplementalIamReadbackRef: iam.receiptRef, supplementalIamSourceRevision: iamRevision, prebuildIamContinuationRef: proof.continuationRef }
  priorBootstrap.facts.priorActivationRef = h.priorActivationRef
  const priorDrain = JSON.parse(h.objects.get(h.full.pausedDrainedRef.uri).bytes)
  Object.assign(priorDrain.facts, { drainKind: 'DAILY_DB_VERIFIED', dbAdmissionProof: { claimProof: 'AUTHENTICATED_204_SOURCE_BOUND' }, priorActivationRef: h.priorActivationRef, targetWorkerBuildRef: h.buildRef })
  const pausedDrainedRef = await h.put('b22-prior-drained', priorDrain); priorBootstrap.facts.pausedDrainedRef = pausedDrainedRef
  const bootstrapRef = await h.put('b22-prior-bootstrap', priorBootstrap), full = { ...h.full, bootstrapRef, pausedDrainedRef }, fullRef = await h.put('b22-prior-full', full)
  const capsule = JSON.parse(h.objects.get(h.capsuleRef.uri).bytes); capsule.openswxWorkerRef = fullRef
  const capsuleRef = h.seedBytes(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${capsule.releaseId}/release-intent.json`, Buffer.from(`${canonicalize(capsule)}\n`))
  const activation = JSON.parse(h.objects.get(h.priorActivationRef.uri).bytes); activation.previousRefs[0] = capsuleRef
  const activationRef = await h.put('b22-prior-activation', activation), inputRef = await h.put('b22-reuse-input', { ...h.input, priorActivationRef: activationRef })
  const originalRequest = h.transport.request
  h.transport.request = async (url, options = {}) => {
    if ([READBACK_JOB_ROLE, READBACK_SCHEDULER_ROLE, PREBUILD_IAM_ROLE].some(role => url === `https://iam.googleapis.com/v1/${role}`)) {
      h.calls.push({ url, options }); assert.ok(!options.method || options.method === 'GET')
      const includedPermissions = url.endsWith(READBACK_JOB_ROLE) ? ['run.jobs.get', 'run.executions.list'] : url.endsWith(READBACK_SCHEDULER_ROLE) ? ['cloudscheduler.jobs.get'] : [...PREBUILD_IAM_PERMISSIONS]
      return { name: url.slice('https://iam.googleapis.com/v1/'.length), deleted: false, stage: 'GA', includedPermissions }
    }
    if (url === `https://run.googleapis.com/v2/${workerJobName()}:getIamPolicy`) { h.calls.push({ url, options }); return { bindings: expectedReadbackJobBindings() } }
    if (url === READBACK_IAM_PROJECT_POLICY_URL) {
      h.calls.push({ url, options }); assert.equal(options.method, 'POST'); assert.deepEqual(options.headers, { 'content-type': 'application/json' }); assert.equal(options.body, JSON.stringify({ options: { requestedPolicyVersion: 3 } }))
      return structuredClone(proof.afterPolicy)
    }
    return originalRequest(url, options)
  }
  return { ...h, inputRef, readSource, sourceCalls, iam, proof, iamRevision, prebuildRevision, iamBootstrap: priorBootstrap, iamDescriptor: full,
    originalSnapshot: new Map([...h.objects].map(([uri, row]) => [uri, Buffer.from(row.bytes)])) }
}

test('B23 prebuild binary caller keeps own exact path keys and raw hash closed', async () => {
  for (const [vector, code] of [['bucket', 'IMMUTABLE_REF_INVALID'], ['path', 'OPENSWX_PREBUILD_IAM_CONTINUATION_INVALID'], ['extra-key', 'IMMUTABLE_REF_INVALID'], ['hash', 'OPENSWX_PREBUILD_IAM_CONTINUATION_INVALID'], ['raw-bytes', 'OPENSWX_PREBUILD_IAM_CONTINUATION_INVALID']]) {
    const h = await b22ReuseIamFixture()
    const admitted = await executeWorkerArtifactReuse({ transport: h.transport, inputRef: h.inputRef, readSource: h.readSource })
    assert.equal(admitted.value.status, 'PASS', `${vector}: actual READY reuse admits the retained historical source before corruption`)
    noMutation(h)
    const bootstrap = structuredClone(h.iamBootstrap)
    if (vector === 'raw-bytes') {
      const row = h.objects.get(h.proof.binaryPlanRef.uri)
      h.objects.set(h.proof.binaryPlanRef.uri, { ...row, bytes: Buffer.concat([row.bytes, Buffer.from('corrupt')]) })
    } else {
      const request = JSON.parse(h.objects.get(h.proof.requestRef.uri).bytes)
      if (vector === 'bucket') request.binaryPlanRef.uri = request.binaryPlanRef.uri.replace('jenfu-platform-prod-aipdm-release', 'jenfu-platform-prod-sibling-release')
      if (vector === 'path') request.binaryPlanRef.uri = request.binaryPlanRef.uri.replace('-plan.tfplan', '-other.tfplan')
      if (vector === 'extra-key') request.binaryPlanRef.extra = true
      if (vector === 'hash') request.binaryPlanRef.sha256 = '0'.repeat(64)
      const requestRef = await h.put('b22-prebuild-iam-request', request)
      const binaryPlanReceiptRef = await h.put('b22-prebuild-iam-plan', { ...request, schemaVersion: 'aipdm.openswx-prebuild-readback-iam-plan-binary.v1' })
      const continuation = JSON.parse(h.objects.get(h.proof.continuationRef.uri).bytes)
      const continuationRef = await h.put('b22-prebuild-iam', { ...continuation, requestRef, binaryPlanReceiptRef })
      const resource = JSON.parse(h.objects.get(bootstrap.facts.resourceProvenance.resourceReadbackRef.uri).bytes)
      const resourceReadbackRef = await h.put('b22-prior-resource-readback', { ...resource, prebuildIamContinuationRef: continuationRef })
      Object.assign(bootstrap.facts.resourceProvenance, { resourceReadbackRef, resourceReadbackSha256: resourceReadbackRef.sha256, prebuildIamContinuationRef: continuationRef })
    }
    const read = h.transport.readBytes; let binaryReads = 0
    h.transport.readBytes = async (uri, ...args) => { if (uri === h.proof.binaryPlanRef.uri) binaryReads++; return read(uri, ...args) }
    const writes = h.puts.length, calls = h.calls.length
    await assert.rejects(readBootstrapSupplementalIam(h.transport, bootstrap, h.iamDescriptor, profile, h.readSource, currentRevision), { code })
    assert.equal(binaryReads, vector === 'raw-bytes' ? 1 : 0, `${vector}: validation precedes binary GET unless verifying its actual bytes`)
    assert.equal(h.puts.length, writes); noMutation({ calls: h.calls.slice(calls) }); noMutation(h)
  }
})
test('B22 reuse forwards supplemental IAM readSource through actual READY collection', async t => {
  const h = await b22ReuseIamFixture(), writes = h.puts.length
  let saved
  try { saved = await executeWorkerArtifactReuse({ transport: h.transport, inputRef: h.inputRef, readSource: h.readSource }) }
  catch (error) {
    const publications = h.puts.slice(writes)
    t.diagnostic(JSON.stringify({ witness: 'B22_REUSE_ACTUAL_CALLEE_FAILURE', name: error.name, code: error.code ?? null, message: error.message, stack: error.stack, newPublications: publications.length,
      immutablePreAssociationEvidence: publications.filter(uri => !uri.endsWith('-association.json')), associationPublications: publications.filter(uri => uri.endsWith('-association.json')).length,
      sourceReaderCalls: h.sourceCalls.filter(row => READBACK_IAM_PATHS.includes(row.path)), providerCalls: h.calls.map(row => ({ url: row.url, method: row.options.method ?? 'GET' })) }))
    noMutation(h)
    assert.ok(publications.every(uri => uri.startsWith(`${profile.receiptRoot}/`) && !uri.endsWith('-association.json')), 'failed producer may retain own immutable pre-association evidence only')
    if ((error instanceof TypeError && error.message.includes('readSource is not a function')) || error.code === 'OPENSWX_READY_MUTATION_DENIED') assert.equal(publications.length, 0, 'early context/policy failure must publish zero evidence')
    throw error
  }
  assert.equal(saved.value.status, 'PASS')
  assert.ok(h.sourceCalls.some(row => row.revision === h.iamRevision && READBACK_IAM_PATHS.includes(row.path)))
  assert.ok(h.sourceCalls.some(row => row.revision === currentRevision && READBACK_IAM_PATHS.includes(row.path)))
  assert.equal(JSON.parse(h.objects.get(h.proof.continuationRef.uri).bytes).sourceRevision, h.prebuildRevision)
  assert.ok(h.calls.some(row => row.url === 'https://cloudresourcemanager.googleapis.com/v1/projects/jenfu-platform-prod:getIamPolicy' && row.options.method === 'POST'))
  const ready = await h.transport.readJson(saved.value.resourceAssociation.readbackRef)
  assert.equal(ready.value.schedulerState, 'ENABLED'); assert.equal(ready.value.quiescenceClaimed, false); assert.equal(ready.value.mutationPerformed, false)
  const projectPolicyUrl = 'https://cloudresourcemanager.googleapis.com/v1/projects/jenfu-platform-prod:getIamPolicy'
  const policyIndex = ready.value.providerReadbackRefs.findIndex(row => row.url === projectPolicyUrl)
  assert.ok(policyIndex >= 0, 'positive proof must contain the actual CRM policy observation')
  const invalidRows = [
    ...[projectPolicyUrl.replace('jenfu-platform-prod', 'sibling-project'), projectPolicyUrl.replace('jenfu-platform-prod', '9536592944'),
      projectPolicyUrl.replace('/v1/', '/v2/'), projectPolicyUrl.replace(':getIamPolicy', ':setIamPolicy'), projectPolicyUrl + '?alternate=1', projectPolicyUrl + '#fragment',
      projectPolicyUrl.replace('jenfu-platform-prod', 'jenfu%2Dplatform%2Dprod'), projectPolicyUrl.replace('/projects/', '/projects//')].map(url => ({ mutate: row => { row.url = url }, code: 'OPENSWX_REUSE_READY_PROOF_INVALID' })),
    { mutate: row => { row.ref.uri = 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-OUTSIDE/proof.json' }, code: 'IMMUTABLE_REF_INVALID' },
    { mutate: row => { row.ref.uri = row.ref.uri.replace('jenfu-platform-prod-aipdm-release', 'sibling-release') }, code: 'IMMUTABLE_REF_INVALID' },
    { mutate: row => { row.ref.sha256 = 'a'.repeat(63) }, code: 'IMMUTABLE_REF_INVALID' },
    { mutate: row => { row.extra = true }, code: 'OPENSWX_REUSE_SCHEMA_INVALID' },
  ]
  for (const [index, { mutate, code }] of invalidRows.entries()) {
    const tampered = structuredClone(ready.value); mutate(tampered.providerReadbackRefs[policyIndex])
    const proofRef = h.seed(`b22-invalid-policy-proof-${index}`, tampered)
    const associationRef = h.seed(`b22-invalid-policy-association-${index}`, { ...saved.value, resourceAssociation: { ...saved.value.resourceAssociation, readbackRef: proofRef } })
    const count = h.puts.length, calls = h.calls.length
    await assert.rejects(resolveWorkerArtifact({ transport: h.transport, descriptor: h.v2(associationRef), profile, readSource: h.readSource }), { code })
    assert.equal(h.puts.length, count, 'hash-correct rejected proof/association inputs publish no new PASS')
    assert.equal(h.calls.length, calls, 'pure resolver rejection performs no lower provider request')
  }
  for (const [uri, bytes] of h.originalSnapshot) assert.ok(h.objects.get(uri).bytes.equals(bytes), uri)
  noMutation(h)
  for (const defect of ['current-source-drift', 'provider-denied']) {
    const bad = await b22ReuseIamFixture(), count = bad.puts.length, reader = bad.readSource, request = bad.transport.request
    const badReader = (repositoryPath, revision) => {
      const bytes = reader(repositoryPath, revision)
      return defect === 'current-source-drift' && repositoryPath === READBACK_IAM_PATHS[0] && revision === currentRevision ? Buffer.concat([bytes, Buffer.from('# changed current IAM package\n')]) : bytes
    }
    Object.assign(badReader, reader)
    if (defect === 'provider-denied') bad.transport.request = async (url, options) => {
      if (url === `https://iam.googleapis.com/v1/${READBACK_JOB_ROLE}`) throw Object.assign(Error('FORBIDDEN'), { code: 'FORBIDDEN' })
      return request(url, options)
    }
    await assert.rejects(executeWorkerArtifactReuse({ transport: bad.transport, inputRef: bad.inputRef, readSource: badReader }), { code: defect === 'current-source-drift' ? 'OPENSWX_IAM_SOURCE_DRIFT' : 'FORBIDDEN' })
    assert.equal(bad.puts.length, count); noMutation(bad)
  }
})
test('B19-01/02 LOCAL_TEST original v1 identity stays immutable; app-only association retains actual leaf and timestamps', async () => {
  const h = await harness(), originalBytes = new Map([...h.objects].map(([uri, row]) => [uri, Buffer.from(row.bytes)]))
  const legacy = await resolveWorkerArtifact({ transport: h.transport, descriptor: h.full, profile, readSource: h.readSource })
  assert.equal(legacy.currentAssociation, null); assert.deepEqual(legacy.originBuild, h.build)
  const saved = await h.invoke(), d = h.v2(saved.ref); assertWorkerDescriptor(d, profile, sha256(profileBytes), currentRevision)
  assert.equal(h.capsuleRef.uri, 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-LOCAL-READY/release-intent.json')
  assert.ok(h.objects.get(h.capsuleRef.uri).bytes.toString('utf8').endsWith('\n'), 'normal release capsule uses actual canonical wire bytes')
  const artifact = await resolveWorkerArtifact({ transport: h.transport, descriptor: d, profile, readSource: h.readSource })
  const readyRow = await h.transport.readJson(saved.value.resourceAssociation.readbackRef)
  assert.deepEqual(Object.keys(readyRow.value.numericCredentials), ['registry', 'token'], 'actual canonical wire order differs from semantic metadata order')
  assert.deepEqual(readyRow.value.secretMetadata.map(row => row.name), [token, registry])
  for (const [index, mutate] of [rows => rows.reverse(), rows => { rows[1] = rows[0] }, rows => rows.pop()].entries()) {
    const tampered = structuredClone(readyRow.value); mutate(tampered.secretMetadata)
    const proofRef = h.seed(`ready-order-invalid-${index}`, tampered)
    const associationRef = h.seed(`association-ready-order-invalid-${index}`, { ...saved.value, resourceAssociation: { ...saved.value.resourceAssociation, readbackRef: proofRef } })
    const writes = h.puts.length
    await assert.rejects(resolveWorkerArtifact({ transport: h.transport, descriptor: h.v2(associationRef), profile, readSource: h.readSource }), { code: 'OPENSWX_REUSE_READY_PROOF_INVALID' })
    assert.equal(h.puts.length, writes, 'invalid metadata must not publish a new PASS')
  }
  assert.equal(saved.value.sourceRevision, currentRevision); assert.equal(artifact.originBuild.sourceRevision, oldRevision); assert.equal(artifact.image, image)
  assert.deepEqual(artifact.originBuild, h.build); assert.deepEqual(saved.value.artifactOrigin.originalBuildOnlyDescriptorRef, h.buildOnlyRef)
  assert.deepEqual(saved.value.artifactOrigin.priorReadyFullDescriptorRef, h.fullRef); assert.deepEqual(saved.value.artifactOrigin.originalApprovedResourcePlanRef, h.approvedRef)
  for (const [uri, bytes] of originalBytes) assert.ok(h.objects.get(uri).bytes.equals(bytes), uri)
  const replay = await h.invoke(); assert.deepEqual(replay.ref, saved.ref); assert.equal(replay.value.observedAt, saved.value.observedAt)
  noMutation(h)
})
test('B21 LOCAL_TEST genuine Git archive preserves raw LF COPY bytes under CRLF host configuration', { concurrency: false }, t => {
  // Windows CI may expose tmpdir through an 8.3 alias; bind the actual fixture root used by Git.
  const fixtureParent = realpathSync.native(tmpdir())
  const fixture = realpathSync.native(mkdtempSync(path.join(fixtureParent, 'ai-pdm-b21-git-archive-')))
  const envNames = ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_KEY_1', 'GIT_CONFIG_VALUE_1', 'GIT_CONFIG_KEY_2', 'GIT_CONFIG_VALUE_2']
  const previousEnv = new Map(envNames.map(name => [name, process.env[name]]))
  const fixtureGit = args => {
    const result = spawnSync('git', ['-c', 'core.longpaths=true', ...args], { cwd: fixture, encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    assert.equal(result.status, 0, result.stderr?.toString('utf8')); return result.stdout
  }
  t.diagnostic(JSON.stringify({ project: 'AI-PDM', purpose: 'B21 isolated Git archive byte regression', port: null, owningProcess: process.pid,
    temporaryPath: fixture, PDM_DATA_DIR: 'UNUSED_NO_APP_IMPORT', PDM_REPOSITORY_DIR: fixture, mutationScope: 'TASK_OWNED_GIT_FIXTURE_ONLY', cleanupCondition: 'finally restores environment and removes exact fixture' }))
  try {
    fixtureGit(['init', '--quiet'])
    const iamPaths = [...READBACK_IAM_PATHS, PREBUILD_IAM_SOURCE_PATH]
    const deniedHistoryPaths = ['infra/google-cloud/dev-122-openswx-release-readback-sibling/prebuild-list-readback.tf',
      `${path.posix.dirname(PREBUILD_IAM_SOURCE_PATH)}/different-readback.tf`]
    for (const name of [...iamPaths, ...deniedHistoryPaths]) {
      const target = path.join(fixture, name); mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, iamPaths.includes(name) ? canonicalSource(name) : Buffer.from('AI-PDM isolated denied historical path fixture\n'))
    }
    for (const row of manifest.entries) {
      const target = path.join(fixture, row.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, canonicalSource(row.path))
    }
    fixtureGit(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'add', '--all'])
    for (const row of manifest.entries) fixtureGit(['update-index', row.mode === '100755' ? '--chmod=+x' : '--chmod=-x', '--', row.path])
    fixtureGit(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '-c', 'user.name=AI-PDM B21 fixture', '-c', 'user.email=b21-fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'AI-PDM isolated B21 COPY fixture'])
    const historicalRevision = fixtureGit(['rev-parse', 'HEAD']).toString('utf8').trim()
    const currentMarker = path.join(fixture, 'src/app/b23-native-reader-fixture.txt')
    mkdirSync(path.dirname(currentMarker), { recursive: true }); writeFileSync(currentMarker, 'AI-PDM isolated current revision fixture\n')
    fixtureGit(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'add', '--all'])
    fixtureGit(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '-c', 'user.name=AI-PDM B21 fixture', '-c', 'user.email=b21-fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'AI-PDM isolated B23 historical reader fixture'])
    const revision = fixtureGit(['rev-parse', 'HEAD']).toString('utf8').trim()
    process.env.GIT_CONFIG_COUNT = '3'; process.env.GIT_CONFIG_KEY_0 = 'core.autocrlf'; process.env.GIT_CONFIG_VALUE_0 = 'true'
    process.env.GIT_CONFIG_KEY_1 = 'core.eol'; process.env.GIT_CONFIG_VALUE_1 = 'crlf'
    process.env.GIT_CONFIG_KEY_2 = 'core.longpaths'; process.env.GIT_CONFIG_VALUE_2 = 'true'
    for (const createReader of [createContinuousReleaseSourceReader, createPrerequisiteSourceReader, createBootstrapSourceReader]) {
      t.diagnostic('Native source ingress: ' + createReader.name)
      assert.throws(() => createReader(fixture)(WORKER_PROFILE_PATH, historicalRevision), { code: 'SOURCE_CHECKOUT_NOT_FROZEN' }, 'first source cannot silently bind a historical checkout')
      const reader = createReader(fixture)
      assert.ok(reader(WORKER_PROFILE_PATH, revision).equals(canonicalSource(WORKER_PROFILE_PATH)), 'native bootstrap first read must bind the frozen current source')
      reader.assertCurrentFrozen()
      const inputs = workerInputManifest(reader.readTree(revision), reader, revision)
      assert.equal(inputs.entries.length, 37); assert.deepEqual(inputs.entries, manifest.entries)
      assert.notEqual(historicalRevision, revision)
      assert.throws(() => reader(PREBUILD_IAM_SOURCE_PATH, historicalRevision), { code: 'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID' })
      assert.throws(() => prebuildIamContinuationPlan(reader, historicalRevision), { code: 'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID' })
      reader.authorizeOrigin(historicalRevision)
      assert.equal(reader.readTreeId(revision), fixtureGit(['rev-parse', revision + '^{tree}']).toString().trim())
      const historicalReader = reader.createHistoricalReader(historicalRevision)
      assert.ok(historicalReader(WORKER_PROFILE_PATH, historicalRevision).equals(canonicalSource(WORKER_PROFILE_PATH)))
      assert.ok(reader.readImmutableArchive(historicalRevision).equals(fixtureGit(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', '--prefix=source/', historicalRevision])))
      assert.throws(() => historicalReader.assertCurrentFrozen(), { code: 'SOURCE_CHECKOUT_NOT_FROZEN' })
      const nativePrebuild = reader(PREBUILD_IAM_SOURCE_PATH, historicalRevision)
      assert.ok(nativePrebuild.equals(canonicalSource(PREBUILD_IAM_SOURCE_PATH)), 'admitted prebuild source must preserve genuine Git blob bytes')
      const nativePlan = prebuildIamContinuationPlan(reader, historicalRevision)
      assert.deepEqual(nativePlan, prebuildIamContinuationPlan(canonicalSource, historicalRevision), 'actual prebuild callee must consume the exact admitted five-file closure')
      assert.equal(nativePlan.sourceHashes.length, 5)
      assert.equal(nativePlan.sourceHashes.find(row => row.path === PREBUILD_IAM_SOURCE_PATH).sha256, sha256(nativePrebuild))
      for (const name of deniedHistoryPaths) {
        assert.ok(fixtureGit(['show', `${historicalRevision}:${name}`]).length > 0, 'denied path must exist as a genuine historical Git blob')
        assert.throws(() => reader(name, historicalRevision), { code: 'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID' })
      }
      const unadmittedReader = createWorkerGitReader(fixture, revision)
      assert.throws(() => unadmittedReader(PREBUILD_IAM_SOURCE_PATH, historicalRevision), { code: 'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID' })
      const hostArchive = fixtureGit(['archive', '--format=tar', '--prefix=source/', revision])
      assert.throws(() => assertWorkerArchive(hostArchive, inputs.entries), { code: 'OPENSWX_REUSE_ARCHIVE_INPUT_MISMATCH' }, 'the real unpinned host archive must reproduce the byte defect')
      const canonicalArchive = fixtureGit(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', '--prefix=source/', revision])
      const actualArchive = reader.readArchive(revision)
      assert.ok(actualArchive.equals(canonicalArchive), 'reader must return exact canonical Git archive bytes, without normalization')
      assert.equal(assertWorkerArchive(actualArchive, inputs.entries).inputCount, 37)
      const originalMarker = reader('src/app/b23-native-reader-fixture.txt', revision)
      const changedCopy = reader('src/app/b23-native-reader-fixture.txt', revision); changedCopy.fill(0)
      assert.ok(reader('src/app/b23-native-reader-fixture.txt', revision).equals(originalMarker), 'cached blobs return independent bytes')
      writeFileSync(currentMarker, 'LOCAL dirty fixture after blob was cached\n')
      assert.throws(() => reader.readArchive(revision), { code: 'SOURCE_CHECKOUT_NOT_FROZEN' }, 'blob reuse cannot bypass fresh checkout checks')
      writeFileSync(currentMarker, originalMarker)
      reader.assertCurrentFrozen()
    }
  } finally {
    for (const [name, value] of previousEnv) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
    assert.equal(path.dirname(fixture), fixtureParent); assert.ok(path.basename(fixture).startsWith('ai-pdm-b21-git-archive-'))
    rmSync(fixture, { recursive: true, force: true })
  }
})
test('B19-03/04 LOCAL_TEST complete canonical LF COPY closure rejects extra/missing/mode/CRLF/recipe controls', () => {
  assert.equal(manifest.entries.length, 37)
  assert.equal(manifest.entries.find(row => row.path.endsWith('/Dockerfile')).sha256, 'fba58398d3cae136ac1f1dfa04a235dd5f0f6463481096ac26fe4f692c4dd2ba')
  assertWorkerArchive(gzipSync(oldTar), manifest.entries)
  const unicodeRow = actualTree.toString('utf8').split('\0').find(row => /[^\x00-\x7F]/u.test(row))
  assert.ok(unicodeRow, 'regression must use an actual nonworker Unicode Git row')
  const unicodePath = unicodeRow.slice(unicodeRow.indexOf('\t') + 1)
  assert.ok(!unicodePath.startsWith('scripts/lib/openswx-reader/'))
  assert.deepEqual(workerInputManifest(actualTree, sourceReader, oldRevision), manifest)
  assert.deepEqual(workerInputManifest(Buffer.concat([actualTree, Buffer.from(`${unicodeRow}\0`)]), sourceReader, oldRevision), manifest)
  assertWorkerArchive(gzipSync(tar(manifest.entries, [{ path: unicodePath, mode: '100644', bytes: canonicalSource(unicodePath) }])), manifest.entries)
  for (const suffix of ['../escape', './escape', '/escape', '核准.txt']) {
    const copiedPath = `scripts/lib/openswx-reader/${suffix}`
    assert.throws(() => workerInputManifest(Buffer.concat([actualTree, Buffer.from(`100644 blob ${'f'.repeat(40)}\t${copiedPath}\0`)]), sourceReader, oldRevision), { code: 'OPENSWX_REUSE_TREE_INVALID' })
    assert.throws(() => assertWorkerArchive(gzipSync(tar(manifest.entries, [{ path: copiedPath, mode: '100644', bytes: Buffer.from('copied path violation') }])), manifest.entries), { code: 'OPENSWX_REUSE_ARCHIVE_PATH_INVALID' })
  }
  for (const mutate of [rows => rows.pop(), rows => { rows[0].mode = '100755' }, rows => { rows.find(row => row.path.endsWith('/README.md')).sha256 = '0'.repeat(64) }]) {
    const entries = structuredClone(manifest.entries); mutate(entries); assert.throws(() => assertWorkerArchive(gzipSync(oldTar), entries))
  }
  const newlineChanged = name => name.endsWith('/Dockerfile') ? Buffer.from(canonicalSource(name).toString().replaceAll('\n', '\r\n')) : canonicalSource(name)
  assert.throws(() => workerInputManifest(actualTree, newlineChanged, oldRevision), { code: 'OPENSWX_REUSE_RECIPE_DRIFT' })
  for (const type of ['120000 blob', '160000 commit']) assert.throws(() => workerInputManifest(Buffer.from(actualTree.toString().replace(/100644 blob ([a-f0-9]{40})\tscripts\/lib\/openswx-reader\/Dockerfile/u, `${type} $1\tscripts/lib/openswx-reader/Dockerfile`)), sourceReader, oldRevision))
})
test('B19-05 LOCAL_TEST sole original build-only edge rejects missing/duplicate/wrong purpose without publication', async () => {
  for (const capsuleUri of ['gs://jenfu-platform-prod-aipdm-release/receipts/arbitrary.json', 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-LOCAL-BUILD/other.json',
    'gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/fake-release-intent.json', 'gs://jenfu-platform-prod-sibling-release/receipts/releases/DEV122-LOCAL-BUILD/release-intent.json',
    'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-WRONG-RELEASE/release-intent.json']) {
    const h = await harness(), capsuleBytes = h.objects.get(h.capsuleRef.uri).bytes, wrongRef = h.seedBytes(capsuleUri, capsuleBytes)
    const activation = JSON.parse(h.objects.get(h.priorActivationRef.uri).bytes); activation.previousRefs[0] = wrongRef
    const activationRef = h.seed('invalid-capsule-activation', activation), inputRef = h.seed('invalid-capsule-input', { ...h.input, priorActivationRef: activationRef })
    await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: h.readSource }), { code: 'IMMUTABLE_REF_INVALID' })
    assert.equal(h.puts.length, 0); noMutation(h)
  }
  for (const mutate of [b => { delete b.previousRefs }, b => { b.previousRefs = [] }, b => { b.previousRefs.push(b.previousRefs[0]) }, (b, refs) => { b.previousRefs = [refs.wrongFullRef] }]) {
    const h = await harness({ buildMutate: mutate }); await assert.rejects(h.invoke()); assert.equal(h.puts.length, 0); noMutation(h)
  }
  for (const consistentJson of [false, true]) {
    const h = await harness(); h.transport.readJson = async ref => {
      const row = h.objects.get(ref.uri); if (!row) throw Object.assign(Error('NOT_FOUND'), { code: 'NOT_FOUND' })
      const bytes = ref.uri === h.fullRef.uri ? Buffer.from('{}') : row.bytes
      return { ...row, bytes, value: JSON.parse((consistentJson ? bytes : row.bytes).toString()) }
    }
    await assert.rejects(h.invoke(), { code: 'OPENSWX_REUSE_REF_HASH_INVALID' }); assert.equal(h.puts.length, 0); noMutation(h)
  }
})
test('B19-05/10 LOCAL_TEST current official source lock rejects arbitrary PASS-shaped authority', async () => {
  for (const mutation of [{ schemaVersion: 'fake' }, { ownerApplicationId: 'sibling' }, { releaseAuthority: false }, { branch: 'feature' }, { remoteRef: 'refs/heads/feature' }, { remoteRevision: oldRevision }, { sourceTree: 'invalid' }, { clean: false }, { evidenceScope: 'LOCAL_TEST' }, { status: 'PASS' }]) {
    const h = await harness({ lockMutate: lock => Object.assign(lock, mutation) }); await assert.rejects(h.invoke()); assert.equal(h.puts.length, 0)
  }
  const h = await harness(); assertReuseSourceLock(h.lock, currentRevision)
  assert.throws(() => assertWorkerReuseInput({ ...h.input, image })); assert.throws(() => parseWorkerArtifactReuseArgs(['--command', 'build', '--input-ref', h.inputRef.uri]))
  const reader = createWorkerGitReader(root, git(['rev-parse', 'HEAD']).toString().trim())
  assert.throws(() => reader('scripts/lib/openswx-reader/Dockerfile', '1'.repeat(40)), { code: 'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID' })
})
test('B19-05 LOCAL_TEST fresh provider build source/request/digest/identity mismatches fail closed', async () => {
  for (const mutate of [b => { b.status = 'FAILURE' }, b => { b.id = '22222222-2222-2222-2222-222222222222' }, b => { b.sourceProvenance.resolvedStorageSource.generation = '18' }, b => { b.steps[0].args[b.steps[0].args.indexOf('READER_SOURCE=scripts/lib/openswx-reader')] = 'READER_SOURCE=elsewhere' }, b => { b.results.images[0].digest = 'sha256:' + 'e'.repeat(64) }, b => { b.serviceAccount = 'sibling' }]) {
    const h = await harness(); h.controls.providerBuild = structuredClone(h.providerBuild); mutate(h.controls.providerBuild); await assert.rejects(h.invoke()); assert.equal(h.puts.length, 0); noMutation(h)
  }
})
test('B19-06/10 LOCAL_TEST ENABLED resources validate exact roles/secrets/actor and bounded stable double read', async () => {
  for (const controls of [{ actor: 'other@jenfu.com.tw' }, { secretState: 'DISABLED' }, { rolePermissions: ['run.jobs.get'] }, { jobDrift: true }, { schedulerDrift: true }, { scheduler: { state: 'PAUSED' } }, { job: { template: workerTemplate(profile, image, null, 'selftest') } }, { denied: url => url.includes('artifactregistry') }]) {
    const h = await harness(); Object.assign(h.controls, controls); await assert.rejects(h.invoke()); assert.equal(h.puts.length, 0); noMutation(h)
  }
})
test('B19-07 LOCAL_TEST exact digest complete pagination and ACTIVE fresh strict zero vulnerability policy', async () => {
  for (const mutation of [{ continuousAnalysis: 'INACTIVE' }, { archiveTime: now }, { analysisStatus: 'PENDING' }, { lastScanTime: '2099-01-01T00:00:00Z' }, { analysisError: [] }, { analysisStatusError: { code: 5 } }, { lastScanTime: '' }]) {
    const h = await harness(); h.controls.occurrences = structuredClone(h.occurrences); Object.assign(h.controls.occurrences[2].discovery, mutation)
    await assert.rejects(h.invoke(), { code: 'ARTIFACT_SECURITY_METADATA_REFRESH_REQUIRED' }); assert.equal(h.puts.length, 0); noMutation(h)
  }
  for (const severity of ['HIGH', 'CRITICAL']) {
    const h = await harness(); h.controls.occurrences = [...h.occurrences, { name: 'projects/jenfu-platform-prod/occurrences/vulnerability-local', kind: 'VULNERABILITY', resourceUri: `https://${image}`, vulnerability: { severity, effectiveSeverity: 'LOW' } }]
    await assert.rejects(h.invoke(), { code: 'OPENSWX_ARTIFACT_POLICY_FAILED' }); assert.equal(h.puts.length, 0); noMutation(h)
    const effective = await harness(); effective.controls.occurrences = [...effective.occurrences, { name: 'projects/jenfu-platform-prod/occurrences/vulnerability-effective', kind: 'VULNERABILITY', resourceUri: `https://${image}`, vulnerability: { severity: 'LOW', effectiveSeverity: severity } }]
    await assert.rejects(effective.invoke(), { code: 'OPENSWX_ARTIFACT_POLICY_FAILED' }); assert.equal(effective.puts.length, 0); noMutation(effective)
  }
  for (const vulnerability of [undefined, null, [], 'LOW', 0, {}, { severity: null }, { severity: 'UNKNOWN' }, { severity: 'SEVERITY_UNSPECIFIED' }, { severity: 'low' },
    ...[null, [], 0, 'UNKNOWN', 'SEVERITY_UNSPECIFIED', ''].map(effectiveSeverity => ({ severity: 'LOW', effectiveSeverity }))]) {
    const h = await harness(); const occurrence = { name: 'projects/jenfu-platform-prod/occurrences/vulnerability-malformed', kind: 'VULNERABILITY', resourceUri: `https://${image}` }
    if (vulnerability !== undefined) occurrence.vulnerability = vulnerability
    h.controls.occurrences = [...h.occurrences, occurrence]
    await assert.rejects(h.invoke(), { code: 'ARTIFACT_SECURITY_METADATA_REFRESH_REQUIRED' }); assert.equal(h.puts.length, 0); noMutation(h)
  }
  for (const severity of ['MINIMAL', 'LOW', 'MEDIUM']) {
    const h = await harness(); h.controls.occurrences = [...h.occurrences, { name: 'projects/jenfu-platform-prod/occurrences/vulnerability-safe', kind: 'VULNERABILITY', resourceUri: `https://${image}`, vulnerability: { severity } }]
    const saved = await h.invoke(); assert.equal(saved.value.status, 'PASS'); noMutation(h)
  }
  const h = await harness(); h.controls.pageToken = 'repeating-token'; await assert.rejects(h.invoke(), { code: 'OPENSWX_REUSE_OCCURRENCE_PAGE_INVALID' }); assert.equal(h.puts.length, 0)
})
test('B19-08 LOCAL_TEST protected reuse returns association with fresh metadata, zero worker build; no FIRST resources', async () => {
  const h = await harness(), saved = await h.invoke(), d = h.v2(saved.ref), descriptorRef = h.seed('v2-build-only', d)
  const worker = createOpenSwxOwnerRelease({ transport: h.transport, readSource: h.readSource, environment: { GITHUB_WORKFLOW_REF: `${appProfile.application.repository}/${appProfile.workflow.path}@refs/heads/main`, OWNER_EXECUTION_MODE: 'build_only' } })
  const intent = { sourceRevision: currentRevision, sourceLockRef: h.sourceLockRef, openswxWorkerRef: descriptorRef, deadlineAt: deadline() }
  const built = await worker.build({ intent, profile: appProfile, sourceObject: { ref: h.currentSourceRef } })
  assert.deepEqual(built, { descriptorRef, workerBuildRef: saved.ref, image }); noMutation(h)
  const firstInput = h.seed('forbidden-first', { schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef, workerBuildRef: saved.ref, deadlineAt: deadline(), receiptId: 'LOCAL-FIRST-DRAIN', drainKind: 'FIRST_PROVIDER_ONLY', resourceApplyRef: h.approvedRef })
  await assert.rejects(executeOpenSwxBootstrap({ stage: 'pause', inputRef: firstInput, transport: h.transport, readSource: h.readSource, appProfile }), { code: 'OPENSWX_REUSE_DAILY_ONLY' })
})
test('B19-09 LOCAL_TEST unknown create-only outcome adopts exact same URI or stops, never overwrites/rebuilds', async () => {
  for (const result of ['applied', 'missing', 'conflict']) {
    const h = await harness(), uri = h.uri('unknown-write'), value = { schemaVersion: 'LOCAL_TEST', proof: 'immutable' }; let attempts = 0
    h.transport.putJson = async () => { attempts++; if (result === 'applied') h.seedBytes(uri, Buffer.from(`${canonicalize(value)}\n`)); if (result === 'conflict') h.seedBytes(uri, Buffer.from('{}\n')); throw Object.assign(Error('unknown'), { code: 'OUTCOME_UNKNOWN' }) }
    if (result === 'applied') { const saved = await publishWorkerReuseJson(h.transport, uri, value); assert.deepEqual(saved.value, value) }
    else await assert.rejects(publishWorkerReuseJson(h.transport, uri, value), { code: result === 'missing' ? 'OPENSWX_REUSE_RECOVERY_REQUIRED' : 'OPENSWX_REUSE_PUBLICATION_CONFLICT' })
    assert.equal(attempts, 1); noMutation(h)
  }
})
test('B19-09 LOCAL_TEST association cycle/depth and nested shape injections reject before any build', async () => {
  const h = await harness(), saved = await h.invoke(), d = h.v2(saved.ref)
  await assert.rejects(resolveWorkerArtifact({ transport: h.transport, descriptor: d, profile, readSource: h.readSource, ctx: { depth: 8, ancestors: new Set() } }), /DEV121_OWNER_RELEASE_PROOF_CONTEXT_INVALID/u)
  await assert.rejects(resolveWorkerArtifact({ transport: h.transport, descriptor: d, profile, readSource: h.readSource, ctx: { depth: 0, ancestors: new Set([saved.ref.uri]) } }), /DEV121_OWNER_RELEASE_PROOF_CONTEXT_INVALID/u)
  const injected = structuredClone(saved.value); injected.executableProof.command = 'build'; const badRef = h.seed('injected-association', injected)
  await assert.rejects(resolveWorkerArtifact({ transport: h.transport, descriptor: h.v2(badRef), profile, readSource: h.readSource })); noMutation(h)
})
test('B19-08/09 LOCAL_TEST repeated v2 validates immediate READY envelopes through strict permitted Git sources; candidate8 accepted and9 rejected before publication', async () => {
  const h = await harness(); let saved = await h.invoke()
  const originalLeaf = structuredClone(saved.value.artifactOrigin), retained = new Map([...h.objects].map(([uri, row]) => [uri, Buffer.from(row.bytes)]))
  for (let index = 2; index <= 8; index++) {
    const ready = h.advanceReady(saved, index), next = h.nextAttempt(index, ready.activationRef)
    saved = await executeWorkerArtifactReuse({ transport: h.transport, inputRef: next.inputRef, readSource: h.readSource })
    assert.deepEqual(saved.value.artifactOrigin.priorReadyCapsuleRef, ready.capsuleRef)
    assert.deepEqual(saved.value.artifactOrigin.priorReadyFullDescriptorRef, ready.descriptorRef)
    for (const name of ['originalBuildReceiptRef', 'originalBuildOnlyDescriptorRef', 'originalApprovedResourcePlanRef', 'sourceRevision', 'sourceArchiveSha256', 'buildId', 'createTime', 'startTime', 'finishTime']) assert.deepEqual(saved.value.artifactOrigin[name], originalLeaf[name])
    const d = { ...h.v2(saved.ref), sourceRevision: saved.value.sourceRevision, sourceArchiveSha256: saved.value.sourceArchiveSha256 }
    const resolved = await resolveWorkerArtifact({ transport: h.transport, descriptor: d, profile, readSource: h.readSource })
    assert.deepEqual(resolved.originBuild, h.build)
    if (index === 2) {
      const stale = structuredClone(saved.value); stale.artifactOrigin.priorReadyCapsuleRef = originalLeaf.priorReadyCapsuleRef; stale.artifactOrigin.priorReadyFullDescriptorRef = originalLeaf.priorReadyFullDescriptorRef
      const staleRef = h.seed('stale-immediate-ready', stale)
      await assert.rejects(resolveWorkerArtifact({ transport: h.transport, descriptor: { ...d, workerBuildRef: staleRef }, profile, readSource: h.readSource }), { code: 'OPENSWX_REUSE_JOIN_INVALID' })
    }
    for (const [uri, bytes] of retained) assert.ok(h.objects.get(uri).bytes.equals(bytes), uri)
    for (const [uri, row] of h.objects) retained.set(uri, Buffer.from(row.bytes))
  }
  const ready = h.advanceReady(saved, 9), next = h.nextAttempt(9, ready.activationRef), count = h.puts.length
  await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef: next.inputRef, readSource: h.readSource }), { code: 'OPENSWX_REUSE_ORIGIN_CYCLE_OR_DEPTH' })
  assert.equal(h.puts.length, count, 'candidate9 must fail before request/proof/final publication'); noMutation(h)
})
test('B19-08/11 LOCAL_TEST same-source single release DAILY/full consumes association, exact lock; replay/continuation preserve original leaf', async () => {
  const h = await harness(), saved = await h.invoke(), descriptorRef = saved.refs.dailyBuildOnlyDescriptorRef, d = (await h.transport.readJson(descriptorRef)).value
  const producerCalls = h.calls.slice(); noMutation(h); h.lifecycle()
  const invoke = async (stage, name, extra) => {
    const inputRef = h.seed(name + '-input', { schemaVersion: `aipdm.openswx-${stage}-input.v1`, descriptorRef, workerBuildRef: saved.ref, deadlineAt: deadline(), receiptId: name, ...extra })
    return executeOpenSwxBootstrap({ stage, inputRef, transport: h.transport, readSource: h.readSource, appProfile, sleep: async () => {} })
  }
  const paused = await invoke('pause', 'LOCAL-B19-DAILY-PAUSE', { drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: h.priorActivationRef })
  const bootstrap = await invoke('bootstrap', 'LOCAL-B19-DAILY-BOOTSTRAP', { bootstrapKind: 'DAILY_REFRESH', priorActivationRef: h.priorActivationRef, pausedDrainedRef: paused.ref })
  assert.equal(bootstrap.value.facts.resourceProvenance.resourcesUnchanged, true); assert.equal(bootstrap.value.image, image)
  assert.equal(bootstrap.value.facts.tokenSecretVersion, token); assert.equal(bootstrap.value.facts.registrySecretVersion, registry)
  const preflightRow = await h.transport.readJson(bootstrap.value.facts.cloudPreflightRef), finiteRow = await h.transport.readJson(preflightRow.value.previousRefs[0])
  assert.ok(Date.parse(finiteRow.value.facts.execution.completionTime) <= Date.parse(preflightRow.value.observedAt))
  assert.ok(Date.parse(preflightRow.value.observedAt) <= Date.parse(bootstrap.value.observedAt))
  const observedClock = h.transport.now(); assert.ok(Date.parse(observedClock) >= Date.parse(bootstrap.value.observedAt))
  assert.ok(Date.parse(h.transport.now()) >= Date.parse(observedClock))
  const fullRef = bootstrap.refs.fullDescriptorRef, full = (await h.transport.readJson(fullRef)).value
  const evidence = await readWorkerFullEvidence(h.transport, full, profile, h.readSource)
  assert.equal(evidence.artifact.currentAssociation.sourceRevision, currentRevision); assert.deepEqual(evidence.artifact.originBuild, h.build)
  const readJson = h.transport.readJson, nativeReads = new Map()
  h.transport.readJson = async (reference, bucket, prefixes) => {
    const key = canonicalize([reference, bucket, prefixes])
    nativeReads.set(key, (nativeReads.get(key) ?? 0) + 1)
    return readJson(reference, bucket, prefixes)
  }
  const worker = createOpenSwxOwnerRelease({ transport: h.transport, readSource: h.readSource, environment: { GITHUB_WORKFLOW_REF: `${appProfile.application.repository}/${appProfile.workflow.path}@refs/heads/main`, OWNER_EXECUTION_MODE: 'full_release' } })
  const intent = { sourceRevision: currentRevision, sourceLockRef: h.sourceLockRef, openswxWorkerRef: fullRef, deadlineAt: deadline() }
  const runtimeConfig = { plainEnvironment: { PDM_OPENSWX_DISPATCH_ENABLED: '1' }, secretVersions: { PDM_WORKLOAD_AUTH_CREDENTIALS: registry.split('/').at(-1) },
    openswxWorker: { descriptorRef: fullRef, purpose: 'full', sourceRevision: currentRevision, workerProfileSha256: full.workerProfileSha256 } }
  const associationKey = canonicalize([full.workerBuildRef, 'jenfu-platform-prod-aipdm-release', ['receipts/dev-122/openswx-worker']])
  const liveSchedulerReads = () => h.calls.filter(row => row.url === `https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}`).length
  const liveBefore = liveSchedulerReads(), publicationsBefore = h.puts.length
  await worker.prepare({ intent, profile: appProfile, runtimeConfig })
  assert.equal(nativeReads.get(associationKey), 1, 'one full prepare rewalks both graph consumers but reads the pinned association once')
  assert.ok([...nativeReads.values()].every(count => count === 1), 'each same-policy pinned receipt is read once inside the operation')
  assert.ok(liveSchedulerReads() > liveBefore, 'prepare still observes the live Scheduler')
  const firstLive = liveSchedulerReads()
  await worker.prepare({ intent, profile: appProfile, runtimeConfig })
  assert.equal(nativeReads.get(associationKey), 2, 'a new full prepare must reauthenticate the same immutable association')
  assert.ok(liveSchedulerReads() > firstLive, 'a new prepare must reread live provider state')
  h.controls.scheduler = { state: 'ENABLED' }
  await assert.rejects(worker.prepare({ intent, profile: appProfile, runtimeConfig }), /OPENSWX_SCHEDULER_NOT_PAUSED/u)
  delete h.controls.scheduler
  assert.equal(h.puts.length, publicationsBefore, 'prepare and live-state refusal have no publication side effect')
  const built = await worker.build({ intent, profile: appProfile, sourceObject: { ref: h.currentSourceRef } })
  assert.deepEqual(built.workerBuildRef, saved.ref); assert.equal(built.image, image)
  const otherLockRef = h.seed('different-attempt-lock', { ...h.lock, releaseId: 'DEV122-LOCAL-OTHER' })
  await assert.rejects(worker.build({ intent: { ...intent, sourceLockRef: otherLockRef }, profile: appProfile, sourceObject: { ref: h.currentSourceRef } }), { code: 'OPENSWX_REUSE_SOURCE_LOCK_JOIN_INVALID' })
  await assert.rejects(worker.build({ intent, profile: appProfile, sourceObject: { ref: { ...h.currentSourceRef, sha256: '0'.repeat(64) } } }), { code: 'OPENSWX_ARCHIVE_JOIN_INVALID' })
  const continuation = { bootstrapInputRef: h.objects.get(h.uri('LOCAL-B19-DAILY-BOOTSTRAP-input')).ref, bootstrapRef: bootstrap.ref, priorRecoveryRef: h.objects.get(`${profile.receiptRoot}/LOCAL-B19-DAILY-BOOTSTRAP-prior-recovery.json`).ref }
  const nextPause = await invoke('pause', 'LOCAL-B19-CONTINUATION-PAUSE', { drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: h.priorActivationRef, bootstrapContinuation: continuation })
  const restoredContinuation = nextPause.value.facts.bootstrapContinuation
  assert.deepEqual(restoredContinuation.bootstrapInputRef, continuation.bootstrapInputRef)
  assert.deepEqual(restoredContinuation.bootstrapRef, continuation.bootstrapRef)
  assert.deepEqual(restoredContinuation.priorRecoveryRef, continuation.priorRecoveryRef)
  const requestRow = await h.transport.readJson(restoredContinuation.requestRef), restoredRow = await h.transport.readJson(restoredContinuation.restoredRef)
  assert.equal(requestRow.value.schemaVersion, 'aipdm.openswx-daily-continuation-request.v1')
  assert.equal(restoredRow.value.schemaVersion, 'aipdm.openswx-daily-continuation-restored.v1')
  assert.deepEqual(restoredRow.value.requestRef, restoredContinuation.requestRef)
  assert.deepEqual(restoredRow.value.bootstrapContinuation, continuation)
  assert.deepEqual(restoredRow.value.priorActivationRef, h.priorActivationRef)
  assert.equal(restoredRow.value.restoreTemplateSha256, sha256(canonicalize(workerTemplate(profile, image, token))))
  assert.equal(producerCalls.length > 0, true)
  assert.ok(!h.calls.some(row => /:addVersion|terraform|cloudbuild.*POST/u.test(row.url)))
  assert.ok(h.objects.get(h.buildRef.uri).bytes.equals(Buffer.from(canonicalize(h.build))))
})
test('B19-11/12 LOCAL_TEST static reuse gate needs full current operational evidence; denied metadata cannot fallback', async () => {
  const h = await harness(), saved = await h.invoke(), d = h.v2(saved.ref)
  const artifact = await resolveWorkerArtifact({ transport: h.transport, descriptor: d, profile, readSource: h.readSource })
  h.controls.denied = url => url.includes('cloudbuild.googleapis.com')
  await assert.rejects(verifyWorkerArtifactReuse({ transport: h.transport, artifact, profile, readSource: h.readSource, deadlineAt: deadline() }), { code: 'FORBIDDEN' })
  await assert.rejects(readWorkerFullEvidence(h.transport, { ...d, purpose: 'full' }, profile, h.readSource))
  noMutation(h)
})

import { buildDev117MigrationBundle, buildDev117MigrationPackage } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { deriveProgramOnlyBundles, buildProgramOnlyPolicy } from './lib/dev117-ai-pdm-program-only-baseline.mjs'
import { readProgramOnlyWorkerEvidence } from './lib/dev122-openswx-owner-release.mjs'
// Only B35's historical modeled graph uses closed34/read-only33.
// Generic worker/build tests above retain the genuine current35 profile.
const b35AppProfile = structuredClone(currentAppProfile)
b35AppProfile.migrations.entries = b35AppProfile.migrations.entries.slice(0, 34)
const b35AppProfileBytes = Buffer.from(JSON.stringify(b35AppProfile, null, 2) + String.fromCharCode(10))
const b35FullBundle = buildDev117MigrationBundle(b35AppProfile, buildDev117MigrationPackage(b35AppProfile, JSON.parse(canonicalSource('config/platform/dev-010-n1c-ai-pdm.json'))), currentRevision)
const b35Bundles = deriveProgramOnlyBundles({ profile: b35AppProfile, full: b35FullBundle })
test('current genuine Git v7 profile cannot borrow the historical B35 program-only fixture', () => {
  const full = buildDev117MigrationBundle(currentAppProfile, buildDev117MigrationPackage(currentAppProfile,
    JSON.parse(canonicalSource('config/platform/dev-010-n1c-ai-pdm.json'))), currentRevision)
  assert.equal(full.bundle.entries.length, 35)
  assert.throws(() => deriveProgramOnlyBundles({ profile: currentAppProfile, full }), /PROGRAM_ONLY/u)
})
async function b35ReadyProgramFixture(options = {}) {
  const h = await harness({ ...options, lockMutate: lock => { lock.migrationManifestSha256 = b35FullBundle.bundle.manifestSha256 } })
  const saved = await h.invoke(), descriptorRef = saved.refs.programOnlyFullDescriptorRef
  const descriptor = (await h.transport.readJson(descriptorRef)).value
  const retainedWorker = { descriptorRef, priorActivationRef: h.priorActivationRef, currentAssociationRef: saved.ref, readyResourceReadbackRef: saved.value.resourceAssociation.readbackRef }
  const policy = buildProgramOnlyPolicy({ profile: b35AppProfile, sourceLock: h.lock, bundles: b35Bundles,
    baselineIntentRef: h.capsuleRef, baselineEntries: b35Bundles.effective.bundle.entries,
    migrationRunnerDigest: `${b35AppProfile.artifact.migrationRunnerUri}@sha256:${'e'.repeat(64)}`, retainedWorker })
  const intent = { ...h.lock, sourceLockRef: h.sourceLockRef, openswxWorkerRef: descriptorRef, baselineIntentRef: h.capsuleRef, programOnlyBaseline: policy, deadlineAt: deadline() }
  const args = { transport: h.transport, intent, appProfile: b35AppProfile, descriptor, profile, readSource: h.readSource, currentReadback: true }
  const worker = createOpenSwxOwnerRelease({ transport: h.transport, readSource: h.readSource,
    environment: { GITHUB_WORKFLOW_REF: `${b35AppProfile.application.repository}/${b35AppProfile.workflow.path}@refs/heads/main`, OWNER_EXECUTION_MODE: 'full_release' } })
  return { h, saved, descriptor, intent, args, worker }
}

test('P06 program-only keeps current READY worker through prepare, candidate, activation guard and finalize with GET only', async () => {
  const f = await b35ReadyProgramFixture(), evidence = await readProgramOnlyWorkerEvidence(f.args)
  assert.equal(evidence.image, image)
  await f.worker.prepare({ intent: f.intent, profile: b35AppProfile, runtimeConfig: { plainEnvironment: { PDM_OPENSWX_DISPATCH_ENABLED: '1' }, secretVersions: { PDM_WORKLOAD_AUTH_CREDENTIALS: registry.split('/').at(-1) }, openswxWorker: { purpose: 'full', sourceRevision: currentRevision, workerProfileSha256: f.descriptor.workerProfileSha256, descriptorRef: f.intent.openswxWorkerRef } } })
  await f.worker.candidate({ intent: f.intent, profile: b35AppProfile, deployment: { sourceObject: f.h.currentSourceRef, openswxWorker: { image } } })
  await f.worker.beforeActivate({ intent: f.intent, profile: b35AppProfile })
  const result = await f.worker.finalize({ intent: f.intent, profile: b35AppProfile, canonical: {}, migrationMode: 'READ_ONLY_BASELINE_VERIFIED' })
  assert.equal(result.status, 'READY'); assert.equal(result.retained, true); assert.equal(result.schedulerEnabled, true); assert.equal(result.workerJobMutationPerformed, false)
  noMutation(f.h)
  const current = await f.h.transport.readJson(f.h.priorActivationRef)
  assert.equal(current.value.facts.workerStatus, 'READY'); assert.equal(f.descriptor.bootstrapRef.uri, f.h.full.bootstrapRef.uri)
})

test('P06 program-only rejects changed Secret metadata, Job generation, Scheduler state or source association', async () => {
  for (const mutation of [f => f.h.controls.secretState = 'DISABLED', f => f.h.controls.job = { generation: '99' },
    f => f.h.controls.scheduler = { state: 'PAUSED' }, f => f.intent.sourceLockRef = f.h.fullRef,
    f => f.intent.programOnlyBaseline.retainedWorker.currentAssociationRef = f.h.buildRef]) {
    const f = await b35ReadyProgramFixture(); mutation(f); await assert.rejects(readProgramOnlyWorkerEvidence(f.args)); noMutation(f.h)
  }
})

test('P07 failed program-only descriptor read reports recovery needed without blocking application rollback or mutating worker', async () => {
  const f = await b35ReadyProgramFixture()
  f.h.transport.readJson = async () => { throw Error('LOCAL_DESCRIPTOR_READ_FAILURE') }
  const result = await f.worker.recover({ intent: f.intent, profile: b35AppProfile })
  assert.equal(result.status, 'RECOVERY_REQUIRED'); assert.equal(result.schedulerEnabled, null)
  assert.equal(result.workerJobMutationPerformed, false); assert.equal(result.durableQueue, 'RETAINED'); noMutation(f.h)
})

import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'
import { programOnlyHash, sealProgramOnlyEvidence, programOnlyStaticEnvironment, programOnlyExecutionEnvironment, programOnlyMigrationArguments, programOnlySubmissionFields } from './lib/dev117-ai-pdm-program-only-baseline.mjs'
import { readAiPdmReleaseObservation, readAiPdmObservationInputs, createAiPdmEvidenceContext, runAiPdmEvidenceContext, descendAiPdmEvidenceContext } from './lib/dev121-owner-release-proof.mjs'

async function b35ProgramProofFixture({releasedBaseline=false,dailyServing=false}={}) {
  // Historical modeled34 archive: real Git PAX, immutable SQL/worker blobs, explicit profile bytes.
  const archive = b35GitArchive(currentRevision, b35FullBundle.bundle.entries, b35AppProfileBytes)
  const f = await b35ReadyProgramFixture({ currentArchive: archive, proofMetadata: true, releasedBaseline }), h = f.h
  const put = (uri, value) => h.seedBytes(uri, Buffer.from(canonicalize(value) + '\n'))
  const seal = sealProgramOnlyEvidence, policy = f.intent.programOnlyBaseline
  const runtime = dailyServing ? buildRuntimeConfig(b35AppProfile, {plainEnvironment:{...Object.fromEntries(b35AppProfile.environment.requiredPlainEnvironmentNames.map(name=>[name,b35AppProfile.environment.fixedValues?.[name]??b35AppProfile.environment.controlledValues?.[name]?.defaultValue??'LOCAL_TEST_VALUE'])),PDM_OPENSWX_DISPATCH_ENABLED:'1'},secretVersions:Object.fromEntries(b35AppProfile.environment.requiredSecretNames.map(name=>[name,'9'])),openswxWorker:{descriptorRef:f.intent.openswxWorkerRef,purpose:'full',sourceRevision:currentRevision,workerProfileSha256:f.descriptor.workerProfileSha256}}) : null
  const runtimeRef = runtime ? put(profile.receiptRoot+'/local-daily-serving-runtime.json',{runtimeConfig:runtime}) : h.sourceLockRef
  const capsule = { schemaVersion: b35AppProfile.schemas.releaseIntent, ownerApplicationId: 'ai-pdm', releaseId: h.lock.releaseId,
    sourceRevision: currentRevision, sourceSha256: h.lock.sourceSha256, sourceLockRef: h.sourceLockRef,
    authorizationPolicyRef: h.sourceLockRef, readinessReceiptRef: h.sourceLockRef, foundationReceiptRef: h.sourceLockRef, infraReceiptRef: h.sourceLockRef, runtimeConfigRef: runtimeRef,
    migrationManifestSha256: b35FullBundle.bundle.manifestSha256, previousRevision: 'ai-pdm-prod-' + '2'.repeat(12), deadlineAt: f.intent.deadlineAt,
    openswxWorkerRef: f.intent.openswxWorkerRef, baselineIntentRef: policy.baselineIntentRef, programOnlyBaseline: policy }
  const intentRef = put(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${capsule.releaseId}/release-intent.json`, capsule)
  const base = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/${capsule.releaseId}/${intentRef.sha256}`
  const stage = (name, previousReceiptRef, facts) => put(`${base}/${name}.json`, seal({ schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId: capsule.releaseId, sourceRevision: currentRevision, stage: name, previousReceiptRef, facts, observedAt: now, status: 'PASS' }))
  const prerequisiteRefs = Object.fromEntries(['sourceLock','authorization','readiness','foundation','infra','runtimeConfig'].map(name => [name, name==='runtimeConfig'?runtimeRef:h.sourceLockRef]))
  const prepare = stage('prepare', null, { prerequisiteRefs })
  const sourceObject = { ...h.currentSourceRef, uri: `gs://jenfu-platform-prod-aipdm-release/source/releases/${capsule.releaseId}/${intentRef.sha256}/source.tar.gz`, generation: '17', crc32c: crc32cBase64(h.objects.get(h.currentSourceRef.uri).bytes) }
  h.seedBytes(sourceObject.uri, h.objects.get(h.currentSourceRef.uri).bytes)
  const artifactDigest = `${b35AppProfile.artifact.uri}@sha256:${'1'.repeat(64)}`, buildId = '22222222-2222-2222-2222-222222222222'
  const provenance = put(`${base}/provenance.json`, { schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: currentRevision,
    sourceObject, artifactDigest, status: 'PASS', cloudBuild: { name: `projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`, id: buildId, status: 'SUCCESS', projectId: 'jenfu-platform-prod',
      serviceAccount: `projects/jenfu-platform-prod/serviceAccounts/${b35AppProfile.identities.builder}`, options: { requestedVerifyOption: 'VERIFIED' },
      sourceProvenance: { resolvedStorageSource: { bucket: 'jenfu-platform-prod-aipdm-release', object: sourceObject.uri.split('/').slice(3).join('/'), generation: '17' } },
      results: { images: [{ name: `${b35AppProfile.artifact.uri}:release-${currentRevision}`, digest: artifactDigest.split('@')[1] }] } }, artifactRegistry: { uri: artifactDigest } })
  h.seedBytes(b35Bundles.sourceMigrationBundleRef.uri, b35FullBundle.bytes); h.seedBytes(b35Bundles.effectiveMigrationBundleRef.uri, b35Bundles.effective.bytes)
  const build = stage('build', prepare, { artifactDigest, sourceObject, migrationBundleRef: b35Bundles.effectiveMigrationBundleRef,
    sourceMigrationBundleRef: b35Bundles.sourceMigrationBundleRef, programOnlyBaseline: policy, provenanceReceiptRef: provenance })
  const deployment = { schemaVersion: b35AppProfile.schemas.deploymentCapsule, ownerApplicationId: 'ai-pdm', sourceRevision: currentRevision, artifactDigest, buildReceiptRef: build,
    sourceObject, migrationBundleRef: b35Bundles.effectiveMigrationBundleRef, sourceMigrationBundleRef: b35Bundles.sourceMigrationBundleRef, programOnlyBaseline: policy,
    migrationRunnerDigest: policy.migrationRunnerDigest, releaseIntentRef: intentRef, releaseIntentSha256: intentRef.sha256, deadlineAt: capsule.deadlineAt,
    openswxWorker: { descriptorRef: capsule.openswxWorkerRef, workerBuildRef: f.saved.ref, image } }
  const deploymentRef = put(`${base}/deployment-capsule.json`, deployment), outputUri = `${base}/migration-readonly-native.json`
  const task = { serviceAccount: b35AppProfile.migrations.serviceAccount, maxRetries: 0, timeout: '1800s', volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }],
    containers: [{ name: 'migration', image: policy.migrationRunnerDigest, args: ['--bundle-ref-required'], env: Object.entries(programOnlyStaticEnvironment(b35AppProfile)).map(([name,value]) => ({name,value})), volumeMounts: [{name:'cloudsql',mountPath:'/cloudsql'}] }] }
  const jobName = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner', executionName = 'program-proof-local'
  const job = { name: jobName, etag: 'LOCAL_ETAG', template: { taskCount: 1, parallelism: 1, template: task } }
  const execution = { name: `${jobName}/executions/${executionName}`, createTime: now, completionTime: now, taskCount:1, parallelism:1, succeededCount:1, conditions:[{type:'Completed',state:'CONDITION_SUCCEEDED'}], template:structuredClone(task) }
  execution.template.containers[0].args=programOnlyMigrationArguments(deployment,outputUri); execution.template.containers[0].env=Object.entries(programOnlyExecutionEnvironment(b35AppProfile)).map(([name,value])=>({name,value}))
  const jobRef=put(outputUri.replace(/\.json$/u,'-job-readback.json'),job),executionRef=put(outputUri.replace(/\.json$/u,'-execution-readback.json'),execution)
  const submissionRef=put(outputUri.replace(/\.json$/u,'-submission-intent.json'),seal({schemaVersion:'jenfu.dev012.migration-submission-intent.v1',ownerApplicationId:'ai-pdm',sourceRevision:currentRevision,
    jobName,migrationRunnerDigest:policy.migrationRunnerDigest,migrationBundleRef:deployment.migrationBundleRef,outputUri,args:programOnlyMigrationArguments(deployment,outputUri),principalOnlyFenceRef:null,deadlineAt:capsule.deadlineAt,status:'SUBMISSION_INTENT',observedAt:now,...programOnlySubmissionFields(b35AppProfile,deployment)}))
  const nativeRef=put(outputUri,seal({schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'ai-pdm',sourceRevision:currentRevision,database:'jenfu_prod',ledger:'ai_pdm_core.schema_migrations',manifestSha256:b35Bundles.effective.bundle.manifestSha256,
    baselineCount:15,minimumLedgerCount:0,ledgerBootstrap:{enabled:true,created:false},ledgerCount:33,applied:0,replayed:33,crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}],boundaryStatus:'PASS',executionName,startedAt:now,completedAt:now,status:'PASS'}))
  const migrate=put(`${base}/migrate.json`,seal({schemaVersion:'aipdm.program-only-baseline-association.v1',ownerApplicationId:'ai-pdm',releaseId:capsule.releaseId,sourceRevision:currentRevision,releaseCapsuleRef:intentRef,deploymentCapsuleRef:deploymentRef,policySha256:programOnlyHash(policy),sourceMigrationBundleRef:b35Bundles.sourceMigrationBundleRef,effectiveMigrationBundleRef:b35Bundles.effectiveMigrationBundleRef,nativeReceiptRef:nativeRef,submissionIntentRef:submissionRef,executionReadbackRef:executionRef,jobReadbackRef:jobRef,executionName,status:'PASS',databaseDisposition:'READ_ONLY_BASELINE_VERIFIED',migrationJobSubmitted:true,migrationJobSubmissions:1,currentDatabaseReadPerformed:true,observedAt:now,deadlineAt:capsule.deadlineAt}))
  const calls=[]
  const fetchImpl=async(url,options={})=>{calls.push({url,method:options.method??'GET'});
    const anchor=h.modeledReleasedAnchor
    if(anchor&&url===`https://cloudbuild.googleapis.com/v1/${anchor.cloudBuild.name}`)return Response.json(anchor.cloudBuild)
    const currentProvenance=JSON.parse(h.objects.get(provenance.uri).bytes)
    if(url===`https://cloudbuild.googleapis.com/v1/${currentProvenance.cloudBuild.name}`)return Response.json(currentProvenance.cloudBuild)
    if(url.startsWith('https://artifactregistry.googleapis.com/v1/')){
      const digest=[artifactDigest,anchor?.artifactDigest].find(value=>value&&decodeURIComponent(url).includes(value.split('@')[1]))
      if(digest)return Response.json({name:`projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release/dockerImages/ai-pdm@${digest.split('@')[1]}`,uri:digest})
    }
    const match=/\/b\/([^/]+)\/o\/([^?]+)/u.exec(url),uri=match&&`gs://${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`,row=h.objects.get(uri)
    if(!row)return Response.json({}, {status:404});return url.includes('alt=media')?new Response(row.bytes):Response.json({bucket:decodeURIComponent(match[1]),name:decodeURIComponent(match[2]),generation:'17',crc32c:crc32cBase64(row.bytes),size:String(row.bytes.length)})}
  const sourceCalls=[]
  const readSource=(name,revision)=>{sourceCalls.push({name,revision});assert.ok([oldRevision,currentRevision].includes(revision));return name==='config/release/dev117-ai-pdm-independent-production-v3.json'?(releasedBaseline&&revision===oldRevision?b35HistoricalProfileBytes:b35AppProfileBytes):canonicalSource(name)}
  return { f,h,capsule,intentRef,prepare,migrate,deploymentRef,execution,job,base,put,calls,sourceCalls,fetchImpl,readSource,runtime,artifactDigest,
    read:callback=>readAiPdmReleaseObservation({sourceRevision:currentRevision,refs:{prepare,migrate,terminal:null},token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl,readSource:callback??readSource}) }
}

test('P06A complete program-only source observation verifies full34 archive, effective33 and admitted worker blobs in one live context', async()=>{
  const wire=await b35ProgramProofFixture()
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(),async()=>{
    const proof=await wire.read(), graph=await readAiPdmObservationInputs(proof)
    assert.equal(proof.databaseDisposition,'READ_ONLY_BASELINE_VERIFIED');assert.equal(proof.currentDatabaseReadPerformed,true)
    assert.equal(graph.bundle.bundle.entries.length,33);assert.equal(graph.programMigration.native.value.applied,0)
    const replay=await readAiPdmObservationInputs(proof);assert.equal(replay.intentRef.sha256,wire.intentRef.sha256)
  })
  assert.ok(wire.sourceCalls.length>0);assert.ok(wire.calls.every(c=>c.method==='GET'));noMutation(wire.h)
})

test('P06A complete program-only source observation rejects wrong callback blob and expired context',async()=>{
  const wire=await b35ProgramProofFixture()
  await assert.rejects(wire.read((name,revision)=>{const bytes=wire.readSource(name,revision);return name===WORKER_PROFILE_PATH?Buffer.from('{}'):bytes}))
  const context=createAiPdmEvidenceContext();await runAiPdmEvidenceContext(context,async()=>{})
  await assert.rejects(runAiPdmEvidenceContext(context,()=>wire.read()))
  assert.ok(wire.calls.every(c=>c.method==='GET'));noMutation(wire.h)
})

// LOCAL_TEST sealed RELEASED-33 anchor. Raw SQL/worker blobs and the pinned historical profile are real;
// identities, provider responses and receipts are explicitly modeled.
const b35HistoricalProfileValue = structuredClone(b35AppProfile)
b35HistoricalProfileValue.migrations.entries.pop()
// Preserve the exact old blob formatting; its hash is recorded from B33 Git.
const b35HistoricalProfileBytes = Buffer.from((JSON.stringify(b35HistoricalProfileValue,null,2)+'\n').replace(
  '      "openswxDispatch": {\n        "name": "PDM_OPENSWX_DISPATCH_ENABLED",\n        "off": "0",\n        "on": "1",\n        "binding": "openswxWorkerRef"\n      }',
  '      "openswxDispatch": { "name": "PDM_OPENSWX_DISPATCH_ENABLED", "off": "0", "on": "1", "binding": "openswxWorkerRef" }'))
assert.equal(sha256(b35HistoricalProfileBytes),'3faf99ae7cd9244a8ad234145309d864f9ed4206227891bbcf164fd296043caf')
const b35HistoricalProfile = JSON.parse(b35HistoricalProfileBytes)
const b35HistoricalBundle = buildDev117MigrationBundle(b35HistoricalProfile, buildDev117MigrationPackage(b35HistoricalProfile,
  JSON.parse(canonicalSource('config/platform/dev-010-n1c-ai-pdm.json'))), oldRevision)
assert.equal(b35HistoricalBundle.bundle.entries.length, 33)
function b35GitArchive(identity, entries, appProfileBytes = b35HistoricalProfileBytes) {
  const paths = [...new Set(['config/release/dev117-ai-pdm-independent-production-v3.json', ...entries.map(row => row.path), ...manifest.entries.map(row => row.path)])]
  const head=git(['rev-parse','HEAD']).toString().trim()
  // Portable even in required CI's shallow checkout: raw unchanged SQL/worker
  // blobs plus the hash-pinned historical profile and Git's real PAX header.
  const headArchive=git(['-c','core.autocrlf=false','-c','core.eol=lf','archive','--format=tar','--prefix=source/','HEAD','--',...paths])
  const paxSize=parseInt(headArchive.subarray(124,136).toString().replace(/\0.*$/su,''),8)
  const pax=headArchive.subarray(0,512+Math.ceil(paxSize/512)*512)
  const modeled=tar([...manifest.entries,...entries.map(row=>({path:row.path,mode:'100644'})),{path:'config/release/dev117-ai-pdm-independent-production-v3.json',mode:'100644',bytes:appProfileBytes}])
  const bytes=Buffer.concat([pax,modeled])
  const marker = Buffer.from('comment=' + head), at = bytes.indexOf(marker)
  assert.ok(at >= 0); bytes.write('comment=' + identity, at, marker.length); return bytes
}
function b35ReleasedAnchor({ capsule, capsuleRef, seedBytes }) {
  const base = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/${capsule.releaseId}/${capsuleRef.sha256}`
  const put = (uri,value) => seedBytes(uri,Buffer.from(canonicalize(value)+'\n'))
  const stage = (name,previousReceiptRef,facts) => put(`${base}/${name}.json`,sealProgramOnlyEvidence({schemaVersion:'jenfu.dev012.stage-receipt.v1',ownerApplicationId:'ai-pdm',releaseId:capsule.releaseId,sourceRevision:oldRevision,stage:name,previousReceiptRef,facts,observedAt:now,status:'PASS'}))
  const archive = gzipSync(b35GitArchive(oldRevision,b35HistoricalBundle.bundle.entries),{level:9})
  const sourceObject = {...seedBytes(`gs://jenfu-platform-prod-aipdm-release/source/releases/${capsule.releaseId}/${capsuleRef.sha256}/source.tar.gz`,archive),generation:'17',crc32c:crc32cBase64(archive)}
  const migrationBundleRef=seedBytes(`gs://jenfu-platform-prod-aipdm-release/source/migration-bundles/${oldRevision}/${b35HistoricalBundle.bundle.manifestSha256}.json`,b35HistoricalBundle.bytes)
  const artifactDigest=`${b35AppProfile.artifact.uri}@sha256:${'3'.repeat(64)}`,buildId='33333333-3333-3333-3333-333333333333',candidateRevision='ai-pdm-prod-'+'2'.repeat(12)
  const cloudBuild={name:`projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`,id:buildId,status:'SUCCESS',projectId:'jenfu-platform-prod',serviceAccount:`projects/jenfu-platform-prod/serviceAccounts/${b35AppProfile.identities.builder}`,options:{requestedVerifyOption:'VERIFIED'},sourceProvenance:{resolvedStorageSource:{bucket:'jenfu-platform-prod-aipdm-release',object:sourceObject.uri.split('/').slice(3).join('/'),generation:'17'}},results:{images:[{name:`${b35AppProfile.artifact.uri}:release-${oldRevision}`,digest:artifactDigest.split('@')[1]}]}}
  const provenanceReceiptRef=put(`${base}/provenance.json`,{schemaVersion:'jenfu.dev012.build-provenance-receipt.v1',ownerApplicationId:'ai-pdm',sourceRevision:oldRevision,sourceObject,artifactDigest,status:'PASS',cloudBuild,artifactRegistry:{uri:artifactDigest}})
  const prerequisiteRefs=Object.fromEntries(Object.entries({sourceLock:'sourceLockRef',authorization:'authorizationPolicyRef',readiness:'readinessReceiptRef',foundation:'foundationReceiptRef',infra:'infraReceiptRef',runtimeConfig:'runtimeConfigRef'}).map(([name,key])=>[name,capsule[key]]))
  const prepare=stage('prepare',null,{prerequisiteRefs}),build=stage('build',prepare,{artifactDigest,sourceObject,migrationBundleRef,provenanceReceiptRef})
  const deployment=put(`${base}/deployment-capsule.json`,{schemaVersion:b35AppProfile.schemas.deploymentCapsule,ownerApplicationId:'ai-pdm',sourceRevision:oldRevision,artifactDigest,buildReceiptRef:build,sourceObject,migrationBundleRef,migrationRunnerDigest:`${b35AppProfile.artifact.migrationRunnerUri}@sha256:${'e'.repeat(64)}`,releaseIntentRef:capsuleRef,releaseIntentSha256:capsuleRef.sha256,deadlineAt:capsule.deadlineAt})
  const migrate=put(`${base}/migrate.json`,sealProgramOnlyEvidence({schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'ai-pdm',sourceRevision:oldRevision,database:'jenfu_prod',ledger:'ai_pdm_core.schema_migrations',manifestSha256:b35HistoricalBundle.bundle.manifestSha256,baselineCount:15,minimumLedgerCount:0,ledgerBootstrap:{enabled:true,created:false},ledgerCount:33,applied:0,replayed:33,crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}],boundaryStatus:'PASS',executionName:'ai-pdm-prod-migration-runner-local33',startedAt:now,completedAt:now,status:'PASS'}))
  let previous=stage('candidate',migrate,{candidateRevision,artifactDigest,migrationReceiptRef:migrate,deploymentCapsuleRef:deployment})
  const candidate=previous;previous=stage('entrypoint',previous,{})
  previous=stage('verify',previous,{candidateRevision,artifactDigest,smoke:{status:'PASS'}})
  previous=stage('decision',previous,{candidateRevision,artifactDigest,decision:'GO'})
  previous=stage('activate',previous,{candidateRevision,artifactDigest,effectiveRevision:candidateRevision})
  const canonical=stage('canonical',previous,{candidateRevision,artifactDigest,origin:profile.canonicalOrigin,smoke:{status:'PASS'}})
  previous=stage('finalize',canonical,{candidateRevision,artifactDigest,result:'RELEASED',temporaryCandidateTags:0})
  const terminal=stage('terminal',previous,{candidateRevision,artifactDigest,result:'RELEASED',databaseDisposition:'FORWARD_APPLIED',remainingHumanAction:0})
  return {canonical,prepare,migrate,terminal,deployment,candidate,artifactDigest,cloudBuild,candidateRevision}
}

import {readPreActivationAbortContinuation} from './lib/dev121-preactivation-abort-continuation.mjs'
import {readProgramOnlyReleasedBaseline} from './lib/dev117-ai-pdm-program-only-baseline.mjs'
import {verifyOwnerProviderReadback} from './lib/dev121-owner-release-proof.mjs'
async function b35ProgramAbortFixture({preExecution=false}={}) {
  const wire=await b35ProgramProofFixture({releasedBaseline:true}),h=wire.h,anchor=h.modeledReleasedAnchor
  const validators=createOwnerTransport({token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl})
  const paths=releasePaths(b35AppProfile,wire.capsule,wire.intentRef.sha256),entrypoint={ingress:'INGRESS_TRAFFIC_ALL',defaultUriDisabled:false,invokerIamDisabled:true,uri:b35AppProfile.target.canonicalOrigin,urls:[b35AppProfile.target.canonicalOrigin],serviceEtag:'LOCAL_SERVICE_ETAG',generation:'17'}
  const stage=(name,previousReceiptRef,facts)=>wire.put(paths[name],sealProgramOnlyEvidence({schemaVersion:'jenfu.dev012.stage-receipt.v1',ownerApplicationId:'ai-pdm',releaseId:wire.capsule.releaseId,sourceRevision:currentRevision,stage:name,previousReceiptRef,facts,observedAt:now,status:'PASS'}))
  const prepareValue=JSON.parse(h.objects.get(wire.prepare.uri).bytes);prepareValue.facts.previousRevision=wire.capsule.previousRevision;prepareValue.facts.entrypointBaseline=entrypoint
  const prepare=stage('prepare',null,prepareValue.facts)
  // Reseal only the modeled build's predecessor; immutable production inputs are untouched.
  const buildRow=JSON.parse(h.objects.get(`${wire.base}/build.json`).bytes);buildRow.previousReceiptRef=prepare
  const buildRef=wire.put(`${wire.base}/build.json`,sealProgramOnlyEvidence(buildRow))
  const deployment=JSON.parse(h.objects.get(wire.deploymentRef.uri).bytes);deployment.buildReceiptRef=buildRef
  const deploymentRef=wire.put(wire.deploymentRef.uri,deployment)
  const migration=JSON.parse(h.objects.get(wire.migrate.uri).bytes);migration.deploymentCapsuleRef=deploymentRef
  const migrate=wire.put(wire.migrate.uri,sealProgramOnlyEvidence(migration))
  const absentUris=[migrate.uri,...['nativeReceiptRef','submissionIntentRef','executionReadbackRef','jobReadbackRef'].map(key=>migration[key].uri)]
  if(preExecution)for(const uri of absentUris)h.objects.delete(uri)
  const facts={result:'PRE_ACTIVATION_ABORTED',databaseDisposition:preExecution?'NOT_APPLIED':'READ_ONLY_BASELINE_VERIFIED',currentDatabaseReadPerformed:!preExecution,previousRevision:wire.capsule.previousRevision,...(preExecution?{}:{migrationEvidenceRef:migrate}),recoveryOrder:['TRAFFIC_ROLLBACK','TAG_CLEANUP','ENTRYPOINT_BASELINE_RESTORE'],entrypointRecovery:{result:preExecution?'NOT_REQUIRED':'BASELINE_ALREADY_ACTIVE',changed:false}}
  const rollback=stage('rollback',preExecution?null:migrate,facts),terminal=stage('terminal',rollback,facts)
  const controlCore={schemaVersion:'jenfu.dev012.owner-control-head.v1',inputFingerprint:sha256(canonicalize({ownerApplicationId:'ai-pdm',releaseId:wire.capsule.releaseId,sourceRevision:currentRevision,releaseIntentSha256:wire.intentRef.sha256})),ownerApplicationId:'ai-pdm',service:b35AppProfile.target.serviceName,controlBucket:b35AppProfile.artifact.releaseBucket,releaseId:wire.capsule.releaseId,sourceRevision:currentRevision,sourceLockSha256:wire.capsule.sourceLockRef.sha256,candidateRevision:null,previousRevision:wire.capsule.previousRevision,ownerRunRef:`https://api.github.com/repos/${b35AppProfile.application.repository}/actions/runs/351`,leaseExpiresAt:now,deadlineAt:wire.capsule.deadlineAt,state:'FINALIZED',result:'PRE_ACTIVATION_ABORTED'}
  const control={...controlCore,controlSha256:sha256(canonicalize(controlCore))},calls=[],inventory=preExecution?[]:[wire.execution]
  wire.put(`gs://${b35AppProfile.artifact.releaseBucket}/control/active.json`,control)
  const transport={...h.transport,readOwnerRun:async()=>({id:'351',status:'completed',conclusion:'failure',event:'workflow_dispatch',headSha:currentRevision,createdAt:now,updatedAt:now}),request:async(url,options={})=>{calls.push({url,method:options.method??'GET'});assert.ok(url.startsWith(`https://run.googleapis.com/v2/${wire.job.name}/executions?`));return {executions:structuredClone(inventory)}},
    readOwnerSourceProof:async({sourceRevision,refs,verifyProvider})=>{const proof=await readAiPdmReleaseObservation({sourceRevision,refs,token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl,readSource:wire.readSource});return {proof,provider:verifyProvider?await verifyOwnerProviderReadback({proof,token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl}):null}},
    assertServiceSettled:validators.assertServiceSettled,assertCanonicalEntrypoint:validators.assertCanonicalEntrypoint,entrypointSnapshot:validators.entrypointSnapshot,getRevision:async()=>({name:`projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod/revisions/${wire.capsule.previousRevision}`,conditions:[{type:'Ready',state:'CONDITION_SUCCEEDED'}],containers:[{name:b35AppProfile.runtime.containerName,image:anchor.artifactDigest}]})}
  const service={...entrypoint,etag:entrypoint.serviceEtag,generation:'17',observedGeneration:'17',reconciling:false,terminalCondition:{state:'CONDITION_SUCCEEDED'},name:'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',traffic:[{revision:wire.capsule.previousRevision,percent:100}],trafficStatuses:[{revision:wire.capsule.previousRevision,percent:100}],scaling:{scalingMode:'AUTOMATIC',maxInstanceCount:1}}
  transport.getService=async()=>{calls.push({url:`https://run.googleapis.com/v2/${service.name}`,method:'GET'});return service}
  return {wire,h,transport,calls,inventory,control,service,prepare,migrate,terminal,absentUris,rollback,
    read:(verifyProvider=false)=>readPreActivationAbortContinuation({profile:b35AppProfile,transport,baselineIntentRef:wire.intentRef,verifyProvider})}
}
test('P07 sealed program-only abort consumes genuine modeled RELEASED33 source graph and exact stable execution inventory cold/warm',async()=>{
  const f=await b35ProgramAbortFixture()
  const cold=await f.read(),warm=await f.read();assert.equal(cold.kind,'PROGRAM_ONLY_ABORT');assert.deepEqual(cold,warm)
  assert.deepEqual(cold.authorityBasis.releasedIntentRef,f.wire.capsule.baselineIntentRef);assert.equal(f.calls.filter(row=>row.url.includes('/executions?')).length,4)
  assert.ok(f.calls.every(row=>row.method==='GET'));noMutation(f.h)
})
test('P07 program-only abort rejects duplicate, active, unmatched-current and unstable historical inventories',async()=>{
  for(const change of ['duplicate','active','current-extra','unstable-old']){
    const f=await b35ProgramAbortFixture(),extra=structuredClone(f.wire.execution)
    if(change==='duplicate')f.inventory.push(extra)
    if(change==='active')f.inventory[0].runningCount=1
    if(change==='current-extra'){extra.name+='-extra';f.inventory.push(extra)}
    if(change==='unstable-old'){
      extra.name+='-old';extra.createTime=extra.completionTime='2026-10-06T15:00:00.000Z';extra.template.containers[0].args=['--historic'];let reads=0
      f.transport.request=async(url)=>{f.calls.push({url,method:'GET'});return {executions:++reads===1?[f.wire.execution]:[f.wire.execution,extra]}}
    }
    await assert.rejects(f.read(),/DEV121_PREACTIVATION_CONTINUATION_INVALID/u);assert.ok(f.calls.every(row=>row.method==='GET'));noMutation(f.h)
  }
})
test('P07 NOT_APPLIED and UNKNOWN stay truthful and reject completed-readonly continuation',async()=>{
  for(const disposition of ['NOT_APPLIED','UNKNOWN']){const f=await b35ProgramAbortFixture(),value=JSON.parse(f.h.objects.get(f.terminal.uri).bytes);value.facts.databaseDisposition=disposition;value.facts.currentDatabaseReadPerformed=false
    f.wire.put(f.terminal.uri,sealProgramOnlyEvidence(value));await assert.rejects(f.read(),/DEV121_PREACTIVATION_CONTINUATION_INVALID/u);assert.equal(f.calls.length,0);noMutation(f.h)}
})


test('P08 preexecution abort preserves build-only truth and admits cold/warm/provider and baseline consumers',async()=>{
  const f=await b35ProgramAbortFixture({preExecution:true})
  const cold=await f.read(),warm=await f.read();assert.deepEqual(cold,warm)
  assert.equal(cold.kind,'PROGRAM_ONLY_ABORT');assert.equal(cold.authorityBasis.schemaVersion,'aipdm.program-only-preexecution-abort-basis.v1')
  assert.equal(cold.authorityBasis.databaseDisposition,'NOT_APPLIED');assert.equal(cold.authorityBasis.currentDatabaseReadPerformed,false)
  assert.equal(cold.authorityBasis.failedProof.disposition,'build_only');assert.equal(cold.authorityBasis.failedProof.migrationVerified,false)
  assert.ok(!Object.hasOwn(cold.authorityBasis.stageRefs,'migration'))
  const verified=await f.read(true);assert.deepEqual(verified,cold)
  const baseline=await readProgramOnlyReleasedBaseline({transport:f.transport,profile:b35AppProfile,baselineIntentRef:f.wire.intentRef,previousRevision:f.wire.capsule.previousRevision,bundles:b35Bundles})
  assert.deepEqual(baseline.releasedIntentRef,f.wire.capsule.baselineIntentRef);assert.equal(baseline.baselineEntries.length,33)
  assert.ok(f.calls.every(row=>row.method==='GET'));assert.ok(f.wire.calls.every(row=>row.method==='GET'));noMutation(f.h)
})

test('P08 preexecution abort rejects any migrate/native/submission/readback or downstream evidence',async()=>{
  for(const kind of ['migrate','native','submission','execution','job','candidate','entrypoint','verify','decision','activate','canonical','finalize']){
    const f=await b35ProgramAbortFixture({preExecution:true}),index=['migrate','native','submission','execution','job'].indexOf(kind)
    const uri=index>=0?f.absentUris[index]:releasePaths(b35AppProfile,f.wire.capsule,f.wire.intentRef.sha256)[kind]
    f.wire.put(uri,{schemaVersion:'LOCAL_TEST_UNEXPECTED_EVIDENCE'})
    await assert.rejects(f.read());assert.ok(f.calls.every(row=>row.method==='GET'));noMutation(f.h)
  }
})

test('P08 preexecution abort rejects denied/unknown absence and non-quiescent execution inventories',async()=>{
  for(const kind of ['DENIED','OUTCOME_UNKNOWN','duplicate','active','current','source-match','output-match','incomplete-pages']){
    const f=await b35ProgramAbortFixture({preExecution:true})
    const old=structuredClone(f.wire.execution);old.name+='-historic';old.createTime=old.startTime=old.completionTime='2026-10-06T15:00:00.000Z';old.template.containers[0].args=['--historic']
    if(['DENIED','OUTCOME_UNKNOWN'].includes(kind)){const original=f.transport.readBytes;f.transport.readBytes=async(uri,options)=>{if(uri===f.absentUris[2])throw Object.assign(new Error(kind),{code:kind});return original(uri,options)}}
    else if(kind==='incomplete-pages')f.transport.request=async()=>({executions:[],nextPageToken:'LOCAL_TEST_REPEAT_TOKEN'})
    else{f.inventory.push(old);if(kind==='duplicate')f.inventory.push(structuredClone(old));if(kind==='active')old.runningCount=1;if(kind==='current')old.createTime=f.wire.execution.createTime;if(kind==='source-match')old.template.containers[0].args=[currentRevision];if(kind==='output-match')old.template.containers[0].args=[f.absentUris[1]]}
    await assert.rejects(f.read());assert.ok(f.calls.every(row=>row.method==='GET'));noMutation(f.h)
  }
})

test('P08 preexecution abort rejects false database/recovery/control/provider claims with zero writes',async()=>{
  for(const kind of ['rollback-db','migration-claim','recovery','control','provider','missing-build','missing-deployment','provider-time-order']){
    const f=await b35ProgramAbortFixture({preExecution:true})
    if(kind==='control'){f.control.candidateRevision='ai-pdm-prod-local-unexpected';f.wire.put(`gs://${b35AppProfile.artifact.releaseBucket}/control/active.json`,f.control)}
    else if(kind==='provider')f.transport.getRevision=async()=>({name:'UNEXPECTED_REVISION'})
    else if(kind==='missing-build')f.h.objects.delete(`${f.wire.base}/build.json`)
    else if(kind==='missing-deployment')f.h.objects.delete(f.wire.deploymentRef.uri)
    else if(kind==='provider-time-order'){
      // Cross-provider clock ordering is not authority. The sealed capsule L..D remains authoritative.
      const original=f.transport.readOwnerRun;f.transport.readOwnerRun=async(...args)=>({...await original(...args),createdAt:'2026-10-07T16:00:00.000Z',updatedAt:'2026-10-07T16:01:00.000Z'})
      const result=await f.read();assert.equal(result.authorityBasis.currentDatabaseReadPerformed,false);noMutation(f.h);continue
    }else{const value=JSON.parse(f.h.objects.get(f.rollback.uri).bytes);if(kind==='rollback-db')value.facts.currentDatabaseReadPerformed=true;if(kind==='migration-claim')value.facts.migrationEvidenceRef=f.migrate;if(kind==='recovery')value.facts.entrypointRecovery.result='BASELINE_ALREADY_ACTIVE';f.wire.put(f.rollback.uri,sealProgramOnlyEvidence(value))}
    await assert.rejects(f.read());assert.ok(f.calls.every(row=>row.method==='GET'));noMutation(f.h)
  }
})

// B35 authentic modeled RELEASED33 source, with a fresh source-bound consumer capsule.
// All provider observations and owner receipts remain LOCAL_TEST fixture evidence.
function b35ConsumerPlainEnvironment() {
  const environment = b35AppProfile.environment
  const result = Object.fromEntries(environment.requiredPlainEnvironmentNames.map(name => [
    name,
    environment.fixedValues?.[name] ?? environment.controlledValues?.[name]?.defaultValue ?? 'LOCAL_TEST',
  ]))
  result.PDM_OPENSWX_DISPATCH_ENABLED = '1'
  return result
}

function b35ConsumerTransport(fixture, plainEnvironment, nativeMutations) {
  const transport = { ...fixture.transport }
  const providerRequest = fixture.wire.h.transport.request
  const continuationRequest = fixture.transport.request
  const migrationExecutionsPrefix = 'https://run.googleapis.com/v2/' + fixture.wire.job.name + '/executions?'
  transport.effectiveRevision = service => {
    const active = (service.traffic ?? []).find(row => Number(row.percent) === 100)
    return active?.revision ?? null
  }
  transport.request = async (url, options = {}) => {
    const method = options.method ?? 'GET'
    if (url.startsWith(migrationExecutionsPrefix)) return continuationRequest(url, options)
    if (url.endsWith(':access')) {
      nativeMutations.push('SECRET_ACCESS')
      throw Error('LOCAL_TEST_SECRET_ACCESS_FORBIDDEN')
    }
    if (method !== 'GET' && !(method === 'POST' && url.endsWith(':getIamPolicy'))) {
      nativeMutations.push(method + ' ' + url)
      throw Error('LOCAL_TEST_NATIVE_MUTATION_FORBIDDEN')
    }
    return providerRequest(url, options)
  }
  const originalGetRevision = transport.getRevision
  transport.getRevision = async (...args) => {
    const revision = await originalGetRevision(...args)
    const app = revision.containers.find(row => row.name === b35AppProfile.runtime.containerName)
    app.env = Object.entries(plainEnvironment).map(([name, value]) => ({ name, value }))
    return revision
  }
  for (const name of [
    'createBuild', 'exportSbom', 'runMigrationJob', 'createCandidate', 'configureEntrypoint',
    'runAuthenticatedSmoke', 'runInternalCandidateSmoke', 'setTraffic', 'activatePrincipalOnly',
    'removeCandidateTag', 'restoreEntrypoint', 'prepareProductionStorage',
  ]) {
    if (typeof transport[name] !== 'function') continue
    transport[name] = async () => {
      nativeMutations.push(name)
      throw Error('LOCAL_TEST_NATIVE_MUTATION_FORBIDDEN')
    }
  }
  return transport
}

async function b35PreexecutionConsumerFixture(label = 'PASS') {
  const fixture = await b35ProgramAbortFixture({ preExecution: true })
  const releaseId = 'DEV122-B35-PREEXEC-CONSUMER-' + label
  const observedAt = fixture.wire.h.transport.now()
  const expiresAt = '2999-01-01T00:00:00.000Z'
  const deadlineAt = deadline()
  const plainEnvironment = b35ConsumerPlainEnvironment()
  const sourceLock = { ...structuredClone(fixture.wire.h.lock), releaseId }
  const sourceLockRef = fixture.wire.h.seedBytes(
    `gs://${b35AppProfile.artifact.releaseBucket}/receipts/releases/${releaseId}/source-lock.json`,
    Buffer.from(`${canonicalize(sourceLock)}\n`),
  )
  const currentSourceObjectRef = fixture.wire.h.seedBytes(
    `gs://${b35AppProfile.artifact.releaseBucket}/source/releases/${releaseId}/current-source.tar.gz`,
    Buffer.from(fixture.wire.h.objects.get(fixture.wire.h.currentSourceRef.uri).bytes),
  )
  const reuseInput = {
    ...fixture.wire.h.input,
    sourceLockRef,
    currentSourceObjectRef,
    receiptId: `LOCAL-B35-CONSUMER-${label}`,
  }
  const reuseInputRef = fixture.wire.h.seed(`b35-consumer-reuse-input-${label}`, reuseInput)
  const currentReuse = await executeWorkerArtifactReuse({
    transport: fixture.wire.h.transport,
    inputRef: reuseInputRef,
    readSource: fixture.wire.h.readSource,
  })
  const workerRef = currentReuse.refs.programOnlyFullDescriptorRef
  const descriptor = (await fixture.wire.h.transport.readJson(workerRef)).value
  const retainedWorker = {
    descriptorRef: workerRef,
    priorActivationRef: currentReuse.value.priorActivationRef,
    currentAssociationRef: currentReuse.ref,
    readyResourceReadbackRef: currentReuse.value.resourceAssociation.readbackRef,
  }

  const policy = buildProgramOnlyPolicy({
    profile: b35AppProfile,
    sourceLock,
    bundles: b35Bundles,
    baselineIntentRef: fixture.wire.intentRef,
    baselineEntries: b35Bundles.effective.bundle.entries,
    migrationRunnerDigest: fixture.wire.capsule.programOnlyBaseline.migrationRunnerDigest,
    retainedWorker,
  })
  const openswxWorker = {
    purpose: 'full',
    sourceRevision: currentRevision,
    workerProfileSha256: descriptor.workerProfileSha256,
    descriptorRef: workerRef,
  }
  const secretVersions = Object.fromEntries(b35AppProfile.environment.requiredSecretNames.map(name => [
    name,
    name === 'PDM_WORKLOAD_AUTH_CREDENTIALS'
      ? descriptor.registrySecretVersion.split('/').at(-1)
      : '1',
  ]))
  const runtimeConfig = buildRuntimeConfigReceipt({
    profile: b35AppProfile, releaseId, sourceLock, plainEnvironment, secretVersions, openswxWorker, observedAt,
  })
  runtimeConfig.evidenceScope = 'LOCAL_TEST'
  const runtimeConfigRef = fixture.wire.put(
    'gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + releaseId + '/runtime-config.json',
    runtimeConfig,
  )
  const foundation = {
    ownerApplicationId: 'ai-pdm', projectId: b35AppProfile.target.projectId, releaseId,
    status: 'APPLIED', releaseAuthority: true, evidenceScope: 'LOCAL_TEST',
    foundationManifestSha256: 'f'.repeat(64),
  }
  const foundationReceiptRef = fixture.wire.put(
    'gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + releaseId + '/foundation.json',
    foundation,
  )
  const infra = {
    ownerApplicationId: 'ai-pdm', projectId: b35AppProfile.target.projectId, releaseId,
    status: 'APPLIED', releaseAuthority: true, evidenceScope: 'LOCAL_TEST',
    migrationRunnerDigest: policy.migrationRunnerDigest,
  }
  const infraReceiptRef = fixture.wire.put(
    'gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + releaseId + '/infra.json',
    infra,
  )
  const nativeMutations = []
  const transport = b35ConsumerTransport(fixture, plainEnvironment, nativeMutations)
  const authority = await executePrerequisiteProducer({
    stage: 'routine-authority',
    releaseId,
    input: {
      schemaVersion: 'jenfu.dev012.routine-owner-authority-input.v1',
      sourceLockRef, runtimeConfigRef, baselineIntentRef: fixture.wire.intentRef, expiresAt,
    },
    profile: b35AppProfile,
    transport,
    validateIntent: assertDev117ReleaseIntent,
    observedAt,
  })
  const readValue = async ref => (await transport.readJson(ref, b35AppProfile.artifact.releaseBucket, ['receipts'])).value
  const authorization = await readValue(authority.refs.authorizationPolicyRef)
  const readiness = await readValue(authority.refs.readinessReceiptRef)
  const input = {
    sourceLockRef, runtimeConfigRef,
    ...authority.refs,
    foundationReceiptRef, infraReceiptRef,
    baselineIntentRef: fixture.wire.intentRef,
    openswxWorkerRef: workerRef,
    programOnlyBaseline: policy,
    previousRevision: fixture.wire.capsule.previousRevision,
    deadlineAt,
  }
  const values = { sourceLock, authorization, readiness, foundation, infra, runtimeConfig }
  const intent = buildReleaseIntent({
    profile: b35AppProfile, releaseId, input, sourceLock, prerequisiteValues: values,
    validateIntent: assertDev117ReleaseIntent, workerDescriptor: descriptor, programOnlyPolicy: policy,
  })
  const capsuleRef = fixture.wire.put(
    'gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + releaseId + '/release-intent.json',
    intent,
  )
  const environment = {
    OWNER_EXECUTION_MODE: 'full_release',
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: b35AppProfile.application.repository,
    GITHUB_REPOSITORY_ID: '1234',
    GITHUB_REPOSITORY_OWNER_ID: '5678',
    GITHUB_SHA: currentRevision,
    GITHUB_WORKFLOW_SHA: currentRevision,
    GITHUB_WORKFLOW_REF: b35AppProfile.application.repository + '/' + b35AppProfile.workflow.path + '@refs/heads/main',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example',
    GOOGLE_OAUTH_ACCESS_TOKEN: 'LOCAL_TEST_ONLY_NOT_A_CREDENTIAL',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
  }
  const buildMigrationBundle = revision => {
    assert.equal(revision, currentRevision)
    return b35FullBundle
  }
  const execute = (overrides = {}) => executeOwnerStage({
    stage: 'prepare',
    capsuleRef: capsuleRef.uri,
    capsuleSha256: capsuleRef.sha256,
    // LOCAL_TEST consumer seam only: the unrelated R78 cutover graph is omitted.
    // Production CLI assertDev117V3Profile rejects this gate; b35AppProfile stays unchanged.
    profile: { ...b35AppProfile, dataCutover: { ...b35AppProfile.dataCutover, gateMode: 'LOCAL_TEST_UNRELATED_CUTOVER_OMITTED' } },
    transport,
    environment,
    validateIntent: assertDev117ReleaseIntent,
    buildMigrationBundle,
    readWorkerSource: fixture.wire.f.h.readSource,
    ...overrides,
  })
  return {
    fixture, releaseId, sourceLock, policy, authorization, readiness, intent, capsuleRef,
    transport, nativeMutations, environment, buildMigrationBundle, execute,
  }
}

function b35RebindConsumerCapsule(consumer, intent, name, cachedPrepare) {
  const capsuleRef = consumer.fixture.wire.put(
    'gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + consumer.releaseId + '/release-intent-' + name + '.json',
    intent,
  )
  const paths = releasePaths(b35AppProfile, intent, capsuleRef.sha256)
  if (cachedPrepare) consumer.fixture.wire.put(paths.prepare, cachedPrepare)
  return { capsuleRef, paths }
}

test('LOCAL_TEST P08 consumer binds fresh routine authorization and cached prepare to one PROGRAM_ONLY_ABORT basis', async () => {
  const consumer = await b35PreexecutionConsumerFixture()
  const controlUri = 'gs://jenfu-platform-prod-aipdm-release/control/active.json'
  const originalControl = Buffer.from(consumer.fixture.wire.h.objects.get(controlUri).bytes)
  const prepare = await consumer.execute()
  const replay = await consumer.execute()
  assert.equal(replay.ref.sha256, prepare.ref.sha256)
  assert.deepEqual(consumer.authorization.preActivationAbortBasis, consumer.readiness.preActivationAbortBasis)
  assert.deepEqual(prepare.value.facts.preActivationAbortBasis, consumer.authorization.preActivationAbortBasis)
  assert.equal(consumer.authorization.preActivationAbortBasis.databaseDisposition, 'NOT_APPLIED')
  assert.equal(consumer.authorization.preActivationAbortBasis.currentDatabaseReadPerformed, false)
  assert.equal(consumer.authorization.preActivationAbortBasis.releasedIntentRef.uri, consumer.fixture.wire.capsule.baselineIntentRef.uri)
  assert.deepEqual(consumer.fixture.wire.h.objects.get(controlUri).bytes, originalControl)
  assert.deepEqual(consumer.nativeMutations, [])
  assert.ok(consumer.fixture.calls.every(row => row.method === 'GET'))
  assert.ok(consumer.fixture.wire.calls.every(row => row.method === 'GET'))
  noMutation(consumer.fixture.h)
})

test('LOCAL_TEST P08 consumer rejects authorization/readiness basis tamper and hash-correct cached basis tamper', async () => {
  for (const kind of ['authorization', 'readiness']) {
    const consumer = await b35PreexecutionConsumerFixture(kind.toUpperCase())
    const prepare = await consumer.execute()
    await consumer.execute()
    const wrongBasis = { ...consumer.authorization.preActivationAbortBasis, inventorySha256: '0'.repeat(64) }
    const changed = kind === 'authorization'
      ? { ...consumer.authorization, preActivationAbortBasis: wrongBasis }
      : { ...consumer.readiness, preActivationAbortBasis: wrongBasis }
    const changedRef = consumer.fixture.wire.put(
      'gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + consumer.releaseId + '/' + kind + '-basis-tampered.json',
      changed,
    )
    const changedIntent = {
      ...consumer.intent,
      [kind === 'authorization' ? 'authorizationPolicyRef' : 'readinessReceiptRef']: changedRef,
    }
    b35RebindConsumerCapsule(consumer, changedIntent, kind, prepare.value)
    const variant = consumer.fixture.wire.h.objects.get(
      'gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + consumer.releaseId + '/release-intent-' + kind + '.json',
    ).ref
    await assert.rejects(consumer.execute({ capsuleRef: variant.uri, capsuleSha256: variant.sha256 }), /PREPARE_BASELINE_MISMATCH/u)
    assert.deepEqual(consumer.nativeMutations, [])
    noMutation(consumer.fixture.h)
  }

  const consumer = await b35PreexecutionConsumerFixture('CACHED')
  const prepare = await consumer.execute()
  await consumer.execute()
  const { receiptSha256, ...core } = structuredClone(prepare.value)
  delete core.facts.preActivationAbortBasis
  consumer.fixture.wire.put(prepare.ref.uri, { ...core, receiptSha256: sha256(canonicalize(core)) })
  await assert.rejects(consumer.execute(), /PREPARE_BASELINE_MISMATCH/u)
  assert.deepEqual(consumer.nativeMutations, [])
  noMutation(consumer.fixture.h)
})

test('LOCAL_TEST P08 cached prepare replay rechecks control, retained image, and execution inventory drift', async () => {
  for (const kind of ['control', 'image', 'inventory']) {
    const consumer = await b35PreexecutionConsumerFixture(kind.toUpperCase())
    await consumer.execute()
    await consumer.execute() // Establish a successful cached replay before injecting new drift.

    if (kind === 'control') {
      const controlUri = 'gs://jenfu-platform-prod-aipdm-release/control/active.json'
      const { controlSha256, ...controlCore } = structuredClone(consumer.fixture.control)
      controlCore.candidateRevision = consumer.fixture.wire.capsule.previousRevision
      consumer.fixture.wire.put(controlUri, { ...controlCore, controlSha256: sha256(canonicalize(controlCore)) })
    } else if (kind === 'image') {
      const original = consumer.transport.getRevision
      consumer.transport.getRevision = async (...args) => {
        const revision = await original(...args)
        revision.containers.find(row => row.name === b35AppProfile.runtime.containerName).image =
          b35AppProfile.artifact.uri + '@sha256:' + 'f'.repeat(64)
        return revision
      }
    } else {
      consumer.fixture.inventory.push(structuredClone(consumer.fixture.wire.execution))
    }

    await assert.rejects(consumer.execute())
    assert.deepEqual(consumer.nativeMutations, [])
    noMutation(consumer.fixture.h)
  }
})

test('P00 program-only baseline qualification consumes full authenticated RELEASED33 graph and exact provider GETs',async()=>{
  const f=await b35ProgramAbortFixture()
  const result=await readProgramOnlyReleasedBaseline({transport:f.transport,profile:b35AppProfile,baselineIntentRef:f.wire.capsule.baselineIntentRef,previousRevision:f.wire.capsule.previousRevision,bundles:b35Bundles})
  assert.equal(result.graph.bundle.bundle.entries.length,33);assert.equal(result.observed.provider.status,'BUILD_IMAGE_VERIFIED')
  assert.deepEqual(result.baselineEntries,b35Bundles.effective.bundle.entries);assert.equal(result.migrationRunnerDigest,f.wire.capsule.programOnlyBaseline.migrationRunnerDigest)
  assert.ok(f.wire.calls.some(row=>row.url.startsWith('https://cloudbuild.googleapis.com/')))
  assert.ok(f.wire.calls.some(row=>row.url.startsWith('https://artifactregistry.googleapis.com/')))
  assert.ok(f.wire.calls.every(row=>row.method==='GET'));noMutation(f.h)
})
test('P00 program-only baseline qualification rejects a different installed prefix after genuine source/provider verification',async()=>{
  const f=await b35ProgramAbortFixture(),bundles=structuredClone(b35Bundles)
  bundles.effective.bundle.entries[0].appliedSha256='0'.repeat(64)
  await assert.rejects(readProgramOnlyReleasedBaseline({transport:f.transport,profile:b35AppProfile,baselineIntentRef:f.wire.capsule.baselineIntentRef,previousRevision:f.wire.capsule.previousRevision,bundles}),/installed-prefix/u)
  assert.ok(f.wire.calls.every(row=>row.method==='GET'));noMutation(f.h)
})

test('P07 program-only abort applies native service settled, traffic, entrypoint and retained image guards',async()=>{
  for(const mutation of ['active','generation','traffic','tag','entrypoint','image']){
    const f=await b35ProgramAbortFixture()
    if(mutation==='active')f.service.reconciling=true
    if(mutation==='generation')f.service.observedGeneration='16'
    if(mutation==='traffic')f.service.traffic[0].percent=99
    if(mutation==='tag')f.service.traffic.push({revision:f.wire.capsule.previousRevision,percent:0,tag:'candidate-local'})
    if(mutation==='entrypoint')f.service.invokerIamDisabled=false
    if(mutation==='image'){const read=f.transport.getRevision;f.transport.getRevision=async()=>{const row=await read();row.containers[0].image+='bad';return row}}
    await assert.rejects(f.read());assert.ok(f.calls.every(row=>row.method==='GET'));noMutation(f.h)
  }
})

async function b35MetadataReuseFixture(options={}) {
  const h = await b22ReuseIamFixture(options), originalReader = h.readSource
  const metadataPaths = [SECRET_VERSION_IAM_SOURCE_PATH, SECRET_VERSION_IAM_HUMAN_APPROVAL_PATH, 'scripts/lib/dev122-openswx-secret-version-iam.mjs', 'scripts/dev122-openswx-secret-version-iam.mjs']
  h.readSource = (name, revision) => metadataPaths.includes(name) ? readFileSync(path.join(root, name)) : originalReader(name, revision)
  Object.assign(h.readSource, originalReader)
  h.transport.now = () => new Date(Date.now()).toISOString()
  const lock = { ...h.lock, observedAt: new Date(Date.now()-2000).toISOString() }
  const sourceLockRef = h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/'+lock.releaseId+'/source-lock.json', Buffer.from(canonicalize(lock)+'\n'))
  const secretPolicies = {
    [profile.tokenSecretId]: {bindings:[{role:'roles/secretmanager.secretAccessor',members:['serviceAccount:'+profile.readerServiceAccount]}]},
    [profile.registrySecretId]: {bindings:[{role:'roles/secretmanager.secretAccessor',members:['serviceAccount:aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'],condition:{title:'existing',expression:'true'}}]},
  }
  const metadata = await seedSecretVersionIamContinuation(h, {sourceRevision: currentRevision, sourceLockRef, supplementalIamReadbackRef:h.iam.receiptRef,
    prebuildIamContinuationRef:h.proof.continuationRef,reader:h.readSource,name:'b35-secret-version-iam',secretPolicies})
  const previousInput = JSON.parse(h.objects.get(h.inputRef.uri).bytes)
  const input = {...previousInput,sourceLockRef,secretVersionIamContinuationRef:metadata.continuationRef}
  h.inputRef = await h.put('b35-metadata-reuse-input',input)
  const originalRequest=h.transport.request
  h.transport.request=async(url,options={})=>{
    if(url==='https://iam.googleapis.com/v1/'+SECRET_VERSION_IAM_ROLE){h.calls.push({url,options});return structuredClone(metadata.after.secretVersionRole)}
    for(const secret of SECRET_VERSION_IAM_SECRETS) if(url==='https://secretmanager.googleapis.com/v1/projects/jenfu-platform-prod/secrets/'+secret+':getIamPolicy?options.requestedPolicyVersion=3'
      ||url==='https://secretmanager.googleapis.com/v1/projects/jenfu-platform-prod/secrets/'+secret+':getIamPolicy'){
      h.calls.push({url,options});return structuredClone(metadata.after.secretPolicies[secret])
    }
    return originalRequest(url,options)
  }
  return {...h,input,metadata}
}
test('B35 actual READY producer and pure resolver admit only the source-joined metadata continuation',async()=>{
  const h=await b35MetadataReuseFixture()
  const saved=await executeWorkerArtifactReuse({transport:h.transport,inputRef:h.inputRef,readSource:h.readSource})
  assert.equal(saved.value.status,'PASS')
  assert.ok(saved.refs.programOnlyFullDescriptorRef)
  const ready=JSON.parse(h.objects.get(saved.value.resourceAssociation.readbackRef.uri).bytes)
  assert.equal(ready.resourcesUnchanged,true);assert.equal(ready.mutationPerformed,false)
  assert.equal(ready.image,h.build.image);assert.equal(ready.schedulerState,'ENABLED')
  const tokenPolicyCall=h.calls.find(row=>row.url.includes('/secrets/'+profile.tokenSecretId+':getIamPolicy?options.requestedPolicyVersion=3'))
  assert.ok(tokenPolicyCall)
  const calls=h.calls.length, publications=h.puts.length
  const artifact=await resolveWorkerArtifact({transport:h.transport,descriptor:h.v2(saved.ref),profile,readSource:h.readSource})
  assert.deepEqual(artifact.input.secretVersionIamContinuationRef,h.metadata.continuationRef)
  assert.equal(h.calls.length,calls,'protected resolver consumes sealed refs without IAM provider calls')
  assert.equal(h.puts.length,publications);noMutation(h)
})
async function rdDailyMetadataFixture(options={}) {
  const h = await b35MetadataReuseFixture(options)
  const activation = structuredClone((await h.transport.readJson(h.input.priorActivationRef)).value)
  const capsule = structuredClone((await h.transport.readJson(activation.previousRefs[0])).value)
  const runtime = structuredClone((await h.transport.readJson(capsule.runtimeConfigRef)).value)
  runtime.runtimeConfig.openswxWorker.descriptorRef = capsule.openswxWorkerRef
  capsule.runtimeConfigRef = await h.put('rd-prior-runtime', runtime)
  const capsuleRef = h.seedBytes(activation.previousRefs[0].uri, Buffer.from(canonicalize(capsule)+'\n'))
  const canonical = (await h.transport.readJson(activation.previousRefs[2])).value
  const canonicalRef = h.seedBytes(releasePaths(appProfile, capsule, capsuleRef.sha256).canonical, Buffer.from(canonicalize(canonical)+'\n'))
  activation.previousRefs[0] = capsuleRef; activation.previousRefs[2] = canonicalRef
  const priorActivationRef = await h.put('rd-prior-activation', activation)
  h.input = {...h.input, priorActivationRef}
  h.inputRef = await h.put('rd-metadata-reuse-input', h.input)
  return h
}

test('RD daily metadata continuation reaches pre-read, selftest, full descriptor and zero-write replay', async () => {
  const h = await rdDailyMetadataFixture()
  const reused = await executeWorkerArtifactReuse({ transport: h.transport, inputRef: h.inputRef, readSource: h.readSource })
  const descriptorRef = reused.refs.dailyBuildOnlyDescriptorRef
  h.lifecycle()
  const pauseInputRef = h.seed('RD-METADATA-PAUSE-input', { schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef,
    workerBuildRef: reused.ref, deadlineAt: deadline(), receiptId: 'RD-METADATA-PAUSE', drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: h.input.priorActivationRef })
  const paused = await executeOpenSwxBootstrap({ stage: 'pause', inputRef: pauseInputRef, transport: h.transport, readSource: h.readSource, appProfile, sleep: async () => {} })
  const inputRef = h.seed('RD-METADATA-BOOTSTRAP-input', { schemaVersion: 'aipdm.openswx-bootstrap-input.v1', descriptorRef,
    workerBuildRef: reused.ref, deadlineAt: deadline(), receiptId: 'RD-METADATA-BOOTSTRAP', bootstrapKind: 'DAILY_REFRESH', priorActivationRef: h.input.priorActivationRef, pausedDrainedRef: paused.ref })
  const run = () => executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef, transport: h.transport, readSource: h.readSource, appProfile, sleep: async () => {} })
  const bootstrap = await run()
  const provenance = bootstrap.value.facts.resourceProvenance
  assert.deepEqual(provenance.secretVersionIamContinuationRef, h.metadata.continuationRef)
  assert.deepEqual(provenance.secretVersionIamSourceLockRef, h.input.sourceLockRef)
  const readback = (await h.transport.readJson(provenance.resourceReadbackRef)).value
  assert.deepEqual(readback.secretVersionIamContinuationRef, h.metadata.continuationRef)
  assert.deepEqual(readback.secretVersionIamSourceLockRef, h.input.sourceLockRef)
  const full = (await h.transport.readJson(bootstrap.refs.fullDescriptorRef)).value
  const evidence = await readWorkerFullEvidence(h.transport, full, profile, h.readSource)
  assert.deepEqual(evidence.artifact.secretVersionIam.ref, h.metadata.continuationRef)
  assert.equal(evidence.artifact.originBuild.image, h.build.image)
  for (const field of ['secretVersionIamContinuationRef', 'secretVersionIamSourceLockRef']) {
    const changed = structuredClone(readback), poisoned = structuredClone(bootstrap.value)
    changed[field].sha256 = '0'.repeat(64)
    const resourceReadbackRef = h.seed('RD-WRONG-'+field, changed)
    Object.assign(poisoned.facts.resourceProvenance, { [field]: changed[field], resourceReadbackRef, resourceReadbackSha256: resourceReadbackRef.sha256 })
    const bootstrapRef = h.seed('RD-WRONG-BOOTSTRAP-'+field, poisoned)
    await assert.rejects(readWorkerFullEvidence(h.transport, { ...full, bootstrapRef }, profile, h.readSource), { code: 'OPENSWX_DAILY_RESOURCE_DELTA' })
  }
  const calls = h.calls.length, publications = h.puts.length
  const replay = await run()
  assert.deepEqual(replay.ref, bootstrap.ref)
  assert.deepEqual(replay.refs.fullDescriptorRef, bootstrap.refs.fullDescriptorRef)
  assert.equal(h.puts.length, publications, 'replay adopts sealed evidence')
  assert.ok(h.calls.slice(calls).every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')), 'replay performs no lifecycle writes')
  const request = h.transport.request
  h.transport.request = async (url, options) => {
    const result = await request(url, options)
    if (url.includes('/secrets/'+profile.tokenSecretId+':getIamPolicy')) result.bindings.find(row => row.role === SECRET_VERSION_IAM_ROLE).members.push('serviceAccount:unapproved@jenfu-platform-prod.iam.gserviceaccount.com')
    return result
  }
  const rejectedCalls = h.calls.length
  await assert.rejects(run())
  assert.equal(h.puts.length, publications)
  assert.ok(h.calls.slice(rejectedCalls).every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
  assert.ok(!h.calls.some(row => /:addVersion|terraform|cloudbuild.*POST/u.test(row.url)))
})

test('RD rejects reuse full or program-only descriptor before any daily pause mutation', async () => {
  const h = await rdDailyMetadataFixture()
  const reused = await executeWorkerArtifactReuse({ transport: h.transport, inputRef: h.inputRef, readSource: h.readSource })
  h.lifecycle()
  const inputRef = h.seed('RD-WRONG-PURPOSE-input', { schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef: reused.refs.programOnlyFullDescriptorRef,
    workerBuildRef: reused.ref, deadlineAt: deadline(), receiptId: 'RD-WRONG-PURPOSE', drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: h.input.priorActivationRef })
  const calls = h.calls.length, publications = h.puts.length
  await assert.rejects(executeOpenSwxBootstrap({ stage: 'pause', inputRef, transport: h.transport, readSource: h.readSource, appProfile, sleep: async () => {} }), { code: 'OPENSWX_REUSE_DAILY_ONLY' })
  assert.equal(h.puts.length, publications)
  assert.ok(h.calls.slice(calls).every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy')))
})

test('B35 missing metadata continuation retains strict original Secret policy and publishes no READY proof',async()=>{
  const h=await b35MetadataReuseFixture(), input={...h.input};delete input.secretVersionIamContinuationRef
  const inputRef=await h.put('b35-no-metadata-ref',input), count=h.puts.length
  await assert.rejects(executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:h.readSource}),{code:'OPENSWX_RESOURCE_READBACK_INVALID'})
  assert.equal(h.puts.length,count);noMutation(h)
})
test('B35 producer rejects malformed refs and live workload policy drift; pure resolver rejects hash-correct forged input join',async()=>{
  const h=await b35MetadataReuseFixture(), ref={...h.metadata.continuationRef,sha256:'0'.repeat(64)}
  const badRef=await h.put('b35-wrong-metadata-hash',{...h.input,secretVersionIamContinuationRef:ref}), before=h.puts.length
  await assert.rejects(executeWorkerArtifactReuse({transport:h.transport,inputRef:badRef,readSource:h.readSource}))
  assert.equal(h.puts.length,before)
  h.metadata.after.secretPolicies[profile.registrySecretId].bindings[0].condition.expression='false'
  await assert.rejects(executeWorkerArtifactReuse({transport:h.transport,inputRef:h.inputRef,readSource:h.readSource}),{code:'OPENSWX_SECRET_VERSION_IAM_SECRET_POLICY_DRIFT'})
  assert.equal(h.puts.length,before)
  h.metadata.after.secretPolicies[profile.registrySecretId].bindings[0].condition.expression='true'
  const saved=await executeWorkerArtifactReuse({transport:h.transport,inputRef:h.inputRef,readSource:h.readSource})
  const request=JSON.parse(h.objects.get(saved.value.requestRef.uri).bytes)
  const inputRef=await h.put('b35-forged-input-join',{...h.input,secretVersionIamContinuationRef:ref})
  const requestRef=await h.put('b35-forged-request',{...request,inputRef})
  const associationRef=await h.put('b35-forged-association',{...saved.value,requestRef}), calls=h.calls.length, count=h.puts.length
  await assert.rejects(resolveWorkerArtifact({transport:h.transport,descriptor:h.v2(associationRef),profile,readSource:h.readSource}))
  assert.equal(h.calls.length,calls);assert.equal(h.puts.length,count);noMutation(h)
})

test('B35 actual Git reader admits only the four exact metadata source paths after sealed origin admission',()=>{
  const fixtureParent=realpathSync.native(tmpdir())
  const temporary=realpathSync.native(mkdtempSync(path.join(fixtureParent,'aipdm-b35-git-metadata-')))
  console.log(JSON.stringify({project:'AI-PDM',purpose:'Metadata continuation actual Git reader scope regression',port:null,owningProcess:process.pid,temporaryPath:temporary,PDM_DATA_DIR:'UNUSED_NO_APP_IMPORT',PDM_REPOSITORY_DIR:temporary,mutationScope:'TASK_OWNED_GIT_FIXTURE_ONLY',cleanupCondition:'finally removes exact task-owned Git fixture'}))
  const run=(args)=>{const row=spawnSync('git',args,{cwd:temporary,windowsHide:true,encoding:'utf8'});assert.equal(row.status,0,row.stderr);return row.stdout.trim()}
  const paths=[SECRET_VERSION_IAM_SOURCE_PATH,SECRET_VERSION_IAM_HUMAN_APPROVAL_PATH,'scripts/lib/dev122-openswx-secret-version-iam.mjs','scripts/dev122-openswx-secret-version-iam.mjs']
  try {
    run(['init','--quiet']);run(['config','user.email','local-fixture@example.invalid']);run(['config','user.name','AI-PDM local fixture']);run(['config','core.autocrlf','false'])
    for(const name of [...paths,'scripts/not-admitted.mjs']){const absolute=path.join(temporary,name);mkdirSync(path.dirname(absolute),{recursive:true});writeFileSync(absolute,name+'\n')}
    run(['add','.']);run(['commit','--quiet','-m','historical metadata source fixture'])
    const historical=run(['rev-parse','HEAD'])
    writeFileSync(path.join(temporary,'current-fixture.txt'),'current\n');run(['add','.']);run(['commit','--quiet','-m','current source fixture'])
    const current=run(['rev-parse','HEAD']), reader=createWorkerGitReader(temporary,current)
    for(const name of paths)assert.throws(()=>reader(name,historical),{code:'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'})
    reader.authorizeOrigin(historical)
    for(const name of paths)assert.equal(reader(name,historical).toString(),name+'\n')
    assert.throws(()=>reader('scripts/not-admitted.mjs',historical),{code:'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'})
  }finally{
    assert.equal(path.dirname(temporary),fixtureParent)
    assert.ok(path.basename(temporary).startsWith('aipdm-b35-git-metadata-'))
    rmSync(temporary,{recursive:true,force:true})
  }
})

async function b35UnassociatedAbortFixture() {
  const f = await b35ProgramAbortFixture()
  for (const index of [0, 3, 4]) f.h.objects.delete(f.absentUris[index])
  delete f.wire.execution.template.volumes; delete f.wire.execution.template.containers[0].volumeMounts
  Object.assign(f.wire.job, { uid: '24968e73-b3be-46f8-8e7d-1ab8464e5297', generation: '22', updateTime: now })
  const submissionRef = f.h.objects.get(f.absentUris[2]).ref
  const sealStage = (name, value) => f.wire.put(releasePaths(appProfile, f.wire.capsule, f.wire.intentRef.sha256)[name], sealProgramOnlyEvidence(value))
  const rollback = JSON.parse(f.h.objects.get(f.rollback.uri).bytes)
  Object.assign(rollback.facts, { databaseDisposition: 'UNKNOWN', currentDatabaseReadPerformed: false, entrypointRecovery: { result: 'NOT_REQUIRED', changed: false }, migrationSubmissionIntentRef: submissionRef })
  delete rollback.facts.migrationEvidenceRef; rollback.previousReceiptRef = null
  f.rollback = sealStage('rollback', rollback)
  const terminal = JSON.parse(f.h.objects.get(f.terminal.uri).bytes)
  Object.assign(terminal.facts, rollback.facts); delete terminal.facts.migrationEvidenceRef; terminal.previousReceiptRef = f.rollback
  f.terminal = sealStage('terminal', terminal)
  const original = f.transport.request
  f.transport.request = async (url, options = {}) => {
    if (url === `https://run.googleapis.com/v2/${f.wire.job.name}`) { f.calls.push({ url, method: options.method ?? 'GET' }); return structuredClone(f.wire.job) }
    if (url === `https://run.googleapis.com/v2/${f.wire.execution.name}`) { f.calls.push({ url, method: options.method ?? 'GET' }); return structuredClone(f.wire.execution) }
    return original(url, options)
  }
  return f
}

test('P09 completed unassociated native read preserves UNKNOWN and admits only fresh GET evidence cold/warm/provider', async () => {
  const f = await b35UnassociatedAbortFixture(), terminalBytes = Buffer.from(f.h.objects.get(f.terminal.uri).bytes)
  const cold = await f.read(true), warm = await f.read(true); assert.deepEqual(cold, warm)
  assert.equal(cold.authorityBasis.schemaVersion, 'aipdm.program-only-completed-unassociated-abort-basis.v1')
  assert.equal(cold.authorityBasis.databaseDisposition, 'UNKNOWN'); assert.equal(cold.authorityBasis.currentDatabaseReadPerformed, false)
  assert.equal(cold.authorityBasis.releaseAuthority, false); assert.equal(cold.authorityBasis.failedProof.disposition, 'build_only')
  assert.equal(cold.authorityBasis.completedNative.resubmissionAllowed, false)
  assert.ok(f.h.objects.get(f.terminal.uri).bytes.equals(terminalBytes))
  for (const index of [0, 3, 4]) assert.ok(!f.h.objects.has(f.absentUris[index]))
  assert.ok(f.calls.every(row => row.method === 'GET')); noMutation(f.h)
})

test('P09 Run provider clock admits native clock skew but rejects Job updates after Execution creation', async () => {
  const f = await b35UnassociatedAbortFixture()
  f.wire.job.updateTime = new Date(Date.parse(now) + 500).toISOString()
  f.wire.execution.createTime = new Date(Date.parse(now) + 1000).toISOString()
  f.wire.execution.completionTime = new Date(Date.parse(now) + 2000).toISOString()
  const cold = await f.read(true), warm = await f.read(true); assert.deepEqual(cold, warm)
  assert.equal(cold.authorityBasis.databaseDisposition, 'UNKNOWN')
  f.wire.job.updateTime = new Date(Date.parse(f.wire.execution.createTime) + 1).toISOString()
  await assert.rejects(f.read(true))
  assert.ok(f.calls.every(row => row.method === 'GET')); noMutation(f.h)
})

test('P09 unassociated abort rejects missing/sealed children, native drift, extra execution and Job drift', async () => {
  for (const kind of ['missing-native', 'missing-submission', 'association', 'execution-child', 'job-child', 'native-count', 'readonly-env', 'duplicate', 'active', 'job-volume', 'job-after']) {
    const f = await b35UnassociatedAbortFixture()
    if (kind === 'missing-native') f.h.objects.delete(f.absentUris[1])
    if (kind === 'missing-submission') f.h.objects.delete(f.absentUris[2])
    if (['association', 'execution-child', 'job-child'].includes(kind)) f.wire.put(f.absentUris[{ association: 0, 'execution-child': 3, 'job-child': 4 }[kind]], { status: 'UNEXPECTED' })
    if (kind === 'native-count') { const value = JSON.parse(f.h.objects.get(f.absentUris[1]).bytes); value.ledgerCount = 34; f.wire.put(f.absentUris[1], sealProgramOnlyEvidence(value)) }
    if (kind === 'readonly-env') f.wire.execution.template.containers[0].env.at(-1).value = '-c default_transaction_read_only=off'
    if (kind === 'duplicate') f.inventory.push(structuredClone(f.wire.execution))
    if (kind === 'active') f.wire.execution.runningCount = 1
    if (kind === 'job-volume') delete f.wire.job.template.template.volumes
    if (kind === 'job-after') f.wire.job.updateTime = '2026-10-08T00:00:00Z'
    await assert.rejects(f.read(true), undefined, kind); assert.ok(f.calls.every(row => row.method === 'GET')); noMutation(f.h)
  }
})

// PRIVATE QA PROPOSAL ONLY — append to scripts/dev122-openswx-worker-artifact-reuse.test.mjs.
// Uses the existing explicitly MODELED associated graph only for admission negatives.
// It does not establish a portable inherited positive or represent genuine R8 history.
test('P10 associated abort rejects invalid claimed historical basis at admission before historical reads', async () => {
  const cases = [
    ['schema', basis => { basis.schemaVersion = 'aipdm.program-only-abort-basis.v1' }],
    ['extra-key', basis => { basis.unapprovedField = true }],
    ['readonly-disposition', basis => { basis.databaseDisposition = 'READ_ONLY_BASELINE_VERIFIED' }],
    ['new-database-read', basis => { basis.currentDatabaseReadPerformed = true }],
    ['not-submitted', basis => { basis.migrationJobSubmitted = false }],
    ['release-authority', basis => { basis.releaseAuthority = true }],
    ['wrong-prior-ref', basis => { basis.failedIntentRef = { ...basis.failedIntentRef, sha256: '0'.repeat(64) } }],
    ['missing-completed', basis => { delete basis.completedNative }],
    ['missing-native-ref', basis => { delete basis.completedNative.nativeReceiptRef }],
    ['missing-submission-ref', basis => { delete basis.completedNative.submissionIntentRef }],
    ['bad-projection-hash', basis => { basis.completedNative.jobProjectionSha256 = 'invalid' }],
    ['bad-execution-hash', basis => { basis.completedNative.executionSha256 = 'invalid' }],
    ['resubmission', basis => { basis.completedNative.resubmissionAllowed = true }],
    ['extra-recursion', basis => { basis.retainedUnassociatedAncestor = structuredClone(basis.completedNative) }],
    ['wrong-tail-type', basis => { basis.retainedPreexecutionAncestor = { schemaVersion: 'aipdm.program-only-completed-unassociated-abort-basis.v1' } }],
  ]
  for (const [kind, mutate] of cases) {
    const f = await b35ProgramAbortFixture()
    // Deliberately claimed, never a valid historical proof or positive fixture.
    const alias = { ...f.wire.capsule.baselineIntentRef }
    const basis = {
      schemaVersion: 'aipdm.program-only-completed-unassociated-abort-basis.v1',
      databaseDisposition: 'UNKNOWN', currentDatabaseReadPerformed: false,
      migrationJobSubmitted: true, releaseAuthority: false,
      failedIntentRef: alias, releasedIntentRef: alias, failedProof: {}, releasedProof: {},
      stageRefs: { prepare: alias, deployment: alias, rollback: alias, terminal: alias },
      controlSha256: '1'.repeat(64), ownerRunRef: f.control.ownerRunRef,
      previousRevision: f.wire.capsule.previousRevision, inputFingerprint: '2'.repeat(64),
      inventorySha256: '3'.repeat(64),
      completedNative: {
        nativeReceiptRef: alias, submissionIntentRef: alias, executionName: f.wire.execution.name,
        jobProjectionSha256: '4'.repeat(64), executionSha256: '5'.repeat(64),
        disposition: 'OBSERVED_COMPLETED_READONLY_NO_RELEASE_ASSOCIATION', resubmissionAllowed: false,
      },
    }
    mutate(basis)
    const object = ref => JSON.parse(f.h.objects.get(ref.uri).bytes)
    const putSealed = (ref, value) => f.wire.put(ref.uri, sealProgramOnlyEvidence(value))
    const prepare = object(f.prepare)
    prepare.facts.preActivationAbortBasis = basis
    f.prepare = putSealed(f.prepare, prepare)
    const buildUri = f.wire.base + '/build.json'
    const build = JSON.parse(f.h.objects.get(buildUri).bytes)
    build.previousReceiptRef = f.prepare
    const buildRef = f.wire.put(buildUri, sealProgramOnlyEvidence(build))
    const deployment = object(f.wire.deploymentRef)
    deployment.buildReceiptRef = buildRef
    f.wire.deploymentRef = f.wire.put(f.wire.deploymentRef.uri, deployment)
    const migration = object(f.migrate)
    migration.deploymentCapsuleRef = f.wire.deploymentRef
    f.migrate = putSealed(f.migrate, migration)
    const rollback = object(f.rollback)
    rollback.previousReceiptRef = f.migrate
    rollback.facts.migrationEvidenceRef = f.migrate
    f.rollback = putSealed(f.rollback, rollback)
    const terminal = object(f.terminal)
    terminal.previousReceiptRef = f.rollback
    terminal.facts.migrationEvidenceRef = f.migrate
    f.terminal = putSealed(f.terminal, terminal)

    let currentSourceProofReads = 0, historicalReads = 0
    const sourceProof = f.transport.readOwnerSourceProof.bind(f.transport)
    f.transport.readOwnerSourceProof = async request => {
      if (request.sourceRevision === f.wire.capsule.sourceRevision) currentSourceProofReads++
      return sourceProof(request)
    }
    const readJson = f.transport.readJson.bind(f.transport)
    f.transport.readJson = async (ref, ...args) => {
      if ((typeof ref === 'string' ? ref : ref?.uri) === alias.uri) historicalReads++
      return readJson(ref, ...args)
    }
    await assert.rejects(f.read(), /DEV121_PREACTIVATION_CONTINUATION_INVALID/u, kind)
    // The original unconditional guard rejects before this read; therefore these
    // assertions prevent a generic early failure from masquerading as coverage.
    assert.equal(currentSourceProofReads, 1, kind + ': new admission guard was reached')
    assert.equal(historicalReads, 0, kind + ': historical capsule was not read')
    assert.equal(f.calls.length, 0, kind + ': inventory/provider requests were not reached')
    assert.ok(f.wire.calls.every(row => row.method === 'GET'), kind)
    noMutation(f.h)
  }
})


test('P10A associated readonly recovery tolerates provider generation and etag drift', async () => {
  const f = await b35ProgramAbortFixture()
  f.service.etag = 'LOCAL_RECOVERED_SERVICE_ETAG'
  f.service.generation = f.service.observedGeneration = '19'
  const result = await f.read(true)
  assert.equal(result.authorityBasis.schemaVersion, 'aipdm.program-only-abort-basis.v1')
  assert.ok(f.calls.every(row => row.method === 'GET'))
  noMutation(f.h)
})

test('P10A associated readonly recovery rejects drift in each entrypoint semantic field', async () => {
  for (const [key, value] of [
    ['ingress', 'INGRESS_TRAFFIC_INTERNAL_ONLY'], ['defaultUriDisabled', true],
    ['invokerIamDisabled', false], ['uri', 'https://unexpected.invalid'],
    ['urls', ['https://unexpected.invalid']],
  ]) {
    const f = await b35ProgramAbortFixture()
    f.service[key] = value
    await assert.rejects(f.read(), /DEV121_PREACTIVATION_CONTINUATION_INVALID/u, key)
    noMutation(f.h)
  }
})

test('daily release gets a current-source build-only reuse descriptor without a worker build or lifecycle write', async () => {
  const h = await harness(), saved = await h.invoke();
  assert.ok(saved.refs.dailyBuildOnlyDescriptorRef, 'reuse must produce the ordinary daily entry descriptor');
  const row = await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef), d = row.value;
  assertWorkerDescriptor(d, profile, d.workerProfileSha256, currentRevision);
  assert.equal(d.purpose, 'build_only'); assert.equal(d.artifactMode, 'REUSE_VERIFIED');
  assert.deepEqual(d.workerBuildRef, saved.ref);
  for (const key of ['resourcePlanRef', 'bootstrapRef', 'cloudPreflightRef', 'pausedDrainedRef', 'tokenSecretVersion', 'registrySecretVersion']) assert.equal(Object.hasOwn(d, key), false);
  assert.deepEqual((await h.invoke()).refs.dailyBuildOnlyDescriptorRef, row.ref); noMutation(h);
});

test('RD daily rejects an unproven changed serving app before Scheduler pause', async () => {
  const h = await rdDailyMetadataFixture()
  const reused = await executeWorkerArtifactReuse({transport:h.transport,inputRef:h.inputRef,readSource:h.readSource})
  h.lifecycle()
  h.transport.effectiveRevision = () => 'ai-pdm-prod-current-app'
  const inputRef = h.seed('RD-SERVING-UNKNOWN-input', {schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef:reused.refs.dailyBuildOnlyDescriptorRef,
    workerBuildRef:reused.ref,deadlineAt:deadline(),receiptId:'RD-SERVING-UNKNOWN',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:h.input.priorActivationRef})
  const calls=h.calls.length, publications=h.puts.length
  await assert.rejects(executeOpenSwxBootstrap({stage:'pause',inputRef,transport:h.transport,readSource:h.readSource,appProfile,sleep:async()=>{}}), {code:'OPENSWX_PRIOR_CANONICAL_INVALID'})
  assert.equal(h.puts.length,publications)
  assert.ok(h.calls.slice(calls).every(row=>!row.options.method||row.options.method==='GET'||row.url.endsWith(':getIamPolicy')), 'unproven serving must reject before any lifecycle write')
})


async function rdProgramOnlyServingFixture() {
  const wire=await b35ProgramProofFixture({releasedBaseline:true,dailyServing:true}),h=wire.h
  const validators=createOwnerTransport({token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl})
  const paths=releasePaths(b35AppProfile,wire.capsule,wire.intentRef.sha256),candidateRevision='ai-pdm-prod-'+'5'.repeat(12)
  const tagUri='https://candidate-'+'5'.repeat(12)+'---'+new URL(profile.canonicalOrigin).hostname
  const stage=(name,previousReceiptRef,facts)=>wire.put(paths[name],sealProgramOnlyEvidence({schemaVersion:'jenfu.dev012.stage-receipt.v1',ownerApplicationId:'ai-pdm',releaseId:wire.capsule.releaseId,sourceRevision:currentRevision,stage:name,previousReceiptRef,facts,observedAt:now,status:'PASS'}))
  let previous=stage('candidate',wire.migrate,{candidateRevision,artifactDigest:wire.artifactDigest,migrationReceiptRef:wire.migrate,deploymentCapsuleRef:wire.deploymentRef,tagUri,cloudSqlProxyResolvedImage:b35AppProfile.runtime.cloudSqlProxyImage})
  previous=stage('entrypoint',previous,{})
  previous=stage('verify',previous,{candidateRevision,artifactDigest:wire.artifactDigest,smoke:{status:'PASS'}})
  previous=stage('decision',previous,{candidateRevision,artifactDigest:wire.artifactDigest,decision:'GO'})
  previous=stage('activate',previous,{candidateRevision,artifactDigest:wire.artifactDigest,effectiveRevision:candidateRevision})
  const canonical=stage('canonical',previous,{candidateRevision,artifactDigest:wire.artifactDigest,origin:profile.canonicalOrigin,smoke:{status:'PASS'}})
  previous=stage('finalize',canonical,{candidateRevision,artifactDigest:wire.artifactDigest,result:'RELEASED',temporaryCandidateTags:0,openswxWorker:{status:'READY',retained:true,priorActivationRef:h.priorActivationRef}})
  const terminal=stage('terminal',previous,{candidateRevision,artifactDigest:wire.artifactDigest,result:'RELEASED',databaseDisposition:'READ_ONLY_BASELINE_VERIFIED',currentDatabaseReadPerformed:true,migrationEvidenceRef:wire.migrate,remainingHumanAction:0})
  const controlCore={schemaVersion:'jenfu.dev012.owner-control-head.v1',inputFingerprint:sha256(canonicalize({ownerApplicationId:'ai-pdm',releaseId:wire.capsule.releaseId,sourceRevision:currentRevision,releaseIntentSha256:wire.intentRef.sha256})),ownerApplicationId:'ai-pdm',service:b35AppProfile.target.serviceName,controlBucket:b35AppProfile.artifact.releaseBucket,releaseId:wire.capsule.releaseId,sourceRevision:currentRevision,sourceLockSha256:wire.capsule.sourceLockRef.sha256,candidateRevision,previousRevision:wire.capsule.previousRevision,ownerRunRef:'https://api.github.com/repos/'+b35AppProfile.application.repository+'/actions/runs/351',leaseExpiresAt:now,deadlineAt:wire.capsule.deadlineAt,state:'FINALIZED',result:'RELEASED'}
  const control={...controlCore,controlSha256:sha256(canonicalize(controlCore))}
  wire.put(paths.control,control)
  const service={name:'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',etag:'LOCAL_SERVING_ETAG',generation:'17',observedGeneration:'17',terminalCondition:{state:'CONDITION_SUCCEEDED'},ingress:'INGRESS_TRAFFIC_ALL',defaultUriDisabled:false,invokerIamDisabled:true,uri:profile.canonicalOrigin,urls:[profile.canonicalOrigin],traffic:[{revision:candidateRevision,percent:100}],trafficStatuses:[{revision:candidateRevision,percent:100}]}
  const revision={...structuredClone(wire.runtime.template),conditions:[{type:'Ready',state:'CONDITION_SUCCEEDED'}]}
  const app=revision.containers.find(row=>row.name===b35AppProfile.runtime.containerName)
  app.image=wire.artifactDigest
  app.env.push({name:b35AppProfile.environment.candidateOriginEnvironmentName,value:tagUri})
  Object.assign(wire.readSource,h.readSource)
  h.transport.readOwnerSourceProof=async({sourceRevision,refs,verifyProvider})=>{const proof=await readAiPdmReleaseObservation({sourceRevision,refs,token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl,readSource:wire.readSource});return {proof,provider:verifyProvider?await verifyOwnerProviderReadback({proof,token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl}):null}}
  Object.assign(h.transport,{getService:async()=>structuredClone(service),getRevision:async()=>structuredClone(revision),effectiveRevision:validators.effectiveRevision,assertRevisionReady:validators.assertRevisionReady,assertServiceSettled:validators.assertServiceSettled,assertCanonicalEntrypoint:validators.assertCanonicalEntrypoint})
  h.lifecycle()
  const inputRef=h.seed('RD-SERVING-PROGRAM-input',{schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef:wire.f.saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:wire.f.saved.ref,deadlineAt:deadline(),receiptId:'RD-SERVING-PROGRAM',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:h.priorActivationRef})
  const run=()=>executeOpenSwxBootstrap({stage:'pause',inputRef,transport:h.transport,readSource:wire.readSource,appProfile,sleep:async()=>{}})
  return {wire,h,service,revision,control,terminal,canonical,run}
}

test('RD daily accepts current RELEASED program-only app with the retained READY worker',async()=>{
  const f=await rdProgramOnlyServingFixture()
  const paused=await f.run()
  assert.equal(paused.value.facts.drainKind,'DAILY_DB_VERIFIED')
  assert.deepEqual(paused.value.facts.priorActivationRef,f.h.priorActivationRef)
  assert.ok(f.h.calls.some(row=>row.url.endsWith(':pause')))
  assert.ok(!f.h.calls.some(row=>/:addVersion|cloudbuild.*POST/u.test(row.url)))
})

test('RD daily rejects changed program-only serving or retained resources before any write',async()=>{
  for(const kind of ['control-fingerprint','control-run','control-state','control-source','traffic','tag','app-image','runtime-registry','secret-disabled','job-generation','job-etag','scheduler-policy','control-drift','service-drift']) {
    const f=await rdProgramOnlyServingFixture(),calls=f.h.calls.length,publications=f.h.puts.length
    if(kind.startsWith('control-') && kind!=='control-drift') {
      const head=structuredClone(f.control)
      if(kind==='control-fingerprint') head.inputFingerprint='0'.repeat(64)
      if(kind==='control-run') head.ownerRunRef='https://api.github.com/repos/unapproved/repository/actions/runs/1'
      if(kind==='control-state') head.state='ACTIVE'
      if(kind==='control-source') head.sourceRevision='f'.repeat(40)
      delete head.controlSha256;head.controlSha256=sha256(canonicalize(head));f.wire.put('gs://jenfu-platform-prod-aipdm-release/control/active.json',head)
    }
    if(kind==='traffic') f.service.traffic[0].percent=99
    if(kind==='tag') f.service.traffic.push({revision:f.service.traffic[0].revision,percent:0,tag:'unexpected'})
    if(kind==='app-image') f.revision.containers[0].image+='bad'
    if(kind==='runtime-registry') f.revision.containers[0].env.find(row=>row.name==='PDM_WORKLOAD_AUTH_CREDENTIALS').valueSource.secretKeyRef.version='8'
    if(kind==='secret-disabled') f.h.controls.secretState='DISABLED'
    if(kind==='job-generation') f.h.controls.job={generation:'99'}
    if(kind==='job-etag') f.h.controls.job={etag:'UNRELATED_JOB_ETAG'}
    if(kind==='scheduler-policy') f.h.controls.scheduler={schedule:'* * * * *'}
    if(kind==='control-drift') {
      const original=f.h.transport.readBytes;let reads=0
      f.h.transport.readBytes=async(...args)=>{const row=await original(...args);return args[0].endsWith('/control/active.json')&&++reads>1?{...row,metadata:{...row.metadata,generation:'18'}}:row}
    }
    if(kind==='service-drift') {let reads=0;f.h.transport.getService=async()=>({...structuredClone(f.service),etag:++reads>1?'DRIFTED_ETAG':f.service.etag})}
    await assert.rejects(f.run(),undefined,kind)
    assert.equal(f.h.puts.length,publications,kind)
    assert.ok(f.h.calls.slice(calls).every(row=>!row.options.method||row.options.method==='GET'||row.url.endsWith(':getIamPolicy')),kind+': zero lifecycle writes')
  }
})

test('RD current program-only serving continues daily bootstrap, full evidence and zero-write replay',async()=>{
  const f=await rdProgramOnlyServingFixture(),paused=await f.run()
  const inputRef=f.h.seed('RD-SERVING-BOOTSTRAP-input',{schemaVersion:'aipdm.openswx-bootstrap-input.v1',descriptorRef:f.wire.f.saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:f.wire.f.saved.ref,deadlineAt:deadline(),receiptId:'RD-SERVING-BOOTSTRAP',bootstrapKind:'DAILY_REFRESH',priorActivationRef:f.h.priorActivationRef,pausedDrainedRef:paused.ref})
  const run=()=>executeOpenSwxBootstrap({stage:'bootstrap',inputRef,transport:f.h.transport,readSource:f.wire.readSource,appProfile,sleep:async()=>{}})
  const completed=await run()
  assert.equal(completed.value.facts.bootstrapKind,'DAILY_REFRESH')
  const full=(await f.h.transport.readJson(completed.refs.fullDescriptorRef)).value
  assert.equal(full.purpose,'full')
  const evidence=await readWorkerFullEvidence(f.h.transport,full,profile,f.wire.readSource)
  assert.equal(evidence.image,image)
  const calls=f.h.calls.length,publications=f.h.puts.length
  const replay=await run()
  assert.deepEqual(replay.refs.fullDescriptorRef,completed.refs.fullDescriptorRef)
  assert.equal(f.h.puts.length,publications)
  assert.ok(f.h.calls.slice(calls).every(row=>!row.options.method||row.options.method==='GET'||row.url.endsWith(':getIamPolicy')))
  assert.ok(!f.h.calls.some(row=>/:addVersion|cloudbuild.*POST/u.test(row.url)))
})

test('RD daily keeps historical program-only 34 separate from genuine current 35 source',async()=>{
  const f=await rdProgramOnlyServingFixture(),original=f.wire.readSource
  const reader=(name,revision)=>name==='config/release/dev117-ai-pdm-independent-production-v3.json'&&revision===currentRevision?Buffer.from(JSON.stringify(appProfile)+'\n'):original(name,revision)
  Object.assign(reader,original)
  const calls=f.h.calls.length,publications=f.h.puts.length
  await assert.rejects(executeOpenSwxBootstrap({stage:'pause',inputRef:f.h.objects.get(profile.receiptRoot+'/local-test-RD-SERVING-PROGRAM-input.json').ref,transport:f.h.transport,readSource:reader,appProfile,sleep:async()=>{}}))
  assert.equal(f.h.puts.length,publications)
  assert.ok(f.h.calls.slice(calls).every(row=>!row.options.method||row.options.method==='GET'||row.url.endsWith(':getIamPolicy')))
})

test('RD daily current serving recovery restores only the verified prior Job and keeps Scheduler paused',async()=>{
  const f=await rdProgramOnlyServingFixture(),paused=await f.run()
  const inputRef=f.h.seed('RD-SERVING-RECOVERY-input',{schemaVersion:'aipdm.openswx-bootstrap-input.v1',descriptorRef:f.wire.f.saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:f.wire.f.saved.ref,deadlineAt:deadline(),receiptId:'RD-SERVING-RECOVERY',bootstrapKind:'DAILY_REFRESH',priorActivationRef:f.h.priorActivationRef,pausedDrainedRef:paused.ref})
  const request=f.h.transport.request
  let failed=false
  f.h.transport.request=async(url,options={})=>{
    if(!failed&&url.includes('logging.googleapis.com')&&JSON.parse(options.body).filter.includes('local-1')) {failed=true;throw Error('LOCAL_SELFTEST_OBSERVATION_FAILURE')}
    return request(url,options)
  }
  await assert.rejects(executeOpenSwxBootstrap({stage:'bootstrap',inputRef,transport:f.h.transport,readSource:f.wire.readSource,appProfile,sleep:async()=>{}}))
  const recovery=JSON.parse(f.h.objects.get(profile.receiptRoot+'/RD-SERVING-RECOVERY-recovery-required.json').bytes)
  assert.equal(recovery.priorJobRestored,true)
  assert.equal(recovery.priorEmptyProof.claimProof,'AUTHENTICATED_204_SOURCE_BOUND')
  assert.equal(recovery.schedulerState,'PAUSED')
  assert.equal(recovery.schedulerEnabled,false)
  assert.ok(!f.h.calls.some(row=>/:resume|:addVersion|cloudbuild.*POST/u.test(row.url)))
})

test('RD daily refuses missing serving proofs and unbound current prior before lifecycle writes',async()=>{
  for(const kind of ['missing-terminal','missing-canonical','missing-prepare','wrong-prior']) {
    const f=await rdProgramOnlyServingFixture(),calls=f.h.calls.length,publications=f.h.puts.length
    const paths=releasePaths(b35AppProfile,f.wire.capsule,f.wire.intentRef.sha256)
    if(kind.startsWith('missing-')) f.h.objects.delete(paths[kind.slice(8)])
    let inputRef=f.h.objects.get(profile.receiptRoot+'/local-test-RD-SERVING-PROGRAM-input.json').ref
    if(kind==='wrong-prior') {
      const input=JSON.parse(f.h.objects.get(inputRef.uri).bytes)
      input.priorActivationRef={...input.priorActivationRef,sha256:'0'.repeat(64)}
      inputRef=f.h.seed('RD-SERVING-WRONG-PRIOR-input',input)
    }
    await assert.rejects(executeOpenSwxBootstrap({stage:'pause',inputRef,transport:f.h.transport,readSource:f.wire.readSource,appProfile,sleep:async()=>{}}),undefined,kind)
    assert.equal(f.h.puts.length,publications)
    assert.ok(f.h.calls.slice(calls).every(row=>!row.options.method||row.options.method==='GET'||row.url.endsWith(':getIamPolicy')),kind)
  }
})

test('FAILED DAILY closed input admits only immutable failed attempt refs beside the metadata continuation', () => {
  const own = name => ({ uri: `${profile.receiptRoot}/${name}.json`, sha256: 'a'.repeat(64) })
  const input = { schemaVersion: 'aipdm.openswx-worker-reuse-input.v1', sourceLockRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV121-FAILED-LOCAL/source-lock.json', sha256: 'b'.repeat(64) },
    currentSourceObjectRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/source/releases/DEV121-FAILED-LOCAL/source.tar.gz', sha256: 'c'.repeat(64) }, priorActivationRef: own('prior-ready'),
    deadlineAt: deadline(), receiptId: 'DEV121-FAILED-LOCAL', secretVersionIamContinuationRef: own('metadata'),
    failedDailyContinuation: { bootstrapInputRef: own('failed-input'), recoveryRequiredRef: own('failed-recovery-required'), priorRecoveryRef: own('failed-prior-recovery') } }
  assertWorkerReuseInput(input)
  for (const mutate of [row => row.failedDailyContinuation.extra = true, row => delete row.failedDailyContinuation.recoveryRequiredRef,
    row => row.failedDailyContinuation.bootstrapInputRef.uri = 'gs://sibling/receipts/x.json', row => row.bootstrapContinuation = {}, row => row.failedDailyContinuation = null]) {
    const bad = structuredClone(input); mutate(bad); assert.throws(() => assertWorkerReuseInput(bad))
  }
})

async function failedDailyFixture({programOnly=false,proofMetadata=false}={}) {
  const serving=programOnly?await rdProgramOnlyServingFixture():null,h=serving?.h??await rdDailyMetadataFixture({proofMetadata})
  const reader=serving?(name,revision)=>[oldRevision,currentRevision].includes(revision)?serving.wire.readSource(name,revision):h.readSource(name,revision):h.readSource
  Object.assign(reader,h.readSource)
  const saved=serving?.wire.f.saved??await executeWorkerArtifactReuse({transport:h.transport,inputRef:h.inputRef,readSource:reader})
  h.put??=async(name,value)=>h.seed(name,value)
  h.lifecycle()
  const paused=serving?await serving.run():await executeOpenSwxBootstrap({stage:'pause',inputRef:h.seed('FAILED-OLD-PAUSE-input',{schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:deadline(),receiptId:'FAILED-OLD-PAUSE',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:h.input.priorActivationRef}),transport:h.transport,readSource:reader,appProfile,sleep:async()=>{}})
  // Freeze only the synthetic fault setup, then explicitly expire its old attempt.
  syntheticClock.hold()
  const oldDeadline=new Date(Date.now()+3000).toISOString()
  const oldInputRef=h.seed('FAILED-OLD-BOOTSTRAP-input',{schemaVersion:'aipdm.openswx-bootstrap-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:oldDeadline,receiptId:'FAILED-OLD-BOOTSTRAP',bootstrapKind:'DAILY_REFRESH',priorActivationRef:h.input.priorActivationRef,pausedDrainedRef:paused.ref})
  const originalRequest=h.transport.request;let failObservation=true
  h.transport.request=async(url,options={})=>{
    if(failObservation&&url.includes('logging.googleapis.com')&&JSON.parse(options.body).filter.includes('local-1')) {failObservation=false;throw Object.assign(Error('LOCAL_ZERO_MARKER_OBSERVATION'),{code:'OPENSWX_STDOUT_NOT_UNIQUE'})}
    return originalRequest(url,options)
  }
  await assert.rejects(executeOpenSwxBootstrap({stage:'bootstrap',inputRef:oldInputRef,transport:h.transport,readSource:reader,appProfile,sleep:async()=>{}}),{code:'OPENSWX_STDOUT_NOT_UNIQUE'})
  const ref=suffix=>h.objects.get(profile.receiptRoot+'/FAILED-OLD-BOOTSTRAP'+suffix+'.json').ref
  const failedDailyContinuation={bootstrapInputRef:oldInputRef,priorRecoveryRef:ref('-prior-recovery'),recoveryRequiredRef:ref('-recovery-required')}
  const next=h.nextAttempt(81,h.input.priorActivationRef)
  const lock={...next.lock,observedAt:new Date(Date.now()-2000).toISOString()}
  next.input.sourceLockRef=h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/'+lock.releaseId+'/source-lock.json',Buffer.from(canonicalize(lock)+'\n'))
  const metadata=h.metadata?await seedSecretVersionIamContinuation(h,{sourceRevision:next.lock.sourceRevision,sourceLockRef:next.input.sourceLockRef,supplementalIamReadbackRef:h.iam.receiptRef,prebuildIamContinuationRef:h.proof.continuationRef,reader,name:'failed-current-metadata',secretPolicies:h.metadata.before.secretPolicies}):null
  const input={...next.input,failedDailyContinuation,...(metadata?{secretVersionIamContinuationRef:metadata.continuationRef}:{})}
  const inputRef=await h.put('failed-current-reuse-input',input)
  syntheticClock.expireAfter(oldDeadline)
  const reuse=()=>executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:reader})
  return {h,reader,input,inputRef,reuse,failedDailyContinuation,oldInputRef,ref}
}

for(const programOnly of [false,true]) test('FAILED DAILY native '+(programOnly?'program-only serving':'metadata')+' continuation preserves isolation, ordinary full and next READY origin',async()=>{
  const f=await failedDailyFixture({programOnly}),saved=await f.reuse(),h=f.h
  assert.equal(saved.refs.programOnlyFullDescriptorRef,undefined,'PAUSED failed association cannot publish a fake READY wrapper')
  const pauseInputRef=h.seed('FAILED-NEW-PAUSE-input',{schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:deadline(),receiptId:'FAILED-NEW-PAUSE',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:f.input.priorActivationRef,failedDailyContinuation:f.failedDailyContinuation})
  const runPause=()=>executeOpenSwxBootstrap({stage:'pause',inputRef:pauseInputRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  const before=h.calls.length,paused=await runPause()
  assert.deepEqual((await runPause()).ref,paused.ref)
  const inputRef=h.seed('FAILED-NEW-BOOTSTRAP-input',{schemaVersion:'aipdm.openswx-bootstrap-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:deadline(),receiptId:'FAILED-NEW-BOOTSTRAP',bootstrapKind:'DAILY_REFRESH',priorActivationRef:f.input.priorActivationRef,pausedDrainedRef:paused.ref,failedDailyContinuation:f.failedDailyContinuation})
  const run=()=>executeOpenSwxBootstrap({stage:'bootstrap',inputRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  const completed=await run(),full=(await h.transport.readJson(completed.refs.fullDescriptorRef)).value
  assert.equal(full.schemaVersion,'aipdm.openswx-worker-descriptor.v2');assert.equal(full.purpose,'full')
  const evidence=await readWorkerFullEvidence(h.transport,full,profile,f.reader)
  assert.deepEqual(evidence.receipts.cloudPreflightRef.previousRefs,[f.ref('-selftest')])
  assert.equal(evidence.receipts.cloudPreflightRef.facts.proof.marker.timestamp,(await h.transport.readJson(f.ref('-selftest'))).value.facts.execution.completionTime)
  const mutations=h.calls.slice(before).filter(row=>row.options.method&&row.options.method!=='GET'&&!row.url.endsWith(':getIamPolicy'))
  assert.equal(mutations.filter(row=>row.url.endsWith(':run')).length,1)
  assert.equal(mutations.filter(row=>row.options.method==='PATCH').length,1)
  const calls=h.calls.length,puts=h.puts.length
  assert.deepEqual((await run()).refs.fullDescriptorRef,completed.refs.fullDescriptorRef)
  assert.equal(h.puts.length,puts)
  assert.ok(h.calls.slice(calls).every(row=>!row.options.method||row.options.method==='GET'||row.url.endsWith(':getIamPolicy')))
  // Model the later READY activation and changed provider generation. Historical
  // failed evidence must continue to resolve after the serving state advances.
  await h.transport.request('https://run.googleapis.com/v2/'+workerJobName(),{method:'PATCH',body:JSON.stringify({template:workerTemplate(profile,image,full.tokenSecretVersion)})})
  await h.transport.request('https://cloudscheduler.googleapis.com/v1/'+workerSchedulerName()+':resume',{method:'POST'})
  h.controls.job={generation:'27',observedGeneration:'27'}
  const historicCalls=h.calls.length
  await readWorkerFullEvidence(h.transport,full,profile,f.reader)
  assert.equal(h.calls.length,historicCalls,'historical graph uses immutable provider bodies, not current PAUSED state')
  const source=(await h.transport.readJson(f.input.sourceLockRef)).value,oldCapsule=(await h.transport.readJson((await h.transport.readJson(f.input.priorActivationRef)).value.previousRefs[0])).value
  const capsule={...oldCapsule,sourceRevision:full.sourceRevision,releaseId:source.releaseId,sourceSha256:source.sourceSha256,migrationManifestSha256:source.migrationManifestSha256,sourceLockRef:f.input.sourceLockRef,openswxWorkerRef:completed.refs.fullDescriptorRef}
  const capsuleRef=h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/'+capsule.releaseId+'/release-intent.json',Buffer.from(canonicalize(capsule)+'\n'))
  const dummy=h.seed('FAILED-READY-dummy',{})
  const activationRef=h.seed('FAILED-READY-activation',workerReceipt({descriptor:full,kind:'activation',actor:profile.normalActor,image,template:workerTemplate(profile,image,full.tokenSecretVersion),observedAt:h.transport.now(),previousRefs:[capsuleRef,dummy,dummy,dummy,dummy],facts:{workerStatus:'READY',schedulerState:'ENABLED',claimProof:{claimProof:'AUTHENTICATED_204_SOURCE_BOUND'},dbAdmissionProof:'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN',sourceEntryRef:h.build.facts.sourceHashes.find(row=>row.path==='scripts/run-openswx-metadata-job.mjs'),numericCredentials:{token:full.tokenSecretVersion,registry:full.registrySecretVersion}}}))
  const next=h.nextAttempt(82,activationRef),lock={...next.lock,observedAt:new Date(Date.now()-2000).toISOString()}
  next.input.sourceLockRef=h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/'+lock.releaseId+'/source-lock.json',Buffer.from(canonicalize(lock)+'\n'))
  const metadata=h.metadata?await seedSecretVersionIamContinuation(h,{sourceRevision:next.lock.sourceRevision,sourceLockRef:next.input.sourceLockRef,supplementalIamReadbackRef:h.iam.receiptRef,prebuildIamContinuationRef:h.proof.continuationRef,reader:f.reader,name:'failed-next-metadata',secretPolicies:h.metadata.before.secretPolicies}):null
  const nextRef=await h.put('failed-next-ordinary-input',{...next.input,...(metadata?{secretVersionIamContinuationRef:metadata.continuationRef}:{})})
  const nextSaved=await executeWorkerArtifactReuse({transport:h.transport,inputRef:nextRef,readSource:f.reader})
  assert.ok(nextSaved.refs.programOnlyFullDescriptorRef,'successful continuation is a valid next ordinary READY origin')

})


test('FAILED DAILY rejects ambiguous recovery, changed provider state and unrelated terminal executions before publications',async()=>{
  const f=await failedDailyFixture(),h=f.h,baseline=new Map(h.objects),request=h.transport.request
  for(const kind of ['restored-false','wrong-error','duplicate-markers','extra-readback-field','null-readback','not-expired','missing-selftest','worker-drift','extra-terminal','changed-provider-selftest','disabled-secret']) {
    h.objects.clear();for(const [uri,row] of baseline)h.objects.set(uri,row)
    h.transport.request=request;h.controls.inputDrift=null;h.controls.secretState=null
    const input=structuredClone(f.input),recovery=(await h.transport.readJson(f.failedDailyContinuation.recoveryRequiredRef)).value
    if(kind==='restored-false')recovery.priorJobRestored=false
    if(kind==='wrong-error')recovery.errorCode='OPENSWX_STDOUT_CONFLICT'
    if(kind==='duplicate-markers')recovery.stdoutReadback={executionName:'projects/9536592944/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata/executions/local-1',filterSha256:'a'.repeat(64),markerCount:2,observations:1,elapsedMilliseconds:10}
    if(kind==='extra-readback-field')recovery.stdoutReadback={markerCount:0,extra:true}
    if(kind==='null-readback')recovery.stdoutReadback=null
    if(['restored-false','wrong-error','duplicate-markers','extra-readback-field','null-readback'].includes(kind))input.failedDailyContinuation.recoveryRequiredRef=h.seedBytes(f.failedDailyContinuation.recoveryRequiredRef.uri,Buffer.from(canonicalize(recovery)))
    if(kind==='not-expired') {
      const old=(await h.transport.readJson(f.oldInputRef)).value;old.deadlineAt=deadline()
      input.failedDailyContinuation.bootstrapInputRef=h.seedBytes(f.oldInputRef.uri,Buffer.from(canonicalize(old)))
    }
    if(kind==='missing-selftest')h.objects.delete(f.ref('-selftest').uri)
    if(kind==='worker-drift')h.controls.inputDrift=WORKER_SOURCE_PATHS[0]
    if(kind==='disabled-secret')h.controls.secretState='DISABLED'
    if(kind==='extra-terminal'||kind==='changed-provider-selftest')h.transport.request=async(url,opts={})=>{
      const body=await request(url,opts)
      if(kind==='extra-terminal'&&url.includes('/executions?')) {
        const row=structuredClone(body.executions[0]);row.name=row.name.replace(/local-0$/u,'unrelated');body.executions.push(row)
      }
      if(kind==='changed-provider-selftest'&&url.endsWith('/executions/local-1'))body.template.containers[0].args=['unreviewed']
      return body
    }
    input.receiptId='FAILED-DENIED-'+kind
    const inputRef=await h.put('failed-denied-'+kind,input),calls=h.calls.length,puts=h.puts.length
    await assert.rejects(executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader}),undefined,kind)
    assert.equal(h.puts.length,puts,kind+' cannot create association/proof')
    assert.ok(h.calls.slice(calls).every(row=>!row.options.method||row.options.method==='GET'||row.url.endsWith(':getIamPolicy')||row.url.includes('logging.googleapis.com')),kind+' no lifecycle mutation')
  }
})


async function failedDailyReadyToBootstrap(name='UNKNOWN',options={}) {
  const f=await failedDailyFixture(options),h=f.h,saved=await f.reuse()
  const pauseInputRef=h.seed(name+'-PAUSE-input',{schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:deadline(),receiptId:name+'-PAUSE',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:f.input.priorActivationRef,failedDailyContinuation:f.failedDailyContinuation})
  const runPause=()=>executeOpenSwxBootstrap({stage:'pause',inputRef:pauseInputRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  const paused=await runPause()
  const input={schemaVersion:'aipdm.openswx-bootstrap-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:deadline(),receiptId:name+'-BOOTSTRAP',bootstrapKind:'DAILY_REFRESH',priorActivationRef:f.input.priorActivationRef,pausedDrainedRef:paused.ref,failedDailyContinuation:f.failedDailyContinuation}
  const inputRef=h.seed(name+'-BOOTSTRAP-input',input),run=()=>executeOpenSwxBootstrap({stage:'bootstrap',inputRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  return {...f,saved,paused,runPause,input,inputRef,run,root:profile.receiptRoot+'/'+input.receiptId}
}

test('FAILED DAILY unknown run and PATCH responses adopt exact native readback without another submission',async()=>{
  const f=await failedDailyReadyToBootstrap(),h=f.h
  // Native finite request survives a crash after the provider accepted :run.
  const finiteUri=f.paused.ref.uri.slice(0,-5)+'-drain-finite.json'
  h.objects.delete(finiteUri);h.objects.delete(f.paused.ref.uri)
  const calls=h.calls.length
  const repaused=await f.runPause()
  assert.ok(!h.calls.slice(calls).some(row=>row.url.endsWith(':run')))
  const inputRef=h.seed('UNKNOWN-recovered-bootstrap-input',{...f.input,pausedDrainedRef:repaused.ref})
  const run=()=>executeOpenSwxBootstrap({stage:'bootstrap',inputRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  const request=h.transport.request;let lost=true
  h.transport.request=async(url,opts={})=>{
    const value=await request(url,opts)
    if(lost&&opts.method==='PATCH') {lost=false;throw Object.assign(Error('LOCAL_LOST_PATCH_RESPONSE'),{code:'OUTCOME_UNKNOWN'})}
    return value
  }
  const before=h.calls.length,completed=await run()
  assert.equal(h.calls.slice(before).filter(row=>row.options.method==='PATCH').length,1)
  assert.equal(h.calls.slice(before).filter(row=>row.url.endsWith(':run')).length,0)
  assert.ok(!h.objects.has(f.root+'-recovery-required.json'),'exact PATCH readback keeps successful checkpoint')
  assert.ok(completed.refs.fullDescriptorRef)
  const after=h.calls.length,puts=h.puts.length
  assert.deepEqual((await run()).ref,completed.ref)
  assert.equal(h.puts.length,puts)
  assert.ok(!h.calls.slice(after).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
})

test('FAILED DAILY unknown object responses preserve committed preflight/bootstrap/full checkpoints',async()=>{
  const f=await failedDailyReadyToBootstrap('OBJECT'),h=f.h,put=h.transport.putJson
  const lost=new Set([f.root+'-selftest-patch-request.json',f.root+'-preflight.json',f.root+'.json',f.root+'-descriptor-full.json'])
  h.transport.putJson=async(uri,value,options)=>{
    const row=await put(uri,value,options)
    if(lost.delete(uri))throw Object.assign(Error('LOCAL_LOST_GCS_RESPONSE'),{code:'OUTCOME_UNKNOWN'})
    return row
  }
  const before=h.calls.length,puts=h.puts.length,completed=await f.run()
  assert.equal(lost.size,0)
  assert.equal(h.calls.slice(before).filter(row=>row.options.method==='PATCH').length,1)
  assert.equal(h.calls.slice(before).filter(row=>row.url.endsWith(':run')).length,0)
  for(const uri of [f.root+'-selftest-patch-request.json',f.root+'-preflight.json',f.root+'.json',f.root+'-descriptor-full.json'])assert.equal(h.puts.slice(puts).filter(row=>row===uri).length,1)
  assert.ok(!h.objects.has(f.root+'-recovery-required.json'))
  const replayCalls=h.calls.length,replayPuts=h.puts.length
  assert.deepEqual((await f.run()).refs.fullDescriptorRef,completed.refs.fullDescriptorRef)
  assert.equal(h.puts.length,replayPuts)
  assert.ok(!h.calls.slice(replayCalls).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
})

test('FAILED DAILY durable PATCH replay is input-bound and refuses normal or drifted readback without resubmission',async()=>{
  const f=await failedDailyReadyToBootstrap('PATCH-BOUND'),h=f.h,completed=await f.run()
  const postUris=[f.root+'-preflight.json',f.root+'.json',f.root+'-descriptor-full.json']
  for(const uri of postUris)h.objects.delete(uri)
  const before=h.calls.length
  const replay=await f.run()
  assert.equal((await h.transport.readJson(replay.refs.fullDescriptorRef)).value.sourceRevision,f.saved.value.sourceRevision)
  assert.ok(!h.calls.slice(before).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
  const patchUri=f.root+'-selftest-patch-request.json',original=h.objects.get(patchUri)
  for(const kind of ['input-ref','too-early','extra-key','normal-readback','metadata-drift']) {
    h.objects.set(patchUri,original);h.controls.job={}
    const row=JSON.parse(original.bytes)
    if(kind==='input-ref')row.inputRef=f.oldInputRef
    if(kind==='too-early')row.requestedAt=new Date(Date.parse(f.paused.value.facts.quiescenceCompletedAt)-1).toISOString()
    if(kind==='extra-key')row.extra=true
    if(kind==='normal-readback')h.controls.job={template:workerTemplate(profile,image,token)}
    if(kind==='metadata-drift')h.controls.job={labels:{unrelated:'change'}}
    if(['input-ref','too-early','extra-key'].includes(kind))h.seedBytes(patchUri,Buffer.from(canonicalize(row)))
    const calls=h.calls.length,puts=h.puts.length
    await assert.rejects(f.run(),undefined,kind)
    assert.equal(h.puts.length,puts)
    assert.ok(!h.calls.slice(calls).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
  }
})


test('FAILED DAILY sealed historical resolver reconstructs raw IAM, Secret metadata and inventory rather than trusting snapshot hashes',async()=>{
  const f=await failedDailyFixture(),h=f.h,saved=await f.reuse(),descriptor=(await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef)).value
  const proof=(await h.transport.readJson(saved.value.resourceAssociation.readbackRef)).value
  for(const kind of ['iam-hash','job-policy','secret-metadata','inventory','proof-clock','metadata-labels']) {
    const value=structuredClone(proof)
    if(kind==='iam-hash')value.snapshot.iamSha256='0'.repeat(64)
    if(kind==='inventory')value.snapshot.executions[0].completionTime=new Date(Date.parse(value.snapshot.executions[0].completionTime)+1).toISOString()
    if(kind==='proof-clock')value.isolationProof.observedAt=new Date(Date.parse(value.observationStartedAt)+1).toISOString()
    if(['job-policy','secret-metadata','metadata-labels'].includes(kind)) {
      const raw=value.providerReadbackRefs.find(row=>kind==='job-policy'?row.url==='https://run.googleapis.com/v2/'+workerJobName()+':getIamPolicy':kind==='secret-metadata'?row.url==='https://secretmanager.googleapis.com/v1/'+token:row.url==='https://run.googleapis.com/v2/'+workerJobName())
      const body=(await h.transport.readJson(raw.ref)).value
      if(kind==='job-policy')body.bindings.push({role:'roles/owner',members:['serviceAccount:unrelated@example.invalid']})
      if(kind==='secret-metadata')body.state='DISABLED'
      if(kind==='metadata-labels')body.labels={unexpected:'label'}
      raw.ref=h.seed('failed-poisoned-body-'+kind,body)
    }
    const readbackRef=h.seed('failed-poisoned-proof-'+kind,value),associationRef=h.seed('failed-poisoned-association-'+kind,{...saved.value,resourceAssociation:{...saved.value.resourceAssociation,readbackRef}})
    const calls=h.calls.length,puts=h.puts.length
    await assert.rejects(resolveWorkerArtifact({transport:h.transport,descriptor:{...descriptor,workerBuildRef:associationRef},profile,readSource:f.reader}),undefined,kind)
    assert.equal(h.calls.length,calls,'historical '+kind+' uses zero live provider calls')
    assert.equal(h.puts.length,puts)
  }
})

async function completedFailedDailyNextSourceFixture(restoreNormal = false,options={}) {
  const f = await failedDailyReadyToBootstrap('COMPLETED',options), h = f.h, completed = await f.run()
  const full = (await h.transport.readJson(completed.refs.fullDescriptorRef)).value
  // Legacy fixture path; the realistic checkpoint preserves the native selftest Job.
  if (restoreNormal) await h.transport.request('https://run.googleapis.com/v2/' + workerJobName(), {
    method: 'PATCH', body: JSON.stringify({ template: workerTemplate(profile, image, full.tokenSecretVersion) })
  })
  const next = h.nextAttempt(83, f.input.priorActivationRef)
  const lock = { ...next.lock, observedAt: new Date(Date.now() - 2000).toISOString() }
  next.input.sourceLockRef = h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + lock.releaseId + '/source-lock.json', Buffer.from(canonicalize(lock) + '\n'))
  const metadata = await seedSecretVersionIamContinuation(h, { sourceRevision: next.lock.sourceRevision, sourceLockRef: next.input.sourceLockRef,
    supplementalIamReadbackRef: h.iam.receiptRef, prebuildIamContinuationRef: h.proof.continuationRef, reader: f.reader,
    name: 'completed-next-metadata', secretPolicies: h.metadata.before.secretPolicies })
  const input = { ...next.input, failedDailyContinuation: f.failedDailyContinuation,
    secretVersionIamContinuationRef: metadata.continuationRef, completedFailedDailyCheckpointRef: completed.refs.fullDescriptorRef }
  return { ...f, h, completed, full, input }
}

test('completed FAILED DAILY checkpoint permits the next source while requiring a fresh drain', async () => {
  const f = await completedFailedDailyNextSourceFixture(), h = f.h
  const without = { ...f.input }; delete without.completedFailedDailyCheckpointRef
  const refusedRef = await h.put('completed-next-missing-checkpoint-input', without), refusedPuts = h.puts.length
  await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef: refusedRef, readSource: f.reader }), { code: 'OPENSWX_JOB_READBACK_MISMATCH' })
  assert.equal(h.puts.length, refusedPuts, 'unexplained terminal execution cannot publish association')
  const inputRef = await h.put('completed-next-reuse-input', f.input), before = h.calls.length
  const saved = await executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: f.reader })
  assert.equal(saved.refs.programOnlyFullDescriptorRef, undefined)
  assert.ok(h.calls.slice(before).every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy') || row.url.includes('logging.googleapis.com')))
  const pauseRef = h.seed('COMPLETED-NEXT-PAUSE-input', { schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef: saved.refs.dailyBuildOnlyDescriptorRef,
    workerBuildRef: saved.ref, deadlineAt: deadline(), receiptId: 'COMPLETED-NEXT-PAUSE', drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: f.input.priorActivationRef,
    failedDailyContinuation: f.failedDailyContinuation })
  const pauseCalls = h.calls.length
  const paused = await executeOpenSwxBootstrap({ stage: 'pause', inputRef: pauseRef, transport: h.transport, readSource: f.reader, appProfile, sleep: async () => {} })
  assert.equal(h.calls.slice(pauseCalls).filter(row => row.url.endsWith(':run')).length, 1, 'old checkpoint cannot replace fresh normal drain')
  const bootstrapRef = h.seed('COMPLETED-NEXT-BOOTSTRAP-input', { schemaVersion: 'aipdm.openswx-bootstrap-input.v1', descriptorRef: saved.refs.dailyBuildOnlyDescriptorRef,
    workerBuildRef: saved.ref, deadlineAt: deadline(), receiptId: 'COMPLETED-NEXT-BOOTSTRAP', bootstrapKind: 'DAILY_REFRESH', priorActivationRef: f.input.priorActivationRef,
    pausedDrainedRef: paused.ref, failedDailyContinuation: f.failedDailyContinuation })
  const bootstrapCalls = h.calls.length
  const completed = await executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef: bootstrapRef, transport: h.transport, readSource: f.reader, appProfile, sleep: async () => {} })
  assert.equal(h.calls.slice(bootstrapCalls).filter(row => row.url.endsWith(':run')).length, 0, 'original isolated selftest is reused without another run')
  const full = (await h.transport.readJson(completed.refs.fullDescriptorRef)).value, historicalCalls = h.calls.length
  await readWorkerFullEvidence(h.transport, full, profile, f.reader)
  assert.equal(h.calls.length, historicalCalls, 'full historical graph reconstructs the checkpoint from sealed bodies')
  // A second completed checkpoint carries its authenticated ancestor drain too.
  const third = h.nextAttempt(84, f.input.priorActivationRef)
  const lock = { ...third.lock, observedAt: new Date(Date.now() - 2000).toISOString() }
  third.input.sourceLockRef = h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + lock.releaseId + '/source-lock.json', Buffer.from(canonicalize(lock) + '\n'))
  const metadata = await seedSecretVersionIamContinuation(h, { sourceRevision: third.lock.sourceRevision, sourceLockRef: third.input.sourceLockRef,
    supplementalIamReadbackRef: h.iam.receiptRef, prebuildIamContinuationRef: h.proof.continuationRef, reader: f.reader,
    name: 'completed-third-metadata', secretPolicies: h.metadata.before.secretPolicies })
  const thirdInput = { ...third.input, failedDailyContinuation: f.failedDailyContinuation, secretVersionIamContinuationRef: metadata.continuationRef,
    completedFailedDailyCheckpointRef: completed.refs.fullDescriptorRef }
  const thirdRef = await h.put('completed-third-reuse-input', thirdInput), thirdCalls = h.calls.length
  const thirdSaved = await executeWorkerArtifactReuse({ transport: h.transport, inputRef: thirdRef, readSource: f.reader })
  assert.ok(thirdSaved.refs.dailyBuildOnlyDescriptorRef)
  assert.ok(!h.calls.slice(thirdCalls).some(row => row.options.method === 'PATCH' || row.url.endsWith(':run')))
  const incomplete = await h.put('completed-third-stale-checkpoint-input', { ...thirdInput, receiptId: 'COMPLETED-THIRD-STALE', completedFailedDailyCheckpointRef: f.completed.refs.fullDescriptorRef })
  const incompletePuts = h.puts.length
  await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef: incomplete, readSource: f.reader }), { code: 'OPENSWX_FAILED_DAILY_JOIN_INVALID' })
  assert.equal(h.puts.length, incompletePuts)
})

test('completed FAILED DAILY checkpoint envelopes admit eight genuine association transitions and reject the ninth before authority', async () => {
  const f = await partialFailedDailyNextSourceFixture(), h = f.h
  let input = f.input, saved, completed, full
  // Each step uses the real producer, fresh normal drain and completed bootstrap.
  // History includes a failed isolated run, completed checkpoint and expired
  // partial pause; no fabricated context ancestors or depth numbers are used.
  for (const index of [84, 85, 86, 87, 88]) {
    const inputRef = await h.put('checkpoint-depth-reuse-' + index, input), calls = h.calls.length
    saved = await executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: f.reader })
    assert.ok(saved.refs.dailyBuildOnlyDescriptorRef)
    assert.ok(!h.calls.slice(calls).some(row => row.url.endsWith(':run') || row.options.method === 'PATCH' || row.url.endsWith(':resume')))
    const descriptor = (await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef)).value, replayCalls = h.calls.length
    const artifact = await resolveWorkerArtifact({ transport: h.transport, descriptor, profile, readSource: f.reader })
    assert.ok(artifact.failedDaily.failed.expectedExecutionNames.includes(f.partialName))
    assert.equal(h.calls.length, replayCalls, 'independent consumer authenticates sealed history without provider reads')
    const pauseRef = h.seed('CHECKPOINT-DEPTH-PAUSE-' + index + '-input', { schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef: saved.refs.dailyBuildOnlyDescriptorRef,
      workerBuildRef: saved.ref, deadlineAt: deadline(), receiptId: 'CHECKPOINT-DEPTH-PAUSE-' + index, drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: input.priorActivationRef,
      failedDailyContinuation: f.failedDailyContinuation })
    const pauseCalls = h.calls.length
    const paused = await executeOpenSwxBootstrap({ stage: 'pause', inputRef: pauseRef, transport: h.transport, readSource: f.reader, appProfile, sleep: async () => {} })
    assert.equal(h.calls.slice(pauseCalls).filter(row => row.url.endsWith(':run')).length, 1, 'each source still needs a fresh drain')
    const bootstrapRef = h.seed('CHECKPOINT-DEPTH-BOOTSTRAP-' + index + '-input', { schemaVersion: 'aipdm.openswx-bootstrap-input.v1', descriptorRef: saved.refs.dailyBuildOnlyDescriptorRef,
      workerBuildRef: saved.ref, deadlineAt: deadline(), receiptId: 'CHECKPOINT-DEPTH-BOOTSTRAP-' + index, bootstrapKind: 'DAILY_REFRESH', priorActivationRef: input.priorActivationRef,
      pausedDrainedRef: paused.ref, failedDailyContinuation: f.failedDailyContinuation })
    const bootstrapCalls = h.calls.length
    completed = await executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef: bootstrapRef, transport: h.transport, readSource: f.reader, appProfile, sleep: async () => {} })
    assert.equal(h.calls.slice(bootstrapCalls).filter(row => row.url.endsWith(':run')).length, 0, 'completed isolation is retained')
    full = (await h.transport.readJson(completed.refs.fullDescriptorRef)).value
    const fullCalls = h.calls.length
    await readWorkerFullEvidence(h.transport, full, profile, f.reader)
    assert.equal(h.calls.length, fullCalls)
    const next = h.nextAttempt(index + 1, input.priorActivationRef), lock = { ...next.lock, observedAt: new Date(Date.now() - 2000).toISOString() }
    next.input.sourceLockRef = h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + lock.releaseId + '/source-lock.json', Buffer.from(canonicalize(lock) + '\n'))
    const metadata = await seedSecretVersionIamContinuation(h, { sourceRevision: lock.sourceRevision, sourceLockRef: next.input.sourceLockRef,
      supplementalIamReadbackRef: h.iam.receiptRef, prebuildIamContinuationRef: h.proof.continuationRef, reader: f.reader,
      name: 'checkpoint-depth-metadata-' + index, secretPolicies: h.metadata.before.secretPolicies })
    input = { ...next.input, failedDailyContinuation: f.failedDailyContinuation, secretVersionIamContinuationRef: metadata.continuationRef,
      completedFailedDailyCheckpointRef: completed.refs.fullDescriptorRef }
    assert.equal(input.partialFailedDailyPauseInputRef, undefined, 'latest complete checkpoint carries partial history itself')
  }
  // The path is 88 -> 87 -> 86 -> 85 -> 84 -> partial 83 -> completed 81
  // -> original association. Source 89 adds the ninth real association.
  const refusedRef = await h.put('checkpoint-depth-ninth-input', input), calls = h.calls.length, puts = h.puts.length
  await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef: refusedRef, readSource: f.reader }), { code: 'DEV121_OWNER_RELEASE_PROOF_GRAPH_DEPTH_INVALID' })
  assert.ok(!h.puts.slice(puts).some(uri => uri.endsWith('-association.json') || uri.endsWith('-descriptor-build-only.json')))
  assert.ok(!h.calls.slice(calls).some(row => row.url.endsWith(':run') || row.options.method === 'PATCH' || row.url.endsWith(':resume')))
})

// LOCAL_TEST complete frozen source model. All tracked paths plus the new
// native entrypoint carry actual executable bytes from this working checkout.
// Synthetic identity is never protected-main/provider evidence.
function historyIssuerFixture(h, legacyReader, predecessorInput, predecessorInputRef) {
  const revision=sha256('LOCAL_TEST_NATIVE_HISTORY_ISSUER').slice(0,40),files=new Map(),exportIgnored=[]
  assert.match(canonicalSource('.gitattributes').toString('utf8'),/^\/output export-ignore$/mu)
  for(const row of actualTree.toString('utf8').split('\0').filter(Boolean)){
    const match=/^([0-9]{6}) blob ([a-f0-9]{40})\t([\s\S]+)$/u.exec(row)
    if(!match)continue
    const name=match[3]
    if(name.startsWith('output/')){exportIgnored.push(row+'\0');continue}
    const fixed=name.startsWith('db/postgres/') || name.startsWith('config/') || manifest.entries.find(entry=>entry.path===name) || [...OPENSWX_TERRAFORM_PATHS,...READBACK_IAM_PATHS,PREBUILD_IAM_SOURCE_PATH,SECRET_VERSION_IAM_SOURCE_PATH,SECRET_VERSION_IAM_HUMAN_APPROVAL_PATH].includes(name)
    files.set(name,{path:name,mode:match[1],bytes:fixed?canonicalSource(name):readFileSync(path.join(root,name))})
  }
  const entry='scripts/dev122-openswx-history-basis.mjs'
  files.set(entry,{path:entry,mode:'100644',bytes:readFileSync(path.join(root,entry))})
  const rows=[...files.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'))
  const tree=Buffer.from(rows.map(row=>row.mode+' blob '+sha256(row.bytes).slice(0,40)+'\t'+row.path+'\0').join('')+exportIgnored.join(''))
  const head=git(['rev-parse','HEAD']).toString().trim(),headArchive=git(['archive','--format=tar','--prefix=source/','HEAD','--','config/release/dev117-ai-pdm-independent-production-v3.json'])
  const paxSize=parseInt(headArchive.subarray(124,136).toString().replace(/\0.*$/su,''),8),pax=Buffer.from(headArchive.subarray(0,512+Math.ceil(paxSize/512)*512))
  const marker=Buffer.from('comment='+head),at=pax.indexOf(marker);assert.ok(at>=0);pax.write('comment='+revision,at,marker.length)
  const archive=Buffer.concat([pax,tar(rows)]),releaseId='DEV121-HISTORY-LOCAL-ISSUER'
  const issuerAppProfile=JSON.parse(files.get('config/release/dev117-ai-pdm-independent-production-v3.json').bytes)
  const bundle=buildDev117MigrationBundle(issuerAppProfile,buildDev117MigrationPackage(issuerAppProfile,JSON.parse(files.get('config/platform/dev-010-n1c-ai-pdm.json').bytes)),revision)
  assert.equal(bundle.bundle.entries.length,35)
  for(const entry of bundle.bundle.entries)assert.equal(sha256(files.get(entry.path).bytes),entry.sourceSha256)
  const lock={...sourceLock(revision,tree,releaseId),migrationManifestSha256:bundle.bundle.manifestSha256,observedAt:new Date(Date.now()-2000).toISOString()}
  const sourceLockRef=h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/'+releaseId+'/source-lock.json',Buffer.from(canonicalize(lock)+'\n'))
  const packed=gzipSync(archive,{level:9})
  const currentSourceObjectRef=h.seedBytes('gs://jenfu-platform-prod-aipdm-release/source/releases/'+releaseId+'/'+sha256(packed)+'/source.tar.gz',packed)
  const reader=(name,rev)=>rev===revision?Buffer.from(files.get(name).bytes):legacyReader(name,rev)
  Object.assign(reader,legacyReader)
  reader.authorizeOrigin=rev=>{if(rev!==revision)legacyReader.authorizeOrigin(rev)}
  reader.readTree=rev=>rev===revision?tree:legacyReader.readTree(rev)
  reader.readTreeId=rev=>rev===revision?'e'.repeat(40):legacyReader.readTreeId(rev)
  reader.readArchive=rev=>{assert.equal(rev,revision);return archive}
  reader.assertCurrentFrozen=()=>{for(const name of files.keys())if(name.endsWith('.mjs')&&!manifest.entries.some(row=>row.path===name))assert.ok(files.get(name).bytes.equals(readFileSync(path.join(root,name))))}
  reader.createHistoricalReader=()=>legacyReader
  reader.readImmutableArchive=rev=>rev===revision?archive:legacyReader.readImmutableArchive(rev)
  const prefix=profile.receiptRoot+'/'+predecessorInput.receiptId+'-'+predecessorInputRef.sha256.slice(0,16)
  const objectRef=uri=>{assert.ok(h.objects.has(uri),'native predecessor object '+uri);return h.objects.get(uri).ref}
  const findRef=kind=>{const names=[...h.objects.keys()].filter(uri=>uri.startsWith(prefix+'-'+kind+'-'));assert.equal(names.length,1);return objectRef(names[0])}
  const input={schemaVersion:'aipdm.openswx-history-basis-input.v1',receiptId:'DEV121-HISTORY-LOCAL-BASIS',sourceLockRef,currentSourceObjectRef,deadlineAt:deadline(),
    predecessorInputRef,predecessorRequestRef:objectRef(prefix+'-request.json'),predecessorCurrentManifestRef:objectRef(prefix+'-current-inputs.json'),
    predecessorResourceReadbackRef:findRef('ready'),predecessorSecurityReadbackRef:findRef('security')}
  return{revision,lock,sourceLockRef,currentSourceObjectRef,reader,input,files,archive,bundle,appProfile:issuerAppProfile}
}

async function measureHistoryRoot(name,operation) {
  const started=performance.now(),rssBefore=process.memoryUsage().rss
  try {return await operation()} finally {console.log('LOCAL_TEST_HISTORY_ROOT '+JSON.stringify({name,elapsedMs:Math.round(performance.now()-started),rssBefore,rssAfter:process.memoryUsage().rss}))}
}

function historyPublicProofFixture(h,issuer,complete) {
  const put=(uri,value)=>h.seedBytes(uri,Buffer.from(canonicalize(value)+'\n')), app=issuer.appProfile,stamp=new Date(Date.now()).toISOString()
  const capsule={schemaVersion:app.schemas.releaseIntent,ownerApplicationId:'ai-pdm',releaseId:issuer.lock.releaseId,sourceRevision:issuer.revision,sourceSha256:issuer.lock.sourceSha256,sourceLockRef:issuer.sourceLockRef,
    authorizationPolicyRef:issuer.sourceLockRef,readinessReceiptRef:issuer.sourceLockRef,foundationReceiptRef:issuer.sourceLockRef,infraReceiptRef:issuer.sourceLockRef,runtimeConfigRef:issuer.sourceLockRef,
    migrationManifestSha256:issuer.bundle.bundle.manifestSha256,previousRevision:'ai-pdm-prod-'+ '2'.repeat(12),deadlineAt:deadline(),openswxWorkerRef:complete.refs.fullDescriptorRef}
  const intentRef=put('gs://jenfu-platform-prod-aipdm-release/receipts/releases/'+capsule.releaseId+'/release-intent.json',capsule),base=intentRef.uri.slice(0,-19)+intentRef.sha256
  const stage=(name,previousReceiptRef,facts)=>put(base+'/'+name+'.json',sealProgramOnlyEvidence({schemaVersion:'jenfu.dev012.stage-receipt.v1',ownerApplicationId:'ai-pdm',releaseId:capsule.releaseId,sourceRevision:issuer.revision,stage:name,previousReceiptRef,facts,observedAt:stamp,status:'PASS'}))
  const prepare=stage('prepare',null,{prerequisiteRefs:Object.fromEntries(['sourceLock','authorization','readiness','foundation','infra','runtimeConfig'].map(name=>[name,issuer.sourceLockRef]))})
  const packed=h.objects.get(issuer.currentSourceObjectRef.uri).bytes,sourceUri='gs://jenfu-platform-prod-aipdm-release/source/releases/'+capsule.releaseId+'/'+intentRef.sha256+'/source.tar.gz'
  const sourceObject={...h.seedBytes(sourceUri,packed),generation:'17',crc32c:crc32cBase64(packed)}
  const migrationBundleRef=h.seedBytes('gs://jenfu-platform-prod-aipdm-release/source/migration-bundles/'+issuer.revision+'/'+issuer.bundle.bundle.manifestSha256+'.json',issuer.bundle.bytes)
  const artifactDigest=app.artifact.uri+'@sha256:'+'1'.repeat(64),buildId='22222222-2222-2222-2222-222222222222'
  const provenance=put(base+'/provenance.json',{schemaVersion:'jenfu.dev012.build-provenance-receipt.v1',ownerApplicationId:'ai-pdm',sourceRevision:issuer.revision,sourceObject,artifactDigest,status:'PASS',
    cloudBuild:{name:'projects/jenfu-platform-prod/locations/asia-east1/builds/'+buildId,id:buildId,status:'SUCCESS',projectId:'jenfu-platform-prod',serviceAccount:'projects/jenfu-platform-prod/serviceAccounts/'+app.identities.builder,
      options:{requestedVerifyOption:'VERIFIED'},sourceProvenance:{resolvedStorageSource:{bucket:'jenfu-platform-prod-aipdm-release',object:sourceUri.split('/').slice(3).join('/'),generation:'17'}},results:{images:[{name:app.artifact.uri+':release-'+issuer.revision,digest:artifactDigest.split('@')[1]}]}},artifactRegistry:{uri:artifactDigest}})
  const build=stage('build',prepare,{artifactDigest,sourceObject,migrationBundleRef,provenanceReceiptRef:provenance})
  const worker=(JSON.parse(h.objects.get(complete.refs.fullDescriptorRef.uri).bytes))
  put(base+'/deployment-capsule.json',{schemaVersion:app.schemas.deploymentCapsule,ownerApplicationId:'ai-pdm',sourceRevision:issuer.revision,artifactDigest,buildReceiptRef:build,sourceObject,migrationBundleRef,
    migrationRunnerDigest:app.artifact.migrationRunnerUri+'@sha256:'+'e'.repeat(64),releaseIntentRef:intentRef,releaseIntentSha256:intentRef.sha256,deadlineAt:capsule.deadlineAt,openswxWorker:{descriptorRef:capsule.openswxWorkerRef,workerBuildRef:worker.workerBuildRef,image}})
  const calls=[]
  const fetchImpl=async(url,options={})=>{
    assert.ok(!options.method||options.method==='GET','public proof must use readonly pinned fixture requests');calls.push(url)
    const match=/\/b\/([^/]+)\/o\/([^?]+)/u.exec(url),uri=match&&'gs://'+decodeURIComponent(match[1])+'/'+decodeURIComponent(match[2]),row=h.objects.get(uri)
    if(!row)return Response.json({},{status:404})
    if(url.includes('alt=media')){assert.equal(new URL(url).searchParams.get('generation'),'17');return new Response(row.bytes)}
    return Response.json({bucket:decodeURIComponent(match[1]),name:decodeURIComponent(match[2]),generation:'17',crc32c:crc32cBase64(row.bytes),size:String(row.bytes.length)})
  }
  return{prepare,capsule,intentRef,calls,fetchImpl}
}

test('native history basis qualifies the complete eight-transition predecessor and admits the ninth through native consumers', async () => {
  const f = await partialFailedDailyNextSourceFixture({proofMetadata:true}), h = f.h
  let input = f.input, saved, completed, full
  // Each step uses the real producer, fresh normal drain and completed bootstrap.
  // History includes a failed isolated run, completed checkpoint and expired
  // partial pause; no fabricated context ancestors or depth numbers are used.
  for (const index of [84, 85, 86, 87, 88]) {
    const inputRef = await h.put('checkpoint-depth-reuse-' + index, input), calls = h.calls.length
    saved = await executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: f.reader })
    assert.ok(saved.refs.dailyBuildOnlyDescriptorRef)
    assert.ok(!h.calls.slice(calls).some(row => row.url.endsWith(':run') || row.options.method === 'PATCH' || row.url.endsWith(':resume')))
    const descriptor = (await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef)).value, replayCalls = h.calls.length
    const artifact = await resolveWorkerArtifact({ transport: h.transport, descriptor, profile, readSource: f.reader })
    assert.ok(artifact.failedDaily.failed.expectedExecutionNames.includes(f.partialName))
    assert.equal(h.calls.length, replayCalls, 'independent consumer authenticates sealed history without provider reads')
    const pauseRef = h.seed('CHECKPOINT-DEPTH-PAUSE-' + index + '-input', { schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef: saved.refs.dailyBuildOnlyDescriptorRef,
      workerBuildRef: saved.ref, deadlineAt: deadline(), receiptId: 'CHECKPOINT-DEPTH-PAUSE-' + index, drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: input.priorActivationRef,
      failedDailyContinuation: f.failedDailyContinuation })
    const pauseCalls = h.calls.length
    const paused = await executeOpenSwxBootstrap({ stage: 'pause', inputRef: pauseRef, transport: h.transport, readSource: f.reader, appProfile, sleep: async () => {} })
    assert.equal(h.calls.slice(pauseCalls).filter(row => row.url.endsWith(':run')).length, 1, 'each source still needs a fresh drain')
    const bootstrapRef = h.seed('CHECKPOINT-DEPTH-BOOTSTRAP-' + index + '-input', { schemaVersion: 'aipdm.openswx-bootstrap-input.v1', descriptorRef: saved.refs.dailyBuildOnlyDescriptorRef,
      workerBuildRef: saved.ref, deadlineAt: deadline(), receiptId: 'CHECKPOINT-DEPTH-BOOTSTRAP-' + index, bootstrapKind: 'DAILY_REFRESH', priorActivationRef: input.priorActivationRef,
      pausedDrainedRef: paused.ref, failedDailyContinuation: f.failedDailyContinuation })
    const bootstrapCalls = h.calls.length
    completed = await executeOpenSwxBootstrap({ stage: 'bootstrap', inputRef: bootstrapRef, transport: h.transport, readSource: f.reader, appProfile, sleep: async () => {} })
    assert.equal(h.calls.slice(bootstrapCalls).filter(row => row.url.endsWith(':run')).length, 0, 'completed isolation is retained')
    full = (await h.transport.readJson(completed.refs.fullDescriptorRef)).value
    const fullCalls = h.calls.length
    await readWorkerFullEvidence(h.transport, full, profile, f.reader)
    assert.equal(h.calls.length, fullCalls)
    const next = h.nextAttempt(index + 1, input.priorActivationRef), lock = { ...next.lock, observedAt: new Date(Date.now() - 2000).toISOString() }
    next.input.sourceLockRef = h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/' + lock.releaseId + '/source-lock.json', Buffer.from(canonicalize(lock) + '\n'))
    const metadata = await seedSecretVersionIamContinuation(h, { sourceRevision: lock.sourceRevision, sourceLockRef: next.input.sourceLockRef,
      supplementalIamReadbackRef: h.iam.receiptRef, prebuildIamContinuationRef: h.proof.continuationRef, reader: f.reader,
      name: 'checkpoint-depth-metadata-' + index, secretPolicies: h.metadata.before.secretPolicies })
    input = { ...next.input, failedDailyContinuation: f.failedDailyContinuation, secretVersionIamContinuationRef: metadata.continuationRef,
      completedFailedDailyCheckpointRef: completed.refs.fullDescriptorRef }
    assert.equal(input.partialFailedDailyPauseInputRef, undefined, 'latest complete checkpoint carries partial history itself')
  }
  // The path is 88 -> 87 -> 86 -> 85 -> 84 -> partial 83 -> completed 81
  // -> original association. Source 89 adds the ninth real association.
  const refusedRef = await h.put('checkpoint-depth-ninth-input', input), calls = h.calls.length, puts = h.puts.length
  await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef: refusedRef, readSource: f.reader }), { code: 'DEV121_OWNER_RELEASE_PROOF_GRAPH_DEPTH_INVALID' })
  assert.ok(!h.puts.slice(puts).some(uri => uri.endsWith('-association.json') || uri.endsWith('-descriptor-build-only.json')))
  assert.ok(!h.calls.slice(calls).some(row => row.url.endsWith(':run') || row.options.method === 'PATCH' || row.url.endsWith(':resume')))
  syntheticClock.hold();syntheticClock.expireAfter(input.deadlineAt)
  const issuer=historyIssuerFixture(h,f.reader,input,refusedRef)
  assertOpenSwxHistoryBasisInput(issuer.input)
  const qualificationRef=await h.put('history-basis-qualification-input',issuer.input),basisCalls=h.calls.length,basisPuts=h.puts.length
  const nativePut=h.transport.putJson
  let basisWrites=0,basis
  h.transport.putJson=async(uri,value)=>{const saved=await nativePut(uri,value);if(uri.endsWith('-history-basis.json')){basisWrites++;throw Object.assign(Error('unknown'),{code:'OUTCOME_UNKNOWN'})}return saved}
  try { basis=await measureHistoryRoot('basis-publication',()=>executeOpenSwxHistoryBasis({transport:h.transport,inputRef:qualificationRef,readSource:issuer.reader})) } finally { h.transport.putJson=nativePut }
  assert.equal(basisWrites,1,'lost publication response is read back without duplicate POST')
  assertOpenSwxHistoryBasis(basis.value)
  assert.deepEqual(basis.value.qualificationInputRef,qualificationRef)
  assert.equal(basis.value.qualifierSourceTreeSha256,issuer.lock.sourceSha256)
  assert.equal(h.puts.length-basisPuts,1,'basis producer publishes only its immutable fact receipt')
  assert.ok(!h.calls.slice(basisCalls).some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'||row.url.endsWith(':resume')))
  const current={...input,schemaVersion:'aipdm.openswx-worker-reuse-input.v3',historyBasisRef:basis.ref,receiptId:'DEV121-HISTORY-CURRENT',
    sourceLockRef:issuer.sourceLockRef,currentSourceObjectRef:issuer.currentSourceObjectRef,deadlineAt:deadline()}
  const metadata=await seedSecretVersionIamContinuation(h,{sourceRevision:issuer.revision,sourceLockRef:issuer.sourceLockRef,
    supplementalIamReadbackRef:h.iam.receiptRef,prebuildIamContinuationRef:h.proof.continuationRef,reader:issuer.reader,
    name:'history-basis-current-metadata',secretPolicies:h.metadata.before.secretPolicies})
  current.secretVersionIamContinuationRef=metadata.continuationRef
  const currentRef=await h.put('history-basis-current-reuse-input',current),currentCalls=h.calls.length
  const qualified=await measureHistoryRoot('current-reuse',()=>executeWorkerArtifactReuse({transport:h.transport,inputRef:currentRef,readSource:issuer.reader}))
  assert.equal(qualified.value.schemaVersion,'aipdm.openswx-worker-build-association.v3')
  assert.deepEqual(qualified.value.historyBasisRef,basis.ref)
  assert.ok(!h.calls.slice(currentCalls).some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'||row.url.endsWith(':resume')))
  const descriptor=(await h.transport.readJson(qualified.refs.dailyBuildOnlyDescriptorRef)).value
  assert.equal(descriptor.schemaVersion,'aipdm.openswx-worker-descriptor.v4')
  const replayCalls=h.calls.length
  const artifact=await measureHistoryRoot('artifact-consumer',()=>resolveWorkerArtifact({transport:h.transport,descriptor,profile,readSource:issuer.reader}))
  assert.ok(artifact.failedDaily.failed.expectedExecutionNames.includes(f.partialName))
  assert.equal(h.calls.length,replayCalls,'new independent root recomputes historical closure using only pinned reads')
  const pauseRef=h.seed('HISTORY-CURRENT-PAUSE-input',{schemaVersion:'aipdm.openswx-pause-input.v2',historyBasisRef:basis.ref,
    descriptorRef:qualified.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:qualified.ref,deadlineAt:deadline(),receiptId:'HISTORY-CURRENT-PAUSE',
    drainKind:'DAILY_DB_VERIFIED',priorActivationRef:current.priorActivationRef,failedDailyContinuation:f.failedDailyContinuation})
  const pauseCalls=h.calls.length
  const paused=await measureHistoryRoot('pause',()=>executeOpenSwxBootstrap({stage:'pause',inputRef:pauseRef,transport:h.transport,readSource:issuer.reader,appProfile,sleep:async()=>{}}))
  assert.equal(h.calls.slice(pauseCalls).filter(row=>row.url.endsWith(':run')).length,1,'qualification never replaces fresh authenticated normal drain')
  const bootstrapRef=h.seed('HISTORY-CURRENT-BOOTSTRAP-input',{schemaVersion:'aipdm.openswx-bootstrap-input.v2',historyBasisRef:basis.ref,
    descriptorRef:qualified.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:qualified.ref,deadlineAt:deadline(),receiptId:'HISTORY-CURRENT-BOOTSTRAP',
    bootstrapKind:'DAILY_REFRESH',priorActivationRef:current.priorActivationRef,pausedDrainedRef:paused.ref,failedDailyContinuation:f.failedDailyContinuation})
  const bootstrapCalls=h.calls.length
  const complete=await measureHistoryRoot('bootstrap',()=>executeOpenSwxBootstrap({stage:'bootstrap',inputRef:bootstrapRef,transport:h.transport,readSource:issuer.reader,appProfile,sleep:async()=>{}}))
  assert.equal(h.calls.slice(bootstrapCalls).filter(row=>row.url.endsWith(':run')).length,0,'authenticated historical isolation remains reused')
  const completeDescriptor=(await h.transport.readJson(complete.refs.fullDescriptorRef)).value
  assert.equal(completeDescriptor.schemaVersion,'aipdm.openswx-worker-descriptor.v4');assert.deepEqual(completeDescriptor.historyBasisRef,basis.ref)
  const fullCalls=h.calls.length
  await measureHistoryRoot('full-consumer',()=>readWorkerFullEvidence(h.transport,completeDescriptor,profile,issuer.reader))
  assert.equal(h.calls.length,fullCalls)
  const priorCapsule=(await h.transport.readJson((await h.transport.readJson(current.priorActivationRef)).value.previousRefs[0])).value
  const intent={...priorCapsule,sourceRevision:issuer.revision,sourceSha256:issuer.lock.sourceSha256,sourceLockRef:issuer.sourceLockRef,
    releaseId:issuer.lock.releaseId,openswxWorkerRef:complete.refs.fullDescriptorRef,deadlineAt:deadline()}
  const owner=createOpenSwxOwnerRelease({transport:h.transport,readSource:issuer.reader,environment:{OWNER_EXECUTION_MODE:'full_release',GITHUB_WORKFLOW_REF:appProfile.application.repository+'/'+appProfile.workflow.path+'@refs/heads/main'}})
  const ownerCalls=h.calls.length
  assert.deepEqual((await measureHistoryRoot('owner-resolve',()=>owner.resolve(intent,appProfile))).ref,complete.refs.fullDescriptorRef)
  assert.equal(h.calls.length,ownerCalls,'owner root must independently qualify pinned history before current ancestry')
  const wire=historyPublicProofFixture(h,issuer,complete),publicCalls=h.calls.length
  await measureHistoryRoot('public-observation',()=>runAiPdmEvidenceContext(createAiPdmEvidenceContext(),async()=>{
    const proof=await readAiPdmReleaseObservation({sourceRevision:issuer.revision,refs:{prepare:wire.prepare,migrate:null,terminal:null},token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl,readSource:issuer.reader})
    assert.equal(proof.disposition,'build_only');assert.equal(proof.releaseAuthority,false);assert.equal(proof.migrationVerified,false)
    const graph=await readAiPdmObservationInputs(proof)
    assert.equal(graph.intent.migrationManifestSha256,issuer.bundle.bundle.manifestSha256)
    assert.equal(graph.sourceLock.value.migrationManifestSha256,issuer.bundle.bundle.manifestSha256)
    assert.equal(graph.bundle.bundle.entries.length,35)
    for(const entry of graph.bundle.bundle.entries)assert.equal(sha256(graph.content.files.get(entry.path)),entry.sourceSha256)
    // The same qualified v4 root must reject each poisoned raw v4 descriptor,
    // not merely reject a legacy v1 pause shape before reaching its reference.
    const pauseInput=(await h.transport.readJson(pauseRef)).value
    for (const refs of [[], [pauseRef], [pauseRef,h.fullRef], [pauseRef,completeDescriptor.workerBuildRef,pauseRef]]) {
      const calls=h.calls.length, puts=h.puts.length
      await assert.rejects(assertFailedDailyFullJoin({transport:h.transport,profile,artifact,descriptor:completeDescriptor,
        paused:{previousRefs:refs},bootstrap:{},preflight:{}}),{code:'OPENSWX_FAILED_DAILY_JOIN_INVALID'})
      assert.equal(h.calls.length,calls);assert.equal(h.puts.length,puts)
    }
    const aliasInputRef=h.seed('history-pause-wrong-receipt-root',{...pauseInput,receiptId:'HISTORY-WRONG-ROOT'})
    await assert.rejects(assertFailedDailyFullJoin({transport:h.transport,profile,artifact,descriptor:completeDescriptor,
      paused:{previousRefs:[aliasInputRef,completeDescriptor.workerBuildRef]},bootstrap:{},preflight:{}}),
      {code:'OPENSWX_FAILED_DAILY_JOIN_INVALID'})
    for(const kind of ['full-purpose','wrong-source','wrong-archive','wrong-build','wrong-basis','malformed']) {
      const raw=structuredClone(kind==='full-purpose'?completeDescriptor:descriptor)
      if(kind==='wrong-source')raw.sourceRevision='0'.repeat(40)
      if(kind==='wrong-archive')raw.sourceArchiveSha256='0'.repeat(64)
      if(kind==='wrong-build')raw.workerBuildRef=h.fullRef
      if(kind==='wrong-basis')raw.historyBasisRef={...basis.ref,sha256:'0'.repeat(64)}
      if(kind==='malformed')raw.extra='caller-PASS'
      const badDescriptorRef=h.seed('history-v4-raw-'+kind,raw),badPauseRef=h.seed('history-v2-pause-'+kind,{...pauseInput,descriptorRef:badDescriptorRef})
      await assert.rejects(assertFailedDailyFullJoin({transport:h.transport,profile,artifact,descriptor:completeDescriptor,paused:{previousRefs:[badPauseRef,completeDescriptor.workerBuildRef]},bootstrap:{},preflight:{}}),/OPENSWX_(?:DESCRIPTOR|FAILED_DAILY_JOIN)_INVALID/u,kind)
    }

  }))
  assert.equal(h.calls.length,publicCalls,'public root replays history without live provider calls')
  // A later source must be able to carry a completed v4 checkpoint whose own
  // history basis belongs to the checkpoint source. The current source remains
  // independently frozen and must not become that historical issuer.
  const next=h.nextAttempt(90,current.priorActivationRef),nextLock={...next.lock,observedAt:new Date(Date.now()-2000).toISOString()}
  next.input.sourceLockRef=h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/'+nextLock.releaseId+'/source-lock.json',Buffer.from(canonicalize(nextLock)+'\n'))
  f.reader.authorizeOrigin(JSON.parse(h.objects.get(input.sourceLockRef.uri).bytes).sourceRevision)
  const nextPermitted=new Set([nextLock.sourceRevision]),historicalReaders=[]
  let currentFrozenChecks=0,historicalFrozenChecks=0,historicalArchiveChecks=0,historicalImmutableArchiveChecks=0
  const routedReader=(name,revision)=>revision===nextLock.sourceRevision?f.reader(name,revision):issuer.reader(name,revision)
  const nextReader=(name,revision)=>{
    if(!nextPermitted.has(revision)&&![...READBACK_IAM_PATHS,WORKER_PROFILE_PATH].includes(name))throw Object.assign(Error('unvalidated historical source'),{code:'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'})
    return routedReader(name,revision)
  }
  Object.assign(nextReader,issuer.reader)
  nextReader.authorizeOrigin=revision=>{
    if(revision===nextLock.sourceRevision)f.reader.authorizeOrigin(revision);else issuer.reader.authorizeOrigin(revision)
    nextPermitted.add(revision)
  }
  nextReader.readTree=revision=>{assert.ok(nextPermitted.has(revision));return revision===nextLock.sourceRevision?f.reader.readTree(revision):issuer.reader.readTree(revision)}
  nextReader.readTreeId=revision=>{assert.ok(nextPermitted.has(revision));return revision===nextLock.sourceRevision?f.reader.readTreeId(revision):issuer.reader.readTreeId(revision)}
  nextReader.readArchive=revision=>{assert.equal(revision,nextLock.sourceRevision);return f.reader.readArchive(revision)}
  nextReader.assertCurrentFrozen=()=>{currentFrozenChecks++;return f.reader.assertCurrentFrozen()}
  nextReader.createHistoricalReader=revision=>{
    historicalReaders.push(revision)
    assert.equal(revision,issuer.revision)
    const historical=(name,sourceRevision)=>issuer.reader(name,sourceRevision)
    Object.assign(historical,issuer.reader)
    historical.assertCurrentFrozen=()=>{historicalFrozenChecks++;throw Error('HISTORICAL_READER_CANNOT_ASSERT_CURRENT')}
    historical.readArchive=()=>{historicalArchiveChecks++;historical.assertCurrentFrozen();throw Error('HISTORICAL_CURRENT_ARCHIVE_FORBIDDEN')}
    historical.readImmutableArchive=sourceRevision=>{
      historicalImmutableArchiveChecks++
      assert.equal(sourceRevision,issuer.revision)
      return issuer.reader.readArchive(sourceRevision)
    }
    return historical
  }
  assert.throws(()=>nextReader('scripts/lib/dev122-openswx-worker-artifact-reuse.mjs',issuer.revision),{code:'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'})
  const nextMetadata=await seedSecretVersionIamContinuation(h,{sourceRevision:nextLock.sourceRevision,sourceLockRef:next.input.sourceLockRef,
    supplementalIamReadbackRef:h.iam.receiptRef,prebuildIamContinuationRef:h.proof.continuationRef,reader:nextReader,
    name:'history-v4-checkpoint-next-metadata',secretPolicies:h.metadata.before.secretPolicies})
  const nextInput={...next.input,failedDailyContinuation:f.failedDailyContinuation,secretVersionIamContinuationRef:nextMetadata.continuationRef,
    completedFailedDailyCheckpointRef:complete.refs.fullDescriptorRef,receiptId:'HISTORY-V4-CHECKPOINT-NEXT'}
  const nextRef=await h.put('history-v4-checkpoint-next-input',nextInput),nextCalls=h.calls.length
  const carried=await executeWorkerArtifactReuse({transport:h.transport,inputRef:nextRef,readSource:nextReader})
  assert.ok(carried.refs.dailyBuildOnlyDescriptorRef)
  const carriedDescriptor=(await h.transport.readJson(carried.refs.dailyBuildOnlyDescriptorRef)).value
  assert.deepEqual(historicalReaders,[issuer.revision],'hash-pinned v4 checkpoint opens exactly its own historical source reader')
  assert.ok(currentFrozenChecks>0,'nested replay retains the current checkout freeze assertion')
  assert.equal(historicalFrozenChecks,0,'nested replay cannot substitute the historical checkout for the current freeze assertion')
  assert.equal(historicalArchiveChecks,0,'nested replay cannot call the historical reader current-checkout archive closure')
  assert.ok(historicalImmutableArchiveChecks>0,'nested replay reads only the admitted immutable historical archive')
  const readersBeforeDescriptorMismatch=historicalReaders.length
  const mismatchedCheckpointRef=h.seed('history-v4-checkpoint-byte-mismatch',{...carriedDescriptor,purpose:'build_only'})
  const mismatchRoot=createAiPdmEvidenceContext()
  await assert.rejects(runAiPdmEvidenceContext(mismatchRoot,async()=>{
    const child=descendAiPdmEvidenceContext(mismatchRoot,mismatchedCheckpointRef)
    return runAiPdmEvidenceContext(child,()=>ensureAiPdmNestedCheckpointHistoryBasis({
      checkpointRef:mismatchedCheckpointRef,checkpointDescriptor:carriedDescriptor,basisRef:carriedDescriptor.historyBasisRef,
      transport:h.transport,readSource:nextReader,sourceRevision:carriedDescriptor.sourceRevision,
    }))
  }),{code:'DEV121_OWNER_RELEASE_PROOF_HISTORY_BASIS_NESTED_CHECKPOINT_INVALID'})
  assert.equal(historicalReaders.length,readersBeforeDescriptorMismatch,'descriptor byte mismatch refuses before opening a historical reader')
  const carriedArtifact=await runAiPdmEvidenceContext(createAiPdmEvidenceContext(),()=>resolveWorkerArtifact({
    transport:h.transport,descriptor:carriedDescriptor,profile,readSource:nextReader,
  }))
  assert.deepEqual(carriedArtifact.associationRef,carriedDescriptor.workerBuildRef)
  const basisValue=(await h.transport.readJson(basis.ref)).value,conflictContext=createAiPdmEvidenceContext()
  await assert.rejects(runAiPdmEvidenceContext(conflictContext,async()=>{
    recordAiPdmHistoryObject({ref:basisValue.qualificationInputRef,metadata:{generation:'999999',crc32c:null,sourceRevision:null}})
    return resolveWorkerArtifact({transport:h.transport,descriptor:carriedDescriptor,profile,readSource:nextReader})
  }),{code:'DEV121_OWNER_RELEASE_PROOF_HISTORY_CLOSURE_CONFLICT'})
  assert.ok(!h.calls.slice(nextCalls).some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'||row.url.endsWith(':resume')))
  assert.ok(wire.calls.some(url=>decodeURIComponent(url).includes(basis.ref.uri.split('/').slice(3).join('/'))),'public root must independently read and qualify basis')
  const expiringReader=(name,revision)=>nextReader(name,revision)
  Object.assign(expiringReader,nextReader)
  let expiringHistoricalReaders=0
  expiringReader.createHistoricalReader=revision=>{
    expiringHistoricalReaders++
    const historical=nextReader.createHistoricalReader(revision)
    syntheticClock.hold();syntheticClock.expireAfter(new Date(Date.now()+600000).toISOString())
    return historical
  }
  await assert.rejects(runAiPdmEvidenceContext(createAiPdmEvidenceContext(),()=>resolveWorkerArtifact({
    transport:h.transport,descriptor:carriedDescriptor,profile,readSource:expiringReader,
  })),{code:'DEV121_OWNER_RELEASE_PROOF_OBSERVATION_EXPIRED'})
  assert.equal(expiringHistoricalReaders,1,'nested replay keeps the outer observation deadline after opening the historical reader')

})

test('completed FAILED DAILY checkpoint rejects unbound, partial, tampered and unknown execution histories before publication', async () => {
  const f = await completedFailedDailyNextSourceFixture(), h = f.h, objects = new Map(h.objects), request = h.transport.request
  const drainRef = (await h.transport.readJson(f.full.pausedDrainedRef)).value.facts.drainExecutionRef
  const drainName = (await h.transport.readJson(drainRef)).value.facts.executionName
  for (const kind of ['missing-ref', 'hash-mismatch', 'partial-descriptor', 'unrelated-full', 'wrong-credentials', 'wrong-source', 'wrong-archive', 'wrong-lock', 'different-failure', 'bootstrap-kind', 'bootstrap-template', 'extra-terminal', 'missing-terminal', 'changed-terminal-template', 'changed-terminal-status']) {
    h.objects.clear(); for (const [uri, row] of objects) h.objects.set(uri, row)
    h.transport.request = request
    const input = structuredClone(f.input)
    if (kind === 'missing-ref') h.objects.delete(input.completedFailedDailyCheckpointRef.uri)
    if (kind === 'hash-mismatch') input.completedFailedDailyCheckpointRef.sha256 = 'a'.repeat(64)
    if (kind === 'partial-descriptor') input.completedFailedDailyCheckpointRef = f.saved.refs.dailyBuildOnlyDescriptorRef
    if (kind === 'unrelated-full') input.completedFailedDailyCheckpointRef = h.fullRef
    if (kind === 'wrong-credentials') {
      const full = { ...f.full, tokenSecretVersion: f.full.tokenSecretVersion.replace(/7$/u, '8') }
      input.completedFailedDailyCheckpointRef = h.seedBytes(input.completedFailedDailyCheckpointRef.uri, Buffer.from(canonicalize(full)))
    }
    if (['wrong-source', 'wrong-archive', 'wrong-lock'].includes(kind)) {
      const full = structuredClone(f.full)
      if (kind === 'wrong-source') full.sourceRevision = '0'.repeat(40)
      if (kind === 'wrong-archive') full.sourceArchiveSha256 = '0'.repeat(64)
      if (kind === 'wrong-lock') {
        const association = (await h.transport.readJson(full.workerBuildRef)).value
        full.workerBuildRef = h.seed('completed-wrong-lock-association', { ...association, sourceLockRef: f.input.sourceLockRef })
      }
      input.completedFailedDailyCheckpointRef = h.seedBytes(input.completedFailedDailyCheckpointRef.uri, Buffer.from(canonicalize(full)))
    }
    if (['bootstrap-kind','bootstrap-template'].includes(kind)) {
      const full=structuredClone(f.full), bootstrap=(await h.transport.readJson(full.bootstrapRef)).value
      if(kind==='bootstrap-kind') bootstrap.facts.bootstrapKind='FIRST_CREATE'
      if(kind==='bootstrap-template') bootstrap.templateSha256=sha256(canonicalize(workerTemplate(profile,image,token)))
      full.bootstrapRef=h.seedBytes(full.bootstrapRef.uri,Buffer.from(canonicalize(bootstrap)))
      input.completedFailedDailyCheckpointRef=h.seedBytes(input.completedFailedDailyCheckpointRef.uri,Buffer.from(canonicalize(full)))
    }
    if (kind === 'different-failure') input.failedDailyContinuation.recoveryRequiredRef = f.ref('-prior-recovery')
    if (['extra-terminal', 'missing-terminal', 'changed-terminal-template', 'changed-terminal-status'].includes(kind)) h.transport.request = async (url, options = {}) => {
      const body = await request(url, options)
      if (url.includes('/executions?')) {
        if (kind === 'extra-terminal') { const row = structuredClone(body.executions[0]); row.name = row.name.replace(/[^/]+$/u, 'unrelated-completed'); body.executions.push(row) }
        if (kind === 'missing-terminal') body.executions = body.executions.filter(row => row.name !== drainName)
        for (const row of body.executions.filter(row => row.name === drainName)) {
          if (kind === 'changed-terminal-template') row.template.containers[0].args = ['unreviewed']
          if (kind === 'changed-terminal-status') { row.succeededCount = 0; row.failedCount = 1; row.conditions[0].state = 'CONDITION_FAILED' }
        }
      }
      return body
    }
    input.receiptId = 'COMPLETED-DENIED-' + kind
    const inputRef = await h.put('completed-denied-' + kind, input), puts = h.puts.length, calls = h.calls.length
    await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: f.reader }), undefined, kind)
    assert.equal(h.puts.length, puts, kind + ' cannot publish an association or resource proof')
    assert.ok(h.calls.slice(calls).every(row => !row.options.method || row.options.method === 'GET' || row.url.endsWith(':getIamPolicy') || row.url.includes('logging.googleapis.com')), kind + ' cannot mutate lifecycle')
  }
})


test('completed FAILED DAILY metadata keeps descriptor cycle and same-URI hash-conflict guards', async () => {
  const f = await completedFailedDailyNextSourceFixture(), h = f.h
  f.reader.authorizeOrigin(f.full.sourceRevision)
  const artifact = await resolveWorkerArtifact({ transport: h.transport, descriptor: f.full, profile, readSource: f.reader })
  const calls = h.calls.length, puts = h.puts.length
  for (const hashConflict of [false, true]) {
    const ctx = createAiPdmEvidenceContext()
    const ref = hashConflict ? { ...f.completed.refs.fullDescriptorRef, sha256: '0'.repeat(64) } : f.completed.refs.fullDescriptorRef
    await assert.rejects(runAiPdmEvidenceContext(ctx, () => runAiPdmEvidenceContext(descendAiPdmEvidenceContext(ctx, f.completed.refs.fullDescriptorRef, false), () =>
      readCompletedFailedDailyCheckpoint({ transport: h.transport, checkpointRef: ref, failed: artifact.failedDaily.failed, prior: artifact.origin.prior,
        profile, readSource: f.reader, currentManifest: artifact.currentManifest }))), { code: 'DEV121_OWNER_RELEASE_PROOF_GRAPH_CYCLE_OR_HASH_CONFLICT' })
  }
  assert.equal(h.calls.length, calls, 'metadata guard rejects before provider observation')
  assert.equal(h.puts.length, puts)
})

test('completed FAILED DAILY checkpoint input stays own-bucket and failed-only', () => {
  const own = name => ({ uri: `${profile.receiptRoot}/${name}.json`, sha256: 'a'.repeat(64) })
  const input = { schemaVersion: 'aipdm.openswx-worker-reuse-input.v1', sourceLockRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/LOCAL-COMPLETED/source-lock.json', sha256: 'b'.repeat(64) },
    currentSourceObjectRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/source/releases/LOCAL-COMPLETED/source.tar.gz', sha256: 'c'.repeat(64) }, priorActivationRef: own('prior-ready'), deadlineAt: deadline(), receiptId: 'LOCAL-COMPLETED',
    failedDailyContinuation: { bootstrapInputRef: own('failed-input'), recoveryRequiredRef: own('failed-recovery-required'), priorRecoveryRef: own('failed-prior-recovery') }, completedFailedDailyCheckpointRef: own('completed-full') }
  assertWorkerReuseInput(input)
  for (const mutate of [row => delete row.failedDailyContinuation, row => row.completedFailedDailyCheckpointRef = null,
    row => row.completedFailedDailyCheckpointRef.uri = 'gs://sibling/receipts/completed.json', row => row.completedFailedDailyCheckpointRef.extra = true,
    row => row.schemaVersion = 'aipdm.openswx-worker-reuse-input.v2']) {
    const bad = structuredClone(input); mutate(bad); assert.throws(() => assertWorkerReuseInput(bad))
  }
})


async function partialFailedDailyNextSourceFixture(options={}) {
  const f=await completedFailedDailyNextSourceFixture(false,options),h=f.h
  const saved=await executeWorkerArtifactReuse({transport:h.transport,inputRef:await h.put('partial-basis-reuse-input',f.input),readSource:f.reader})
  // Freeze only the synthetic fault setup, then explicitly expire its old attempt.
  syntheticClock.hold()
  const oldDeadline=new Date(Date.now()+3000).toISOString(),root=profile.receiptRoot+'/PARTIAL-OLD-PAUSE'
  const partialInputRef=h.seed('PARTIAL-OLD-PAUSE-input',{schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:oldDeadline,receiptId:'PARTIAL-OLD-PAUSE',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:f.input.priorActivationRef,failedDailyContinuation:f.failedDailyContinuation})
  const original=h.transport.request;let submitted=false,operationBody,partialName
  h.transport.request=async(url,opts={})=>{
    if(url.endsWith(':run')) {const result=await original(url,opts);submitted=true;operationBody=result;partialName=result.metadata.name;return result}
    if(submitted&&url.includes('/executions?'))throw Object.assign(Error('lost authentication after submission'),{code:'AUTH_REQUIRED'})
    return original(url,opts)
  }
  await assert.rejects(executeOpenSwxBootstrap({stage:'pause',inputRef:partialInputRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}}),{code:'AUTH_REQUIRED'})
  const requestRow=await h.transport.readJson(h.objects.get(root+'-drain-finite-request.json').ref)
  const execution={...operationBody.metadata};delete execution['@type']
  execution.createTime=new Date(Date.parse(requestRow.value.requestStartedAt)-120).toISOString()
  operationBody={name:operationBody.name,done:true,metadata:{'@type':'type.googleapis.com/google.cloud.run.v2.Execution',...execution},response:{'@type':'type.googleapis.com/google.cloud.run.v2.Execution',...execution}}
  h.seedBytes(root+'-drain-finite-operation.json',Buffer.from(canonicalize({schemaVersion:'aipdm.openswx-finite-operation.v1',requestRef:requestRow.ref,providerOperationName:operationBody.name})))
  h.transport.request=async(url,opts={})=>{
    if(url==='https://run.googleapis.com/v2/'+operationBody.name){h.calls.push({url,options:opts});return structuredClone(operationBody)}
    const body=await original(url,opts)
    if(url.includes('/executions?'))body.executions=body.executions.map(row=>row.name===partialName?structuredClone(execution):row)
    if(url==='https://run.googleapis.com/v2/'+partialName)return structuredClone(execution)
    return body
  }
  const next=h.nextAttempt(84,f.input.priorActivationRef),lock={...next.lock,observedAt:new Date(Date.now()-2000).toISOString()}
  next.input.sourceLockRef=h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/'+lock.releaseId+'/source-lock.json',Buffer.from(canonicalize(lock)+'\n'))
  const metadata=await seedSecretVersionIamContinuation(h,{sourceRevision:next.lock.sourceRevision,sourceLockRef:next.input.sourceLockRef,supplementalIamReadbackRef:h.iam.receiptRef,prebuildIamContinuationRef:h.proof.continuationRef,reader:f.reader,name:'partial-next-metadata',secretPolicies:h.metadata.before.secretPolicies})
  const input={...next.input,failedDailyContinuation:f.failedDailyContinuation,secretVersionIamContinuationRef:metadata.continuationRef,completedFailedDailyCheckpointRef:f.completed.refs.fullDescriptorRef,partialFailedDailyPauseInputRef:partialInputRef}
  syntheticClock.expireAfter(oldDeadline)
  return {...f,h,input,partialInputRef,partialName,operationBody,execution,partialRoot:root}
}

test('partial FAILED DAILY pause admits only attested expired history and still requires a fresh drain',async()=>{
  const f=await partialFailedDailyNextSourceFixture(),h=f.h,inputRef=await h.put('partial-next-reuse-input',f.input),calls=h.calls.length
  const saved=await executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader})
  assert.ok(saved.refs.dailyBuildOnlyDescriptorRef)
  assert.ok(!h.calls.slice(calls).some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'))
  assert.equal(h.objects.has(f.partialRoot+'.json'),false)
  assert.equal(h.objects.has(f.partialRoot+'-drain-finite.json'),false)
  const descriptor=(await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef)).value,readCalls=h.calls.length
  const historical=await resolveWorkerArtifact({transport:h.transport,descriptor,profile,readSource:f.reader})
  assert.equal(h.calls.length,readCalls,'partial provider evidence replays only sealed bodies')
  assert.ok(historical.failedDaily.failed.expectedExecutionNames.includes(f.partialName))
  const pauseRef=h.seed('PARTIAL-NEXT-PAUSE-input',{schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:deadline(),receiptId:'PARTIAL-NEXT-PAUSE',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:f.input.priorActivationRef,failedDailyContinuation:f.failedDailyContinuation})
  const pauseCalls=h.calls.length,paused=await executeOpenSwxBootstrap({stage:'pause',inputRef:pauseRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  assert.equal(h.calls.slice(pauseCalls).filter(row=>row.url.endsWith(':run')).length,1,'history never replaces the fresh normal drain')
  assert.notEqual(paused.value.facts.dbAdmissionProof.executionName,f.partialName)
  const bootstrapRef=h.seed('PARTIAL-NEXT-BOOTSTRAP-input',{schemaVersion:'aipdm.openswx-bootstrap-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:deadline(),receiptId:'PARTIAL-NEXT-BOOTSTRAP',bootstrapKind:'DAILY_REFRESH',priorActivationRef:f.input.priorActivationRef,pausedDrainedRef:paused.ref,failedDailyContinuation:f.failedDailyContinuation})
  const bootstrapCalls=h.calls.length,completed=await executeOpenSwxBootstrap({stage:'bootstrap',inputRef:bootstrapRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  assert.equal(h.calls.slice(bootstrapCalls).filter(row=>row.url.endsWith(':run')).length,0)
  const full=(await h.transport.readJson(completed.refs.fullDescriptorRef)).value,fullCalls=h.calls.length
  await readWorkerFullEvidence(h.transport,full,profile,f.reader)
  assert.equal(h.calls.length,fullCalls)
})

test('partial FAILED DAILY pause admits a sealed failed empty-claim drain and carries it forward',async()=>{
  const f=await partialFailedDailyNextSourceFixture(),h=f.h
  const partialInput=(await h.transport.readJson(f.partialInputRef)).value
  const descriptor=(await h.transport.readJson(partialInput.descriptorRef)).value
  const requestRow=await h.transport.readJson(h.objects.get(f.partialRoot+'-drain-finite-request.json').ref)
  const latch=await h.transport.readJson(h.objects.get(f.partialRoot+'-drain-finite-operation.json').ref)
  const execution={...f.execution,createTime:new Date(Date.parse(requestRow.value.requestStartedAt)+100).toISOString(),conditions:[{type:'Started',state:'CONDITION_SUCCEEDED'},{type:'Completed',state:'CONDITION_FAILED'}],succeededCount:0,failedCount:1,
    completionTime:new Date(Date.parse(requestRow.value.requestStartedAt)+1100).toISOString()}
  const operation={name:f.operationBody.name,done:true,error:{code:10,message:'execution failed'},metadata:{'@type':'type.googleapis.com/google.cloud.run.v2.Execution',...execution}}
  // Cloud Run's long-running operation envelope may omit execution counters;
  // the terminal execution readback remains authoritative for those fields.
  delete operation.metadata.failedCount
  delete operation.metadata.succeededCount
  const stdoutFilter=['resource.type="cloud_run_job"','resource.labels.project_id="'+profile.projectId+'"','resource.labels.location="'+profile.location+'"','resource.labels.job_name="'+profile.jobId+'"','labels."run.googleapis.com/execution_name="'+f.partialName.split('/').at(-1)+'"','logName="projects/jenfu-platform-prod/logs/run.googleapis.com%2Fstdout"','timestamp>="'+execution.createTime+'"','timestamp<="'+execution.completionTime+'"'].join(' AND ')
  const claimFilter=['resource.type="cloud_run_revision"','resource.labels.project_id="'+profile.projectId+'"','resource.labels.location="'+profile.location+'"','resource.labels.service_name="ai-pdm-prod"','logName="projects/jenfu-platform-prod/logs/run.googleapis.com%2Frequests"','timestamp>="'+execution.createTime+'"','timestamp<="'+execution.completionTime+'"','httpRequest.requestUrl="'+profile.canonicalOrigin+'/api/openswx-metadata-jobs/claim"'].join(' AND ')
  const failure=h.seed('partial-failed-empty-claim-evidence',{schemaVersion:'aipdm.openswx-failed-daily-drain-failure.v1',ownerApplicationId:'ai-pdm',sourceRevision:descriptor.sourceRevision,sourceArchiveSha256:descriptor.sourceArchiveSha256,
    workerBuildRef:partialInput.workerBuildRef,priorActivationRef:partialInput.priorActivationRef,partialFailedDailyPauseInputRef:f.partialInputRef,requestRef:requestRow.ref,operationRef:latch.ref,operation,execution,
    claimEvidence:{filter:claimFilter,filterSha256:sha256(claimFilter),entries:[{logName:'projects/jenfu-platform-prod/logs/run.googleapis.com%2Frequests',resource:{type:'cloud_run_revision',labels:{project_id:'jenfu-platform-prod',service_name:'ai-pdm-prod'}},httpRequest:{requestMethod:'POST',status:204,requestUrl:profile.canonicalOrigin+'/api/openswx-metadata-jobs/claim',userAgent:'node'},timestamp:new Date(Date.parse(execution.createTime)+100).toISOString()}],observedAt:execution.completionTime},
    stdoutEvidence:{filter:stdoutFilter,filterSha256:sha256(stdoutFilter),entries:[],observedAt:execution.completionTime},actor:profile.normalActor,observedAt:execution.completionTime})
  const input={...f.input,failedDailyPauseFailureRef:failure},inputRef=await h.put('partial-failed-empty-claim-next-input',input),beforeCalls=h.calls.length
  const original=h.transport.request
  h.transport.request=async(url,opts={})=>{
    if(url==='https://run.googleapis.com/v2/'+f.operationBody.name){h.calls.push({url,options:opts});return structuredClone(operation)}
    const body=await original(url,opts)
    if(url.includes('/executions?')) body.executions=body.executions.map(row=>row.name===f.partialName?structuredClone(execution):row)
    if(url==='https://run.googleapis.com/v2/'+f.partialName)return structuredClone(execution)
    return body
  }
  const saved=await executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader})
  assert.ok(saved.refs.dailyBuildOnlyDescriptorRef)
  assert.ok(!h.calls.slice(beforeCalls).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
  const descriptorOut=(await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef)).value
  const artifact=await resolveWorkerArtifact({transport:h.transport,descriptor:descriptorOut,profile,readSource:f.reader})
  assert.ok(artifact.failedDaily.failed.failedPauseExecutions.some(row=>row.name===f.partialName))
  assert.equal(artifact.failedDaily.failed.currentTemplateMode,'NORMAL')
})

test('partial FAILED DAILY frontier rebase admits only source-bound sealed extra executions', async () => {
  const f = await partialFailedDailyNextSourceFixture(), h = f.h
  const baseInputRef = await h.put('frontier-rebase-base-input', { ...f.input, receiptId: 'FRONTIER-REBASE-BASE' })
  const baseSaved = await executeWorkerArtifactReuse({ transport: h.transport, inputRef: baseInputRef, readSource: f.reader })
  const baseDescriptor = (await h.transport.readJson(baseSaved.refs.dailyBuildOnlyDescriptorRef)).value
  const baseArtifact = await resolveWorkerArtifact({ transport: h.transport, descriptor: baseDescriptor, profile, readSource: f.reader })
  const baseExpectedExecutionNames = [...baseArtifact.failedDaily.failed.expectedExecutionNames].filter(name => name !== f.partialName).sort()
  const partialInput = (await h.transport.readJson(f.partialInputRef)).value
  const descriptor = (await h.transport.readJson(partialInput.descriptorRef)).value
  const requestRow = await h.transport.readJson(h.objects.get(f.partialRoot + '-drain-finite-request.json').ref)
  const latch = await h.transport.readJson(h.objects.get(f.partialRoot + '-drain-finite-operation.json').ref)
  const failureExecution = { ...f.execution, createTime: new Date(Date.parse(requestRow.value.requestStartedAt) + 100).toISOString(),
    conditions: [{ type: 'Started', state: 'CONDITION_SUCCEEDED' }, { type: 'Completed', state: 'CONDITION_FAILED' }], succeededCount: 0, failedCount: 1,
    completionTime: new Date(Date.parse(requestRow.value.requestStartedAt) + 1100).toISOString() }
  const operation = { name: f.operationBody.name, done: true, error: { code: 10, message: 'execution failed' }, metadata: { '@type': 'type.googleapis.com/google.cloud.run.v2.Execution', ...failureExecution } }
  delete operation.metadata.failedCount
  delete operation.metadata.succeededCount
  const extraName = f.partialName.replace(/[^/]+$/u, 'frontier-extra')
  const extraExecution = { ...f.execution, name: extraName.replace('/projects/9536592944/', '/projects/jenfu-platform-prod/'), uid: 'frontier-extra-uid', creator: profile.normalActor,
    createTime: new Date(Date.parse(requestRow.value.requestStartedAt) - 500).toISOString(), completionTime: new Date(Date.parse(requestRow.value.requestStartedAt) - 400).toISOString(),
    conditions: [{ type: 'Started', state: 'CONDITION_SUCCEEDED' }, { type: 'Completed', state: 'CONDITION_SUCCEEDED' }], succeededCount: 1, failedCount: 0 }
  const extraBodyRef = h.seed('frontier-extra-execution-body', extraExecution)
  const request = { ...requestRow.value, baselineExecutionNames: [...baseExpectedExecutionNames, extraName].sort() }
  const requestRef = h.seedBytes(requestRow.ref.uri, Buffer.from(canonicalize(request)))
  const stdoutFilter = ['resource.type="cloud_run_job"', 'resource.labels.project_id="' + profile.projectId + '"', 'resource.labels.location="' + profile.location + '"', 'resource.labels.job_name="' + profile.jobId + '"', 'labels."run.googleapis.com/execution_name="' + f.partialName.split('/').at(-1) + '"', 'logName="projects/jenfu-platform-prod/logs/run.googleapis.com%2Fstdout"', 'timestamp>="' + failureExecution.createTime + '"', 'timestamp<="' + failureExecution.completionTime + '"'].join(' AND ')
  const claimFilter = ['resource.type="cloud_run_revision"', 'resource.labels.project_id="' + profile.projectId + '"', 'resource.labels.location="' + profile.location + '"', 'resource.labels.service_name="ai-pdm-prod"', 'logName="projects/jenfu-platform-prod/logs/run.googleapis.com%2Frequests"', 'timestamp>="' + failureExecution.createTime + '"', 'timestamp<="' + failureExecution.completionTime + '"', 'httpRequest.requestUrl="' + profile.canonicalOrigin + '/api/openswx-metadata-jobs/claim"'].join(' AND ')
  const failure = h.seed('frontier-rebase-failure', { schemaVersion: 'aipdm.openswx-failed-daily-drain-failure.v1', ownerApplicationId: 'ai-pdm', sourceRevision: descriptor.sourceRevision, sourceArchiveSha256: descriptor.sourceArchiveSha256,
    workerBuildRef: partialInput.workerBuildRef, priorActivationRef: partialInput.priorActivationRef, partialFailedDailyPauseInputRef: f.partialInputRef, requestRef, operationRef: latch.ref, operation, execution: failureExecution,
    claimEvidence: { filter: claimFilter, filterSha256: sha256(claimFilter), entries: [{ logName: 'projects/jenfu-platform-prod/logs/run.googleapis.com%2Frequests', resource: { type: 'cloud_run_revision', labels: { project_id: 'jenfu-platform-prod', service_name: 'ai-pdm-prod' } }, httpRequest: { requestMethod: 'POST', status: 204, requestUrl: profile.canonicalOrigin + '/api/openswx-metadata-jobs/claim', userAgent: 'node' }, timestamp: new Date(Date.parse(failureExecution.createTime) + 100).toISOString() }], observedAt: failureExecution.completionTime },
    stdoutEvidence: { filter: stdoutFilter, filterSha256: sha256(stdoutFilter), entries: [], observedAt: failureExecution.completionTime }, actor: profile.normalActor, observedAt: failureExecution.completionTime })
  const extraMeta = { name: extraName, bodyRef: extraBodyRef, uid: extraExecution.uid, creator: extraExecution.creator, createTime: extraExecution.createTime, completionTime: extraExecution.completionTime,
    succeededCount: extraExecution.succeededCount, templateSha256: sha256(canonicalize(normalizeWorkerTemplate(extraExecution.template))), bodySha256: sha256(canonicalize(extraExecution)) }
  const frontierBinding = { priorActivationRef: f.input.priorActivationRef, completedFailedDailyCheckpointRef: f.input.completedFailedDailyCheckpointRef, partialFailedDailyPauseInputRef: f.partialInputRef, failedDailyPauseFailureRef: failure }
  const frontier = h.seed('frontier-rebase-evidence', { schemaVersion: 'aipdm.openswx-frontier-rebase.v1', ownerApplicationId: 'ai-pdm', purpose: 'FAILED_DAILY_FRONTIER_REBASE', sourceRevision: descriptor.sourceRevision,
    sourceArchiveSha256: descriptor.sourceArchiveSha256, sourceLockRef: f.input.sourceLockRef, priorActivationRef: f.input.priorActivationRef, completedFailedDailyCheckpointRef: f.input.completedFailedDailyCheckpointRef,
    partialFailedDailyPauseInputRef: f.partialInputRef, failedDailyPauseFailureRef: failure, baseExpectedExecutionNames, baseExpectedExecutionNamesSha256: sha256(canonicalize(baseExpectedExecutionNames)),
    extraExecutions: [extraMeta], extraExecutionNamesSha256: sha256(canonicalize([extraName])), frontierBindingSha256: sha256(canonicalize(frontierBinding)), observedAt: failureExecution.completionTime, deadlineAt: f.input.deadlineAt })
  const input = { ...f.input, schemaVersion: 'aipdm.openswx-worker-reuse-input.v4', receiptId: 'FRONTIER-REBASE-CURRENT', failedDailyPauseFailureRef: failure, frontierRebaseRef: frontier }
  const inputRef = await h.put('frontier-rebase-current-input', input)
  const original = h.transport.request
  h.transport.request = async (url, opts = {}) => {
    if (url === 'https://run.googleapis.com/v2/' + f.operationBody.name) { h.calls.push({ url, options: opts }); return structuredClone(operation) }
    const body = await original(url, opts)
    if (url.includes('/executions?')) body.executions = [...body.executions, structuredClone(extraExecution)].map(row => row.name === f.partialName ? structuredClone(failureExecution) : row)
    if (url === 'https://run.googleapis.com/v2/' + f.partialName) return structuredClone(failureExecution)
    if (url === 'https://run.googleapis.com/v2/' + extraName) return structuredClone(extraExecution)
    return body
  }
  const saved = await executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: f.reader })
  assert.ok(saved.refs.dailyBuildOnlyDescriptorRef)
  const descriptorOut = (await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef)).value
  const artifact = await resolveWorkerArtifact({ transport: h.transport, descriptor: descriptorOut, profile, readSource: f.reader })
  assert.ok(artifact.failedDaily.failed.expectedExecutionNames.includes(extraName))
  const poisoned = structuredClone((await h.transport.readJson(frontier)).value); poisoned.extraExecutionNamesSha256 = '0'.repeat(64)
  const poisonedRef = h.seed('frontier-rebase-poisoned', poisoned)
  const poisonedInputRef = await h.put('frontier-rebase-poisoned-input', { ...input, receiptId: 'FRONTIER-REBASE-POISONED', frontierRebaseRef: poisonedRef })
  const puts = h.puts.length
  await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef: poisonedInputRef, readSource: f.reader }), { code: 'OPENSWX_FAILED_DAILY_FRONTIER_REBASE_INVALID' })
  assert.equal(h.puts.length, puts)
})


test('partial FAILED DAILY pause rejects unbound evidence and unknown inventory before publication',async()=>{
  const f=await partialFailedDailyNextSourceFixture(),h=f.h,objects=new Map(h.objects),provider=h.transport.request
  for(const kind of ['missing-input','hash-mismatch','wrong-actor','wrong-baseline','expired-window','wrong-request-ref','wrong-operation','not-done','operation-error','wrong-type','different-response','wrong-uid','wrong-creator','wrong-template','extra-execution','missing-execution','already-completed','cycle']) {
    h.objects.clear();for(const [uri,row]of objects)h.objects.set(uri,row)
    const input=structuredClone(f.input),operation=structuredClone(f.operationBody)
    if(kind==='missing-input')h.objects.delete(input.partialFailedDailyPauseInputRef.uri)
    if(kind==='hash-mismatch')input.partialFailedDailyPauseInputRef.sha256='a'.repeat(64)
    if(['wrong-actor','wrong-baseline','expired-window'].includes(kind)) {
      const row=await h.transport.readJson(h.objects.get(f.partialRoot+'-drain-finite-request.json').ref),request=structuredClone(row.value)
      if(kind==='wrong-actor')request.actor='unauthorized@example.invalid'
      if(kind==='wrong-baseline')request.baselineExecutionNames.push(f.partialName)
      if(kind==='expired-window')request.requestWindowEndsAt=new Date(Date.parse(request.requestStartedAt)+40_000).toISOString()
      const ref=h.seedBytes(row.ref.uri,Buffer.from(canonicalize(request)))
      const latch=await h.transport.readJson(h.objects.get(f.partialRoot+'-drain-finite-operation.json').ref)
      h.seedBytes(latch.ref.uri,Buffer.from(canonicalize({...latch.value,requestRef:ref})))
    }
    if(kind==='wrong-request-ref'){
      const latch=await h.transport.readJson(h.objects.get(f.partialRoot+'-drain-finite-operation.json').ref)
      h.seedBytes(latch.ref.uri,Buffer.from(canonicalize({...latch.value,requestRef:{...latch.value.requestRef,sha256:'b'.repeat(64)}})))
    }
    if(kind==='wrong-operation')operation.name=operation.name.replace('asia-east1','us-east1')
    if(kind==='not-done')operation.done=false
    if(kind==='operation-error')operation.error={code:13,message:'unavailable'}
    if(kind==='wrong-type')operation.metadata['@type']='type.googleapis.com/google.cloud.run.v2.Job'
    if(kind==='different-response')operation.response.name=operation.response.name+'-other'
    if(kind==='wrong-uid')operation.response.uid='different-provider-uid'
    if(kind==='wrong-creator')operation.metadata.creator='unauthorized@example.invalid'
    if(kind==='wrong-template')operation.response.template.containers[0].args=['--unexpected']
    if(kind==='already-completed')h.seedBytes(f.partialRoot+'.json',Buffer.from('{}'))
    if(kind==='cycle'){
      const row=await h.transport.readJson(input.partialFailedDailyPauseInputRef)
      input.partialFailedDailyPauseInputRef=h.seedBytes(row.ref.uri,Buffer.from(canonicalize({...row.value,workerBuildRef:input.partialFailedDailyPauseInputRef})))
    }
    h.transport.request=async(url,opts={})=>{
      if(url==='https://run.googleapis.com/v2/'+f.operationBody.name){h.calls.push({url,options:opts});return structuredClone(operation)}
      const body=await provider(url,opts)
      if(url.includes('/executions?')){
        if(kind==='extra-execution')body.executions.push({...f.execution,name:f.partialName+'-unknown'})
        if(kind==='missing-execution')body.executions=body.executions.filter(row=>row.name!==f.partialName)
      }
      return body
    }
    input.receiptId='PARTIAL-DENIED-'+kind
    const inputRef=await h.put('partial-denied-'+kind,input),puts=h.puts.length,calls=h.calls.length
    await assert.rejects(executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader}),undefined,kind)
    assert.equal(h.puts.length,puts,kind+' cannot publish authority')
    assert.ok(!h.calls.slice(calls).some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'||row.url.endsWith(':resume')),kind+' cannot mutate lifecycle')
  }
})

test('partial FAILED DAILY input is own-bucket and unavailable outside failed v1 reuse',()=>{
  const own=name=>({uri:profile.receiptRoot+'/'+name+'.json',sha256:'a'.repeat(64)})
  const input={schemaVersion:'aipdm.openswx-worker-reuse-input.v1',sourceLockRef:{uri:'gs://jenfu-platform-prod-aipdm-release/receipts/releases/LOCAL-PARTIAL/source-lock.json',sha256:'b'.repeat(64)},currentSourceObjectRef:{uri:'gs://jenfu-platform-prod-aipdm-release/source/releases/LOCAL-PARTIAL/source.tar.gz',sha256:'c'.repeat(64)},priorActivationRef:own('prior-ready'),deadlineAt:deadline(),receiptId:'LOCAL-PARTIAL',failedDailyContinuation:{bootstrapInputRef:own('failed-input'),recoveryRequiredRef:own('failed-recovery-required'),priorRecoveryRef:own('failed-prior-recovery')},partialFailedDailyPauseInputRef:own('partial-pause-input')}
  assertWorkerReuseInput(input)
  for(const mutate of [row=>delete row.failedDailyContinuation,row=>row.partialFailedDailyPauseInputRef=null,row=>row.partialFailedDailyPauseInputRef.uri='gs://sibling/receipts/partial.json',row=>row.partialFailedDailyPauseInputRef.extra=true,row=>row.schemaVersion='aipdm.openswx-worker-reuse-input.v2']){
    const bad=structuredClone(input);mutate(bad);assert.throws(()=>assertWorkerReuseInput(bad))
  }
})


test('partial FAILED DAILY pause preserves descriptor ancestry and rejects a real evidence graph cycle',async()=>{
  const f=await partialFailedDailyNextSourceFixture(),h=f.h
  const input=(await h.transport.readJson(f.partialInputRef)).value
  const descriptor=(await h.transport.readJson(input.descriptorRef)).value
  f.reader.authorizeOrigin(descriptor.sourceRevision)
  const artifact=await resolveWorkerArtifact({transport:h.transport,descriptor,profile,readSource:f.reader})
  const calls=h.calls.length,puts=h.puts.length,ctx=createAiPdmEvidenceContext()
  await assert.rejects(runAiPdmEvidenceContext(ctx,async()=>runAiPdmEvidenceContext(descendAiPdmEvidenceContext(ctx,input.descriptorRef,true),async()=>{
    await readPartialFailedDailyPause({transport:h.transport,inputRef:f.partialInputRef,failed:artifact.failedDaily.failed,prior:artifact.origin.prior,profile,readSource:f.reader,currentManifest:artifact.currentManifest})
  })),{code:'DEV121_OWNER_RELEASE_PROOF_GRAPH_CYCLE_OR_HASH_CONFLICT'})
  assert.equal(h.puts.length,puts,'cycle cannot publish evidence')
  assert.equal(h.calls.length,calls,'cycle fails before live provider observations')
})


test('FAILED DAILY pause receipt observes quiescence atomically when the clock advances between reads',async()=>{
  const f=await failedDailyReadyToBootstrap(),h=f.h
  const nativeNow=h.transport.now;let clock=Date.parse(nativeNow())
  h.transport.now=()=>new Date(clock=Math.max(clock+1,Date.parse(nativeNow()))).toISOString()
  // Native finite request survives a crash after the provider accepted :run.
  const finiteUri=f.paused.ref.uri.slice(0,-5)+'-drain-finite.json'
  h.objects.delete(finiteUri);h.objects.delete(f.paused.ref.uri)
  const calls=h.calls.length
  const repaused=await f.runPause()
  assert.equal(repaused.value.observedAt,repaused.value.facts.quiescenceCompletedAt)
  assert.ok(!h.calls.slice(calls).some(row=>row.url.endsWith(':run')))
  const inputRef=h.seed('UNKNOWN-recovered-bootstrap-input',{...f.input,pausedDrainedRef:repaused.ref})
  const run=()=>executeOpenSwxBootstrap({stage:'bootstrap',inputRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  const request=h.transport.request;let lost=true
  h.transport.request=async(url,opts={})=>{
    const value=await request(url,opts)
    if(lost&&opts.method==='PATCH') {lost=false;throw Object.assign(Error('LOCAL_LOST_PATCH_RESPONSE'),{code:'OUTCOME_UNKNOWN'})}
    return value
  }
  const before=h.calls.length,completed=await run()
  assert.equal(h.calls.slice(before).filter(row=>row.options.method==='PATCH').length,1)
  assert.equal(h.calls.slice(before).filter(row=>row.url.endsWith(':run')).length,0)
  assert.ok(!h.objects.has(f.root+'-recovery-required.json'),'exact PATCH readback keeps successful checkpoint')
  assert.ok(completed.refs.fullDescriptorRef)
  const after=h.calls.length,puts=h.puts.length
  assert.deepEqual((await run()).ref,completed.ref)
  assert.equal(h.puts.length,puts)
  assert.ok(!h.calls.slice(after).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
})

test('partial FAILED DAILY metadata preserves remaining association depth',async()=>{
  const f=await partialFailedDailyNextSourceFixture(),h=f.h
  const input=(await h.transport.readJson(f.partialInputRef)).value
  const descriptor=(await h.transport.readJson(input.descriptorRef)).value
  f.reader.authorizeOrigin(descriptor.sourceRevision)
  const artifact=await resolveWorkerArtifact({transport:h.transport,descriptor,profile,readSource:f.reader})
  const calls=h.calls.length,puts=h.puts.length,ctx=createAiPdmEvidenceContext()
  const withinAncestors=async(handle,index,limit,callback)=>runAiPdmEvidenceContext(handle,async()=>{
    if(index===limit)return callback()
    const ref={uri:profile.receiptRoot+'/LOCAL-PRIOR-ASSOCIATION-'+index+'.json',sha256:(String(index+1)).repeat(64)}
    return withinAncestors(descendAiPdmEvidenceContext(handle,ref,true),index+1,limit,callback)
  })
  const admitted=await withinAncestors(ctx,0,5,()=>readPartialFailedDailyPause({transport:h.transport,inputRef:f.partialInputRef,failed:artifact.failedDaily.failed,prior:artifact.origin.prior,profile,readSource:f.reader,currentManifest:artifact.currentManifest}))
  assert.deepEqual(admitted.partialPause.inputRef,f.partialInputRef)
  assert.ok(!admitted.expectedExecutionNames.includes(f.partialName),'input alone cannot attest its execution')
  await assert.rejects(withinAncestors(createAiPdmEvidenceContext(),0,6,()=>readPartialFailedDailyPause({transport:h.transport,inputRef:f.partialInputRef,failed:artifact.failedDaily.failed,prior:artifact.origin.prior,profile,readSource:f.reader,currentManifest:artifact.currentManifest})),{code:'DEV121_OWNER_RELEASE_PROOF_GRAPH_DEPTH_INVALID'})
  assert.equal(h.puts.length,puts,'metadata traversal cannot publish evidence')
  assert.ok(h.calls.slice(calls).every(row=>!row.options.method||row.options.method==='GET'||row.url.endsWith(':getIamPolicy')||row.url.includes('logging.googleapis.com')),'metadata traversal cannot mutate lifecycle')
})

test('partial FAILED DAILY producer validates prepublication and published association within remaining depth',async()=>{
  const withinAncestors=async(handle,index,limit,callback)=>runAiPdmEvidenceContext(handle,async()=>{
    if(index===limit)return callback()
    const ref={uri:profile.receiptRoot+'/LOCAL-PRODUCER-ANCESTOR-'+index+'.json',sha256:String(index+1).repeat(64)}
    return withinAncestors(descendAiPdmEvidenceContext(handle,ref,true),index+1,limit,callback)
  })
  const f=await partialFailedDailyNextSourceFixture(),h=f.h
  const inputRef=await h.put('partial-producer-depth-input',f.input),calls=h.calls.length
  const saved=await withinAncestors(createAiPdmEvidenceContext(),0,4,()=>executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader}))
  assert.ok(saved.refs.dailyBuildOnlyDescriptorRef,'complete producer includes published-association replay')
  assert.equal(h.objects.has(f.partialRoot+'.json'),false)
  assert.equal(h.objects.has(f.partialRoot+'-drain-finite.json'),false)
  assert.ok(!h.calls.slice(calls).some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'||row.url.endsWith(':resume')))
  const descriptor=(await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef)).value,reads=h.calls.length
  const artifact=await withinAncestors(createAiPdmEvidenceContext(),0,4,()=>resolveWorkerArtifact({transport:h.transport,descriptor,profile,readSource:f.reader}))
  assert.ok(artifact.failedDaily.failed.expectedExecutionNames.includes(f.partialName))
  assert.equal(h.calls.length,reads,'sealed consumer replay must not reread provider state')
  const bad=await partialFailedDailyNextSourceFixture(),b=bad.h,badInputRef=await b.put('partial-producer-ninth-input',bad.input),before=b.calls.length,puts=b.puts.length
  await assert.rejects(withinAncestors(createAiPdmEvidenceContext(),0,5,()=>executeWorkerArtifactReuse({transport:b.transport,inputRef:badInputRef,readSource:bad.reader})),{code:'DEV121_OWNER_RELEASE_PROOF_GRAPH_DEPTH_INVALID'})
  assert.ok(!b.puts.slice(puts).some(uri=>uri.endsWith('-association.json')||uri.endsWith('-descriptor-build-only.json')),'depth refusal cannot publish authority')
  assert.ok(!b.calls.slice(before).some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'||row.url.endsWith(':resume')))
})

test('partial FAILED DAILY producer reads each pinned receipt policy once per operation',async()=>{
  const f=await partialFailedDailyNextSourceFixture(),h=f.h,inputRef=await h.put('partial-receipt-memo-input',f.input)
  const nativeRead=h.transport.readJson,counts=new Map()
  h.transport.readJson=async(ref,bucket,prefixes)=>{const key=canonicalize([ref,bucket,prefixes]);counts.set(key,(counts.get(key)??0)+1);return nativeRead(ref,bucket,prefixes)}
  const before=h.calls.length,saved=await executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader})
  assert.ok(saved.refs.dailyBuildOnlyDescriptorRef)
  assert.equal(Math.max(...counts.values()),1,'repeated hash-pinned history retains validators while avoiding duplicate receipt reads')
  const requests=h.calls.slice(before)
  assert.ok(requests.filter(row=>row.url==='https://run.googleapis.com/v2/'+workerJobName()).length>=2,'live current Job observations stay fresh')
  assert.ok(!requests.some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'||row.url.endsWith(':resume')))
  counts.clear();const puts=h.puts.length,replayed=await executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader})
  assert.deepEqual(replayed.ref,saved.ref)
  assert.ok(counts.size>0,'a new operation must authenticate immutable history again')
  assert.equal(Math.max(...counts.values()),1)
  assert.ok(!h.puts.slice(puts).some(uri=>uri.endsWith('-association.json')))
})

test('worker pinned receipt bytes retain policy, copy isolation and observation ownership',async()=>{
  const bucket='jenfu-platform-prod-aipdm-release',prefixes=['receipts/dev-122/openswx-worker'],bytes=Buffer.from('{"field":"original"}\n')
  const ref={uri:'gs://'+bucket+'/'+prefixes[0]+'/LOCAL-MEMO.json',sha256:sha256(bytes)}
  let reads=0;const transport={readJson:async()=>{reads++;return {ref:{...ref},bytes:Buffer.from(bytes),value:JSON.parse(bytes),metadata:{generation:'17',crc32c:'AAAAAA=='}}},readBytes:async()=>{},request:async()=>{}}
  const memo=createWorkerReceiptReadTransport(transport),ctx=createAiPdmEvidenceContext()
  assert.equal(memo.readBytes,transport.readBytes);assert.equal(memo.request,transport.request)
  await runAiPdmEvidenceContext(ctx,async()=>{
    const a=await memo.readJson(ref,bucket,prefixes);a.bytes.fill(0);a.value.field='mutated';a.metadata.generation='99';a.ref.sha256='0'.repeat(64)
    const b=await memo.readJson(ref,bucket,prefixes)
    assert.ok(b.bytes.equals(bytes));assert.deepEqual(b.value,{field:'original'});assert.deepEqual(b.ref,ref);assert.equal(b.metadata.generation,'17');assert.equal(reads,1)
    await assert.rejects(memo.readJson(ref,bucket,['receipts/releases']),{code:'IMMUTABLE_REF_INVALID'})
    await assert.rejects(memo.readJson({...ref,sha256:'f'.repeat(64)},bucket,prefixes),{code:'DEV121_OWNER_RELEASE_PROOF_GRAPH_CYCLE_OR_HASH_CONFLICT'})
    const ancestor=descendAiPdmEvidenceContext(ctx,ref,true)
    await runAiPdmEvidenceContext(ancestor,async()=>{
      const child=descendAiPdmEvidenceContext(ancestor,{uri:'gs://'+bucket+'/'+prefixes[0]+'/LOCAL-MEMO-CHILD.json',sha256:'a'.repeat(64)})
      await runAiPdmEvidenceContext(child,()=>assert.rejects(memo.readJson(ref,bucket,prefixes),{code:'DEV121_OWNER_RELEASE_PROOF_GRAPH_CYCLE_OR_HASH_CONFLICT'}))
    })
    assert.equal(reads,1,'cached bytes never bypass policy/hash/ancestry refusal')
    const independentMemo=createWorkerReceiptReadTransport(transport)
    assert.deepEqual((await independentMemo.readJson(ref,bucket,prefixes)).value,{field:'original'})
    assert.equal(reads,2,'separate adapters cannot borrow each other metadata inside a shared root')
  })
  await assert.rejects(runAiPdmEvidenceContext(ctx,()=>memo.readJson(ref,bucket,prefixes)),{code:'DEV121_OWNER_RELEASE_PROOF_CONTEXT_INVALID'})
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(),()=>memo.readJson(ref,bucket,prefixes))
  assert.equal(reads,3,'closed observation cannot lend cached bytes to a new one')
})

test('worker pinned receipt memo rejects corrupt provider bytes and JSON without caching them',async()=>{
  const bucket='jenfu-platform-prod-aipdm-release',prefixes=['receipts/dev-122/openswx-worker'],bytes=Buffer.from('{"field":"original"}\n')
  const ref={uri:'gs://'+bucket+'/'+prefixes[0]+'/LOCAL-MEMO-CORRUPT.json',sha256:sha256(bytes)}
  for(const mode of ['bytes','json']){
    let reads=0;const memo=createWorkerReceiptReadTransport({readJson:async()=>{reads++;return {ref,bytes:mode==='bytes'&&reads===1?Buffer.from('{}'):bytes,value:mode==='json'&&reads===1?{}:JSON.parse(bytes)}}})
    await runAiPdmEvidenceContext(createAiPdmEvidenceContext(),async()=>{
      await assert.rejects(memo.readJson(ref,bucket,prefixes),{code:mode==='bytes'?'OPENSWX_REUSE_REF_HASH_INVALID':'OPENSWX_REUSE_REF_JSON_INVALID'})
      assert.deepEqual((await memo.readJson(ref,bucket,prefixes)).value,{field:'original'})
      assert.equal(reads,2,'a rejected receipt does not become memoized authority')
    })
  }
})


test('completed FAILED DAILY native selftest Job transfers to the next source without a provider mutation', async () => {
  const f = await completedFailedDailyNextSourceFixture(false), h = f.h
  const job = await h.transport.request('https://run.googleapis.com/v2/' + workerJobName())
  assert.deepEqual(normalizeWorkerTemplate(job.template), workerTemplate(profile, image, null, 'selftest'))
  const inputRef = await h.put('native-selftest-next-source-input', f.input), calls = h.calls.length
  const saved = await executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: f.reader })
  assert.ok(saved.refs.dailyBuildOnlyDescriptorRef)
  assert.ok(!h.calls.slice(calls).some(row => row.options.method === 'PATCH' || row.url.endsWith(':run')))
})

async function nativeCheckpointPauseFixture(name) {
  const f=await completedFailedDailyNextSourceFixture(), h=f.h
  const saved=await executeWorkerArtifactReuse({transport:h.transport,inputRef:await h.put(name+'-reuse-input',f.input),readSource:f.reader})
  const root=profile.receiptRoot+'/'+name
  const pauseInput={schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,
    deadlineAt:deadline(),receiptId:name,drainKind:'DAILY_DB_VERIFIED',priorActivationRef:f.input.priorActivationRef,failedDailyContinuation:f.failedDailyContinuation}
  const pauseRef=h.seed(name+'-input',pauseInput), runPause=()=>executeOpenSwxBootstrap({stage:'pause',inputRef:pauseRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  return {...f,h,saved,root,pauseRef,pauseInput,runPause}
}

test('completed checkpoint restore and fresh drain preserve lost responses and replay without another PATCH or run',async()=>{
  const f=await nativeCheckpointPauseFixture('CHECKPOINT-RESTORE-REPLAY'),h=f.h,request=h.transport.request,put=h.transport.putJson
  let lostPatch=true; const lostObjects=new Set([f.root+'-checkpoint-restore-request.json',f.root+'-checkpoint-restored.json'])
  h.transport.request=async(url,opts={})=>{const value=await request(url,opts); if(lostPatch&&opts.method==='PATCH'){lostPatch=false;throw Error('LOCAL_LOST_PATCH_RESPONSE')} return value}
  h.transport.putJson=async(uri,value,opts)=>{const row=await put(uri,value,opts);if(lostObjects.delete(uri))throw Object.assign(Error('LOCAL_LOST_RECEIPT_RESPONSE'),{code:'OUTCOME_UNKNOWN'});return row}
  const before=h.calls.length,paused=await f.runPause()
  assert.equal(lostObjects.size,0); assert.equal(lostPatch,false)
  assert.equal(h.calls.slice(before).filter(row=>row.options.method==='PATCH').length,1)
  assert.equal(h.calls.slice(before).filter(row=>row.url.endsWith(':run')).length,1)
  assert.ok(paused.value.facts.completedCheckpointRestoreRef)
  const restoredRow=await h.transport.readJson(paused.value.facts.completedCheckpointRestoreRef), restoreRequest=(await h.transport.readJson(restoredRow.value.requestRef)).value
  const baseline=(await h.transport.readJson(f.saved.value.resourceAssociation.readbackRef)).value
  assert.deepEqual(restoreRequest.completedCheckpointRef,f.input.completedFailedDailyCheckpointRef)
  assert.deepEqual(restoreRequest.workerBuildRef,f.saved.ref);assert.deepEqual(restoreRequest.inputRef,f.pauseRef)
  assert.equal(restoreRequest.beforeEtag,baseline.snapshot.jobEtag);assert.equal(restoreRequest.beforeGeneration,baseline.snapshot.jobGeneration)
  assert.equal(restoreRequest.sourceRevision,f.saved.value.sourceRevision)
  assert.deepEqual(restoredRow.value.providerJob.etag,paused.value.facts.providerJob.etag)
  const replay=h.calls.length; assert.deepEqual((await f.runPause()).ref,paused.ref)
  assert.ok(!h.calls.slice(replay).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
  const bootstrapRef=h.seed('CHECKPOINT-RESTORE-BOOTSTRAP-input',{schemaVersion:'aipdm.openswx-bootstrap-input.v1',descriptorRef:f.saved.refs.dailyBuildOnlyDescriptorRef,
    workerBuildRef:f.saved.ref,deadlineAt:deadline(),receiptId:'CHECKPOINT-RESTORE-BOOTSTRAP',bootstrapKind:'DAILY_REFRESH',priorActivationRef:f.input.priorActivationRef,pausedDrainedRef:paused.ref,failedDailyContinuation:f.failedDailyContinuation})
  const run=()=>executeOpenSwxBootstrap({stage:'bootstrap',inputRef:bootstrapRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  const bootstrapCalls=h.calls.length,completed=await run()
  assert.equal(h.calls.slice(bootstrapCalls).filter(row=>row.options.method==='PATCH').length,1)
  assert.equal(h.calls.slice(bootstrapCalls).filter(row=>row.url.endsWith(':run')).length,0)
  const again=h.calls.length;assert.deepEqual((await run()).ref,completed.ref)
  assert.ok(!h.calls.slice(again).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
  const full=(await h.transport.readJson(completed.refs.fullDescriptorRef)).value,historical=h.calls.length
  await readWorkerFullEvidence(h.transport,full,profile,f.reader);assert.equal(h.calls.length,historical)
  const pristineRestored=(await h.transport.readJson(paused.value.facts.completedCheckpointRestoreRef)).value, pristineBootstrap=(await h.transport.readJson(completed.ref)).value
  for(const kind of ['checkpoint-ref','before-etag','source','extra-key','late-restored','provider-generation']) {
    const restored=structuredClone(pristineRestored)
    if(kind==='checkpoint-ref') restored.completedCheckpointRef=f.h.fullRef
    if(kind==='before-etag') restored.beforeEtag='unbound-etag'
    if(kind==='source') restored.sourceRevision='0'.repeat(40)
    if(kind==='extra-key') restored.extra=true
    if(kind==='late-restored') restored.observedAt=new Date(Date.parse(paused.value.facts.quiescenceCompletedAt)+1).toISOString()
    if(kind==='provider-generation') restored.providerJob.generation='99'
    const ref=h.seedBytes(paused.value.facts.completedCheckpointRestoreRef.uri,Buffer.from(canonicalize(restored)))
    const poisonedPause={...paused.value,facts:{...paused.value.facts,completedCheckpointRestoreRef:ref}}
    const pausedRef=h.seedBytes(paused.ref.uri,Buffer.from(canonicalize(poisonedPause)))
    const bootstrap=structuredClone(pristineBootstrap)
    bootstrap.facts.pausedDrainedRef=pausedRef
    const bootstrapRef=h.seedBytes(completed.ref.uri,Buffer.from(canonicalize(bootstrap)))
    const calls=h.calls.length,puts=h.puts.length
    await assert.rejects(readWorkerFullEvidence(h.transport,{...full,pausedDrainedRef:pausedRef,bootstrapRef},profile,f.reader),undefined,kind)
    assert.equal(h.calls.length,calls);assert.equal(h.puts.length,puts)
    h.seedBytes(paused.value.facts.completedCheckpointRestoreRef.uri,Buffer.from(canonicalize(pristineRestored)))
    h.seedBytes(paused.ref.uri,Buffer.from(canonicalize(paused.value)))
    h.seedBytes(completed.ref.uri,Buffer.from(canonicalize(pristineBootstrap)))
  }
})

test('completed checkpoint restore durable request refuses an unconfirmed PATCH without resubmission',async()=>{
  const f=await nativeCheckpointPauseFixture('CHECKPOINT-RESTORE-UNKNOWN'),h=f.h,request=h.transport.request
  let patches=0
  h.transport.request=async(url,opts={})=>{if(opts.method==='PATCH'){patches++;throw Error('LOCAL_PATCH_NOT_CONFIRMED')}return request(url,opts)}
  await assert.rejects(f.runPause(),{code:'OPENSWX_JOB_UPDATE_OUTCOME_UNKNOWN'})
  assert.equal(patches,1);assert.ok(h.objects.has(f.root+'-checkpoint-restore-request.json'));assert.equal(h.objects.has(f.root+'-checkpoint-restored.json'),false)
  const calls=h.calls.length,puts=h.puts.length
  await assert.rejects(f.runPause(),{code:'OPENSWX_JOB_READBACK_MISMATCH'})
  assert.equal(patches,1);assert.equal(h.puts.length,puts);assert.ok(!h.calls.slice(calls).some(row=>row.url.endsWith(':run')))
})

test('completed checkpoint live mode rejects normal or drifted resources before publication and restoration',async()=>{
  const f=await completedFailedDailyNextSourceFixture(),h=f.h,inputRef=await h.put('checkpoint-live-negative-input',f.input),request=h.transport.request
  for(const kind of ['normal','third-template','job-generation','job-etag-drift','labels','scheduler','secret']) {
    h.controls.job={};h.controls.scheduler={};h.controls.secretState='ENABLED';h.controls.jobDrift=false;h.transport.request=request
    if(kind==='normal') h.controls.job={template:workerTemplate(profile,image,token)}
    if(kind==='third-template') {const template=workerTemplate(profile,image,null,'selftest');template.template.containers[0].args=['unreviewed'];h.controls.job={template}}
    if(kind==='job-generation') h.controls.job={generation:'99'}
    if(kind==='job-etag-drift') {let reads=0;h.transport.request=async(url,opts={})=>{const body=await request(url,opts);if(url==='https://run.googleapis.com/v2/'+workerJobName()&&++reads>1)body.etag+='-drift';return body}}
    if(kind==='labels') h.controls.job={labels:{foreign:'change'}}
    if(kind==='scheduler') h.controls.scheduler={state:'ENABLED'}
    if(kind==='secret') h.controls.secretState='DISABLED'
    const calls=h.calls.length,puts=h.puts.length
    await assert.rejects(executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader}),undefined,kind)
    assert.equal(h.puts.length,puts);assert.ok(!h.calls.slice(calls).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
  }
})

test('legacy failed daily v1 sealed normal proof stays historical and uses no live provider calls',async()=>{
  const f=await failedDailyFixture(),h=f.h,saved=await f.reuse()
  const value=(await h.transport.readJson(saved.value.resourceAssociation.readbackRef)).value
  value.schemaVersion='aipdm.openswx-failed-daily-resource-readback.v1';delete value.currentTemplateSha256
  const readbackRef=h.seed('legacy-failed-v1-proof',value),associationRef=h.seed('legacy-failed-v1-association',{...saved.value,resourceAssociation:{...saved.value.resourceAssociation,readbackRef}})
  const descriptor=(await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef)).value,calls=h.calls.length,puts=h.puts.length
  const artifact=await resolveWorkerArtifact({transport:h.transport,descriptor:{...descriptor,workerBuildRef:associationRef},profile,readSource:f.reader})
  assert.equal(artifact.failedDaily.failed.currentTemplateMode,'NORMAL');assert.equal(h.calls.length,calls);assert.equal(h.puts.length,puts)
})

test('native bootstrap memo authenticates pinned bytes once while mutable observations remain fresh',async()=>{
  const f=await nativeCheckpointPauseFixture('BOOTSTRAP-RECEIPT-MEMO'),h=f.h,nativeRead=h.transport.readJson,counts=new Map()
  h.transport.readJson=async(ref,bucket,prefixes)=>{const key=canonicalize([ref,bucket,prefixes]);counts.set(key,(counts.get(key)??0)+1);return nativeRead(ref,bucket,prefixes)}
  const before=h.calls.length,paused=await f.runPause()
  assert.ok(paused.value.facts.dbAdmissionProof)
  assert.equal(Math.max(...counts.values()),1,'native bootstrap installs the existing opaque-observation pinned receipt memo')
  assert.ok(h.calls.slice(before).filter(row=>row.url==='https://run.googleapis.com/v2/'+workerJobName()).length>=2,'live Job reads still occur before and after restoration')
  counts.clear();const again=h.calls.length,replayed=await f.runPause()
  assert.deepEqual(replayed.ref,paused.ref)
  assert.ok(counts.size>0,'a new operation reauthenticates immutable history')
  assert.equal(Math.max(...counts.values()),1)
  assert.ok(!h.calls.slice(again).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
})

async function restoredOnlyFailedDailyNextSourceFixture({expire=true}={}) {
  const f=await nativeCheckpointPauseFixture('RESTORE-ONLY-OLD-PAUSE'),h=f.h,original=h.transport.request
  syntheticClock.hold()
  const oldDeadline=new Date(Date.now()+3000).toISOString(),partialInput={...f.pauseInput,deadlineAt:oldDeadline}
  const partialInputRef=h.seedBytes(f.pauseRef.uri,Buffer.from(canonicalize(partialInput)+'\n'))
  h.transport.request=async(url,opts={})=>{
    if(h.objects.has(f.root+'-checkpoint-restored.json'))throw Object.assign(Error('LOCAL_STOP_AFTER_SEALED_RESTORE'),{code:'LOCAL_STOP_AFTER_SEALED_RESTORE'})
    return original(url,opts)
  }
  const before=h.calls.length
  await assert.rejects(executeOpenSwxBootstrap({stage:'pause',inputRef:partialInputRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}}),{code:'LOCAL_STOP_AFTER_SEALED_RESTORE'})
  h.transport.request=original
  assert.equal(h.calls.slice(before).filter(row=>row.options.method==='PATCH').length,1)
  assert.equal(h.calls.slice(before).filter(row=>row.url.endsWith(':run')).length,0)
  assert.ok(h.objects.has(f.root+'-checkpoint-restore-request.json'));assert.ok(h.objects.has(f.root+'-checkpoint-restored.json'))
  assert.equal(h.objects.has(f.root+'-drain-finite-request.json'),false);assert.equal(h.objects.has(f.root+'-drain-finite-operation.json'),false)
  const next=h.nextAttempt(84,f.input.priorActivationRef),lock={...next.lock,observedAt:new Date(Date.now()-2000).toISOString()}
  next.input.sourceLockRef=h.seedBytes('gs://jenfu-platform-prod-aipdm-release/receipts/releases/'+lock.releaseId+'/source-lock.json',Buffer.from(canonicalize(lock)+'\n'))
  const metadata=await seedSecretVersionIamContinuation(h,{sourceRevision:next.lock.sourceRevision,sourceLockRef:next.input.sourceLockRef,supplementalIamReadbackRef:h.iam.receiptRef,prebuildIamContinuationRef:h.proof.continuationRef,reader:f.reader,name:'restore-only-next-metadata',secretPolicies:h.metadata.before.secretPolicies})
  const input={...next.input,failedDailyContinuation:f.failedDailyContinuation,secretVersionIamContinuationRef:metadata.continuationRef,completedFailedDailyCheckpointRef:f.completed.refs.fullDescriptorRef,partialFailedDailyPauseInputRef:partialInputRef}
  if(expire) syntheticClock.expireAfter(oldDeadline)
  return {...f,h,input,partialInputRef,partialInput,partialRoot:f.root,oldDeadline}
}

test('restore-only expired partial pause carries sealed normal restoration and still requires a fresh drain',async()=>{
  const f=await restoredOnlyFailedDailyNextSourceFixture(),h=f.h,inputRef=await h.put('restore-only-next-reuse-input',f.input),calls=h.calls.length
  const saved=await executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader})
  assert.ok(saved.refs.dailyBuildOnlyDescriptorRef)
  assert.ok(!h.calls.slice(calls).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
  const descriptor=(await h.transport.readJson(saved.refs.dailyBuildOnlyDescriptorRef)).value,historicalCalls=h.calls.length
  const historical=await resolveWorkerArtifact({transport:h.transport,descriptor,profile,readSource:f.reader})
  assert.equal(historical.failedDaily.failed.currentTemplateMode,'NORMAL')
  assert.ok(historical.failedDaily.failed.currentJobRestoration)
  assert.equal(historical.failedDaily.failed.partialPause,undefined,'restoration is not a drain operation or DB admission')
  assert.equal(h.calls.length,historicalCalls,'sealed consumer uses no mutable provider requests')
  const pauseRef=h.seed('RESTORE-ONLY-NEXT-PAUSE-input',{schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:deadline(),receiptId:'RESTORE-ONLY-NEXT-PAUSE',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:f.input.priorActivationRef,failedDailyContinuation:f.failedDailyContinuation})
  const runPause=()=>executeOpenSwxBootstrap({stage:'pause',inputRef:pauseRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  const pauseCalls=h.calls.length,paused=await runPause()
  assert.equal(h.calls.slice(pauseCalls).filter(row=>row.options.method==='PATCH').length,0,'a sealed normal restore is not repeated')
  assert.equal(h.calls.slice(pauseCalls).filter(row=>row.url.endsWith(':run')).length,1,'new pause needs its own normal drain')
  assert.equal(paused.value.facts.completedCheckpointRestoreRef,undefined)
  const replayCalls=h.calls.length;assert.deepEqual((await runPause()).ref,paused.ref)
  assert.ok(!h.calls.slice(replayCalls).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
  const bootstrapRef=h.seed('RESTORE-ONLY-NEXT-BOOTSTRAP-input',{schemaVersion:'aipdm.openswx-bootstrap-input.v1',descriptorRef:saved.refs.dailyBuildOnlyDescriptorRef,workerBuildRef:saved.ref,deadlineAt:deadline(),receiptId:'RESTORE-ONLY-NEXT-BOOTSTRAP',bootstrapKind:'DAILY_REFRESH',priorActivationRef:f.input.priorActivationRef,pausedDrainedRef:paused.ref,failedDailyContinuation:f.failedDailyContinuation})
  const bootstrapCalls=h.calls.length,completed=await executeOpenSwxBootstrap({stage:'bootstrap',inputRef:bootstrapRef,transport:h.transport,readSource:f.reader,appProfile,sleep:async()=>{}})
  assert.equal(h.calls.slice(bootstrapCalls).filter(row=>row.options.method==='PATCH').length,1)
  assert.equal(h.calls.slice(bootstrapCalls).filter(row=>row.url.endsWith(':run')).length,0)
  const full=(await h.transport.readJson(completed.refs.fullDescriptorRef)).value,fullCalls=h.calls.length
  await readWorkerFullEvidence(h.transport,full,profile,f.reader);assert.equal(h.calls.length,fullCalls)
})

test('restore-only partial pause rejects incomplete, unbound or drifted restoration before authority publication',async()=>{
  const f=await restoredOnlyFailedDailyNextSourceFixture(),h=f.h,objects=new Map(h.objects)
  const restoredUri=f.partialRoot+'-checkpoint-restored.json',requestUri=f.partialRoot+'-checkpoint-restore-request.json'
  const pristineRestored=JSON.parse(objects.get(restoredUri).bytes),pristineRequest=JSON.parse(objects.get(requestUri).bytes)
  for(const kind of ['missing-request','missing-restored','wrong-request-ref','wrong-actor','wrong-source','wrong-checkpoint','before-etag','before-generation','late-request','late-restored','half-drain-request','half-drain-latch','completed-pause','completed-terminal','live-etag','live-generation','live-template','provider-generation','extra-restore-key']) {
    h.objects.clear();for(const [uri,row] of objects)h.objects.set(uri,row)
    h.controls.job={};const restored=structuredClone(pristineRestored),request=structuredClone(pristineRequest)
    if(kind==='missing-request')h.objects.delete(requestUri)
    if(kind==='missing-restored')h.objects.delete(restoredUri)
    if(kind==='wrong-request-ref')restored.requestRef={...restored.requestRef,sha256:'0'.repeat(64)}
    if(kind==='wrong-actor'){request.actor='foreign@example.invalid';restored.actor=request.actor}
    if(kind==='wrong-source'){request.sourceRevision='0'.repeat(40);restored.sourceRevision=request.sourceRevision}
    if(kind==='wrong-checkpoint'){request.completedCheckpointRef=f.h.fullRef;restored.completedCheckpointRef=request.completedCheckpointRef}
    if(kind==='before-etag'){request.beforeEtag='unbound-before-etag';restored.beforeEtag=request.beforeEtag}
    if(kind==='before-generation'){request.beforeGeneration='99';restored.beforeGeneration=request.beforeGeneration}
    if(kind==='late-request')request.requestedAt=new Date(Date.parse(f.oldDeadline)+1).toISOString()
    if(kind==='late-restored')restored.observedAt=new Date(Date.parse(f.oldDeadline)+1).toISOString()
    if(kind==='half-drain-request')h.seedBytes(f.partialRoot+'-drain-finite-request.json',Buffer.from('{}'))
    if(kind==='half-drain-latch')h.seedBytes(f.partialRoot+'-drain-finite-operation.json',Buffer.from('{}'))
    if(kind==='completed-pause')h.seedBytes(f.partialRoot+'.json',Buffer.from('{}'))
    if(kind==='completed-terminal')h.seedBytes(f.partialRoot+'-drain-finite.json',Buffer.from('{}'))
    if(kind==='live-etag')h.controls.job={etag:'unbound-current-etag'}
    if(kind==='live-generation')h.controls.job={generation:'99'}
    if(kind==='live-template')h.controls.job={template:workerTemplate(profile,image,null,'selftest')}
    if(kind==='provider-generation')restored.providerJob.generation='99'
    if(kind==='extra-restore-key')restored.extra=true
    if(['wrong-actor','wrong-source','wrong-checkpoint','before-etag','before-generation','late-request'].includes(kind))restored.requestRef=h.seedBytes(requestUri,Buffer.from(canonicalize(request)))
    if(!['missing-request','missing-restored','half-drain-request','half-drain-latch','completed-pause','completed-terminal','live-etag','live-generation','live-template'].includes(kind))h.seedBytes(restoredUri,Buffer.from(canonicalize(restored)))
    const inputRef=h.seed('restore-only-negative-reuse-input',f.input),calls=h.calls.length,puts=h.puts.length
    await assert.rejects(executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader}),undefined,kind)
    assert.equal(h.puts.length,puts,kind+' publishes no authority')
    assert.ok(!h.calls.slice(calls).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')),kind+' mutates no lifecycle')
  }
})

test('restore-only partial pause refuses a still-live old writer without extending its deadline',async()=>{
  const f=await restoredOnlyFailedDailyNextSourceFixture({expire:false}),h=f.h,inputRef=h.seed('restore-only-unexpired-reuse-input',f.input),calls=h.calls.length,puts=h.puts.length
  try {
    assert.ok(Date.now()<Date.parse(f.oldDeadline))
    await assert.rejects(executeWorkerArtifactReuse({transport:h.transport,inputRef,readSource:f.reader}),{code:'OPENSWX_PARTIAL_DAILY_JOIN_INVALID'})
    assert.equal(h.puts.length,puts)
    assert.ok(!h.calls.slice(calls).some(row=>row.options.method==='PATCH'||row.url.endsWith(':run')))
  } finally {syntheticClock.expireAfter(f.oldDeadline)}
})

test('native history basis closed inputs and DAILY descriptor preserve explicit schema/ref boundaries',async()=>{
  syntheticClock.hold()
  const h=await harness(),workerRef=name=>({uri:profile.receiptRoot+'/'+name+'.json',sha256:'a'.repeat(64)})
  const input={schemaVersion:'aipdm.openswx-history-basis-input.v1',receiptId:'HISTORY-CLOSED-INPUT',sourceLockRef:h.sourceLockRef,currentSourceObjectRef:h.currentSourceRef,deadlineAt:deadline(),
    predecessorInputRef:workerRef('input'),predecessorRequestRef:workerRef('request'),predecessorResourceReadbackRef:workerRef('resource'),predecessorCurrentManifestRef:workerRef('manifest'),predecessorSecurityReadbackRef:workerRef('security')}
  assertOpenSwxHistoryBasisInput(input)
  for(const mutate of [row=>row.validator='caller-validator',row=>row.facts={status:'PASS'},row=>row.context={},row=>row.target='other-project',row=>row.receiptId='../unsafe',
    row=>row.deadlineAt=new Date(Date.now()+600001).toISOString(),row=>row.deadlineAt=new Date(Date.now()-1).toISOString(),row=>delete row.predecessorRequestRef,
    row=>row.predecessorInputRef={...workerRef('input'),extra:true},row=>row.predecessorInputRef.uri=workerRef('input').uri+'?x=1']){
    const value=structuredClone(input);mutate(value);assert.throws(()=>assertOpenSwxHistoryBasisInput(value))
  }
  const association={sourceRevision:currentRevision,sourceArchiveSha256:h.currentSourceRef.sha256,workerProfileSha256:sha256(profileBytes),resourcePlanHash:h.full.resourcePlanHash,historyBasisRef:workerRef('basis')}
  const descriptor=buildDailyReuseWorkerDescriptor({profile,artifact:{failedDaily:{},origin:{prior:{descriptor:h.full}},currentAssociation:association,associationRef:workerRef('association')}})
  assert.equal(descriptor.schemaVersion,'aipdm.openswx-worker-descriptor.v4');assert.deepEqual(descriptor.historyBasisRef,association.historyBasisRef)
  for(const mutate of [row=>delete row.historyBasisRef,row=>row.schemaVersion='aipdm.openswx-worker-descriptor.v2',row=>row.releaseVariant='PAUSED_APP_REPAIR']){
    const changed=structuredClone(descriptor);mutate(changed);assert.throws(()=>assertWorkerDescriptor(changed,profile,changed.workerProfileSha256,changed.sourceRevision))
  }
})
test('native history basis full join refuses downgraded NORMAL pause before historical admission',async()=>{
  const h=await harness(),historyBasisRef=h.seed('history-normal-basis',{}),descriptor={...h.full,schemaVersion:'aipdm.openswx-worker-descriptor.v4',historyBasisRef}
  const continuation={bootstrapInputRef:h.inputRef,recoveryRequiredRef:h.fullRef,priorRecoveryRef:h.fullRef}
  const artifact={input:{priorActivationRef:h.priorActivationRef,failedDailyContinuation:continuation},failedDaily:{failed:{currentTemplateMode:'NORMAL'}}}
  const pause={schemaVersion:'aipdm.openswx-pause-input.v2',historyBasisRef,descriptorRef:h.fullRef,workerBuildRef:descriptor.workerBuildRef,
    deadlineAt:deadline(),receiptId:'HISTORY-NORMAL-PAUSE',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:h.priorActivationRef,failedDailyContinuation:continuation}
  for(const mutate of [row=>{delete row.historyBasisRef;row.schemaVersion='aipdm.openswx-pause-input.v1'},row=>delete row.historyBasisRef,
    row=>row.extra='unverified',row=>row.historyBasisRef={...historyBasisRef,sha256:'0'.repeat(64)}]){
    const input=structuredClone(pause);mutate(input);const ref=h.seed('history-normal-downgrade-'+h.puts.length,input)
    await assert.rejects(runAiPdmEvidenceContext(createAiPdmEvidenceContext(),()=>assertFailedDailyFullJoin({transport:h.transport,profile,artifact,descriptor,
      paused:{previousRefs:[ref,descriptor.workerBuildRef]},bootstrap:{},preflight:{}})),{code:'OPENSWX_FAILED_DAILY_JOIN_INVALID'})
  }
  noMutation(h)
})

test('native history NORMAL full join dereferences and binds the pause descriptor', async () => {
  const h=await harness(),descriptor={...h.full,schemaVersion:'aipdm.openswx-worker-descriptor.v2',artifactMode:'REUSE_VERIFIED'}
  const continuation={bootstrapInputRef:h.inputRef,recoveryRequiredRef:h.fullRef,priorRecoveryRef:h.fullRef}
  const artifact={input:{priorActivationRef:h.priorActivationRef,failedDailyContinuation:continuation},failedDaily:{failed:{currentTemplateMode:'NORMAL'}}}
  const raw={...descriptor,purpose:'build_only'}
  for(const key of ['bootstrapRef','cloudPreflightRef','pausedDrainedRef','tokenSecretVersion','registrySecretVersion'])delete raw[key]
  const originalRead=h.transport.readJson
  for(const kind of ['full-purpose','wrong-source','wrong-archive','wrong-build','orphaned-basis','malformed']) {
    const value=structuredClone(raw)
    if(kind==='full-purpose')Object.assign(value,descriptor)
    if(kind==='wrong-source')value.sourceRevision='0'.repeat(40)
    if(kind==='wrong-archive')value.sourceArchiveSha256='0'.repeat(64)
    if(kind==='wrong-build')value.workerBuildRef=h.fullRef
    if(kind==='orphaned-basis')value.historyBasisRef=h.fullRef
    if(kind==='malformed')value.extra='caller-PASS'
    const descriptorRef=h.seed('history-normal-alias-'+kind,value),inputRef=h.seed('history-normal-input-'+kind,{schemaVersion:'aipdm.openswx-pause-input.v1',descriptorRef,workerBuildRef:descriptor.workerBuildRef,
      deadlineAt:deadline(),receiptId:'HISTORY-NORMAL-ALIAS',drainKind:'DAILY_DB_VERIFIED',priorActivationRef:h.priorActivationRef,failedDailyContinuation:continuation})
    const reads=[];h.transport.readJson=async ref=>{reads.push(ref);return originalRead(ref)}
    await assert.rejects(assertFailedDailyFullJoin({transport:h.transport,profile,artifact,descriptor,paused:{previousRefs:[inputRef,descriptor.workerBuildRef]},bootstrap:{},preflight:{}}),/OPENSWX_(?:DESCRIPTOR|FAILED_DAILY_JOIN)_INVALID/u,kind)
    assert.deepEqual(reads,[inputRef,descriptorRef],kind+' must authenticate exact pinned descriptor before any later evidence')
  }
  h.transport.readJson=originalRead;noMutation(h)
})

test('native history qualification refuses generic and checkpoint basis ingress while the outer closure is active', async () => {
  const f = await partialFailedDailyNextSourceFixture(), h = f.h
  const inputRef = await h.put('history-active-input', f.input)
  const basisRef = h.sourceLockRef
  const descriptor = { schemaVersion: 'aipdm.openswx-worker-descriptor.v4', purpose: 'full', artifactMode: 'REUSE_VERIFIED',
    sourceRevision: currentRevision, historyBasisRef: basisRef }
  const descriptorBytes = Buffer.from(canonicalize(descriptor)), checkpointRef = {
    uri: profile.receiptRoot + '/history-active-checkpoint.json', sha256: sha256(descriptorBytes)
  }
  const nestedReads = [], basisReads = [], guardedTransport = {
    readJson: async () => { basisReads.push(true); throw Error('BASIS_READ_FORBIDDEN') },
    readJsonForNestedCheckpointDescriptor: async () => { nestedReads.push(true); return { bytes: descriptorBytes } },
  }
  const handle = createAiPdmEvidenceContext(), originalRead = h.transport.readJson
  let guarded = false
  const wrappedTransport = { ...h.transport, readJson: async (...args) => {
    if (!guarded) {
      guarded = true
      await assert.rejects(ensureAiPdmNativeHistoryBasis({ basisRef, transport: guardedTransport, readSource: f.reader,
        sourceRevision: currentRevision }), { code: 'DEV121_OWNER_RELEASE_PROOF_HISTORY_BASIS_RECURSION' })
      const child = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), checkpointRef, true)
      await assert.rejects(runAiPdmEvidenceContext(child, () => ensureAiPdmNestedCheckpointHistoryBasis({
        checkpointRef, checkpointDescriptor: descriptor, basisRef, transport: guardedTransport,
        readSource: f.reader, sourceRevision: currentRevision,
      })), { code: 'DEV121_OWNER_RELEASE_PROOF_HISTORY_BASIS_RECURSION' })
    }
    return originalRead(...args)
  } }
  try {
    await assert.rejects(runAiPdmEvidenceContext(handle, () => deriveAiPdmNativeHistoryBasis({ inputRef,
      transport: wrappedTransport, readSource: f.reader })))
  } finally { wrappedTransport.readJson = originalRead }
  assert.equal(guarded, true, 'history basis replay reached its first pinned input read')
  assert.deepEqual(nestedReads, [true], 'checkpoint descriptor is the final allowed read before recursion refusal')
  assert.deepEqual(basisReads, [], 'recursive qualification never reads a Q4 basis or association')
})

test('native history basis refuses caller capability, alias, forged facts, active writer, recursive basis and executable drift',async()=>{
  const f=await partialFailedDailyNextSourceFixture(),h=f.h,predecessorRef=await h.put('history-negative-predecessor',f.input)
  await executeWorkerArtifactReuse({transport:h.transport,inputRef:predecessorRef,readSource:f.reader})
  syntheticClock.hold();syntheticClock.expireAfter(f.input.deadlineAt)
  const issuer=historyIssuerFixture(h,f.reader,f.input,predecessorRef),inputRef=await h.put('history-negative-qualification',issuer.input)
  const basis=await executeOpenSwxHistoryBasis({transport:h.transport,inputRef,readSource:issuer.reader}),basisObject=h.objects.get(basis.ref.uri)
  const getProjection=bindings=>readAiPdmQualifiedHistoryProjection({basisRef:basis.ref,kind:'checkpoint',frontierRef:f.input.completedFailedDailyCheckpointRef,bindings})
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(),async()=>{
    assert.throws(()=>getProjection({capability:'caller-PASS'}),/HISTORY_BASIS_CAPABILITY_MISSING/u)
    const child=descendAiPdmEvidenceContext(createAiPdmEvidenceContext(),h.seed('history-negative-nested',{}))
    await runAiPdmEvidenceContext(child,async()=>{
      await assert.rejects(ensureAiPdmNativeHistoryBasis({basisRef:basis.ref,sourceRevision:issuer.revision,readSource:()=>{throw Error('FORBIDDEN_READ')},transport:{}}),/HISTORY_BASIS_ISSUER_INVALID/u)
    })
  })
  const handle=createAiPdmEvidenceContext()
  await runAiPdmEvidenceContext(handle,async()=>{
    const bindings=await qualifyAiPdmNativeHistoryBasis({ref:basis.ref,transport:h.transport,readSource:issuer.reader})
    const projection=getProjection(bindings),expected=[...projection.expectedExecutionNames]
    projection.expectedExecutionNames.push('forged');assert.deepEqual(getProjection(bindings).expectedExecutionNames,expected)
    assert.throws(()=>recordAiPdmHistoryObject({ref:issuer.currentSourceObjectRef,metadata:{generation:'999999999999'}}),/HISTORY_CLOSURE_CONFLICT/u)
    assert.throws(()=>getProjection({...bindings,image:'forged'}),/HISTORY_BASIS_FRONTIER_INVALID/u)
    const child=descendAiPdmEvidenceContext(handle,issuer.input.predecessorInputRef)
    await runAiPdmEvidenceContext(child,async()=>assert.throws(()=>getProjection(bindings),/GRAPH_CYCLE_OR_HASH_CONFLICT/u))
    assert.throws(()=>descendAiPdmEvidenceContext(handle,{...issuer.input.predecessorInputRef,sha256:'0'.repeat(64)}),/GRAPH_CYCLE_OR_HASH_CONFLICT/u)
  })
  await assert.rejects(runAiPdmEvidenceContext(handle,()=>getProjection({})),/CONTEXT_INVALID/u)
  const alias=h.seed('history-negative-alias',basis.value)
  await assert.rejects(runAiPdmEvidenceContext(createAiPdmEvidenceContext(),()=>qualifyAiPdmNativeHistoryBasis({ref:alias,transport:h.transport,readSource:issuer.reader})),/HISTORY_BASIS_JOIN_INVALID/u)
  for(const field of ['historicalFactsSha256','semanticClosureSha256','qualifierSourceTreeSha256']){
    const poisoned=h.seedBytes(basis.ref.uri,Buffer.from(canonicalize({...basis.value,[field]:'0'.repeat(64)})))
    await assert.rejects(runAiPdmEvidenceContext(createAiPdmEvidenceContext(),()=>qualifyAiPdmNativeHistoryBasis({ref:poisoned,transport:h.transport,readSource:issuer.reader})),/HISTORY_BASIS_JOIN_INVALID/u)
    h.objects.set(basis.ref.uri,basisObject)
  }
  for(const kind of ['active-writer','recursive-basis','executable']){
    const input={...issuer.input,receiptId:'HISTORY-NEGATIVE-'+kind.toUpperCase()}
    let reader=issuer.reader
    if(kind==='active-writer')input.predecessorInputRef=await h.put('history-negative-active',{...f.input,deadlineAt:deadline()})
    if(kind==='recursive-basis')input.predecessorInputRef=await h.put('history-negative-recursive',{...f.input,schemaVersion:'aipdm.openswx-worker-reuse-input.v3',historyBasisRef:basis.ref})
    if(kind==='executable'){
      reader=(name,revision)=>name==='scripts/lib/dev121-owner-release-proof.mjs'&&revision===issuer.revision?Buffer.concat([issuer.reader(name,revision),Buffer.from('\nchanged executable\n')]):issuer.reader(name,revision)
      Object.assign(reader,issuer.reader)
    }
    const ref=await h.put('history-negative-input-'+kind,input),puts=h.puts.length,calls=h.calls.length
    await assert.rejects(executeOpenSwxHistoryBasis({transport:h.transport,inputRef:ref,readSource:reader}),{code:kind==='active-writer'?'OPENSWX_HISTORY_PREDECESSOR_INVALID':kind==='recursive-basis'?'DEV121_OWNER_RELEASE_PROOF_HISTORY_BASIS_RECURSION':'OPENSWX_HISTORY_EXECUTABLE_INVALID'},kind)
    assert.equal(h.puts.length,puts,kind+' cannot publish a basis/association')
    assert.ok(!h.calls.slice(calls).some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'||row.url.endsWith(':resume')))
  }
  const current={...f.input,schemaVersion:'aipdm.openswx-worker-reuse-input.v3',historyBasisRef:basis.ref,receiptId:'HISTORY-NEGATIVE-CURRENT',
    sourceLockRef:issuer.sourceLockRef,currentSourceObjectRef:issuer.currentSourceObjectRef,deadlineAt:deadline()}
  const metadata=await seedSecretVersionIamContinuation(h,{sourceRevision:issuer.revision,sourceLockRef:issuer.sourceLockRef,
    supplementalIamReadbackRef:h.iam.receiptRef,prebuildIamContinuationRef:h.proof.continuationRef,reader:issuer.reader,
    name:'history-negative-current-metadata',secretPolicies:h.metadata.before.secretPolicies})
  current.secretVersionIamContinuationRef=metadata.continuationRef
  const currentRef=await h.put('history-negative-current-input',current),puts=h.puts.length,calls=h.calls.length
  h.controls.secretState='DISABLED'
  try { await assert.rejects(executeWorkerArtifactReuse({transport:h.transport,inputRef:currentRef,readSource:issuer.reader})) } finally { h.controls.secretState='ENABLED' }
  assert.equal(h.puts.length,puts,'qualified history cannot waive currently disabled credentials')
  assert.ok(!h.calls.slice(calls).some(row=>row.url.endsWith(':run')||row.options.method==='PATCH'||row.url.endsWith(':resume')))
  const expiredHandle=createAiPdmEvidenceContext()
  await assert.rejects(runAiPdmEvidenceContext(expiredHandle,async()=>{
    const bindings=await qualifyAiPdmNativeHistoryBasis({ref:basis.ref,transport:h.transport,readSource:issuer.reader})
    syntheticClock.hold();syntheticClock.expireAfter(new Date(Date.now()+600000).toISOString())
    getProjection(bindings)
  }),{code:'DEV121_OWNER_RELEASE_PROOF_OBSERVATION_EXPIRED'})
  await assert.rejects(runAiPdmEvidenceContext(expiredHandle,()=>getProjection({})),{code:'DEV121_OWNER_RELEASE_PROOF_CONTEXT_INVALID'})
})
