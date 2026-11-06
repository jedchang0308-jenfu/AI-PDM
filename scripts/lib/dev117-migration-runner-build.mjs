import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createOwnerTransport, assertImmutableRef, canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { createGitArchive, createGitSourceIdentity, readGitBlob } from './dev012-owner-stage-executor.mjs'
import { verifyOfficialMergedSource } from './dev012-official-source-review.mjs'
import { assertSourceLock } from './dev121-owner-release-proof.mjs'
import { assertDev117V3Profile, buildDev117MigrationPackage, buildDev117MigrationBundle } from './dev117-ai-pdm-continuous-release.mjs'
import { MIGRATION_RUNNER_EXECUTABLE_INPUTS } from './dev117-migration-runner-source.mjs'

const BUCKET = 'jenfu-platform-prod-aipdm-release'
const DOCKERFILE = 'infra/google-cloud/dev-117-production-release/migration-runner.Dockerfile'
const PROFILE = 'config/release/dev117-ai-pdm-independent-production-v3.json'
const RECIPE_INPUTS = [PROFILE, 'scripts/lib/dev117-migration-runner-build.mjs', 'scripts/lib/dev012-owner-release-runtime.mjs']
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function fail(code) { throw Object.assign(new Error(code), { code }) }

export function parseMigrationRunnerBuildArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--source-lock-ref') fail('RUNNER_BUILD_ARGUMENTS_INVALID')
  const match = /^(gs:\/\/jenfu-platform-prod-aipdm-release\/receipts\/[A-Za-z0-9._/-]+\.json)#sha256=([a-f0-9]{64})$/u.exec(argv[1])
  if (!match) fail('RUNNER_BUILD_ARGUMENTS_INVALID')
  const ref = { uri: match[1], sha256: match[2] }
  assertImmutableRef(ref, BUCKET, ['receipts'])
  return ref
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) fail('RUNNER_BUILD_SOURCE_INVALID')
  return result.stdout.trim()
}

function toolProfile(profile) {
  const value = structuredClone(profile)
  value.artifact.uri = profile.artifact.migrationRunnerUri
  value.build.dockerfile = DOCKERFILE
  value.build.dockerTarget = 'runtime'
  return value
}

export function assertMigrationRunnerBuildResult({ profile, sourceLock, source, result, artifact, scan }) {
  const imageTag = `${profile.artifact.migrationRunnerUri}:release-${sourceLock.sourceRevision}`
  const args = ['build', '--pull=false', '--no-cache', '--file', DOCKERFILE, '--target', 'runtime',
    '--build-arg', `SOURCE_REVISION=${sourceLock.sourceRevision}`, '--build-arg', `SOURCE_TREE=${sourceLock.sourceSha256}`,
    '--build-arg', 'SOURCE_CREATED_AT=1970-01-01T00:00:00Z', '--build-arg', `SOURCE_VERSION=${sourceLock.sourceRevision}`,
    '--build-arg', 'SOURCE_STATE=frozen', '--tag', imageTag, '.']
  const build = result?.build
  const storage = { bucket: BUCKET, object: source.ref.uri.slice(`gs://${BUCKET}/`.length), generation: String(source.metadata.generation) }
  const request = { source: { storageSource: storage }, steps: [{ name: profile.build.dockerBuilderImage, dir: 'source', args }],
    images: [imageTag], timeout: '1800s', queueTtl: '300s', logsBucket: `gs://${BUCKET}/logs/cloud-build`,
    serviceAccount: `projects/jenfu-platform-prod/serviceAccounts/${profile.identities.builder}`,
    options: { logging: 'GCS_ONLY', logStreamingOption: 'STREAM_OFF', requestedVerifyOption: 'VERIFIED' } }
  const inputHash = sha256(canonicalize({ ownerApplicationId: 'ai-pdm', sourceArchiveSha256: source.ref.sha256, request }))
  const submissionTags = (build?.tags ?? []).filter(tag => tag.startsWith('owner-submission-'))
  const image = build?.results?.images?.[0]
  const digest = `${profile.artifact.migrationRunnerUri}@${image?.digest}`
  const times = ['createTime', 'startTime', 'finishTime'].map(key => Date.parse(build?.[key] ?? ''))
  if (!build || !/^[a-f0-9]{8}-[a-f0-9-]{27}$/u.test(build.id ?? '')
    || ![profile.target.projectId, profile.target.projectNumber].some(project => build.name === `projects/${project}/locations/asia-east1/builds/${build.id}`)
    || build.projectId !== 'jenfu-platform-prod' || build.status !== 'SUCCESS'
    || times.some(time => !Number.isFinite(time)) || times[0] > times[1] || times[1] > times[2]
    || ['images', 'timeout', 'queueTtl', 'logsBucket', 'serviceAccount'].some(key => canonicalize(build[key]) !== canonicalize(request[key]))
    || canonicalize(build.source?.storageSource) !== canonicalize(storage)
    || build.steps?.length !== 1 || ['name', 'dir', 'args'].some(key => canonicalize(build.steps[0][key]) !== canonicalize(request.steps[0][key]))
    || build.steps[0].entrypoint || build.steps[0].script || build.steps[0].env?.length || build.steps[0].secretEnv?.length || build.steps[0].volumes?.length
    || build.steps[0].automapSubstitutions === true
    || Object.keys(request.options).some(key => build.options?.[key] !== request.options[key])
    || build.options?.pool?.name || build.options?.env?.length || build.options?.secretEnv?.length || build.options?.volumes?.length || build.options?.automapSubstitutions === true
    || canonicalize(build.sourceProvenance?.resolvedStorageSource) !== canonicalize(storage)
    || build.availableSecrets || build.secrets?.length || Object.keys(build.substitutions ?? {}).length
    || !build.tags?.includes(`owner-build-${inputHash}`) || submissionTags.length !== 1 || !/^owner-submission-[1-3]$/u.test(submissionTags[0])
    || result.buildInputSha256 !== inputHash || result.sourceArchiveSha256 !== source.ref.sha256
    || typeof result.reused !== 'boolean' || result.disposition !== (result.reused ? 'REUSED_PROVIDER_BUILD' : 'BUILT')
    || build.results?.images?.length !== 1 || image?.name !== imageTag || !/^sha256:[a-f0-9]{64}$/u.test(image?.digest ?? '')
    || result.artifactDigest !== digest) fail('RUNNER_BUILD_PROOF_INVALID')
  const expectedName = `projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release/dockerImages/ai-pdm-migration-runner@${image.digest}`
  if (artifact?.uri !== digest || artifact.name !== expectedName) fail('RUNNER_BUILD_ARTIFACT_INVALID')
  const url = `https://${digest}`
  if (scan?.status !== 'PASS' || scan.resourceUrl !== url || scan.blockingVulnerabilityCount !== 0
    || !Number.isSafeInteger(scan.vulnerabilityCount) || scan.vulnerabilityCount < 0
    || ['buildOccurrenceNames', 'discoveryOccurrenceNames', 'sbomOccurrenceNames'].some(key =>
      !Array.isArray(scan[key]) || scan[key].length === 0 || scan[key].some(name => !/^projects\/jenfu-platform-prod\/(?:locations\/asia-east1\/)?occurrences\/[^/]+$/u.test(name)))
    || scan.sbomExport?.resourceUrl !== url || !/^projects\/jenfu-platform-prod\/locations\/asia-east1\/occurrences\/[^/]+$/u.test(scan.sbomExport?.discoveryOccurrenceId ?? '')
    || !Number.isFinite(Date.parse(scan.observedAt ?? ''))) fail('RUNNER_BUILD_SCAN_INVALID')
  return digest
}

/** Standalone artifact preparation. It has no Job, SQL, runtime or traffic action. */
export async function buildMigrationRunner({ sourceLockRef, token, githubToken, fetchImpl = fetch, sleep, now = () => new Date().toISOString() }) {
  assertImmutableRef(sourceLockRef, BUCKET, ['receipts'])
  const transport = createOwnerTransport({ token, githubToken, fetchImpl, ...(sleep ? { sleep } : {}), now })
  const locked = await transport.readJson(sourceLockRef, BUCKET, ['receipts'])
  const sourceLock = locked.value
  // Read config only from the exact clean checkout, never caller-provided profile claims.
  const identity = createGitSourceIdentity(root, sourceLock.sourceRevision)
  const read = file => readGitBlob(root, file, sourceLock.sourceRevision)
  const profile = JSON.parse(read(PROFILE))
  const v1 = JSON.parse(read('config/release/dev117-ai-pdm-independent-production.json'))
  const n1c = JSON.parse(read('config/platform/dev-010-n1c-ai-pdm.json'))
  assertDev117V3Profile(profile, v1, n1c)
  if (profile.artifact.repository !== 'aipdm-release'
    || profile.identities.builder !== 'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com') fail('RUNNER_BUILD_PROFILE_INVALID')
  assertSourceLock(sourceLock, 'ai-pdm', profile.application, sourceLock.sourceRevision, sourceLock.releaseId)
  if (!/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(sourceLock.releaseId ?? '') || sha256(identity) !== sourceLock.sourceSha256
    || git(root, ['rev-parse', 'HEAD^{tree}']) !== sourceLock.sourceTree
    || !['', 'main'].includes(git(root, ['branch', '--show-current']))
    || !/^(?:https:\/\/github\.com\/|git@github\.com:)jedchang0308-jenfu\/AI-PDM(?:\.git)?$/iu.test(git(root, ['remote', 'get-url', 'origin']))) fail('RUNNER_BUILD_SOURCE_INVALID')
  const migration = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), sourceLock.sourceRevision)
  if (migration.bundle.manifestSha256 !== sourceLock.migrationManifestSha256) fail('RUNNER_BUILD_MANIFEST_MISMATCH')
  const official = await verifyOfficialMergedSource({ repository: profile.application.repository, branch: 'main',
    revision: sourceLock.sourceRevision, sourceTree: sourceLock.sourceTree, token: githubToken, rulesetId: 24077878,
    fetchImpl, ...(sleep ? { sleep } : {}) })
  const inputHashes = Object.fromEntries([...new Set([...MIGRATION_RUNNER_EXECUTABLE_INPUTS, ...RECIPE_INPUTS])].sort().map(file => [file, sha256(read(file))]))
  if (!/\bAS runtime\s*$/mu.test(read(DOCKERFILE).toString('utf8').split('\n')[0])) fail('RUNNER_BUILD_RECIPE_INVALID')
  const archive = gzipSync(createGitArchive(root, sourceLock.sourceRevision), { level: 9 })
  const archiveHash = sha256(archive)
  const sourceUri = `gs://${BUCKET}/source/archives/${archiveHash}/source.tar.gz`
  const source = await transport.putBytes(sourceUri, archive, { bucket: BUCKET, prefix: 'source', contentType: 'application/gzip' })
  if (source.ref.uri !== sourceUri || source.ref.sha256 !== archiveHash || !source.bytes.equals(archive)
    || !/^[1-9][0-9]*$/u.test(String(source.metadata.generation)) || !source.metadata.crc32c) fail('RUNNER_BUILD_SOURCE_OBJECT_INVALID')
  const deadlineAt = new Date(Date.parse(now()) + 45 * 60_000).toISOString()
  const target = toolProfile(profile)
  const result = await transport.createBuild({ profile: target, intent: sourceLock, sourceObject: source, deadlineAt })
  const artifact = await transport.readArtifactImage(target, result.artifactDigest)
  const scan = await transport.waitArtifactEvidence({ profile: target, sourceRevision: sourceLock.sourceRevision,
    artifactDigest: result.artifactDigest, deadlineAt })
  const digest = assertMigrationRunnerBuildResult({ profile, sourceLock, source, result, artifact, scan })
  const core = { schemaVersion: 'aipdm.migration-runner-build.v1', ownerApplicationId: 'ai-pdm', status: 'PASS',
    releaseId: sourceLock.releaseId, sourceRevision: sourceLock.sourceRevision, sourceSha256: sourceLock.sourceSha256,
    sourceLockRef, sourceLockGeneration: String(locked.metadata.generation), profileSha256: sha256(read(PROFILE)), officialSource: official,
    inputHashes, artifactDigest: digest, sourceObject: { ...source.ref, generation: String(source.metadata.generation), crc32c: source.metadata.crc32c },
    cloudBuild: result.build, buildInputSha256: result.buildInputSha256, buildDisposition: result.disposition, reused: result.reused,
    artifactRegistry: artifact, scan, observedAt: now() }
  const receipt = { ...core, receiptSha256: sha256(canonicalize(core)) }
  const uri = `gs://${BUCKET}/receipts/migration-runner-builds/${sourceLock.sourceRevision}/${receipt.receiptSha256}.json`
  return transport.putJson(uri, receipt, { bucket: BUCKET, prefix: 'receipts' })
}
