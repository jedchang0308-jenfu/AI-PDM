import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import test from 'node:test'
import { parseMigrationRunnerBuildArgs, assertMigrationRunnerBuildResult } from './lib/dev117-migration-runner-build.mjs'
import { canonicalize, crc32cBase64, sha256 } from './lib/dev012-production-migration-runner.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bucket = 'jenfu-platform-prod-aipdm-release'
const token = 'MODELED-TEST-TOKEN-WITH-ENOUGH-LENGTH'
const now = new Date().toISOString()
const profilePath = 'config/release/dev117-ai-pdm-independent-production-v3.json'
const profile = JSON.parse(fs.readFileSync(path.join(repositoryRoot, profilePath)))
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aipdm-runner-build-'))
function git(args, encoding = 'utf8') { return execFileSync('git', args, { cwd: fixtureRoot, encoding, windowsHide: true }) }
function copy(relative) {
  fs.mkdirSync(path.dirname(path.join(fixtureRoot, relative)), { recursive: true })
  fs.cpSync(path.join(repositoryRoot, relative), path.join(fixtureRoot, relative), { recursive: true })
}
for (const relative of ['scripts/lib', 'config', 'db',
  'infra/google-cloud/dev-117-production-release/migration-runner.Dockerfile',
  'infra/google-cloud/dev-117-production-release/migration-runner-cloudbuild.yaml',
  'infra/google-cloud/dev-117-production-release/migration-runner',
  'scripts/dev010-n1c-ai-pdm-package.mjs', 'scripts/dev117-build-migration-runner.mjs',
  'scripts/dev117-production-migration-runner.mjs', 'scripts/dev012-production-data-cutover-runtime.mjs']) copy(relative)
git(['init', '-b', 'main'])
git(['config', 'core.autocrlf', 'false'])
git(['config', 'user.name', 'Runner fixture'])
git(['config', 'user.email', 'fixture@example.invalid'])
git(['remote', 'add', 'origin', 'https://github.com/jedchang0308-jenfu/AI-PDM.git'])
git(['add', '.'])
git(['commit', '-qm', 'isolated source fixture'])
const sourceRevision = git(['rev-parse', 'HEAD']).trim()
const sourceTree = git(['rev-parse', 'HEAD^{tree}']).trim()
const sourceSha256 = sha256(git(['ls-tree', '-r', '-z', '--full-tree', sourceRevision], null))
const runnerModule = await import(pathToFileURL(path.join(fixtureRoot, 'scripts/lib/dev117-migration-runner-build.mjs')))
const releaseModule = await import(pathToFileURL(path.join(fixtureRoot, 'scripts/lib/dev117-ai-pdm-continuous-release.mjs')))
const n1c = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'config/platform/dev-010-n1c-ai-pdm.json')))
const manifest = releaseModule.buildDev117MigrationBundle(profile,
  releaseModule.buildDev117MigrationPackage(profile, n1c), sourceRevision).bundle.manifestSha256
test.after(() => {
  assert.equal(path.dirname(fixtureRoot), os.tmpdir())
  assert.ok(path.basename(fixtureRoot).startsWith('aipdm-runner-build-'))
  fs.rmSync(fixtureRoot, { recursive: true, force: true })
})

const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
function provider({ lockMutation = () => {}, checkFailure = false, merged = true, protectedBranch = true, buildMutation = () => {} } = {}) {
  const objects = new Map(), builds = [], mutations = [], reads = []
  const lock = { schemaVersion: 'jenfu.dev012.owner-source-lock.v1', ownerApplicationId: 'ai-pdm',
    repository: profile.application.repository, branch: 'main', releaseId: 'DEV127-RUNNER-FIXTURE',
    sourceRevision, sourceTree, sourceSha256, migrationManifestSha256: manifest,
    clean: true, remoteRef: 'refs/heads/main', remoteRevision: sourceRevision, status: 'SOURCE_FROZEN',
    releaseAuthority: true, evidenceScope: 'PRODUCTION_BOUND', observedAt: now }
  lockMutation(lock)
  const put = (name, bytes) => {
    const object = { bytes, generation: String(objects.size + 1), crc32c: crc32cBase64(bytes) }
    objects.set(name, object); return object
  }
  const lockBytes = Buffer.from(canonicalize(lock))
  put('receipts/test/source-lock.json', lockBytes)
  const ref = { uri: `gs://${bucket}/receipts/test/source-lock.json`, sha256: sha256(lockBytes) }
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url), method = options.method ?? 'GET'
    if (method === 'GET') reads.push(target.href); else mutations.push({ url: target.href, method })
    if (target.hostname === 'storage.googleapis.com') {
      if (target.pathname.startsWith('/upload/')) {
        assert.equal(method, 'POST'); assert.equal(target.searchParams.get('ifGenerationMatch'), '0')
        assert.ok(target.pathname.includes(`/b/${bucket}/`))
        const name = target.searchParams.get('name')
        if (objects.has(name)) return json({}, 412)
        return json({ generation: put(name, Buffer.from(options.body)).generation })
      }
      const object = objects.get(decodeURIComponent(target.pathname.split('/o/')[1]))
      if (!object) return json({}, 404)
      if (target.searchParams.has('generation')) assert.equal(target.searchParams.get('generation'), object.generation)
      if (target.searchParams.get('alt') === 'media') return new Response(object.bytes)
      return json({ generation: object.generation, crc32c: object.crc32c, size: object.bytes.length })
    }
    if (target.hostname === 'api.github.com') {
      assert.equal(method, 'GET')
      if (target.pathname.includes('/rules/branches/')) return json([
        { ruleset_id: 24077878, type: 'deletion' }, { ruleset_id: 24077878, type: 'non_fast_forward' },
        { ruleset_id: 24077878, type: 'pull_request', parameters: { required_approving_review_count: 0,
          require_code_owner_review: false, require_last_push_approval: false, require_extra_approval_for_unattributed_changes: false, allowed_merge_methods: ['merge'] } },
        { ruleset_id: 24077878, type: 'required_status_checks', parameters: { required_status_checks: ['DEV-012 Isolated PostgreSQL Cutover', 'Production Slice QC'].map(context => ({ context, integration_id: 15368 })) } }])
      if (target.pathname.endsWith('/branches/main')) return json({ name: 'main', protected: protectedBranch, commit: { sha: sourceRevision } })
      if (target.pathname.includes('/git/commits/')) return json({ sha: sourceRevision, tree: { sha: sourceTree } })
      if (target.pathname.endsWith('/pulls')) return json(merged ? [{ number: 999, state: 'closed', base: { repo: { full_name: profile.application.repository }, ref: 'main' }, merge_commit_sha: sourceRevision, merged_at: now, html_url: 'https://github.com/example/pull/999' }] : [])
      if (target.pathname.endsWith('/check-runs')) return json({ check_runs: ['DEV-012 Isolated PostgreSQL Cutover', 'Production Slice QC'].map((name, index) => ({ name, id: index + 1, app: { id: 15368 }, head_sha: sourceRevision, status: 'completed', conclusion: checkFailure ? 'failure' : 'success', completed_at: now })) })
    }
    if (target.hostname === 'cloudbuild.googleapis.com') {
      if (method === 'POST') {
        const request = JSON.parse(options.body), id = '5554e6a9-1c0f-48bd-877a-7f04d651915e'
        const build = { ...request, id, name: `projects/jenfu-platform-prod/locations/asia-east1/builds/${id}`, projectId: 'jenfu-platform-prod', status: 'SUCCESS',
          createTime: now, startTime: now, finishTime: now, sourceProvenance: { resolvedStorageSource: structuredClone(request.source.storageSource) },
          results: { images: [{ name: request.images[0], digest: `sha256:${'c'.repeat(64)}` }] } }
        // Native timing/default fields must not invalidate the exact requested recipe.
        build.steps[0].timing = { startTime: now, endTime: now }
        build.options.machineType = 'UNSPECIFIED'
        buildMutation(build); builds.push(build)
        return json({ name: `operations/build/${id}`, metadata: { build: { id } } })
      }
      return json(target.pathname.endsWith('/builds') ? { builds } : builds[0])
    }
    const digest = `${profile.artifact.migrationRunnerUri}@sha256:${'c'.repeat(64)}`
    if (target.hostname === 'artifactregistry.googleapis.com') return json({ dockerImages: [{ uri: digest, name: `projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release/dockerImages/ai-pdm-migration-runner@sha256:${'c'.repeat(64)}` }] })
    if (target.hostname === 'containeranalysis.googleapis.com') {
      if (method === 'POST') return json({ discoveryOccurrenceId: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/export' })
      const kind = /^kind="([A-Z_]+)"/u.exec(target.searchParams.get('filter'))?.[1]
      return json({ occurrences: kind === 'VULNERABILITY' ? [] : [{ kind, name: `projects/jenfu-platform-prod/occurrences/${kind.toLowerCase()}`, resourceUri: `https://${digest}`, ...(kind === 'DISCOVERY' ? { discovery: { analysisStatus: 'FINISHED_SUCCESS' } } : {}) }] })
    }
    throw Error(`UNEXPECTED_PROVIDER:${target.hostname}`)
  }
  return { lock, ref, objects, builds, reads, mutations, run: () => runnerModule.buildMigrationRunner({ sourceLockRef: ref, token, githubToken: token, fetchImpl, sleep: async () => {}, now: () => now }) }
}

test('runner CLI accepts only one immutable own source-lock ref', () => {
  const value = `gs://${bucket}/receipts/test/source-lock.json#sha256=${'a'.repeat(64)}`
  assert.deepEqual(parseMigrationRunnerBuildArgs(['--source-lock-ref', value]), { uri: value.split('#')[0], sha256: 'a'.repeat(64) })
  for (const argv of [[], ['--source-lock-ref', value, '--root', 'other'], ['--target', value], ['--source-lock-ref', value.replace(bucket, 'foreign-bucket')], ['--source-lock-ref', value.split('#')[0]], ['--source-lock-ref', value.replace('/test/', '/../')]]) assert.throws(() => parseMigrationRunnerBuildArgs(argv))
})

test('standalone runner builds and seals exact official source; replay retains original build', async () => {
  const f = provider(), first = await f.run(), receipt = JSON.parse(first.bytes)
  assert.equal(receipt.status, 'PASS'); assert.equal(receipt.buildDisposition, 'BUILT')
  assert.equal(receipt.sourceRevision, sourceRevision); assert.equal(receipt.cloudBuild.steps[0].args.includes('DEV125_INSTALLER_REQUIRED=true'), false)
  assert.equal(receipt.cloudBuild.steps[0].args.includes('runtime'), true)
  assert.equal(receipt.officialSource.requiredCheckRuns.length, 2)
  assert.equal(Object.keys(receipt.inputHashes).length >= 20, true)
  assert.equal(HASH(receipt), receipt.receiptSha256)
  const replay = JSON.parse((await f.run()).bytes)
  assert.equal(replay.reused, true); assert.equal(replay.buildDisposition, 'REUSED_PROVIDER_BUILD')
  assert.deepEqual(replay.cloudBuild, receipt.cloudBuild)
  assert.equal(replay.sourceObject.generation, receipt.sourceObject.generation)
  assert.equal(f.mutations.filter(row => row.url.startsWith('https://cloudbuild.googleapis.com/')).length, 1)
  assert.ok(f.mutations.every(row => ['storage.googleapis.com', 'cloudbuild.googleapis.com', 'containeranalysis.googleapis.com'].includes(new URL(row.url).hostname)))
})
function HASH(receipt) { const { receiptSha256: _hash, ...core } = receipt; return sha256(canonicalize(core)) }

for (const [name, options, expected] of [
  ['tree identity', { lockMutation: lock => { lock.sourceSha256 = 'b'.repeat(64) } }, /RUNNER_BUILD_SOURCE_INVALID/u],
  ['manifest', { lockMutation: lock => { lock.migrationManifestSha256 = 'b'.repeat(64) } }, /RUNNER_BUILD_MANIFEST_MISMATCH/u],
  ['foreign lock owner', { lockMutation: lock => { lock.ownerApplicationId = 'platform' } }, /SOURCE_LOCK_INVALID/u],
  ['required CI', { checkFailure: true }, /REQUIRED_CHECKS_NOT_SUCCESSFUL/u],
  ['merged PR', { merged: false }, /MERGED_PR_NOT_UNIQUE/u],
  ['branch protection', { protectedBranch: false }, /BRANCH_UNPROTECTED/u],
]) test(`standalone runner rejects ${name} before any mutation`, async () => {
  const f = provider(options); await assert.rejects(f.run(), expected); assert.equal(f.mutations.length, 0)
})

test('source lock immutable bytes and dirty source fail before build', async () => {
  const f = provider(); f.ref.sha256 = 'b'.repeat(64)
  await assert.rejects(f.run(), /GCS_READBACK_HASH_MISMATCH/u); assert.equal(f.mutations.length, 0)
  fs.writeFileSync(path.join(fixtureRoot, 'unreviewed.txt'), 'dirty')
  try { const dirty = provider(); await assert.rejects(dirty.run(), /SOURCE_CHECKOUT_NOT_FROZEN/u); assert.equal(dirty.mutations.length, 0) }
  finally { fs.unlinkSync(path.join(fixtureRoot, 'unreviewed.txt')) }
})

test('runner proof rejects typed output and source/recipe/digest/scan tampering', async () => {
  const f = provider(), receipt = JSON.parse((await f.run()).bytes)
  const input = { profile, sourceLock: f.lock, source: { ref: { uri: receipt.sourceObject.uri, sha256: receipt.sourceObject.sha256 }, metadata: receipt.sourceObject },
    result: { build: receipt.cloudBuild, artifactDigest: receipt.artifactDigest, buildInputSha256: receipt.buildInputSha256, sourceArchiveSha256: receipt.sourceObject.sha256, reused: false, disposition: 'BUILT' }, artifact: receipt.artifactRegistry, scan: receipt.scan }
  assert.equal(assertMigrationRunnerBuildResult(input), receipt.artifactDigest)
  for (const mutate of [
    v => { v.result.reused = 'false' }, v => { v.result.buildInputSha256 = 'f'.repeat(64) },
    v => { v.result.build.source.storageSource.generation = '99' }, v => { v.result.build.steps[0].args.push('--privileged') },
    v => { v.result.build.sourceProvenance.resolvedStorageSource.bucket = 'foreign' }, v => { v.result.artifactDigest = 'foreign@sha256:' + 'c'.repeat(64) },
    v => { v.artifact.name = 'foreign' }, v => { v.scan.blockingVulnerabilityCount = 1 }, v => { v.scan.sbomOccurrenceNames = [] },
  ]) { const changed = structuredClone(input); mutate(changed); assert.throws(() => assertMigrationRunnerBuildResult(changed)) }
})
