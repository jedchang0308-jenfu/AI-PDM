import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { contractDigest } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'
import {
  captureDev126LocalResetBaseline,
  readDev126LocalResetBaseline,
  DEV126_LOCAL_RESET_BASELINE_POLICY,
  verifyDev126LocalResetBaseline,
} from './dev126-local-reset-baseline-owner.mjs'

const SANDBOX_ID = 'dev126-reset-baseline-test'
const DATABASE_NAME = 'jenfu_local_dev126_reset_baseline_test'
const GENERATION = '00000000-0000-4000-8000-000000000126'
const FIXTURE_VERSION = 'jenfu.local-principal-fixtures.v1'
const FIXTURE_HASH = 'f'.repeat(64)
const SOURCE_REVISION = '1'.repeat(40)
const AUTHORITY = Object.freeze({
  mode: 'canonical_only',
  expectedCommit: 'local-dev',
  schemaHash: 'c'.repeat(64),
  rowVersion: 3,
  switchedAt: '2026-10-30T00:00:00.000Z',
})
const CONTROL_RELATIONS = DEV126_LOCAL_RESET_BASELINE_POLICY.controlRelations
const POINTER_SOURCES = DEV126_LOCAL_RESET_BASELINE_POLICY.pointerSources
const PDM_OWNER_ROLE = DEV126_LOCAL_RESET_BASELINE_POLICY.ownerRole
const SCOPED_OWNER_LOGIN = 'local_pdm_seed_0123456789abcdef'

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function setup(t) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aipdm-dev126-baseline-'))
  const sandboxRoot = path.join(tempRoot, 'sandbox')
  const dataDirectory = path.join(sandboxRoot, 'data')
  const repositoryDirectory = path.join(sandboxRoot, 'repository')
  const fileBytes = Buffer.from('local business file fixture')
  const storageKey = 'assets/sample.pdf'
  await mkdir(dataDirectory, { recursive: true })
  await mkdir(path.dirname(path.join(repositoryDirectory, storageKey)), { recursive: true })
  await writeFile(path.join(repositoryDirectory, storageKey), fileBytes)

  const environment = {
    NODE_ENV: 'development',
    JENFU_LOCAL_SANDBOX_ENABLED: '1',
    JENFU_LOCAL_SANDBOX_ID: SANDBOX_ID,
    JENFU_LOCAL_SANDBOX_ORIGIN: 'http://127.0.0.1:12000',
    JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://127.0.0.1:12020',
    JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
    JENFU_LOCAL_SANDBOX_DATABASE_URL: `postgresql://local_runtime:fake_local_password@127.0.0.1:5432/${DATABASE_NAME}`,
    JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: 'local_runtime',
    JENFU_LOCAL_SANDBOX_ROOT: sandboxRoot,
    PDM_DATA_DIR: dataDirectory,
    PDM_REPOSITORY_DIR: repositoryDirectory,
  }
  const fingerprintInput = {
    applicationId: 'ai-pdm',
    sandboxId: SANDBOX_ID,
    databaseName: DATABASE_NAME,
    sandboxRoot: path.resolve(sandboxRoot),
    dataDirectory: path.resolve(dataDirectory),
    repositoryDirectory: path.resolve(repositoryDirectory),
    generation: GENERATION,
    fixtureVersion: FIXTURE_VERSION,
    fixtureHash: FIXTURE_HASH,
    nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
  }
  const targetFingerprint = contractDigest(fingerprintInput)
  const targetInput = {
    environment,
    sandboxRoot,
    dataDirectory,
    repositoryDirectory,
    sandboxId: SANDBOX_ID,
    databaseName: DATABASE_NAME,
    expectedTargetFingerprint: targetFingerprint,
    observedTargetFingerprint: targetFingerprint,
    expectedGeneration: GENERATION,
    generation: GENERATION,
    expectedFixtureVersion: FIXTURE_VERSION,
    expectedFixtureHash: FIXTURE_HASH,
    expectedNativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
  }
  const snapshot = {
    snapshotId: '00000003-00000001-1',
    connection: {
      databaseName: DATABASE_NAME,
      currentUser: 'jenfu_ai_pdm_migrator',
      sessionUser: SCOPED_OWNER_LOGIN,
      serverAddress: '127.0.0.1',
      serverPort: 5432,
    },
    targetMetadata: {
      applicationId: 'ai-pdm',
      sandboxId: SANDBOX_ID,
      databaseName: DATABASE_NAME,
      sandboxRoot,
      dataDirectory,
      repositoryDirectory,
      generation: GENERATION,
      fixtureVersion: FIXTURE_VERSION,
      fixtureHash: FIXTURE_HASH,
      nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
      targetFingerprint,
      status: 'ready',
    },
    schemaOwner: PDM_OWNER_ROLE,
    authority: { ...AUTHORITY },
    principalSessionCount: 0,
    principalBindingCount: 0,
    relations: [
      { name: 'companies', kind: 'r', owner: PDM_OWNER_ROLE, rowCount: 1, rowsSha256: 'a'.repeat(64) },
      { name: 'file_assets', kind: 'r', owner: PDM_OWNER_ROLE, rowCount: 1, rowsSha256: 'e'.repeat(64) },
      { name: 'parts', kind: 'r', owner: PDM_OWNER_ROLE, rowCount: 3, rowsSha256: 'b'.repeat(64) },
      ...CONTROL_RELATIONS.map((name) => ({
        name, kind: 'r', owner: PDM_OWNER_ROLE, rowCount: 0, rowsSha256: 'd'.repeat(64),
      })),
    ],
    dataDump: {
      format: 'custom-data-only',
      bytes: Buffer.from('mock native pg_dump custom archive'),
      includedRelations: ['companies', 'file_assets', 'parts'],
    },
    storagePointers: [{
      sourceTable: 'file_assets', sourceId: 'asset-1', provider: 'local_repository',
      key: storageKey, sha256: hash(fileBytes), bytes: fileBytes.byteLength,
    }],
  }
  const owner = {
    async captureAiPdmCoreSnapshot(input) {
      assert.equal(input.scope.schema, 'ai_pdm_core')
      assert.equal(input.scope.dataOnly, true)
      assert.equal(input.scope.consistency, 'single-exported-postgresql-snapshot')
      assert.deepEqual([...input.scope.excludedTableData].sort(), CONTROL_RELATIONS.map((name) => `ai_pdm_core.${name}`).sort())
      assert.deepEqual([...input.scope.pointerSources].sort(), [...POINTER_SOURCES].sort())
      return structuredClone(snapshot)
    },
  }
  const runtimeTargetReader = {
    async readCurrentTarget() {
      return {
        connection: {
          databaseName: DATABASE_NAME,
          currentUser: 'local_runtime',
          sessionUser: 'local_runtime',
          serverAddress: '127.0.0.1',
          serverPort: 5432,
        },
        targetMetadata: structuredClone(snapshot.targetMetadata),
      }
    },
  }
  t.after(async () => {
    const resolvedTemp = await realpath(tempRoot)
    const resolvedOsTemp = await realpath(os.tmpdir())
    assert.equal(path.dirname(resolvedTemp), resolvedOsTemp, 'cleanup stays at the exact mkdtemp child')
    assert.match(path.basename(resolvedTemp), /^aipdm-dev126-baseline-/)
    await rm(resolvedTemp, { recursive: true, force: true })
  })
  return { tempRoot, sandboxRoot, dataDirectory, repositoryDirectory, storageKey, fileBytes,
    targetInput, snapshot, owner, runtimeTargetReader }
}

function capture(input, overrides = {}) {
  return captureDev126LocalResetBaseline({
    targetInput: input.targetInput,
    runtimeTargetReader: input.runtimeTargetReader,
    baselineId: 'dev126-initial',
    sourceRevision: SOURCE_REVISION,
    owner: input.owner,
    capturedAt: '2026-10-30T03:00:00.000Z',
    ...overrides,
  })
}

test('captures, verifies, and reuses an immutable semantic snapshot under sandbox control', async (t) => {
  const input = await setup(t)
  const first = await capture(input)
  assert.equal(first.reused, false)
  assert.equal(first.directory, path.join(input.sandboxRoot, 'control', 'dev126-reset-baselines', 'dev126-initial'))
  assert.equal(first.generation, GENERATION)
  assert.equal(first.targetFingerprint, input.snapshot.targetMetadata.targetFingerprint)
  assert.equal(first.sourceRevision, SOURCE_REVISION)

  const manifestPath = path.join(first.directory, 'manifest.json')
  const initialManifest = await readFile(manifestPath, 'utf8')
  const storedManifest = JSON.parse(initialManifest)
  assert.equal(storedManifest.database.schema, 'ai_pdm_core')
  assert.equal(storedManifest.databaseDump.file, 'ai-pdm-core.data.dump')
  assert.deepEqual(storedManifest.database.excludedRelations, CONTROL_RELATIONS)
  assert.deepEqual(storedManifest.database.includedRelations, ['companies', 'file_assets', 'parts'])
  assert.equal(storedManifest.database.ownerConnection.currentUser, PDM_OWNER_ROLE)
  assert.equal(storedManifest.database.ownerConnection.sessionUser, SCOPED_OWNER_LOGIN)
  assert.match(storedManifest.database.ownerConnection.sessionUser, /^local_pdm_seed_[a-f0-9]{16}$/u)
  assert.equal(storedManifest.database.runtimeTargetObservation.connection.currentUser, 'local_runtime')
  assert.notEqual(storedManifest.database.ownerConnection.currentUser,
    storedManifest.database.runtimeTargetObservation.connection.currentUser)
  assert.deepEqual(storedManifest.repository.pointers.map(({ sourceTable, sourceId, key }) => ({ sourceTable, sourceId, key })), [
    { sourceTable: 'file_assets', sourceId: 'asset-1', key: input.storageKey },
  ])
  assert.equal(storedManifest.database.connectionString, undefined)

  input.snapshot.dataDump.bytes = Buffer.from('different archive header, identical source rows')
  const reused = await capture(input)
  assert.equal(reused.reused, true)
  assert.equal(await readFile(manifestPath, 'utf8'), initialManifest)
  const verified = await verifyDev126LocalResetBaseline({
    targetInput: input.targetInput,
    runtimeTargetReader: input.runtimeTargetReader,
    baselineId: 'dev126-initial',
    sourceRevision: SOURCE_REVISION,
    owner: input.owner,
  })
  assert.equal(verified.stateDigest, first.stateDigest)
  assert.equal(verified.reused, true)
  assert.deepEqual(await (await import('node:fs/promises')).readdir(input.dataDirectory), [])
  assert.equal(await readFile(path.join(input.repositoryDirectory, input.storageKey), 'utf8'), input.fileBytes.toString())
})

test('refuses changed source or row inventory without replacing the first artifact', async (t) => {
  const input = await setup(t)
  const first = await capture(input)
  const manifestPath = path.join(first.directory, 'manifest.json')
  const original = await readFile(manifestPath, 'utf8')
  await assert.rejects(capture(input, { sourceRevision: '2'.repeat(40) }), { code: 'dev126_reset_baseline_conflict' })
  input.snapshot.relations.find((relation) => relation.name === 'parts').rowsSha256 = 'e'.repeat(64)
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_conflict' })
  assert.equal(await readFile(manifestPath, 'utf8'), original)
})

test('preserves the native DEV-090 schema identity without treating it as a SHA-256', async (t) => {
  const input = await setup(t)
  input.snapshot.authority.schemaHash = 'dev090-v1'
  const baseline = await capture(input)
  const artifact = await readDev126LocalResetBaseline({ targetInput: input.targetInput,
    baselineId: baseline.baselineId, expectedManifestSha256: baseline.manifestSha256 })
  assert.equal(artifact.manifest.database.authority.schemaHash, 'dev090-v1')
})

test('reads a pinned baseline independently of subsequent business changes and rejects a substituted descriptor', async (t) => {
  const input = await setup(t)
  const first = await capture(input)
  input.snapshot.relations.find(relation => relation.name === 'parts').rowsSha256 = 'e'.repeat(64)
  const baseline = await readDev126LocalResetBaseline({ targetInput: input.targetInput,
    baselineId: first.baselineId, expectedManifestSha256: first.manifestSha256 })
  assert.equal(baseline.manifestSha256, first.manifestSha256)
  assert.equal(baseline.manifest.database.schema, 'ai_pdm_core')
  assert.equal(baseline.dataDumpPath, path.join(first.directory, 'ai-pdm-core.data.dump'))
  await assert.rejects(readDev126LocalResetBaseline({ targetInput: input.targetInput,
    baselineId: first.baselineId, expectedManifestSha256: '0'.repeat(64) }),
    { code: 'dev126_reset_baseline_corrupt' })
})

test('rejects leaked control-table data and foreign relation owners', async (t) => {
  const input = await setup(t)
  input.snapshot.dataDump.includedRelations.push('principal_session_records')
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_unavailable' })

  input.snapshot.dataDump.includedRelations = ['companies', 'file_assets', 'parts']
  input.snapshot.relations.find((relation) => relation.name === 'parts').owner = 'another_app_owner'
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_unavailable' })
})

test('rejects fixture/profile or actual database target drift', async (t) => {
  const input = await setup(t)
  const wrongProfile = {
    ...input.targetInput,
    expectedFixtureHash: '9'.repeat(64),
  }
  await assert.rejects(captureDev126LocalResetBaseline({
    targetInput: wrongProfile, runtimeTargetReader: input.runtimeTargetReader,
    baselineId: 'dev126-initial', sourceRevision: SOURCE_REVISION, owner: input.owner,
  }), { code: 'dev126_reset_baseline_target_mismatch' })
  input.snapshot.connection.currentUser = 'postgres'
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_target_mismatch' })
})

test('rejects unscoped owner login provenance in live snapshot and stored manifest', async (t) => {
  const input = await setup(t)
  input.snapshot.connection.sessionUser = PDM_OWNER_ROLE
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_target_mismatch' })

  input.snapshot.connection.sessionUser = SCOPED_OWNER_LOGIN
  const captured = await capture(input)
  const manifestPath = path.join(captured.directory, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.database.ownerConnection.sessionUser = 'jenfu_ai_pdm_migrator'
  manifest.stateDigest = contractDigest({
    formatVersion: manifest.formatVersion,
    baselineId: manifest.baselineId,
    sourceRevision: manifest.sourceRevision,
    target: manifest.target,
    database: manifest.database,
    repository: { pointers: manifest.repository.pointers, objects: manifest.repository.objects },
  })
  await writeFile(manifestPath, JSON.stringify(manifest))
  await assert.rejects(verifyDev126LocalResetBaseline({
    targetInput: input.targetInput,
    runtimeTargetReader: input.runtimeTargetReader,
    baselineId: 'dev126-initial',
    sourceRevision: SOURCE_REVISION,
    owner: input.owner,
  }), { code: 'dev126_reset_baseline_corrupt' })
})

test('requires the configured loopback endpoint and empty local principal registries', async (t) => {
  const input = await setup(t)
  input.snapshot.connection.serverAddress = '::1'
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_target_mismatch' })

  input.snapshot.connection.serverAddress = '127.0.0.1'
  input.snapshot.principalSessionCount = 1
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_target_mismatch' })

  input.snapshot.principalSessionCount = 0
  input.snapshot.principalBindingCount = 1
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_target_mismatch' })
})

test('rejects mismatched, missing, external, or unreferenced repository objects', async (t) => {
  const input = await setup(t)
  input.snapshot.storagePointers[0].sha256 = '9'.repeat(64)
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_repository_invalid' })

  input.snapshot.storagePointers[0].sha256 = hash(input.fileBytes)
  input.snapshot.storagePointers[0].provider = 'google_cloud_storage'
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_repository_invalid' })

  input.snapshot.storagePointers[0].provider = 'local_repository'
  await writeFile(path.join(input.repositoryDirectory, 'unowned.bin'), 'unknown repository file')
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_repository_invalid' })
})

test('rejects linked repository entries', async (t) => {
  const input = await setup(t)
  const outside = path.join(input.tempRoot, 'outside.bin')
  const linked = path.join(input.repositoryDirectory, 'linked.bin')
  await writeFile(outside, 'outside')
  try {
    await symlink(outside, linked, 'file')
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip(`symlink creation unavailable: ${error.code}`)
      return
    }
    throw error
  }
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_repository_invalid' })
})

test('verifies the stored archive and rejects tampering or an untracked artifact file', async (t) => {
  const input = await setup(t)
  const first = await capture(input)
  const dumpPath = path.join(first.directory, 'ai-pdm-core.data.dump')
  await writeFile(dumpPath, 'tampered')
  await assert.rejects(verifyDev126LocalResetBaseline({
    targetInput: input.targetInput, runtimeTargetReader: input.runtimeTargetReader,
    baselineId: 'dev126-initial', sourceRevision: SOURCE_REVISION, owner: input.owner,
  }), { code: 'dev126_reset_baseline_corrupt' })

  await writeFile(dumpPath, Buffer.from('mock native pg_dump custom archive'))
  await writeFile(path.join(first.directory, 'unknown.txt'), 'untracked')
  await assert.rejects(verifyDev126LocalResetBaseline({
    targetInput: input.targetInput, runtimeTargetReader: input.runtimeTargetReader,
    baselineId: 'dev126-initial', sourceRevision: SOURCE_REVISION, owner: input.owner,
  }), { code: 'dev126_reset_baseline_corrupt' })
})

test('does not create a baseline when data-bearing relations or required control inventory are missing', async (t) => {
  const input = await setup(t)
  input.snapshot.relations = input.snapshot.relations.filter((relation) => relation.name !== CONTROL_RELATIONS[0])
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_unavailable' })
  const storeRoot = path.join(input.sandboxRoot, 'control', 'dev126-reset-baselines')
  await assert.rejects(readFile(path.join(storeRoot, 'dev126-initial', 'manifest.json')))
})

test('rejects a pre-existing non-directory control path without touching it', async (t) => {
  const input = await setup(t)
  const controlPath = path.join(input.sandboxRoot, 'control')
  await writeFile(controlPath, 'owned by caller')
  await assert.rejects(capture(input), { code: 'dev126_reset_baseline_path_invalid' })
  assert.equal(await readFile(controlPath, 'utf8'), 'owned by caller')
})
