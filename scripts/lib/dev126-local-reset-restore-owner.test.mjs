import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises'
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
const pg18RestoreHeader = await readFile(new URL('./dev126-pg18-restore-header.fixture.sql', import.meta.url), 'utf8')
const pg18RestrictKey = pg18RestoreHeader.match(/^\\restrict ([A-Za-z0-9_-]+)$/mu)?.[1]
assert.ok(pg18RestrictKey)

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

function makeHarness(t, { onlineApp = null, psqlCode = 0, applyPsql = true, malformedToc = false,
  restoreSqlHeader = pg18RestoreHeader, restoreFooterKey = pg18RestrictKey, restoreHeaderExtra = '', copyRowData = '',
  psqlCodeSequence = null, psqlApplySequence = null, preRestoreBusinessRows = false,
  failFirstBusinessRowsRead = false } = {}) {
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

  return { scope, environment, onlineApp, psqlCode, applyPsql, malformedToc,
    restoreSqlHeader, restoreFooterKey, restoreHeaderExtra, copyRowData,
    psqlCodeSequence, psqlApplySequence, preRestoreBusinessRows, failFirstBusinessRowsRead }
}

async function prepareHarness(t, options = {}) {
  const harness = makeHarness(t, options)
  const cleanupRoot = await mkdtemp(path.join(os.tmpdir(), 'dev126-restore-test-'))
  let sandboxRoot = cleanupRoot
  if (options.longPath) {
    for (let index = 0; index < 5; index++) {
      sandboxRoot = path.join(sandboxRoot, `restore-path-segment-${index}-${'x'.repeat(36)}`)
      await mkdir(sandboxRoot)
    }
  }
  t.after(async () => rm(cleanupRoot, { recursive: true, force: true }))
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
  const baselineBusinessRelations = relations.filter(relation => includedRelations.includes(relation.name))
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
      ownerConnection: { sessionUser: scopedLogin }, relations: baselineBusinessRelations,
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
  let psqlApplied = false
  const business = includedRelations.map(name => {
    const relation = relations.find(item => item.name === name)
    return { name, rowCount: relation.rowCount, rowsSha256: relation.rowsSha256 }
  })
  let preservedControls = preservedControlNames.map(name => {
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
      return { state: structuredClone(currentState), business, preservedControls: structuredClone(preservedControls) }
    },
    async readPreservedControls() {
      databaseCalls.push('readPreservedControls')
      return { state: structuredClone(currentState), preservedControls: structuredClone(preservedControls) }
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
    return fence(scope, { applicationsOffline: options.fenceInvalidAt === platformCalls.length
      ? false : !options.onlineApp })
  } }
  const spawns = []
  const psqlInputs = []
  const spawn = (executable, args, spawnOptions) => {
    spawns.push({ executable, args: [...args], options: spawnOptions })
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.stdin = new PassThrough()
    const stdinChunks = []
    child.stdin.on('data', chunk => stdinChunks.push(Buffer.from(chunk)))
    const stdinEnded = new Promise(resolve => child.stdin.once('end', resolve))
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
        const copySql = includedRelations.map((name, index) =>
          `COPY ai_pdm_core.${name} (id) FROM stdin;\n${index === 0 && harness.copyRowData ? `${harness.copyRowData}\n` : ''}\\.\n`).join('\n')
        await writeFile(outputArg.slice('--file='.length),
          `${harness.restoreSqlHeader}${harness.restoreHeaderExtra}${copySql}` +
          `SELECT pg_catalog.setval('ai_pdm_core.business_001_id_seq', 1, false);\n\n` +
          `--\n-- PostgreSQL database dump complete\n--\n\n\\unrestrict ${harness.restoreFooterKey}\n`,
          { mode: 0o600 })
        child.stdout.end()
        child.stderr.end()
        child.emit('close', 0)
        return
      }
      if (executable.toLowerCase().startsWith('psql')) {
        await stdinEnded
        const psqlAttempt = spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length
        const sql = Buffer.concat(stdinChunks).toString('utf8')
        psqlInputs.push(sql)
        assert.equal(args[args.indexOf('--file') + 1], '-')
        assert.equal(spawnOptions.stdio[0], 'pipe')
        assert.ok(sql.length > 0)
        assert.match(sql, /TRUNCATE TABLE[\s\S]+RESTRICT;/u)
        assert.match(sql, /SET LOCAL ROLE jenfu_ai_pdm_migrator;/u)
        assert.match(sql, /DISABLE TRIGGER USER;/u)
        assert.match(sql, /ENABLE TRIGGER USER;/u)
        assert.doesNotMatch(sql, /CASCADE|COMMENT ON DATABASE/u)
        assert.match(sql, /SET status = CASE WHEN status = 'pending_central_registration' THEN 'registration_abandoned' ELSE 'revoked' END/u)
        assert.match(sql, /AND status IN \('pending_central_registration', 'central_registered'\);/u)
        assert.match(sql, /status='maintenance'/u)
        assert.match(sql, /SET LOCAL search_path = pg_catalog;/u)
        assert.doesNotMatch(sql, /SELECT pg_catalog\.set_config\(|\\(?:restrict|unrestrict)\s/u)
        assert.doesNotMatch(sql, /dev126PG18FixtureKey/u)
        if (harness.copyRowData) assert.ok(sql.includes(harness.copyRowData))
        assert.equal((sql.match(/DISABLE TRIGGER USER;/gu) ?? []).length, policy.businessRelationCount)
        assert.equal((sql.match(/ENABLE TRIGGER USER;/gu) ?? []).length, policy.businessRelationCount)
        const applyPsql = harness.psqlApplySequence?.[psqlAttempt - 1] ?? harness.applyPsql
        const psqlCode = harness.psqlCodeSequence?.[psqlAttempt - 1] ?? harness.psqlCode
        if (applyPsql) {
          psqlApplied = true
          currentState = { ...currentState, principalSessionCount: 0,
            sourceBindings: currentState.sourceBindings.map(binding => ({ ...binding,
              status: binding.status === 'pending_central_registration' ? 'registration_abandoned'
                : binding.status === 'central_registered' ? 'revoked' : binding.status })),
            targetMetadata: { ...currentState.targetMetadata, status: 'maintenance' } }
        }
        child.stdout.end()
        child.stderr.end()
        child.emit('close', psqlCode)
        return
      }
      child.stderr.end()
      child.emit('close', 1)
    })
    return child
  }
  const owner = createDev126LocalResetRestoreOwner({ environment: harness.environment,
    baselineReader: async () => descriptor, platformFence, database, spawn })
  return { ...harness, targetInput, manifest, descriptor, owner, databaseCalls, platformCalls, spawns, psqlInputs,
    platformFence, currentState: () => structuredClone(currentState), setState: value => { currentState = value },
    preservedControls: () => structuredClone(preservedControls),
    setPreservedControls: value => { preservedControls = structuredClone(value) },
    psqlWasApplied: () => psqlApplied, spawn }
}

function makeRestoreOwnerPool(harness, queries) {
  let failBusinessRowsRead = harness.failFirstBusinessRowsRead
  return function Pool(poolOptions) {
    return {
      async connect() {
        const password = await poolOptions.password({ host: poolOptions.host, port: poolOptions.port,
          database: poolOptions.database, user: poolOptions.user })
        assert.equal(password, harness.environment.PGPASSWORD)
        let connectionReads = 0
        const client = {
          async query(sql, values = []) {
            const normalized = sql.trim()
            queries.push({ sql: normalized, values })
            if (normalized === 'BEGIN' || normalized.startsWith('BEGIN ') || normalized === 'COMMIT' ||
              normalized === 'ROLLBACK' || normalized === `SET LOCAL ROLE ${ownerRole}`) return { rows: [] }
            if (normalized.includes('AS server_address')) {
              connectionReads += 1
              const state = harness.currentState()
              return { rows: [{ database_name: state.identity.databaseName,
                current_user: connectionReads === 1 ? scopedLogin : ownerRole,
                session_user: scopedLogin, server_address: state.identity.serverAddress,
                server_port: state.identity.serverPort }] }
            }
            const state = harness.currentState()
            if (normalized.includes('FROM pg_catalog.pg_roles')) return { rows: Object.values(state.roles).map(role => ({
              rolname: role.name, rolcanlogin: role.canLogin, rolsuper: role.isSuperuser,
              rolcreatedb: role.canCreateDb, rolcreaterole: role.canCreateRole,
              rolbypassrls: role.bypassRls, member_of_owner: role.memberOfOwner,
            })) }
            if (normalized.includes('FROM pg_catalog.pg_namespace')) return { rows: [{ schema_owner: state.schemaOwner }] }
            if (normalized.includes('FROM pg_catalog.pg_database')) return { rows: [{
              database_owner: state.databaseOwner, database_marker: state.databaseMarker,
            }] }
            if (normalized.includes('FROM ai_pdm_core.pdm_workbench_state_authority_control')) return { rows: [{
              mode: state.authority.mode, expected_commit: state.authority.expectedCommit,
              schema_hash: state.authority.schemaHash, row_version: state.authority.rowVersion,
              switched_at: state.authority.switchedAt,
            }] }
            if (normalized.includes('FROM ai_pdm_core.local_sandbox_target_metadata')) return { rows: [{
              application_id: state.targetMetadata.applicationId, sandbox_id: state.targetMetadata.sandboxId,
              database_name: state.targetMetadata.databaseName, sandbox_root: state.targetMetadata.sandboxRoot,
              data_directory: state.targetMetadata.dataDirectory, repository_directory: state.targetMetadata.repositoryDirectory,
              generation: state.targetMetadata.generation, fixture_version: state.targetMetadata.fixtureVersion,
              fixture_hash: state.targetMetadata.fixtureHash,
              native_session_contract_version: state.targetMetadata.nativeSessionContractVersion,
              target_fingerprint: state.targetMetadata.targetFingerprint, status: state.targetMetadata.status,
            }] }
            if (normalized.includes('FROM pg_catalog.pg_trigger')) return { rows: [] }
            if (normalized.includes("c.relkind IN ('r','p','m','f')")) return { rows: state.relations }
            if (normalized.includes("sequence.relkind='S'")) return { rows: state.sequences.map(sequence => ({
              name: sequence.name, owner: sequence.owner, owned_table: sequence.ownedTable,
            })) }
            if (normalized.startsWith('SELECT count(*)::text AS count')) {
              return { rows: [{ count: String(state.principalSessionCount) }] }
            }
            if (normalized.includes('FROM ai_pdm_core.local_sandbox_principal_session_bindings')) {
              return { rows: state.sourceBindings.map(binding => ({ status: binding.status,
                central_correlation_id: binding.centralCorrelationId,
                central_registration_observed_at: binding.centralRegistrationObservedAt })) }
            }
            if (normalized.includes('to_jsonb(t)::text')) {
              if (failBusinessRowsRead && harness.psqlWasApplied()) {
                failBusinessRowsRead = false
                throw new Error('SYNTHETIC_BUSINESS_READBACK_FAILURE')
              }
              const name = normalized.match(/FROM ai_pdm_core\."([a-z][a-z0-9_]*)"/u)?.[1]
              assert.ok(name, `expected a quoted PDM relation: ${normalized}`)
              return { rows: harness.preRestoreBusinessRows && name === 'users' && !harness.psqlWasApplied()
                ? [{ row_json: '{"id":"pre-reset"}' }] : [] }
            }
            if (normalized.includes("SET status='maintenance'")) {
              harness.setState({ ...state, targetMetadata: { ...state.targetMetadata, status: 'maintenance' } })
              return { rowCount: 1, rows: [] }
            }
            if (normalized.includes('UPDATE ai_pdm_core.local_sandbox_principal_session_bindings')) {
              const registeredCount = state.sourceBindings.filter(binding => binding.status === 'central_registered').length
              harness.setState({ ...state, sourceBindings: state.sourceBindings.map(binding => ({ ...binding,
                status: binding.status === 'central_registered' ? 'revoked' : binding.status })) })
              return { rowCount: registeredCount, rows: [] }
            }
            if (normalized.includes('UPDATE ai_pdm_core.local_sandbox_target_metadata') &&
              normalized.includes('SET generation=$1::uuid')) {
              harness.setState({ ...state, targetMetadata: { ...state.targetMetadata, generation: values[0],
                targetFingerprint: values[1], status: 'ready' } })
              return { rowCount: 1, rows: [] }
            }
            throw new Error(`UNEXPECTED_STUB_QUERY:${normalized}`)
          },
          release() {},
        }
        return client
      },
      async end() {},
    }
  }
}

test('restores the pinned business set atomically, then rebinds PDM metadata to the Platform generation', async t => {
  const h = await prepareHarness(t)
  assert.equal(h.manifest.database.relations.length, policy.businessRelationCount)
  assert.equal(h.manifest.database.includedRelations.length, policy.businessRelationCount)
  assert.equal(h.manifest.database.excludedRelations.length, policy.controlRelations.length)
  assert.deepEqual(h.manifest.database.relations.map(relation => relation.name).sort(),
    [...h.manifest.database.includedRelations].sort())
  const result = await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(result.restored, true)
  assert.equal(result.recoveredAfterUnknown, false)
  assert.equal(h.currentState().targetMetadata.status, 'maintenance')
  assert.equal(h.currentState().databaseMarker, `${policy.markerPrefix}${sandboxId}:${nextGeneration}`)
  const preservationReference = path.join(h.targetInput.sandboxRoot, 'control',
    'dev126-reset-restore-preservations', `${h.scope.resetId}.json`)
  const preservationReceipt = JSON.parse(await readFile(preservationReference, 'utf8'))
  assert.equal(preservationReceipt.resetId, h.scope.resetId)
  assert.deepEqual(preservationReceipt.preservedControls, h.preservedControls())
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

test('real Postgres adapter marks the first read not applied, resumes the same maintenance intent through stdin, then rebinds with loaded context', async t => {
  const h = await prepareHarness(t, { fenceInvalidAt: 4, preRestoreBusinessRows: true })
  const queries = []
  const owner = createDev126LocalResetRestoreOwner({ environment: h.environment,
    Pool: makeRestoreOwnerPool(h, queries), baselineReader: async () => h.descriptor,
    platformFence: h.platformFence, spawn: h.spawn })

  const firstRead = await owner.readBusinessRestore({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(firstRead.restored, false)
  assert.equal(firstRead.targetMetadataStatus, 'ready')
  assert.equal(h.currentState().targetMetadata.generation, sourceGeneration)
  assert.equal(queries.some(query => query.sql.startsWith('UPDATE ')), false)
  assert.deepEqual(h.spawns, [])

  await assert.rejects(owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_generation_fence_invalid')
  assert.equal(h.currentState().targetMetadata.status, 'maintenance')
  assert.equal(h.currentState().targetMetadata.generation, sourceGeneration)
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 0)
  const preservationReference = path.join(h.targetInput.sandboxRoot, 'control',
    'dev126-reset-restore-preservations', `${h.scope.resetId}.json`)
  const referenceBeforeRetry = await readFile(preservationReference, 'utf8')
  const workDirectory = path.join(h.targetInput.sandboxRoot, 'control', 'dev126-reset-restore-work', h.scope.resetId)
  await assert.rejects(readdir(workDirectory), error => error.code === 'ENOENT')

  const restored = await owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(restored.restored, true)
  assert.equal(h.currentState().targetMetadata.status, 'maintenance')
  assert.equal(h.currentState().targetMetadata.generation, sourceGeneration)
  assert.equal(queries.filter(query => query.sql.includes("SET status='maintenance'")).length, 1)
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
  assert.equal(await readFile(preservationReference, 'utf8'), referenceBeforeRetry)
  assert.equal(h.psqlInputs.length, 1)
  assert.match(h.psqlInputs[0], /TRUNCATE TABLE[\s\S]+RESTRICT;/u)
  const psqlCalls = h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql'))
  assert.ok(psqlCalls.every(item => item.args[item.args.indexOf('--file') + 1] === '-'))
  assert.ok(psqlCalls.every(item => item.options.stdio[0] === 'pipe'))

  const rebound = await owner.rebindAndFenceSessions({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(rebound.ready, true)
  assert.equal(h.currentState().targetMetadata.status, 'ready')
  assert.equal(h.currentState().targetMetadata.generation, nextGeneration)
  assert.ok(queries.some(query => query.sql.includes('UPDATE ai_pdm_core.local_sandbox_principal_session_bindings')))
  assert.ok(queries.some(query => query.sql.includes('SET generation=$1::uuid')))
})

test('uses validated Windows namespaced paths for PG tool archive and SQL arguments', async t => {
  const h = await prepareHarness(t, { longPath: true })
  await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  const workDirectory = path.join(h.targetInput.sandboxRoot, 'control', 'dev126-reset-restore-work', h.scope.resetId)
  const expectedArchivePath = path.toNamespacedPath(path.join(workDirectory, 'pinned.data.dump'))
  const expectedRestoreSqlPath = path.toNamespacedPath(path.join(workDirectory, 'restore-data.sql'))
  const pgRestoreCalls = h.spawns.filter(item => item.executable.toLowerCase().startsWith('pg_restore'))
  const listCall = pgRestoreCalls.find(item => item.args.includes('--list'))
  const renderCall = pgRestoreCalls.find(item => item.args.some(arg => arg.startsWith('--file=')))
  const psqlCall = h.spawns.find(item => item.executable.toLowerCase().startsWith('psql'))
  assert.equal(listCall.args.at(-1), expectedArchivePath)
  assert.equal(renderCall.args.at(-1), expectedArchivePath)
  assert.equal(renderCall.args.find(arg => arg.startsWith('--file=')), `--file=${expectedRestoreSqlPath}`)
  assert.equal(psqlCall.args[psqlCall.args.indexOf('--file') + 1], '-')
  assert.equal(psqlCall.options.stdio[0], 'pipe')
  if (process.platform === 'win32') {
    assert.ok(expectedArchivePath.startsWith('\\\\?\\'))
    assert.ok(expectedArchivePath.length > 260)
  }
})

test('accepts the captured PostgreSQL 18.4 header and keeps escaped COPY row data scoped to COPY', async t => {
  const h = await prepareHarness(t, { copyRowData: '\\N' })
  const result = await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(result.restored, true)
  assert.ok(h.spawns.some(item => item.executable.toLowerCase().startsWith('psql')))
})

test('rejects a mismatched PostgreSQL restrict pair before maintenance or psql', async t => {
  const h = await prepareHarness(t, { restoreFooterKey: 'differentFixtureKey' })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_sql_invalid')
  assert.equal(h.databaseCalls.includes('markMaintenance'), false)
  assert.equal(h.spawns.some(item => item.executable.toLowerCase().startsWith('psql')), false)
})

test('rejects any nonfixed search_path set_config emitted by the archive', async t => {
  const h = await prepareHarness(t, { restoreHeaderExtra: "SELECT pg_catalog.set_config('search_path', 'public', false);\n" })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_sql_closed_set_violation')
  assert.equal(h.databaseCalls.includes('markMaintenance'), false)
  assert.equal(h.spawns.some(item => item.executable.toLowerCase().startsWith('psql')), false)
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

test('rejects a runtime role with owner membership before PostgreSQL restore starts', async t => {
  const h = await prepareHarness(t)
  const currentState = h.currentState()
  h.setState({ ...currentState, roles: { ...currentState.roles,
    runtime: { ...h.currentState().roles.runtime, memberOfOwner: true } } })
  const state = h.currentState()
  const queries = []
  const spawns = []
  let connectionReads = 0
  function Pool(poolOptions) {
    return {
      async connect() {
        await poolOptions.password({ host: poolOptions.host, port: poolOptions.port,
          database: poolOptions.database, user: poolOptions.user })
        return {
          async query(sql, values = []) {
            const normalized = sql.trim()
            queries.push({ sql: normalized, values })
            if (normalized === 'BEGIN' || normalized.startsWith('BEGIN ') || normalized === 'COMMIT' || normalized === 'ROLLBACK' ||
              normalized === `SET LOCAL ROLE ${ownerRole}`) return { rows: [] }
            if (normalized.includes('current_database()')) {
              connectionReads += 1
              return { rows: [{ database_name: state.identity.databaseName,
                current_user: connectionReads === 1 ? scopedLogin : ownerRole,
                session_user: scopedLogin, server_address: state.identity.serverAddress,
                server_port: state.identity.serverPort }] }
            }
            if (normalized.includes('FROM pg_catalog.pg_roles')) {
              return { rows: Object.values(state.roles).map(role => ({
                rolname: role.name, rolcanlogin: role.canLogin, rolsuper: role.isSuperuser,
                rolcreatedb: role.canCreateDb, rolcreaterole: role.canCreateRole,
                rolbypassrls: role.bypassRls, member_of_owner: role.memberOfOwner,
              })) }
            }
            if (normalized.includes('FROM pg_catalog.pg_namespace')) return { rows: [{ schema_owner: state.schemaOwner }] }
            if (normalized.includes('FROM pg_catalog.pg_database')) return { rows: [{
              database_owner: state.databaseOwner, database_marker: state.databaseMarker,
            }] }
            if (normalized.includes('FROM ai_pdm_core.pdm_workbench_state_authority_control')) return { rows: [{
              mode: authority.mode, expected_commit: authority.expectedCommit, schema_hash: authority.schemaHash,
              row_version: authority.rowVersion, switched_at: authority.switchedAt,
            }] }
            if (normalized.includes('FROM ai_pdm_core.local_sandbox_target_metadata')) return { rows: [{
              application_id: state.targetMetadata.applicationId, sandbox_id: state.targetMetadata.sandboxId,
              database_name: state.targetMetadata.databaseName, sandbox_root: state.targetMetadata.sandboxRoot,
              data_directory: state.targetMetadata.dataDirectory, repository_directory: state.targetMetadata.repositoryDirectory,
              generation: state.targetMetadata.generation, fixture_version: state.targetMetadata.fixtureVersion,
              fixture_hash: state.targetMetadata.fixtureHash,
              native_session_contract_version: state.targetMetadata.nativeSessionContractVersion,
              target_fingerprint: state.targetMetadata.targetFingerprint, status: state.targetMetadata.status,
            }] }
            if (normalized.includes('FROM pg_catalog.pg_trigger')) return { rows: [] }
            if (normalized.includes("c.relkind IN ('r','p','m','f')")) return { rows: state.relations }
            if (normalized.includes("sequence.relkind='S'")) return { rows: state.sequences.map(sequence => ({
              name: sequence.name, owner: sequence.owner, owned_table: sequence.ownedTable,
            })) }
            if (normalized.startsWith('SELECT count(*)::text AS count')) return { rows: [{ count: '2' }] }
            if (normalized.includes('FROM ai_pdm_core.local_sandbox_principal_session_bindings')) return { rows: state.sourceBindings.map(binding => ({
              status: binding.status, central_correlation_id: binding.centralCorrelationId,
              central_registration_observed_at: binding.centralRegistrationObservedAt,
            })) }
            throw new Error(`UNEXPECTED_STUB_QUERY:${normalized}`)
          },
          release() {},
        }
      },
      async end() {},
    }
  }
  const owner = createDev126LocalResetRestoreOwner({ environment: h.environment, Pool,
    baselineReader: async () => h.descriptor, platformFence: h.platformFence,
    spawn: (...args) => { spawns.push(args); throw new Error('SUBPROCESS_SHOULD_NOT_START') } })
  await assert.rejects(owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_owner_state_invalid')
  const roleQuery = queries.find(query => query.sql.includes('FROM pg_catalog.pg_roles'))
  assert.match(roleQuery.sql, /pg_has_role\(role\.oid,/u)
  assert.doesNotMatch(roleQuery.sql, /pg_has_role\(\$1,/u)
  assert.deepEqual(roleQuery.values, [[scopedLogin, ownerRole, runtimeRole]])
  assert.deepEqual(spawns, [])
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

test('does not replay an uncertain psql commit within the same attempt', async t => {
  const h = await prepareHarness(t, { psqlCode: 1, applyPsql: false })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_commit_outcome_unknown')
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
  assert.equal(h.databaseCalls.filter(call => call === 'readBusiness').length, 1)
  assert.equal(h.currentState().targetMetadata.status, 'maintenance')
})

test('retries the same reset after a nonzero psql readback and reuses its exact work directory', async t => {
  const h = await prepareHarness(t, { psqlCodeSequence: [1, 0], psqlApplySequence: [false, true],
    preRestoreBusinessRows: true })
  const queries = []
  const owner = createDev126LocalResetRestoreOwner({ environment: h.environment,
    Pool: makeRestoreOwnerPool(h, queries), baselineReader: async () => h.descriptor,
    platformFence: h.platformFence, spawn: h.spawn })
  const preservationReference = path.join(h.targetInput.sandboxRoot, 'control',
    'dev126-reset-restore-preservations', `${h.scope.resetId}.json`)
  const workDirectory = path.join(h.targetInput.sandboxRoot, 'control', 'dev126-reset-restore-work', h.scope.resetId)

  await assert.rejects(owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_commit_outcome_unknown')
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
  assert.equal(h.currentState().targetMetadata.status, 'maintenance')
  assert.equal(h.psqlWasApplied(), false)
  const markerBeforeRetry = await readFile(path.join(workDirectory, 'work.json'), 'utf8')
  const marker = JSON.parse(markerBeforeRetry)
  assert.deepEqual(Object.keys(marker).sort(), ['baselineId', 'baselineSha256', 'contractVersion', 'generation',
    'manifestSha256', 'resetId', 'sandboxId', 'sourceGeneration'].sort())
  assert.equal(marker.contractVersion, 'dev126.local-reset-restore-work.v2')
  assert.equal(marker.manifestSha256, h.descriptor.manifestSha256)
  const entriesBeforeRetry = (await readdir(workDirectory)).sort()
  const preservationBeforeRetry = await readFile(preservationReference, 'utf8')

  const restored = await owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(restored.restored, true)
  assert.equal(h.psqlWasApplied(), true)
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 2)
  assert.deepEqual(h.psqlInputs.length, 2)
  assert.deepEqual(entriesBeforeRetry, ['pinned.data.dump', 'repository-stage', 'restore-data.sql',
    'restore-transaction.sql', 'work.json'].sort())
  assert.equal(await readFile(preservationReference, 'utf8'), preservationBeforeRetry)
  assert.ok(queries.length > 0)
  await assert.rejects(readFile(path.join(workDirectory, 'work.json'), 'utf8'), error => error.code === 'ENOENT')
  assert.equal(markerBeforeRetry.includes(h.scope.baseline.sha256), true)
})

test('resumes an exact legacy work marker because its baseline digest binds the manifest', async t => {
  const h = await prepareHarness(t, { psqlCodeSequence: [1, 0], psqlApplySequence: [false, true],
    preRestoreBusinessRows: true })
  const queries = []
  const owner = createDev126LocalResetRestoreOwner({ environment: h.environment,
    Pool: makeRestoreOwnerPool(h, queries), baselineReader: async () => h.descriptor,
    platformFence: h.platformFence, spawn: h.spawn })
  const markerPath = path.join(h.targetInput.sandboxRoot, 'control', 'dev126-reset-restore-work',
    h.scope.resetId, 'work.json')

  await assert.rejects(owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_commit_outcome_unknown')
  const legacyMarker = JSON.stringify({ contractVersion: 'dev126.local-reset-restore-work.v1',
    resetId: h.scope.resetId, sandboxId: h.scope.sandboxId, sourceGeneration: h.scope.sourceGeneration,
    generation: h.scope.generation, baselineId: h.scope.baseline.id, baselineSha256: h.scope.baseline.sha256 })
  await writeFile(markerPath, legacyMarker, 'utf8')

  const restored = await owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(restored.restored, true)
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 2)
})

test('rejects a retained work directory with a mismatched manifest marker or an unknown root file without deleting it', async t => {
  const h = await prepareHarness(t, { psqlCodeSequence: [1, 0], psqlApplySequence: [false, true],
    preRestoreBusinessRows: true })
  const queries = []
  const owner = createDev126LocalResetRestoreOwner({ environment: h.environment,
    Pool: makeRestoreOwnerPool(h, queries), baselineReader: async () => h.descriptor,
    platformFence: h.platformFence, spawn: h.spawn })
  const workDirectory = path.join(h.targetInput.sandboxRoot, 'control', 'dev126-reset-restore-work', h.scope.resetId)
  const markerPath = path.join(workDirectory, 'work.json')

  await assert.rejects(owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_commit_outcome_unknown')
  const exactMarker = await readFile(markerPath, 'utf8')
  const wrongMarker = JSON.stringify({ ...JSON.parse(exactMarker), manifestSha256: 'f'.repeat(64) })
  await writeFile(markerPath, wrongMarker, 'utf8')
  await assert.rejects(owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_workdir_invalid')
  assert.equal(await readFile(markerPath, 'utf8'), wrongMarker)

  await writeFile(markerPath, exactMarker, 'utf8')
  const unknownPath = path.join(workDirectory, 'leave-this-file-alone.txt')
  await writeFile(unknownPath, 'unrecognized task artifact', { flag: 'wx' })
  await assert.rejects(owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_workdir_invalid')
  assert.equal(await readFile(markerPath, 'utf8'), exactMarker)
  assert.equal(await readFile(unknownPath, 'utf8'), 'unrecognized task artifact')
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
  assert.equal(h.psqlInputs.length, 1)
  assert.ok(queries.length > 0)
})

test('preserves an uncertain work directory and skips psql when retry readback already proves baseline', async t => {
  const h = await prepareHarness(t, { psqlCode: 1, applyPsql: true, preRestoreBusinessRows: true,
    failFirstBusinessRowsRead: true })
  const queries = []
  const owner = createDev126LocalResetRestoreOwner({ environment: h.environment,
    Pool: makeRestoreOwnerPool(h, queries), baselineReader: async () => h.descriptor,
    platformFence: h.platformFence, spawn: h.spawn })
  const preservationReference = path.join(h.targetInput.sandboxRoot, 'control',
    'dev126-reset-restore-preservations', `${h.scope.resetId}.json`)
  const workDirectory = path.join(h.targetInput.sandboxRoot, 'control', 'dev126-reset-restore-work', h.scope.resetId)

  await assert.rejects(owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_commit_outcome_unknown')
  assert.equal(h.psqlWasApplied(), true)
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
  const markerBeforeRetry = await readFile(path.join(workDirectory, 'work.json'), 'utf8')
  const preservationBeforeRetry = await readFile(preservationReference, 'utf8')

  const restored = await owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(restored.restored, true)
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
  assert.equal(await readFile(preservationReference, 'utf8'), preservationBeforeRetry)
  assert.ok(markerBeforeRetry.includes(h.scope.baseline.sha256))
  await assert.rejects(readFile(path.join(workDirectory, 'work.json'), 'utf8'), error => error.code === 'ENOENT')
})

test('refuses to recapture a missing preservation reference after maintenance begins', async t => {
  const h = await prepareHarness(t, { psqlCode: 1, applyPsql: false })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_commit_outcome_unknown')
  const referencePath = path.join(h.targetInput.sandboxRoot, 'control',
    'dev126-reset-restore-preservations', `${h.scope.resetId}.json`)
  await unlink(referencePath)
  const readBusinessCount = h.databaseCalls.filter(call => call === 'readBusiness').length
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_control_preservation_reference_missing')
  assert.equal(h.databaseCalls.filter(call => call === 'readBusiness').length, readBusinessCount)
  assert.equal(h.spawns.filter(item => item.executable.toLowerCase().startsWith('psql')).length, 1)
})

test('blocks rebind when a preserved control digest changes after the reset-bound capture', async t => {
  const h = await prepareHarness(t)
  await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  const changedControls = h.preservedControls().map(item => item.name === 'schema_migrations'
    ? { ...item, rowCount: item.rowCount + 1, rowsSha256: 'f'.repeat(64) } : item)
  h.setPreservedControls(changedControls)
  await assert.rejects(h.owner.rebindAndFenceSessions({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_rebind_precondition_failed')
  assert.equal(h.currentState().targetMetadata.status, 'maintenance')
  assert.equal(h.databaseCalls.includes('rebind'), false)
})

test('rejects later restore readback when a preserved control digest differs from the captured reference', async t => {
  const h = await prepareHarness(t)
  await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  const changedControls = h.preservedControls().map(item => item.name === 'schema_migrations'
    ? { ...item, rowsSha256: 'f'.repeat(64) } : item)
  h.setPreservedControls(changedControls)
  await assert.rejects(h.owner.readBusinessRestore({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_control_preservation_reference_mismatch')
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

test('abandons a pending handshake only within the fenced restore, retaining NULL Central acknowledgement', async t => {
  const h = await prepareHarness(t)
  h.setState({ ...h.currentState(), sourceBindings: [{ status: 'pending_central_registration',
    centralCorrelationId: null, centralRegistrationObservedAt: null }] })
  const restored = await h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(restored.restored, true)
  assert.deepEqual(h.currentState().sourceBindings, [{ status: 'registration_abandoned',
    centralCorrelationId: null, centralRegistrationObservedAt: null }])
  assert.equal(h.currentState().principalSessionCount, 0)
  const rebound = await h.owner.rebindAndFenceSessions({ targetInput: h.targetInput, scope: h.scope })
  assert.equal(rebound.ready, true)
  assert.equal((await h.owner.readiness({ targetInput: h.targetInput, scope: h.scope })).ready, true)
})

test('never abandons a pending handshake while an app is online', async t => {
  const h = await prepareHarness(t, { onlineApp: true })
  h.setState({ ...h.currentState(), sourceBindings: [{ status: 'pending_central_registration',
    centralCorrelationId: null, centralRegistrationObservedAt: null }] })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_generation_fence_invalid')
  assert.equal(h.currentState().sourceBindings[0].status, 'pending_central_registration')
  assert.deepEqual(h.spawns, [])
})

test('rejects an abandoned handshake with a fabricated Central acknowledgement before restore', async t => {
  const h = await prepareHarness(t)
  h.setState({ ...h.currentState(), sourceBindings: [{ status: 'registration_abandoned',
    centralCorrelationId: 'not-a-registration-receipt', centralRegistrationObservedAt: null }] })
  await assert.rejects(h.owner.restoreBusinessBaseline({ targetInput: h.targetInput, scope: h.scope }),
    error => error instanceof LocalSandboxError && error.code === 'dev126_reset_restore_binding_invalid')
  assert.deepEqual(h.spawns, [])
})
