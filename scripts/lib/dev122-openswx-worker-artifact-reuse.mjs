import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { assertImmutableRef, canonicalize, sha256, releasePaths } from './dev012-owner-release-runtime.mjs'
import { assertDev117ReleaseIntent } from './dev117-ai-pdm-continuous-release.mjs'
import { WORKER_PROFILE_PATH, WORKER_RECEIPT_PREFIX, assertOpenSwxWorkerRef, assertOpenSwxWorkerProfile, assertWorkerDescriptor, assertWorkerReceipt, assertWorkerBuildSource, workerJobName, workerTemplate, boundOpenSwxTransport, readBootstrapSupplementalIam, isPausedAppRepair, assertPausedRepairBaseline, assertPausedRepairCurrentCheck, buildPausedRepairDescriptor, repairSnapshotProjection, canonicalWorkerExecution, assertTerminalExecution } from './dev122-openswx-owner-release.mjs'
import { OPENSWX_TERRAFORM_PATHS, OPENSWX_TERRAFORM_ADDRESSES, readCurrentReadyWorkerResources, readPausedRepairWorkerResources, verifyNormalActor } from './dev122-openswx-bootstrap.mjs'
import { READBACK_IAM_PATHS, PREBUILD_IAM_SOURCE_PATH } from './dev122-openswx-readback-iam.mjs'
import { readPreActivationAbortContinuation } from './dev121-preactivation-abort-continuation.mjs'
import { createAiPdmEvidenceContext, runAiPdmEvidenceContext, descendAiPdmEvidenceContext, readAiPdmEvidenceLeaf, admitAiPdmEvidenceSource, readAiPdmObservationInputs, assertAiPdmPausedRepairReadbacks } from './dev121-owner-release-proof.mjs'

const BUCKET = 'jenfu-platform-prod-aipdm-release', H40 = /^[a-f0-9]{40}$/u, H64 = /^[a-f0-9]{64}$/u
const READER = 'scripts/lib/openswx-reader', ENTRY = 'scripts/run-openswx-metadata-job.mjs'
const APP_PROFILE = 'config/release/dev117-ai-pdm-independent-production-v3.json'
const SOURCE_BINDING_KEYS = ['sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'workerProfileSha256', 'resourcePlanHash']
const DOCKER_SHA = 'fba58398d3cae136ac1f1dfa04a235dd5f0f6463481096ac26fe4f692c4dd2ba'
const IGNORE_SHA = '87f446e9fa523c95c5c1cd273349119ae981d372e3b6a19c0bc4a6e8dfae551d'
const PROFILE_SHA = '65d6530a0f1e713c7936bdb0889bb529742334a530b20b6e8bf18ea81a7461dc'
const BUILDER = 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c'
const IGNORED_ARGS = ['SOURCE_REVISION', 'SOURCE_TREE', 'SOURCE_VERSION', 'SOURCE_CREATED_AT', 'SOURCE_STATE']
const POLICY = Object.freeze({ schemaVersion: 'aipdm.openswx-reuse-security-policy.v1', discovery: 'FINISHED_SUCCESS', continuousAnalysis: 'ACTIVE', archived: false, rawHighOrCriticalVulnerabilityCount: 0, blockingVulnerabilityCount: 0 })
const ASSOCIATION_KEYS = ['schemaVersion', 'ownerApplicationId', 'status', 'evidenceScope', 'sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'workerProfileSha256', 'resourcePlanHash', 'image', 'jobName', 'actor', 'observedAt', 'requestRef', 'priorActivationRef', 'executableProof', 'artifactOrigin', 'resourceAssociation', 'securityEvidence']
const ORIGIN_KEYS = ['priorReadyCapsuleRef', 'priorReadyFullDescriptorRef', 'originalBuildReceiptRef', 'originalBuildOnlyDescriptorRef', 'originalApprovedResourcePlanRef', 'sourceRevision', 'sourceArchiveSha256', 'workerProfileSha256', 'sourceObject', 'buildId', 'buildRequestSha256', 'createTime', 'startTime', 'finishTime', 'image', 'provenance', 'sbom']
const PROOF_KEYS = ['method', 'originalManifestRef', 'currentManifestRef', 'effectiveRecipeSha256', 'equal', 'target', 'builder', 'effectiveArgs', 'ignoredArgNames', 'originalSubmittedArgs']
const RESOURCE_KEYS = ['infraManifestRef', 'readbackRef', 'originalApprovedResourcePlanRef', 'originalResourceApplyRef', 'resourcePlanHash', 'resourcesUnchanged']
const SECURITY_KEYS = ['readbackRef', 'policySha256', 'observedAt', 'image', 'rawHighOrCriticalVulnerabilityCount', 'blockingVulnerabilityCount']
function fail(code) { throw Object.assign(Error(code), { code }) }
function exact(value, keys, code = 'OPENSWX_REUSE_SCHEMA_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(code)
}
function same(a, b, code = 'OPENSWX_REUSE_JOIN_INVALID') { if (canonicalize(a) !== canonicalize(b)) fail(code) }
function time(value) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('OPENSWX_REUSE_TIME_INVALID'); return Date.parse(value) }
function ownRef(ref) { assertOpenSwxWorkerRef(ref); return ref }
function releaseCapsuleRef(ref) {
  assertImmutableRef(ref, BUCKET, ['receipts/releases'])
  if (!/^gs:\/\/jenfu-platform-prod-aipdm-release\/receipts\/releases\/[A-Z0-9][A-Z0-9-]{5,63}\/release-intent\.json$/u.test(ref.uri)) fail('IMMUTABLE_REF_INVALID')
  return ref
}
function rows(value, max = 256) { if (!Array.isArray(value) || !value.length || value.length > max) fail('OPENSWX_REUSE_ARRAY_INVALID'); return value }
function proofPath(name) { return name === ENTRY || name === '.dockerignore' || name === WORKER_PROFILE_PATH || name.startsWith(`${READER}/`) }
function safePath(name) { return typeof name === 'string' && /^[A-Za-z0-9._/-]+$/u.test(name) && !name.startsWith('/') && !name.split('/').some(p => p === '.' || p === '..' || !p) }
async function read(transport, ref, prefixes = [WORKER_RECEIPT_PREFIX]) {
  assertImmutableRef(ref, BUCKET, prefixes)
  return runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    let result
    const bytes = await readAiPdmEvidenceLeaf({ ref, read: async () => {
      result = await transport.readJson(ref, BUCKET, prefixes)
      if (!Buffer.isBuffer(result.bytes) || result.ref?.uri !== ref.uri || result.ref?.sha256 !== ref.sha256 || sha256(result.bytes) !== ref.sha256) fail('OPENSWX_REUSE_REF_HASH_INVALID')
      same(JSON.parse(result.bytes.toString('utf8')), result.value, 'OPENSWX_REUSE_REF_JSON_INVALID')
      return result.bytes
    } })
    let value; try { value = JSON.parse(bytes.toString('utf8')) } catch { fail('OPENSWX_REUSE_REF_JSON_INVALID') }
    return { ...result, bytes, value, ref }
  })
}
function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: null, windowsHide: true, maxBuffer: 256 * 1024 * 1024 })
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) fail('OPENSWX_REUSE_GIT_READ_FAILED')
  return result.stdout
}
/** Historical revisions are admitted only by the hash-validated descriptor chain. */
export function createWorkerGitReader(root, sourceRevision) {
  if (!H40.test(sourceRevision ?? '') || path.resolve(git(root, ['rev-parse', '--show-toplevel']).toString().trim()).toLowerCase() !== path.resolve(root).toLowerCase()) fail('OPENSWX_REUSE_REPOSITORY_INVALID')
  const permitted = new Set([sourceRevision])
  const readSource = (name, revision) => {
    if (!safePath(name) || !H40.test(revision ?? '') || (!permitted.has(revision) && ![...READBACK_IAM_PATHS, WORKER_PROFILE_PATH].includes(name))) fail('OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID')
    if (revision !== sourceRevision && !proofPath(name) && ![APP_PROFILE, ...READBACK_IAM_PATHS, PREBUILD_IAM_SOURCE_PATH, ...OPENSWX_TERRAFORM_PATHS].includes(name)) fail('OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID')
    return git(root, ['show', `${revision}:${name}`])
  }
  readSource.authorizeOrigin = revision => { if (!H40.test(revision ?? '') || (!permitted.has(revision) && permitted.size >= 9)) fail('OPENSWX_REUSE_ORIGIN_DEPTH'); permitted.add(revision) }
  readSource.readTree = revision => { if (!permitted.has(revision)) fail('OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'); return git(root, ['ls-tree', '-r', '-z', '--full-tree', revision]) }
  readSource.assertCurrentFrozen = () => {
    if (git(root, ['rev-parse', 'HEAD']).toString().trim() !== sourceRevision || git(root, ['status', '--porcelain=v1', '--untracked-files=all']).length) fail('SOURCE_CHECKOUT_NOT_FROZEN')
  }
  readSource.readTreeId = revision => { if (!permitted.has(revision)) fail('OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'); return git(root, ['rev-parse', `${revision}^{tree}`]).toString().trim() }
  readSource.readArchive = revision => { if (revision !== sourceRevision) fail('OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'); readSource.assertCurrentFrozen(); return git(root, ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', '--prefix=source/', revision]) }
  return readSource
}
export function workerInputManifest(treeBytes, readSource, revision) {
  if (!Buffer.isBuffer(treeBytes) || !H40.test(revision ?? '')) fail('OPENSWX_REUSE_TREE_INVALID')
  const entries = []
  for (const row of treeBytes.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^([0-9]{6}) (blob|tree|commit) ([a-f0-9]{40})\t([\s\S]+)$/u.exec(row)
    if (!match) fail('OPENSWX_REUSE_TREE_INVALID')
    if (!proofPath(match[4])) continue
    if (!safePath(match[4])) fail('OPENSWX_REUSE_TREE_INVALID')
    if (match[2] !== 'blob' || !['100644', '100755'].includes(match[1])) fail('OPENSWX_REUSE_INPUT_MODE_INVALID')
    const bytes = readSource(match[4], revision)
    if (!Buffer.isBuffer(bytes)) fail('OPENSWX_REUSE_INPUT_BYTES_INVALID')
    entries.push({ path: match[4], mode: match[1], size: bytes.length, sha256: sha256(bytes) })
  }
  entries.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  assertManifest(entries)
  return { schemaVersion: 'aipdm.openswx-worker-input-manifest.v1', sourceRevision: revision, entries }
}
function assertManifest(entries) {
  rows(entries, 512)
  const seen = new Set()
  for (const row of entries) {
    exact(row, ['path', 'mode', 'size', 'sha256'])
    if (!safePath(row.path) || !proofPath(row.path) || seen.has(row.path) || !['100644', '100755'].includes(row.mode) || !Number.isSafeInteger(row.size) || row.size < 0 || !H64.test(row.sha256)) fail('OPENSWX_REUSE_MANIFEST_INVALID')
    seen.add(row.path)
  }
  for (const [name, hash] of [[`${READER}/Dockerfile`, DOCKER_SHA], ['.dockerignore', IGNORE_SHA], [WORKER_PROFILE_PATH, PROFILE_SHA]]) {
    if (entries.find(row => row.path === name)?.sha256 !== hash) fail('OPENSWX_REUSE_RECIPE_DRIFT')
  }
  if (!seen.has(ENTRY) || entries.filter(row => row.path.startsWith(`${READER}/vendor/`)).length !== 19) fail('OPENSWX_REUSE_MANIFEST_INVALID')
}
/** Compare actual Linux archive bytes/modes. Never normalize CRLF or provider bytes. */
export function assertWorkerArchive(archive, entries) {
  assertManifest(entries)
  if (!Buffer.isBuffer(archive) || archive.length > 256 * 1024 * 1024) fail('OPENSWX_REUSE_ARCHIVE_INVALID')
  let bytes = archive
  if (archive[0] === 0x1f && archive[1] === 0x8b) { try { bytes = gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 }) } catch { fail('OPENSWX_REUSE_ARCHIVE_INVALID') } }
  const found = [], names = new Set(); let offset = 0
  const field = (header, start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/su, '')
  const octal = value => { if (!/^\s*[0-7]+[\0 ]*$/u.test(value)) fail('OPENSWX_REUSE_ARCHIVE_INVALID'); return parseInt(value.trim(), 8) }
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512); offset += 512
    if (header.every(byte => byte === 0)) break
    const sum = [...header].reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0)
    if (sum !== octal(field(header, 148, 8))) fail('OPENSWX_REUSE_ARCHIVE_INVALID')
    const size = octal(field(header, 124, 12)), mode = octal(field(header, 100, 8)), type = field(header, 156, 1)
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > bytes.length) fail('OPENSWX_REUSE_ARCHIVE_INVALID')
    const body = bytes.subarray(offset, offset + size); offset += Math.ceil(size / 512) * 512
    if (type === 'g') continue // git archive's global PAX commit comment
    const prefix = field(header, 345, 155), name = [prefix, field(header, 0, 100)].filter(Boolean).join('/').replace(/\/$/u, '')
    if (name === 'source' && type === '5') continue
    if (!name.startsWith('source/')) fail('OPENSWX_REUSE_ARCHIVE_PATH_INVALID')
    const relative = name.slice(7)
    if (!proofPath(relative)) continue
    if (!safePath(name)) fail('OPENSWX_REUSE_ARCHIVE_PATH_INVALID')
    if (type === '5') continue
    if (!['', '0'].includes(type) || ![0o644, 0o755, 0o664, 0o775].includes(mode) || names.has(relative)) fail('OPENSWX_REUSE_ARCHIVE_MODE_INVALID')
    names.add(relative)
    // Git archive preserves the executable bit and may include group-write bits.
    found.push({ path: relative, mode: mode & 0o111 ? '100755' : '100644', size, sha256: sha256(body) })
  }
  found.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  same(found, entries, 'OPENSWX_REUSE_ARCHIVE_INPUT_MISMATCH')
  return { archiveSha256: sha256(archive), manifestSha256: sha256(canonicalize(entries)), inputCount: found.length }
}
function manifestEqual(original, current) {
  for (const manifest of [original, current]) { exact(manifest, ['schemaVersion', 'sourceRevision', 'entries']); if (manifest.schemaVersion !== 'aipdm.openswx-worker-input-manifest.v1' || !H40.test(manifest.sourceRevision)) fail('OPENSWX_REUSE_MANIFEST_INVALID'); assertManifest(manifest.entries) }
  same(original.entries, current.entries, 'OPENSWX_REUSE_EXECUTABLE_DRIFT')
}
export function createWorkerEvidenceContext() { return createAiPdmEvidenceContext() }
function context() { return createWorkerEvidenceContext() }
function descend(ctx, ref, association = true, validateRef = ownRef) {
  validateRef(ref)
  return descendAiPdmEvidenceContext(ctx, ref, association)
}
const CAPSULE_PROFILE = { schemas: { releaseIntent: 'jenfu.dev117.ai-pdm-release-intent.v2' }, artifact: { releaseBucket: BUCKET } }
async function readOrigin({ transport, priorActivationRef, profile, readSource, ctx = context() }) {
  return runAiPdmEvidenceContext(ctx, async () => {
  const next = descend(ctx, priorActivationRef, false)
  return runAiPdmEvidenceContext(next, async () => {
  const activationRow = await read(transport, priorActivationRef), activation = activationRow.value
  if (activation.kind !== 'activation' || activation.facts?.workerStatus !== 'READY' || activation.facts.schedulerState !== 'ENABLED'
    || activation.facts.claimProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND' || activation.facts.dbAdmissionProof !== 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN'
    || !Array.isArray(activation.previousRefs) || activation.previousRefs.length !== 5) fail('OPENSWX_REUSE_PRIOR_READY_INVALID')
  const capsuleRef = releaseCapsuleRef(activation.previousRefs[0]), capsule = assertDev117ReleaseIntent((await read(transport, capsuleRef, ['receipts/releases'])).value, CAPSULE_PROFILE)
  if (capsuleRef.uri !== `gs://${BUCKET}/receipts/releases/${capsule.releaseId}/release-intent.json`) fail('IMMUTABLE_REF_INVALID')
  const capsuleContext = descend(next, capsuleRef, false, releaseCapsuleRef)
  return runAiPdmEvidenceContext(capsuleContext, async () => {
  const priorLockRow = await read(transport, capsule.sourceLockRef, ['receipts']), priorLock = priorLockRow.value
  assertReuseSourceLock(priorLock, capsule.sourceRevision)
  admitAiPdmEvidenceSource(priorLockRow)
  if (priorLock.sourceSha256 !== capsule.sourceSha256 || priorLock.releaseId !== capsule.releaseId || priorLock.migrationManifestSha256 !== capsule.migrationManifestSha256) fail('OPENSWX_REUSE_PRIOR_SOURCE_LOCK_INVALID')
  const fullRef = ownRef(capsule.openswxWorkerRef), full = (await read(transport, fullRef)).value
  const fullContext = descend(capsuleContext, fullRef, false)
  return runAiPdmEvidenceContext(fullContext, async () => {
  const profileBytes = readSource(WORKER_PROFILE_PATH, capsule.sourceRevision)
  assertOpenSwxWorkerProfile(JSON.parse(profileBytes)); same(JSON.parse(profileBytes), profile)
  assertWorkerDescriptor(full, profile, sha256(profileBytes), capsule.sourceRevision)
  if (full.purpose !== 'full') fail('OPENSWX_REUSE_PRIOR_FULL_REQUIRED')
  assertWorkerReceipt(activation, full, 'activation', { actor: profile.normalActor })
  readSource.authorizeOrigin?.(full.sourceRevision)
  const resolved = await resolveWorkerArtifact({ transport, descriptor: full, profile, readSource, ctx: fullContext })
  if (resolved.image !== activation.image) fail('OPENSWX_REUSE_ORIGIN_IMAGE_INVALID')
  const bootstrapDescriptor = isPausedAppRepair(full) ? resolved.bootstrapDescriptor : full
  const bootstrapDescriptorRef = isPausedAppRepair(full) ? resolved.bootstrapDescriptorRef : fullRef
  const bootstrapContext = isPausedAppRepair(full) ? descend(fullContext, bootstrapDescriptorRef) : fullContext
  return runAiPdmEvidenceContext(bootstrapContext, async () => {
  const bootstrap = (await read(transport, bootstrapDescriptor.bootstrapRef)).value
  assertWorkerReceipt(bootstrap, bootstrapDescriptor, 'bootstrap', { actor: profile.normalActor, image: resolved.image })
  const template = workerTemplate(profile, resolved.image, full.tokenSecretVersion), entry = resolved.sourceEntryProof
  if (activation.templateSha256 !== sha256(canonicalize(template))) fail('OPENSWX_REUSE_PRIOR_TEMPLATE_INVALID')
  same(activation.facts.sourceEntryRef, entry)
  same(activation.facts.numericCredentials, { token: full.tokenSecretVersion, registry: full.registrySecretVersion })
  if (bootstrap.facts.tokenSecretVersion !== full.tokenSecretVersion || bootstrap.facts.registrySecretVersion !== full.registrySecretVersion) fail('OPENSWX_REUSE_PRIOR_CREDENTIAL_INVALID')
  const preflight = (await read(transport, bootstrapDescriptor.cloudPreflightRef)).value, drained = (await read(transport, bootstrapDescriptor.pausedDrainedRef)).value
  assertWorkerReceipt(preflight, bootstrapDescriptor, 'cloud-preflight', { actor: profile.normalActor, image: resolved.image })
  assertWorkerReceipt(drained, bootstrapDescriptor, 'paused-drained', { actor: profile.normalActor })
  const normalSha = sha256(canonicalize(template)), selftestSha = sha256(canonicalize(workerTemplate(profile, resolved.image, null, 'selftest')))
  if (preflight.facts.isolationVerified !== true || preflight.facts.noCad !== true || preflight.facts.normalTemplateSha256 !== normalSha || preflight.facts.selftestTemplateSha256 !== selftestSha
    || bootstrap.facts.normalTemplateSha256 !== normalSha || bootstrap.facts.selftestTemplateSha256 !== selftestSha
    || drained.facts.schedulerPaused !== true || drained.facts.noActiveOrUnknown !== true || !Number.isFinite(Date.parse(drained.facts.quiescenceCompletedAt))) fail('OPENSWX_REUSE_PRIOR_OPERATIONAL_CHAIN_INVALID')
  if ((drained.facts.drainKind === 'FIRST_PROVIDER_ONLY' && (bootstrap.facts.bootstrapKind !== 'FIRST_CREATE' || drained.facts.dbAdmissionProof !== 'NOT_APPLICABLE_FIRST_BOOTSTRAP'))
    || (drained.facts.drainKind === 'DAILY_DB_VERIFIED' && (bootstrap.facts.bootstrapKind !== 'DAILY_REFRESH' || drained.facts.dbAdmissionProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND'))
    || !['FIRST_PROVIDER_ONLY', 'DAILY_DB_VERIFIED'].includes(drained.facts.drainKind)) fail('OPENSWX_REUSE_PRIOR_OPERATIONAL_CHAIN_INVALID')
  if (drained.facts.drainKind === 'DAILY_DB_VERIFIED') {
    if (bootstrap.facts.resourceProvenance?.resourcesUnchanged !== true) fail('OPENSWX_REUSE_PRIOR_OPERATIONAL_CHAIN_INVALID')
    same(bootstrap.facts.pausedDrainedRef, bootstrapDescriptor.pausedDrainedRef); same(bootstrap.facts.priorActivationRef, drained.facts.priorActivationRef)
    same(drained.facts.targetWorkerBuildRef, bootstrapDescriptor.workerBuildRef)
    if (resolved.currentAssociation && !isPausedAppRepair(full)) same(drained.facts.priorActivationRef, resolved.currentAssociation.priorActivationRef)
  }
  const build = resolved.originBuild, buildRef = resolved.originBuildRef
  if (!Array.isArray(build.previousRefs) || build.previousRefs.length !== 1) fail('OPENSWX_REUSE_BUILD_ORIGIN_REF_INVALID')
  const buildOnlyRef = ownRef(build.previousRefs[0]), buildOnly = (await read(transport, buildOnlyRef)).value
  assertWorkerDescriptor(buildOnly, profile, build.workerProfileSha256, build.sourceRevision)
  if (buildOnly.schemaVersion !== 'aipdm.openswx-worker-descriptor.v1' || buildOnly.purpose !== 'build_only') fail('OPENSWX_REUSE_ORIGINAL_BUILD_ONLY_REQUIRED')
  assertWorkerReceipt(build, buildOnly, 'build', { actor: 'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com', image: activation.image })
  assertWorkerBuildSource(build, buildOnly)
  const approvedRef = ownRef(buildOnly.resourcePlanRef), approved = (await read(transport, approvedRef)).value
  if (approved.schemaVersion !== 'aipdm.openswx-approved-resource-plan.v1' || approved.ownerApplicationId !== 'ai-pdm' || approved.sourceRevision !== buildOnly.sourceRevision
    || approved.resourcePlanHash !== buildOnly.resourcePlanHash || approved.status !== 'APPROVED' || approved.releaseAuthority !== true || approved.evidenceScope !== 'HUMAN_APPROVED_RESOURCE_PLAN'
    || !H64.test(approved.authorizationStatementSha256 ?? '') || sha256(canonicalize(approved.plan)) !== approved.resourcePlanHash) fail('OPENSWX_REUSE_ORIGINAL_APPROVAL_INVALID')
  assertImmutableRef(approved.capacityGateRef, BUCKET, [WORKER_RECEIPT_PREFIX, 'receipts'])
  await read(transport, approved.capacityGateRef, [WORKER_RECEIPT_PREFIX, 'receipts']) // historical qualification, never current lease
  readSource.authorizeOrigin?.(build.sourceRevision)
  const originalProfile = readSource(WORKER_PROFILE_PATH, build.sourceRevision)
  if (sha256(originalProfile) !== build.workerProfileSha256 || sha256(originalProfile) !== PROFILE_SHA) fail('OPENSWX_REUSE_ORIGIN_PROFILE_INVALID')
  const applyRef = ownRef(bootstrap.facts.resourceApplyRef ?? bootstrap.facts.resourceProvenance?.priorResourceApplyRef), applied = (await read(transport, applyRef)).value
  if (applied.schemaVersion !== 'aipdm.openswx-resource-apply.v1' || applied.status !== 'APPLIED' || applied.actor !== profile.normalActor || applied.evidenceScope !== 'PRODUCTION_PROVIDER'
    || applied.resourcePlanHash !== approved.resourcePlanHash) fail('OPENSWX_REUSE_ORIGINAL_APPLY_INVALID')
  // Completed-first source reconciliation may name a later approved plan. Preserve
  // that exact applied chain and compare the immutable resource graph, never reapply.
  const appliedPlan = (await read(transport, applied.approvedPlanRef)).value
  if (appliedPlan.status !== 'APPROVED' || appliedPlan.releaseAuthority !== true || appliedPlan.evidenceScope !== 'HUMAN_APPROVED_RESOURCE_PLAN'
    || appliedPlan.sourceRevision !== applied.sourceRevision || appliedPlan.resourcePlanHash !== applied.resourcePlanHash || sha256(canonicalize(appliedPlan.plan)) !== applied.resourcePlanHash) fail('OPENSWX_REUSE_ORIGINAL_APPLY_INVALID')
  return { prior: { activation, activationRef: priorActivationRef, capsule, capsuleRef, descriptor: full, descriptorRef: fullRef, bootstrapDescriptor, bootstrapDescriptorRef, build, bootstrap, template, entry },
    build, buildRef, buildOnly, buildOnlyRef, approved, approvedRef, applyRef, applied, appliedPlan, originalCapsule: resolved.origin?.originalCapsule ?? capsule,
    originalRefs: { priorReadyCapsuleRef: capsuleRef, priorReadyFullDescriptorRef: fullRef, originalBuildReceiptRef: buildRef, originalBuildOnlyDescriptorRef: buildOnlyRef, originalApprovedResourcePlanRef: approvedRef },
    historyDepth: (resolved.currentAssociation ? 1 + (resolved.origin?.historyDepth ?? 0) : 0) + Number(isPausedAppRepair(full)) }
  })
  })
  })
  })
  })
}
function assertAssociation(value, descriptor, profile, repair = false) {
  exact(value, [...ASSOCIATION_KEYS, ...(repair ? ['resourceBasis'] : [])])
  if (value.schemaVersion !== `aipdm.openswx-worker-build-association.v${repair ? 2 : 1}` || (repair && value.resourceBasis !== 'PAUSED_APP_REPAIR') || value.ownerApplicationId !== 'ai-pdm' || value.status !== 'PASS' || value.evidenceScope !== 'PRODUCTION_PROVIDER_REUSE'
    || value.sourceRevision !== descriptor.sourceRevision || value.sourceArchiveSha256 !== descriptor.sourceArchiveSha256 || value.workerProfileSha256 !== descriptor.workerProfileSha256
    || value.resourcePlanHash !== descriptor.resourcePlanHash || value.jobName !== workerJobName() || value.actor !== profile.normalActor || !value.image?.startsWith(`${profile.artifactUri}@sha256:`)
    || !H64.test(value.image.split('@sha256:')[1] ?? '')) fail('OPENSWX_REUSE_ASSOCIATION_INVALID')
  time(value.observedAt); ownRef(value.requestRef); ownRef(value.priorActivationRef); assertImmutableRef(value.sourceLockRef, BUCKET, ['receipts'])
  const p = value.executableProof, o = value.artifactOrigin, r = value.resourceAssociation, s = value.securityEvidence
  exact(p, PROOF_KEYS); exact(o, ORIGIN_KEYS); exact(r, RESOURCE_KEYS); exact(s, SECURITY_KEYS)
  for (const key of ['originalManifestRef', 'currentManifestRef']) ownRef(p[key])
  for (const key of ['priorReadyFullDescriptorRef', 'originalBuildReceiptRef', 'originalBuildOnlyDescriptorRef', 'originalApprovedResourcePlanRef']) ownRef(o[key])
  releaseCapsuleRef(o.priorReadyCapsuleRef)
  exact(o.sourceObject, ['uri', 'sha256', 'generation', 'crc32c']); assertImmutableRef({ uri: o.sourceObject.uri, sha256: o.sourceObject.sha256 }, BUCKET, ['source'])
  if (!H40.test(o.sourceRevision) || !H64.test(o.sourceArchiveSha256) || !H64.test(o.workerProfileSha256) || !H64.test(o.buildRequestSha256)
    || o.sourceObject.sha256 !== o.sourceArchiveSha256 || !/^[1-9][0-9]*$/u.test(o.sourceObject.generation) || typeof o.sourceObject.crc32c !== 'string' || !o.sourceObject.crc32c
    || !/^[a-f0-9-]{36}$/u.test(o.buildId) || o.image !== value.image) fail('OPENSWX_REUSE_ORIGIN_INVALID')
  for (const name of ['createTime', 'startTime', 'finishTime']) time(o[name])
  for (const names of [o.provenance, o.sbom]) if (rows(names, 100).some(name => !/^projects\/(?:jenfu-platform-prod|9536592944)\/(?:locations\/asia-east1\/)?occurrences\/[A-Za-z0-9-]+$/u.test(name))) fail('OPENSWX_REUSE_OCCURRENCE_INVALID')
  if (p.method !== 'aipdm.openswx-finite-worker-inputs.v1' || p.equal !== true || p.effectiveRecipeSha256 !== DOCKER_SHA || p.target !== 'finite-worker' || p.builder !== BUILDER) fail('OPENSWX_REUSE_EXECUTABLE_INVALID')
  same(p.effectiveArgs, { READER_SOURCE: READER }); same(p.ignoredArgNames, IGNORED_ARGS); exact(p.originalSubmittedArgs, [...IGNORED_ARGS, 'READER_SOURCE'])
  for (const value of Object.values(p.originalSubmittedArgs)) if (typeof value !== 'string' || !value || value.length > 128) fail('OPENSWX_REUSE_ARG_INVALID')
  for (const key of ['infraManifestRef', 'readbackRef', 'originalApprovedResourcePlanRef', 'originalResourceApplyRef']) ownRef(r[key])
  if (r.resourcePlanHash !== value.resourcePlanHash || r.resourcesUnchanged !== true) fail('OPENSWX_REUSE_RESOURCE_INVALID')
  same(r.originalApprovedResourcePlanRef, o.originalApprovedResourcePlanRef)
  ownRef(s.readbackRef); time(s.observedAt)
  if (s.policySha256 !== sha256(canonicalize(POLICY)) || s.image !== value.image || s.rawHighOrCriticalVulnerabilityCount !== 0 || s.blockingVulnerabilityCount !== 0) fail('OPENSWX_REUSE_SECURITY_INVALID')
  return value
}
export function assertWorkerBuildAssociation(value, descriptor, profile) {
  if (value?.schemaVersion === 'aipdm.openswx-worker-build-association.v2' && !isPausedAppRepair(descriptor)) fail('OPENSWX_REUSE_REPAIR_DESCRIPTOR_REQUIRED')
  return assertAssociation(value, descriptor, profile, isPausedAppRepair(descriptor))
}
/** Origin remains an original v1 receipt. Associations are never receipt clones. */
export async function resolveWorkerArtifact({ transport, descriptor, profile, readSource, buildRef = descriptor.workerBuildRef, ctx = context() }) {
  return runAiPdmEvidenceContext(ctx, async () => {
  if (descriptor.schemaVersion === 'aipdm.openswx-worker-descriptor.v1') {
    const build = (await read(transport, buildRef)).value
    assertWorkerReceipt(build, descriptor, 'build')
    return { currentAssociation: null, originBuild: build, originBuildRef: buildRef, originDescriptor: descriptor, image: build.image, sourceEntryProof: assertWorkerBuildSource(build, descriptor), graphContext: ctx }
  }
  if ((!isPausedAppRepair(descriptor) && descriptor.schemaVersion !== 'aipdm.openswx-worker-descriptor.v2') || descriptor.artifactMode !== 'REUSE_VERIFIED' || typeof readSource !== 'function') fail('OPENSWX_REUSE_RESOLVER_INVALID')
  if (isPausedAppRepair(descriptor)) assertWorkerDescriptor(descriptor, profile, descriptor.workerProfileSha256, descriptor.sourceRevision)
  same(buildRef, descriptor.workerBuildRef)
  return resolveAssociation({ transport, descriptor, profile, readSource, buildRef, ctx, repair: isPausedAppRepair(descriptor) })
  })
}
async function resolveAssociation({ transport, descriptor, profile, readSource, buildRef, ctx, repair }) {
  const next = descend(ctx, buildRef)
  return runAiPdmEvidenceContext(next, async () => {
  const association = assertAssociation((await read(transport, buildRef)).value, descriptor, profile, repair)
  const lockRow = await read(transport, association.sourceLockRef, ['receipts']), lock = lockRow.value
  assertReuseSourceLock(lock, descriptor.sourceRevision)
  admitAiPdmEvidenceSource(lockRow)
  const origin = await readOrigin({ transport, priorActivationRef: association.priorActivationRef, profile, readSource, ctx: next })
  for (const [key, ref] of Object.entries(origin.originalRefs)) same(association.artifactOrigin[key], ref)
  for (const name of ['sourceRevision', 'sourceArchiveSha256', 'workerProfileSha256', 'image']) same(association.artifactOrigin[name], origin.build[name])
  same(association.artifactOrigin.sourceObject, origin.build.facts.sourceObject); same(association.resourceAssociation.originalResourceApplyRef, origin.applyRef)
  const request = (await read(transport, association.requestRef)).value
  exact(request, ['schemaVersion', 'inputRef', 'sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'priorActivationRef', 'actor', 'requestedAt'])
  if (request.schemaVersion !== `aipdm.openswx-worker-reuse-request.v${repair ? 2 : 1}` || request.actor !== profile.normalActor || request.sourceRevision !== descriptor.sourceRevision || request.sourceArchiveSha256 !== descriptor.sourceArchiveSha256) fail('OPENSWX_REUSE_REQUEST_INVALID')
  same(request.sourceLockRef, association.sourceLockRef); same(request.priorActivationRef, association.priorActivationRef); ownRef(request.inputRef); time(request.requestedAt)
  const input = assertWorkerReuseInput((await read(transport, request.inputRef)).value, { historical: true })
  if ((input.schemaVersion === 'aipdm.openswx-worker-reuse-input.v2') !== repair) fail('OPENSWX_REUSE_REQUEST_INVALID')
  same(input.sourceLockRef, request.sourceLockRef); same(input.priorActivationRef, request.priorActivationRef)
  if (input.currentSourceObjectRef.sha256 !== request.sourceArchiveSha256) fail('OPENSWX_REUSE_REQUEST_INVALID')
  const original = (await read(transport, association.executableProof.originalManifestRef)).value, current = (await read(transport, association.executableProof.currentManifestRef)).value
  manifestEqual(original, current)
  if (original.sourceRevision !== origin.build.sourceRevision || current.sourceRevision !== descriptor.sourceRevision) fail('OPENSWX_REUSE_MANIFEST_INVALID')
  const infra = (await read(transport, association.resourceAssociation.infraManifestRef)).value
  exact(infra, ['schemaVersion', 'sourceRevision', 'sourceHashes', 'plan', 'resourcePlanHash', 'originalApprovedResourcePlanRef', 'originalResourceApplyRef'])
  if (infra.schemaVersion !== 'aipdm.openswx-reuse-infra-manifest.v1' || infra.sourceRevision !== descriptor.sourceRevision || infra.resourcePlanHash !== descriptor.resourcePlanHash || sha256(canonicalize(infra.plan)) !== descriptor.resourcePlanHash) fail('OPENSWX_REUSE_INFRA_INVALID')
  same(infra.originalApprovedResourcePlanRef, origin.approvedRef); same(infra.originalResourceApplyRef, origin.applyRef)
  same(infra.sourceHashes, OPENSWX_TERRAFORM_PATHS.map(name => ({ path: name, sha256: sha256(readSource(name, descriptor.sourceRevision)) })))
  same(infra.plan, infraPlan(profile, infra.sourceHashes)); same(infra.plan, origin.approved.plan)
  const resource = (await read(transport, association.resourceAssociation.readbackRef)).value
  const serving = repair ? await validateRepairBaseline({ transport, baseline: resource, baselineRef: association.resourceAssociation.readbackRef, association, descriptor, input, inputRef: request.inputRef, origin, profile, readSource, ctx: next }) : null
  if (!repair) assertReadyProof(resource, association, origin, profile)
  const security = (await read(transport, association.securityEvidence.readbackRef)).value
  exact(security, ['schemaVersion', 'image', 'observedAt', 'policySha256', 'build', 'artifactRegistry', 'occurrences', 'rawHighOrCriticalVulnerabilityCount', 'blockingVulnerabilityCount'])
  if (security.schemaVersion !== 'aipdm.openswx-reuse-security-readback.v1' || security.image !== association.image || security.policySha256 !== association.securityEvidence.policySha256 || security.observedAt !== association.securityEvidence.observedAt) fail('OPENSWX_REUSE_SECURITY_INVALID')
  assertSecurity(security, origin, profile)
  same(association.artifactOrigin.buildRequestSha256, sha256(canonicalize(buildRequest(security.build, origin, profile))))
  for (const name of ['buildId', 'createTime', 'startTime', 'finishTime']) same(association.artifactOrigin[name], name === 'buildId' ? security.build.id : security.build[name])
  return { currentAssociation: association, associationRef: buildRef, originBuild: origin.build, originBuildRef: origin.buildRef, originDescriptor: origin.buildOnly,
    image: origin.build.image, sourceEntryProof: assertWorkerBuildSource(origin.build, origin.buildOnly), origin, originalManifest: original, currentManifest: current, input,
    bootstrapDescriptor: origin.prior.bootstrapDescriptor ?? origin.prior.descriptor, bootstrapDescriptorRef: origin.prior.bootstrapDescriptorRef ?? origin.prior.descriptorRef,
    ...(repair ? { pausedBaseline: resource, pausedBaselineRef: association.resourceAssociation.readbackRef, servingGraph: serving.graph } : {}), graphContext: next }
  })
}
function infraPlan(profile, sourceHashes) { return { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, sourceHashes, resourceAddresses: OPENSWX_TERRAFORM_ADDRESSES, allowedActions: ['create', 'no-op'] } }
async function named(transport, uri, prefixes = ['receipts']) {
  const row = await transport.readBytes(uri, { prefixes })
  if (!Buffer.isBuffer(row.bytes) || row.ref?.uri !== uri || sha256(row.bytes) !== row.ref?.sha256) fail('OPENSWX_REPAIR_REF_INVALID')
  return { ...row, value: JSON.parse(row.bytes.toString('utf8')) }
}
/** The serving application and last READY worker are distinct sealed histories. */
async function readServingRepairBasis({ transport, servingCapsuleRef, origin, profile, readSource, ctx, recorded = null }) {
  const child = descend(ctx, servingCapsuleRef, true, releaseCapsuleRef)
  const capsule = await read(transport, releaseCapsuleRef(servingCapsuleRef), ['receipts/releases'])
  const lock = await read(transport, capsule.value.sourceLockRef, ['receipts'])
  assertReuseSourceLock(lock.value, capsule.value.sourceRevision); admitAiPdmEvidenceSource(lock)
  if (lock.value.releaseId !== capsule.value.releaseId || lock.value.sourceSha256 !== capsule.value.sourceSha256 || lock.value.migrationManifestSha256 !== capsule.value.migrationManifestSha256) fail('OPENSWX_REPAIR_SERVING_INVALID')
  readSource.authorizeOrigin?.(capsule.value.sourceRevision)
  const appProfile = JSON.parse(readSource(APP_PROFILE, capsule.value.sourceRevision))
  const intent = assertDev117ReleaseIntent(capsule.value, appProfile), paths = releasePaths(appProfile, intent, servingCapsuleRef.sha256)
  const terminal = await named(transport, paths.terminal), canonical = await named(transport, paths.canonical), finalized = await named(transport, paths.finalize)
  const prepare = await named(transport, paths.prepare), migrate = await named(transport, paths.migrate)
  if (typeof transport.readOwnerSourceProof !== 'function') fail('OPENSWX_REPAIR_SOURCE_PROOF_REQUIRED')
  const graph = await runAiPdmEvidenceContext(child, async () => {
    const observed = await transport.readOwnerSourceProof({ profile: appProfile, sourceRevision: intent.sourceRevision, refs: { prepare: prepare.ref, migrate: migrate.ref, terminal: terminal.ref }, verifyProvider: true })
    if (observed.proof?.disposition !== 'released' || observed.provider?.status !== 'BUILD_IMAGE_VERIFIED') fail('OPENSWX_REPAIR_SERVING_INVALID')
    return readAiPdmObservationInputs(observed.proof)
  })
  same(graph.intentRef, servingCapsuleRef); same(graph.chain.canonical.ref, canonical.ref); same(graph.chain.finalize.ref, finalized.ref)
  const runtimeRow = await read(transport, intent.runtimeConfigRef, ['receipts']), runtime = runtimeRow.value.runtimeConfig ?? runtimeRow.value
  const readyIdentity = canonicalize(servingCapsuleRef) === canonicalize(origin.prior.capsuleRef) && canonicalize(intent.openswxWorkerRef) === canonicalize(origin.prior.descriptorRef)
  const workerStatus = readyIdentity ? 'READY' : finalized.value.facts?.openswxWorker?.status
  if (terminal.value.facts.result !== 'RELEASED'
    || !['READY', 'ACTIVATION_PENDING'].includes(workerStatus) || canonical.value.facts.origin !== profile.canonicalOrigin) fail('OPENSWX_REPAIR_SERVING_INVALID')
  const workerRef = intent.openswxWorkerRef, worker = (await read(transport, workerRef)).value
  let predecessorBaselineRef = null, continuationDepth = 1
  if (workerStatus === 'READY') {
    same(servingCapsuleRef, origin.prior.capsuleRef); same(workerRef, origin.prior.descriptorRef)
  } else {
    assertWorkerDescriptor(worker, profile, worker.workerProfileSha256, intent.sourceRevision)
    if (!isPausedAppRepair(worker) || worker.tokenSecretVersion !== origin.prior.descriptor.tokenSecretVersion || worker.registrySecretVersion !== origin.prior.descriptor.registrySecretVersion) fail('OPENSWX_REPAIR_SERVING_INVALID')
    same(worker.priorActivationRef, origin.prior.activationRef); same(worker.retainedWorkerDescriptorRef, origin.prior.bootstrapDescriptorRef)
    predecessorBaselineRef = worker.pausedBaselineRef
    const predecessor = await read(transport, predecessorBaselineRef)
    assertPausedRepairBaseline(predecessor.value, profile)
    continuationDepth = predecessor.value.continuationDepth + 1
    if (continuationDepth > 8) fail('OPENSWX_REPAIR_CONTINUATION_DEPTH')
  }
  if (runtime.plainEnvironment?.PDM_OPENSWX_DISPATCH_ENABLED !== '1' || runtime.secretVersions?.PDM_WORKLOAD_AUTH_CREDENTIALS !== worker.registrySecretVersion.split('/').at(-1)) fail('OPENSWX_REPAIR_SERVING_INVALID')
  same(runtime.openswxWorker?.descriptorRef, workerRef)
  const raw = [], observedAt = transport.now(), service = recorded ? recorded.service : await transport.getService(appProfile)
  if (!recorded) raw.push({ url: `https://run.googleapis.com/v2/projects/${appProfile.target.projectId}/locations/${appProfile.target.region}/services/${appProfile.target.serviceName}`, method: 'GET', observedAt: transport.now(), body: structuredClone(service), api: 'APP_SERVICE' })
  transport.assertServiceSettled(service); transport.assertCanonicalEntrypoint(appProfile, service)
  const revisionName = canonical.value.facts.candidateRevision
  if (transport.effectiveRevision(service) !== revisionName || (service.traffic ?? []).some(row => row.tag) || !service.etag) fail('OPENSWX_REPAIR_SERVING_INVALID')
  const revision = recorded ? recorded.revision : await transport.getRevision(appProfile, revisionName)
  if (!recorded) raw.push({ url: `https://run.googleapis.com/v2/projects/${appProfile.target.projectId}/locations/${appProfile.target.region}/services/${appProfile.target.serviceName}/revisions/${revisionName}`, method: 'GET', observedAt: transport.now(), body: structuredClone(revision), api: 'APP_REVISION' })
  transport.assertRevisionReady(appProfile, revision, graph.chain.deployment.value.artifactDigest, graph.chain.candidate.value.facts.cloudSqlProxyResolvedImage, { runtimeConfig: runtime, origin: graph.chain.candidate.value.facts.tagUri })
  let admission = null
  if (!recorded) {
    const control = await named(transport, paths.control, ['control'])
    exact(control.value, ['schemaVersion', 'inputFingerprint', 'ownerApplicationId', 'service', 'controlBucket', 'releaseId', 'sourceRevision', 'sourceLockSha256', 'candidateRevision', 'previousRevision', 'ownerRunRef', 'leaseExpiresAt', 'deadlineAt', 'state', 'result', 'controlSha256'], 'OPENSWX_REPAIR_SERVING_INVALID')
    const { controlSha256, ...controlCore } = control.value
    if (controlSha256 !== sha256(canonicalize(controlCore)) || control.value.schemaVersion !== 'jenfu.dev012.owner-control-head.v1'
      || control.value.ownerApplicationId !== 'ai-pdm' || control.value.service !== appProfile.target.serviceName || control.value.controlBucket !== BUCKET
      || control.value.state !== 'FINALIZED' || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(control.value.releaseId ?? '')
      || !H40.test(control.value.sourceRevision ?? '') || !H64.test(control.value.sourceLockSha256 ?? '')
      || !H64.test(control.value.inputFingerprint ?? '') || !Number.isFinite(Date.parse(control.value.leaseExpiresAt)) || !Number.isFinite(Date.parse(control.value.deadlineAt))
      || !/^[1-9][0-9]*$/u.test(control.metadata?.generation ?? '')) fail('OPENSWX_REPAIR_SERVING_INVALID')
    if (control.value.result === 'RELEASED') {
      if (control.value.releaseId !== intent.releaseId || control.value.sourceRevision !== intent.sourceRevision
        || control.value.sourceLockSha256 !== intent.sourceLockRef.sha256 || control.value.deadlineAt !== intent.deadlineAt
        || control.value.candidateRevision !== revisionName || control.value.previousRevision !== intent.previousRevision) fail('OPENSWX_REPAIR_SERVING_INVALID')
    } else if (control.value.result === 'PRE_ACTIVATION_ABORTED') {
      const failed = await named(transport, `gs://${BUCKET}/receipts/releases/${control.value.releaseId}/release-intent.json`)
      const failedIntent = assertDev117ReleaseIntent(failed.value, appProfile)
      if (control.value.sourceRevision !== failedIntent.sourceRevision || control.value.sourceLockSha256 !== failedIntent.sourceLockRef.sha256
        || control.value.deadlineAt !== failedIntent.deadlineAt) fail('OPENSWX_REPAIR_SERVING_INVALID')
      const continuation = await readPreActivationAbortContinuation({ profile: appProfile, transport, baselineIntentRef: failed.ref, service, control: control.value, verifyProvider: true })
      if (continuation?.kind !== 'PRINCIPAL_ORDINARY_ABORT' || continuation.currentActiveRevision !== revisionName
        || continuation.authorityBasis?.previousRevision !== revisionName || continuation.authorityBasis.retainedArtifactDigest !== graph.chain.deployment.value.artifactDigest
        || continuation.authorityBasis.serviceUid !== service.uid) fail('OPENSWX_REPAIR_SERVING_INVALID')
      same(continuation.authorityBasis.failedIntentRef, failed.ref); same(continuation.authorityBasis.releasedIntentRef, servingCapsuleRef)
    } else fail('OPENSWX_REPAIR_SERVING_INVALID')
    admission = { controlRef: control.ref, controlGeneration: control.metadata.generation, serviceSha256: sha256(canonicalize(service)), appProfile }
  }
  return { servingApp: { capsuleRef: servingCapsuleRef, canonicalRef: canonical.ref, finalizeRef: finalized.ref, terminalRef: terminal.ref, runtimeConfigRef: intent.runtimeConfigRef, workerDescriptorRef: workerRef,
    sourceRevision: intent.sourceRevision, revision: revisionName, artifactDigest: graph.chain.deployment.value.artifactDigest, workerStatus, serviceEtag: service.etag, generalTrafficPercent: 100, tagCount: 0, canonicalOrigin: profile.canonicalOrigin }, predecessorBaselineRef, continuationDepth, raw, observedAt, graph, admission }
}
async function validateRepairBaseline({ transport, baseline, baselineRef, association, descriptor, input, inputRef, origin, profile, readSource, ctx }) {
  assertPausedRepairBaseline(baseline, profile)
  same(baseline.inputRef, inputRef); same(baseline.priorActivationRef, input.priorActivationRef); same(baseline.predecessorBaselineRef, input.predecessorBaselineRef)
  same(baseline.servingApp.capsuleRef, input.servingCapsuleRef); same(baseline.retainedWorkerDescriptorRef, origin.prior.bootstrapDescriptorRef)
  same(baseline.source, Object.fromEntries(SOURCE_BINDING_KEYS.map(key => [key, association[key]])))
  if (isPausedAppRepair(descriptor)) {
    same(descriptor.pausedBaselineRef, baselineRef); same(descriptor.priorActivationRef, baseline.priorActivationRef); same(descriptor.retainedWorkerDescriptorRef, baseline.retainedWorkerDescriptorRef)
    same(baseline.after.numericCredentials, { token: descriptor.tokenSecretVersion, registry: descriptor.registrySecretVersion })
  }
  if (baseline.after.image !== origin.build.image || baseline.after.normalTemplateSha256 !== sha256(canonicalize(origin.prior.template))) fail('OPENSWX_REPAIR_BASELINE_INVALID')
  const bodies = new Map()
  for (const row of baseline.providerReadbackRefs) bodies.set(row.bodyRef.uri, (await read(transport, row.bodyRef)).value)
  assertAiPdmPausedRepairReadbacks({ baseline, records: baseline.providerReadbackRefs.map(record => ({ record, body: bodies.get(record.bodyRef.uri) })) })
  for (const snapshot of [baseline.before, baseline.after]) for (const execution of snapshot.executions) {
    const page = bodies.get(execution.rawPageRef.uri), rows = page?.executions?.filter(row => canonicalWorkerExecution(row.name) === execution.name)
    if (rows?.length !== 1) fail('OPENSWX_REPAIR_EXECUTION_INVENTORY_INVALID')
    assertTerminalExecution(rows[0], execution.name)
    same({ name: canonicalWorkerExecution(rows[0].name), createTime: rows[0].createTime, completionTime: rows[0].completionTime, completedState: rows[0].conditions.find(row => row.type === 'Completed').state }, { name: execution.name, createTime: execution.createTime, completionTime: execution.completionTime, completedState: execution.completedState })
  }
  const appRecords = api => baseline.providerReadbackRefs.filter(row => row.api === api)
  if (appRecords('APP_SERVICE').length !== 1 || appRecords('APP_REVISION').length !== 1) fail('OPENSWX_REPAIR_READBACK_INVALID')
  const serving = await readServingRepairBasis({ transport, servingCapsuleRef: input.servingCapsuleRef, origin, profile, readSource, ctx,
    recorded: { service: bodies.get(appRecords('APP_SERVICE')[0].bodyRef.uri), revision: bodies.get(appRecords('APP_REVISION')[0].bodyRef.uri) } })
  // Immutable serving joins are replayed; live etag may change only in a later current check.
  const { serviceEtag: _old, ...saved } = baseline.servingApp, { serviceEtag: _new, ...actual } = serving.servingApp
  same(saved, actual); same(baseline.predecessorBaselineRef, serving.predecessorBaselineRef)
  if (baseline.continuationDepth !== serving.continuationDepth) fail('OPENSWX_REPAIR_BASELINE_INVALID')
  return serving
}
function buildRequest(build, origin, profile) {
  const old = origin.build.facts.cloudBuild, source = origin.build.facts.sourceObject, parsed = source.uri.slice(`gs://${BUCKET}/`.length)
  const step = build.steps?.[0], args = step?.args, version = args?.[args.indexOf('SOURCE_CREATED_AT=1970-01-01T00:00:00Z') + 2]?.replace(/^SOURCE_VERSION=/u, '')
  const tag = `${profile.artifactUri}:release-${origin.build.sourceRevision}`
  const tree = origin.originalCapsule.sourceSha256
  const expectedArgs = ['build', '--pull=false', '--no-cache', '--file', `${READER}/Dockerfile`, '--target', 'finite-worker', '--build-arg', `SOURCE_REVISION=${origin.build.sourceRevision}`, '--build-arg', `SOURCE_TREE=${tree}`, '--build-arg', 'SOURCE_CREATED_AT=1970-01-01T00:00:00Z', '--build-arg', `SOURCE_VERSION=${version}`, '--build-arg', 'SOURCE_STATE=frozen', '--tag', tag, '--build-arg', `READER_SOURCE=${READER}`, '.']
  if (!/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(version ?? '') || build.steps?.length !== 1 || step.name !== BUILDER || step.dir !== 'source') fail('OPENSWX_REUSE_PROVIDER_REQUEST_INVALID')
  same(args, expectedArgs, 'OPENSWX_REUSE_PROVIDER_REQUEST_INVALID'); same(old.steps?.[0]?.args, args, 'OPENSWX_REUSE_PROVIDER_REQUEST_INVALID')
  if (build.id !== old.id || !/^[a-f0-9-]{36}$/u.test(build.id ?? '') || build.status !== 'SUCCESS' || build.projectId !== profile.projectId
    || build.serviceAccount !== `projects/${profile.projectId}/serviceAccounts/aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com`
    || build.options?.requestedVerifyOption !== 'VERIFIED' || build.options?.logging !== 'GCS_ONLY' || build.options?.logStreamingOption !== 'STREAM_OFF'
    || build.timeout !== '1800s' || build.queueTtl !== '300s' || build.logsBucket !== `gs://${BUCKET}/logs/cloud-build`) fail('OPENSWX_REUSE_PROVIDER_BUILD_INVALID')
  const storage = { bucket: BUCKET, object: parsed, generation: source.generation }
  same(build.source?.storageSource, storage); same(build.sourceProvenance?.resolvedStorageSource, storage)
  const fileHash = build.sourceProvenance?.fileHashes?.[`${source.uri}#${source.generation}`]?.fileHash
  if (!Array.isArray(fileHash) || fileHash.filter(row => row.type === 'SHA256' && Buffer.from(row.value ?? '', 'base64').toString('hex') === source.sha256).length !== 1) fail('OPENSWX_REUSE_PROVIDER_SOURCE_HASH_INVALID')
  const image = build.results?.images?.filter(row => row.name === tag)
  if (image?.length !== 1 || `${profile.artifactUri}@${image[0].digest}` !== origin.build.image) fail('OPENSWX_REUSE_PROVIDER_DIGEST_INVALID')
  same(build.images, [tag]); same(build.tags, ['dev-012', 'ai-pdm', version.toLowerCase()])
  for (const key of ['createTime', 'startTime', 'finishTime']) { time(build[key]); same(build[key], old[key]) }
  if (time(build.createTime) > time(build.startTime) || time(build.startTime) > time(build.finishTime)) fail('OPENSWX_REUSE_PROVIDER_TIME_INVALID')
  return { source: { storageSource: storage }, steps: [{ name: BUILDER, dir: 'source', args }], images: [tag], timeout: '1800s', queueTtl: '300s', logsBucket: build.logsBucket, serviceAccount: build.serviceAccount,
    options: { logging: 'GCS_ONLY', logStreamingOption: 'STREAM_OFF', requestedVerifyOption: 'VERIFIED' }, tags: build.tags }
}
function assertSecurity(security, origin, profile) {
  buildRequest(security.build, origin, profile)
  if (security.artifactRegistry?.uri !== origin.build.image || security.artifactRegistry.name !== `projects/${profile.projectId}/locations/${profile.location}/repositories/aipdm-release/dockerImages/ai-pdm-openswx-worker@${origin.build.image.split('@')[1]}`) fail('OPENSWX_REUSE_ARTIFACT_INVALID')
  const occurrences = rows(security.occurrences, 10000), names = new Set(), url = `https://${origin.build.image}`
  for (const row of occurrences) {
    if (!['BUILD', 'DISCOVERY', 'SBOM_REFERENCE', 'VULNERABILITY'].includes(row.kind) || row.resourceUri !== url || typeof row.name !== 'string' || names.has(row.name)) fail('OPENSWX_REUSE_OCCURRENCE_INVALID')
    names.add(row.name)
  }
  for (const name of origin.build.facts.provenance) if (!occurrences.some(row => row.name === name && row.kind === 'BUILD')) fail('ARTIFACT_SECURITY_METADATA_REFRESH_REQUIRED')
  for (const name of origin.build.facts.sbom) if (!occurrences.some(row => row.name === name && row.kind === 'SBOM_REFERENCE')) fail('ARTIFACT_SECURITY_METADATA_REFRESH_REQUIRED')
  const discoveries = occurrences.filter(row => row.kind === 'DISCOVERY')
  if (discoveries.length !== 1) fail('ARTIFACT_SECURITY_METADATA_REFRESH_REQUIRED')
  const d = discoveries[0].discovery
  if (d?.analysisStatus !== 'FINISHED_SUCCESS' || d.continuousAnalysis !== 'ACTIVE' || Object.hasOwn(d, 'archiveTime') || Object.hasOwn(d, 'analysisError')
    || (d.analysisStatusError && (typeof d.analysisStatusError !== 'object' || Array.isArray(d.analysisStatusError) || (d.analysisStatusError.code ?? 0) !== 0))
    || !Number.isFinite(Date.parse(d.lastScanTime)) || Date.parse(d.lastScanTime) > time(security.observedAt)) fail('ARTIFACT_SECURITY_METADATA_REFRESH_REQUIRED')
  const vulnerabilities = occurrences.filter(row => row.kind === 'VULNERABILITY')
  // Provider Severity enum: MINIMAL/LOW/MEDIUM/HIGH/CRITICAL. The enum's
  // SEVERITY_UNSPECIFIED represents unknown metadata, never a clean scan.
  const knownSeverity = new Set(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  for (const row of vulnerabilities) {
    const value = row.vulnerability
    if (!value || typeof value !== 'object' || Array.isArray(value) || !knownSeverity.has(value.severity)
      || (Object.hasOwn(value, 'effectiveSeverity') && !knownSeverity.has(value.effectiveSeverity))) fail('ARTIFACT_SECURITY_METADATA_REFRESH_REQUIRED')
  }
  const raw = vulnerabilities.filter(row => ['HIGH', 'CRITICAL'].includes(row.vulnerability.severity)).length
  const blocking = vulnerabilities.filter(row => ['HIGH', 'CRITICAL'].includes(Object.hasOwn(row.vulnerability, 'effectiveSeverity') ? row.vulnerability.effectiveSeverity : row.vulnerability.severity)).length
  if (raw || blocking || security.rawHighOrCriticalVulnerabilityCount !== 0 || security.blockingVulnerabilityCount !== 0) fail('OPENSWX_ARTIFACT_POLICY_FAILED')
}
async function providerSecurity(transport, origin, profile) {
  const build = await transport.request(`https://cloudbuild.googleapis.com/v1/projects/${profile.projectId}/locations/${profile.location}/builds/${origin.build.facts.cloudBuild.id}`)
  buildRequest(build, origin, profile)
  const parent = `projects/${profile.projectId}/locations/${profile.location}/repositories/aipdm-release`
  const artifactRegistry = await transport.request(`https://artifactregistry.googleapis.com/v1/${parent}/dockerImages/ai-pdm-openswx-worker@${origin.build.image.split('@')[1]}`)
  const occurrences = []
  for (const kind of ['BUILD', 'DISCOVERY', 'SBOM_REFERENCE', 'VULNERABILITY']) {
    let token = ''; const tokens = new Set()
    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({ filter: `kind="${kind}" AND resourceUrl="https://${origin.build.image}"`, pageSize: '100', ...(token ? { pageToken: token } : {}) })
      const body = await transport.request(`https://containeranalysis.googleapis.com/v1/projects/${profile.projectId}/occurrences?${query}`)
      if (body.occurrences !== undefined && !Array.isArray(body.occurrences)) fail('OPENSWX_REUSE_OCCURRENCE_INVALID')
      if ((body.occurrences ?? []).some(row => row.kind !== kind || row.resourceUri !== `https://${origin.build.image}`)) fail('OPENSWX_REUSE_OCCURRENCE_INVALID')
      occurrences.push(...(body.occurrences ?? [])); token = body.nextPageToken ?? ''
      if (typeof token !== 'string' || token.length > 4096 || (token && tokens.has(token))) fail('OPENSWX_REUSE_OCCURRENCE_PAGE_INVALID')
      if (!token) break
      tokens.add(token); if (page === 19) fail('OPENSWX_REUSE_OCCURRENCE_PAGE_LIMIT')
    }
  }
  const security = { schemaVersion: 'aipdm.openswx-reuse-security-readback.v1', image: origin.build.image, observedAt: transport.now(), policySha256: sha256(canonicalize(POLICY)), build, artifactRegistry, occurrences, rawHighOrCriticalVulnerabilityCount: 0, blockingVulnerabilityCount: 0 }
  assertSecurity(security, origin, profile); return security
}
async function sourceObject(transport, ref, expected = null) {
  assertImmutableRef(ref, BUCKET, ['source'])
  const result = await transport.readBytes(ref.uri, { prefixes: ['source'], expectedSha256: ref.sha256 })
  if (!Buffer.isBuffer(result.bytes) || sha256(result.bytes) !== ref.sha256 || !/^[1-9][0-9]*$/u.test(String(result.metadata?.generation ?? '')) || typeof result.metadata?.crc32c !== 'string' || !result.metadata.crc32c) fail('OPENSWX_REUSE_SOURCE_OBJECT_INVALID')
  const object = { ...ref, generation: String(result.metadata.generation), crc32c: result.metadata.crc32c }
  if (expected) same(object, expected, 'OPENSWX_REUSE_SOURCE_GENERATION_INVALID')
  return { ...result, object }
}
const READY_KEYS = ['schemaVersion', 'ownerApplicationId', 'purpose', 'status', 'evidenceScope', 'sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'workerProfileSha256', 'resourcePlanHash', 'priorActivationRef', 'priorReadyFullDescriptorRef', 'originalApprovedResourcePlanRef', 'actor', 'observedAt', 'observationStartedAt', 'observationCompletedAt', 'image', 'numericCredentials', 'normalTemplateSha256', 'schedulerPolicySha256', 'schedulerState', 'jobName', 'jobEtagBefore', 'jobEtagAfter', 'jobGeneration', 'schedulerUserUpdateTime', 'secretMetadata', 'iamSha256', 'providerReadbackRefs', 'resourcesUnchanged', 'mutationPerformed', 'quiescenceClaimed']
function assertReadyProof(value, association, origin, profile) {
  exact(value, READY_KEYS)
  if (value.schemaVersion !== 'aipdm.openswx-current-ready-resource-readback.v1' || value.ownerApplicationId !== 'ai-pdm' || value.purpose !== 'CURRENT_READY_PRE_REUSE_READBACK' || value.status !== 'PASS' || value.evidenceScope !== 'PRODUCTION_PROVIDER_READBACK'
    || value.actor !== profile.normalActor || value.image !== origin.build.image || value.schedulerState !== 'ENABLED' || value.jobName !== workerJobName() || value.resourcesUnchanged !== true || value.mutationPerformed !== false || value.quiescenceClaimed !== false
    || typeof value.jobEtagBefore !== 'string' || !value.jobEtagBefore || value.jobEtagAfter !== value.jobEtagBefore || !/^[1-9][0-9]*$/u.test(value.jobGeneration ?? '') || !H64.test(value.schedulerPolicySha256 ?? '') || !H64.test(value.iamSha256 ?? '')) fail('OPENSWX_REUSE_READY_PROOF_INVALID')
  for (const name of ['sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'workerProfileSha256', 'resourcePlanHash', 'priorActivationRef']) same(value[name], association[name])
  same(value.priorReadyFullDescriptorRef, origin.prior.descriptorRef); same(value.originalApprovedResourcePlanRef, origin.approvedRef)
  same(value.numericCredentials, { token: origin.prior.descriptor.tokenSecretVersion, registry: origin.prior.descriptor.registrySecretVersion })
  if (value.normalTemplateSha256 !== sha256(canonicalize(origin.prior.template)) || time(value.observationStartedAt) > time(value.observationCompletedAt) || time(value.observedAt) < time(value.observationCompletedAt)) fail('OPENSWX_REUSE_READY_PROOF_INVALID')
  if (value.schedulerUserUpdateTime !== null) time(value.schedulerUserUpdateTime)
  if (rows(value.secretMetadata, 2).length !== 2) fail('OPENSWX_REUSE_READY_PROOF_INVALID')
  for (const [index, row] of value.secretMetadata.entries()) {
    exact(row, ['name', 'state', 'etag']); if (row.name !== value.numericCredentials[['token', 'registry'][index]] || row.state !== 'ENABLED' || typeof row.etag !== 'string' || !row.etag) fail('OPENSWX_REUSE_READY_PROOF_INVALID')
  }
  for (const row of rows(value.providerReadbackRefs, 64)) { exact(row, ['url', 'ref']); ownRef(row.ref); if (typeof row.url !== 'string' || (!/^https:\/\/(?:run|iam|secretmanager|cloudscheduler)\.googleapis\.com\/v[12]\//u.test(row.url) && row.url !== `https://cloudresourcemanager.googleapis.com/v1/projects/${profile.projectId}:getIamPolicy`)) fail('OPENSWX_REUSE_READY_PROOF_INVALID') }
}
export function assertWorkerReuseInput(value, { historical = false } = {}) {
  const repair = value?.schemaVersion === 'aipdm.openswx-worker-reuse-input.v2'
  exact(value, ['schemaVersion', 'sourceLockRef', 'currentSourceObjectRef', 'priorActivationRef', 'deadlineAt', 'receiptId', ...(repair ? ['servingCapsuleRef', 'predecessorBaselineRef'] : [])], 'OPENSWX_REUSE_INPUT_INVALID')
  if ((!repair && value.schemaVersion !== 'aipdm.openswx-worker-reuse-input.v1') || !/^[A-Za-z0-9-]{6,100}$/u.test(value.receiptId ?? '')) fail('OPENSWX_REUSE_INPUT_INVALID')
  if (repair) { releaseCapsuleRef(value.servingCapsuleRef); if (value.predecessorBaselineRef !== null) ownRef(value.predecessorBaselineRef) }
  assertImmutableRef(value.sourceLockRef, BUCKET, ['receipts']); assertImmutableRef(value.currentSourceObjectRef, BUCKET, ['source']); ownRef(value.priorActivationRef)
  if (!safePath(value.sourceLockRef.uri.slice(`gs://${BUCKET}/`.length)) || !value.sourceLockRef.uri.endsWith('.json')
    || !safePath(value.currentSourceObjectRef.uri.slice(`gs://${BUCKET}/`.length)) || !value.currentSourceObjectRef.uri.endsWith('.tar.gz')) fail('OPENSWX_REUSE_INPUT_INVALID')
  const deadline = time(value.deadlineAt)
  if (!historical && (deadline <= Date.now() || deadline > Date.now() + 600_000)) fail('OPENSWX_OWNER_DEADLINE')
  return value
}
/** Create-only publication with same-URI readback after an unknown write. */
export async function publishWorkerReuseJson(transport, uri, value) {
  // Match createOwnerTransport.putJson's immutable wire format, including LF.
  const bytes = Buffer.from(`${canonicalize(value)}\n`), ref = ownRef({ uri, sha256: sha256(bytes) })
  const verify = row => {
    if (!Buffer.isBuffer(row?.bytes) || !row.bytes.equals(bytes) || row.ref?.sha256 !== ref.sha256 || row.ref?.uri !== uri || !/^[1-9][0-9]*$/u.test(String(row.metadata?.generation ?? ''))) fail('OPENSWX_REUSE_PUBLICATION_CONFLICT')
    return { ...row, value: JSON.parse(row.bytes.toString('utf8')) }
  }
  try { return verify(await transport.putJson(uri, value, { bucket: BUCKET, prefix: WORKER_RECEIPT_PREFIX, ifGenerationMatch: '0' })) }
  catch (error) {
    if (!['OUTCOME_UNKNOWN', 'GCS_WRITE_READBACK_MISMATCH'].includes(error.code)) throw error
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return verify(await transport.readBytes(uri, { prefixes: [WORKER_RECEIPT_PREFIX], expectedSha256: ref.sha256 })) }
      catch (readError) { if (['OPENSWX_REUSE_PUBLICATION_CONFLICT', 'GCS_READBACK_HASH_MISMATCH'].includes(readError.code)) throw readError }
    }
    fail('OPENSWX_REUSE_RECOVERY_REQUIRED')
  }
}
async function optional(transport, uri) {
  try { const row = await transport.readBytes(uri, { prefixes: [WORKER_RECEIPT_PREFIX] }); return { ...row, value: JSON.parse(row.bytes.toString('utf8')) } }
  catch (error) { if (['NOT_FOUND', 'MISSING'].includes(error.code)) return null; throw error }
}
export async function verifyWorkerArtifactReuse({ transport, artifact, profile, readSource, deadlineAt }) {
  transport = boundOpenSwxTransport(transport, deadlineAt)
  if (!artifact.currentAssociation || !artifact.origin) fail('OPENSWX_REUSE_ASSOCIATION_REQUIRED')
  for (const manifest of [artifact.originalManifest, artifact.currentManifest]) for (const row of manifest.entries) if (sha256(readSource(row.path, manifest.sourceRevision)) !== row.sha256) fail('OPENSWX_REUSE_GIT_INPUT_MISMATCH')
  const old = await sourceObject(transport, { uri: artifact.originBuild.facts.sourceObject.uri, sha256: artifact.originBuild.facts.sourceObject.sha256 }, artifact.originBuild.facts.sourceObject)
  const current = await sourceObject(transport, artifact.input.currentSourceObjectRef)
  assertWorkerArchive(old.bytes, artifact.originalManifest.entries); assertWorkerArchive(current.bytes, artifact.currentManifest.entries)
  const security = await providerSecurity(transport, artifact.origin, profile)
  const supplementalIam = await readBootstrapSupplementalIam(transport, artifact.origin.prior.bootstrap, artifact.bootstrapDescriptor, profile, readSource, artifact.currentAssociation.sourceRevision)
  // Before DAILY pause this is actual READY. Protected full stages have their
  // own PAUSED/drain leases and must never substitute an ENABLED observation.
  return { security, supplementalIam }
}
export function buildProgramOnlyReadyWorkerDescriptor({ artifact, profile }) {
  const association = artifact.currentAssociation, prior = artifact.origin?.prior, owner = prior?.bootstrapDescriptor ?? prior?.descriptor
  if (!association || association.schemaVersion !== 'aipdm.openswx-worker-build-association.v1' || association.status !== 'PASS'
    || prior?.activation?.facts?.workerStatus !== 'READY' || prior.activation.facts.schedulerState !== 'ENABLED'
    || !owner || isPausedAppRepair(owner) || owner.purpose !== 'full' || artifact.image !== prior.build.image) fail('OPENSWX_PROGRAM_ONLY_DESCRIPTOR_ORIGIN_INVALID')
  const descriptor = { ...owner, schemaVersion: 'aipdm.openswx-worker-descriptor.v2', artifactMode: 'REUSE_VERIFIED', purpose: 'full',
    sourceRevision: association.sourceRevision, sourceArchiveSha256: association.sourceArchiveSha256,
    workerProfileSha256: association.workerProfileSha256, resourcePlanHash: association.resourcePlanHash, workerBuildRef: artifact.associationRef }
  assertWorkerDescriptor(descriptor, profile, descriptor.workerProfileSha256, descriptor.sourceRevision)
  return descriptor
}
async function publishProgramOnlyReadyDescriptor({ transport, artifact, profile, root }) {
  const descriptor = buildProgramOnlyReadyWorkerDescriptor({ artifact, profile })
  const saved = await publishWorkerReuseJson(transport, `${root}-descriptor-full-program-only.json`, descriptor)
  return saved.ref
}
/** Evidence producer: no build/run/resource/credential mutation is available here. */
export async function executeWorkerArtifactReuse({ transport, inputRef, readSource }) {
  const ctx = createAiPdmEvidenceContext()
  return runAiPdmEvidenceContext(ctx, async () => {
  const input = assertWorkerReuseInput((await read(transport, inputRef)).value)
  const repair = input.schemaVersion === 'aipdm.openswx-worker-reuse-input.v2'
  transport = boundOpenSwxTransport(transport, input.deadlineAt)
  const lock = (await read(transport, input.sourceLockRef, ['receipts'])).value, revision = lock.sourceRevision ?? lock.headRevision ?? lock.head
  assertReuseSourceLock(lock, revision)
  if (typeof readSource?.readTree !== 'function' || typeof readSource.readTreeId !== 'function' || typeof readSource.readArchive !== 'function' || typeof readSource.assertCurrentFrozen !== 'function') fail('OPENSWX_REUSE_GIT_READER_REQUIRED')
  readSource.assertCurrentFrozen()
  if (readSource.readTreeId(revision) !== lock.sourceTree) fail('SOURCE_IDENTITY_HASH_MISMATCH')
  const currentTree = readSource.readTree(revision)
  if (sha256(currentTree) !== lock.sourceSha256) fail('SOURCE_IDENTITY_HASH_MISMATCH')
  const profileBytes = readSource(WORKER_PROFILE_PATH, revision), profile = assertOpenSwxWorkerProfile(JSON.parse(profileBytes))
  if (sha256(profileBytes) !== PROFILE_SHA) fail('OPENSWX_REUSE_PROFILE_DRIFT')
  const actor = await verifyNormalActor(transport, profile), origin = await readOrigin({ transport, priorActivationRef: input.priorActivationRef, profile, readSource, ctx })
  // The not-yet-published association adds one validated ancestor to this path.
  if (origin.historyDepth + 1 > 8) fail('OPENSWX_REUSE_ORIGIN_CYCLE_OR_DEPTH')
  const originalTree = readSource.readTree(origin.build.sourceRevision)
  if (sha256(originalTree) !== origin.originalCapsule.sourceSha256) fail('OPENSWX_REUSE_ORIGINAL_TREE_INVALID')
  const original = workerInputManifest(originalTree, readSource, origin.build.sourceRevision), current = workerInputManifest(currentTree, readSource, revision)
  manifestEqual(original, current)
  const oldObject = await sourceObject(transport, { uri: origin.build.facts.sourceObject.uri, sha256: origin.build.facts.sourceObject.sha256 }, origin.build.facts.sourceObject)
  const currentObject = await sourceObject(transport, input.currentSourceObjectRef)
  if (!input.currentSourceObjectRef.uri.startsWith(`gs://${BUCKET}/source/releases/${lock.releaseId}/`)) fail('OPENSWX_REUSE_CURRENT_ARCHIVE_SOURCE_INVALID')
  let currentTar; try { currentTar = gunzipSync(currentObject.bytes, { maxOutputLength: 256 * 1024 * 1024 }) } catch { fail('OPENSWX_REUSE_ARCHIVE_INVALID') }
  if (!currentTar.equals(readSource.readArchive(revision))) fail('OPENSWX_REUSE_CURRENT_ARCHIVE_SOURCE_INVALID')
  assertWorkerArchive(oldObject.bytes, original.entries); assertWorkerArchive(currentObject.bytes, current.entries)
  for (const row of origin.build.facts.sourceHashes) if (original.entries.find(input => input.path === row.path)?.sha256 !== row.sha256) fail('OPENSWX_REUSE_ORIGINAL_SOURCE_HASH_INVALID')
  const sourceHashes = OPENSWX_TERRAFORM_PATHS.map(name => ({ path: name, sha256: sha256(readSource(name, revision)) })), plan = infraPlan(profile, sourceHashes)
  same(plan, origin.approved.plan, 'OPENSWX_REUSE_RESOURCE_DRIFT'); same(plan, origin.appliedPlan.plan, 'OPENSWX_REUSE_RESOURCE_DRIFT')
  const security = await providerSecurity(transport, origin, profile)
  const supplementalIam = await readBootstrapSupplementalIam(transport, origin.prior.bootstrap, origin.prior.bootstrapDescriptor, profile, readSource, revision)
  const serving = repair ? await readServingRepairBasis({ transport, servingCapsuleRef: input.servingCapsuleRef, origin, profile, readSource, ctx }) : null
  if (repair) same(input.predecessorBaselineRef, serving.predecessorBaselineRef)
  const ready = await (repair ? readPausedRepairWorkerResources : readCurrentReadyWorkerResources)({ transport, profile, prior: origin.prior, supplementalIam: supplementalIam ? { ...supplementalIam, readSource } : null })
  const assertRepairAdmissionFresh = async () => {
    if (!repair) return
    const current = await named(transport, `gs://${BUCKET}/control/active.json`, ['control'])
    same(current.ref, serving.admission.controlRef, 'OPENSWX_REPAIR_CONTROL_DRIFT')
    if (current.metadata?.generation !== serving.admission.controlGeneration
      || sha256(canonicalize(await transport.getService(serving.admission.appProfile))) !== serving.admission.serviceSha256) fail('OPENSWX_REPAIR_CONTROL_DRIFT')
  }
  await assertRepairAdmissionFresh()
  const root = `${profile.receiptRoot}/${input.receiptId}-${inputRef.sha256.slice(0, 16)}`, associationUri = `${root}-association.json`
  const existing = await optional(transport, associationUri)
  const binding = { sourceRevision: revision, sourceArchiveSha256: input.currentSourceObjectRef.sha256, workerProfileSha256: sha256(profileBytes), resourcePlanHash: origin.buildOnly.resourcePlanHash }
  const descriptor = repair ? binding : { schemaVersion: 'aipdm.openswx-worker-descriptor.v2', artifactMode: 'REUSE_VERIFIED', ...binding }
  const repairDescriptorUri = `${root}-descriptor-full-repair.json`
  if (existing) {
    const priorDescriptor = repair ? await optional(transport, repairDescriptorUri) : null
    if (repair && !priorDescriptor) fail('OPENSWX_REUSE_REPAIR_DESCRIPTOR_MISSING')
    const artifact = await resolveWorkerArtifact({ transport, descriptor: repair ? priorDescriptor.value : { ...descriptor, workerBuildRef: existing.ref }, profile, readSource, ctx })
    same(artifact.currentAssociation.requestRef, { uri: `${root}-request.json`, sha256: artifact.currentAssociation.requestRef.sha256 })
    let check = { schemaVersion: 'aipdm.openswx-worker-reuse-current-check.v1', associationRef: existing.ref, security, ready: { ...ready, raw: ready.raw.map(row => ({ url: row.url, sha256: sha256(canonicalize(row.body)) })) } }
    if (repair && canonicalize(projectCapturedSnapshot(ready.after)) !== canonicalize(repairSnapshotProjection(artifact.pausedBaseline.after))) fail('OPENSWX_REPAIR_RESOURCE_DRIFT')
    if (repair) {
      same(serving.servingApp, artifact.pausedBaseline.servingApp, 'OPENSWX_REPAIR_SERVING_INVALID')
      await assertRepairAdmissionFresh()
      const providerReadbackRefs = []
      for (const [index, row] of [...ready.raw, ...serving.raw].entries()) {
        const bodyRef = (await publishWorkerReuseJson(transport, `${root}-replay-body-${index}-${sha256(canonicalize(row.body)).slice(0, 24)}.json`, row.body)).ref
        providerReadbackRefs.push({ id: `body-${index}`, api: row.api ?? rawApi(row.url, profile), method: row.method, url: row.url, observedAt: row.observedAt, bodyRef })
      }
      check = { schemaVersion: 'aipdm.openswx-paused-app-repair-check.v1', associationRef: existing.ref, pausedBaselineRef: priorDescriptor.value.pausedBaselineRef,
        actor: actor.email, observedAt: transport.now(), phase: 'PRODUCER_REPLAY', providerReadbackRefs, jobEtag: ready.after.jobEtag, jobGeneration: ready.after.jobGeneration,
        normalTemplateSha256: ready.after.normalTemplateSha256, schedulerState: 'PAUSED', executions: sealedCapturedSnapshot(ready.after, providerReadbackRefs).executions,
        servingRevision: serving.servingApp.revision, dbAdmissionProof: 'NOT_YET_PROVEN' }
      assertPausedRepairCurrentCheck(check, artifact.pausedBaseline, profile)
    }
    await publishWorkerReuseJson(transport, `${root}-current-check-${sha256(canonicalize(check)).slice(0, 24)}.json`, check)
    if (!repair) {
      const fullRef = await publishProgramOnlyReadyDescriptor({ transport, artifact, profile, root })
      return { ...existing, refs: { programOnlyFullDescriptorRef: fullRef } }
    }
    return existing
  }
  const requestUri = `${root}-request.json`, oldRequest = await optional(transport, requestUri)
  const requestedAt = oldRequest?.value.requestedAt ?? transport.now()
  const request = { schemaVersion: `aipdm.openswx-worker-reuse-request.v${repair ? 2 : 1}`, inputRef, sourceRevision: revision, sourceArchiveSha256: input.currentSourceObjectRef.sha256, sourceLockRef: input.sourceLockRef, priorActivationRef: input.priorActivationRef, actor: actor.email, requestedAt }
  if (oldRequest) same(oldRequest.value, request, 'OPENSWX_REUSE_REQUEST_CONFLICT')
  await assertRepairAdmissionFresh()
  const savedRequest = await publishWorkerReuseJson(transport, requestUri, request)
  const originalManifestRef = (await publishWorkerReuseJson(transport, `${root}-origin-inputs.json`, original)).ref
  const currentManifestRef = (await publishWorkerReuseJson(transport, `${root}-current-inputs.json`, current)).ref
  const infra = { schemaVersion: 'aipdm.openswx-reuse-infra-manifest.v1', sourceRevision: revision, sourceHashes, plan, resourcePlanHash: descriptor.resourcePlanHash, originalApprovedResourcePlanRef: origin.approvedRef, originalResourceApplyRef: origin.applyRef }
  const infraManifestRef = (await publishWorkerReuseJson(transport, `${root}-infra.json`, infra)).ref
  const providerReadbackRefs = []
  for (const [index, row] of [...ready.raw, ...(serving?.raw ?? [])].entries()) {
    const ref = (await publishWorkerReuseJson(transport, `${root}-resource-body-${index}-${sha256(canonicalize(row.body)).slice(0, 16)}.json`, row.body)).ref
    providerReadbackRefs.push(repair ? { id: `body-${index}`, api: row.api ?? rawApi(row.url, profile), method: row.method, url: row.url, observedAt: row.observedAt, bodyRef: ref } : { url: row.url, ref })
  }
  const { raw: _raw, ...readyFields } = ready
  const readyProof = repair ? { schemaVersion: 'aipdm.openswx-paused-app-repair-baseline.v1', ownerApplicationId: 'ai-pdm', purpose: 'PAUSED_APP_REPAIR', status: 'PASS', evidenceScope: 'PRODUCTION_PROVIDER_READBACK',
    inputRef, source: { ...binding, sourceLockRef: input.sourceLockRef }, priorActivationRef: input.priorActivationRef, retainedWorkerDescriptorRef: origin.prior.bootstrapDescriptorRef,
    predecessorBaselineRef: serving.predecessorBaselineRef, servingApp: serving.servingApp, actor: actor.email, observationStartedAt: serving.observedAt, observationCompletedAt: ready.observationCompletedAt, observedAt: transport.now(),
    pauseFenceSeconds: 55, before: sealedCapturedSnapshot(ready.before, providerReadbackRefs), after: sealedCapturedSnapshot(ready.after, providerReadbackRefs), providerReadbackRefs,
    resourcesUnchanged: true, mutationPerformed: false, providerQuiescenceProven: true, dbAdmissionProof: 'NOT_YET_PROVEN', continuationDepth: serving.continuationDepth } : { schemaVersion: 'aipdm.openswx-current-ready-resource-readback.v1', ownerApplicationId: 'ai-pdm', purpose: 'CURRENT_READY_PRE_REUSE_READBACK', status: 'PASS', evidenceScope: 'PRODUCTION_PROVIDER_READBACK',
    sourceRevision: revision, sourceArchiveSha256: descriptor.sourceArchiveSha256, sourceLockRef: input.sourceLockRef, workerProfileSha256: descriptor.workerProfileSha256, resourcePlanHash: descriptor.resourcePlanHash,
    priorActivationRef: input.priorActivationRef, priorReadyFullDescriptorRef: origin.prior.descriptorRef, originalApprovedResourcePlanRef: origin.approvedRef, observedAt: transport.now(), ...readyFields, providerReadbackRefs }
  const readbackRef = (await publishWorkerReuseJson(transport, `${root}-ready-${sha256(canonicalize(readyProof)).slice(0, 24)}.json`, readyProof)).ref
  const securityRef = (await publishWorkerReuseJson(transport, `${root}-security-${sha256(canonicalize(security)).slice(0, 24)}.json`, security)).ref
  const requestBody = buildRequest(security.build, origin, profile), submitted = {}
  for (const name of [...IGNORED_ARGS, 'READER_SOURCE']) submitted[name] = requestBody.steps[0].args.find(arg => arg.startsWith(`${name}=`)).slice(name.length + 1)
  const association = { schemaVersion: `aipdm.openswx-worker-build-association.v${repair ? 2 : 1}`, ...(repair ? { resourceBasis: 'PAUSED_APP_REPAIR' } : {}), ownerApplicationId: 'ai-pdm', status: 'PASS', evidenceScope: 'PRODUCTION_PROVIDER_REUSE', ...binding,
    sourceLockRef: input.sourceLockRef, image: origin.build.image, jobName: workerJobName(), actor: actor.email, observedAt: transport.now(), requestRef: savedRequest.ref, priorActivationRef: input.priorActivationRef,
    executableProof: { method: 'aipdm.openswx-finite-worker-inputs.v1', originalManifestRef, currentManifestRef, effectiveRecipeSha256: DOCKER_SHA, equal: true, target: 'finite-worker', builder: BUILDER, effectiveArgs: { READER_SOURCE: READER }, ignoredArgNames: IGNORED_ARGS, originalSubmittedArgs: submitted },
    artifactOrigin: { ...origin.originalRefs, sourceRevision: origin.build.sourceRevision, sourceArchiveSha256: origin.build.sourceArchiveSha256, workerProfileSha256: origin.build.workerProfileSha256, sourceObject: origin.build.facts.sourceObject, buildId: security.build.id, buildRequestSha256: sha256(canonicalize(requestBody)), createTime: security.build.createTime, startTime: security.build.startTime, finishTime: security.build.finishTime, image: origin.build.image, provenance: origin.build.facts.provenance, sbom: origin.build.facts.sbom },
    resourceAssociation: { infraManifestRef, readbackRef, originalApprovedResourcePlanRef: origin.approvedRef, originalResourceApplyRef: origin.applyRef, resourcePlanHash: descriptor.resourcePlanHash, resourcesUnchanged: true },
    securityEvidence: { readbackRef: securityRef, policySha256: security.policySha256, observedAt: security.observedAt, image: origin.build.image, rawHighOrCriticalVulnerabilityCount: 0, blockingVulnerabilityCount: 0 } }
  assertAssociation(association, descriptor, profile, repair)
  if (repair) assertPausedRepairBaseline(readyProof, profile); else assertReadyProof(readyProof, association, origin, profile)
  await assertRepairAdmissionFresh()
  const saved = await publishWorkerReuseJson(transport, associationUri, association)
  if (repair) {
    const producer = Object.freeze({ inputRef, baselineRef: readbackRef, sourceLockRef: input.sourceLockRef, ...binding })
    producerContexts.add(producer)
    await resolvePausedRepairAssociation({ transport, producer, profile, readSource, buildRef: saved.ref, ctx })
    const full = buildPausedRepairDescriptor({ profile, association: saved.value, associationRef: saved.ref, baseline: readyProof, baselineRef: readbackRef, retainedDescriptor: origin.prior.bootstrapDescriptor, retainedDescriptorRef: origin.prior.bootstrapDescriptorRef })
    await assertRepairAdmissionFresh()
    const published = await publishWorkerReuseJson(transport, repairDescriptorUri, full)
    await resolveWorkerArtifact({ transport, descriptor: published.value, profile, readSource, ctx })
  } else {
    const artifact = await resolveWorkerArtifact({ transport, descriptor: { ...descriptor, workerBuildRef: saved.ref }, profile, readSource, ctx })
    const fullRef = await publishProgramOnlyReadyDescriptor({ transport, artifact, profile, root })
    return { ...saved, refs: { programOnlyFullDescriptorRef: fullRef } }
  }
  return saved
  })
}
const producerContexts = new WeakSet()
async function resolvePausedRepairAssociation({ transport, producer, profile, readSource, buildRef, ctx }) {
  if (!producerContexts.has(producer)) fail('OPENSWX_REUSE_PRODUCER_CONTEXT_INVALID')
  const artifact = await resolveAssociation({ transport, descriptor: producer, profile, readSource, buildRef, ctx, repair: true })
  same(artifact.input.sourceLockRef, producer.sourceLockRef); same(artifact.currentAssociation.resourceAssociation.readbackRef, producer.baselineRef)
  return artifact
}
function projectCapturedSnapshot(snapshot) { return { ...snapshot, executions: snapshot.executions.map(({ rawIndex: _index, ...row }) => row) } }
function sealedCapturedSnapshot(snapshot, refs) { return { ...snapshot, executions: snapshot.executions.map(({ rawIndex, ...row }) => ({ ...row, rawPageRef: refs[rawIndex].bodyRef })) } }
function rawApi(url, profile) {
  if (url.includes('/executions?')) return 'RUN_EXECUTIONS_PAGE'
  if (url.startsWith('https://run.googleapis.com/')) return url.endsWith(':getIamPolicy') ? 'OWN_RESOURCE_POLICY' : 'RUN_JOB'
  if (url.startsWith('https://cloudscheduler.googleapis.com/')) return 'SCHEDULER_JOB'
  if (url.startsWith('https://secretmanager.googleapis.com/')) {
    if (!/\/versions\/[1-9][0-9]*$/u.test(url)) return 'OWN_RESOURCE_POLICY'
    return url.includes(`/secrets/${profile.tokenSecretId}/`) ? 'SECRET_TOKEN_VERSION_METADATA' : 'SECRET_REGISTRY_VERSION_METADATA'
  }
  if (url.startsWith('https://iam.googleapis.com/') || url.startsWith('https://cloudresourcemanager.googleapis.com/')) return 'OWN_RESOURCE_POLICY'
  fail('OPENSWX_REPAIR_READBACK_INVALID')
}
export function parseWorkerArtifactReuseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 4) fail('OPENSWX_REUSE_CLI_INVALID')
  const values = {}
  for (let index = 0; index < argv.length; index += 2) { if (!['--input-ref', '--input-sha256'].includes(argv[index]) || Object.hasOwn(values, argv[index])) fail('OPENSWX_REUSE_CLI_INVALID'); values[argv[index]] = argv[index + 1] }
  return { inputRef: ownRef({ uri: values['--input-ref'], sha256: values['--input-sha256'] }) }
}
export function assertReuseSourceLock(lock, revision) {
  exact(lock, ['schemaVersion', 'ownerApplicationId', 'repository', 'branch', 'releaseId', 'sourceRevision', 'sourceTree', 'sourceSha256', 'migrationManifestSha256', 'clean', 'remoteRef', 'remoteRevision', 'status', 'releaseAuthority', 'evidenceScope', 'observedAt'], 'SOURCE_LOCK_NOT_RELEASE_AUTHORITY')
  if (lock.schemaVersion !== 'jenfu.dev012.owner-source-lock.v1' || lock.ownerApplicationId !== 'ai-pdm' || lock.repository !== 'jedchang0308-jenfu/AI-PDM'
    || lock.branch !== 'main' || lock.remoteRef !== 'refs/heads/main' || !H40.test(revision ?? '') || lock.sourceRevision !== revision || lock.remoteRevision !== revision
    || !H40.test(lock.sourceTree ?? '') || !H64.test(lock.sourceSha256 ?? '') || !H64.test(lock.migrationManifestSha256 ?? '') || lock.clean !== true
    || lock.status !== 'SOURCE_FROZEN' || lock.releaseAuthority !== true || lock.evidenceScope !== 'PRODUCTION_BOUND' || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(lock.releaseId ?? '')) fail('SOURCE_LOCK_NOT_RELEASE_AUTHORITY')
  time(lock.observedAt); return lock
}
