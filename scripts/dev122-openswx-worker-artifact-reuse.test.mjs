import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { canonicalize, sha256, releasePaths, createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { WORKER_PROFILE_PATH, WORKER_SOURCE_PATHS, workerReceipt, workerTemplate, workerTemplatePolicy, workerJobName, workerSchedulerName, assertWorkerDescriptor, readWorkerFullEvidence, createOpenSwxOwnerRelease, readBootstrapSupplementalIam } from './lib/dev122-openswx-owner-release.mjs'
import { OPENSWX_TERRAFORM_PATHS, OPENSWX_TERRAFORM_ADDRESSES, executeOpenSwxBootstrap } from './lib/dev122-openswx-bootstrap.mjs'
import { assertReuseSourceLock, assertWorkerArchive, assertWorkerReuseInput, createWorkerGitReader, executeWorkerArtifactReuse, parseWorkerArtifactReuseArgs, publishWorkerReuseJson, resolveWorkerArtifact, verifyWorkerArtifactReuse, workerInputManifest } from './lib/dev122-openswx-worker-artifact-reuse.mjs'
import { READBACK_IAM_PATHS, READBACK_IAM_ADDRESSES, READBACK_IAM_SPECS, READBACK_JOB_ROLE, READBACK_SCHEDULER_ROLE, readbackIamPlan, expectedReadbackJobBindings,
  PREBUILD_IAM_ROLE, PREBUILD_IAM_PERMISSIONS, PREBUILD_IAM_SOURCE_PATH, PREBUILD_IAM_HUMAN_APPROVAL_SHA256, PREBUILD_IAM_SPECS, PREBUILD_IAM_ADDRESSES,
  prebuildIamContinuationPlan, assertPrebuildIamTerraformPlan } from './lib/dev122-openswx-readback-iam.mjs'

// LOCAL_TEST recorded transports. No provider/production/efficiency claim.
// Git reads use raw canonical blobs, never Windows CRLF normalization.
const root = fileURLToPath(new URL('..', import.meta.url)), oldRevision = 'a'.repeat(40), currentRevision = 'b'.repeat(40)
function git(args) { const row = spawnSync('git', args, { cwd: root, encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }); assert.equal(row.status, 0); return row.stdout }
const actualTree = git(['ls-tree', '-r', '-z', '--full-tree', 'HEAD']), cache = new Map()
function canonicalSource(name) { if (!cache.has(name)) cache.set(name, git(['show', `HEAD:${name}`])); return cache.get(name) }
const profileBytes = canonicalSource(WORKER_PROFILE_PATH), profile = JSON.parse(profileBytes), appProfile = JSON.parse(canonicalSource('config/release/dev117-ai-pdm-independent-production-v3.json'))
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
      executions.push({ name, createTime: new Date(date + 10).toISOString(), completionTime: new Date(date + 20).toISOString(), succeededCount: 1, failedCount: 0, conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }], template: structuredClone(job.template.template) })
      return { name: 'projects/9536592944/locations/asia-east1/operations/local-op' }
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

async function b22ReuseIamFixture() {
  const h = await harness(), iamRevision = 'd'.repeat(40), prebuildRevision = 'f'.repeat(40), sourceCalls = []
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
  const fixture = mkdtempSync(path.join(tmpdir(), 'ai-pdm-b21-git-archive-'))
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
    const reader = createWorkerGitReader(fixture, revision), inputs = workerInputManifest(reader.readTree(revision), reader, revision)
    assert.equal(inputs.entries.length, 37); assert.deepEqual(inputs.entries, manifest.entries)
    assert.notEqual(historicalRevision, revision)
    assert.throws(() => reader(PREBUILD_IAM_SOURCE_PATH, historicalRevision), { code: 'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID' })
    assert.throws(() => prebuildIamContinuationPlan(reader, historicalRevision), { code: 'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID' })
    reader.authorizeOrigin(historicalRevision)
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
  } finally {
    for (const [name, value] of previousEnv) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
    assert.equal(path.dirname(fixture), path.resolve(tmpdir())); assert.ok(path.basename(fixture).startsWith('ai-pdm-b21-git-archive-'))
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
  const h = await harness(), saved = await h.invoke(), d = h.v2(saved.ref), descriptorRef = h.seed('single-source-build-only', d)
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
  const full = { ...d, purpose: 'full', bootstrapRef: bootstrap.ref, cloudPreflightRef: bootstrap.value.facts.cloudPreflightRef, pausedDrainedRef: paused.ref, tokenSecretVersion: token, registrySecretVersion: registry }
  const evidence = await readWorkerFullEvidence(h.transport, full, profile, h.readSource)
  assert.equal(evidence.artifact.currentAssociation.sourceRevision, currentRevision); assert.deepEqual(evidence.artifact.originBuild, h.build)
  const fullRef = h.seed('single-source-full', full), worker = createOpenSwxOwnerRelease({ transport: h.transport, readSource: h.readSource, environment: { GITHUB_WORKFLOW_REF: `${appProfile.application.repository}/${appProfile.workflow.path}@refs/heads/main`, OWNER_EXECUTION_MODE: 'full_release' } })
  const intent = { sourceRevision: currentRevision, sourceLockRef: h.sourceLockRef, openswxWorkerRef: fullRef, deadlineAt: deadline() }
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
const b35FullBundle = buildDev117MigrationBundle(appProfile, buildDev117MigrationPackage(appProfile, JSON.parse(canonicalSource('config/platform/dev-010-n1c-ai-pdm.json'))), currentRevision)
const b35Bundles = deriveProgramOnlyBundles({ profile: appProfile, full: b35FullBundle })
async function b35ReadyProgramFixture(options = {}) {
  const h = await harness({ ...options, lockMutate: lock => { lock.migrationManifestSha256 = b35FullBundle.bundle.manifestSha256 } })
  const saved = await h.invoke(), descriptorRef = saved.refs.programOnlyFullDescriptorRef
  const descriptor = (await h.transport.readJson(descriptorRef)).value
  const retainedWorker = { descriptorRef, priorActivationRef: h.priorActivationRef, currentAssociationRef: saved.ref, readyResourceReadbackRef: saved.value.resourceAssociation.readbackRef }
  const policy = buildProgramOnlyPolicy({ profile: appProfile, sourceLock: h.lock, bundles: b35Bundles,
    baselineIntentRef: h.capsuleRef, baselineEntries: b35Bundles.effective.bundle.entries,
    migrationRunnerDigest: `${appProfile.artifact.migrationRunnerUri}@sha256:${'e'.repeat(64)}`, retainedWorker })
  const intent = { ...h.lock, sourceLockRef: h.sourceLockRef, openswxWorkerRef: descriptorRef, baselineIntentRef: h.capsuleRef, programOnlyBaseline: policy, deadlineAt: deadline() }
  const args = { transport: h.transport, intent, appProfile, descriptor, profile, readSource: h.readSource, currentReadback: true }
  const worker = createOpenSwxOwnerRelease({ transport: h.transport, readSource: h.readSource,
    environment: { GITHUB_WORKFLOW_REF: `${appProfile.application.repository}/${appProfile.workflow.path}@refs/heads/main`, OWNER_EXECUTION_MODE: 'full_release' } })
  return { h, saved, descriptor, intent, args, worker }
}

test('P06 program-only keeps current READY worker through prepare, candidate, activation guard and finalize with GET only', async () => {
  const f = await b35ReadyProgramFixture(), evidence = await readProgramOnlyWorkerEvidence(f.args)
  assert.equal(evidence.image, image)
  await f.worker.prepare({ intent: f.intent, profile: appProfile, runtimeConfig: { plainEnvironment: { PDM_OPENSWX_DISPATCH_ENABLED: '1' }, secretVersions: { PDM_WORKLOAD_AUTH_CREDENTIALS: registry.split('/').at(-1) }, openswxWorker: { purpose: 'full', sourceRevision: currentRevision, workerProfileSha256: f.descriptor.workerProfileSha256, descriptorRef: f.intent.openswxWorkerRef } } })
  await f.worker.candidate({ intent: f.intent, profile: appProfile, deployment: { sourceObject: f.h.currentSourceRef, openswxWorker: { image } } })
  await f.worker.beforeActivate({ intent: f.intent, profile: appProfile })
  const result = await f.worker.finalize({ intent: f.intent, profile: appProfile, canonical: {}, migrationMode: 'READ_ONLY_BASELINE_VERIFIED' })
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
  const result = await f.worker.recover({ intent: f.intent, profile: appProfile })
  assert.equal(result.status, 'RECOVERY_REQUIRED'); assert.equal(result.schedulerEnabled, null)
  assert.equal(result.workerJobMutationPerformed, false); assert.equal(result.durableQueue, 'RETAINED'); noMutation(f.h)
})

import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'
import { programOnlyHash, sealProgramOnlyEvidence, programOnlyStaticEnvironment, programOnlyExecutionEnvironment, programOnlyMigrationArguments, programOnlySubmissionFields } from './lib/dev117-ai-pdm-program-only-baseline.mjs'
import { readAiPdmReleaseObservation, readAiPdmObservationInputs, createAiPdmEvidenceContext, runAiPdmEvidenceContext } from './lib/dev121-owner-release-proof.mjs'

async function b35ProgramProofFixture({releasedBaseline=false}={}) {
  // Actual Git tar; the recorded graph's source revision is a synthetic identity.
  const archivePaths = [...new Set(['config/release/dev117-ai-pdm-independent-production-v3.json',
    ...b35FullBundle.bundle.entries.map(row => row.path), ...manifest.entries.map(row => row.path)])]
  const head = git(['rev-parse', 'HEAD']).toString().trim()
  const archive = git(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', '--prefix=source/', 'HEAD', '--', ...archivePaths])
  const marker = Buffer.from('comment=' + head), at = archive.indexOf(marker)
  assert.ok(at >= 0); archive.write('comment=' + currentRevision, at, marker.length)
  const f = await b35ReadyProgramFixture({ currentArchive: archive, proofMetadata: true, releasedBaseline }), h = f.h
  const put = (uri, value) => h.seedBytes(uri, Buffer.from(canonicalize(value) + '\n'))
  const seal = sealProgramOnlyEvidence, policy = f.intent.programOnlyBaseline
  const capsule = { schemaVersion: appProfile.schemas.releaseIntent, ownerApplicationId: 'ai-pdm', releaseId: h.lock.releaseId,
    sourceRevision: currentRevision, sourceSha256: h.lock.sourceSha256, sourceLockRef: h.sourceLockRef,
    authorizationPolicyRef: h.sourceLockRef, readinessReceiptRef: h.sourceLockRef, foundationReceiptRef: h.sourceLockRef, infraReceiptRef: h.sourceLockRef, runtimeConfigRef: h.sourceLockRef,
    migrationManifestSha256: b35FullBundle.bundle.manifestSha256, previousRevision: 'ai-pdm-prod-' + '2'.repeat(12), deadlineAt: f.intent.deadlineAt,
    openswxWorkerRef: f.intent.openswxWorkerRef, baselineIntentRef: policy.baselineIntentRef, programOnlyBaseline: policy }
  const intentRef = put(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${capsule.releaseId}/release-intent.json`, capsule)
  const base = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/${capsule.releaseId}/${intentRef.sha256}`
  const stage = (name, previousReceiptRef, facts) => put(`${base}/${name}.json`, seal({ schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId: capsule.releaseId, sourceRevision: currentRevision, stage: name, previousReceiptRef, facts, observedAt: now, status: 'PASS' }))
  const prerequisiteRefs = Object.fromEntries(['sourceLock','authorization','readiness','foundation','infra','runtimeConfig'].map(name => [name, h.sourceLockRef]))
  const prepare = stage('prepare', null, { prerequisiteRefs })
  const sourceObject = { ...h.currentSourceRef, uri: `gs://jenfu-platform-prod-aipdm-release/source/releases/${capsule.releaseId}/${intentRef.sha256}/source.tar.gz`, generation: '17', crc32c: crc32cBase64(h.objects.get(h.currentSourceRef.uri).bytes) }
  h.seedBytes(sourceObject.uri, h.objects.get(h.currentSourceRef.uri).bytes)
  const artifactDigest = `${appProfile.artifact.uri}@sha256:${'1'.repeat(64)}`, buildId = '22222222-2222-2222-2222-222222222222'
  const provenance = put(`${base}/provenance.json`, { schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: currentRevision,
    sourceObject, artifactDigest, status: 'PASS', cloudBuild: { name: `projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`, id: buildId, status: 'SUCCESS', projectId: 'jenfu-platform-prod',
      serviceAccount: `projects/jenfu-platform-prod/serviceAccounts/${appProfile.identities.builder}`, options: { requestedVerifyOption: 'VERIFIED' },
      sourceProvenance: { resolvedStorageSource: { bucket: 'jenfu-platform-prod-aipdm-release', object: sourceObject.uri.split('/').slice(3).join('/'), generation: '17' } },
      results: { images: [{ name: `${appProfile.artifact.uri}:release-${currentRevision}`, digest: artifactDigest.split('@')[1] }] } }, artifactRegistry: { uri: artifactDigest } })
  h.seedBytes(b35Bundles.sourceMigrationBundleRef.uri, b35FullBundle.bytes); h.seedBytes(b35Bundles.effectiveMigrationBundleRef.uri, b35Bundles.effective.bytes)
  const build = stage('build', prepare, { artifactDigest, sourceObject, migrationBundleRef: b35Bundles.effectiveMigrationBundleRef,
    sourceMigrationBundleRef: b35Bundles.sourceMigrationBundleRef, programOnlyBaseline: policy, provenanceReceiptRef: provenance })
  const deployment = { schemaVersion: appProfile.schemas.deploymentCapsule, ownerApplicationId: 'ai-pdm', sourceRevision: currentRevision, artifactDigest, buildReceiptRef: build,
    sourceObject, migrationBundleRef: b35Bundles.effectiveMigrationBundleRef, sourceMigrationBundleRef: b35Bundles.sourceMigrationBundleRef, programOnlyBaseline: policy,
    migrationRunnerDigest: policy.migrationRunnerDigest, releaseIntentRef: intentRef, releaseIntentSha256: intentRef.sha256, deadlineAt: capsule.deadlineAt,
    openswxWorker: { descriptorRef: capsule.openswxWorkerRef, workerBuildRef: f.saved.ref, image } }
  const deploymentRef = put(`${base}/deployment-capsule.json`, deployment), outputUri = `${base}/migration-readonly-native.json`
  const task = { serviceAccount: appProfile.migrations.serviceAccount, maxRetries: 0, timeout: '1800s', volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }],
    containers: [{ name: 'migration', image: policy.migrationRunnerDigest, args: ['--bundle-ref-required'], env: Object.entries(programOnlyStaticEnvironment(appProfile)).map(([name,value]) => ({name,value})), volumeMounts: [{name:'cloudsql',mountPath:'/cloudsql'}] }] }
  const jobName = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner', executionName = 'program-proof-local'
  const job = { name: jobName, etag: 'LOCAL_ETAG', template: { taskCount: 1, parallelism: 1, template: task } }
  const execution = { name: `${jobName}/executions/${executionName}`, createTime: now, completionTime: now, taskCount:1, parallelism:1, succeededCount:1, conditions:[{type:'Completed',state:'CONDITION_SUCCEEDED'}], template:structuredClone(task) }
  execution.template.containers[0].args=programOnlyMigrationArguments(deployment,outputUri); execution.template.containers[0].env=Object.entries(programOnlyExecutionEnvironment(appProfile)).map(([name,value])=>({name,value}))
  const jobRef=put(outputUri.replace(/\.json$/u,'-job-readback.json'),job),executionRef=put(outputUri.replace(/\.json$/u,'-execution-readback.json'),execution)
  const submissionRef=put(outputUri.replace(/\.json$/u,'-submission-intent.json'),seal({schemaVersion:'jenfu.dev012.migration-submission-intent.v1',ownerApplicationId:'ai-pdm',sourceRevision:currentRevision,
    jobName,migrationRunnerDigest:policy.migrationRunnerDigest,migrationBundleRef:deployment.migrationBundleRef,outputUri,args:programOnlyMigrationArguments(deployment,outputUri),principalOnlyFenceRef:null,deadlineAt:capsule.deadlineAt,status:'SUBMISSION_INTENT',observedAt:now,...programOnlySubmissionFields(appProfile,deployment)}))
  const nativeRef=put(outputUri,seal({schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'ai-pdm',sourceRevision:currentRevision,database:'jenfu_prod',ledger:'ai_pdm_core.schema_migrations',manifestSha256:b35Bundles.effective.bundle.manifestSha256,
    baselineCount:15,minimumLedgerCount:0,ledgerBootstrap:{enabled:true,created:false},ledgerCount:33,applied:0,replayed:33,crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}],boundaryStatus:'PASS',executionName,startedAt:now,completedAt:now,status:'PASS'}))
  const migrate=put(`${base}/migrate.json`,seal({schemaVersion:'aipdm.program-only-baseline-association.v1',ownerApplicationId:'ai-pdm',releaseId:capsule.releaseId,sourceRevision:currentRevision,releaseCapsuleRef:intentRef,deploymentCapsuleRef:deploymentRef,policySha256:programOnlyHash(policy),sourceMigrationBundleRef:b35Bundles.sourceMigrationBundleRef,effectiveMigrationBundleRef:b35Bundles.effectiveMigrationBundleRef,nativeReceiptRef:nativeRef,submissionIntentRef:submissionRef,executionReadbackRef:executionRef,jobReadbackRef:jobRef,executionName,status:'PASS',databaseDisposition:'READ_ONLY_BASELINE_VERIFIED',migrationJobSubmitted:true,migrationJobSubmissions:1,currentDatabaseReadPerformed:true,observedAt:now,deadlineAt:capsule.deadlineAt}))
  const calls=[]
  const fetchImpl=async(url,options={})=>{calls.push({url,method:options.method??'GET'});
    const anchor=h.modeledReleasedAnchor
    if(anchor&&url===`https://cloudbuild.googleapis.com/v1/${anchor.cloudBuild.name}`)return Response.json(anchor.cloudBuild)
    if(anchor&&url.startsWith('https://artifactregistry.googleapis.com/v1/'))return Response.json({name:`projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release/dockerImages/ai-pdm@${anchor.artifactDigest.split('@')[1]}`,uri:anchor.artifactDigest})
    const match=/\/b\/([^/]+)\/o\/([^?]+)/u.exec(url),uri=match&&`gs://${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`,row=h.objects.get(uri)
    if(!row)return Response.json({}, {status:404});return url.includes('alt=media')?new Response(row.bytes):Response.json({bucket:decodeURIComponent(match[1]),name:decodeURIComponent(match[2]),generation:'17',crc32c:crc32cBase64(row.bytes),size:String(row.bytes.length)})}
  const sourceCalls=[]
  const readSource=(name,revision)=>{sourceCalls.push({name,revision});assert.ok([oldRevision,currentRevision].includes(revision));return releasedBaseline&&revision===oldRevision&&name==='config/release/dev117-ai-pdm-independent-production-v3.json'?b35HistoricalProfileBytes:canonicalSource(name)}
  return { f,h,capsule,intentRef,prepare,migrate,deploymentRef,execution,job,base,put,calls,sourceCalls,fetchImpl,readSource,
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
const b35HistoricalProfileValue = structuredClone(appProfile)
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
function b35GitArchive(identity, entries) {
  const paths = [...new Set(['config/release/dev117-ai-pdm-independent-production-v3.json', ...entries.map(row => row.path), ...manifest.entries.map(row => row.path)])]
  const head=git(['rev-parse','HEAD']).toString().trim()
  // Portable even in required CI's shallow checkout: raw unchanged SQL/worker
  // blobs plus the hash-pinned historical profile and Git's real PAX header.
  const headArchive=git(['-c','core.autocrlf=false','-c','core.eol=lf','archive','--format=tar','--prefix=source/','HEAD','--',...paths])
  const paxSize=parseInt(headArchive.subarray(124,136).toString().replace(/\0.*$/su,''),8)
  const pax=headArchive.subarray(0,512+Math.ceil(paxSize/512)*512)
  const modeled=tar([...manifest.entries,...entries.map(row=>({path:row.path,mode:'100644'})),{path:'config/release/dev117-ai-pdm-independent-production-v3.json',mode:'100644',bytes:b35HistoricalProfileBytes}])
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
  const artifactDigest=`${appProfile.artifact.uri}@sha256:${'3'.repeat(64)}`,buildId='33333333-3333-3333-3333-333333333333',candidateRevision='ai-pdm-prod-'+'2'.repeat(12)
  const cloudBuild={name:`projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`,id:buildId,status:'SUCCESS',projectId:'jenfu-platform-prod',serviceAccount:`projects/jenfu-platform-prod/serviceAccounts/${appProfile.identities.builder}`,options:{requestedVerifyOption:'VERIFIED'},sourceProvenance:{resolvedStorageSource:{bucket:'jenfu-platform-prod-aipdm-release',object:sourceObject.uri.split('/').slice(3).join('/'),generation:'17'}},results:{images:[{name:`${appProfile.artifact.uri}:release-${oldRevision}`,digest:artifactDigest.split('@')[1]}]}}
  const provenanceReceiptRef=put(`${base}/provenance.json`,{schemaVersion:'jenfu.dev012.build-provenance-receipt.v1',ownerApplicationId:'ai-pdm',sourceRevision:oldRevision,sourceObject,artifactDigest,status:'PASS',cloudBuild,artifactRegistry:{uri:artifactDigest}})
  const prerequisiteRefs=Object.fromEntries(Object.entries({sourceLock:'sourceLockRef',authorization:'authorizationPolicyRef',readiness:'readinessReceiptRef',foundation:'foundationReceiptRef',infra:'infraReceiptRef',runtimeConfig:'runtimeConfigRef'}).map(([name,key])=>[name,capsule[key]]))
  const prepare=stage('prepare',null,{prerequisiteRefs}),build=stage('build',prepare,{artifactDigest,sourceObject,migrationBundleRef,provenanceReceiptRef})
  const deployment=put(`${base}/deployment-capsule.json`,{schemaVersion:appProfile.schemas.deploymentCapsule,ownerApplicationId:'ai-pdm',sourceRevision:oldRevision,artifactDigest,buildReceiptRef:build,sourceObject,migrationBundleRef,migrationRunnerDigest:`${appProfile.artifact.migrationRunnerUri}@sha256:${'e'.repeat(64)}`,releaseIntentRef:capsuleRef,releaseIntentSha256:capsuleRef.sha256,deadlineAt:capsule.deadlineAt})
  const migrate=put(`${base}/migrate.json`,sealProgramOnlyEvidence({schemaVersion:'jenfu.dev012.migration-receipt.v1',ownerApplicationId:'ai-pdm',sourceRevision:oldRevision,database:'jenfu_prod',ledger:'ai_pdm_core.schema_migrations',manifestSha256:b35HistoricalBundle.bundle.manifestSha256,baselineCount:15,minimumLedgerCount:0,ledgerBootstrap:{enabled:true,created:false},ledgerCount:33,applied:0,replayed:33,crossDatabaseDenials:[{database:'jenfu_dev',denied:true},{database:'jenfu_stg',denied:true}],boundaryStatus:'PASS',executionName:'ai-pdm-prod-migration-runner-local33',startedAt:now,completedAt:now,status:'PASS'}))
  let previous=stage('candidate',migrate,{candidateRevision,artifactDigest,migrationReceiptRef:migrate,deploymentCapsuleRef:deployment})
  const candidate=previous;previous=stage('entrypoint',previous,{})
  previous=stage('verify',previous,{candidateRevision,artifactDigest,smoke:{status:'PASS'}})
  previous=stage('decision',previous,{candidateRevision,artifactDigest,decision:'GO'})
  previous=stage('activate',previous,{candidateRevision,artifactDigest,effectiveRevision:candidateRevision})
  const canonical=stage('canonical',previous,{candidateRevision,artifactDigest,smoke:{status:'PASS'}})
  previous=stage('finalize',canonical,{candidateRevision,artifactDigest,result:'RELEASED',temporaryCandidateTags:0})
  const terminal=stage('terminal',previous,{candidateRevision,artifactDigest,result:'RELEASED',databaseDisposition:'FORWARD_APPLIED',remainingHumanAction:0})
  return {canonical,prepare,migrate,terminal,deployment,candidate,artifactDigest,cloudBuild,candidateRevision}
}

import {readPreActivationAbortContinuation} from './lib/dev121-preactivation-abort-continuation.mjs'
import {readProgramOnlyReleasedBaseline} from './lib/dev117-ai-pdm-program-only-baseline.mjs'
import {verifyOwnerProviderReadback} from './lib/dev121-owner-release-proof.mjs'
async function b35ProgramAbortFixture() {
  const wire=await b35ProgramProofFixture({releasedBaseline:true}),h=wire.h,anchor=h.modeledReleasedAnchor
  const validators=createOwnerTransport({token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl})
  const paths=releasePaths(appProfile,wire.capsule,wire.intentRef.sha256),entrypoint={ingress:'INGRESS_TRAFFIC_ALL',defaultUriDisabled:false,invokerIamDisabled:true,uri:appProfile.target.canonicalOrigin,urls:[appProfile.target.canonicalOrigin],serviceEtag:'LOCAL_SERVICE_ETAG',generation:'17'}
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
  const facts={result:'PRE_ACTIVATION_ABORTED',databaseDisposition:'READ_ONLY_BASELINE_VERIFIED',currentDatabaseReadPerformed:true,previousRevision:wire.capsule.previousRevision,migrationEvidenceRef:migrate,recoveryOrder:['TRAFFIC_ROLLBACK','TAG_CLEANUP','ENTRYPOINT_BASELINE_RESTORE'],entrypointRecovery:{result:'BASELINE_ALREADY_ACTIVE',changed:false}}
  const rollback=stage('rollback',migrate,facts),terminal=stage('terminal',rollback,facts)
  const controlCore={schemaVersion:'jenfu.dev012.owner-control-head.v1',inputFingerprint:sha256(canonicalize({ownerApplicationId:'ai-pdm',releaseId:wire.capsule.releaseId,sourceRevision:currentRevision,releaseIntentSha256:wire.intentRef.sha256})),ownerApplicationId:'ai-pdm',service:appProfile.target.serviceName,controlBucket:appProfile.artifact.releaseBucket,releaseId:wire.capsule.releaseId,sourceRevision:currentRevision,sourceLockSha256:wire.capsule.sourceLockRef.sha256,candidateRevision:null,previousRevision:wire.capsule.previousRevision,ownerRunRef:`https://api.github.com/repos/${appProfile.application.repository}/actions/runs/351`,leaseExpiresAt:now,deadlineAt:wire.capsule.deadlineAt,state:'FINALIZED',result:'PRE_ACTIVATION_ABORTED'}
  const control={...controlCore,controlSha256:sha256(canonicalize(controlCore))},calls=[],inventory=[wire.execution]
  wire.put(`gs://${appProfile.artifact.releaseBucket}/control/active.json`,control)
  const transport={...h.transport,readOwnerRun:async()=>({id:'351',status:'completed',conclusion:'failure',event:'workflow_dispatch',headSha:currentRevision,createdAt:now,updatedAt:now}),request:async(url,options={})=>{calls.push({url,method:options.method??'GET'});assert.ok(url.startsWith(`https://run.googleapis.com/v2/${wire.job.name}/executions?`));return {executions:structuredClone(inventory)}},
    readOwnerSourceProof:async({sourceRevision,refs,verifyProvider})=>{const proof=await readAiPdmReleaseObservation({sourceRevision,refs,token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl,readSource:wire.readSource});return {proof,provider:verifyProvider?await verifyOwnerProviderReadback({proof,token:'LOCAL_RECORDED_OWNER_TOKEN',fetchImpl:wire.fetchImpl}):null}},
    assertServiceSettled:validators.assertServiceSettled,assertCanonicalEntrypoint:validators.assertCanonicalEntrypoint,entrypointSnapshot:validators.entrypointSnapshot,getRevision:async()=>({name:`projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod/revisions/${wire.capsule.previousRevision}`,conditions:[{type:'Ready',state:'CONDITION_SUCCEEDED'}],containers:[{name:appProfile.runtime.containerName,image:anchor.artifactDigest}]})}
  const service={...entrypoint,etag:entrypoint.serviceEtag,generation:'17',observedGeneration:'17',reconciling:false,terminalCondition:{state:'CONDITION_SUCCEEDED'},name:'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',traffic:[{revision:wire.capsule.previousRevision,percent:100}],trafficStatuses:[{revision:wire.capsule.previousRevision,percent:100}],scaling:{scalingMode:'AUTOMATIC',maxInstanceCount:1}}
  transport.getService=async()=>{calls.push({url:`https://run.googleapis.com/v2/${service.name}`,method:'GET'});return service}
  return {wire,h,transport,calls,inventory,control,service,prepare,migrate,terminal,
    read:()=>readPreActivationAbortContinuation({profile:appProfile,transport,baselineIntentRef:wire.intentRef})}
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

test('P00 program-only baseline qualification consumes full authenticated RELEASED33 graph and exact provider GETs',async()=>{
  const f=await b35ProgramAbortFixture()
  const result=await readProgramOnlyReleasedBaseline({transport:f.transport,profile:appProfile,baselineIntentRef:f.wire.capsule.baselineIntentRef,previousRevision:f.wire.capsule.previousRevision,bundles:b35Bundles})
  assert.equal(result.graph.bundle.bundle.entries.length,33);assert.equal(result.observed.provider.status,'BUILD_IMAGE_VERIFIED')
  assert.deepEqual(result.baselineEntries,b35Bundles.effective.bundle.entries);assert.equal(result.migrationRunnerDigest,f.wire.capsule.programOnlyBaseline.migrationRunnerDigest)
  assert.ok(f.wire.calls.some(row=>row.url.startsWith('https://cloudbuild.googleapis.com/')))
  assert.ok(f.wire.calls.some(row=>row.url.startsWith('https://artifactregistry.googleapis.com/')))
  assert.ok(f.wire.calls.every(row=>row.method==='GET'));noMutation(f.h)
})
test('P00 program-only baseline qualification rejects a different installed prefix after genuine source/provider verification',async()=>{
  const f=await b35ProgramAbortFixture(),bundles=structuredClone(b35Bundles)
  bundles.effective.bundle.entries[0].appliedSha256='0'.repeat(64)
  await assert.rejects(readProgramOnlyReleasedBaseline({transport:f.transport,profile:appProfile,baselineIntentRef:f.wire.capsule.baselineIntentRef,previousRevision:f.wire.capsule.previousRevision,bundles}),/installed-prefix/u)
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
