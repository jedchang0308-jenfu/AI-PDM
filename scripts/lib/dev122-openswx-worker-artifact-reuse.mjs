import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { assertImmutableRef, canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertDev117ReleaseIntent } from './dev117-ai-pdm-continuous-release.mjs'
import { WORKER_PROFILE_PATH, WORKER_RECEIPT_PREFIX, assertOpenSwxWorkerRef, assertOpenSwxWorkerProfile, assertWorkerDescriptor, assertWorkerReceipt, assertWorkerBuildSource, workerJobName, workerTemplate, boundOpenSwxTransport, readBootstrapSupplementalIam } from './dev122-openswx-owner-release.mjs'
import { OPENSWX_TERRAFORM_PATHS, OPENSWX_TERRAFORM_ADDRESSES, readCurrentReadyWorkerResources, verifyNormalActor } from './dev122-openswx-bootstrap.mjs'
import { READBACK_IAM_PATHS } from './dev122-openswx-readback-iam.mjs'

const BUCKET = 'jenfu-platform-prod-aipdm-release', H40 = /^[a-f0-9]{40}$/u, H64 = /^[a-f0-9]{64}$/u
const READER = 'scripts/lib/openswx-reader', ENTRY = 'scripts/run-openswx-metadata-job.mjs'
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
  const result = await transport.readJson(ref, BUCKET, prefixes)
  if (!Buffer.isBuffer(result.bytes) || sha256(result.bytes) !== ref.sha256 || result.ref?.uri !== ref.uri || result.ref?.sha256 !== ref.sha256) fail('OPENSWX_REUSE_REF_HASH_INVALID')
  let parsed; try { parsed = JSON.parse(result.bytes.toString('utf8')) } catch { fail('OPENSWX_REUSE_REF_JSON_INVALID') }
  same(parsed, result.value, 'OPENSWX_REUSE_REF_JSON_INVALID')
  return result
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
    if (revision !== sourceRevision && !proofPath(name) && ![...READBACK_IAM_PATHS, ...OPENSWX_TERRAFORM_PATHS].includes(name)) fail('OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID')
    return git(root, ['show', `${revision}:${name}`])
  }
  readSource.authorizeOrigin = revision => { if (!H40.test(revision ?? '') || (!permitted.has(revision) && permitted.size >= 9)) fail('OPENSWX_REUSE_ORIGIN_DEPTH'); permitted.add(revision) }
  readSource.readTree = revision => { if (!permitted.has(revision)) fail('OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'); return git(root, ['ls-tree', '-r', '-z', '--full-tree', revision]) }
  readSource.assertCurrentFrozen = () => {
    if (git(root, ['rev-parse', 'HEAD']).toString().trim() !== sourceRevision || git(root, ['status', '--porcelain=v1', '--untracked-files=all']).length) fail('SOURCE_CHECKOUT_NOT_FROZEN')
  }
  readSource.readTreeId = revision => { if (!permitted.has(revision)) fail('OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'); return git(root, ['rev-parse', `${revision}^{tree}`]).toString().trim() }
  readSource.readArchive = revision => { if (revision !== sourceRevision) fail('OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID'); readSource.assertCurrentFrozen(); return git(root, ['archive', '--format=tar', '--prefix=source/', revision]) }
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
function context() { return { depth: 0, ancestors: new Set() } }
function descend(ctx, ref, association = true, validateRef = ownRef) {
  validateRef(ref)
  if ((association && ctx.depth >= 8) || ctx.ancestors.has(ref.uri)) fail('OPENSWX_REUSE_ORIGIN_CYCLE_OR_DEPTH')
  return { depth: ctx.depth + (association ? 1 : 0), ancestors: new Set([...ctx.ancestors, ref.uri]) }
}
const CAPSULE_PROFILE = { schemas: { releaseIntent: 'jenfu.dev117.ai-pdm-release-intent.v2' }, artifact: { releaseBucket: BUCKET } }
async function readOrigin({ transport, priorActivationRef, profile, readSource, ctx = context() }) {
  const next = descend(ctx, priorActivationRef, false), activationRow = await read(transport, priorActivationRef), activation = activationRow.value
  if (activation.kind !== 'activation' || activation.facts?.workerStatus !== 'READY' || activation.facts.schedulerState !== 'ENABLED'
    || activation.facts.claimProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND' || activation.facts.dbAdmissionProof !== 'AUTHENTICATED_EMPTY_CLAIM_NO_ACTIVE_OR_UNKNOWN'
    || !Array.isArray(activation.previousRefs) || activation.previousRefs.length !== 5) fail('OPENSWX_REUSE_PRIOR_READY_INVALID')
  const capsuleRef = releaseCapsuleRef(activation.previousRefs[0]), capsule = assertDev117ReleaseIntent((await read(transport, capsuleRef, ['receipts/releases'])).value, CAPSULE_PROFILE)
  if (capsuleRef.uri !== `gs://${BUCKET}/receipts/releases/${capsule.releaseId}/release-intent.json`) fail('IMMUTABLE_REF_INVALID')
  const capsuleContext = descend(next, capsuleRef, false, releaseCapsuleRef)
  const priorLock = (await read(transport, capsule.sourceLockRef, ['receipts'])).value
  assertReuseSourceLock(priorLock, capsule.sourceRevision)
  if (priorLock.sourceSha256 !== capsule.sourceSha256 || priorLock.releaseId !== capsule.releaseId || priorLock.migrationManifestSha256 !== capsule.migrationManifestSha256) fail('OPENSWX_REUSE_PRIOR_SOURCE_LOCK_INVALID')
  const fullRef = ownRef(capsule.openswxWorkerRef), full = (await read(transport, fullRef)).value
  const fullContext = descend(capsuleContext, fullRef, false)
  const profileBytes = readSource(WORKER_PROFILE_PATH, capsule.sourceRevision)
  assertOpenSwxWorkerProfile(JSON.parse(profileBytes)); same(JSON.parse(profileBytes), profile)
  assertWorkerDescriptor(full, profile, sha256(profileBytes), capsule.sourceRevision)
  if (full.purpose !== 'full') fail('OPENSWX_REUSE_PRIOR_FULL_REQUIRED')
  assertWorkerReceipt(activation, full, 'activation', { actor: profile.normalActor })
  readSource.authorizeOrigin?.(full.sourceRevision)
  const resolved = await resolveWorkerArtifact({ transport, descriptor: full, profile, readSource, ctx: fullContext })
  if (resolved.image !== activation.image) fail('OPENSWX_REUSE_ORIGIN_IMAGE_INVALID')
  const bootstrap = (await read(transport, full.bootstrapRef)).value
  assertWorkerReceipt(bootstrap, full, 'bootstrap', { actor: profile.normalActor, image: resolved.image })
  const template = workerTemplate(profile, resolved.image, full.tokenSecretVersion), entry = resolved.sourceEntryProof
  if (activation.templateSha256 !== sha256(canonicalize(template))) fail('OPENSWX_REUSE_PRIOR_TEMPLATE_INVALID')
  same(activation.facts.sourceEntryRef, entry)
  same(activation.facts.numericCredentials, { token: full.tokenSecretVersion, registry: full.registrySecretVersion })
  if (bootstrap.facts.tokenSecretVersion !== full.tokenSecretVersion || bootstrap.facts.registrySecretVersion !== full.registrySecretVersion) fail('OPENSWX_REUSE_PRIOR_CREDENTIAL_INVALID')
  const preflight = (await read(transport, full.cloudPreflightRef)).value, drained = (await read(transport, full.pausedDrainedRef)).value
  assertWorkerReceipt(preflight, full, 'cloud-preflight', { actor: profile.normalActor, image: resolved.image })
  assertWorkerReceipt(drained, full, 'paused-drained', { actor: profile.normalActor })
  const normalSha = sha256(canonicalize(template)), selftestSha = sha256(canonicalize(workerTemplate(profile, resolved.image, null, 'selftest')))
  if (preflight.facts.isolationVerified !== true || preflight.facts.noCad !== true || preflight.facts.normalTemplateSha256 !== normalSha || preflight.facts.selftestTemplateSha256 !== selftestSha
    || bootstrap.facts.normalTemplateSha256 !== normalSha || bootstrap.facts.selftestTemplateSha256 !== selftestSha
    || drained.facts.schedulerPaused !== true || drained.facts.noActiveOrUnknown !== true || !Number.isFinite(Date.parse(drained.facts.quiescenceCompletedAt))) fail('OPENSWX_REUSE_PRIOR_OPERATIONAL_CHAIN_INVALID')
  if ((drained.facts.drainKind === 'FIRST_PROVIDER_ONLY' && (bootstrap.facts.bootstrapKind !== 'FIRST_CREATE' || drained.facts.dbAdmissionProof !== 'NOT_APPLICABLE_FIRST_BOOTSTRAP'))
    || (drained.facts.drainKind === 'DAILY_DB_VERIFIED' && (bootstrap.facts.bootstrapKind !== 'DAILY_REFRESH' || drained.facts.dbAdmissionProof?.claimProof !== 'AUTHENTICATED_204_SOURCE_BOUND'))
    || !['FIRST_PROVIDER_ONLY', 'DAILY_DB_VERIFIED'].includes(drained.facts.drainKind)) fail('OPENSWX_REUSE_PRIOR_OPERATIONAL_CHAIN_INVALID')
  if (drained.facts.drainKind === 'DAILY_DB_VERIFIED') {
    if (bootstrap.facts.resourceProvenance?.resourcesUnchanged !== true) fail('OPENSWX_REUSE_PRIOR_OPERATIONAL_CHAIN_INVALID')
    same(bootstrap.facts.pausedDrainedRef, full.pausedDrainedRef); same(bootstrap.facts.priorActivationRef, drained.facts.priorActivationRef)
    same(drained.facts.targetWorkerBuildRef, full.workerBuildRef)
    if (resolved.currentAssociation) same(drained.facts.priorActivationRef, resolved.currentAssociation.priorActivationRef)
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
  return { prior: { activation, activationRef: priorActivationRef, capsule, capsuleRef, descriptor: full, descriptorRef: fullRef, build, bootstrap, template, entry },
    build, buildRef, buildOnly, buildOnlyRef, approved, approvedRef, applyRef, applied, appliedPlan, originalCapsule: resolved.origin?.originalCapsule ?? capsule,
    originalRefs: { priorReadyCapsuleRef: capsuleRef, priorReadyFullDescriptorRef: fullRef, originalBuildReceiptRef: buildRef, originalBuildOnlyDescriptorRef: buildOnlyRef, originalApprovedResourcePlanRef: approvedRef } }
}
export function assertWorkerBuildAssociation(value, descriptor, profile) {
  exact(value, ASSOCIATION_KEYS)
  if (value.schemaVersion !== 'aipdm.openswx-worker-build-association.v1' || value.ownerApplicationId !== 'ai-pdm' || value.status !== 'PASS' || value.evidenceScope !== 'PRODUCTION_PROVIDER_REUSE'
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
/** Origin remains an original v1 receipt. Associations are never receipt clones. */
export async function resolveWorkerArtifact({ transport, descriptor, profile, readSource, buildRef = descriptor.workerBuildRef, ctx = context() }) {
  if (descriptor.schemaVersion === 'aipdm.openswx-worker-descriptor.v1') {
    const build = (await read(transport, buildRef)).value
    assertWorkerReceipt(build, descriptor, 'build')
    return { currentAssociation: null, originBuild: build, originBuildRef: buildRef, originDescriptor: descriptor, image: build.image, sourceEntryProof: assertWorkerBuildSource(build, descriptor) }
  }
  if (descriptor.schemaVersion !== 'aipdm.openswx-worker-descriptor.v2' || descriptor.artifactMode !== 'REUSE_VERIFIED' || typeof readSource !== 'function') fail('OPENSWX_REUSE_RESOLVER_INVALID')
  same(buildRef, descriptor.workerBuildRef)
  const next = descend(ctx, buildRef), association = assertWorkerBuildAssociation((await read(transport, buildRef)).value, descriptor, profile)
  const lock = (await read(transport, association.sourceLockRef, ['receipts'])).value
  assertReuseSourceLock(lock, descriptor.sourceRevision)
  const origin = await readOrigin({ transport, priorActivationRef: association.priorActivationRef, profile, readSource, ctx: next })
  for (const [key, ref] of Object.entries(origin.originalRefs)) same(association.artifactOrigin[key], ref)
  for (const name of ['sourceRevision', 'sourceArchiveSha256', 'workerProfileSha256', 'image']) same(association.artifactOrigin[name], origin.build[name])
  same(association.artifactOrigin.sourceObject, origin.build.facts.sourceObject); same(association.resourceAssociation.originalResourceApplyRef, origin.applyRef)
  const request = (await read(transport, association.requestRef)).value
  exact(request, ['schemaVersion', 'inputRef', 'sourceRevision', 'sourceArchiveSha256', 'sourceLockRef', 'priorActivationRef', 'actor', 'requestedAt'])
  if (request.schemaVersion !== 'aipdm.openswx-worker-reuse-request.v1' || request.actor !== profile.normalActor || request.sourceRevision !== descriptor.sourceRevision || request.sourceArchiveSha256 !== descriptor.sourceArchiveSha256) fail('OPENSWX_REUSE_REQUEST_INVALID')
  same(request.sourceLockRef, association.sourceLockRef); same(request.priorActivationRef, association.priorActivationRef); ownRef(request.inputRef); time(request.requestedAt)
  const input = assertWorkerReuseInput((await read(transport, request.inputRef)).value, { historical: true })
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
  assertReadyProof(resource, association, origin, profile)
  const security = (await read(transport, association.securityEvidence.readbackRef)).value
  exact(security, ['schemaVersion', 'image', 'observedAt', 'policySha256', 'build', 'artifactRegistry', 'occurrences', 'rawHighOrCriticalVulnerabilityCount', 'blockingVulnerabilityCount'])
  if (security.schemaVersion !== 'aipdm.openswx-reuse-security-readback.v1' || security.image !== association.image || security.policySha256 !== association.securityEvidence.policySha256 || security.observedAt !== association.securityEvidence.observedAt) fail('OPENSWX_REUSE_SECURITY_INVALID')
  assertSecurity(security, origin, profile)
  same(association.artifactOrigin.buildRequestSha256, sha256(canonicalize(buildRequest(security.build, origin, profile))))
  for (const name of ['buildId', 'createTime', 'startTime', 'finishTime']) same(association.artifactOrigin[name], name === 'buildId' ? security.build.id : security.build[name])
  return { currentAssociation: association, associationRef: buildRef, originBuild: origin.build, originBuildRef: origin.buildRef, originDescriptor: origin.buildOnly,
    image: origin.build.image, sourceEntryProof: assertWorkerBuildSource(origin.build, origin.buildOnly), origin, originalManifest: original, currentManifest: current, input }
}
function infraPlan(profile, sourceHashes) { return { ownerApplicationId: 'ai-pdm', projectId: profile.projectId, backendBucket: profile.backendBucket, backendPrefix: profile.backendPrefix, sourceHashes, resourceAddresses: OPENSWX_TERRAFORM_ADDRESSES, allowedActions: ['create', 'no-op'] } }
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
  for (const row of rows(value.providerReadbackRefs, 64)) { exact(row, ['url', 'ref']); ownRef(row.ref); if (typeof row.url !== 'string' || !/^https:\/\/(?:run|iam|secretmanager|cloudscheduler)\.googleapis\.com\/v[12]\//u.test(row.url)) fail('OPENSWX_REUSE_READY_PROOF_INVALID') }
}
export function assertWorkerReuseInput(value, { historical = false } = {}) {
  exact(value, ['schemaVersion', 'sourceLockRef', 'currentSourceObjectRef', 'priorActivationRef', 'deadlineAt', 'receiptId'], 'OPENSWX_REUSE_INPUT_INVALID')
  if (value.schemaVersion !== 'aipdm.openswx-worker-reuse-input.v1' || !/^[A-Za-z0-9-]{6,100}$/u.test(value.receiptId ?? '')) fail('OPENSWX_REUSE_INPUT_INVALID')
  assertImmutableRef(value.sourceLockRef, BUCKET, ['receipts']); assertImmutableRef(value.currentSourceObjectRef, BUCKET, ['source']); ownRef(value.priorActivationRef)
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
  const supplementalIam = await readBootstrapSupplementalIam(transport, artifact.origin.prior.bootstrap, artifact.origin.prior.descriptor, profile, readSource, artifact.currentAssociation.sourceRevision)
  // Before DAILY pause this is actual READY. Protected full stages have their
  // own PAUSED/drain leases and must never substitute an ENABLED observation.
  return { security, supplementalIam }
}
/** Evidence producer: no build/run/resource/credential mutation is available here. */
export async function executeWorkerArtifactReuse({ transport, inputRef, readSource }) {
  const input = assertWorkerReuseInput((await read(transport, inputRef)).value)
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
  const actor = await verifyNormalActor(transport, profile), origin = await readOrigin({ transport, priorActivationRef: input.priorActivationRef, profile, readSource, ctx: { depth: 1, ancestors: new Set() } })
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
  const supplementalIam = await readBootstrapSupplementalIam(transport, origin.prior.bootstrap, origin.prior.descriptor, profile, readSource, revision)
  const ready = await readCurrentReadyWorkerResources({ transport, profile, prior: origin.prior, supplementalIam })
  const root = `${profile.receiptRoot}/${input.receiptId}-${inputRef.sha256.slice(0, 16)}`, associationUri = `${root}-association.json`
  const existing = await optional(transport, associationUri)
  const descriptor = { schemaVersion: 'aipdm.openswx-worker-descriptor.v2', artifactMode: 'REUSE_VERIFIED', sourceRevision: revision, sourceArchiveSha256: input.currentSourceObjectRef.sha256, workerProfileSha256: sha256(profileBytes), resourcePlanHash: origin.buildOnly.resourcePlanHash }
  if (existing) {
    const artifact = await resolveWorkerArtifact({ transport, descriptor: { ...descriptor, workerBuildRef: existing.ref }, profile, readSource })
    same(artifact.currentAssociation.requestRef, { uri: `${root}-request.json`, sha256: artifact.currentAssociation.requestRef.sha256 })
    const check = { schemaVersion: 'aipdm.openswx-worker-reuse-current-check.v1', associationRef: existing.ref, security, ready: { ...ready, raw: ready.raw.map(row => ({ url: row.url, sha256: sha256(canonicalize(row.body)) })) } }
    await publishWorkerReuseJson(transport, `${root}-current-check-${sha256(canonicalize(check)).slice(0, 24)}.json`, check)
    return existing
  }
  const requestUri = `${root}-request.json`, oldRequest = await optional(transport, requestUri)
  const requestedAt = oldRequest?.value.requestedAt ?? transport.now()
  const request = { schemaVersion: 'aipdm.openswx-worker-reuse-request.v1', inputRef, sourceRevision: revision, sourceArchiveSha256: input.currentSourceObjectRef.sha256, sourceLockRef: input.sourceLockRef, priorActivationRef: input.priorActivationRef, actor: actor.email, requestedAt }
  if (oldRequest) same(oldRequest.value, request, 'OPENSWX_REUSE_REQUEST_CONFLICT')
  const savedRequest = await publishWorkerReuseJson(transport, requestUri, request)
  const originalManifestRef = (await publishWorkerReuseJson(transport, `${root}-origin-inputs.json`, original)).ref
  const currentManifestRef = (await publishWorkerReuseJson(transport, `${root}-current-inputs.json`, current)).ref
  const infra = { schemaVersion: 'aipdm.openswx-reuse-infra-manifest.v1', sourceRevision: revision, sourceHashes, plan, resourcePlanHash: descriptor.resourcePlanHash, originalApprovedResourcePlanRef: origin.approvedRef, originalResourceApplyRef: origin.applyRef }
  const infraManifestRef = (await publishWorkerReuseJson(transport, `${root}-infra.json`, infra)).ref
  const providerReadbackRefs = []
  for (const [index, row] of ready.raw.entries()) providerReadbackRefs.push({ url: row.url, ref: (await publishWorkerReuseJson(transport, `${root}-resource-body-${index}-${sha256(canonicalize(row.body)).slice(0, 16)}.json`, row.body)).ref })
  const { raw: _raw, ...readyFields } = ready
  const readyProof = { schemaVersion: 'aipdm.openswx-current-ready-resource-readback.v1', ownerApplicationId: 'ai-pdm', purpose: 'CURRENT_READY_PRE_REUSE_READBACK', status: 'PASS', evidenceScope: 'PRODUCTION_PROVIDER_READBACK',
    sourceRevision: revision, sourceArchiveSha256: descriptor.sourceArchiveSha256, sourceLockRef: input.sourceLockRef, workerProfileSha256: descriptor.workerProfileSha256, resourcePlanHash: descriptor.resourcePlanHash,
    priorActivationRef: input.priorActivationRef, priorReadyFullDescriptorRef: origin.prior.descriptorRef, originalApprovedResourcePlanRef: origin.approvedRef, observedAt: transport.now(), ...readyFields, providerReadbackRefs }
  const readbackRef = (await publishWorkerReuseJson(transport, `${root}-ready-${sha256(canonicalize(readyProof)).slice(0, 24)}.json`, readyProof)).ref
  const securityRef = (await publishWorkerReuseJson(transport, `${root}-security-${sha256(canonicalize(security)).slice(0, 24)}.json`, security)).ref
  const requestBody = buildRequest(security.build, origin, profile), submitted = {}
  for (const name of [...IGNORED_ARGS, 'READER_SOURCE']) submitted[name] = requestBody.steps[0].args.find(arg => arg.startsWith(`${name}=`)).slice(name.length + 1)
  const association = { schemaVersion: 'aipdm.openswx-worker-build-association.v1', ownerApplicationId: 'ai-pdm', status: 'PASS', evidenceScope: 'PRODUCTION_PROVIDER_REUSE', ...Object.fromEntries(['sourceRevision', 'sourceArchiveSha256', 'workerProfileSha256', 'resourcePlanHash'].map(name => [name, descriptor[name]])),
    sourceLockRef: input.sourceLockRef, image: origin.build.image, jobName: workerJobName(), actor: actor.email, observedAt: transport.now(), requestRef: savedRequest.ref, priorActivationRef: input.priorActivationRef,
    executableProof: { method: 'aipdm.openswx-finite-worker-inputs.v1', originalManifestRef, currentManifestRef, effectiveRecipeSha256: DOCKER_SHA, equal: true, target: 'finite-worker', builder: BUILDER, effectiveArgs: { READER_SOURCE: READER }, ignoredArgNames: IGNORED_ARGS, originalSubmittedArgs: submitted },
    artifactOrigin: { ...origin.originalRefs, sourceRevision: origin.build.sourceRevision, sourceArchiveSha256: origin.build.sourceArchiveSha256, workerProfileSha256: origin.build.workerProfileSha256, sourceObject: origin.build.facts.sourceObject, buildId: security.build.id, buildRequestSha256: sha256(canonicalize(requestBody)), createTime: security.build.createTime, startTime: security.build.startTime, finishTime: security.build.finishTime, image: origin.build.image, provenance: origin.build.facts.provenance, sbom: origin.build.facts.sbom },
    resourceAssociation: { infraManifestRef, readbackRef, originalApprovedResourcePlanRef: origin.approvedRef, originalResourceApplyRef: origin.applyRef, resourcePlanHash: descriptor.resourcePlanHash, resourcesUnchanged: true },
    securityEvidence: { readbackRef: securityRef, policySha256: security.policySha256, observedAt: security.observedAt, image: origin.build.image, rawHighOrCriticalVulnerabilityCount: 0, blockingVulnerabilityCount: 0 } }
  assertWorkerBuildAssociation(association, descriptor, profile); assertReadyProof(readyProof, association, origin, profile)
  const saved = await publishWorkerReuseJson(transport, associationUri, association)
  await resolveWorkerArtifact({ transport, descriptor: { ...descriptor, workerBuildRef: saved.ref }, profile, readSource })
  return saved
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
