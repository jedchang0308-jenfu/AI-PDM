import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { contractDigest, LocalSandboxError } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'
import { createDev126LocalResetRestoreOwner, DEV126_LOCAL_RESET_RESTORE_OWNER_POLICY as policy } from './dev126-local-reset-restore-owner.mjs'

const sourceGeneration = '00000000-0000-4000-8000-000000000126'
const nextGeneration = '00000000-0000-4000-8000-000000000127'
const followingGeneration = '00000000-0000-4000-8000-000000000128'
const sandboxId = 'dev126-restore'
const resetId = '00000000-0000-4000-8000-000000000999'
const ownerRole = policy.ownerRole
const scopedLogin = 'local_pdm_seed_0123456789abcdef'
const runtimeRole = 'jenfu_ai_pdm_runtime'
const emptyHash = createHash('sha256').digest('hex')
const authorityHash = 'e'.repeat(64)
const authority = { mode: 'canonical_only', expectedCommit: 'local-dev', schemaHash: 'dev090-v1',
  rowVersion: 3, switchedAt: '2026-10-29T00:00:00.000Z' }
const preservedControlNames = ['local_native_bootstrap_receipts', 'pdm_workbench_state_authority_control', 'schema_migrations']

function fingerprint(target, generation) {
  return contractDigest({
    applicationId: 'ai-pdm', sandboxId, databaseName: target.databaseName,
    sandboxRoot: path.resolve(target.sandboxRoot), dataDirectory: path.resolve(target.dataDirectory),
    repositoryDirectory: path.resolve(target.repositoryDirectory), generation,
    fixtureVersion: target.expectedFixtureVersion, fixtureHash: target.expectedFixtureHash,
    nativeSessionContractVersion: target.expectedNativeSessionContractVersion,
  })
}

function fence(scope, overrides = {}) {
  return {
    sandboxId: scope.sandboxId, resetId: scope.resetId, sourceGeneration: scope.sourceGeneration,
    generation: scope.generation, status: 'resetting', sessionsRevoked: true, registryRetained: true,
    applicationsOffline: true,
    ...overrides,
  }
}

function makeHarness(t, { onlineApp = null, psqlCode = 0, applyPsql = true, malformedToc = false } = {}) {
  const scope = Object.freeze({ sandboxId, resetId, sourceGeneration, generation: nextGeneration,
    baseline: Object.freeze({ id: 'base-dev126', sha256: 'a'.repeat(64) }) })
  const environment = {
    NODE_ENV: 'development', JENFU_LOCAL_SANDBOX_ENABLED: '1', JENFU_LOCAL_SANDBOX_ID: sandboxId,
    JENFU_LOCAL_SANDBOX_ORIGIN: 'http://127.0.0.1:12000',
    JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://127.0.0.1:12020',
    JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
    JENFU_LOCAL_SANDBOX_DATABASE_URL: `postgresql://${runtimeRole}:runtime-fake@127.0.0.1:5432/jenfu_local_${sandboxId.replaceAll('-', '_')}`,
    JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: runtimeRole,
    JENFU_LOCAL_SANDBOX_ROOT: '', PDM_DATA_DIR: '', PDM_REPOSITORY_DIR: '',
    PGUSER: scopedLogin, PGPASSWORD: 'local-test-only',
  }

  return { scope, environment, onlineApp, psqlCode, applyPsql, malformedToc }
}

async function prepareHarness(t, options = {}) {
  const harness = makeHarness(t, options)
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), 'dev126-restore-test-'))
  t.after(async () => rm(sandboxRoot, { recursive: true, force: true }))
  const dataDirectory = path.join(sandboxRoot, 'data')
  const repositoryDirectory = path.join(sandboxRoot, 'repository')
  const baselineDirectory = path.join(sandboxRoot, 'control', 'dev126-reset-baselines', 'base-dev126')
  const objectsDirectory = path.join(baselineDirectory, 'objects')
  await Promise.all([mkdir(dataDirectory), mkdir(repositoryDirectory), mkdir(objectsDirectory, { recursive: true })])
  if (options.repositoryObject) {
    await writeFile(path.join(repositoryDirectory, 'later-file.bin'), Buffer.from('newer-than-baseline'))
  }
  harness.environment.JENFU_LOCAL_SANDBOX_ROOT = sandboxRoot
  harness.environment.PDM_DATA_DIR = dataDirectory
  harness.environment.PDM_REPOSITORY_DIR = repositoryDirectory
  const targetInput = {
    environment: harness.environment, sandboxRoot, dataDirectory, repositoryDirectory, sandboxId,
    databaseName: `jenfu_local_${sandboxId.replaceAll('-', '_')}`,
    expectedTargetFingerprint: '', observedTargetFingerprint: '',
    expectedGeneration: sourceGeneration, generation: sourceGeneration,
    expectedFixtureVersion: 'fixture.v2', expectedFixtureHash: 'c'.repeat(64),
    expectedNativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
  }
  targetInput.expectedTargetFingerprint = fingerprint(targetInput, sourceGeneration)
  targetInput.observedTargetFingerprint = targetInput.expectedTargetFingerprint
  Object.freeze(targetInput)
  const includedRelations = Array.from({ length: policy.businessRelationCount }, (_, index) => `business_${String(index + 1).padStart(3, '0')}`)
  includedRelations[0] = 'users'
  includedRelations[1] = 'principal_accounts'
  includedRelations[2] = 'file_assets'
  includedRelations[3] = 'file_derivatives'
  includedRelations[4] = 'release_packages'
  includedRelations[5] = 'submission_files'
  const relationNames = [...includedRelations, ...policy.controlRelations].sort()
  const repositoryObject = options.repositoryObject
    ? { key: options.repositoryObject.key, bytes: Buffer.from(options.repositoryObject.content) }
    : null
  const objectSha256 = repositoryObject ? createHash('sha256').update(repositoryObject.bytes).digest('hex') : null
  if (repositoryObject) await writeFile(path.join(objectsDirectory, objectSha256), repositoryObject.bytes, { mode: 0o600 })
  const relations = relationNames.map(name => ({ name, kind: 'r', owner: ownerRole,
    rowCount: repositoryObject && name === 'file_assets' ? 1 : name === 'pdm_workbench_state_authority_control' ? 1 : 0,
    rowsSha256: repositoryObject && name === 'file_assets' ? 'd'.repeat(64) :
      name === 'pdm_workbench_state_authority_control' ? authorityHash : emptyHash }))
  const archive = Buffer.from('test-only custom archive placeholder')
  const archivePath = path.join(baselineDirectory, 'ai-pdm-core.data.dump')
  await writeFile(archivePath, archive, { mode: 0o600 })
  const manifest = {
    formatVersion: 'dev126.local-reset-baseline.v1', baselineId: harness.scope.baseline.id,
    target: { applicationId: 'ai-pdm', sandboxId, databaseName: targetInput.databaseName,
      sandboxRoot, dataDirectory, repositoryDirectory, generation: sourceGeneration,
      targetFingerprint: targetInput.expectedTargetFingerprint, fixtureVersion: targetInput.expectedFixtureVersion,
      fixtureHash: targetInput.expectedFixtureHash, nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2' },
    database: { schema: 'ai_pdm_core', schemaOwner: ownerRole, dumpFormat: 'custom-data-only',
      authority, principalSessionCount: 0, principalBindingCount: 0,
      ownerConnection: { sessionUser: scopedLogin }, relations,
      includedRelations: [...includedRelations].sort(), excludedRelations: [...policy.controlRelations].sort() },
    repository: { pointers: repositoryObject ? [{ sourceTable: 'file_assets', sourceId: 'asset-1',
      provider: 'local_repository', key: repositoryObject.key, sha256: objectSha256, bytes: repositoryObject.bytes.byteLength }] : [],
    objects: repositoryObject ? [{ key: repositoryObject.key, sha256: objectSha256, bytes: repositoryObject.bytes.byteLength }] : [],
    contentObjects: repositoryObject ? [objectSha256] : [] },
    databaseDump: { file: 'ai-pdm-core.data.dump', format: 'custom-data-only',
      sha256: createHash('sha256').update(archive).digest('hex'), bytes: archive.byteLength },
  }
  const descriptor = { baselineId: harness.scope.baseline.id, manifestSha256: harness.scope.baseline.sha256,
    generation: sourceGeneration, directory: baselineDirectory, dataDumpPath: archivePath,
    objectsDirectory, manifest }

  const sequences = [{ name: 'business_001_id_seq', owner: ownerRole, ownedTable: 'users' }]
  const sourceMarker = `${policy.markerPrefix}${sandboxId}:${nextGeneration}`
  const sourceState = {
    identity: { databaseName: targetInput.databaseName, currentUser: ownerRole, sessionUser: scopedLogin,
      serverAddress: '127.0.0.1', serverPort: 5432 },
    roles: {
      scopedLogin: { name: scopedLogin, canLogin: true, isSuperuser: false, canCreateDb: false,
        canCreateRole: false, bypassRls: false, memberOfOwner: true },
      owner: { name: ownerRole, canLogin: false, isSuperuser: false, canCreateDb: false,
        canCreateRole: false, bypassRls: false, memberOfOwner: true },
      runtime: { name: runtimeRole, canLogin: true, isSuperuser: false, canCreateDb: false,
        canCreateRole: false, bypassRls: false, memberOfOwner: false },
    },
    schemaOwner: ownerRole, databaseOwner: 'postgres', databaseMarker: sourceMarker, authority,
    targetMetadata: { applicationId: 'ai-pdm', sandboxId, databaseName: targetInput.databaseName,
      sandboxRoot, dataDirectory, repositoryDirectory, generation: sourceGeneration,
      fixtureVersion: targetInput.expectedFixtureVersion, fixtureHash: targetInput.expectedFixtureHash,
      nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2', targetFingerprint: targetInput.expectedTargetFingerprint,
      status: 'ready' },
    relations: relations.map(({ name, kind, owner }) => ({ name, kind, owner })), sequences,
    principalSessionCount: 2,
    sourceBindings: [{ status: 'central_registered', centralCorrelationId: 'corr-1',
      centralRegistrationObservedAt: '2026-10-29T00:00:00.000Z' }],
  }
  let currentState = structuredClone(sourceState)
  const business = includedRelations.map(name => {
    const relation = relations.find(item => item.name === name)
    return { name, rowCount: relation.rowCount, rowsSha256: relation.rowsSha256 }
  })
  const preservedControls = preservedControlNames.map(name => {
    const relation = relations.find(item => item.name === name)
    return { name, rowCount: relation.rowCount, rowsSha256: relation.rowsSha256 }
  })
  const databaseCalls = []
  const database = {
    async inspect() { databaseCalls.push('inspect'); return structuredClone(currentState) },
    async markMaintenance() {
      databaseCalls.push('markMaintenance')
      currentState = { ...currentState, targetMetadata: { ...currentState.targetMetadata, status: 'maintenance' } }
      return { changed: true }
    },
    async readBusiness() {
      databaseCalls.push('readBusiness')
      return { state: structuredClone(currentState), business, preservedControls }
    },
    async rebind(loaded) {
      databaseCalls.push('rebind')
      currentState = { ...currentState, targetMetadata: { ...currentState.targetMetadata,
        generation: loaded.scope.generation,
        targetFingerprint: fingerprint(targetInput, loaded.scope.generation), status: 'ready' } }
      return { rebound: true }
    },
  }
  const platformCalls = []
  const platformFence = { async readResetFence({ scope }) {
    platformCalls.push(scope.resetId)
    return fence(scope, { applicationsOffline: !options.onlineApp })
  } }
  const spawns = []
  const spawn = (executable, args, spawnOptions) => {
    spawns.push({ executable, args: [...args], options: spawnOptions })
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => {}
    setImmediate(async () => {
      if (args.includes('--list')) {
        const toc = harness.malformedToc ? '1; 0 0 TABLE DATA public users postgres\n' :
          [...includedRelations.map((name, index) => `${index + 1}; 0 0 TABLE DATA ai_pdm_core ${name} ${ownerRole}`),
            `${includedRelations.length + 1}; 0 0 SEQUENCE SET ai_pdm_core business_001_id_seq ${ownerRole}`].join('\n')
        child.stdout.end(toc)
        child.stderr.end()
        child.emit('close', 0)
        return
      }
      const outputArg = args.find(arg => arg.startsWith('--file='))
      if (outputArg) {
        const copySql = includedRelations.map(name => `COPY ai_pdm_core.${name} (id) FROM stdin;\n\\.\n`).join('\n')
        await writeFile(outputArg.slice('--file='.length),
          `SET statement_timeout = 0;\nSET client_encoding = 'UTF8';\n${copySql}SELECT pg_catalog.setval('ai_pdm_core.business_001_id_seq', 1, false);\n`,
          { mode: 0o600 })
        child.stdout.end()
        child.stderr.end()
        child.emit('close', 0)
        return
      }
      if (executable.toLowerCase().startsWith('psql')) {
        const transactionFile = args[args.indexOf('--file') + 1]
        const sql = await readFile(transactionFile, 'utf8')
        assert.match(sql, /TRUNCATE TABLE[\s\S]+RESTRICT;/u)
        assert.match(sql, /SET LOCAL ROLE jenfu_ai_pdm_migrator;/u)
        assert.match(sql, /DISABLE TRIGGER USER;/u)
        assert.match(sql, /ENABLE TRIGGER USER;/u)
        assert.doesNotMatch(sql, /CASCADE|COMMENT ON DATABASE/u)
        assert.match(sql, /status = 'revoked'/u)
        assert.match(sql, /status='maintenance'/u)
        assert.equal((sql.match(/DISABLE TRIGGER USER;/gu) ?? []).length, policy.businessRelationCount)
        assert.equal((sql.match(/ENABLE TRIGGER USER;/gu) ?? []).length, policy.businessRelationCount)
        if (harness.applyPsql) {
          currentState = { ...currentState, principalSessionCount: 0,
            sourceBindings: currentState.sourceBindings.map(binding => ({ ...binding, status: 'revoked' })),
            targetMetadata: { ...currentState.targetMetadata, status: 'maintenance' } }
        }
        child.stdout.end()
        child.stderr.end()
        child.emit('close', harness.psqlCode)
        return
      }
      child.stderr.end()
      child.emit('close', 1)
    })
    return child
  }
  const owner = createDev126LocalResetRestoreOwner({ environment: harness.environment,
    baselineReader: async () => descriptor, platformFence, database, spawn })
  return { ...harness, targetInput, manifest, descriptor, owner, databaseCalls, platformCalls, spawns,
    currentState: () => structuredClone(currentState), setState: value => { currentState = value } }
}

test('restores the pinned business set atomically, then rebinds PDM metadata to the Platform generation', async t => {
  const h = await prepareHarness(t)
  const result = await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(result.restored, true)
  assert.equal(result.recoveredAfterUnknown, false)
  assert.equal(h.currentState().targetMetadata.status, 'maintenance')
  assert.equal(h.currentState().databaseMarker, `${policy.markerPrefix}${sandboxId}:${nextGeneration}`)
  const psql = h.spawns.find(item => item.executable.toLowerCase().startsWith('psql'))
  assert.ok(psql.args.includes('--single-transaction'))
  assert.ok(psql.args.includes('--set') && psql.args.includes('ON_ERROR_STOP=on'))
  assert.equal(h.platformCalls.length, 4)

  const readback = await h.owner.readBusinessRestore({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(readback.restored, true)
  assert.equal(readback.principalSessionCount, 0)
  assert.equal(readback.sourceBindingsRevoked, true)

  const rebound = await h.owner.rebindAndFenceSessions({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(rebound.ready, true)
  assert.equal(rebound.generation, nextGeneration)
  assert.equal(h.currentState().databaseMarker, `${policy.markerPrefix}${sandboxId}:${nextGeneration}`)
  assert.equal(h.spawns.some(item => item.args.some(arg => /COMMENT ON DATABASE/u.test(arg))), false)

  const readiness = await h.owner.readiness({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(readiness.ready, true)
  assert.equal(readiness.applicationsOffline, true)
})

test('reuses the immutable capture baseline for a later source generation', async t => {
  const h = await prepareHarness(t)
  await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  await h.owner.rebindAndFenceSessions({ targetInput: h.targetInput, scope: h.scope })

  const secondScope = Object.freeze({ sandboxId, resetId: '00000000-0000-4000-8000-000000000998',
    sourceGeneration: nextGeneration, generation: followingGeneration, baseline: h.scope.baseline })
  h.setState({ ...h.currentState(), databaseMarker: `${policy.markerPrefix}${sandboxId}:${followingGeneration}` })

  const result = await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: secondScope })
  assert.equal(result.restored, true)
  assert.equal(result.sourceGeneration, nextGeneration)
  assert.equal(result.generation, followingGeneration)
  assert.equal(h.currentState().targetMetadata.generation, nextGeneration)
  assert.equal(h.currentState().databaseMarker, `${policy.markerPrefix}${sandboxId}:${followingGeneration}`)

  const readback = await h.owner.readBusinessRestore({ targetInput: h.targetInput, scope: secondScope })
  assert.equal(readback.restored, true)
  const rebound = await h.owner.rebindAndFenceSessions({ targetInput: h.targetInput, scope: secondScope })
  assert.equal(rebound.ready, true)
  assert.equal(rebound.generation, followingGeneration)
  assert.equal(h.currentState().targetMetadata.targetFingerprint, fingerprint(h.targetInput, followingGeneration))
  assert.equal((await h.owner.readiness({ targetInput: h.targetInput, scope: secondScope })).ready, true)
})

test('an online application blocks the restore before database inspection or subprocesses', async t => {
  const h = await prepareHarness(t, { onlineApp: 'orgmaster' })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_generation_fence_invalid')
  assert.deepEqual(h.databaseCalls, [])
  assert.deepEqual(h.spawns, [])
})

test('restores the pinned repository objects and removes post-baseline files before readiness', async t => {
  const h = await prepareHarness(t, { repositoryObject: { key: 'documents/drawing.bin', content: 'pinned bytes' } })
  const result = await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(result.restored, true)
  assert.equal(await readFile(path.join(h.targetInput.repositoryDirectory, 'documents', 'drawing.bin'), 'utf8'), 'pinned bytes')
  await assert.rejects(readFile(path.join(h.targetInput.repositoryDirectory, 'later-file.bin')))
  const readback = await h.owner.readBusinessRestore({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(readback.restored, true)
  assert.equal(readback.repositoryRestored, true)
})

test('rejects an archive TOC entry outside the fixed PDM business inventory before rendering or writing', async t => {
  const h = await prepareHarness(t, { malformedToc: true })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_archive_toc_closed_set_violation')
  assert.equal(h.spawns.length, 1)
  assert.equal(h.databaseCalls.includes('markMaintenance'), false)
})

test('does not replay an uncertain psql commit and requires readback first', async t => {
  const h = await prepareHarness(t, { psqlCode: 1, applyPsql: false })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_commit_outcome_unknown')
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
  assert.equal(h.databaseCalls.filter(call => call === 'readBusiness').length, 1)
  assert.equal(h.currentState().targetMetadata.status, 'maintenance')
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_maintenance_resume_requires_readback')
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
})

test('accepts a nonzero psql exit only when fresh readback proves the complete reset state', async t => {
  const h = await prepareHarness(t, { psqlCode: 1, applyPsql: true })
  const result = await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(result.restored, true)
  assert.equal(result.recoveredAfterUnknown, true)
  assert.equal(h.currentState().principalSessionCount, 0)
  assert.equal(h.currentState().sourceBindings[0].status, 'revoked')
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
})

test('refuses to revoke a pending Central binding without a legitimate registration receipt', async t => {
  const h = await prepareHarness(t)
  h.setState({ ...h.currentState(), sourceBindings: [{ status: 'pending_central_registration',
    centralCorrelationId: null, centralRegistrationObservedAt: null }] })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_precondition_failed')
  assert.deepEqual(h.spawns, [])
})
