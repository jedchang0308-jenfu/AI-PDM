import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import { canonicalize, crc32cBase64, sha256 } from
  './lib/dev012-production-migration-runner.mjs'
import { createOwnerTransport, createAiPdmBuildReadbackTransport, buildRuntimeConfig, releasePaths, stageReceipt } from './lib/dev012-owner-release-runtime.mjs'
import { boundOpenSwxTransport, WORKER_PROFILE_PATH, workerTemplate, workerJobName,
  workerSchedulerName, createOpenSwxOwnerRelease, readWorkerFullEvidence } from './lib/dev122-openswx-owner-release.mjs'
import { executeWorkerArtifactReuse, resolveWorkerArtifact, createWorkerGitReader } from './lib/dev122-openswx-worker-artifact-reuse.mjs'
import { executeOwnerStage } from './lib/dev012-owner-stage-executor.mjs'
import { executePrerequisiteProducer } from './lib/dev012-owner-prerequisite-producer.mjs'
import { executeOpenSwxBootstrap } from './lib/dev122-openswx-bootstrap.mjs'
import { expectedReadbackJobBindings, READBACK_IAM_PATHS, PREBUILD_IAM_SOURCE_PATH, prebuildIamContinuationPlan } from './lib/dev122-openswx-readback-iam.mjs'
import { assertDev117ReleaseIntent, buildDev117MigrationPackage, buildDev117MigrationBundle } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { readPreActivationAbortContinuation } from './lib/dev121-preactivation-abort-continuation.mjs'
import { assertMigration, readOwnerReleaseProof,
  verifyOwnerProviderReadback, readAiPdmSourceArchive, parseAiPdmMigrationArchive,
  assertAiPdmMigrationContent, assertAiPdmMigrationEquivalent, assertAiPdmRepairMigrationMode, createAiPdmEvidenceContext,
  runAiPdmEvidenceContext, descendAiPdmEvidenceContext, readAiPdmEvidenceLeaf,
  readAiPdmObservationInputs, assertAiPdmHistoricalMigration } from './lib/dev121-owner-release-proof.mjs'

const revision = 'a'.repeat(40)
const manifest = 'b'.repeat(64)
const releaseId = 'DEV121-OWNER-001'
const bucket = 'jenfu-platform-prod-platform-release'
const root = `gs://${bucket}/receipts/releases/${releaseId}/${'c'.repeat(64)}`
const buildId = '11111111-2222-3333-4444-555555555555'
const archivedSource = Buffer.from('frozen owner source archive')

// CI has a shallow checkout. This format/content layer reads its exact HEAD;
// authentic historical B14 replay is separately mandatory in the root controller.
const b23Revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true,
  timeout: 30000, maxBuffer: 1024,
}).toString('utf8').trim()
assert.match(b23Revision, /^[a-f0-9]{40}$/u)
const b23ProfilePath = 'config/release/dev117-ai-pdm-independent-production-v3.json'
const b23Native = new Map()
function b23ArchiveAt(sourceRevision) {
  if (b23Native.has(sourceRevision)) return b23Native.get(sourceRevision)
  const cwd = fileURLToPath(new URL('..', import.meta.url))
  const git = args => execFileSync('git', args, { cwd, windowsHide: true,
    timeout: 30000, maxBuffer: 268435456 })
  const profileBytes = git(['show', `${sourceRevision}:${b23ProfilePath}`])
  const profile = JSON.parse(profileBytes)
  const files = new Map([[b23ProfilePath, profileBytes]])
  for (const row of profile.migrations.entries) {
    const bytes = git(['show', `${sourceRevision}:${row.path}`]); files.set(row.path, bytes)
    assert.equal(sha256(bytes), row.sha256)
  }
  const n1c = JSON.parse(git(['show', `${sourceRevision}:config/platform/dev-010-n1c-ai-pdm.json`]))
  const { bundle } = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), sourceRevision)
  for (const entry of bundle.entries) assert.equal(entry.sourceSha256, sha256(files.get(entry.path)), 'actual package retains the exact frozen raw Git SQL binding')
  const tar = git(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', '--prefix=source/', sourceRevision])
  const result = { tar, files, bundle }
  b23Native.set(sourceRevision, result)
  return result
}
function b23NativeArchive() { return b23ArchiveAt(b23Revision) }
function b23ContentPrefix(fixture, count) {
  assert.ok(fixture.bundle.entries.length >= count)
  if (count >= 33) assert.deepEqual(fixture.bundle.entries[32], {
    ...fixture.bundle.entries[32], order: 33, version: 'ai-pdm-083', name: 'dev121_authorized_first_login_account',
    path: 'db/postgres/083_dev121_authorized_first_login_account.sql',
    sourceSha256: 'a99df76b8fc146a916930a05286433568aa432710d2a6eccc1c47f08ba780da9',
    appliedSha256: '8f6ed9bafe7af906bcae7a94df59a07bbb98cab27402e75ea9162b85a3ec9b8a',
  })
  const files = new Map(fixture.files), profile = JSON.parse(files.get(b23ProfilePath))
  profile.migrations.entries = profile.migrations.entries.slice(0, count)
  files.set(b23ProfilePath, Buffer.from(canonicalize(profile)))
  for (const row of fixture.bundle.entries.slice(count)) files.delete(row.path)
  const { manifestSha256: _manifest, ...original } = fixture.bundle
  const core = { ...original, entries: structuredClone(original.entries.slice(0, count)) }
  return { files, bundle: { ...core, manifestSha256: sha256(canonicalize(core)) } }
}
function b23Deadline() { return new Date(Date.now() + 120000).toISOString() }
test('B24 LOCAL_TEST branded migration mode preserves 32 and admits only exact 083 append', () => {
  const fixture = b23ContentPrefix(b23NativeArchive(), 33), deadlineAt = b23Deadline()
  const current = assertAiPdmMigrationContent({ ...fixture, sourceRevision: b23Revision, deadlineAt })
  const historicalFiles = new Map(fixture.files), historicalProfile = JSON.parse(historicalFiles.get(b23ProfilePath))
  historicalProfile.migrations.entries = historicalProfile.migrations.entries.slice(0, 32)
  historicalFiles.set(b23ProfilePath, Buffer.from(canonicalize(historicalProfile)))
  for (const entry of fixture.bundle.entries.slice(32)) historicalFiles.delete(entry.path)
  const { manifestSha256: _manifest, ...core } = fixture.bundle
  const historicalCore = { ...core, entries: core.entries.slice(0, 32) }
  const historicalBundle = { ...historicalCore, manifestSha256: sha256(canonicalize(historicalCore)) }
  const historical = assertAiPdmMigrationContent({ files: historicalFiles, bundle: historicalBundle, sourceRevision: b23Revision, deadlineAt })
  assert.equal(assertAiPdmRepairMigrationMode(historical, historical), 'HISTORICAL_EVIDENCE_REUSED')
  assert.equal(assertAiPdmRepairMigrationMode(historical, current), 'FORWARD_APPLIED')
  assert.throws(() => assertAiPdmRepairMigrationMode(current, current), /MIGRATION_HISTORICAL_PREFIX_INVALID/u)
  assert.throws(() => assertAiPdmRepairMigrationMode({ ...historical }, current), /MIGRATION_INPUT_NOT_EQUIVALENT/u)
  const changedFiles = new Map(fixture.files), changedProfile = JSON.parse(changedFiles.get(b23ProfilePath)), changedEntries = structuredClone(fixture.bundle.entries)
  const prefix = changedEntries[31], changedSql = Buffer.concat([changedFiles.get(prefix.path), Buffer.from('\n-- LOCAL_TEST prefix drift\n')])
  changedFiles.set(prefix.path, changedSql); prefix.sourceSha256 = sha256(changedSql)
  prefix.sqlBase64 = changedSql.toString('base64'); prefix.appliedSha256 = sha256(changedSql)
  changedProfile.migrations.entries[31].sha256 = prefix.sourceSha256
  changedFiles.set(b23ProfilePath, Buffer.from(canonicalize(changedProfile)))
  const changedCore = { ...core, entries: changedEntries }, changedBundle = { ...changedCore, manifestSha256: sha256(canonicalize(changedCore)) }
  const changed = assertAiPdmMigrationContent({ files: changedFiles, bundle: changedBundle, sourceRevision: b23Revision, deadlineAt })
  assert.throws(() => assertAiPdmRepairMigrationMode(historical, changed), /MIGRATION_HISTORICAL_PREFIX_INVALID/u)
  for (const mutate of [
    entries => { entries[32].path = 'db/postgres/084_forged_append.sql' },
    entries => { entries[32].sourceSha256 = '0'.repeat(64) },
    entries => { entries[32].version = 'ai-pdm-084' },
    entries => { entries[32].name = 'forged_append' },
    entries => {
      const forged = Buffer.from('SELECT 1;\n')
      entries[32].sqlBase64 = forged.toString('base64'); entries[32].appliedSha256 = sha256(forged)
    },
  ]) {
    const entries = structuredClone(core.entries); mutate(entries)
    const badCore = { ...core, entries }, bundle = { ...badCore, manifestSha256: sha256(canonicalize(badCore)) }
    assert.throws(() => assertAiPdmMigrationContent({ files: fixture.files, bundle, sourceRevision: b23Revision, deadlineAt }), /ARCHIVE_BUNDLE_INVALID/u)
  }
  assert.throws(() => assertAiPdmMigrationContent({ ...fixture, sourceRevision: '0'.repeat(40), deadlineAt }), /ARCHIVE_BUNDLE_INVALID/u)
  current.files.set(fixture.bundle.entries[0].path, Buffer.from('tampered'))
  assert.throws(() => assertAiPdmRepairMigrationMode(historical, current), /MIGRATION_INPUT_NOT_EQUIVALENT/u)
})
const b23ContextRef = (name, bytes = Buffer.from(name)) => ({ uri: `gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/${name}.json`, sha256: sha256(bytes) })
test('B23 opaque context closes permanently and rejects copied, inherited, proxy and foreign handles', async () => {
  const handle = createAiPdmEvidenceContext(), foreign = createAiPdmEvidenceContext()
  assert.equal(Object.getPrototypeOf(handle), null); assert.deepEqual(Reflect.ownKeys(handle), []); assert.equal(Object.isFrozen(handle), true)
  for (const fake of [{}, { ...handle }, Object.create(handle), new Proxy(handle, {}), JSON.parse(JSON.stringify(handle))]) await assert.rejects(runAiPdmEvidenceContext(fake, () => 1), /CONTEXT_INVALID/u)
  await runAiPdmEvidenceContext(handle, async () => {
    assert.equal(createAiPdmEvidenceContext(), handle)
    await assert.rejects(runAiPdmEvidenceContext(foreign, () => 1), /CONTEXT_BRANCH_INVALID/u)
    const child = descendAiPdmEvidenceContext(handle, b23ContextRef('child'), true)
    await runAiPdmEvidenceContext(child, async () => {
      assert.equal(createAiPdmEvidenceContext(), child)
      await assert.rejects(runAiPdmEvidenceContext(handle, () => 1), /CONTEXT_BRANCH_INVALID/u)
      assert.throws(() => descendAiPdmEvidenceContext(handle, b23ContextRef('reset'), true), /CONTEXT_REF_INVALID/u)
    })
    await assert.rejects(readAiPdmObservationInputs({ owner: 'ai-pdm' }), /OBSERVATION_IDENTITY_INVALID/u)
  })
  await assert.rejects(runAiPdmEvidenceContext(handle, () => 1), /CONTEXT_INVALID/u)
})
test('B23 shared DAG caches only bytes, rewalks transitions, and rejects depth nine before read', async () => {
  let reads = 0
  const rootHandle = createAiPdmEvidenceContext(), bytes = Buffer.from('authenticated leaf'), ref = b23ContextRef('shared', bytes)
  await runAiPdmEvidenceContext(rootHandle, async () => {
    const walk = async (handle, depth) => runAiPdmEvidenceContext(handle, async () => {
      if (depth === 8) {
        const first = await readAiPdmEvidenceLeaf({ ref, read: async () => { reads++; return bytes } })
        first.fill(0)
        assert.equal((await readAiPdmEvidenceLeaf({ ref, read: async () => { reads++; return bytes } })).equals(bytes), true)
        assert.throws(() => descendAiPdmEvidenceContext(handle, b23ContextRef('ninth'), true), /GRAPH_DEPTH_INVALID/u)
        return
      }
      const child = descendAiPdmEvidenceContext(handle, b23ContextRef(`depth-${depth}`), true)
      await walk(child, depth + 1)
    })
    await walk(rootHandle, 0); await walk(rootHandle, 0)
    await Promise.all(['sibling-a', 'sibling-b'].map(name => {
      const sibling = descendAiPdmEvidenceContext(rootHandle, b23ContextRef(name), true)
      return runAiPdmEvidenceContext(sibling, () => readAiPdmEvidenceLeaf({ ref, read: async () => { reads++; return bytes } }))
    }))
    assert.throws(() => descendAiPdmEvidenceContext(rootHandle, { ...ref, sha256: 'f'.repeat(64) }), /GRAPH_CYCLE_OR_HASH_CONFLICT/u)
  })
  assert.equal(reads, 1)
})
test('B23 observation expiry, wall regression and leaked callbacks never mint a replacement root', async () => {
  const originalNow = Date.now, started = originalNow()
  let clock = started, leaked
  Date.now = () => clock
  try {
    const rootHandle = createAiPdmEvidenceContext()
    await assert.rejects(runAiPdmEvidenceContext(rootHandle, async () => {
      leaked = () => createAiPdmEvidenceContext()
      clock = started + 600000
      createAiPdmEvidenceContext()
    }), /OBSERVATION_EXPIRED/u)
    await assert.rejects(runAiPdmEvidenceContext(rootHandle, () => 1), /CONTEXT_INVALID/u)
    assert.ok(leaked)
    clock = started
    await assert.rejects(runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      clock--
      await readAiPdmEvidenceLeaf({ ref: b23ContextRef('late'), read: async () => Buffer.from('late') })
    }), /OBSERVATION_EXPIRED/u)
    clock = started
    let callback
    const handle = createAiPdmEvidenceContext()
    await runAiPdmEvidenceContext(handle, async () => { callback = new Promise(resolve => setImmediate(() => { try { createAiPdmEvidenceContext(); resolve('accepted') } catch { resolve('rejected') } })) })
    assert.equal(await callback, 'rejected')
  } finally { Date.now = originalNow }
})
test('B23 failed leaf reads remain retryable without memoizing failure', async () => {
  const bytes = Buffer.from('retryable exact leaf'), ref = b23ContextRef('retry-leaf', bytes); let attempts = 0
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    await assert.rejects(readAiPdmEvidenceLeaf({ ref, read: async () => { attempts++; throw Error('TRANSIENT_READ') } }), /TRANSIENT_READ/u)
    assert.ok((await readAiPdmEvidenceLeaf({ ref, read: async () => { attempts++; return bytes } })).equals(bytes))
    assert.ok((await readAiPdmEvidenceLeaf({ ref, read: async () => { throw Error('MEMO_MUST_REUSE') } })).equals(bytes))
  })
  assert.equal(attempts, 2)
})
test('B23 concurrent independent roots authenticate the same leaf independently', async () => {
  const bytes = Buffer.from('independent exact leaf'), ref = b23ContextRef('independent-leaf', bytes); let reads = 0
  await Promise.all([createAiPdmEvidenceContext(), createAiPdmEvidenceContext()].map(handle => runAiPdmEvidenceContext(handle,
    () => readAiPdmEvidenceLeaf({ ref, read: async () => { reads++; await Promise.resolve(); return bytes } }))))
  assert.equal(reads, 2)
})
test('B23 nonfinite clocks and expired memo returns remain closed', async () => {
  const originalNow = Date.now, started = originalNow()
  try {
    for (const value of [NaN, Infinity, -Infinity]) { Date.now = () => value; assert.throws(() => createAiPdmEvidenceContext(), /CONTEXT_INVALID/u) }
    let clock = started; Date.now = () => clock
    const bytes = Buffer.from('expiring cached leaf'), ref = b23ContextRef('expiring-leaf', bytes)
    await assert.rejects(runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      await readAiPdmEvidenceLeaf({ ref, read: async () => bytes }); clock += 600000
      await readAiPdmEvidenceLeaf({ ref, read: async () => { throw Error('EXPIRED_MEMO_CANNOT_READ') } })
    }), /OBSERVATION_EXPIRED/u)
  } finally { Date.now = originalNow }
})
function b23Pax(key, value) {
  const text = Buffer.from(` ${key}=${value}\n`)
  let length = text.length + 1
  while (String(length).length + text.length !== length) length = String(length).length + text.length
  return Buffer.concat([Buffer.from(String(length)), text])
}
function b23TarRecord(name, bytes = Buffer.alloc(0), type = '0', mode = 0o644, link = '') {
  const header = Buffer.alloc(512)
  const put = (value, offset, length) => { assert.ok(Buffer.byteLength(value) <= length); header.write(value, offset, length, 'utf8') }
  put(name, 0, 100)
  for (const [offset, length, number] of [[100, 8, mode], [108, 8, 0], [116, 8, 0], [124, 12, bytes.length], [136, 12, 0]]) put(`${number.toString(8).padStart(length - 1, '0')}\0`, offset, length)
  header.fill(32, 148, 156); header[156] = type.charCodeAt(0)
  put(link, 157, 100); put('ustar\0', 257, 6); put('00', 263, 2)
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0)
  put(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8)
  return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)])
}
function b23SelectedTar(extra = []) {
  const fixture = b23NativeArchive()
  return Buffer.concat([b23TarRecord('pax_global_header', b23Pax('comment', b23Revision), 'g'),
    b23TarRecord('source/', Buffer.alloc(0), '5'),
    ...[...fixture.files].map(([name, bytes]) => b23TarRecord(`source/${name}`, bytes)),
    ...extra, Buffer.alloc(2048)])
}

function cleanup34Fixture() {
  const profile = JSON.parse(readFileSync(new URL('../config/release/dev117-ai-pdm-independent-production-v3.json', import.meta.url)))
  // LOCAL_TEST historical34; keep the immutable084 fixture separate from new085.
  profile.migrations.entries = profile.migrations.entries.slice(0, 34)
  assert.equal(profile.migrations.entries.length, 34)
  const n1c = JSON.parse(readFileSync(new URL('../config/platform/dev-010-n1c-ai-pdm.json', import.meta.url)))
  const { bundle } = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), revision)
  const files = new Map([[b23ProfilePath, Buffer.from(canonicalize(profile))],
    ...profile.migrations.entries.map(row => [row.path, readFileSync(new URL('../' + row.path, import.meta.url))])])
  return { profile, bundle, files }
}
function cleanup34Reseal(input) {
  input.files.set(b23ProfilePath, Buffer.from(canonicalize(input.profile)))
  const core = { ...input.bundle }; delete core.manifestSha256
  input.bundle.manifestSha256 = sha256(canonicalize(core))
  return input
}
function cleanup34Tar(files) {
  return Buffer.concat([b23TarRecord('pax_global_header', b23Pax('comment', revision), 'g'),
    b23TarRecord('source/', Buffer.alloc(0), '5'),
    ...[...files].map(([name, bytes]) => b23TarRecord('source/' + name, bytes)), Buffer.alloc(2048)])
}
function cleanup34Validate(input, archive = false) {
  const options = { ...input, sourceRevision: revision, deadlineAt: b23Deadline() }
  return archive ? parseAiPdmMigrationArchive({ ...options, bytes: cleanup34Tar(input.files) })
    : assertAiPdmMigrationContent(options)
}
test('DEV121 LOCAL_TEST native34 package authenticates exact084 profile, raw SQL and archive bytes', () => {
  const input = cleanup34Fixture(), entry = input.bundle.entries[33]
  assert.deepEqual(entry, {
    ...entry, order: 34, path: 'db/postgres/084_dev121_unlinked_legacy_profile_cleanup.sql',
    version: 'ai-pdm-084', name: 'dev121_unlinked_legacy_profile_cleanup',
    sourceSha256: '6be6eb8cdc4ffb6f83883a17220066d4f91efd0f374b32cee0b50d299eb991e1',
    appliedSha256: '6be6eb8cdc4ffb6f83883a17220066d4f91efd0f374b32cee0b50d299eb991e1',
  })
  assert.ok(Buffer.from(entry.sqlBase64, 'base64').equals(input.files.get(entry.path)))
  const parsed = cleanup34Validate(input, true), direct = cleanup34Validate(input)
  assert.equal(parsed.files.size, 35)
  assertAiPdmMigrationEquivalent(parsed, direct)
  for (const [path, bytes] of input.files) assert.ok(parsed.files.get(path).equals(bytes))
})
for (const field of ['path', 'version', 'name', 'sourceSha256', 'appliedSha256', 'bytes']) {
  test('DEV121 native34 rejects wrong084 ' + field + ' after bundle reseal', () => {
    const input = cleanup34Fixture(), entry = input.bundle.entries[33]
    if (field === 'path') entry.path = 'db/postgres/084_unreviewed_cleanup.sql'
    else if (field === 'version') entry.version = 'ai-pdm-085'
    else if (field === 'name') entry.name = 'unreviewed_cleanup'
    else if (field === 'bytes') {
      const bytes = Buffer.concat([Buffer.from(entry.sqlBase64, 'base64'), Buffer.from('\n-- forged SQL\n')])
      entry.sqlBase64 = bytes.toString('base64'); entry.appliedSha256 = sha256(bytes)
    } else entry[field] = 'f'.repeat(64)
    assert.throws(() => cleanup34Validate(cleanup34Reseal(input), true), /ARCHIVE_BUNDLE_INVALID/u)
  })
}
for (const field of ['path', 'version', 'name', 'sourceSha256', 'appliedSha256']) {
  test('DEV121 native34 retains exact083 binding for ' + field, () => {
    const input = cleanup34Fixture(), entry = input.bundle.entries[32]
    entry[field] = field === 'path' ? 'db/postgres/083_unreviewed_login.sql'
      : field === 'version' ? 'ai-pdm-083-forged' : field === 'name' ? 'unreviewed_login' : 'f'.repeat(64)
    assert.throws(() => cleanup34Validate(cleanup34Reseal(input), true), /ARCHIVE_BUNDLE_INVALID/u)
  })
}
for (const mutation of ['raw-bytes', 'missing-file', 'missing-profile-entry', 'missing-bundle-entry', 'reorder', 'duplicate', '35']) {
  test('DEV121 native34 rejects ' + mutation, () => {
    const input = cleanup34Fixture(), entry = input.bundle.entries[33]
    let expected = /ARCHIVE_BUNDLE_INVALID/u
    if (mutation === 'raw-bytes') {
      input.files.set(entry.path, Buffer.concat([input.files.get(entry.path), Buffer.from('\n-- raw source drift\n')]))
      expected = /ARCHIVE_SQL_MISMATCH/u
    } else if (mutation === 'missing-file') {
      input.files.delete(entry.path); expected = /ARCHIVE_SELECTED_MISSING/u
    } else if (mutation === 'missing-profile-entry') {
      input.profile.migrations.entries.pop(); expected = /ARCHIVE_PROFILE_INVALID/u
    } else if (mutation === 'missing-bundle-entry') {
      input.bundle.entries.pop(); expected = /ARCHIVE_PROFILE_INVALID/u
    } else if (mutation === 'reorder') {
      [input.bundle.entries[32], input.bundle.entries[33]] = [input.bundle.entries[33], input.bundle.entries[32]]
      input.bundle.entries.forEach((row, index) => { row.order = index + 1 })
    } else if (mutation === 'duplicate') input.bundle.entries[33] = { ...input.bundle.entries[32], order: 34 }
    else input.bundle.entries.push({ ...entry, order: 35, path: 'db/postgres/085_unapproved.sql', version: 'ai-pdm-085' })
    assert.throws(() => cleanup34Validate(cleanup34Reseal(input), true), expected)
  })
}
test('DEV121 ordinary34 content remains rejected by paused32-to33 migration classifier', () => {
  const input = cleanup34Fixture(), current = cleanup34Validate(input, true)
  const historical = b23ContentPrefix(input, 32), appended083 = b23ContentPrefix(input, 33)
  const before = assertAiPdmMigrationContent({ ...historical, sourceRevision: revision, deadlineAt: b23Deadline() })
  const after083 = assertAiPdmMigrationContent({ ...appended083, sourceRevision: revision, deadlineAt: b23Deadline() })
  assert.equal(assertAiPdmRepairMigrationMode(before, after083), 'FORWARD_APPLIED')
  assert.throws(() => assertAiPdmRepairMigrationMode(before, current), /MIGRATION_HISTORICAL_PREFIX_INVALID/u)
  assert.throws(() => assertAiPdmRepairMigrationMode(after083, current), /MIGRATION_HISTORICAL_PREFIX_INVALID/u)
})

function b23Wire(bytes, change = {}) {
  const uri = `gs://jenfu-platform-prod-aipdm-release/source/releases/DEV122-B23-ARCHIVE/${'c'.repeat(64)}/source.tar.gz`
  const object = uri.split('/').slice(3).join('/')
  const source = { uri, sha256: sha256(bytes), generation: '7', crc32c: crc32cBase64(bytes) }
  let originalArrayBufferCalls = 0
  const calls = []
  const response = (body, headers = {}, noStream = false) => {
    const value = new Response(body, { headers })
    return { ok: true, status: 200, headers: value.headers,
      body: noStream ? null : value.body,
      arrayBuffer: () => { originalArrayBufferCalls++; throw Error('unbounded source response used') } }
  }
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method })
    if (url.includes('?alt=media')) return response(change.media ?? bytes, change.mediaHeaders, change.noMediaStream)
    const metadata = { bucket: 'jenfu-platform-prod-aipdm-release', name: object,
      generation: '7', crc32c: source.crc32c, size: String(bytes.length), ...change.metadata }
    return response(change.metadataBytes ?? JSON.stringify(metadata), change.metadataHeaders, change.noMetadataStream)
  }
  return { source, fetchImpl, calls, unboundedCalls: () => originalArrayBufferCalls }
}

test('B24 native exact Git source archive authenticates current commit/profile/all raw SQL with variable padding', () => {
  const fixture = b23NativeArchive(), deadlineAt = b23Deadline()
  const parsed = parseAiPdmMigrationArchive({ bytes: fixture.tar, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt })
  const git = assertAiPdmMigrationContent({ files: fixture.files, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt })
  assert.equal(parsed.files.size, fixture.bundle.entries.length + 1)
  assert.deepEqual(assertAiPdmMigrationEquivalent(git, parsed), { orderedEntriesSha256: git.orderedEntriesSha256, profileMigrationsSha256: git.profileMigrationsSha256 })
  for (const [path, bytes] of parsed.files) { assert.ok(bytes.equals(fixture.files.get(path))); assert.notEqual(bytes.buffer, fixture.tar.buffer) }
  const padded = Buffer.concat([fixture.tar, Buffer.alloc(2048)])
  assert.deepEqual(parseAiPdmMigrationArchive({ bytes: padded, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt }).migrations, parsed.migrations)
  const gzip = gzipSync(fixture.tar)
  assert.equal(parseAiPdmMigrationArchive({ bytes: gzip, gzip: true, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt }).files.size, fixture.bundle.entries.length + 1)
})
test('B23 archive wire adapter uses only exact metadata/sealed GET with raw arrayBuffer zero', async () => {
  const fixture = b23NativeArchive(), bytes = gzipSync(fixture.tar), wire = b23Wire(bytes)
  const readback = await readAiPdmSourceArchive({ ...wire, token: 'recorded-local-token-long-enough', sourceRevision: b23Revision, deadlineAt: b23Deadline() })
  assert.ok(readback.bytes.equals(bytes)); assert.equal(wire.unboundedCalls(), 0)
  assert.equal(wire.calls.length, 2); assert.ok(wire.calls.every(row => row.method === 'GET'))
  assert.ok(wire.calls[1].url.endsWith('?alt=media&generation=7'))
})
test('B23 metadata and media signals clip to the same remaining observation deadline', async () => {
  const originalNow = Date.now, originalTimeout = AbortSignal.timeout, started = originalNow(), delays = []
  let clock = started; Date.now = () => clock
  AbortSignal.timeout = delay => { delays.push(delay); return originalTimeout(delay) }
  try {
    const wire = b23Wire(Buffer.from([31, 139, 1, 2])), fetchImpl = wire.fetchImpl
    wire.fetchImpl = async (...args) => { const result = await fetchImpl(...args); if (!args[0].includes('alt=media')) clock += 2000; return result }
    await readAiPdmSourceArchive({ ...wire, token: 'recorded-local-token-long-enough', sourceRevision: b23Revision, deadlineAt: new Date(started + 5000).toISOString() })
    assert.deepEqual(delays, [5000, 3000]); assert.equal(wire.unboundedCalls(), 0)
  } finally { Date.now = originalNow; AbortSignal.timeout = originalTimeout }
})
test('B23 synchronous archive parsing cannot outlive its observation deadline', () => {
  const fixture = b23NativeArchive(), originalNow = Date.now, started = originalNow(); let calls = 0
  Date.now = () => ++calls > 3 ? started + 600000 : started
  try { assert.throws(() => parseAiPdmMigrationArchive({ bytes: fixture.tar, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt: new Date(started + 600000).toISOString() }), /ARCHIVE_DEADLINE|OBSERVATION_EXPIRED/u) }
  finally { Date.now = originalNow }
})
test('B23 valid gzip expansion beyond 256 MiB is rejected by the actual archive output cap', () => {
  const member = gzipSync(Buffer.alloc(1048576), { level: 9 })
  assert.equal(member.readUInt32LE(member.length - 4), 1048576)
  assert.equal(gunzipSync(Buffer.concat([member, member]), { maxOutputLength: 2097152 }).length, 2097152, 'valid concatenated gzip members, not malformed gzip')
  const compressed = Buffer.concat(Array(257).fill(member))
  assert.ok(compressed.length < 1048576); assert.equal(257 * member.readUInt32LE(member.length - 4), 269484032)
  const fixture = b23NativeArchive()
  assert.throws(() => parseAiPdmMigrationArchive({ bytes: compressed, gzip: true, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt: b23Deadline() }), /ARCHIVE_GZIP_INVALID/u)
})
for (const [name, change] of [
  ['metadata declared oversize', { metadataHeaders: { 'content-length': '65537' } }],
  ['metadata cumulative oversize', { metadataBytes: 'x'.repeat(65537) }],
  ['media declared oversize', { mediaHeaders: { 'content-length': '268435457' } }],
  ['metadata size oversize', { metadata: { size: '268435457' } }],
  ['metadata size unsafe', { metadata: { size: '9007199254740992' } }],
  ['metadata missing stream', { noMetadataStream: true }],
  ['media missing stream', { noMediaStream: true }],
  ['generation drift', { metadata: { generation: '8' } }],
  ['CRC drift', { metadata: { crc32c: 'AAAAAA==' } }],
  ['wrong bucket', { metadata: { bucket: 'sibling-release' } }],
  ['wrong name', { metadata: { name: 'source/releases/other/source.tar.gz' } }],
  ['short body', { media: Buffer.from('bad') }],
  ['same-length corrupt media', { media: Buffer.from('bad!') }],
  ['media cumulative exceeds metadata size', { media: Buffer.alloc(5) }],
]) test(`B23 bounded archive ${name} fails before raw arrayBuffer`, async () => {
  const wire = b23Wire(Buffer.from([31, 139, 1, 2]), change)
  await assert.rejects(readAiPdmSourceArchive({ ...wire, token: 'recorded-local-token-long-enough', sourceRevision: b23Revision, deadlineAt: b23Deadline() }))
  assert.equal(wire.unboundedCalls(), 0)
})
test('B23 archive rejects expired deadline and non-app source substitution before network', async () => {
  const wire = b23Wire(Buffer.from('source'))
  await assert.rejects(readAiPdmSourceArchive({ ...wire, token: 'recorded-local-token-long-enough', sourceRevision: b23Revision, deadlineAt: new Date(Date.now() - 1).toISOString() }))
  await assert.rejects(readAiPdmSourceArchive({ ...wire, source: { ...wire.source, uri: wire.source.uri.replace(`/${'c'.repeat(64)}/`, '/worker-reuse/') }, token: 'recorded-local-token-long-enough', sourceRevision: b23Revision, deadlineAt: b23Deadline() }))
  assert.equal(wire.calls.length, 0)
})
for (const [name, mutate] of [
  ['checksum', tar => { tar[0] ^= 1 }],
  ['magic', tar => { tar[257] = 88 }],
  ['version', tar => { tar[263] = 49 }],
  ['base256 size', tar => { tar[124] = 128 }],
  ['commit mismatch', tar => { tar[512 + 11] = 98 }],
  ['nonzero trailing', tar => { tar[tar.length - 1] = 1 }],
]) test(`B23 native archive rejects ${name}`, () => {
  const fixture = b23NativeArchive(), bytes = Buffer.from(fixture.tar); mutate(bytes)
  assert.throws(() => parseAiPdmMigrationArchive({ bytes, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt: b23Deadline() }))
})
test('B23 content verifies whole migrations graph and raw 082 including newline bytes', () => {
  const fixture = b23NativeArchive(), deadlineAt = b23Deadline()
  const files = new Map(fixture.files), sql = fixture.bundle.entries.find(row => row.path.startsWith('db/postgres/082_'))
  assert.ok(sql); files.set(sql.path, Buffer.concat([files.get(sql.path), Buffer.from('\r\n')]))
  assert.throws(() => assertAiPdmMigrationContent({ files, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt }))
  const profile = JSON.parse(fixture.files.get(b23ProfilePath)); profile.migrations.unrecognizedSkip = true
  files.set(sql.path, fixture.files.get(sql.path)); files.set(b23ProfilePath, Buffer.from(JSON.stringify(profile)))
  assert.throws(() => assertAiPdmMigrationContent({ files, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt }))
})
test('B23 local PAX path is authoritative once and UTF8 byte-length framed', () => {
  const fixture = b23NativeArchive()
  const longPath = `source/${'a'.repeat(101)}/皜祈岫.txt`
  const bytes = b23SelectedTar([b23TarRecord('pax_local', b23Pax('path', longPath), 'x'), b23TarRecord('fallback', Buffer.from('unrelated'))])
  assert.equal(parseAiPdmMigrationArchive({ bytes, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt: b23Deadline() }).files.size, fixture.bundle.entries.length + 1)
})
for (const [name, records] of [
  ['duplicate logical name', () => [b23TarRecord('source/', Buffer.alloc(0), '5')]],
  ['selected directory collision', () => [b23TarRecord(`source/${b23ProfilePath}`, Buffer.alloc(0), '5')]],
  ['symlink anywhere', () => [b23TarRecord('source/unrelated', Buffer.alloc(0), '2', 0o644, 'source/other')]],
  ['hardlink anywhere', () => [b23TarRecord('source/unrelated', Buffer.alloc(0), '1')]],
  ['device anywhere', () => [b23TarRecord('source/unrelated', Buffer.alloc(0), '3')]],
  ['regular linkname', () => [b23TarRecord('source/unrelated', Buffer.alloc(0), '0', 0o644, 'other')]],
  ['absolute path', () => [b23TarRecord('/source/unrelated')]],
  ['backslash path', () => [b23TarRecord('source/a\\b')]],
  ['dotdot path', () => [b23TarRecord('source/a/../b')]],
  ['empty path segment', () => [b23TarRecord('source/a//b')]],
  ['encoded separator', () => [b23TarRecord('source/a%2Fb')]],
  ['Unicode control in tar path', () => [b23TarRecord('source/a\u0085b')]],
  ['Unicode control in PAX path', () => [b23TarRecord('pax_local', b23Pax('path', 'source/a\u0085b'), 'x')]],
  ['late global PAX', () => [b23TarRecord('pax_global_header', b23Pax('comment', b23Revision), 'g')]],
  ['dangling local PAX', () => [b23TarRecord('pax_local', b23Pax('path', 'source/long'), 'x')]],
  ['consecutive local PAX', () => [b23TarRecord('pax_local', b23Pax('path', 'source/long'), 'x'), b23TarRecord('pax_local', b23Pax('path', 'source/long2'), 'x')]],
  ['unknown PAX key', () => [b23TarRecord('pax_local', b23Pax('size', '2'), 'x')]],
  ['duplicate PAX key', () => [b23TarRecord('pax_local', Buffer.concat([b23Pax('path', 'source/a'), b23Pax('path', 'source/b')]), 'x')]],
  ['invalid PAX length', () => [b23TarRecord('pax_local', Buffer.from('999 path=source/a\n'), 'x')]],
  ['path overflow', () => [b23TarRecord('pax_local', b23Pax('path', `source/${'a'.repeat(1024)}`), 'x')]],
  ['directory payload', () => [b23TarRecord('source/unrelated/', Buffer.from('x'), '5')]],
]) test(`B23 closed tar rejects ${name}`, () => {
  const fixture = b23NativeArchive()
  assert.throws(() => parseAiPdmMigrationArchive({ bytes: b23SelectedTar(records()), bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt: b23Deadline() }))
})
test('B23 tar rejects missing terminators partial blocks and too many headers', () => {
  const fixture = b23NativeArchive(), valid = b23SelectedTar()
  for (const bytes of [valid.subarray(0, valid.length - 2048), valid.subarray(0, valid.length - 1),
    b23SelectedTar(Array.from({ length: 10000 }, (_, index) => b23TarRecord(`source/unrelated-${index}`)))]) {
    assert.throws(() => parseAiPdmMigrationArchive({ bytes, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt: b23Deadline() }))
  }
  assert.throws(() => parseAiPdmMigrationArchive({ bytes: Buffer.from([31, 139, 0]), gzip: true, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt: b23Deadline() }))
  assert.throws(() => assertAiPdmMigrationEquivalent({ orderedEntriesSha256: 'same', profileMigrationsSha256: 'same' }, { orderedEntriesSha256: 'same', profileMigrationsSha256: 'same' }))
})
for (const [name, change] of [
  ['missing profile', files => files.delete(b23ProfilePath)],
  ['missing SQL', files => files.delete([...files.keys()].find(path => path.startsWith('db/postgres/')))],
  ['oversized selected file', files => files.set(b23ProfilePath, Buffer.alloc(1048577))],
  ['invalid profile UTF8', files => files.set(b23ProfilePath, Buffer.from([0xff]))],
  ['invalid profile JSON', files => files.set(b23ProfilePath, Buffer.from('{'))],
  ['wrong application', files => { const profile = JSON.parse(files.get(b23ProfilePath)); profile.application.id = 'sibling'; files.set(b23ProfilePath, Buffer.from(JSON.stringify(profile))) }],
  ['wrong profile policy', files => { const profile = JSON.parse(files.get(b23ProfilePath)); profile.profileVersion = 'custom'; files.set(b23ProfilePath, Buffer.from(JSON.stringify(profile))) }],
  ['changed entry order', files => { const profile = JSON.parse(files.get(b23ProfilePath)); profile.migrations.entries[0].order = 2; files.set(b23ProfilePath, Buffer.from(JSON.stringify(profile))) }],
  ['changed migration actor', files => { const profile = JSON.parse(files.get(b23ProfilePath)); profile.migrations.serviceAccount = 'other'; files.set(b23ProfilePath, Buffer.from(JSON.stringify(profile))) }],
]) test(`B23 authenticated content rejects ${name}`, () => {
  const fixture = b23NativeArchive(), files = new Map(fixture.files); change(files)
  assert.throws(() => assertAiPdmMigrationContent({ files, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt: b23Deadline() }))
})
test('B23 authenticated archive rejects selected mode and selected file over cap', () => {
  const fixture = b23NativeArchive()
  const make = (mode, profileBytes) => Buffer.concat([
    b23TarRecord('pax_global_header', b23Pax('comment', b23Revision), 'g'),
    b23TarRecord(`source/${b23ProfilePath}`, profileBytes, '0', mode),
    ...[...fixture.files].filter(([name]) => name !== b23ProfilePath).map(([name, bytes]) => b23TarRecord(`source/${name}`, bytes)), Buffer.alloc(1024)])
  for (const bytes of [make(0o600, fixture.files.get(b23ProfilePath)), make(0o644, Buffer.alloc(1048577))]) {
    assert.throws(() => parseAiPdmMigrationArchive({ bytes, bundle: fixture.bundle, sourceRevision: b23Revision, deadlineAt: b23Deadline() }))
  }
})

function sealed(value) {
  return { ...value, receiptSha256: sha256(canonicalize(value)) }
}
function fixture({ sourceLockChange = {}, migrationChange = {}, terminalChange = {},
  chainChange = {}, provenanceChange = {}, includeTerminal = false,
  buildProject = 'jenfu-platform-prod', ai = false } = {}) {
  const owner = ai ? 'ai-pdm' : 'platform'
  const bucket = ai ? 'jenfu-platform-prod-aipdm-release' : 'jenfu-platform-prod-platform-release'
  let root = `gs://${bucket}/receipts/releases/${releaseId}/${'c'.repeat(64)}`
  const objects = new Map()
  function put(uri, value) {
    const bytes = Buffer.from(`${canonicalize(value)}\n`)
    objects.set(uri, bytes)
    return { uri, sha256: sha256(bytes) }
  }
  const sourceLock = put(`gs://${bucket}/receipts/source-lock.json`, {
    schemaVersion: 'jenfu.dev012.owner-source-lock.v1',
    ownerApplicationId: owner, repository: ai ? 'jedchang0308-jenfu/AI-PDM' : 'jedchang0308-jenfu/Jenfu-Platform',
    branch: 'main', releaseId, sourceRevision: revision, sourceTree: 'd'.repeat(40),
    sourceSha256: 'e'.repeat(64), migrationManifestSha256: manifest,
    clean: true, remoteRef: 'refs/heads/main', remoteRevision: revision,
    status: 'SOURCE_FROZEN', releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND', observedAt: '2026-09-26T00:00:00.000Z',
    ...sourceLockChange,
  })
  const prerequisites = { sourceLock, authorization: null, readiness: null,
    foundation: null, infra: null, runtimeConfig: null }
  if (ai) {
    const intentRef = put(`gs://${bucket}/receipts/releases/${releaseId}/release-intent.json`, {
      schemaVersion: 'jenfu.dev117.ai-pdm-release-intent.v2', ownerApplicationId: owner, releaseId, sourceRevision: revision,
      sourceSha256: 'e'.repeat(64), sourceLockRef: sourceLock, authorizationPolicyRef: sourceLock, readinessReceiptRef: sourceLock,
      foundationReceiptRef: sourceLock, infraReceiptRef: sourceLock, runtimeConfigRef: sourceLock, migrationManifestSha256: manifest,
      previousRevision: 'ai-pdm-prod-aaaaaaaaaaaa', deadlineAt: '2026-09-26T01:00:00.000Z',
    })
    root = `gs://${bucket}/receipts/releases/${releaseId}/${intentRef.sha256}`
  }
  const prepare = put(`${root}/prepare.json`, sealed({
    schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: owner,
    releaseId, sourceRevision: revision, stage: 'prepare', previousReceiptRef: null,
    facts: { prerequisiteRefs: prerequisites }, observedAt: '2026-09-26T00:01:00.000Z',
    status: 'PASS',
  }))
  const migrate = put(`${root}/migrate.json`, sealed({
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: owner,
    sourceRevision: revision, database: 'jenfu_prod',
    ledger: ai ? 'ai_pdm_core.schema_migrations' : 'platform_core.schema_migrations', manifestSha256: manifest,
    baselineCount: 1, minimumLedgerCount: 1,
    ledgerBootstrap: { enabled: false, created: false },
    ledgerCount: ai ? 32 : 10, applied: 1, replayed: ai ? 31 : 9,
    crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true },
      { database: 'jenfu_stg', denied: true }],
    boundaryStatus: 'PASS', executionName: 'jobs/migrate/executions/1',
    startedAt: '2026-09-26T00:02:00.000Z',
    completedAt: '2026-09-26T00:03:00.000Z', status: 'PASS',
    ...migrationChange,
  }))
  const candidateRevision = 'platform-revision-one'
  const artifactDigest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/${ai ? 'aipdm-release/ai-pdm' : 'platform-release/platform'}@sha256:${'1'.repeat(64)}`
  const stage = (name, previousReceiptRef, facts) => put(`${root}/${name}.json`, sealed({
    schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: owner,
    releaseId, sourceRevision: revision, stage: name, previousReceiptRef,
    facts: { ...facts, ...(chainChange[name] ?? {}) },
    observedAt: '2026-09-26T00:04:00.000Z', status: 'PASS',
  }))
  const common = { candidateRevision, artifactDigest }
  const sourceObject = { uri: `gs://${bucket}/source/releases/${releaseId}/${root.split('/').at(-1)}/source.tar.gz`,
    sha256: sha256(archivedSource), generation: '7',
    crc32c: crc32cBase64(archivedSource) }
  const imageUri = artifactDigest.split('@')[0]
  const provenance = put(`${root}/provenance.json`, {
    schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1',
    ownerApplicationId: owner, sourceRevision: revision,
    sourceObject, artifactDigest, status: 'PASS',
    cloudBuild: { name: `projects/${buildProject}/locations/asia-east1/builds/${buildId}`,
      id: buildId, status: 'SUCCESS', projectId: 'jenfu-platform-prod',
      serviceAccount: `projects/jenfu-platform-prod/serviceAccounts/${ai ? 'aipdm' : 'platform'}-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com`,
      options: { requestedVerifyOption: 'VERIFIED' },
      sourceProvenance: { resolvedStorageSource: {
        bucket, object: sourceObject.uri.slice(`gs://${bucket}/`.length),
        generation: sourceObject.generation } },
      results: { images: [{ name: `${imageUri}:release-${revision}`,
        digest: artifactDigest.split('@')[1] }] } },
    artifactRegistry: { uri: artifactDigest }, ...provenanceChange,
  })
  const build = stage('build', prepare, { artifactDigest,
    sourceObject, provenanceReceiptRef: provenance })
  const deployment = put(`${root}/deployment-capsule.json`, {
    sourceRevision: revision, artifactDigest, buildReceiptRef: build,
  })
  let terminal = null
  if (includeTerminal) {
    const candidate = stage('candidate', migrate, { ...common,
      migrationReceiptRef: migrate, deploymentCapsuleRef: deployment })
    const entrypoint = stage('entrypoint', candidate, {})
    const verifyStage = stage('verify', entrypoint, { ...common,
      smoke: { status: 'PASS' } })
    const decision = stage('decision', verifyStage, { ...common, decision: 'GO' })
    const activate = stage('activate', decision, { ...common,
      effectiveRevision: candidateRevision })
    const canonical = stage('canonical', activate, { ...common,
      smoke: { status: 'PASS' } })
    const finalize = stage('finalize', canonical, { ...common,
      result: 'RELEASED', temporaryCandidateTags: 0 })
    terminal = stage('terminal', finalize, { ...common,
      result: 'RELEASED', databaseDisposition: 'FORWARD_APPLIED',
      remainingHumanAction: 0, ...terminalChange })
  }
  const fetchImpl = async (url) => {
    const match = /\/b\/([^/]+)\/o\/([^?]+)/u.exec(url)
    const uri = match && `gs://${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`
    const bytes = objects.get(uri)
    if (!bytes) return new Response('', { status: 404 })
    if (url.includes('alt=media')) return new Response(bytes)
    return new Response(JSON.stringify({ generation: '7', crc32c: crc32cBase64(bytes) }))
  }
  return { refs: { prepare, migrate, terminal }, fetchImpl, objects }
}
test('B30 receipt metadata survives warm opaque-context proof reads', async () => {
  const input = fixture({ ai: true, includeTerminal: true }), calls = []
  const read = () => readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision: revision,
    refs: input.refs, token: 'local-proof-token', fetchImpl: async (url, options) => { calls.push(url); return input.fetchImpl(url, options) } })
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    const cold = await read(), count = calls.length, warm = await read()
    assert.deepEqual(warm, cold)
    assert.equal(calls.length, count, 'verified receipts reuse their bytes and provider metadata together')
    for (const row of [warm.prepare, warm.sourceLock, warm.migrate, warm.terminal, ...Object.values(warm.releaseChain)]) {
      assert.equal(row.generation, '7'); assert.match(row.crc32c, /^[A-Za-z0-9+/]{6}==$/u)
    }
  })
})
test('B30 byte-only receipt memo requires an exact provider metadata read', async () => {
  const input = fixture({ ai: true, includeTerminal: true }), calls = []
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    await readAiPdmEvidenceLeaf({ ref: input.refs.prepare, read: async () => input.objects.get(input.refs.prepare.uri) })
    const proof = await readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision: revision, refs: input.refs, token: 'local-proof-token',
      fetchImpl: async (url, options) => { calls.push(url); return input.fetchImpl(url, options) } })
    assert.equal(proof.prepare.generation, '7')
    assert.equal(calls.filter(url => url.includes(encodeURIComponent(input.refs.prepare.uri.split('/').slice(3).join('/')))).length, 2)
  })
})
test('B30 conflicting fixed receipt generation fails without weakening the proof', async () => {
  const input = fixture({ ai: true, includeTerminal: true }); let replaced = false, deploymentUri
  const fetchImpl = async (url, options) => {
    const response = await input.fetchImpl(url, options)
    if (replaced && !url.includes('alt=media') && url.endsWith(encodeURIComponent(deploymentUri.split('/').slice(3).join('/')))) {
      return new Response(JSON.stringify({ ...await response.json(), generation: '8' }))
    }
    return response
  }
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    const proof = await readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision: revision, refs: input.refs, token: 'local-proof-token', fetchImpl })
    deploymentUri = proof.releaseChain.deployment.ref; replaced = true
    await assert.rejects(readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision: revision,
      refs: { prepare: input.refs.prepare, migrate: null, terminal: null }, mode: 'pre_migration', token: 'local-proof-token', fetchImpl }), /CONTEXT_RECEIPT_METADATA_CONFLICT/u)
  })
})
for (const [name, corrupt, expected] of [
  ['CRC', async response => new Response(JSON.stringify({ ...await response.json(), crc32c: 'AAAAAA==' })), /MIGRATION_GCS_CRC32C_MISMATCH/u],
  ['hash', async response => new Response(Buffer.concat([Buffer.from(await response.arrayBuffer()), Buffer.from(' ')])), /OBJECT_HASH_MISMATCH/u],
]) test(`B30 byte-only memo cannot bypass provider ${name} verification`, async () => {
  const input = fixture({ ai: true, includeTerminal: true })
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    await readAiPdmEvidenceLeaf({ ref: input.refs.prepare, read: async () => input.objects.get(input.refs.prepare.uri) })
    const fetchImpl = async (url, options) => {
      const response = await input.fetchImpl(url, options), prepare = url.includes(encodeURIComponent(input.refs.prepare.uri.split('/').slice(3).join('/')))
      if (!prepare) return response
      if (name === 'CRC' && !url.includes('alt=media')) return corrupt(response)
      if (name === 'hash') {
        const bytes = Buffer.concat([input.objects.get(input.refs.prepare.uri), Buffer.from(' ')])
        return url.includes('alt=media') ? corrupt(response) : new Response(JSON.stringify({ generation: '7', crc32c: crc32cBase64(bytes) }))
      }
      return response
    }
    await assert.rejects(readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision: revision, refs: input.refs, token: 'local-proof-token', fetchImpl }), expected)
  })
})
async function verify(input = fixture()) {
  return readOwnerReleaseProof({ owner: 'platform', sourceRevision: revision,
    refs: input.refs, token: 'x'.repeat(25), fetchImpl: input.fetchImpl })
}
async function b23FixedRuntimeWire({ sourceSize = archivedSource.length, missingStream = false, missingMetadataStream = false,
  metadataContentLength = null, mediaContentLength = null, metadataOverflow = false, mediaOverflow = false,
  afterSourceFetch = null, afterSourceRead = null, lateProvider = false, lateProviderNth = 1, builderReadbackToken = null } = {}) {
  const input = fixture({ ai: true })
  const claim = await readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision: revision, refs: input.refs, token: 'provider-readback-token', fetchImpl: input.fetchImpl })
  const source = claim.providerClaim.sourceObject, object = source.uri.split('/').slice(3).join('/')
  const base = `https://storage.googleapis.com/storage/v1/b/jenfu-platform-prod-aipdm-release/o/${encodeURIComponent(object)}`
  const counters = { sourceMetadata: 0, sourceMedia: 0, sourceArrayBuffer: 0, provider: 0 }, provider = providerFetch(claim, { providerToken: builderReadbackToken ?? 'provider-readback-token' }), authCalls = []
  const streamCounters = { metadataReads: 0, mediaReads: 0, cancels: 0, allocatedBytes: 0 }
  const responseFor = (bytes, kind, declared, missing, overflow) => {
    const response = new Response(bytes, { headers: declared === null ? {} : { 'content-length': String(declared) } })
    response.arrayBuffer = async () => { counters.sourceArrayBuffer++; throw Error('RAW_SOURCE_ARRAYBUFFER_FORBIDDEN') }
    if (missing) Object.defineProperty(response, 'body', { value: null })
    else if (overflow) {
      const chunk = Buffer.alloc(kind === 'metadata' ? 32769 : Math.floor(sourceSize / 2) + 1)
      streamCounters.allocatedBytes += chunk.length
      let emitted = 0
      Object.defineProperty(response, 'body', { value: { getReader: () => ({
        read: async () => { streamCounters[`${kind}Reads`]++; return emitted++ < 2 ? { done: false, value: chunk } : { done: true } },
        cancel: async () => { streamCounters.cancels++ }, releaseLock: () => {},
      }) } })
    } else {
      const body = response.body
      Object.defineProperty(response, 'body', { value: { getReader: () => {
        const reader = body.getReader()
        return { read: async () => { streamCounters[`${kind}Reads`]++; const result = await reader.read(); afterSourceRead?.(kind); return result },
          cancel: async reason => { streamCounters.cancels++; return reader.cancel(reason) }, releaseLock: () => reader.releaseLock() }
      } } })
    }
    return response
  }
  const fetchImpl = async (url, options) => {
    authCalls.push({ url, method: options.method ?? 'GET', authorization: options.headers?.authorization })
    if (url === base) {
      counters.sourceMetadata++
      const response = responseFor(JSON.stringify({ bucket: 'jenfu-platform-prod-aipdm-release', name: object, generation: source.generation, crc32c: source.crc32c, size: String(sourceSize) }), 'metadata', metadataContentLength, missingMetadataStream, metadataOverflow)
      afterSourceFetch?.('metadata'); return response
    }
    if (url.startsWith(`${base}?alt=media`)) {
      counters.sourceMedia++
      const response = responseFor(archivedSource, 'media', mediaContentLength, missingStream, mediaOverflow)
      afterSourceFetch?.('media'); return response
    }
    if (url.startsWith('https://storage.googleapis.com/')) return input.fetchImpl(url, options)
    counters.provider++
    if (lateProvider && counters.provider >= lateProviderNth) Date.now = () => b23FixedRuntimeWire.started + 600000
    return provider(url, options)
  }
  const profile = { application: { id: 'ai-pdm' }, artifact: { releaseBucket: 'jenfu-platform-prod-aipdm-release' }, target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'ai-pdm-prod' } }
  return { profile, input, claim, counters, streamCounters, authCalls, transport: createOwnerTransport({ token: 'provider-readback-token', builderReadbackToken, fetchImpl }), fetchImpl }
}
test('B24 secondary builder credential is restricted to authenticated exact Build and encoded image GETs', async () => {
  const builderToken = 'MODELED-BUILDER-READ-TOKEN-ONLY', wire = await b23FixedRuntimeWire({ builderReadbackToken: builderToken })
  const observed = await wire.transport.readOwnerSourceProof({ profile: wire.profile, sourceRevision: revision, refs: wire.input.refs, verifyProvider: true })
  assert.equal(observed.provider.status, 'BUILD_IMAGE_VERIFIED')
  const providerCalls = wire.authCalls.filter(call => !call.url.startsWith('https://storage.googleapis.com/'))
  assert.equal(providerCalls.length, 2)
  assert.equal(providerCalls[0].url, `https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`)
  assert.equal(providerCalls[1].url, `https://artifactregistry.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release/dockerImages/${encodeURIComponent(`ai-pdm@sha256:${'1'.repeat(64)}`)}`)
  for (const call of providerCalls) { assert.equal(call.method, 'GET'); assert.equal(call.authorization, `Bearer ${builderToken}`) }
  for (const call of wire.authCalls.filter(call => call.url.startsWith('https://storage.googleapis.com/'))) assert.equal(call.authorization, 'Bearer provider-readback-token')
  assert.equal(JSON.stringify(observed).includes(builderToken), false)
})
test('B27 build composite authenticates source with verifier and exact Build/Image with builder', async () => {
  const builderToken = 'MODELED-BUILDER-READ-TOKEN-ONLY', wire = await b23FixedRuntimeWire({ builderReadbackToken: builderToken })
  const transport = createAiPdmBuildReadbackTransport({ token: builderToken, verifierReadbackToken: 'provider-readback-token', fetchImpl: wire.fetchImpl })
  const observed = await transport.readOwnerSourceProof({ profile: wire.profile, sourceRevision: revision, refs: wire.input.refs, verifyProvider: true })
  assert.equal(observed.provider.status, 'BUILD_IMAGE_VERIFIED')
  for (const call of wire.authCalls) {
    assert.equal(call.method, 'GET')
    assert.equal(call.authorization, `Bearer ${call.url.startsWith('https://storage.googleapis.com/') ? 'provider-readback-token' : builderToken}`)
  }
  assert.equal(JSON.stringify(observed).includes(builderToken), false)
})

test('B24 secondary readback rejects wrong actor, owner, project, region, source, token and copied proof', async () => {
  const wire = await b23FixedRuntimeWire()
  await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
    const { proof } = await wire.transport.readOwnerSourceProof({ profile: wire.profile, sourceRevision: revision, refs: wire.input.refs })
    const binding = { token: 'MODELED-BUILDER-READ-TOKEN-ONLY', actor: 'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com', ownerApplicationId: 'ai-pdm', projectId: 'jenfu-platform-prod', region: 'asia-east1', sourceRevision: revision }
    for (const mutation of [{ actor: 'aipdm-prod-verifier@jenfu-platform-prod.iam.gserviceaccount.com' }, { ownerApplicationId: 'platform' }, { projectId: 'foreign' }, { region: 'us-central1' }, { sourceRevision: '0'.repeat(40) }, { token: '' }, { token: 'x'.repeat(20) + '\r\n' }, { method: 'POST' }, { resource: 'foreign' }]) {
      await assert.rejects(verifyOwnerProviderReadback({ proof, token: 'provider-readback-token', fetchImpl: wire.fetchImpl, builderReadback: { ...binding, ...mutation } }), /SECONDARY_READBACK_BINDING_INVALID/u)
      assert.equal(wire.counters.provider, 0)
    }
    await assert.rejects(verifyOwnerProviderReadback({ proof: { ...proof }, token: 'provider-readback-token', fetchImpl: wire.fetchImpl, builderReadback: binding }), /PROVIDER_SOURCE_MISMATCH/u)
    assert.equal(wire.counters.provider, 0)
  })
})
test('B24 secondary GET rejects redirects and provider resource drift without credential fallback', async () => {
  for (const kind of ['redirect', 'build-project', 'build-region', 'build-id', 'image-name', 'denied']) {
    const wire = await b23FixedRuntimeWire({ builderReadbackToken: 'MODELED-BUILDER-READ-TOKEN-ONLY' })
    const fetchImpl = async (url, options) => {
      const response = await wire.fetchImpl(url, options)
      if (!url.startsWith('https://cloudbuild.googleapis.com/') && !url.startsWith('https://artifactregistry.googleapis.com/')) return response
      if (kind === 'redirect') return new Response('', { status: 302, headers: { location: 'https://foreign.example' } })
      if (kind === 'denied') return new Response('', { status: 403 })
      const body = await response.json()
      if (url.startsWith('https://cloudbuild.googleapis.com/')) {
        if (kind === 'build-project') body.projectId = 'foreign'
        if (kind === 'build-region') body.name = body.name.replace('asia-east1', 'us-central1')
        if (kind === 'build-id') body.id = '00000000-0000-0000-0000-000000000000'
      } else if (kind === 'image-name') body.name = body.name.replace('/ai-pdm@', '/foreign@')
      return new Response(JSON.stringify(body))
    }
    const transport = createOwnerTransport({ token: 'provider-readback-token', builderReadbackToken: 'MODELED-BUILDER-READ-TOKEN-ONLY', fetchImpl })
    await assert.rejects(transport.readOwnerSourceProof({ profile: wire.profile, sourceRevision: revision, refs: wire.input.refs, verifyProvider: true }), /PROVIDER_(?:READBACK_FAILED|BUILD_MISMATCH|IMAGE_MISMATCH)/u, kind)
    assert.ok(wire.authCalls.filter(call => !call.url.startsWith('https://storage.googleapis.com/')).every(call => call.authorization === 'Bearer MODELED-BUILDER-READ-TOKEN-ONLY' && call.method === 'GET'))
  }
})
test('B23 actual fixed four-argument source proof shares bounded source authentication through verifyProvider', async () => {
  const wire = await b23FixedRuntimeWire()
  const result = await wire.transport.readOwnerSourceProof({ profile: wire.profile, sourceRevision: revision, refs: wire.input.refs, verifyProvider: true })
  assert.equal(result.proof.disposition, 'migration_only'); assert.equal(result.provider.status, 'BUILD_IMAGE_VERIFIED')
  assert.deepEqual(wire.counters, { sourceMetadata: 1, sourceMedia: 1, sourceArrayBuffer: 0, provider: 2 })
  await assert.rejects(runAiPdmEvidenceContext(createAiPdmEvidenceContext(), () => verifyOwnerProviderReadback({ proof: result.proof, token: 'provider-readback-token', fetchImpl: wire.fetchImpl })), /PROVIDER_SOURCE_MISMATCH/u)
  await assert.rejects(runAiPdmEvidenceContext(createAiPdmEvidenceContext(), () => verifyOwnerProviderReadback({ proof: { ...result.proof }, token: 'provider-readback-token', fetchImpl: async () => { throw Error('COPY_CANNOT_FETCH') } })), /PROVIDER_SOURCE_MISMATCH/u)
})
for (const [name, options, expected] of [
  ['overcap', { sourceSize: 268435457 }, /ARCHIVE_METADATA/u],
  ['missing stream', { missingStream: true }, /ARCHIVE_STREAM/u],
  ['metadata declared cap', { metadataContentLength: 65537 }, /ARCHIVE_STREAM_LIMIT/u],
  ['metadata cumulative cap', { metadataOverflow: true }, /ARCHIVE_STREAM_LIMIT/u],
  ['media declared cap', { mediaContentLength: archivedSource.length + 1 }, /ARCHIVE_STREAM_LIMIT/u],
  ['media cumulative cap', { mediaOverflow: true }, /ARCHIVE_STREAM_LIMIT/u],
  ['metadata missing stream', { missingMetadataStream: true }, /ARCHIVE_STREAM/u],
]) test(`B23 actual verifyProvider fixed seam rejects ${name} without raw source arrayBuffer or provider read`, async () => {
  const wire = await b23FixedRuntimeWire(options)
  await assert.rejects(wire.transport.readOwnerSourceProof({ profile: wire.profile, sourceRevision: revision, refs: wire.input.refs, verifyProvider: true }), expected)
  assert.equal(wire.counters.sourceArrayBuffer, 0); assert.equal(wire.counters.provider, 0)
  if (name.startsWith('metadata') || name === 'overcap') assert.equal(wire.counters.sourceMedia, 0)
  if (options.metadataContentLength !== null && options.metadataContentLength !== undefined) {
    assert.equal(wire.streamCounters.metadataReads, 0); assert.equal(wire.streamCounters.allocatedBytes, 0)
  }
  if (options.mediaContentLength !== null && options.mediaContentLength !== undefined) {
    assert.equal(wire.counters.sourceMedia, 1); assert.equal(wire.streamCounters.mediaReads, 0); assert.equal(wire.streamCounters.allocatedBytes, 0)
  }
  if (options.metadataOverflow || options.mediaOverflow) {
    assert.equal(wire.streamCounters[options.metadataOverflow ? 'metadataReads' : 'mediaReads'], 2)
    assert.equal(wire.streamCounters.cancels, 1)
    assert.equal(wire.streamCounters.allocatedBytes, options.metadataOverflow ? 32769 : Math.floor(archivedSource.length / 2) + 1)
  }
})
test('B23 actual fixed source proof cannot reset its budget before provider Build/Image', async () => {
  const originalNow = Date.now
  const wire = await b23FixedRuntimeWire({ lateProvider: true })
  b23FixedRuntimeWire.started = originalNow()
  try {
    Date.now = () => b23FixedRuntimeWire.started
    await assert.rejects(wire.transport.readOwnerSourceProof({ profile: wire.profile, sourceRevision: revision, refs: wire.input.refs, verifyProvider: true }), /OBSERVATION_EXPIRED|CONTEXT_INVALID/u)
    assert.equal(wire.counters.sourceArrayBuffer, 0); assert.equal(wire.counters.provider, 1)
  } finally { Date.now = originalNow }
})
for (const kind of ['metadata', 'media']) for (const boundary of ['await return', 'stream read']) {
  test(`B23 actual fixed source ${kind} ${boundary} expiry rejects late bytes`, async () => {
    const originalNow = Date.now, originalTimeout = AbortSignal.timeout, started = originalNow(), controllers = []
    const expire = observed => {
      if (observed !== kind) return
      Date.now = () => started + 600000
      if (boundary === 'stream read') controllers.at(-1).abort()
    }
    const wire = await b23FixedRuntimeWire(boundary === 'await return' ? { afterSourceFetch: expire } : { afterSourceRead: expire })
    try {
      Date.now = () => started
      AbortSignal.timeout = () => { const controller = new AbortController(); controllers.push(controller); return controller.signal }
      await assert.rejects(wire.transport.readOwnerSourceProof({ profile: wire.profile, sourceRevision: revision, refs: wire.input.refs, verifyProvider: true }), /ARCHIVE_DEADLINE|OBSERVATION_EXPIRED|CONTEXT_INVALID/u)
      assert.equal(wire.counters.sourceArrayBuffer, 0); assert.equal(wire.counters.provider, 0)
      assert.equal(wire.counters.sourceMedia, kind === 'metadata' ? 0 : 1)
      if (boundary === 'stream read') {
        assert.equal(wire.streamCounters[`${kind}Reads`], 1)
        assert.equal(wire.streamCounters.cancels, 1, 'in-flight reader is canceled before late bytes can succeed')
      } else assert.equal(wire.streamCounters[`${kind}Reads`], 0, 'awaited response expiry prevents starting its body reader')
    } finally { Date.now = originalNow; AbortSignal.timeout = originalTimeout; for (const controller of controllers) controller.abort() }
  })
}
test('B23 actual final Image GET cannot return success after the shared budget expires', async () => {
  const originalNow = Date.now, wire = await b23FixedRuntimeWire({ lateProvider: true, lateProviderNth: 2 })
  b23FixedRuntimeWire.started = originalNow()
  try {
    Date.now = () => b23FixedRuntimeWire.started
    await assert.rejects(wire.transport.readOwnerSourceProof({ profile: wire.profile, sourceRevision: revision, refs: wire.input.refs, verifyProvider: true }), /OBSERVATION_EXPIRED|CONTEXT_INVALID/u)
    assert.equal(wire.counters.provider, 2); assert.equal(wire.counters.sourceMetadata, 1); assert.equal(wire.counters.sourceMedia, 1); assert.equal(wire.counters.sourceArrayBuffer, 0)
  } finally { Date.now = originalNow }
})
test('B23 completed historical migration chronology remains strict', async () => {
  for (const migrationChange of [{ completedAt: '2026-09-26T00:01:00.000Z' }, { startedAt: 'invalid' }, { completedAt: 'invalid' }]) {
    const input = fixture({ migrationChange })
    await assert.rejects(readOwnerReleaseProof({ owner: 'platform', sourceRevision: revision, refs: input.refs, token: 'provider-readback-token', fetchImpl: input.fetchImpl }), /MIGRATION_INVALID/u)
  }
})

// Mandatory root evidence layer is registered only by the sealed root controller.
// Default CI reports its absence and runs portable behavior/negative cases above.
const b23RootManifestPath = process.env.DEV122_B23_AUTHENTIC_INPUT_MANIFEST
const b23RootManifestHash = process.env.DEV122_B23_AUTHENTIC_INPUT_SHA256
const b24HeadRevision = b23Revision
if (b23RootManifestPath === undefined && b23RootManifestHash === undefined) console.info('B23_ROOT_AUTHENTIC_REPLAY_NOT_RUN: default CI portable layer; root authentic evidence is a separate mandatory gate')
else {
  // Replay the unchanged no-execution contract with an actual own Git source
  // preceding 083. Forward models pin the exact historical 33-entry source; ordinary archive tests above read the actual HEAD.
  const currentHeadRevision = '5c07105962345cf099a1fb43750482bfc210ba5e'
  const b23Revision = '02fb8c33976d0409c539f8e2c0153e3b5b504257'
  const b23NativeArchive = () => b23ArchiveAt(b23Revision)
  if (!b23RootManifestPath || !/^[a-f0-9]{64}$/u.test(b23RootManifestHash ?? '')) throw Error('B23_ROOT_MANIFEST_BINDING_INVALID')
  const manifestBytes = readFileSync(b23RootManifestPath)
  assert.equal(sha256(manifestBytes), b23RootManifestHash, 'root controller sealed manifest SHA')
  const rootManifest = JSON.parse(manifestBytes)
  assert.equal(rootManifest.project, 'AI-PDM'); assert.equal(rootManifest.state, 'AUTHENTIC_INPUT_CLOSURE_VERIFIED_ONLY')
  assert.equal(rootManifest.sourceRevision, '54d3c4c3fab41abf2045b025c90ca03d575e81f6')
  assert.ok(rootManifest.objects?.length >= 17); assert.ok(rootManifest.providerObjects?.length >= 2)
  const objects = new Map(), providers = new Map()
  const readPinned = (row, hash) => { const bytes = readFileSync(row.path); assert.equal(bytes.length, row.bytes); assert.equal(sha256(bytes), hash); return bytes }
  for (const row of rootManifest.objects) {
    assert.match(row.ref.uri, /^gs:\/\/jenfu-platform-prod-aipdm-release\/(?:receipts|source)\//u)
    assert.equal(objects.has(row.ref.uri), false); assert.match(row.generation, /^[1-9][0-9]*$/u)
    const bytes = readPinned(row, row.ref.sha256); assert.equal(crc32cBase64(bytes), row.crc32c)
    objects.set(row.ref.uri, { ...row, bytes })
  }
  const normalizeProvider = url => decodeURIComponent(url).replace('/projects/9536592944/', '/projects/jenfu-platform-prod/')
  for (const row of rootManifest.providerObjects) { assert.equal(providers.has(normalizeProvider(row.url)), false); providers.set(normalizeProvider(row.url), readPinned(row, row.sha256)) }
  const capsule = JSON.parse(objects.get(rootManifest.capsuleRef.uri).bytes)
  const rootUri = `gs://jenfu-platform-prod-aipdm-release/receipts/releases/${capsule.releaseId}/${rootManifest.capsuleRef.sha256}`
  const ref = name => objects.get(`${rootUri}/${name}.json`).ref
  const rootRefs = { prepare: ref('prepare'), migrate: ref('migrate'), terminal: ref('terminal') }
  const rootProfile = { application: { id: 'ai-pdm' }, artifact: { releaseBucket: 'jenfu-platform-prod-aipdm-release' }, target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'ai-pdm-prod' } }
  assert.equal(rootManifest.historicalGitInputs?.length, 3)
  const historical = new Map()
  for (const row of rootManifest.historicalGitInputs) {
    const value = JSON.parse(readPinned(row, row.sha256))
    assert.equal(value.sourceRevision, row.sourceRevision); assert.equal(value.treeId, row.treeId)
    const tree = Buffer.from(value.tree.base64, 'base64')
    assert.equal(tree.length, value.tree.bytes); assert.equal(sha256(tree), row.sourceTreeSha256)
    const blobs = new Map()
    for (const blob of value.blobs) {
      const bytes = Buffer.from(blob.base64, 'base64')
      assert.equal(bytes.length, blob.bytes); assert.equal(sha256(bytes), blob.sha256)
      assert.equal(blobs.has(blob.path), false); blobs.set(blob.path, bytes)
    }
    assert.equal(blobs.size, row.rawBlobCount)
    historical.set(row.sourceRevision, { ...value, tree, blobs })
  }
  const rootObject = ref => {
    const row = objects.get(ref.uri); assert.ok(row, `authentic JSON closure ${ref.uri}`)
    assert.equal(row.ref.sha256, ref.sha256); return JSON.parse(row.bytes)
  }
  const rootActivationRef = objects.get('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/DEV122-OPENSWX-ACTIVATE-20261007-R17.json').ref
  const rootFull = rootObject(capsule.openswxWorkerRef), rootWorkerBuild = rootObject(rootFull.workerBuildRef)
  const nativeGit = args => execFileSync('git', args, { cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, timeout: 30000, maxBuffer: 268435456 })
  const currentTree = nativeGit(['ls-tree', '-r', '-z', '--full-tree', b23Revision])
  const currentTreeId = nativeGit(['rev-parse', `${b23Revision}^{tree}`]).toString().trim()
  function rootSourceReader(sourceRevision = b23Revision) {
    const b23Revision = sourceRevision
    const currentTree = nativeGit(['ls-tree', '-r', '-z', '--full-tree', b23Revision])
    const currentTreeId = nativeGit(['rev-parse', `${b23Revision}^{tree}`]).toString().trim()
    const currentBlobs = new Map()
    const permitted = new Set([b23Revision]), calls = []
    const read = (path, revision) => {
      assert.match(path, /^[A-Za-z0-9._/-]+$/u); assert.ok(!path.split('/').some(part => !part || part === '.' || part === '..'))
      assert.ok(permitted.has(revision) || [...READBACK_IAM_PATHS, WORKER_PROFILE_PATH].includes(path), `chain admission before ${revision}:${path}`)
      calls.push({ path, revision, admitted: permitted.has(revision) })
      if (revision === b23Revision) {
        if (!currentBlobs.has(path)) currentBlobs.set(path, nativeGit(['show', `${b23Revision}:${path}`]))
        return Buffer.from(currentBlobs.get(path))
      }
      const value = historical.get(revision)?.blobs.get(path)
      assert.ok(value, `sealed historical blob ${revision}:${path}`); return Buffer.from(value)
    }
    read.authorizeOrigin = revision => { assert.ok(historical.has(revision) || revision === b23Revision); assert.ok(permitted.has(revision) || permitted.size < 9); permitted.add(revision) }
    read.readTree = revision => { assert.ok(permitted.has(revision), `chain tree admission before ${revision}`); return Buffer.from(revision === b23Revision ? currentTree : historical.get(revision).tree) }
    read.readTreeId = revision => { assert.ok(permitted.has(revision), `chain tree-id admission before ${revision}`); return revision === b23Revision ? currentTreeId : historical.get(revision).treeId }
    read.readArchive = revision => { assert.equal(revision, b23Revision); return Buffer.from(b23ArchiveAt(b23Revision).tar) }
    read.assertCurrentFrozen = () => assert.equal(nativeGit(['rev-parse', 'HEAD']).toString().trim(), b24HeadRevision, 'fixture selects immutable own Git bytes without changing the executing checkout')
    read.calls = calls
    return read
  }
  // Only a task-local model clock changes. Historical bytes remain untouched.
  async function rootModelClock(callback) {
    const originalNow = Date.now, originalTimeout = globalThis.setTimeout
    let clock = originalNow()
    const model = { now: () => new Date(clock).toISOString(), advance: ms => { clock += ms }, afterPauseFence: null }
    Date.now = () => clock
    globalThis.setTimeout = (fn, delay, ...args) => delay === 55000
      ? (clock += delay, model.afterPauseFence?.(), queueMicrotask(() => fn(...args)), { modeledPauseFence: true })
      : originalTimeout(fn, delay, ...args)
    try { return await callback(model) }
    finally { Date.now = originalNow; globalThis.setTimeout = originalTimeout }
  }
  function rootConsumerModel(clock, sourceRevision = b23Revision) {
    const b23Revision = sourceRevision, b23NativeArchive = () => b23ArchiveAt(sourceRevision)
    const currentTree = nativeGit(['ls-tree', '-r', '-z', '--full-tree', b23Revision])
    const currentTreeId = nativeGit(['rev-parse', `${b23Revision}^{tree}`]).toString().trim()
    const store = new Map(objects), providerStore = new Map(providers), source = rootSourceReader(sourceRevision)
    const appProfile = JSON.parse(source(b23ProfilePath, b23Revision)), workerProfile = JSON.parse(source(WORKER_PROFILE_PATH, b23Revision))
    const calls = [], publications = [], sequence = [], controls = {}
    let generation = 9000000000000000
    const seedBytes = (uri, bytes) => {
      const ref = { uri, sha256: sha256(bytes) }, row = { ref, bytes: Buffer.from(bytes), generation: String(++generation), crc32c: crc32cBase64(bytes) }
      store.set(uri, row); return ref
    }
    const seed = (uri, value) => seedBytes(uri, Buffer.from(`${canonicalize(value)}\n`))
    const readBytes = async (uri, { expectedSha256 = null } = {}) => {
      const row = store.get(uri)
      if (!row) throw Object.assign(Error('MISSING'), { code: 'MISSING' })
      if (expectedSha256 && row.ref.sha256 !== expectedSha256) throw Object.assign(Error('GCS_READBACK_HASH_MISMATCH'), { code: 'GCS_READBACK_HASH_MISMATCH' })
      return { ref: row.ref, bytes: Buffer.from(row.bytes), metadata: { generation: row.generation, crc32c: row.crc32c } }
    }
    const readJson = async ref => { const row = await readBytes(ref.uri, { expectedSha256: ref.sha256 }); return { ...row, value: JSON.parse(row.bytes) } }
    const putBytes = async (uri, bytes, options = {}) => {
      const old = store.get(uri)
      if (old && String(options.ifGenerationMatch ?? '0') === '0') {
        assert.ok(old.bytes.equals(bytes), `create-only exact model publication ${uri}`)
        return { ...await readBytes(uri), reused: true }
      }
      publications.push(uri); sequence.push(`publish:${uri.split('/').at(-1)}`); seedBytes(uri, bytes)
      return { ...await readBytes(uri), reused: false }
    }
    const putJson = (uri, value, opts) => putBytes(uri, Buffer.from(`${canonicalize(value)}\n`), opts)
    const wire = rootWire({ objectStore: store, providerStore })
    const runtime = rootObject(capsule.runtimeConfigRef).runtimeConfig
      ?? rootObject(capsule.runtimeConfigRef)
    const candidate = rootObject(ref('candidate')).facts
    let activeRevision = candidate.candidateRevision
    const serviceName = `projects/${appProfile.target.projectId}/locations/${appProfile.target.region}/services/${appProfile.target.serviceName}`
    let service = { name: serviceName, uid: 'b2300000-1234-1234-1234-123456789abc', scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 }, etag: 'MODELED-B23-APP-ETAG', generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' },
      ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true, uri: appProfile.target.canonicalOrigin, urls: [appProfile.target.canonicalOrigin],
      template: structuredClone(runtime.template), traffic: [{ revision: activeRevision, percent: 100 }], trafficStatuses: [{ revision: activeRevision, percent: 100 }] }
    const revisionFor = (name, config = runtime, facts = candidate) => {
      const row = { ...structuredClone(config.template), name: `${serviceName}/revisions/${name}`, service: serviceName, conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
      row.containers.find(item => item.name === appProfile.runtime.containerName).image = facts.artifactDigest
      const env = row.containers.find(item => item.name === appProfile.runtime.containerName).env
      env.push({ name: appProfile.environment.candidateOriginEnvironmentName, value: facts.tagUri })
      row.containers.find(item => item.name === appProfile.runtime.cloudSqlProxyContainer).image = facts.cloudSqlProxyResolvedImage
      return row
    }
    const revisions = new Map([[activeRevision, revisionFor(activeRevision)]])
    let job = { name: workerJobName(), etag: 'MODELED-B23-JOB-ETAG', generation: '17', observedGeneration: '17', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, template: workerTemplate(workerProfile, rootWorkerBuild.image, rootFull.tokenSecretVersion) }
    let scheduler = { name: workerSchedulerName(), state: 'PAUSED', schedule: '*/5 * * * *', timeZone: 'Etc/UTC', attemptDeadline: '30s', userUpdateTime: '2026-10-07T00:00:00Z',
      httpTarget: { uri: workerProfile.canonicalOrigin + workerProfile.recoverPath, httpMethod: 'POST', body: 'e30=', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Google-Cloud-Scheduler' }, oidcToken: { serviceAccountEmail: workerProfile.dispatchServiceAccount, audience: workerProfile.canonicalOrigin } } }
    const executions = []
    const policyRow = store.get('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/DEV122-PREBUILD-IAM-20261007-B16-after.json')
    assert.ok(policyRow, 'actual retained B16 project policy')
    const projectPolicy = JSON.parse(policyRow.bytes).projectPolicy
    assert.ok(Array.isArray(projectPolicy?.bindings))
    const request = async (url, options = {}) => {
      const method = options.method ?? 'GET'; calls.push({ url, method }); sequence.push(`${method}:${url}`)
      if (url.endsWith('/userinfo')) return { email: workerProfile.normalActor, email_verified: true, sub: 'MODELED-B23-NORMAL-ACTOR' }
      const body = providerStore.get(normalizeProvider(url)); if (body) return JSON.parse(body)
      if (url.includes('containeranalysis.googleapis.com')) {
        const kind = /kind="([A-Z_]+)"/u.exec(new URL(url).searchParams.get('filter'))?.[1]
        const entry = [...providerStore.entries()].find(([key]) => key.includes('containeranalysis.googleapis.com') && new URL(key).searchParams.get('filter')?.includes(`kind="${kind}"`))
        assert.ok(entry, `sealed occurrence kind ${kind}`); return JSON.parse(entry[1])
      }
      if (url.startsWith('https://cloudscheduler.googleapis.com/')) {
        if (url.endsWith(':resume')) { scheduler.state = 'ENABLED'; controls.resumes = (controls.resumes ?? 0) + 1; if (controls.resumeUnknown) throw Error('MODELED_UNKNOWN_RESUME') }
        else if (url.endsWith(':pause')) scheduler.state = 'PAUSED'
        else assert.equal(method, 'GET')
        return { ...structuredClone(scheduler), ...(controls.scheduler ?? {}) }
      }
      if (url.startsWith('https://secretmanager.googleapis.com/')) {
        if (url.endsWith(':access')) {
          const token = 'R'.repeat(43), name = url.slice('https://secretmanager.googleapis.com/v1/'.length, -7)
          const bytes = name.includes(workerProfile.tokenSecretId) ? Buffer.from(token) : Buffer.from(JSON.stringify({ schemaVersion: 'ai-pdm.workload-credentials.v1', workloads: [{ id: workerProfile.readerId, token, purposes: [workerProfile.readerPurpose], capabilities: [workerProfile.readerCapability] }] }))
          return { name, payload: { data: bytes.toString('base64') } }
        }
        if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/secretmanager.secretAccessor', members: [`serviceAccount:${workerProfile.readerServiceAccount}`] }] }
        if (url.includes('/versions/')) return { name: url.slice('https://secretmanager.googleapis.com/v1/'.length), state: 'ENABLED', etag: 'MODELED-B23-SECRET-ETAG' }
        return { name: `projects/${workerProfile.projectNumber}/secrets/${workerProfile.tokenSecretId}` }
      }
      if (url.includes('cloudresourcemanager.googleapis.com')) return structuredClone(projectPolicy)
      if (url.startsWith('https://iam.googleapis.com/')) {
        if (url.endsWith(':getIamPolicy')) return { bindings: [{ role: 'roles/iam.serviceAccountUser', members: ['serviceAccount:aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com'] }] }
        if (!url.includes('/roles/')) return { email: url.split('/').at(-1) }
        const role = url.split('/').at(-1), permissions = { aipdmOpenswxJobReadback: ['run.jobs.get', 'run.executions.get', 'run.executions.list'], aipdmOpenswxJobLifecycle: ['run.jobs.get', 'run.jobs.update', 'run.jobs.run', 'run.executions.get', 'run.executions.list', 'run.executions.cancel'], aipdmOpenswxVerifierJobReadback: ['run.jobs.get', 'run.executions.list'], aipdmOpenswxSchedulerReadback: ['cloudscheduler.jobs.get'], aipdmDev122PrebuildList: ['cloudbuild.builds.list', 'serviceusage.services.use'] }[role]
        assert.ok(permissions); return { name: url.slice('https://iam.googleapis.com/v1/'.length), stage: 'GA', includedPermissions: permissions }
      }
      if (url.endsWith(':getIamPolicy')) return { bindings: expectedReadbackJobBindings() }
      if (url.endsWith(':run')) {
        const name = `${workerJobName().replace(workerProfile.projectId, workerProfile.projectNumber)}/executions/modeled-${executions.length}`
        const start = Date.now(); executions.push({ name, createTime: new Date(start).toISOString(), completionTime: new Date(start + 1).toISOString(), succeededCount: controls.exit1 ? 0 : 1, failedCount: controls.exit1 ? 1 : 0, conditions: [{ type: 'Completed', state: controls.exit1 ? 'CONDITION_FAILED' : 'CONDITION_SUCCEEDED' }], template: structuredClone(job.template.template) }); clock.advance(2)
        controls.runs = (controls.runs ?? 0) + 1; if (controls.runUnknown) throw Error('MODELED_UNKNOWN_RUN')
        return { name: 'projects/9536592944/locations/asia-east1/operations/modeled-b23' }
      }
      if (url.includes('/executions?')) return { executions: structuredClone(executions), ...(controls.inventory ?? {}) }
      if (url.includes('/executions/')) { const value = executions.find(row => row.name === url.slice('https://run.googleapis.com/v2/'.length)); assert.ok(value); return structuredClone(value) }
      if (url.includes('logging.googleapis.com')) {
        if (controls.stdout === 'missing') return { entries: [] }
        const body = JSON.parse(options.body), value = executions.findLast(row => body.filter.includes(row.name.split('/').at(-1)))
        assert.ok(value)
        const state = value.template.containers[0].args.includes('--isolation-self-test-only') ? 'isolation_verified' : controls.stdout === 'conflicting' ? 'empty' : controls.stdout ?? 'empty'
        const marker = { resource: { type: 'cloud_run_job', labels: { project_id: workerProfile.projectId, location: workerProfile.location, job_name: workerProfile.jobId } }, labels: { 'run.googleapis.com/execution_name': value.name.split('/').at(-1) }, logName: `projects/${workerProfile.projectId}/logs/run.googleapis.com%2Fstdout`, insertId: 'MODELED-B23-STDOUT', timestamp: controls.stdoutExpired ? new Date(Date.parse(value.createTime) - 61000).toISOString() : value.completionTime, jsonPayload: { schemaVersion: 'aipdm.openswx-finite-terminal.v1', state, executionName: state === 'isolation_verified' ? null : value.name } }
        return { entries: [marker, ...(controls.stdout === 'conflicting' ? [{ ...marker, insertId: 'MODELED-B23-SECOND-STDOUT' }] : [])] }
      }
      if (url.split('?')[0] === `https://run.googleapis.com/v2/${workerJobName()}`) {
        if (method === 'PATCH') {
          assert.equal(controls.daily, true, 'only explicitly modeled ordinary DAILY permits Job PATCH')
          assert.equal(new URL(url).searchParams.has('updateMask'), false)
          const body = JSON.parse(options.body)
          assert.equal(body.etag, job.etag)
          assert.ok([workerTemplate(workerProfile, rootWorkerBuild.image, rootFull.tokenSecretVersion), workerTemplate(workerProfile, rootWorkerBuild.image, null, 'selftest')].some(template => canonicalize(template) === canonicalize(body.template)))
          job = { ...job, template: structuredClone(body.template), etag: `${job.etag}-daily`, generation: String(Number(job.generation) + 1), observedGeneration: String(Number(job.generation) + 1) }
          controls.dailyPatches = (controls.dailyPatches ?? 0) + 1
        } else assert.equal(method, 'GET', 'repair retains exact normal Job without PATCH')
        return { ...structuredClone(job), ...(controls.job ?? {}) }
      }
      throw Error(`ROOT_CLOSED_PROVIDER_SEAM:${method}:${url}`)
    }
    const transport = { ...wire.transport, now: clock.now, request, readBytes, readJson, putBytes, putJson,
      getService: async () => { sequence.push('APP_SERVICE'); return { ...structuredClone(service), ...(controls.service ?? {}) } },
      getRevision: async (_profile, name) => { assert.ok(revisions.has(name), `modeled revision ${name}`); return structuredClone(revisions.get(name)) },
      readOwnerRun: async (_profile, url) => ({ id: url.split('/').at(-1), status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: controls.failedRevision ?? b23Revision }),
      setTraffic: async ({ revision, candidateTag }) => { controls.traffic = (controls.traffic ?? 0) + 1; sequence.push('TRAFFIC'); activeRevision = revision; service = { ...service, etag: `${service.etag}-traffic`, traffic: [{ revision, percent: 100 }, ...(candidateTag ? [{ revision, tag: candidateTag }] : [])], trafficStatuses: [{ revision, percent: 100 }, ...(candidateTag ? [{ revision, tag: candidateTag, uri: controls.candidateFacts.tagUri }] : [])] }; return structuredClone(service) },
      removeCandidateTag: async ({ expectedActiveRevision }) => { assert.equal(activeRevision, expectedActiveRevision); service.traffic = service.traffic.filter(row => !row.tag); service.trafficStatuses = service.trafficStatuses.filter(row => !row.tag); sequence.push('TAG_REMOVED'); return structuredClone(service) },
    }
    const controlCore = { schemaVersion: 'jenfu.dev012.owner-control-head.v1', inputFingerprint: 'c'.repeat(64), ownerApplicationId: 'ai-pdm', service: 'ai-pdm-prod', controlBucket: workerProfile.releaseBucket ?? 'jenfu-platform-prod-aipdm-release', releaseId: capsule.releaseId, sourceRevision: capsule.sourceRevision, sourceLockSha256: capsule.sourceLockRef.sha256, candidateRevision: candidate.candidateRevision, previousRevision: capsule.previousRevision, ownerRunRef: `https://api.github.com/repos/${appProfile.application.repository}/actions/runs/123`, leaseExpiresAt: capsule.deadlineAt, deadlineAt: capsule.deadlineAt, state: 'FINALIZED', result: 'RELEASED' }
    seed('gs://jenfu-platform-prod-aipdm-release/control/active.json', { ...controlCore, controlSha256: sha256(canonicalize(controlCore)) })
    const lock = { ...rootObject(capsule.sourceLockRef), releaseId: 'DEV122-B23-MODELED-REPAIR', sourceRevision: b23Revision, remoteRevision: b23Revision, observedAt: clock.now(), sourceTree: currentTreeId, sourceSha256: sha256(currentTree), migrationManifestSha256: b23NativeArchive().bundle.manifestSha256 }
    const lockRef = seed('gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-B23-MODELED-REPAIR/source-lock.json', lock)
    const sourceRef = seedBytes('gs://jenfu-platform-prod-aipdm-release/source/releases/DEV122-B23-MODELED-REPAIR/frozen/source.tar.gz', gzipSync(b23NativeArchive().tar, { level: 9 }))
    const input = { schemaVersion: 'aipdm.openswx-worker-reuse-input.v2', sourceLockRef: lockRef, currentSourceObjectRef: sourceRef, priorActivationRef: rootActivationRef, deadlineAt: new Date(Date.now() + 600000).toISOString(), receiptId: 'B23-MODELED-REPAIR-PRODUCER', servingCapsuleRef: rootManifest.capsuleRef, predecessorBaselineRef: null }
    const inputRef = seed('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-modeled-reuse-input.json', input)
    const seal = core => ({ ...core, receiptSha256: sha256(canonicalize(core)) })
    async function ownerInput(association, { authorityBaselineRef = null } = {}) {
      const descriptorUri = association.ref.uri.replace(/-association\.json$/u, '-descriptor-full-repair.json')
      const descriptorRow = await readBytes(descriptorUri), descriptor = JSON.parse(descriptorRow.bytes)
      assert.equal(descriptor.schemaVersion, 'aipdm.openswx-worker-descriptor.v3'); assert.equal(descriptor.purpose, 'full')
      const activeLock = (await readJson(association.value.sourceLockRef)).value
      const activeRequest = (await readJson(association.value.requestRef)).value, activeInput = (await readJson(activeRequest.inputRef)).value
      const pausedBaseline = (await readJson(descriptor.pausedBaselineRef)).value
      const intentBase = { ...capsule, releaseId: activeLock.releaseId, sourceRevision: b23Revision, sourceSha256: activeLock.sourceSha256, sourceLockRef: association.value.sourceLockRef,
        migrationManifestSha256: activeLock.migrationManifestSha256, previousRevision: pausedBaseline.servingApp.revision, deadlineAt: activeInput.deadlineAt, baselineIntentRef: authorityBaselineRef ?? activeInput.servingCapsuleRef, openswxWorkerRef: descriptorRow.ref }
      const prerequisiteUri = name => `gs://jenfu-platform-prod-aipdm-release/receipts/releases/${activeLock.releaseId}/${name}.json`
      for (const [field, name] of [['authorizationPolicyRef', 'authorization'], ['readinessReceiptRef', 'readiness']]) {
        const value = { ...rootObject(capsule[field]), sourceRevision: b23Revision, releaseId: activeLock.releaseId, previousRevision: intentBase.previousRevision, baselineIntentRef: intentBase.baselineIntentRef, observedAt: clock.now(), expiresAt: intentBase.deadlineAt }
        intentBase[field] = seed(prerequisiteUri(name), value)
      }
      const oldInfra = rootObject(capsule.infraReceiptRef), { receiptSha256: _oldSeal, ...infra } = oldInfra
      intentBase.infraReceiptRef = seed(prerequisiteUri('infra'), seal({ ...infra, sourceRevision: b23Revision, releaseId: activeLock.releaseId, reusedSourceRevision: capsule.sourceRevision, reusedInfraReceiptRef: capsule.infraReceiptRef, observedAt: clock.now() }))
      const config = buildRuntimeConfig(appProfile, { plainEnvironment: runtime.plainEnvironment, secretVersions: runtime.secretVersions,
        openswxWorker: { descriptorRef: descriptorRow.ref, purpose: 'full', sourceRevision: b23Revision, workerProfileSha256: descriptor.workerProfileSha256 } })
      intentBase.runtimeConfigRef = seed(prerequisiteUri('runtime'), { ...rootObject(capsule.runtimeConfigRef), sourceRevision: b23Revision, releaseId: activeLock.releaseId, observedAt: clock.now(), runtimeConfig: config })
      if (authorityBaselineRef) {
        const authority = await executePrerequisiteProducer({ stage: 'routine-authority', releaseId: activeLock.releaseId, profile: appProfile, transport,
          input: { schemaVersion: 'jenfu.dev012.routine-owner-authority-input.v1', sourceLockRef: association.value.sourceLockRef, runtimeConfigRef: intentBase.runtimeConfigRef,
            baselineIntentRef: authorityBaselineRef, expiresAt: intentBase.deadlineAt, dataCutoverCompletionRef: rootObject(capsule.readinessReceiptRef).dataCutoverCompletionRef },
          validateIntent: assertDev117ReleaseIntent, observedAt: clock.now() })
        Object.assign(intentBase, authority.refs)
        assert.equal(authority.previousRevision, intentBase.previousRevision)
      }
      const intentRef = seed(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${activeLock.releaseId}/release-intent.json`, intentBase)
      const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: appProfile.application.repository, GITHUB_REPOSITORY_ID: '1234', GITHUB_REPOSITORY_OWNER_ID: '5678', GITHUB_SHA: b23Revision, GITHUB_WORKFLOW_SHA: b23Revision, GITHUB_WORKFLOW_REF: `${appProfile.application.repository}/${appProfile.workflow.path}@refs/heads/main`, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://modeled.example/token', GOOGLE_OAUTH_ACCESS_TOKEN: 'MODELED-ROOT-LOCAL-TOKEN', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', OWNER_EXECUTION_MODE: 'full_release' }
      const migration = b23NativeArchive().bundle, bytes = Buffer.from(`${canonicalize(migration)}\n`)
      const dataCutoverPath = 'config/release/dev012-ai-pdm-production-data-cutover.json'
      const owner = { capsuleRef: intentRef.uri, capsuleSha256: intentRef.sha256, profile: appProfile, transport, environment,
        validateIntent: assertDev117ReleaseIntent, createSourceIdentity: async revision => { assert.equal(revision, b23Revision); return Buffer.from(currentTree) },
        createSourceArchive: async revision => { assert.equal(revision, b23Revision); return Buffer.from(b23NativeArchive().tar) },
        buildMigrationBundle: async revision => { assert.equal(revision, b23Revision); return { bundle: migration, bytes, bundleSha256: sha256(bytes) } },
        readWorkerSource: source, dataCutoverConfig: JSON.parse(source(dataCutoverPath, b23Revision)) }
      const buildHash = sha256(activeLock.releaseId)
      const modelImage = `${appProfile.artifact.uri}@sha256:${'e'.repeat(64)}`, modelBuildId = `${buildHash.slice(0, 8)}-${buildHash.slice(8, 12)}-${buildHash.slice(12, 16)}-${buildHash.slice(16, 20)}-${buildHash.slice(20, 32)}`
      transport.createBuild = async ({ profile, intent, sourceObject, openswxWorker }) => {
        assert.equal(openswxWorker, undefined, 'reused worker produces zero paid builds'); controls.appBuilds = (controls.appBuilds ?? 0) + 1; sequence.push('APP_BUILD')
        const build = { name: `projects/jenfu-platform-prod/locations/asia-east1/builds/${modelBuildId}`, id: modelBuildId, projectId: 'jenfu-platform-prod', status: 'SUCCESS', createTime: clock.now(), startTime: clock.now(), finishTime: clock.now(), serviceAccount: `projects/jenfu-platform-prod/serviceAccounts/${profile.identities.builder}`, sourceProvenance: { resolvedStorageSource: { bucket: 'jenfu-platform-prod-aipdm-release', object: sourceObject.ref.uri.split('/').slice(3).join('/'), generation: sourceObject.metadata.generation } }, results: { images: [{ name: `${appProfile.artifact.uri}:release-${b23Revision}`, digest: 'sha256:' + 'e'.repeat(64) }] }, options: { requestedVerifyOption: 'VERIFIED' } }
        providerStore.set(normalizeProvider(`https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds/${modelBuildId}`), Buffer.from(JSON.stringify(build)))
        return { artifactDigest: modelImage, build }
      }
      transport.readArtifactImage = async () => {
        const image = { name: `projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release/dockerImages/ai-pdm@sha256:${'e'.repeat(64)}`, uri: modelImage }
        providerStore.set(normalizeProvider(`https://artifactregistry.googleapis.com/v1/${image.name}`), Buffer.from(JSON.stringify(image))); return image
      }
      transport.waitArtifactEvidence = async () => ({ resourceUrl: `https://${modelImage}`, buildOccurrenceNames: ['MODELED-B23-BUILD'], discoveryOccurrenceNames: ['MODELED-B23-DISCOVERY'], sbomOccurrenceNames: ['MODELED-B23-SBOM'], vulnerabilityCount: 0, blockingVulnerabilityCount: 0, sbomExport: { resourceUrl: `https://${modelImage}` }, observedAt: clock.now(), status: 'PASS' })
      transport.runMigrationJob = async ({ deployment, outputUri }) => {
        controls.migrationJobs = (controls.migrationJobs ?? 0) + 1
        assert.equal(migration.entries.length, 33, 'the equivalent historical mode must never submit a Job')
        assert.deepEqual(deployment.migrationBundleRef, (await readBytes(deployment.migrationBundleRef.uri)).ref)
        const historicalMigration = rootObject(rootRefs.migrate)
        const { receiptSha256: _oldHash, ...core } = historicalMigration
        const receipt = seal({ ...core, sourceRevision: b23Revision, manifestSha256: migration.manifestSha256,
          ledgerCount: 33, applied: 1, replayed: 32, executionName: 'ai-pdm-prod-migration-runner-modeled-083', startedAt: clock.now(), completedAt: clock.now() })
        await putJson(outputUri, receipt, { bucket: 'jenfu-platform-prod-aipdm-release', prefix: 'receipts' })
      }
      transport.createCandidate = async ({ artifactDigest, runtimeConfig, fingerprint }) => {
        assert.equal(artifactDigest, modelImage); controls.candidates = (controls.candidates ?? 0) + 1
        const tag = `candidate-${fingerprint.slice(0, 12)}`, name = `ai-pdm-prod-${fingerprint.slice(0, 12)}`, tagUri = `https://${tag}---ai-pdm-prod-9536592944.asia-east1.run.app`
        const facts = { candidateRevision: name, tag, tagUri, artifactDigest, previousRevision: activeRevision, beforeTraffic: structuredClone(service.traffic), etag: 'MODELED-B23-CANDIDATE', revisionName: `${serviceName}/revisions/${name}`, cloudSqlProxyResolvedImage: appProfile.runtime.cloudSqlProxyImage }
        const revision = revisionFor(name, runtimeConfig, facts)
        revisions.set(name, revision); controls.candidateFacts = facts
        const { name: _revisionName, service: _revisionService, conditions: _revisionConditions, ...template } = revision
        service = { ...service, template, etag: facts.etag, traffic: [...service.traffic, { revision: name, tag }], trafficStatuses: [...service.trafficStatuses, { revision: name, tag, uri: tagUri }] }
        assert.equal(service.traffic.filter(row => row.percent === 100)[0].revision, intentBase.previousRevision, 'candidate has zero general traffic')
        sequence.push('APP_CANDIDATE'); return facts
      }
      transport.configureEntrypoint = async () => {
        const before = transport.entrypointSnapshot(service), templateSha = sha256(canonicalize(service.template)), trafficSha = sha256(canonicalize(service.traffic))
        return { before, after: before, changed: false, updateMask: 'ingress,defaultUriDisabled,invokerIamDisabled', templateSha256Before: templateSha, templateSha256After: templateSha, trafficSha256Before: trafficSha, trafficSha256After: trafficSha, providerOperationRef: null }
      }
      const smokeObservations = [
        ...['auth-mode', 'platform-session', 'target-session', 'authenticated-probe'].map(id => ({ id, status: 200 })),
        ...['sso-start', 'sso-authorize', 'sso-callback'].map(id => ({ id, status: 303 })),
        ...['unauthenticated-probe', 'session-revoked'].map(id => ({ id, status: 401 })),
      ]
      transport.runInternalCandidateSmoke = async ({ origin, artifactDigest, candidateRevision }) => ({ schemaVersion: 'jenfu.dev121.principal-candidate-smoke.v1', ownerApplicationId: 'ai-pdm', artifactDigest, candidateRevision, status: 'PASS', origin, observedAt: clock.now(), observations: smokeObservations })
      transport.runAuthenticatedSmoke = async ({ origin }) => ({ status: 'PASS', origin, observedAt: clock.now(), observations: smokeObservations })
      transport.restoreEntrypoint = async ({ baseline }) => { sequence.push('ENTRY_RESTORED'); return { changed: false, before: transport.entrypointSnapshot(service), after: baseline, result: 'BASELINE_ALREADY_ACTIVE', providerOperationRef: null } }
      transport.publishIncident = async () => { sequence.push('INCIDENT'); return { messageIds: ['MODELED-B23-INCIDENT'] } }
      return { owner, intent: intentBase, intentRef, descriptor, descriptorRef: descriptorRow.ref, config, paths: releasePaths(appProfile, intentBase, intentRef.sha256), run: async stage => {
        const result = await executeOwnerStage({ ...owner, stage })
        return { ...result, value: JSON.parse(result.bytes) }
      }, worker: createOpenSwxOwnerRelease({ transport, readSource: source, environment }) }
    }
    async function nextRepair(serving, index, { predecessorBaselineRef = serving.descriptor.pausedBaselineRef, baselineIntentRef = serving.intentRef, authorityBaselineRef = null, priorActivationRef = input.priorActivationRef } = {}) {
      const releaseId = `DEV122-B23-MODELED-REPAIR-${index}`
      const nextLock = { ...lock, releaseId, observedAt: clock.now() }, nextLockRef = seed(`gs://jenfu-platform-prod-aipdm-release/receipts/releases/${releaseId}/source-lock.json`, nextLock)
      const archiveRef = seedBytes(`gs://jenfu-platform-prod-aipdm-release/source/releases/${releaseId}/frozen/source.tar.gz`, gzipSync(b23NativeArchive().tar, { level: 9 }))
      const value = { ...input, sourceLockRef: nextLockRef, currentSourceObjectRef: archiveRef, servingCapsuleRef: baselineIntentRef, predecessorBaselineRef, priorActivationRef, receiptId: `B23-MODELED-FORWARD-${index}`, deadlineAt: new Date(Date.now() + 600000).toISOString() }
      const nextInputRef = seed(`gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-forward-${index}-input.json`, value)
      const saved = await executeWorkerArtifactReuse({ transport, inputRef: nextInputRef, readSource: source })
      return ownerInput(saved, { authorityBaselineRef })
    }
    return { source, store, providerStore, transport, wire, appProfile, workerProfile, controls, calls, publications, sequence, seed, seedBytes, input, inputRef, lock, lockRef, runtime, revisions, revisionFor, ownerInput, nextRepair, job: () => job, scheduler: () => scheduler,
      produce: () => executeWorkerArtifactReuse({ transport, inputRef, readSource: source }) }
  }
  function rootWire({ corruptSource = false, afterSource = null, objectStore = objects, providerStore = providers } = {}) {
    const counts = { sourceArrayBuffer: 0, sourceMetadata: 0, sourceMedia: 0, provider: 0, mutations: 0, gcsUris: [] }
    const fetchImpl = async (url, options = {}) => {
      assert.equal(options.method ?? 'GET', 'GET', 'authentic replay is readonly')
      if (!url.startsWith('https://storage.googleapis.com/')) {
        const body = providerStore.get(normalizeProvider(url)); assert.ok(body, `closed provider URL ${url}`); counts.provider++; return new Response(body)
      }
      const match = /\/b\/([^/]+)\/o\/([^?]+)/u.exec(url)
      const uri = match && `gs://${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`, row = objectStore.get(uri)
      assert.ok(row, `complete authentic object closure ${uri}`)
      counts.gcsUris.push(uri)
      const isSource = uri.endsWith('/source.tar.gz')
      if (!url.includes('alt=media')) {
        if (isSource) counts.sourceMetadata++
        // Actual acquired metadata fields are re-encoded; no original metadata-wire claim.
        return new Response(JSON.stringify({ bucket: 'jenfu-platform-prod-aipdm-release', name: uri.split('/').slice(3).join('/'), generation: row.generation, crc32c: row.crc32c, size: String(row.bytes.length) }))
      }
      assert.equal(new URL(url).searchParams.get('generation'), row.generation)
      const bytes = Buffer.from(row.bytes)
      if (isSource && corruptSource) bytes[bytes.length - 1] ^= 1
      const response = new Response(bytes)
      if (isSource) {
        counts.sourceMedia++; response.arrayBuffer = async () => { counts.sourceArrayBuffer++; throw Error('ROOT_RAW_SOURCE_ARRAYBUFFER_FORBIDDEN') }
        afterSource?.()
      }
      return response
    }
    return { counts, transport: createOwnerTransport({ token: 'authentic-root-replay-token', fetchImpl }), fetchImpl }
  }
  test('B23_ROOT_AUTHENTIC_B14_FIXED_RUNTIME_RELEASED', async () => {
    const wire = rootWire(), observed = await wire.transport.readOwnerSourceProof({ profile: rootProfile, sourceRevision: capsule.sourceRevision, refs: rootRefs, verifyProvider: false })
    assert.equal(observed.proof.disposition, 'released'); assert.equal(observed.proof.candidateRevision, 'ai-pdm-prod-44984e6018dc')
    assert.equal(wire.counts.sourceArrayBuffer, 0); assert.equal(wire.counts.sourceMedia, 1); assert.equal(wire.counts.mutations, 0)
  })
  test('B30_ROOT_AUTHENTIC_B14_COLD_WARM_PROOF_PRESERVES_SEALED_MIGRATION_SHAPE', async () => {
    const wire = rootWire()
    await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      const read = () => wire.transport.readOwnerSourceProof({ profile: rootProfile, sourceRevision: capsule.sourceRevision, refs: rootRefs, verifyProvider: true })
      const cold = await read(), warm = await read()
      assert.deepEqual(warm.proof, cold.proof)
      assert.equal(warm.proof.migrate.generation, null); assert.equal(warm.proof.migrate.crc32c, null)
      for (const row of [warm.proof.prepare, warm.proof.sourceLock, warm.proof.terminal, ...Object.values(warm.proof.releaseChain)]) {
        assert.match(row.generation, /^[1-9][0-9]*$/u); assert.match(row.crc32c, /^[A-Za-z0-9+/]{6}==$/u)
      }
    })
    assert.equal(wire.counts.sourceMedia, 1); assert.equal(wire.counts.sourceArrayBuffer, 0); assert.equal(wire.counts.mutations, 0)
  })
  test('B23_ROOT_AUTHENTIC_B14_FULL_PROFILE_SQL', async () => {
    const wire = rootWire()
    await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      const observed = await wire.transport.readOwnerSourceProof({ profile: rootProfile, sourceRevision: capsule.sourceRevision, refs: rootRefs, verifyProvider: false })
      const graph = await readAiPdmObservationInputs(observed.proof)
      assertAiPdmHistoricalMigration(graph.original)
      assert.equal(graph.content.files.size, 33); assert.equal(graph.bundle.bundle.entries.length, 32)
      for (const entry of graph.bundle.bundle.entries) assert.equal(sha256(graph.content.files.get(entry.path)), entry.sourceSha256)
      assert.equal(graph.content.migrations.entries.at(-1).path, 'db/postgres/082_dev122_openswx_auxiliary_jobs.sql')
      assert.equal(Date.parse(graph.intent.deadlineAt) < Date.now(), true, 'expired completed history is readonly evidence')
    })
    assert.equal(wire.counts.sourceArrayBuffer, 0); assert.equal(wire.counts.sourceMedia, 1)
  })
  test('B23_ROOT_AUTHENTIC_B14_VERIFY_PROVIDER', async () => {
    const wire = rootWire(), observed = await wire.transport.readOwnerSourceProof({ profile: rootProfile, sourceRevision: capsule.sourceRevision, refs: rootRefs, verifyProvider: true })
    assert.equal(observed.provider.status, 'BUILD_IMAGE_VERIFIED'); assert.equal(wire.counts.provider, 2)
    assert.equal(wire.counts.sourceMedia, 1); assert.equal(wire.counts.sourceArrayBuffer, 0)
  })
  test('B23_ROOT_AUTHENTIC_B14_PRE_MIGRATION', async () => {
    const wire = rootWire()
    await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      const observed = await wire.transport.readOwnerSourceProof({ profile: rootProfile, sourceRevision: capsule.sourceRevision, refs: { prepare: rootRefs.prepare, migrate: null, terminal: null }, verifyProvider: true })
      assert.equal(observed.proof.disposition, 'build_only'); assert.equal(observed.proof.releaseAuthority, false); assert.equal(observed.proof.migrationVerified, false)
      assert.equal(Object.hasOwn(observed.proof, 'migrate'), false); assert.equal(Object.hasOwn(observed.proof, 'terminal'), false)
      const graph = await readAiPdmObservationInputs(observed.proof)
      assert.equal(graph.migrate, null); assert.equal(graph.terminal, null); assert.equal(graph.original, null); assert.equal(graph.content.files.size, 33)
      assert.throws(() => assertAiPdmHistoricalMigration(graph.original), /REPAIR_ORIGINAL_HISTORY_INVALID/u)
    })
    assert.equal(wire.counts.sourceArrayBuffer, 0); assert.equal(wire.counts.sourceMedia, 1)
  })
  test('B23_ROOT_AUTHENTIC_B14_HASH_NEGATIVE', async () => {
    const wire = rootWire({ corruptSource: true })
    await assert.rejects(wire.transport.readOwnerSourceProof({ profile: rootProfile, sourceRevision: capsule.sourceRevision, refs: rootRefs, verifyProvider: true }), /ARCHIVE_SOURCE_MISMATCH/u)
    assert.equal(wire.counts.provider, 0); assert.equal(wire.counts.sourceArrayBuffer, 0)
  })
  test('B23_ROOT_AUTHENTIC_B14_CURRENT_EXPIRY', async () => {
    const originalNow = Date.now, started = originalNow(); let clock = started
    Date.now = () => clock
    try {
      const wire = rootWire({ afterSource: () => { clock = started + 1000 } })
      const bounded = boundOpenSwxTransport(wire.transport, new Date(started + 1000).toISOString())
      await assert.rejects(bounded.readOwnerSourceProof({ profile: rootProfile, sourceRevision: capsule.sourceRevision, refs: rootRefs, verifyProvider: false }), /OPENSWX_OWNER_DEADLINE/u)
      assert.equal(wire.counts.mutations, 0); assert.equal(wire.counts.sourceArrayBuffer, 0)
    } finally { Date.now = originalNow }
  })
  test('B23_ROOT_PRODUCER_AUTHENTIC_READY_TO_PAUSED_REPAIR', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), before = structuredClone(h.job()), association = await h.produce()
    assert.equal(association.value.schemaVersion, 'aipdm.openswx-worker-build-association.v2')
    assert.equal(association.value.resourceBasis, 'PAUSED_APP_REPAIR')
    const o = await h.ownerInput(association)
    await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      const artifact = await resolveWorkerArtifact({ transport: h.transport, descriptor: o.descriptor, profile: h.workerProfile, readSource: h.source })
      assert.equal(artifact.image, rootWorkerBuild.image); assert.equal(artifact.pausedBaseline.pauseFenceSeconds, 55)
      assert.equal(artifact.pausedBaseline.servingApp.workerStatus, 'READY', 'actual R17 READY identity is distinct from pending finalize')
      assert.deepEqual(artifact.pausedBaseline.after.numericCredentials, { token: rootFull.tokenSecretVersion, registry: rootFull.registrySecretVersion })
    })
    const native = createWorkerGitReader(fileURLToPath(new URL('..', import.meta.url)), b23Revision), nativeReads = []
    assert.throws(() => native(PREBUILD_IAM_SOURCE_PATH, rootFull.sourceRevision), { code: 'OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID' }, 'fresh native reader must deny the historical prebuild path until the real descriptor chain admits it')
    const observedNative = (name, revision) => {
      const bytes = native(name, revision); nativeReads.push({ path: name, revision, sha256: sha256(bytes) }); return bytes
    }
    Object.assign(observedNative, native) // Forward the native admission/tree/archive/frozen methods unchanged.
    const nativeBefore = { publications: h.publications.length, builds: h.controls.appBuilds ?? 0, runs: h.controls.runs ?? 0,
      traffic: h.controls.traffic ?? 0, resumes: h.controls.resumes ?? 0, providerMutations: h.wire.counts.mutations,
      job: structuredClone(h.job()), scheduler: structuredClone(h.scheduler()) }
    const evidence = await readWorkerFullEvidence(h.transport, o.descriptor, h.workerProfile, observedNative)
    const prebuildRef = rootObject(rootFull.bootstrapRef).facts.resourceProvenance.prebuildIamContinuationRef
    assert.deepEqual(evidence.supplementalIam.prebuildIamContinuationRef, prebuildRef)
    assert.equal(evidence.supplementalIam.verificationSourceRevision, b23Revision)
    const continuation = rootObject(prebuildRef), approved = rootObject(continuation.approvedPlanRef)
    const prebuildHash = approved.plan.sourceHashes.find(row => row.path === PREBUILD_IAM_SOURCE_PATH).sha256
    assert.equal(rootFull.sourceRevision, '54d3c4c3fab41abf2045b025c90ca03d575e81f6')
    assert.equal(prebuildHash, '6d6dfba02c2d227b42b47ee0a79195f8e99ff2dc856634002b91d14c17c61f9f')
    assert.ok(nativeReads.some(row => row.path === PREBUILD_IAM_SOURCE_PATH && row.revision === rootFull.sourceRevision && row.sha256 === prebuildHash),
      'actual retained full consumer must read the admitted historical prebuild Git blob')
    assert.ok(nativeReads.some(row => row.path === PREBUILD_IAM_SOURCE_PATH && row.revision === b23Revision && row.sha256 === prebuildHash),
      'actual repair full consumer must also verify the current prebuild source')
    const nativePlan = prebuildIamContinuationPlan(observedNative, rootFull.sourceRevision)
    assert.equal(nativePlan.sourceHashes.length, 5); assert.deepEqual(nativePlan, approved.plan)
    assert.equal(sha256(canonicalize(nativePlan)), continuation.planSha256)
    assert.equal(sha256(historical.get(rootFull.sourceRevision).blobs.get(PREBUILD_IAM_SOURCE_PATH)), prebuildHash)
    assert.deepEqual({ publications: h.publications.length, builds: h.controls.appBuilds ?? 0, runs: h.controls.runs ?? 0,
      traffic: h.controls.traffic ?? 0, resumes: h.controls.resumes ?? 0, providerMutations: h.wire.counts.mutations,
      job: structuredClone(h.job()), scheduler: structuredClone(h.scheduler()) }, nativeBefore)
    assert.deepEqual(h.job(), before); assert.equal(h.scheduler().state, 'PAUSED')
    assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
    assert.equal(h.wire.counts.sourceArrayBuffer, 0)
    assert.ok(h.publications.findIndex(uri => uri.endsWith('-association.json')) < h.publications.findIndex(uri => uri.endsWith('-descriptor-full-repair.json')))
    assert.ok(h.source.calls.some(row => row.revision === capsule.sourceRevision && row.admitted && row.path === b23ProfilePath))
  }))
  test('B23_ROOT_PRODUCER_REPLAY_FRESH_CHECK_AND_NO_DUPLICATE_ASSOCIATION', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), first = await h.produce(), count = h.publications.filter(uri => uri.endsWith('-association.json')).length
    const replay = await h.produce()
    assert.deepEqual(replay.ref, first.ref); assert.equal(h.publications.filter(uri => uri.endsWith('-association.json')).length, count)
    const checks = h.publications.filter(uri => uri.includes('-current-check-')).map(uri => JSON.parse(h.store.get(uri).bytes))
    assert.ok(checks.length > 0); assert.equal(checks.at(-1).phase, 'PRODUCER_REPLAY'); assert.equal(checks.at(-1).dbAdmissionProof, 'NOT_YET_PROVEN')
    assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.resumes ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
  }))
  test('B23_ROOT_REPAIR_PRODUCER_FAILURE_PUBLICATION_AND_DRIFT', async () => {
    const vectors = ['source_failure', 'security_failure', 'fence_failure', 'unknown_create_applied', 'unknown_create_missing', 'unknown_create_conflict', 'replay_no_duplicate', 'cold_control_hash_generation_drift_after55s', 'replay_control_drift_after55s', 'cold_control_hash_drift_after55s', 'replay_control_hash_drift_after55s', 'cold_service_preimage_drift', 'replay_service_preimage_drift']
    for (const vector of vectors) await rootModelClock(async clock => {
      const h = rootConsumerModel(clock), replay = vector.startsWith('replay_'), first = replay ? await h.produce() : null
      const baselinePublications = h.publications.length, baselineAssociations = h.publications.filter(uri => uri.endsWith('-association.json')).length
      let submissions = 0, source = h.source
      if (vector === 'source_failure') {
        source = (path, revision) => path === 'scripts/run-openswx-metadata-job.mjs' && revision === b23Revision ? Buffer.concat([h.source(path, revision), Buffer.from('\n// drift\n')]) : h.source(path, revision)
        Object.assign(source, h.source)
      }
      if (vector === 'security_failure') {
        const key = [...h.providerStore.keys()].find(url => url.includes('kind="VULNERABILITY"'))
        assert.ok(key); h.providerStore.set(key, Buffer.from(JSON.stringify({ occurrences: [{ name: 'projects/jenfu-platform-prod/occurrences/modeled-critical', kind: 'VULNERABILITY', resourceUri: `https://${rootWorkerBuild.image}`, vulnerability: { severity: 'CRITICAL', effectiveSeverity: 'CRITICAL' } }] })))
      }
      if (vector === 'fence_failure') h.controls.scheduler = { state: 'ENABLED' }
      if (vector.includes('control_')) clock.afterPauseFence = () => {
        const uri = 'gs://jenfu-platform-prod-aipdm-release/control/active.json', value = JSON.parse(h.store.get(uri).bytes)
        if (vector.includes('control_hash_drift')) {
          const { controlSha256: _hash, ...core } = value
          const changed = { ...core, inputFingerprint: 'd'.repeat(64) }
          const originalGeneration = h.store.get(uri).generation
          h.seed(uri, { ...changed, controlSha256: sha256(canonicalize(changed)) })
          h.store.get(uri).generation = originalGeneration // Isolate hash drift from generation drift.
        } else h.seed(uri, value) // Same bytes with a new model generation is independently forbidden.
      }
      if (vector.includes('service_preimage')) clock.afterPauseFence = () => { h.controls.service = { etag: 'MODELED-RACING-APP-ETAG' } }
      if (vector.startsWith('unknown_create_')) {
        const put = h.transport.putJson
        h.transport.putJson = async (uri, value, options) => {
          if (!uri.endsWith('-association.json')) return put(uri, value, options)
          submissions++
          if (vector === 'unknown_create_applied') await put(uri, value, options)
          if (vector === 'unknown_create_conflict') h.seed(uri, { ...value, actor: 'wrong@jenfu.com.tw' })
          throw Object.assign(Error('OUTCOME_UNKNOWN'), { code: 'OUTCOME_UNKNOWN' })
        }
      }
      const operation = executeWorkerArtifactReuse({ transport: h.transport, inputRef: h.inputRef, readSource: source })
      if (['unknown_create_applied', 'replay_no_duplicate'].includes(vector)) {
        const result = await operation
        if (first) assert.deepEqual(result.ref, first.ref)
        else assert.equal(result.value.resourceBasis, 'PAUSED_APP_REPAIR')
        assert.equal(submissions, first ? 0 : 1)
      } else {
        if (vector === 'unknown_create_conflict') await assert.rejects(operation, { code: 'GCS_READBACK_HASH_MISMATCH' }, vector)
        else await assert.rejects(operation, /OPENSWX_REUSE_|OPENSWX_REPAIR_|OPENSWX_SCHEDULER_|OPENSWX_ARTIFACT_/u, vector)
        if (!vector.startsWith('unknown_create_')) {
          assert.equal(h.publications.length, baselinePublications, `${vector}: no rejected observation publication`)
          assert.equal(h.publications.filter(uri => uri.endsWith('-association.json')).length, baselineAssociations)
        } else assert.equal(submissions, 1, 'unknown outcome never triggers a duplicate create')
      }
      if (first) assert.equal(h.publications.filter(uri => uri.endsWith('-association.json')).length, baselineAssociations)
      assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0); assert.equal(h.controls.resumes ?? 0, 0)
      assert.equal(h.wire.counts.sourceArrayBuffer, 0)
    })
  })
  test('B23_ROOT_STAGE_PREPAID_CONTENT_AND_ZERO_MIGRATION_JOB', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    const prepared = await o.run('prepare')
    assert.equal(prepared.value.facts.dataCutover.status, 'NEUTRAL_AUTHORITY_LIVE')
    assert.ok(prepared.value.facts.migrationReusePrerequisiteRef)
    assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.migrationJobs ?? 0, 0)
    await o.run('build')
    const migration = await o.run('migrate'), publications = h.publications.length
    const replay = await o.run('migrate')
    assert.equal(h.controls.appBuilds, 1); assert.equal(h.controls.migrationJobs ?? 0, 0)
    assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
    assert.equal(migration.value.schemaVersion, 'aipdm.paused-app-repair-migration-association.v1')
    assert.equal(migration.value.databaseDisposition, 'HISTORICAL_EVIDENCE_REUSED')
    assert.equal(migration.value.databaseLiveState, 'UNKNOWN'); assert.equal(migration.value.migrationJobSubmissions, 0)
    assert.deepEqual(replay.ref, migration.ref); assert.equal(h.publications.length, publications)
    assert.equal(h.wire.counts.sourceArrayBuffer, 0)
  }))
  test('B25_ROOT_REPAIR_FRESHNESS_EXCLUDES_IMMUTABLE_EVIDENCE_LOADING', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    const readJson = h.transport.readJson
    let associationReads = 0, delayed = false
    h.transport.readJson = async (ref, ...args) => {
      const row = await readJson(ref, ...args)
      if (ref?.uri === o.descriptor.workerBuildRef.uri && ++associationReads === 2) {
        clock.advance(61_000)
        delayed = true
      }
      return row
    }
    const prepared = await o.run('prepare')
    assert.equal(delayed, true, 'modeled immutable evidence load exceeds the live freshness window')
    assert.equal(prepared.value.stage, 'prepare')
    assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.migrationJobs ?? 0, 0)

    const stale = rootConsumerModel(clock), staleOwner = await stale.ownerInput(await stale.produce())
    const request = stale.transport.request
    let delayedLiveRead = false
    stale.transport.request = async (url, options) => {
      const row = await request(url, options)
      if (!delayedLiveRead && url.startsWith('https://cloudscheduler.googleapis.com/')) {
        clock.advance(61_000)
        delayedLiveRead = true
      }
      return row
    }
    await assert.rejects(staleOwner.run('prepare'), /OPENSWX_REPAIR_CURRENT_APP_INVALID|OPENSWX_REPAIR_RESOURCE_DRIFT/u)
    assert.equal(delayedLiveRead, true, 'live provider reads remain inside the freshness fence')
    assert.equal(stale.controls.appBuilds ?? 0, 0); assert.equal(stale.controls.migrationJobs ?? 0, 0)
  }))
  test('B27_ROOT_PREBUILD_DENIED_HAS_ZERO_BUILD_MIGRATION_AND_WORKER_MUTATIONS', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    await o.run('prepare')
    const request = h.transport.request
    let denied = 0
    h.transport.request = async (url, options) => {
      if (url.startsWith('https://cloudscheduler.googleapis.com/')) {
        denied++
        throw Object.assign(new Error('DENIED'), { code: 'DENIED' })
      }
      return request(url, options)
    }
    await assert.rejects(o.run('build'), { code: 'DENIED' })
    assert.equal(denied, 1)
    assert.equal(h.controls.appBuilds ?? 0, 0)
    assert.equal(h.controls.migrationJobs ?? 0, 0)
    assert.equal(h.controls.runs ?? 0, 0)
    assert.equal(h.controls.resumes ?? 0, 0)
    assert.equal(h.controls.traffic ?? 0, 0)
  }))
  test('B23_ROOT_STAGE_CACHE_FULL_PRE_MIGRATION_OBSERVATION', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    await o.run('prepare'); const built = await o.run('build'), media = h.wire.counts.sourceMedia
    const reused = await o.run('build')
    assert.deepEqual(reused.ref, built.ref); assert.equal(h.controls.appBuilds, 1)
    assert.ok(h.wire.counts.sourceMedia > media, 'cache revalidates actual current and historical archives')
    assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.wire.counts.sourceArrayBuffer, 0)
    await assert.rejects(h.transport.readBytes(o.paths.migrate), /MISSING/u)
    const publications = h.publications.length
    h.controls.job = { etag: 'MODELED-CACHE-JOB-DRIFT' }
    for (const stage of ['prepare', 'build']) await assert.rejects(o.run(stage), /OPENSWX_REPAIR_RESOURCE_DRIFT/u)
    assert.equal(h.publications.length, publications); assert.equal(h.controls.appBuilds, 1); assert.equal(h.controls.migrationJobs ?? 0, 0)
  }))
  test('B23_ROOT_STAGE_ACTIVATE_FENCE_FAILURE_ZERO_TRAFFIC', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision']) await o.run(stage)
    const before = await h.transport.getService(h.appProfile)
    h.controls.scheduler = { state: 'ENABLED' }
    await assert.rejects(o.run('activate'), /OPENSWX_SCHEDULER_NOT_PAUSED/u)
    assert.equal(h.controls.traffic ?? 0, 0); assert.deepEqual(await h.transport.getService(h.appProfile), before)
    assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.migrationJobs ?? 0, 0)
  }))
  async function rootReleaseAttempt(h, o) {
    for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical']) {
      await o.run(stage)
      if (['candidate', 'decision', 'activate', 'canonical'].includes(stage)) {
        const state = JSON.parse((await h.transport.readBytes(o.paths.control)).bytes).state
        assert.equal(state, { candidate: 'CANDIDATE_CREATED', decision: 'GO', activate: 'ACTIVE', canonical: 'CANONICAL_VERIFIED' }[stage])
        const historical = await readWorkerFullEvidence(h.transport, o.descriptor, h.workerProfile, h.source)
        assert.equal(historical.image, rootWorkerBuild.image, `recorded serving history under ${state}`)
        const writes = h.publications.length
        await assert.rejects(h.produce(), /OPENSWX_REPAIR_SERVING_INVALID/u)
        assert.equal(h.publications.length, writes, `active ${state} cannot admit a new live producer`)
      }
    }
    const terminal = await o.run('finalize')
    return { h, o, terminal }
  }
  async function rootReleased(clock) {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    return rootReleaseAttempt(h, o)
  }
  test('B23_ROOT_STAGE_ACTIVATE_ORDER_FINALIZE_NEW_APP_PENDING', async () => rootModelClock(async clock => {
    const { h, o, terminal } = await rootReleased(clock)
    const check = h.sequence.findIndex(row => row.startsWith('publish:paused-pretraffic-check-')), traffic = h.sequence.indexOf('TRAFFIC')
    assert.ok(check >= 0 && traffic > check, 'actual stage publishes fresh pretraffic check before traffic')
    assert.ok(h.sequence.some(row => row.startsWith('publish:paused-finalize-check-')))
    assert.equal(terminal.value.facts.result, 'RELEASED'); assert.equal(terminal.value.facts.databaseDisposition, 'HISTORICAL_EVIDENCE_REUSED')
    assert.deepEqual(terminal.value.facts.migrationEvidenceRef, (await h.transport.readBytes(o.paths.migrate)).ref)
    assert.equal(terminal.value.facts.openswxWorker.status, 'ACTIVATION_PENDING'); assert.equal(terminal.value.facts.openswxWorker.claimProof, 'PENDING_NORMAL_ACTOR_STDOUT_READBACK')
    assert.equal(h.scheduler().state, 'PAUSED'); assert.equal(h.controls.traffic, 1); assert.equal(h.controls.runs, 1)
    assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.controls.appBuilds, 1)
    const finalizedCheck = [...h.store.values()].filter(row => row.ref.uri.includes('/paused-finalize-check-')).map(row => JSON.parse(row.bytes)).at(-1)
    assert.equal(finalizedCheck.servingRevision, h.controls.candidateFacts.candidateRevision)
    const publications = h.publications.length
    h.controls.job = { etag: 'MODELED-FINALIZE-JOB-DRIFT' }
    const canonical = await h.transport.readBytes(o.paths.canonical)
    await assert.rejects(o.worker.finalize({ intent: o.intent, profile: h.appProfile, canonical: { ...canonical, value: JSON.parse(canonical.bytes) } }), /OPENSWX_REPAIR_RESOURCE_DRIFT/u)
    assert.equal(h.publications.length, publications); assert.equal(h.controls.runs, 1); assert.equal(h.controls.traffic, 1)
  }))
  async function rootActivate(h, o, receiptId = 'B23-MODELED-ACTIVATION') {
    const input = { schemaVersion: 'aipdm.openswx-activate-input.v1', releaseCapsuleRef: o.intentRef, deadlineAt: o.intent.deadlineAt, receiptId }
    const inputRef = h.seed(`gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/${receiptId}-input.json`, input)
    return executeOpenSwxBootstrap({ stage: 'activate', inputRef, transport: h.transport, readSource: h.source, appProfile: h.appProfile })
  }
  test('B24_ROOT_FORWARD_083_PAUSED_WORKER_CURRENT_SOURCE_JOB_REPLAY_TERMINAL_READY', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock, currentHeadRevision), o = await h.ownerInput(await h.produce())
    assert.equal(h.appProfile.migrations.entries.length, 33)
    const prepared = await o.run('prepare')
    assert.equal(Object.hasOwn(prepared.value.facts, 'migrationReusePrerequisiteRef'), false)
    await o.run('prepare'); await o.run('build'); await o.run('build')
    const migration = await o.run('migrate'), replay = await o.run('migrate')
    assert.equal(migration.value.schemaVersion, 'jenfu.dev012.migration-receipt.v1')
    assert.equal(migration.value.ledgerCount, 33); assert.equal(migration.value.applied, 1); assert.equal(migration.value.replayed, 32)
    assert.deepEqual(replay.ref, migration.ref); assert.equal(h.controls.migrationJobs, 1); assert.equal(h.controls.appBuilds, 1)
    const before = h.publications.length
    for (const [field, value] of [['sourceRevision', capsule.sourceRevision], ['manifestSha256', '0'.repeat(64)], ['ledgerCount', 32]]) {
      const original = h.store.get(o.paths.migrate), { receiptSha256: _seal, ...core } = JSON.parse(original.bytes)
      const changed = { ...core, [field]: value }
      const changedRef = h.seed(o.paths.migrate, { ...changed, receiptSha256: sha256(canonicalize(changed)) })
      await assert.rejects(h.transport.readOwnerSourceProof({ profile: h.appProfile, sourceRevision: currentHeadRevision,
        refs: { prepare: prepared.ref, migrate: changedRef, terminal: null }, verifyProvider: true }), /MIGRATION_INVALID|REPAIR_FORWARD_MIGRATION_INVALID/u, field)
      h.store.set(o.paths.migrate, original)
    }
    assert.equal(h.publications.length, before); assert.equal(h.controls.migrationJobs, 1)
    for (const stage of ['candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical']) await o.run(stage)
    const terminal = await o.run('finalize')
    assert.equal(terminal.value.facts.databaseDisposition, 'FORWARD_APPLIED')
    assert.equal(Object.hasOwn(terminal.value.facts, 'migrationEvidenceRef'), false)
    assert.equal(Object.hasOwn(terminal.value.facts.openswxWorker, 'finiteSmokeRef'), false)
    assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.resumes ?? 0, 0); assert.equal(h.scheduler().state, 'PAUSED')
    await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      const observed = await h.transport.readOwnerSourceProof({ profile: h.appProfile, sourceRevision: currentHeadRevision,
        refs: { prepare: prepared.ref, migrate: migration.ref, terminal: terminal.ref }, verifyProvider: true })
      const graph = await readAiPdmObservationInputs(observed.proof)
      assert.equal(graph.repair, true); assert.equal(graph.migrationMode, 'FORWARD_APPLIED')
      assert.equal(graph.content.files.size, 34); assertAiPdmHistoricalMigration(graph.original)
      assert.equal(observed.proof.disposition, 'released'); assert.equal(Object.hasOwn(observed.proof, 'migrationEvidenceRef'), false)
    })
    const original = h.store.get(o.paths.terminal), { receiptSha256: _seal, ...core } = JSON.parse(original.bytes)
    const changed = { ...core, facts: { ...core.facts, databaseDisposition: 'HISTORICAL_EVIDENCE_REUSED', migrationEvidenceRef: migration.ref } }
    const changedRef = h.seed(o.paths.terminal, { ...changed, receiptSha256: sha256(canonicalize(changed)) })
    await assert.rejects(h.transport.readOwnerSourceProof({ profile: h.appProfile, sourceRevision: currentHeadRevision,
      refs: { prepare: prepared.ref, migrate: migration.ref, terminal: changedRef }, verifyProvider: true }), /TERMINAL_INVALID/u)
    h.store.set(o.paths.terminal, original)
    const activation = await rootActivate(h, o, 'B24-MODELED-FORWARD-ACTIVATION')
    assert.equal(activation.value.facts.workerStatus, 'READY'); assert.equal(h.scheduler().state, 'ENABLED')
    assert.equal(h.controls.runs, 1); assert.equal(h.controls.resumes, 1)
    assert.equal(h.controls.migrationJobs, 1)
  }))
  test('B23_ROOT_NORMAL_ACTOR_STDOUT_READY_AND_DAILY_REUSE', async () => rootModelClock(async clock => {
    const { h, o } = await rootReleased(clock), activation = await rootActivate(h, o)
    assert.equal(activation.value.facts.workerStatus, 'READY'); assert.equal(activation.value.facts.schedulerState, 'ENABLED')
    assert.equal(activation.value.facts.claimProof.claimProof, 'AUTHENTICATED_204_SOURCE_BOUND')
    assert.equal(h.controls.resumes, 1); assert.equal(h.scheduler().state, 'ENABLED')
    const input = { schemaVersion: 'aipdm.openswx-worker-reuse-input.v1', sourceLockRef: h.input.sourceLockRef, currentSourceObjectRef: h.input.currentSourceObjectRef,
      priorActivationRef: activation.ref, deadlineAt: new Date(Date.now() + 600000).toISOString(), receiptId: 'B23-MODELED-POST-READY-DAILY' }
    const finalized = JSON.parse((await h.transport.readBytes(o.paths.finalize)).bytes)
    const pendingInput = { ...input, priorActivationRef: finalized.facts.openswxWorker.finiteSmokeRef, receiptId: 'B23-MODELED-DAILY-PENDING' }
    const pendingRef = h.seed('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-daily-PENDING-input.json', pendingInput), publications = h.publications.length
    await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef: pendingRef, readSource: h.source }), /OPENSWX_REUSE_PRIOR_READY_INVALID/u)
    assert.equal(h.publications.length, publications); assert.equal(h.controls.appBuilds, 1); assert.equal(h.controls.runs, 1)
    // Historical READY artifacts remain reusable; DAILY admission checks the live app canonical.
    const { h: stale, o: staleOwner } = await rootReleased(clock)
    await rootActivate(stale, staleOwner)
    const staleInput = { ...input, sourceLockRef: stale.input.sourceLockRef, currentSourceObjectRef: stale.input.currentSourceObjectRef,
      priorActivationRef: rootActivationRef, receiptId: 'B23-MODELED-DAILY-OLD-CANONICAL', deadlineAt: new Date(Date.now() + 600000).toISOString() }
    const staleRef = stale.seed('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-daily-OLD-CANONICAL-input.json', staleInput)
    const staleAssociation = await executeWorkerArtifactReuse({ transport: stale.transport, inputRef: staleRef, readSource: stale.source })
    assert.deepEqual(staleAssociation.value.priorActivationRef, rootActivationRef)
    const { pausedBaselineRef: _staleBaseline, priorActivationRef: _stalePrior, retainedWorkerDescriptorRef: _staleRetained, releaseVariant: _staleVariant,
      tokenSecretVersion: _staleToken, registrySecretVersion: _staleRegistry, ...staleCommon } = staleOwner.descriptor
    const staleDescriptor = { ...staleCommon, schemaVersion: 'aipdm.openswx-worker-descriptor.v2', purpose: 'build_only', workerBuildRef: staleAssociation.ref }
    const staleDescriptorRef = stale.seed('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-daily-old-canonical-descriptor.json', staleDescriptor)
    const stalePauseRef = stale.seed('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-daily-old-canonical-pause-input.json', {
      schemaVersion: 'aipdm.openswx-pause-input.v1', descriptorRef: staleDescriptorRef, workerBuildRef: staleAssociation.ref,
      receiptId: 'B23-MODELED-DAILY-OLD-CANONICAL-PAUSE', deadlineAt: new Date(Date.now() + 600000).toISOString(), drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: rootActivationRef })
    const staleBefore = { publications: stale.publications.length, builds: stale.controls.appBuilds, runs: stale.controls.runs,
      secretPublications: stale.calls.filter(row => row.url.endsWith(':addVersion')).length }
    const staleAdmissionBefore = { scheduler: structuredClone(stale.scheduler()), resumes: stale.controls.resumes ?? 0 }
    assert.equal(staleAdmissionBefore.scheduler.state, 'ENABLED')
    stale.controls.daily = true
    await assert.rejects(executeOpenSwxBootstrap({ stage: 'pause', inputRef: stalePauseRef, transport: stale.transport, readSource: stale.source,
      appProfile: stale.appProfile, sleep: async ms => clock.advance(ms) }), /OPENSWX_PRIOR_CANONICAL_INVALID/u)
    assert.equal(stale.scheduler().state, 'PAUSED')
    assert.equal(stale.controls.resumes ?? 0, staleAdmissionBefore.resumes)
    assert.deepEqual({ publications: stale.publications.length, builds: stale.controls.appBuilds, runs: stale.controls.runs,
      secretPublications: stale.calls.filter(row => row.url.endsWith(':addVersion')).length }, staleBefore)
    const inputRef = h.seed('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-post-ready-daily-input.json', input)
    const association = await executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: h.source })
    assert.equal(association.value.schemaVersion, 'aipdm.openswx-worker-build-association.v1')
    assert.equal(Object.hasOwn(association.value, 'resourceBasis'), false)
    assert.deepEqual(association.value.priorActivationRef, activation.ref)
    assert.equal(h.controls.appBuilds, 1); assert.equal(h.controls.runs, 1); assert.equal(h.controls.migrationJobs ?? 0, 0)
    const { pausedBaselineRef: _baseline, priorActivationRef: _prior, retainedWorkerDescriptorRef: _retained, releaseVariant: _variant,
      tokenSecretVersion: _token, registrySecretVersion: _registry, ...common } = o.descriptor
    const buildOnly = { ...common, schemaVersion: 'aipdm.openswx-worker-descriptor.v2', purpose: 'build_only', workerBuildRef: association.ref }
    const descriptorRef = h.seed('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-modeled-daily-descriptor.json', buildOnly)
    const invoke = async (stage, extra) => {
      const inputRef = h.seed(`gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-modeled-daily-${stage}-input.json`, {
        schemaVersion: `aipdm.openswx-${stage}-input.v1`, descriptorRef, workerBuildRef: association.ref, receiptId: `B23-MODELED-DAILY-${stage.toUpperCase()}`, deadlineAt: new Date(Date.now() + 600000).toISOString(), ...extra })
      return executeOpenSwxBootstrap({ stage, inputRef, transport: h.transport, readSource: h.source, appProfile: h.appProfile, sleep: async ms => clock.advance(ms) })
    }
    h.controls.daily = true
    const drained = await invoke('pause', { drainKind: 'DAILY_DB_VERIFIED', priorActivationRef: activation.ref })
    const bootstrapped = await invoke('bootstrap', { bootstrapKind: 'DAILY_REFRESH', priorActivationRef: activation.ref, pausedDrainedRef: drained.ref })
    const full = { ...buildOnly, purpose: 'full', workerBuildRef: association.ref, bootstrapRef: bootstrapped.ref, cloudPreflightRef: bootstrapped.value.facts.cloudPreflightRef,
      pausedDrainedRef: drained.ref, tokenSecretVersion: rootFull.tokenSecretVersion, registrySecretVersion: rootFull.registrySecretVersion }
    const evidence = await readWorkerFullEvidence(h.transport, full, h.workerProfile, h.source)
    assert.equal(evidence.image, rootWorkerBuild.image); assert.equal(evidence.receipts.bootstrapRef.facts.bootstrapKind, 'DAILY_REFRESH')
    assert.equal(h.scheduler().state, 'PAUSED'); assert.equal(h.controls.dailyPatches, 1)
    assert.equal(h.controls.appBuilds, 1); assert.equal(h.controls.migrationJobs ?? 0, 0)
    assert.equal(h.calls.filter(row => row.url.endsWith(':addVersion')).length, 0)
    assert.equal(h.wire.counts.sourceArrayBuffer, 0)
  }))
  for (const [id, state] of [['MISSING', 'missing'], ['COMPLETED', 'completed'], ['CONFLICTING', 'conflicting']]) {
    test(`B23_ROOT_STDOUT_${id}_KEEPS_PAUSED`, async () => rootModelClock(async clock => {
      const { h, o } = await rootReleased(clock)
      h.controls.stdout = state
      await assert.rejects(rootActivate(h, o), /OPENSWX_STDOUT_NOT_UNIQUE|OPENSWX_STDOUT_MARKER_INVALID/u)
      assert.equal(h.scheduler().state, 'PAUSED'); assert.equal(h.controls.resumes ?? 0, 0)
      assert.equal(h.controls.runs, 1); assert.equal(h.controls.traffic, 1)
      assert.equal(h.controls.migrationJobs ?? 0, 0)
    }))
  }
  test('B23_ROOT_PENDING_TO_FORWARD_REPAIR_RETAINS_READY_WORKER', async () => rootModelClock(async clock => {
    const { h, o } = await rootReleased(clock)
    h.controls.stdout = 'missing'; await assert.rejects(rootActivate(h, o), /OPENSWX_STDOUT_NOT_UNIQUE/u)
    const next = await h.nextRepair(o, 2), descriptor = next.descriptor, baseline = (await h.transport.readJson(descriptor.pausedBaselineRef)).value
    assert.equal(baseline.continuationDepth, 2); assert.equal(baseline.servingApp.workerStatus, 'ACTIVATION_PENDING')
    assert.deepEqual(descriptor.priorActivationRef, rootActivationRef); assert.deepEqual(descriptor.retainedWorkerDescriptorRef, capsule.openswxWorkerRef)
    assert.deepEqual(baseline.predecessorBaselineRef, o.descriptor.pausedBaselineRef)
    const prepared = await next.run('prepare'); await next.run('build'); const migrated = await next.run('migrate')
    assert.deepEqual(migrated.value.prerequisiteRef, prepared.value.facts.migrationReusePrerequisiteRef)
    assert.equal(migrated.value.databaseDisposition, 'HISTORICAL_EVIDENCE_REUSED'); assert.equal(migrated.value.currentDatabaseReadPerformed, false)
    assert.equal(h.scheduler().state, 'PAUSED'); assert.equal(h.controls.resumes ?? 0, 0)
    assert.equal(h.controls.runs, 1); assert.equal(h.controls.appBuilds, 2); assert.equal(h.controls.migrationJobs ?? 0, 0)
  }))
  test('B23_ROOT_EXPIRED_STDOUT_FRESH_EXECUTION_REMAINS_PAUSED', async () => rootModelClock(async clock => {
    const { h, o } = await rootReleased(clock)
    clock.advance((h.workerProfile.bounds.proofFreshnessSeconds + 1) * 1000); h.controls.stdoutExpired = true
    await assert.rejects(rootActivate(h, o), /OPENSWX_STDOUT_WINDOW_INVALID/u)
    assert.equal(h.controls.runs, 2, 'old finite proof triggers one exact normal-actor fresh execution')
    assert.equal(h.controls.resumes ?? 0, 0); assert.equal(h.scheduler().state, 'PAUSED'); assert.equal(h.controls.traffic, 1)
    assert.equal(h.controls.migrationJobs ?? 0, 0)
  }))
  test('B23_ROOT_ACTUAL_WORKER_CURRENT_EXPIRY_ZERO_PUBLICATION_BUILD_MUTATION', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce()), publications = h.publications.length, calls = h.calls.length
    clock.advance(Date.parse(o.intent.deadlineAt) - Date.now())
    await assert.rejects(o.worker.prepare({ intent: o.intent, profile: h.appProfile, runtimeConfig: o.config }), /OPENSWX_OWNER_DEADLINE/u)
    assert.equal(h.publications.length, publications); assert.equal(h.calls.length, calls)
    assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
  }))
  test('B23_ROOT_ACTUAL_WORKER_SHARED_CONTEXT_CANNOT_REENTER_ANCESTOR', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce()), handle = createAiPdmEvidenceContext()
    const originalRead = h.transport.readJson, before = h.publications.length
    await runAiPdmEvidenceContext(handle, async () => {
      const child = descendAiPdmEvidenceContext(handle, b23ContextRef('actual-worker-child'), true)
      const transport = { ...h.transport, readJson: async (...args) => {
        if (args[0].uri === o.intent.openswxWorkerRef.uri) return runAiPdmEvidenceContext(handle, () => originalRead(...args))
        return originalRead(...args)
      } }
      const consumer = createOpenSwxOwnerRelease({ transport, readSource: h.source, environment: o.owner.environment })
      await runAiPdmEvidenceContext(child, () => assert.rejects(consumer.prepare({ intent: o.intent, profile: h.appProfile, runtimeConfig: o.config }), /CONTEXT_BRANCH_INVALID/u))
    })
    assert.equal(h.publications.length, before); assert.equal(h.controls.traffic ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0)
  }))
  test('B23_ROOT_ACTUAL_WORKER_WALL_REGRESSION_ZERO_PUBLICATION', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce()), publications = h.publications.length
    const read = h.transport.readJson
    h.transport.readJson = async (...args) => { const row = await read(...args); if (args[0].uri === o.descriptorRef.uri) clock.advance(-1); return row }
    await assert.rejects(o.worker.prepare({ intent: o.intent, profile: h.appProfile, runtimeConfig: o.config }), /OBSERVATION_EXPIRED/u)
    assert.equal(h.publications.length, publications); assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
  }))
  test('B23_ROOT_ACTUAL_WORKER_CLOSED_CALLBACK_CANNOT_REMINT_RUNTIME_ROOT', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce()), read = h.transport.readJson
    let openGate, late
    const gate = new Promise(resolve => { openGate = resolve })
    h.transport.readJson = async (...args) => {
      if (!late && args[0].uri === o.descriptorRef.uri) late = new Promise(resolve => setImmediate(async () => {
        await gate
        try { await h.transport.readOwnerSourceProof({ profile: rootProfile, sourceRevision: capsule.sourceRevision, refs: rootRefs, verifyProvider: true }); resolve('UNEXPECTED_SUCCESS') }
        catch (error) { resolve(error.message) }
      }))
      return read(...args)
    }
    try {
      await o.worker.prepare({ intent: o.intent, profile: h.appProfile, runtimeConfig: o.config })
      const publications = h.publications.length, media = h.wire.counts.sourceMedia, providers = h.wire.counts.provider
      assert.ok(late); openGate()
      assert.match(await late, /CONTEXT_INVALID/u)
      assert.equal(h.publications.length, publications); assert.equal(h.wire.counts.sourceMedia, media); assert.equal(h.wire.counts.provider, providers)
      assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
    } finally { openGate() }
  }))
  test('B23_ROOT_ACTUAL_RESOLVER_SHARED_DAG_EIGHT_AND_NINTH_TRANSITION', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce()), root = createAiPdmEvidenceContext()
    await runAiPdmEvidenceContext(root, async () => {
      const resolveAt = async (handle, depth) => runAiPdmEvidenceContext(handle, async () => {
        if (depth === 6) return resolveWorkerArtifact({ transport: h.transport, descriptor: o.descriptor, profile: h.workerProfile, readSource: h.source })
        return resolveAt(descendAiPdmEvidenceContext(handle, b23ContextRef(`resolver-depth-${depth}`), true), depth + 1)
      })
      const value = await resolveAt(root, 0)
      assert.equal(value.image, rootWorkerBuild.image)
      const sourceReads = h.wire.counts.sourceMedia
      const siblings = ['resolver-sibling-a', 'resolver-sibling-b'].map(name => descendAiPdmEvidenceContext(root, b23ContextRef(name), true))
      await Promise.all(siblings.map(handle => runAiPdmEvidenceContext(handle, () => resolveWorkerArtifact({ transport: h.transport, descriptor: o.descriptor, profile: h.workerProfile, readSource: h.source }))))
      assert.equal(h.wire.counts.sourceMedia, sourceReads, 'shared root reuses authenticated bytes while all semantic joins run again')
      const read = h.transport.readJson; let readsAfterConflict = 0
      h.transport.readJson = async (...args) => { readsAfterConflict++; return read(...args) }
      const conflicted = { ...o.descriptor, workerBuildRef: { ...o.descriptor.workerBuildRef, sha256: '0'.repeat(64) } }
      await assert.rejects(resolveWorkerArtifact({ transport: h.transport, descriptor: conflicted, profile: h.workerProfile, readSource: h.source }), /GRAPH_CYCLE_OR_HASH_CONFLICT/u)
      assert.equal(readsAfterConflict, 0, 'warmed byte memo cannot bypass current ref identity and semantic joins')
      h.transport.readJson = read
      const failure = async (handle, depth) => runAiPdmEvidenceContext(handle, async () => {
        if (depth === 7) return resolveWorkerArtifact({ transport: h.transport, descriptor: o.descriptor, profile: h.workerProfile, readSource: h.source })
        return failure(descendAiPdmEvidenceContext(handle, b23ContextRef(`resolver-over-depth-${depth}`), true), depth + 1)
      })
      await assert.rejects(failure(root, 0), /GRAPH_DEPTH_INVALID/u)
    })
    assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
  }))
  test('B23_ROOT_REPAIR_GRAPH_SEMANTIC_MEMO_AND_JOINS', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce()), originalRow = h.store.get(o.descriptor.workerBuildRef.uri)
    await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      await readWorkerFullEvidence(h.transport, o.descriptor, h.workerProfile, h.source)
      const request = h.transport.request, beforeIam = { publications: h.publications.length, builds: h.controls.appBuilds ?? 0, runs: h.controls.runs ?? 0, traffic: h.controls.traffic ?? 0, resumes: h.controls.resumes ?? 0 }
      let crmReads = 0
      h.transport.request = async (url, ...args) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) { crmReads++; return { bindings: [] } }
        return request(url, ...args)
      }
      try {
        await assert.rejects(h.produce(), /OPENSWX_IAM_|OPENSWX_.*RESOURCE/u, 'warmed historical leaves cannot bypass current normal-actor IAM observation')
      } finally { h.transport.request = request }
      assert.ok(crmReads > 0, 'legal RELEASED serving preimage reaches the fresh CRM IAM GET')
      assert.deepEqual({ publications: h.publications.length, builds: h.controls.appBuilds ?? 0, runs: h.controls.runs ?? 0, traffic: h.controls.traffic ?? 0, resumes: h.controls.resumes ?? 0 }, beforeIam)
      const skipped = { ...h.input, predecessorBaselineRef: o.descriptor.pausedBaselineRef, receiptId: 'B23-MODELED-SKIPPED-PREDECESSOR' }
      const skippedRef = h.seed('gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-skipped-predecessor-input.json', skipped)
      await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef: skippedRef, readSource: h.source }), /OPENSWX_REUSE_JOIN_INVALID/u)
      assert.equal(h.publications.length, beforeIam.publications)
      await o.run('prepare'); await o.run('build'); await o.run('migrate')
      const refs = { prepare: (await h.transport.readBytes(o.paths.prepare)).ref, migrate: (await h.transport.readBytes(o.paths.migrate)).ref, terminal: null }
      const observation = await h.transport.readOwnerSourceProof({ profile: h.appProfile, sourceRevision: b23Revision, refs, verifyProvider: true })
      const firstGraph = await readAiPdmObservationInputs(observation.proof), media = h.wire.counts.sourceMedia
      firstGraph.descriptor.sourceRevision = '0'.repeat(40)
      const nextGraph = await readAiPdmObservationInputs(observation.proof)
      assert.notEqual(nextGraph, firstGraph); assert.equal(nextGraph.descriptor.sourceRevision, b23Revision)
      assert.equal(h.wire.counts.sourceMedia, media, 'rewalking semantic graph retains authenticated immutable leaf bytes only')
      const root = createAiPdmEvidenceContext(), baselineAncestor = descendAiPdmEvidenceContext(root, o.descriptor.pausedBaselineRef, true)
      const gets = h.wire.counts.gcsUris.length
      await runAiPdmEvidenceContext(baselineAncestor, () => assert.rejects(readAiPdmObservationInputs(observation.proof), /GRAPH_CYCLE_OR_HASH_CONFLICT/u))
      assert.equal(h.wire.counts.gcsUris.length, gets, 'warmed proof cannot memoize a semantic PASS over a new ancestor conflict')
      observation.proof.sourceRevision = capsule.sourceRevision
      await assert.rejects(readAiPdmObservationInputs(observation.proof), /OBSERVATION_IDENTITY_INVALID/u)
      await assert.rejects(verifyOwnerProviderReadback({ proof: observation.proof, token: 'authentic-root-replay-token', fetchImpl: h.wire.fetchImpl }), /PROVIDER_SOURCE_MISMATCH/u)
      observation.proof.sourceRevision = b23Revision
      const publications = h.publications.length, read = h.transport.readJson
      for (const [vector, changed] of [
        ['warm_leaf_current_source_join', { ...o.descriptor, sourceRevision: capsule.sourceRevision }],
        ['wrong_bootstrap_owner', { ...o.descriptor, retainedWorkerDescriptorRef: rootWorkerBuild.previousRefs[0] }],
        ['build_only_instead_of_full', { ...o.descriptor, purpose: 'build_only' }],
      ]) await assert.rejects(readWorkerFullEvidence(h.transport, changed, h.workerProfile, h.source), /OPENSWX_/u, vector)
      const actor = JSON.parse(originalRow.bytes); actor.actor = 'wrong@jenfu.com.tw'
      const actorRef = h.seed(o.descriptor.workerBuildRef.uri, actor)
      await assert.rejects(resolveWorkerArtifact({ transport: h.transport, descriptor: { ...o.descriptor, workerBuildRef: actorRef }, profile: h.workerProfile, readSource: h.source }), /GRAPH_CYCLE_OR_HASH_CONFLICT/u, 'warm byte identity rejects changed actor payload')
      h.store.set(originalRow.ref.uri, originalRow)
      let reads = 0; h.transport.readJson = async (...args) => { reads++; return read(...args) }
      const cycle = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), o.descriptor.workerBuildRef, true)
      await runAiPdmEvidenceContext(cycle, () => assert.rejects(resolveWorkerArtifact({ transport: h.transport, descriptor: o.descriptor, profile: h.workerProfile, readSource: h.source }), /GRAPH_CYCLE_OR_HASH_CONFLICT/u))
      assert.equal(reads, 0); h.transport.readJson = read
      assert.equal(h.publications.length, publications)
    })
    const publications = h.publications.length
    const source = rootSourceReader(), deniedHistorical = []
    const observeDenial = (callback, revision) => {
      try { return callback() } catch (error) {
        if (error.code === 'ERR_ASSERTION' && /^chain (?:tree |tree-id )?admission before /u.test(error.message)) deniedHistorical.push(revision)
        throw error
      }
    }
    const denied = (path, revision) => observeDenial(() => source(path, revision), revision)
    Object.assign(denied, source); denied.authorizeOrigin = () => {}
    denied.readTree = revision => observeDenial(() => source.readTree(revision), revision)
    denied.readTreeId = revision => observeDenial(() => source.readTreeId(revision), revision)
    const beforeDenied = { publications: h.publications.length, builds: h.controls.appBuilds ?? 0, runs: h.controls.runs ?? 0, traffic: h.controls.traffic ?? 0, resumes: h.controls.resumes ?? 0 }
    await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef: h.inputRef, readSource: denied }),
      error => error.code === 'ERR_ASSERTION' && /^chain (?:tree |tree-id )?admission before [a-f0-9]{40}(?::|$)/u.test(error.message))
    assert.equal(deniedHistorical.length, 1); assert.ok(historical.has(deniedHistorical[0])); assert.notEqual(deniedHistorical[0], b23Revision)
    assert.deepEqual({ publications: h.publications.length, builds: h.controls.appBuilds ?? 0, runs: h.controls.runs ?? 0, traffic: h.controls.traffic ?? 0, resumes: h.controls.resumes ?? 0 }, beforeDenied)
    assert.equal(h.publications.length, publications); assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
  }))
  test('B23_ROOT_CHANGED_RAW_SQL_REJECTED_BEFORE_PAID_BUILD', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    const original = o.owner.readWorkerSource, last = b23NativeArchive().bundle.entries.at(-1).path
    const changed = (path, revision) => path === last && revision === b23Revision ? Buffer.concat([original(path, revision), Buffer.from('\n-- modeled drift\n')]) : original(path, revision)
    Object.assign(changed, original); o.owner.readWorkerSource = changed
    await assert.rejects(o.run('prepare'), /ARCHIVE_SQL_MISMATCH/u)
    assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.controls.candidates ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
    o.owner.readWorkerSource = original
    await o.run('prepare'); const publications = h.publications.length
    o.owner.createSourceArchive = async () => Buffer.concat([b23TarRecord('pax_global_header', b23Pax('comment', b23Revision), 'g'), b23TarRecord('source/', Buffer.alloc(0), '5'),
      ...[...b23NativeArchive().files].map(([path, bytes]) => b23TarRecord(`source/${path}`, path === last ? Buffer.concat([bytes, Buffer.from('\n-- assembled archive drift\n')]) : bytes)), Buffer.alloc(2048)])
    await assert.rejects(o.run('build'), /ARCHIVE_SQL_MISMATCH/u)
    assert.equal(h.publications.length, publications); assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.migrationJobs ?? 0, 0)
  }))
  test('B23_ROOT_MIGRATION_UNKNOWN_WRITE_READBACK_NO_RESUBMISSION', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    await o.run('prepare'); await o.run('build')
    const original = h.transport.putJson; let submits = 0
    h.transport.putJson = async (...args) => {
      const result = await original(...args)
      if (args[0] === o.paths.migrate) { submits++; throw Object.assign(Error('OUTCOME_UNKNOWN'), { code: 'OUTCOME_UNKNOWN' }) }
      return result
    }
    const migration = await o.run('migrate')
    assert.equal(submits, 1); assert.equal(migration.value.databaseDisposition, 'HISTORICAL_EVIDENCE_REUSED')
    assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0)
  }))
  test('B23_ROOT_MIGRATION_CLOSED_ASSOCIATION_GENERIC_ISOLATION', async () => rootModelClock(async clock => {
    const { h, o } = await rootReleased(clock)
    const prepared = await h.transport.readBytes(o.paths.prepare), migrated = await h.transport.readBytes(o.paths.migrate), terminal = await h.transport.readBytes(o.paths.terminal)
    const refs = { prepare: prepared.ref, migrate: migrated.ref, terminal: terminal.ref }
    for (const observedRefs of [refs, { ...refs, terminal: null }]) {
      const result = await h.transport.readOwnerSourceProof({ profile: h.appProfile, sourceRevision: b23Revision, refs: observedRefs, verifyProvider: true })
      assert.equal(result.proof.disposition, observedRefs.terminal ? 'released' : 'migration_evidence_only')
      assert.equal(result.proof.migrationVerified, false); assert.equal(result.proof.currentDatabaseReadPerformed, false); assert.equal(result.proof.databaseLiveState, 'UNKNOWN')
      assert.equal(result.provider.status, 'BUILD_IMAGE_VERIFIED')
    }
    // Preview uses this existing generic default route; it must remain strict v1.
    for (const observedRefs of [refs, { ...refs, terminal: null }]) await assert.rejects(readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision: b23Revision,
      refs: observedRefs, token: 'authentic-root-replay-token', fetchImpl: h.wire.fetchImpl }), /MIGRATION_INVALID/u)
    const original = h.store.get(o.paths.migrate), value = JSON.parse(original.bytes)
    const mutations = [
      ['schema', core => { core.schemaVersion = 'aipdm.paused-app-repair-migration-association.v2' }],
      ['source', core => { core.sourceRevision = capsule.sourceRevision }],
      ['ref', core => { core.releaseCapsuleRef = rootManifest.capsuleRef }],
      ['descriptor', core => { core.workerDescriptorRef = capsule.openswxWorkerRef }],
      ['baseline', core => { core.pausedBaselineRef = o.descriptor.pausedBaselineRef }],
      ['selfhash', () => {}],
    ]
    for (const [name, mutate] of mutations) {
      const { receiptSha256: _seal, ...core } = structuredClone(value); mutate(core)
      const changed = { ...core, receiptSha256: name === 'selfhash' ? '0'.repeat(64) : sha256(canonicalize(core)) }
      const changedRef = h.seed(o.paths.migrate, changed), publications = h.publications.length, providers = h.wire.counts.provider
      await assert.rejects(h.transport.readOwnerSourceProof({ profile: h.appProfile, sourceRevision: b23Revision,
        refs: { prepare: prepared.ref, migrate: changedRef, terminal: null }, verifyProvider: true }), /REPAIR_|MIGRATION_/u, name)
      assert.equal(h.publications.length, publications); assert.equal(h.wire.counts.provider, providers)
      h.store.set(o.paths.migrate, original)
    }
    const originalPrepare = h.store.get(o.paths.prepare), prerequisiteRef = JSON.parse(prepared.bytes).facts.migrationReusePrerequisiteRef
    const originalPrerequisite = h.store.get(prerequisiteRef.uri)
    for (const [name, mutate] of [
      ['closed_prerequisite_wrong_descriptor_join', core => { core.workerDescriptorRef = capsule.openswxWorkerRef }],
      ['closed_prerequisite_wrong_baseline_join', core => { core.pausedBaselineRef = capsule.openswxWorkerRef }],
    ]) {
      const { receiptSha256: _seal, ...core } = JSON.parse(originalPrerequisite.bytes); mutate(core)
      const changedPrerequisite = h.seed(prerequisiteRef.uri, { ...core, receiptSha256: sha256(canonicalize(core)) })
      const { receiptSha256: _prepareSeal, ...prepareCore } = JSON.parse(prepared.bytes)
      const changedPrepareCore = { ...prepareCore, facts: { ...prepareCore.facts, migrationReusePrerequisiteRef: changedPrerequisite } }
      const changedPrepare = h.seed(o.paths.prepare, { ...changedPrepareCore, receiptSha256: sha256(canonicalize(changedPrepareCore)) })
      const { receiptSha256: _migrationSeal, ...migrationCore } = value
      const changedMigrationCore = { ...migrationCore, prerequisiteRef: changedPrerequisite }
      const changedMigration = h.seed(o.paths.migrate, { ...changedMigrationCore, receiptSha256: sha256(canonicalize(changedMigrationCore)) })
      const publications = h.publications.length, providers = h.wire.counts.provider
      await assert.rejects(h.transport.readOwnerSourceProof({ profile: h.appProfile, sourceRevision: b23Revision,
        refs: { prepare: changedPrepare, migrate: changedMigration, terminal: null }, verifyProvider: true }), /REPAIR_/u, name)
      assert.equal(h.publications.length, publications); assert.equal(h.wire.counts.provider, providers)
      h.store.set(o.paths.prepare, originalPrepare); h.store.set(o.paths.migrate, original); h.store.set(prerequisiteRef.uri, originalPrerequisite)
    }
    assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.wire.counts.sourceArrayBuffer, 0)
  }))
  test('B23_ROOT_ACTUAL_RECOVERY_EXIT1_UNKNOWN_RUN_AND_RESUME', async () => {
    await rootModelClock(async clock => {
      const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
      for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical']) await o.run(stage)
      h.controls.exit1 = true
      await assert.rejects(o.run('finalize'), /OPENSWX_EXECUTION_FAILED|OPENSWX_EXECUTION_TERMINAL_INVALID/u)
      const mark = h.sequence.length, recovered = await o.run('rollback'), recovery = h.sequence.slice(mark)
      assert.equal(recovered.value.facts.databaseDisposition, 'HISTORICAL_EVIDENCE_REUSED'); assert.equal(recovered.value.facts.openswxWorker.status, 'PAUSED_RECOVERED')
      assert.equal(h.transport.effectiveRevision(await h.transport.getService(h.appProfile)), o.intent.previousRevision)
      assert.ok(recovery.indexOf('TRAFFIC') >= 0 && recovery.indexOf('TAG_REMOVED') > recovery.indexOf('TRAFFIC') && recovery.indexOf('ENTRY_RESTORED') > recovery.indexOf('TAG_REMOVED'))
      assert.equal(h.scheduler().state, 'PAUSED'); assert.equal(h.controls.runs, 1); assert.equal(h.controls.migrationJobs ?? 0, 0)
    })
    await rootModelClock(async clock => {
      const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce()); h.controls.runUnknown = true
      await rootReleaseAttempt(h, o)
      assert.equal(h.controls.runs, 1)
      const replay = await o.worker.finalize({ intent: o.intent, profile: h.appProfile, canonical: { value: JSON.parse((await h.transport.readBytes(o.paths.canonical)).bytes), ref: (await h.transport.readBytes(o.paths.canonical)).ref } })
      assert.equal(replay.status, 'ACTIVATION_PENDING'); assert.equal(h.controls.runs, 1, 'unknown :run replay reads its exact durable window')
      h.controls.resumeUnknown = true
      await assert.rejects(rootActivate(h, o), /OPENSWX_ACTIVATION_PENDING_RECOVERY_REQUIRED/u)
      assert.equal(h.controls.resumes, 1); assert.equal(h.scheduler().state, 'PAUSED')
      await assert.rejects(rootActivate(h, o), /OPENSWX_ENABLE_REPLAY_REQUIRES_PAUSE_READBACK/u)
      assert.equal(h.controls.resumes, 1); assert.equal(h.controls.runs, 1); assert.equal(h.scheduler().state, 'PAUSED')
      assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.calls.filter(row => row.url.endsWith(':addVersion')).length, 0)
    })
  })
  test('B23_ROOT_ACTUAL_CONSUMER_DEADLINE_AFTER_OBSERVATION', async () => {
    await rootModelClock(async clock => {
      const h = rootConsumerModel(clock), publications = h.publications.length
      clock.afterPauseFence = () => clock.advance(Date.parse(h.input.deadlineAt) - Date.now())
      await assert.rejects(h.produce(), /OPENSWX_OWNER_DEADLINE|OBSERVATION_EXPIRED/u)
      assert.equal(h.publications.length, publications); assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0)
    })
    await rootModelClock(async clock => {
      const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
      await o.run('prepare'); const publications = h.publications.length, read = h.transport.readBytes
      h.transport.readBytes = async (...args) => { const row = await read(...args); if (args[0] === o.paths.prepare) clock.advance(Date.parse(o.intent.deadlineAt) - Date.now()); return row }
      await assert.rejects(o.run('build'), /OWNER_DEADLINE|OPENSWX_OWNER_DEADLINE/u)
      assert.equal(h.publications.length, publications); assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.migrationJobs ?? 0, 0)
    })
    await rootModelClock(async clock => {
      const { h, o } = await rootReleased(clock), publications = h.publications.length, observe = h.transport.readOwnerSourceProof
      h.transport.readOwnerSourceProof = async (...args) => { const row = await observe(...args); clock.advance(Date.parse(o.intent.deadlineAt) - Date.now()); return row }
      await assert.rejects(rootActivate(h, o), /OPENSWX_OWNER_DEADLINE|OBSERVATION_EXPIRED/u)
      assert.equal(h.publications.length, publications); assert.equal(h.controls.resumes ?? 0, 0); assert.equal(h.controls.runs, 1); assert.equal(h.scheduler().state, 'PAUSED')
    })
    await rootModelClock(async clock => {
      const h = rootConsumerModel(clock), failed = await h.ownerInput(await h.produce())
      await failed.run('prepare'); await failed.run('rollback')
      const { controlSha256: _seal, ...core } = JSON.parse((await h.transport.readBytes(failed.paths.control)).bytes), closed = { ...core, leaseExpiresAt: new Date(Date.now() - 1).toISOString() }
      h.seed(failed.paths.control, { ...closed, controlSha256: sha256(canonicalize(closed)) })
      const request = h.transport.request
      h.transport.request = async (url, ...args) => url.startsWith('https://cloudbuild.googleapis.com/') && url.includes('/builds?') ? {} : request(url, ...args)
      const retry = await h.nextRepair(failed, 2, { predecessorBaselineRef: null, baselineIntentRef: rootManifest.capsuleRef, authorityBaselineRef: failed.intentRef })
      const service = h.transport.getService, publications = h.publications.length
      h.transport.getService = async (...args) => { const result = await service(...args); clock.advance(Date.parse(retry.intent.deadlineAt) - Date.now()); return result }
      await assert.rejects(retry.run('prepare'), /OWNER_DEADLINE|OPENSWX_OWNER_DEADLINE/u)
      assert.equal(h.publications.length, publications); assert.equal(h.controls.appBuilds ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
    })
  })
  test('B23_ROOT_ACTUAL_COMBINED_THREE_TWO_FOUR_DEPTH_REJECTS_NINTH', async () => rootModelClock(async clock => {
    const { h, o } = await rootReleased(clock), second = await h.nextRepair(o, 2)
    await rootReleaseAttempt(h, second)
    const third = await h.nextRepair(second, 3), context = createAiPdmEvidenceContext(), writes = h.publications.length
    const originalProof = h.transport.readOwnerSourceProof, originalRead = h.transport.readJson, proofs = [], reads = [], startGcs = h.wire.counts.gcsUris.length, startProvider = h.wire.counts.provider
    h.transport.readOwnerSourceProof = async (...args) => { proofs.push(args[0]); return originalProof(...args) }
    h.transport.readJson = async (...args) => { reads.push(args[0].uri); return originalRead(...args) }
    await runAiPdmEvidenceContext(context, async () => {
      const descendThree = async (handle, count) => runAiPdmEvidenceContext(handle, async () => {
        if (count === 3) return readWorkerFullEvidence(h.transport, third.descriptor, h.workerProfile, h.source)
        return descendThree(descendAiPdmEvidenceContext(handle, b23ContextRef(`combined-prefix-${count}`), true), count + 1)
      })
      await assert.rejects(descendThree(context, 0), /GRAPH_DEPTH_INVALID/u)
    })
    assert.equal(h.publications.length, writes); assert.equal(h.controls.appBuilds, 2); assert.equal(h.controls.runs, 2)
    assert.equal(proofs.filter(args => args.refs.prepare.uri === rootRefs.prepare.uri).length, 0, 'ninth B14 semantic transition rejects before its fixed reader or provider GET')
    assert.equal(reads.filter(uri => uri === rootRefs.prepare.uri).length, 0, 'ninth transition cannot start the B14 serving stage read')
    assert.equal(reads.filter(uri => uri === rootManifest.capsuleRef.uri).length, 1, 'only the distinct last-READY provenance branch reads its original B14 capsule')
    assert.equal(h.wire.counts.gcsUris.slice(startGcs).filter(uri => uri === rootRefs.prepare.uri).length, 0, 'actual fixed fetch adapter cannot GET ninth serving prepare')
    assert.equal(h.wire.counts.gcsUris.slice(startGcs).filter(uri => uri === rootManifest.capsuleRef.uri).length, 0, 'depth guard precedes the actual fixed capsule GET')
    assert.equal(h.wire.counts.provider, startProvider, 'source graph rejects depth before provider Build/Image verification')
    assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.scheduler().state, 'PAUSED')
  }))
  test('B23_ROOT_ABORT_RELEASED_REPAIR_ANCHOR_RETAINS_HISTORICAL_DISPOSITION', async () => rootModelClock(async clock => {
    const { h, o } = await rootReleased(clock), second = await h.nextRepair(o, 2)
    for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint']) await second.run(stage)
    const terminal = await second.run('rollback')
    assert.equal(terminal.value.facts.databaseDisposition, 'HISTORICAL_EVIDENCE_REUSED')
    const row = await h.transport.readBytes(second.paths.control), { controlSha256: _seal, ...core } = JSON.parse(row.bytes)
    const closed = { ...core, leaseExpiresAt: new Date(Date.now() - 1).toISOString() }
    h.seed(second.paths.control, { ...closed, controlSha256: sha256(canonicalize(closed)) })
    const basis = await readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: second.intentRef, verifyProvider: true })
    assert.equal(basis.kind, 'PRINCIPAL_ORDINARY_ABORT')
    for (const proof of [basis.authorityBasis.failedProof, basis.authorityBasis.releasedProof]) {
      assert.equal(proof.databaseDisposition, 'HISTORICAL_EVIDENCE_REUSED'); assert.equal(proof.migrationVerified, false); assert.equal(proof.databaseLiveState, 'UNKNOWN'); assert.equal(proof.currentDatabaseReadPerformed, false)
    }
    const retry = await h.nextRepair(o, 3, { authorityBaselineRef: second.intentRef })
    const prepared = await retry.run('prepare')
    assert.deepEqual(retry.intent.baselineIntentRef, second.intentRef)
    assert.deepEqual(prepared.value.facts.preActivationAbortBasis, basis.authorityBasis)
    assert.equal(prepared.value.facts.previousRevision, second.intent.previousRevision)
    assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.controls.traffic, 1); assert.equal(h.controls.runs, 1)
  }))
  test('B23_ROOT_READY_ANCHOR_ABORT_ACTUAL_PRODUCER_ROUTINE_PREPARE_RETRY', async () => rootModelClock(async clock => {
    const { h, o } = await rootReleased(clock), activation = await rootActivate(h, o)
    await h.transport.request(`https://cloudscheduler.googleapis.com/v1/${workerSchedulerName()}:pause`, { method: 'POST', body: '{}' })
    const failed = await h.nextRepair(o, 2, { predecessorBaselineRef: null, priorActivationRef: activation.ref })
    for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint']) await failed.run(stage)
    await failed.run('rollback')
    const { controlSha256: _seal, ...core } = JSON.parse((await h.transport.readBytes(failed.paths.control)).bytes)
    const closed = { ...core, leaseExpiresAt: new Date(Date.now() - 1).toISOString() }
    h.seed(failed.paths.control, { ...closed, controlSha256: sha256(canonicalize(closed)) })
    const retry = await h.nextRepair(o, 3, { predecessorBaselineRef: null, priorActivationRef: activation.ref, authorityBaselineRef: failed.intentRef })
    const prepared = await retry.run('prepare'), basis = prepared.value.facts.preActivationAbortBasis
    assert.deepEqual(retry.intent.baselineIntentRef, failed.intentRef); assert.deepEqual(basis.failedIntentRef, failed.intentRef); assert.deepEqual(basis.releasedIntentRef, o.intentRef)
    assert.equal(prepared.value.facts.previousRevision, failed.intent.previousRevision)
    const baseline = (await h.transport.readJson(retry.descriptor.pausedBaselineRef)).value
    assert.equal(baseline.servingApp.workerStatus, 'READY'); assert.deepEqual(baseline.servingApp.capsuleRef, o.intentRef)
    assert.equal(h.controls.appBuilds, 2); assert.equal(h.controls.traffic, 1); assert.equal(h.controls.runs, 1); assert.equal(h.controls.migrationJobs ?? 0, 0)
    assert.equal(h.scheduler().state, 'PAUSED'); assert.equal(h.wire.counts.sourceArrayBuffer, 0)
  }))
  test('B23_ROOT_ABORT_HISTORICAL_REUSE_AND_ORDINARY_RETRY_BASIS', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint']) await o.run(stage)
    const terminal = await o.run('rollback')
    assert.equal(terminal.value.facts.result, 'PRE_ACTIVATION_ABORTED'); assert.equal(terminal.value.facts.databaseDisposition, 'HISTORICAL_EVIDENCE_REUSED')
    assert.deepEqual(terminal.value.facts.migrationEvidenceRef, (await h.transport.readBytes(o.paths.migrate)).ref)
    assert.equal(terminal.value.facts.openswxWorker.status, 'PAUSED_RECOVERED')
    // A completed failed lease is a model input; the historical source graph is authentic.
    const controlRow = await h.transport.readBytes(o.paths.control), control = JSON.parse(controlRow.bytes)
    const { controlSha256: _controlSeal, ...core } = control
    h.seed(o.paths.control, { ...core, leaseExpiresAt: new Date(Date.now() - 1).toISOString(), controlSha256: sha256(canonicalize({ ...core, leaseExpiresAt: new Date(Date.now() - 1).toISOString() })) })
    const basis = await readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: o.intentRef, verifyProvider: true })
    assert.equal(basis.kind, 'PRINCIPAL_ORDINARY_ABORT'); assert.equal(basis.currentActiveRevision, o.intent.previousRevision)
    assert.equal(basis.authorityBasis.failedProof.databaseDisposition, 'HISTORICAL_EVIDENCE_REUSED')
    assert.equal(basis.authorityBasis.failedProof.migrationVerified, false)
    assert.equal(basis.authorityBasis.releasedProof.disposition, 'released')
    assert.equal(h.controls.traffic ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.migrationJobs ?? 0, 0)
    await assert.rejects(o.run('candidate'), /RELEASE_ALREADY_PREACTIVATION_ABORTED/u)
    const retry = await h.nextRepair(o, 2, { predecessorBaselineRef: null, baselineIntentRef: rootManifest.capsuleRef, authorityBaselineRef: o.intentRef })
    const prepared = await retry.run('prepare')
    assert.deepEqual(retry.intent.baselineIntentRef, o.intentRef); assert.deepEqual(prepared.value.facts.preActivationAbortBasis, basis.authorityBasis)
    assert.equal(prepared.value.facts.previousRevision, o.intent.previousRevision)
    assert.deepEqual((await h.transport.readJson(retry.descriptor.pausedBaselineRef)).value.servingApp.capsuleRef, rootManifest.capsuleRef)
    assert.equal(h.controls.appBuilds, 1); assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0)
  }))

  test('B31_ROOT_AUTHENTIC_INHERITED_FORWARD_ABORT_COLD_WARM_NEXT_PREPARE', async () => rootModelClock(async clock => {
    const b23Revision = currentHeadRevision
    const h = rootConsumerModel(clock, b23Revision), bucket = 'jenfu-platform-prod-aipdm-release', runs = new Map(), buildLists = new Map()
    const request = h.transport.request, currentStart = Date.now()-100000
    let currentExecution = null
    h.transport.request = (url, options) => url.includes('/builds?filter=') ? { builds: buildLists.get(new URL(url).searchParams.get('filter')) ?? [] }
      : url.includes('/jobs/ai-pdm-prod-migration-runner/executions?') ? { executions: currentExecution ? [currentExecution] : [] } : request(url, options)
    h.transport.readOwnerRun = async (_p, url) => runs.get(url.split('/').at(-1)) ?? { id: '123', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: b23Revision, createdAt: new Date(currentStart).toISOString(), updatedAt: clock.now() }
    const previous = (await h.transport.getService()).traffic[0].revision
    const facts = { result: 'PRE_ACTIVATION_ABORTED', previousRevision: previous, databaseDisposition: 'NOT_APPLIED', entrypointRecovery: { changed: false, result: 'NOT_REQUIRED' }, recoveryOrder: ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'] }
    const history = async (releaseId, sourceRevision, ownerId, baselineIntentRef, basis, offset) => {
      const seed = (name, value) => h.seed(`gs://${bucket}/receipts/releases/${releaseId}/${name}.json`, value)
      const lockRef = seed('source-lock', { ...rootObject(capsule.sourceLockRef), releaseId, sourceRevision, remoteRevision: sourceRevision })
      const runtimeRef = seed('runtime-config', { ...rootObject(capsule.runtimeConfigRef), releaseId, sourceRevision })
      const authRef = seed('authorization', { ...rootObject(capsule.authorizationPolicyRef), releaseId, sourceRevision, ...(basis ? { preActivationAbortBasis: basis } : {}) })
      const readyRef = seed('readiness', { ...rootObject(capsule.readinessReceiptRef), releaseId, sourceRevision, ...(basis ? { preActivationAbortBasis: basis } : {}) })
      const intent = { ...capsule, releaseId, sourceRevision, sourceLockRef: lockRef, runtimeConfigRef: runtimeRef, authorizationPolicyRef: authRef, readinessReceiptRef: readyRef, baselineIntentRef, previousRevision: previous }
      delete intent.openswxWorkerRef
      const intentRef = seed('release-intent', intent), paths = releasePaths(h.appProfile, intent, intentRef.sha256)
      const seal = (stage, f, prev=null) => h.seed(paths[stage], stageReceipt({ profile: h.appProfile, intent, stage, facts: f, previousReceiptRef: prev, observedAt: clock.now() }))
      seal('prepare', { previousRevision: previous, entrypointBaseline: h.transport.entrypointSnapshot(await h.transport.getService()), prerequisiteRefs: { sourceLock: lockRef, authorization: authRef, readiness: readyRef, foundation: intent.foundationReceiptRef, infra: intent.infraReceiptRef, runtimeConfig: runtimeRef }, ...(basis ? { preActivationAbortBasis: basis } : {}) })
      const rollback = seal('rollback', facts), { recoveryOrder: _order, ...terminalFacts } = facts
      seal('terminal', terminalFacts, rollback)
      const start = Date.now()-offset, end = start+10000, ownerRunRef = `https://api.github.com/repos/${h.appProfile.application.repository}/actions/runs/${ownerId}`
      runs.set(ownerId, { id: ownerId, status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: sourceRevision, createdAt: new Date(start).toISOString(), updatedAt: new Date(end).toISOString() })
      const core = { schemaVersion: 'jenfu.dev012.owner-control-head.v1', inputFingerprint: sha256(canonicalize({ ownerApplicationId: 'ai-pdm', releaseId, sourceRevision, releaseIntentSha256: intentRef.sha256 })), ownerApplicationId: 'ai-pdm', service: 'ai-pdm-prod', controlBucket: bucket, releaseId, sourceRevision, sourceLockSha256: lockRef.sha256, candidateRevision: null, previousRevision: previous, ownerRunRef, leaseExpiresAt: new Date(end).toISOString(), deadlineAt: intent.deadlineAt, state: 'FINALIZED', result: 'PRE_ACTIVATION_ABORTED' }
      h.seed(paths.control, { ...core, controlSha256: sha256(canonicalize(core)) })
      return { intent, intentRef, paths, end }
    }
    const zero = await history('DEV122-B31-MODELED-ZERO', 'a'.repeat(40), '201', rootManifest.capsuleRef, null, 300000)
    const zeroBasis = (await readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: zero.intentRef, verifyProvider: true })).authorityBasis
    const partial = await history('DEV122-B31-MODELED-PARTIAL', 'b'.repeat(40), '202', zero.intentRef, zeroBasis, 200000)
    const archive = h.seedBytes(`gs://${bucket}/source/releases/${partial.intent.releaseId}/${partial.intentRef.sha256}/source.tar.gz`, Buffer.from('model unpublished bytes'))
    const sourceRow = h.store.get(archive.uri), sourceObject = { ...archive, generation: sourceRow.generation, crc32c: sourceRow.crc32c }, image = `${h.appProfile.artifact.uri}@sha256:${'d'.repeat(64)}`
    const storage = { bucket, object: archive.uri.split('/').slice(3).join('/'), generation: sourceRow.generation }
    const build = { name: 'projects/jenfu-platform-prod/locations/asia-east1/builds/11111111-2222-3333-4444-555555555555', id: '11111111-2222-3333-4444-555555555555', projectId: 'jenfu-platform-prod', status: 'SUCCESS', serviceAccount: `projects/jenfu-platform-prod/serviceAccounts/${h.appProfile.identities.builder}`, options: { requestedVerifyOption: 'VERIFIED' }, tags: [partial.intent.releaseId.toLowerCase()], finishTime: new Date(partial.end-1000).toISOString(), source: { storageSource: storage }, sourceProvenance: { resolvedStorageSource: storage }, results: { images: [{ name: `${h.appProfile.artifact.uri}:release-${partial.intent.sourceRevision}`, digest: image.split('@')[1] }] } }
    buildLists.set(`tags=${partial.intent.releaseId.toLowerCase()}`, [build])
    for (const [stage, schema, extra] of [['provenance', 'jenfu.dev012.build-provenance-receipt.v1', { cloudBuild: build, sourceObject, artifactRegistry: { uri: image } }], ['sbom', 'jenfu.dev012.sbom-receipt.v1', { resourceUrl: `https://${image}` }], ['scan', 'jenfu.dev012.scan-receipt.v1', { blockingVulnerabilityCount: 0, maximumAllowedSeverity: h.appProfile.build.maximumAllowedSeverity }]]) h.seed(partial.paths[stage], { schemaVersion: schema, ownerApplicationId: 'ai-pdm', sourceRevision: partial.intent.sourceRevision, artifactDigest: image, status: 'PASS', ...extra })
    const partialBasis = (await readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: partial.intentRef, verifyProvider: true })).authorityBasis
    const o = await h.ownerInput(await h.produce(), { authorityBaselineRef: partial.intentRef })
    for (const stage of ['prepare', 'build']) await o.run(stage)
    h.transport.runMigrationJob = async ({ deployment, outputUri }) => {
      const { receiptSha256: _seal, ...original } = rootObject(rootRefs.migrate)
      const core = { ...original, sourceRevision: b23Revision, manifestSha256: o.intent.migrationManifestSha256, ledgerCount: 33, applied: 1, replayed: 32, executionName: 'ai-pdm-prod-migration-runner-model083', startedAt: clock.now(), completedAt: clock.now() }
      h.seed(outputUri, { ...core, receiptSha256: sha256(canonicalize(core)) })
      currentExecution = { name: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner/executions/'+core.executionName, createTime: new Date(Date.now()-1).toISOString(), completionTime: new Date(Date.now()+1).toISOString(), succeededCount: 1, conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }], template: { containers: [{ name: 'migration', image: deployment.migrationRunnerDigest, args: ['--bundle-ref', deployment.migrationBundleRef.uri, '--bundle-sha256', deployment.migrationBundleRef.sha256, '--source-revision', b23Revision, '--output-ref', outputUri] }] } }
      clock.advance(2)
    }
    for (const stage of ['migrate', 'candidate', 'entrypoint']) await o.run(stage)
    await o.run('rollback')
    const { controlSha256: _seal, ...core } = JSON.parse((await h.transport.readBytes(o.paths.control)).bytes), closed = { ...core, leaseExpiresAt: new Date(Date.now()-1).toISOString() }
    h.seed(o.paths.control, { ...closed, controlSha256: sha256(canonicalize(closed)) })
    const publications = h.publications.length, reads = h.wire.counts.sourceMedia
    await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      const cold = await readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: o.intentRef, verifyProvider: true })
      const warm = await readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: o.intentRef, verifyProvider: true })
      assert.deepEqual(warm, cold); assert.deepEqual(cold.authorityBasis.releasedIntentRef, rootManifest.capsuleRef); assert.deepEqual(cold.authorityBasis.releasedProof, partialBasis.releasedProof); assert.equal(cold.authorityBasis.failedProof.disposition, 'migration_only')
    })
    assert.equal(h.publications.length, publications); assert.equal(h.wire.counts.sourceMedia-reads, 2)
    const originalProof = h.transport.readOwnerSourceProof
    h.transport.readOwnerSourceProof = async input => {
      const observed = await originalProof(input)
      return observed.proof.disposition === 'migration_only' ? { ...observed, proof: { ...observed.proof } } : observed
    }
    await assert.rejects(readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: o.intentRef, verifyProvider: true }), /OBSERVATION_IDENTITY_INVALID/)
    h.transport.readOwnerSourceProof = originalProof
    assert.equal(h.publications.length, publications)
    const next = await h.nextRepair(o, 31, { predecessorBaselineRef: null, baselineIntentRef: rootManifest.capsuleRef, authorityBaselineRef: o.intentRef })
    const prepare = await next.run('prepare'); assert.deepEqual((await next.run('prepare')).ref, prepare.ref)
    assert.deepEqual(prepare.value.facts.preActivationAbortBasis.releasedIntentRef, rootManifest.capsuleRef)
    assert.equal(h.controls.traffic ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.scheduler().state, 'PAUSED'); assert.equal(h.wire.counts.sourceArrayBuffer, 0)
  }))

  test('B23_ROOT_ABORT_COPIED_PROOF_CANNOT_CLAIM_HISTORICAL_AUTHENTICATION', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint']) await o.run(stage)
    await o.run('rollback')
    const row = await h.transport.readBytes(o.paths.control), { controlSha256: _seal, ...core } = JSON.parse(row.bytes)
    const closed = { ...core, leaseExpiresAt: new Date(Date.now() - 1).toISOString() }
    h.seed(o.paths.control, { ...closed, controlSha256: sha256(canonicalize(closed)) })
    const original = h.transport.readOwnerSourceProof, publications = h.publications.length
    h.transport.readOwnerSourceProof = async (...args) => {
      const observed = await original(...args)
      return observed.proof.disposition === 'migration_evidence_only' ? { ...observed, proof: { ...observed.proof } } : observed
    }
    await assert.rejects(readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: o.intentRef, verifyProvider: true }), /OBSERVATION_IDENTITY_INVALID|PREACTIVATION_CONTINUATION_INVALID/u)
    assert.equal(h.publications.length, publications); assert.equal(h.controls.traffic ?? 0, 0); assert.equal(h.controls.runs ?? 0, 0)
  }))
  test('B23_ROOT_ABORT_WRONG_MIGRATION_EVIDENCE_REF_REJECTS_BEFORE_PROVIDER', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), o = await h.ownerInput(await h.produce())
    for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint']) await o.run(stage)
    const terminal = await o.run('rollback'), { receiptSha256: _seal, ...core } = terminal.value
    const changed = { ...core, facts: { ...core.facts, migrationEvidenceRef: rootRefs.migrate } }
    h.seed(o.paths.terminal, { ...changed, receiptSha256: sha256(canonicalize(changed)) })
    const provider = h.wire.counts.provider, publications = h.publications.length
    await assert.rejects(readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: o.intentRef, verifyProvider: true }), /PREACTIVATION_CONTINUATION_INVALID/u)
    assert.equal(h.wire.counts.provider, provider); assert.equal(h.publications.length, publications)
    assert.equal(h.controls.migrationJobs ?? 0, 0); assert.equal(h.controls.traffic ?? 0, 0)
  }))
  test('B23_ROOT_ABORT_RETRY_NEGATIVE_CHAIN_AND_SHARED_ROOT', async () => rootModelClock(async clock => {
    const h = rootConsumerModel(clock), failed = await h.ownerInput(await h.produce())
    for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint']) await failed.run(stage)
    await failed.run('rollback')
    const { controlSha256: _seal, ...initial } = JSON.parse((await h.transport.readBytes(failed.paths.control)).bytes)
    const core = { ...initial, leaseExpiresAt: new Date(Date.now() - 1).toISOString() }
    const control = { ...core, controlSha256: sha256(canonicalize(core)) }; h.seed(failed.paths.control, control)
    const snapshot = new Map(h.store), revisionSnapshot = new Map([...h.revisions].map(([name, value]) => [name, structuredClone(value)])), request = h.transport.request, ownerRun = h.transport.readOwnerRun
    const scoped = async depth => runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
      const walk = async (handle, count) => runAiPdmEvidenceContext(handle, async () => count === depth
        ? readPreActivationAbortContinuation({ profile: h.appProfile, transport: h.transport, baselineIntentRef: failed.intentRef, verifyProvider: true })
        : walk(descendAiPdmEvidenceContext(handle, b23ContextRef(`abort-prefix-${count}`), true), count + 1))
      return walk(createAiPdmEvidenceContext(), 0)
    })
    const media = h.wire.counts.sourceMedia
    assert.equal((await scoped(5)).kind, 'PRINCIPAL_ORDINARY_ABORT', 'failed and released branches share the existing depth-eight root')
    assert.equal(h.wire.counts.sourceMedia - media, 2, 'failed current and released B14 source bytes each authenticated once across both branches')
    await assert.rejects(scoped(6), /GRAPH_DEPTH_INVALID/u)
    const vectors = ['forged_chain', 'missing_chain', 'wrong_failed_ref', 'wrong_released_ref', 'failed_capsule_as_serving', 'lease_drift', 'owner_run_drift', 'control_drift', 'forbidden_later_stage', 'wrong_serving_traffic', 'wrong_serving_image', 'wrong_serving_runtime', 'skipped_anchor', 'cycle']
    for (const [index, vector] of vectors.entries()) {
      h.store.clear(); for (const [uri, row] of snapshot) h.store.set(uri, row)
      h.revisions.clear(); for (const [name, value] of revisionSnapshot) h.revisions.set(name, structuredClone(value))
      h.transport.request = request; h.transport.readOwnerRun = ownerRun; delete h.controls.service
      const value = { ...h.input, receiptId: `B23-MODELED-NEGATIVE-${index}` }
      if (vector === 'forged_chain') h.seed(failed.paths.rollback, { ...JSON.parse(h.store.get(failed.paths.rollback).bytes), receiptSha256: '0'.repeat(64) })
      if (vector === 'missing_chain') h.store.delete(failed.paths.entrypoint)
      if (vector === 'wrong_failed_ref') { const wrong = { ...core, releaseId: capsule.releaseId }; h.seed(failed.paths.control, { ...wrong, controlSha256: sha256(canonicalize(wrong)) }) }
      if (vector === 'wrong_released_ref') { const intent = JSON.parse(h.store.get(failed.intentRef.uri).bytes); h.seed(failed.intentRef.uri, { ...intent, baselineIntentRef: failed.intentRef }) }
      if (vector === 'failed_capsule_as_serving') value.servingCapsuleRef = failed.intentRef
      if (vector === 'lease_drift') { const wrong = { ...core, leaseExpiresAt: new Date(Date.now() + 1).toISOString() }; h.seed(failed.paths.control, { ...wrong, controlSha256: sha256(canonicalize(wrong)) }) }
      if (vector === 'owner_run_drift') h.transport.readOwnerRun = async (...args) => ({ ...await ownerRun(...args), conclusion: 'success' })
      if (vector === 'control_drift') h.seed(failed.paths.control, { ...control, controlSha256: '0'.repeat(64) })
      if (vector === 'forbidden_later_stage') h.seed(failed.paths.activate, { forbidden: 'positive object exists' })
      if (vector === 'wrong_serving_traffic') h.controls.service = { traffic: [{ revision: h.controls.candidateFacts.candidateRevision, percent: 100 }], trafficStatuses: [{ revision: h.controls.candidateFacts.candidateRevision, percent: 100 }] }
      if (['wrong_serving_image', 'wrong_serving_runtime'].includes(vector)) {
        const retained = h.revisions.get(failed.intent.previousRevision), app = retained.containers.find(row => row.name === h.appProfile.runtime.containerName)
        if (vector === 'wrong_serving_image') app.image = `${h.appProfile.artifact.uri}@sha256:${'0'.repeat(64)}`
        else app.env.find(row => row.name === 'PDM_OPENSWX_DISPATCH_ENABLED').value = '0'
      }
      if (vector === 'skipped_anchor') value.predecessorBaselineRef = failed.descriptor.pausedBaselineRef
      const inputRef = h.seed(`gs://jenfu-platform-prod-aipdm-release/receipts/dev-122/openswx-worker/B23-negative-${index}-input.json`, value)
      const publications = h.publications.length, builds = h.controls.appBuilds, actions = h.controls.traffic ?? 0
      if (vector === 'cycle') await runAiPdmEvidenceContext(createAiPdmEvidenceContext(), async () => {
        const ancestor = descendAiPdmEvidenceContext(createAiPdmEvidenceContext(), failed.intentRef, true)
        await runAiPdmEvidenceContext(ancestor, () => assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: h.source }), /GRAPH_CYCLE_OR_HASH_CONFLICT/u))
      })
      else await assert.rejects(executeWorkerArtifactReuse({ transport: h.transport, inputRef, readSource: h.source }), /OPENSWX_|DEV121_|MISSING|REVISION_|RUNTIME_|CANONICAL_/u, vector)
      assert.equal(h.publications.length, publications); assert.equal(h.controls.appBuilds, builds); assert.equal(h.controls.traffic ?? 0, actions); assert.equal(h.controls.runs ?? 0, 0); assert.equal(h.controls.migrationJobs ?? 0, 0)
    }
  }))
}

test('reads immutable protected source lock and migration receipt without granting release status', async () => {
  const proof = await verify()
  assert.equal(proof.disposition, 'migration_only')
  assert.equal(proof.sourceRevision, revision)
  assert.equal(proof.migrationManifestSha256, manifest)
  assert.equal(proof.sourceLock.generation, '7')
  assert.equal(proof.migrate.crc32c.length > 0, true)
  assert.equal(Object.hasOwn(proof, 'terminal'), false)
  assert.match(proof.artifactDigest, /@sha256:[a-f0-9]{64}$/u)
  assert.deepEqual(Object.keys(proof.buildChain).sort(),
    ['build', 'deployment', 'provenance'])
  assert.equal(proof.providerClaim.buildId, buildId)
})

test('accepts the OrgMaster owner migration schema without bootstrap, without weakening count checks', () => {
  const input = fixture()
  const platform = JSON.parse(input.objects.get(input.refs.migrate.uri).toString('utf8'))
  const { ledgerBootstrap } = platform
  const core = { ...platform }
  delete core.ledgerBootstrap
  delete core.receiptSha256
  const orgmaster = sealed({ ...core, ownerApplicationId: 'orgmaster',
    ledger: 'orgmaster_core.schema_migrations', ledgerCount: 27,
    applied: 1, replayed: 26 })
  const orgConfig = { ledger: 'orgmaster_core.schema_migrations',
    migrationBootstrap: false, principalContractLedgerFloor: 27 }
  assert.doesNotThrow(() => assertMigration(orgmaster, 'orgmaster', orgConfig,
    revision, manifest))
  assert.throws(() => assertMigration(sealed({ ...orgmaster,
    replayed: orgmaster.replayed - 1 }), 'orgmaster', orgConfig,
  revision, manifest), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  assert.throws(() => assertMigration(sealed({ ...orgmaster,
    ledgerBootstrap }), 'orgmaster', orgConfig,
  revision, manifest), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  assert.throws(() => assertMigration(orgmaster, 'platform', {
    ledger: 'orgmaster_core.schema_migrations', migrationBootstrap: true,
    principalContractLedgerFloor: 10,
  }, revision, manifest), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
})

test('refuses older ledgers even when a source-bound migration receipt is otherwise valid', async () => {
  await assert.rejects(verify(fixture({ migrationChange: {
    ledgerCount: 9, applied: 0, replayed: 9,
  } })), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  const input = fixture()
  const platform = JSON.parse(input.objects.get(input.refs.migrate.uri).toString('utf8'))
  const { ledgerBootstrap, receiptSha256: _receiptSha256, ...core } = platform
  assert.deepEqual(ledgerBootstrap, { enabled: false, created: false })
  const oldOrg = sealed({ ...core, ownerApplicationId: 'orgmaster',
    ledger: 'orgmaster_core.schema_migrations', ledgerCount: 26,
    applied: 0, replayed: 26 })
  assert.throws(() => assertMigration(oldOrg, 'orgmaster', {
    ledger: 'orgmaster_core.schema_migrations', migrationBootstrap: false,
    principalContractLedgerFloor: 27,
  }, revision, manifest), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  const aiConfig = { ledger: 'ai_pdm_core.schema_migrations',
    migrationBootstrap: true, principalContractLedgerFloor: 20 }
  const aiCurrent = sealed({ ...core, ledgerBootstrap,
    ownerApplicationId: 'ai-pdm', ledger: aiConfig.ledger,
    ledgerCount: 20, applied: 0, replayed: 20 })
  assert.doesNotThrow(() => assertMigration(aiCurrent, 'ai-pdm', aiConfig,
    revision, manifest))
  assert.throws(() => assertMigration(sealed({ ...core, ledgerBootstrap,
    ownerApplicationId: 'ai-pdm', ledger: aiConfig.ledger,
    ledgerCount: 19, applied: 0, replayed: 19 }),
  'ai-pdm', aiConfig, revision, manifest),
  /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
})

test('migration-only build proof fails if its build chain is missing or altered', async () => {
  const missing = fixture()
  missing.objects.delete(`${root}/deployment-capsule.json`)
  await assert.rejects(verify(missing), /MIGRATION_GCS_METADATA_FAILED/u)
  await assert.rejects(verify(fixture({ chainChange: {
    build: { artifactDigest: 'unrelated-image' } } })),
  /DEV121_OWNER_RELEASE_PROOF_STAGE_CHAIN_INVALID/u)
  await assert.rejects(verify(fixture({ provenanceChange: {
    artifactRegistry: { uri: 'unrelated-image' } } })),
  /DEV121_OWNER_RELEASE_PROOF_PROVENANCE_INVALID/u)
})

test('distinguishes a released terminal receipt from migration-only evidence', async () => {
  const proof = await verify(fixture({ includeTerminal: true }))
  assert.equal(proof.disposition, 'released')
  assert.equal(proof.candidateRevision, 'platform-revision-one')
  assert.match(proof.artifactDigest, /@sha256:[a-f0-9]{64}$/u)
  assert.equal(Object.keys(proof.releaseChain).length, 10)
})

test('released status requires the complete hash-linked stage chain', async () => {
  await assert.rejects(verify(fixture({ includeTerminal: true,
    chainChange: { decision: { decision: 'NO_GO' } } })),
  /DEV121_OWNER_RELEASE_PROOF_STAGE_CHAIN_INVALID/u)
  await assert.rejects(verify(fixture({ includeTerminal: true,
    chainChange: { activate: { effectiveRevision: 'other-revision' } } })),
  /DEV121_OWNER_RELEASE_PROOF_STAGE_CHAIN_INVALID/u)
  const missing = fixture({ includeTerminal: true })
  missing.objects.delete(`${root}/canonical.json`)
  await assert.rejects(verify(missing), /MIGRATION_GCS_METADATA_FAILED/u)
})

test('build provenance must bind the source object, builder and registry digest', async () => {
  await assert.rejects(verify(fixture({ includeTerminal: true,
    provenanceChange: { artifactRegistry: { uri: 'wrong' } } })),
  /DEV121_OWNER_RELEASE_PROOF_PROVENANCE_INVALID/u)
  await assert.rejects(verify(fixture({ includeTerminal: true,
    provenanceChange: { cloudBuild: { status: 'SUCCESS' } } })),
  /DEV121_OWNER_RELEASE_PROOF_PROVENANCE_INVALID/u)
})

function providerFetch(proof, { buildChange = {}, imageChange = {}, imageStatus = 200,
  sourceBytes = archivedSource, buildProject = 'jenfu-platform-prod', providerToken = 'provider-readback-token' } = {}) {
  const ai = proof.owner === 'ai-pdm'
  const bucket = ai ? 'jenfu-platform-prod-aipdm-release' : 'jenfu-platform-prod-platform-release'
  const artifactPath = ai ? 'aipdm-release/ai-pdm' : 'platform-release/platform'
  const source = proof.providerClaim.sourceObject
  const digest = proof.artifactDigest.split('@')[1]
  const build = {
    name: `projects/${buildProject}/locations/asia-east1/builds/${buildId}`,
    id: buildId, projectId: 'jenfu-platform-prod', status: 'SUCCESS',
    serviceAccount: `projects/jenfu-platform-prod/serviceAccounts/${ai ? 'aipdm' : 'platform'}-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com`,
    options: { requestedVerifyOption: 'VERIFIED' },
    sourceProvenance: { resolvedStorageSource: { bucket,
      object: source.uri.slice(`gs://${bucket}/`.length),
      generation: source.generation } },
    results: { images: [{ name: `asia-east1-docker.pkg.dev/jenfu-platform-prod/${artifactPath}:release-${revision}`,
      digest }] }, ...buildChange,
  }
  const image = { name: `projects/jenfu-platform-prod/locations/asia-east1/repositories/${ai ? 'aipdm-release' : 'platform-release'}/dockerImages/${ai ? 'ai-pdm' : 'platform'}@${digest}`,
    uri: proof.artifactDigest, ...imageChange }
  return async (url, options) => {
    assert.equal(options.headers.authorization, `Bearer ${url.startsWith('https://storage.googleapis.com/') ? 'provider-readback-token' : providerToken}`)
    if (url.startsWith('https://storage.googleapis.com/storage/v1/')) {
      if (url.includes('alt=media')) return new Response(sourceBytes)
      return new Response(JSON.stringify({ generation: source.generation,
        crc32c: crc32cBase64(sourceBytes) }))
    }
    assert.equal(options.method, 'GET')
    if (url === `https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`) {
      return new Response(JSON.stringify(build))
    }
    if (url.startsWith('https://artifactregistry.googleapis.com/v1/')) {
      return new Response(JSON.stringify(image), { status: imageStatus })
    }
    throw new Error('UNEXPECTED_PROVIDER_URL')
  }
}

test('independent provider readback matches the live build and exact registry digest', async () => {
  const proof = await verify(fixture({ includeTerminal: true }))
  const result = await verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof) })
  assert.equal(result.status, 'BUILD_IMAGE_VERIFIED')
  assert.equal(result.artifactDigest, proof.artifactDigest)
  assert.equal(result.sourceGeneration, proof.providerClaim.sourceObject.generation)
})

test('migration-only image gets provider readback without becoming released', async () => {
  const proof = await verify()
  const result = await verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof) })
  assert.equal(proof.disposition, 'migration_only')
  assert.equal(result.status, 'BUILD_IMAGE_VERIFIED')
  assert.equal(result.artifactDigest, proof.artifactDigest)
})

test('accepts the provider-normalized numeric name only for the exact project', async () => {
  const proof = await verify(fixture({ buildProject: '9536592944' }))
  const result = await verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token',
    fetchImpl: providerFetch(proof, { buildProject: '9536592944' }) })
  assert.equal(result.status, 'BUILD_IMAGE_VERIFIED')
  await assert.rejects(verify(fixture({ buildProject: '9536592945' })),
    /DEV121_OWNER_RELEASE_PROOF_PROVENANCE_INVALID/u)
  await assert.rejects(verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token',
    fetchImpl: providerFetch(proof, { buildProject: '9536592945' }) }),
  /DEV121_OWNER_RELEASE_PROOF_PROVIDER_BUILD_MISMATCH/u)
})

test('provider readback rejects build or image drift and missing provider access', async () => {
  const proof = await verify(fixture({ includeTerminal: true }))
  await assert.rejects(verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof, {
      buildChange: { results: { images: [] } } }) }),
  /DEV121_OWNER_RELEASE_PROOF_PROVIDER_BUILD_MISMATCH/u)
  await assert.rejects(verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof, {
      imageChange: { uri: 'wrong' } }) }),
  /DEV121_OWNER_RELEASE_PROOF_PROVIDER_IMAGE_MISMATCH/u)
  await assert.rejects(verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof, {
      imageStatus: 403 }) }),
  /DEV121_OWNER_RELEASE_PROOF_PROVIDER_READBACK_FAILED/u)
  await assert.rejects(verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof, {
      sourceBytes: Buffer.from('tampered owner source archive') }) }),
  /DEV121_OWNER_RELEASE_PROOF_PROVIDER_SOURCE_MISMATCH/u)
})

test('provider readback rejects malformed claims before any provider request', async () => {
  const proof = await verify(fixture({ includeTerminal: true }))
  let requests = 0
  const fetchImpl = async () => { requests += 1; throw new Error('UNEXPECTED_REQUEST') }
  for (const change of [
    { artifactDigest: null },
    { providerClaim: { ...proof.providerClaim, buildId: 'invalid' } },
    { providerClaim: { ...proof.providerClaim,
      sourceObject: { ...proof.providerClaim.sourceObject, uri: null } } },
  ]) {
    await assert.rejects(verifyOwnerProviderReadback({ proof: { ...proof, ...change },
      token: 'provider-readback-token', fetchImpl }),
    /DEV121_OWNER_RELEASE_PROOF_PROVIDER_INPUT_INVALID/u)
  }
  assert.equal(requests, 0)
})

test('rejects sibling bucket, wrong protected branch, manifest drift and rollback', async () => {
  const sibling = fixture()
  sibling.refs.prepare = { ...sibling.refs.prepare,
    uri: sibling.refs.prepare.uri.replace(bucket, 'jenfu-platform-prod-orgmaster-release') }
  await assert.rejects(verify(sibling), /DEV121_OWNER_RELEASE_PROOF_REF_INVALID/u)
  await assert.rejects(verify(fixture({ sourceLockChange: { branch: 'feature' } })),
    /DEV121_OWNER_RELEASE_PROOF_SOURCE_LOCK_INVALID/u)
  await assert.rejects(verify(fixture({ migrationChange: {
    manifestSha256: '0'.repeat(64) } })), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  await assert.rejects(verify(fixture({ migrationChange: {
    minimumLedgerCount: 11 } })), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  await assert.rejects(verify(fixture({ migrationChange: {
    replayed: 8 } })), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  await assert.rejects(verify(fixture({ includeTerminal: true,
    terminalChange: { result: 'ROLLED_BACK' } })),
    /DEV121_OWNER_RELEASE_PROOF_TERMINAL_INVALID/u)
})

test('rejects object replacement even when its JSON claims the same revision', async () => {
  const input = fixture()
  input.objects.set(input.refs.migrate.uri,
    Buffer.from(`${canonicalize({ schemaVersion: 'forged', sourceRevision: revision })}\n`))
  await assert.rejects(verify(input), /DEV121_OWNER_RELEASE_PROOF_OBJECT_HASH_MISMATCH/u)
})

test('pre-migration reads existing source/build evidence without reading or implying migration', async () => {
  const input=fixture();input.objects.delete(input.refs.migrate.uri);
  const proof=await readOwnerReleaseProof({owner:'platform',sourceRevision:revision,
    refs:{...input.refs,migrate:null},mode:'pre_migration',token:'x'.repeat(25),fetchImpl:input.fetchImpl});
  assert.equal(proof.disposition,'build_only');assert.equal(proof.releaseAuthority,false);
  assert.equal(proof.migrationVerified,false);assert.equal(Object.hasOwn(proof,'migrate'),false);
  assert.equal(Object.hasOwn(proof,'terminal'),false);
  assert.deepEqual(Object.keys(proof.buildChain).sort(),['build','deployment','provenance']);
  assert.equal(proof.sourceLock.generation,'7');
});
test('pre-migration mode cannot smuggle migration or released terminal evidence', async () => {
  for(const input of [fixture(),fixture({includeTerminal:true})]) {
    await assert.rejects(readOwnerReleaseProof({owner:'platform',sourceRevision:revision,
      refs:input.refs,mode:'pre_migration',token:'x'.repeat(25),fetchImpl:input.fetchImpl}),/INPUT_INVALID/u);
  }
});
test('default post-migration mode still rejects a missing migration ref', async () => {
  const input=fixture();
  await assert.rejects(readOwnerReleaseProof({owner:'platform',sourceRevision:revision,
    refs:{...input.refs,migrate:null},token:'x'.repeat(25),fetchImpl:input.fetchImpl}),/REF_INVALID/u);
});
test('pre-migration mode preserves dirty source and build-chain rejection', async () => {
  for(const input of [fixture({sourceLockChange:{clean:false}}),fixture({chainChange:{build:{artifactDigest:'wrong'}}})]) {
    await assert.rejects(readOwnerReleaseProof({owner:'platform',sourceRevision:revision,
      refs:{...input.refs,migrate:null},mode:'pre_migration',token:'x'.repeat(25),fetchImpl:input.fetchImpl}),/SOURCE_LOCK_INVALID|STAGE_CHAIN_INVALID/u);
  }
});
test('unknown proof mode is rejected rather than selecting a weaker default', async () => {
  const input=fixture();
  await assert.rejects(readOwnerReleaseProof({owner:'platform',sourceRevision:revision,
    refs:input.refs,mode:'preview',token:'x'.repeat(25),fetchImpl:input.fetchImpl}),/INPUT_INVALID/u);
});

test('build-only provider readback preserves non-release scope and rejects authority inflation', async () => {
  const input=fixture();
  const proof=await readOwnerReleaseProof({owner:'platform',sourceRevision:revision,
    refs:{...input.refs,migrate:null},mode:'pre_migration',token:'x'.repeat(25),fetchImpl:input.fetchImpl});
  const result=await verifyOwnerProviderReadback({proof,token:'provider-readback-token',fetchImpl:providerFetch(proof)});
  assert.equal(result.status,'BUILD_IMAGE_VERIFIED');assert.equal(result.disposition,'build_only');
  assert.equal(result.releaseAuthority,false);assert.equal(result.migrationVerified,false);
  for(const change of [{releaseAuthority:true},{migrationVerified:true},{migrate:input.refs.migrate},{terminal:null}]) {
    await assert.rejects(verifyOwnerProviderReadback({proof:{...proof,...change},token:'provider-readback-token',fetchImpl:()=>{throw new Error('UNEXPECTED_REQUEST')}}),/PROVIDER_INPUT_INVALID/u);
  }
  await assert.rejects(verifyOwnerProviderReadback({proof,token:'provider-readback-token',fetchImpl:providerFetch(proof,{imageStatus:403})}),/PROVIDER_READBACK_FAILED/u);
});

// All claims below are synthetic; this tests the actual owner observation adapter.
function cleanup34OwnerWire({ lockChange = {}, receiptRefChange = {}, omitReceipt = false,
  bundleRefChange = {}, sourceHashMismatch = false } = {}) {
  const input = cleanup34Fixture(), objects = new Map(), calls = []
  const ownBucket = 'jenfu-platform-prod-aipdm-release'
  const put = (uri, value) => {
    const bytes = Buffer.from(canonicalize(JSON.parse(JSON.stringify(value))) + '\n'); objects.set(uri, bytes)
    return { uri, sha256: sha256(bytes) }
  }
  const operationRef = { uri: `gs://${ownBucket}/source/migration-bundles/dev121/unlinked-profile-cleanup/fixture.json`,
    generation: '7', sha256: '9'.repeat(64) }
  const baseManifest = input.bundle.manifestSha256
  input.bundle.unlinkedProfileCleanupRef = { ...operationRef, ...bundleRefChange }
  cleanup34Reseal(input)
  const archive = gzipSync(cleanup34Tar(input.files)), sourceHash = sha256(archive)
  const sourceLock = put(`gs://${ownBucket}/receipts/fixture-source-lock.json`, {
    schemaVersion: 'jenfu.dev012.owner-source-lock.v1', ownerApplicationId: 'ai-pdm',
    repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main', releaseId,
    sourceRevision: revision, sourceTree: 'd'.repeat(40), sourceSha256: sourceHash,
    migrationManifestSha256: baseManifest, clean: true, remoteRef: 'refs/heads/main',
    remoteRevision: revision, status: 'SOURCE_FROZEN', releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND', observedAt: '2026-09-26T00:00:00.000Z', ...lockChange,
  })
  const intent = {
    schemaVersion: 'jenfu.dev117.ai-pdm-release-intent.v2', ownerApplicationId: 'ai-pdm',
    releaseId, sourceRevision: revision, sourceSha256: sourceHashMismatch ? 'f'.repeat(64) : sourceHash,
    sourceLockRef: sourceLock, authorizationPolicyRef: sourceLock, readinessReceiptRef: sourceLock,
    foundationReceiptRef: sourceLock, infraReceiptRef: sourceLock, runtimeConfigRef: sourceLock,
    migrationManifestSha256: input.bundle.manifestSha256, unlinkedProfileCleanupRef: operationRef,
    previousRevision: 'ai-pdm-prod-aaaaaaaaaaaa', deadlineAt: '2026-09-26T01:00:00.000Z',
  }
  const intentRef = put(`gs://${ownBucket}/receipts/releases/${releaseId}/release-intent.json`, intent)
  const root = `gs://${ownBucket}/receipts/releases/${releaseId}/${intentRef.sha256}`
  const prerequisites = Object.fromEntries(['sourceLock', 'authorization', 'readiness', 'foundation', 'infra', 'runtimeConfig'].map(key => [key, sourceLock]))
  const stage = (name, previousReceiptRef, facts, observedAt) => put(`${root}/${name}.json`, sealed({
    schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'ai-pdm', releaseId,
    sourceRevision: revision, stage: name, previousReceiptRef, facts, observedAt, status: 'PASS',
  }))
  const prepare = stage('prepare', null, { prerequisiteRefs: prerequisites }, '2026-09-26T00:01:00.000Z')
  const artifactDigest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm@sha256:${'1'.repeat(64)}`
  const sourceObject = { uri: `gs://${ownBucket}/source/releases/${releaseId}/${intentRef.sha256}/source.tar.gz`,
    sha256: sourceHash, generation: '7', crc32c: crc32cBase64(archive) }
  objects.set(sourceObject.uri, archive)
  const migrationBundleRef = put(`gs://${ownBucket}/source/migration-bundles/${revision}/${input.bundle.manifestSha256}.json`, input.bundle)
  const provenance = put(`${root}/provenance.json`, {
    schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1', ownerApplicationId: 'ai-pdm',
    sourceRevision: revision, sourceObject, artifactDigest, status: 'PASS',
    cloudBuild: { name: `projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`,
      id: buildId, status: 'SUCCESS', projectId: 'jenfu-platform-prod',
      serviceAccount: 'projects/jenfu-platform-prod/serviceAccounts/aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com',
      options: { requestedVerifyOption: 'VERIFIED' },
      sourceProvenance: { resolvedStorageSource: { bucket: ownBucket,
        object: sourceObject.uri.slice(`gs://${ownBucket}/`.length), generation: '7' } },
      results: { images: [{ name: `${artifactDigest.split('@')[0]}:release-${revision}`, digest: artifactDigest.split('@')[1] }] } },
    artifactRegistry: { uri: artifactDigest },
  })
  const build = stage('build', prepare, { artifactDigest, sourceObject, migrationBundleRef,
    provenanceReceiptRef: provenance }, '2026-09-26T00:02:00.000Z')
  put(`${root}/deployment-capsule.json`, {
    schemaVersion: 'jenfu.dev117.ai-pdm-deployment-capsule.v2', ownerApplicationId: 'ai-pdm',
    sourceRevision: revision, artifactDigest, buildReceiptRef: build, sourceObject, migrationBundleRef,
    releaseIntentRef: intentRef, releaseIntentSha256: intentRef.sha256, deadlineAt: intent.deadlineAt,
  })
  const cleanupReceipt = { operationRef: { ...operationRef, ...receiptRefChange },
    result: { status: 'DELETED', auditId: 'dev121-unlinked-profile-cleanup-v2-' + '8'.repeat(64), priorRowSha256: '7'.repeat(64) } }
  const migrate = put(`${root}/migrate.json`, sealed({
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'ai-pdm',
    sourceRevision: revision, database: 'jenfu_prod', ledger: 'ai_pdm_core.schema_migrations',
    manifestSha256: input.bundle.manifestSha256, baselineCount: input.bundle.baselineCount,
    minimumLedgerCount: input.bundle.baselineCount, ledgerBootstrap: { enabled: false, created: false },
    ledgerCount: 34, applied: 1, replayed: 33,
    crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }],
    boundaryStatus: 'PASS', executionName: 'jobs/migrate/executions/fixture',
    startedAt: '2026-09-26T00:03:00.000Z', completedAt: '2026-09-26T00:04:00.000Z', status: 'PASS',
    ...(omitReceipt ? {} : { unlinkedProfileCleanup: cleanupReceipt }),
  }))
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options?.method ?? 'GET' })
    const match = /\/b\/([^/]+)\/o\/([^?]+)/u.exec(url)
    const uri = match && `gs://${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`
    const bytes = objects.get(uri)
    if (!bytes) return new Response('', { status: 404 })
    if (url.includes('alt=media')) return new Response(bytes)
    return new Response(JSON.stringify({ bucket: ownBucket, name: uri.slice(`gs://${ownBucket}/`.length),
      generation: '7', crc32c: crc32cBase64(bytes), size: String(bytes.length) }))
  }
  const transport = createOwnerTransport({ token: 'synthetic-owner-read-token-only', fetchImpl })
  const read = (pre = false) => transport.readOwnerSourceProof({ profile: input.profile, sourceRevision: revision,
    refs: { prepare, migrate: pre ? null : migrate, terminal: null }, verifyProvider: false })
  return { read, calls, migrate, cleanupReceipt, baseManifest, boundManifest: input.bundle.manifestSha256 }
}

test('DEV121 LOCAL_TEST actual owner transport observes ordinary bound cleanup migration', async () => {
  const wire = cleanup34OwnerWire(), { proof, provider } = await wire.read()
  assert.notEqual(wire.boundManifest, wire.baseManifest)
  assert.equal(proof.disposition, 'migration_only')
  assert.equal(proof.migrationManifestSha256, wire.boundManifest)
  assert.equal(proof.migrate.ref, wire.migrate.uri)
  assert.equal(provider, null)
  assert.equal(Object.hasOwn(proof, 'terminal'), false)
  assert.ok(wire.calls.every(call => call.method === 'GET'))
})
test('DEV121 LOCAL_TEST bound cleanup pre-migration owner observation is build-only with no migration read', async () => {
  const wire = cleanup34OwnerWire(), { proof } = await wire.read(true)
  assert.equal(proof.disposition, 'build_only')
  assert.equal(proof.releaseAuthority, false); assert.equal(proof.migrationVerified, false)
  assert.equal(Object.hasOwn(proof, 'migrate'), false)
  assert.equal(Object.hasOwn(proof, 'terminal'), false)
  assert.ok(!wire.calls.some(call => call.url.includes(encodeURIComponent(wire.migrate.uri.split('/').slice(3).join('/')))))
  assert.ok(wire.calls.every(call => call.method === 'GET'))
})
for (const [name, options, expected] of [
  ['coherently resealed wrong BASE lock', { lockChange: { migrationManifestSha256: 'f'.repeat(64) } }, /SOURCE_LOCK_INVALID/u],
  ['missing BASE lock', { lockChange: { migrationManifestSha256: undefined } }, /SOURCE_LOCK_INVALID/u],
  ['source SHA mismatch', { sourceHashMismatch: true }, /SOURCE_LOCK_INVALID/u],
  ['missing cleanup receipt', { omitReceipt: true }, /UNLINKED_PROFILE_CLEANUP_RECEIPT_INVALID/u],
  ['receipt generation mismatch', { receiptRefChange: { generation: '8' } }, /UNLINKED_PROFILE_CLEANUP_RECEIPT_INVALID/u],
  ['receipt hash mismatch', { receiptRefChange: { sha256: '6'.repeat(64) } }, /UNLINKED_PROFILE_CLEANUP_RECEIPT_INVALID/u],
  ['coherently resealed bundle generation mismatch', { bundleRefChange: { generation: '8' } }, /UNLINKED_PROFILE_CLEANUP_BUNDLE_MISMATCH/u],
]) test('DEV121 actual owner observation rejects ' + name, async () => {
  const wire = cleanup34OwnerWire(options)
  await assert.rejects(wire.read(), expected)
  assert.ok(wire.calls.every(call => call.method === 'GET'))
})
test('DEV121 generic unbound v1 migration proof rejects a coherently sealed cleanup receipt', async () => {
  const cleanup = cleanup34OwnerWire().cleanupReceipt
  const input = fixture({ ai: true, migrationChange: { unlinkedProfileCleanup: cleanup } })
  await assert.rejects(readOwnerReleaseProof({ owner: 'ai-pdm', sourceRevision: revision,
    refs: input.refs, token: 'synthetic-owner-read-token-only', fetchImpl: input.fetchImpl }), /UNLINKED_PROFILE_CLEANUP_RECEIPT_INVALID/u)
})

function rd35Fixture() {
  const profile = JSON.parse(readFileSync(new URL('../config/release/dev117-ai-pdm-independent-production-v3.json', import.meta.url)))
  const n1c = JSON.parse(readFileSync(new URL('../config/platform/dev-010-n1c-ai-pdm.json', import.meta.url)))
  const { bundle } = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), revision)
  const files = new Map([[b23ProfilePath, Buffer.from(canonicalize(profile))],
    ...profile.migrations.entries.map(row => [row.path, readFileSync(new URL('../'+row.path, import.meta.url))])])
  return { profile, bundle, files }
}
test('LOCAL_TEST native35 authenticates exact085 SQL/profile/archive while preserving084 pin', () => {
  const input = rd35Fixture()
  assert.equal(input.bundle.entries[34].path, 'db/postgres/085_dev121_principal_role_catalog_v7.sql')
  assert.equal(input.bundle.entries[34].sourceSha256, '308fad28b4abfe1bc2106b79c1f410fad2cf2f6c2a0b3559517362f4ba6e7cba')
  assertAiPdmMigrationEquivalent(cleanup34Validate(input, true), cleanup34Validate(input))
})
for (const index of [33, 34]) for (const field of ['path', 'version', 'name', 'sourceSha256', 'appliedSha256']) {
  test(`native35 rejects forged ordinal${index+1} ${field} even after reseal`, () => {
    const input = rd35Fixture(); input.bundle.entries[index][field] = field.includes('Sha256') ? '0'.repeat(64) : 'forged'
    assert.throws(() => cleanup34Validate(cleanup34Reseal(input)), /ARCHIVE_BUNDLE_INVALID/u)
  })
}